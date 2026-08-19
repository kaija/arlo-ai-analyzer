# Implementation Plan: Arlo UI Redesign

## Overview

Replace the minimal React skeleton with a full five-screen production UI that exactly matches the mockup, wired to real Tauri backend data. The implementation is TypeScript throughout. Work proceeds in layers: design tokens → types → lib functions → shared primitives + chart components → app shell + contexts → page screens → cleanup.

## Tasks

- [x] 1. Set up testing infrastructure and install design tokens
  - Install `vitest`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, and `fast-check` as dev dependencies
  - Configure `vite.config.ts` to add a `test` block pointing at jsdom environment with `setupFilesAfterFramework` importing `@testing-library/jest-dom`
  - Copy (or symlink) `mockup/shared/tokens.css` to `src/tokens.css`
  - Add `import "./tokens.css"` to `src/main.tsx` before the existing App import, and add Google Fonts `<link>` tags for Inter and JetBrains Mono to `index.html`
  - Clear `src/App.css` of all existing rules (leave empty placeholder for Vite HMR)
  - _Requirements: 1.1, 1.2_

- [x] 2. Extend types and add shared lib functions
  - [x] 2.1 Extend `src/types.ts` with new types
    - Add `Measure`, `Granularity`, `StackBy`, `StopReason`, `Effort`, `Request`, `NotificationSettings`, `AppSettings`, `TokenKind`, `DateRange`, `BucketData`, `Dimension`, `BreakdownRow`, `DayBucket`, `WeekBucket`, `HourBucket`, `ContextHealthRow`, `SkillRow` as defined in design.md
    - Keep existing `Session`, `ToolKind`, `TOOL_LABELS` unchanged
    - _Requirements: 10.1_

  - [x] 2.2 Create `src/lib/format.ts`
    - Implement `fmtTokens(n: number): string` — formats with B/M/K suffix
    - Implement `fmtCost(n: number): string` — formats as `$X.XX`
    - Implement `fmtDate(iso: string): string` — locale-friendly short date
    - Implement `fmtDuration(startIso: string, endIso: string): string` — human-readable elapsed time
    - _Requirements: 3.1, 4.2_

  - [x] 2.3 Write unit tests for `format.ts`
    - Test `fmtTokens` edge cases: 0, 999, 1000, 999_999, 1_000_000, negative
    - Test `fmtCost` with 0, 0.001, 1.5, 999.99
    - _Requirements: 3.1_

  - [x] 2.4 Extend `src/aggregate.ts` and move to `src/lib/aggregate.ts`
    - Keep existing `sumSessions`, `groupBy`, `byDay` (rename `byDay` → `bucketByDay`)
    - Add `bucketByWeek(sessions: Session[], range: DateRange): WeekBucket[]`
    - Add `bucketByHour(sessions: Session[], dayDate: string): HourBucket[]`
    - Add `breakdownByModel(sessions: Session[]): BreakdownRow[]`
    - Add `breakdownByProject(sessions: Session[]): BreakdownRow[]`
    - Add `breakdownByBranch(sessions: Session[]): BreakdownRow[]`
    - Add `filterByDateRange(sessions: Session[], start: string, end: string): Session[]`
    - Add `activeDays(sessions: Session[]): number`
    - Keep the original `src/aggregate.ts` as a re-export shim pointing to `src/lib/aggregate.ts` so no other existing imports break
    - _Requirements: 3.4, 3.5, 3.6, 3.14, 3.18_

  - [x] 2.5 Write property test for stat tile totals (Property 4)
    - **Property 4: Dashboard stat tiles reflect session totals**
    - **Validates: Requirements 3.1, 10.3**
    - Generate arbitrary `Session[]` via `fc.array(sessionArb)`; assert total tokens = sum of `totalTokens(s)`, total requests = sum of `message_count`, total cost = sum of `estimatedCostUsd(s)`, active days = distinct date count

  - [x] 2.6 Write property test for bucket bar count (Property 5)
    - **Property 5: Bucketing produces the correct bar count**
    - **Validates: Requirements 3.4, 3.5, 3.6, 10.4**
    - Generate arbitrary session arrays and date ranges; assert `bucketByDay` length = distinct days, `bucketByWeek` length = distinct ISO weeks, `bucketByHour` length = 24

  - [x] 2.7 Write property test for date range filter (Property 7)
    - **Property 7: Date range filter excludes out-of-range sessions**
    - **Validates: Requirements 3.14**
    - Generate arbitrary `[start, end]` date pairs and session arrays; assert every result row satisfies `started_at >= start && started_at <= end`, and no in-range session is missing

  - [x] 2.8 Write property test for breakdown table row sums (Property 9)
    - **Property 9: Breakdown table rows sum to overall total**
    - **Validates: Requirements 3.18**
    - Generate arbitrary session arrays; assert `sum(row.tokens)` across model/project/branch breakdown equals the overall `sumSessions` total tokens

  - [x] 2.9 Write property test for sort/reverse-sort identity (Property 10)
    - **Property 10: Sort then reverse-sort returns original order**
    - **Validates: Requirements 3.19**
    - Generate arbitrary `BreakdownRow[]` and sort key; assert descending-then-ascending sort produces the same permutation as `Array.prototype.sort` with the reversed comparator

  - [x] 2.10 Write property test for search filter inclusion (Property 11)
    - **Property 11: Sessions table search filter is inclusive**
    - **Validates: Requirements 4.8**
    - Generate arbitrary session arrays and search strings; assert every retained row contains the query (case-insensitive), and no matching row is excluded

  - [x] 2.11 Write property test for AND-filter chip composition (Property 12)
    - **Property 12: AND-filter chips compose correctly**
    - **Validates: Requirements 4.9**
    - Generate arbitrary sessions and K filter chips; assert displayed rows ⊆ sessions satisfying all K constraints simultaneously

  - [x] 2.12 Write property test for page count formula (Property 13)
    - **Property 13: Page count formula**
    - **Validates: Requirements 4.11**
    - Generate arbitrary N ≥ 0; assert total pages = `Math.ceil(N / 15)` and current page has ≤ 15 rows

  - [x] 2.13 Create `src/lib/insights.ts`
    - Implement `cacheHitRate(sessions: Session[]): number`
    - Implement `cacheWriteSplit(sessions: Session[]): { write5m: number; write1h: number }`
    - Implement `topSkillsByRequests(sessions: Session[]): SkillRow[]`
    - Implement `rightsizingCount(sessions: Session[], outputThreshold: number): number`
    - Implement `rightsizingSavingsUsd(sessions: Session[], outputThreshold: number): number`
    - Implement `monthToDateSpend(sessions: Session[]): number`
    - Implement `sevenDayBurnRate(sessions: Session[]): number`
    - Implement `projectedMonthEndSpend(sessions: Session[]): number`
    - Implement `stopReasonBreakdown(sessions: Session[]): Record<StopReason, number>`
    - Implement `maxTokensCount(sessions: Session[]): number`
    - Implement `contextHealthSessions(sessions: Session[], threshold: number): ContextHealthRow[]`
    - _Requirements: 6.1–6.15_

  - [x] 2.14 Write property test for cache hit rate formula (Property 18)
    - **Property 18: Cache hit rate formula**
    - **Validates: Requirements 6.4**
    - Generate arbitrary session arrays; assert `cacheHitRate(sessions)` = `totalCacheRead / (totalInput + totalCacheRead)` and result ∈ [0, 1]

  - [x] 2.15 Extend `src/pricing.ts` to support the full model rate table
    - Add all models listed in the design's `Pricing_Table` with their per-token rates for all five token kinds (input, output, cache_write_5m, cache_write_1h, cache_read)
    - Add `modelColor(model: string): string` returning the CSS `--series-N` variable name for that model's chart color
    - Expose `PRICING_TABLE: PricingEntry[]` array for the Settings pricing card (effective-dated entries)
    - _Requirements: 7.9, 7.10, 7.11_

  - [x] 2.16 Write property test for currency input validation (Property 19)
    - **Property 19: Currency input validation accepts non-negative numbers and rejects others**
    - **Validates: Requirements 7.3**
    - Generate arbitrary strings via `fc.string()`; assert validation returns `valid` iff the string (commas removed) parses as a finite number ≥ 0

