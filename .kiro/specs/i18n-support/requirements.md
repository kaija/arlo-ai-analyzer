# Requirements Document

## Introduction

This feature adds multi-language (i18n) support to the Arlo AI Analyzer application. The default language is English (EN), with additional support for Traditional Chinese (TW) and Japanese (JP). All UI chrome — navigation labels, page headings, card titles, buttons, hints, and error messages — must be translatable using `react-i18next`. Session data and raw AI output remain untranslated. Users can switch the active language from a new Language card on the Settings page, and the selection persists across sessions via `localStorage`.

## Glossary

- **i18n**: Internationalization — the process of designing software so that it can be adapted to different languages without engineering changes.
- **Locale**: A combination of language and region identifier (e.g., `en`, `zh-TW`, `ja`) used to select the appropriate translation resource.
- **LanguageContext**: A React context following the existing `SettingsContext` pattern that holds the active locale, exposes a setter, and initializes from `localStorage`.
- **Language Switcher**: A new card on the Settings page that renders a segmented control or select element allowing the user to change the active locale.
- **Locale JSON file**: A static JSON file under `src/i18n/locales/` that maps translation keys to their locale-specific string values.
- **Translation key**: A dot-namespaced string identifier (e.g., `nav.dashboard`) used as the argument to the `t()` function from `react-i18next`.
- **UI chrome**: All static, structural UI text rendered by the application itself — navigation labels, page headings, card titles, buttons, tooltips, hints, and error messages. Excludes session titles, model names, project names, and any data values returned by the backend.
- **react-i18next**: The chosen i18n library (`react-i18next`) that wraps `i18next` with React hooks (`useTranslation`) and the `<Trans>` component.
- **localStorage key**: The browser storage key `arlo-language` used to persist the user's language selection.

## Requirements

### Requirement 1 — Library and Initialization

**User Story:** As a developer, I want `react-i18next` initialized before the React tree mounts, so that all components receive translations on first render without a flash of untranslated text.

#### Acceptance Criteria

1. THE i18n System SHALL load `react-i18next` and `i18next` as runtime dependencies added to `package.json`.
2. THE i18n System SHALL expose an `i18n.ts` initialization module at `src/i18n/i18n.ts` that configures `i18next` with the `initReactI18next` plugin before the React tree renders.
3. WHEN the `i18n.ts` module is loaded, THE i18n System SHALL register locale resources for `en`, `zh-TW`, and `ja` from static JSON files located at `src/i18n/locales/en.json`, `src/i18n/locales/zh-TW.json`, and `src/i18n/locales/ja.json` respectively.
4. THE i18n System SHALL set `en` as the `fallbackLng` so that any missing translation key in a non-English locale falls back to the English string.
5. THE i18n System SHALL set `interpolation.escapeValue` to `false` because React already escapes output.

### Requirement 2 — Locale JSON Coverage

**User Story:** As a translator, I want all UI chrome strings defined in locale JSON files, so that no hardcoded text appears in any supported language.

#### Acceptance Criteria

1. THE Locale JSON files SHALL define translation keys covering all navigation labels (`nav.dashboard`, `nav.sessions`, `nav.insights`, `nav.settings`).
2. THE Locale JSON files SHALL define translation keys covering all topbar page titles (`page.dashboard`, `page.sessions`, `page.sessionDetail`, `page.insights`, `page.settings`).
3. THE Locale JSON files SHALL define translation keys covering all Settings page card headings and field labels rendered by `PlanBudgetCard`, `NotificationsCard`, `LogsDirectoryCard`, `PricingCard`, and the new `LanguageCard`.
4. THE Locale JSON files SHALL define translation keys covering all button labels and action text rendered in the UI chrome.
5. THE Locale JSON files SHALL define translation keys covering all hint, helper, and error message strings rendered in the UI chrome.
6. WHEN a translation key is present in `en.json`, THE Locale JSON files SHALL include the same key in `zh-TW.json` and `ja.json` with locale-appropriate string values.
7. IF a translation key is absent from a non-English locale file, THE i18n System SHALL display the English fallback string for that key.

### Requirement 3 — LanguageContext

**User Story:** As a developer, I want a `LanguageContext` that manages the active locale state, so that any component in the tree can read or update the current language using a consistent pattern.

#### Acceptance Criteria

