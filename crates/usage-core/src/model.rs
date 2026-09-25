use crate::tool_usage::SessionTools;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::str::FromStr;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
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
    /// Cache-write tokens at the 5-minute TTL tier. Split out because the two
    /// tiers are priced 1.6x apart and real transcripts are a ~22/78 mix.
    pub cache_write_5m: u64,
    /// Cache-write tokens at the 1-hour TTL tier.
    pub cache_write_1h: u64,
    pub cache_read_tokens: u64,
    /// Largest prompt any single request in this session carried. This is the
    /// only meaningful "how full was the context" number at session level —
    /// summing per-request tokens measures cumulative traffic, not occupancy.
    pub peak_context_tokens: u64,
    /// Model that carried the peak request. The ceiling to judge a session
    /// against is *that* model's window — `model` (the session's first turn)
    /// is often a throwaway Haiku title call with a 200K window, which would
    /// make a 1M-window session read as five times fuller than it is.
    pub peak_context_model: Option<String>,
    /// Number of `compact_boundary` events in the transcript.
    pub compaction_count: u32,
    pub message_count: u32,
    /// Pre-computed cost in USD, accumulated by summing per-request costs
    /// during JSONL parsing so that each request uses its own model's rate.
    /// Falls back to 0.0 for sessions parsed by sources that don't support
    /// per-request cost accumulation.
    #[serde(default)]
    pub cost_usd: f64,
    /// What the session had loaded and what it called. Cached with the row
    /// but not sent with the session list — the Tools page reads it through
    /// its own command, aggregated.
    #[serde(skip)]
    pub tools: SessionTools,
}

impl Session {
    pub fn total_tokens(&self) -> u64 {
        self.input_tokens + self.output_tokens + self.cache_creation_tokens + self.cache_read_tokens
    }

    /// Returns the pre-computed per-request cost when available, otherwise
    /// falls back to a single-rate estimate from the aggregate token counts.
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
    StopSequence,
    Refusal,
    Other,
}

impl StopReason {
    /// Parse from the raw string that appears in the JSONL file.
    pub fn from_str_loose(s: &str) -> Self {
        match s {
            "end_turn"      => Self::EndTurn,
            "tool_use"      => Self::ToolUse,
            "max_tokens"    => Self::MaxTokens,
            "stop_sequence" => Self::StopSequence,
            "refusal"       => Self::Refusal,
            _               => Self::Other,
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
    /// Cache-write tokens at the 5-minute TTL tier (from usage.cache_creation.ephemeral_5m_input_tokens).
    /// Falls back to cache_creation_input_tokens when the sub-field is absent.
    pub cache_write_5m: u64,
    /// Cache-write tokens at the 1-hour TTL tier (from usage.cache_creation.ephemeral_1h_input_tokens).
    pub cache_write_1h: u64,
    pub cache_read_tokens: u64,
    /// Estimated cost in USD for this single request, or `None` when the
    /// model has no known rate. `None` means "unknown", not "free" — the UI
    /// must not render it as $0.
    pub cost_usd: Option<f64>,
    pub stop_reason: StopReason,
    /// 1-based line of this request in the transcript file, so the UI can
    /// point at it instead of guessing.
    pub transcript_line: u32,
    /// Reasoning effort the request ran at ("low".."max"), straight from the
    /// transcript's top-level `effort`. `None` when the field is absent, which
    /// it is on older records. Passed through as a string rather than an enum
    /// so a new effort level doesn't need a backend release.
    pub effort: Option<String>,
}

// ---------------------------------------------------------------------------
// Compaction
// ---------------------------------------------------------------------------

/// A context compaction, read straight from the transcript's
/// `type: "system", subtype: "compact_boundary"` record. Claude Code logs the
/// event explicitly with its own before/after token counts — there is no need
/// to infer one from a drop in the context curve.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Compaction {
    /// Index of the last request before the boundary, so the chart can split
    /// its curve there.
    pub before_index: u32,
    pub timestamp: String,
    /// `"auto"` when Claude Code compacted on its own, `"manual"` for /compact.
    pub trigger: String,
    /// Context size just before compaction, per `compactMetadata.preTokens`.
    pub pre_tokens: u64,
    /// Context size just after, per `compactMetadata.postTokens`.
    pub post_tokens: u64,
}

/// Everything the session-detail view needs from one transcript.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionDetail {
    pub requests: Vec<SessionRequest>,
    pub compactions: Vec<Compaction>,
    /// Absolute path of the `.jsonl` this was read from, so the UI can open it.
    pub transcript_path: Option<String>,
}