- [x] 3. Checkpoint — Ensure all lib tests pass
  - Run `pnpm vitest --run src/lib` and confirm all lib unit and property tests pass before proceeding to components
  - Ask the user if questions arise

- [x] 4. Build shared UI primitives
  - [x] 4.1 Create `src/primitives/SegmentedControl.tsx`
    - Render `<div className="seg" role="group" aria-label={ariaLabel}>` with `<button className="seg-btn [active]">` children
    - Each button fires `onChange(value)` on click and has `aria-pressed`
    - Generic over `T extends string`
    - _Requirements: 2.7, 3.13, 9.1_

  - [x] 4.2 Create `src/primitives/FilterChip.tsx`
    - Render `.chip` with label and `×` button that calls `onRemove`
    - `×` button has `aria-label="Remove {label} filter"` and `focus-visible` ring
    - _Requirements: 3.13, 4.9_

  - [x] 4.3 Create `src/primitives/FilterBar.tsx`
    - Render `.filterbar` wrapper with optional `.sep` dividers between groups
    - Accepts `children` for composing filter controls
    - _Requirements: 3.13, 4.1_

  - [x] 4.4 Create `src/primitives/Meter.tsx`
    - Implement `bandFor(pct: number)` returning `"quiet" | "normal" | "warning" | "critical"`
    - Render `.meter > .meter-track > .meter-fill.band-{band}` + optional `.meter-label`
    - _Requirements: 4.6_

  - [x] 4.5 Create `src/primitives/Badge.tsx`
    - Render `.badge` with variant prop: `accent | neutral | good | warning | critical`
    - Also export `EffortBadge` that maps `Effort` → `effort-medium | effort-high | effort-xhigh` classes
    - _Requirements: 5.16_

  - [x] 4.6 Create `src/primitives/Switch.tsx`
    - Render a `<div role="switch" aria-checked tabIndex={0}>` styled toggle
    - Toggle on click, Enter, and Space; keep `aria-checked` in sync
    - _Requirements: 7.6, 9.4, 9.6_

  - [x] 4.7 Write property test for notification toggle aria-checked tracking (Property 20)
    - **Property 20: Notification toggle aria-checked tracks visual state**
    - **Validates: Requirements 7.6, 9.4**
    - Render `<Switch>` and simulate N random clicks; assert `aria-checked` always equals the current visual on/off state

  - [x] 4.8 Create `src/primitives/InfoDot.tsx`
    - Render `.info-dot` with `.pop` child
    - Open/close state managed via `useState`; open on Enter/Space when focused, close on Escape or outside click
    - `tabIndex={0}` on the dot, focus-visible ring from tokens.css
    - _Requirements: 3.2, 9.7_

  - [x] 4.9 Create `src/primitives/BudgetBar.tsx`
    - Render `.budget-track > .budget-fill` with `--warning` fill when projected > 80% of budget and `--critical` when projected > 100%
    - _Requirements: 6.11_

  - [x] 4.10 Update `src/components/StatTile.tsx` → `src/primitives/StatTile.tsx`
    - Extend to accept optional `infoDot` child, `sub` string, and `subGood` boolean
    - Render `.stat-grid > .stat-tile > .stat-label + .stat-value + .stat-sub`
    - _Requirements: 3.1, 3.2_

