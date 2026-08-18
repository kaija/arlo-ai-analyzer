import { Link } from "react-router-dom";
import type { Session } from "../types";
import { sumSessions } from "../aggregate";

export function Breakdown({
  groups,
  linkPrefix,
}: {
  groups: Record<string, Session[]>;
  linkPrefix?: string;
}) {
  const rows = Object.entries(groups)
    .map(([key, list]) => ({ key, ...sumSessions(list) }))
    .sort((a, b) => b.tokens - a.tokens);

  return (
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Sessions</th>
          <th>Tokens</th>
          <th>Est. cost</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <td>
              {linkPrefix ? <Link to={`${linkPrefix}${encodeURIComponent(r.key)}`}>{r.key}</Link> : r.key}
            </td>
            <td>{r.sessions}</td>
            <td>{r.tokens.toLocaleString()}</td>
            <td>${r.costUsd.toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
