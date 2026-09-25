//! Generated demo transcripts, for trying the app without any logs of your own.
//!
//! Rather than a parallel fake data path, this writes real Claude Code
//! transcripts and Codex rollouts to disk and lets the normal parsers read
//! them, so every screen (session detail, compactions, the context chart) is
//! exercised exactly as with real logs. Timestamps are relative to `now`, so
//! the tree is regenerated each time sample mode is switched on and the
//! "today" and "last 7 days" views are never empty.

use crate::Roots;
use anyhow::Result;
use chrono::{DateTime, Duration, SecondsFormat, Utc};
use serde_json::json;
use std::fs;
use std::io::Write;
use std::path::Path;

const PROJECTS: [&str; 4] = [
    "/Users/demo/projects/web-dashboard",
    "/Users/demo/projects/api-gateway",
    "/Users/demo/projects/mobile-app",
    "/Users/demo/projects/data-pipeline",
];

const CLAUDE_MODELS: [&str; 3] = ["claude-sonnet-5", "claude-opus-5-5", "claude-haiku-4-5-20251001"];
const CODEX_MODEL: &str = "gpt-5.5";

const CLAUDE_SESSIONS: u32 = 42;
const CODEX_SESSIONS: u32 = 14;
/// How far back the sample history reaches.
const HISTORY_DAYS: i64 = 30;

/// Skills the sample has installed. Some are never called, so the Tools page
/// has something to recommend switching off.
const CLAUDE_SKILLS: [(&str, &str); 8] = [
    ("code-review", "Review the current diff against the repo's coding standards and the originating issue."),
    ("tdd", "Test-driven development: write a failing test, make it pass, then refactor."),
    ("frontend-design", "Build polished, accessible UI components and pages with the project's design tokens."),
    ("release-notes", "Draft release notes from the pull requests merged since the last tag."),
    ("pdf", "Read, fill, merge and create PDF files, including forms and scanned pages."),
    ("xlsx", "Create, edit and analyse spreadsheets with formulas, formatting and charts."),
    ("brand-guidelines", "Apply the company's brand colours, typography and tone of voice to any artifact."),
    ("db-migrate", "Plan and write reversible database migrations and backfills."),
];

/// MCP servers and their tools; `sentry` is connected but never used.
const CLAUDE_MCP: [(&str, &[&str]); 3] = [
    ("github", &["create_pull_request", "list_issues", "get_file_contents", "search_code", "add_comment"]),
    ("linear", &["list_issues", "create_issue", "update_issue"]),
    ("sentry", &["get_issue", "search_events", "list_projects", "get_trace"]),
];

/// `(tool name, skill or subagent input, weight)` for a sample tool call.
const CLAUDE_CALLS: [(&str, &str, u64); 11] = [
    ("Bash", "", 30),
    ("Read", "", 25),
    ("Edit", "", 18),
    ("Grep", "", 10),
    ("Write", "", 5),
    ("mcp__github__get_file_contents", "", 3),
    ("mcp__github__create_pull_request", "", 1),
    ("mcp__linear__list_issues", "", 2),
    ("Skill", "code-review", 2),
    ("Skill", "tdd", 2),
    ("Agent", "Explore", 2),
];

const CODEX_SKILLS: [(&str, &str); 4] = [
    ("imagegen", "Generate or edit raster images."),
    ("openai-docs", "Look up current OpenAI API documentation."),
    ("spreadsheets", "Create and analyse spreadsheet files."),
    ("db-migrate", "Plan and write reversible database migrations."),
];

/// Replace `dir` with a fresh sample tree and return the roots to scan it.
pub fn write_sample(dir: &Path, now: DateTime<Utc>) -> Result<Roots> {
    if dir.exists() {
        fs::remove_dir_all(dir)?;
    }
    let claude_root = dir.join("claude");
    let codex_root = dir.join("codex");
    fs::create_dir_all(&claude_root)?;
    fs::create_dir_all(&codex_root)?;

    let mut rng = Rng(0x5eed_1234_abcd_ef01);
    for i in 0..CLAUDE_SESSIONS {
        write_claude_session(&claude_root, &mut rng, now, i)?;
    }
    for i in 0..CODEX_SESSIONS {
        write_codex_session(&codex_root, &mut rng, now, i)?;
    }

    Ok(Roots { claude_code: Some(claude_root), codex_cli: Some(codex_root) })
}

/// Small deterministic xorshift, so the sample looks the same every time.
struct Rng(u64);

impl Rng {
    fn next(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        x
    }

    /// Index into `weights`, chosen in proportion to them.
    fn weighted(&mut self, weights: impl Iterator<Item = u64> + Clone) -> usize {
        let mut pick = self.range(1, weights.clone().sum());
        for (i, w) in weights.enumerate() {
            if pick <= w {
                return i;
            }
            pick -= w;
        }
        0
    }