- [x] 5. Build custom chart components
  - [x] 5.1 Create `src/charts/MiniStackBar.tsx`
    - Render a `.mini-stack` `<div>` with `<span>` children, each with a percentage `width` and `background-color` from their token kind or stop-reason mapping
    - Used in Insights cards and Session Detail request rows
    - _Requirements: 5.11, 6.4, 6.14_

  - [x] 5.2 Create `src/charts/StackedBarChart.tsx`
    - CSS-layout approach (no SVG), matching the mockup HTML/CSS bar-chart structure
    - Y-axis: 5 label spans; plot area: flex row of `.bar-col` divs each with `.stack > .bar-seg` children
    - X-axis labels; absolutely-positioned `.chart-tooltip` that follows pointer; `onPointerMove` per bar column
    - Expose `onBarClick(bucketIndex: number)` for drill-down; bar columns are `tabIndex={0}` + Enter key support
    - Tooltip repositions (flip left if near right edge) and disappears on pointer leave
    - _Requirements: 3.3, 3.9_

  - [x] 5.3 Write property test for token-kind filter proportionality (Property 6)
    - **Property 6: Token-kind filter preserves total proportionality**
    - **Validates: Requirements 3.10, 3.11, 3.12**
    - Generate arbitrary `BucketData[]` and non-empty token-kind subsets; assert `filteredTotal / unfilteredTotal` equals the weight ratio of enabled kinds

  - [x] 5.4 Create `src/charts/ContextTimelineChart.tsx`
    - SVG (`viewBox="0 0 1000 220"`) with gridlines, ceiling line, area fill, context curve split at compaction boundaries, compaction markers, end-point circle
    - HTML overlay for compaction annotation `.ctx-annot`
    - `onPointerMove` on a transparent `<rect>` overlay: snap crosshair to nearest request index, show tooltip
    - `ResizeObserver` triggers re-render on container width change
    - _Requirements: 5.3–5.9_

  - [x] 5.5 Write property test for context chart segment count (Property 14)
    - **Property 14: Context chart segment count equals compaction count plus one**
    - **Validates: Requirements 5.6**
    - Generate arbitrary N ≥ 0 compaction arrays; render `ContextTimelineChart` and assert exactly N+1 `<path>` elements with the context-curve class

  - [x] 5.6 Write property test for crosshair nearest-index snapping (Property 15)
    - **Property 15: Crosshair snaps to the nearest request index**
    - **Validates: Requirements 5.9**
    - Generate arbitrary pointer X positions and request arrays; assert the selected index I minimizes `|xPixel(I) - pointerX|`

  - [x] 5.7 Write property test for mini token-kind bar segment widths (Property 16)
    - **Property 16: Mini token-kind bar segment widths sum to 100%**
    - **Validates: Requirements 5.11**
    - Generate arbitrary `Request` objects where `totalTokens > 0`; assert the sum of all five segment width percentages equals 100% (±0.1% floating-point tolerance)

  - [x] 5.8 Write property test for stop-reason tag CSS class (Property 17)
    - **Property 17: Stop-reason tag CSS class matches the stop reason value**
    - **Validates: Requirements 5.15**
    - Generate arbitrary `StopReason` values; render the stop-reason tag and assert it carries exactly `stop-{stopReason}` and no other `stop-*` class

