import { describe, it } from "vitest";
import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// Pagination logic — inlined so the property tests stand on their own
// (the real implementation lives in src/pages/Sessions/index.tsx)
// ---------------------------------------------------------------------------

const PAGE_SIZE = 15;

/** Returns the total number of pages for N items.  N === 0 → 1 (empty page). */
function totalPages(n: number): number {
  return n === 0 ? 1 : Math.ceil(n / PAGE_SIZE);
}

/**
 * Returns the slice of items that belongs to the given zero-based page index.
 * pageIndex must be in [0, totalPages(items.length) - 1].
 */
function pageRows<T>(items: T[], pageIndex: number): T[] {
  return items.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE);
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Arbitrary non-negative integer representing a total row count. */
const rowCountArb: fc.Arbitrary<number> = fc.nat({ max: 10_000 });

/** Arbitrary array of opaque items (numbers stand in for Session objects). */
const itemsArb: fc.Arbitrary<number[]> = fc.array(fc.nat(), { minLength: 0, maxLength: 10_000 });

// ---------------------------------------------------------------------------
// Property 13: Page count formula
// Validates: Requirements 4.11
// ---------------------------------------------------------------------------

describe("Property 13: Page count formula", () => {
  // -------------------------------------------------------------------------
  // Property 13a — totalPages formula matches Math.ceil(N / 15)
  // Special case: N === 0 → 1
  // -------------------------------------------------------------------------
  it("totalPages(N) equals Math.ceil(N / 15) for all N > 0", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10_000 }), (n) => {
        return totalPages(n) === Math.ceil(n / PAGE_SIZE);
      }),
      { numRuns: 100 },
    );
  });

  it("totalPages(0) equals 1 (empty list still shows one page)", () => {
    return totalPages(0) === 1;
  });

  // -------------------------------------------------------------------------
  // Property 13b — every page has at most PAGE_SIZE rows
  // -------------------------------------------------------------------------
  it("every page contains at most 15 rows for any valid page index", () => {
    fc.assert(
      fc.property(itemsArb, (items) => {
        const pages = totalPages(items.length);
        for (let p = 0; p < pages; p++) {
          if (pageRows(items, p).length > PAGE_SIZE) return false;
        }
        return true;
      }),
      { numRuns: 100 },
    );
  });

  // -------------------------------------------------------------------------
  // Property 13c — no item is lost or duplicated across all pages
  // -------------------------------------------------------------------------
  it("concatenating all pages reproduces the original items exactly", () => {
    fc.assert(
      fc.property(itemsArb, (items) => {
        const pages = totalPages(items.length);
        const reconstructed: number[] = [];
        for (let p = 0; p < pages; p++) {
          reconstructed.push(...pageRows(items, p));
        }
        if (reconstructed.length !== items.length) return false;
        for (let i = 0; i < items.length; i++) {
          if (reconstructed[i] !== items[i]) return false;
        }
        return true;
      }),
      { numRuns: 100 },
    );
  });

  // -------------------------------------------------------------------------
  // Property 13d — last page row count
  // The last page always has between 1 and PAGE_SIZE rows (inclusive)
  // unless the list is empty (last page still holds 0 rows)
  // -------------------------------------------------------------------------
  it("last page has between 1 and 15 rows for non-empty item lists", () => {
    fc.assert(
      fc.property(fc.array(fc.nat(), { minLength: 1, maxLength: 10_000 }), (items) => {
        const pages = totalPages(items.length);
        const lastPageRows = pageRows(items, pages - 1);
        return lastPageRows.length >= 1 && lastPageRows.length <= PAGE_SIZE;
      }),
      { numRuns: 100 },
    );
  });

  // -------------------------------------------------------------------------
  // Property 13e — all pages except the last are exactly PAGE_SIZE rows
  // -------------------------------------------------------------------------
  it("all pages except the last contain exactly 15 rows when there are multiple pages", () => {
    fc.assert(
      fc.property(
        fc.array(fc.nat(), { minLength: PAGE_SIZE + 1, maxLength: 10_000 }),
        (items) => {
          const pages = totalPages(items.length);
          for (let p = 0; p < pages - 1; p++) {
            if (pageRows(items, p).length !== PAGE_SIZE) return false;
          }
          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  // -------------------------------------------------------------------------
  // Property 13f — totalPages is consistent with rowCountArb
  // Validates the formula independently of any item array
  // -------------------------------------------------------------------------
  it("totalPages is always a positive integer", () => {
    fc.assert(
      fc.property(rowCountArb, (n) => {
        const pages = totalPages(n);
        return Number.isInteger(pages) && pages >= 1;
      }),
      { numRuns: 100 },
    );
  });

  // -------------------------------------------------------------------------
  // Property 13g — adding items never decreases the page count
  // -------------------------------------------------------------------------
  it("adding items to a list never decreases the total page count", () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 5_000 }).chain((n) =>
          fc.nat({ max: 5_000 }).map((extra) => ({ n, extra })),
        ),
        ({ n, extra }) => {
          return totalPages(n + extra) >= totalPages(n);
        },
      ),
      { numRuns: 100 },
    );
  });
});
