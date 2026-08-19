/**
 * Property 5: Fallback — missing non-English keys return English string
 *
 * For any translation key K that is present in `en.json` but absent from
 * `zh-TW.json` or `ja.json`, calling `t(K)` with `lng` set to `zh-TW` or
 * `ja` must return the English string for K rather than an empty string or
 * the raw key.
 *
 * Uses `i18next.createInstance()` to build an isolated instance with a
 * deliberately incomplete non-English locale, so the production i18n instance
 * is never mutated.
 *
 * Validates: Requirements 1.4, 2.7
 */

import { describe, it, beforeEach } from "vitest";
import * as fc from "fast-check";
import i18next from "i18next";
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

// ---------------------------------------------------------------------------
// Helper — look up a dot-notation key in a flat Record
// ---------------------------------------------------------------------------

function getByPath(obj: Record<string, unknown>, dotKey: string): unknown {
  return dotKey.split(".").reduce<unknown>((node, segment) => {
    if (node !== null && typeof node === "object" && !Array.isArray(node)) {
      return (node as Record<string, unknown>)[segment];
    }
    return undefined;
  }, obj);
}

// All leaf keys from the English source of truth
const EN_KEYS: string[] = flattenKeys(en as Record<string, unknown>);

// ---------------------------------------------------------------------------
// Build a stripped-down locale resource: a flat translation map containing
// only the top-level "nav" keys to represent a partial/incomplete locale.
// Every key *outside* this subset is intentionally absent — these are the
// keys the fallback tests target.
//
// Using a flat namespace avoids needing to reconstruct the nested JSON tree
// while still exercising i18next's fallback path for missing keys.
// ---------------------------------------------------------------------------

/** Returns a flat translation object that deliberately omits `keysToRemove`. */
function buildIncompleteTranslations(keysToRemove: string[]): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const key of EN_KEYS) {
    const englishValue = getByPath(en as Record<string, unknown>, key);
    if (typeof englishValue === "string") {
      flat[key] = `INCOMPLETE_${key}`; // distinct value so we know it's NOT the fallback
    }
  }
  for (const key of keysToRemove) {
    delete flat[key];
  }
  return flat;
}

// ---------------------------------------------------------------------------
// Factory — creates a fresh, isolated i18next instance whose non-English
// locale is missing exactly `missingKeys`.
// ---------------------------------------------------------------------------

