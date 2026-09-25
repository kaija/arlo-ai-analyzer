use crate::model::{Compaction, Session, SessionDetail, SessionRequest, StopReason, ToolKind};
use crate::pricing::estimate_request_cost;
use crate::source::UsageSource;
use anyhow::Result;
use chrono::{DateTime, Utc};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

pub fn default_root() -> Option<PathBuf> {
    crate::paths::real_home_dir().map(|h| h.join(".claude").join("projects"))
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
        // Shared across every file: a resumed or forked session replays the
        // parent's history into a new transcript, so the same API request can
        // appear in more than one file (345 of 8462 requests in a real
        // ~/.claude/projects tree). Without this the dashboard totals double
        // count them. First file to claim a request keeps it, and files are
        // walked in sorted order so that is stable between runs.
        let mut seen: TurnKeys = TurnKeys::default();

        let mut project_dirs: Vec<PathBuf> = fs::read_dir(&self.root)?
            .flatten()
            .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
            .map(|e| e.path())
            .collect();
        project_dirs.sort();

        for project_dir in project_dirs {
            let fallback_project = project_dir
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();

            // One unreadable folder or transcript must not blank out the rest:
            // `scan_all` drops a source whose scan errors, and the cache keeps
            // its stale rows, so new sessions would silently never show up.
            let Ok(entries) = fs::read_dir(&project_dir) else {
                continue;
            };
            let mut files: Vec<PathBuf> = entries
                .flatten()
                .map(|e| e.path())
                .filter(|p| p.extension().and_then(|e| e.to_str()) == Some("jsonl"))
                .collect();
            files.sort();

            for path in files {
                match parse_session_file(&path, &fallback_project, &mut seen) {
                    Ok(Some(session)) => sessions.push(session),
                    Ok(None) => {}
                    Err(e) => eprintln!("skipping {}: {e:#}", path.display()),
                }
            }
        }
        Ok(sessions)
    }
}

// ---------------------------------------------------------------------------
// Transcript reading
// ---------------------------------------------------------------------------

/// Identity of one API request: `(message.id, requestId)`.
type TurnKey = (String, String);
type TurnKeys = std::collections::HashSet<TurnKey>;

/// One assistant turn, after de-duplication.
struct Turn {
    /// 1-based line in the transcript file.
    line: u32,
    timestamp: String,
    model: String,
    stop_reason: StopReason,
    /// Top-level `effort` on the transcript record ("low".."max"), absent on
    /// older records.
    effort: Option<String>,
    input: u64,
    output: u64,
    cache_write_5m: u64,
    cache_write_1h: u64,
    cache_read: u64,
}

impl Turn {
    /// Total prompt size this request carried. Cache writes are part of the
    /// prompt too — leaving them out understates the point by the whole of the
    /// newly added content (up to 100% on a session's first request or right
    /// after a compaction).
    fn context_tokens(&self) -> u64 {
        self.input + self.cache_write_5m + self.cache_write_1h + self.cache_read
    }

    fn cost_usd(&self) -> Option<f64> {
        estimate_request_cost(
            &self.model,
            self.input,
            self.output,
            self.cache_write_5m,
            self.cache_write_1h,
            self.cache_read,
        )
    }
}

/// What a transcript file yields besides its turns.
struct Transcript {
    project: Option<String>,
    started_at: Option<DateTime<Utc>>,
    turns: Vec<Turn>,
    compactions: Vec<Compaction>,
}

