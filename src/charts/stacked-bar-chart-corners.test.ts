import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const chartCss = readFileSync("src/App.css", "utf8");

function ruleFor(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return Array.from(
    chartCss.matchAll(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, "g")),
    (match) => match[1],
  ).join(" ");
}

describe("stacked bar corners", () => {
  it("rounds only the outside edges of a column-reverse stack", () => {
    expect(ruleFor(".bar-seg:first-child")).toContain("border-radius: 0 0 3px 3px");
    expect(ruleFor(".bar-seg:last-child")).toContain("border-radius: 3px 3px 0 0");
  });
});
