import type { Effort } from "../types";

interface BadgeProps {
  variant: "accent" | "neutral" | "good" | "warning" | "critical";
  children: React.ReactNode;
}

interface EffortBadgeProps {
  /** null on transcript records that predate the `effort` field. */
  effort: Effort | null;
}

const EFFORT_LABELS: Record<Effort, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "XHigh",
  max: "Max",
};

export function Badge({ variant, children }: BadgeProps) {
  return <span className={`badge badge-${variant}`}>{children}</span>;
}

export function EffortBadge({ effort }: EffortBadgeProps) {
  if (effort === null) {
    return <span className="effort-unknown">—</span>;
  }
  return (
    <span className={`badge effort-${effort}`}>{EFFORT_LABELS[effort]}</span>
  );
}
