use crate::model::{Session, SessionRequest, StopReason, ToolKind};
use crate::pricing::estimate_request_cost;
use crate::source::UsageSource;
use anyhow::Result;
use chrono::{DateTime, Utc};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

pub fn default_root() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".claude").join("projects"))
}

pub struct ClaudeCodeSource {
    root: PathBuf,
}

impl ClaudeCodeSource {
    pub fn new() -> Self {
        Self { root: default_root().unwrap_or_default() }
    }

    pub fn with_root(root: PathBuf) -> Self {
        Self { root }
    }
}

impl Default for ClaudeCodeSource {
    fn default() -> Self {
        Self::new()
    }
}

impl UsageSource for ClaudeCodeSource {
    fn tool(&self) -> ToolKind {
        ToolKind::ClaudeCode
    }

    fn scan(&self) -> Result<Vec<Session>> {
        let mut sessions = Vec::new();
        if !self.root.is_dir() {
            return Ok(sessions);
        }
        for project_entry in fs::read_dir(&self.root)? {
            let project_entry = project_entry?;
            if !project_entry.file_type()?.is_dir() {
                continue;
            }
            let fallback_project = project_entry.file_name().to_string_lossy().to_string();
            for file_entry in fs::read_dir(project_entry.path())? {
                let file_entry = file_entry?;
                let path = file_entry.path();
                if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                    continue;
                }
                if let Some(session) = parse_session_file(&path, &fallback_project)? {
                    sessions.push(session);
                }
            }
        }
        Ok(sessions)
    }
}

// ---------------------------------------------------------------------------
// Public: per-request detail
// ---------------------------------------------------------------------------

/// Return every assistant turn in the given session as a `SessionRequest`.
///
/// We locate the `.jsonl` file by re-walking `~/.claude/projects/*/<session_id>.jsonl`.
/// Returns an empty Vec (not an error) when the file cannot be found — the
/// session may have been deleted or is from a different tool.
pub fn get_session_requests(session_id: &str) -> Result<Vec<SessionRequest>> {
    let Some(root) = default_root() else {
        return Ok(vec![]);
    };
    let path = find_session_file(&root, session_id);
    match path {
        Some(p) => parse_requests_from_file(&p),
        None => Ok(vec![]),
    }
}

/// Walk `root/*/` looking for `<session_id>.jsonl`.
fn find_session_file(root: &Path, session_id: &str) -> Option<PathBuf> {
    let filename = format!("{session_id}.jsonl");
    let Ok(entries) = fs::read_dir(root) else {
        return None;
    };
    for entry in entries.flatten() {
        if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }
        let candidate = entry.path().join(&filename);
        if candidate.exists() {
            return Some(candidate);
        }
    }
    None
}

