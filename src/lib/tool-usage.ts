import type {
  CapabilityKind,
  ListedStat,
  ToolKind,
  ToolUsageReport,
} from "../types";
import { localDateKey } from "./aggregate";

// ---------------------------------------------------------------------------
// Published guidance the recommendations are measured against
// ---------------------------------------------------------------------------

export const GUIDELINES = {
  /** Anthropic: tool selection accuracy degrades past 30–50 loaded tools. */
  toolCountLimit: 30,
  /** OpenAI: aim for fewer than 20 functions at the start of a turn (soft). */
  openAiFunctionLimit: 20,
  /** Codex caps its skill list at 2% of the context window. */
  skillListingShare: 0.02,
  /** Anthropic: use tool search once definitions pass 10K tokens. */
  toolDefinitionTokens: 10_000,
  /**
   * Our own line, not a vendor's: a session that has used a tenth of its
   * window before the user types anything is carrying too much.
   */
  startingContextShare: 0.1,
} as const;

/** Where each number above comes from; labels live in the locale files. */
export const GUIDELINE_SOURCES = [
  { id: "toolSearch", url: "https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool" },
  { id: "advancedToolUse", url: "https://www.anthropic.com/engineering/advanced-tool-use" },
  { id: "claudeSkills", url: "https://code.claude.com/docs/en/skills" },
  { id: "codexSkills", url: "https://learn.chatgpt.com/docs/build-skills" },
  { id: "openaiFunctions", url: "https://developers.openai.com/api/docs/guides/function-calling" },
  { id: "codexConfig", url: "https://developers.openai.com/codex/config-reference" },
] as const;

/** Subagents that ship with Claude Code: nothing to delete. */
const BUILTIN_AGENTS = new Set([
  "general-purpose",
  "Explore",
  "Plan",
  "claude",
  "statusline-setup",
  "claude-code-guide",
  "output-style-setup",
]);

/**
 * MCP servers the Claude desktop app attaches to its Code sessions. `ccd_*` is
 * the app's own plumbing (nothing to switch off); the rest are app features,
 * toggled in the app rather than with `claude mcp`.
 */
function isDesktopAppPlumbing(server: string): boolean {
  return server.startsWith("ccd_");
}
const DESKTOP_APP_SERVERS = new Set([
  "Claude_Browser",
  "Claude_Preview",
  "Claude_Code_iOS_Simulator",
  "Control_Chrome",
  "claude-in-chrome",
  "computer-use",
  "scheduled-tasks",
  "mcp-registry",
  "terminal",
  "visualize",
]);

/** How long something new gets before "never used" is held against it. */
export const GRACE_DAYS = 7;
const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UsageTier = "core" | "regular" | "rare" | "unused" | "new";

export interface CapabilityRow {
  kind: CapabilityKind;
  name: string;
  calls: number;
  errors: number;
  /** Sessions in the window that called it at least once. */
  sessionsUsed: number;
  /** sessionsUsed over every session in the window, 0–1. */
  sessionShare: number;
  lastUsed: string | null;
  /** Loaded by the most recent session, i.e. installed now. */
  installed: boolean;
  /** Seen in a listing at some point (eagerly loaded MCP servers never are). */
  everListed: boolean;
  /** The user can switch it off: not a built-in tool or bundled subagent. */
  removable: boolean;
  /** Tokens it adds to every request; null when unknown or not listed. */
  listingTokens: number | null;
  /** MCP: how many tools the server exposes (0 when unknown). */
  mcpTools: number;
  /** MCP: calls per tool, busiest first. */
  toolCalls: Array<{ tool: string; calls: number }>;
  /** Codex skills: the SKILL.md path. */
  path: string | null;
  firstListed: string | null;
  tier: UsageTier;
}

export interface Loadout {
  skills: { count: number; tokens: number };
  mcp: { count: number; tools: number; tokens: number; unknown: number };
  subagents: { count: number; tokens: number };
  /** Everything above with a known size. */
  totalTokens: number;
}

export type RecommendationKind =
  | "starting_context"
  | "skill_budget"
  | "unused_skills"
  | "unused_mcp"
  | "unused_subagents"
  | "tool_count"
  | "rare_skills"
  | "failing_mcp";

export interface Recommendation {
  kind: RecommendationKind;
  severity: "warning" | "info";
  /** The capabilities it is about (empty for the budget checks). */
  items: CapabilityRow[];
  /** Tokens per request acting on it would remove; null when unknown. */
  tokensPerRequest: number | null;
  /** Numbers for the message. */
  values: Record<string, number>;
}

