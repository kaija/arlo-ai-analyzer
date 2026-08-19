import type { Totals } from "../../lib/aggregate";
import { StatTile } from "../../primitives/StatTile";
import { InfoDot } from "../../primitives/InfoDot";
import { fmtTokens, fmtCost } from "../../lib/format";

interface StatTilesRowProps {
  totals: Totals;
  activeDays: number;
  sessions: number;
  projects: number;
  branches: number;
}

/**
 * StatTilesRow — four summary stat tiles matching the mockup exactly:
 *   1. API-equivalent value  (with info-dot popover)
 *   2. Requests              ("across N sessions" sub)
 *   3. Tokens                (cache read % sub)
 *   4. Active days           ("N projects · N branches" sub)
 */
export function StatTilesRow({
  totals,
  activeDays,
  sessions,
  projects,
  branches,
}: StatTilesRowProps) {
  const cacheReadPct =
    totals.tokens > 0
      ? Math.round((totals.cacheReadTokens / totals.tokens) * 100)
      : 0;

  const cacheReadFmt = fmtTokens(totals.cacheReadTokens);

  return (
    <div className="stat-grid">
      {/* Tile 1 — API-equivalent value */}
      <StatTile
        label="API-equivalent value"
        infoDot={
          <InfoDot>
            What these tokens would cost at standard API rates — not money
            charged under your subscription. A measure of usage, not a bill.
          </InfoDot>
        }
        value={fmtCost(totals.costUsd)}
        sub={undefined}
      />

      {/* Tile 2 — Requests */}
      <StatTile
        label="Requests"
        value={totals.messages.toLocaleString()}
        sub={`across ${sessions} session${sessions === 1 ? "" : "s"}`}
      />

      {/* Tile 3 — Tokens */}
      <StatTile
        label="Tokens"
        value={fmtTokens(totals.tokens)}
        sub={`${cacheReadFmt} cache read · ${cacheReadPct}%`}
      />

      {/* Tile 4 — Active days */}
      <StatTile
        label="Active days"
        value={String(activeDays)}
        sub={`${projects} project${projects === 1 ? "" : "s"} · ${branches} branch${branches === 1 ? "" : "es"}`}
      />
    </div>
  );
}