- [x] 6. Build contexts and update app entry point
  - [x] 6.1 Create `src/context/SessionsContext.tsx`
    - Move and extend `useSessions.ts` logic: expose `sessions`, `loading`, `scanState`, `scanError`, `refresh()`, `triggerRescan()`
    - Listen on `"usage-updated"` Tauri event inside the provider; re-fetch within 500 ms
    - Handle `list_sessions` errors by setting `scanState = "error"` and storing the error message
    - Keep `src/hooks/useSessions.ts` as the internal hook re-exported from the context file
    - _Requirements: 10.1, 10.2, 10.8, 10.12_

  - [x] 6.2 Create `src/context/SettingsContext.tsx`
    - Read/write all six `localStorage` keys (`arlo-theme`, `arlo-sidebar-collapsed`, `arlo-plan-price`, `arlo-monthly-budget`, `arlo-context-threshold`, `arlo-notifications`) with safe defaults and try/catch for invalid values
    - Expose `theme`, `toggleTheme()`, `sidebarCollapsed`, `toggleSidebar()`, `monthlyPlanPrice`, `monthlyBudget`, `contextAlertThreshold`, `notifications`, `setters…`
    - Apply `applyTheme(theme)` on mount (reads localStorage, falls back to `prefers-color-scheme`) and on every `toggleTheme()` call
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 2.4, 2.5_

  - [x] 6.3 Write property test for theme persistence round-trip (Property 1)
    - **Property 1: Theme persistence round-trip**
    - **Validates: Requirements 1.5, 1.6**
    - For each theme value in `{"light", "dark"}`, write to `localStorage["arlo-theme"]` and re-initialize context; assert restored theme matches written value

  - [x] 6.4 Write property test for sidebar collapse persistence round-trip (Property 2)
    - **Property 2: Sidebar collapse persistence round-trip**
    - **Validates: Requirements 2.5**
    - Generate arbitrary boolean collapsed state; write to `localStorage["arlo-sidebar-collapsed"]`, re-initialize context; assert restored state matches

  - [x] 6.5 Update `src/App.tsx` to wrap the router with `SessionsProvider` and `SettingsProvider`
    - Remove the `import { AppRouter }` pattern; render `<SettingsProvider><SessionsProvider><AppRouter /></SessionsProvider></SettingsProvider>`
    - _Requirements: 10.1_

