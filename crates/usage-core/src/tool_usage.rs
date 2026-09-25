//! What each session had loaded into its prompt — skills, MCP servers,
//! subagents — and what it actually called.
//!
//! Every listed skill description and MCP tool name rides along on every
//! request whether or not it is used, so the two halves together are what
//! tells a user which ones cost context without paying for themselves.
//!
//! The parsers (`sources/*.rs`) feed a [`Collector`] while they read a
//! transcript; the result is stored per session in the cache and aggregated
//! across sessions by [`report`].

use crate::model::ToolKind;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CapabilityKind {
    /// Shipped with the CLI (Bash, Read, shell, apply_patch…). Can't be removed.
    Builtin,
    /// One MCP server; its tools are counted under it.
    Mcp,
    Skill,
    Subagent,
}

/// Calls to one capability within one session.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CallCount {
    pub kind: CapabilityKind,
    /// Tool name for a built-in, server name for MCP, skill or agent name.
    pub name: String,
    /// MCP only: which of the server's tools.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool: Option<String>,
    pub calls: u32,
    pub errors: u32,
}

/// Something the session had in its prompt, used or not.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Listed {
    pub kind: CapabilityKind,
    pub name: String,
    /// Estimated tokens this entry adds to every request. `None` when the log
    /// doesn't show it (a Codex MCP server) — unknown, not free.
    pub tokens: Option<u32>,
    /// MCP: how many tools the server exposes.
    #[serde(default)]
    pub tools: u32,
    /// Codex skills: the `SKILL.md` path, which is what `[[skills.config]]`
    /// needs to turn one off.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct SessionTools {
    /// Prompt size of the session's first request: the system prompt, tool
    /// definitions, skill list, memory files and the first message — what
    /// every session pays before any work. `None` for a resumed session or a
    /// subagent, whose first request carries replayed history instead.
    pub baseline_tokens: Option<u64>,
    pub calls: Vec<CallCount>,
    /// `None` when the transcript doesn't record what was loaded (older CLI
    /// versions), so "never used" can't be claimed for anything.
    pub listed: Option<Vec<Listed>>,
}

/// Rough token count: ~4 characters per token for ASCII, one per CJK or other
/// non-ASCII character. Close enough to rank listings against each other.
pub fn estimate_tokens(text: &str) -> u32 {
    let (mut ascii, mut other) = (0u32, 0u32);
    for c in text.chars() {
        if c.is_ascii() {
            ascii += 1;
        } else {
            other += 1;
        }
    }
    ascii.div_ceil(4) + other
}

/// A server's name as it appears in its tools' `mcp__<server>__…` prefix:
/// Claude Code replaces anything outside `[A-Za-z0-9_-]` with `_`, so the
/// instructions of "claude.ai Gmail" and the tools of `claude_ai_Gmail` are
/// one server.
pub fn normalize_server(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '_' || c == '-' { c } else { '_' })
        .collect()
}

/// `mcp__<server>__<tool>` → `(server, tool)`.
pub fn split_mcp(name: &str) -> Option<(&str, &str)> {
    name.strip_prefix("mcp__")?.split_once("__")
}

/// Accumulates one transcript's tool activity and listings.
#[derive(Debug, Default)]
pub(crate) struct Collector {
    calls: Vec<CallCount>,
    index: HashMap<(CapabilityKind, String, Option<String>), usize>,
    /// Call id → entry, so a later error result lands on the right one.
    by_id: HashMap<String, usize>,
    skills: BTreeMap<String, (u32, Option<String>)>,
    mcp_tools: BTreeMap<String, BTreeMap<String, u32>>,
    mcp_instructions: BTreeMap<String, u32>,
    agents: BTreeMap<String, u32>,
    saw_listing: bool,
    /// Slash commands typed by the user; only the ones naming a listed skill
    /// count, which is only knowable once the listing has been read.
    slash_commands: Vec<String>,
    /// Call payloads mentioning a `SKILL.md`, matched against the listed
    /// skill paths at the end (Codex opens a skill by reading its file).
    skill_reads: Vec<String>,
}

