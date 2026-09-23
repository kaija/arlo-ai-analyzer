#!/usr/bin/env node
/**
 * Fetches the current model list from the OpenRouter API and regenerates
 * src/lib/openrouter-pricing.ts (the snapshot bundled with the app) and/or
 * the trimmed `models.json` catalog published on GitHub Pages, which the app
 * downloads once a day (src-tauri/src/catalog.rs).
 *
 * Usage:
 *   node --experimental-strip-types scripts/fetch-openrouter-pricing.ts
 *   # bundled snapshot plus the published catalog:
 *   node --experimental-strip-types scripts/fetch-openrouter-pricing.ts --json _site/models.json
 *   # published catalog only (CI):
 *   node --experimental-strip-types scripts/fetch-openrouter-pricing.ts --json _site/models.json --no-ts
 *   # or via Makefile:
 *   make update-openrouter-pricing
 *
 * Exits non-zero, writing nothing, when the response looks broken (fewer than
 * MIN_MODELS models or a non-finite rate) — CI must not publish a bad list.
 *
 * The OPENROUTER_API_KEY environment variable is optional — the public
 * /models endpoint does not require authentication.
 */

import { mkdirSync, writeFileSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, "../src/lib/openrouter-pricing.ts");

const args = process.argv.slice(2);
const jsonFlag = args.indexOf("--json");
const JSON_PATH = jsonFlag >= 0 ? args[jsonFlag + 1] : null;
if (jsonFlag >= 0 && !JSON_PATH) {
  console.error("--json needs an output path");
  process.exit(1);
}
const WRITE_TS = !args.includes("--no-ts");

/** Must match MIN_MODELS in src-tauri/src/catalog.rs. */
const MIN_MODELS = 50;
/** Must match SCHEMA_VERSION in src-tauri/src/catalog.rs. */
const SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

const headers: Record<string, string> = {
  "Content-Type": "application/json",
};
if (process.env.OPENROUTER_API_KEY) {
  headers["Authorization"] = `Bearer ${process.env.OPENROUTER_API_KEY}`;
}

const res = await fetch("https://openrouter.ai/api/v1/models", { headers });
if (!res.ok) {
  console.error(`OpenRouter API returned ${res.status}: ${res.statusText}`);
  process.exit(1);
}

interface ApiModel {
  id: string;
  name: string;
  context_length: number;
  top_provider?: { max_completion_tokens?: number };
  architecture?: { modality?: string; input_modalities?: string[] };
  pricing?: {
    prompt?: string;
    completion?: string;
    image?: string;
    request?: string;
    web_search?: string;
    input_cache_read?: string;
    input_cache_write?: string;
    /** Anthropic 1-hour cache write tier */
    input_cache_write_1h?: string;
  };
}

const { data: models }: { data: ApiModel[] } = await res.json();

// ---------------------------------------------------------------------------
// Transform
// ---------------------------------------------------------------------------

function toFloat(s: string | undefined): number {
  const n = parseFloat(s ?? "0");
  return Number.isFinite(n) ? n : 0;
}

/** Convert OpenRouter's per-token price string to USD per million tokens.
 *
 * Multiplying a tiny float by 1e6 can produce rounding dust
 * (e.g. 0.0000002 × 1e6 = 0.19999999999999998). Round to 10 significant
 * figures, which preserves all meaningful precision while eliminating the
 * IEEE-754 noise that would cause exact-equality test failures.
 */
function perMtok(s: string | undefined): number {
  const raw = toFloat(s) * 1_000_000;
  // parseFloat(toPrecision) strips trailing dust without altering real digits.
  return parseFloat(raw.toPrecision(10));
}

interface OutModel {
  id: string;
  name: string;
  contextLength: number;
  maxCompletionTokens: number | null;
  modality: string;
  inputModalities: string[];
  promptPerMtok: number;
  completionPerMtok: number;
  cacheReadPerMtok: number;
  cacheWritePerMtok: number;
  cacheWrite1hPerMtok: number;
  imagePerMtok: number;
  webSearchPerCall: number;
}

const out: OutModel[] = [];

for (const m of models) {
  const promptPerMtok = perMtok(m.pricing?.prompt);
  const completionPerMtok = perMtok(m.pricing?.completion);

  // OpenRouter uses large negative sentinel values (e.g. -1_000_000 $/Mtok)
  // for router models like "openrouter/auto" where pricing is dynamic and
  // unknown at query time. Emitting them into the table causes
  // estimatedCostUsd() to produce multi-million-dollar negative costs for any
  // session that used such a model. Skip them entirely — they will fall
  // through as "unpriced" in rateFor(), which is the correct behaviour.
  if (promptPerMtok < 0 || completionPerMtok < 0) {
    continue;
  }

  out.push({
    id: m.id,
    name: m.name,
    contextLength: m.context_length ?? 0,
    maxCompletionTokens: m.top_provider?.max_completion_tokens ?? null,
    modality: m.architecture?.modality ?? "text->text",
    inputModalities: m.architecture?.input_modalities ?? ["text"],
    promptPerMtok,
    completionPerMtok,
    cacheReadPerMtok: perMtok(m.pricing?.input_cache_read),
    cacheWritePerMtok: perMtok(m.pricing?.input_cache_write),
    cacheWrite1hPerMtok: perMtok(m.pricing?.input_cache_write_1h),
    imagePerMtok: perMtok(m.pricing?.image),
    webSearchPerCall: toFloat(m.pricing?.web_search),
  });
}

