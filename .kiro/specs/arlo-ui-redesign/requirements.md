# Requirements Document

## Introduction

Arlo is a Tauri 2 + React 19 desktop app (macOS and Windows) that reads local AI coding-tool logs and displays a unified dashboard of activity, token usage, and estimated cost. The current frontend is a minimal skeleton. This feature replaces it with a production UI that exactly matches the design mockup located at `mockup/`, implementing all five product screens (Dashboard, Sessions, Session Detail, Insights, Settings), the collapsible app shell, the full design-token system, and all interactive states — wired to real data from the Rust backend via Tauri commands.

## Glossary

- **App_Shell**: The outer layout that persists across all routes — sidebar nav, glassmorphic topbar, and draggable titlebar spacer.
- **Sidebar**: The collapsible left navigation panel (232 px expanded, 64 px icon-only collapsed).
- **Topbar**: The fixed header bar carrying the page title and theme toggle (52 px tall, glassmorphic background).
- **Design_Tokens**: CSS custom properties defined in `mockup/shared/tokens.css` that encode the light and dark color palettes, typography scale, shadows, and motion values.
- **Session**: A single Claude Code transcript file (`~/.claude/projects/<project>/<session>.jsonl`) parsed into the `Session` struct by `usage-core`.
- **Request**: One assistant-turn entry within a Session, carrying model name, token counts (input / output / cache_write_5m / cache_write_1h / cache_read), stop reason, and optional skill/MCP label.
- **Compaction**: An in-session `/compact` event that resets the running context window back to a summarized size.
- **Context_High_Water**: The maximum context window size used at any point during a Session, expressed in tokens.
- **Token_Kind**: One of five categories: input, output, cache_write_5m (5-minute cache write), cache_write_1h (1-hour cache write), cache_read.
- **API_Equivalent_Value**: The dollar amount the Session's tokens would cost at standard API rates — a measure of usage, not a subscription charge.
- **Measure**: The active unit shown by charts and tables — one of: tokens, requests, or cost.
- **Granularity**: The time bucket width for the Dashboard chart — one of: hour, day, or week.
- **Stack_By**: The dimension used to color chart bars — one of: model, token kind, project, or skill/MCP.
- **Filter_Chip**: A removable tag in the filter bar representing an active dimension constraint (e.g., project = arlo-ai-analyzer).
- **Effort_Badge**: A visual label on each Request row indicating estimated computational effort: medium, high, or xhigh.
- **Stop_Reason**: The reason a Request ended: end_turn, tool_use, max_tokens, or refusal.
- **Skill_Pill**: A label on a Request row identifying the MCP server or Claude skill that was active.
- **Context_Alert_Banner**: A dismissible, full-width accent banner shown when any active Session crosses the context-alert threshold.
- **Unpriced_Warning_Strip**: A dismissible warning bar shown when one or more models in the data set have no pricing entry.
- **Insight_Card**: One of six summarized analysis panels on the Insights screen.
- **Budget_Bar**: A progress track on Insights and Settings that visualizes month-to-date spend against the monthly budget.
- **Pricing_Table**: The read-only, effective-dated per-model rate grid on the Settings screen.

---

## Requirements

### Requirement 1: Design Token System

**User Story:** As a user, I want the app to follow the Arlo visual language precisely, so that the interface looks professional and cohesive.

#### Acceptance Criteria

1. THE App_Shell SHALL load Inter (400, 500, 600, 700) and JetBrains Mono (400, 500, 600) as the primary typefaces; IF the fonts have not loaded within 3 seconds, THEN THE App_Shell SHALL fall back to system fonts and continue rendering.
2. THE App_Shell SHALL expose all CSS custom properties defined in `mockup/shared/tokens.css` under `:root` for both the light theme and the dark theme, including `--bg`, `--surface`, `--fg`, `--muted`, `--muted-2`, `--border`, `--border-strong`, `--accent`, `--accent-hover`, `--accent-wash`, `--accent-ring`, `--accent-shadow`, `--nav-glass`, all seven `--series-N` chart colors, `--series-recessive`, `--series-recessive-ink`, all five status colors (`--good`, `--warning`, `--serious`, `--critical` and their wash/border variants), and all four shadow levels.
3. WHEN the user activates dark theme, THE App_Shell SHALL apply `data-theme="dark"` to the document root and switch all custom properties to their dark-theme values within 150 ms.
4. IF no explicit theme preference is stored in localStorage AND the OS color scheme preference is dark, THEN THE App_Shell SHALL apply the dark theme on first launch; IF a theme preference is stored, THEN the stored preference SHALL take precedence over the OS preference.
5. WHEN the user selects a theme, THE App_Shell SHALL persist the selection to `localStorage` under the key `"arlo-theme"`.
6. WHEN the App_Shell launches, THE App_Shell SHALL read `localStorage` key `"arlo-theme"` and apply the stored theme before first render; IF the stored value is not a recognized theme identifier, THEN THE App_Shell SHALL apply the light theme as the default.

