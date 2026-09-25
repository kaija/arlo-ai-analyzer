import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import {
  analyzeToolUsage,
  fixSnippet,
  GRACE_DAYS,
  usageTier,
  type Recommendation,
} from "./tool-usage";
import type { CallCount, CapabilityKind, ListedStat, SessionToolRow, ToolUsageReport } from "../types";

const NOW = new Date("2026-09-25T12:00:00Z");
const DAY = 86_400_000;
const WINDOW = 200_000;

const kindArb = fc.constantFrom<CapabilityKind>("builtin", "mcp", "skill", "subagent");
const nameArb = fc.constantFrom("Bash", "Read", "github", "sentry", "tdd", "pdf", "Explore", "reviewer");

const callArb: fc.Arbitrary<CallCount> = fc
  .record({ kind: kindArb, name: nameArb, calls: fc.integer({ min: 1, max: 50 }), errors: fc.nat({ max: 5 }) })
  .map((c) => ({ ...c, errors: Math.min(c.errors, c.calls) }));

const sessionArb: fc.Arbitrary<SessionToolRow> = fc.record({
  tool: fc.constantFrom("claude_code" as const, "codex_cli" as const),
  session_id: fc.uuid(),
  started_at: fc.integer({ min: 0, max: 120 }).map((d) => new Date(NOW.getTime() - d * DAY).toISOString()),
  requests: fc.integer({ min: 1, max: 80 }),
  baseline_tokens: fc.option(fc.integer({ min: 5_000, max: 120_000 }), { nil: null }),
  calls: fc.array(callArb, { maxLength: 6 }),
});

const listedArb: fc.Arbitrary<ListedStat> = fc.record({
  tool: fc.constantFrom("claude_code" as const, "codex_cli" as const),
  kind: fc.constantFrom<CapabilityKind>("mcp", "skill", "subagent"),
  name: nameArb,
  tokens: fc.option(fc.integer({ min: 1, max: 900 }), { nil: null }),
  tools: fc.nat({ max: 30 }),
  path: fc.constant(null),
  first_listed: fc.integer({ min: 0, max: 120 }).map((d) => new Date(NOW.getTime() - d * DAY).toISOString()),
  last_listed: fc.constant(NOW.toISOString()),
  sessions_listed: fc.integer({ min: 1, max: 40 }),
  current: fc.boolean(),
});

/** Listings are unique per (tool, kind, name), as the backend folds them. */
const reportArb: fc.Arbitrary<ToolUsageReport> = fc.record({
  sessions: fc.array(sessionArb, { maxLength: 30 }),
  listed: fc.uniqueArray(listedArb, { selector: (l) => `${l.tool}|${l.kind}|${l.name}`, maxLength: 15 }),
});

const daysArb = fc.constantFrom<number | null>(7, 30, 90, null);

describe("analyzeToolUsage", () => {
  it("keeps every call in the window and no call outside it", () => {
    fc.assert(
      fc.property(reportArb, daysArb, (report, days) => {
        const a = analyzeToolUsage(report, "claude_code", { now: NOW, days, contextWindow: WINDOW });
        const since = days === null ? -Infinity : NOW.getTime() - days * DAY;
        const inWindow = report.sessions.filter((s) => s.tool === "claude_code" && Date.parse(s.started_at) >= since);
        const expected = inWindow.reduce((n, s) => n + s.calls.reduce((m, c) => m + c.calls, 0), 0);
        expect(a.sessions).toBe(inWindow.length);
        expect(a.totalCalls).toBe(expected);
        expect(a.rows.reduce((n, r) => n + r.calls, 0)).toBe(expected);
      }),
    );
  });

  it("shows everything installed, and only it counts as installed", () => {
    fc.assert(
      fc.property(reportArb, daysArb, (report, days) => {
        const a = analyzeToolUsage(report, "claude_code", { now: NOW, days, contextWindow: WINDOW });
        const current = report.listed.filter((l) => l.tool === "claude_code" && l.current);
        for (const l of current) {
          expect(a.rows.some((r) => r.kind === l.kind && r.name === l.name && r.installed)).toBe(true);
        }
        expect(a.rows.filter((r) => r.installed).length).toBe(current.length);
        expect(a.loadout.skills.count + a.loadout.mcp.count + a.loadout.subagents.count).toBe(current.length);
      }),
    );
  });

  it("never calls something used unused, and session share stays within 0–1", () => {
    fc.assert(
      fc.property(reportArb, daysArb, (report, days) => {
        const a = analyzeToolUsage(report, "codex_cli", { now: NOW, days, contextWindow: WINDOW });
        for (const r of a.rows) {
          expect(r.sessionShare).toBeGreaterThanOrEqual(0);
          expect(r.sessionShare).toBeLessThanOrEqual(1);
          expect(r.tier === "unused" || r.tier === "new").toBe(r.calls === 0);
          expect(r.errors).toBeLessThanOrEqual(r.calls);
        }
      }),
    );
  });

  it("puts the median starting context between the smallest and largest", () => {
    fc.assert(
      fc.property(reportArb, (report) => {
        const a = analyzeToolUsage(report, "claude_code", { now: NOW, days: null, contextWindow: WINDOW });
        const values = report.sessions
          .filter((s) => s.tool === "claude_code" && s.baseline_tokens !== null)
          .map((s) => s.baseline_tokens as number);
        if (values.length === 0) {
          expect(a.baseline.median).toBeNull();
          return;
        }
        expect(a.baseline.median).toBeGreaterThanOrEqual(Math.min(...values));
        expect(a.baseline.median).toBeLessThanOrEqual(Math.max(...values));
        expect(a.baseline.p90).toBeGreaterThanOrEqual(a.baseline.median as number);
      }),
    );
  });

  it("recommends removing exactly the installed skills nobody called, and prices them", () => {
    fc.assert(
      fc.property(reportArb, daysArb, (report, days) => {
        const a = analyzeToolUsage(report, "claude_code", { now: NOW, days, contextWindow: WINDOW });
        const rec = a.recommendations.find((r) => r.kind === "unused_skills");
        const expected = a.rows.filter((r) => r.installed && r.kind === "skill" && r.tier === "unused");
        if (!a.hasListing || a.sessions === 0 || expected.length === 0) {
          expect(rec).toBeUndefined();
          return;
        }
        expect(rec?.items.map((r) => r.name).sort()).toEqual(expected.map((r) => r.name).sort());
        const known = expected.filter((r) => r.listingTokens !== null);
        expect(rec?.tokensPerRequest).toBe(known.length ? known.reduce((n, r) => n + (r.listingTokens ?? 0), 0) : null);
      }),
    );
  });

  it("never asks to remove a built-in tool or bundled subagent", () => {
    fc.assert(
      fc.property(reportArb, daysArb, (report, days) => {
        const a = analyzeToolUsage(report, "claude_code", { now: NOW, days, contextWindow: WINDOW });
        for (const rec of a.recommendations) {
          if (rec.kind === "failing_mcp") continue;
          expect(rec.items.every((r) => r.removable && r.kind !== "builtin" && !(r.kind === "subagent" && r.name === "Explore"))).toBe(true);
        }
      }),
    );
  });

  it("lists warnings before suggestions", () => {
    fc.assert(
      fc.property(reportArb, (report) => {
        const recs = analyzeToolUsage(report, "claude_code", { now: NOW, days: null, contextWindow: 20_000 }).recommendations;
        const firstInfo = recs.findIndex((r) => r.severity === "info");
        if (firstInfo >= 0) expect(recs.slice(firstInfo).every((r) => r.severity === "info")).toBe(true);
      }),
    );
  });
});

