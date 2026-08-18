use crate::model::{Session, ToolKind};
use crate::source::UsageSource;
use anyhow::Result;

#[derive(Default)]
pub struct CodexCliSource;

impl CodexCliSource {
    pub fn new() -> Self {
        Self
    }
}

impl UsageSource for CodexCliSource {
    fn tool(&self) -> ToolKind {
        ToolKind::CodexCli
    }

    fn scan(&self) -> Result<Vec<Session>> {
        // ponytail: stub. Real data lives in ~/.codex/session_index.jsonl plus
        // per-session files under ~/.codex/sessions/ — implement by parsing
        // the index for session metadata and the session files for token usage.
        Ok(Vec::new())
    }
}
