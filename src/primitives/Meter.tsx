

interface MeterProps {
  /** 0–100 percentage value */
  value: number;
  /** When true, renders a `.meter-label` showing the formatted percentage */
  showLabel?: boolean;
}

type Band = "quiet" | "normal" | "warning" | "critical";

/**
 * Map a 0–100 percentage to a context-usage band.
 *
 * Band thresholds (from design.md / tokens.css):
 *   < 50  → quiet    (muted-2, 50% opacity)
 *   50–74 → normal   (accent)
 *   75–89 → warning  (warning color)
 *   ≥ 90  → critical (critical color)
 */
export function bandFor(pct: number): Band {
  if (pct >= 90) return "critical";
  if (pct >= 75) return "warning";
  if (pct >= 50) return "normal";
  return "quiet";
}

/**
 * Meter — visualises a 0–100% value as a filled track coloured by band.
 *
 * DOM structure (mirrors tokens.css):
 *   .meter
 *     .meter-track
 *       .meter-fill.band-{band}
 *     .meter-label.band-{band}   (when showLabel is true)
 */
export function Meter({ value, showLabel = false }: MeterProps) {
  // Clamp to [0, 100] so downstream CSS stays valid
  const pct = Math.min(100, Math.max(0, value));
  const band = bandFor(pct);

  return (
    <div className="meter">
      <div
        className="meter-track"
        role="meter"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${Math.round(pct)}%`}
      >
        <div
          className={`meter-fill band-${band}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <span className={`meter-label band-${band}`}>
          {Math.round(pct)}%
        </span>
      )}
    </div>
  );
}
