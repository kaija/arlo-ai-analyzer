import { Link } from "react-router-dom";
import type { Session } from "../../types";
import { totalTokens, estimatedCostUsd } from "../../pricing";
import { fmtTokens, fmtCost, fmtDate } from "../../lib/format";

interface SessionHeaderProps {
  session: Session;
  requestCount: number;
  compactionCount: number;
}

/**
 * SessionHeader — top section of the Session Detail page.
 *
 * Layout: h1 + meta-line on the left, four right-aligned stat items on the right.
 * Meta-line uses interpunct (·) separators matching the mockup.
 *
 * Requirements: 5.1, 5.2
 */
export function SessionHeader({ session, requestCount, compactionCount }: SessionHeaderProps) {
  // Derive a short display name from the project path (which is a cwd like
  // "/Users/kaija/code/my-project"). Take only the last path segment.
  // Fall back to session_id when project is empty.
  const sessionName = session.project
    ? session.project.split("/").filter(Boolean).pop() ?? session.session_id
    : session.session_id;

  // Duration: not yet exposed by the backend.
  // TODO: needs backend — expose ended_at / duration on Session
  const durationLabel = "—";

  const tokens = totalTokens(session);
  const cost = estimatedCostUsd(session);

  // Branch is not yet available in the Session struct.
  // TODO: needs backend — expose branch field on Session
  const branch: string | null = (session as unknown as { branch?: string }).branch ?? null;

  return (
    <>
      {/* Back row */}
      <div className="back-row">
        <Link to="/sessions" className="back-link">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Sessions
        </Link>
      </div>

      {/* Header: name+meta left, stats right */}
      <div className="sess-header">
        <div>
          <h1>{sessionName}</h1>

          <div className="meta-line">
            <span>{sessionName}</span>

            {branch && (
              <>
                <span className="meta-sep">·</span>
                <span className="pill-mono branch-pill">{branch}</span>
              </>
            )}

            <span className="meta-sep">·</span>
            <span>{fmtDate(session.started_at)}</span>

            <span className="meta-sep">·</span>
            <span>{durationLabel}</span>
          </div>
        </div>

        {/* Four stat items — right-aligned */}
        <div className="sess-stats">
          <div className="item">
            <div className="lbl">Requests</div>
            <div className="val tnum">{requestCount}</div>
          </div>

          <div className="item">
            <div className="lbl">Tokens</div>
            <div className="val tnum">{fmtTokens(tokens)}</div>
          </div>

          <div className="item">
            <div className="lbl">Cost</div>
            <div className="val tnum">{fmtCost(cost)}</div>
          </div>

          <div className="item">
            <div className="lbl">Compactions</div>
            <div className="val tnum">
              {compactionCount > 0 ? compactionCount : "—"}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