---

### Requirement 2: App Shell — Sidebar and Topbar

**User Story:** As a user, I want consistent navigation and chrome across every screen, so that I can move between sections quickly.

#### Acceptance Criteria

1. THE App_Shell SHALL render a Sidebar containing: the Arlo brand mark (SVG A-frame glyph in an accent-colored 22 px rounded tile), the label "Arlo", four navigation items (Dashboard, Sessions, Insights, Settings) each with their respective SVG icon, and a collapse toggle button at the foot.
2. WHEN the Sidebar is expanded, THE Sidebar SHALL have a width of 232 px and display both icons and labels for all four navigation items.
3. WHEN the Sidebar is collapsed, THE Sidebar SHALL have a width of 64 px; all text labels SHALL be hidden and only icons SHALL be visible.
4. WHEN the user clicks the collapse toggle, THE Sidebar SHALL toggle between expanded and collapsed states, completing the transition within 200 ms.
5. THE App_Shell SHALL persist the sidebar collapsed/expanded state as a boolean to local browser storage under the key `"arlo-sidebar-collapsed"` and restore the persisted state on application launch; IF no persisted value exists, THEN THE App_Shell SHALL default to the expanded state.
6. WHEN the current route changes, THE App_Shell SHALL mark exactly one nav item as active by applying the `active` CSS class, and SHALL remove the `active` class from all other nav items; IF the current route does not match any of the four nav items, THEN THE App_Shell SHALL apply the `active` class to no nav item.
7. THE App_Shell SHALL render a Topbar that is 52 px tall, displays a glassmorphic background using `--nav-glass` with `backdrop-filter: saturate(180%) blur(20px)`, shows the current page title as a text string matching the active navigation item label, and contains the theme toggle button aligned to the top-right of the Topbar.
8. THE App_Shell SHALL render a titlebar spacer of 28 px height at the top of the main column with `-webkit-app-region: drag` to support macOS native window dragging.
9. WHEN the user clicks the theme toggle button, THE App_Shell SHALL switch the active theme from light to dark or from dark to light; WHILE in light mode, THE theme toggle button SHALL display a moon icon; WHILE in dark mode, THE theme toggle button SHALL display a sun icon; the toggle button SHALL be circular with a diameter of 30 px.
10. WHILE the viewport width is less than 920 px and the Sidebar is in the expanded state, THE Sidebar SHALL be positioned as an overlay above the main content area with a z-index of 50 and a visible box shadow, without shifting the main content layout.
11. IF the local browser storage key `"arlo-sidebar-collapsed"` contains a value that is not a valid boolean representation, THEN THE App_Shell SHALL discard the stored value and default to the expanded state.

---

### Requirement 3: Dashboard Screen

**User Story:** As a user, I want a top-level overview of all my AI coding tool activity, so that I can understand my usage and value at a glance.

#### Acceptance Criteria

