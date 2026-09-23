import { invoke } from "@tauri-apps/api/core";

// ---------------------------------------------------------------------------
// The downloaded model price catalog.
//
// The backend (src-tauri/src/catalog.rs) fetches `models.json` from the
// project's GitHub Pages site at most once a day and hands it over through
// `get_price_catalog` — null while "Update model prices online" is off or
// before the first good download. `rateFor` consults it after the
// hand-checked tables and before the bundled OpenRouter snapshot.
//
// Module state rather than React context because `rateFor` is a plain
// function called from memos and non-React code (spend alert, tray popover).
// Callers that install a new catalog must re-render cost displays themselves;
// SessionsContext does it by replacing the sessions array.
// ---------------------------------------------------------------------------

/** One model in the published catalog; rates are USD per million tokens. */
export interface CatalogModel {
  name: string;
  contextLength: number;
  inputPerMtok: number;
  outputPerMtok: number;
  cacheReadPerMtok: number;
  cacheWritePerMtok: number;
  cacheWrite1hPerMtok: number;
}

export interface PriceCatalog {
  schemaVersion: number;
  generatedAt: string;
  source: string;
  models: Record<string, CatalogModel>;
}

/** What Settings shows; mirrors `CatalogStatus` in catalog.rs. */
export interface PriceCatalogStatus {
  enabled: boolean;
  url: string;
  last_checked: string | null;
  last_updated: string | null;
  last_error: string | null;
  generated_at: string | null;
  model_count: number;
}

let models = new Map<string, CatalogModel>();

export function installPriceCatalog(catalog: PriceCatalog | null): void {
  models = new Map(Object.entries(catalog?.models ?? {}));
}

export function getCatalogModel(id: string): CatalogModel | undefined {
  return models.get(id);
}

/** Fetch the backend's current catalog and install it. Never throws. */
export async function loadPriceCatalog(): Promise<void> {
  const catalog = await invoke<PriceCatalog | null>("get_price_catalog").catch(() => null);
  installPriceCatalog(catalog);
}
