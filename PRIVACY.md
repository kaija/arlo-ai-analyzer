# Privacy Policy

**Effective date:** September 25, 2026

Arlo AI Analyzer is a local-first macOS application. The developer does not collect personal data, usage analytics, diagnostic information, or the contents of your AI coding sessions through the app.

## Data Processed on Your Device

With read-only permission, Arlo AI Analyzer reads session logs created by supported tools, including Claude Code and Codex CLI. It uses this information locally to calculate and display statistics such as token and request counts, model and project metadata, context usage, and estimated costs.

The same logs record which tools, skills, MCP servers and subagents each session loaded and called; the app counts these to show which are used and which are not. For Codex CLI it also reads the MCP server names (and whether each is enabled) from `~/.codex/config.toml`, which is only listed, never changed.

Derived analytics are stored in a local SQLite database on your Mac. Arlo AI Analyzer does not transmit session logs or derived analytics to the developer or third parties.

## Subscription Plan and Limits

To show which plan each tool is on (for example Claude Max or ChatGPT Plus) and how much of its usage limits is used, Arlo AI Analyzer reads, on your Mac, the sign-in each tool saved for itself: Claude Code's credentials file or its macOS Keychain item, the account details in `~/.claude.json`, and Codex CLI's `~/.codex/auth.json`. Codex also records its limits in its own session logs, which the app reads like the rest of those logs. Nothing read this way leaves your Mac, and the app never changes, renews, or stores these credentials.

**Optional online check.** If you turn on Settings → Plans & limits → "Check plan limits online", the app asks each tool's own vendor for your current usage, using that tool's saved sign-in — the same request the tool makes for its own usage screen: Claude Code's to Anthropic (`api.anthropic.com`), Codex CLI's to OpenAI (`chatgpt.com`). Each sign-in is sent only to the vendor that issued it, never to the developer or anyone else, and the answer is kept only in memory to display it. As with any web request, the vendor receives your IP address, and the request is covered by your agreement with that vendor. This check is off by default; with it off, the app makes no request to either vendor.

## Model Price Updates

To estimate costs for models not in its built-in price table, Arlo AI Analyzer downloads a public list of model prices from https://ai-analyzer.arlo-ai.app/models.json, at most once a day. The request is the same for every user and contains no information about you, your sessions, or the models you use. As with any web request, the hosting provider (GitHub Pages) receives your IP address and the time of the request. You can turn this off in Settings → Pricing → "Update model prices online"; the app then makes no requests for prices and uses only its built-in ones.

## Accounts, Tracking, and Advertising

Arlo AI Analyzer:

- does not require an account or sign-in;
- does not include advertising or cross-app tracking;
- does not sell or share personal data; and
- does not use third-party analytics services.

## File Access

Arlo AI Analyzer accesses supported log directories and any additional directories you explicitly select using read-only permissions. The app does not modify your original session logs.

## Data Retention and Your Control

All session-derived data remains on your device. You can remove Arlo AI Analyzer's local data by deleting the app's stored data or uninstalling the app. Your original session logs remain under your control and are managed separately by you and the tools that created them.

## Children's Privacy

Arlo AI Analyzer is not specifically directed to children, and the developer does not knowingly collect personal information from children through the app.

## Changes to This Policy

This policy may be updated if Arlo AI Analyzer's privacy practices change. Any update will be published in this file with a revised effective date.

## Contact

For privacy questions or requests, open an issue at [github.com/kaija/arlo-ai-analyzer/issues](https://github.com/kaija/arlo-ai-analyzer/issues).
