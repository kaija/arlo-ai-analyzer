interface BudgetBarProps {
  /** Month-to-date actual spend */
  spent: number;
  /** Projected month-end spend */
  projected: number;
  /** Configured monthly budget (must be > 0) */
  budget: number;
}

type BudgetBand = "accent" | "warning" | "critical";

/**
 * Determine the fill color band based on the projected/budget ratio:
 *   projected > 100% of budget → critical
 *   projected >  80% of budget → warning
 *   otherwise                  → accent
 */
function budgetBandFor(projected: number, budget: number): BudgetBand {
  if (budget <= 0) return "accent";
  const ratio = projected / budget;
  if (ratio > 1.0) return "critical";
  if (ratio > 0.8) return "warning";
  return "accent";
}

/**
 * BudgetBar — a horizontal progress bar showing month-to-date spend
 * against the configured monthly budget.
 *
 * DOM structure:
 *   .budget-track
 *     .budget-fill  (width = min(100%, (spent/budget)*100%))
 *
 * Fill color is driven by the projected/budget ratio:
 *   > 80%  → var(--warning)
 *   > 100% → var(--critical)
 *   else   → var(--accent)
 */
export function BudgetBar({ spent, projected, budget }: BudgetBarProps) {
  const fillPct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
  const band = budgetBandFor(projected, budget);

  const colorMap: Record<BudgetBand, string> = {
    accent: "var(--accent)",
    warning: "var(--warning)",
    critical: "var(--critical)",
  };

  return (
    <div
      className="budget-track"
      role="meter"
      aria-valuenow={Math.round(fillPct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={`${Math.round(fillPct)}% of budget`}
    >
      <div
        className="budget-fill"
        style={{
          width: `${fillPct}%`,
          background: colorMap[band],
        }}
      />
    </div>
  );
}
