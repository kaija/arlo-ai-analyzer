# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Tauri 2 desktop app that reads local AI coding-tool logs and reports tokens/cost. Fully offline — no
network calls, no vendor APIs. Claude Code (`~/.claude/projects`) and Codex CLI (`~/.codex/sessions`)
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

**`src-tauri`** — thin. Four commands: `list_sessions`, `get_session_detail`, `rescan`,
`reset_database`. On setup it scans, upserts, then leaks a `notify` watcher on
`~/.claude/projects` that rescans and emits `usage-updated`.

**Frontend** — `SessionsContext` is the only thing that talks to the backend: initial `list_sessions`
plus a 500 ms-debounced re-fetch on `usage-updated`. Providers nest Settings → Language → Sessions.
`HashRouter` (file:// in the bundled app). Charts are hand-rolled SVG, no chart library.

### The SQLite cache is derived data

`~/…/app_data_dir/usage.sqlite3` is a pure cache of the transcripts. Schema changes are handled by
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

### Pricing lives in three places

| File | Role |
|---|---|
| `crates/usage-core/src/pricing.rs` | authoritative — per-request cost accumulated at parse time into `Session.cost_usd` |
| `src/pricing.ts` | mirror of the same rates for UI display and fallback `estimatedCostUsd()` |
| `src/lib/openrouter-pricing.ts` | auto-generated from the OpenRouter API — do not hand-edit; `rateFor` falls back to it for non-Anthropic models (Codex's `gpt-*` ids resolve as `openai/<id>`) |

Both hand-written tables are Anthropic-only, so Codex sessions arrive with `cost_usd` 0 and are
priced on the front end from the OpenRouter table. Both derive cache rates from the input rate
(5m write ×1.25, 1h write ×2, read ×0.1) rather than transcribing five numbers per model.
An unknown model returns `None`/`null`, which means **unknown, not free** — the UI must render "—",
never `$0.00`. Keep `pricing.rs` and `pricing.ts` in sync when adding a model.

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