/// Parse a `.jsonl` file into one `SessionRequest` per assistant message.
fn parse_requests_from_file(path: &Path) -> Result<Vec<SessionRequest>> {
    let content = fs::read_to_string(path)?;
    let mut requests: Vec<SessionRequest> = Vec::new();

    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let Ok(value) = serde_json::from_str::<Value>(line) else {
            continue;
        };

        if value.get("type").and_then(|v| v.as_str()) != Some("assistant") {
            continue;
        }

        let Some(message) = value.get("message") else {
            continue;
        };

        // Timestamp: prefer the top-level "timestamp" field; fall back to now.
        let timestamp = value
            .get("timestamp")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let model = message
            .get("model")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string();

        let stop_reason = message
            .get("stop_reason")
            .and_then(|v| v.as_str())
            .map(StopReason::from_str_loose)
            .unwrap_or(StopReason::Other);

        let (input, output, cache_write, cache_read) =
            if let Some(usage) = message.get("usage") {
                (
                    usage.get("input_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
                    usage.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
                    usage.get("cache_creation_input_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
                    usage.get("cache_read_input_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
                )
            } else {
                (0, 0, 0, 0)
            };

        // Context tokens = input + cache_read (mirrors what the frontend chart tracks)
        let context_tokens = input + cache_read;

        let cost_usd = estimate_request_cost(&model, input, output, cache_write, cache_read);

        let index = requests.len() as u32;
        requests.push(SessionRequest {
            index,
            timestamp,
            model,
            context_tokens,
            input_tokens: input,
            output_tokens: output,
            cache_creation_tokens: cache_write,
            cache_read_tokens: cache_read,
            cost_usd,
            stop_reason,
        });
    }

    Ok(requests)
}

// ---------------------------------------------------------------------------
// Session-level file parser (unchanged)
// ---------------------------------------------------------------------------

fn parse_session_file(path: &Path, fallback_project: &str) -> Result<Option<Session>> {
    let content = fs::read_to_string(path)?;
    let session_id = path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown".to_string());

    let mut project = fallback_project.to_string();
    let mut started_at: Option<DateTime<Utc>> = None;
    let mut model: Option<String> = None;
    let mut input_tokens = 0u64;
    let mut output_tokens = 0u64;
    let mut cache_creation_tokens = 0u64;
    let mut cache_read_tokens = 0u64;
    let mut message_count = 0u32;

    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let Ok(value) = serde_json::from_str::<Value>(line) else {
            continue;
        };

        if started_at.is_none() {
            if let Some(ts) = value.get("timestamp").and_then(|v| v.as_str()) {
                if let Ok(parsed) = DateTime::parse_from_rfc3339(ts) {
                    started_at = Some(parsed.with_timezone(&Utc));
                }
            }
        }

        if let Some(cwd) = value.get("cwd").and_then(|v| v.as_str()) {
            project = cwd.to_string();
        }

        if value.get("type").and_then(|v| v.as_str()) == Some("assistant") {
            if let Some(message) = value.get("message") {
                message_count += 1;
                if model.is_none() {
                    model = message.get("model").and_then(|v| v.as_str()).map(String::from);
                }
                if let Some(usage) = message.get("usage") {
                    input_tokens += usage.get("input_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
                    output_tokens += usage.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
                    cache_creation_tokens += usage
                        .get("cache_creation_input_tokens")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0);
                    cache_read_tokens += usage
                        .get("cache_read_input_tokens")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0);
                }
            }
        }
    }

    if message_count == 0 {
        return Ok(None);
    }

    Ok(Some(Session {
        tool: ToolKind::ClaudeCode,
        session_id,
        project,
        started_at: started_at.unwrap_or_else(Utc::now),
        model,
        input_tokens,
        output_tokens,
        cache_creation_tokens,
        cache_read_tokens,
        message_count,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn parses_fixture_session_with_correct_token_totals() {
        let dir = tempfile::tempdir().unwrap();
        let project_dir = dir.path().join("-Users-test-my-project");
        fs::create_dir_all(&project_dir).unwrap();
        let session_path = project_dir.join("11111111-1111-1111-1111-111111111111.jsonl");

        let lines = [
            r#"{"type":"attachment","timestamp":"2026-01-01T00:00:00.000Z","cwd":"/Users/test/my-project","sessionId":"11111111-1111-1111-1111-111111111111"}"#,
            r#"{"type":"assistant","message":{"model":"claude-sonnet-5","usage":{"input_tokens":100,"output_tokens":50,"cache_creation_input_tokens":10,"cache_read_input_tokens":5}}}"#,
            r#"{"type":"assistant","message":{"model":"claude-sonnet-5","usage":{"input_tokens":20,"output_tokens":30,"cache_creation_input_tokens":0,"cache_read_input_tokens":0}}}"#,
        ];
        let mut f = fs::File::create(&session_path).unwrap();
        for line in lines {
            writeln!(f, "{line}").unwrap();
        }

        let source = ClaudeCodeSource::with_root(dir.path().to_path_buf());
        let sessions = source.scan().unwrap();

        assert_eq!(sessions.len(), 1);
        let session = &sessions[0];
        assert_eq!(session.message_count, 2);
        assert_eq!(session.input_tokens, 120);
        assert_eq!(session.output_tokens, 80);
        assert_eq!(session.cache_creation_tokens, 10);
        assert_eq!(session.cache_read_tokens, 5);
        assert_eq!(session.project, "/Users/test/my-project");
        assert_eq!(session.model.as_deref(), Some("claude-sonnet-5"));
    }

    #[test]
    fn skips_files_with_no_assistant_messages() {
        let dir = tempfile::tempdir().unwrap();
        let project_dir = dir.path().join("-Users-test-empty-project");
        fs::create_dir_all(&project_dir).unwrap();
        let session_path = project_dir.join("22222222-2222-2222-2222-222222222222.jsonl");
        let mut f = fs::File::create(&session_path).unwrap();
        writeln!(f, r#"{{"type":"queue-operation","operation":"enqueue"}}"#).unwrap();

        let source = ClaudeCodeSource::with_root(dir.path().to_path_buf());
        let sessions = source.scan().unwrap();
        assert!(sessions.is_empty());
    }
}
