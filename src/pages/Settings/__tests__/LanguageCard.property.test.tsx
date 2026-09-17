/**
 * Property 6: LanguageCard selection triggers setLanguage
 *
 * For any valid locale L from {"en", "zh-TW", "ja"}, clicking the
 * corresponding option in LanguageCard must invoke setLanguage with exactly L,
 * and the corresponding button must carry aria-pressed="true" while all others
 * carry aria-pressed="false".
 *
 * Validates: Requirements 5.3, 5.4
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as fc from "fast-check";
import { afterEach, beforeEach, describe, it } from "vitest";
import i18n from "../../../i18n/i18n";
import { LanguageProvider, type Locale } from "../../../context/LanguageContext";
import { LanguageCard } from "../LanguageCard";

// ---------------------------------------------------------------------------
// Supported locales and their display labels (mirrors LanguageCard internals)
// ---------------------------------------------------------------------------

const SUPPORTED_LOCALES = ["en", "zh-TW", "ja"] as const;
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

const LOCALE_LABELS: Record<SupportedLocale, string> = {
  en: "English",
  "zh-TW": "繁體中文",
  ja: "日本語",
};

// ---------------------------------------------------------------------------
// Render helper: wraps LanguageCard in LanguageProvider
// ---------------------------------------------------------------------------

function renderLanguageCard() {
  return render(
    <LanguageProvider>
      <LanguageCard />
    </LanguageProvider>
  );
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  localStorage.clear();
  await i18n.changeLanguage("en");
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// Helper: query all three language buttons after rendering
// ---------------------------------------------------------------------------

function getButtons(): Record<SupportedLocale, HTMLElement> {
  return {
    en: screen.getByRole("button", { name: LOCALE_LABELS.en }),
    "zh-TW": screen.getByRole("button", { name: LOCALE_LABELS["zh-TW"] }),
    ja: screen.getByRole("button", { name: LOCALE_LABELS.ja }),
  };
}

// ---------------------------------------------------------------------------
// Property 6 — LanguageCard selection triggers setLanguage
// ---------------------------------------------------------------------------

describe("Property 6 – LanguageCard selection triggers setLanguage", () => {
  /**
   * Core property: for every valid locale L, clicking the L button must:
   *   1. Mark that button with aria-pressed="true"
   *   2. Mark all other buttons with aria-pressed="false"
   *
   * Uses fast-check exhaustively over the three supported locales.
   *
   * Validates: Requirements 5.3, 5.4
   */
  it("clicking a locale button sets aria-pressed=true on that button only", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<SupportedLocale>(...SUPPORTED_LOCALES),
        (targetLocale) => {
          cleanup();
          localStorage.clear();

          renderLanguageCard();

          const buttons = getButtons();

          // Click the target locale button
          fireEvent.click(buttons[targetLocale]);

          // Re-query buttons after state update
          const updatedButtons = getButtons();

          const allCorrect = SUPPORTED_LOCALES.every((loc) => {
            const expected = loc === targetLocale ? "true" : "false";
            const actual = updatedButtons[loc].getAttribute("aria-pressed");
            return actual === expected;
          });

          return allCorrect;
        }
      ),
      // The domain is three locales, so 100 full React renders is 97 repeats —
      // enough to blow the 5s test timeout when the suite runs in parallel.
      { numRuns: SUPPORTED_LOCALES.length * 4 }
    );
  });

  /**
   * Exhaustive: one named test per locale for clear failure messages.
   *
   * Validates: Requirements 5.3, 5.4
   */
  for (const targetLocale of SUPPORTED_LOCALES) {
    it(`clicking the "${targetLocale}" button marks it aria-pressed=true and all others aria-pressed=false`, () => {
      renderLanguageCard();

      const buttons = getButtons();

      fireEvent.click(buttons[targetLocale]);

      const updatedButtons = getButtons();

      // The clicked button must be pressed
      expect(updatedButtons[targetLocale]).toHaveAttribute(
        "aria-pressed",
        "true"
      );

      // All other buttons must not be pressed
      const others = SUPPORTED_LOCALES.filter((l) => l !== targetLocale);
      for (const other of others) {
        expect(updatedButtons[other]).toHaveAttribute("aria-pressed", "false");
      }
    });
  }

  /**
   * Transition property: switching from one locale to another always leaves
   * exactly one button with aria-pressed="true".
   *
   * Validates: Requirements 5.4
   */
  it("exactly one button carries aria-pressed=true after any locale selection", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<SupportedLocale>(...SUPPORTED_LOCALES),
        fc.constantFrom<SupportedLocale>(...SUPPORTED_LOCALES),
        (first, second) => {
          cleanup();
          localStorage.clear();

          renderLanguageCard();

          const buttons = getButtons();

          // Select first locale
          fireEvent.click(buttons[first]);
          // Select second locale (may be the same)
          fireEvent.click(getButtons()[second]);

          const allButtons = getButtons();
          const pressedCount = SUPPORTED_LOCALES.filter(
            (loc) => allButtons[loc].getAttribute("aria-pressed") === "true"
          ).length;

          // Exactly one button should be pressed at all times
          return pressedCount === 1;
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Locale sync: after clicking a language button, i18n.language and
   * localStorage["arlo-language"] must both equal the selected locale.
   *
   * Validates: Requirements 5.3
   */
  it("clicking a locale button synchronizes i18n.language and localStorage", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<SupportedLocale>(...SUPPORTED_LOCALES),
        (locale) => {
          cleanup();
          localStorage.clear();

          renderLanguageCard();

          fireEvent.click(screen.getByRole("button", { name: LOCALE_LABELS[locale] }));

          const stored = localStorage.getItem("arlo-language");
          const i18nLang = i18n.language;

          return stored === locale && i18nLang === locale;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Initial state: before any click, the button for the active locale
   * (default "en") has aria-pressed="true".
   *
   * Validates: Requirements 5.4
   */
  it("renders with aria-pressed=true on the currently active locale button by default", () => {
    renderLanguageCard();

    const buttons = getButtons();

    // Default locale is "en"
    expect(buttons.en).toHaveAttribute("aria-pressed", "true");
    expect(buttons["zh-TW"]).toHaveAttribute("aria-pressed", "false");
    expect(buttons.ja).toHaveAttribute("aria-pressed", "false");
  });
});