export interface ToolAnalysis {
  tool: ToolKind;
  sessions: number;
  requests: number;
  contextWindow: number;
  baseline: {
    median: number | null;
    p90: number | null;
    samples: number;
    /** Median starting context per local day, oldest first. */
    daily: Array<{ date: string; median: number }>;
  };
  /** The logs record what was loaded; without it nothing can be called unused. */
  hasListing: boolean;
  loadout: Loadout;
  rows: CapabilityRow[];
  totalCalls: number;
  recommendations: Recommendation[];
}

export interface AnalyzeOptions {
  now: Date;
  /** Look-back window in days; null for everything. */
  days: number | null;
  /** Window of the model most sessions ran on. */
  contextWindow: number;
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

/** Nearest-rank quantile of an ascending array. */
function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[i];
}

function median(values: number[]): number | null {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Sessions called it in at least a quarter of sessions → core; 5% (or 20+
 * calls) → regular; any call → rare; none → unused, unless it was installed
 * within the grace period.
 */
export function usageTier(
  calls: number,
  sessionShare: number,
  firstListed: string | null,
  now: Date,
): UsageTier {
  if (calls === 0) {
    const fresh = firstListed !== null && now.getTime() - Date.parse(firstListed) < GRACE_DAYS * DAY_MS;
    return fresh ? "new" : "unused";
  }
  if (sessionShare >= 0.25) return "core";
  if (sessionShare >= 0.05 || calls >= 20) return "regular";
  return "rare";
}

const key = (kind: CapabilityKind, name: string) => `${kind}\u0000${name}`;

export function analyzeToolUsage(
  report: ToolUsageReport,
  tool: ToolKind,
  { now, days, contextWindow }: AnalyzeOptions,
): ToolAnalysis {
  const since = days === null ? -Infinity : now.getTime() - days * DAY_MS;
  const sessions = report.sessions.filter(
    (s) => s.tool === tool && Date.parse(s.started_at) >= since,
  );

  // --- Starting context ---
  const baselines: number[] = [];
  const byDay = new Map<string, number[]>();
  for (const s of sessions) {
    if (s.baseline_tokens === null) continue;
    baselines.push(s.baseline_tokens);
    const day = localDateKey(s.started_at);
    byDay.set(day, [...(byDay.get(day) ?? []), s.baseline_tokens]);
  }
  baselines.sort((a, b) => a - b);
  const daily = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({ date, median: median(values) ?? 0 }));

  // --- Calls ---
  interface Acc {
    kind: CapabilityKind;
    name: string;
    calls: number;
    errors: number;
    sessionsUsed: number;
    lastUsed: string | null;
    toolCalls: Map<string, number>;
  }
  const acc = new Map<string, Acc>();
  let totalCalls = 0;
  for (const s of sessions) {
    const inSession = new Set<string>();
    for (const c of s.calls) {
      const k = key(c.kind, c.name);
      let a = acc.get(k);
      if (!a) {
        a = { kind: c.kind, name: c.name, calls: 0, errors: 0, sessionsUsed: 0, lastUsed: null, toolCalls: new Map() };
        acc.set(k, a);
      }
      a.calls += c.calls;
      a.errors += c.errors;
      totalCalls += c.calls;
      if (c.tool) a.toolCalls.set(c.tool, (a.toolCalls.get(c.tool) ?? 0) + c.calls);
      if (!inSession.has(k)) {
        inSession.add(k);
        a.sessionsUsed += 1;
      }
      if (a.lastUsed === null || s.started_at > a.lastUsed) a.lastUsed = s.started_at;
    }
  }

  // --- Listings ---
  const listed = report.listed.filter((l) => l.tool === tool);
  const listedByKey = new Map<string, ListedStat>(listed.map((l) => [key(l.kind, l.name), l]));
  const hasListing = listed.some((l) => l.sessions_listed > 0);

  const keys = new Set<string>(acc.keys());
  for (const l of listed) if (l.current) keys.add(key(l.kind, l.name));

  const rows: CapabilityRow[] = [...keys].map((k) => {
    const a = acc.get(k);
    const l = listedByKey.get(k);
    const kind = (a?.kind ?? l?.kind)!;
    const name = (a?.name ?? l?.name)!;
    const calls = a?.calls ?? 0;
    const sessionShare = sessions.length > 0 ? (a?.sessionsUsed ?? 0) / sessions.length : 0;
    const firstListed = l?.first_listed ?? null;
    return {
      kind,
      name,
      calls,
      errors: a?.errors ?? 0,
      sessionsUsed: a?.sessionsUsed ?? 0,
      sessionShare,
      lastUsed: a?.lastUsed ?? null,
      installed: l?.current ?? false,
      everListed: l !== undefined && l.sessions_listed > 0,
      removable:
        kind !== "builtin" &&
        !(kind === "subagent" && BUILTIN_AGENTS.has(name)) &&
        !(tool === "claude_code" && kind === "mcp" && isDesktopAppPlumbing(name)),
      listingTokens: l?.tokens ?? null,
      mcpTools: l?.tools ?? 0,
      toolCalls: [...(a?.toolCalls ?? new Map<string, number>()).entries()]
        .map(([t, n]) => ({ tool: t, calls: n }))
        .sort((x, y) => y.calls - x.calls),
      path: l?.path ?? null,
      firstListed,
      tier: usageTier(calls, sessionShare, firstListed, now),
    };
  });
  rows.sort(
    (a, b) =>
      b.calls - a.calls ||
      (b.listingTokens ?? 0) - (a.listingTokens ?? 0) ||
      a.name.localeCompare(b.name),
  );

  const current = listed.filter((l) => l.current);
  const sum = (items: ListedStat[]) => items.reduce((n, l) => n + (l.tokens ?? 0), 0);
  const skills = current.filter((l) => l.kind === "skill");
  const servers = current.filter((l) => l.kind === "mcp");
  const agents = current.filter((l) => l.kind === "subagent");
  const loadout: Loadout = {
    skills: { count: skills.length, tokens: sum(skills) },
    mcp: {
      count: servers.length,
      tools: servers.reduce((n, l) => n + l.tools, 0),
      tokens: sum(servers),
      unknown: servers.filter((l) => l.tokens === null).length,
    },
    subagents: { count: agents.length, tokens: sum(agents) },
    totalTokens: sum(current),
  };

  const analysis: ToolAnalysis = {
    tool,
    sessions: sessions.length,
    requests: sessions.reduce((n, s) => n + s.requests, 0),
    contextWindow,
    baseline: {
      median: median(baselines),
      p90: quantile(baselines, 0.9),
      samples: baselines.length,
      daily,
    },
    hasListing,
    loadout,
    rows,
    totalCalls,
    recommendations: [],
  };
  analysis.recommendations = recommend(analysis);
  return analysis;
}

