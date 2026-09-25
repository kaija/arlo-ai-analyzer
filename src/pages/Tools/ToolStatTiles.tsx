import { useTranslation } from "react-i18next";
import type { ToolAnalysis } from "../../lib/tool-usage";
import { fmtTokens } from "../../lib/format";
import { InfoDot } from "../../primitives/InfoDot";
import { StatTile } from "../../primitives/StatTile";

export function ToolStatTiles({ analysis: a }: { analysis: ToolAnalysis }) {
  const { t } = useTranslation();
  const median = a.baseline.median;
  const unused = a.rows.filter((r) => r.installed && r.removable && r.tier === "unused");
  const unusedTokens = unused.reduce((n, r) => n + (r.listingTokens ?? 0), 0);
  const distinct = new Set(a.rows.filter((r) => r.calls > 0).map((r) => `${r.kind}:${r.name}`)).size;

  return (
    <div className="stat-grid">
      <StatTile
        label={t("tools.stats.starting")}
        value={median === null ? "—" : fmtTokens(median)}
        infoDot={<InfoDot>{t("tools.stats.startingInfo")}</InfoDot>}
        sub={
          median === null
            ? undefined
            : t("tools.stats.startingSub", {
                pct: Math.round((median / a.contextWindow) * 100),
                window: fmtTokens(a.contextWindow),
                p90: fmtTokens(a.baseline.p90 ?? median),
              })
        }
      />
      <StatTile
        label={t("tools.stats.loaded")}
        value={a.hasListing ? fmtTokens(a.loadout.totalTokens) : "—"}
        infoDot={<InfoDot>{t("tools.stats.loadedInfo")}</InfoDot>}
        sub={t("tools.stats.loadedSub", {
          skills: a.loadout.skills.count,
          servers: a.loadout.mcp.count,
          agents: a.loadout.subagents.count,
        })}
      />
      <StatTile
        label={t("tools.stats.unused")}
        value={a.hasListing ? unused.length.toLocaleString() : "—"}
        sub={
          !a.hasListing
            ? undefined
            : unused.length === 0
              ? t("tools.stats.unusedNone")
              : t("tools.stats.unusedSub", { tokens: fmtTokens(unusedTokens) })
        }
        subGood={a.hasListing && unused.length === 0}
      />
      <StatTile
        label={t("tools.stats.calls")}
        value={a.totalCalls.toLocaleString()}
        sub={t("tools.stats.callsSub", { distinct, sessions: a.sessions.toLocaleString() })}
      />
    </div>
  );
}
