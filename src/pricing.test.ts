import { describe, it, expect } from "vitest";
import { rateFor, contextWindow, estimatedCostUsd, isModelPriced } from "./pricing";
import type { Session } from "./types";

// A Codex session as the backend stores it: cost_usd is 0 because the Rust
// pricing table is Anthropic-only, so the rate has to come from the front end.
const codexSession: Session = {
  tool: "codex_cli",
  session_id: "01a017d3-fa04-7b32-9144-2f7c3d2245a7",
  project: "/Users/test/proj",
  started_at: "2026-08-19T02:22:43.408Z",
  model: "gpt-5.6-terra",
  input_tokens: 1_000_000,
  output_tokens: 1_000_000,
  cache_creation_tokens: 1_000_000,
  cache_write_5m: 1_000_000,
  cache_write_1h: 0,
  cache_read_tokens: 1_000_000,
  peak_context_tokens: 113_986,
  peak_context_model: "gpt-5.6-terra",
  compaction_count: 0,
  message_count: 45,
  cost_usd: 0,
};

describe("non-Anthropic pricing", () => {
  it("prices documented Codex models from the first-party table", () => {
    expect(rateFor("gpt-5.6-terra")).toEqual({
      inputPerMtok: 2,
      outputPerMtok: 12,
      cacheWrite5mPerMtok: 2.5,
      cacheWrite1hPerMtok: 2.5, // no 1h tier upstream — falls back, never 0
      cacheReadPerMtok: 0.2,
    });
  });

  it("prices every model observed in Codex records at its documented rate", () => {
    expect(rateFor("gpt-5.6-sol")).toMatchObject({
      inputPerMtok: 4,
      outputPerMtok: 20,
      cacheWrite5mPerMtok: 5,
      cacheWrite1hPerMtok: 5,
      cacheReadPerMtok: 0.4,
    });
    expect(rateFor("gpt-6-astra")).toMatchObject({
      inputPerMtok: 10,
      outputPerMtok: 50,
      cacheWrite5mPerMtok: 12.5,
      cacheWrite1hPerMtok: 12.5,
      cacheReadPerMtok: 1,
    });
    expect(rateFor("codex-auto-review")).toMatchObject({
      inputPerMtok: 2.5,
      outputPerMtok: 15,
      cacheReadPerMtok: 0.25,
    });
    expect(rateFor("gemma-4")).toEqual({
      inputPerMtok: 0,
      outputPerMtok: 0,
      cacheWrite5mPerMtok: 0,
      cacheWrite1hPerMtok: 0,
      cacheReadPerMtok: 0,
    });
    for (const model of ["gpt-5.5", "gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol", "gpt-6-astra", "codex-auto-review", "gemma-4"]) {
      expect(isModelPriced(model)).toBe(true);
    }
  });

  it("estimates a Codex session's cost instead of reporting $0", () => {
    // 1M of each tier: input 2 + output 12 + cache write (1h fallback) 2.5 + read 0.2
    expect(estimatedCostUsd(codexSession)).toBeCloseTo(16.7, 10);
  });

  it("measures gpt context against Codex's window, not Claude's 200K", () => {
    expect(contextWindow("gpt-5.6-terra")).toBe(258_400);
    expect(contextWindow("claude-sonnet-4-5")).toBe(200_000);
  });
});

describe("newest Claude generations", () => {
  it("prices Opus 5.5 at $4/$20 with a $0.20 cache read", () => {
    for (const id of ["claude-opus-5-5", "claude-opus-5.5", "anthropic/claude-opus-5.5"]) {
      expect(rateFor(id)).toEqual({
        inputPerMtok: 4,
        outputPerMtok: 20,
        cacheWrite5mPerMtok: 5,
        cacheWrite1hPerMtok: 8,
        cacheReadPerMtok: 0.2,
      });
    }
  });

  it("prices Fable 5.1 cache reads at $0.25, not the 0.1x rule", () => {
    expect(rateFor("claude-fable-5-1")).toMatchObject({ inputPerMtok: 10, outputPerMtok: 50, cacheReadPerMtok: 0.25 });
    expect(rateFor("claude-fable-5")?.cacheReadPerMtok).toBe(1);
    expect(rateFor("claude-opus-5")?.cacheReadPerMtok).toBe(0.5);
  });

  it("gives both a 1M context window", () => {
    expect(contextWindow("claude-opus-5-5")).toBe(1_000_000);
    expect(contextWindow("claude-fable-5-1")).toBe(1_000_000);
  });
});
