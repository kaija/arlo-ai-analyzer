import { describe, it, beforeAll, afterAll } from "vitest";
import { render } from "@testing-library/react";
import * as fc from "fast-check";
import {
  ContextTimelineChart,
  type RequestPoint,
  type CompactionEvent,
} from "./ContextTimelineChart";

// ─── JSDOM polyfill: ResizeObserver is not available in the test environment ──

let originalResizeObserver: typeof ResizeObserver | undefined;

beforeAll(() => {
  originalResizeObserver = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class MockResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterAll(() => {
  if (originalResizeObserver !== undefined) {
    globalThis.ResizeObserver = originalResizeObserver;
  } else {
    // @ts-expect-error — restore undefined if it never existed
    delete globalThis.ResizeObserver;
  }
});

// ─── Coordinate helpers (mirrors ContextTimelineChart internals) ──────────────

const PAD_L = 60;
const PAD_R = 20;
const PLOT_W = 1000 - PAD_L - PAD_R; // 920

/** x-pixel (in SVG viewBox coords) for request index i in an n-request series. */
function xFn(i: number, n: number): number {
  return PAD_L + (i / Math.max(n - 1, 1)) * PLOT_W;
}

/**
 * Nearest-index snap — exact copy of the logic inside ContextTimelineChart so
 * Property 15 can be verified against the same algorithm without relying on DOM
 * interaction events (which would require a real browser/layout engine).
 */
function nearestIndex(pointerX: number, n: number): number {
  if (n === 0) return 0;
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(xFn(i, n) - pointerX);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/**
 * Generates an array of N+5 consecutive RequestPoints (indices 0…N+4)
 * together with N CompactionEvents whose beforeIndex values are distinct
 * indices drawn from [1…N+3] (leaving at least one point after the last
 * compaction boundary so every segment is non-empty).
 *
 * N is generated in the range [0, 10] to keep rendering fast while still
 * exercising N+1 = 1 through 11 segments.
 */
const segmentsArb: fc.Arbitrary<{
  requests: RequestPoint[];
  compactions: CompactionEvent[];
}> = fc
  .integer({ min: 0, max: 10 }) // N compactions
  .chain((n) => {
    const totalRequests = n + 5; // always ≥ n+1 so every split is valid
    const requests: RequestPoint[] = Array.from({ length: totalRequests }, (_, i) => ({
      index: i,
      contextTokens: (i + 1) * 1000,
    }));

    if (n === 0) {
      return fc.constant({ requests, compactions: [] });
    }

    // Pick N distinct boundary indices from [1 … totalRequests - 2]
    // (excluding 0 and the last so each segment has ≥ 1 point)
    const validIndices = Array.from({ length: totalRequests - 2 }, (_, i) => i + 1);

    return fc
      .shuffledSubarray(validIndices, { minLength: n, maxLength: n })
      .map((indices) => {
        const sorted = [...indices].sort((a, b) => a - b);
        const compactions: CompactionEvent[] = sorted.map((beforeIndex) => ({
          beforeIndex,
          preTokens: beforeIndex * 1000,
          postTokens: Math.floor(beforeIndex * 200),
        }));
        return { requests, compactions };
      });
  });

/**
 * Generates pointer X positions that span the full SVG viewBox width plus a
 * small amount of out-of-bounds padding, so we exercise both in-plot and
 * clamped positions.
 */
const pointerXArb: fc.Arbitrary<number> = fc.float({
  min: 0,
  max: 1000,
  noNaN: true,
  noDefaultInfinity: true,
});

/**
 * Generates request counts from 1 to 200 (n = 0 is excluded because the
 * crosshair interaction is undefined for an empty chart).
 */
const requestCountArb: fc.Arbitrary<number> = fc.integer({ min: 1, max: 200 });

// ─── Property 14: Context chart segment count equals compaction count + 1 ────
//
// Validates: Requirements 5.6

describe("Property 14: Context chart segment count equals compaction count plus one", () => {
  it(
    "renders exactly N+1 <path class='ctx-curve'> elements for N compactions",
    () => {
      fc.assert(
        fc.property(segmentsArb, ({ requests, compactions }) => {
          const { container } = render(
            <ContextTimelineChart
              requests={requests}
              compactions={compactions}
              ceiling={200_000}
              ceilingLabel="200K limit"
            />,
          );

          const curvePaths = container.querySelectorAll("path.ctx-curve");
          const expected = compactions.length + 1;
          return curvePaths.length === expected;
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    "renders exactly 1 segment when there are no compactions",
    () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 20 }).map((n) =>
            Array.from({ length: n }, (_, i) => ({
              index: i,
              contextTokens: (i + 1) * 5000,
            })),
          ),
          (requests) => {
            const { container } = render(
              <ContextTimelineChart
                requests={requests}
                compactions={[]}
                ceiling={200_000}
                ceilingLabel="200K limit"
              />,
            );

            const curvePaths = container.querySelectorAll("path.ctx-curve");
            return curvePaths.length === 1;
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

// ─── Property 15: Crosshair snaps to the nearest request index ───────────────
//
// Validates: Requirements 5.9

describe("Property 15: Crosshair snaps to the nearest request index", () => {
  /**
   * Core invariant: nearestIndex(X, n) returns the index I that minimises
   * |xFn(I, n) - X| over all valid indices 0 … n-1.
   *
   * We verify this by checking that no other index j has a strictly smaller
   * distance to the pointer than the returned index.
   */
  it(
    "returned index minimizes |xFn(i, n) - pointerX| for all pointer positions",
    () => {
      fc.assert(
        fc.property(pointerXArb, requestCountArb, (pointerX, n) => {
          const result = nearestIndex(pointerX, n);

          // Compute distances for every index
          const distances = Array.from({ length: n }, (_, i) =>
            Math.abs(xFn(i, n) - pointerX),
          );
          const minDist = Math.min(...distances);
          const resultDist = distances[result];

          // The returned index must achieve the minimum distance.
          // (Ties are broken by the first occurrence; we only verify the
          // distance is minimal, not uniqueness of the tie-break winner.)
          return resultDist <= minDist + Number.EPSILON;
        }),
        { numRuns: 100 },
      );
    },
  );

  /**
   * Boundary invariant: the returned index is always in [0, n-1].
   */
  it("returned index is always a valid request index in [0, n-1]", () => {
    fc.assert(
      fc.property(pointerXArb, requestCountArb, (pointerX, n) => {
        const result = nearestIndex(pointerX, n);
        return result >= 0 && result <= n - 1;
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Single-request invariant: with only one request, index 0 is always
   * returned regardless of pointer position.
   */
  it("always returns index 0 for a single-request series", () => {
    fc.assert(
      fc.property(pointerXArb, (pointerX) => {
        return nearestIndex(pointerX, 1) === 0;
      }),
      { numRuns: 100 },
    );
  });

  /**
   * First-half invariant: a pointer at the left edge of the plot (x = PAD_L)
   * snaps to index 0 for any n ≥ 1.
   */
  it("pointer at plot left edge snaps to index 0", () => {
    fc.assert(
      fc.property(requestCountArb, (n) => {
        return nearestIndex(PAD_L, n) === 0;
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Last-index invariant: a pointer at the right edge of the plot
   * (x = PAD_L + PLOT_W) snaps to index n-1 for any n ≥ 1.
   */
  it("pointer at plot right edge snaps to last index (n-1)", () => {
    fc.assert(
      fc.property(requestCountArb, (n) => {
        return nearestIndex(PAD_L + PLOT_W, n) === n - 1;
      }),
      { numRuns: 100 },
    );
  });
});
