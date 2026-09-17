import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RequestsTable } from "./RequestsTable";
import type { Request } from "../../types";

afterEach(cleanup);

const request: Request = {
  index: 0,
  timestamp: "2026-08-19T19:24:36.000Z",
  model: "claude-opus-5",
  contextTokens: 51_250,
  inputTokens: 2,
  outputTokens: 648,
  cacheWrite5m: 0,
  cacheWrite1h: 24_748,
  cacheRead: 26_543,
  costUsd: 0.28,
  stopReason: "tool_use",
  transcriptLine: 412,
  effort: "xhigh",
  skill: null,
};

function renderTable(rawCounts: boolean) {
  return render(
    <MemoryRouter>
      <RequestsTable
        requests={[request]}
        rawCounts={rawCounts}
        onToggleRawCounts={() => {}}
        transcriptPath="/tmp/session.jsonl"
      />
    </MemoryRouter>,
  );
}

describe("token breakdown is readable without decoding abbreviations", () => {
  it("names every token kind in the hover breakdown, with exact counts", () => {
    renderTable(false);
    const cell = document.querySelector(".tok-bar");
    const title = cell?.getAttribute("title") ?? "";

    expect(title).toContain("Input (uncached prompt): 2");
    expect(title).toContain("Output (generated, includes thinking): 648");
    expect(title).toContain("Cache write, 5-minute TTL: 0");
    expect(title).toContain("Cache write, 1-hour TTL: 24,748");
    expect(title).toContain("Cache read (prompt served from cache): 26,543");
    expect(title).toContain("Total: 51,941 tokens");
  });

  it("uses exact numbers in the breakdown, never the abbreviated form", () => {
    renderTable(false);
    const title = document.querySelector(".tok-bar")?.getAttribute("title") ?? "";
    expect(title).not.toMatch(/\d+(\.\d+)?K\b/);
  });

  it("spells the column key out in the header instead of cw5/cw1h", () => {
    renderTable(true);
    const key = document.querySelector(".tok-head-key")?.textContent ?? "";
    expect(key).toContain("Input");
    expect(key).toContain("Output");
    expect(key).toContain("Cache write 5m");
    expect(key).toContain("Cache write 1h");
    expect(key).toContain("Cache read");
    expect(key).not.toContain("cw5");
  });

  it("points the transcript button at the request's real line", () => {
    renderTable(false);
    expect(
      screen.getByLabelText("Open transcript at line 412"),
    ).toBeInTheDocument();
  });
});
