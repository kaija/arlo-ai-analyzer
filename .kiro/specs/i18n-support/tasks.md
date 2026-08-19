# Implementation Plan: i18n Support

## Overview

Add multi-language (i18n) support using `react-i18next` and `i18next`. Three locales are supported: English (`en`, default), Traditional Chinese (`zh-TW`), and Japanese (`ja`). The implementation follows the existing `SettingsContext` pattern for `LanguageContext`, persists locale selection to `localStorage`, and replaces all hardcoded UI chrome strings with `t()` calls.

## Tasks

- [x] 1. Install dependencies and create i18n initialization module
  - [x] 1.1 Add `react-i18next` and `i18next` to `package.json` and install
    - Run `npm install react-i18next i18next` to add runtime dependencies
    - _Requirements: 1.1_

  - [x] 1.2 Create locale JSON files at `src/i18n/locales/en.json`, `zh-TW.json`, and `ja.json`
    - `en.json` is the source of truth with all keys: `nav.*`, `page.*`, `topbar.*`, and `settings.*` (planBudget, notifications, logsDirectory, pricing, language)
    - `zh-TW.json` and `ja.json` must contain every key from `en.json` with locale-appropriate values
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 1.3 Create `src/i18n/i18n.ts` initialization module
    - Import `i18next`, `initReactI18next`, and all three locale JSON files
    - Register resource bundles under `en`, `zh-TW`, and `ja` namespaces
    - Read `localStorage["arlo-language"]`, validate against `SUPPORTED_LOCALES`, fall back to `"en"`
    - Set `fallbackLng: "en"` and `interpolation.escapeValue: false`
    - Export the configured `i18n` instance
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 7.1, 7.2_

  - [x] 1.4 Write property test for i18n initialization (Property 3)
    - **Property 3: Initialization reads and validates localStorage locale**
    - **Validates: Requirements 3.2, 7.1, 7.2**
    - Test that a valid stored locale initializes correctly, an invalid value falls back to `"en"`, and an absent key defaults to `"en"`

  - [x] 1.5 Write property test for locale JSON key parity (Property 2)
    - **Property 2: Key parity — every English key is present in all locale files**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6**
    - Enumerate all keys in `en.json` and assert each one exists in `zh-TW.json` and `ja.json` with a non-empty value

  - [x] 1.6 Write property test for registered locales returning non-empty strings (Property 1)
    - **Property 1: Registered locales return non-empty strings for all keys**
    - **Validates: Requirements 1.3**
    - For every key in the English resource, assert `t(key)` returns a non-empty string after setting locale to `en`, `zh-TW`, and `ja`

- [x] 2. Implement LanguageContext
  - [x] 2.1 Create `src/context/LanguageContext.tsx`
    - Define `Locale` type as `"en" | "zh-TW" | "ja"` and export it
    - Implement `defaultLocale()` helper that reads and validates `localStorage["arlo-language"]`
    - Create `LanguageContext` with `createContext<LanguageState | null>(null)` following `SettingsContext` pattern
    - Implement `LanguageProvider` using `useState(defaultLocale)` and a `useCallback` setter that calls `i18n.changeLanguage()` and writes to `localStorage`
    - Export `useLanguageContext()` hook that throws descriptively when called outside provider
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 2.2 Write property test for setLanguage persistence and sync (Property 4)
    - **Property 4: setLanguage persists and synchronizes i18next**
    - **Validates: Requirements 3.3, 7.3, 7.4**
    - For each valid locale, assert that after `setLanguage(L)`, `localStorage["arlo-language"] === L` and `i18n.language === L`

  - [x] 2.3 Write property test for fallback behavior (Property 5)
    - **Property 5: Fallback — missing non-English keys return English string**
    - **Validates: Requirements 1.4, 2.7**
    - For keys present in `en.json` but deliberately absent from a test locale, assert `t(key)` returns the English string rather than empty or the raw key

- [x] 3. Integrate providers into application root
  - [x] 3.1 Update `src/main.tsx` to import `./i18n/i18n` as first import and wrap the component tree with `<LanguageProvider>`
    - Add `import "./i18n/i18n"` as the very first import in `main.tsx`
    - Wrap `<SettingsProvider>` → `<LanguageProvider>` → `<SessionsProvider>` nesting in `App.tsx`
    - _Requirements: 4.1, 4.2, 4.3_

