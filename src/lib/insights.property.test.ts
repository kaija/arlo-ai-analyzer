import { describe, it } from "vitest";
import * as fc from "fast-check";
import { cacheHitRate } from "./insights";
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

// ---------------------------------------------------------------------------
// Property 18: Cache hit rate formula
// Validates: Requirements 6.4
// ---------------------------------------------------------------------------

describe("Property 18: Cache hit rate formula", () => {
  it("equals totalCacheRead / (totalInput + totalCacheRead) for non-zero denominator", () => {
    fc.assert(
      fc.property(fc.array(sessionArb, { minLength: 1, maxLength: 100 }), (sessions) => {
        const totalInput = sessions.reduce((acc, s) => acc + s.input_tokens, 0);
        const totalCacheRead = sessions.reduce((acc, s) => acc + s.cache_read_tokens, 0);

        const denominator = totalInput + totalCacheRead;
        if (denominator === 0) return true; // skip zero-denominator case (covered separately)

        const expected = totalCacheRead / denominator;
        const actual = cacheHitRate(sessions);

        // Allow small floating-point tolerance
        return Math.abs(actual - expected) < 1e-12;
      }),
      { numRuns: 100 },
    );
  });

  it("result is always in [0, 1]", () => {
    fc.assert(
      fc.property(fc.array(sessionArb, { minLength: 0, maxLength: 100 }), (sessions) => {
        const rate = cacheHitRate(sessions);
        return rate >= 0 && rate <= 1;
      }),
      { numRuns: 100 },
    );
  });

  it("returns 0 when denominator is zero (all token counts are zero)", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record<Session>({
            tool: toolArb,
            session_id: fc.uuid(),
            project: fc.stringMatching(/^[a-z][a-z0-9-]{0,19}$/),
            started_at: startedAtArb,
            model: modelArb,
            input_tokens: fc.constant(0),
            output_tokens: fc.nat({ max: 20_000 }),
            cache_creation_tokens: fc.nat({ max: 100_000 }),
            cache_read_tokens: fc.constant(0),
            message_count: fc.nat({ max: 500 }),
          }),
          { minLength: 0, maxLength: 50 },
        ),
        (sessions) => {
          return cacheHitRate(sessions) === 0;
        },
      ),
      { numRuns: 100 },
    );
  });

  it("returns 0 for an empty session array", () => {
    fc.assert(
      fc.property(fc.constant([] as Session[]), (sessions) => {
        return cacheHitRate(sessions) === 0;
      }),
      { numRuns: 100 },
    );
  });
});
