import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CapabilityRow, ToolAnalysis, UsageTier } from "../../lib/tool-usage";
import { fmtDate, fmtTokens } from "../../lib/format";
import { Badge } from "../../primitives/Badge";
import { SegmentedControl } from "../../primitives/SegmentedControl";
import type { CapabilityKind } from "../../types";

type KindFilter = CapabilityKind | "all";
const KINDS: KindFilter[] = ["all", "builtin", "mcp", "skill", "subagent"];

const TIER_VARIANT: Record<UsageTier, "good" | "accent" | "warning" | "critical" | "neutral"> = {
  core: "good",
  regular: "accent",
  rare: "warning",
  unused: "critical",
  new: "neutral",
};

/** A failure rate worth pointing at. */
const HIGH_ERROR_RATE = 0.2;

export function ToolUsageTable({ analysis: a }: { analysis: ToolAnalysis }) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<KindFilter>("all");
  const rows = useMemo(() => a.rows.filter((r) => kind === "all" || r.kind === kind), [a.rows, kind]);
  const maxShare = Math.max(0.0001, ...a.rows.map((r) => r.sessionShare));

  return (
    <div className="card tools-table-card">
      <div className="card-head">
        <div className="card-title">{t("tools.table.title")}</div>
        <div className="tools-table-tools">
          <span className="sess-count">{t("tools.table.count", { count: rows.length })}</span>
          <SegmentedControl
            options={KINDS.map((k) => ({ value: k, label: t(`tools.table.kinds.${k}`) }))}
            value={kind}
            onChange={setKind}
            ariaLabel={t("tools.table.type")}
          />
        </div>
      </div>
      <div className="table-scroll-x">
        <table className="dtable tools-table">
          <thead>
            <tr>
              <th>{t("tools.table.name")}</th>
              <th>{t("tools.table.type")}</th>
              <th>{t("tools.table.status")}</th>
              <th className="num">{t("tools.table.calls")}</th>
              <th>{t("tools.table.sessions")}</th>
              <th className="num">{t("tools.table.errors")}</th>
              <th>{t("tools.table.lastUsed")}</th>
              <th className="num" title={t("tools.table.perRequestTitle")}>
                {t("tools.table.perRequest")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Row key={`${r.kind}:${r.name}`} row={r} maxShare={maxShare} showRemoved={a.hasListing} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({ row: r, maxShare, showRemoved }: { row: CapabilityRow; maxShare: number; showRemoved: boolean }) {
  const { t } = useTranslation();
  const errorRate = r.calls > 0 ? r.errors / r.calls : 0;
  const toolsTitle = r.toolCalls.map((c) => `${c.tool} · ${c.calls}`).join("\n");

  return (
    <tr className={r.tier === "unused" && r.removable && r.installed ? "tools-row-unused" : undefined}>
      <td className="tools-name">
        <span className="tools-name-text" title={r.path ?? r.name}>
          {r.name}
        </span>
        {r.kind === "mcp" && (r.mcpTools > 0 || r.toolCalls.length > 0) && (
          <span className="tools-name-sub" title={toolsTitle || undefined}>
            {/* A partial listing can name fewer tools than were called. */}
            {r.mcpTools >= r.toolCalls.length && r.mcpTools > 0
              ? t("tools.table.mcpTools", { used: r.toolCalls.length, total: r.mcpTools })
              : t("tools.table.mcpToolsUsed", { count: r.toolCalls.length })}
          </span>
        )}
        {/* MCP servers loaded up front never appear in the deferred-tool
            listing, so only skills and subagents can be called removed. */}
        {showRemoved && r.everListed && !r.installed && (r.kind === "skill" || r.kind === "subagent") && (
          <span className="tools-name-sub">{t("tools.table.removed")}</span>
        )}
      </td>
      <td className="muted">{t(`tools.table.kinds.${r.kind}`)}</td>
      <td>
        <Badge variant={TIER_VARIANT[r.tier]}>{t(`tools.tier.${r.tier}`)}</Badge>
      </td>
      <td className="num tnum">{r.calls.toLocaleString()}</td>
      <td>
        <span className="share-cell">
          <span className="rbar-track">
            <span className="rbar-fill" style={{ width: `${(r.sessionShare / maxShare) * 100}%` }} />
          </span>
          <span className="tnum">
            {r.sessionsUsed.toLocaleString()} · {Math.round(r.sessionShare * 100)}%
          </span>
        </span>
      </td>
      <td className={`num tnum${errorRate >= HIGH_ERROR_RATE && r.calls >= 5 ? " tools-err-high" : ""}`}>
        {r.errors === 0 ? "—" : `${r.errors.toLocaleString()} · ${Math.round(errorRate * 100)}%`}
      </td>
      <td className="tnum">{r.lastUsed ? fmtDate(r.lastUsed) : "—"}</td>
      <td className="num tnum" title={r.kind === "builtin" ? t("tools.table.builtinCost") : undefined}>
        {r.listingTokens === null || !r.installed ? "—" : fmtTokens(r.listingTokens)}
      </td>
    </tr>
  );
}
