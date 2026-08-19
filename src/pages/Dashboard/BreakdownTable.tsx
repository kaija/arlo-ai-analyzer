import { useState } from "react";
import type { BreakdownRow, Measure } from "../../types";
import { fmtTokens, fmtCost } from "../../lib/format";

interface BreakdownTableProps {
  title: string;
  rows: BreakdownRow[];
  measure: Measure;
  entityFilter: string | null;
  onEntityFilter: (name: string | null) => void;
}

type SortKey = "tokens" | "requests" | "cost";
type SortDir = "asc" | "desc";

/**
 * BreakdownTable — matches the mockup's .card > .card-head + .table-scroll > .dtable structure.
 * Uses tokens.css classes: .card, .card-head, .card-title, .dtable, .sortable,
 * .sort-active, .sort-arrow, .num, .tnum, .share-bar-track, .share-bar-fill.
 */
export function BreakdownTable({
  title,
  rows,
  measure,
  entityFilter,
  onEntityFilter,
}: BreakdownTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("tokens");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sorted = [...rows].sort((a, b) => {
    const aVal = a[sortKey];
    const bVal = b[sortKey];
    return sortDir === "desc" ? bVal - aVal : aVal - bVal;
  });

  function arrow(key: SortKey) {
    if (key !== sortKey) return <span className="sort-arrow" aria-hidden="true">↕</span>;
    return <span className="sort-arrow" aria-hidden="true">{sortDir === "desc" ? "↓" : "↑"}</span>;
  }

  function thClass(key: SortKey) {
    const classes = ["sortable", "num"];
    if (key === sortKey) classes.push("sort-active");
    if (
      (key === "tokens" && measure === "tokens") ||
      (key === "requests" && measure === "requests") ||
      (key === "cost" && measure === "cost")
    ) classes.push("emph");
    return classes.join(" ");
  }

  function tdClass(key: SortKey) {
    const classes = ["num", "tnum"];
    if (
      (key === "tokens" && measure === "tokens") ||
      (key === "requests" && measure === "requests") ||
      (key === "cost" && measure === "cost")
    ) classes.push("emph");
    return classes.join(" ");
  }

  if (rows.length === 0) {
    return (
      <div className="card">
        <div className="card-head"><div className="card-title">{title}</div></div>
        <p style={{ padding: "16px 20px", color: "var(--muted)", fontSize: "12.5px" }}>No data</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">{title}</div>
      </div>
      <div className="table-scroll">
        <table className="dtable" aria-label={`${title} breakdown`}>
          <thead>
            <tr>
              <th
                scope="col"
                className="sortable"
                onClick={() => {
                  // name sort not currently supported — keep tokens default
                }}
                aria-sort="none"
              >
                Name <span className="sort-arrow" aria-hidden="true">↕</span>
              </th>
              <th
                scope="col"
                className={thClass("requests")}
                onClick={() => handleSort("requests")}
                aria-sort={sortKey === "requests" ? (sortDir === "desc" ? "descending" : "ascending") : "none"}
              >
                Req {arrow("requests")}
              </th>
              <th
                scope="col"
                className={thClass("tokens")}
                onClick={() => handleSort("tokens")}
                aria-sort={sortKey === "tokens" ? (sortDir === "desc" ? "descending" : "ascending") : "none"}
              >
                Tokens {arrow("tokens")}
              </th>
              <th
                scope="col"
                className={thClass("cost")}
                onClick={() => handleSort("cost")}
                aria-sort={sortKey === "cost" ? (sortDir === "desc" ? "descending" : "ascending") : "none"}
              >
                Cost {arrow("cost")}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const isFiltered = entityFilter !== null && entityFilter !== row.name;
              const isActive = entityFilter === row.name;

              return (
                <tr
                  key={row.name}
                  className="table-row-link"
                  style={{ opacity: isFiltered ? 0.3 : 1 }}
                  tabIndex={0}
                  aria-selected={isActive}
                  onClick={() => onEntityFilter(isActive ? null : row.name)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onEntityFilter(isActive ? null : row.name);
                    }
                  }}
                >
                  {/* Name + share bar */}
                  <td>
                    <div className="name-cell">
                      <span
                        className="dot"
                        style={{ background: isActive ? "var(--accent)" : "var(--border-strong)" }}
                        aria-hidden="true"
                      />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row.name}>
                        {row.name}
                      </span>
                    </div>
                    <div className="share-bar-track" aria-hidden="true" style={{ marginTop: "3px" }}>
                      <div
                        className="share-bar-fill"
                        style={{ width: `${Math.round(row.share * 100)}%` }}
                      />
                    </div>
                  </td>

                  <td className={tdClass("requests")}>
                    {row.requests.toLocaleString()}
                  </td>

                  <td className={tdClass("tokens")}>
                    {fmtTokens(row.tokens)}
                  </td>

                  <td className={tdClass("cost")}>
                    {fmtCost(row.cost)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
