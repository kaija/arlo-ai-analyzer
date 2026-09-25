import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSessionsContext } from "../../context/SessionsContext";
import { useToolUsage } from "../../hooks/useToolUsage";
import { analyzeToolUsage } from "../../lib/tool-usage";
import { contextWindow } from "../../pricing";
import { SegmentedControl } from "../../primitives/SegmentedControl";
import { TOOL_LABELS, type ToolKind } from "../../types";
import { GuidelinesCard } from "./GuidelinesCard";
import { RecommendationsCard } from "./RecommendationsCard";
import { StartingContextCard } from "./StartingContextCard";
import { ToolStatTiles } from "./ToolStatTiles";
import { ToolUsageTable } from "./ToolUsageTable";

type Range = "7d" | "30d" | "90d" | "all";
const RANGE_DAYS: Record<Range, number | null> = { "7d": 7, "30d": 30, "90d": 90, all: null };
const TOOLS: ToolKind[] = ["claude_code", "codex_cli"];

/**
 * Tools page — which tools, skills, MCP servers and subagents each CLI has
 * loaded, how often they are actually called across sessions, and what that
 * costs on every request.
 */
export default function ToolsPage() {
  const { t } = useTranslation();
  const { report, error } = useToolUsage();
  const { sessions } = useSessionsContext();
  const [tool, setTool] = useState<ToolKind>("claude_code");
  const [range, setRange] = useState<Range>("30d");
  const days = RANGE_DAYS[range];

  // Only offer the CLIs there is data for; land on one that has some.
  const available = useMemo(
    () => TOOLS.filter((k) => report?.sessions.some((s) => s.tool === k)),
    [report],
  );
  useEffect(() => {
    if (available.length > 0 && !available.includes(tool)) setTool(available[0]);
  }, [available, tool]);

  // Judge sizes against the window of the model most of these sessions ran on.
  const window = useMemo(() => {
    const since = days === null ? -Infinity : Date.now() - days * 86_400_000;
    const counts = new Map<string, number>();
    for (const s of sessions) {
      if (s.tool !== tool || Date.parse(s.started_at) < since) continue;
      const model = s.peak_context_model ?? s.model;
      if (model) counts.set(model, (counts.get(model) ?? 0) + s.message_count);
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return contextWindow(top ?? (tool === "codex_cli" ? "gpt-" : null));
  }, [sessions, tool, days]);

  const analysis = useMemo(
    () => (report ? analyzeToolUsage(report, tool, { now: new Date(), days, contextWindow: window }) : null),
    [report, tool, days, window],
  );

  const toolOptions = (available.length > 0 ? available : TOOLS).map((k) => ({ value: k, label: TOOL_LABELS[k] }));
  const rangeOptions = (Object.keys(RANGE_DAYS) as Range[]).map((r) => ({
    value: r,
    label: r === "all" ? t("tools.filter.all") : r,
  }));

  return (
    <>
      <div className="filterbar">
        <SegmentedControl options={toolOptions} value={tool} onChange={setTool} ariaLabel={t("tools.filter.tool")} />
        <span className="sep" />
        <SegmentedControl options={rangeOptions} value={range} onChange={setRange} ariaLabel={t("tools.filter.range")} />
      </div>

      <div className="tools-body">
        <h1 className="sr-only">{t("page.tools")}</h1>
        {error && <div className="card tools-note">{t("tools.error", { error })}</div>}
        {!analysis && !error && <div className="tools-note">{t("tools.loading")}</div>}
        {analysis && analysis.sessions === 0 && (
          <div className="card tools-empty">
            <div className="card-title">{t("tools.empty.title")}</div>
            <p>{t("tools.empty.body", { tool: TOOL_LABELS[tool] })}</p>
          </div>
        )}
        {analysis && analysis.sessions > 0 && (
          <>
            <ToolStatTiles analysis={analysis} />
            <div className="tools-grid">
              <StartingContextCard analysis={analysis} />
              <RecommendationsCard analysis={analysis} />
            </div>
            <ToolUsageTable analysis={analysis} />
            <GuidelinesCard />
          </>
        )}
      </div>
    </>
  );
}
