# Design Document: Arlo UI Redesign

## Overview

This feature replaces the minimal React skeleton with a full production UI that exactly matches the five-screen mockup in `mockup/`. The work is purely frontend — no new Tauri commands are required beyond the existing `list_sessions` and `rescan`. The existing `usage-core` Rust crate and all its data types remain unchanged.

The guiding constraint is **design fidelity**: the mockup is the visual contract. All CSS is delivered through CSS custom properties (design tokens), matching `mockup/shared/tokens.css` exactly. Charts are custom SVG-based components matching the mockup's hand-rolled SVG approach — Recharts is removed. No new npm dependencies are introduced unless strictly necessary (and none are currently needed).

### Goals

- Implement all five screens: Dashboard, Sessions, Session Detail, Insights, Settings
- Implement the App Shell: collapsible sidebar, glassmorphic topbar, titlebar spacer, theme toggle
- Wire all screens to real `Session[]` data from the Tauri backend
- Full responsive behaviour across the 9-viewport matrix in the requirements
- WCAG 2.1 AA accessibility baseline

### Non-goals

- Changes to the Rust backend or SQLite schema
- New Tauri commands (the existing `list_sessions` and `rescan` cover all requirements)
- Support for Cursor / Gemini CLI / Codex CLI parsers (still stub-only in this feature)
- Automated visual regression tests (manual verification against mockup screenshots is sufficient)

---

## Architecture

### High-level component tree

```
App
└── AppShell                       ← layout, theme, sidebar, topbar
    ├── Sidebar                    ← nav, collapse toggle
    ├── Topbar                     ← page title, theme toggle
    └── <Routes>                   ← react-router-dom HashRouter
        ├── /              → DashboardPage
        ├── /sessions      → SessionsPage
        ├── /sessions/:id  → SessionDetailPage
        ├── /insights      → InsightsPage
        └── /settings      → SettingsPage
```

### Data flow

```
Tauri (list_sessions / rescan)
  │
  ▼
SessionsContext (React context)
  ├── sessions: Session[]
  ├── loading: boolean
  ├── scanState: 'idle' | 'scanning' | 'done' | 'error'
  └── refresh(): void
  │
  ▼
SettingsContext (React context)
  ├── theme: 'light' | 'dark'
  ├── sidebarCollapsed: boolean
  ├── monthlyPlanPrice: number
  ├── monthlyBudget: number
  ├── contextAlertThreshold: number   (50–95)
  ├── notifications: NotificationSettings
  └── setters...
  │
  ▼
Individual page components read from context and pass derived data as props to display components
```

The two contexts replace the existing `useSessions` hook at the app level. `useSessions` is kept as the internal implementation inside `SessionsContext`.

---

## Components and Interfaces

### File structure

All files under `src/`:

