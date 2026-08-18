use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolKind {
    ClaudeCode,
    Cursor,
    GeminiCli,
    CodexCli,
}

impl ToolKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            ToolKind::ClaudeCode => "claude_code",
            ToolKind::Cursor => "cursor",
            ToolKind::GeminiCli => "gemini_cli",
            ToolKind::CodexCli => "codex_cli",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "cursor" => ToolKind::Cursor,
            "gemini_cli" => ToolKind::GeminiCli,
            "codex_cli" => ToolKind::CodexCli,
            _ => ToolKind::ClaudeCode,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub tool: ToolKind,
    pub session_id: String,
    pub project: String,
    pub started_at: DateTime<Utc>,
    pub model: Option<String>,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_creation_tokens: u64,
    pub cache_read_tokens: u64,
    pub message_count: u32,
}

impl Session {
    pub fn total_tokens(&self) -> u64 {
        self.input_tokens + self.output_tokens + self.cache_creation_tokens + self.cache_read_tokens
    }

    pub fn estimated_cost_usd(&self) -> f64 {
        crate::pricing::estimate_cost(self)
    }
}