    /// Uniform in `lo..=hi`.
    fn range(&mut self, lo: u64, hi: u64) -> u64 {
        lo + self.next() % (hi - lo + 1)
    }

    fn chance(&mut self, percent: u64) -> bool {
        self.range(1, 100) <= percent
    }

    fn uuid(&mut self) -> String {
        let a = self.next();
        let b = self.next();
        format!(
            "{:08x}-{:04x}-4{:03x}-{:04x}-{:012x}",
            a >> 32,
            (a >> 16) & 0xffff,
            a & 0xfff,
            0x8000 | (b >> 48) & 0x3fff,
            b & 0xffff_ffff_ffff
        )
    }
}

fn ts(t: DateTime<Utc>) -> String {
    t.to_rfc3339_opts(SecondsFormat::Millis, true)
}

/// Start of session `i`: the first few land in the last few hours so today
/// has data, the rest spread over the history window. Always early enough
/// that the whole session ends before `now`.
fn session_start(rng: &mut Rng, now: DateTime<Utc>, i: u32) -> DateTime<Utc> {
    let minutes_ago = if i < 3 {
        rng.range(90, 6 * 60)
    } else {
        rng.range(6 * 60, HISTORY_DAYS as u64 * 24 * 60)
    };
    now - Duration::minutes(minutes_ago as i64)
}

fn write_lines(path: &Path, lines: &[serde_json::Value]) -> Result<()> {
    let mut f = fs::File::create(path)?;
    for line in lines {
        writeln!(f, "{line}")?;
    }
    Ok(())
}

fn write_claude_session(root: &Path, rng: &mut Rng, now: DateTime<Utc>, i: u32) -> Result<()> {
    let cwd = PROJECTS[rng.range(0, PROJECTS.len() as u64 - 1) as usize];
    let project_dir = root.join(cwd.replace('/', "-"));
    fs::create_dir_all(&project_dir)?;

    let session_id = rng.uuid();
    // Mostly Sonnet, some Opus, the odd Haiku-only session.
    let model = match rng.range(1, 10) {
        1..=6 => CLAUDE_MODELS[0],
        7..=9 => CLAUDE_MODELS[1],
        _ => CLAUDE_MODELS[2],
    };
    let turns = rng.range(6, 60);
    let mut t = session_start(rng, now, i);

    let mut lines = vec![json!({
        "type": "user",
        "timestamp": ts(t),
        "cwd": cwd,
        "sessionId": session_id,
        "message": { "role": "user", "content": "Sample prompt" },
    })];
    lines.extend(claude_listings(t, cwd, &session_id));

    let mut context: u64 = rng.range(9_000, 18_000);
    for turn in 0..turns {
        t += Duration::seconds(rng.range(8, 90) as i64);

        // Long sessions compact once the prompt gets big, like the real tool.
        if context > 160_000 {
            let post = rng.range(14_000, 24_000);
            lines.push(json!({
                "type": "system",
                "subtype": "compact_boundary",
                "timestamp": ts(t),
                "cwd": cwd,
                "sessionId": session_id,
                "compactMetadata": { "trigger": "auto", "preTokens": context, "postTokens": post },
            }));
            context = post;
            t += Duration::seconds(20);
        }

        let added = rng.range(800, 9_000);
        let one_hour = rng.chance(25);
        let (write_5m, write_1h) = if one_hour { (0, added) } else { (added, 0) };
        let last = turn + 1 == turns;
        let stop_reason = if last || rng.chance(15) { "end_turn" } else { "tool_use" };
        let mut content = Vec::new();
        let mut failed = None;
        if stop_reason == "tool_use" {
            let (name, arg, _) = CLAUDE_CALLS[rng.weighted(CLAUDE_CALLS.iter().map(|c| c.2))];
            let id = format!("toolu_sample_{i}_{turn}");
            let input = match name {
                "Skill" => json!({ "skill": arg }),
                "Agent" => json!({ "subagent_type": arg, "prompt": "Find where this is handled" }),
                _ => json!({}),
            };
            content.push(json!({ "type": "tool_use", "id": id, "name": name, "input": input }));
            if name == "Bash" && rng.chance(8) {
                failed = Some(id);
            }
        }
        let usage = json!({
            "input_tokens": rng.range(1, 40),
            "output_tokens": rng.range(120, 3_200),
            "cache_creation_input_tokens": added,
            "cache_read_input_tokens": context,
            "cache_creation": {
                "ephemeral_5m_input_tokens": write_5m,
                "ephemeral_1h_input_tokens": write_1h,
            },
        });
        lines.push(json!({
            "type": "assistant",
            "timestamp": ts(t),
            "cwd": cwd,
            "sessionId": session_id,
            "requestId": format!("req_sample_{i}_{turn}"),
            "effort": if model == CLAUDE_MODELS[1] { "high" } else { "medium" },
            "message": {
                "id": format!("msg_sample_{i}_{turn}"),
                "model": model,
                "role": "assistant",
                "stop_reason": stop_reason,
                "content": content,
                "usage": usage,
            },
        }));
        if let Some(id) = failed {
            lines.push(json!({
                "type": "user",
                "timestamp": ts(t),
                "cwd": cwd,
                "sessionId": session_id,
                "message": {
                    "role": "user",
                    "content": [{ "type": "tool_result", "tool_use_id": id, "is_error": true, "content": "exit code 1" }],
                },
            }));
        }
        context += added;
    }

    write_lines(&project_dir.join(format!("{session_id}.jsonl")), &lines)
}

