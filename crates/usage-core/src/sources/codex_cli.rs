use crate::model::{Session, SessionDetail, SessionRequest, StopReason, ToolKind};
use crate::pricing::estimate_request_cost;
use crate::source::UsageSource;
use anyhow::Result;
use chrono::{DateTime, Utc};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

/// Codex writes one rollout file per thread under `~/.codex/sessions/YYYY/MM/DD/`.
pub fn default_root() -> Option<PathBuf> {
    crate::paths::real_home_dir().map(|h| h.join(".codex").join("sessions"))
}

pub struct CodexCliSource {
    root: PathBuf,
}

impl CodexCliSource {
    pub fn new() -> Self {
        Self { root: default_root().unwrap_or_default() }
    }

    pub fn with_root(root: PathBuf) -> Self {
        Self { root }
    }
}

impl Default for CodexCliSource {
    fn default() -> Self {
        Self::new()
    }
}

impl UsageSource for CodexCliSource {
    fn tool(&self) -> ToolKind {
        ToolKind::CodexCli
    }

    fn scan(&self) -> Result<Vec<Session>> {
        let mut sessions = Vec::new();
        if !self.root.is_dir() {
            return Ok(sessions);
        }

        // Shared across every file, for the same reason Claude Code needs one:
        // a spawned subagent replays its parent's `token_count` events into its
        // own rollout with rewritten timestamps but identical payloads (24 of
        // 712 requests in a real ~/.codex/sessions tree). Files are walked in
        // path order, which is chronological given the YYYY/MM/DD layout and
        // the timestamp in each filename, so the original always wins.
        let mut seen = UsageKeys::default();

        let mut files = Vec::new();
        collect_jsonl(&self.root, &mut files);
        for path in files {
            if let Some(session) = parse_session_file(&path, &mut seen)? {
                sessions.push(session);
            }
        }
        Ok(sessions)
    }
}

/// Depth-first walk collecting `*.jsonl`, sorted at every level.
fn collect_jsonl(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let mut paths: Vec<PathBuf> = entries.flatten().map(|e| e.path()).collect();
    paths.sort();
    for path in paths {
        if path.is_dir() {
            collect_jsonl(&path, out);
        } else if path.extension().and_then(|e| e.to_str()) == Some("jsonl") {
            out.push(path);
        }
    }
}

// ---------------------------------------------------------------------------
// Transcript reading
// ---------------------------------------------------------------------------

/// Identity of one API request. `token_count` records carry no id, so the
/// running cumulative counter plus the request's own usage is what identifies
/// them; a replayed copy reproduces both exactly. Scoped by the root thread id
/// (`session_meta.session_id`, shared by a thread and all of its subagents) so
/// two unrelated sessions can't collide on equal numbers.
type UsageKey = (String, u64, u64, u64, u64, u64);
type UsageKeys = std::collections::HashSet<UsageKey>;

/// One API request, after de-duplication.
struct Turn {
    /// 1-based line in the rollout file.
    line: u32,
    timestamp: String,
    model: String,
    /// Reasoning effort from the enclosing `turn_context` ("low".."max").
    effort: Option<String>,
    /// Prompt tokens that were neither cache-read nor cache-written. Codex
    /// reports `input_tokens` as the *whole* prompt, with the cached and
    /// written parts as subsets of it — summing them as-is would trip
    /// `total_tokens` over by the cache hits, which are ~93% of real traffic.
    input: u64,
    /// Includes `reasoning_output_tokens`, which is a subset, not an addition.
    output: u64,
    cache_write: u64,
    cache_read: u64,
    stop_reason: StopReason,
}

impl Turn {
    /// Full prompt this request carried — i.e. Codex's own `input_tokens`.
    fn context_tokens(&self) -> u64 {
        self.input + self.cache_write + self.cache_read
    }

    fn cost_usd(&self) -> Option<f64> {
        // Codex cache writes have no TTL tier; charge them at the 5m rate.
        estimate_request_cost(&self.model, self.input, self.output, self.cache_write, 0, self.cache_read)
    }
}

struct Transcript {
    project: Option<String>,
    started_at: Option<DateTime<Utc>>,
    turns: Vec<Turn>,
}

