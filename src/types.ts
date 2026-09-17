export type ToolKind = "claude_code" | "cursor" | "gemini_cli" | "codex_cli";

export const TOOL_LABELS: Record<ToolKind, string> = {
  claude_code: "Claude Code",
  cursor: "Cursor",
  gemini_cli: "Gemini CLI",
  codex_cli: "Codex CLI",
};

export interface Session {
  tool: ToolKind;
  session_id: string;
  project: string;
  started_at: string;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  /** Cache-write tokens at the 5-minute TTL tier (priced at input x1.25). */
  cache_write_5m: number;
  /** Cache-write tokens at the 1-hour TTL tier (priced at input x2). */
  cache_write_1h: number;
  cache_read_tokens: number;
  /** Largest prompt any single request in this session carried. */
  peak_context_tokens: number;
  /**
   * Model that carried the peak request — the one whose context window this
   * session should be judged against. `model` is the session's *first* turn,
   * which is often a throwaway Haiku title call.
   */
  peak_context_model: string | null;
  /** Number of compact_boundary events in the transcript. */
  compaction_count: number;
  message_count: number;
  /**
   * Pre-computed cost in USD, accumulated per-request by the Rust backend so
   * each turn uses its own model's rate. Older / non-Claude sessions where the
   * backend hasn't computed this will have 0; consumers should fall back to
   * `estimatedCostUsd()` in that case.
   */
  cost_usd: number;
}

// --- Dashboard / filter state types ---

export type Measure = "tokens" | "requests" | "cost";
export type Granularity = "hour" | "day" | "week";
export type StackBy = "model" | "tokenkind" | "project" | "skill";
export type StopReason =
  | "end_turn"
  | "tool_use"
  | "max_tokens"
  | "stop_sequence"
  | "refusal"
  | "other";
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export type TokenKind = "input" | "output" | "cache_write_5m" | "cache_write_1h" | "cache_read";

// --- Session detail types ---

/** Raw shape returned inside `get_session_detail` (snake_case from serde). */
export interface SessionRequest {
  index: number;
  timestamp: string;
  model: string;
  context_tokens: number;
  input_tokens: number;
  output_tokens: number;
  /** 5-minute cache-write tier tokens (from usage.cache_creation.ephemeral_5m_input_tokens) */
  cache_write_5m: number;
  /** 1-hour cache-write tier tokens (from usage.cache_creation.ephemeral_1h_input_tokens) */
  cache_write_1h: number;
  cache_read_tokens: number;
  /** null when the model has no known rate — "unknown", not "free". */
  cost_usd: number | null;
  stop_reason: StopReason;
  /** 1-based line of this request in the transcript file. */
  transcript_line: number;
  /** Reasoning effort, or null on records that predate the field. */
  effort: Effort | null;
}

/** A compact_boundary event, as logged by Claude Code. */
export interface Compaction {
  /** Index of the last request before the boundary. */
  before_index: number;
  timestamp: string;
  /** "auto" when Claude Code compacted on its own, "manual" for /compact. */
  trigger: "auto" | "manual";
  pre_tokens: number;
  post_tokens: number;
}

/** Raw shape returned by the `get_session_detail` Tauri command. */
export interface SessionDetailPayload {
  requests: SessionRequest[];
  compactions: Compaction[];
  /** Absolute path of the transcript .jsonl, or null if it was not found. */
  transcript_path: string | null;
}

/** Normalised shape used throughout the UI (camelCase). */
export interface Request {
  index: number;
  timestamp: string;
  model: string;
  /** Full prompt size this request carried (input + cache writes + cache read). */
  contextTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
  /** null when the model has no known rate — render as "—", not "$0.00". */
  costUsd: number | null;
  stopReason: StopReason;
  /** 1-based line of this request in the transcript file. */
  transcriptLine: number;
  /** null on records that predate the transcript's `effort` field. */
  effort: Effort | null;
  /** TODO: needs backend — per-request skill attribution. */
  skill: string | null;
}

/** Map a raw `SessionRequest` from the backend to the UI `Request` shape. */
export function toRequest(r: SessionRequest): Request {
  return {
    index: r.index,
    timestamp: r.timestamp,
    model: r.model,
    contextTokens: r.context_tokens,
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    cacheWrite5m: r.cache_write_5m,
    cacheWrite1h: r.cache_write_1h,
    cacheRead: r.cache_read_tokens,
    costUsd: r.cost_usd,
    stopReason: r.stop_reason,
    transcriptLine: r.transcript_line,
    effort: r.effort,
    skill: null,
  };
}

// --- Settings types ---

export interface NotificationSettings {
  contextAlerts: boolean;
  dailyDigest: boolean;
  budgetWarnings: boolean;
}

export interface AppSettings {
  monthlyPlanPrice: number;
  monthlyBudget: number;
  contextAlertThreshold: number;
  notifications: NotificationSettings;
  logsDirectory: string;
}

// --- Aggregation / charting types ---

export interface DateRange {
  start: string; // ISO date string
  end: string;   // ISO date string
}

export interface BucketData {
  label: string;
  total: number;
  values: Record<string, number>; // keyed by dim key
}

export interface Dimension {
  key: string;
  name: string;
  color: string;
}

export interface BreakdownRow {
  name: string;
  requests: number;
  tokens: number;
  cost: number;
  share: number; // 0–1 fraction of total
}

export interface DayBucket {
  date: string; // ISO date string
  label: string;
  tokens: number;
  requests: number;
  cost: number;
  byModel: Record<string, number>;
  byTokenKind: Record<TokenKind, number>;
  byProject: Record<string, number>;
  bySkill: Record<string, number>;
}

export interface WeekBucket {
  isoWeek: string; // e.g. "2024-W12"
  label: string;
  tokens: number;
  requests: number;
  cost: number;
  byModel: Record<string, number>;
  byTokenKind: Record<TokenKind, number>;
  byProject: Record<string, number>;
  bySkill: Record<string, number>;
}

export interface HourBucket {
  hour: number; // 0–23
  label: string;
  tokens: number;
  requests: number;
  cost: number;
  byModel: Record<string, number>;
  byTokenKind: Record<TokenKind, number>;
  byProject: Record<string, number>;
  bySkill: Record<string, number>;
}

// --- Insights types ---

export interface ContextHealthRow {
  sessionId: string;
  sessionName: string;
  contextPct: number; // 0–100
  tokens: number;
}

export interface SkillRow {
  skill: string;
  requests: number;
}
