import { useTranslation } from "react-i18next";
import { GUIDELINES, type ToolAnalysis } from "../../lib/tool-usage";
import { fmtTokens } from "../../lib/format";
import { TOOL_LABELS } from "../../types";

/**
 * The median first-request prompt, split into what the logs can attribute
 * (skills, MCP, subagents) and everything else, against the "a tenth of the
 * window" line. Below it, how that number moved day by day.
 */
export function StartingContextCard({ analysis: a }: { analysis: ToolAnalysis }) {
  const { t } = useTranslation();
  const median = a.baseline.median;
  const threshold = GUIDELINES.startingContextShare * a.contextWindow;
  const { skills, mcp, subagents } = a.loadout;

  const parts = [
    { key: "skills", value: skills.tokens, color: "var(--series-1)" },
    { key: "mcp", value: mcp.tokens, color: "var(--series-2)" },
    { key: "subagents", value: subagents.tokens, color: "var(--series-3)" },
    {
      key: "rest",
      value: median === null ? 0 : Math.max(0, median - a.loadout.totalTokens),
      color: "var(--series-recessive)",
    },
  ].filter((p) => p.value > 0);
  const total = parts.reduce((n, p) => n + p.value, 0);
  const scale = Math.max(total, threshold) * 1.08 || 1;

  return (
    <div className="card insight-card">
      <div className="ins-eyebrow">
        <span>{t("tools.context.title")}</span>
      </div>
      <div className="ins-number tnum">{median === null ? "—" : fmtTokens(median)}</div>
      <div className="ins-line">
        {median === null
          ? t("tools.context.noBaseline")
          : t("tools.context.median", { count: a.baseline.samples })}
      </div>

      <div className="ins-body">
        <div className="ctx-bar" role="img" aria-label={t("tools.context.title")}>
          {parts.map((p) => (
            <span
              key={p.key}
              style={{ width: `${(p.value / scale) * 100}%`, background: p.color }}
              title={`${t(`tools.context.${p.key}`)} · ${fmtTokens(p.value)}`}
            />
          ))}
          <i className="ctx-mark" style={{ left: `${(threshold / scale) * 100}%` }}>
            <span className="ctx-mark-label">
              {t("tools.context.threshold", { pct: Math.round(GUIDELINES.startingContextShare * 100) })}
            </span>
          </i>
        </div>
        <div className="mini-legend">
          {parts.map((p) => (
            <span key={p.key} className="lk">
              <span className="sw" style={{ background: p.color }} />
              {t(`tools.context.${p.key}`)} · {fmtTokens(p.value)}
            </span>
          ))}
        </div>
        {!a.hasListing && (
          <div className="ins-line">{t("tools.context.noListing", { tool: TOOL_LABELS[a.tool] })}</div>
        )}
        {a.baseline.daily.length >= 2 && <Sparkline points={a.baseline.daily} threshold={threshold} />}
      </div>
    </div>
  );
}

function Sparkline({ points, threshold }: { points: Array<{ date: string; median: number }>; threshold: number }) {
  const { t } = useTranslation();
  const max = Math.max(threshold, ...points.map((p) => p.median)) * 1.1;
  const x = (i: number) => (i / (points.length - 1)) * 100;
  const y = (v: number) => 30 - (v / max) * 28;
  const line = points.map((p, i) => `${x(i).toFixed(2)},${y(p.median).toFixed(2)}`).join(" ");
  return (
    <div className="spark">
      <div className="spark-label">
        <span>{t("tools.context.trend")}</span>
        <span className="tnum">
          {points[0].date} – {points[points.length - 1].date}
        </span>
      </div>
      <svg viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">
        <line className="spark-threshold" x1="0" x2="100" y1={y(threshold)} y2={y(threshold)} />
        <polyline className="spark-line" points={line} />
      </svg>
    </div>
  );
}
