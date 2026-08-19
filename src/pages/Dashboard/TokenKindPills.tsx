import type { TokenKind } from "../../types";
import { TOKEN_KIND_COLORS } from "../../charts/MiniStackBar";

interface TokenKindPillsProps {
  /** Which token kinds are currently toggled on. */
  kindOn: Record<TokenKind, boolean>;
  /** Total tokens per kind (used to compute percentage share). */
  totals: Record<TokenKind, number>;
  /** Called when a pill is clicked. */
  onToggle: (kind: TokenKind) => void;
}

const TOKEN_KIND_LABELS: Record<TokenKind, string> = {
  input: "Input",
  output: "Output",
  cache_write_5m: "Cache write 5m",
  cache_write_1h: "Cache write 1h",
  cache_read: "Cache read",
};

const ALL_KINDS: TokenKind[] = [
  "input",
  "output",
  "cache_write_5m",
  "cache_write_1h",
  "cache_read",
];

/**
 * TokenKindPills — five toggle pills shown below the usage chart when the
 * active measure is "tokens". Each pill shows:
 *   - a color swatch matching the token kind's series color
 *   - the kind name
 *   - the percentage share of total tokens
 *
 * When toggled off, the pill gets a dashed border and the swatch is rendered
 * at 30% opacity.
 *
 * If every pill is toggled off, a hint message is shown asking the user to
 * re-enable at least one kind.
 *
 * Requirements: 3.10, 3.11, 3.12
 */
export function TokenKindPills({
  kindOn,
  totals,
  onToggle,
}: TokenKindPillsProps) {
  const grandTotal = ALL_KINDS.reduce((sum, k) => sum + (totals[k] ?? 0), 0);
  const allOff = ALL_KINDS.every((k) => !kindOn[k]);

  return (
    <div className="token-kind-pills" role="group" aria-label="Token kind filter">
      {ALL_KINDS.map((kind) => {
        const on = kindOn[kind];
        const color = TOKEN_KIND_COLORS[kind];
        const pct =
          grandTotal > 0
            ? Math.round(((totals[kind] ?? 0) / grandTotal) * 100)
            : 0;

        return (
          <button
            key={kind}
            className={`token-kind-pill${on ? " active" : ""}`}
            onClick={() => onToggle(kind)}
            aria-pressed={on}
            aria-label={`${TOKEN_KIND_LABELS[kind]}: ${pct}%, ${on ? "on" : "off"}`}
            type="button"
          >
            {/* Color swatch */}
            <span
              className="token-kind-swatch"
              style={{
                backgroundColor: color,
                opacity: on ? 1 : 0.3,
              }}
              aria-hidden="true"
            />
            {/* Label */}
            <span className="token-kind-label">{TOKEN_KIND_LABELS[kind]}</span>
            {/* Percentage share */}
            <span className="token-kind-pct">{pct}%</span>
          </button>
        );
      })}

      {/* All-off hint */}
      {allOff && (
        <p className="token-kind-hint" role="status" aria-live="polite">
          All token kinds are hidden. Click a pill to re-enable it.
        </p>
      )}
    </div>
  );
}