- [x] 7. Build the App Shell (Sidebar, Topbar, routing)
  - [x] 7.1 Create `src/shell/Sidebar.tsx`
    - Render `<aside className="sidebar [collapsed]">` with brand mark SVG, four `<NavLink>` items, collapse toggle `<button>`
    - Icons: dashboard (grid), sessions (list), insights (bar chart), settings (gear) — inline SVG
    - At ≤ 920 px: absolute overlay with backdrop div; clicking backdrop calls `settingsCtx.toggleSidebar()`
    - `aria-label="Main navigation"` on `<nav>`, `aria-label="Collapse sidebar"` on the toggle button
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.10, 9.2_

  - [x] 7.2 Write property test for active nav item uniqueness (Property 3)
    - **Property 3: Active nav item uniqueness**
    - **Validates: Requirements 2.6**
    - For each of the five route paths, render `<Sidebar>` inside a `MemoryRouter` at that path; assert exactly one `.nav-item.active` exists and it matches the route

  - [x] 7.3 Create `src/shell/Topbar.tsx`
    - Render `.topbar` with glassmorphic background; page title derived from `useLocation().pathname`; theme toggle `<button>` with moon/sun SVGs
    - `aria-label="Toggle theme"` on the button; `aria-live="polite"` on the title span for screen reader announcements
    - _Requirements: 2.7, 2.9, 9.10_

  - [x] 7.4 Update `src/shell/AppShell.tsx` (or create if new)
    - Render `.app-shell > .sidebar + .main-col > [titlebar-spacer | topbar | <main class="content-scroll"><Outlet /></main>]`
    - `<main>` has `role="main"` or is a native `<main>` element with unique `aria-label`
    - _Requirements: 2.8, 9.2_

  - [x] 7.5 Update `src/router.tsx`
    - Replace existing HashRouter content with nested layout route: `<AppShell>` as parent, five child routes: `/` → Dashboard, `/sessions` → Sessions, `/sessions/:id` → SessionDetail, `/insights` → Insights, `/settings` → Settings
    - Import placeholder components for all five pages (will be fleshed out in tasks 8–12)
    - _Requirements: 11.1, 11.2_

- [x] 8. Implement Dashboard page
  - [x] 8.1 Create `src/pages/Dashboard/EmptyState.tsx` and `ScanState.tsx`
    - `EmptyState`: `.empty-state` with "No Claude Code logs found" message, Re-scan button (calls `triggerRescan()`), link to Settings
    - `ScanState`: `.scan-state` with progress bar, file-count/byte-count meter, scan log; reads scan progress from `SessionsContext`
    - _Requirements: 3.24, 3.25, 3.26, 10.9, 10.10, 10.11_

  - [x] 8.2 Create `src/pages/Dashboard/AlertBanner.tsx` and `WarnStrip.tsx`
    - `AlertBanner`: `.alert-banner` with icon tile, body text, "View session" link; dismissed via local state; `aria-live="assertive"`
    - `WarnStrip`: `.warn-strip` with warning icon, text, dismiss button; dismissed via local state
    - _Requirements: 3.21, 3.22, 3.23_

  - [x] 8.3 Create `src/pages/Dashboard/TokenKindPills.tsx`
    - Five toggle pills below chart (Input, Output, Cache write 5m, Cache write 1h, Cache read) shown only when measure === "tokens"
    - Each pill shows series color swatch and percentage share; toggled-off state: dashed border, 30% opacity swatch
    - IF all toggled off, show hint to re-enable
    - _Requirements: 3.10, 3.11, 3.12_

  - [x] 8.4 Create `src/pages/Dashboard/BreakdownTable.tsx` and `BreakdownTables.tsx`
    - Single sortable table with columns: name (+ share bar), requests, tokens, cost; default sort tokens descending
    - Sort-direction arrow on active column; clicking a row applies entity filter (30% opacity on others); clicking again clears
    - `BreakdownTables` composes three instances (by model, by project, by branch)
    - _Requirements: 3.18, 3.19, 3.20_

  - [x] 8.5 Create `src/pages/Dashboard/index.tsx`
    - Full Dashboard page composing all sub-components; local state for all filter controls (measure, granularity, stackBy, dateRange, drillDayIndex, kindOn, entityFilter)
    - Compute stat tile values, chart buckets, and breakdown rows via `useMemo` from `sessions` + filter state using `lib/aggregate.ts`
    - Render `AlertBanner`, `WarnStrip`, `FilterBar`, `StatTilesRow`, `UsageChartCard`, `BreakdownTables`, `EmptyState` or `ScanState` based on `scanState`
    - Wire date presets (7d/30d/90d/All/Custom), measure, granularity, stack-by controls to local state
    - Implement drill-down: bar click → `drillDayIndex` set → `bucketByHour` data → auto-switch granularity to "Hour"; breadcrumb "back" clears drill
    - _Requirements: 3.1–3.26, 10.3, 10.4, 12.2, 12.5_

  - [x] 8.6 Write property test for measure derivation (Property 8)
    - **Property 8: Measure derivation applies correct aggregation**
    - **Validates: Requirements 3.16, 10.3**
    - Generate arbitrary session arrays and measure values; assert stat tile value = `totalTokens` sum for "tokens", `message_count` sum for "requests", `estimatedCostUsd` sum for "cost"

