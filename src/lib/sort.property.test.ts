import { describe, it } from "vitest";
import * as fc from "fast-check";
import type { BreakdownRow } from "../types";

// ---------------------------------------------------------------------------
// sortRows — the sorting function used by BreakdownTable
// ---------------------------------------------------------------------------

type SortKey = "tokens" | "requests" | "cost";
type SortDir = "asc" | "desc";

function sortRows(rows: BreakdownRow[], key: SortKey, dir: SortDir): BreakdownRow[] {
  return [...rows].sort((a, b) => (dir === "desc" ? b[key] - a[key] : a[key] - b[key]));
}

// ---------------------------------------------------------------------------
// Arbitrary generators
// ---------------------------------------------------------------------------

/** Generate a single BreakdownRow with arbitrary but realistic values. */
const breakdownRowArb: fc.Arbitrary<BreakdownRow> = fc.record<BreakdownRow>({
  name: fc.string({ minLength: 1, maxLength: 40 }),
  requests: fc.nat(),
  tokens: fc.nat(),
  cost: fc.float({ min: 0, max: 10_000, noNaN: true }),
  share: fc.float({ min: 0, max: 1, noNaN: true }),
});

const sortKeyArb: fc.Arbitrary<SortKey> = fc.constantFrom("tokens", "requests", "cost");

// ---------------------------------------------------------------------------
// Property 10: Sort then reverse-sort returns original order
// Validates: Requirements 3.19
// ---------------------------------------------------------------------------

/**
 * Property 10: Sort then reverse-sort returns original order
 *
 * For any array of BreakdownRow objects and any sort key, sorting by that key
 * descending and then sorting ascending should produce the same ordering as
 * a direct single ascending sort.
 *
 * Formally: sortRows(sortRows(rows, key, "desc"), key, "asc")
 *           produces the same sequence as sortRows(rows, key, "asc")
 *
 * Validates: Requirements 3.19
 */
describe("Property 10: Sort then reverse-sort returns original order", () => {
  it("desc-then-asc sort produces the same order as a direct asc sort", () => {
    fc.assert(
      fc.property(
        fc.array(breakdownRowArb, { minLength: 0, maxLength: 100 }),
        sortKeyArb,
        (rows, key) => {
          const directAsc = sortRows(rows, key, "asc");
          const descThenAsc = sortRows(sortRows(rows, key, "desc"), key, "asc");

          if (directAsc.length !== descThenAsc.length) return false;

          for (let i = 0; i < directAsc.length; i++) {
            // Compare by the sort key value — the ordering of rows with equal
            // key values may differ (stable vs unstable sort), but the
            // key-value sequence at every position must be identical.
            if (directAsc[i][key] !== descThenAsc[i][key]) return false;
          }

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it("asc-then-desc sort produces the same order as a direct desc sort", () => {
    fc.assert(
      fc.property(
        fc.array(breakdownRowArb, { minLength: 0, maxLength: 100 }),
        sortKeyArb,
        (rows, key) => {
          const directDesc = sortRows(rows, key, "desc");
          const ascThenDesc = sortRows(sortRows(rows, key, "asc"), key, "desc");

          if (directDesc.length !== ascThenDesc.length) return false;

          for (let i = 0; i < directDesc.length; i++) {
            if (directDesc[i][key] !== ascThenDesc[i][key]) return false;
          }

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it("two asc sorts on the same key are idempotent", () => {
    fc.assert(
      fc.property(
        fc.array(breakdownRowArb, { minLength: 0, maxLength: 100 }),
        sortKeyArb,
        (rows, key) => {
          const once = sortRows(rows, key, "asc");
          const twice = sortRows(once, key, "asc");

          for (let i = 0; i < once.length; i++) {
            if (once[i][key] !== twice[i][key]) return false;
          }
          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it("two desc sorts on the same key are idempotent", () => {
    fc.assert(
      fc.property(
        fc.array(breakdownRowArb, { minLength: 0, maxLength: 100 }),
        sortKeyArb,
        (rows, key) => {
          const once = sortRows(rows, key, "desc");
          const twice = sortRows(once, key, "desc");

          for (let i = 0; i < once.length; i++) {
            if (once[i][key] !== twice[i][key]) return false;
          }
          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it("asc sort produces non-decreasing key sequence", () => {
    fc.assert(
      fc.property(
        fc.array(breakdownRowArb, { minLength: 0, maxLength: 100 }),
        sortKeyArb,
        (rows, key) => {
          const sorted = sortRows(rows, key, "asc");
          for (let i = 1; i < sorted.length; i++) {
            if (sorted[i][key] < sorted[i - 1][key]) return false;
          }
          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it("desc sort produces non-increasing key sequence", () => {
    fc.assert(
      fc.property(
        fc.array(breakdownRowArb, { minLength: 0, maxLength: 100 }),
        sortKeyArb,
        (rows, key) => {
          const sorted = sortRows(rows, key, "desc");
          for (let i = 1; i < sorted.length; i++) {
            if (sorted[i][key] > sorted[i - 1][key]) return false;
          }
          return true;
        },
      ),
      { numRuns: 100 },
    );
  });
});