- [x] 4. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Build LanguageCard and update Settings page
  - [x] 5.1 Create `src/pages/Settings/LanguageCard.tsx`
    - Render a `<section>` with `.card` class, a heading using `t("settings.language.title")`, subtitle, and a `role="group"` segmented button group
    - Map `LANGUAGE_OPTIONS` (`en`/`zh-TW`/`ja`) to `<button>` elements with `aria-pressed` reflecting active locale
    - Call `setLanguage(value)` from `useLanguageContext()` on click
    - Ensure keyboard accessibility meeting WCAG 2.1 AA
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 5.2 Update `src/pages/Settings/index.tsx` to render `<LanguageCard />` inside `.settings-grid`
    - Import and place `<LanguageCard />` as a peer of the existing settings cards
    - _Requirements: 5.1_

  - [x] 5.3 Write property test for LanguageCard selection (Property 6)
    - **Property 6: LanguageCard selection triggers setLanguage**
    - **Validates: Requirements 5.3, 5.4**
    - For each valid locale option, simulate clicking that button and assert `setLanguage` is called with the correct locale and `aria-pressed="true"` is set on that button only

- [x] 6. Translate Settings page cards
  - [x] 6.1 Update `src/pages/Settings/PlanBudgetCard.tsx` to replace all hardcoded strings with `t()` calls
    - Add `useTranslation()` hook; replace card title, subtitle, field labels, hints, error messages, and "/ month" text with `settings.planBudget.*` keys
    - _Requirements: 6.3_

  - [x] 6.2 Update `src/pages/Settings/NotificationsCard.tsx` to replace all hardcoded strings with `t()` calls
    - Add `useTranslation()` hook; replace card title, toggle labels, and hint text with `settings.notifications.*` keys
    - _Requirements: 6.3_

  - [x] 6.3 Update `src/pages/Settings/LogsDirectoryCard.tsx` to replace all hardcoded strings with `t()` calls
    - Add `useTranslation()` hook; replace card title, subtitle, path label, button labels, and status strings with `settings.logsDirectory.*` keys
    - _Requirements: 6.3_

  - [x] 6.4 Update `src/pages/Settings/PricingCard.tsx` to replace all hardcoded strings with `t()` calls
    - Add `useTranslation()` hook; replace card title, subtitle, table column headers, footer note, and warning messages with `settings.pricing.*` keys
    - _Requirements: 6.3_

- [x] 7. Translate Sidebar and Topbar shell components
  - [x] 7.1 Update `src/shell/Sidebar.tsx` to use `t()` for nav labels and aria-labels
    - Import `useTranslation`; replace nav item labels with `t("nav.dashboard")`, `t("nav.sessions")`, `t("nav.insights")`, `t("nav.settings")`
    - Replace collapse/expand button `aria-label` with `t("nav.expandSidebar")` / `t("nav.collapseSidebar")`
    - _Requirements: 6.1, 6.5_

  - [x] 7.2 Update `src/shell/Topbar.tsx` to use `t()` for page titles and aria-labels
    - Import `useTranslation`; update `pathnameToTitle` to accept the `t` function and use `page.*` keys
    - Replace theme-toggle `aria-label` with `t("topbar.toggleTheme")`
    - _Requirements: 6.2, 6.6_

  - [x] 7.3 Write property test for locale-change re-rendering (Property 7)
    - **Property 7: Locale change re-renders all translated UI chrome**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4**
    - Render `Sidebar` and `Topbar` with the full provider tree; change locale from `en` to `zh-TW` and assert that nav labels, page title, and card headings reflect the new locale without a page reload

- [x] 8. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- The i18n initialization module must be the first import in `main.tsx` to prevent a flash of untranslated text on first render
- `localStorage` calls in both `i18n.ts` and `LanguageContext.tsx` are wrapped in `try/catch` to handle private browsing and JSDOM test environments gracefully
- The design's `Correctness Properties` section has 7 properties — each property sub-task explicitly references the property number from design.md
- `en.json` is the single source of truth; `zh-TW.json` and `ja.json` must mirror its complete key tree

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["1.4", "1.5", "1.6", "2.1"] },
    { "id": 3, "tasks": ["2.2", "2.3", "3.1"] },
    { "id": 4, "tasks": ["5.1", "5.2", "6.1", "6.2", "6.3", "6.4", "7.1", "7.2"] },
    { "id": 5, "tasks": ["5.3", "7.3"] }
  ]
}
```
