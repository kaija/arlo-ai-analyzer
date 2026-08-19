/**
 * Property 1: Registered locales return non-empty strings for all keys
 *
 * For any translation key that exists in the English locale resource, calling
 * t(key) after setting the active language to each of `en`, `zh-TW`, and `ja`
 * should return a non-empty string.
 *
 * Validates: Requirements 1.3
 */

import { describe, it, beforeEach } from "vitest";
import * as fc from "fast-check";
import i18n from "../i18n";
import en from "../locales/en.json";

// ---------------------------------------------------------------------------
// Helper — flatten a nested JSON object into dot-notation keys
// ---------------------------------------------------------------------------

function flattenKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      return flattenKeys(value as Record<string, unknown>, full);
    }
    return [full];
  });
}

// Complete list of dot-notation keys from the English source of truth
const EN_KEYS: string[] = flattenKeys(en as Record<string, unknown>);

// The three supported locales
const SUPPORTED_LOCALES = ["en", "zh-TW", "ja"] as const;
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

// ---------------------------------------------------------------------------
// Ensure the i18n instance is initialized and reset to "en" before each test
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

// ---------------------------------------------------------------------------
// Property 1 — Registered locales return non-empty strings for all keys
// ---------------------------------------------------------------------------

describe("Property 1 – Registered locales return non-empty strings for all keys", () => {
  /**
   * For each supported locale, every translation key from en.json must
   * resolve to a non-empty string via `i18n.t()`.
   *
   * The arbitrary samples keys from the full EN_KEYS list and the locale from
   * the three supported locales, exercising every (locale, key) combination.
   *
   * Validates: Requirements 1.3
   */
  it("t(key) returns a non-empty string for all keys in all supported locales", async () => {
    const localeArb = fc.constantFrom<SupportedLocale>(...SUPPORTED_LOCALES);
    const keyArb = fc.constantFrom(...EN_KEYS);

    await fc.assert(
      fc.asyncProperty(localeArb, keyArb, async (locale, key) => {
        await i18n.changeLanguage(locale);
        const result = i18n.t(key);
        return typeof result === "string" && result.trim().length > 0;
      }),
      { numRuns: EN_KEYS.length * SUPPORTED_LOCALES.length },
    );
  });

  /**
   * Exhaustive: run once per (locale, key) pair so a failure message
   * identifies exactly which key/locale combination returns empty.
   *
   * Validates: Requirements 1.3
   */
  for (const locale of SUPPORTED_LOCALES) {
    describe(`locale: ${locale}`, () => {
      it.each(EN_KEYS)(`t("%s") returns a non-empty string`, async (key) => {
        await i18n.changeLanguage(locale);
        const result = i18n.t(key);
        expect(typeof result, `key "${key}" should resolve to a string`).toBe("string");
        expect(
          result.trim().length,
          `key "${key}" in locale "${locale}" should not be empty`,
        ).toBeGreaterThan(0);
      });
    });
  }
});