fn u64_at(value: &Value, key: &str) -> u64 {
    value.get(key).and_then(|v| v.as_u64()).unwrap_or(0)
}

/// Parse one rollout `.jsonl` into de-duplicated requests.
///
/// Keys already present in `seen` are skipped, which is what stops a subagent's
/// replayed prefix from being billed twice. Pass a fresh set to dedupe within
/// this file only.
fn read_transcript(path: &Path, seen: &mut UsageKeys) -> Result<Transcript> {
    let content = fs::read_to_string(path)?;

    let mut root_sid = String::new();
    let mut project: Option<String> = None;
    let mut started_at = None;
    let mut model = String::new();
    let mut effort: Option<String> = None;
    let mut turns: Vec<Turn> = Vec::new();

    for (line_no, line) in content.lines().enumerate() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let Ok(value) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        let timestamp = value.get("timestamp").and_then(|v| v.as_str()).unwrap_or_default();

        if started_at.is_none() {
            if let Ok(parsed) = DateTime::parse_from_rfc3339(timestamp) {
                started_at = Some(parsed.with_timezone(&Utc));
            }
        }

        let record_type = value.get("type").and_then(|v| v.as_str()).unwrap_or_default();
        let payload = value.get("payload").unwrap_or(&Value::Null);

        match record_type {
            "session_meta" => {
                // First one wins: a subagent's rollout opens with its parent's
                // meta replayed, and every copy names the same root thread.
                if root_sid.is_empty() {
                    root_sid = payload
                        .get("session_id")
                        .or_else(|| payload.get("id"))
                        .and_then(|v| v.as_str())
                        .unwrap_or_default()
                        .to_string();
                }
                if project.is_none() {
                    project = payload.get("cwd").and_then(|v| v.as_str()).map(str::to_string);
                }
            }
            "turn_context" => {
                if let Some(m) = payload.get("model").and_then(|v| v.as_str()) {
                    model = m.to_string();
                }
                effort = payload.get("effort").and_then(|v| v.as_str()).map(str::to_string);
                if project.is_none() {
                    project = payload.get("cwd").and_then(|v| v.as_str()).map(str::to_string);
                }
            }
            "event_msg" => match payload.get("type").and_then(|v| v.as_str()) {
                // Closes a turn: its last request is the one that answered the
                // user, everything before it went back out to a tool.
                Some("task_complete") => {
                    if let Some(last) = turns.last_mut() {
                        last.stop_reason = StopReason::EndTurn;
                    }
                }
                Some("token_count") => {
                    let Some(info) = payload.get("info").filter(|v| !v.is_null()) else {
                        continue; // emitted with no usage at session start
                    };
                    let (Some(total), Some(last)) =
                        (info.get("total_token_usage"), info.get("last_token_usage"))
                    else {
                        continue;
                    };

                    let key: UsageKey = (
                        root_sid.clone(),
                        u64_at(total, "input_tokens"),
                        u64_at(total, "output_tokens"),
                        u64_at(last, "input_tokens"),
                        u64_at(last, "output_tokens"),
                        u64_at(last, "cached_input_tokens"),
                    );
                    if !seen.insert(key) {
                        continue;
                    }

                    let prompt = u64_at(last, "input_tokens");
                    let cache_read = u64_at(last, "cached_input_tokens");
                    let cache_write = u64_at(last, "cache_write_input_tokens");
                    turns.push(Turn {
                        line: line_no as u32 + 1,
                        timestamp: timestamp.to_string(),
                        model: model.clone(),
                        effort: effort.clone(),
                        input: prompt.saturating_sub(cache_read).saturating_sub(cache_write),
                        output: u64_at(last, "output_tokens"),
                        cache_write,
                        cache_read,
                        stop_reason: StopReason::ToolUse,
                    });
                }
                _ => {}
            },
            _ => {}
        }
    }

    Ok(Transcript { project, started_at, turns })
}

/// The thread's own uuid, which is the tail of the rollout filename
/// (`rollout-<timestamp>-<uuid>.jsonl`). `session_meta.session_id` is *not*
/// usable here — a subagent records its parent's id, so several files share it.
fn session_id_from_path(path: &Path) -> String {
    let stem = path.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    match stem.char_indices().nth_back(35) {
        Some((i, _)) => stem[i..].to_string(),
        None => stem,
    }
}

