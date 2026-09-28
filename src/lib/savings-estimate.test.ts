import { describe, expect, it } from "vitest";
import type { Session } from "../types";
import { estimateInputSavingsRate } from "./savings-estimate";

function session(overrides: Partial<Session>): Session {
  return {
    tool: "claude_code", session_id: "a", project: "/project",
    started_at: "2026-09-27T00:00:00Z", model: "claude-haiku-4-5",
    peak_context_model: "claude-opus-5-5", input_tokens: 1_000_000,
    output_tokens: 0, cache_creation_tokens: 0, cache_write_5m: 0,
    cache_write_1h: 0, cache_read_tokens: 1_000_000,
    peak_context_tokens: 0, compaction_count: 0, message_count: 10, cost_usd: 0,
    ...overrides,
  };
}

describe("estimateInputSavingsRate", () => {
  it("uses the busiest model and its observed input/cache mix", () => {
    const sessions = [
      session({ session_id: "opus" }),
      session({ session_id: "sonnet", peak_context_model: "claude-sonnet-4-5", message_count: 2 }),
      session({ session_id: "old", started_at: "2026-01-01T00:00:00Z", peak_context_model: "claude-sonnet-4-5", message_count: 100 }),
    ];
    expect(estimateInputSavingsRate(sessions, "claude_code", 30, new Date("2026-09-28T00:00:00Z")))
      .toEqual({ model: "claude-opus-5-5", usdPerMillion: 2.1 });
  });

  it("prices cache writes and reads at their separate rates", () => {
    expect(estimateInputSavingsRate([
      session({ cache_creation_tokens: 2_000_000, cache_write_5m: 1_000_000, cache_write_1h: 1_000_000 }),
    ], "claude_code", null, new Date("2026-09-28T00:00:00Z")))
      .toEqual({ model: "claude-opus-5-5", usdPerMillion: 4.3 });
  });

  it("omits money when there is no observed input/cache mix", () => {
    expect(estimateInputSavingsRate([
      session({ input_tokens: 0, cache_read_tokens: 0 }),
    ], "claude_code", null, new Date("2026-09-28T00:00:00Z")))
      .toBeNull();
  });

  it("omits money when the dominant model has no known price", () => {
    expect(estimateInputSavingsRate([
      session({ peak_context_model: "unknown-model" }),
    ], "claude_code", null, new Date("2026-09-28T00:00:00Z"))).toBeNull();
  });
});