```
src/
├── main.tsx                          ← unchanged entry point
├── App.tsx                           ← renders <AppShell>
├── App.css                           ← empty (all styles via tokens.css)
├── router.tsx                        ← updated: new routes
├── types.ts                          ← extended: Request, Compaction, Settings
│
├── context/
│   ├── SessionsContext.tsx           ← sessions[], loading, scanState, refresh()
│   └── SettingsContext.tsx           ← theme, sidebar, budget, notifications
│
├── hooks/
│   ├── useSessions.ts                ← unchanged (moved here from src/)
│   └── useSettings.ts                ← localStorage persistence helpers
│
├── lib/
│   ├── aggregate.ts                  ← extended: bucketByDay, bucketByWeek, bucketByHour
│   ├── pricing.ts                    ← unchanged
│   ├── format.ts                     ← fmtTokens, fmtCost, fmtDate, fmtDuration
│   └── insights.ts                   ← pure functions: cacheHitRate, rightsizingSavings, burnRate
│
├── shell/
│   ├── AppShell.tsx                  ← outer layout, theme application
│   ├── Sidebar.tsx                   ← sidebar with nav items, collapse toggle
│   └── Topbar.tsx                    ← page title, theme toggle button
│
├── primitives/
│   ├── SegmentedControl.tsx          ← .seg / .seg-btn
│   ├── FilterBar.tsx                 ← .filterbar wrapper, sep, chip-add
│   ├── FilterChip.tsx                ← .chip (dismissible tag)
│   ├── Meter.tsx                     ← .meter / .meter-track / .meter-fill with band logic
│   ├── Badge.tsx                     ← .badge variants (accent, neutral, good, warning, critical)
│   ├── Switch.tsx                    ← .switch toggle (role="switch", aria-checked)
│   ├── InfoDot.tsx                   ← .info-dot with popover
│   ├── StatTile.tsx                  ← .stat-tile (updated from existing)
│   └── BudgetBar.tsx                 ← .budget-track / .budget-fill with warning/critical logic
│
├── charts/
│   ├── StackedBarChart.tsx           ← Dashboard usage chart (custom SVG)
│   ├── ContextTimelineChart.tsx      ← Session Detail context chart (custom SVG)
│   └── MiniStackBar.tsx              ← Inline mini stacked bar (Insights cards, request rows)
│
└── pages/
    ├── Dashboard/
    │   ├── index.tsx                 ← page root, state management
    │   ├── StatTilesRow.tsx
    │   ├── UsageChartCard.tsx        ← wraps StackedBarChart, controls token-kind pills
    │   ├── TokenKindPills.tsx
    │   ├── BreakdownTables.tsx       ← three sortable tables
    │   ├── BreakdownTable.tsx        ← single sortable table
    │   ├── AlertBanner.tsx           ← context alert banner
    │   ├── WarnStrip.tsx             ← unpriced warning strip
    │   ├── EmptyState.tsx
    │   └── ScanState.tsx
    ├── Sessions/
    │   ├── index.tsx
    │   ├── SessionsTable.tsx
    │   └── Pager.tsx
    ├── SessionDetail/
    │   ├── index.tsx
    │   ├── SessionHeader.tsx
    │   ├── ContextChartCard.tsx      ← wraps ContextTimelineChart
    │   └── RequestsTable.tsx
    ├── Insights/
    │   ├── index.tsx
    │   ├── ContextHealthCard.tsx
    │   ├── CacheEfficiencyCard.tsx
    │   ├── McpAttributionCard.tsx
    │   ├── ModelRightsizingCard.tsx
    │   ├── BudgetForecastCard.tsx
    │   └── ToolFailuresCard.tsx
    └── Settings/
        ├── index.tsx
        ├── PlanBudgetCard.tsx
        ├── NotificationsCard.tsx
        ├── LogsDirectoryCard.tsx
        └── PricingCard.tsx
```

### Key component interfaces

```typescript
// primitives/SegmentedControl.tsx
interface SegmentedControlProps<T extends string> {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
}

// primitives/Meter.tsx
interface MeterProps {
  value: number;    // 0–100 percentage
  showLabel?: boolean;
}
// Band logic: < 50 → band-quiet, 50–74 → band-normal, 75–89 → band-warning, ≥ 90 → band-critical

// primitives/Switch.tsx
interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  id: string;
  labelledBy?: string;
}

// charts/StackedBarChart.tsx
interface StackedBarChartProps {
  buckets: BucketData[];           // pre-computed bucket values
  dims: Dimension[];               // series definitions (name, color, weight)
  measure: Measure;
  onBarClick?: (bucketIndex: number) => void;
  drillable?: boolean;
}
interface BucketData {
  label: string;
  total: number;
  values: Record<string, number>;  // keyed by dim key
}

// charts/ContextTimelineChart.tsx
interface ContextTimelineChartProps {
  requests: RequestPoint[];
  compactions: CompactionEvent[];
  ceiling: number;
  ceilingLabel: string;
}
interface RequestPoint { index: number; contextTokens: number; }
interface CompactionEvent { beforeIndex: number; preTokens: number; postTokens: number; }
```

### Extended TypeScript types

The existing `Session` type must be extended to cover all screen requirements. The Rust `Session` struct currently lacks `branch`, `requests`, `compactions`, and per-request detail. Two approaches exist:

**Option A (preferred for v1):** Derive everything computable from the existing `Session` fields in the frontend. Fields not available (branch, per-request detail, compactions) are rendered as placeholder dashes until the backend exposes them.

**Option B:** Extend the Rust `Session` struct to carry `branch: Option<String>`, `requests: Vec<Request>`, and `compactions: u32`.

The design adopts **Option A** to avoid backend changes in this feature, with clearly marked `// TODO: needs backend` comments on derived stubs. The Sessions table will show a dash for Branch and zero for Compactions until a backend extension lands.

