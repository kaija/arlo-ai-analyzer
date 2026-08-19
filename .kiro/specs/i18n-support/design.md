# Design Document — i18n Support

## Overview

This feature adds multi-language (i18n) support to the Arlo AI Analyzer application using `react-i18next` and `i18next`. Three locales are supported: English (`en`, default), Traditional Chinese (`zh-TW`), and Japanese (`ja`). All UI chrome — navigation labels, page headings, card titles, buttons, hints, and error messages — is translatable. Session data and raw AI output remain untranslated.

The implementation follows the project's existing patterns:

- `LanguageContext` mirrors the `SettingsContext` structure (default-initializer, `createContext`, provider, consumer hook).
- Locale selection persists to `localStorage` under the key `arlo-language`.
- The i18n instance is initialized before the React tree mounts by importing `src/i18n/i18n.ts` at the top of `src/main.tsx`.

---

## Architecture

### High-Level Data Flow

```
localStorage["arlo-language"]
        │
        ▼
  i18n.ts (init)  ◄──── src/i18n/locales/{en,zh-TW,ja}.json
        │
        ▼
  LanguageProvider  (src/context/LanguageContext.tsx)
        │  exposes: language, setLanguage
        ▼
  Components call useTranslation() / t("key")
        │
        ▼
  UI strings resolved by react-i18next
        │
        ▼
  LanguageCard on Settings page → user selects locale
        │  calls setLanguage(locale)
        ▼
  i18n.changeLanguage(locale)  +  localStorage.setItem("arlo-language", locale)
        │
        ▼
  All t()-call sites re-render in new locale
```

### Module Map

```
src/
├── i18n/
│   ├── i18n.ts                    # i18next init module (imported before React tree)
│   └── locales/
│       ├── en.json                # English strings (source of truth)
│       ├── zh-TW.json             # Traditional Chinese strings
│       └── ja.json                # Japanese strings
├── context/
│   └── LanguageContext.tsx        # LanguageContext + LanguageProvider + useLanguageContext
├── shell/
│   ├── Sidebar.tsx                # updated: nav labels via t()
│   └── Topbar.tsx                 # updated: page titles and aria-label via t()
├── pages/
│   └── Settings/
│       ├── index.tsx              # updated: adds <LanguageCard />
│       ├── LanguageCard.tsx       # new: language switcher card
│       ├── PlanBudgetCard.tsx     # updated: labels via t()
│       ├── NotificationsCard.tsx  # updated: labels via t()
│       ├── LogsDirectoryCard.tsx  # updated: labels via t()
│       └── PricingCard.tsx        # updated: labels via t()
└── main.tsx                       # updated: import i18n.ts + wrap with LanguageProvider
```

---

## Components and Interfaces

### `src/i18n/i18n.ts` — Initialization Module

Initializes `i18next` with the `initReactI18next` plugin and registers all three locale resource bundles before any component renders. Reads `localStorage["arlo-language"]` to set the initial language.

```typescript
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import zhTW from "./locales/zh-TW.json";
import ja from "./locales/ja.json";

const SUPPORTED_LOCALES = ["en", "zh-TW", "ja"] as const;
type SupportedLocale = typeof SUPPORTED_LOCALES[number];

function getStoredLocale(): SupportedLocale {
  try {
    const stored = localStorage.getItem("arlo-language");
    if (stored && (SUPPORTED_LOCALES as readonly string[]).includes(stored)) {
      return stored as SupportedLocale;
    }
  } catch {
    // localStorage unavailable (SSR, test env without DOM)
  }
  return "en";
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en:     { translation: en },
      "zh-TW": { translation: zhTW },
      ja:     { translation: ja },
    },
    lng:       getStoredLocale(),
    fallbackLng: "en",
    interpolation: {
      escapeValue: false, // React already escapes output
    },
  });

export default i18n;
```

### `src/context/LanguageContext.tsx` — LanguageContext