/// The attachments Claude Code writes at the start of a session: what skills,
/// MCP tools and subagents were loaded.
fn claude_listings(t: DateTime<Utc>, cwd: &str, session_id: &str) -> Vec<serde_json::Value> {
    let attachment = |body: serde_json::Value| {
        json!({ "type": "attachment", "timestamp": ts(t), "cwd": cwd, "sessionId": session_id, "attachment": body })
    };
    let skills: String = CLAUDE_SKILLS.iter().map(|(n, d)| format!("- {n}: {d}\n")).collect();
    let tools: Vec<String> = CLAUDE_MCP
        .iter()
        .flat_map(|(server, tools)| tools.iter().map(move |tool| format!("mcp__{server}__{tool}")))
        .collect();
    vec![
        attachment(json!({
            "type": "skill_listing",
            "isInitial": true,
            "skillCount": CLAUDE_SKILLS.len(),
            "names": CLAUDE_SKILLS.iter().map(|s| s.0).collect::<Vec<_>>(),
            "content": skills,
        })),
        attachment(json!({ "type": "deferred_tools_delta", "addedNames": tools, "removedNames": [] })),
        attachment(json!({
            "type": "mcp_instructions_delta",
            "addedNames": ["github", "sentry"],
            "addedBlocks": [
                "## github\nUse these tools to read repositories, open pull requests and triage issues.",
                "## sentry\nQuery errors, traces and releases. Prefer search_events for time-bounded questions.",
            ],
            "removedNames": [],
        })),
        attachment(json!({
            "type": "agent_listing_delta",
            "addedTypes": ["general-purpose", "Explore"],
            "addedLines": [
                "- general-purpose: General-purpose agent for multi-step tasks. (Tools: *)",
                "- Explore: Read-only search agent for broad fan-out searches. (Tools: Read, Grep, Glob)",
            ],
            "removedTypes": [],
        })),
    ]
}

fn write_codex_session(root: &Path, rng: &mut Rng, now: DateTime<Utc>, i: u32) -> Result<()> {
    let cwd = PROJECTS[rng.range(0, PROJECTS.len() as u64 - 1) as usize];
    let thread_id = rng.uuid();
    let mut t = session_start(rng, now, i);

    let day_dir = root.join(t.format("%Y/%m/%d").to_string());
    fs::create_dir_all(&day_dir)?;
    let file = day_dir.join(format!("rollout-{}-{thread_id}.jsonl", t.format("%Y-%m-%dT%H-%M-%S")));

    let mut lines = vec![
        json!({
            "type": "session_meta",
            "timestamp": ts(t),
            "payload": { "id": thread_id, "session_id": thread_id, "cwd": cwd },
        }),
        json!({
            "type": "turn_context",
            "timestamp": ts(t),
            "payload": { "model": CODEX_MODEL, "effort": "medium", "cwd": cwd },
        }),
        json!({
            "type": "response_item",
            "timestamp": ts(t),
            "payload": {
                "type": "message",
                "role": "developer",
                "content": [{ "type": "input_text", "text": codex_skills_block() }],
            },
        }),
    ];

    let requests = rng.range(5, 36);
    let (mut total_in, mut total_out) = (0u64, 0u64);
    let mut context: u64 = rng.range(6_000, 14_000);
    for req in 0..requests {
        t += Duration::seconds(rng.range(5, 70) as i64);
        let fresh = rng.range(300, 6_000);
        let prompt = context + fresh;
        let output = rng.range(80, 2_400);
        total_in += prompt;
        total_out += output;
        lines.push(json!({
            "type": "event_msg",
            "timestamp": ts(t),
            "payload": {
                "type": "token_count",
                "info": {
                    "total_token_usage": { "input_tokens": total_in, "output_tokens": total_out },
                    // `input_tokens` is the whole prompt; the cached part is a subset.
                    "last_token_usage": {
                        "input_tokens": prompt,
                        "cached_input_tokens": context,
                        "output_tokens": output,
                    },
                },
            },
        }));
        context = prompt;
        let item = match rng.range(1, 20) {
            1..=11 => json!({ "type": "CommandExecution", "command": ["/bin/bash", "-lc", "cargo test"], "status": if rng.chance(10) { "failed" } else { "completed" } }),
            12..=16 => json!({ "type": "FileChange", "status": "completed" }),
            17..=18 => json!({ "type": "McpToolCall", "server": "github", "tool": "search_code", "status": "completed" }),
            19 => json!({ "type": "WebSearch", "query": "sample" }),
            _ => json!({ "type": "CommandExecution", "command": ["/bin/bash", "-lc", format!("cat {}", codex_skill_path("openai-docs"))], "status": "completed" }),
        };
        let mut item = item;
        item["id"] = json!(format!("exec-sample-{i}-{req}"));
        lines.push(json!({
            "type": "event_msg",
            "timestamp": ts(t),
            "payload": { "type": "item_completed", "item": item },
        }));
        if req + 1 == requests || rng.chance(20) {
            lines.push(json!({
                "type": "event_msg",
                "timestamp": ts(t),
                "payload": { "type": "task_complete" },
            }));
        }
    }

    write_lines(&file, &lines)
}

