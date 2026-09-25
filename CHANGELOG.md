# Changelog

All notable changes to Arlo AI Analyzer are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Tools page.** Shows, across sessions, which built-in tools, skills, MCP servers and subagents
  Claude Code and Codex actually call, how often, and how often they fail, next to what each one
  costs on every request just by being loaded. It measures each session's starting context (the
  prompt before any work) and splits it into skills, MCP and subagent listings and the rest. It
  recommends what to turn off, based on published guidance (Anthropic: tool selection degrades past
  30–50 tools; OpenAI: fewer than 20 functions; Codex: skill list capped at 2% of the window), with
  the `skillOverrides`, `claude mcp remove` or `config.toml` change ready to copy. Something
  installed in the last 7 days is never called unused.

## [1.0.2] - 2026-09-25

### Added

- **Plans and limits.** The app now recognises which subscription each tool is signed in with
  (Claude Pro / Max 5x / Max 20x / Team / Enterprise, ChatGPT Plus / Pro / Business …) from the
  tool's own saved sign-in, and shows how much of each usage limit — 5-hour, weekly, per-model
  weekly, extra usage — is used and when it resets, on the Dashboard and under Settings → Plans &
  limits. Codex limits are read from its own logs, with no network. Turning on "Check plan limits
  online" asks Anthropic or OpenAI for current numbers with the tool's own sign-in (off by default;
  the sign-in is never renewed or stored by the app). The menu-bar popover lists the same limits.
  When a sign-in can't be read, the card says why instead of leaving the tool out.
- **Rescan button** in the top bar, on every page, to re-read the logs on demand.

### Changed

- Built-in OpenRouter price snapshot refreshed (450 → 455 models).

### Fixed

- One unreadable project folder or transcript no longer hides every new session from that tool:
  bad files are skipped, and a transcript caught mid-write is still read.
- New log folders that did not exist at startup are now watched after a rescan.

## [1.0.1] - 2026-09-23

### Added

- **Daily usage alert.** Set a daily budget and an early-warning level (50–95%, default 80%) in
  Settings. When today's spend crosses the warning level or the full budget, a popover opens under
  the menu-bar icon — each level fires at most once per local day.
- **Menu-bar icon.** Left-click shows today's spend; right-click reopens or quits the app. Closing
  the main window now keeps the app running in the menu bar instead of quitting.
- **Online model price list.** The app downloads the model price catalog from
  `ai-analyzer.arlo-ai.app` at most once a day, so new models are priced without an app update. The
  whole list is fetched (no per-model lookups) and it is the app's only network request. Turn it off
  with Settings → "Update model prices online"; the built-in price list is used offline.
- **Custom model prices.** Settings → Pricing now lists every model in your data, its rate, and where
  that rate comes from (official, online catalog, built-in, custom, or no price). Models nothing else
  prices can be given your own input / output / cache prices, or marked "Self-hosted (free)" in one
  click. Custom prices can be edited or removed, and apply immediately, including in the menu-bar
  popover.
- **Onboarding and folder access.** A first-run screen lets you allow access to your Claude Code and
  Codex log folders, and the Logs directory settings manage each folder. Sample data is available to
  explore the app without any logs.
- Pricing for Claude Opus 5.5, Claude Fable 5.1, GPT-6 Sol and GPT-6 Luna.
- Privacy policy.

### Changed

- Built-in OpenRouter price snapshot refreshed (409 → 450 models).
- GPT models keep the same chart colour across generations.

### Fixed

- Claude Opus 5.5 and Fable 5.1 were overpriced by falling back to their family's older rates.
- More model id shapes are recognised before showing "pricing not found": Bedrock-style prefixes
  (`openai.…`, `us.anthropic.…`) and bare ids listed by a single vendor (e.g. `gemini-3.6-flash`).
- Claude Code's `<synthetic>` placeholder model no longer triggers the unpriced-model warning.

## [1.0.0] - 2026-09-20

First App Store release: token and cost reports for Claude Code and Codex CLI, read from local logs,
with a dashboard, session details, charts, and English / 繁體中文 / 日本語 UI.

[1.0.2]: https://github.com/kaija/arlo-ai-analyzer/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/kaija/arlo-ai-analyzer/compare/0a3daf5...v1.0.1
[1.0.0]: https://github.com/kaija/arlo-ai-analyzer/commit/0a3daf5