1. THE Dashboard SHALL display four stat tiles in a 4-column grid: API-equivalent value (in dollars with 2 decimal places), Requests (integer count), Tokens (formatted with B/M/K suffix), and Active days (integer count).
2. THE Dashboard stat tile for API-equivalent value SHALL include an info popover (`.info-dot`) explaining that the value represents API cost at standard rates, not the subscription charge.
3. THE Dashboard SHALL display a stacked bar chart titled "Usage over time" in a card below the stat tiles, with a y-axis showing 5 labeled gridlines, an x-axis with date labels, and a legend showing the active dimension's series colors and names.
4. WHEN the active Granularity is "Day", THE Dashboard chart SHALL render one bar column per calendar day within the selected date range.
5. WHEN the active Granularity is "Week", THE Dashboard chart SHALL aggregate data into ISO weeks and render one bar column per week.
6. WHEN the active Granularity is "Hour" and a day drill-down is active, THE Dashboard chart SHALL render 24 bar columns, one per hour of the selected day.
7. WHEN the user clicks a bar column and Granularity is "Day", THE Dashboard chart SHALL drill down to the hourly view for that day, update the breadcrumb to show the selected date, and show a "back to all time" breadcrumb link; WHEN the user activates drill-down, THE Dashboard SHALL automatically switch the Granularity control to "Hour".
8. WHEN the user clicks the breadcrumb "back" link or the "×" close button in the breadcrumb, THE Dashboard chart SHALL return to the day-level view and reset Granularity to "Day".
9. THE Dashboard chart SHALL render a chart tooltip on pointer entry over a bar column, showing the bucket label, per-series values with their series color swatches, and a total row; the tooltip SHALL reposition to follow the pointer and SHALL disappear on pointer leave.
10. THE Dashboard chart SHALL include 5 token-kind filter pills below the bars WHEN the active Measure is "Tokens": Input, Output, Cache write 5m, Cache write 1h, and Cache read — each with its series color swatch and percentage share of all tokens.
11. WHEN a token-kind pill is toggled off, THE Dashboard chart SHALL recalculate bar heights excluding the disabled kind and update the y-axis scale; the pill SHALL display a dashed border and the swatch SHALL render at 30% opacity; IF all pills are toggled off, THE Dashboard chart SHALL display empty bars and show a hint to re-enable at least one kind.
12. WHEN a previously toggled-off token-kind pill is toggled back on, THE Dashboard chart SHALL restore that kind's contribution to bar heights within 50 ms.
13. THE Dashboard SHALL display a filter bar above the chart containing: a date range picker showing the active range label, a segmented date preset control (7d / 30d / 90d / All / Custom), a segmented measure control (Tokens / Requests / Cost), a segmented granularity control (Hour / Day / Week), a Stack-by dropdown, and a "+ Filter" chip trigger.
14. WHEN the user selects a date preset from the segmented control, THE Dashboard SHALL update the date range label and re-filter all stat tiles, chart data, and breakdown table rows to the selected window within 100 ms.
15. WHEN the user selects the "Custom" date preset, THE Dashboard SHALL display a date range input allowing the user to specify a start and end date; WHEN the custom range is confirmed, THE Dashboard SHALL apply it as the active date range.
16. WHEN the user selects a measure, THE Dashboard chart, stat tiles, and breakdown tables SHALL update to display the selected measure (tokens, requests, or cost) within 50 ms.
17. WHEN the user selects a Stack-by value, THE Dashboard chart legend and bar segment colors SHALL update to reflect the new dimension within 50 ms.
18. THE Dashboard SHALL display three sortable breakdown tables below the chart: By model, By project, and By branch — each with columns for name, requests, tokens, and cost, and a share bar in the name column; the default sort SHALL be by tokens descending.
19. WHEN the user clicks a sortable column header, THE Dashboard breakdown table SHALL sort by that column descending; WHEN the user clicks the same header again, THE Dashboard SHALL sort by that column ascending; a sort-direction arrow SHALL be visible on the active sort column.
20. WHEN the user clicks a row in a breakdown table, THE Dashboard chart SHALL filter to show only data for that entity and update the active filter chip display; all other table rows SHALL render at 30% opacity; clicking the row again SHALL clear the entity filter.
21. THE Dashboard SHALL show a dismissible Context_Alert_Banner at the top of the live-data view WHEN any active Session has crossed the context-alert threshold configured in Settings.
22. THE Dashboard SHALL show a dismissible Unpriced_Warning_Strip WHEN one or more models in the data set have no pricing entry.
23. WHEN the user clicks the dismiss button on the Context_Alert_Banner or Unpriced_Warning_Strip, THE Dashboard SHALL hide that element immediately with no animation delay.
24. THE Dashboard SHALL display a first-run scan state WHEN no sessions are present in the database and a scan is in progress, showing a progress bar, a file-count / byte-count meter, and a scan log.
25. THE Dashboard SHALL display an empty state WHEN no sessions are present in the database and no scan is in progress, showing a "No Claude Code logs found" message, a Re-scan button, and a link to Settings.
26. WHEN the user clicks Re-scan on the empty state, THE Dashboard SHALL invoke the `rescan` Tauri command and transition to the scanning state.

---

### Requirement 4: Sessions Screen

**User Story:** As a user, I want to browse and search all my sessions in a dense table, so that I can find specific work and understand per-session cost.

#### Acceptance Criteria

