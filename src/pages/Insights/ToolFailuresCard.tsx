import { Link } from "react-router-dom";
import type { StopReason } from "../../types";

interface ToolFailuresCardProps {
  breakdown: Record<StopReason, number>;
  totalRequests: number;
}

const STOP_COLORS: Record<StopReason, string> = {
  end_turn: "var(--good)",
  tool_use: "var(--muted-2)",
  max_tokens: "var(--warning)",
  stop_sequence: "var(--series-recessive)",
  refusal: "var(--critical)",
  other: "var(--series-recessive)",
};

const STOP_LABELS: Record<StopReason, string> = {
  end_turn: "end_turn",
  tool_use: "tool_use",
  max_tokens: "max_tokens",
  stop_sequence: "stop_sequence",
  refusal: "refusal",
  other: "other",
};

const STOP_ORDER: StopReason[] = [
  "end_turn",
  "tool_use",
  "max_tokens",
  "stop_sequence",
  "refusal",
  "other",
];

export function ToolFailuresCard({ breakdown, totalRequests }: ToolFailuresCardProps) {
  const maxTokensCount = breakdown.max_tokens;
  const refusalCount = breakdown.refusal;
  const totalBreakdown = STOP_ORDER.reduce((s, r) => s + breakdown[r], 0);
  const maxPct = totalRequests > 0 ? ((maxTokensCount / totalRequests) * 100).toFixed(1) : "0.0";

  return (
    <div className="card insight-card">
      <div className="ins-eyebrow"><span>Tool failures</span></div>

      <div className="ins-number tnum">
        {maxTokensCount === 0 ? "0 truncated" : `${maxTokensCount.toLocaleString()} truncated`}
      </div>

      <div className="ins-line">
        {maxTokensCount === 0
          ? "No requests were truncated by the context limit."
          : <>{maxPct}% of requests hit <b>max_tokens</b> before finishing; <b>{refusalCount}</b> more were refused outright.</>}
      </div>

      {totalBreakdown > 0 && (
        <div className="ins-body">
          <div className="mini-stack">
            {STOP_ORDER.map((r) => {
              const pct = totalBreakdown > 0 ? (breakdown[r] / totalBreakdown) * 100 : 0;
              return <span key={r} style={{ width: `${pct}%`, background: STOP_COLORS[r] }} />;
            })}
          </div>
          <div className="mini-legend">
            {STOP_ORDER.map((r) => (
              <span key={r} className="lk">
                <span className="sw" style={{ background: STOP_COLORS[r] }} />
                {STOP_LABELS[r]} · {breakdown[r].toLocaleString()}
              </span>
            ))}
          </div>
        </div>
      )}

      <Link to="/sessions" className="ins-link">
        View affected sessions{" "}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/>
        </svg>
      </Link>
    </div>
  );
}