impl Collector {
    pub(crate) fn call(&mut self, kind: CapabilityKind, name: &str, tool: Option<&str>, id: Option<&str>) -> usize {
        let key = (kind, name.to_string(), tool.map(str::to_string));
        let i = match self.index.get(&key) {
            Some(&i) => i,
            None => {
                self.calls.push(CallCount {
                    kind,
                    name: key.1.clone(),
                    tool: key.2.clone(),
                    calls: 0,
                    errors: 0,
                });
                self.index.insert(key, self.calls.len() - 1);
                self.calls.len() - 1
            }
        };
        self.calls[i].calls += 1;
        if let Some(id) = id {
            self.by_id.insert(id.to_string(), i);
        }
        i
    }

    /// A tool name as the model called it: built-in, or MCP by its prefix.
    pub(crate) fn call_named(&mut self, name: &str, id: Option<&str>, failed: bool) {
        let i = match split_mcp(name) {
            Some((server, tool)) => self.call(CapabilityKind::Mcp, server, Some(tool), id),
            None => self.call(CapabilityKind::Builtin, name, None, id),
        };
        if failed {
            self.calls[i].errors += 1;
        }
    }

    pub(crate) fn error_at(&mut self, i: usize) {
        self.calls[i].errors += 1;
    }

    /// A tool result reported an error for call `id`.
    pub(crate) fn error(&mut self, id: &str) {
        if let Some(&i) = self.by_id.get(id) {
            self.calls[i].errors += 1;
        }
    }

    pub(crate) fn slash_command(&mut self, name: &str) {
        self.slash_commands.push(name.to_string());
    }

    pub(crate) fn skill_read(&mut self, text: &str) {
        if text.contains("SKILL.md") {
            self.skill_reads.push(text.to_string());
        }
    }

    pub(crate) fn list_skill(&mut self, name: &str, tokens: u32, path: Option<String>) {
        self.saw_listing = true;
        self.skills.insert(name.to_string(), (tokens, path));
    }

    /// Claude Code's `skill_listing`, `deferred_tools_delta`,
    /// `mcp_instructions_delta` and `agent_listing_delta` attachments.
    pub(crate) fn claude_attachment(&mut self, attachment: &Value) {
        let strings = |key: &str| -> Vec<&str> {
            attachment
                .get(key)
                .and_then(|v| v.as_array())
                .map(|a| a.iter().filter_map(|v| v.as_str()).collect())
                .unwrap_or_default()
        };
        match attachment.get("type").and_then(|v| v.as_str()) {
            Some("skill_listing") => {
                let content = attachment.get("content").and_then(|v| v.as_str()).unwrap_or_default();
                for (name, tokens) in skill_lines(content) {
                    self.list_skill(&name, tokens, None);
                }
                // Names without a line in `content` (a listing cut by the
                // character budget) still cost their name.
                for name in strings("names") {
                    if !self.skills.contains_key(name) {
                        self.list_skill(name, estimate_tokens(name) + 2, None);
                    }
                }
            }
            Some("deferred_tools_delta") => {
                self.saw_listing = true;
                for name in strings("addedNames") {
                    if let Some((server, tool)) = split_mcp(name) {
                        self.mcp_tools
                            .entry(server.to_string())
                            .or_default()
                            .insert(tool.to_string(), estimate_tokens(name) + 1);
                    }
                }
                for name in strings("removedNames") {
                    if let Some((server, tool)) = split_mcp(name) {
                        if let Some(tools) = self.mcp_tools.get_mut(server) {
                            tools.remove(tool);
                        }
                    }
                }
            }
            Some("mcp_instructions_delta") => {
                self.saw_listing = true;
                let blocks = strings("addedBlocks");
                for (i, name) in strings("addedNames").into_iter().enumerate() {
                    let tokens = blocks.get(i).map(|b| estimate_tokens(b)).unwrap_or(0);
                    self.mcp_instructions.insert(normalize_server(name), tokens);
                }
                for name in strings("removedNames") {
                    self.mcp_instructions.remove(&normalize_server(name));
                }
            }
            Some("agent_listing_delta") => {
                self.saw_listing = true;
                let lines = strings("addedLines");
                for (i, name) in strings("addedTypes").into_iter().enumerate() {
                    let tokens = lines.get(i).map(|l| estimate_tokens(l)).unwrap_or(0);
                    self.agents.insert(name.to_string(), tokens);
                }
                for name in strings("removedTypes") {
                    self.agents.remove(name);
                }
            }
            _ => {}
        }
    }

