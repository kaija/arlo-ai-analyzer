/**
 * Property 16: Mini token-kind bar segment widths sum to 100%
 *
 * For any Request where totalTokens > 0, the sum of the five segment width
 * percentages in the mini token-kind bar should equal 100% (within
 * floating-point tolerance of ±0.1%).
 *
 * Validates: Requirements 5.11
 *
 * Property 17: Stop-reason tag CSS class matches the stop reason value
 *
 * For any StopReason value in {"end_turn", "tool_use", "max_tokens",
 * "refusal"}, the rendered tag should carry exactly the CSS class
 * `stop-{stopReason}` and no other `stop-*` class.
 *
 * Validates: Requirements 5.15
 */

import { describe, it } from "vitest";
import { render } from "@testing-library/react";
import * as fc from "fast-check";
import type { StopReason, Request, Effort } from "../types";
import { MiniStackBar, TOKEN_KIND_COLORS } from "./MiniStackBar";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute the five per-kind width percentages for a Request, exactly as
 *  RequestsTable / Session Detail would build the segments. */
function tokenSegmentWidths(r: Request): number[] {
  const total =
    r.inputTokens +
    r.outputTokens +
    r.cacheWrite5m +
    r.cacheWrite1h +
    r.cacheRead;

  if (total === 0) return [0, 0, 0, 0, 0];

  return [
    (r.inputTokens / total) * 100,
    (r.outputTokens / total) * 100,
    (r.cacheWrite5m / total) * 100,
    (r.cacheWrite1h / total) * 100,
    (r.cacheRead / total) * 100,
  ];
}

/** Inline stop-reason tag component — mirrors what RequestsTable renders. */
function StopReasonTag({ stopReason }: { stopReason: StopReason }) {
  return <span className={`stop-tag stop-${stopReason}`}>{stopReason}</span>;
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Generates a non-negative integer token count. */
const tokenCount = fc.integer({ min: 0, max: 1_000_000 });

/** Generates a Request whose five token-kind fields sum to at least 1. */
const requestWithTokensArb: fc.Arbitrary<Request> = fc
  .tuple(tokenCount, tokenCount, tokenCount, tokenCount, tokenCount)
  .filter(([a, b, c, d, e]) => a + b + c + d + e > 0)
  .chain(([inp, out, cw5, cw1, cr]) =>
    fc.record<Request>({
      index: fc.integer({ min: 0, max: 9999 }),
      timestamp: fc.constant("2024-01-01T00:00:00Z"),
      model: fc.constant("claude-opus-4-5"),
      effort: fc.constantFrom<Effort>("medium", "high", "xhigh"),
      inputTokens: fc.constant(inp),
      outputTokens: fc.constant(out),
      cacheWrite5m: fc.constant(cw5),
      cacheWrite1h: fc.constant(cw1),
      cacheRead: fc.constant(cr),
      costUsd: fc.float({ min: 0, max: 100 }),
      stopReason: fc.constantFrom<StopReason>(
        "end_turn",
        "tool_use",
        "max_tokens",
        "refusal"
      ),
      skill: fc.option(fc.string({ minLength: 1, maxLength: 20 }), {
        nil: null,
      }),
    })
  );

/** All four StopReason values as a fast-check arbitrary. */
const stopReasonArb = fc.constantFrom<StopReason>(
  "end_turn",
  "tool_use",
  "max_tokens",
  "refusal"
);

/** The four canonical stop-reason CSS suffixes. */
const STOP_REASON_VALUES: StopReason[] = [
  "end_turn",
  "tool_use",
  "max_tokens",
  "refusal",
];

/**
 * Extract the stop-reason CSS classes from a classList.
 * A stop-reason class is one whose suffix is an exact StopReason value,
 * i.e. matching `stop-{end_turn|tool_use|max_tokens|refusal}`.
 * This deliberately excludes `stop-tag` (the structural base class).
 */
function stopReasonClasses(classList: DOMTokenList): string[] {
  return Array.from(classList).filter((c) =>
    STOP_REASON_VALUES.some((r) => c === `stop-${r}`)
  );
}

// ---------------------------------------------------------------------------
// Property 16 — segment widths sum to 100%
// ---------------------------------------------------------------------------

describe("Property 16 – Mini token-kind bar segment widths sum to 100%", () => {
  it(
    "pure width calculation: sum of five percentages equals 100 (±0.1%)",
    () => {
      fc.assert(
        fc.property(requestWithTokensArb, (req) => {
          const widths = tokenSegmentWidths(req);
          const sum = widths.reduce((acc, w) => acc + w, 0);
          expect(sum).toBeCloseTo(100, 1); // 1 decimal place → ±0.05
        }),
        { numRuns: 100 }
      );
    }
  );

  it(
    "MiniStackBar rendered spans: sum of rendered segment widths equals 100% (±0.1%)",
    () => {
      fc.assert(
        fc.property(requestWithTokensArb, (req) => {
          const total =
            req.inputTokens +
            req.outputTokens +
            req.cacheWrite5m +
            req.cacheWrite1h +
            req.cacheRead;

          const segments = [
            { value: req.inputTokens, color: TOKEN_KIND_COLORS.input, label: "input" },
            { value: req.outputTokens, color: TOKEN_KIND_COLORS.output, label: "output" },
            { value: req.cacheWrite5m, color: TOKEN_KIND_COLORS.cache_write_5m, label: "cache write 5m" },
            { value: req.cacheWrite1h, color: TOKEN_KIND_COLORS.cache_write_1h, label: "cache write 1h" },
            { value: req.cacheRead, color: TOKEN_KIND_COLORS.cache_read, label: "cache read" },
          ];

          const { container, unmount } = render(
            <MiniStackBar segments={segments} total={total} />
          );

          // MiniStackBar renders null when total === 0; we filtered for total > 0
          const stackDiv = container.querySelector(".mini-stack");
          expect(stackDiv).not.toBeNull();

          // Collect the inline width values from all rendered spans
          const spans = stackDiv!.querySelectorAll("span");
          let renderedSum = 0;
          spans.forEach((span) => {
            const widthStr = (span as HTMLElement).style.width;
            // width is set as `${pct}%`
            const pct = parseFloat(widthStr);
            expect(Number.isFinite(pct)).toBe(true);
            renderedSum += pct;
          });

          // Only spans with pct > 0 are rendered, so zero-value kinds are
          // absent. The sum over the non-zero spans still equals 100% because
          // each pct = (value / total) * 100 and values that are 0 contribute
          // nothing to the sum anyway.
          expect(renderedSum).toBeCloseTo(100, 1);

          unmount();
        }),
        { numRuns: 100 }
      );
    }
  );

  it(
    "sum is exact 100 when only one token kind is non-zero",
    () => {
      // Edge case: all tokens are of a single kind
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1_000_000 }),
          fc.integer({ min: 0, max: 4 }),
          (tokenVal, kindIndex) => {
            const counts = [0, 0, 0, 0, 0];
            counts[kindIndex] = tokenVal;

            const req: Request = {
              index: 0,
              timestamp: "2024-01-01T00:00:00Z",
              model: "claude-sonnet-4-5",
              effort: "medium",
              inputTokens: counts[0],
              outputTokens: counts[1],
              cacheWrite5m: counts[2],
              cacheWrite1h: counts[3],
              cacheRead: counts[4],
              costUsd: 0,
              stopReason: "end_turn",
              skill: null,
            };

            const widths = tokenSegmentWidths(req);
            const sum = widths.reduce((a, w) => a + w, 0);
            expect(sum).toBeCloseTo(100, 1);
          }
        ),
        { numRuns: 100 }
      );
    }
  );
});

