import { useNavigate } from "react-router-dom";
import type { Session, Measure } from "../../types";
import { Meter } from "../../primitives/Meter";
import { fmtTokens, fmtCost, fmtDate, fmtDuration } from "../../lib/format";
import { contextWindow, modelColor, totalTokens, estimatedCostUsd } from "../../pricing";

export interface SessionsTableProps {
  sessions: Session[];
  measure: Measure;
  onRowClick: (sessionId: string) => void;
  sortKey: string;
  sortDir: "asc" | "desc";
  onSort: (key: string) => void;
}

// ---------------------------------------------------------------------------
// Sort arrow — matches mockup's .sort-arrow token
// ---------------------------------------------------------------------------

function SortArrow({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  return (
    <span className="sort-arrow" aria-hidden="true">
      {active ? (dir === "desc" ? "↓" : "↑") : "↕"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Column header — uses .sortable + .sort-active + .num from tokens.css
// ---------------------------------------------------------------------------

interface ThProps {
  label: string;
  sortKey: string;
  currentKey: string;
  currentDir: "asc" | "desc";
  onSort: (key: string) => void;
  num?: boolean;
  measure?: Measure;
  activeMeasure?: Measure;
}

function Th({ label, sortKey, currentKey, currentDir, onSort, num, measure, activeMeasure }: ThProps) {
  const isActive = currentKey === sortKey;
  const isEmph = measure !== undefined && activeMeasure !== undefined && measure === activeMeasure;
  return (
    <th
      scope="col"
      className={[
        "sortable",
        isActive ? "sort-active" : "",
        num ? "num" : "",
        isEmph ? "emph" : "",
      ].filter(Boolean).join(" ")}
      onClick={() => onSort(sortKey)}
      aria-sort={isActive ? (currentDir === "asc" ? "ascending" : "descending") : "none"}
    >
      {label} <SortArrow active={isActive} dir={currentDir} />
    </th>
  );
}

// ---------------------------------------------------------------------------
// Model dots — .models-used > span.md
// ---------------------------------------------------------------------------

function ModelDots({ model }: { model: string | null }) {
  const models = model ? model.split(",").map((m) => m.trim()).filter(Boolean) : [];
  if (models.length === 0) return <span className="compaction-zero">—</span>;
  const visible = models.slice(0, 3);
  const overflow = models.length - visible.length;
  return (
    <div className="models-used">
      {visible.map((m) => (
        <span key={m} className="md" style={{ background: modelColor(m) }} title={m} aria-label={m} />
      ))}
      {overflow > 0 && <span className="more">+{overflow}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compaction — .compaction-badge / .compaction-zero
// ---------------------------------------------------------------------------

function CompactionCell({ count }: { count: number }) {
  if (count === 0) return <span className="compaction-zero">—</span>;
  return <span className="compaction-badge">{count}</span>;
}

// ---------------------------------------------------------------------------
// Context pct — peak prompt vs the context window of the model that carried
// it. Not `s.model`: that is the session's first turn, and Claude Code opens
// many sessions with a 200K-window Haiku title call.
// ---------------------------------------------------------------------------

export function contextPct(s: Session): number {
  return (
    (s.peak_context_tokens / contextWindow(s.peak_context_model ?? s.model)) * 100
  );
}

// ---------------------------------------------------------------------------
// SessionsTable
// ---------------------------------------------------------------------------

export function SessionsTable({ sessions, measure, onRowClick, sortKey, sortDir, onSort }: SessionsTableProps) {
  const navigate = useNavigate();

  function handleRowKeyDown(e: React.KeyboardEvent, sessionId: string) {
    if (e.key === "Enter") { e.preventDefault(); onRowClick(sessionId); navigate(`/sessions/${sessionId}`); }
  }
  function handleRowClick(sessionId: string) { onRowClick(sessionId); navigate(`/sessions/${sessionId}`); }

  return (
    <table className="dtable" aria-label="Sessions" style={{ minWidth: "1180px" }}>
      <thead>
        <tr>
          <Th label="Session"  sortKey="session_id" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
          <Th label="Project"  sortKey="project"    currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
          <Th label="Branch"   sortKey="branch"     currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
          <Th label="Started"  sortKey="started_at" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
          <Th label="Duration" sortKey="duration"   currentKey={sortKey} currentDir={sortDir} onSort={onSort} num />
          <Th label="Requests" sortKey="requests"   currentKey={sortKey} currentDir={sortDir} onSort={onSort} num measure="requests" activeMeasure={measure} />
          <Th label="Tokens"   sortKey="tokens"     currentKey={sortKey} currentDir={sortDir} onSort={onSort} num measure="tokens"   activeMeasure={measure} />
          <Th label="Cost"     sortKey="cost"       currentKey={sortKey} currentDir={sortDir} onSort={onSort} num measure="cost"     activeMeasure={measure} />
          <th scope="col">Models</th>
          <Th label="Context high-water" sortKey="context"     currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
          <Th label="Compactions"        sortKey="compactions" currentKey={sortKey} currentDir={sortDir} onSort={onSort} num />
        </tr>
      </thead>
      <tbody>
        {sessions.map((s) => {
          const branch = (s as any).branch ?? "—";
          const compactions = s.compaction_count;
          const hw = contextPct(s);
          const dur = fmtDuration(s.started_at, new Date().toISOString());

          return (
            <tr
              key={s.session_id}
              className="table-row-link"
              tabIndex={0}
              onClick={() => handleRowClick(s.session_id)}
              onKeyDown={(e) => handleRowKeyDown(e, s.session_id)}
              aria-label={`Session ${s.session_id}`}
            >
              {/* Session name + ID */}
              <td style={{ maxWidth: "200px" }}>
                <div className="sess-cell">
                  <span className="name" title={s.session_id}>{s.session_id}</span>
                  <span className="id mono">{s.session_id.slice(0, 12)}</span>
                </div>
              </td>

              {/* Project */}
              <td style={{ maxWidth: "180px" }}>
                <span
                  className="link-cell"
                  style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  onClick={(e) => e.stopPropagation()}
                  title={s.project}
                >
                  {s.project || "—"}
                </span>
              </td>

              {/* Branch */}
              <td>
                <span className={`link-cell branch-pill${branch === "—" ? " compaction-zero" : ""}`}>
                  {branch}
                </span>
              </td>

              {/* Started */}
              <td className="tnum">{fmtDate(s.started_at)}</td>

              {/* Duration */}
              <td className="num tnum">{dur}</td>

              {/* Requests */}
              <td className={`num tnum${measure === "requests" ? " emph" : ""}`}>
                {s.message_count.toLocaleString()}
              </td>

              {/* Tokens */}
              <td className={`num tnum${measure === "tokens" ? " emph" : ""}`}>
                {fmtTokens(totalTokens(s))}
              </td>

              {/* Cost */}
              <td className={`num tnum${measure === "cost" ? " emph" : ""}`}>
                {fmtCost(estimatedCostUsd(s))}
              </td>

              {/* Models */}
              <td><ModelDots model={s.model} /></td>

              {/* Context high-water */}
              <td><Meter value={hw} showLabel /></td>

              {/* Compactions */}
              <td className="num"><CompactionCell count={compactions} /></td>
            </tr>
          );
        })}

        {sessions.length === 0 && (
          <tr>
            <td colSpan={11} style={{ padding: "32px", textAlign: "center", color: "var(--muted)" }}>
              No sessions match the current filters.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
