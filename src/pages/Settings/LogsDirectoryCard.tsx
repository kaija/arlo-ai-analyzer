import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useSessionsContext } from "../../context/SessionsContext";
import { Switch } from "../../primitives/Switch";
import { DEFAULT_LOG_PATHS, TOOL_LABELS, type SourceAccess } from "../../types";

// ---------------------------------------------------------------------------
// LogsDirectoryCard
//
// One row per tool: the folder read (read-only monospace path field), whether
// it is connected, "Choose…" (opens the folder picker — the only way the
// sandboxed build gets read access) and "Forget" for a picked folder. Below:
// the sample-data switch and "Re-scan" (invokes triggerRescan()).
//
// Requirements: 7.7, 7.8, 11.7, 12.3, 12.7, 12.9
// ---------------------------------------------------------------------------

export function LogsDirectoryCard() {
  const { t } = useTranslation();
  const { triggerRescan, access, grantAccess, clearAccess, setSampleData } = useSessionsContext();

  const [scanBusy, setScanBusy] = useState<boolean>(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [accessBusy, setAccessBusy] = useState<boolean>(false);
  const [accessError, setAccessError] = useState<string | null>(null);

  const timerDoneRef = useRef<boolean>(false);
  const asyncDoneRef = useRef<boolean>(false);

  // --------------------------------------------------------------------------
  // Folder access
  // --------------------------------------------------------------------------

  const runAccess = async (action: () => Promise<unknown>) => {
    setAccessBusy(true);
    setAccessError(null);
    try {
      await action();
    } catch (err) {
      setAccessError(err instanceof Error ? err.message : String(err));
    } finally {
      setAccessBusy(false);
    }
  };

  const handleChoose = (source: SourceAccess) =>
    runAccess(() =>
      grantAccess(
        source.tool,
        t("dataAccess.pickerTitle", {
          tool: TOOL_LABELS[source.tool],
          path: DEFAULT_LOG_PATHS[source.tool] ?? "",
        }),
      ),
    );

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
    <section id="logs-directory" className="card" aria-labelledby="logs-dir-card-heading" tabIndex={-1}>
      <div className="card-head">
        <div className="card-head-text">
          <h2 id="logs-dir-card-heading" className="card-title">{t("settings.logsDirectory.title")}</h2>
          <p className="card-subtitle">{t("settings.logsDirectory.subtitle")}</p>
        </div>
      </div>

      <div className="notif-form">
        {(access?.sources ?? []).map((source) => {
          const labelId = `logs-dir-label-${source.tool}`;
          return (
            <div key={source.tool} className="notif-form-row">
              <div className="label-col" style={{ flex: "1 1 auto", minWidth: 0 }}>
                <div id={labelId} className="lbl">
                  {TOOL_LABELS[source.tool]}
                  {" · "}
                  <span className="hint">
                    {source.readable
                      ? t("settings.logsDirectory.connected")
                      : t("settings.logsDirectory.notConnected")}
                  </span>
                </div>
                <div className="path-field" role="group" aria-labelledby={labelId} style={{ marginTop: "6px" }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                  </svg>
                  <span className="mono">{source.path ?? DEFAULT_LOG_PATHS[source.tool]}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px", flex: "0 0 auto" }}>
                {source.granted && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={accessBusy}
                    onClick={() => runAccess(() => clearAccess(source.tool))}
                  >
                    {t("settings.logsDirectory.forget")}
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={accessBusy}
                  onClick={() => handleChoose(source)}
                >
                  {t("settings.logsDirectory.choose")}
                </button>
              </div>
            </div>
          );
        })}

        <div className="notif-form-row">
          <div className="label-col">
            <div id="logs-dir-sample-label" className="lbl">
              {t("settings.logsDirectory.sampleTitle")}
            </div>
            <div className="hint">{t("settings.logsDirectory.sampleDescription")}</div>
          </div>
          <Switch
            id="logs-dir-sample-switch"
            checked={access?.sample ?? false}
            onChange={(checked) => runAccess(() => setSampleData(checked))}
            labelledBy="logs-dir-sample-label"
          />
        </div>
      </div>

      <div className="path-row" style={{ justifyContent: "flex-end" }}>
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

      {accessError !== null && (
        <p role="alert" className="field-error-inline" style={{ padding: "0 24px 16px" }}>
          {t("dataAccess.failed")}: {accessError}
        </p>
      )}

      {/* Inline error message */}
      {scanError !== null && (
        <p role="alert" className="field-error-inline" style={{ padding: "0 24px 16px" }}>
          {t("settings.logsDirectory.scanFailed")}: {scanError}
        </p>
      )}
    </section>
  );
}
