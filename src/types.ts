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
  cache_read_tokens: number;
  message_count: number;
}

// --- Dashboard / filter state types ---

export type Measure = "tokens" | "requests" | "cost";
export type Granularity = "hour" | "day" | "week";
export type StackBy = "model" | "tokenkind" | "project" | "skill";
export type StopReason = "end_turn" | "tool_use" | "max_tokens" | "refusal";
export type Effort = "medium" | "high" | "xhigh";
export type TokenKind = "input" | "output" | "cache_write_5m" | "cache_write_1h" | "cache_read";

// --- Session detail types ---

/** Raw shape returned by the `get_session_requests` Tauri command (snake_case from serde). */
export interface SessionRequest {
  index: number;
  timestamp: string;
  model: string;
  context_tokens: number;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  cost_usd: number;
  stop_reason: StopReason;
}

/** Normalised shape used throughout the UI (camelCase). */
export interface Request {
  index: number;
  timestamp: string;
  model: string;
  /** Cumulative context tokens at this turn — used for the timeline chart. */
  contextTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
  costUsd: number;
  stopReason: StopReason;
  /** Effort and skill are not available from the backend yet. */
  effort: Effort;
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
    cacheWrite5m: 0,          // not separately tracked by the JSONL format
    cacheWrite1h: r.cache_creation_tokens,
    cacheRead: r.cache_read_tokens,
    costUsd: r.cost_usd,
    stopReason: r.stop_reason,
    effort: "medium",          // not available from backend
    skill: null,               // not available from backend
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
