import type { Effort } from "../types";

interface BadgeProps {
  variant: "accent" | "neutral" | "good" | "warning" | "critical";
  children: React.ReactNode;
}

interface EffortBadgeProps {
  effort: Effort;
}

const EFFORT_LABELS: Record<Effort, string> = {
  medium: "Medium",
  high: "High",
  xhigh: "Max",
};

export function Badge({ variant, children }: BadgeProps) {
  return <span className={`badge badge-${variant}`}>{children}</span>;
}

export function EffortBadge({ effort }: EffortBadgeProps) {
  return (
    <span className={`badge effort-${effort}`}>{EFFORT_LABELS[effort]}</span>
  );
}