- [x] 9. Implement Sessions page
  - [x] 9.1 Create `src/pages/Sessions/SessionsTable.tsx`
    - Sortable table: columns Session, Project, Branch, Started, Duration, Requests, Tokens, Cost, Models (color dot array), Context high-water (Meter), Compactions
    - Default sort: Started descending; active column highlight via `--accent-wash` when measure matches
    - Models column: up to 3 color dots + "+N" overflow; each dot has hover tooltip with model name
    - Compaction column: accent pill for count > 0, em dash otherwise
    - Row `tabIndex={0}`, Enter key → navigate to session detail; `role="row"` semantics
    - _Requirements: 4.2–4.7, 4.13, 4.14, 9.3_

  - [x] 9.2 Create `src/pages/Sessions/Pager.tsx`
    - Footer showing "Page N of M" with Previous/Next buttons; on click, scroll table to top
    - Disable Previous on first page, Next on last page
    - _Requirements: 4.11, 4.12_

  - [x] 9.3 Create `src/pages/Sessions/index.tsx`
    - FilterBar with date range picker, preset segmented control, measure control, and search field
    - `useDebounce(searchText, 300)` hook (implement inline in the page file — no library needed)
    - Filter chips for Project and Branch dimensions (added by clicking table cells); AND-filter logic
    - "Showing N of M sessions" label above table; 15-rows-per-page pagination state
    - _Requirements: 4.1, 4.8–4.12, 4.15_

- [x] 10. Implement Session Detail page
  - [x] 10.1 Create `src/pages/SessionDetail/SessionHeader.tsx`
    - `<h1>` for session name, metadata line (project, branch pill, start time, duration), four right-aligned stat items
    - "← Sessions" back link using `<Link to="/sessions">`
    - _Requirements: 5.1, 5.2_

  - [x] 10.2 Create `src/pages/SessionDetail/RequestsTable.tsx`
    - Row per Request: time, model dot + name, effort badge, token mini-bar or raw counts (controlled by `rawCounts` toggle), cost, stop-reason tag, skill pill, transcript link icon
    - Token mini-bar: 96 px proportional bar with five `--series-N` colored segments
    - Raw counts toggle (`Switch` component) with `role="switch"` / `aria-checked`; when on, show five labeled numeric counts
    - Initially show 40 rows; "Load 40 more" button reveals next batch; "Showing N of M" counter updates; button hidden when all visible
    - Stop-reason tag: `stop-end_turn` (green), `stop-tool_use` (neutral), `stop-max_tokens` (warning), `stop-refusal` (critical) CSS classes
    - Hide Cost column at ≤ 900 px via CSS
    - _Requirements: 5.10–5.16, 8.6, 8.11_

  - [x] 10.3 Create `src/pages/SessionDetail/index.tsx`
    - Read `params.id`, find session in context; render error state with link back to `/sessions` if not found
    - Compose `SessionHeader`, `ContextChartCard` (wrapping `ContextTimelineChart`), request toolbar (count label + raw counts Switch), `RequestsTable`
    - Derive `RequestPoint[]` and `CompactionEvent[]` from session data (stubs with `// TODO: needs backend` where per-request detail is unavailable)
    - _Requirements: 5.1–5.16, 10.6, 10.7, 11.3, 11.4_

