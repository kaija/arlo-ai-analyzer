import type { Session } from "./types";
import { OPENROUTER_MODELS, getOpenRouterModel } from "./lib/openrouter-pricing";
import { getCatalogModel, indexByBareId } from "./lib/price-catalog";

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

/**
 * Anthropic derives every cache rate from the input rate by a fixed
 * multiplier: 5-minute write = 1.25x, 1-hour write = 2x, read = 0.1x.
 * Deriving beats transcribing five numbers per model — transcription is what
 * made the old table wrong (Opus 1h was priced at the 5m rate).
 */
function rate(inputPerMtok: number, outputPerMtok: number): Rate {
  return {
    inputPerMtok,
    outputPerMtok,
    cacheWrite5mPerMtok: inputPerMtok * 1.25,
    cacheWrite1hPerMtok: inputPerMtok * 2,
    cacheReadPerMtok: inputPerMtok * 0.1,
  };
}

function entry(
  model: string,
  effectiveDate: string,
  inputPerMtok: number,
  outputPerMtok: number,
): PricingEntry {
  return { model, effectiveDate, ...rate(inputPerMtok, outputPerMtok) };
}

/** A documented non-Anthropic rate with explicit cache prices. */
function apiEntry(
  model: string,
  effectiveDate: string,
  inputPerMtok: number,
  outputPerMtok: number,
  cacheReadPerMtok: number,
  cacheWritePerMtok: number,
): PricingEntry {
  return {
    model,
    effectiveDate,
    inputPerMtok,
    outputPerMtok,
    cacheWrite5mPerMtok: cacheWritePerMtok,
    // OpenAI documents one cache-write price rather than Anthropic's two TTL
    // tiers, so both stored fields use that documented price.
    cacheWrite1hPerMtok: cacheWritePerMtok,
    cacheReadPerMtok,
  };
}

// ---------------------------------------------------------------------------
// Pricing table — current rates for models observed in supported transcripts.
// Rates are per million tokens ($/Mtok), from their first-party price sheets.
// `effectiveDate` is the model release date where known, otherwise the date
// its current official rate was verified; it is shown in Settings but is not
// yet used for historical lookup (see the note on rateFor below).
// ---------------------------------------------------------------------------

const OBSERVED_NON_ANTHROPIC_PRICING: PricingEntry[] = [
  // Verified 2026-09-17 against official provider pricing. See
  // notes/research/2026-09-17-observed-model-pricing.md for sources/caveats.
  apiEntry("gpt-5.5", "2026-09-17", 5, 30, 0.5, 0),
  apiEntry("gpt-5.6-luna", "2026-09-17", 0.2, 1.2, 0.02, 0.25),
  apiEntry("gpt-5.6-terra", "2026-09-17", 2, 12, 0.2, 2.5),
  apiEntry("gpt-5.6-sol", "2026-09-17", 4, 20, 0.4, 5),
  apiEntry("gpt-6-astra", "2026-09-17", 10, 50, 1, 12.5),
  // Verified 2026-09-23 against OpenAI's GPT-6 Sol / Luna model pages.
  apiEntry("gpt-6-sol", "2026-09-23", 2, 10, 0.2, 2.5),
  apiEntry("gpt-6-luna", "2026-09-23", 0.1, 0.5, 0.01, 0.125),
  // Official Codex/Work alias for GPT-5.4, not a standalone API SKU.
  apiEntry("codex-auto-review", "2026-09-17", 2.5, 15, 0.25, 0),
  // This bare family ID is free only for the Gemini API/local interpretation;
  // do not generalise this to a paid third-party Gemma endpoint.
  apiEntry("gemma-4", "2026-09-17", 0, 0, 0, 0),
];

/** An Anthropic rate whose cache read doesn't follow the 0.1x rule. */
function entryWithCacheRead(
  model: string,
  effectiveDate: string,
  inputPerMtok: number,
  outputPerMtok: number,
  cacheReadPerMtok: number,
): PricingEntry {
  return { ...entry(model, effectiveDate, inputPerMtok, outputPerMtok), cacheReadPerMtok };
}

