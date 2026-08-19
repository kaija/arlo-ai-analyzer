import { useSessionsContext } from "../../context/SessionsContext";

/**
 * ScanState — shown while a scan is in progress or errored.
 * Uses token classes: .scan-state > .glyph + h3 + p + .progress-track/.progress-fill + .scan-meta + .scan-log
 */
export function ScanState() {
  const { scanState, scanError, triggerRescan } = useSessionsContext();
  const isError = scanState === "error";

  return (
    <div className="scan-state" role="status" aria-live="polite" aria-atomic="false">
      <div className="glyph" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7"/>
          <line x1="21" y1="21" x2="16.6" y2="16.6"/>
        </svg>
      </div>

      {isError ? (
        <>
          <h3>Scan failed</h3>
          {scanError && <p>{scanError}</p>}
          <button className="btn btn-secondary" onClick={() => triggerRescan()}>
            Retry scan
          </button>
        </>
      ) : (
        <>
          <h3>Scanning Claude Code logs</h3>
          <p>Reading transcripts from ~/.claude/projects — this only happens once.</p>
          <div
            className="progress-track"
            role="progressbar"
            aria-label="Scan progress"
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="progress-fill" style={{ width: "60%" }} />
          </div>
          <div className="scan-meta">Indexing session files…</div>
        </>
      )}
    </div>
  );
}