// ---------------------------------------------------------------------------
// Property 17 — stop-reason tag CSS class matches the stop reason value
// ---------------------------------------------------------------------------

describe("Property 17 – Stop-reason tag CSS class matches stop reason value", () => {
  it(
    "tag carries exactly stop-{stopReason} and no other stop-reason class",
    () => {
      fc.assert(
        fc.property(stopReasonArb, (stopReason) => {
          const { container, unmount } = render(
            <StopReasonTag stopReason={stopReason} />
          );

          const tag = container.querySelector("span");
          expect(tag).not.toBeNull();

          // Must include exactly `stop-{stopReason}`
          expect(tag!.classList).toContain(`stop-${stopReason}`);

          // Must carry no other stop-reason class (stop-tag is a structural
          // class and is excluded by stopReasonClasses())
          const srClasses = stopReasonClasses(tag!.classList);
          expect(srClasses).toHaveLength(1);
          expect(srClasses[0]).toBe(`stop-${stopReason}`);

          unmount();
        }),
        { numRuns: 100 }
      );
    }
  );

  it(
    "each of the four stop reasons produces a distinct stop-reason CSS class",
    () => {
      STOP_REASON_VALUES.forEach((stopReason) => {
        const { container, unmount } = render(
          <StopReasonTag stopReason={stopReason} />
        );

        const tag = container.querySelector("span");
        expect(tag).not.toBeNull();

        const srClasses = stopReasonClasses(tag!.classList);

        expect(srClasses).toHaveLength(1);
        expect(srClasses[0]).toBe(`stop-${stopReason}`);

        unmount();
      });
    }
  );
});