// ---------------------------------------------------------------------------
// Recommendations
// ---------------------------------------------------------------------------

function tokensOf(items: CapabilityRow[]): number | null {
  const known = items.filter((r) => r.listingTokens !== null);
  return known.length === 0 ? null : known.reduce((n, r) => n + (r.listingTokens ?? 0), 0);
}

export function recommend(a: ToolAnalysis): Recommendation[] {
  if (a.sessions === 0) return [];
  const out: Recommendation[] = [];
  const installed = a.rows.filter((r) => r.installed && r.removable);
  const pick = (kind: CapabilityKind, tier: UsageTier) =>
    installed
      .filter((r) => r.kind === kind && r.tier === tier)
      .sort((x, y) => (y.listingTokens ?? 0) - (x.listingTokens ?? 0));

  const median = a.baseline.median;
  if (median !== null && median > GUIDELINES.startingContextShare * a.contextWindow) {
    out.push({
      kind: "starting_context",
      severity: "warning",
      items: [],
      tokensPerRequest: null,
      values: { median, pct: Math.round((median / a.contextWindow) * 100), window: a.contextWindow },
    });
  }

  const skillBudget = GUIDELINES.skillListingShare * a.contextWindow;
  if (a.loadout.skills.tokens > skillBudget) {
    out.push({
      kind: "skill_budget",
      severity: "warning",
      items: [],
      tokensPerRequest: Math.round(a.loadout.skills.tokens - skillBudget),
      values: { tokens: a.loadout.skills.tokens, budget: Math.round(skillBudget), count: a.loadout.skills.count },
    });
  }

  if (a.hasListing) {
    const unusedSkills = pick("skill", "unused");
    if (unusedSkills.length > 0) {
      const tokens = tokensOf(unusedSkills);
      out.push({
        kind: "unused_skills",
        severity: unusedSkills.length >= 5 || (tokens ?? 0) >= 1_000 ? "warning" : "info",
        items: unusedSkills,
        tokensPerRequest: tokens,
        values: { count: unusedSkills.length },
      });
    }
    const unusedMcp = pick("mcp", "unused");
    if (unusedMcp.length > 0) {
      out.push({
        kind: "unused_mcp",
        severity: "warning",
        items: unusedMcp,
        tokensPerRequest: tokensOf(unusedMcp),
        values: { count: unusedMcp.length, tools: unusedMcp.reduce((n, r) => n + r.mcpTools, 0) },
      });
    }
    const unusedAgents = pick("subagent", "unused");
    if (unusedAgents.length > 0) {
      out.push({
        kind: "unused_subagents",
        severity: "info",
        items: unusedAgents,
        tokensPerRequest: tokensOf(unusedAgents),
        values: { count: unusedAgents.length },
      });
    }
  }

  if (a.loadout.mcp.tools > GUIDELINES.toolCountLimit) {
    out.push({
      kind: "tool_count",
      severity: "info",
      items: [],
      tokensPerRequest: null,
      values: { tools: a.loadout.mcp.tools, limit: GUIDELINES.toolCountLimit, servers: a.loadout.mcp.count },
    });
  }

  const rareSkills = pick("skill", "rare");
  if (rareSkills.length > 0) {
    out.push({
      kind: "rare_skills",
      severity: "info",
      items: rareSkills,
      tokensPerRequest: tokensOf(rareSkills),
      values: { count: rareSkills.length },
    });
  }

  const failing = a.rows.filter((r) => r.kind === "mcp" && r.calls >= 5 && r.errors / r.calls >= 0.2);
  if (failing.length > 0) {
    out.push({
      kind: "failing_mcp",
      severity: "info",
      items: failing,
      tokensPerRequest: null,
      values: { count: failing.length },
    });
  }

  // Warnings first; otherwise the order above, which leads with the
  // headline number and then what to cut to bring it down.
  return out.sort((x, y) => (x.severity === "warning" ? 0 : 1) - (y.severity === "warning" ? 0 : 1));
}