    pub(crate) fn finish(mut self, baseline_tokens: Option<u64>) -> SessionTools {
        for name in std::mem::take(&mut self.slash_commands) {
            if self.skills.contains_key(&name) {
                self.call(CapabilityKind::Skill, &name, None, None);
            }
        }
        let paths: Vec<(String, String)> = self
            .skills
            .iter()
            .filter_map(|(name, (_, path))| Some((name.clone(), path.clone()?)))
            .collect();
        for text in std::mem::take(&mut self.skill_reads) {
            for (name, path) in &paths {
                if text.contains(path.as_str()) {
                    self.call(CapabilityKind::Skill, name, None, None);
                }
            }
        }

        let listed = self.saw_listing.then(|| {
            let mut listed: Vec<Listed> = Vec::new();
            for (name, (tokens, path)) in &self.skills {
                listed.push(Listed { kind: CapabilityKind::Skill, name: name.clone(), tokens: Some(*tokens), tools: 0, path: path.clone() });
            }
            let servers: BTreeSet<&String> = self.mcp_tools.keys().chain(self.mcp_instructions.keys()).collect();
            for server in servers {
                let tools = self.mcp_tools.get(server).filter(|t| !t.is_empty());
                if tools.is_none() && !self.mcp_instructions.contains_key(server) {
                    continue; // every tool it had was removed
                }
                let tokens = tools.map(|t| t.values().sum::<u32>()).unwrap_or(0)
                    + self.mcp_instructions.get(server).copied().unwrap_or(0);
                listed.push(Listed {
                    kind: CapabilityKind::Mcp,
                    name: server.clone(),
                    tokens: Some(tokens),
                    tools: tools.map(|t| t.len() as u32).unwrap_or(0),
                    path: None,
                });
            }
            for (name, tokens) in &self.agents {
                listed.push(Listed { kind: CapabilityKind::Subagent, name: name.clone(), tokens: Some(*tokens), tools: 0, path: None });
            }
            listed
        });

        SessionTools { baseline_tokens, calls: self.calls, listed }
    }
}

/// `- name: description` entries of a skill listing, with each entry's
/// estimated cost. Names can contain a colon (`plugin:skill`) but never a
/// colon followed by a space, so that is where the name ends. A continuation
/// line belongs to the entry above it.
fn skill_lines(content: &str) -> Vec<(String, u32)> {
    let mut out: Vec<(String, u32)> = Vec::new();
    for line in content.lines() {
        if let Some(entry) = line.strip_prefix("- ") {
            let name = entry.split_once(": ").map(|(n, _)| n).unwrap_or(entry).trim();
            if !name.is_empty() {
                out.push((name.to_string(), estimate_tokens(line) + 1));
                continue;
            }
        }
        if let Some(last) = out.last_mut() {
            last.1 += estimate_tokens(line) + 1;
        }
    }
    out
}