Follows the exact same structural pattern as `SettingsContext.tsx`: default-initializer functions, `createContext`, provider component, consumer hook.

```typescript
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import i18n from "../i18n/i18n";

export type Locale = "en" | "zh-TW" | "ja";

const VALID_LOCALES: Locale[] = ["en", "zh-TW", "ja"];
const KEY_LANGUAGE = "arlo-language";

function defaultLocale(): Locale {
  try {
    const stored = localStorage.getItem(KEY_LANGUAGE);
    if (stored && (VALID_LOCALES as string[]).includes(stored)) {
      return stored as Locale;
    }
  } catch {
    // ignore
  }
  return "en";
}

interface LanguageState {
  language: Locale;
  setLanguage: (locale: Locale) => void;
}

const LanguageContext = createContext<LanguageState | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Locale>(defaultLocale);

  const setLanguage = useCallback((locale: Locale) => {
    setLanguageState(locale);
    void i18n.changeLanguage(locale);
    try {
      localStorage.setItem(KEY_LANGUAGE, locale);
    } catch {
      // ignore
    }
  }, []);

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguageContext(): LanguageState {
  const ctx = useContext(LanguageContext);
  if (ctx === null) {
    throw new Error("useLanguageContext must be used inside <LanguageProvider>");
  }
  return ctx;
}
```

### `src/pages/Settings/LanguageCard.tsx` — Language Switcher

A new settings card that renders a segmented button group for the three language options. Calls `setLanguage` from `useLanguageContext()` on selection; reflects the current active locale.

```typescript
import { useTranslation } from "react-i18next";
import { useLanguageContext, type Locale } from "../../context/LanguageContext";

const LANGUAGE_OPTIONS: { value: Locale; label: string }[] = [
  { value: "en",    label: "English" },
  { value: "zh-TW", label: "繁體中文" },
  { value: "ja",    label: "日本語" },
];

export function LanguageCard() {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguageContext();

  return (
    <section className="card" aria-labelledby="language-card-heading">
      <div className="card-head">
        <div className="card-head-text">
          <h2 id="language-card-heading" className="card-title">
            {t("settings.language.title")}
          </h2>
          <p className="card-subtitle">{t("settings.language.subtitle")}</p>
        </div>
      </div>

      <div className="settings-form">
        <div
          className="language-segmented"
          role="group"
          aria-label={t("settings.language.controlLabel")}
        >
          {LANGUAGE_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              className={`lang-btn${language === value ? " active" : ""}`}
              onClick={() => setLanguage(value)}
              aria-pressed={language === value}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
```

### Updated: `src/shell/Sidebar.tsx`

Replace hardcoded nav labels and aria-labels with `t()` calls. The `NAV_ITEMS` array moves its label lookups to translation keys: `nav.dashboard`, `nav.sessions`, `nav.insights`, `nav.settings`. The collapse button uses `t("nav.expandSidebar")` and `t("nav.collapseSidebar")` for its `aria-label`.

```typescript
// Example of the relevant changes:
import { useTranslation } from "react-i18next";

export function Sidebar() {
  const { t } = useTranslation();
  // ...
  // In NAV_ITEMS mapping:
  //   label={t("nav.dashboard")}, label={t("nav.sessions")}, etc.
  // Collapse button:
  //   aria-label={sidebarCollapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
}
```

### Updated: `src/shell/Topbar.tsx`

Replace `pathnameToTitle` string literals with `t()` calls using `page.*` keys. The theme-toggle `aria-label` uses `t("topbar.toggleTheme")`.

```typescript
import { useTranslation } from "react-i18next";

function pathnameToTitle(pathname: string, t: (key: string) => string): string {
  if (pathname === "/" || pathname === "") return t("page.dashboard");
  if (pathname.startsWith("/sessions/")) return t("page.sessionDetail");
  if (pathname === "/sessions") return t("page.sessions");
  if (pathname === "/insights") return t("page.insights");
  if (pathname === "/settings") return t("page.settings");
  return "Arlo";
}
```

