import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { useSessionsContext } from "../../context/SessionsContext";

// ---------------------------------------------------------------------------
// LogsDirectoryCard
//
// Shows the current logs directory in a read-only monospace path field with a
// folder icon, with two action buttons:
//   • "Change…" (secondary) — opens a Tauri directory picker
//   • "Re-scan"  (primary)  — invokes triggerRescan()
//
// Requirements: 7.7, 7.8, 11.7, 12.3, 12.7, 12.9
// ---------------------------------------------------------------------------

const DEFAULT_LOGS_PATH = "~/.claude/projects";

export function LogsDirectoryCard() {
  const { t } = useTranslation();
  const { triggerRescan } = useSessionsContext();

  const [logsPath, setLogsPath] = useState<string>(DEFAULT_LOGS_PATH);
  const [scanBusy, setScanBusy] = useState<boolean>(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const timerDoneRef = useRef<boolean>(false);
  const asyncDoneRef = useRef<boolean>(false);

  // --------------------------------------------------------------------------
  // Change directory
  // --------------------------------------------------------------------------

  const handleChange = async () => {
    try {
      const selected = await invoke<string | null>("plugin:dialog|open", {
        options: { directory: true },
      });
      if (selected !== null) {
        setLogsPath(selected);
      }
    } catch {
      // dialog plugin unavailable — silently ignore
    }
  };

  // --------------------------------------------------------------------------
  // Re-scan
  // --------------------------------------------------------------------------

  const handleRescan = () => {
    if (scanBusy) return;

    setScanBusy(true);
    setScanError(null);
    timerDoneRef.current = false;
    asyncDoneRef.current = false;

    const timerId = setTimeout(() => {
      timerDoneRef.current = true;
      if (asyncDoneRef.current) {
        setScanBusy(false);
      }
    }, 1100);

    triggerRescan()
      .then(() => {
        asyncDoneRef.current = true;
        if (timerDoneRef.current) {
          setScanBusy(false);
        }
      })
      .catch((err: unknown) => {
        asyncDoneRef.current = true;
        const message =
          err instanceof Error ? err.message : String(err ?? "Scan failed");
        setScanError(message);
        clearTimeout(timerId);
        setTimeout(() => {
          setScanBusy(false);
        }, 0);
      });
  };

  return (
    <section className="card" aria-labelledby="logs-dir-card-heading">
      <div className="card-head">
        <div className="card-head-text">
          <h2 id="logs-dir-card-heading" className="card-title">{t("settings.logsDirectory.title")}</h2>
          <p className="card-subtitle">{t("settings.logsDirectory.subtitle")}</p>
        </div>
      </div>

      <div className="path-row">
        {/* Read-only path field with folder icon */}
        <div
          className="path-field"
          role="group"
          aria-label={t("settings.logsDirectory.currentPath")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          <span className="mono">{logsPath}</span>
        </div>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleChange}
        >
          {t("settings.logsDirectory.change")}
        </button>

        <button
          type="button"
          className="btn btn-primary"
          onClick={handleRescan}
          disabled={scanBusy}
          aria-busy={scanBusy}
        >
          {scanBusy ? t("settings.logsDirectory.scanning") : t("settings.logsDirectory.rescan")}
        </button>
      </div>

      {/* Inline error message */}
      {scanError !== null && (
        <p role="alert" className="field-error-inline" style={{ padding: "0 24px 16px" }}>
          {t("settings.logsDirectory.scanFailed")}: {scanError}
        </p>
      )}
    </section>
  );
}
