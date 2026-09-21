import { beforeEach, describe, expect, it } from "vitest";
import * as fc from "fast-check";
import {
  dailySpendSnapshot,
  msUntilLocalMidnight,
  nextAlert,
  readAlertLedger,
  readDailySpendAlertSettings,
  spendLevel,
  writeAlertLedger,
  writeDailySpendAlertSettings,
  DEFAULT_DAILY_SPEND_ALERT,
  KEY_DAILY_SPEND_ALERT,
  type AlertLedger,
  type DailySpendSnapshot,
  type SpendLevel,
} from "./spend-alert";
import { localDateKey } from "./aggregate";
import type { Session } from "../types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function session(started_at: string, cost_usd: number): Session {
  return {
    tool: "claude_code",
    session_id: `${started_at}-${cost_usd}`,
    project: "/tmp/p",
    started_at,
    model: "claude-sonnet-4",
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_tokens: 0,
    cache_write_5m: 0,
    cache_write_1h: 0,
    cache_read_tokens: 0,
    peak_context_tokens: 0,
    peak_context_model: null,
    compaction_count: 0,
    message_count: 1,
    cost_usd,
  };
}

function snap(date: string, level: SpendLevel, budget = 50, warnPercent = 80): DailySpendSnapshot {
  return { date, spent: 0, budget, warnPercent, percent: 0, level };
}

const levelArb = fc.constantFrom<SpendLevel>("ok", "warn", "over");
const RANK: Record<SpendLevel, number> = { ok: 0, warn: 1, over: 2 };

// ---------------------------------------------------------------------------
// spendLevel
// ---------------------------------------------------------------------------

describe("spendLevel", () => {
  it("is monotonic in spend and bounded by the two thresholds", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1e4, noNaN: true }),
        fc.double({ min: 0, max: 1e4, noNaN: true }),
        fc.double({ min: 0.01, max: 1e4, noNaN: true }),
        fc.integer({ min: 50, max: 95 }),
        (a, b, budget, pct) => {
          const [lo, hi] = a <= b ? [a, b] : [b, a];
          expect(RANK[spendLevel(lo, budget, pct)]).toBeLessThanOrEqual(
            RANK[spendLevel(hi, budget, pct)],
          );
          const level = spendLevel(hi, budget, pct);
          expect(level === "over").toBe(hi >= budget);
          if (hi < (budget * pct) / 100) expect(level).toBe("ok");
        },
      ),
    );
  });

  it("never fires without a positive budget", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1e6, noNaN: true }), (spent) => {
        expect(spendLevel(spent, 0, 80)).toBe("ok");
      }),
    );
  });

  it("fires at exactly the thresholds", () => {
    expect(spendLevel(39.99, 50, 80)).toBe("ok");
    expect(spendLevel(40, 50, 80)).toBe("warn");
    expect(spendLevel(50, 50, 80)).toBe("over");
  });
});

// ---------------------------------------------------------------------------
// dailySpendSnapshot — device-local calendar day
// ---------------------------------------------------------------------------

describe("dailySpendSnapshot", () => {
  it("counts only sessions that started on the local calendar day of `now`", () => {
    const now = new Date(2026, 8, 21, 15, 0, 0); // local 2026-09-21 15:00
    const startOfDay = new Date(2026, 8, 21, 0, 0, 0);
    const justBefore = new Date(startOfDay.getTime() - 1000);
    const lateToday = new Date(2026, 8, 21, 23, 59, 0);

    const s = dailySpendSnapshot(
      [
        session(startOfDay.toISOString(), 10),
        session(lateToday.toISOString(), 25),
        session(justBefore.toISOString(), 1000),
      ],
      { enabled: true, dailyBudget: 50, warnPercent: 80 },
      now,
    );

    expect(s.date).toBe(localDateKey(now));
    expect(s.spent).toBe(35);
    expect(s.percent).toBeCloseTo(70);
    expect(s.level).toBe("ok");
  });

  it("reports 0% rather than dividing by a zero budget", () => {
    const now = new Date(2026, 8, 21, 12);
    const s = dailySpendSnapshot(
      [session(now.toISOString(), 99)],
      { enabled: true, dailyBudget: 0, warnPercent: 80 },
      now,
    );
    expect(s.percent).toBe(0);
    expect(s.level).toBe("ok");
  });
});

