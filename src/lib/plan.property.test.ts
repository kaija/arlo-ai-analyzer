import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import i18n from "../i18n/i18n";
import {
  agoPhrase,
  clampPercent,
  durationPhrase,
  issueKey,
  planTools,
  resetsInMs,
  windowPhrase,
} from "./plan";
import type { AuthKind, PlanIssue, PlanStatus, QuotaWindow } from "../types";

const MINUTE = 60_000;
const LOCALES = ["en", "zh-TW", "ja"] as const;

function window(window_minutes: number | null, id = "w"): QuotaWindow {
  return { id, window_minutes, scope: null, used_percent: 0, resets_at: null };
}

function hasKeyEverywhere(key: string): boolean {
  return LOCALES.every((lng) => i18n.exists(key, { lng, fallbackLng: false }));
}

describe("windowPhrase", () => {
  it("names the usual windows", () => {
    expect(windowPhrase(window(300))).toEqual({ key: "plans.window.hours", params: { count: 5 } });
    expect(windowPhrase(window(10_080))).toEqual({ key: "plans.window.weekly" });
    expect(windowPhrase(window(null, "extra_usage"))).toEqual({ key: "plans.window.extraUsage" });
  });

  it("every window length maps to a key present in all locales", () => {
    fc.assert(
      fc.property(fc.option(fc.integer({ min: 1, max: 100_000 })), (minutes) =>
        hasKeyEverywhere(windowPhrase(window(minutes)).key),
      ),
    );
  });

  it("a counted phrase reconstructs the window length", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100_000 }), (minutes) => {
        const { key, params } = windowPhrase(window(minutes));
        const count = Number(params?.count ?? 1);
        const unit = { "plans.window.days": 1440, "plans.window.hours": 60, "plans.window.minutes": 1 }[key];
        return unit === undefined || count * unit === minutes;
      }),
    );
  });
});

describe("durationPhrase", () => {
  it("keeps the two largest units, rounding down", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 90 * 24 * 60 * MINUTE }), (ms) => {
        const total = Math.floor(ms / MINUTE);
        const { key, params = {} } = durationPhrase(ms);
        const d = Number(params.d ?? 0);
        const h = Number(params.h ?? 0);
        const m = Number(params.m ?? 0);
        if (!hasKeyEverywhere(key) || h >= 24 || m >= 60) return false;
        if (key === "plans.duration.dh") return d >= 1 && d * 1440 + h * 60 <= total && total < d * 1440 + (h + 1) * 60;
        if (key === "plans.duration.hm") return total < 1440 && h * 60 + m === total;
        if (key === "plans.duration.m") return total < 60 && m === total;
        return total === 0;
      }),
    );
  });
});

describe("resetsInMs", () => {
  it("is positive for a future reset and null otherwise", () => {
    fc.assert(
      fc.property(fc.integer({ min: -1e9, max: 1e9 }), (offset) => {
        const now = Date.parse("2026-09-25T12:00:00Z");
        const result = resetsInMs(new Date(now + offset).toISOString(), now);
        return offset > 0 ? result === offset : result === null;
      }),
    );
    expect(resetsInMs(null, Date.now())).toBeNull();
    expect(resetsInMs("not a date", Date.now())).toBeNull();
  });
});

describe("agoPhrase", () => {
  it("always names a key present in all locales", () => {
    fc.assert(
      fc.property(fc.integer({ min: -1e6, max: 1e10 }), (age) => {
        const now = Date.parse("2026-09-25T12:00:00Z");
        return hasKeyEverywhere(agoPhrase(new Date(now - age).toISOString(), now).key);
      }),
    );
  });
});

describe("issueKey", () => {
  it("every issue kind has wording in all locales", () => {
    const issues: PlanIssue[] = [
      { kind: "credentials_unreadable" },
      { kind: "sign_in_expired" },
      { kind: "no_usage_access" },
      { kind: "unauthorized" },
      { kind: "rate_limited" },
      { kind: "failed", detail: "HTTP 500" },
    ];
    for (const issue of issues) expect(hasKeyEverywhere(issueKey(issue))).toBe(true);
  });
});

describe("clampPercent", () => {
  it("stays within 0–100", () => {
    fc.assert(
      fc.property(fc.double(), (v) => {
        const c = clampPercent(v);
        return c >= 0 && c <= 100;
      }),
    );
  });
});

describe("planTools", () => {
  it("keeps subscription sign-ins and sign-ins that couldn't be read", () => {
    const status = (auth: AuthKind, issue: PlanIssue | null = null): PlanStatus => ({
      tool: "claude_code",
      auth,
      plan: null,
      account: null,
      organization: null,
      credential_source: null,
      quota: null,
      issue,
    });
    const report = {
      online: false,
      checked_at: null,
      live_checked_at: null,
      tools: [
        status("subscription"),
        status("api_key"),
        status("signed_out"),
        status("signed_out", { kind: "credentials_unreadable" }),
      ],
    };
    expect(planTools(report).map((t) => [t.auth, t.issue?.kind ?? null])).toEqual([
      ["subscription", null],
      ["signed_out", "credentials_unreadable"],
    ]);
    expect(planTools(null)).toEqual([]);
  });
});
