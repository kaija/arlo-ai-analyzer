import { Link } from "react-router-dom";
import { bandFor } from "../../primitives/Meter";
import type { ContextHealthRow } from "../../types";

interface ContextHealthCardProps {
  rows: ContextHealthRow[];
  threshold: number;
}

export function ContextHealthCard({ rows, threshold }: ContextHealthCardProps) {
  const count = rows.length;
  const topFive = rows.slice(0, 5);
  const highest = rows[0] ?? null;

  return (
    <div className="card insight-card">
      <div className="ins-eyebrow"><span>Context health</span></div>

      <div className="ins-number tnum">
        {count === 0 ? "All clear" : `${count} session${count === 1 ? "" : "s"}`}
      </div>

      <div className="ins-line">
        {count === 0 ? (
          <>No sessions exceeded the {threshold}% context threshold</>
        ) : highest ? (
          <>
            above {threshold}% of their model's context window right now.{" "}
            <b style={{ wordBreak: "break-all" }}>{highest.sessionName}</b> is closest to a forced compaction, at{" "}
            {Math.round(highest.contextPct)}% of its context window.
          </>
        ) : null}
      </div>

      {topFive.length > 0 && (
        <div className="ins-body">
          <div className="rank-list">
            {topFive.map((row) => {
              const band = bandFor(row.contextPct);
              const clampedPct = Math.min(row.contextPct, 100);
              const fillColor = band === "critical" ? "var(--critical)" : band === "warning" ? "var(--warning)" : "var(--accent)";
              return (
                <div key={row.sessionId} className="rank-row">
                  <span className="rname" title={row.sessionName}>{row.sessionName}</span>
                  <span className="rbar-track">
                    <span className="rbar-fill" style={{ width: `${clampedPct}%`, background: fillColor }} />
                  </span>
                  <span className="rval">{Math.round(row.contextPct)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Link to="/sessions" className="ins-link">
        View flagged sessions{" "}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/>
        </svg>
      </Link>
    </div>
  );
}
