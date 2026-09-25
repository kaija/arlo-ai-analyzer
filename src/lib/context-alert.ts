// ---------------------------------------------------------------------------
// Context alert dismissals
//
// The dashboard's "session is at N% of its context window" banner. Dismissing
// it records every session flagged at that moment, so it stays gone across
// remounts and restarts and only comes back for a session that crosses the
// threshold afterwards.
// ---------------------------------------------------------------------------

export const KEY_DISMISSED_CONTEXT_ALERTS = "arlo-dismissed-context-alerts";

/** Enough for any realistic history; oldest ids fall off first. */
const MAX_IDS = 1000;

export function loadDismissedContextAlerts(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY_DISMISSED_CONTEXT_ALERTS);
    if (raw === null) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

/** Adds `ids` to the stored set and returns the new set. */
export function dismissContextAlerts(current: Set<string>, ids: string[]): Set<string> {
  const next = new Set(current);
  for (const id of ids) {
    next.delete(id); // re-insert so it counts as newest
    next.add(id);
  }
  const list = [...next].slice(-MAX_IDS);
  try {
    localStorage.setItem(KEY_DISMISSED_CONTEXT_ALERTS, JSON.stringify(list));
  } catch {
    // ignore — dismissal just won't outlive this page
  }
  return new Set(list);
}