/// Codex's `<skills_instructions>` block: `- name: description (file: path)`.
///
/// Newer versions shorten the paths to `r2/imagegen/SKILL.md` and list the
/// roots once (`` - `r2` = `/Users/me/.codex/skills/.system` ``); they are
/// expanded here, since both `[[skills.config]]` and the model's reads of the
/// file use the absolute path.
pub(crate) fn codex_skill_listing(collector: &mut Collector, text: &str) {
    let Some(start) = text.find("<skills_instructions>") else {
        return;
    };
    let block = &text[start..];
    let block = &block[..block.find("</skills_instructions>").unwrap_or(block.len())];
    let roots: HashMap<&str, &str> = block
        .lines()
        .filter_map(|line| {
            let (id, dir) = line.strip_prefix("- `")?.split_once("` = `")?;
            Some((id, dir.strip_suffix('`')?))
        })
        .collect();
    for line in block.lines() {
        let Some(entry) = line.strip_prefix("- ") else {
            continue;
        };
        let Some(path_start) = entry.rfind("(file: ") else {
            continue; // the "How to use skills" bullets have no file
        };
        let short = entry[path_start + 7..].trim_end().trim_end_matches(')');
        let path = match short.split_once('/') {
            Some((root, rest)) if roots.contains_key(root) => format!("{}/{rest}", roots[root]),
            _ => short.to_string(),
        };
        let name = entry.split_once(": ").map(|(n, _)| n).unwrap_or(entry).trim();
        collector.list_skill(name, estimate_tokens(line) + 1, Some(path));
    }
}

// ---------------------------------------------------------------------------
// Cross-session report
// ---------------------------------------------------------------------------

/// One session's tool data as the Tools page reads it.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionToolRow {
    pub tool: ToolKind,
    pub session_id: String,
    pub started_at: DateTime<Utc>,
    pub requests: u32,
    pub baseline_tokens: Option<u64>,
    pub calls: Vec<CallCount>,
}

/// One listed capability across every session that listed it.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ListedStat {
    pub tool: ToolKind,
    pub kind: CapabilityKind,
    pub name: String,
    /// From the most recent session that listed it.
    pub tokens: Option<u32>,
    pub tools: u32,
    pub path: Option<String>,
    pub first_listed: DateTime<Utc>,
    pub last_listed: DateTime<Utc>,
    pub sessions_listed: u32,
    /// Listed by the most recent session with a listing — i.e. still installed.
    pub current: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ToolUsageReport {
    pub sessions: Vec<SessionToolRow>,
    pub listed: Vec<ListedStat>,
}

pub struct StoredSession {
    pub tool: ToolKind,
    pub session_id: String,
    pub started_at: DateTime<Utc>,
    pub requests: u32,
    pub data: SessionTools,
}

/// Aggregate the stored per-session data. Calls stay per session so the page
/// can window them; listings, which are near-identical from one session to
/// the next, are folded here so they aren't shipped once per session.
pub fn report(mut stored: Vec<StoredSession>, extra: Vec<Listed>, extra_tool: ToolKind) -> ToolUsageReport {
    stored.sort_by_key(|s| s.started_at);
    let mut listed: BTreeMap<(ToolKind, CapabilityKind, String), ListedStat> = BTreeMap::new();
    // Per tool, what its most recent session with a listing had loaded.
    let mut latest: HashMap<ToolKind, BTreeSet<(CapabilityKind, String)>> = HashMap::new();

    for s in &stored {
        let Some(items) = &s.data.listed else { continue };
        let mut names = BTreeSet::new();
        for item in items {
            names.insert((item.kind, item.name.clone()));
            listed
                .entry((s.tool, item.kind, item.name.clone()))
                .and_modify(|stat| {
                    stat.tokens = item.tokens;
                    stat.tools = item.tools;
                    stat.path = item.path.clone().or(stat.path.take());
                    stat.last_listed = s.started_at;
                    stat.sessions_listed += 1;
                })
                .or_insert_with(|| ListedStat {
                    tool: s.tool,
                    kind: item.kind,
                    name: item.name.clone(),
                    tokens: item.tokens,
                    tools: item.tools,
                    path: item.path.clone(),
                    first_listed: s.started_at,
                    last_listed: s.started_at,
                    sessions_listed: 1,
                    current: false,
                });
        }
        latest.insert(s.tool, names);
    }

    for stat in listed.values_mut() {
        stat.current = latest
            .get(&stat.tool)
            .is_some_and(|names| names.contains(&(stat.kind, stat.name.clone())));
    }

    // Configured but never seen in a listing (Codex MCP servers): known to be
    // installed now, first seen whenever the oldest session of that tool was.
    let oldest = stored.iter().find(|s| s.tool == extra_tool).map(|s| s.started_at);
    let newest = stored.iter().rev().find(|s| s.tool == extra_tool).map(|s| s.started_at);
    if let (Some(first), Some(last)) = (oldest, newest) {
        for item in extra {
            listed.entry((extra_tool, item.kind, item.name.clone())).or_insert(ListedStat {
                tool: extra_tool,
                kind: item.kind,
                name: item.name,
                tokens: item.tokens,
                tools: item.tools,
                path: item.path,
                first_listed: first,
                last_listed: last,
                sessions_listed: 0,
                current: true,
            });
        }
    }

    ToolUsageReport {
        sessions: stored
            .into_iter()
            .map(|s| SessionToolRow {
                tool: s.tool,
                session_id: s.session_id,
                started_at: s.started_at,
                requests: s.requests,
                baseline_tokens: s.data.baseline_tokens,
                calls: s.data.calls,
            })
            .collect(),
        listed: listed.into_values().collect(),
    }
}