### Updated: `src/main.tsx`

Import `i18n.ts` at the top (before React), and wrap the tree with `<LanguageProvider>` inside or alongside `<SettingsProvider>`.

```typescript
import "./i18n/i18n"; // must be first
import React from "react";
import ReactDOM from "react-dom/client";
// ...
```

In `App.tsx`:
```tsx
<SettingsProvider>
  <LanguageProvider>
    <SessionsProvider>
      <AppRouter />
    </SessionsProvider>
  </LanguageProvider>
</SettingsProvider>
```

---

## Data Models

### Locale Type

```typescript
type Locale = "en" | "zh-TW" | "ja";
```

### Locale JSON Structure

All three JSON files share the same key schema. The English file is the source of truth; the other two files must contain every key present in `en.json`.

```json
{
  "nav": {
    "dashboard":      "Dashboard",
    "sessions":       "Sessions",
    "insights":       "Insights",
    "settings":       "Settings",
    "expandSidebar":  "Expand sidebar",
    "collapseSidebar":"Collapse sidebar"
  },
  "page": {
    "dashboard":     "Dashboard",
    "sessions":      "Sessions",
    "sessionDetail": "Session Detail",
    "insights":      "Insights",
    "settings":      "Settings"
  },
  "topbar": {
    "toggleTheme": "Toggle theme"
  },
  "settings": {
    "language": {
      "title":        "Language",
      "subtitle":     "Choose your display language.",
      "controlLabel": "Select language"
    },
    "planBudget": {
      "title":                    "Plan & budget",
      "subtitle":                 "Used to compute API-equivalent value and the burn-rate forecast on Insights.",
      "monthlyPlanPrice":         "Monthly plan price",
      "monthlyPlanPriceHint":     "What you actually pay — used for the \"value vs plan\" comparison.",
      "monthlyBudget":            "Monthly budget",
      "monthlyBudgetHint":        "Drives the budget bar and forecast warning on Insights.",
      "contextAlertThreshold":    "Context-alert threshold",
      "contextAlertThresholdHint":"Notify when a session's context high-water mark crosses this share of its model's window.",
      "invalidNumber":            "Enter a number of 0 or more.",
      "perMonth":                 "/ month"
    },
    "notifications": {
      "title":              "Notifications",
      "contextAlerts":      "Context alerts",
      "contextAlertsHint":  "OS notification + in-app banner when a session crosses the threshold above.",
      "dailyDigest":        "Daily digest",
      "dailyDigestHint":    "A quiet, once-a-day summary — no push during active work.",
      "budgetWarnings":     "Budget warnings",
      "budgetWarningsHint": "Notify at 80% and 100% of the monthly budget above."
    },
    "logsDirectory": {
      "title":         "Logs directory",
      "subtitle":      "Arlo reads Claude Code transcripts from this path — nothing leaves your machine.",
      "currentPath":   "Current logs directory path",
      "change":        "Change\u2026",
      "rescan":        "Re-scan",
      "scanning":      "Scanning\u2026",
      "scanFailed":    "Scan failed"
    },
    "pricing": {
      "title":         "Pricing",
      "subtitle":      "Read-only. Rates are keyed to when each request happened, not the rate in effect today.",
      "reprice":       "Re-price",
      "repricing":     "Re-pricing\u2026",
      "tableLabel":    "Model pricing rates",
      "colModel":      "Model",
      "colInput":      "Input /Mtok",
      "colOutput":     "Output /Mtok",
      "colCacheWrite5m":"Cache write 5m",
      "colCacheWrite1h":"Cache write 1h",
      "colCacheRead":  "Cache read",
      "colEffective":  "Effective",
      "footerNote":    "Rates are per million tokens ($/Mtok) as published by Anthropic. Cache write 1h is charged at the same rate as cache write 5m. Actual costs may vary; check anthropic.com/pricing for the latest rates.",
      "unpricedWarning":"Pricing not found for {models}. Cost estimates may be inaccurate.",
      "introductory":  "Introductory",
      "standard":      "Standard"
    }
  }
}
```

