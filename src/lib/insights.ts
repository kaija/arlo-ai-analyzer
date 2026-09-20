import type { Session, StopReason, ContextHealthRow, SkillRow } from "../types";
import { contextWindow, estimatedCostUsd } from "../pricing";
import { localDateKey } from "./aggregate";

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

/**
 * Returns the fraction of "read" cache hits over all token input traffic.
 * Formula: totalCacheRead / (totalInput + totalCacheRead)
 * Returns 0 when denominator is 0.
 *
 * Validates: Requirements 6.4
 */
export function cacheHitRate(sessions: Session[]): number {
  let totalInput = 0;
  let totalCacheRead = 0;

  for (const s of sessions) {
    totalInput += s.input_tokens;
    totalCacheRead += s.cache_read_tokens;
  }

  const denominator = totalInput + totalCacheRead;
  return denominator === 0 ? 0 : totalCacheRead / denominator;
}

/**
 * Returns the total cache-write tokens split by TTL tier. The two tiers are
 * priced 1.6x apart, so the split is what makes the cache-efficiency card
 * actionable rather than decorative.
 *
 * Validates: Requirements 6.5
 */
export function cacheWriteSplit(sessions: Session[]): { write5m: number; write1h: number } {
  let write5m = 0;
  let write1h = 0;
  for (const s of sessions) {
    write5m += s.cache_write_5m;
    write1h += s.cache_write_1h;
  }
  return { write5m, write1h };
}

// ---------------------------------------------------------------------------
// Skills / MCP attribution
// ---------------------------------------------------------------------------

/**
 * Returns the top skills (tools/models) ranked by request count descending.
 * Uses the session's model field as a proxy for "skill" until per-request
 * skill attribution is available from the backend.
 *
 * Validates: Requirements 6.6, 6.7, 6.8
 * TODO: needs backend — replace model proxy with real skill attribution
 */
export function topSkillsByRequests(sessions: Session[]): SkillRow[] {
  const counts = new Map<string, number>();

  for (const s of sessions) {
    const skill = s.model ?? "unknown"; // TODO: needs backend — use per-request skill
    counts.set(skill, (counts.get(skill) ?? 0) + s.message_count);
  }

  return Array.from(counts.entries())
    .map(([skill, requests]) => ({ skill, requests }))
    .sort((a, b) => b.requests - a.requests);
}

// ---------------------------------------------------------------------------
// Rightsizing
// ---------------------------------------------------------------------------

/**
 * Counts sessions whose output_tokens is below outputThreshold.
 * These are candidates for a cheaper / smaller model.
 *
 * Validates: Requirements 6.9
 */
export function rightsizingCount(sessions: Session[], outputThreshold: number): number {
  return sessions.filter((s) => s.output_tokens < outputThreshold).length;
}

/**
 * Estimates the USD savings if each rightsized session had used a 50%-cheaper model.
 * Formula: sum(estimatedCostUsd(s) * 0.5) for sessions where output_tokens < outputThreshold
 *
 * Validates: Requirements 6.10
 */
export function rightsizingSavingsUsd(sessions: Session[], outputThreshold: number): number {
  return sessions
    .filter((s) => s.output_tokens < outputThreshold)
    .reduce((acc, s) => acc + estimatedCostUsd(s) * 0.5, 0);
}

// ---------------------------------------------------------------------------
// Budget / spend
// ---------------------------------------------------------------------------

/** Returns the ISO date string (YYYY-MM) for the current calendar month. */
function currentYearMonth(): string {
  return localDateKey(new Date()).slice(0, 7);
}

/**
 * Sum of estimated cost for all sessions whose started_at falls within the
 * current calendar month (YYYY-MM prefix match).
 *
 * Validates: Requirements 6.11, 6.12
 */
export function monthToDateSpend(sessions: Session[]): number {
  const month = currentYearMonth();
  return sessions
    .filter((s) => localDateKey(s.started_at).slice(0, 7) === month)
    .reduce((acc, s) => acc + estimatedCostUsd(s), 0);
}

/**
 * Average daily spend over the last 7 calendar days (today included).
 * Days with no sessions contribute $0 to the average.
 *
 * Validates: Requirements 6.12
 */
export function sevenDayBurnRate(sessions: Session[]): number {
  const today = new Date();
  // Build the last seven user-local calendar dates.
  const cutoffDate = new Date(today);
  cutoffDate.setDate(today.getDate() - 6); // 6 days ago → 7 days total including today
  const cutoffStr = localDateKey(cutoffDate);

  const recentSessions = sessions.filter((s) => localDateKey(s.started_at) >= cutoffStr);
  const totalSpend = recentSessions.reduce((acc, s) => acc + estimatedCostUsd(s), 0);
  return totalSpend / 7;
}

/**
 * Projects the full month-end spend:
 *   monthToDateSpend + sevenDayBurnRate * remainingDaysInMonth
 *
 * Validates: Requirements 6.13
 */
export function projectedMonthEndSpend(sessions: Session[]): number {
  const today = new Date();
  // Last day of the current month
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const remainingDays = lastDay - today.getDate();

  return monthToDateSpend(sessions) + sevenDayBurnRate(sessions) * remainingDays;
}

// ---------------------------------------------------------------------------
// Stop reasons
// ---------------------------------------------------------------------------

/**
 * Returns per-stop-reason session counts.
 * Stub: backend does not yet expose per-session stop reasons, so all sessions
 * are bucketed into end_turn.
 *
 * Validates: Requirements 6.14, 6.15
 * TODO: needs backend — replace stub with real stop_reason field per session
 */
export function stopReasonBreakdown(sessions: Session[]): Record<StopReason, number> {
  return {
    end_turn: sessions.length, // TODO: needs backend
    tool_use: 0,               // TODO: needs backend
    max_tokens: 0,             // TODO: needs backend
    stop_sequence: 0,          // TODO: needs backend
    refusal: 0,                // TODO: needs backend
    other: 0,                  // TODO: needs backend
  };
}

/**
 * Count of sessions that hit max_tokens stop reason.
 * Stub: returns 0 until the backend exposes per-session stop reason.
 *
 * Validates: Requirements 6.14
 * TODO: needs backend — use real stop_reason field
 */
export function maxTokensCount(_sessions: Session[]): number {
  return 0; // TODO: needs backend
}

// ---------------------------------------------------------------------------
// Context health
// ---------------------------------------------------------------------------

/**
 * Returns sessions whose context fill exceeds the given threshold, as:
 *   peak_context_tokens / contextWindow(peak_context_model) * 100
 *
 * Both halves used to be wrong: the numerator summed every request's tokens
 * (cumulative traffic, so a long session read as thousands of percent) and the
 * denominator was hard-coded to 200K even for 1M-window models. The window
 * comes from the model that carried the peak request, not the session's first
 * turn — that one is often a 200K-window Haiku title call.
 *
 * Results are sorted by contextPct descending.
 *
 * Validates: Requirements 6.1, 6.2, 6.3
 */
export function contextHealthSessions(
  sessions: Session[],
  threshold: number,
): ContextHealthRow[] {
  return sessions
    .map((s) => {
      const contextPct =
        (s.peak_context_tokens /
          contextWindow(s.peak_context_model ?? s.model)) *
        100;
      return {
        sessionId: s.session_id,
        sessionName: s.project || s.session_id,
        contextPct,
        tokens: s.peak_context_tokens,
      } satisfies ContextHealthRow;
    })
    .filter((row) => row.contextPct > threshold)
    .sort((a, b) => b.contextPct - a.contextPct);
}
