import { useState, useRef, useEffect } from "react";

export interface CustomDatePopoverProps {
  start: string;
  end: string;
  onApply: (start: string, end: string) => void;
  onClose: () => void;
}

/**
 * CustomDatePopover — a small anchored popover with From/To date inputs.
 *
 * Rendered as an absolute-positioned child inside a `position:relative`
 * wrapper (e.g. `.date-range-field-wrap`). Dismisses on outside click or
 * Escape key press. Calls `onApply(start, end)` when the user confirms.
 */
export function CustomDatePopover({ start, end, onApply, onClose }: CustomDatePopoverProps) {
  const [localStart, setLocalStart] = useState(start);
  const [localEnd,   setLocalEnd]   = useState(end);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const invalid = Boolean(localStart && localEnd && localStart > localEnd);

  return (
    <div
      className="custom-date-popover"
      ref={ref}
      role="dialog"
      aria-label="Custom date range"
    >
      <div className="custom-date-row">
        <label className="custom-date-label" htmlFor="cdp-start">From</label>
        <input
          id="cdp-start"
          type="date"
          className="custom-date-input"
          value={localStart}
          max={localEnd || undefined}
          onChange={(e) => setLocalStart(e.target.value)}
        />
      </div>
      <div className="custom-date-row">
        <label className="custom-date-label" htmlFor="cdp-end">To</label>
        <input
          id="cdp-end"
          type="date"
          className="custom-date-input"
          value={localEnd}
          min={localStart || undefined}
          onChange={(e) => setLocalEnd(e.target.value)}
        />
      </div>
      {invalid && (
        <p className="custom-date-error">Start date must be before end date.</p>
      )}
      <div className="custom-date-actions">
        <button className="btn-ghost custom-date-cancel" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn-primary custom-date-apply"
          disabled={!localStart || !localEnd || invalid}
          onClick={() => {
            onApply(localStart, localEnd);
            onClose();
          }}
        >
          Apply
        </button>
      </div>
    </div>
  );
}