1. THE LanguageContext SHALL be implemented in `src/context/LanguageContext.tsx` following the same structural pattern as `SettingsContext.tsx` (default-initializer function, `createContext`, provider component, consumer hook).
2. WHEN `LanguageContext` initializes, THE LanguageContext SHALL read the stored locale from `localStorage` key `arlo-language` and validate that the value is one of `en`, `zh-TW`, or `ja`; if validation fails or the key is absent, THE LanguageContext SHALL default to `en`.
3. WHEN the user changes the active locale, THE LanguageContext SHALL call `i18n.changeLanguage(locale)` to update `react-i18next` and persist the new locale to `localStorage` key `arlo-language`.
4. THE LanguageContext SHALL export a `useLanguageContext()` hook that throws a descriptive error when called outside `<LanguageProvider>`.
5. THE LanguageContext SHALL expose `language` (the active locale string) and `setLanguage` (a setter accepting `'en' | 'zh-TW' | 'ja'`) through the context value.

### Requirement 4 — Provider Integration

**User Story:** As a developer, I want `LanguageProvider` wired into the application root, so that every component has access to the current locale without prop drilling.

#### Acceptance Criteria

1. THE Application SHALL wrap the React component tree with `<LanguageProvider>` in `src/main.tsx`, placed inside or alongside the existing `<SettingsProvider>` wrapper.
2. THE Application SHALL import the `i18n.ts` initialization module at the top of `src/main.tsx` so that `i18next` is initialized before any component renders.
3. WHEN `LanguageProvider` mounts, THE Application SHALL apply the stored language to `i18next` so the first render uses the persisted locale.

### Requirement 5 — Language Switcher UI

**User Story:** As a user, I want a Language card on the Settings page, so that I can switch between English, Traditional Chinese, and Japanese and have my choice saved.

#### Acceptance Criteria

1. THE Settings Page SHALL render a `LanguageCard` component as a peer card within the `.settings-grid` layout alongside the existing settings cards.
2. THE LanguageCard SHALL display a heading and a control (segmented button group or `<select>`) presenting the three language options: English, 繁體中文, and 日本語.
3. WHEN the user selects a language option, THE LanguageCard SHALL call `setLanguage` from `useLanguageContext()` to update the active locale immediately.
4. THE LanguageCard SHALL reflect the currently active locale by marking the corresponding option as selected or active on render.
5. THE LanguageCard SHALL be fully keyboard-accessible and meet WCAG 2.1 AA requirements for interactive controls.

### Requirement 6 — UI Chrome Translation

**User Story:** As a user, I want all navigation labels, headings, and button text to appear in my selected language, so that the interface feels native to that language.

#### Acceptance Criteria

1. THE Sidebar SHALL use the `useTranslation` hook and the `t()` function to render each navigation label from the corresponding `nav.*` translation key rather than a hardcoded string.
2. THE Topbar SHALL use the `useTranslation` hook and the `t()` function to render the current page title from the corresponding `page.*` translation key rather than a hardcoded string.
3. THE Settings Page cards (`PlanBudgetCard`, `NotificationsCard`, `LogsDirectoryCard`, `PricingCard`) SHALL use the `useTranslation` hook and the `t()` function to render all card headings, field labels, button text, and hint strings from translation keys.
4. WHEN the active locale changes, THE UI Chrome SHALL re-render all translated strings in the new locale without a full page reload.
5. THE Sidebar collapse button aria-labels SHALL be translated via the `t()` function.
6. THE Topbar theme-toggle button aria-label SHALL be translated via the `t()` function.

### Requirement 7 — Persistence and Initialization Behavior

**User Story:** As a user, I want my language preference remembered across app restarts, so that I do not have to re-select my language every time I open Arlo.

#### Acceptance Criteria

1. WHEN the application starts, THE i18n System SHALL read `localStorage` key `arlo-language` and initialize `react-i18next` with the stored locale before the first render.
2. IF `localStorage` key `arlo-language` is absent or contains an unrecognized value, THEN THE i18n System SHALL initialize with locale `en`.
3. WHEN the user selects a new language, THE LanguageContext SHALL write the selected locale string to `localStorage` key `arlo-language` before the re-render so that a hard reload presents the correct language.
4. WHILE the application is running, THE i18n System SHALL maintain a single source of truth for the active locale in `LanguageContext`, with `react-i18next` state kept in sync via `i18n.changeLanguage()`.
