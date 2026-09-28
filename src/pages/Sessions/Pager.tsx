export interface PagerProps {
  /** Current page index (0-based) */
  page: number;
  /** Total number of pages */
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
}

/**
 * Pager — footer pagination control.
 *
 * Shows "Page N of M" (1-based display) with Previous / Next buttons.
 * Previous is disabled on the first page; Next is disabled on the last page.
 * Each button scrolls the page content back to the top.
 */
export function Pager({ page, totalPages, onPrev, onNext }: PagerProps) {
  // Clamp display to at least "Page 1 of 1" when there are no results
  const displayPage = Math.min(page + 1, Math.max(totalPages, 1));
  const displayTotal = Math.max(totalPages, 1);

  const isFirst = page <= 0;
  const isLast = page >= totalPages - 1 || totalPages === 0;

  function scrollToTop() {
    document.querySelector<HTMLElement>(".content-scroll")?.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handlePrev() {
    if (!isFirst) {
      scrollToTop();
      onPrev();
    }
  }

  function handleNext() {
    if (!isLast) {
      scrollToTop();
      onNext();
    }
  }

  return (
    <nav className="pager" aria-label="Session table pagination">
      <button
        className="btn btn--ghost pager-btn"
        onClick={handlePrev}
        disabled={isFirst}
        aria-label="Previous page"
      >
        ← Previous
      </button>

      <span className="pager-label" aria-live="polite" aria-atomic="true">
        Page {displayPage} of {displayTotal}
      </span>

      <button
        className="btn btn--ghost pager-btn"
        onClick={handleNext}
        disabled={isLast}
        aria-label="Next page"
      >
        Next →
      </button>
    </nav>
  );
}