/// Parse one `.jsonl` transcript into de-duplicated assistant turns.
///
/// Claude Code writes each assistant message several times while streaming —
/// roughly 46% of the assistant lines in a real transcript are repeats of an
/// earlier one. Entries are keyed by `(message.id, requestId)` and the **last**
/// copy wins: earlier copies can be mid-stream snapshots whose `output_tokens`
/// is still climbing.
///
/// Keys already present in `seen` are skipped entirely, which is what stops a
/// resumed session from being billed twice. Pass a fresh set to dedupe within
/// this file only.
fn read_transcript(path: &Path, seen: &mut TurnKeys) -> Result<Transcript> {
    let content = crate::sources::read_lossy(path)?;

    let mut project = None;
    let mut started_at = None;
    // Order-preserving last-wins: `slots` keeps first-appearance order, `at`
    // points a repeated key back at its slot so the newer copy overwrites.
    let mut slots: Vec<Option<Turn>> = Vec::new();
    let mut at: std::collections::HashMap<TurnKey, usize> = std::collections::HashMap::new();
    let mut compactions: Vec<Compaction> = Vec::new();

    for (line_no, line) in content.lines().enumerate() {
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
            project = Some(cwd.to_string());
        }

        // Compaction is logged explicitly; no need to infer it from a drop in
        // the context curve.
        if value.get("subtype").and_then(|v| v.as_str()) == Some("compact_boundary") {
            if let Some(c) = parse_compaction(&value, slots.len()) {
                compactions.push(c);
            }
            continue;
        }

        if value.get("type").and_then(|v| v.as_str()) != Some("assistant") {
            continue;
        }
        let Some(message) = value.get("message") else {
            continue;
        };

        let key: TurnKey = (
            message.get("id").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
            value.get("requestId").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
        );
        // A record with no id at all can't be deduplicated; keep it.
        let keyed = !key.0.is_empty() || !key.1.is_empty();
        if keyed && seen.contains(&key) {
            continue;
        }

        let turn = parse_turn(&value, message, line_no as u32 + 1);
        match at.get(&key) {
            Some(&i) if keyed => slots[i] = Some(turn),
            _ => {
                if keyed {
                    at.insert(key, slots.len());
                }
                slots.push(Some(turn));
            }
        }
    }

    seen.extend(at.into_keys());

    Ok(Transcript {
        project,
        started_at,
        turns: slots.into_iter().flatten().collect(),
        compactions,
    })
}

/// Build a `Compaction` from a `compact_boundary` record.
///
/// `turns_so_far` is how many requests have been read; the boundary sits after
/// the last of them, which is the index the chart splits its curve on. A
/// boundary before any request in this file (a resumed transcript can start
/// with one) has nothing to split and is dropped.
fn parse_compaction(value: &Value, turns_so_far: usize) -> Option<Compaction> {
    let meta = value.get("compactMetadata")?;
    let before_index = turns_so_far.checked_sub(1)?;
    Some(Compaction {
        before_index: before_index as u32,
        timestamp: value
            .get("timestamp")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string(),
        trigger: meta
            .get("trigger")
            .and_then(|v| v.as_str())
            .unwrap_or("auto")
            .to_string(),
        pre_tokens: meta.get("preTokens").and_then(|v| v.as_u64()).unwrap_or(0),
        post_tokens: meta.get("postTokens").and_then(|v| v.as_u64()).unwrap_or(0),
    })
}

