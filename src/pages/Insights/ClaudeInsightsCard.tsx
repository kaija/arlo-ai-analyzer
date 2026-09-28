import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import type { DataAccess } from "../../types";

interface ClaudeInsightsReport {
  html: string;
  path: string;
  generated_at_ms: number;
}

const PREVIEW_CSP = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'";

function previewHtml(html: string): string {
  const policy = `<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">`;
  if (/<head\b[^>]*>/i.test(html)) return html.replace(/<head\b[^>]*>/i, (head) => head + policy);
  return html.replace(/<html\b[^>]*>/i, (root) => root + `<head>${policy}</head>`);
}

export function ClaudeInsightsCard({ access }: { access: DataAccess | null }) {
  const { t, i18n } = useTranslation();
  const [available, setAvailable] = useState(false);
  const [report, setReport] = useState<ClaudeInsightsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorAction, setErrorAction] = useState<"load" | "generate" | "open">("load");
  const [open, setOpen] = useState(false);
  const enabled = !!access && !access.sample && !access.sandboxed;

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let active = true;
    void Promise.all([invoke<boolean>("claude_cli_available"), invoke<ClaudeInsightsReport | null>("get_claude_insights")])
      .then(([cli, latest]) => {
        if (!active) return;
        setAvailable(cli);
        setReport(latest);
        setOpen(!!latest);
      })
      .catch((reason) => { if (active) { setErrorAction("load"); setError(String(reason)); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [enabled]);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const latest = await invoke<ClaudeInsightsReport>("generate_claude_insights");
      setReport(latest);
      setOpen(true);
    } catch (reason) {
      setErrorAction("generate");
      setError(String(reason));
    } finally {
      setGenerating(false);
    }
  }

  async function openFullReport() {
    if (!report) return;
    setError(null);
    try {
      await invoke("open_claude_insights_report", { path: report.path });
    } catch (reason) {
      setErrorAction("open");
      setError(String(reason));
    }
  }

  const date = report ? new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(report.generated_at_ms) : null;

  return (
    <section className="claude-insights card" aria-label={t("claudeInsights.title")}>
      <div className="claude-insights-intro">
        <div className="claude-insights-symbol" aria-hidden="true">✳</div>
        <div className="claude-insights-copy">
          <div className="claude-insights-kicker"><span className="claude-insights-dot" /> Claude Code · /insights</div>
          <h2>{t("claudeInsights.title")}</h2>
          <p>{t("claudeInsights.subtitle")}</p>
          <div className="claude-insights-meta">
            <span>{t("claudeInsights.source")}</span>
            {date && <span>{t("claudeInsights.updated", { date })}</span>}
          </div>
        </div>
        <div className="claude-insights-actions">
          <button className="btn claude-insights-run" type="button" onClick={() => void generate()} disabled={!enabled || !available || generating || loading}>
            {generating ? <span className="claude-insights-spinner" aria-hidden="true" /> : <span aria-hidden="true">✦</span>}
            {generating ? t("claudeInsights.generating") : report ? t("claudeInsights.regenerate") : t("claudeInsights.generate")}
          </button>
          {report && <button className="btn btn-secondary" type="button" onClick={() => void openFullReport()}>{t("claudeInsights.openReport")} ↗</button>}
        </div>
      </div>

      {!enabled && !loading && <p className="claude-insights-message">{t("claudeInsights.unavailable")}</p>}
      {enabled && !available && !loading && !error && <p className="claude-insights-message">{t("claudeInsights.installCli")}</p>}
      {loading && <p className="claude-insights-message">{t("claudeInsights.loading")}</p>}
      {generating && <p className="claude-insights-message" role="status">{t("claudeInsights.waitHint")}</p>}
      {error && <p className="claude-insights-error" role="alert">{t(`claudeInsights.${errorAction}Failed`, { error })}</p>}
      {!report && !loading && !generating && enabled && available && !error && (
        <div className="claude-insights-empty">
          <span className="claude-insights-empty-icon" aria-hidden="true">✧</span>
          <div><strong>{t("claudeInsights.emptyTitle")}</strong><p>{t("claudeInsights.emptyBody")}</p></div>
        </div>
      )}
      {report && (
        <div className="claude-insights-report">
          <button className="claude-insights-toggle" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
            <span><span className="claude-insights-ready" />{t("claudeInsights.preview")}</span>
            <span aria-hidden="true">{open ? "⌃" : "⌄"}</span>
          </button>
          {open && <iframe className="claude-insights-frame" title={t("claudeInsights.preview")} srcDoc={previewHtml(report.html)} sandbox="allow-scripts" referrerPolicy="no-referrer" />}
        </div>
      )}
    </section>
  );
}