async function createFallbackInstance(
  missingKeys: string[],
): Promise<ReturnType<typeof i18next.createInstance>> {
  const incompleteTranslations = buildIncompleteTranslations(missingKeys);
  const englishTranslations: Record<string, string> = {};
  for (const key of EN_KEYS) {
    const value = getByPath(en as Record<string, unknown>, key);
    if (typeof value === "string") {
      englishTranslations[key] = value;
    }
  }

  const instance = i18next.createInstance();
  await instance.init({
    // Use a flat keypath separator that matches our dot-notation keys
    resources: {
      en: { translation: englishTranslations },
      "zh-TW": { translation: incompleteTranslations },
      ja: { translation: incompleteTranslations },
    },
    lng: "zh-TW",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    // keySeparator: "." is the default, which aligns with our dot-notation keys
  });
  return instance;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Property 5 – Fallback: missing non-English keys return English string", () => {
  let instance: Awaited<ReturnType<typeof createFallbackInstance>>;

  // We remove a fixed representative subset of keys from the non-English
  // locale so every sub-test can rely on a pre-built instance.
  const MISSING_KEYS = [
    "page.dashboard",
    "page.sessions",
    "page.sessionDetail",
    "page.insights",
    "page.settings",
    "topbar.toggleTheme",
    "settings.planBudget.title",
    "settings.notifications.title",
    "settings.logsDirectory.title",
    "settings.pricing.title",
    "settings.language.title",
  ];

  beforeEach(async () => {
    instance = await createFallbackInstance(MISSING_KEYS);
  });

  /**
   * Sub-property A (property-based): for any key in MISSING_KEYS, t(key) with
   * lng "zh-TW" returns the English string.
   *
   * Validates: Requirements 1.4, 2.7
   */
  it("t(key, {lng:'zh-TW'}) returns the English string for any key absent from zh-TW locale", () => {
    fc.assert(
      fc.property(fc.constantFrom(...MISSING_KEYS), (key) => {
        const result = instance.t(key, { lng: "zh-TW" });
        const expected = getByPath(en as Record<string, unknown>, key);
        return result === expected;
      }),
      { numRuns: MISSING_KEYS.length },
    );
  });

  /**
   * Sub-property B (property-based): same invariant for locale "ja".
   *
   * Validates: Requirements 1.4, 2.7
   */
  it("t(key, {lng:'ja'}) returns the English string for any key absent from ja locale", () => {
    fc.assert(
      fc.property(fc.constantFrom(...MISSING_KEYS), (key) => {
        const result = instance.t(key, { lng: "ja" });
        const expected = getByPath(en as Record<string, unknown>, key);
        return result === expected;
      }),
      { numRuns: MISSING_KEYS.length },
    );
  });

  /**
   * Sub-property C: the fallback value is never an empty string.
   *
   * Validates: Requirements 1.4, 2.7
   */
  it("the fallback value is never empty for any missing key in either locale", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...MISSING_KEYS),
        fc.constantFrom("zh-TW", "ja"),
        (key, locale) => {
          const result = instance.t(key, { lng: locale });
          return typeof result === "string" && result.trim().length > 0;
        },
      ),
      { numRuns: MISSING_KEYS.length * 2 },
    );
  });

  /**
   * Sub-property D: the fallback value is never the raw key string.
   *
   * i18next returns the raw key as a last resort when no fallback exists.
   * This sub-property ensures the English fallback is reached before that.
   *
   * Validates: Requirements 1.4, 2.7
   */
  it("the fallback value is never the raw key string for any missing key in either locale", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...MISSING_KEYS),
        fc.constantFrom("zh-TW", "ja"),
        (key, locale) => {
          const result = instance.t(key, { lng: locale });
          return result !== key;
        },
      ),
      { numRuns: MISSING_KEYS.length * 2 },
    );
  });

  /**
   * Sub-property E (exhaustive): present keys in the non-English locale are
   * NOT affected — they return their own locale-specific value, not English.
   *
   * This guards against an overly-aggressive fallback that always returns
   * English even when a translation exists.
   *
   * Validates: Requirements 1.4, 2.7
   */
  it("keys present in the non-English locale return their own locale value, not English", () => {
    const presentKeys = EN_KEYS.filter((k) => !MISSING_KEYS.includes(k));
    if (presentKeys.length === 0) return; // guard for empty case

    fc.assert(
      fc.property(fc.constantFrom(...presentKeys), (key) => {
        const resultZh = instance.t(key, { lng: "zh-TW" });
        const resultJa = instance.t(key, { lng: "ja" });
        // The incomplete locale uses "INCOMPLETE_<key>" as the value
        return (
          resultZh === `INCOMPLETE_${key}` &&
          resultJa === `INCOMPLETE_${key}`
        );
      }),
      { numRuns: Math.min(presentKeys.length, 50) },
    );
  });

  /**
   * Exhaustive: one assertion per (locale, missing key) pair so failures
   * pinpoint exactly which key/locale combination does not fall back correctly.
   *
   * Validates: Requirements 1.4, 2.7
   */
  for (const locale of ["zh-TW", "ja"] as const) {
    describe(`locale: ${locale}`, () => {
      it.each(MISSING_KEYS)(
        `t("%s") falls back to English when key is absent from ${locale}`,
        (key) => {
          const result = instance.t(key, { lng: locale });
          const expected = getByPath(en as Record<string, unknown>, key);

          expect(
            result,
            `key "${key}" in locale "${locale}" should fall back to English`,
          ).toBe(expected);

          expect(
            result.trim().length,
            `key "${key}" in locale "${locale}" fallback should not be empty`,
          ).toBeGreaterThan(0);

          expect(
            result,
            `key "${key}" in locale "${locale}" should not return the raw key`,
          ).not.toBe(key);
        },
      );
    });
  }
});
