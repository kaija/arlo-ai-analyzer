import { useState } from "react";
import { useTranslation } from "react-i18next";
import { fixSnippet, type Recommendation, type ToolAnalysis } from "../../lib/tool-usage";
import { fmtTokens } from "../../lib/format";
import { Badge } from "../../primitives/Badge";

const SHOWN_ITEMS = 8;

export function RecommendationsCard({ analysis: a }: { analysis: ToolAnalysis }) {
  const { t } = useTranslation();
  return (
    <div className="card insight-card">
      <div className="ins-eyebrow">
        <span>{t("tools.recs.title")}</span>
      </div>
      {a.recommendations.length === 0 ? (
        <div className="ins-line">{t("tools.recs.none")}</div>
      ) : (
        <ul className="rec-list">
          {a.recommendations.map((rec) => (
            // Keyed by tool too, so one CLI's expanded item doesn't stay open for the other.
            <RecommendationItem key={`${a.tool}:${rec.kind}`} rec={rec} analysis={a} />
          ))}
        </ul>
      )}
    </div>
  );
}

function RecommendationItem({ rec, analysis: a }: { rec: Recommendation; analysis: ToolAnalysis }) {
  const { t, i18n } = useTranslation();
  // A few pieces of advice differ for Codex (no name-only skills, for one).
  const codexBody = `tools.recs.${rec.kind}.bodyCodex`;
  const bodyKey = a.tool === "codex_cli" && i18n.exists(codexBody) ? codexBody : `tools.recs.${rec.kind}.body`;
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const snippet = fixSnippet(a.tool, rec);

  // Numbers read as tokens in the message are formatted like tokens.
  const values = {
    ...rec.values,
    median: fmtTokens(rec.values.median ?? 0),
    window: fmtTokens(rec.values.window ?? a.contextWindow),
    tokens: fmtTokens(rec.values.tokens ?? 0),
    budget: fmtTokens(rec.values.budget ?? 0),
    memoryFile: a.tool === "codex_cli" ? "AGENTS.md" : "CLAUDE.md",
  };

  const copy = async () => {
    if (!snippet) return;
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable; the snippet is still selectable.
    }
  };

  return (
    <li className={`rec-item rec-${rec.severity}`}>
      <div className="rec-head">
        <Badge variant={rec.severity === "warning" ? "warning" : "neutral"}>
          {t(`tools.recs.severity.${rec.severity}`)}
        </Badge>
        <span className="rec-title">{t(`tools.recs.${rec.kind}.title`, values)}</span>
      </div>
      <p className="rec-body">{t(bodyKey, values)}</p>
      {rec.items.length > 0 && (
        <div className="rec-items">
          {rec.items.slice(0, SHOWN_ITEMS).map((item) => (
            <span key={item.name} className="pill-mono" title={item.listingTokens === null ? undefined : `≈ ${fmtTokens(item.listingTokens)}`}>
              {item.name}
            </span>
          ))}
          {rec.items.length > SHOWN_ITEMS && (
            <span className="rec-more">{t("tools.recs.more", { count: rec.items.length - SHOWN_ITEMS })}</span>
          )}
        </div>
      )}
      {rec.tokensPerRequest !== null && rec.tokensPerRequest > 0 && (
        <div className="rec-saves tnum">
          {t("tools.recs.saves", {
            tokens: fmtTokens(rec.tokensPerRequest),
            total: fmtTokens(rec.tokensPerRequest * a.requests),
            requests: a.requests.toLocaleString(),
          })}
        </div>
      )}
      {snippet && (
        <>
          <button type="button" className="rec-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? t("tools.recs.hide") : t("tools.recs.howTo")}
          </button>
          {open && (
            <div className="rec-snippet">
              <pre>{snippet}</pre>
              <button type="button" className="btn" onClick={() => void copy()}>
                {copied ? t("tools.recs.copied") : t("tools.recs.copy")}
              </button>
            </div>
          )}
        </>
      )}
    </li>
  );
}
