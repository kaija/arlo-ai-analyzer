import { useParams, Link } from "react-router-dom";
import { useSessions } from "../useSessions";
import { sumSessions, groupBy } from "../aggregate";
import { TOOL_LABELS, type ToolKind } from "../types";
import { StatTile } from "../components/StatTile";
import { Breakdown } from "../components/Breakdown";

export default function ProjectDetail() {
  const { project } = useParams<{ project: string }>();
  const decoded = decodeURIComponent(project ?? "");
  const { sessions, loading } = useSessions();
  if (loading) return <p>Loading…</p>;

  const filtered = sessions.filter((s) => s.project === decoded);
  const totals = sumSessions(filtered);
  const byTool = groupBy(filtered, (s) => TOOL_LABELS[s.tool as ToolKind] ?? s.tool);

  return (
    <div>
      <p>
        <Link to="/">&larr; Overview</Link>
      </p>
      <h1>{decoded}</h1>

      <div className="stat-grid">
        <StatTile label="Sessions" value={totals.sessions.toLocaleString()} />
        <StatTile label="Tokens" value={totals.tokens.toLocaleString()} />
        <StatTile label="Est. cost" value={`$${totals.costUsd.toFixed(2)}`} />
      </div>

      <h2>By tool</h2>
      <Breakdown groups={byTool} />
    </div>
  );
}