```typescript
// src/types.ts additions
export type Measure = "tokens" | "requests" | "cost";
export type Granularity = "hour" | "day" | "week";
export type StackBy = "model" | "tokenkind" | "project" | "skill";
export type StopReason = "end_turn" | "tool_use" | "max_tokens" | "refusal";
export type Effort = "medium" | "high" | "xhigh";

export interface Request {
  index: number;
  timestamp: string;
  model: string;
  effort: Effort;
  inputTokens: number;
  outputTokens: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
  costUsd: number;
  stopReason: StopReason;
  skill: string | null;
}

export interface NotificationSettings {
  contextAlerts: boolean;
  dailyDigest: boolean;
  budgetWarnings: boolean;
}

export interface AppSettings {
  monthlyPlanPrice: number;
  monthlyBudget: number;
  contextAlertThreshold: number;
  notifications: NotificationSettings;
  logsDirectory: string;
}
```

---

## Data Models

### Sessions context state

```typescript
interface SessionsState {
  sessions: Session[];
  loading: boolean;
  scanState: 'idle' | 'scanning' | 'done' | 'error';
  scanError: string | null;
  refresh: () => Promise<void>;
  triggerRescan: () => Promise<void>;
}
```

### Settings context state

Persisted to `localStorage` under the following keys:

| Key | Type | Default |
|---|---|---|
| `arlo-theme` | `"light" \| "dark"` | OS preference |
| `arlo-sidebar-collapsed` | `"0" \| "1"` | `"0"` (expanded) |
| `arlo-plan-price` | string (numeric) | `"200.00"` |
| `arlo-monthly-budget` | string (numeric) | `"1000.00"` |
| `arlo-context-threshold` | string (integer 50–95) | `"75"` |
| `arlo-notifications` | JSON string | all true |

### Dashboard filter state (local to DashboardPage)

```typescript
interface DashboardState {
  measure: Measure;
  granularity: Granularity;
  stackBy: StackBy;
  dateRange: DateRange;
  drillDayIndex: number | null;
  kindOn: Record<TokenKind, boolean>;
  entityFilter: { kind: 'model' | 'project' | 'branch'; name: string } | null;
}
```

### Aggregation functions (src/lib/aggregate.ts extensions)

```typescript
// Bucket sessions by day, week, or hour (when drilled)
function bucketByDay(sessions: Session[], range: DateRange): DayBucket[]
function bucketByWeek(sessions: Session[], range: DateRange): WeekBucket[]
function bucketByHour(sessions: Session[], dayDate: string): HourBucket[]

// Breakdown tables
function breakdownByModel(sessions: Session[]): BreakdownRow[]
function breakdownByProject(sessions: Session[]): BreakdownRow[]
function breakdownByBranch(sessions: Session[]): BreakdownRow[]
```

All aggregation functions are pure — no side effects, no async, easily unit/property-testable.

### Insights computation (src/lib/insights.ts)

All insight values are derived from `Session[]` via pure functions:

```typescript
function cacheHitRate(sessions: Session[]): number
function cacheWriteSplit(sessions: Session[]): { write5m: number; write1h: number }
function topSkillsByRequests(sessions: Session[]): SkillRow[]
function rightsizingCount(sessions: Session[], outputThreshold: number): number
function rightsizingSavingsUsd(sessions: Session[], outputThreshold: number): number
function monthToDateSpend(sessions: Session[]): number
function sevenDayBurnRate(sessions: Session[]): number
function projectedMonthEndSpend(sessions: Session[]): number
function stopReasonBreakdown(sessions: Session[]): Record<StopReason, number>
function maxTokensCount(sessions: Session[]): number
function contextHealthSessions(sessions: Session[], threshold: number): ContextHealthRow[]
```

---

## Design Token Integration

### Loading tokens.css

`mockup/shared/tokens.css` is copied to `src/tokens.css` (or symlinked). It is imported directly in `src/main.tsx`:

```typescript
// src/main.tsx
import "./tokens.css";
import "./App.css";  // empty reset, kept for Vite HMR
```

This ensures `:root` tokens are available globally before any React component renders.

### Font loading

Google Fonts are loaded in `index.html` via `<link rel="preconnect">` and `<link href="https://fonts.googleapis.com/css2?family=Inter:...">`, matching the mockup's `<head>` exactly. The CSS fallback chain in `tokens.css` already handles the 3-second timeout case via `system-ui, -apple-system, "Segoe UI"`.

### Theme switching

`SettingsContext` owns the active theme. On mount it reads `localStorage["arlo-theme"]`, falls back to `window.matchMedia("(prefers-color-scheme: dark)").matches`, then calls `applyTheme`:

```typescript
function applyTheme(theme: "light" | "dark") {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("arlo-theme", theme);
}
```

The CSS selector `:root[data-theme="dark"]` in `tokens.css` handles the rest with a `transition: background-color 150ms ease, color 150ms ease` already defined on `body`. No JavaScript animation code is needed.

