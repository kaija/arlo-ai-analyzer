import { useMemo } from "react";
import { useSessionsContext } from "../../context/SessionsContext";
import { useSettingsContext } from "../../context/SettingsContext";
import {
  cacheHitRate,
  cacheWriteSplit,
  contextHealthSessions,
  monthToDateSpend,
  projectedMonthEndSpend,
  rightsizingCount,
  rightsizingSavingsUsd,
  sevenDayBurnRate,
  stopReasonBreakdown,
  topSkillsByRequests,
} from "../../lib/insights";
import { estimatedCostUsd } from "../../pricing";
import { BudgetForecastCard } from "./BudgetForecastCard";
import { CacheEfficiencyCard } from "./CacheEfficiencyCard";
import { ContextHealthCard } from "./ContextHealthCard";
import { McpAttributionCard } from "./McpAttributionCard";
import { ModelRightsizingCard } from "./ModelRightsizingCard";
import { ToolFailuresCard } from "./ToolFailuresCard";

/**
 * Insights page
 *
 * Computes all six insight card values once via useMemo from the sessions
 * array and renders them in a responsive .insights-grid (3-col → 2-col → 1-col).
 *
 * Requirements: 6.1–6.15, 8.1, 8.7, 8.8
 */
export default function InsightsPage() {
  const { sessions } = useSessionsContext();
  const { contextAlertThreshold, monthlyBudget } = useSettingsContext();

  // ---------------------------------------------------------------------------
  // Context health
  // ---------------------------------------------------------------------------
  const contextRows = useMemo(
    () => contextHealthSessions(sessions, contextAlertThreshold),
    [sessions, contextAlertThreshold],
  );

  // ---------------------------------------------------------------------------
  // Cache efficiency
  // ---------------------------------------------------------------------------
  const hitRate = useMemo(() => cacheHitRate(sessions), [sessions]);

  const writeSplit = useMemo(() => cacheWriteSplit(sessions), [sessions]);

  const { totalInput, estimatedSavingsUsd } = useMemo(() => {
    let input = 0;
    let savings = 0;
    for (const s of sessions) {
      input += s.input_tokens;
      // Savings = cost of cache reads vs what they would have cost at input rates.
      // Approximation: (cacheRead tokens) * (inputRate - cacheReadRate) / 1e6
      // We derive a rough figure from estimatedCostUsd with a proxy: if all
      // cache_read_tokens had been charged at the full input rate instead.
      const inputRatePerTok = s.input_tokens > 0
        ? estimatedCostUsd(s) / (s.input_tokens + s.output_tokens + s.cache_creation_tokens + s.cache_read_tokens + 1)
        : 0;
      savings += s.cache_read_tokens * inputRatePerTok;
    }
    return { totalInput: input, estimatedSavingsUsd: savings };
  }, [sessions]);

  // ---------------------------------------------------------------------------
  // MCP & skill attribution
  // ---------------------------------------------------------------------------
  const skills = useMemo(() => topSkillsByRequests(sessions), [sessions]);

  // ---------------------------------------------------------------------------
  // Model rightsizing — threshold: 500 output tokens
  // ---------------------------------------------------------------------------
  const OUTPUT_THRESHOLD = 500;

  const rightsizeCount = useMemo(
    () => rightsizingCount(sessions, OUTPUT_THRESHOLD),
    [sessions],
  );

  const rightsizeSavings = useMemo(
    () => rightsizingSavingsUsd(sessions, OUTPUT_THRESHOLD),
    [sessions],
  );

  // Total "Opus-tier" sessions: those whose model name includes "opus"
  const totalOpusRequests = useMemo(
    () => sessions.filter((s) => s.model?.toLowerCase().includes("opus") ?? false).length,
    [sessions],
  );

  // ---------------------------------------------------------------------------
  // Budget forecast
  // ---------------------------------------------------------------------------
  const monthToDate = useMemo(() => monthToDateSpend(sessions), [sessions]);
  const burnRate = useMemo(() => sevenDayBurnRate(sessions), [sessions]);
  const projected = useMemo(() => projectedMonthEndSpend(sessions), [sessions]);

  // ---------------------------------------------------------------------------
  // Tool failures / stop reasons
  // ---------------------------------------------------------------------------
  const breakdown = useMemo(() => stopReasonBreakdown(sessions), [sessions]);

  const totalRequests = useMemo(
    () => sessions.reduce((sum, s) => sum + s.message_count, 0),
    [sessions],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="insights-body">
      <h1 className="sr-only">Insights</h1>
      <div className="insights-grid">
        <ContextHealthCard rows={contextRows} threshold={contextAlertThreshold} />
        <CacheEfficiencyCard
          cacheHitRate={hitRate}
          writeSplit={writeSplit}
          totalInput={totalInput}
          estimatedSavingsUsd={estimatedSavingsUsd}
        />
        <McpAttributionCard skills={skills} />
        <ModelRightsizingCard
          count={rightsizeCount}
          savingsUsd={rightsizeSavings}
          totalOpusRequests={totalOpusRequests}
        />
        <BudgetForecastCard
          monthToDate={monthToDate}
          burnRate={burnRate}
          projected={projected}
          budget={monthlyBudget}
        />
        <ToolFailuresCard breakdown={breakdown} totalRequests={totalRequests} />
      </div>
    </div>
  );
}