// ---------------------------------------------------------------------------
// Validate — the app applies the same checks before trusting a download
// ---------------------------------------------------------------------------

if (out.length < MIN_MODELS) {
  console.error(`Only ${out.length} models in the OpenRouter response (need ${MIN_MODELS}); refusing to write.`);
  process.exit(1);
}
for (const m of out) {
  const rates = [m.promptPerMtok, m.completionPerMtok, m.cacheReadPerMtok, m.cacheWritePerMtok, m.cacheWrite1hPerMtok];
  if (rates.some((r) => !Number.isFinite(r) || r < 0)) {
    console.error(`Invalid rate for ${m.id}; refusing to write.`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Emit models.json — the published catalog (format read by catalog.rs)
// ---------------------------------------------------------------------------

if (JSON_PATH) {
  const catalog = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    source: "https://openrouter.ai/api/v1/models",
    models: Object.fromEntries(
      [...out]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((m) => [
          m.id,
          {
            name: m.name,
            contextLength: m.contextLength,
            inputPerMtok: m.promptPerMtok,
            outputPerMtok: m.completionPerMtok,
            cacheReadPerMtok: m.cacheReadPerMtok,
            cacheWritePerMtok: m.cacheWritePerMtok,
            cacheWrite1hPerMtok: m.cacheWrite1hPerMtok,
          },
        ]),
    ),
  };
  const path = resolve(JSON_PATH);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(catalog), "utf8");
  console.log(`Written ${out.length} models to ${path}`);
}

if (!WRITE_TS) process.exit(0);

// ---------------------------------------------------------------------------
// Emit src/lib/openrouter-pricing.ts — the snapshot bundled with the app
// ---------------------------------------------------------------------------

const today = new Date().toISOString().slice(0, 10);

const lines: string[] = [
  "// AUTO-GENERATED — do not edit by hand.",
  "// Source: https://openrouter.ai/api/v1/models",
  `// Fetched: ${today}`,
  `// Total models: ${out.length}`,
  "//",
  "// Rates are USD per million tokens ($/Mtok).",
  "// webSearchPerCall is USD per call (not per token).",
  "// Router models with negative sentinel rates (openrouter/auto etc.) are",
  "// intentionally excluded — they are unpriced, not free.",
  "",
  "export interface OpenRouterModel {",
  "  id: string;",
  "  name: string;",
  "  contextLength: number;",
  "  maxCompletionTokens: number | null;",
  "  modality: string;",
  "  inputModalities: string[];",
  "  /** USD per million input tokens */",
  "  promptPerMtok: number;",
  "  /** USD per million output tokens */",
  "  completionPerMtok: number;",
  "  /** USD per million cached-read tokens */",
  "  cacheReadPerMtok: number;",
  "  /** USD per million cache-write tokens (5 min TTL) */",
  "  cacheWritePerMtok: number;",
  "  /** USD per million cache-write tokens (1 h TTL, Anthropic only) */",
  "  cacheWrite1hPerMtok: number;",
  "  /** USD per million image input tokens (vision models) */",
  "  imagePerMtok: number;",
  "  /** USD per web-search call (some Google/Perplexity models) */",
  "  webSearchPerCall: number;",
  "}",
  "",
  "export const OPENROUTER_MODELS: OpenRouterModel[] = [",
];

for (const m of out) {
  lines.push("  {");
  lines.push(`    id: ${JSON.stringify(m.id)},`);
  lines.push(`    name: ${JSON.stringify(m.name)},`);
  lines.push(`    contextLength: ${m.contextLength},`);
  lines.push(`    maxCompletionTokens: ${m.maxCompletionTokens === null ? "null" : m.maxCompletionTokens},`);
  lines.push(`    modality: ${JSON.stringify(m.modality)},`);
  lines.push(`    inputModalities: ${JSON.stringify(m.inputModalities)},`);
  lines.push(`    promptPerMtok: ${m.promptPerMtok},`);
  lines.push(`    completionPerMtok: ${m.completionPerMtok},`);
  lines.push(`    cacheReadPerMtok: ${m.cacheReadPerMtok},`);
  lines.push(`    cacheWritePerMtok: ${m.cacheWritePerMtok},`);
  lines.push(`    cacheWrite1hPerMtok: ${m.cacheWrite1hPerMtok},`);
  lines.push(`    imagePerMtok: ${m.imagePerMtok},`);
  lines.push(`    webSearchPerCall: ${m.webSearchPerCall},`);
  lines.push("  },");
}

lines.push("];");
lines.push("");

// Lookup helper — keep in sync with the interface above
lines.push(
  "export function getOpenRouterModel(id: string): OpenRouterModel | undefined {",
  "  return OPENROUTER_MODELS.find((m) => m.id === id);",
  "}",
  "/**",
  " * Find models by fuzzy substring match on id or name.",
  " * Returns all matches sorted by relevance (exact id first).",
  " */",
  "export function searchOpenRouterModels(query: string): OpenRouterModel[] {",
  "  const q = query.toLowerCase();",
  "  return OPENROUTER_MODELS.filter(",
  "    (m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q),",
  "  ).sort((a, b) => {",
  "    const aExact = a.id === query ? 0 : 1;",
  "    const bExact = b.id === query ? 0 : 1;",
  "    return aExact - bExact;",
  "  });",
  "}",
  "",
);

writeFileSync(OUT_PATH, lines.join("\n"), "utf8");
console.log(`Written ${out.length} models to ${OUT_PATH}`);
