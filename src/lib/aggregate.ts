import type { Session, DateRange, DayBucket, WeekBucket, HourBucket, BreakdownRow, TokenKind } from "../types";
import { estimatedCostUsd, totalTokens } from "../pricing";

// ---------------------------------------------------------------------------
// Core totals
// ---------------------------------------------------------------------------

export interface Totals {
  sessions: number;
  tokens: number;
  costUsd: number;
  messages: number;
  cacheReadTokens: number;
}

export function sumSessions(sessions: Session[]): Totals {
  return sessions.reduce<Totals>(
    (acc, s) => ({
      sessions: acc.sessions + 1,
      tokens: acc.tokens + totalTokens(s),
      costUsd: acc.costUsd + estimatedCostUsd(s),
      messages: acc.messages + s.message_count,
      cacheReadTokens: acc.cacheReadTokens + s.cache_read_tokens,
    }),
    { sessions: 0, tokens: 0, costUsd: 0, messages: 0, cacheReadTokens: 0 },
  );
}

// ---------------------------------------------------------------------------
// Generic grouping helper
// ---------------------------------------------------------------------------

export function groupBy(sessions: Session[], keyFn: (s: Session) => string): Record<string, Session[]> {
  const out: Record<string, Session[]> = {};
  for (const s of sessions) {
    const key = keyFn(s);
    (out[key] ??= []).push(s);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Date range filter
// ---------------------------------------------------------------------------

/**
 * Returns sessions whose `started_at` falls within [start, end] (inclusive,
 * ISO date string prefix comparison — works for both full ISO timestamps and
 * "YYYY-MM-DD" strings).
 */
export function filterByDateRange(sessions: Session[], start: string, end: string): Session[] {
  return sessions.filter((s) => {
    const day = s.started_at.slice(0, 10);
    return day >= start.slice(0, 10) && day <= end.slice(0, 10);
  });
}

// ---------------------------------------------------------------------------
// Active days
// ---------------------------------------------------------------------------

/** Count of distinct calendar dates across all sessions. */
export function activeDays(sessions: Session[]): number {
  const days = new Set(sessions.map((s) => s.started_at.slice(0, 10)));
  return days.size;
}

// ---------------------------------------------------------------------------
// Bucket helpers — shared per-session token kind breakdown
// ---------------------------------------------------------------------------

function tokenKindBreakdown(sessions: Session[]): Record<TokenKind, number> {
  return sessions.reduce<Record<TokenKind, number>>(
    (acc, s) => ({
      input: acc.input + s.input_tokens,
      output: acc.output + s.output_tokens,
      // cache_creation_tokens maps to cache_write_5m (5-minute tier) in the
      // Session struct; cache_write_1h is not separately tracked in the current
      // backend — it is included in cache_creation_tokens on newer models but
      // cannot be split without per-request detail. We map all cache creation
      // to cache_write_5m as a best-effort until the backend exposes the split.
      // TODO: needs backend — split cache_write_5m / cache_write_1h properly
      cache_write_5m: acc.cache_write_5m + s.cache_creation_tokens,
      cache_write_1h: acc.cache_write_1h + 0,
      cache_read: acc.cache_read + s.cache_read_tokens,
    }),
    { input: 0, output: 0, cache_write_5m: 0, cache_write_1h: 0, cache_read: 0 },
  );
}

// ---------------------------------------------------------------------------
// Day bucketing (renamed from byDay → bucketByDay)
// ---------------------------------------------------------------------------

/**
 * Bucket sessions by calendar day within the given date range, filling in
 * zero-value buckets for days that have no sessions.
 */
export function bucketByDay(sessions: Session[], range: DateRange): DayBucket[] {
  const filtered = filterByDateRange(sessions, range.start, range.end);
  const grouped = groupBy(filtered, (s) => s.started_at.slice(0, 10));

  // Build a complete list of calendar days in the range
  const days: string[] = [];
  const cursor = new Date(range.start.slice(0, 10) + "T00:00:00Z");
  const endDay = range.end.slice(0, 10);
  while (cursor.toISOString().slice(0, 10) <= endDay) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return days.map((date) => {
    const list = grouped[date] ?? [];
    const totals = sumSessions(list);
    const byModel: Record<string, number> = {};
    for (const s of list) {
      const model = s.model ?? "unknown";
      byModel[model] = (byModel[model] ?? 0) + totalTokens(s);
    }
    const byProject: Record<string, number> = {};
    for (const s of list) {
      byProject[s.project] = (byProject[s.project] ?? 0) + totalTokens(s);
    }
    // skill not yet available from backend — TODO: needs backend
    const bySkill: Record<string, number> = {};

    return {
      date,
      label: new Date(date + "T00:00:00Z").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }),
      tokens: totals.tokens,
      requests: totals.messages,
      cost: totals.costUsd,
      byModel,
      byTokenKind: tokenKindBreakdown(list),
      byProject,
      bySkill,
    };
  });
}

// ---------------------------------------------------------------------------
// Week bucketing
// ---------------------------------------------------------------------------

