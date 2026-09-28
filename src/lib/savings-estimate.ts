import { rateFor } from "../pricing";
import type { Session, ToolKind } from "../types";

export interface InputSavingsRate {
  model: string;
  /** USD per million input tokens, weighted by the selected model's observed cache usage. */
  usdPerMillion: number;
}

/** A rough unit price for repeated context, based on the period's busiest model. */
export function estimateInputSavingsRate(
  sessions: Session[], tool: ToolKind, days: number | null, now: Date,
): InputSavingsRate | null {
  const since = days === null ? -Infinity : now.getTime() - days * 86_400_000;
  const byModel = new Map<string, { weight: number; sessions: Session[] }>();
  for (const session of sessions) {
    if (session.tool !== tool || Date.parse(session.started_at) < since) continue;
    const model = session.peak_context_model ?? session.model;
    if (!model) continue;
    const group = byModel.get(model) ?? { weight: 0, sessions: [] };
    group.weight += Math.max(session.message_count, 1);
    group.sessions.push(session);
    byModel.set(model, group);
  }
  const [model, group] = [...byModel].sort((a, b) => b[1].weight - a[1].weight)[0] ?? [];
  if (!model || !group) return null;
  const rate = rateFor(model);
  if (!rate) return null;

  let tokens = 0;
  let dollarsPerMillionWeighted = 0;
  for (const session of group.sessions) {
    const input = session.input_tokens;
    const write5m = session.cache_write_5m;
    const write1h = session.cache_write_1h
      + Math.max(0, session.cache_creation_tokens - write5m - session.cache_write_1h);
    const read = session.cache_read_tokens;
    tokens += input + write5m + write1h + read;
    dollarsPerMillionWeighted += input * rate.inputPerMtok
      + write5m * rate.cacheWrite5mPerMtok
      + write1h * rate.cacheWrite1hPerMtok
      + read * rate.cacheReadPerMtok;
  }
  if (tokens === 0) return null;
  return { model, usdPerMillion: dollarsPerMillionWeighted / tokens };
}
