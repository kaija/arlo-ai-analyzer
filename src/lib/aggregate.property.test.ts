import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { sumSessions, activeDays, bucketByDay, bucketByWeek, bucketByHour } from "./aggregate";
import { totalTokens, estimatedCostUsd } from "../pricing";
import type { Session, ToolKind } from "../types";

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const toolArb = fc.constantFrom<ToolKind>(
  "claude_code",
  "cursor",
  "gemini_cli",
  "codex_cli",
);

const modelArb = fc.oneof(
  fc.constant(null),
  fc.constantFrom(
    "claude-opus-4",
    "claude-opus-4-5",
    "claude-3-opus",
    "claude-3-7-sonnet",
    "claude-sonnet-4-5",
    "claude-3-5-sonnet",
    "claude-3-5-haiku",
    "claude-haiku-4-5",
    "claude-3-haiku",
  ),
);

// Epoch offsets for a safe date range (2023-01-01 – 2025-06-30 UTC)
const DATE_MIN_MS = Date.UTC(2023, 0, 1);  // 2023-01-01T00:00:00Z
const DATE_MAX_MS = Date.UTC(2025, 5, 30); // 2025-06-30T00:00:00Z

/**
 * Generates ISO date strings by sampling integer milliseconds in a fixed range.
 * Using fc.integer instead of fc.date avoids the RangeError that fc.date can
 * produce during shrinking when it generates out-of-range Date values.
 */
