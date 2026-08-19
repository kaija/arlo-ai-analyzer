/**
 * Property 4: setLanguage persists and synchronizes i18next
 *
 * For any valid locale L from {"en", "zh-TW", "ja"}, after calling
 * setLanguage(L), localStorage["arlo-language"] must equal L and
 * i18n.language must equal L, both before the next render.
 *
 * Validates: Requirements 3.3, 7.3, 7.4
 */

import { describe, it, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import * as fc from "fast-check";

import { LanguageProvider, useLanguageContext, type Locale } from "../LanguageContext";
import i18n from "../../i18n/i18n";

// ---------------------------------------------------------------------------
// Supported locales — mirrors LanguageContext's VALID_LOCALES
// ---------------------------------------------------------------------------

const SUPPORTED_LOCALES = ["en", "zh-TW", "ja"] as const;
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

const LOCALE_KEY = "arlo-language";

// ---------------------------------------------------------------------------
// Test helper: a component that captures setLanguage from the context so
// tests can call it imperatively, and exposes the current language value.
// ---------------------------------------------------------------------------

let capturedSetLanguage: ((locale: Locale) => void) | null = null;
let capturedLanguage: Locale | null = null;

function LanguageConsumer() {
  const { language, setLanguage } = useLanguageContext();
  capturedSetLanguage = setLanguage;
  capturedLanguage = language;
  return null;
}

// ---------------------------------------------------------------------------
// Cleanup: clear localStorage and reset i18n to "en" between tests to avoid
// cross-test pollution.
// ---------------------------------------------------------------------------

beforeEach(async () => {
  localStorage.clear();
  await i18n.changeLanguage("en");
  capturedSetLanguage = null;
  capturedLanguage = null;
});

afterEach(() => {
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// Property 4 — setLanguage persists and synchronizes i18next
// ---------------------------------------------------------------------------

describe("Property 4 – setLanguage persists and synchronizes i18next", () => {
  /**
   * Core property: for every valid locale L, calling setLanguage(L) must
   * simultaneously:
   *   1. write L to localStorage["arlo-language"]
   *   2. update i18n.language to L
   *
   * Uses fast-check to exercise all three supported locales across ≥100 runs.
   *
   * Validates: Requirements 3.3, 7.3, 7.4
   */
  it("setLanguage(L) writes L to localStorage and syncs i18n.language for all valid locales", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<SupportedLocale>(...SUPPORTED_LOCALES),
        async (locale) => {
          // Reset state before each property run
          localStorage.clear();
          await i18n.changeLanguage("en");
          capturedSetLanguage = null;

          const { unmount } = render(
            <LanguageProvider>
              <LanguageConsumer />
            </LanguageProvider>
          );

          expect(capturedSetLanguage).not.toBeNull();

          // Call setLanguage with the locale under test
          await act(async () => {
            capturedSetLanguage!(locale);
          });

          // 1. localStorage must have been updated
          const stored = localStorage.getItem(LOCALE_KEY);

          // 2. i18n instance language must match
          const i18nLang = i18n.language;

          unmount();

          return stored === locale && i18nLang === locale;
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Exhaustive: run once per locale for clear, named failure messages.
   *
   * Validates: Requirements 3.3, 7.3, 7.4
   */
  for (const locale of SUPPORTED_LOCALES) {
    it(`setLanguage("${locale}") writes "${locale}" to localStorage and sets i18n.language to "${locale}"`, async () => {
      const { unmount } = render(
        <LanguageProvider>
          <LanguageConsumer />
        </LanguageProvider>
      );

      expect(capturedSetLanguage).not.toBeNull();

      await act(async () => {
        capturedSetLanguage!(locale);
      });

      expect(
        localStorage.getItem(LOCALE_KEY),
        `localStorage["${LOCALE_KEY}"] should be "${locale}" after setLanguage("${locale}")`,
      ).toBe(locale);

      expect(
        i18n.language,
        `i18n.language should be "${locale}" after setLanguage("${locale}")`,
      ).toBe(locale);

      unmount();
    });
  }

  /**
   * Sequence property: calling setLanguage multiple times in sequence always
   * leaves localStorage and i18n.language consistent with the last call.
   *
   * This guards against race conditions or stale-closure bugs in the setter.
   *
   * Validates: Requirements 7.3, 7.4
   */
  it("the last setLanguage call wins — localStorage and i18n.language reflect the final locale", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a non-empty sequence of valid locales
        fc.array(fc.constantFrom<SupportedLocale>(...SUPPORTED_LOCALES), {
          minLength: 2,
          maxLength: 6,
        }),
        async (locales) => {
          localStorage.clear();
          await i18n.changeLanguage("en");
          capturedSetLanguage = null;

          const { unmount } = render(
            <LanguageProvider>
              <LanguageConsumer />
            </LanguageProvider>
          );

          // Apply all locales in sequence
          for (const loc of locales) {
            await act(async () => {
              capturedSetLanguage!(loc);
            });
          }

          const lastLocale = locales[locales.length - 1];
          const stored = localStorage.getItem(LOCALE_KEY);
          const i18nLang = i18n.language;

          unmount();

          return stored === lastLocale && i18nLang === lastLocale;
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * Idempotency: calling setLanguage with the same locale twice produces
   * the same outcome as calling it once.
   *
   * Validates: Requirements 3.3, 7.3
   */
  it("setLanguage is idempotent — calling it twice with the same locale is consistent", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<SupportedLocale>(...SUPPORTED_LOCALES),
        async (locale) => {
          localStorage.clear();
          await i18n.changeLanguage("en");
          capturedSetLanguage = null;

          const { unmount } = render(
            <LanguageProvider>
              <LanguageConsumer />
            </LanguageProvider>
          );

          await act(async () => {
            capturedSetLanguage!(locale);
          });
          await act(async () => {
            capturedSetLanguage!(locale);
          });

          const stored = localStorage.getItem(LOCALE_KEY);
          const i18nLang = i18n.language;

          unmount();

          return stored === locale && i18nLang === locale;
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * Context state reflection: after setLanguage(L), the language value
   * exposed by useLanguageContext() reflects L.
   *
   * Validates: Requirements 3.3
   */
  it("setLanguage(L) updates the language value in context to L", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<SupportedLocale>(...SUPPORTED_LOCALES),
        async (locale) => {
          localStorage.clear();
          capturedSetLanguage = null;
          capturedLanguage = null;

          const { unmount } = render(
            <LanguageProvider>
              <LanguageConsumer />
            </LanguageProvider>
          );

          await act(async () => {
            capturedSetLanguage!(locale);
          });

          const lang = capturedLanguage;
          unmount();

          return lang === locale;
        },
      ),
      { numRuns: 100 },
    );
  });
});