The theme toggle button in `Topbar` calls `settingsCtx.toggleTheme()`. The moon/sun icon swap is handled entirely by the CSS rules already present in `tokens.css`:

```css
.theme-toggle .sun { display: none; }
:root[data-theme="dark"] .theme-toggle .sun { display: block; }
:root[data-theme="dark"] .theme-toggle .moon { display: none; }
```

---

## App Shell

### AppShell.tsx

Renders the outer `.app-shell` flex container. Reads `SettingsContext` for `sidebarCollapsed`. Does not manage route state.

```tsx
<div className="app-shell">
  <Sidebar />
  <div className="main-col">
    <div className="titlebar-spacer" />
    <Topbar />
    <main className="content-scroll">
      <Outlet />   {/* react-router-dom v7 nested routes */}
    </main>
  </div>
</div>
```

### Sidebar.tsx

- Renders `<aside className={`sidebar${collapsed ? " collapsed" : ""}`}>`
- Brand mark: SVG A-frame glyph in a 22 px rounded accent tile
- Nav items: four `<NavLink>` components from react-router-dom; `NavLink` receives `className={({ isActive }) => "nav-item" + (isActive ? " active" : "")}`
- Collapse toggle: `<button className="sidebar-collapse-btn">` calls `settingsCtx.toggleSidebar()`
- Collapsed state persisted to `localStorage["arlo-sidebar-collapsed"]` inside `SettingsContext`
- At ≤ 920 px viewport: `position: absolute; z-index: 50` via the media query already in `tokens.css`

### Topbar.tsx

- `<div className="topbar">` with glassmorphic background (CSS only, from `tokens.css`)
- Page title: reads from a `PageTitleContext` (simple string context that each page sets via `useEffect`)  
  Alternative (simpler): derive the title from `useLocation().pathname` with a mapping object
- Theme toggle: `<button className="theme-toggle">` with moon/sun SVGs

### Routing (router.tsx)

```tsx
<HashRouter>
  <Routes>
    <Route element={<AppShell />}>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/sessions" element={<SessionsPage />} />
      <Route path="/sessions/:id" element={<SessionDetailPage />} />
      <Route path="/insights" element={<InsightsPage />} />
      <Route path="/settings" element={<SettingsPage />} />
    </Route>
  </Routes>
</HashRouter>
```

AppShell uses `<Outlet />` from react-router-dom v7 for nested route rendering.

---

## Screen Component Breakdown

### Dashboard

State lives in `DashboardPage/index.tsx`. All filter state (`measure`, `granularity`, `stackBy`, `drillDayIndex`, `kindOn`, `entityFilter`, `dateRange`) is `useState` local to this page — it does not need to persist across navigation.

The page reads `sessions` from `SessionsContext` and computes all derived values with the pure aggregation functions in `lib/aggregate.ts` and `lib/insights.ts`. No derived data is stored in state; it is computed on each render (or memoized with `useMemo` for expensive bucketing).

```
DashboardPage
├── AlertBanner          (dismissed via local state)
├── WarnStrip            (dismissed via local state)
├── FilterBar
│   ├── DateRangePicker
│   ├── SegmentedControl (date presets)
│   ├── SegmentedControl (measure)
│   ├── SegmentedControl (granularity)
│   ├── StackByDropdown
│   └── FilterChip[]
├── StatTilesRow
│   └── StatTile × 4
├── UsageChartCard
│   ├── StackedBarChart   ← custom SVG
│   ├── Breadcrumb
│   ├── Legend
│   └── TokenKindPills    (only when measure === "tokens")
├── BreakdownTables
│   ├── BreakdownTable (by model)
│   ├── BreakdownTable (by project)
│   └── BreakdownTable (by branch)
├── EmptyState            (when no sessions and not scanning)
└── ScanState             (when scanState === "scanning")
```

### Sessions

```
SessionsPage
├── FilterBar
│   ├── DateRangePicker
│   ├── SegmentedControl (date presets)
│   ├── SegmentedControl (measure)
│   └── SearchField
├── FilterChip[]
├── SessionCountLabel
├── SessionsTable       ← sortable, paginated
└── Pager
```

Search is debounced 300 ms via `useDebounce` (a trivial `setTimeout`/`clearTimeout` hook, no library needed). Sorting state is local to the page.

### Session Detail

Navigated to via `useNavigate` or `<Link>`. Reads `sessions` from context, finds by `params.id`. If not found, renders error state.