The same key tree is replicated in `zh-TW.json` and `ja.json` with locale-appropriate string values.

---

## Error Handling

| Scenario | Handling |
|---|---|
| `localStorage` unavailable (e.g., private browsing, JSDOM) | All `localStorage` calls are wrapped in `try/catch`; failures are silently ignored and the default `en` is used. |
| Stored locale value is unrecognized | `getStoredLocale()` validates against `SUPPORTED_LOCALES`; unknown values fall through to the `"en"` default. |
| Translation key missing from a non-English locale file | `i18next` `fallbackLng: "en"` automatically returns the English string; no error is thrown. |
| Translation key missing from all locale files | `i18next` returns the raw key string as a last resort; the UI remains functional but shows the key name. |
| `useLanguageContext()` called outside `<LanguageProvider>` | The hook throws a descriptive `Error`: `"useLanguageContext must be used inside <LanguageProvider>"`. |
| `i18n.changeLanguage()` promise rejects | The promise is fire-and-forget (`void`); `localStorage` is written synchronously before the call, so the persisted state is already consistent. |

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

**Property Reflection:** Before finalizing, redundant properties were consolidated. Requirements 2.1–2.5 all express the same invariant (required keys must be present in all locales) and are unified into Property 2. Requirements 3.2, 4.3, 7.1, and 7.3 all describe the same initialization/persistence loop and are unified into Properties 3 and 4. Requirements 6.1 and 6.2 express the same locale-reactive rendering invariant and are combined into Property 7.

---

### Property 1: Registered locales return non-empty strings for all keys

*For any* translation key that exists in the English locale resource, calling `t(key)` after setting the active language to each of `en`, `zh-TW`, and `ja` should return a non-empty string.

**Validates: Requirements 1.3**

---

### Property 2: Key parity — every English key is present in all locale files

*For any* translation key K that appears in `en.json`, the key K must also appear in `zh-TW.json` and `ja.json` with a non-empty string value. No key present in the English source-of-truth file may be absent from either non-English locale file.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6**

---

### Property 3: Initialization reads and validates localStorage locale

*For any* arbitrary string value S stored in `localStorage["arlo-language"]`, the `LanguageContext` (and i18next) must initialize to S if S is one of `{"en", "zh-TW", "ja"}`, or to `"en"` otherwise (including when the key is absent).

**Validates: Requirements 3.2, 7.1, 7.2**

---

### Property 4: setLanguage persists and synchronizes i18next

*For any* valid locale L from `{"en", "zh-TW", "ja"}`, after calling `setLanguage(L)`, `localStorage["arlo-language"]` must equal L and `i18n.language` must equal L, both before the next render.

**Validates: Requirements 3.3, 7.3, 7.4**

---

### Property 5: Fallback — missing non-English keys return English string

*For any* translation key K that is present in `en.json` but absent from `zh-TW.json` or `ja.json`, calling `t(K)` with `lng` set to `zh-TW` or `ja` must return the English string for K rather than an empty string or the raw key.

**Validates: Requirements 1.4, 2.7**

---

### Property 6: LanguageCard selection triggers setLanguage

*For any* valid locale L from `{"en", "zh-TW", "ja"}`, clicking the corresponding option in `LanguageCard` must invoke `setLanguage` with exactly L, and the corresponding button must carry `aria-pressed="true"` while all others carry `aria-pressed="false"`.

**Validates: Requirements 5.3, 5.4**

---

### Property 7: Locale change re-renders all translated UI chrome

*For any* locale change from L1 to L2 (where L1 ≠ L2), all components consuming `useTranslation()` must re-render their translated strings to match the L2 translations without a full page reload. Specifically: nav labels in `Sidebar`, page title in `Topbar`, and card headings in the Settings cards must all reflect the new locale.

**Validates: Requirements 6.1, 6.2, 6.3, 6.4**
