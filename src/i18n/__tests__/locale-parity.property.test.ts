/**
 * Property 2: Key parity — every English key is present in all locale files
 *
 * For any translation key K that appears in `en.json`, the key K must also
 * appear in `zh-TW.json` and `ja.json` with a non-empty string value. No key
 * present in the English source-of-truth file may be absent from either
 * non-English locale file.
 *
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
 */

import { describe, it } from "vitest";
import * as fc from "fast-check";
import en from "../locales/en.json";
import zhTW from "../locales/zh-TW.json";
import ja from "../locales/ja.json";

// ---------------------------------------------------------------------------
// Helper — flatten a nested JSON object into dot-notation keys
//
// e.g. { nav: { dashboard: "Dashboard" } } → ["nav.dashboard"]
// ---------------------------------------------------------------------------

function flattenKeys(
  obj: Record<string, unknown>,
  prefix = ""
): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      return flattenKeys(value as Record<string, unknown>, full);
    }
    return [full];
  });
}

// ---------------------------------------------------------------------------
// Helper — resolve a dot-notation key against a nested object, returning the
// leaf value (or undefined if the path does not exist)
// ---------------------------------------------------------------------------

function getByPath(
  obj: Record<string, unknown>,
  dotKey: string
): unknown {
  return dotKey.split(".").reduce<unknown>((node, segment) => {
    if (node !== null && typeof node === "object" && !Array.isArray(node)) {
      return (node as Record<string, unknown>)[segment];
    }
    return undefined;
  }, obj);
}

// ---------------------------------------------------------------------------
// Build the complete list of dot-notation keys from the English source file
// ---------------------------------------------------------------------------

const EN_KEYS: string[] = flattenKeys(en as Record<string, unknown>);

// ---------------------------------------------------------------------------
// Property 2 — Key parity
// ---------------------------------------------------------------------------

describe("Property 2 – Key parity: every English key exists in all locale files", () => {
  /**
   * Sub-property A: every key in en.json exists in zh-TW.json with a
   * non-empty string value.
   *
   * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
   */
  it("every key in en.json is present in zh-TW.json with a non-empty string value", () => {
    fc.assert(
      fc.property(fc.constantFrom(...EN_KEYS), (key) => {
        const value = getByPath(zhTW as Record<string, unknown>, key);
        return typeof value === "string" && value.trim().length > 0;
      }),
      { numRuns: EN_KEYS.length }
    );
  });

  /**
   * Sub-property B: every key in en.json exists in ja.json with a
   * non-empty string value.
   *
   * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
   */
  it("every key in en.json is present in ja.json with a non-empty string value", () => {
    fc.assert(
      fc.property(fc.constantFrom(...EN_KEYS), (key) => {
        const value = getByPath(ja as Record<string, unknown>, key);
        return typeof value === "string" && value.trim().length > 0;
      }),
      { numRuns: EN_KEYS.length }
    );
  });

  /**
   * Sub-property C: all three locale files contain the same number of keys.
   *
   * A count mismatch would indicate an extra key in a non-English file that
   * is not in the source of truth (or a missing key caught by A/B above).
   *
   * Validates: Requirements 2.6
   */
  it("zh-TW.json and ja.json contain the same number of leaf keys as en.json", () => {
    const zhTWKeys = flattenKeys(zhTW as Record<string, unknown>);
    const jaKeys = flattenKeys(ja as Record<string, unknown>);

    expect(zhTWKeys.length).toBe(EN_KEYS.length);
    expect(jaKeys.length).toBe(EN_KEYS.length);
  });

  /**
   * Exhaustive enumeration: run once per key to provide clear failure messages
   * identifying exactly which key is missing when a parity check fails.
   *
   * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
   */
  it.each(EN_KEYS)('key "%s" exists in zh-TW.json with a non-empty value', (key) => {
    const value = getByPath(zhTW as Record<string, unknown>, key);
    expect(typeof value, `zh-TW.json key "${key}" should be a string`).toBe("string");
    expect(
      (value as string).trim().length,
      `zh-TW.json key "${key}" should not be empty`
    ).toBeGreaterThan(0);
  });

  it.each(EN_KEYS)('key "%s" exists in ja.json with a non-empty value', (key) => {
    const value = getByPath(ja as Record<string, unknown>, key);
    expect(typeof value, `ja.json key "${key}" should be a string`).toBe("string");
    expect(
      (value as string).trim().length,
      `ja.json key "${key}" should not be empty`
    ).toBeGreaterThan(0);
  });
});