1. THE Sessions screen SHALL display a filter bar containing: a date range picker, date preset segmented control (7d / 30d / 90d / All / Custom), a measure segmented control (Tokens / Requests / Cost), and a full-text search field.
2. THE Sessions screen SHALL display a sortable, paginated table with the following columns: Session (name + ID in monospace subtitle), Project, Branch, Started, Duration, Requests, Tokens, Cost, Models (color dot array), Context high-water (meter track), and Compactions; the default sort SHALL be by Started date descending.
3. WHEN the measure is "Tokens", THE Sessions table SHALL highlight the Tokens column with `--accent-wash` background.
4. WHEN the measure is "Cost", THE Sessions table SHALL highlight the Cost column with `--accent-wash` background.
5. THE Sessions table SHALL render each model in the "Models" column as an 8 px color-coded dot using the model's series color, with a tooltip showing the model name on hover; rows with more than 3 models SHALL show a "+N" overflow label.
6. THE Sessions table SHALL render each session's Context_High_Water as a meter track with a fill that uses `--muted-2` color below 50%, `--accent` color between 50%–74%, `--warning` color between 75%–89%, and `--critical` color at 90% or above.
7. THE Sessions table SHALL render a compaction badge (accent pill with count) for sessions with one or more compactions, and an em dash for sessions with zero compactions.
8. WHEN the user types in the search field, THE Sessions table SHALL filter rows to those whose session name, project, or branch contains the search text; filtering SHALL be debounced to 300 ms after the last keystroke before re-rendering.
9. WHEN the user clicks a Project or Branch cell in the Sessions table, THE Sessions screen SHALL add a Filter_Chip for that dimension value and filter the table; multiple chips SHALL be combinable and act as AND filters.
10. WHEN the user removes a Filter_Chip by clicking its × button, THE Sessions table SHALL remove only that chip's filter constraint and re-apply any remaining chips.
11. THE Sessions table SHALL show 15 rows per page; the pager footer SHALL display "Page N of M" and Previous / Next buttons.
12. WHEN the user clicks Previous or Next, THE Sessions table SHALL advance to the respective page and scroll the table back to its top row.
13. WHEN the user clicks a table row, THE Sessions screen SHALL navigate to the Session Detail screen for that session.
14. WHEN the user presses Enter while a table row has keyboard focus, THE Sessions screen SHALL navigate to the Session Detail screen for that session.
15. THE Sessions screen SHALL display the total filtered row count above the table as "Showing N of M sessions".

---

### Requirement 5: Session Detail Screen

**User Story:** As a user, I want to inspect a single session's context usage and every individual request, so that I can understand exactly where tokens were spent.

#### Acceptance Criteria

1. THE Session_Detail screen SHALL display a header containing: the session name as an `h1`, a metadata line showing project name, branch (in monospace pill), start time, and duration, and four right-aligned stat items: Requests, Tokens, Cost, and Compactions.
2. THE Session_Detail screen SHALL display a "← Sessions" back link that navigates to the Sessions screen.
3. THE Session_Detail screen SHALL display a context-usage SVG timeline chart titled "Context usage across session" with one data point per Request in the session; IF the session has no requests, THE Session_Detail screen SHALL display a message stating "No requests recorded for this session" in place of the chart.
4. THE Session_Detail context chart SHALL draw a dashed red ceiling line at the model's context window limit, labeled with the token count and model name.
5. THE Session_Detail context chart SHALL render y-axis gridlines and labels at 0%, 25%, 50%, 75%, and 100% of the ceiling.
6. THE Session_Detail context chart SHALL render the context curve as a continuous line segment between consecutive requests; WHEN the session contains N compaction events, the curve SHALL be rendered as N+1 separate line segments, each starting at the post-compaction resumption point.
7. WHEN the session contains a Compaction event, THE Session_Detail context chart SHALL mark the drop with a dashed vertical line, an open circle at the pre-compaction peak, an open circle at the post-compaction resumption point, and an HTML annotation overlay showing "Compacted · pre_value → post_value tokens".
8. THE Session_Detail context chart SHALL render an area fill under the context curve using `--accent` at 8% opacity.
9. WHEN the user moves the pointer over the context chart, THE Session_Detail context chart SHALL snap the crosshair to the nearest request data point by index, show a crosshair vertical line, a tooltip with Request number, context-in-use token count, and percentage of ceiling; the tooltip SHALL follow the pointer and disappear on pointer leave.
10. THE Session_Detail screen SHALL display a request timeline table containing, for each sampled Request: time, model (color dot + name), effort badge, token display, cost, stop reason tag, skill/MCP pill (if present), and a transcript link icon.
11. THE Session_Detail request table SHALL render token data as a 96 px proportional mini-bar composed of five colored segments — one per Token_Kind in its corresponding `--series-N` color — alongside the total token count by default.
12. WHEN the "Raw token counts" toggle is switched on, THE Session_Detail request table SHALL hide the mini-bar and total, and instead display five separate numeric counts labeled: input, output, cache write 5m, cache write 1h, cache read.
13. THE Session_Detail screen SHALL initially show up to 40 requests; IF the session has 40 or fewer requests, THE Session_Detail screen SHALL display all requests and hide the "Load 40 more" button; WHEN the user clicks "Load 40 more", THE Session_Detail screen SHALL reveal the next 40 requests and update the "Showing N of M" counter.
14. WHEN all requests are visible, THE Session_Detail screen SHALL hide the "Load 40 more" button.
15. THE Session_Detail stop-reason tag SHALL use: green wash/text for `end_turn`, neutral wash for `tool_use`, warning wash/text for `max_tokens`, and critical wash/text for `refusal`.
16. THE Session_Detail effort badge SHALL use: `effort-medium` style for medium effort, `effort-high` style for high effort, and `effort-xhigh` style (accent background, white text) for extra-high effort.

