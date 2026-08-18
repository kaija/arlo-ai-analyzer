import { Link } from "react-router-dom";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useSessions } from "../useSessions";
import { sumSessions, groupBy, byDay } from "../aggregate";
import { TOOL_LABELS, type ToolKind } from "../types";
import { StatTile } from "../components/StatTile";

export default function Overview() {
  const { sessions, loading } = useSessions();
  if (loading) return <p>Loading…</p>;

  const totals = sumSessions(sessions);
  const byTool = groupBy(sessions, (s) => s.tool);
  const dailyTokens = byDay(sessions);

  return (
    <div>
      <div className="stat-grid">
        <StatTile label="Sessions" value={totals.sessions.toLocaleString()} />
        <StatTile label="Tokens" value={totals.tokens.toLocaleString()} />
        <StatTile label="Est. cost" value={`$${totals.costUsd.toFixed(2)}`} />
        <StatTile label="Messages" value={totals.messages.toLocaleString()} />
      </div>

      <h2>Tokens per day</h2>
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={dailyTokens}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Area type="monotone" dataKey="tokens" fillOpacity={0.3} />
        </AreaChart>
      </ResponsiveContainer>

      <h2>By tool</h2>
      <table>
        <thead>
          <tr>
            <th>Tool</th>
            <th>Sessions</th>
            <th>Tokens</th>
            <th>Est. cost</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(byTool).map(([tool, list]) => {
            const t = sumSessions(list);
            return (
              <tr key={tool}>
                <td>
                  <Link to={`/tool/${tool}`}>{TOOL_LABELS[tool as ToolKind] ?? tool}</Link>
                </td>
                <td>{t.sessions}</td>
                <td>{t.tokens.toLocaleString()}</td>
                <td>${t.costUsd.toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
