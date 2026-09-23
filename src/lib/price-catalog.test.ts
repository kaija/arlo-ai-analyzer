import { afterEach, describe, expect, it } from "vitest";
import { installPriceCatalog, type CatalogModel, type PriceCatalog } from "./price-catalog";
import { isModelPriced, rateFor } from "../pricing";

function catalog(models: Record<string, CatalogModel>): PriceCatalog {
  return {
    schemaVersion: 1,
    generatedAt: "2026-09-23T03:17:00Z",
    source: "https://openrouter.ai/api/v1/models",
    models,
  };
}

function model(input: number, output: number, cacheWrite = 0, cacheWrite1h = 0): CatalogModel {
  return {
    name: "Test",
    contextLength: 128_000,
    inputPerMtok: input,
    outputPerMtok: output,
    cacheReadPerMtok: input / 10,
    cacheWritePerMtok: cacheWrite,
    cacheWrite1hPerMtok: cacheWrite1h,
  };
}

describe("downloaded price catalog in rateFor", () => {
  afterEach(() => installPriceCatalog(null));

  it("prices a model only the downloaded catalog knows", () => {
    expect(rateFor("newlab/brand-new-model")).toBeNull();
    installPriceCatalog(catalog({ "newlab/brand-new-model": model(1, 4, 1.25) }));
    expect(rateFor("newlab/brand-new-model")).toEqual({
      inputPerMtok: 1,
      outputPerMtok: 4,
      cacheWrite5mPerMtok: 1.25,
      cacheWrite1hPerMtok: 1.25, // no 1h tier listed — falls back, never 0
      cacheReadPerMtok: 0.1,
    });
  });

  it("resolves bare Codex ids under the openai/ namespace", () => {
    installPriceCatalog(catalog({ "openai/gpt-9-nova": model(3, 18) }));
    expect(rateFor("gpt-9-nova")?.inputPerMtok).toBe(3);
  });

  it("wins over the bundled snapshot", () => {
    const bundled = rateFor("openai/gpt-4");
    expect(bundled?.inputPerMtok).toBe(30);
    installPriceCatalog(catalog({ "openai/gpt-4": model(25, 50) }));
    expect(rateFor("openai/gpt-4")?.inputPerMtok).toBe(25);
  });

  it("never overrides the hand-checked tables", () => {
    installPriceCatalog(
      catalog({
        "gpt-5.6-terra": model(99, 99),
        "openai/gpt-5.6-terra": model(99, 99),
        "claude-opus-5": model(99, 99),
        "anthropic/claude-opus-5": model(99, 99),
      }),
    );
    expect(rateFor("gpt-5.6-terra")?.inputPerMtok).toBe(2);
    expect(rateFor("claude-opus-5")?.inputPerMtok).toBe(5);
  });

  it("leaves a self-hosted model unknown, not free", () => {
    installPriceCatalog(catalog({ "openai/gpt-4": model(30, 60) }));
    expect(rateFor("llama3:70b")).toBeNull();
  });

  it("falls back to the bundled snapshot when the catalog is removed", () => {
    installPriceCatalog(catalog({ "openai/gpt-4": model(25, 50) }));
    installPriceCatalog(null);
    expect(rateFor("openai/gpt-4")?.inputPerMtok).toBe(30);
  });
});

describe("model id shapes", () => {
  afterEach(() => installPriceCatalog(null));

  it("resolves a bare id under the one vendor that lists it", () => {
    installPriceCatalog(catalog({ "google/gemini-9-flash": model(0.5, 3) }));
    expect(rateFor("gemini-9-flash")?.inputPerMtok).toBe(0.5);
  });

  it("does not guess when two vendors list the same bare id", () => {
    installPriceCatalog(catalog({ "a/shared-model": model(1, 1), "b/shared-model": model(2, 2) }));
    expect(rateFor("shared-model")).toBeNull();
  });

  it("strips Bedrock-style vendor prefixes", () => {
    expect(rateFor("openai.gpt-5.6-terra")).toEqual(rateFor("gpt-5.6-terra"));
    expect(rateFor("us.anthropic.claude-opus-5")).toEqual(rateFor("claude-opus-5"));
  });

  it("resolves bare ids from the bundled snapshot too", () => {
    expect(rateFor("gemini-3.6-flash")).not.toBeNull();
  });

  it("never warns about Claude Code's <synthetic> placeholder", () => {
    expect(rateFor("<synthetic>")).toBeNull();
    expect(isModelPriced("<synthetic>")).toBe(true);
  });
});
