import { Link } from "react-router-dom";
import { useSessionsContext } from "../../context/SessionsContext";

/**
 * EmptyState — shown when no sessions and not scanning.
 * Uses token classes exactly: .empty-state > .glyph + h3 + p + actions div
 */
export function EmptyState() {
  const { triggerRescan, scanState } = useSessionsContext();
  const isScanning = scanState === "scanning";

  return (
    <div className="empty-state" role="status" aria-live="polite">
        <div className="glyph" aria-hidden="true">
        {/* folder + magnifier — matches mockup exactly */}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          <circle cx="11" cy="14" r="3"/>
          <line x1="13.5" y1="16.5" x2="16" y2="19"/>
        </svg>
      </div>

      <h3>No Claude Code logs found</h3>
      <p>
        Arlo couldn't find any Claude Code session logs in your logs directory.
        Try re-scanning or check that the correct directory is configured in Settings.
      </p>

      <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
        <button
          className="btn btn-primary"
          onClick={() => triggerRescan()}
          disabled={isScanning}
          aria-busy={isScanning}
        >
          {isScanning ? "Scanning…" : "Re-scan now"}
        </button>
        <Link to="/settings" className="btn btn-secondary">
          Go to Settings
        </Link>
      </div>
    </div>
  );
}