fn parse_session_file(path: &Path, seen: &mut UsageKeys) -> Result<Option<Session>> {
    let transcript = read_transcript(path, seen)?;
    if transcript.turns.is_empty() {
        return Ok(None);
    }

    let mut session = Session {
        tool: ToolKind::CodexCli,
        session_id: session_id_from_path(path),
        project: transcript.project.unwrap_or_else(|| "unknown".to_string()),
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
        // ponytail: Codex has no compaction record in the rollout — it logs
        // `thread_rolled_back`, which is a different thing. Wire a count here
        // if a compaction event ever shows up.
        compaction_count: 0,
        message_count: transcript.turns.len() as u32,
        cost_usd: 0.0,
    };

    for t in &transcript.turns {
        session.input_tokens += t.input;
        session.output_tokens += t.output;
        session.cache_write_5m += t.cache_write;
        session.cache_creation_tokens += t.cache_write;
        session.cache_read_tokens += t.cache_read;
        if t.context_tokens() >= session.peak_context_tokens {
            session.peak_context_tokens = t.context_tokens();
            session.peak_context_model = Some(t.model.clone());
        }
        session.cost_usd += t.cost_usd().unwrap_or(0.0);
    }

    Ok(Some(session))
}

// ---------------------------------------------------------------------------
// Session detail
// ---------------------------------------------------------------------------

/// Per-request detail for one Codex thread.
///
/// Deduplication is file-local, matching Claude Code: the view shows what this
/// rollout contains, including a prefix replayed from the parent thread.
pub fn get_session_detail(root: &Path, session_id: &str) -> Result<SessionDetail> {
    let mut files = Vec::new();
    collect_jsonl(root, &mut files);
    let Some(path) = files.into_iter().find(|p| session_id_from_path(p) == session_id) else {
        return Ok(empty_detail());
    };

    let transcript = read_transcript(&path, &mut UsageKeys::default())?;
    let requests = transcript
        .turns
        .iter()
        .enumerate()
        .map(|(i, t)| SessionRequest {
            index: i as u32,
            timestamp: t.timestamp.clone(),
            model: t.model.clone(),
            context_tokens: t.context_tokens(),
            input_tokens: t.input,
            output_tokens: t.output,
            cache_write_5m: t.cache_write,
            cache_write_1h: 0,
            cache_read_tokens: t.cache_read,
            cost_usd: t.cost_usd(),
            stop_reason: t.stop_reason.clone(),
            transcript_line: t.line,
            effort: t.effort.clone(),
        })
        .collect();

    Ok(SessionDetail {
        requests,
        compactions: Vec::new(),
        transcript_path: Some(path.to_string_lossy().to_string()),
    })
}

