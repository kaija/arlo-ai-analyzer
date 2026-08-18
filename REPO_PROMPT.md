# ai-analyzer — Repo Bootstrap Prompt

Use this as the prompt to scaffold the project (e.g. hand it to Claude Code / an agent, or follow it manually).

## What we're building

A Tauri 2.x desktop app (macOS + Windows) that analyzes local AI coding-tool usage — Claude Code,
Cursor, Gemini CLI, Codex CLI — and shows a unified dashboard of activity and estimated cost/token
usage. Everything is computed from files already on disk. No network calls, no telemetry, no vendor
API auth.

## Stack

- Rust (latest stable)
- Tauri 2.x
- React 19 + TypeScript, Vite
- pnpm
- Recharts (charts)
- rusqlite (local cache DB)
- notify (filesystem watching)

## Data sources (local, offline only)

| Tool | Location | Format |
|---|---|---|
| Claude Code | `~/.claude/projects/<project>/<session>.jsonl` | JSONL transcript, one file per session |
| Cursor | `~/.cursor/ai-tracking/ai-code-tracking.db` | SQLite |
| Gemini CLI | `~/.gemini/history/<project>/` | per-project history dir |
| Codex CLI | `~/.codex/history.jsonl`, `~/.codex/session_index.jsonl`, `~/.codex/sessions/` | JSONL + session files |

**v1 scope**: implement the Claude Code parser fully. Implement the trait/architecture so Cursor,
Gemini CLI, and Codex CLI parsers are stubs (return empty/`todo!()`) that slot in later without
touching the rest of the app.

## Repo structure

Scaffold with `create-tauri-app` (react-ts template), then restructure into a Cargo workspace:

```
ai-analyzer/
├── Cargo.toml              # workspace root
├── crates/
│   └── usage-core/         # no Tauri dependency — unit-testable on its own
│       ├── src/
│       │   ├── source.rs   # UsageSource trait: scan() -> Vec<Session>
│       │   ├── model.rs    # Session, Message, TokenUsage, ToolKind, etc.
│       │   ├── db.rs       # rusqlite schema + upserts
│       │   ├── watcher.rs  # notify-based file watching
│       │   ├── pricing.rs  # hardcoded $/token table per model
│       │   └── sources/
│       │       ├── claude_code.rs   # real parser
│       │       ├── cursor.rs        # stub
│       │       ├── gemini_cli.rs    # stub
│       │       └── codex_cli.rs     # stub
│       └── Cargo.toml
├── src-tauri/               # thin: Tauri commands calling into usage-core
│   ├── src/main.rs
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/                     # React frontend
│   ├── main.tsx
│   ├── router.tsx            # Overview / per-tool / per-project pages
│   ├── pages/
│   │   ├── Overview.tsx
│   │   ├── ToolDetail.tsx
│   │   └── ProjectDetail.tsx
│   └── components/
├── package.json
├── LICENSE                  # MIT (already present)
└── README.md
```

## Data model (usage-core)

Breakdown dimensions: **Tool × Project × Time × Model**.

```rust
struct Session {
    tool: ToolKind,        // ClaudeCode | Cursor | GeminiCli | CodexCli
    project: String,       // derived from path/cwd
    started_at: DateTime<Utc>,
    model: Option<String>, // e.g. "claude-sonnet-5"
    input_tokens: u64,
    output_tokens: u64,
    message_count: u32,
}
```

SQLite cache stores sessions keyed by `(tool, session_id)` so re-scans upsert instead of duplicate.
Estimated cost = tokens × per-model rate from `pricing.rs` (static table, not fetched).

## Behavior

- **Startup**: scan all enabled sources, upsert into SQLite cache, render dashboard from the cache.
- **Live updates**: `notify` watches each source's directory; on change, re-parse the affected
  file/session only and push an update to the frontend (Tauri event).
- **No manual refresh button needed**, but don't block on it if trivial to add.

## UI

- **Overview page**: stat tiles (total sessions, tokens, est. cost, active days), a time-series
  chart (Recharts), and a table breakdown by tool.
- **Per-tool page**: same shape, filtered to one tool, broken down by project and model.
- **Per-project page**: usage across all tools for one project.
- Client-side router (React Router or Tauri-friendly equivalent) ties the three together.

## Explicitly out of scope for v1

- Vendor API calls for authoritative billing (Anthropic Console, OpenAI usage API, etc.)
- Cursor/Gemini CLI/Codex CLI real parsers (stub only)
- CI/release pipeline, code signing, notarization, auto-update
- Any telemetry or network activity from the app itself

## Acceptance check for v1

- `pnpm tauri dev` launches on macOS, shows the Overview page populated from real
  `~/.claude/projects` data on the machine it runs on.
- `cargo test -p usage-core` passes, including at least one test that parses a fixture
  Claude Code JSONL file into `Session`s with correct token totals.
