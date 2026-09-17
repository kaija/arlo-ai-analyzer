import type { BucketData, Dimension, Granularity, Measure, StackBy, TokenKind } from "../../types";
import { StackedBarChart } from "../../charts/StackedBarChart";
import { TokenKindPills } from "./TokenKindPills";

interface UsageChartCardProps {
  buckets: BucketData[];
  dims: Dimension[];
  measure: Measure;
  granularity: Granularity;
  stackBy: StackBy;
  kindOn: Record<TokenKind, boolean>;
  kindTotals: Record<TokenKind, number>;
  drillDayIndex: number | null;
  drillLabel: string | null;
  onBarClick: (index: number) => void;
  onKindToggle: (kind: TokenKind) => void;
  onClearDrill: () => void;
}

/**
 * UsageChartCard — wraps StackedBarChart with the chart card chrome:
 *   - Card header with granularity/drill breadcrumb
 *   - The chart itself (drillable at day granularity)
 *   - TokenKindPills below the chart when the bars are actually stacked by
 *     token kind. Showing them under a model-stacked chart put a token-kind
 *     legend under model-coloured bars (the same orange meaning two different
 *     things) and the toggles were inert — `kindOn` only filters the
 *     tokenkind stack.
 *
 * Requirements: 3.3, 3.4, 3.5, 3.6, 3.9, 3.10, 3.11, 3.12
 */
export function UsageChartCard({
  buckets,
  dims,
  measure,
  granularity,
  stackBy,
  kindOn,
  kindTotals,
  drillDayIndex,
  drillLabel,
  onBarClick,
  onKindToggle,
  onClearDrill,
}: UsageChartCardProps) {
  const isDrilled = drillDayIndex !== null;

  return (
    <div className="card usage-chart-card">
      <div className="card-header usage-chart-header">
        <h2 className="card-title">Usage over time</h2>
        <div className="usage-chart-breadcrumb">
          {isDrilled ? (
            <>
              <button
                className="btn-ghost breadcrumb-back"
                onClick={onClearDrill}
                aria-label="Back to daily view"
              >
                ← Daily view
              </button>
              <span className="breadcrumb-sep" aria-hidden="true">/</span>
              <span className="breadcrumb-current">{drillLabel}</span>
            </>
          ) : (
            <span className="usage-chart-granularity-label">
              {granularity === "day" ? "Daily" : granularity === "week" ? "Weekly" : "Hourly"}
            </span>
          )}
        </div>
      </div>

      <div className="usage-chart-body">
        <StackedBarChart
          buckets={buckets}
          dims={dims}
          measure={measure}
          onBarClick={onBarClick}
          drillable={granularity === "day" && !isDrilled}
        />
      </div>

      {measure === "tokens" && stackBy === "tokenkind" && (
        <TokenKindPills
          kindOn={kindOn}
          totals={kindTotals}
          onToggle={onKindToggle}
        />
      )}
    </div>
  );
}
