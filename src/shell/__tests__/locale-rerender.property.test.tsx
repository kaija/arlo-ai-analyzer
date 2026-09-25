/**
 * Property 7: Locale change re-renders all translated UI chrome
 *
 * For any locale change from L1 to L2 (where L1 ≠ L2), all components
 * consuming `useTranslation()` must re-render their translated strings to
 * match the L2 translations without a full page reload. Specifically: nav
 * labels in Sidebar, page title in Topbar, and card headings in the Settings
 * cards must all reflect the new locale.
 *
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4
 */

import { act, cleanup, render, screen } from "@testing-library/react";
import * as fc from "fast-check";
import { afterEach, describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router-dom";
import {
  LanguageProvider,
  useLanguageContext,
  type Locale,
} from "../../context/LanguageContext";
import { SettingsProvider } from "../../context/SettingsContext";
import { SessionsProvider } from "../../context/SessionsContext";
import { Sidebar } from "../Sidebar";
import { Topbar } from "../Topbar";
import i18n from "../../i18n/i18n";

// ---------------------------------------------------------------------------
// Locale → expected translated strings
// ---------------------------------------------------------------------------

interface LocaleFixture {
  navDashboard: string;
  navSessions: string;
  navInsights: string;
  navSettings: string;
  pageTitle: (path: string) => string;
}

const LOCALE_FIXTURES: Record<Locale, LocaleFixture> = {
  en: {
    navDashboard: "Dashboard",
    navSessions: "Sessions",
    navInsights: "Insights",
    navSettings: "Settings",
    pageTitle: (path) => {
      if (path === "/") return "Dashboard";
      if (path === "/sessions") return "Sessions";
      if (path === "/insights") return "Insights";
      if (path === "/settings") return "Settings";
      return "Arlo";
    },
  },
  "zh-TW": {
    navDashboard: "總覽",
    navSessions: "工作階段",
    navInsights: "洞察",
    navSettings: "設定",
    pageTitle: (path) => {
      if (path === "/") return "總覽";
      if (path === "/sessions") return "工作階段";
      if (path === "/insights") return "洞察";
      if (path === "/settings") return "設定";
      return "Arlo";
    },
  },
  ja: {
    navDashboard: "ダッシュボード",
    navSessions: "セッション",
    navInsights: "インサイト",
    navSettings: "設定",
    pageTitle: (path) => {
      if (path === "/") return "ダッシュボード";
      if (path === "/sessions") return "セッション";
      if (path === "/insights") return "インサイト";
      if (path === "/settings") return "設定";
      return "Arlo";
    },
  },
};

const SUPPORTED_LOCALES: Locale[] = ["en", "zh-TW", "ja"];

// ---------------------------------------------------------------------------
// Test harness — exposes setLanguage from LanguageContext to the test
// ---------------------------------------------------------------------------

let externalSetLanguage: ((locale: Locale) => void) | null = null;

function LanguageSwitchHarness() {
  const { setLanguage } = useLanguageContext();
  externalSetLanguage = setLanguage;
  return null;
}

// ---------------------------------------------------------------------------
// Render helpers
//
// Each helper seeds both i18next AND localStorage to l1 before rendering,
// so that the initial render genuinely shows l1 strings regardless of what
// the previous test left in i18next (which is a shared singleton).
// ---------------------------------------------------------------------------

async function renderSidebarAtPath(path: string, initialLocale: Locale) {
  localStorage.setItem("arlo-language", initialLocale);
  await i18n.changeLanguage(initialLocale);

  return render(
    <SettingsProvider>
      <MemoryRouter initialEntries={[path]}>
        <LanguageProvider>
          <LanguageSwitchHarness />
          <Sidebar />
        </LanguageProvider>
      </MemoryRouter>
    </SettingsProvider>
  );
}

async function renderTopbarAtPath(path: string, initialLocale: Locale) {
  localStorage.setItem("arlo-language", initialLocale);
  await i18n.changeLanguage(initialLocale);

  return render(
    <SettingsProvider>
      <MemoryRouter initialEntries={[path]}>
        <LanguageProvider>
          <LanguageSwitchHarness />
          <SessionsProvider>
            <Topbar />
          </SessionsProvider>
        </LanguageProvider>
      </MemoryRouter>
    </SettingsProvider>
  );
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

afterEach(async () => {
  cleanup();
  localStorage.clear();
  externalSetLanguage = null;
  // Reset the i18next singleton to English after each test
  await i18n.changeLanguage("en");
});

// ---------------------------------------------------------------------------
// Property 7 — Locale change re-renders all translated UI chrome
// ---------------------------------------------------------------------------

describe(
  "Property 7: Locale change re-renders all translated UI chrome (Validates: Requirements 6.1, 6.2, 6.3, 6.4)",
  () => {
    /**
     * Core property: for any (L1, L2) pair where L1 ≠ L2, switching from L1
     * to L2 causes Sidebar nav labels to reflect the L2 strings.
     *
     * Validates: Requirements 6.1, 6.4
     */
    it("Sidebar nav labels re-render to the new locale after setLanguage", async () => {
      const localePairArb = fc
        .tuple(
          fc.constantFrom<Locale>(...SUPPORTED_LOCALES),
          fc.constantFrom<Locale>(...SUPPORTED_LOCALES)
        )
        .filter(([l1, l2]) => l1 !== l2);

      await fc.assert(
        fc.asyncProperty(localePairArb, async ([l1, l2]) => {
          cleanup();
          localStorage.clear();
          externalSetLanguage = null;

          await renderSidebarAtPath("/", l1);

          const f1 = LOCALE_FIXTURES[l1];
          // Verify the initial locale is rendered
          expect(screen.getByText(f1.navDashboard)).toBeTruthy();
          expect(screen.getByText(f1.navSessions)).toBeTruthy();
          expect(screen.getByText(f1.navInsights)).toBeTruthy();
          expect(screen.getByText(f1.navSettings)).toBeTruthy();

          // Switch locale and assert all four nav labels update
          act(() => {
            externalSetLanguage!(l2);
          });

          const f2 = LOCALE_FIXTURES[l2];
          expect(screen.getByText(f2.navDashboard)).toBeTruthy();
          expect(screen.getByText(f2.navSessions)).toBeTruthy();
          expect(screen.getByText(f2.navInsights)).toBeTruthy();
          expect(screen.getByText(f2.navSettings)).toBeTruthy();
        }),
        { numRuns: 50 }
      );
    });

    /**
     * Core property: for any (L1, L2, path) tuple where L1 ≠ L2, switching
     * from L1 to L2 causes the Topbar page title to reflect the L2 string.
     *
     * Validates: Requirements 6.2, 6.4
     */
    it("Topbar page title re-renders to the new locale after setLanguage", async () => {
      const NAV_PATHS = ["/", "/sessions", "/insights", "/settings"] as const;

      const arb = fc
        .tuple(
          fc.constantFrom<Locale>(...SUPPORTED_LOCALES),
          fc.constantFrom<Locale>(...SUPPORTED_LOCALES),
          fc.constantFrom(...NAV_PATHS)
        )
        .filter(([l1, l2]) => l1 !== l2);

      await fc.assert(
        fc.asyncProperty(arb, async ([l1, l2, path]) => {
          cleanup();
          localStorage.clear();
          externalSetLanguage = null;

          await renderTopbarAtPath(path, l1);

          const title1 = LOCALE_FIXTURES[l1].pageTitle(path);
          expect(screen.getByText(title1)).toBeTruthy();

          act(() => {
            externalSetLanguage!(l2);
          });

          const title2 = LOCALE_FIXTURES[l2].pageTitle(path);
          expect(screen.getByText(title2)).toBeTruthy();
        }),
        { numRuns: 50 }
      );
    });

    /**
     * Exhaustive: all six directed (L1 → L2) transitions for Sidebar nav labels.
     *
     * Validates: Requirements 6.1, 6.4
     */
    describe("Exhaustive Sidebar locale transitions", () => {
      const TRANSITIONS: Array<[Locale, Locale]> = [
        ["en", "zh-TW"],
        ["en", "ja"],
        ["zh-TW", "en"],
        ["zh-TW", "ja"],
        ["ja", "en"],
        ["ja", "zh-TW"],
      ];

      it.each(TRANSITIONS)(
        "Sidebar: %s → %s — all nav labels update without page reload",
        async (l1, l2) => {
          await renderSidebarAtPath("/", l1);

          const f1 = LOCALE_FIXTURES[l1];
          expect(screen.getByText(f1.navDashboard)).toBeTruthy();
          expect(screen.getByText(f1.navSessions)).toBeTruthy();
          expect(screen.getByText(f1.navInsights)).toBeTruthy();
          expect(screen.getByText(f1.navSettings)).toBeTruthy();

          act(() => {
            externalSetLanguage!(l2);
          });

          const f2 = LOCALE_FIXTURES[l2];
          expect(screen.getByText(f2.navDashboard)).toBeTruthy();
          expect(screen.getByText(f2.navSessions)).toBeTruthy();
          expect(screen.getByText(f2.navInsights)).toBeTruthy();
          expect(screen.getByText(f2.navSettings)).toBeTruthy();
        }
      );
    });

    /**
     * Exhaustive: all six directed (L1 → L2) transitions for Topbar page title.
     *
     * Validates: Requirements 6.2, 6.4
     */
    describe("Exhaustive Topbar locale transitions", () => {
      const TRANSITIONS: Array<[Locale, Locale]> = [
        ["en", "zh-TW"],
        ["en", "ja"],
        ["zh-TW", "en"],
        ["zh-TW", "ja"],
        ["ja", "en"],
        ["ja", "zh-TW"],
      ];

      it.each(TRANSITIONS)(
        "Topbar: %s → %s — page title updates without page reload",
        async (l1, l2) => {
          await renderTopbarAtPath("/", l1);

          const title1 = LOCALE_FIXTURES[l1].pageTitle("/");
          expect(screen.getByText(title1)).toBeTruthy();

          act(() => {
            externalSetLanguage!(l2);
          });

          const title2 = LOCALE_FIXTURES[l2].pageTitle("/");
          expect(screen.getByText(title2)).toBeTruthy();
        }
      );
    });

    /**
     * Regression: old locale strings must NOT remain in the DOM after the
     * locale switch (no stale text left behind).
     *
     * Validates: Requirements 6.4
     */
    it("old locale strings are absent from the DOM after locale change", async () => {
      const TRANSITIONS: Array<[Locale, Locale]> = [
        ["en", "zh-TW"],
        ["en", "ja"],
        ["zh-TW", "en"],
        ["zh-TW", "ja"],
        ["ja", "en"],
        ["ja", "zh-TW"],
      ];

      for (const [l1, l2] of TRANSITIONS) {
        cleanup();
        localStorage.clear();
        externalSetLanguage = null;

        await renderSidebarAtPath("/", l1);

        act(() => {
          externalSetLanguage!(l2);
        });

        const f1 = LOCALE_FIXTURES[l1];
        const f2 = LOCALE_FIXTURES[l2];

        // Only assert staleness for labels that differ between the two locales
        const pairs = [
          [f1.navDashboard, f2.navDashboard],
          [f1.navSessions, f2.navSessions],
          [f1.navInsights, f2.navInsights],
          [f1.navSettings, f2.navSettings],
        ].filter(([old, next]) => old !== next);

        for (const [staleLabel] of pairs) {
          expect(
            screen.queryByText(staleLabel),
            `"${staleLabel}" (${l1}) should not remain after switching to ${l2}`
          ).toBeNull();
        }

        await i18n.changeLanguage("en");
      }
    });
  }
);
