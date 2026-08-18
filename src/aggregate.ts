import type { Session } from "./types";
import { estimatedCostUsd, totalTokens } from "./pricing";

export interface Totals {
  sessions: number;
  tokens: number;
  costUsd: number;
  messages: number;
}

export function sumSessions(sessions: Session[]): Totals {
  return sessions.reduce<Totals>(
    (acc, s) => ({
      sessions: acc.sessions + 1,
      tokens: acc.tokens + totalTokens(s),
      costUsd: acc.costUsd + estimatedCostUsd(s),
      messages: acc.messages + s.message_count,
    }),
    { sessions: 0, tokens: 0, costUsd: 0, messages: 0 },
  );
}

export function groupBy(sessions: Session[], keyFn: (s: Session) => string): Record<string, Session[]> {
  const out: Record<string, Session[]> = {};
  for (const s of sessions) {
    const key = keyFn(s);
    (out[key] ??= []).push(s);
  }
  return out;
}

export function byDay(sessions: Session[]): { date: string; tokens: number }[] {
  const groups = groupBy(sessions, (s) => s.started_at.slice(0, 10));
  return Object.entries(groups)
    .map(([date, list]) => ({ date, tokens: sumSessions(list).tokens }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
