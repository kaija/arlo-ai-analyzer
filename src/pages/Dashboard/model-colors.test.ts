import { describe, expect, it } from "vitest";
import { modelColor } from "../../pricing";
import { modelDims } from "./index";

describe("Dashboard model colors", () => {
  it("gives current Codex model families distinct non-neutral colors", () => {
    const models = [
      "gpt-6-astra",
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "gpt-5.5",
    ];
    const colors = models.map(modelColor);

    expect(new Set(colors).size).toBe(models.length);
    expect(colors).not.toContain("var(--series-recessive)");
  });

  it("resolves family and fallback collisions within the stacked chart", () => {
    const dims = modelDims([
      { model: "claude-opus-5" },
      { model: "claude-opus-4.7" },
      { model: "future-model-alpha" },
      { model: "future-model-beta" },
    ]);

    expect(new Set(dims.map((dim) => dim.color)).size).toBe(dims.length);
  });
});
