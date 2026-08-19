import { describe, it } from "vitest";
import * as fc from "fast-check";
import type { TokenKind } from "../types";

// ---------------------------------------------------------------------------
// filterByKinds — the inline filtering function Dashboard uses when token-kind
// pills are toggled. Inlined here to match what the production component does.
// ---------------------------------------------------------------------------

type TokenKindKey = TokenKind;

interface BucketData {
  label: string;
  total: number;
  values: Record<string, number>;
}

function filterByKinds(
  buckets: BucketData[],
  enabledKinds: Set<TokenKindKey>,
): BucketData[] {
  return buckets.map((bucket) => {
    const filteredValues: Record<string, number> = {};
    let filteredTotal = 0;
    for (const kind of enabledKinds) {
      const v = bucket.values[kind] ?? 0;
      filteredValues[kind] = v;
      filteredTotal += v;
    }
    return { ...bucket, values: filteredValues, total: filteredTotal };
  });
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const ALL_KINDS: TokenKindKey[] = [
  "input",
  "output",
  "cache_write_5m",
  "cache_write_1h",
  "cache_read",
];

/**
 * Generates a single BucketData where each of the five token-kind keys maps to
 * a non-negative integer value, and `total` equals their exact sum.
 */
const bucketDataArb: fc.Arbitrary<BucketData> = fc
  .record({
    label: fc.string({ minLength: 1, maxLength: 10 }),
    input: fc.nat({ max: 100_000 }),
    output: fc.nat({ max: 100_000 }),
    cache_write_5m: fc.nat({ max: 100_000 }),
    cache_write_1h: fc.nat({ max: 100_000 }),
    cache_read: fc.nat({ max: 100_000 }),
  })
  .map(({ label, input, output, cache_write_5m, cache_write_1h, cache_read }) => ({
    label,
    total: input + output + cache_write_5m + cache_write_1h + cache_read,
    values: { input, output, cache_write_5m, cache_write_1h, cache_read },
  }));

/**
 * Generates a non-empty subset of the five token kinds by sampling
 * from the ordered ALL_KINDS array with minLength 1.
 */
const enabledKindsArb: fc.Arbitrary<Set<TokenKindKey>> = fc
  .subarray(ALL_KINDS, { minLength: 1 })
  .map((arr) => new Set(arr));

// ---------------------------------------------------------------------------
// Property 6: Token-kind filter preserves total proportionality
// Validates: Requirements 3.10, 3.11, 3.12
// ---------------------------------------------------------------------------

describe("Property 6: Token-kind filter preserves total proportionality", () => {
  it(
    "filteredTotal / unfilteredTotal equals the weight ratio of enabled kinds",
    () => {
      fc.assert(
        fc.property(
          fc.array(bucketDataArb, { minLength: 0, maxLength: 50 }),
          enabledKindsArb,
          (buckets, enabledKinds) => {
            const unfilteredTotal = buckets.reduce((acc, b) => acc + b.total, 0);

            // When the unfiltered total is 0, all tokens are 0 so the filtered
            // total must also be 0 — proportionality is trivially satisfied.
            if (unfilteredTotal === 0) return true;

            const filtered = filterByKinds(buckets, enabledKinds);
            const filteredTotal = filtered.reduce((acc, b) => acc + b.total, 0);

            // The expected weight ratio: sum of enabled-kind values across all
            // buckets divided by the total across all kinds.
            const enabledSum = buckets.reduce((acc, b) => {
              for (const kind of enabledKinds) {
                acc += b.values[kind] ?? 0;
              }
              return acc;
            }, 0);

            const expectedRatio = enabledSum / unfilteredTotal;
            const actualRatio = filteredTotal / unfilteredTotal;

            // Allow ±1e-9 tolerance for floating-point accumulation.
            return Math.abs(actualRatio - expectedRatio) < 1e-9;
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it("filtered totals per bucket equal the sum of enabled-kind values in that bucket", () => {
    fc.assert(
      fc.property(
        fc.array(bucketDataArb, { minLength: 0, maxLength: 50 }),
        enabledKindsArb,
        (buckets, enabledKinds) => {
          const filtered = filterByKinds(buckets, enabledKinds);

          return filtered.every((fb, i) => {
            const orig = buckets[i];
            const expected = Array.from(enabledKinds).reduce(
              (acc, kind) => acc + (orig.values[kind] ?? 0),
              0,
            );
            return fb.total === expected;
          });
        },
      ),
      { numRuns: 100 },
    );
  });

  it("filtered values only contain enabled kinds", () => {
    fc.assert(
      fc.property(
        fc.array(bucketDataArb, { minLength: 1, maxLength: 50 }),
        enabledKindsArb,
        (buckets, enabledKinds) => {
          const filtered = filterByKinds(buckets, enabledKinds);

          return filtered.every((fb) =>
            Object.keys(fb.values).every((key) => enabledKinds.has(key as TokenKindKey)),
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it("enabling all kinds leaves totals unchanged", () => {
    fc.assert(
      fc.property(
        fc.array(bucketDataArb, { minLength: 0, maxLength: 50 }),
        (buckets) => {
          const allKinds = new Set(ALL_KINDS);
          const filtered = filterByKinds(buckets, allKinds);

          return filtered.every((fb, i) => fb.total === buckets[i].total);
        },
      ),
      { numRuns: 100 },
    );
  });
});