---

### Requirement 6: Insights Screen

**User Story:** As a user, I want pre-computed analysis cards that surface actionable patterns in my usage, so that I can optimize my workflow without manually querying the data.

#### Acceptance Criteria

1. THE Insights screen SHALL display six Insight_Cards in a 3-column grid that collapses to 2 columns below 1180 px and 1 column below 760 px.
2. THE Insights Context_Health card SHALL show the count of sessions currently above the context-alert threshold, an explanatory sentence naming the highest-usage session and its percentage, and a ranked bar list of the top 5 sessions by context-window fill percentage, color-coded by band (warning for 75%–89%, critical for 90%–100%).
3. THE Insights Context_Health card SHALL include a "View flagged sessions" link that navigates to the Sessions screen.
4. THE Insights Cache_Efficiency card SHALL show the cache hit rate percentage rounded to one decimal place, a sentence describing the cache-read to input token ratio and estimated spending impact in dollars rounded to two decimal places, a mini stacked bar showing the split between cache write 5m and cache write 1h token volumes, a legend with token counts for each segment, and a "2× premium" tag on the cache write 1h segment.
5. THE Insights Cache_Efficiency card SHALL include a "View cache breakdown" link that navigates to the Dashboard screen.
6. THE Insights MCP_Skill_Attribution card SHALL show the top MCP server or skill by request volume as the headline number, an explanatory sentence with the request count and server or skill name, and a ranked bar list of the top 4 servers or skills by request count.
7. IF the MCP_Skill_Attribution card has fewer than 4 servers or skills with recorded requests, THEN THE Insights MCP_Skill_Attribution card SHALL display only the entries with at least 1 request.
8. THE Insights MCP_Skill_Attribution card SHALL include a "View all servers & skills" link that navigates to the Dashboard screen.
9. THE Insights Model_Rightsizing card SHALL show the count of Opus-equivalent requests that produced under 500 output tokens, an explanatory sentence with the estimated cost saving in dollars rounded to two decimal places at Sonnet rates, and a key-value row table with: Opus 5 requests analyzed, requests under 500 output tokens with percentage rounded to one decimal place, and modeled cost saving at Sonnet 5 rates in dollars rounded to two decimal places.
10. THE Insights Model_Rightsizing card SHALL carry an "Estimate" badge in the eyebrow.
11. THE Insights Budget_Forecast card SHALL show the month-to-date spend in dollars rounded to two decimal places, the 7-day burn rate per day in dollars rounded to two decimal places, an estimated month-end projection in dollars rounded to two decimal places with an "Estimate" badge, a key-value table with 7-day burn total and projected month-end spend, and a Budget_Bar fill that uses the `--warning` color token when the projected spend exceeds 80% of the configured budget and the `--critical` color token when the projected spend exceeds 100% of the configured budget.
12. IF no budget has been configured, THEN THE Insights Budget_Forecast card SHALL hide the Budget_Bar and display a prompt to set a budget.
13. THE Insights Budget_Forecast card SHALL include an "Adjust budget" link that navigates to the Settings screen.
14. THE Insights Tool_Failures card SHALL show the count of requests that ended with the `max_tokens` stop reason, an explanatory sentence with the `max_tokens` percentage of total requests rounded to one decimal place and the count of refusal stop-reason requests, a mini stacked bar showing the proportion of end_turn, tool_use, max_tokens, and refusal stop-reason requests out of total requests for the selected time period, and a legend with counts for each stop reason.
15. THE Insights Tool_Failures card SHALL include a "View affected sessions" link that navigates to the Sessions screen.