- [x] 11. Implement Insights page
  - [x] 11.1 Create `src/pages/Insights/ContextHealthCard.tsx`
    - Count of sessions above threshold, explanatory sentence naming highest-usage session, ranked bar list of top 5 sessions color-coded by band
    - "View flagged sessions" link → `/sessions`
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 11.2 Create `src/pages/Insights/CacheEfficiencyCard.tsx`
    - Cache hit rate %, explanatory sentence, mini stacked bar (write5m / write1h split), legend with token counts, "2× premium" tag on write1h segment
    - "View cache breakdown" link → `/`
    - _Requirements: 6.4, 6.5_

  - [x] 11.3 Create `src/pages/Insights/McpAttributionCard.tsx`
    - Top MCP server/skill headline, explanatory sentence, ranked bar list of top 4; show only entries with ≥ 1 request
    - "View all servers & skills" link → `/`
    - _Requirements: 6.6, 6.7, 6.8_

  - [x] 11.4 Create `src/pages/Insights/ModelRightsizingCard.tsx`
    - Opus-equivalent requests under 500 output tokens count, savings estimate sentence, key-value row table; "Estimate" badge in eyebrow
    - _Requirements: 6.9, 6.10_

  - [x] 11.5 Create `src/pages/Insights/BudgetForecastCard.tsx`
    - Month-to-date spend, 7-day burn rate, projected month-end with "Estimate" badge, key-value table, Budget_Bar (conditional on budget being set)
    - "Adjust budget" link → `/settings`
    - _Requirements: 6.11, 6.12, 6.13_

  - [x] 11.6 Create `src/pages/Insights/ToolFailuresCard.tsx`
    - `max_tokens` count, explanatory sentence with percentages, mini stacked bar for all four stop reasons, legend with counts
    - "View affected sessions" link → `/sessions`
    - _Requirements: 6.14, 6.15_

  - [x] 11.7 Create `src/pages/Insights/index.tsx`
    - Compute all insight values once via `useMemo` from `sessions` using `lib/insights.ts` pure functions
    - Render six cards in `.insights-grid` (3-col → 2-col → 1-col responsive grid)
    - _Requirements: 6.1–6.15, 8.1, 8.7, 8.8_

- [x] 12. Implement Settings page
  - [x] 12.1 Create `src/pages/Settings/PlanBudgetCard.tsx`
    - Monthly plan price input + monthly budget input: dollar prefix, 0–999999.99, inline validation on blur (`error` CSS class + `role="alert"` message)
    - Context-alert threshold range slider (50–95, step 5); update `aria-valuetext` = `"${V}%"` on every input event
    - Bind inputs and slider to `SettingsContext` setters
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 9.5_

  - [x] 12.2 Write property test for threshold slider aria-valuetext tracking (Property 21)
    - **Property 21: Threshold slider aria-valuetext tracks slider value**
    - **Validates: Requirements 9.5**
    - For each value in `{50, 55, 60, …, 95}`; simulate setting slider and assert `aria-valuetext === "${V}%"`

  - [x] 12.3 Create `src/pages/Settings/NotificationsCard.tsx`
    - Three `Switch` instances: Context alerts, Daily digest, Budget warnings; each with label and hint sentence
    - Bound to `SettingsContext.notifications` setters
    - _Requirements: 7.5, 7.6, 9.4_

  - [x] 12.4 Create `src/pages/Settings/LogsDirectoryCard.tsx`
    - Read-only monospace path field, "Change…" button invoking `plugin:dialog|open` Tauri file-picker (directory mode), "Re-scan" button
    - Re-scan: disable button + "Scanning…" within 50 ms; re-enable when `triggerRescan()` resolves or rejects; show error message on failure
    - _Requirements: 7.7, 7.8, 11.7, 12.3, 12.7, 12.9_

  - [x] 12.5 Create `src/pages/Settings/PricingCard.tsx`
    - Horizontally scrollable pricing table (Model color dot + name, Input /Mtok, Output /Mtok, Cache write 5m, Cache write 1h, Cache read, Effective date)
    - "Introductory" badge on earliest row for multi-rate models; "Standard" on subsequent rows; `--accent-wash` row background for multi-rate models
    - Unpriced warning strip inside card (conditional)
    - Re-price button: same busy/restore pattern as Re-scan (50 ms disable, restore on complete or error)
    - Pricing footnote below table
    - _Requirements: 7.9–7.14, 12.4, 12.8, 12.10_

  - [x] 12.6 Create `src/pages/Settings/index.tsx`
    - Compose all four cards; reads from and writes to `SettingsContext`
    - _Requirements: 7.1–7.14_