describe("msUntilLocalMidnight", () => {
  it("lands exactly on the next local midnight", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: Date.UTC(2024, 0, 1), max: Date.UTC(2027, 0, 1) }),
        (ms) => {
          const now = new Date(ms);
          const reset = new Date(ms + msUntilLocalMidnight(now));
          expect(reset.getHours()).toBe(0);
          expect(reset.getMinutes()).toBe(0);
          expect(localDateKey(reset) > localDateKey(now)).toBe(true);
          expect(msUntilLocalMidnight(now)).toBeGreaterThan(0);
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// nextAlert — at most one popup per level per day
// ---------------------------------------------------------------------------

describe("nextAlert", () => {
  it("alerts each level at most once per day, whatever the order of readings", () => {
    fc.assert(
      fc.property(fc.array(levelArb, { maxLength: 30 }), (levels) => {
        let ledger: AlertLedger | null = null;
        const fired: SpendLevel[] = [];
        for (const level of levels) {
          const r = nextAlert(ledger, snap("2026-09-21", level));
          ledger = r.ledger;
          if (r.alert) fired.push(r.alert);
        }
        expect(new Set(fired).size).toBe(fired.length);
        expect(fired).not.toContain("ok");
        // Alerts come in increasing severity.
        for (let i = 1; i < fired.length; i++) {
          expect(RANK[fired[i]]).toBeGreaterThan(RANK[fired[i - 1]]);
        }
      }),
    );
  });

  it("alerts the highest level reached when the first reading already exceeds it", () => {
    expect(nextAlert(null, snap("2026-09-21", "over")).alert).toBe("over");
    expect(nextAlert(null, snap("2026-09-21", "ok")).alert).toBeNull();
  });

  it("re-arms on a new local day", () => {
    const { ledger } = nextAlert(null, snap("2026-09-21", "over"));
    expect(nextAlert(ledger, snap("2026-09-21", "over")).alert).toBeNull();
    expect(nextAlert(ledger, snap("2026-09-22", "warn")).alert).toBe("warn");
  });

  it("re-baselines silently when the budget or warn % changes mid-day", () => {
    const { ledger } = nextAlert(null, snap("2026-09-21", "warn", 50, 80));
    const edited = nextAlert(ledger, snap("2026-09-21", "over", 30, 80));
    expect(edited.alert).toBeNull();
    expect(edited.ledger.level).toBe("over");

    const raised = nextAlert(ledger, snap("2026-09-21", "ok", 100, 80));
    expect(raised.alert).toBeNull();
    // …and the next crossing under the new budget does pop up.
    expect(nextAlert(raised.ledger, snap("2026-09-21", "warn", 100, 80)).alert).toBe("warn");
  });

  it("does not re-fire after spend drops and climbs back within the same day", () => {
    let { ledger } = nextAlert(null, snap("2026-09-21", "warn"));
    ledger = nextAlert(ledger, snap("2026-09-21", "ok")).ledger;
    expect(ledger.level).toBe("warn");
    expect(nextAlert(ledger, snap("2026-09-21", "warn")).alert).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

describe("persistence", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips settings and the ledger", () => {
    writeDailySpendAlertSettings({ enabled: true, dailyBudget: 12.5, warnPercent: 65 });
    expect(readDailySpendAlertSettings()).toEqual({
      enabled: true,
      dailyBudget: 12.5,
      warnPercent: 65,
    });

    const ledger: AlertLedger = { date: "2026-09-21", budget: 12.5, warnPercent: 65, level: "warn" };
    writeAlertLedger(ledger);
    expect(readAlertLedger()).toEqual(ledger);
  });

  it("falls back to defaults on malformed or out-of-range values", () => {
    localStorage.setItem(KEY_DAILY_SPEND_ALERT, "{not json");
    expect(readDailySpendAlertSettings()).toEqual(DEFAULT_DAILY_SPEND_ALERT);

    localStorage.setItem(
      KEY_DAILY_SPEND_ALERT,
      JSON.stringify({ enabled: true, dailyBudget: -3, warnPercent: 400 }),
    );
    expect(readDailySpendAlertSettings()).toEqual({
      enabled: true,
      dailyBudget: DEFAULT_DAILY_SPEND_ALERT.dailyBudget,
      warnPercent: 95,
    });
  });
});