fn empty_detail() -> SessionDetail {
    SessionDetail { requests: Vec::new(), compactions: Vec::new(), transcript_path: None }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    /// `token_count` line: `total` is the running cumulative counter, `last`
    /// is this request. `input` is the whole prompt; `cached` and `written`
    /// are subsets of it.
    fn token_count(
        ts: &str,
        total_in: u64,
        total_out: u64,
        input: u64,
        cached: u64,
        written: u64,
        output: u64,
    ) -> String {
        format!(
            r#"{{"timestamp":"{ts}","type":"event_msg","payload":{{"type":"token_count","info":{{"total_token_usage":{{"input_tokens":{total_in},"cached_input_tokens":0,"cache_write_input_tokens":0,"output_tokens":{total_out},"reasoning_output_tokens":0,"total_tokens":{}}},"last_token_usage":{{"input_tokens":{input},"cached_input_tokens":{cached},"cache_write_input_tokens":{written},"output_tokens":{output},"reasoning_output_tokens":0,"total_tokens":{}}},"model_context_window":258400}}}}}}"#,
            total_in + total_out,
            input + output,
        )
    }

    fn meta(ts: &str, sid: &str, cwd: &str) -> String {
        format!(
            r#"{{"timestamp":"{ts}","type":"session_meta","payload":{{"session_id":"{sid}","cwd":"{cwd}","cli_version":"0.147.0"}}}}"#
        )
    }

    fn turn_context(model: &str, effort: &str) -> String {
        format!(
            r#"{{"timestamp":"2026-08-18T06:55:25.508Z","type":"turn_context","payload":{{"model":"{model}","effort":"{effort}"}}}}"#
        )
    }

    fn write_rollout(dir: &Path, name: &str, lines: &[String]) -> PathBuf {
        fs::create_dir_all(dir).unwrap();
        let path = dir.join(format!("{name}.jsonl"));
        let mut f = fs::File::create(&path).unwrap();
        for line in lines {
            writeln!(f, "{line}").unwrap();
        }
        path
    }

    const SID_A: &str = "01a013a7-11a9-72b2-90d6-230d30bc1e4c";

    /// The split that makes or breaks every total: Codex reports the *whole*
    /// prompt as `input_tokens`, so cached and written tokens have to come out
    /// of it. Adding them on top would have counted the cache twice — 93% of
    /// real prompt traffic in this source is cache reads.
    #[test]
    fn cached_and_written_prompt_tokens_come_out_of_input() {
        let dir = tempfile::tempdir().unwrap();
        write_rollout(
            &dir.path().join("2026/08/18"),
            &format!("rollout-2026-08-18T14-55-11-{SID_A}"),
            &[
                meta("2026-08-18T06:55:25.005Z", SID_A, "/Users/test/proj"),
                turn_context("gpt-5.6-terra", "medium"),
                token_count("2026-08-18T06:55:37.745Z", 1000, 40, 1000, 600, 300, 40),
                token_count("2026-08-18T06:56:37.745Z", 3000, 90, 2000, 1900, 0, 50),
            ],
        );

        let sessions = CodexCliSource::with_root(dir.path().to_path_buf()).scan().unwrap();
        assert_eq!(sessions.len(), 1);
        let s = &sessions[0];

        assert_eq!(s.input_tokens, 100 + 100); // 1000-600-300, 2000-1900-0
        assert_eq!(s.cache_read_tokens, 2500);
        assert_eq!(s.cache_creation_tokens, 300);
        assert_eq!(s.cache_write_5m, 300); // no TTL tiers in this source
        assert_eq!(s.cache_write_1h, 0);
        assert_eq!(s.output_tokens, 90);
        // Every part of the prompt is accounted for exactly once.
        assert_eq!(s.total_tokens(), 1000 + 2000 + 90);
        assert_eq!(s.peak_context_tokens, 2000);
        assert_eq!(s.message_count, 2);
        assert_eq!(s.project, "/Users/test/proj");
        assert_eq!(s.model.as_deref(), Some("gpt-5.6-terra"));
        assert_eq!(s.tool.as_str(), "codex_cli");
    }

    /// A spawned subagent opens its rollout with the parent's history replayed
    /// — same usage payloads, timestamps rewritten to the spawn moment. Both
    /// files are real sessions; the replayed requests belong only to the first.
    #[test]
    fn subagent_replay_is_not_billed_twice() {
        let dir = tempfile::tempdir().unwrap();
        let day = dir.path().join("2026/08/18");
        let shared = [
            meta("2026-08-18T06:55:25.005Z", SID_A, "/Users/test/proj"),
            turn_context("gpt-5.6-terra", "medium"),
            token_count("2026-08-18T06:55:37.745Z", 1000, 40, 1000, 0, 0, 40),
        ];

        write_rollout(&day, &format!("rollout-2026-08-18T14-55-11-{SID_A}"), &shared);

        // Child: parent's prefix at rewritten timestamps, then its own work.
        let mut child = shared.to_vec();
        child[0] = meta("2026-08-18T07:01:29.216Z", SID_A, "/Users/test/proj");
        child[2] = token_count("2026-08-18T07:01:29.239Z", 1000, 40, 1000, 0, 0, 40);
        child.push(token_count("2026-08-18T07:02:00.000Z", 3000, 70, 2000, 0, 0, 30));
        write_rollout(
            &day,
            "rollout-2026-08-18T15-01-28-01a013ac-d38e-7d43-b4d7-e763626e5db2",
            &child,
        );

        let sessions = CodexCliSource::with_root(dir.path().to_path_buf()).scan().unwrap();
        assert_eq!(sessions.len(), 2);
        // The earlier file keeps the shared request; the child keeps only its own.
        assert_eq!(sessions[0].message_count, 1);
        assert_eq!(sessions[0].input_tokens, 1000);
        assert_eq!(sessions[1].message_count, 1);
        assert_eq!(sessions[1].input_tokens, 2000);
    }

    /// Codex re-emits a `token_count` unchanged now and then — same cumulative
    /// total, same request usage. Summing them inflated the tree by 3.4%.
    #[test]
    fn repeated_token_count_is_counted_once() {
        let dir = tempfile::tempdir().unwrap();
        let repeated = token_count("2026-08-18T06:55:39.741Z", 1000, 40, 1000, 0, 0, 40);
        write_rollout(
            &dir.path().join("2026/08/18"),
            &format!("rollout-2026-08-18T14-55-11-{SID_A}"),
            &[
                meta("2026-08-18T06:55:25.005Z", SID_A, "/Users/test/proj"),
                turn_context("gpt-5.6-terra", "medium"),
                repeated.clone(),
                repeated,
            ],
        );

        let sessions = CodexCliSource::with_root(dir.path().to_path_buf()).scan().unwrap();
        assert_eq!(sessions[0].message_count, 1);
        assert_eq!(sessions[0].input_tokens, 1000);
    }

    /// `session_meta.session_id` names the *root* thread, so a subagent's
    /// rollout carries its parent's id. Keying sessions on it would collapse
    /// ten files into one row; the filename holds the thread's own uuid.
    #[test]
    fn session_id_comes_from_the_filename_not_the_meta_record() {
        let dir = tempfile::tempdir().unwrap();
        write_rollout(
            &dir.path().join("2026/08/18"),
            "rollout-2026-08-18T15-01-28-01a013ac-d38e-7d43-b4d7-e763626e5db2",
            &[
                meta("2026-08-18T07:01:29.216Z", SID_A, "/Users/test/proj"),
                turn_context("gpt-5.6-terra", "medium"),
                token_count("2026-08-18T07:01:29.239Z", 1000, 40, 1000, 0, 0, 40),
            ],
        );

        let sessions = CodexCliSource::with_root(dir.path().to_path_buf()).scan().unwrap();
        assert_eq!(sessions[0].session_id, "01a013ac-d38e-7d43-b4d7-e763626e5db2");
    }

    /// Records with no usage at all (`info: null`) and rollouts that never got
    /// a response must not produce a session.
    #[test]
    fn rollouts_without_usage_are_skipped() {
        let dir = tempfile::tempdir().unwrap();
        write_rollout(
            &dir.path().join("2026/08/18"),
            &format!("rollout-2026-08-18T14-55-11-{SID_A}"),
            &[
                meta("2026-08-18T06:55:25.005Z", SID_A, "/Users/test/proj"),
                r#"{"timestamp":"2026-08-18T06:55:26.423Z","type":"event_msg","payload":{"type":"token_count","info":null}}"#.to_string(),
                r#"not json"#.to_string(),
            ],
        );

        assert!(CodexCliSource::with_root(dir.path().to_path_buf()).scan().unwrap().is_empty());
    }

    /// `task_complete` closes a turn: its last request answered the user, the
    /// ones before it went back out to a tool.
    #[test]
    fn task_complete_marks_the_turn_ending_request() {
        let dir = tempfile::tempdir().unwrap();
        let path = write_rollout(
            &dir.path().join("2026/08/18"),
            &format!("rollout-2026-08-18T14-55-11-{SID_A}"),
            &[
                meta("2026-08-18T06:55:25.005Z", SID_A, "/Users/test/proj"),
                turn_context("gpt-5.6-terra", "high"),
                token_count("2026-08-18T06:55:37.745Z", 1000, 40, 1000, 0, 0, 40),
                token_count("2026-08-18T06:55:47.745Z", 3000, 70, 2000, 0, 0, 30),
                r#"{"timestamp":"2026-08-18T06:55:48.000Z","type":"event_msg","payload":{"type":"task_complete"}}"#.to_string(),
            ],
        );

        let transcript = read_transcript(&path, &mut UsageKeys::default()).unwrap();
        assert!(matches!(transcript.turns[0].stop_reason, StopReason::ToolUse));
        assert!(matches!(transcript.turns[1].stop_reason, StopReason::EndTurn));
        assert_eq!(transcript.turns[1].effort.as_deref(), Some("high"));
    }
}