- [x] 13. Checkpoint — Ensure all component and page tests pass
  - Run `pnpm vitest --run` and confirm all tests pass
  - Ask the user if questions arise

- [x] 14. Remove old pages and legacy components
  - Delete `src/pages/Overview.tsx`, `src/pages/ToolDetail.tsx`, `src/pages/ProjectDetail.tsx`
  - Delete `src/components/Nav.tsx`, `src/components/Breakdown.tsx`
  - Move `src/components/StatTile.tsx` import references to `src/primitives/StatTile.tsx`
  - Remove `recharts` from `package.json` dependencies (now unused; custom SVG charts replace it)
  - _Requirements: 11.1 (ensures only the five new routes exist)_

- [x] 15. Responsive layout verification and accessibility pass
  - [x] 15.1 Add CSS for responsive breakpoints not already in tokens.css
    - Add `.tri-tables` → single column at ≤ 1100 px
    - Add `.insights-grid` 3-col → 2-col at ≤ 1180 px → 1-col at ≤ 760 px
    - Add `.sessions-table-container { overflow-x: auto; } .dtable { min-width: 1180px }` for Sessions table
    - Add `@media (max-width: 900px) { .cost-cell { display: none } }` for Session Detail cost column
    - _Requirements: 8.1–8.11_

  - [x] 15.2 Accessibility audit and fixes
    - Audit focus management: modals and popovers must trap focus and restore it on close
    - Audit all icon-only buttons for `aria-label`
    - Audit heading hierarchy across all five pages (no skipped ranks)
    - Verify `:focus-visible` ring appears on all interactive elements listed in requirements
    - _Requirements: 9.1–9.10_

- [x] 16. Final checkpoint — Full test suite and manual verification
  - Run `pnpm vitest --run` and confirm all 21 property tests and all unit tests pass
  - Manually verify each of the five screens renders against the mockup at the 9 viewport widths (360, 390, 430, 600, 820, 1024, 1366, 1440, 1920 px)
  - Ask the user if questions arise

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- All 21 correctness properties from design.md are covered by PBT sub-tasks: Properties 1–21 map to tasks 6.3, 6.4, 7.2, 2.5, 2.6, 5.3, 2.7, 8.6, 2.8, 2.9, 2.10, 2.11, 2.12, 5.5, 5.6, 5.7, 5.8, 2.14, 2.16, 4.7, 12.2 respectively
- `fast-check` property tests run a minimum of 100 iterations each (`{ numRuns: 100 }`)
- The original `src/aggregate.ts` is kept as a re-export shim; do not delete it until all internal imports have been updated
- `recharts` is removed in task 14 once custom SVG charts are in place
- Backend fields not yet available (branch, per-request detail, compactions) are rendered as placeholder dashes with `// TODO: needs backend` comments

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2.1", "2.2"] },
    { "id": 2, "tasks": ["2.3", "2.4", "2.13", "2.15"] },
    { "id": 3, "tasks": ["2.5", "2.6", "2.7", "2.8", "2.9", "2.10", "2.11", "2.12", "2.14", "2.16", "4.1", "4.2", "4.3", "4.4", "4.5", "4.6", "4.8", "4.9", "4.10", "5.1"] },
    { "id": 4, "tasks": ["4.7", "5.2", "5.4", "6.1", "6.2"] },
    { "id": 5, "tasks": ["5.3", "5.5", "5.6", "5.7", "5.8", "6.3", "6.4", "6.5"] },
    { "id": 6, "tasks": ["7.1", "7.3", "7.4"] },
    { "id": 7, "tasks": ["7.2", "7.5"] },
    { "id": 8, "tasks": ["8.1", "8.2", "8.3", "8.4", "9.1", "9.2", "10.1", "10.2", "11.1", "11.2", "11.3", "11.4", "11.5", "11.6", "12.1", "12.3", "12.4", "12.5"] },
    { "id": 9, "tasks": ["8.5", "8.6", "9.3", "10.3", "11.7", "12.2", "12.6"] },
    { "id": 10, "tasks": ["14", "15.1", "15.2"] }
  ]
}
```
