/**
 * Formatting utilities for tokens, costs, dates, and durations.
 * All functions are pure with no side effects.
 */

/**
 * Format a token count with B/M/K suffix.
 * - ≥ 1,000,000,000 → "X.XB"
 * - ≥ 1,000,000     → "X.XM"
 * - ≥ 1,000         → "X.XK"
 * - < 1,000         → plain number string
 *
 * Negative values are formatted with a leading minus sign.
 */
export function fmtTokens(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";

  if (abs >= 1_000_000_000) {
    return `${sign}${trimTrailingZero((abs / 1_000_000_000).toFixed(1))}B`;
  }
  if (abs >= 1_000_000) {
    return `${sign}${trimTrailingZero((abs / 1_000_000).toFixed(1))}M`;
  }
  if (abs >= 1_000) {
    return `${sign}${trimTrailingZero((abs / 1_000).toFixed(1))}K`;
  }
  return `${sign}${abs}`;
}

/** Remove a trailing ".0" from a toFixed(1) result (e.g. "2.0" → "2"). */
function trimTrailingZero(s: string): string {
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

/**
 * Format a cost in USD with always-two decimal places: "$X.XX".
 * Negative values produce e.g. "-$0.50".
 */
export function fmtCost(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  return `${sign}$${abs.toFixed(2)}`;
}

/**
 * Format an ISO-8601 date string as a locale-friendly short date.
 * Example: "2024-01-05T10:30:00Z" → "Jan 5, 2024"
 */
export function fmtDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Format elapsed time between two ISO-8601 timestamps as a human-readable string.
 * Examples:
 *   - < 1 min  → "45s"
 *   - < 1 hour → "15m 30s"
 *   - < 1 day  → "2h 15m"
 *   - ≥ 1 day  → "3d 2h"
 *
 * If end is before start (or equal), returns "0s".
 */
export function fmtDuration(startIso: string, endIso: string): string {
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  const totalSeconds = Math.max(0, Math.floor((endMs - startMs) / 1000));

  if (totalSeconds === 0) return "0s";

  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (minutes > 0) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  return `${seconds}s`;
}
