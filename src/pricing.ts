import type { Session } from "./types";

// ---------------------------------------------------------------------------
// Pricing entry type — used by the Settings Pricing card
// ---------------------------------------------------------------------------

export interface PricingEntry {
  model: string;
  effectiveDate: string; // ISO date
  inputPerMtok: number;
  outputPerMtok: number;
  cacheWrite5mPerMtok: number;
  cacheWrite1hPerMtok: number;
  cacheReadPerMtok: number;
}

// ---------------------------------------------------------------------------
// Full effective-dated pricing table
// Rates are per million tokens ($/Mtok) as published by Anthropic.
// Rows are sorted by model family, then by effectiveDate ascending so that
// the earliest row for each multi-date model gets the "Introductory" badge.
// ---------------------------------------------------------------------------

export const PRICING_TABLE: PricingEntry[] = [
  // --- claude-opus-4 family ---
  {
    model: "claude-opus-4-5",
    effectiveDate: "2025-01-01",
    inputPerMtok: 15,
    outputPerMtok: 75,
    cacheWrite5mPerMtok: 18.75,
    cacheWrite1hPerMtok: 18.75,
    cacheReadPerMtok: 1.5,
  },
  {
    model: "claude-opus-4",
    effectiveDate: "2025-01-01",
    inputPerMtok: 15,
    outputPerMtok: 75,
    cacheWrite5mPerMtok: 18.75,
    cacheWrite1hPerMtok: 18.75,
    cacheReadPerMtok: 1.5,
  },
  // --- claude-3-opus ---
  {
    model: "claude-3-opus",
    effectiveDate: "2024-03-04",
    inputPerMtok: 15,
    outputPerMtok: 75,
    cacheWrite5mPerMtok: 18.75,
    cacheWrite1hPerMtok: 18.75,
    cacheReadPerMtok: 1.5,
  },
  // --- claude-3-7-sonnet (introductory → standard) ---
  {
    model: "claude-3-7-sonnet",
    effectiveDate: "2025-02-24",
    inputPerMtok: 3,
    outputPerMtok: 15,
    cacheWrite5mPerMtok: 3.75,
    cacheWrite1hPerMtok: 3.75,
    cacheReadPerMtok: 0.3,
  },
  // --- claude-sonnet-4-5 / claude-sonnet-4 family ---
  {
    model: "claude-sonnet-4-5",
    effectiveDate: "2025-01-01",
    inputPerMtok: 3,
    outputPerMtok: 15,
    cacheWrite5mPerMtok: 3.75,
    cacheWrite1hPerMtok: 3.75,
    cacheReadPerMtok: 0.3,
  },
  // --- claude-3-5-sonnet ---
  {
    model: "claude-3-5-sonnet",
    effectiveDate: "2024-06-20",
    inputPerMtok: 3,
    outputPerMtok: 15,
    cacheWrite5mPerMtok: 3.75,
    cacheWrite1hPerMtok: 3.75,
    cacheReadPerMtok: 0.3,
  },
  // --- claude-haiku-4-5 ---
  {
    model: "claude-haiku-4-5",
    effectiveDate: "2025-01-01",
    inputPerMtok: 0.8,
    outputPerMtok: 4,
    cacheWrite5mPerMtok: 1,
    cacheWrite1hPerMtok: 1,
    cacheReadPerMtok: 0.08,
  },
  // --- claude-3-5-haiku ---
  {
    model: "claude-3-5-haiku",
    effectiveDate: "2024-11-05",
    inputPerMtok: 0.8,
    outputPerMtok: 4,
    cacheWrite5mPerMtok: 1,
    cacheWrite1hPerMtok: 1,
    cacheReadPerMtok: 0.08,
  },
  // --- claude-3-haiku ---
  {
    model: "claude-3-haiku",
    effectiveDate: "2024-03-07",
    inputPerMtok: 0.25,
    outputPerMtok: 1.25,
    cacheWrite5mPerMtok: 0.3,
    cacheWrite1hPerMtok: 0.3,
    cacheReadPerMtok: 0.03,
  },
];

// ---------------------------------------------------------------------------
// Internal rate lookup — keyed on lowercase model substring
// Five token kinds: input, output, cacheWrite5m, cacheWrite1h, cacheRead
// ---------------------------------------------------------------------------

interface Rate {
  input: number;
  output: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
}

function rateFor(model: string | null): Rate {
  const m = (model ?? "").toLowerCase();

  if (m.includes("opus")) {
    return { input: 15, output: 75, cacheWrite5m: 18.75, cacheWrite1h: 18.75, cacheRead: 1.5 };
  }
  if (m.includes("haiku")) {
    // claude-3-haiku has a lower rate; claude-3-5-haiku and claude-haiku-4-5 share the 0.8 rate
    if (m === "claude-3-haiku" || m.startsWith("claude-3-haiku")) {
      return { input: 0.25, output: 1.25, cacheWrite5m: 0.3, cacheWrite1h: 0.3, cacheRead: 0.03 };
    }
    return { input: 0.8, output: 4, cacheWrite5m: 1, cacheWrite1h: 1, cacheRead: 0.08 };
  }
  // Default: sonnet-class (claude-3-5-sonnet, claude-3-7-sonnet, claude-sonnet-4-5, etc.)
  return { input: 3, output: 15, cacheWrite5m: 3.75, cacheWrite1h: 3.75, cacheRead: 0.3 };
}

// ---------------------------------------------------------------------------
// Model color mapping
// Returns the CSS variable reference (e.g. "var(--series-1)") for a model.
// Series 1–7 are assigned by model family so the same family always gets the
// same color across all charts.
// ---------------------------------------------------------------------------

const MODEL_COLOR_MAP: Array<{ pattern: RegExp; series: number }> = [
  { pattern: /opus/i,                                series: 1 },
  { pattern: /claude-3-5-sonnet|sonnet.*3[-.]5/i,    series: 2 },
  { pattern: /claude-3-7-sonnet|sonnet.*3[-.]7/i,    series: 3 },
  { pattern: /sonnet-4|claude-sonnet-4/i,            series: 4 },
  { pattern: /claude-3-5-haiku|haiku.*3[-.]5/i,      series: 5 },
  { pattern: /haiku-4|claude-haiku-4/i,              series: 6 },
  { pattern: /claude-3-haiku/i,                      series: 7 },
];

export function modelColor(model: string): string {
  for (const { pattern, series } of MODEL_COLOR_MAP) {
    if (pattern.test(model)) {
      return `var(--series-${series})`;
    }
  }
  // Fall back to series-1 for any unknown model
  return "var(--series-1)";
}

// ---------------------------------------------------------------------------
// Existing helpers — unchanged
// Mirrors crates/usage-core/src/pricing.rs — keep the two in sync.
// ---------------------------------------------------------------------------

export function totalTokens(s: Session): number {
  return s.input_tokens + s.output_tokens + s.cache_creation_tokens + s.cache_read_tokens;
}

export function estimatedCostUsd(s: Session): number {
  const r = rateFor(s.model);
  const perMillion = 1_000_000;
  return (
    (s.input_tokens / perMillion) * r.input +
    (s.output_tokens / perMillion) * r.output +
    (s.cache_creation_tokens / perMillion) * r.cacheWrite5m +
    (s.cache_read_tokens / perMillion) * r.cacheRead
  );
}
