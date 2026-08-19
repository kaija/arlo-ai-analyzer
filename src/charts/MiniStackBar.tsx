import type { TokenKind, StopReason } from "../types";

// Token kind colors — matches --series-N CSS vars.
// cache_read uses --series-recessive (low-chroma gray) so it visually recedes
// against the more prominent input/output segments.
export const TOKEN_KIND_COLORS: Record<TokenKind, string> = {
  input:          "var(--series-1)",
  output:         "var(--series-7)",
  cache_write_5m: "var(--series-3)",
  cache_write_1h: "var(--series-2)",
  cache_read:     "var(--series-recessive)",
};

// Stop reason colors
export const STOP_REASON_COLORS: Record<StopReason, string> = {
  end_turn: "var(--good)",
  tool_use: "var(--muted-2)",
  max_tokens: "var(--warning)",
  refusal: "var(--critical)",
};

export interface MiniStackSegment {
  value: number;    // absolute value (tokens, count, etc.)
  color: string;    // CSS color or var(--series-N)
  label?: string;   // optional label for tooltip/aria
}

export interface MiniStackBarProps {
  segments: MiniStackSegment[];
  total?: number;   // if not provided, sum of segment values
}

/**
 * MiniStackBar — a compact proportional stacked bar.
 *
 * Renders `.mini-stack > span*N`, each span sized as
 * `(value / total) * 100%` with its assigned background color.
 * If the resolved total is 0, nothing is rendered.
 */
export function MiniStackBar({ segments, total }: MiniStackBarProps) {
  const resolvedTotal =
    total !== undefined ? total : segments.reduce((sum, s) => sum + s.value, 0);

  if (resolvedTotal === 0) return null;

  return (
    <div className="mini-stack" role="img" aria-label="Token distribution bar">
      {segments.map((seg, i) => {
        const pct = (seg.value / resolvedTotal) * 100;
        if (pct === 0) return null;
        return (
          <span
            key={i}
            style={{ width: `${pct}%`, backgroundColor: seg.color }}
            title={seg.label}
            aria-label={seg.label}
          />
        );
      })}
    </div>
  );
}
