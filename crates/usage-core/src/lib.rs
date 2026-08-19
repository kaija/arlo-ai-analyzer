pub mod db;
pub mod model;
pub mod pricing;
pub mod source;
pub mod sources;
pub mod watcher;

pub use db::Db;
pub use model::{Session, SessionRequest, ToolKind};
pub use source::UsageSource;
pub use sources::claude_code::get_session_requests;

use anyhow::Result;

pub fn all_sources() -> Vec<Box<dyn UsageSource>> {
    vec![
        Box::new(sources::claude_code::ClaudeCodeSource::new()),
        Box::new(sources::cursor::CursorSource::new()),
        Box::new(sources::gemini_cli::GeminiCliSource::new()),
        Box::new(sources::codex_cli::CodexCliSource::new()),
    ]
}

pub fn scan_all() -> Result<Vec<Session>> {
    let mut sessions = Vec::new();
    for source in all_sources() {
        sessions.extend(source.scan()?);
    }
    Ok(sessions)
}