export const PRICING_TABLE: PricingEntry[] = [
  // --- Fable / Mythos tier ---
  // Rates for Fable 5.1 and Opus 5.5 verified 2026-09-23 against Anthropic's published pricing.
  entryWithCacheRead("claude-fable-5-1", "2026-09-23", 10, 50, 0.25),
  entry("claude-fable-5", "2026-05-19", 10, 50),
  // --- Opus 5.5 ($4/$20) ---
  entryWithCacheRead("claude-opus-5-5", "2026-09-23", 4, 20, 0.2),
  // --- Opus: current tier ($5/$25 since Opus 4.5) ---
  entry("claude-opus-5", "2026-06-24", 5, 25),
  entry("claude-opus-4-8", "2026-04-22", 5, 25),
  entry("claude-opus-4-7", "2026-02-10", 5, 25),
  entry("claude-opus-4-6", "2025-12-16", 5, 25),
  entry("claude-opus-4-5", "2025-11-24", 5, 25),
  // --- Opus: legacy tier ($15/$75) ---
  entry("claude-opus-4-1", "2025-08-05", 15, 75),
  entry("claude-opus-4", "2025-05-22", 15, 75),
  entry("claude-3-opus", "2024-03-04", 15, 75),
  // --- Sonnet (every generation has shipped at $3/$15) ---
  entry("claude-sonnet-5", "2026-05-05", 3, 15),
  entry("claude-sonnet-4-6", "2025-11-24", 3, 15),
  entry("claude-sonnet-4-5", "2025-09-29", 3, 15),
  entry("claude-3-7-sonnet", "2025-02-24", 3, 15),
  entry("claude-3-5-sonnet", "2024-06-20", 3, 15),
  // --- Haiku ---
  entry("claude-haiku-4-5", "2025-10-15", 1, 5),
  entry("claude-3-5-haiku", "2024-11-05", 0.8, 4),
  entry("claude-3-haiku", "2024-03-07", 0.25, 1.25),
  ...OBSERVED_NON_ANTHROPIC_PRICING,
];

// ---------------------------------------------------------------------------
// Rate lookup
//
// Family-keyword matching, mirroring crates/usage-core/src/pricing.rs. Model
// ids arrive in several shapes — "claude-opus-5", "claude-opus-4-8", and
// reversed vendor forms like "claude-5-sonnet-anthropic" — so we match on the
// family keyword rather than on exact slugs.
//
// Exact, first-party documented non-Anthropic IDs come first, then Anthropic
// family matching. Anything else falls back to the downloaded price catalog
// (lib/price-catalog.ts), then the bundled OpenRouter snapshot, then remains
// "rate unknown"; charging an unknown model at a guessed rate produces
// confident wrong numbers, which is worse.
//
// ponytail: rates are current-only, not effective-dated. Known gap: Claude
// Sonnet 5 bills at an introductory $2/$10 through 2026-08-31, so Sonnet 5
// spend before that date reads ~33% high. Add date-effective lookup here and
// in pricing.rs when the introductory windows matter.
// ---------------------------------------------------------------------------

export type Rate = Omit<PricingEntry, "model" | "effectiveDate">;

const DOCUMENTED_NON_ANTHROPIC_RATES = new Map(
  OBSERVED_NON_ANTHROPIC_PRICING.map(({ model, effectiveDate: _effectiveDate, ...rate }) => [model, rate]),
);

/** Models that predate the Opus price drop and still bill at $15/$75. */
const LEGACY_OPUS = [
  "claude-3-opus",
  "claude-opus-4-0",
  "claude-opus-4-1",
  "claude-opus-4.1",
  "opus-4-1",
];

/**
 * Bedrock-style ids put the vendor, optionally after a region, in front of
 * the model: "openai.gpt-5.6-terra", "us.anthropic.claude-…". Mirrors
 * `strip_vendor_prefix` in pricing.rs.
 */
const VENDOR_PREFIX =
  /^(?:(?:us|eu|apac|jp|au|global)\.)?(?:openai|anthropic|google|meta|mistral|deepseek|qwen|nvidia|amazon|cohere|moonshotai|minimax)\./;

export function rateFor(model: string | null): Rate | null {
  const raw = (model ?? "").toLowerCase();
  const m = raw.replace(/:batch$/, "").replace(/:free$/, "").replace(VENDOR_PREFIX, "");

  const documentedRate = DOCUMENTED_NON_ANTHROPIC_RATES.get(m);
  if (documentedRate) return documentedRate;

  // Placeholder Claude Code uses for locally generated messages; always zero
  // tokens, never billed.
  if (m === "<synthetic>") return null;

  // Newer generations break the 0.1x cache-read rule, so they're matched by
  // version before their family (mirrors pricing.rs). Mythos 5.1 stays on the
  // family rate: its cache-read price is unannounced.
  if (m.includes("fable-5-1") || m.includes("fable-5.1")) return { ...rate(10, 50), cacheReadPerMtok: 0.25 };
  if (m.includes("opus-5-5") || m.includes("opus-5.5")) return { ...rate(4, 20), cacheReadPerMtok: 0.2 };

  if (m.includes("fable") || m.includes("mythos")) return rate(10, 50);

  if (m.includes("opus")) {
    const legacy = LEGACY_OPUS.some((slug) => m.includes(slug)) || m === "claude-opus-4";
    return legacy ? rate(15, 75) : rate(5, 25);
  }

  if (m.includes("haiku")) {
    if (m.includes("claude-3-haiku")) return rate(0.25, 1.25);
    if (m.includes("3-5-haiku") || m.includes("3.5-haiku")) return rate(0.8, 4);
    return rate(1, 5); // Haiku 4.5 and later
  }

  // Must come after haiku: "claude-3-5-haiku" also contains "claude-3-5".
  if (m.includes("sonnet") || m.includes("claude-3-5") || m.includes("claude-3-7")) {
    return rate(3, 15);
  }

  return openRouterRate(m);
}