---

### Requirement 7: Settings Screen

**User Story:** As a user, I want to configure my plan price, budget, notifications, logs directory, and review the pricing table, so that Arlo's calculations reflect my actual situation.

#### Acceptance Criteria

1. THE Settings screen SHALL display a "Plan & budget" card containing: a monthly plan price input (dollar prefix, numeric, accepting values from 0.00 to 999,999.99 with up to 2 decimal places), a monthly budget input (same constraints), and a context-alert threshold range slider (50%–95%, step 5%).
2. WHEN the user changes the threshold slider, THE Settings screen SHALL update the threshold percentage label on each change event.
3. IF the user blurs a currency input and the current value is empty or contains non-numeric characters, THEN THE Settings screen SHALL apply the `error` CSS class to the field wrapper and render a `role="alert"` error message reading "Enter a number of 0 or more."
4. IF the user blurs a currency input and the current value is a valid number greater than or equal to 0, THEN THE Settings screen SHALL remove the `error` CSS class from the field wrapper and remove any error message associated with that field.
5. THE Settings screen SHALL display a "Notifications" card containing three toggle switches: Context alerts, Daily digest, and Budget warnings — each with a label and a hint sentence.
6. WHEN the user clicks or presses Enter/Space on a notification toggle switch, THE Settings screen SHALL toggle the switch state and update `aria-checked` accordingly.
7. THE Settings screen SHALL display a "Logs directory" card showing the current logs path in a read-only field (monospace text, visually distinct background), a "Change…" button, and a "Re-scan" button.
8. WHEN the user clicks "Re-scan", THE Settings screen SHALL disable the Re-scan button and change its label to "Scanning…" within 50 ms; WHEN 1100 ms have elapsed since the button was clicked, THE Settings screen SHALL re-enable the Re-scan button and restore its original label.
9. THE Settings screen SHALL display a "Pricing" card containing a read-only, horizontally scrollable pricing table with columns: Model (color dot + name), Input /Mtok, Output /Mtok, Cache write 5m, Cache write 1h, Cache read, Effective date.
10. IF a model has two or more effective-dated rate rows, THEN THE Settings Pricing_Table SHALL label the earliest row with an "Introductory" badge and all subsequent rows with a "Standard" badge.
11. IF a model has two or more effective-dated rate rows, THEN THE Settings Pricing_Table SHALL apply `--accent-wash` background to all rows belonging to that model.
12. IF one or more models in the data set have no pricing entry, THEN THE Settings screen SHALL show an Unpriced_Warning_Strip inside the Pricing card with the count of unpriced models and the total request and token usage attributed to those unpriced models.
13. WHEN the user clicks the Re-price button, THE Settings screen SHALL disable the button and change its label to "Re-pricing…" within 50 ms; WHEN 1100 ms have elapsed since the button was clicked, THE Settings screen SHALL re-enable the button and restore its original label.
14. THE Settings screen SHALL display a footnote below the Pricing_Table explaining the effective-date transition behavior.

---

### Requirement 8: Responsive Layout

**User Story:** As a user, I want the app to remain usable across window sizes, so that I can resize or run the window at various dimensions without losing content.

#### Acceptance Criteria

1. THE App_Shell SHALL avoid horizontal overflow at all viewport widths in the responsive matrix: 360, 390, 430, 600, 820, 1024, 1366, 1440, and 1920 px wide.
2. WHEN the viewport width is 920 px or narrower, THE Dashboard stat tiles SHALL reflow to a 2-column grid.
3. WHEN the viewport width is 1100 px or narrower, THE Dashboard three breakdown tables SHALL stack vertically to a single column.
4. WHEN the viewport width is 720 px or narrower, THE Dashboard stat tiles SHALL remain in a 2-column grid and SHALL NOT reduce to 1 column.
5. THE Sessions table container SHALL be horizontally scrollable when the table's minimum width of 1180 px exceeds the viewport width.
6. WHEN the viewport width is 900 px or narrower, THE Session_Detail request table SHALL hide the Cost column to prevent overflow.
7. WHEN the viewport width is 1180 px or narrower, THE Insights grid SHALL collapse from 3 columns to 2 columns.
8. WHEN the viewport width is 760 px or narrower, THE Insights grid SHALL collapse from 2 columns to 1 column.
9. WHEN the Dashboard stat tiles are displayed in a 2-column grid at any viewport width in the responsive matrix, all tile text labels and numeric values SHALL remain fully visible without truncation or clipping.
10. WHILE the viewport width is between 721 px and 919 px inclusive, THE Dashboard stat tiles SHALL display in a 2-column grid and BOTH criteria 2 and 4 SHALL apply simultaneously.
11. WHEN the viewport width is 900 px or narrower and the Cost column has been hidden in the Session_Detail request table, IF the remaining visible columns cause horizontal overflow, THEN THE Session_Detail request table container SHALL be horizontally scrollable.

