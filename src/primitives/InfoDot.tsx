import { useEffect, useRef, useState } from "react";

interface InfoDotProps {
  /** Content rendered inside the popover */
  children: React.ReactNode;
}

/**
 * InfoDot — a keyboard-accessible ⓘ indicator with a popover.
 *
 * DOM structure (mirrors tokens.css):
 *   .info-dot  (tabIndex=0, role="button")
 *     "i"
 *     .pop      (popover content; opacity/visibility toggled via inline style)
 *
 * Interaction:
 *   - Hover: CSS-only via tokens.css (.info-dot:hover .pop)
 *   - Keyboard open:  Enter or Space when focused → sets `open = true`
 *   - Keyboard close: Escape → sets `open = false`
 *   - Outside click:  mousedown outside the dot element → sets `open = false`
 *   - Focus leaves:   blur event where relatedTarget is outside the component → sets `open = false`
 */
export function InfoDot({ children }: InfoDotProps) {
  const [open, setOpen] = useState(false);
  const dotRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;

    function handleMouseDown(e: MouseEvent) {
      if (dotRef.current && !dotRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [open]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen((prev) => !prev);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

  /**
   * Close the popover when keyboard focus moves outside the component.
   * We use onBlur with a requestAnimationFrame delay so the relatedTarget
   * (the element receiving focus) is fully resolved before we check it.
   * Req 9.7: "close on Escape keypress or when focus moves outside the popover"
   */
  function handleBlur(e: React.FocusEvent<HTMLDivElement>) {
    const related = e.relatedTarget as Node | null;
    // If focus moves to a child inside dotRef, don't close
    if (dotRef.current && related && dotRef.current.contains(related)) {
      return;
    }
    // Focus has left the component — close the popover
    setOpen(false);
  }

  const popStyle: React.CSSProperties = open
    ? { opacity: 1, visibility: "visible" }
    : {};

  return (
    <div
      ref={dotRef}
      className="info-dot"
      tabIndex={0}
      role="button"
      aria-expanded={open}
      aria-haspopup="true"
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
    >
      i
      <div className="pop" style={popStyle} role="tooltip">
        {children}
      </div>
    </div>
  );
}
