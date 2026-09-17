import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const tokensCss = readFileSync("src/tokens.css", "utf8");

function ruleFor(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tokensCss.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
  return match?.[1] ?? "";
}

describe("breakdown-table sticky headers", () => {
  it("uses an opaque background for an emphasized header", () => {
    const headerRule = ruleFor(".dtable th.emph");

    expect(headerRule).not.toContain("--accent-wash");
    expect(headerRule).toContain("var(--surface)");
  });
});