```
SessionDetailPage
├── BackLink
├── SessionHeader
├── ContextChartCard
│   └── ContextTimelineChart  ← custom SVG
├── RequestToolbar
│   ├── RequestCountLabel
│   └── RawCountsToggle (Switch)
└── RequestsTable
    ├── RequestRow × N
    └── LoadMoreButton
```

### Insights

All six cards are stateless display components driven by computed values passed as props from `InsightsPage`. The parent computes all insight values once from `sessions` using pure functions in `lib/insights.ts`.

```
InsightsPage
├── ContextHealthCard
├── CacheEfficiencyCard
├── McpAttributionCard
├── ModelRightsizingCard
├── BudgetForecastCard
└── ToolFailuresCard
```

Each card uses `<div className="card insight-card">` matching the mockup structure exactly.

### Settings

Local form state for inputs and toggles; written to `SettingsContext` on change (which persists to `localStorage`). The Re-scan and Re-price buttons use a local `busy` state with a `setTimeout(1100)` reset matching the mockup's `flashBtn` pattern.

```
SettingsPage
├── PlanBudgetCard
│   ├── CurrencyInput × 2   (with inline validation)
│   └── ThresholdSlider
├── NotificationsCard
│   └── Switch × 3
├── LogsDirectoryCard
│   ├── ReadOnlyPathField
│   ├── ChangeButton         (invokes Tauri file dialog)
│   └── RescanButton
└── PricingCard
    ├── PricingTable         (read-only)
    ├── UnpricedWarningStrip (conditional)
    ├── PricingNote
    └── RepriceButton
```

---

## Custom Chart Components

### StackedBarChart.tsx

Renders a `<div>` container with:

1. **Y-axis** — a flex column of 5 label spans (100%, 75%, 50%, 25%, 0%). Labels computed from `niceMax(maxValue)`.
2. **Plot area** — a relatively-positioned div containing:
   - Gridlines (4 absolute-positioned divs)
   - Bars row — a flex row of `.bar-col` divs, each with a `.stack` child whose height is proportional to its bucket total
   - Each stack contains `dims.length` `.bar-seg` divs, heights proportional to each dim's share
3. **X-axis** — a flex row of label spans; labels shown every 7 days for day view, every 3 hours for hour view, all for week view
4. **Tooltip** — an absolutely-positioned `<div className="chart-tooltip">` rendered in a portal-free layer; positioned via `onPointerMove` event on each bar column
5. **Drill-down** — clicking a bar column (when `drillable`) calls `onBarClick(index)`; the parent page swaps the bucket data to hourly data and updates granularity

Key implementation details:
- No SVG — uses CSS layout matching the mockup's HTML/CSS approach exactly
- Bar column width: `flex: 1 1 0; min-width: 3px`
- Bar stacks: `flex-direction: column-reverse; align-items: flex-end` so segments grow upward
- Tooltip positioning: constrained to stay within the chart area (flip left if near right edge)
- Token-kind pills filtering: the parent passes a filtered/weighted `dims` array; the chart re-renders reactively

### ContextTimelineChart.tsx

Renders an SVG (`viewBox="0 0 1000 220" preserveAspectRatio="none"`) matching the mockup exactly:

1. **Gridlines** — 5 horizontal `<line>` elements at 0%, 25%, 50%, 75%, 100% of ceiling
2. **Y-axis labels** — `<text>` elements at gridline positions
3. **Ceiling line** — dashed red `<line>` with `<text>` label
4. **Area fill** — `<path>` with `fill="var(--accent)"` at `opacity="0.08"`
5. **Context curve** — split into N+1 `<path>` segments at compaction boundaries; each is `fill="none" stroke="var(--accent)" stroke-width="2"`
6. **Compaction markers** — for each compaction: dashed vertical `<line>`, open `<circle>` at pre-compaction peak, open `<circle>` at post-compaction resumption
7. **End point** — filled `<circle>` at the last request
8. **Annotation overlay** — an absolutely-positioned HTML `<div className="ctx-annot">` for the compaction annotation
9. **Crosshair interaction** — a transparent `<rect>` covering the plot area; on `onPointerMove`, snap to nearest request index (minimize `|xPixel(i) - pointerX|`), update crosshair `<line>` opacity and show tooltip

Coordinate helpers:
```typescript
const xFn = (i: number) => PAD_L + (i / (N - 1)) * plotW;
const yFn = (tokens: number) => PAD_T + plotH - Math.min(tokens / ceiling, 1.08) * plotH;
```

SVG is re-rendered on window resize via a `ResizeObserver` on the container `<div>`.

