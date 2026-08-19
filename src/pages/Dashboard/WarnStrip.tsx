import { useState } from "react";
import React from "react";

interface WarnStripProps {
  message: React.ReactNode;
  linkText?: string;
  onLinkClick?: () => void;
}

/**
 * WarnStrip — slim full-width dismissible warning strip.
 * Uses the exact token class hierarchy from tokens.css:
 *   .warn-strip > svg + span + (optional link) + .dismiss button
 */
export function WarnStrip({ message, linkText, onLinkClick }: WarnStripProps) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="warn-strip" role="status" aria-live="polite">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10.3 3.6 1.8 18a1.8 1.8 0 0 0 1.5 2.7h17.4a1.8 1.8 0 0 0 1.5-2.7L13.7 3.6a1.8 1.8 0 0 0-3.4 0z"/>
        <line x1="12" y1="9" x2="12" y2="13.5"/>
      </svg>

      <span>
        {message}
        {linkText && (
          <>
            {" "}
            <a
              href="#"
              onClick={(e) => { e.preventDefault(); onLinkClick?.(); }}
            >
              {linkText}
            </a>
          </>
        )}
      </span>

      <button
        className="dismiss"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss warning"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  );
}