/**
 * Fallback rates for non-Anthropic models: the downloaded catalog first, then
 * the snapshot bundled with the app. Both are OpenRouter's list, keyed by its
 * namespaced ids.
 *
 * Tools log bare model ids ("gpt-5.6-terra", "gemini-3.6-flash"); OpenRouter
 * namespaces them ("openai/…", "google/…"). A bare id resolves under
 * `openai/` first, then under whichever single vendor lists it. Exact,
 * official rates take priority in `rateFor`; anything that matches none
 * remains unknown.
 */
const BUNDLED_BY_BARE_ID = indexByBareId(OPENROUTER_MODELS.map((m) => [m.id, m] as const));

function openRouterRate(model: string): Rate | null {
  const downloaded = getCatalogModel(model);
  if (downloaded) {
    return {
      inputPerMtok: downloaded.inputPerMtok,
      outputPerMtok: downloaded.outputPerMtok,
      cacheWrite5mPerMtok: downloaded.cacheWritePerMtok,
      cacheWrite1hPerMtok: downloaded.cacheWrite1hPerMtok || downloaded.cacheWritePerMtok,
      cacheReadPerMtok: downloaded.cacheReadPerMtok,
    };
  }

  const entry =
    getOpenRouterModel(model) ?? getOpenRouterModel(`openai/${model}`) ?? BUNDLED_BY_BARE_ID.get(model);
  if (!entry) return null;
  // OpenRouter uses negative sentinel values (e.g. -1_000_000) for router
  // models like "openrouter/auto" where pricing is dynamic and unknown at
  // query time. Treat any negative input rate as unpriced rather than
  // producing a nonsensical negative cost.
  if (entry.promptPerMtok < 0 || entry.completionPerMtok < 0) return null;
  return {
    inputPerMtok: entry.promptPerMtok,
    outputPerMtok: entry.completionPerMtok,
    cacheWrite5mPerMtok: entry.cacheWritePerMtok,
    // OpenAI has no 1-hour cache tier; fall back to the single write rate so
    // the session-level estimate (which charges cache writes at 1h) doesn't
    // silently bill them at zero.
    cacheWrite1hPerMtok: entry.cacheWrite1hPerMtok || entry.cacheWritePerMtok,
    cacheReadPerMtok: entry.cacheReadPerMtok,
  };
}

/** True when we have a real rate for this model. */
export function isModelPriced(model: string | null): boolean {
  if (!model) return true; // null model → nothing to warn about
  // Claude Code's placeholder for locally generated messages: never billed,
  // so there is no price to be missing.
  if (model === "<synthetic>") return true;
  return rateFor(model) !== null;
}

/**
 * Estimate the cost in USD for a single API request.
 *
 * Cache writes must be passed split by TTL tier — the two rates differ by
 * 1.6x and real transcripts are a ~22/78 mix, so collapsing them is not a
 * rounding error. Returns null when the model has no known rate.
 */
export function estimateRequestCost(
  model: string | null,
  inputTokens: number,
  outputTokens: number,
  cacheWrite5m: number,
  cacheWrite1h: number,
  cacheRead: number,
): number | null {
  const r = rateFor(model);
  if (!r) return null;
  const M = 1_000_000;
  return (
    (inputTokens / M) * r.inputPerMtok +
    (outputTokens / M) * r.outputPerMtok +
    (cacheWrite5m / M) * r.cacheWrite5mPerMtok +
    (cacheWrite1h / M) * r.cacheWrite1hPerMtok +
    (cacheRead / M) * r.cacheReadPerMtok
  );
}

// ---------------------------------------------------------------------------
// Context windows
//
// Only the models below ship a 1M-token window; everything else — including
// Haiku 4.5 and every Claude 3.x / 4.0-4.5 model — is 200K. The default is
// deliberately the smaller one: under-stating the ceiling shows a fuller bar,
// and a false context alarm is a better failure than a missed one.
// ---------------------------------------------------------------------------

const LONG_CONTEXT_MODELS = [
  "fable",
  "mythos",
  "opus-5", // also matches opus-5-5 / opus-5.5
  "opus-4-8",
  "opus-4.8",
  "opus-4-7",
  "opus-4.7",
  "opus-4-6",
  "opus-4.6",
  "sonnet-5",
  "sonnet-4-6",
  "sonnet-4.6",
];