/** Returns ISO week string in format "YYYY-WNN" (e.g., "2024-W12"). */
function isoWeekKey(dateStr: string): string {
  const d = new Date(dateStr.slice(0, 10) + "T00:00:00Z");
  // ISO week: week containing the first Thursday of the year is week 1
  const dayOfWeek = d.getUTCDay() === 0 ? 7 : d.getUTCDay(); // Mon=1, Sun=7
  const thursday = new Date(d);
  thursday.setUTCDate(d.getUTCDate() + (4 - dayOfWeek)); // move to Thursday
  const year = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4)); // Jan 4 is always in week 1
  const jan4Day = jan4.getUTCDay() === 0 ? 7 : jan4.getUTCDay();
  const weekNum = Math.ceil(
    ((thursday.getTime() - jan4.getTime()) / 86_400_000 + jan4Day - 1) / 7 + 1,
  );
  return `${year}-W${String(weekNum).padStart(2, "0")}`;
}

/**
 * Bucket sessions by ISO week within the given date range.
 * Returns one WeekBucket per distinct ISO week that has at least one session
 * (no zero-fill for empty weeks, as chart bars represent meaningful periods).
 */
export function bucketByWeek(sessions: Session[], range: DateRange): WeekBucket[] {
  const filtered = filterByDateRange(sessions, range.start, range.end);
  const grouped = groupBy(filtered, (s) => isoWeekKey(s.started_at));

  // Collect distinct weeks in chronological order
  const weeks = Object.keys(grouped).sort();

  return weeks.map((isoWeek) => {
    const list = grouped[isoWeek];
    const totals = sumSessions(list);
    const byModel: Record<string, number> = {};
    for (const s of list) {
      const model = s.model ?? "unknown";
      byModel[model] = (byModel[model] ?? 0) + totalTokens(s);
    }
    const byProject: Record<string, number> = {};
    for (const s of list) {
      byProject[s.project] = (byProject[s.project] ?? 0) + totalTokens(s);
    }
    const bySkill: Record<string, number> = {};

    return {
      isoWeek,
      label: isoWeek, // e.g. "2024-W12"
      tokens: totals.tokens,
      requests: totals.messages,
      cost: totals.costUsd,
      byModel,
      byTokenKind: tokenKindBreakdown(list),
      byProject,
      bySkill,
    };
  });
}

// ---------------------------------------------------------------------------
// Hour bucketing (drill-down)
// ---------------------------------------------------------------------------

/**
 * Bucket sessions by hour-of-day for a specific calendar day (YYYY-MM-DD).
 * Always returns exactly 24 buckets (hours 0–23), with zero values for empty
 * hours.
 */
export function bucketByHour(sessions: Session[], dayDate: string): HourBucket[] {
  const dayPrefix = dayDate.slice(0, 10);
  const daysessions = sessions.filter((s) => s.started_at.slice(0, 10) === dayPrefix);
  const grouped = groupBy(daysessions, (s) => {
    // Extract hour from ISO timestamp; handle both "YYYY-MM-DDTHH:..." and
    // "YYYY-MM-DD HH:..." formats.
    const ts = s.started_at;
    const sep = ts.indexOf("T") >= 0 ? "T" : " ";
    const timePart = ts.split(sep)[1] ?? "00:00:00";
    return timePart.slice(0, 2); // "HH"
  });

  return Array.from({ length: 24 }, (_, hour) => {
    const key = String(hour).padStart(2, "0");
    const list = grouped[key] ?? [];
    const totals = sumSessions(list);
    const byModel: Record<string, number> = {};
    for (const s of list) {
      const model = s.model ?? "unknown";
      byModel[model] = (byModel[model] ?? 0) + totalTokens(s);
    }
    const byProject: Record<string, number> = {};
    for (const s of list) {
      byProject[s.project] = (byProject[s.project] ?? 0) + totalTokens(s);
    }
    const bySkill: Record<string, number> = {};

    const suffix = hour < 12 ? "am" : "pm";
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return {
      hour,
      label: `${displayHour}${suffix}`,
      tokens: totals.tokens,
      requests: totals.messages,
      cost: totals.costUsd,
      byModel,
      byTokenKind: tokenKindBreakdown(list),
      byProject,
      bySkill,
    };
  });
}

// ---------------------------------------------------------------------------
// Breakdown tables
// ---------------------------------------------------------------------------

function buildBreakdownRows(
  sessions: Session[],
  keyFn: (s: Session) => string,
): BreakdownRow[] {
  if (sessions.length === 0) return [];

  const overall = sumSessions(sessions);
  const grouped = groupBy(sessions, keyFn);

  return Object.entries(grouped)
    .map(([name, list]) => {
      const totals = sumSessions(list);
      return {
        name,
        requests: totals.messages,
        tokens: totals.tokens,
        cost: totals.costUsd,
        share: overall.tokens > 0 ? totals.tokens / overall.tokens : 0,
      };
    })
    .sort((a, b) => b.tokens - a.tokens);
}

/** Breakdown by model — one row per distinct model value. */
export function breakdownByModel(sessions: Session[]): BreakdownRow[] {
  return buildBreakdownRows(sessions, (s) => s.model ?? "unknown");
}

/** Breakdown by project — one row per distinct project. */
export function breakdownByProject(sessions: Session[]): BreakdownRow[] {
  return buildBreakdownRows(sessions, (s) => s.project);
}

/**
 * Breakdown by branch — one row per distinct branch.
 * Branch is not yet available in the backend Session struct; all sessions map
 * to "—" until the backend exposes the field.
 * TODO: needs backend — expose branch field on Session
 */
export function breakdownByBranch(sessions: Session[]): BreakdownRow[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return buildBreakdownRows(sessions, (s) => (s as any).branch ?? "—");
}