fn codex_skill_path(name: &str) -> String {
    format!("/Users/demo/.codex/skills/{name}/SKILL.md")
}

fn codex_skills_block() -> String {
    let skills: String = CODEX_SKILLS
        .iter()
        .map(|(n, d)| format!("- {n}: {d} (file: {})\n", codex_skill_path(n)))
        .collect();
    format!("<skills_instructions>\n## Skills\n### Available skills\n{skills}</skills_instructions>")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::ToolKind;
    use chrono::TimeZone;

    fn now() -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 9, 23, 12, 0, 0).unwrap()
    }

    #[test]
    fn sample_tree_parses_with_the_real_sources() {
        let dir = tempfile::tempdir().unwrap();
        let roots = write_sample(&dir.path().join("sample"), now()).unwrap();
        let sessions = crate::scan_all(&roots).unwrap();

        let claude = sessions.iter().filter(|s| s.tool == ToolKind::ClaudeCode).count();
        let codex = sessions.iter().filter(|s| s.tool == ToolKind::CodexCli).count();
        assert_eq!(claude, CLAUDE_SESSIONS as usize);
        assert_eq!(codex, CODEX_SESSIONS as usize);

        assert!(sessions.iter().all(|s| s.started_at <= now()));
        assert!(sessions.iter().all(|s| s.started_at >= now() - Duration::days(HISTORY_DAYS)));
        assert!(sessions.iter().any(|s| s.started_at >= now() - Duration::hours(24)));
        assert!(sessions.iter().any(|s| s.compaction_count > 0));
        assert!(sessions.iter().filter(|s| s.tool == ToolKind::ClaudeCode).all(|s| s.cost_usd > 0.0));
    }

    /// The Tools page needs both halves: things that are used and things that
    /// are loaded but never are.
    #[test]
    fn sample_has_used_and_unused_tools() {
        use crate::tool_usage::CapabilityKind;
        let dir = tempfile::tempdir().unwrap();
        let roots = write_sample(&dir.path().join("sample"), now()).unwrap();
        let sessions = crate::scan_all(&roots).unwrap();
        let called = |kind: CapabilityKind, name: &str| {
            sessions.iter().any(|s| s.tools.calls.iter().any(|c| c.kind == kind && c.name == name))
        };
        assert!(called(CapabilityKind::Builtin, "Bash"));
        assert!(called(CapabilityKind::Skill, "code-review"));
        assert!(called(CapabilityKind::Mcp, "github"));
        assert!(called(CapabilityKind::Builtin, "shell"));
        assert!(!called(CapabilityKind::Mcp, "sentry"));
        assert!(!called(CapabilityKind::Skill, "pdf"));
        assert!(sessions.iter().all(|s| s.tools.listed.is_some()));
        assert!(sessions.iter().all(|s| s.tools.baseline_tokens.is_some()));
    }

    #[test]
    fn sample_sessions_have_detail() {
        let dir = tempfile::tempdir().unwrap();
        let roots = write_sample(&dir.path().join("sample"), now()).unwrap();
        for session in crate::scan_all(&roots).unwrap() {
            let detail = crate::get_session_detail(&roots, &session.session_id).unwrap();
            assert_eq!(detail.requests.len() as u32, session.message_count, "{}", session.session_id);
        }
    }

    #[test]
    fn rewriting_replaces_the_previous_tree() {
        let dir = tempfile::tempdir().unwrap();
        let sample = dir.path().join("sample");
        write_sample(&sample, now() - Duration::days(90)).unwrap();
        let roots = write_sample(&sample, now()).unwrap();
        assert_eq!(
            crate::scan_all(&roots).unwrap().len(),
            (CLAUDE_SESSIONS + CODEX_SESSIONS) as usize
        );
    }
}
