// ---------------------------------------------------------------------------
// User-entered model prices.
//
// For models no table knows: self-hosted weights (a .gguf path), a custom
// deployment name ("qwen3.6-35b-a3b-gmi-ray"), a router like
// "openrouter/auto". `rateFor` consults these first — the user said so
// explicitly — but Settings only offers them for models that have no other
// price, and Claude Code sessions priced by the backend (`cost_usd` > 0)
// keep that cost regardless.
//
// Stored in localStorage with the rest of the settings, which is also how the
// tray popover (a separate webview, same origin) reads them. Module state
// rather than context because `rateFor` is a plain function.
// ---------------------------------------------------------------------------

/** USD per million tokens. OpenAI-style single cache-write rate. */
export interface CustomPrice {
  inputPerMtok: number;
  outputPerMtok: number;
  cacheReadPerMtok: number;
  cacheWritePerMtok: number;
}

/** Keyed by lower-cased model id, exactly as logged. */
export type CustomPrices = Record<string, CustomPrice>;

export const KEY_CUSTOM_PRICES = "arlo-custom-model-prices";

export const FREE_PRICE: CustomPrice = {
  inputPerMtok: 0,
  outputPerMtok: 0,
  cacheReadPerMtok: 0,
  cacheWritePerMtok: 0,
};

const FIELDS = ["inputPerMtok", "outputPerMtok", "cacheReadPerMtok", "cacheWritePerMtok"] as const;

export function isValidPrice(value: unknown): value is CustomPrice {
  if (value === null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return FIELDS.every((f) => typeof v[f] === "number" && Number.isFinite(v[f]) && (v[f] as number) >= 0);
}

export function readCustomPrices(): CustomPrices {
  try {
    const raw = localStorage.getItem(KEY_CUSTOM_PRICES);
    if (raw === null) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== "object") return {};
    const out: CustomPrices = {};
    for (const [model, price] of Object.entries(parsed as Record<string, unknown>)) {
      if (isValidPrice(price)) out[model.toLowerCase()] = price;
    }
    return out;
  } catch {
    return {};
  }
}

export function writeCustomPrices(prices: CustomPrices): void {
  try {
    localStorage.setItem(KEY_CUSTOM_PRICES, JSON.stringify(prices));
  } catch {
    // ignore — storage may be unavailable
  }
}

let installed = new Map<string, CustomPrice>();

export function installCustomPrices(prices: CustomPrices): void {
  installed = new Map(Object.entries(prices));
}

export function getCustomPrice(model: string): CustomPrice | undefined {
  return installed.get(model.toLowerCase());
}

// Installed at import so the first render — and the tray popover — already
// see them.
installCustomPrices(readCustomPrices());