/// MCP servers enabled in Codex's `config.toml` (`[mcp_servers.<name>]`
/// without `enabled = false`). Rollouts only show the servers that were
/// called, so this is the only way to see one that never was.
///
/// ponytail: a line scanner, not a TOML parser — it reads the table headers
/// and one key. Switch to the `toml` crate if more of the file is needed.
pub fn codex_mcp_servers(codex_home: &Path) -> Vec<Listed> {
    let Ok(text) = std::fs::read_to_string(codex_home.join("config.toml")) else {
        return Vec::new();
    };
    let mut servers: Vec<(String, bool)> = Vec::new();
    let mut in_server = false;
    for line in text.lines() {
        let line = line.trim();
        if line.starts_with('[') {
            let header = line.trim_start_matches('[').trim_end_matches(']').trim();
            in_server = false;
            if let Some(rest) = header.strip_prefix("mcp_servers.") {
                // `[mcp_servers.x.env]` is a sub-table of x, not a new server.
                let name = if let Some(quoted) = rest.strip_prefix('"') {
                    quoted.split('"').next().unwrap_or_default()
                } else {
                    rest.split('.').next().unwrap_or_default()
                };
                let sub = rest.len() > name.len() + if rest.starts_with('"') { 2 } else { 0 };
                if !sub && !name.is_empty() {
                    servers.push((name.to_string(), true));
                    in_server = true;
                }
            }
        } else if in_server {
            let compact: String = line.chars().filter(|c| !c.is_whitespace()).collect();
            if compact.starts_with("enabled=false") {
                if let Some(last) = servers.last_mut() {
                    last.1 = false;
                }
            }
        }
    }
    servers
        .into_iter()
        .filter(|(_, enabled)| *enabled)
        .map(|(name, _)| Listed { kind: CapabilityKind::Mcp, name, tokens: None, tools: 0, path: None })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;
    use serde_json::json;

    #[test]
    fn token_estimate_counts_cjk_per_character() {
        assert_eq!(estimate_tokens("abcdefgh"), 2);
        assert_eq!(estimate_tokens("abc"), 1);
        assert_eq!(estimate_tokens("工具"), 2);
        assert_eq!(estimate_tokens(""), 0);
    }

    #[test]
    fn mcp_names_split_on_the_first_double_underscore_after_the_prefix() {
        assert_eq!(split_mcp("mcp__claude-in-chrome__navigate"), Some(("claude-in-chrome", "navigate")));
        assert_eq!(split_mcp("mcp__Claude_Browser__read_page"), Some(("Claude_Browser", "read_page")));
        assert_eq!(split_mcp("Bash"), None);
    }

    #[test]
    fn plugin_skill_names_keep_their_colon() {
        let lines = skill_lines("- tdd: Test first.\n- atlassian:triage-issue: Triage a bug.\n  more text\n- name-only");
        let names: Vec<&str> = lines.iter().map(|(n, _)| n.as_str()).collect();
        assert_eq!(names, ["tdd", "atlassian:triage-issue", "name-only"]);
        // The continuation line is charged to the entry above it.
        assert!(lines[1].1 > estimate_tokens("- atlassian:triage-issue: Triage a bug."));
    }

    #[test]
    fn claude_listings_become_skills_servers_and_agents() {
        let mut c = Collector::default();
        c.claude_attachment(&json!({"type":"skill_listing","names":["tdd","grill"],"content":"- tdd: Test first.\n- grill: Ask questions."}));
        c.claude_attachment(&json!({"type":"deferred_tools_delta","addedNames":["WebFetch","mcp__github__create_pr","mcp__github__list_prs","mcp__slack__post"],"removedNames":[]}));
        c.claude_attachment(&json!({"type":"deferred_tools_delta","addedNames":[],"removedNames":["mcp__slack__post"]}));
        c.claude_attachment(&json!({"type":"mcp_instructions_delta","addedNames":["github"],"addedBlocks":["## github\nUse for PRs."],"removedNames":[]}));
        c.claude_attachment(&json!({"type":"mcp_instructions_delta","addedNames":["claude.ai Gmail"],"addedBlocks":["Mail."],"removedNames":[]}));
        c.claude_attachment(&json!({"type":"deferred_tools_delta","addedNames":["mcp__claude_ai_Gmail__send"],"removedNames":[]}));
        c.claude_attachment(&json!({"type":"agent_listing_delta","addedTypes":["Explore"],"addedLines":["- Explore: search"],"removedTypes":[]}));
        c.call(CapabilityKind::Skill, "tdd", None, None);

        let t = c.finish(Some(40_000));
        let listed = t.listed.unwrap();
        let find = |kind, name: &str| listed.iter().find(|l| l.kind == kind && l.name == name).cloned();
        assert!(find(CapabilityKind::Skill, "grill").is_some());
        let github = find(CapabilityKind::Mcp, "github").unwrap();
        assert_eq!(github.tools, 2);
        assert!(github.tokens.unwrap() > estimate_tokens("## github\nUse for PRs."));
        // Its only tool was removed again, and it had no instructions.
        assert!(find(CapabilityKind::Mcp, "slack").is_none());
        // Instructions and tools of one server, under two spellings of its name.
        assert_eq!(find(CapabilityKind::Mcp, "claude_ai_Gmail").map(|s| s.tools), Some(1));
        assert!(find(CapabilityKind::Mcp, "claude.ai Gmail").is_none());
        assert!(find(CapabilityKind::Subagent, "Explore").is_some());
        assert_eq!(t.baseline_tokens, Some(40_000));
    }

    #[test]
    fn no_listing_means_unknown_not_empty() {
        let mut c = Collector::default();
        c.call_named("Bash", Some("t1"), false);
        assert!(c.finish(None).listed.is_none());
    }

    #[test]
    fn slash_commands_count_only_when_they_name_a_listed_skill() {
        let mut c = Collector::default();
        c.list_skill("init", 10, None);
        c.slash_command("init");
        c.slash_command("model");
        let t = c.finish(None);
        assert_eq!(t.calls.len(), 1);
        assert_eq!((t.calls[0].kind, t.calls[0].name.as_str()), (CapabilityKind::Skill, "init"));
    }

    #[test]
    fn errors_land_on_the_call_they_answer() {
        let mut c = Collector::default();
        c.call_named("mcp__github__create_pr", Some("a"), false);
        c.call_named("Bash", Some("b"), false);
        c.error("a");
        c.error("unknown");
        let t = c.finish(None);
        let gh = t.calls.iter().find(|c| c.name == "github").unwrap();
        assert_eq!((gh.calls, gh.errors, gh.tool.as_deref()), (1, 1, Some("create_pr")));
        assert_eq!(t.calls.iter().find(|c| c.name == "Bash").unwrap().errors, 0);
    }

    #[test]
    fn codex_skills_are_read_from_the_developer_block_and_matched_by_path() {
        let mut c = Collector::default();
        codex_skill_listing(
            &mut c,
            "<skills_instructions>\n## Skills\n### Available skills\n- imagegen: Make images. (file: /h/.codex/skills/imagegen/SKILL.md)\n- github:yeet: Publish. (file: /h/p/yeet/SKILL.md)\n### How to use skills\n- Discovery: The list above.\n</skills_instructions>",
        );
        c.skill_read(r#"["/bin/bash","-lc","sed -n '1,200p' /h/p/yeet/SKILL.md"]"#);
        c.skill_read("ls");
        let t = c.finish(None);
        let listed = t.listed.unwrap();
        assert_eq!(listed.len(), 2);
        assert_eq!(listed[0].path.as_deref(), Some("/h/p/yeet/SKILL.md"));
        assert_eq!(listed[0].name, "github:yeet");
        assert_eq!(t.calls.len(), 1);
        assert_eq!(t.calls[0].name, "github:yeet");
    }

    #[test]
    fn short_codex_skill_paths_are_expanded_from_the_roots_table() {
        let mut c = Collector::default();
        codex_skill_listing(
            &mut c,
            "<skills_instructions>\n### Skill roots\n- `r0` = `/h/.codex/skills`\n- `r2` = `/h/.codex/skills/.system`\n### Available skills\n- imagegen: Images. (file: r2/imagegen/SKILL.md)\n- mine: Mine. (file: r0/mine/SKILL.md)\n</skills_instructions>",
        );
        c.skill_read(r#"["/bin/bash","-lc","cat /h/.codex/skills/.system/imagegen/SKILL.md"]"#);
        let t = c.finish(None);
        let paths: Vec<_> = t.listed.unwrap().into_iter().map(|l| l.path.unwrap()).collect();
        assert_eq!(paths, ["/h/.codex/skills/.system/imagegen/SKILL.md", "/h/.codex/skills/mine/SKILL.md"]);
        assert_eq!(t.calls[0].name, "imagegen");
    }

    fn at(day: u32) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 9, day, 12, 0, 0).unwrap()
    }

    fn stored(day: u32, listed: Option<Vec<&str>>) -> StoredSession {
        StoredSession {
            tool: ToolKind::ClaudeCode,
            session_id: format!("s{day}"),
            started_at: at(day),
            requests: 3,
            data: SessionTools {
                baseline_tokens: Some(1),
                calls: vec![],
                listed: listed.map(|names| {
                    names
                        .into_iter()
                        .map(|n| Listed { kind: CapabilityKind::Skill, name: n.into(), tokens: Some(10), tools: 0, path: None })
                        .collect()
                }),
            },
        }
    }

    #[test]
    fn report_tracks_first_and_last_listing_and_what_is_still_installed() {
        let r = report(
            vec![stored(3, Some(vec!["a", "b"])), stored(1, Some(vec!["a"])), stored(4, None)],
            vec![],
            ToolKind::CodexCli,
        );
        assert_eq!(r.sessions.len(), 3);
        let a = r.listed.iter().find(|l| l.name == "a").unwrap();
        assert_eq!((a.first_listed, a.last_listed, a.sessions_listed, a.current), (at(1), at(3), 2, true));
        let b = r.listed.iter().find(|l| l.name == "b").unwrap();
        assert_eq!(b.first_listed, at(3));
        // Session 4 has no listing, so it doesn't make everything "removed".
        assert!(b.current);
    }

    #[test]
    fn a_skill_dropped_from_the_latest_listing_is_not_current() {
        let r = report(vec![stored(1, Some(vec!["a", "b"])), stored(2, Some(vec!["a"]))], vec![], ToolKind::CodexCli);
        assert!(!r.listed.iter().find(|l| l.name == "b").unwrap().current);
    }

    #[test]
    fn codex_config_servers_skip_disabled_ones_and_sub_tables() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("config.toml"),
            "model = \"gpt\"\n[mcp_servers.github]\ncommand = \"x\"\n[mcp_servers.github.env]\nTOKEN = \"t\"\n[mcp_servers.\"old.server\"]\nenabled = false\n[mcp_servers.memory]\nenabled = true\n[profiles.fast]\n",
        )
        .unwrap();
        let names: Vec<String> = codex_mcp_servers(dir.path()).into_iter().map(|l| l.name).collect();
        assert_eq!(names, ["github", "memory"]);
        assert!(codex_mcp_servers(&dir.path().join("missing")).is_empty());
    }
}
