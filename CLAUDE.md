# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Tauri 2 desktop app that reads local AI coding-tool logs and reports tokens/cost, plus each tool's
subscription plan and quota. Offline except one anonymous daily fetch of the model price catalog
(switchable off in Settings) and, only when the user turns it on, live plan-limit checks sent to each
tool's own vendor with that tool's own sign-in. Claude Code (`~/.claude/projects`) and Codex CLI (`~/.codex/sessions`)
are implemented; Cursor and Gemini CLI are deliberate stubs
(`crates/usage-core/src/sources/*.rs`) that return empty vecs.

## Commands

```
make dev            # full Tauri app (real data from ~/.claude/projects)
make test           # cargo test --workspace + pnpm vitest --run
make lint           # clippy -D warnings + tsc on both tsconfigs
make release        # optimized bundle
```

Single test:
- Rust: `cargo test -p usage-core dedupe` (substring match on test name)
- Frontend: `pnpm vitest --run src/lib/insights.property.test.ts`

`pnpm dev` (plain Vite, no Tauri) is not a lesser `make dev`: `vite.config.ts` aliases the Tauri API
modules to `src/tauri-mock.ts`, whose `invoke` returns empty results, so the app renders the empty
state. Use it for layout work only.

Lint runs `tsc` twice — `tsconfig.json` *excludes* test files, `tsconfig.test.json` includes them
with vitest globals. A type error in a test only shows up in the second pass.

## Architecture

**`crates/usage-core`** — all logic, no Tauri dependency, unit-testable alone.
`UsageSource` trait (`tool()`, `scan() -> Vec<Session>`); `scan_all()` runs every source.