const startedAtArb: fc.Arbitrary<string> = fc
  .integer({ min: DATE_MIN_MS, max: DATE_MAX_MS })
  .map((ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z"));

/**
 * Generates valid Session objects with all required fields.
 */
const sessionArb: fc.Arbitrary<Session> = fc.record<Session>({
  tool: toolArb,
  session_id: fc.uuid(),
  project: fc.stringMatching(/^[a-z][a-z0-9-]{0,19}$/),
  started_at: startedAtArb,
  model: modelArb,
  input_tokens: fc.nat({ max: 200_000 }),
  output_tokens: fc.nat({ max: 20_000 }),
  cache_creation_tokens: fc.nat({ max: 100_000 }),
  cache_write_5m: fc.nat({ max: 100_000 }),
  cache_write_1h: fc.nat({ max: 100_000 }),
  cache_read_tokens: fc.nat({ max: 100_000 }),
  peak_context_tokens: fc.nat({ max: 1_000_000 }),
  peak_context_model: modelArb,
  compaction_count: fc.nat({ max: 10 }),
  message_count: fc.nat({ max: 500 }),
  cost_usd: fc.nat({ max: 1_000 }),
});

// Epoch bounds for the date range arbitrary (2023-01-01 – 2024-12-01 UTC)
const RANGE_START_MIN_MS = Date.UTC(2023, 0, 1);
const RANGE_START_MAX_MS = Date.UTC(2024, 11, 1);

/**
 * Generates a { start, end } date range.
 * Uses integer millisecond sampling to avoid fc.date shrinking issues.
 * Both are formatted as "YYYY-MM-DD". end is 0–90 days after start.
 */
const dateRangeArb: fc.Arbitrary<{ start: string; end: string }> = fc
  .integer({ min: RANGE_START_MIN_MS, max: RANGE_START_MAX_MS })
  .chain((startMs) =>
    fc.integer({ min: 0, max: 90 }).map((durationDays) => {
      const endMs = startMs + durationDays * 86_400_000;
      const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10);
      return { start: fmt(startMs), end: fmt(endMs) };
    }),
  );

// ---------------------------------------------------------------------------
// Property 4: Dashboard stat tiles reflect session totals
// Validates: Requirements 3.1, 10.3
// ---------------------------------------------------------------------------

describe("Property 4: Dashboard stat tiles reflect session totals", () => {
  it("total tokens equals sum of totalTokens(s) for each session", () => {
    fc.assert(
      fc.property(fc.array(sessionArb, { minLength: 0, maxLength: 100 }), (sessions) => {
        const { tokens } = sumSessions(sessions);
        const expected = sessions.reduce((acc, s) => acc + totalTokens(s), 0);
        return tokens === expected;
      }),
      { numRuns: 100 },
    );
  });

  it("total requests equals sum of message_count for each session", () => {
    fc.assert(
      fc.property(fc.array(sessionArb, { minLength: 0, maxLength: 100 }), (sessions) => {
        const { messages } = sumSessions(sessions);
        const expected = sessions.reduce((acc, s) => acc + s.message_count, 0);
        return messages === expected;
      }),
      { numRuns: 100 },
    );
  });

  it("total cost equals sum of estimatedCostUsd(s) for each session (within floating-point tolerance)", () => {
    fc.assert(
      fc.property(fc.array(sessionArb, { minLength: 0, maxLength: 100 }), (sessions) => {
        const { costUsd } = sumSessions(sessions);
        const expected = sessions.reduce((acc, s) => acc + estimatedCostUsd(s), 0);
        // Allow 1e-9 tolerance for floating-point accumulation differences
        return Math.abs(costUsd - expected) < 1e-9;
      }),
      { numRuns: 100 },
    );
  });

  it("active days equals count of distinct calendar dates in started_at", () => {
    fc.assert(
      fc.property(fc.array(sessionArb, { minLength: 0, maxLength: 100 }), (sessions) => {
        const result = activeDays(sessions);
        const expected = new Set(sessions.map((s) => s.started_at.slice(0, 10))).size;
        return result === expected;
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Helpers for Property 5
// ---------------------------------------------------------------------------

/**
 * Counts the number of inclusive calendar days from start to end (both "YYYY-MM-DD").
 */
function countDaysInRange(start: string, end: string): number {
  const startMs = new Date(start + "T00:00:00Z").getTime();
  const endMs = new Date(end + "T00:00:00Z").getTime();
  return Math.round((endMs - startMs) / 86_400_000) + 1;
}

/** Returns ISO week key in "YYYY-WNN" format, mirroring the logic in aggregate.ts. */
function isoWeekKey(dateStr: string): string {
  const d = new Date(dateStr.slice(0, 10) + "T00:00:00Z");
  const dayOfWeek = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  const thursday = new Date(d);
  thursday.setUTCDate(d.getUTCDate() + (4 - dayOfWeek));
  const year = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() === 0 ? 7 : jan4.getUTCDay();
  const weekNum = Math.ceil(
    ((thursday.getTime() - jan4.getTime()) / 86_400_000 + jan4Day - 1) / 7 + 1,
  );
  return `${year}-W${String(weekNum).padStart(2, "0")}`;
}

function distinctWeeksInRange(sessions: Session[], start: string, end: string): number {
  const startDay = start.slice(0, 10);
  const endDay = end.slice(0, 10);
  const weeks = new Set(
    sessions
      .filter((s) => {
        const day = s.started_at.slice(0, 10);
        return day >= startDay && day <= endDay;
      })
      .map((s) => isoWeekKey(s.started_at)),
  );
  return weeks.size;
}

// ---------------------------------------------------------------------------
// Property 5: Bucketing produces the correct bar count
// Validates: Requirements 3.4, 3.5, 3.6, 10.4
// ---------------------------------------------------------------------------

describe("Property 5: Bucketing produces the correct bar count", () => {
  /**
   * bucketByDay must return exactly one bucket per calendar day in [start, end],
   * including zero-fill for days with no sessions.
   */
  it("bucketByDay length equals the number of calendar days in range (inclusive)", () => {
    fc.assert(
      fc.property(
        fc.array(sessionArb, { maxLength: 50 }),
        dateRangeArb,
        (sessions, range) => {
          const result = bucketByDay(sessions, range);
          const expectedDayCount = countDaysInRange(range.start, range.end);
          return result.length === expectedDayCount;
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * bucketByWeek must return exactly one bucket per distinct ISO week that
   * has at least one session in range — no zero-fill for empty weeks.
   */
  it("bucketByWeek length equals the number of distinct ISO weeks with sessions in range", () => {
    fc.assert(
      fc.property(
        fc.array(sessionArb, { maxLength: 50 }),
        dateRangeArb,
        (sessions, range) => {
          const result = bucketByWeek(sessions, range);
          const expectedWeekCount = distinctWeeksInRange(sessions, range.start, range.end);
          return result.length === expectedWeekCount;
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * bucketByHour must always return exactly 24 buckets (one per hour),
   * regardless of session count, regardless of how many hours have no sessions.
   */
  it("bucketByHour always returns exactly 24 buckets", () => {
    fc.assert(
      fc.property(
        fc.array(sessionArb, { maxLength: 50 }),
        fc
          .integer({ min: Date.UTC(2023, 0, 1), max: Date.UTC(2024, 11, 31) })
          .map((ms) => new Date(ms).toISOString().slice(0, 10)),
        (sessions, dayDate) => {
          const result = bucketByHour(sessions, dayDate);
          return result.length === 24;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Cache-write tiers must stay distinct through bucketing
//
// Regression: tokenKindBreakdown used to fold all cache creation into
// cache_write_5m and hard-code cache_write_1h to 0, so the dashboard's token
// pills read "5m 3% / 1h 0%" when the real split was the other way round.
// ---------------------------------------------------------------------------

describe("token-kind bucketing keeps the 5m and 1h cache tiers apart", () => {
  const session: Session = {
    tool: "claude_code",
    session_id: "s1",
    project: "/tmp/p",
    started_at: "2026-08-19T10:00:00.000Z",
    model: "claude-sonnet-5",
    input_tokens: 100,
    output_tokens: 200,
    cache_creation_tokens: 1_000,
    cache_write_5m: 250,
    cache_write_1h: 750,
    cache_read_tokens: 5_000,
    peak_context_tokens: 6_000,
    peak_context_model: "claude-sonnet-5",
    compaction_count: 0,
    message_count: 3,
    cost_usd: 1,
  };

  it("reports each tier from its own field", () => {
    const [bucket] = bucketByDay([session], {
      start: "2026-08-19T00:00:00.000Z",
      end: "2026-08-19T23:59:59.000Z",
    });

    expect(bucket.byTokenKind.cache_write_5m).toBe(250);
    expect(bucket.byTokenKind.cache_write_1h).toBe(750);
    expect(bucket.byTokenKind.input).toBe(100);
    expect(bucket.byTokenKind.output).toBe(200);
    expect(bucket.byTokenKind.cache_read).toBe(5_000);
  });

  it("does not double-count cache creation into a tier", () => {
    const [bucket] = bucketByDay([session], {
      start: "2026-08-19T00:00:00.000Z",
      end: "2026-08-19T23:59:59.000Z",
    });
    const writes =
      bucket.byTokenKind.cache_write_5m + bucket.byTokenKind.cache_write_1h;
    expect(writes).toBe(session.cache_creation_tokens);
  });
});
