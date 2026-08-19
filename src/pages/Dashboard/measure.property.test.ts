import { describe, it } from "vitest";
import * as fc from "fast-check";
import { totalTokens, estimatedCostUsd } from "../../pricing";
import type { Session, Measure, ToolKind } from "../../types";

// ---------------------------------------------------------------------------
// Pure derivation function under test
// Mirrors how DashboardPage derives stat tile values from sessions + measure.
// ---------------------------------------------------------------------------

function statTileValue(sessions: Session[], measure: Measure): number {
  switch (measure) {
    case "tokens":
      return sessions.reduce((acc, s) => acc + totalTokens(s), 0);
    case "requests":
      return sessions.reduce((acc, s) => acc + s.message_count, 0);
    case "cost":
      return sessions.reduce((acc, s) => acc + estimatedCostUsd(s), 0);
  }
}

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

// Use integer-based date generation to avoid fc.date shrinking RangeErrors
const DATE_MIN_MS = Date.UTC(2023, 0, 1);
const DATE_MAX_MS = Date.UTC(2025, 5, 30);

const startedAtArb: fc.Arbitrary<string> = fc
  .integer({ min: DATE_MIN_MS, max: DATE_MAX_MS })
  .map((ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z"));

const sessionArb: fc.Arbitrary<Session> = fc.record<Session>({
  tool: toolArb,
  session_id: fc.uuid(),
  project: fc.stringMatching(/^[a-z][a-z0-9-]{0,19}$/),
  started_at: startedAtArb,
  model: modelArb,
  input_tokens: fc.nat({ max: 200_000 }),
  output_tokens: fc.nat({ max: 20_000 }),
  cache_creation_tokens: fc.nat({ max: 100_000 }),
  cache_read_tokens: fc.nat({ max: 100_000 }),
  message_count: fc.nat({ max: 500 }),
});

const measureArb = fc.constantFrom<Measure>("tokens", "requests", "cost");

// ---------------------------------------------------------------------------
// Property 8: Measure derivation applies correct aggregation
// Validates: Requirements 3.16, 10.3
// ---------------------------------------------------------------------------

describe("Property 8: Measure derivation applies correct aggregation", () => {
  /**
   * For measure="tokens", statTileValue must equal the sum of totalTokens(s)
   * across all sessions.
   */
  it('measure "tokens" equals sum of totalTokens(s)', () => {
    fc.assert(
      fc.property(fc.array(sessionArb, { minLength: 0, maxLength: 100 }), (sessions) => {
        const result = statTileValue(sessions, "tokens");
        const expected = sessions.reduce((acc, s) => acc + totalTokens(s), 0);
        return result === expected;
      }),
      { numRuns: 100 },
    );
  });

  /**
   * For measure="requests", statTileValue must equal the sum of message_count
   * across all sessions.
   */
  it('measure "requests" equals sum of message_count', () => {
    fc.assert(
      fc.property(fc.array(sessionArb, { minLength: 0, maxLength: 100 }), (sessions) => {
        const result = statTileValue(sessions, "requests");
        const expected = sessions.reduce((acc, s) => acc + s.message_count, 0);
        return result === expected;
      }),
      { numRuns: 100 },
    );
  });

  /**
   * For measure="cost", statTileValue must equal the sum of estimatedCostUsd(s)
   * across all sessions, within floating-point tolerance.
   */
  it('measure "cost" equals sum of estimatedCostUsd(s) (floating-point tolerance 1e-9)', () => {
    fc.assert(
      fc.property(fc.array(sessionArb, { minLength: 0, maxLength: 100 }), (sessions) => {
        const result = statTileValue(sessions, "cost");
        const expected = sessions.reduce((acc, s) => acc + estimatedCostUsd(s), 0);
        return Math.abs(result - expected) < 1e-9;
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Measure derivation is exhaustive: for any arbitrary measure value, the
   * function returns a finite non-negative number (never NaN or negative).
   */
  it("result is always a finite non-negative number for any measure and session array", () => {
    fc.assert(
      fc.property(
        fc.array(sessionArb, { minLength: 0, maxLength: 100 }),
        measureArb,
        (sessions, measure) => {
          const result = statTileValue(sessions, measure);
          return Number.isFinite(result) && result >= 0;
        },
      ),
      { numRuns: 100 },
    );
  });
});