// ---------------------------------------------------------------------------
// How to act on a recommendation
// ---------------------------------------------------------------------------

/** claude.ai connectors (and the desktop app's uuid-named ones) aren't `claude mcp` servers. */
function isConnector(server: string): boolean {
  return server.startsWith("claude_ai_") || /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(server);
}

function tomlKey(name: string): string {
  return /^[A-Za-z0-9_-]+$/.test(name) ? name : JSON.stringify(name);
}

/**
 * The config change or command that applies a recommendation, ready to copy.
 * null when there is nothing mechanical to paste.
 */
export function fixSnippet(tool: ToolKind, rec: Recommendation): string | null {
  const names = rec.items.map((r) => r.name);
  if (names.length === 0) return null;

  if (tool === "codex_cli") {
    switch (rec.kind) {
      case "unused_skills":
      case "rare_skills": {
        const withPath = rec.items.filter((r) => r.path);
        if (withPath.length === 0) return null;
        return (
          "# ~/.codex/config.toml\n" +
          withPath.map((r) => `[[skills.config]]\npath = ${JSON.stringify(r.path)}\nenabled = false`).join("\n\n")
        );
      }
      case "unused_mcp":
        return "# ~/.codex/config.toml\n" + names.map((n) => `[mcp_servers.${tomlKey(n)}]\nenabled = false`).join("\n\n");
      default:
        return null;
    }
  }

  switch (rec.kind) {
    case "unused_skills":
    case "rare_skills": {
      const value = rec.kind === "unused_skills" ? "off" : "name-only";
      const body = names.map((n) => `    ${JSON.stringify(n)}: "${value}"`).join(",\n");
      return `// ~/.claude/settings.json\n{\n  "skillOverrides": {\n${body}\n  }\n}`;
    }
    case "unused_mcp": {
      const connectors = names.filter(isConnector);
      const desktop = names.filter((n) => !isConnector(n) && DESKTOP_APP_SERVERS.has(n));
      const configured = names.filter((n) => !isConnector(n) && !DESKTOP_APP_SERVERS.has(n));
      const sections: string[] = [];
      if (configured.length > 0) {
        sections.push(
          "# Added with `claude mcp add` or a plugin — run in a terminal\n" +
            "# (a plugin's server goes away with `claude plugin disable <plugin>` instead):\n" +
            configured.map((n) => `claude mcp remove ${n}`).join("\n"),
        );
      }
      if (connectors.length > 0) {
        sections.push(
          "# claude.ai connectors (the log only has their ids) —\n" +
            "# turn off the ones you don't use in claude.ai → Settings → Connectors:\n" +
            connectors.map((n) => `#   ${n}`).join("\n"),
        );
      }
      if (desktop.length > 0) {
        sections.push(
          "# Features of the Claude desktop app — turn them off in the app's settings, or leave them:\n" +
            desktop.map((n) => `#   ${n}`).join("\n"),
        );
      }
      return sections.join("\n\n");
    }
    case "unused_subagents":
      return names.map((n) => `rm ~/.claude/agents/${n}.md   # or .claude/agents/ in the project`).join("\n");
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// A prompt for the user's own coding agent
// ---------------------------------------------------------------------------

export interface PromptFinding {
  /** The recommendation's title and body, already rendered (in English). */
  title: string;
  body: string;
  /** Language the agent should answer in, e.g. "Traditional Chinese". */
  replyLanguage: string;
}

const KIND_LABEL: Record<CapabilityKind, string> = {
  builtin: "built-in tool",
  mcp: "MCP server",
  skill: "skill",
  subagent: "subagent",
};

function whereToLook(tool: ToolKind): string[] {
  return tool === "codex_cli"
    ? [
        "`~/.codex/config.toml` (`[mcp_servers.*]`, `[[skills.config]]`)",
        "`~/.codex/skills/` and any skills folders it lists",
        "`AGENTS.md` files (global `~/.codex/AGENTS.md` and in the project)",
      ]
    : [
        "`claude mcp list` and `claude plugin list` (run them)",
        "`~/.claude.json` (user- and local-scope MCP servers) and the project's `.mcp.json`",
        "`~/.claude/settings.json` and `.claude/settings.json` (`enabledPlugins`, `skillOverrides`)",
        "`~/.claude/skills/`, `~/.claude/agents/` and the project's `.claude/`",
        "`CLAUDE.md` files (global `~/.claude/CLAUDE.md` and in the project)",
      ];
}

/**
 * A self-contained request to paste into Claude Code or Codex, asking it to
 * work out where each flagged item comes from and apply the fix with the
 * user's go-ahead.
 */
export function fixPrompt(a: ToolAnalysis, rec: Recommendation, finding: PromptFinding): string {
  const cli = a.tool === "codex_cli" ? "Codex CLI" : "Claude Code";
  const lines: string[] = [
    `I want to cut the context my ${cli} setup loads on every request. A usage analyzer read my local ${cli} logs ` +
      `(${a.sessions.toLocaleString("en-US")} sessions, ${a.requests.toLocaleString("en-US")} requests) and reported:`,
    "",
    `> ${finding.title}`,
    `> ${finding.body}`,
  ];

  if (rec.items.length > 0) {
    lines.push("", "Flagged items:");
    for (const r of rec.items) {
      const facts = [KIND_LABEL[r.kind]];
      if (r.listingTokens !== null) facts.push(`≈ ${r.listingTokens.toLocaleString("en-US")} tokens per request`);
      facts.push(r.calls === 0 ? "never called in this period" : `${r.calls} calls in ${r.sessionsUsed} sessions`);
      if (r.errors > 0) facts.push(`${r.errors} failed`);
      if (r.path) facts.push(`at ${r.path}`);
      lines.push(`- ${r.name} (${facts.join(", ")})`);
    }
    if (rec.items.some((r) => isConnector(r.name))) {
      lines.push(
        "",
        "Names that look like UUIDs or start with `claude_ai_` are claude.ai connectors; the log records only their id.",
      );
    }
  }

  if (rec.tokensPerRequest !== null && rec.tokensPerRequest > 0) {
    lines.push("", `Estimated saving: ≈ ${rec.tokensPerRequest.toLocaleString("en-US")} tokens per request.`);
  }

  const snippet = fixSnippet(a.tool, rec);
  if (snippet) {
    lines.push("", "The analyzer suggested this change, which may not fit my setup exactly:", "```", snippet, "```");
  }

  lines.push(
    "",
    "Please:",
    "1. Find where each item is configured. Places to check:",
    ...whereToLook(a.tool).map((w) => `   - ${w}`),
    "2. Give me a short table: item, where it comes from (my config, a project config, a plugin, a claude.ai connector, " +
      "or built into the app), what it does in one line, and whether you recommend turning it off.",
    "3. Wait for my OK. Then make only the changes I approve — prefer disabling over deleting, and back up any file before editing it.",
    "4. Tell me how to undo each change, and anything that needs a restart to take effect.",
    "",
    `Reply in ${finding.replyLanguage}.`,
  );
  return lines.join("\n");
}
