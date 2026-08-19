use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::str::FromStr;

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
}

impl FromStr for ToolKind {
    type Err = std::convert::Infallible;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Ok(match s {
            "cursor" => ToolKind::Cursor,
            "gemini_cli" => ToolKind::GeminiCli,
            "codex_cli" => ToolKind::CodexCli,
            _ => ToolKind::ClaudeCode,
        })
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

// ---------------------------------------------------------------------------
// SessionRequest — one assistant turn inside a session
// ---------------------------------------------------------------------------

/// Stop reason for a single API request.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StopReason {
    EndTurn,
    ToolUse,
    MaxTokens,
    Other,
}

impl StopReason {
    /// Parse from the raw string that appears in the JSONL file.
    pub fn from_str_loose(s: &str) -> Self {
        match s {
            "end_turn"   => Self::EndTurn,
            "tool_use"   => Self::ToolUse,
            "max_tokens" => Self::MaxTokens,
            _            => Self::Other,
        }
    }
}

/// Per-request detail for one assistant turn.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionRequest {
    /// 0-based position within the session
    pub index: u32,
    /// ISO-8601 timestamp of the assistant message (falls back to session start)
    pub timestamp: String,
    /// Model name (e.g. "claude-opus-5")
    pub model: String,
    /// Cumulative context tokens at this turn (input + cache_read), used for
    /// the context-usage timeline chart
    pub context_tokens: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_creation_tokens: u64,
    pub cache_read_tokens: u64,
    /// Estimated cost in USD for this single request
    pub cost_usd: f64,
    pub stop_reason: StopReason,
}
