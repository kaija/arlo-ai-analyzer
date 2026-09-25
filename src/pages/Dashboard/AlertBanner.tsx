import { useState } from "react";
import { Link } from "react-router-dom";

interface AlertBannerProps {
  message: string;
  sessionId?: string;
  meta?: string;
  /** Called on dismiss so the caller can remember it beyond this mount. */
  onDismiss?: () => void;
}

/**
 * AlertBanner — full-width dismissible banner.
 * Uses the exact token class hierarchy from tokens.css:
 *   .alert-banner > .icon-tile + .body (.body strong + .meta) + .actions
 */
export function AlertBanner({ message, sessionId, meta, onDismiss }: AlertBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="alert-banner" role="alert" aria-live="assertive" aria-atomic="true">
      <span className="icon-tile" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 18a8 8 0 1 1 16 0"/>
          <line x1="12" y1="18" x2="16" y2="11"/>
        </svg>
      </span>

      <div className="body">
        <div><strong>{message}</strong></div>
        {meta && <div className="meta">{meta}</div>}
      </div>

      <div className="actions">
        {sessionId && (
          <Link to={`/sessions/${sessionId}`} className="btn btn-secondary btn-small">
            View session
          </Link>
        )}
        <button
          className="btn btn-ghost btn-small"
          onClick={() => { setDismissed(true); onDismiss?.(); }}
          aria-label="Dismiss"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
