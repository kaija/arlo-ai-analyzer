import { useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { fixPrompt, fixSnippet, type Recommendation, type ToolAnalysis } from "../../lib/tool-usage";
import { fmtTokens } from "../../lib/format";
import type { InputSavingsRate } from "../../lib/savings-estimate";
import { Badge } from "../../primitives/Badge";

const SHOWN_ITEMS = 8;

/** What the pasted prompt asks the agent to answer in, per UI language. */
const REPLY_LANGUAGE: Record<string, string> = {
  en: "English",
  "zh-TW": "Traditional Chinese (繁體中文)",
  ja: "Japanese (日本語)",
};

type Copied = "snippet" | "prompt" | null;

interface RecommendationsCardProps {
  analysis: ToolAnalysis;
  savingsRate: InputSavingsRate | null;
  claudeCliAvailable: boolean;
  projects: string[];
}

export function RecommendationsCard({ analysis: a, savingsRate, claudeCliAvailable, projects }: RecommendationsCardProps) {
  const { t } = useTranslation();
  const [selectedProject, setSelectedProject] = useState(projects[0] ?? "");
  const project = projects.includes(selectedProject) ? selectedProject : projects[0] ?? "";
  return (
    <div className="card insight-card">
      <div className="ins-eyebrow">
        <span>{t("tools.recs.title")}</span>
      </div>
      {claudeCliAvailable && project && a.recommendations.length > 0 && (
        <div className="rec-cli-target">
          <label htmlFor="rec-cli-project">{t("tools.recs.runProject")}</label>
          <select id="rec-cli-project" value={project} onChange={(event) => setSelectedProject(event.target.value)}>
            {projects.map((path) => <option key={path} value={path}>{path}</option>)}
          </select>
          <span>{t("tools.recs.runHint")}</span>
        </div>
      )}
      {a.recommendations.length === 0 ? (
        <div className="ins-line">{t("tools.recs.none")}</div>
      ) : (
        <ul className="rec-list">
          {a.recommendations.map((rec) => (
            // Reset item state when the user switches tools or target projects.
            <RecommendationItem key={`${a.tool}:${project}:${rec.kind}`} rec={rec} analysis={a} savingsRate={savingsRate} project={claudeCliAvailable ? project : ""} />
          ))}
        </ul>
      )}
    </div>
  );
}

function RecommendationItem({ rec, analysis: a, savingsRate, project }: { rec: Recommendation; analysis: ToolAnalysis; savingsRate: InputSavingsRate | null; project: string }) {
  const { t, i18n } = useTranslation();
  // A few pieces of advice differ for Codex (no name-only skills, for one).
  const codexBody = `tools.recs.${rec.kind}.bodyCodex`;
  const bodyKey = a.tool === "codex_cli" && i18n.exists(codexBody) ? codexBody : `tools.recs.${rec.kind}.body`;
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<Copied>(null);
  const [launching, setLaunching] = useState(false);
  const [launched, setLaunched] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
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

  const prompt = () => {
    // The agent reads the finding in English whatever the UI language is.
    const en = i18n.getFixedT("en");
    return fixPrompt(a, rec, {
      title: en(`tools.recs.${rec.kind}.title`, values),
      body: en(bodyKey, values),
      replyLanguage: REPLY_LANGUAGE[i18n.language] ?? "English",
    });
  };

  const copy = async (what: Exclude<Copied, null>) => {
    const text = what === "prompt" ? prompt() : snippet;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // Clipboard unavailable; the snippet is still selectable.
    }
  };

  const runInClaude = async () => {
    if (!project) return;
    setLaunching(true);
    setLaunched(false);
    setLaunchError(null);
    try {
      await invoke("launch_claude_prompt", { project, prompt: prompt() });
      setLaunched(true);
    } catch (error) {
      setLaunchError(String(error));
    } finally {
      setLaunching(false);
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
          {savingsRate && ` ${t("tools.recs.savesCost", {
            cost: new Intl.NumberFormat(i18n.language, { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(
              rec.tokensPerRequest * a.requests * savingsRate.usdPerMillion / 1_000_000,
            ),
            model: savingsRate.model,
          })}`}
        </div>
      )}
      <div className="rec-actions">
        <button
          type="button"
          className="rec-toggle"
          title={t("tools.recs.copyPromptHint")}
          onClick={() => void copy("prompt")}
        >
          {copied === "prompt" ? t("tools.recs.promptCopied") : t("tools.recs.copyPrompt")}
        </button>
        {project && (
          <button type="button" className="rec-toggle" onClick={() => void runInClaude()} disabled={launching}>
            {launching ? t("tools.recs.openingClaude") : t("tools.recs.runClaude")}
          </button>
        )}
        {snippet && (
          <button type="button" className="rec-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? t("tools.recs.hide") : t("tools.recs.howTo")}
          </button>
        )}
      </div>
      {launched && <p className="rec-launch-status" role="status">{t("tools.recs.openedClaude")}</p>}
      {launchError && <p className="rec-launch-error" role="alert">{t("tools.recs.launchFailed", { error: launchError })}</p>}
      {snippet && open && (
        <div className="rec-snippet">
          <pre>{snippet}</pre>
          <button type="button" className="btn" onClick={() => void copy("snippet")}>
            {copied === "snippet" ? t("tools.recs.copied") : t("tools.recs.copy")}
          </button>
        </div>
      )}
    </li>
  );
}
