import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSessionsContext } from "../../context/SessionsContext";
import { DEFAULT_LOG_PATHS, TOOL_LABELS, type SourceAccess, type ToolKind } from "../../types";

/** `/Users/<name>/…` → `~/…`, for display. */
function tildify(path: string): string {
  return path.replace(/^\/Users\/[^/]+(?=\/|$)/, "~");
}

/**
 * Onboarding — the dashboard's content while there is no session to show.
 *
 * It is the first screen of every new install, and all of setup happens here:
 * the App Store build is sandboxed and can read no log folder until the user
 * picks it in the open panel, so this screen detects which tools are installed
 * (the sandbox still answers "does this folder exist") and turns connecting
 * them into one button. Each folder still needs its own confirmation in the
 * panel — macOS gives no way around that — but the panel opens on the right
 * folder, so each is a single click on Open. App Review, on a machine with no
 * logs at all, gets sample data.
 */
export function Onboarding() {
  const { t } = useTranslation();
  const { access, grantAccess, setSampleData } = useSessionsContext();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sources = access?.sources ?? [];
  const pending = sources.filter((s) => s.detected && !s.readable);
  const connected = sources.filter((s) => s.readable);
  const nothingFound = access !== null && sources.every((s) => !s.detected);

  const pickerTitle = (tool: ToolKind) =>
    t("dataAccess.pickerTitle", { tool: TOOL_LABELS[tool], path: DEFAULT_LOG_PATHS[tool] ?? "" });

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  /** Ask for each found-but-unreadable folder in turn; stop if one is cancelled. */
  const allowAll = () =>
    run(async () => {
      for (const source of pending) {
        const next = await grantAccess(source.tool, pickerTitle(source.tool));
        if (!next.sources.find((s) => s.tool === source.tool)?.readable) break;
      }
    });

  const statusBadge = (s: SourceAccess) => {
    if (s.readable) return <span className="badge badge-good">{t("dataAccess.statusConnected")}</span>;
    if (s.detected) return <span className="badge badge-accent">{t("dataAccess.statusFound")}</span>;
    return <span className="badge badge-neutral">{t("dataAccess.statusNotFound")}</span>;
  };

  return (
    <section className="onboarding" aria-labelledby="onboarding-title">
      <div className="glyph" aria-hidden="true">
        {/* folder + magnifier — matches mockup exactly */}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          <circle cx="11" cy="14" r="3"/>
          <line x1="13.5" y1="16.5" x2="16" y2="19"/>
        </svg>
      </div>

      <h2 id="onboarding-title">{t("dataAccess.welcomeTitle")}</h2>
      <p className="lede">{t("dataAccess.welcomeBody")}</p>

      <ul className="onboarding-sources" aria-label={t("dataAccess.sourcesLabel")}>
        {sources.map((s) => (
          <li key={s.tool}>
            <div className="src-text">
              <div className="src-name">
                {TOOL_LABELS[s.tool]} {statusBadge(s)}
              </div>
              <div className="src-path mono">
                {tildify(s.path ?? DEFAULT_LOG_PATHS[s.tool] ?? "")}
              </div>
            </div>
            {!s.readable && (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => run(() => grantAccess(s.tool, pickerTitle(s.tool)))}
              >
                {s.detected ? t("dataAccess.allow") : t("dataAccess.chooseFolder")}
              </button>
            )}
          </li>
        ))}
      </ul>

      {connected.map((s) => (
        <p key={s.tool} className="note">
          {t("dataAccess.connectedNoSessions", { tool: TOOL_LABELS[s.tool] })}
        </p>
      ))}
      {nothingFound && <p className="note">{t("dataAccess.noneFound")}</p>}

      <div className="actions">
        {pending.length > 0 && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={allowAll}
            aria-busy={busy}
          >
            {pending.length > 1 ? t("dataAccess.allowAll") : t("dataAccess.allow")}
          </button>
        )}
        <button
          type="button"
          className={pending.length > 0 ? "btn btn-secondary" : "btn btn-primary"}
          disabled={busy}
          onClick={() => run(() => setSampleData(true))}
        >
          {t("dataAccess.trySample")}
        </button>
      </div>

      {pending.length > 0 && <p className="note">{t("dataAccess.hint")}</p>}

      {error !== null && (
        <p role="alert" className="field-error-inline">
          {t("dataAccess.failed")}: {error}
        </p>
      )}
    </section>
  );
}