---

### Requirement 9: Accessibility and Interactive States

**User Story:** As a user, I want all interactive controls to be keyboard-navigable and screen-reader-friendly, so that the app is accessible to all users.

#### Acceptance Criteria

1. THE App_Shell SHALL provide a visible focus ring with a minimum 2 px solid outline using the `--accent` color token on all interactive elements — buttons, nav items, inputs, selects, chips, pills, segmented controls, table row links, switches, and range inputs — when focused via keyboard, and SHALL NOT display the focus ring when focused via pointer.
2. THE App_Shell SHALL render all navigation landmarks semantically: `<aside>` for the Sidebar, `<nav>` for the nav list, `<main>` or a scroll region with a unique accessible label for the page content, and heading levels that do not skip ranks (e.g., h1 → h2 → h3).
3. THE Sessions table rows SHALL have `tabIndex="0"`, expose `role="row"` or equivalent interactive role, and respond to the Enter key by navigating to the corresponding Session Detail view.
4. THE Settings notification toggles SHALL have `role="switch"` and SHALL keep `aria-checked` set to `"true"` when the toggle is on and `"false"` when the toggle is off, in sync with the visual state after each toggle interaction.
5. THE Settings threshold slider SHALL update `aria-valuetext` to the current percentage value formatted as `"[N]%"` within one input event of the user adjusting the slider.
6. THE Session_Detail raw-counts toggle switch SHALL have `role="switch"` and SHALL keep `aria-checked` set to `"true"` when on and `"false"` when off, in sync with the visual state after each toggle interaction.
7. THE App_Shell info-dot popovers (`.info-dot`) SHALL be reachable via Tab key focus, SHALL open on Enter or Space keypress when focused, SHALL close on Escape keypress or when focus moves outside the popover, and SHALL dismiss when a click event occurs on any element outside the popover.
8. WHEN an Insight_Card link is rendered as an anchor, THE Insight_Card link SHALL be reachable via Tab key focus and SHALL display a visible focus ring with a minimum 2 px solid outline using the `--accent` color token when focused via keyboard.
9. WHEN a modal or popover opens, THE App_Shell SHALL move focus to the first focusable element inside the opened component and SHALL trap focus within it until it is dismissed.
10. IF an interactive element does not have a visible text label, THEN THE App_Shell SHALL provide an accessible name via `aria-label` or `aria-labelledby` such that a screen reader announces a descriptive label for that element.

---

### Requirement 10: Tauri Data Integration

**User Story:** As a user, I want the UI to reflect my real Claude Code log data, so that the stats and charts are meaningful and accurate.

#### Acceptance Criteria

1. WHEN the App_Shell initializes, THE App_Shell SHALL invoke the `list_sessions` Tauri command and store the returned `Session[]` array in application state.
2. WHEN a `"usage-updated"` Tauri event is received, THE App_Shell SHALL re-invoke `list_sessions` and refresh the Dashboard stat tiles and Sessions table without requiring a full page reload.
3. WHILE sessions are loaded in application state, THE Dashboard stat tiles SHALL derive their values as follows: total tokens = sum of (input_tokens + output_tokens + cache_creation_tokens + cache_read_tokens) across all sessions; cost = per-model rate from the pricing table applied to each token category per session.
4. WHILE sessions are loaded in application state and a Granularity is selected, THE Dashboard chart SHALL derive per-bucket totals by grouping session `started_at` timestamps into day, week, or hour buckets as determined by the active Granularity.
5. WHILE sessions are loaded in application state, THE Sessions table SHALL be populated with one row per `Session` object.
6. WHEN the user navigates to `/sessions/:id`, THE Session_Detail screen SHALL display data for the session whose `session_id` matches the URL parameter.
7. IF no session in application state matches the route parameter `:id`, THEN THE Session_Detail screen SHALL display an error message stating the session was not found and render a link back to `/sessions`.
8. WHEN the Rust backend emits a `"usage-updated"` event following a file-system change, THE App_Shell SHALL re-fetch sessions within 500 ms and render the updated token totals and cost values in the Dashboard stat tiles and chart.
9. IF the `list_sessions` command returns an empty array and no scan is in progress, THEN THE Dashboard SHALL display the empty state rather than a chart with zero values.
10. WHEN the `rescan` Tauri command is invoked from the Dashboard empty state or the Settings Re-scan button, THE App_Shell SHALL transition the Dashboard to the scanning state and show a progress indicator.
11. WHEN the `rescan` Tauri command completes, THE App_Shell SHALL invoke `list_sessions` to refresh application state and transition the Dashboard away from the scanning state.
12. IF a Tauri command invocation returns an error, THEN THE App_Shell SHALL display an inline error message scoped to the screen that triggered the command, without unmounting the React component tree.

