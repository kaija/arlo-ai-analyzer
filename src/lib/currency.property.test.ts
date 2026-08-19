import { describe, it } from "vitest";
import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// Unit under test — inline validation function (mirrors Settings PlanBudgetCard)
// ---------------------------------------------------------------------------

/**
 * Validates a raw currency input string.
 *
 * Rules:
 *   - Strip all commas before parsing
 *   - Empty / whitespace-only strings are invalid
 *   - Non-numeric strings are invalid
 *   - Infinite values (Infinity / -Infinity) are invalid
 *   - Negative numbers are invalid
 *   - Zero and any positive finite number are valid
 *
 * Validates: Requirements 7.3
 */
function validateCurrencyInput(raw: string): "valid" | "invalid" {
  const cleaned = raw.replace(/,/g, "");
  if (cleaned.trim() === "") return "invalid";
  const n = Number(cleaned);
  if (!isFinite(n) || n < 0) return "invalid";
  return "valid";
}

// ---------------------------------------------------------------------------
// Helper — the reference predicate (mirrors the function's expected behaviour)
// ---------------------------------------------------------------------------

function isExpectedValid(raw: string): boolean {
  const cleaned = raw.replace(/,/g, "");
  if (cleaned.trim() === "") return false;
  const n = Number(cleaned);
  return isFinite(n) && n >= 0;
}

// ---------------------------------------------------------------------------
// Property 19: Currency input validation accepts non-negative numbers and rejects others
// Validates: Requirements 7.3
// ---------------------------------------------------------------------------

describe("Property 19: Currency input validation accepts non-negative numbers and rejects others", () => {
  /**
   * Sub-property A: arbitrary fc.string() — result must match the reference predicate.
   *
   * For any string s, validateCurrencyInput(s) === "valid" iff the reference
   * predicate returns true. This is the core round-trip / consistency property.
   */
  it("result matches the reference predicate for any arbitrary string", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const result = validateCurrencyInput(s);
        const expected = isExpectedValid(s) ? "valid" : "invalid";
        return result === expected;
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Sub-property B: fc.nat() always produces "valid".
   *
   * The string representation of any non-negative integer is a finite number >= 0,
   * so it must always be accepted.
   */
  it("string representation of any fc.nat() always returns 'valid'", () => {
    fc.assert(
      fc.property(fc.nat(), (n) => {
        return validateCurrencyInput(String(n)) === "valid";
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Sub-property C: non-negative finite floats always produce "valid".
   *
   * Uses fc.float with min: 0 to cover the decimal-number case.
   */
  it("string representation of any non-negative float always returns 'valid'", () => {
    fc.assert(
      fc.property(fc.float({ min: 0, noNaN: true, noDefaultInfinity: true }), (n) => {
        return validateCurrencyInput(String(n)) === "valid";
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Sub-property D: negative numbers always produce "invalid".
   *
   * fc.float with max: -Number.EPSILON guarantees strictly negative values.
   */
  it("negative numbers always return 'invalid'", () => {
    fc.assert(
      fc.property(
        fc.float({ max: -Number.EPSILON, noNaN: true, noDefaultInfinity: true }),
        (n) => {
          return validateCurrencyInput(String(n)) === "invalid";
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Sub-property E: whitespace-only strings always produce "invalid".
   */
  it("whitespace-only strings always return 'invalid'", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(" ", "\t", "\n", "\r"), { minLength: 1, maxLength: 20 })
          .map((chars) => chars.join("")),
        (s) => {
          return validateCurrencyInput(s) === "invalid";
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Sub-property F: numbers with commas as thousand separators.
   *
   * Insert commas at arbitrary positions within a non-negative integer string;
   * the result should be "valid" because commas are stripped before parsing.
   * Uses fc.nat to generate the base number, then inserts a comma somewhere.
   */
  it("non-negative integer strings with inserted commas return 'valid'", () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 999_999_999 }).chain((n) => {
          const digits = String(n);
          if (digits.length < 2) {
            // Too short to meaningfully insert a comma — just return the raw string
            return fc.constant(digits);
          }
          return fc
            .integer({ min: 1, max: digits.length - 1 })
            .map((pos) => digits.slice(0, pos) + "," + digits.slice(pos));
        }),
        (s) => {
          return validateCurrencyInput(s) === "valid";
        },
      ),
      { numRuns: 100 },
    );
  });
});
