import type { Session } from "./types";

// Mirrors crates/usage-core/src/pricing.rs — keep the two in sync.
function rateFor(model: string | null) {
  const m = model ?? "";
  if (m.includes("opus")) return { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 };
  if (m.includes("haiku")) return { input: 0.8, output: 4, cacheWrite: 1, cacheRead: 0.08 };
  return { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 };
}

export function totalTokens(s: Session): number {
  return s.input_tokens + s.output_tokens + s.cache_creation_tokens + s.cache_read_tokens;
}

export function estimatedCostUsd(s: Session): number {
  const r = rateFor(s.model);
  const perMillion = 1_000_000;
  return (
    (s.input_tokens / perMillion) * r.input +
    (s.output_tokens / perMillion) * r.output +
    (s.cache_creation_tokens / perMillion) * r.cacheWrite +
    (s.cache_read_tokens / perMillion) * r.cacheRead
  );
}