describe("usageTier", () => {
  it("gives something installed within the grace period a pass", () => {
    const recent = new Date(NOW.getTime() - (GRACE_DAYS - 1) * DAY).toISOString();
    const old = new Date(NOW.getTime() - (GRACE_DAYS + 1) * DAY).toISOString();
    expect(usageTier(0, 0, recent, NOW)).toBe("new");
    expect(usageTier(0, 0, old, NOW)).toBe("unused");
    expect(usageTier(0, 0, null, NOW)).toBe("unused");
    expect(usageTier(3, 0.3, old, NOW)).toBe("core");
    expect(usageTier(3, 0.1, old, NOW)).toBe("regular");
    expect(usageTier(25, 0.01, old, NOW)).toBe("regular");
    expect(usageTier(2, 0.01, old, NOW)).toBe("rare");
  });
});

describe("fixSnippet", () => {
  const rec = (kind: Recommendation["kind"], names: string[], path: string | null = null): Recommendation => ({
    kind,
    severity: "warning",
    tokensPerRequest: null,
    values: {},
    items: names.map((name) => ({
      kind: kind === "unused_mcp" ? "mcp" : "skill",
      name,
      calls: 0,
      errors: 0,
      sessionsUsed: 0,
      sessionShare: 0,
      lastUsed: null,
      installed: true,
      everListed: true,
      removable: true,
      listingTokens: 10,
      mcpTools: 0,
      toolCalls: [],
      path: path && `${path}/${name}/SKILL.md`,
      firstListed: null,
      tier: "unused",
    })),
  });

  it("writes Claude Code skill overrides as valid JSON", () => {
    const snippet = fixSnippet("claude_code", rec("unused_skills", ["pdf", 'we"ird']))!;
    const json = JSON.parse(snippet.split("\n").slice(1).join("\n"));
    expect(json.skillOverrides).toEqual({ pdf: "off", 'we"ird': "off" });
    const rare = JSON.parse(fixSnippet("claude_code", rec("rare_skills", ["tdd"]))!.split("\n").slice(1).join("\n"));
    expect(rare.skillOverrides.tdd).toBe("name-only");
  });

  it("removes MCP servers but sends claude.ai connectors to their settings", () => {
    const snippet = fixSnippet("claude_code", rec("unused_mcp", ["sentry", "claude_ai_Gmail"]))!;
    expect(snippet).toContain("claude mcp remove sentry");
    expect(snippet).not.toContain("claude mcp remove claude_ai_Gmail");
  });

  it("disables Codex servers and skills in config.toml, quoting odd names", () => {
    expect(fixSnippet("codex_cli", rec("unused_mcp", ["memory", "my.server"]))).toContain(
      '[mcp_servers.memory]\nenabled = false\n\n[mcp_servers."my.server"]\nenabled = false',
    );
    expect(fixSnippet("codex_cli", rec("unused_skills", ["imagegen"], "/h/.codex/skills"))).toContain(
      '[[skills.config]]\npath = "/h/.codex/skills/imagegen/SKILL.md"\nenabled = false',
    );
    // Without a path there is nothing to write.
    expect(fixSnippet("codex_cli", rec("unused_skills", ["imagegen"]))).toBeNull();
  });
});