---

### Requirement 11: Client-Side Navigation and Routing

**User Story:** As a user, I want to navigate between all five screens without page reloads, so that the app feels fast and native.

#### Acceptance Criteria

1. THE App_Shell SHALL use a client-side router with routes: `/` → Dashboard, `/sessions` → Sessions, `/sessions/:id` → Session Detail, `/insights` → Insights, `/settings` → Settings, such that navigating to any of these routes renders the corresponding screen without a full page reload.
2. WHEN the user clicks a Sidebar nav item, THE App_Shell SHALL navigate to the corresponding route within 100 ms and update the active nav item highlight, without triggering a full page reload.
3. WHEN the user navigates to `/sessions/:id`, THE Session_Detail screen SHALL extract the session ID from the URL parameter and load data for that session; IF no session matching the ID exists, THEN THE Session_Detail screen SHALL display an error message and a link back to `/sessions`.
4. WHEN the user clicks the "← Sessions" back link on Session Detail, THE App_Shell SHALL navigate to `/sessions` without a full page reload and without losing the existing sessions list state.
5. WHEN the user clicks "View session" in the Context_Alert_Banner, THE App_Shell SHALL navigate to `/sessions/:id` for the referenced session within 100 ms without a full page reload.
6. WHEN the user clicks a link on an Insight_Card, THE App_Shell SHALL navigate to the target route specified for that card within 100 ms without a full page reload.
7. WHEN the user clicks "Change logs directory" in Settings, THE App_Shell SHALL invoke a Tauri file-picker dialog; IF the user selects a directory, THEN THE App_Shell SHALL update the displayed logs directory path to the selected path; IF the user cancels the dialog, THEN THE App_Shell SHALL retain the previously displayed logs directory path unchanged.

---

### Requirement 12: Performance and Loading States

**User Story:** As a user, I want screens to render promptly and indicate progress during data operations, so that I never feel uncertain whether the app is working.

#### Acceptance Criteria

1. WHEN session data is being loaded for the first time, THE Dashboard SHALL display a loading skeleton or scan-state indicator rather than a blank screen.
2. THE Dashboard stacked bar chart SHALL render all visible bar columns within 100 ms of the session data becoming available in application state.
3. WHEN the Re-scan button is clicked, THE Settings screen SHALL disable the Re-scan button and display a "Scanning…" label on the button within 50 ms of the click event, and SHALL keep the button disabled until the scan operation completes or fails.
4. WHEN the Re-price button is clicked, THE Settings screen SHALL disable the Re-price button and display a "Re-pricing…" label on the button within 50 ms of the click event, and SHALL keep the button disabled until the re-pricing operation completes or fails.
5. WHEN a filter, measure, or granularity control is changed on the Dashboard, THE Dashboard chart and tables SHALL re-render with updated data within 100 ms of the control change event.
6. WHEN the Sessions search field receives input, THE Sessions table SHALL filter visible rows to those matching the input value and re-render within 100 ms of each keystroke.
7. IF the Re-scan operation completes, THEN THE Settings screen SHALL re-enable the Re-scan button and restore its default label.
8. IF the Re-price operation completes, THEN THE Settings screen SHALL re-enable the Re-price button and restore its default label.
9. IF the Re-scan operation fails, THEN THE Settings screen SHALL re-enable the Re-scan button, restore its default label, and display an error message indicating the scan could not be completed.
10. IF the Re-price operation fails, THEN THE Settings screen SHALL re-enable the Re-price button, restore its default label, and display an error message indicating the re-pricing could not be completed.
