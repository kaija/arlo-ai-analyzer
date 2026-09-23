import { afterEach, describe, expect, it } from "vitest";
import {
  FREE_PRICE,
  KEY_CUSTOM_PRICES,
  installCustomPrices,
  readCustomPrices,
  writeCustomPrices,
} from "./custom-pricing";
import { estimatedCostUsd, isModelPriced, rateFor, resolveRate } from "../pricing";
import type { Session } from "../types";

const LOCAL = "/home/kaija/data/model/Qwen3.6-35B-A3B/Qwen3.6-35B-A3B-UD-Q4_K_M.gguf";

function session(model: string): Session {
  return {
    tool: "claude_code",
    session_id: "s1",
    project: "/p",
    started_at: "2026-09-23T00:00:00Z",
    model,
    input_tokens: 1_000_000,
    output_tokens: 1_000_000,
    cache_creation_tokens: 1_000_000,
    cache_write_5m: 0,
    cache_write_1h: 1_000_000,
    cache_read_tokens: 1_000_000,
    peak_context_tokens: 0,
    peak_context_model: model,
    compaction_count: 0,
    message_count: 1,
    cost_usd: 0,
  };
}

describe("custom model prices", () => {
  afterEach(() => {
    installCustomPrices({});
    localStorage.removeItem(KEY_CUSTOM_PRICES);
  });

  it("prices a model nothing else knows", () => {
    expect(isModelPriced("qwen3.6-35b-a3b-gmi-ray")).toBe(false);
    installCustomPrices({
      "qwen3.6-35b-a3b-gmi-ray": { inputPerMtok: 0.2, outputPerMtok: 1, cacheReadPerMtok: 0.02, cacheWritePerMtok: 0 },
    });
    expect(resolveRate("qwen3.6-35b-a3b-gmi-ray")).toEqual({
      source: "custom",
      rate: {
        inputPerMtok: 0.2,
        outputPerMtok: 1,
        cacheWrite5mPerMtok: 0,
        cacheWrite1hPerMtok: 0,
        cacheReadPerMtok: 0.02,
      },
    });
    expect(estimatedCostUsd(session("qwen3.6-35b-a3b-gmi-ray"))).toBeCloseTo(1.22);
  });

  it("matches the logged id case-insensitively, file paths included", () => {
    installCustomPrices({ [LOCAL.toLowerCase()]: FREE_PRICE });
    expect(isModelPriced(LOCAL)).toBe(true);
    expect(resolveRate(LOCAL)?.source).toBe("custom");
    expect(estimatedCostUsd(session(LOCAL))).toBe(0);
  });

  it("wins over every other source for the model it names", () => {
    installCustomPrices({ "gpt-5.6-terra": { ...FREE_PRICE, inputPerMtok: 1 } });
    expect(rateFor("gpt-5.6-terra")?.inputPerMtok).toBe(1);
    expect(resolveRate("gpt-5.6-sol")?.source).toBe("documented");
  });

  it("round-trips through storage and drops invalid entries", () => {
    writeCustomPrices({ "my-model": { ...FREE_PRICE, outputPerMtok: 2 } });
    expect(readCustomPrices()).toEqual({ "my-model": { ...FREE_PRICE, outputPerMtok: 2 } });

    localStorage.setItem(
      KEY_CUSTOM_PRICES,
      JSON.stringify({
        "Good-Model": FREE_PRICE,
        negative: { ...FREE_PRICE, inputPerMtok: -1 },
        missing: { inputPerMtok: 1 },
        text: { ...FREE_PRICE, outputPerMtok: "2" },
      }),
    );
    expect(readCustomPrices()).toEqual({ "good-model": FREE_PRICE });

    localStorage.setItem(KEY_CUSTOM_PRICES, "not json");
    expect(readCustomPrices()).toEqual({});
  });
});

describe("price sources", () => {
  it("reports where each built-in price comes from", () => {
    expect(resolveRate("claude-opus-5")?.source).toBe("anthropic");
    expect(resolveRate("gpt-5.6-terra")?.source).toBe("documented");
    expect(resolveRate("z-ai/glm-5.2")?.source).toBe("bundled");
    expect(resolveRate("openrouter/auto")).toBeNull();
  });
});
