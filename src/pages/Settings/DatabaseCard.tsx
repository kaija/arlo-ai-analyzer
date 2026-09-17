import { useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { useSessionsContext } from "../../context/SessionsContext";

// ---------------------------------------------------------------------------
// DatabaseCard
//
// Clears the local SQLite cache and rebuilds it from the transcripts on disk.
//
// The cache is derived data — every row is recomputed from ~/.claude/projects
// on the next scan — so this loses nothing. What it fixes is the two things a
// plain re-scan can't: `upsert_sessions` never deletes, so sessions whose
// transcripts you removed linger forever, and rows written by an older build
// keep whatever the pricing or parser said at the time.
//
// The confirm step is a second click on the same button rather than a modal —
// enough to stop a stray click, no dialog machinery.
// ---------------------------------------------------------------------------

const LOGS_PATH = "~/.claude/projects";

type State =
  | { kind: "idle" }
  | { kind: "confirming" }
  | { kind: "running" }
  | { kind: "done"; count: number }
  | { kind: "error"; message: string };

export function DatabaseCard() {
  const { t } = useTranslation();
  const { refresh } = useSessionsContext();
  const [state, setState] = useState<State>({ kind: "idle" });

  const handleReset = async () => {
    setState({ kind: "running" });
    try {
      const count = await invoke<number>("reset_database");
      await refresh();
      setState({ kind: "done", count });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : String(err ?? ""),
      });
    }
  };

  const running = state.kind === "running";
  const confirming = state.kind === "confirming";

  return (
    <section className="card" aria-labelledby="database-card-heading">
      <div className="card-head">
        <div className="card-head-text">
          <h2 id="database-card-heading" className="card-title">
            {t("settings.database.title")}
          </h2>
          <p className="card-subtitle">{t("settings.database.subtitle")}</p>
        </div>
      </div>

      <div className="path-row">
        <p className="card-subtitle" style={{ flex: "1 1 auto", margin: 0 }}>
          {t("settings.database.detail", { path: LOGS_PATH })}
        </p>

        {confirming && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setState({ kind: "idle" })}
          >
            {t("settings.database.cancel")}
          </button>
        )}

        <button
          type="button"
          className={confirming ? "btn btn-danger" : "btn btn-secondary"}
          onClick={() =>
            confirming ? handleReset() : setState({ kind: "confirming" })
          }
          disabled={running}
          aria-busy={running}
        >
          {running
            ? t("settings.database.resetting")
            : confirming
              ? t("settings.database.confirm")
              : t("settings.database.reset")}
        </button>
      </div>

      {state.kind === "done" && (
        <p role="status" className="field-note-inline">
          {t("settings.database.done", { count: state.count })}
        </p>
      )}

      {state.kind === "error" && (
        <p role="alert" className="field-error-inline">
          {t("settings.database.failed")}: {state.message}
        </p>
      )}
    </section>
  );
}
