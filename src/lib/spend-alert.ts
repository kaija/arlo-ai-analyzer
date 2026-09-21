import type { Session } from "../types";
import { estimatedCostUsd } from "../pricing";
import { localDateKey } from "./aggregate";

// ---------------------------------------------------------------------------
// Daily spend alert
//
// "Today" is the calendar day in the device time zone — the same boundary the
// Dashboard uses, so the popup and the Dashboard never disagree about what
// today's spend is. Two levels fire: `warn` at the user's percentage and
// `over` at 100%. Each fires at most once per local day.
// ---------------------------------------------------------------------------

export interface DailySpendAlertSettings {
  enabled: boolean;
  /** USD per local calendar day. 0 disables the alert. */
  dailyBudget: number;
  /** Warning level as a percentage of `dailyBudget`, 50–95. */
  warnPercent: number;
}

export const DEFAULT_DAILY_SPEND_ALERT: DailySpendAlertSettings = {
  enabled: false,
  dailyBudget: 50,
  warnPercent: 80,
};

export const WARN_PERCENT_MIN = 50;
export const WARN_PERCENT_MAX = 95;

export const KEY_DAILY_SPEND_ALERT = "arlo-daily-spend-alert";
const KEY_ALERT_LEDGER = "arlo-daily-spend-alert-ledger";

export type SpendLevel = "ok" | "warn" | "over";

const RANK: Record<SpendLevel, number> = { ok: 0, warn: 1, over: 2 };

export function spendLevel(spent: number, budget: number, warnPercent: number): SpendLevel {
  if (!(budget > 0)) return "ok";
  if (spent >= budget) return "over";
  if (spent >= (budget * warnPercent) / 100) return "warn";
  return "ok";
}

export interface DailySpendSnapshot {
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  spent: number;
  budget: number;
  warnPercent: number;
  /** spent / budget × 100; 0 when there is no budget. */
  percent: number;
  level: SpendLevel;
}

/**
 * Today's spend against the daily budget.
 *
 * ponytail: a session's whole cost lands on the day it *started*, matching the
 * Dashboard. A session running across midnight counts toward yesterday; exact
 * attribution needs per-request costs in the session list.
 */
export function dailySpendSnapshot(
  sessions: Session[],
  settings: DailySpendAlertSettings,
  now: Date,
): DailySpendSnapshot {
  const date = localDateKey(now);
  const spent = sessions
    .filter((s) => localDateKey(s.started_at) === date)
    .reduce((acc, s) => acc + estimatedCostUsd(s), 0);
  const budget = settings.dailyBudget;
  return {
    date,
    spent,
    budget,
    warnPercent: settings.warnPercent,
    percent: budget > 0 ? (spent / budget) * 100 : 0,
    level: spendLevel(spent, budget, settings.warnPercent),
  };
}

/** Milliseconds from `now` until the next local midnight, when the budget resets. */
export function msUntilLocalMidnight(now: Date): number {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return midnight.getTime() - now.getTime();
}

// ---------------------------------------------------------------------------
// Alert ledger — what has already been shown today
// ---------------------------------------------------------------------------

export interface AlertLedger {
  date: string;
  budget: number;
  warnPercent: number;
  /** Highest level already alerted (or silently accepted) for this date. */
  level: SpendLevel;
}

/**
 * Decide whether `snap` warrants a popup, given what was already shown.
 *
 * - A new day starts from `ok`, so crossing a level alerts again.
 * - The level only ratchets up within a day: a re-price that lowers spend does
 *   not re-arm an alert that already fired.
 * - Changing the budget or warn % mid-day re-baselines *silently*: the user is
 *   looking at the Settings card, which already shows the status. Only the
 *   next crossing under the new settings pops up.
 */
export function nextAlert(
  ledger: AlertLedger | null,
  snap: DailySpendSnapshot,
): { alert: SpendLevel | null; ledger: AlertLedger } {
  const current: AlertLedger = {
    date: snap.date,
    budget: snap.budget,
    warnPercent: snap.warnPercent,
    level: snap.level,
  };

  if (ledger === null || ledger.date !== snap.date) {
    return { alert: snap.level === "ok" ? null : snap.level, ledger: current };
  }
  if (ledger.budget !== snap.budget || ledger.warnPercent !== snap.warnPercent) {
    return { alert: null, ledger: current };
  }
  if (RANK[snap.level] > RANK[ledger.level]) {
    return { alert: snap.level, ledger: current };
  }
  return { alert: null, ledger };
}

// ---------------------------------------------------------------------------
// Persistence — plain functions so the tray popover window, which has no
// SettingsProvider, reads the same values the main window writes.
// ---------------------------------------------------------------------------

function isFiniteNonNegative(n: unknown): n is number {
  return typeof n === "number" && isFinite(n) && n >= 0;
}

export function clampWarnPercent(n: number): number {
  return Math.min(WARN_PERCENT_MAX, Math.max(WARN_PERCENT_MIN, Math.round(n)));
}

export function readDailySpendAlertSettings(): DailySpendAlertSettings {
  try {
    const raw = localStorage.getItem(KEY_DAILY_SPEND_ALERT);
    if (raw !== null) {
      const p = JSON.parse(raw) as Record<string, unknown>;
      return {
        enabled: Boolean(p.enabled),
        dailyBudget: isFiniteNonNegative(p.dailyBudget)
          ? p.dailyBudget
          : DEFAULT_DAILY_SPEND_ALERT.dailyBudget,
        warnPercent: isFiniteNonNegative(p.warnPercent)
          ? clampWarnPercent(p.warnPercent)
          : DEFAULT_DAILY_SPEND_ALERT.warnPercent,
      };
    }
  } catch {
    // unavailable storage or malformed JSON — fall back to defaults
  }
  return DEFAULT_DAILY_SPEND_ALERT;
}

export function writeDailySpendAlertSettings(value: DailySpendAlertSettings): void {
  try {
    localStorage.setItem(KEY_DAILY_SPEND_ALERT, JSON.stringify(value));
  } catch {
    // ignore
  }
}

export function readAlertLedger(): AlertLedger | null {
  try {
    const raw = localStorage.getItem(KEY_ALERT_LEDGER);
    if (raw === null) return null;
    const p = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof p.date === "string" &&
      isFiniteNonNegative(p.budget) &&
      isFiniteNonNegative(p.warnPercent) &&
      (p.level === "ok" || p.level === "warn" || p.level === "over")
    ) {
      return { date: p.date, budget: p.budget, warnPercent: p.warnPercent, level: p.level };
    }
  } catch {
    // fall through
  }
  return null;
}

export function writeAlertLedger(ledger: AlertLedger): void {
  try {
    localStorage.setItem(KEY_ALERT_LEDGER, JSON.stringify(ledger));
  } catch {
    // ignore
  }
}
