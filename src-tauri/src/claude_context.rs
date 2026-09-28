//! A live, project-specific snapshot from Claude Code's built-in `/context` command.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

#[derive(Debug, Serialize)]
pub struct ContextSnapshot {
    pub model: Option<String>,
    pub tokens: Option<String>,
    pub sections: Vec<ContextSection>,
    /// Keep Claude's original text so a changed layout never discards data.
    pub raw: String,
    pub structured: bool,
}

#[derive(Debug, Serialize)]
pub struct ContextSection {
    pub title: String,
    pub columns: Vec<String>,
    pub rows: Vec<Vec<String>>,
}

#[derive(Deserialize)]
struct PrintResult {
    result: String,
    num_turns: u32,
    total_cost_usd: f64,
    usage: PrintUsage,
}

#[derive(Deserialize)]
struct PrintUsage {
    input_tokens: u64,
    output_tokens: u64,
    cache_creation_input_tokens: u64,
    cache_read_input_tokens: u64,
}

/// The app bundle may not inherit the user's shell PATH on macOS.
fn run_claude(project: &Path) -> Result<Output, String> {
    let mut candidates = vec![PathBuf::from("claude")];
    if let Some(home) = usage_core::paths::real_home_dir() {
        candidates.push(home.join(".local/bin/claude"));
    }
    let mut last_error = None;
    for binary in candidates {
        match Command::new(&binary)
            .args([
                "-p",
                "--no-session-persistence",
                "--max-budget-usd",
                "0.000001",
                "--output-format",
                "json",
                "/context",
            ])
            .current_dir(project)
            .output()
        {
            Ok(output) => return Ok(output),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => last_error = Some(error),
            Err(error) => return Err(format!("Could not start Claude Code: {error}")),
        }
    }
    Err(format!(
        "Claude Code CLI was not found: {}",
        last_error.unwrap()
    ))
}

pub fn snapshot(project: &Path) -> Result<ContextSnapshot, String> {
    if !project.is_dir() {
        return Err("This project's folder is no longer available".into());
    }
    let output = run_claude(project)?;
    if !output.status.success() {
        return Err(format!(
            "Claude Code /context failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    let printed: PrintResult = serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("Could not read Claude Code /context output: {error}"))?;
    if printed.num_turns != 0
        || printed.total_cost_usd != 0.0
        || printed.usage.input_tokens != 0
        || printed.usage.output_tokens != 0
        || printed.usage.cache_creation_input_tokens != 0
        || printed.usage.cache_read_input_tokens != 0
    {
        return Err(
            "Claude Code /context unexpectedly used model tokens; its result was not displayed"
                .into(),
        );
    }
    if printed.result.trim().is_empty() {
        return Err("Claude Code /context returned no information".into());
    }
    Ok(parse_context(&printed.result))
}

fn parse_context(text: &str) -> ContextSnapshot {
    let mut model = None;
    let mut tokens = None;
    let mut sections: Vec<ContextSection> = Vec::new();
    for line in text.lines().map(str::trim) {
        if let Some(value) = line.strip_prefix("**Model:**") {
            model = Some(value.trim().to_string());
        } else if let Some(value) = line.strip_prefix("**Tokens:**") {
            tokens = Some(value.trim().to_string());
        } else if let Some(title) = line.strip_prefix("### ") {
            sections.push(ContextSection {
                title: title.to_string(),
                columns: Vec::new(),
                rows: Vec::new(),
            });
        } else if line.starts_with('|') && line.ends_with('|') {
            let Some(section) = sections.last_mut() else {
                continue;
            };
            let cells: Vec<String> = line[1..line.len() - 1]
                .split('|')
                .map(|cell| cell.trim().to_string())
                .collect();
            if cells
                .iter()
                .all(|cell| cell.chars().all(|ch| ch == '-' || ch == ':'))
            {
                continue;
            }
            if section.columns.is_empty() {
                section.columns = cells;
            } else if cells.len() == section.columns.len() {
                section.rows.push(cells);
            }
        }
    }
    sections.retain(|section| !section.columns.is_empty());
    let structured = model.is_some() && tokens.is_some() && !sections.is_empty();
    ContextSnapshot {
        model,
        tokens,
        sections,
        raw: text.to_string(),
        structured,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_context_summary_and_tool_breakdown() {
        let output = "## Context Usage\n\n**Model:** claude-opus-5-5  \n**Tokens:** 22.6k / 1m (2%)\n\n### Estimated usage by category\n\n| Category | Tokens | Percentage |\n|----------|--------|------------|\n| System tools | 10.4k | 1.0% |\n\n### MCP Tools\n\n| Tool | Server | Tokens |\n|------|--------|--------|\n| mcp__example__search | example | 1.4k |\n";
        let parsed = parse_context(output);
        assert!(parsed.structured);
        assert_eq!(parsed.model.as_deref(), Some("claude-opus-5-5"));
        assert_eq!(parsed.tokens.as_deref(), Some("22.6k / 1m (2%)"));
        assert_eq!(
            parsed.sections[0].rows[0],
            ["System tools", "10.4k", "1.0%"]
        );
        assert_eq!(
            parsed.sections[1].rows[0],
            ["mcp__example__search", "example", "1.4k"]
        );
    }

    #[test]
    fn preserves_raw_output_when_claude_changes_format() {
        let output = "Context now: 22k tokens\nTools:\n- search: 1k";
        let parsed = parse_context(output);
        assert!(!parsed.structured);
        assert_eq!(parsed.raw, output);
        assert_eq!(parsed.model, None);
        assert_eq!(parsed.tokens, None);
    }
}
