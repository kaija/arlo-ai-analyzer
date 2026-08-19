import { Link } from "react-router-dom";
import { fmtCost } from "../../lib/format";

interface ModelRightsizingCardProps {
  count: number;
  savingsUsd: number;
  totalOpusRequests: number;
}

export function ModelRightsizingCard({ count, savingsUsd, totalOpusRequests }: ModelRightsizingCardProps) {
  const pct = totalOpusRequests > 0 ? ((count / totalOpusRequests) * 100).toFixed(1) : "0";

  return (
    <div className="card insight-card">
      <div className="ins-eyebrow">
        <span>Model right-sizing</span>
        <span className="est-badge">Estimate</span>
      </div>

      <div className="ins-number tnum">
        {count === 0 ? "0 requests" : `${count.toLocaleString()} requests`}
      </div>

      <div className="ins-line">
        {count === 0 ? (
          "All Opus sessions produced substantial output. No obvious rightsizing candidates found."
        ) : (
          <>
            Opus 5 requests produced <b>under 500 output tokens</b> — short enough that Sonnet 5 likely would have matched quality.
            {savingsUsd > 0 && <> At Sonnet 5 rates: <b>{fmtCost(savingsUsd)} less</b>.</>}
          </>
        )}
      </div>

      <div className="ins-body">
        <div className="kv-row"><span className="k">Opus requests analyzed</span><span className="v">{totalOpusRequests.toLocaleString()}</span></div>
        <div className="kv-row"><span className="k">Under 500 output tokens</span><span className="v">{count.toLocaleString()}{totalOpusRequests > 0 && ` · ${pct}%`}</span></div>
        <div className="kv-row"><span className="k">Modeled at Sonnet rates</span><span className="v">{savingsUsd > 0 ? `−${fmtCost(savingsUsd)}` : fmtCost(0)}</span></div>
      </div>

      <Link to="/" className="ins-link">
        See the flagged requests{" "}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/>
        </svg>
      </Link>
    </div>
  );
}
