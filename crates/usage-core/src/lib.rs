pub mod db;
pub mod model;
pub mod pricing;
pub mod source;
pub mod sources;
pub mod watcher;

pub use db::Db;
pub use model::{Compaction, Session, SessionDetail, SessionRequest, ToolKind};
pub use source::UsageSource;

use anyhow::Result;

pub fn all_sources() -> Vec<Box<dyn UsageSource>> {
    vec![
        Box::new(sources::claude_code::ClaudeCodeSource::new()),
        Box::new(sources::cursor::CursorSource::new()),
        Box::new(sources::gemini_cli::GeminiCliSource::new()),
        Box::new(sources::codex_cli::CodexCliSource::new()),
    ]
}

/// Per-request detail for one session, whichever tool wrote it.
///
/// The command carries only a session id, so the sources are tried in turn.
/// Ids are uuids, so the first non-empty answer is the right one.
pub fn get_session_detail(session_id: &str) -> Result<SessionDetail> {
    let detail = sources::claude_code::get_session_detail(session_id)?;
    if !detail.requests.is_empty() {
        return Ok(detail);
    }
    sources::codex_cli::get_session_detail(session_id)
}

pub fn scan_all() -> Result<Vec<Session>> {
    let mut sessions = Vec::new();
    for source in all_sources() {
        sessions.extend(source.scan()?);
    }
    Ok(sessions)
}
