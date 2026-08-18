use crate::model::{Session, ToolKind};
use crate::source::UsageSource;
use anyhow::Result;

#[derive(Default)]
pub struct CursorSource;

impl CursorSource {
    pub fn new() -> Self {
        Self
    }
}

impl UsageSource for CursorSource {
    fn tool(&self) -> ToolKind {
        ToolKind::Cursor
    }

    fn scan(&self) -> Result<Vec<Session>> {
        // ponytail: stub. Real data lives in the SQLite DB at
        // ~/.cursor/ai-tracking/ai-code-tracking.db — implement by opening it
        // read-only with rusqlite and mapping its rows onto Session.
        Ok(Vec::new())
    }
}