**`src-tauri`** — thin. Data commands (plus the tray's, below): `list_sessions`, `get_session_detail`, `rescan`,
`reset_database`, and the folder-access ones `get_data_access`, `grant_source_access`,
`clear_source_access`, `set_sample_data`, and the plan ones `get_plan_status`, `refresh_plan_status`,
`set_plan_online_enabled`. On setup it resolves the log roots, scans, upserts, and
starts a `notify` watcher on them that rescans and emits `usage-updated`; the watcher is held in
`AppState` and replaced whenever the roots change.

### Plans and quotas (`usage_core::plan`, `src-tauri/src/plans.rs`)

Separate from `sources` (history): what each tool is signed in with and how much of its current
limits is used. One `PlanProvider` per tool — add a module and a line in `plan::providers()`; the
front end renders whatever `PlanStatus`es come back. Two tiers:

- `detect` — local only: the tool's own credential store and logs. Claude Code:
  `<config dir>/.credentials.json`, else the macOS keychain item `Claude Code-credentials` read
  through `/usr/bin/security` (the tool Claude Code stores it with, so no prompt) under the same
  account (`-a $USER`, else `claude-code-user`) — without it a stale item can win; plan from
  `subscriptionType` + `rateLimitTier`, account from `~/.claude.json`. Codex: `~/.codex/auth.json`
  (plan and email are JWT claims of `id_token`) and — no network — the newest rollout's
  `token_count.rate_limits`, which is also how a keyring-stored sign-in is recognised.
- `fetch_live` — only with the Settings switch on (off by default, persisted in
  `plan-status-state.json`): `GET api.anthropic.com/api/oauth/usage` / `chatgpt.com/backend-api/wham/usage`
  with the saved access token. **Never refresh a token** — both CLIs rotate refresh tokens, so doing
  it here would sign the CLI out; an expired one is reported as `sign_in_expired`. `usage-core` gets
  HTTP through the `HttpClient` trait; the ureq client lives in `plans.rs`.

A provider's home is the parent of its log root, so a granted `~/.claude` or `~/.codex` covers both
(a grant of `sessions/` alone still gives Codex limits from logs, not `auth.json`). Plans always use
the real roots, even in sample mode. `PlanService` re-detects every 5 min, after log changes
(throttled to 15 s), and on demand; live checks run at most every ~5 min (30 s for "Refresh now");
`carry_over` keeps the freshest quota between passes. Windows past their reset time read as 0%.
Emits `plan-status-updated`; `usePlanStatus` (`src/hooks/`) is the front-end side. The dashboard
card and the popover list `planTools()`: subscriptions, plus any tool with an `issue`, so a sign-in
that couldn't be read is explained rather than silently missing.

### Sandbox and folder access (App Store build)

The App Store build is sandboxed with **no** home-relative temporary exception (Apple rejected
`/.codex/sessions/`). Things that follow from that:

- `$HOME` is the app container inside the sandbox, so `dirs::home_dir()` is wrong for `~/.claude` —
  use `usage_core::paths::real_home_dir()` (reads the password database).
- The user picks each log folder in an `NSOpenPanel` (`tauri-plugin-dialog`, driven from Rust);
  `src-tauri/src/bookmark.rs` keeps it as a security-scoped bookmark in `access.json`
  (`src-tauri/src/access.rs`). Needs `com.apple.security.files.bookmarks.app-scope`. With no grant a
  tool falls back to its default root, which is what makes the unsandboxed `make dev` work unchanged.
- The sandbox still answers `stat` on ungranted paths, so `SourceAccess.detected` (exists) vs
  `readable` (listable) tells onboarding which tools are installed but not yet allowed. Onboarding
  (`src/pages/Dashboard/Onboarding.tsx`) replaces the whole dashboard while there are no sessions;
  "Allow access to both" opens one picker per found tool in turn and stops on a cancel.
- `com.apple.security.network.client` is required even with online features off: a
  sandboxed WKWebView renders a blank window without it.
- Sample data (`usage_core::sample`) writes real-format transcripts under the data dir, relative to
  now, and scans them with the normal parsers into a separate `usage-sample.sqlite3`. It is what
  App Review sees on a machine with no logs — keep the empty state offering it.
- To test the sandbox locally: `pnpm tauri build --debug --bundles app`, then ad-hoc
  `codesign --force --deep -s - --entitlements <plist>` with the sandbox entitlements (minus the
  team/keychain keys), and `rm -rf ~/Library/Containers/com.kaija.ai-analyzer` for a fresh start.

**Tray (`src-tauri/src/tray.rs`)** — closing the main window hides it (and the Dock icon); the
menu-bar icon brings it back, Quit is in its right-click menu. Left click shows the spend popover:
a second borderless window loading `index.html#/tray` (`src/tray/TrayPopover.tsx`, rendered by
`main.tsx` outside the providers). The backend never shows it directly — it emits
`tray-popover-refresh`, the page reloads and answers `tray_popover_ready(height)`, then the window is
sized, placed under the icon and shown. The daily spend alert is evaluated in the *main* window
(`src/tray/TrayBridge.tsx`, logic in `src/lib/spend-alert.ts`) because Codex pricing only exists on
the front end; the hidden main webview keeps running. The popover shares settings with it through
localStorage (same origin), not React context. It also lists plan limits (`src/tray/TrayPlans.tsx`,
the same `QuotaWindowList` as the dashboard card, `compact`), read from `get_plan_status` inside
`load()` so they arrive with the rest before the height is reported; `plan-status-updated` refreshes
them while it is open, and the re-reported height only resizes the window.

**Frontend** — `SessionsContext` is the only thing that talks to the backend: initial `list_sessions`
plus a 500 ms-debounced re-fetch on `usage-updated`. Providers nest Settings → Language → Sessions.
`HashRouter` (file:// in the bundled app). Charts are hand-rolled SVG, no chart library.

### The SQLite cache is derived data

`~/…/app_data_dir/usage.sqlite3` (and `usage-sample.sqlite3`) is a pure cache of the transcripts. Schema changes are handled by
bumping `SCHEMA_VERSION` in [db.rs](crates/usage-core/src/db.rs) — the table is dropped and refilled,
never `ALTER TABLE`d. Adding a `Session` field means: struct + schema + `SCHEMA_VERSION` + INSERT +
UPDATE + SELECT (all in `db.rs`) + `src/types.ts`. `upsert_sessions` never deletes, so rows for
deleted transcripts only go away via `reset_database`.

### Codex rollout parsing gotchas (codex_cli.rs)

Codex writes one `rollout-<ts>-<uuid>.jsonl` per *thread* under `~/.codex/sessions/YYYY/MM/DD/`.
Usage lives only in `event_msg` / `token_count` records:

- `last_token_usage.input_tokens` is the **whole** prompt; `cached_input_tokens` and
  `cache_write_input_tokens` are subsets of it, not additions. Cache reads are ~93% of real traffic,
  so adding instead of subtracting roughly doubles every total.
- `output_tokens` already includes `reasoning_output_tokens`.
- `session_meta.session_id` is the **root thread** id — a subagent records its parent's. The
  session id is the uuid at the end of the filename.
- A subagent replays its parent's `token_count` records with rewritten timestamps but identical
  payloads, and Codex re-emits an unchanged record now and then. Both are deduped on
  `(root thread id, cumulative usage, request usage)` — these records carry no id of their own.
- Stop reasons are inferred: `task_complete` closes a turn, so its last request is `end_turn` and
  everything before it `tool_use`. There is no compaction event.

### Transcript parsing gotchas (claude_code.rs)

These are load-bearing; they were derived from real transcripts and the tests pin them:

- Assistant lines are written repeatedly while streaming (~46% dupes). Keyed by
  `(message.id, requestId)`, **last copy wins** — earlier ones have partial `output_tokens`.
- Resumed/forked sessions replay history into a new file. `scan()` dedupes **across** files (shared
  `seen` set, sorted walk for stability); `get_session_detail` dedupes **file-locally**, so a
  session's displayed request count can exceed its billed count. That asymmetry is intentional.
- `peak_context_tokens` (max single prompt), not a sum, is the context-occupancy number. Judge it
  against `peak_context_model`'s window — `Session.model` is the first turn, often a throwaway Haiku
  title call with a different window.
- Compactions come from explicit `compact_boundary` records, not inferred from curve drops.

### Pricing lives in four places (plus the user's custom prices)

| File | Role |
|---|---|
| `crates/usage-core/src/pricing.rs` | authoritative — per-request cost accumulated at parse time into `Session.cost_usd` |
| `src/pricing.ts` | mirror of the same rates for UI display and fallback `estimatedCostUsd()` |
| `src/lib/price-catalog.ts` | the downloaded catalog (below) — `rateFor` tries it after the hand-written tables |
| `src/lib/openrouter-pricing.ts` | auto-generated from the OpenRouter API — do not hand-edit; bundled fallback when there's no downloaded catalog. Refresh with `make update-openrouter-pricing` before each release |

`resolveRate` (and `rateFor`, its rate only) order: user's custom price → documented non-Anthropic
ids → Claude family match → downloaded catalog → bundled snapshot → `null`; it also reports which
source answered, for Settings' "Models in your data" table. Ids are normalised first (`:batch`/`:free`,
Bedrock-style `openai.`/`us.anthropic.` prefixes); catalog and snapshot lookups try the exact id,
then `openai/<id>`, then the single vendor that lists that bare id.

Custom prices (`src/lib/custom-pricing.ts`) are per exact logged id, lower-cased, stored in
localStorage (`arlo-custom-model-prices`) via `SettingsContext`, installed as module state, and
re-read by the tray popover. Settings offers them only for models nothing else prices. They only
reach costs computed on the front end: a Claude Code session the backend already priced
(`cost_usd` > 0) keeps that cost.

Both hand-written tables are Anthropic-only, so Codex sessions arrive with `cost_usd` 0 and are
priced on the front end from the OpenRouter table. Both derive cache rates from the input rate
(5m write ×1.25, 1h write ×2, read ×0.1) rather than transcribing five numbers per model — except
Opus 5.5 ($0.20) and Fable 5.1 ($0.25), whose cache reads break the rule and are matched by version
before their family. Family matching outranks the catalog, so a new Claude generation with a new
price must be added here; the catalog will not correct it.
An unknown model returns `None`/`null`, which means **unknown, not free** — the UI must render "—",
never `$0.00`. Keep `pricing.rs` and `pricing.ts` in sync when adding a model.

### The price catalog (the app's only unprompted network call)

`.github/workflows/pages.yml` runs daily (and on pushes touching `site/**`, `PRIVACY.md`, the
scripts) and deploys `scripts/build-site.sh`'s output to GitHub Pages at
`https://ai-analyzer.arlo-ai.app/`: `site/` pages, `privacy.html` rendered from `PRIVACY.md`, and
`models.json` — OpenRouter's list trimmed to `{schemaVersion, generatedAt, source, models{id → rates}}`.
A Pages deploy replaces the whole site, so anything served there must be built by that script.

`src-tauri/src/catalog.rs` downloads the **whole** file — never a per-model lookup, so requests
reveal nothing and self-hosted models that will never be listed can't cause repeated fetches. One
conditional GET (`ETag`) per day with jitter; failures back off 1h → 4h → 24h. `validate()` (same
checks as the script: `schemaVersion` 1, ≥50 models, finite non-negative rates) must pass before a
download replaces `model-catalog.json`. An incompatible format goes to a new path
(`models.v2.json`), never a bumped version at the same URL. With the switch off,
`get_price_catalog` returns null and no request is made. `price-catalog-updated` makes
`SessionsContext` reinstall it and replace the sessions array so cost memos recompute; the tray
popover loads it separately (own webview, own module state).

## Conventions

- Tests are property-based with fast-check, named `*.property.test.ts(x)`; a few plain `*.test.ts`.
  Rust tests are inline `#[cfg(test)] mod tests` using `tempfile`.
- i18n: `en` / `zh-TW` / `ja`. A property test enforces key parity with non-empty values, so a new
  string must land in all three locale files or the suite fails.
- Styling: all design tokens and component CSS in `src/tokens.css`; `App.css` is app-level overrides
  only. `mockup/` holds the exported design that `tokens.css` was derived from.
- `ponytail:` comments mark deliberate shortcuts and name the upgrade path — read one before
  "fixing" the thing it describes.
- Re-export shims exist for moved modules (`src/aggregate.ts` → `src/lib/aggregate.ts`,
  `src/hooks/useSessions.ts` → `SessionsContext`). Put new code at the canonical path.
- `.kiro/specs/*` holds the requirements/design/tasks specs the current UI and i18n work came from.
