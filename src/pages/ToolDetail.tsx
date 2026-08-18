import { useParams, Link } from "react-router-dom";
import { useSessions } from "../useSessions";
import { sumSessions, groupBy } from "../aggregate";
import { TOOL_LABELS, type ToolKind } from "../types";
import { StatTile } from "../components/StatTile";
import { Breakdown } from "../components/Breakdown";

export default function ToolDetail() {
  const { tool } = useParams<{ tool: string }>();
  const { sessions, loading } = useSessions();
  if (loading) return <p>Loading…</p>;

  const filtered = sessions.filter((s) => s.tool === tool);
  const totals = sumSessions(filtered);
  const byProject = groupBy(filtered, (s) => s.project);
  const byModel = groupBy(filtered, (s) => s.model ?? "unknown");

  return (
    <div>
      <p>
        <Link to="/">&larr; Overview</Link>
      </p>
      <h1>{TOOL_LABELS[tool as ToolKind] ?? tool}</h1>

      <div className="stat-grid">
        <StatTile label="Sessions" value={totals.sessions.toLocaleString()} />
        <StatTile label="Tokens" value={totals.tokens.toLocaleString()} />
        <StatTile label="Est. cost" value={`$${totals.costUsd.toFixed(2)}`} />
      </div>

      <h2>By project</h2>
      <Breakdown groups={byProject} linkPrefix="/project/" />

      <h2>By model</h2>
      <Breakdown groups={byModel} />
    </div>
  );
}
