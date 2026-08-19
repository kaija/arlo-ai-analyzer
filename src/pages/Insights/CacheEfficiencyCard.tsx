import { Link } from "react-router-dom";
import { fmtTokens } from "../../lib/format";

interface CacheEfficiencyCardProps {
  cacheHitRate: number;
  writeSplit: { write5m: number; write1h: number };
  totalInput: number;
  estimatedSavingsUsd: number;
}

export function CacheEfficiencyCard({
  cacheHitRate,
  writeSplit,
  estimatedSavingsUsd,
}: CacheEfficiencyCardProps) {
  const hitPct = Math.round(cacheHitRate * 100);
  const totalWrite = writeSplit.write5m + writeSplit.write1h;
  const write5mPct = totalWrite > 0 ? (writeSplit.write5m / totalWrite) * 100 : 0;
  const write1hPct = totalWrite > 0 ? 100 - write5mPct : 0;

  return (
    <div className="card insight-card">
      <div className="ins-eyebrow"><span>Cache efficiency</span></div>

      <div className="ins-number tnum">{hitPct}% hit rate</div>

      <div className="ins-line">
        {hitPct === 0
          ? "No cache reads detected. Enabling prompt caching can significantly reduce costs on repeated context."
          : <>Cache-read tokens outnumber fresh input. {estimatedSavingsUsd > 0 && <><b>{Math.round(estimatedSavingsUsd * 100) / 100 > 0 ? `${hitPct}%` : ""} of spend</b> touches cache writes or reads.</>}</>}
      </div>

      {totalWrite > 0 && (
        <div className="ins-body">
          <div className="mini-stack">
            <span style={{ width: `${write5mPct}%`, background: "var(--series-3)" }} />
            <span style={{ width: `${write1hPct}%`, background: "var(--series-2)" }} />
          </div>
          <div className="mini-legend">
            <span className="lk">
              <span className="sw" style={{ background: "var(--series-3)" }} />
              Cache write 5m · {fmtTokens(writeSplit.write5m)}
            </span>
            <span className="lk">
              <span className="sw" style={{ background: "var(--series-2)" }} />
              Cache write 1h · {fmtTokens(writeSplit.write1h)}
              {writeSplit.write1h > 0 && <span className="premium-tag">2× premium</span>}
            </span>
          </div>
        </div>
      )}

      <Link to="/" className="ins-link">
        View cache breakdown{" "}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/>
        </svg>
      </Link>
    </div>
  );
}
