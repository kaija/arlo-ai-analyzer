use crate::model::{Session, ToolKind};
use crate::source::UsageSource;
use anyhow::Result;

#[derive(Default)]
pub struct GeminiCliSource;

impl GeminiCliSource {
    pub fn new() -> Self {
        Self
    }
}

impl UsageSource for GeminiCliSource {
    fn tool(&self) -> ToolKind {
        ToolKind::GeminiCli
    }

    fn scan(&self) -> Result<Vec<Session>> {
        // ponytail: stub. Real data lives under ~/.gemini/history/<project>/ —
        // implement by walking that tree the same way claude_code.rs walks
        // ~/.claude/projects, once the per-project file format is confirmed.
        Ok(Vec::new())
    }
}
