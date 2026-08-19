/**
 * Property 3: Initialization reads and validates localStorage locale
 *
 * For any arbitrary string value S stored in `localStorage["arlo-language"]`,
 * `getStoredLocale()` must return S when S is one of {"en", "zh-TW", "ja"},
 * or return "en" for any other value (including an absent key).
 *
 * Validates: Requirements 3.2, 7.1, 7.2
 */

import { afterEach, describe, it } from "vitest";
import * as fc from "fast-check";
import {
  SUPPORTED_LOCALES,
  getStoredLocale,
} from "../i18n";

const LOCALE_KEY = "arlo-language";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setLocale(value: string): void {
  localStorage.setItem(LOCALE_KEY, value);
}

function clearLocale(): void {
  localStorage.removeItem(LOCALE_KEY);
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

afterEach(() => {
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// Property 3: Initialization reads and validates localStorage locale
// ---------------------------------------------------------------------------

describe("Property 3: Initialization reads and validates localStorage locale", () => {
  /**
   * Sub-property A: a stored valid locale is returned as-is.
   *
   * For any locale L in {en, zh-TW, ja}, storing L and reading it back
   * via getStoredLocale() must yield L.
   */
  it("returns the stored locale when it is a supported locale", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SUPPORTED_LOCALES),
        (locale) => {
          setLocale(locale);
          const result = getStoredLocale();
          clearLocale();
          return result === locale;
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Sub-property B: an arbitrary string that is NOT a supported locale falls
   * back to "en".
   *
   * fc.string() can occasionally produce one of the supported locales, so we
   * filter them out to keep the invariant clean.
   */
  it("falls back to 'en' when the stored value is not a supported locale", () => {
    const invalidLocaleArb = fc
      .string({ minLength: 0, maxLength: 20 })
      .filter((s) => !(SUPPORTED_LOCALES as readonly string[]).includes(s));

    fc.assert(
      fc.property(invalidLocaleArb, (invalid) => {
        setLocale(invalid);
        const result = getStoredLocale();
        clearLocale();
        return result === "en";
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Sub-property C: when the key is absent from localStorage, defaults to "en".
   *
   * This is the initial-state case: no previously stored language preference.
   */
  it("defaults to 'en' when 'arlo-language' is absent from localStorage", () => {
    clearLocale();
    const result = getStoredLocale();
    return result === "en";
  });

  /**
   * Sub-property D (exhaustive): each supported locale is an exact round-trip.
   *
   * Exhaustively checks all three supported locales individually to complement
   * the property-based sub-property A above.
   */
  it("round-trips correctly for each individual supported locale", () => {
    for (const locale of SUPPORTED_LOCALES) {
      setLocale(locale);
      const result = getStoredLocale();
      clearLocale();
      expect(result).toBe(locale);
    }
  });

  /**
   * Sub-property E: locale-like strings that aren't exact matches fall back.
   *
   * Variants such as "EN", "en-US", "zh", "zh-tw", "JA", etc. must not be
   * accepted — the validation is exact, case-sensitive.
   */
  it("falls back to 'en' for case-variants and prefix-matches of supported locales", () => {
    const nearMisses = [
      "EN", "En", "en-US", "en_US",
      "zh", "zh-tw", "zh-TW-extra", "zh-TW ",
      "JA", "Ja", "ja-JP", "ja ",
      " en", " zh-TW", " ja",
    ];

    fc.assert(
      fc.property(
        fc.constantFrom(...nearMisses),
        (invalid) => {
          setLocale(invalid);
          const result = getStoredLocale();
          clearLocale();
          return result === "en";
        },
      ),
      { numRuns: 50 },
    );
  });
});