### MiniStackBar.tsx

A simple `<div className="mini-stack">` with `<span>` children, each with a percentage width and background color matching their token kind or stop-reason color. Used in Insights cards and Session Detail request rows.

---

## Shared UI Primitives

### SegmentedControl

```tsx
<div className="seg" role="group" aria-label={ariaLabel}>
  {options.map(opt => (
    <button
      key={opt.value}
      className={`seg-btn${value === opt.value ? " active" : ""}`}
      onClick={() => onChange(opt.value)}
      aria-pressed={value === opt.value}
    >
      {opt.label}
    </button>
  ))}
</div>
```

### FilterChip

```tsx
<div className="chip" role="group">
  <span>{label}: {value}</span>
  <button onClick={onRemove} aria-label={`Remove ${label} filter`}>×</button>
</div>
```

### Switch

```tsx
<div
  className={`switch${checked ? " on" : ""}`}
  role="switch"
  aria-checked={checked}
  aria-labelledby={labelledBy}
  tabIndex={0}
  onClick={() => onChange(!checked)}
  onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onChange(!checked); } }}
/>
```

### InfoDot

Keyboard-accessible popover. Opens on `Enter`/`Space` when focused; closes on `Escape` or outside click. State managed with a `useState(false)` for `open`. The `.pop` child is shown via `open ? { opacity: 1, visibility: "visible" } : {}` inline styles (or the CSS hover/focus rules from `tokens.css`, extended with the `open` class for keyboard interaction).

### Meter

```tsx
function bandFor(pct: number) {
  if (pct >= 90) return "critical";
  if (pct >= 75) return "warning";
  if (pct >= 50) return "normal";
  return "quiet";
}
// Renders .meter > .meter-track > .meter-fill.band-{band}
// + .meter-label.band-{band}
```

### StatTile

Updated from the existing `src/components/StatTile.tsx` to accept an optional `infoDot` child and `sub` string.

---

## Responsive Layout Strategy

All responsive behaviour is delivered through the media queries already present in `tokens.css` and the screen-specific CSS classes. No JavaScript breakpoint detection is used.

| Breakpoint | Change |
|---|---|
| ≤ 920 px | `.stat-grid` → 2-column; `.sidebar` → absolute overlay with z-index 50 |
| ≤ 1100 px | `.tri-tables` → single column (Dashboard breakdown tables) |
| ≤ 1180 px | `.insights-grid` → 2-column |
| ≤ 760 px | `.insights-grid` → 1-column |
| ≤ 900 px | Session Detail request table hides Cost column via `display: none` on `.cost-cell` |
| ≤ 720 px | Dashboard stat tiles remain at 2-column (not 1-column) — handled by `tokens.css` existing rules |

The Sessions table container uses `overflow-x: auto` and the table has `min-width: 1180px` matching the mockup.

For the overlay sidebar at ≤ 920 px: when the sidebar is expanded (not collapsed), it is positioned absolutely and a backdrop overlay is rendered to allow dismissal by clicking outside. This is handled by a `useEffect` that adds/removes an event listener on the document when the sidebar is open in overlay mode.

---

## Accessibility Implementation Plan

### Focus management

