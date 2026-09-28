import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import type { Session } from "../../types";

interface ContextSection {
  title: string;
  columns: string[];
  rows: string[][];
}

interface ContextSnapshot {
  model: string | null;
  tokens: string | null;
  sections: ContextSection[];
  raw: string;
  structured: boolean;
}

const LABELS: Record<string, string> = {
  "Estimated usage by category": "categories",
  "MCP Tools": "mcpTools",
  "Memory Files": "memoryFiles",
  Skills: "skills",
  Category: "category",
  Tokens: "tokens",
  Percentage: "percentage",
  Tool: "tool",
  Server: "server",
  Type: "type",
  Path: "path",
  Skill: "skill",
  Source: "source",
};

/** Claude's own context breakdown for one project, separate from historical session statistics. */
export function ClaudeContextCard({ sessions, sandboxed }: { sessions: Session[]; sandboxed: boolean }) {
  const { t } = useTranslation();
  const projects = useMemo(() => {
    const latest = [...sessions]
      .filter((session) => session.tool === "claude_code")
      .sort((a, b) => b.started_at.localeCompare(a.started_at));
    return [...new Set(latest.map((session) => session.project))];
  }, [sessions]);
  const [project, setProject] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [snapshot, setSnapshot] = useState<ContextSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projects.includes(project)) setProject(projects[0] ?? "");
  }, [projects, project]);

  useEffect(() => {
    if (!project || sandboxed) return;
    let cancelled = false;
    setSnapshot(null);
    setError(null);
    setLoading(true);
    void invoke<ContextSnapshot>("get_claude_context", { project })
      .then((value) => { if (!cancelled) setSnapshot(value); })
      .catch((reason) => { if (!cancelled) setError(String(reason)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [project, refresh, sandboxed]);

  if (projects.length === 0) return null;
  const label = (value: string) => {
    const key = LABELS[value];
    return key ? t(`tools.live.${key}`) : value;
  };

  return (
    <section className="card claude-context-card" aria-label={t("tools.live.title")}>
      <div className="card-head claude-context-head">
        <div>
          <div className="card-title">{t("tools.live.title")}</div>
          <div className="claude-context-subtitle">{t("tools.live.subtitle")}</div>
        </div>
        <div className="claude-context-controls">
          <label className="sr-only" htmlFor="claude-context-project">{t("tools.live.project")}</label>
          <select id="claude-context-project" value={project} onChange={(event) => setProject(event.target.value)}>
            {projects.map((path) => <option key={path} value={path}>{path}</option>)}
          </select>
          <button className="btn btn-secondary" type="button" onClick={() => setRefresh((n) => n + 1)} disabled={loading || sandboxed}>
            {t("tools.live.refresh")}
          </button>
        </div>
      </div>
      <div className="claude-context-content">
        {sandboxed && <p className="claude-context-note">{t("tools.live.sandboxed")}</p>}
        {loading && <p className="claude-context-note">{t("tools.live.loading")}</p>}
        {error && <p className="claude-context-note">{t("tools.live.unavailable", { error })}</p>}
        {snapshot && (
          <>
            {snapshot.structured ? (
              <>
                <div className="claude-context-summary">
                  <strong className="ins-number tnum">{snapshot.tokens}</strong>
                  <span>{snapshot.model}</span>
                </div>
                <div className="claude-context-sections">
                  {snapshot.sections.map((section) => (
                    <details key={section.title} open={section.title === "Estimated usage by category"}>
                      <summary>{label(section.title)} <span className="tnum">({section.rows.length})</span></summary>
                      <div className="table-scroll-x claude-context-table-scroll">
                        <table className="dtable">
                          <thead><tr>{section.columns.map((column) => <th key={column}>{label(column)}</th>)}</tr></thead>
                          <tbody>{section.rows.map((row, index) => (
                            <tr key={`${row[0]}:${index}`}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>
                          ))}</tbody>
                        </table>
                      </div>
                    </details>
                  ))}
                </div>
              </>
            ) : <p className="claude-context-note">{t("tools.live.formatChanged")}</p>}
            <details className="claude-context-raw" open={!snapshot.structured}>
              <summary>{t("tools.live.originalOutput")}</summary>
              <pre>{snapshot.raw}</pre>
            </details>
            <p className="claude-context-note">{t("tools.live.estimateNote")}</p>
          </>
        )}
      </div>
    </section>
  );
}