fn parse_turn(value: &Value, message: &Value, line: u32) -> Turn {
    let usage = message.get("usage");
    let field = |name: &str| {
        usage
            .and_then(|u| u.get(name))
            .and_then(|v| v.as_u64())
            .unwrap_or(0)
    };

    // Prefer the split ephemeral tiers; fall back to the aggregate
    // cache_creation_input_tokens treated as 1h when the sub-fields are absent.
    let (cache_write_5m, cache_write_1h) = match usage.and_then(|u| u.get("cache_creation")) {
        Some(cc) => (
            cc.get("ephemeral_5m_input_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
            cc.get("ephemeral_1h_input_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
        ),
        None => (0, field("cache_creation_input_tokens")),
    };

    Turn {
        line,
        effort: value
            .get("effort")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        timestamp: value
            .get("timestamp")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string(),
        model: message
            .get("model")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string(),
        stop_reason: message
            .get("stop_reason")
            .and_then(|v| v.as_str())
            .map(StopReason::from_str_loose)
            .unwrap_or(StopReason::Other),
        input: field("input_tokens"),
        output: field("output_tokens"),
        cache_write_5m,
        cache_write_1h,
        cache_read: field("cache_read_input_tokens"),
    }
}

// ---------------------------------------------------------------------------
// Public: per-request detail
// ---------------------------------------------------------------------------

/// Return the per-request detail and compaction events for one session.
///
/// We locate the `.jsonl` file by re-walking `<root>/*/<session_id>.jsonl`.
/// Returns an empty Vec (not an error) when the file cannot be found — the
/// session may have been deleted or is from a different tool.
///
/// Deduplication here is file-local: the detail view shows what this
/// transcript contains, including history replayed from a session it was
/// resumed from. Session totals (`scan`) dedupe across files instead, so a
/// resumed session's request count can exceed its billed request count.
pub fn get_session_detail(root: &Path, session_id: &str) -> Result<SessionDetail> {
    let empty = || SessionDetail {
        requests: vec![],
        compactions: vec![],
        transcript_path: None,
    };
    let Some(path) = find_session_file(root, session_id) else {
        return Ok(empty());
    };
    let transcript = read_transcript(&path, &mut TurnKeys::default())?;

    let requests = transcript
        .turns
        .into_iter()
        .enumerate()
        .map(|(index, t)| SessionRequest {
            index: index as u32,
            context_tokens: t.context_tokens(),
            cost_usd: t.cost_usd(),
            timestamp: t.timestamp,
            model: t.model,
            input_tokens: t.input,
            output_tokens: t.output,
            cache_write_5m: t.cache_write_5m,
            cache_write_1h: t.cache_write_1h,
            cache_read_tokens: t.cache_read,
            stop_reason: t.stop_reason,
            transcript_line: t.line,
            effort: t.effort,
        })
        .collect();

    Ok(SessionDetail {
        requests,
        compactions: transcript.compactions,
        transcript_path: Some(path.to_string_lossy().to_string()),
    })
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

// ---------------------------------------------------------------------------
// Session-level file parser
// ---------------------------------------------------------------------------

fn parse_session_file(
    path: &Path,
    fallback_project: &str,
    seen: &mut TurnKeys,
) -> Result<Option<Session>> {
    let transcript = read_transcript(path, seen)?;
    if transcript.turns.is_empty() {
        return Ok(None);
    }

    let mut session = Session {
        tool: ToolKind::ClaudeCode,
        session_id: path
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "unknown".to_string()),
        project: transcript.project.unwrap_or_else(|| fallback_project.to_string()),
        started_at: transcript.started_at.unwrap_or_else(Utc::now),
        model: transcript.turns.first().map(|t| t.model.clone()),
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_tokens: 0,
        cache_write_5m: 0,
        cache_write_1h: 0,
        cache_read_tokens: 0,
        peak_context_tokens: 0,
        peak_context_model: None,
        compaction_count: transcript.compactions.len() as u32,
        message_count: transcript.turns.len() as u32,
        cost_usd: 0.0,
    };

    for t in &transcript.turns {
        session.input_tokens += t.input;
        session.output_tokens += t.output;
        session.cache_write_5m += t.cache_write_5m;
        session.cache_write_1h += t.cache_write_1h;
        session.cache_creation_tokens += t.cache_write_5m + t.cache_write_1h;
        session.cache_read_tokens += t.cache_read;
        if t.context_tokens() >= session.peak_context_tokens {
            session.peak_context_tokens = t.context_tokens();
            session.peak_context_model = Some(t.model.clone());
        }
        // Per-request so each turn is charged at its own model's rate.
        // Unpriced models contribute 0; the UI flags them separately.
        session.cost_usd += t.cost_usd().unwrap_or(0.0);
    }

    Ok(Some(session))
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
            // Request with 1h cache (has ephemeral sub-fields)
            r#"{"type":"assistant","message":{"id":"msg_aaa","model":"claude-sonnet-5","stop_reason":"tool_use","usage":{"input_tokens":100,"output_tokens":50,"cache_creation_input_tokens":10,"cache_read_input_tokens":5,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":10}}}}"#,
            // Duplicate of the first assistant message (Claude Code streaming behaviour)
            r#"{"type":"assistant","message":{"id":"msg_aaa","model":"claude-sonnet-5","stop_reason":"tool_use","usage":{"input_tokens":100,"output_tokens":50,"cache_creation_input_tokens":10,"cache_read_input_tokens":5,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":10}}}}"#,
            // Request without ephemeral sub-fields (older format, all treated as 1h)
            r#"{"type":"assistant","message":{"id":"msg_bbb","model":"claude-sonnet-5","stop_reason":"end_turn","usage":{"input_tokens":20,"output_tokens":30,"cache_creation_input_tokens":0,"cache_read_input_tokens":0}}}"#,
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

        // cost_usd: per-request sum using correct 5m/1h split.
        // claude-sonnet-5: input=$3/M, output=$15/M, cw5m=$3.75/M, cw1h=$6/M, cr=$0.3/M
        // Request 1 (msg_aaa): cw5m=0, cw1h=10 → (100×3 + 50×15 + 0×3.75 + 10×6 + 5×0.3) / 1M
        //   = (300 + 750 + 0 + 60 + 1.5) / 1M = 0.0011115
        // Request 2 (msg_bbb): (20×3 + 30×15) / 1M = 0.00051
        // Total = 0.0016215
        let expected = (100.0 * 3.0 + 50.0 * 15.0 + 0.0 * 3.75 + 10.0 * 6.0 + 5.0 * 0.3
            + 20.0 * 3.0 + 30.0 * 15.0)
            / 1_000_000.0;
        assert!(
            (session.cost_usd - expected).abs() < 1e-9,
            "cost_usd={} expected={}",
            session.cost_usd,
            expected
        );
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

    #[test]
    fn a_transcript_cut_mid_character_still_counts() {
        let dir = tempfile::tempdir().unwrap();
        let path = write_session(dir.path(), "p", "33333333-3333-3333-3333-333333333333", &[assistant("m1", "r1", 5)]);
        // A write still in flight: the first two bytes of "設" (E8 A8 AD).
        let mut f = fs::OpenOptions::new().append(true).open(&path).unwrap();
        f.write_all(b"{\"type\":\"user\",\"message\":\"\xE8\xA8").unwrap();

        let sessions = ClaudeCodeSource::with_root(dir.path().to_path_buf()).scan().unwrap();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].output_tokens, 5);
    }

    #[test]
    fn an_unreadable_transcript_does_not_hide_the_others() {
        let dir = tempfile::tempdir().unwrap();
        // Sorts first, and reading a directory fails.
        fs::create_dir_all(dir.path().join("a").join("00000000-0000-0000-0000-000000000000.jsonl")).unwrap();
        write_session(dir.path(), "a", "44444444-4444-4444-4444-444444444444", &[assistant("m1", "r1", 5)]);
        write_session(dir.path(), "b", "55555555-5555-5555-5555-555555555555", &[assistant("m2", "r2", 7)]);

        let sessions = ClaudeCodeSource::with_root(dir.path().to_path_buf()).scan().unwrap();
        assert_eq!(sessions.len(), 2);
    }

    fn write_session(dir: &Path, project: &str, id: &str, lines: &[String]) -> PathBuf {
        let project_dir = dir.join(project);
        fs::create_dir_all(&project_dir).unwrap();
        let path = project_dir.join(format!("{id}.jsonl"));
        let mut f = fs::File::create(&path).unwrap();
        for line in lines {
            writeln!(f, "{line}").unwrap();
        }
        path
    }

    /// `msg`/`req` identify the request; `out` is its output_tokens.
    fn assistant(msg: &str, req: &str, out: u64) -> String {
        format!(
            r#"{{"type":"assistant","requestId":"{req}","timestamp":"2026-01-01T00:00:00.000Z","message":{{"id":"{msg}","model":"claude-sonnet-5","stop_reason":"end_turn","usage":{{"input_tokens":10,"output_tokens":{out},"cache_creation_input_tokens":0,"cache_read_input_tokens":0}}}}}}"#
        )
    }

    /// Streaming writes a request several times; earlier copies can be
    /// mid-stream snapshots with a partial output_tokens, so the last copy
    /// must win rather than the first.
    #[test]
    fn duplicate_records_resolve_to_the_last_copy() {
        let dir = tempfile::tempdir().unwrap();
        write_session(
            dir.path(),
            "-Users-test-p",
            "11111111-1111-1111-1111-111111111111",
            &[
                assistant("msg_a", "req_a", 5),   // mid-stream snapshot
                assistant("msg_a", "req_a", 120), // final
            ],
        );

        let sessions = ClaudeCodeSource::with_root(dir.path().to_path_buf())
            .scan()
            .unwrap();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].message_count, 1);
        assert_eq!(sessions[0].output_tokens, 120);
    }

    /// Resuming or forking a session replays the parent's requests into a new
    /// transcript. They were billed once, so they must be counted once.
    #[test]
    fn requests_replayed_into_a_resumed_session_are_not_double_counted() {
        let dir = tempfile::tempdir().unwrap();
        let shared = assistant("msg_shared", "req_shared", 100);
        write_session(
            dir.path(),
            "-Users-test-p",
            "aaaaaaaa-1111-1111-1111-111111111111",
            &[shared.clone()],
        );
        write_session(
            dir.path(),
            "-Users-test-p",
            "bbbbbbbb-2222-2222-2222-222222222222",
            &[shared, assistant("msg_new", "req_new", 7)],
        );

        let sessions = ClaudeCodeSource::with_root(dir.path().to_path_buf())
            .scan()
            .unwrap();
        let total_output: u64 = sessions.iter().map(|s| s.output_tokens).sum();
        let total_requests: u32 = sessions.iter().map(|s| s.message_count).sum();
        assert_eq!(total_output, 107, "shared request counted twice");
        assert_eq!(total_requests, 2);
    }

    /// Context is the whole prompt, cache writes included — the old formula
    /// (input + cache_read) dropped everything newly added this turn.
    #[test]
    fn context_tokens_include_cache_writes() {
        let turn = Turn {
            line: 1,
            timestamp: String::new(),
            effort: None,
            model: "claude-sonnet-5".into(),
            stop_reason: StopReason::EndTurn,
            input: 2,
            output: 591,
            cache_write_5m: 1_000,
            cache_write_1h: 44_900,
            cache_read: 16_700,
        };
        assert_eq!(turn.context_tokens(), 62_602);
    }

    #[test]
    fn unpriced_models_contribute_no_cost() {
        let turn = Turn {
            line: 1,
            timestamp: String::new(),
            effort: None,
            model: "nvidia-nemotron-nano-3-30b-aws".into(),
            stop_reason: StopReason::EndTurn,
            input: 1_000_000,
            output: 1_000_000,
            cache_write_5m: 0,
            cache_write_1h: 0,
            cache_read: 0,
        };
        assert!(turn.cost_usd().is_none());
    }

    /// The UI used to hard-code every request to "Medium" while the transcript
    /// carried the real level all along (xhigh dominates in practice).
    #[test]
    fn effort_and_stop_sequence_come_from_the_transcript() {
        let dir = tempfile::tempdir().unwrap();
        let path = write_session(
            dir.path(),
            "-Users-test-p",
            "cccccccc-3333-3333-3333-333333333333",
            &[
                r#"{"type":"assistant","requestId":"r1","effort":"xhigh","message":{"id":"m1","model":"claude-opus-5","stop_reason":"stop_sequence","usage":{"input_tokens":1,"output_tokens":1}}}"#.to_string(),
                // Older records carry no effort field at all.
                r#"{"type":"assistant","requestId":"r2","message":{"id":"m2","model":"claude-opus-5","stop_reason":"end_turn","usage":{"input_tokens":1,"output_tokens":1}}}"#.to_string(),
            ],
        );

        let t = read_transcript(&path, &mut TurnKeys::default()).unwrap();
        assert_eq!(t.turns[0].effort.as_deref(), Some("xhigh"));
        assert!(t.turns[1].effort.is_none());
        assert!(matches!(t.turns[0].stop_reason, StopReason::StopSequence));
    }

    /// Session-level context must be the peak of any single request. Summing
    /// per-request tokens measures cumulative traffic — a long session would
    /// read as thousands of percent "full".
    #[test]
    fn peak_context_is_the_largest_single_prompt_not_the_sum() {
        let dir = tempfile::tempdir().unwrap();
        let line = |msg: &str, read: u64| {
            format!(
                r#"{{"type":"assistant","requestId":"{msg}","message":{{"id":"{msg}","model":"claude-sonnet-5","stop_reason":"end_turn","usage":{{"input_tokens":0,"output_tokens":0,"cache_creation_input_tokens":0,"cache_read_input_tokens":{read}}}}}}}"#
            )
        };
        write_session(
            dir.path(),
            "-Users-test-p",
            "dddddddd-4444-4444-4444-444444444444",
            &[line("a", 10_000), line("b", 90_000), line("c", 40_000)],
        );

        let sessions = ClaudeCodeSource::with_root(dir.path().to_path_buf())
            .scan()
            .unwrap();
        assert_eq!(sessions[0].peak_context_tokens, 90_000);
        assert_eq!(sessions[0].cache_read_tokens, 140_000);
    }

    /// Compaction is logged explicitly by Claude Code, so this reads the
    /// record rather than inferring a boundary from a drop in the curve.
    #[test]
    fn compaction_boundaries_come_from_the_transcript_record() {
        let dir = tempfile::tempdir().unwrap();
        let boundary = r#"{"type":"system","subtype":"compact_boundary","timestamp":"2026-08-04T10:42:07.732Z","compactMetadata":{"trigger":"manual","preTokens":134490,"postTokens":16216,"cumulativeDroppedTokens":118274}}"#;
        let path = write_session(
            dir.path(),
            "-Users-test-p",
            "eeeeeeee-5555-5555-5555-555555555555",
            &[
                assistant("m1", "r1", 10),
                assistant("m2", "r2", 10),
                boundary.to_string(),
                assistant("m3", "r3", 10),
            ],
        );

        let t = read_transcript(&path, &mut TurnKeys::default()).unwrap();
        assert_eq!(t.turns.len(), 3, "the boundary record is not a request");
        assert_eq!(t.compactions.len(), 1);
        let c = &t.compactions[0];
        // Two requests came before it, so the curve splits at index 1.
        assert_eq!(c.before_index, 1);
        assert_eq!(c.trigger, "manual");
        assert_eq!(c.pre_tokens, 134_490);
        assert_eq!(c.post_tokens, 16_216);

        let sessions = ClaudeCodeSource::with_root(dir.path().to_path_buf())
            .scan()
            .unwrap();
        assert_eq!(sessions[0].compaction_count, 1);
    }

    /// A resumed transcript can open with a boundary; there is no preceding
    /// request for the chart to split on, so it is dropped rather than
    /// pointing at index -1.
    #[test]
    fn a_boundary_before_any_request_is_dropped() {
        let dir = tempfile::tempdir().unwrap();
        let path = write_session(
            dir.path(),
            "-Users-test-p",
            "ffffffff-6666-6666-6666-666666666666",
            &[
                r#"{"type":"system","subtype":"compact_boundary","compactMetadata":{"trigger":"auto","preTokens":1,"postTokens":2}}"#.to_string(),
                assistant("m1", "r1", 10),
            ],
        );
        let t = read_transcript(&path, &mut TurnKeys::default()).unwrap();
        assert!(t.compactions.is_empty());
        assert_eq!(t.turns.len(), 1);
    }

    /// The arrow in the requests table used to be a dead link with a made-up
    /// line number (`(index + 1) * 14`). Both halves it needs are real now.
    #[test]
    fn transcript_path_and_line_are_real() {
        let dir = tempfile::tempdir().unwrap();
        let path = write_session(
            dir.path(),
            "-Users-test-p",
            "77777777-7777-7777-7777-777777777777",
            &[
                r#"{"type":"user","message":{"role":"user"}}"#.to_string(), // line 1
                assistant("m1", "r1", 10),                                  // line 2
                r#"{"type":"queue-operation"}"#.to_string(),                // line 3
                assistant("m2", "r2", 10),                                  // line 4
            ],
        );

        let t = read_transcript(&path, &mut TurnKeys::default()).unwrap();
        assert_eq!(t.turns[0].line, 2);
        assert_eq!(t.turns[1].line, 4);
    }

    /// A duplicated record resolves to its last copy, so the line must point
    /// at that copy rather than the first one.
    #[test]
    fn transcript_line_points_at_the_surviving_copy() {
        let dir = tempfile::tempdir().unwrap();
        let path = write_session(
            dir.path(),
            "-Users-test-p",
            "88888888-8888-8888-8888-888888888888",
            &[assistant("m1", "r1", 5), assistant("m1", "r1", 120)],
        );
        let t = read_transcript(&path, &mut TurnKeys::default()).unwrap();
        assert_eq!(t.turns.len(), 1);
        assert_eq!(t.turns[0].line, 2);
        assert_eq!(t.turns[0].output, 120);
    }

    /// Claude Code opens many sessions with a Haiku title call. Judging the
    /// session's context against *that* model's 200K window made 1M-window
    /// work read as five times fuller than it was.
    #[test]
    fn peak_context_model_is_the_model_at_the_peak_not_the_first_one() {
        let dir = tempfile::tempdir().unwrap();
        let turn = |msg: &str, model: &str, read: u64| {
            format!(
                r#"{{"type":"assistant","requestId":"{msg}","message":{{"id":"{msg}","model":"{model}","stop_reason":"end_turn","usage":{{"input_tokens":0,"output_tokens":0,"cache_creation_input_tokens":0,"cache_read_input_tokens":{read}}}}}}}"#
            )
        };
        write_session(
            dir.path(),
            "-Users-test-p",
            "99999999-9999-9999-9999-999999999999",
            &[
                // Title generation: first, tiny, and on a 200K-window model.
                turn("t", "claude-haiku-4-5-20251001", 3_000),
                turn("a", "claude-opus-5", 400_000),
                turn("b", "claude-opus-5", 250_000),
            ],
        );

        let s = &ClaudeCodeSource::with_root(dir.path().to_path_buf())
            .scan()
            .unwrap()[0];
        assert_eq!(s.model.as_deref(), Some("claude-haiku-4-5-20251001"));
        assert_eq!(s.peak_context_tokens, 400_000);
        assert_eq!(s.peak_context_model.as_deref(), Some("claude-opus-5"));
    }
}
