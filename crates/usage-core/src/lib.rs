pub mod db;
pub mod model;
pub mod paths;
pub mod plan;
pub mod pricing;
pub mod sample;
pub mod source;
pub mod sources;
pub mod tool_usage;
pub mod watcher;

pub use db::Db;
pub use model::{Compaction, Session, SessionDetail, SessionRequest, ToolKind};
pub use source::UsageSource;

use anyhow::Result;
use std::path::PathBuf;

/// Where each implemented source reads its logs from.
///
/// The defaults are the tools' own directories under the real home. The app
/// swaps in folders the user granted access to (the sandboxed build can read
/// nothing else), or the generated sample-data tree.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Roots {
    pub claude_code: Option<PathBuf>,
    pub codex_cli: Option<PathBuf>,
}

impl Roots {
    pub fn default_locations() -> Self {
        Self {
            claude_code: sources::claude_code::default_root(),
            codex_cli: sources::codex_cli::default_root(),
        }
    }

    /// Every configured root, for the file watcher.
    pub fn paths(&self) -> Vec<PathBuf> {
        [&self.claude_code, &self.codex_cli].into_iter().flatten().cloned().collect()
    }
}

pub fn all_sources(roots: &Roots) -> Vec<Box<dyn UsageSource>> {
    let mut sources: Vec<Box<dyn UsageSource>> = Vec::new();
    if let Some(root) = &roots.claude_code {
        sources.push(Box::new(sources::claude_code::ClaudeCodeSource::with_root(root.clone())));
    }
    sources.push(Box::new(sources::cursor::CursorSource::new()));
    sources.push(Box::new(sources::gemini_cli::GeminiCliSource::new()));
    if let Some(root) = &roots.codex_cli {
        sources.push(Box::new(sources::codex_cli::CodexCliSource::with_root(root.clone())));
    }
    sources
}

/// Per-request detail for one session, whichever tool wrote it.
///
/// The command carries only a session id, so the sources are tried in turn.
/// Ids are uuids, so the first non-empty answer is the right one.
pub fn get_session_detail(roots: &Roots, session_id: &str) -> Result<SessionDetail> {
    if let Some(root) = &roots.claude_code {
        let detail = sources::claude_code::get_session_detail(root, session_id)?;
        if !detail.requests.is_empty() {
            return Ok(detail);
        }
    }
    match &roots.codex_cli {
        Some(root) => sources::codex_cli::get_session_detail(root, session_id),
        None => Ok(SessionDetail { requests: vec![], compactions: vec![], transcript_path: None }),
    }
}

/// Scan every source. A source that fails (an unreadable directory, say) is
/// skipped rather than failing the whole scan, so one bad root can't blank
/// out the data the others found.
pub fn scan_all(roots: &Roots) -> Result<Vec<Session>> {
    let mut sessions = Vec::new();
    for source in all_sources(roots) {
        match source.scan() {
            Ok(found) => sessions.extend(found),
            Err(e) => eprintln!("scan of {} failed: {e:#}", source.tool().as_str()),
        }
    }
    Ok(sessions)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scan_all_skips_a_failing_source() {
        let dir = tempfile::tempdir().unwrap();
        // A file where a directory is expected: `is_dir` is false, so the
        // source reports nothing, and a missing root does the same.
        let not_a_dir = dir.path().join("file");
        std::fs::write(&not_a_dir, "x").unwrap();
        let roots = Roots {
            claude_code: Some(not_a_dir),
            codex_cli: Some(dir.path().join("missing")),
        };
        assert!(scan_all(&roots).unwrap().is_empty());
    }
}