export const DEFAULT_CONTEXT_WINDOW = 200_000;
export const LONG_CONTEXT_WINDOW = 1_000_000;
/**
 * What Codex reports as `model_context_window` in every rollout it writes.
 * ponytail: hardcoded because the window is per-request data the backend
 * doesn't keep — read it off the session if a second value ever shows up.
 * Without it, gpt sessions measure against 200K and report >100% full.
 */
export const CODEX_CONTEXT_WINDOW = 258_400;

/** Context-window size in tokens for a model id. */
export function contextWindow(model: string | null): number {
  const m = (model ?? "").toLowerCase();
  if (LONG_CONTEXT_MODELS.some((slug) => m.includes(slug))) return LONG_CONTEXT_WINDOW;
  if (m.startsWith("gpt-") || m.startsWith("openai/")) return CODEX_CONTEXT_WINDOW;
  return DEFAULT_CONTEXT_WINDOW;
}

// ---------------------------------------------------------------------------
// Model color mapping
// Returns the CSS variable reference (e.g. "var(--series-1)") for a model.
// Series 1–12 are assigned by model family so the same family always gets the
// same color across all charts.
// ---------------------------------------------------------------------------

// The series tokens in tokens.css name the model each colour belongs to; this
// map must agree with them. It previously stopped at the 4.x generation, so
// claude-sonnet-5, claude-fable-5 and every unknown model fell through to the
// series-1 fallback — the same blue as Opus, which is why a mixed-model chart
// came out one colour. Specific generations are matched before family.
const MODEL_COLOR_MAP: Array<{ pattern: RegExp; series: number }> = [
  // A GPT tier keeps its colour across generations (GPT-6 Sol = GPT-5.6 Sol).
  { pattern: /gpt-6-sol|gpt-5[.]6-sol/i,         series: 9 },
  { pattern: /gpt-6-luna|gpt-5[.]6-luna/i,       series: 11 },
  { pattern: /gpt-6|astra/i,                     series: 8 },
  { pattern: /gpt-5[.]6-terra/i,                 series: 10 },
  { pattern: /gpt-5[.]5/i,                       series: 12 },
  { pattern: /fable|mythos/i,                    series: 3 },
  { pattern: /opus-5|opus-4[-.]6|opus-4[-.]7/i,  series: 1 },
  { pattern: /opus-4[-.]8/i,                     series: 4 },
  { pattern: /opus/i,                            series: 1 },
  { pattern: /sonnet-4[-.]6|4[-.]6-sonnet/i,     series: 6 },
  { pattern: /sonnet-5|claude-5-sonnet/i,        series: 2 },
  { pattern: /claude-3-5-sonnet|sonnet.*3[-.]5/i, series: 7 },
  { pattern: /claude-3-7-sonnet|sonnet.*3[-.]7/i, series: 4 },
  { pattern: /sonnet/i,                          series: 2 },
  { pattern: /haiku-4|4[-.]5-haiku|claude-haiku-4/i, series: 5 },
  { pattern: /haiku/i,                           series: 5 },
];

export function modelColor(model: string): string {
  for (const { pattern, series } of MODEL_COLOR_MAP) {
    if (pattern.test(model)) {
      return `var(--series-${series})`;
    }
  }
  // Keep unrecognised models categorical too. A stable hash preserves the
  // colour between views without collapsing every new model into one grey.
  let hash = 2166136261;
  for (let i = 0; i < model.length; i++) {
    hash ^= model.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const fallbackSeries = [8, 9, 10, 11, 12];
  return `var(--series-${fallbackSeries[(hash >>> 0) % fallbackSeries.length]})`;
}

// ---------------------------------------------------------------------------
// Session-level helpers
// ---------------------------------------------------------------------------

export function totalTokens(s: Session): number {
  return s.input_tokens + s.output_tokens + s.cache_creation_tokens + s.cache_read_tokens;
}

/**
 * Returns the cost in USD for a session.
 *
 * Prefers `cost_usd` when it is > 0 (set by the Rust backend from per-request
 * accumulation). Falls back to a single-rate front-end estimate for sessions
 * where the backend hasn't populated the field (e.g. legacy data, non-Claude
 * sources). The fallback uses the 1-hour cache-write tier for
 * `cache_creation_tokens` to stay consistent with the backend.
 */
export function estimatedCostUsd(s: Session): number {
  if (s.cost_usd > 0) {
    return s.cost_usd;
  }
  // Fallback for sources that don't compute per-request cost. The 5m/1h split
  // isn't retained at session level, so all cache creation is charged at the
  // 1h tier. Unpriced models contribute 0 — `isModelPriced` drives the
  // "cost estimates may be inaccurate" warning so a 0 is never silent.
  return (
    estimateRequestCost(
      s.model,
      s.input_tokens,
      s.output_tokens,
      0,
      s.cache_creation_tokens,
      s.cache_read_tokens,
    ) ?? 0
  );
}
