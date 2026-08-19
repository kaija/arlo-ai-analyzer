import { Link } from "react-router-dom";
import type { SkillRow } from "../../types";

interface McpAttributionCardProps {
  skills: SkillRow[];
}

export function McpAttributionCard({ skills }: McpAttributionCardProps) {
  const active = skills.filter((s) => s.requests >= 1);
  const topFour = active.slice(0, 4);
  const top = active[0] ?? null;

  return (
    <div className="card insight-card">
      <div className="ins-eyebrow"><span>MCP &amp; skill attribution</span></div>

      <div className="ins-number tnum">
        {top ? top.skill : "No data"}
      </div>

      <div className="ins-line">
        {top ? (
          <><b>{top.requests.toLocaleString()} requests</b> — the single largest MCP server or skill by volume this period.</>
        ) : (
          "No MCP server or skill attribution data available yet. Skill attribution requires per-request data from the backend."
        )}
      </div>

      {topFour.length > 0 && (
        <div className="ins-body">
          <div className="rank-list">
            {topFour.map((row) => {
              const maxReq = topFour[0].requests;
              const barPct = maxReq > 0 ? (row.requests / maxReq) * 100 : 0;
              return (
                <div key={row.skill} className="rank-row">
                  <span className="rname" title={row.skill}>{row.skill}</span>
                  <span className="rbar-track">
                    <span className="rbar-fill" style={{ width: `${barPct}%` }} />
                  </span>
                  <span className="rval">{row.requests.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Link to="/" className="ins-link">
        View all servers &amp; skills{" "}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/>
        </svg>
      </Link>
    </div>
  );
}