All interactive elements use the `:focus-visible` CSS pseudo-class from `tokens.css`:
```css
.btn:focus-visible, .nav-item:focus-visible, ... {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

No additional JavaScript is needed for the focus ring — the CSS rule already excludes pointer focus via `:focus-visible`.

### Semantic HTML

- `<aside>` for sidebar, `<nav>` for the nav list, `<main>` for the scroll region
- Heading levels: `<h1>` for the page title in topbar (or per-page, evaluated per screen), `<h2>` for card titles, `<h3>` for section headings within cards
- Sessions table: `<table>` with `<thead>`, `<tbody>`, `<th scope="col">`; row links use `<tr tabIndex={0} role="row">` with `onKeyDown` Enter handler

### ARIA

- Switch: `role="switch"` + `aria-checked` (synced with visual state)
- SegmentedControl: `role="group"` + `aria-label`; each button gets `aria-pressed`
- InfoDot: `tabIndex={0}`, opens on `Enter`/`Space`, closes on `Escape`
- Threshold slider: native `<input type="range">` with `aria-labelledby` + `aria-valuetext` updated on each `input` event
- Modal/popover: focus moves to first focusable element inside on open; focus trap until close
- Unlabeled icons: `aria-label` on button, e.g., `aria-label="Toggle theme"`, `aria-label="Collapse sidebar"`
- Chart tooltips: `role="tooltip"` with `id`; chart area uses `aria-describedby` pointing to tooltip

### Keyboard navigation

- Table rows: `tabIndex={0}` + `onKeyDown` Enter → navigate
- Nav items: standard anchor/`<NavLink>` — browser default Tab navigation applies
- Chart bar columns (when drillable): `tabIndex={0}` + `onKeyDown` Enter → drill down

---

## Error Handling

- `list_sessions` failure: `SessionsContext` catches the error and sets `scanState = "error"`; a full-width inline error message is shown on the Dashboard (not a modal; does not unmount the component tree)
- `rescan` failure: `ScanState` component shows the error message and re-enables the Re-scan button
- Tauri file-picker dialog (Settings → Change…): `invoke("plugin:dialog|open")` with `{ directory: true }`; if the user cancels, the promise resolves to `null` and the existing path is retained
- Session not found (route `/sessions/:id` with no match): `SessionDetailPage` renders an error state with a link back to `/sessions`
- Invalid localStorage values: `SettingsContext` wraps all `JSON.parse` calls in try/catch; invalid values fall back to defaults

---

## Testing Strategy

This feature involves UI rendering, app-shell state management, and pure data aggregation functions. The bulk of logic is in pure functions (`lib/aggregate.ts`, `lib/insights.ts`, `lib/format.ts`) which are well-suited to both unit tests and property-based tests.

**Test framework:** Vitest (already available via Vite ecosystem, no new dependency needed) with `@testing-library/react` for component tests.

**Property-based testing library:** `fast-check` — lightweight, TypeScript-native, zero runtime dependencies beyond the test environment.

**Unit tests:** focus on specific examples (edge cases, error conditions, integration points)
**Property tests:** focus on universal invariants across generated session arrays, filter states, and UI inputs

### Dual testing approach

- Pure functions in `lib/` get both property tests (universal invariants) and unit tests (specific examples / edge cases)
- Component tests are example-based: render with specific props, assert specific output
- Each property test runs a minimum of 100 iterations via `fc.assert(fc.property(...), { numRuns: 100 })`

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Theme persistence round-trip

*For any* theme value in `{"light", "dark"}`, writing that theme to localStorage and reading it back (via the `SettingsContext` initialization logic) should produce the same theme that was written.

**Validates: Requirements 1.5, 1.6**

---

### Property 2: Sidebar collapse persistence round-trip

*For any* boolean collapsed state, setting the sidebar to that state and restoring it from localStorage should produce the same collapsed state.

**Validates: Requirements 2.5**

---

### Property 3: Active nav item uniqueness

*For any* route pathname from the set `["/", "/sessions", "/sessions/:id", "/insights", "/settings"]`, the rendered sidebar should have exactly one nav item with the `active` CSS class, and that item should be the one matching the route.

**Validates: Requirements 2.6**

---

### Property 4: Dashboard stat tiles reflect session totals

*For any* non-empty array of `Session` objects, the four stat tile values (API-equivalent value, Requests, Tokens, Active days) should be deterministic functions of that array: total cost = `sessions.reduce(sum of estimatedCostUsd(s), 0)`, total requests = `sessions.reduce(sum of message_count, 0)`, total tokens = `sessions.reduce(sum of totalTokens(s), 0)`, active days = count of distinct calendar dates in `started_at`.

**Validates: Requirements 3.1, 10.3**

---

### Property 5: Bucketing produces the correct bar count

*For any* session array and granularity setting (day, week, hour), the number of bars rendered by the chart equals the number of distinct time buckets produced by the corresponding aggregation function (`bucketByDay`, `bucketByWeek`, `bucketByHour`).

**Validates: Requirements 3.4, 3.5, 3.6, 10.4**

---

### Property 6: Token-kind filter preserves total proportionality

*For any* non-empty subset S of the five token kinds, the total bar height for a given bucket should equal the sum of only those token kinds in S, expressed as a fraction of the total when all kinds are enabled. Specifically: `filteredTotal / unFilteredTotal = sum(kind.weight for kind in S) / sum(kind.weight for kind in ALL_KINDS)`.

**Validates: Requirements 3.10, 3.11, 3.12**

---

### Property 7: Date range filter excludes out-of-range sessions

*For any* date range `[start, end]` and session array, every session returned by `filterByDateRange(sessions, start, end)` should have `started_at >= start` and `started_at <= end`, and no session satisfying those constraints should be excluded.

**Validates: Requirements 3.14**

---

### Property 8: Measure derivation applies correct aggregation

*For any* session array and measure value in `{"tokens", "requests", "cost"}`, the value displayed in the stat tiles and chart should equal the output of the correct aggregation function applied to that array. Specifically: for `"tokens"` the function is `totalTokens`, for `"requests"` it is `message_count`, for `"cost"` it is `estimatedCostUsd`.

**Validates: Requirements 3.16, 10.3**

---

### Property 9: Breakdown table rows sum to overall total

*For any* session array, for each of the three breakdown dimensions (model, project, branch), the sum of the `tokens` (or `requests`, or `cost`) values across all rows should equal the corresponding overall total from the stat tiles.

**Validates: Requirements 3.18**

---

### Property 10: Sort then reverse-sort returns original order

*For any* array of breakdown table rows and any sort key, sorting by that key descending then sorting by the same key ascending (i.e., toggling the sort direction) should produce a result that is the reverse of the descending sort — or equivalently, that toggling sort direction on a column twice produces the same permutation as the identity.

**Validates: Requirements 3.19**

---

### Property 11: Sessions table search filter is inclusive

*For any* search string `q` and session array, every row retained by the filter should contain `q` (case-insensitively) in at least one of: session name, project, or branch. No row that contains `q` in any of those fields should be excluded.

**Validates: Requirements 4.8**

---

### Property 12: AND-filter chips compose correctly

*For any* combination of K active filter chips (each specifying a dimension value), every displayed session row must satisfy all K constraints simultaneously. Formally: `displayedRows ⊆ { s | ∀ chip ∈ activeChips: s[chip.dimension] === chip.value }`.

**Validates: Requirements 4.9**

---

### Property 13: Page count formula

*For any* filtered session list of length N, the pager should show `Math.ceil(N / 15)` total pages, and the current page should contain at most 15 rows.

**Validates: Requirements 4.11**

---

### Property 14: Context chart segment count equals compaction count plus one

*For any* session with N compaction events (N ≥ 0), the `ContextTimelineChart` should render exactly N+1 distinct line path segments.

**Validates: Requirements 5.6**

---

### Property 15: Crosshair snaps to the nearest request index

*For any* pointer X pixel position within the chart plot area, the crosshair snaps to request index I where `|xPixel(I) - pointerX|` is minimized over all valid indices 0 through N-1.

**Validates: Requirements 5.9**

---

### Property 16: Mini token-kind bar segment widths sum to 100%

*For any* `Request` where `totalTokens > 0`, the sum of the five segment width percentages in the mini token-kind bar should equal 100% (within floating-point tolerance of ±0.1%).

**Validates: Requirements 5.11**

---

### Property 17: Stop-reason tag CSS class matches the stop reason value

*For any* `StopReason` value in `{"end_turn", "tool_use", "max_tokens", "refusal"}`, the rendered tag should carry exactly the CSS class `stop-{stopReason}` and no other `stop-*` class.

**Validates: Requirements 5.15**

---

### Property 18: Cache hit rate formula

*For any* non-empty session array, `cacheHitRate(sessions)` should equal `totalCacheRead / (totalInput + totalCacheRead)` where both totals are summed across all sessions. The result should be in the range [0, 1].

**Validates: Requirements 6.4**

---

### Property 19: Currency input validation accepts non-negative numbers and rejects others

*For any* string `s`, the currency field validation function should return `valid` if and only if `s` (with commas removed) parses as a finite number ≥ 0. All other strings (empty, NaN, negative) should return `invalid`.

**Validates: Requirements 7.3**

---

### Property 20: Notification toggle aria-checked tracks visual state

*For any* toggle interaction sequence of length N (each toggle flips state), the `aria-checked` attribute should always equal the current visual `on`/`off` state. Specifically: after N clicks on a toggle starting from state S₀, `aria-checked` should be `"true"` if N is odd and S₀ was `false` (or N is even and S₀ was `true`), and `"false"` otherwise.

**Validates: Requirements 7.6, 9.4**

---

### Property 21: Threshold slider aria-valuetext tracks slider value

*For any* slider value V in `{50, 55, 60, 65, 70, 75, 80, 85, 90, 95}` (step 5 within 50–95), after setting the slider to V, `aria-valuetext` should equal `"${V}%"`.

**Validates: Requirements 9.5**

---

*Properties 1–21 cover all acceptance criteria classified as testable properties in the prework analysis. Requirements related to UI layout/rendering, visual affordances (hover states, focus rings), Tauri integration, OS-level behavior, and infrastructure checks are validated through example-based unit tests, integration tests, or manual verification against the mockup.*
