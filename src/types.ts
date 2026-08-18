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
