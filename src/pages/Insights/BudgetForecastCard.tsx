import { Link } from "react-router-dom";
import { fmtCost } from "../../lib/format";

interface BudgetForecastCardProps {
  monthToDate: number;
  burnRate: number;
  projected: number;
  budget: number;
}

export function BudgetForecastCard({ monthToDate, burnRate, projected, budget }: BudgetForecastCardProps) {
  const hasBudget = budget > 0;
  const projectedPct = hasBudget ? (projected / budget) * 100 : 0;
  const spentPct = hasBudget ? Math.min((monthToDate / budget) * 100, 100) : 0;
  const isOverWarn = projectedPct > 80;

  return (
    <div className="card insight-card">
      <div className="ins-eyebrow"><span>Budget &amp; forecast</span></div>

      <div className="ins-number tnum">{fmtCost(monthToDate)} MTD</div>

      <div className="ins-line">
        7-day burn rate of <b>{fmtCost(burnRate)}/day</b> puts month-end around{" "}
        <span className="est-badge">Estimate</span>{" "}
        <b>{fmtCost(projected)}</b>
        {hasBudget && <> — {projectedPct.toFixed(1)}% of your {fmtCost(budget)} budget.</>}
      </div>

      <div className="ins-body">
        <div className="kv-row"><span className="k">7-day burn rate</span><span className="v">{fmtCost(burnRate * 7)}</span></div>
        <div className="kv-row"><span className="k">Projected month-end</span><span className="v">{fmtCost(projected)}</span></div>
        {hasBudget && (
          <>
            <div>
              <div className="budget-track">
                <div className={`budget-fill${isOverWarn ? " over-warn" : ""}`} style={{ width: `${spentPct}%` }} />
              </div>
            </div>
          </>
        )}
      </div>

      <Link to="/settings" className="ins-link">
        Adjust budget{" "}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/>
        </svg>
      </Link>
    </div>
  );
}
