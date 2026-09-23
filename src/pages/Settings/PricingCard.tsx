import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { PRICING_TABLE, isModelPriced, modelColor, resolveRate, totalTokens, type RateSource } from "../../pricing";
import type { PricingEntry } from "../../pricing";
import { Badge } from "../../primitives/Badge";
import { useSessionsContext } from "../../context/SessionsContext";
import { Switch } from "../../primitives/Switch";
import type { PriceCatalogStatus } from "../../lib/price-catalog";
import { useSettingsContext } from "../../context/SettingsContext";
import { FREE_PRICE, type CustomPrice } from "../../lib/custom-pricing";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupByModel(entries: PricingEntry[]): Map<string, PricingEntry[]> {
  const map = new Map<string, PricingEntry[]>();
  for (const entry of entries) {
    const existing = map.get(entry.model);
    if (existing) {
      existing.push(entry);
    } else {
      map.set(entry.model, [entry]);
    }
  }
  return map;
}

function fmtRate(perMtok: number): string {
  if (perMtok === 0) return "$0";
  const s = perMtok.toFixed(2).replace(/\.?0+$/, "");
  return `$${s}`;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Row badge logic
// ---------------------------------------------------------------------------

type RowRole = "introductory" | "standard" | null;

function rowRole(entries: PricingEntry[], entryIndex: number): RowRole {
  if (entries.length < 2) return null;
  return entryIndex === 0 ? "introductory" : "standard";
}

// ---------------------------------------------------------------------------
// Unpriced warning
// ---------------------------------------------------------------------------


interface UnpricedWarningStripProps {
  models: string[];
  t: (key: string, options?: Record<string, unknown>) => string;
}

function UnpricedWarningStrip({ models, t }: UnpricedWarningStripProps) {
  if (models.length === 0) return null;
  const list =
    models.slice(0, 3).join(", ") +
    (models.length > 3 ? ` +${models.length - 3} more` : "");
  return (
    <div className="warn-strip" role="alert">
      <svg
        className="warn-icon"
        viewBox="0 0 16 16"
        width="16"
        height="16"
        aria-hidden="true"
        fill="none"
      >
        <path
          d="M8 1.5L14.5 13H1.5L8 1.5Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path d="M8 6v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="8" cy="11.5" r="0.75" fill="currentColor" />
      </svg>
      <span>{t("settings.pricing.unpricedWarning", { models: list })}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Online price updates — the switch for the daily catalog download
// ---------------------------------------------------------------------------

function OnlinePricesRow() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<PriceCatalogStatus | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const load = () =>
      invoke<PriceCatalogStatus>("get_price_catalog_status").then(setStatus).catch(() => {});
    void load();
    const unlisten = listen("price-catalog-updated", () => void load());
    return () => void unlisten.then((fn) => fn());
  }, []);

  if (status === null) return null;

  const toggle = (enabled: boolean) =>
    invoke<PriceCatalogStatus>("set_price_catalog_enabled", { enabled }).then(setStatus).catch(() => {});

  const checkNow = async () => {
    setChecking(true);
    try {
      setStatus(await invoke<PriceCatalogStatus>("check_price_catalog"));
    } catch {
      // The failure is recorded in the status; re-read it to show it.
      await invoke<PriceCatalogStatus>("get_price_catalog_status").then(setStatus).catch(() => {});
    } finally {
      setChecking(false);
    }
  };

  const updated = status.last_updated ?? status.generated_at;
  let detail: string;
  if (!status.enabled) {
    detail = t("settings.pricing.online.off");
  } else if (status.model_count > 0 && updated) {
    detail = t("settings.pricing.online.updated", { date: fmtDate(updated), count: status.model_count });
  } else {
    detail = t("settings.pricing.online.notYet");
  }
  if (status.enabled && status.last_error) {
    detail += ` · ${t("settings.pricing.online.failed")}`;
  }

  return (
    <div className="notif-form">
      <div className="notif-form-row">
        <div className="label-col">
          <div id="online-prices-label" className="lbl">
            {t("settings.pricing.online.label")}
          </div>
          <div className="hint">{t("settings.pricing.online.hint")}</div>
          <div className="hint" title={status.last_error ?? undefined}>
            {detail}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {status.enabled && (
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={checkNow}
              disabled={checking}
              aria-busy={checking}
            >
              {checking ? t("settings.pricing.online.checking") : t("settings.pricing.online.checkNow")}
            </button>
          )}
          <Switch
            id="online-prices-switch"
            checked={status.enabled}
            onChange={toggle}
            labelledBy="online-prices-label"
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Models in your data — every model the sessions use, where its price comes
// from, and a user-entered price for the ones nothing else prices.
// ---------------------------------------------------------------------------

interface UsedModel {
  model: string;
  sessions: number;
  tokens: number;
}

type PriceField = keyof CustomPrice;
const PRICE_FIELDS: PriceField[] = ["inputPerMtok", "outputPerMtok", "cacheReadPerMtok", "cacheWritePerMtok"];

interface Draft {
  model: string;
  values: Record<PriceField, string>;
}

function parseRate(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return 0;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function draftFor(model: string, price: CustomPrice | undefined): Draft {
  const p = price ?? FREE_PRICE;
  return {
    model,
    values: {
      inputPerMtok: price ? String(p.inputPerMtok) : "",
      outputPerMtok: price ? String(p.outputPerMtok) : "",
      cacheReadPerMtok: price ? String(p.cacheReadPerMtok) : "",
      cacheWritePerMtok: price ? String(p.cacheWritePerMtok) : "",
    },
  };
}

const SOURCE_BADGE: Record<RateSource, "accent" | "neutral"> = {
  custom: "accent",
  documented: "neutral",
  anthropic: "neutral",
  catalog: "neutral",
  bundled: "neutral",
};

export function UsedModelsSection() {
  const { t } = useTranslation();
  const { sessions } = useSessionsContext();
  const { customPrices, setCustomPrice } = useSettingsContext();
  const [draft, setDraft] = useState<Draft | null>(null);

  const rows = useMemo(() => {
    const byModel = new Map<string, UsedModel>();
    for (const s of sessions) {
      if (!s.model || s.model === "<synthetic>") continue;
      const row = byModel.get(s.model) ?? { model: s.model, sessions: 0, tokens: 0 };
      row.sessions += 1;
      row.tokens += totalTokens(s);
      byModel.set(s.model, row);
    }
    // Unpriced first — they are why anyone opens this — then by volume.
    return [...byModel.values()]
      .map((row) => ({ ...row, resolved: resolveRate(row.model) }))
      .sort((a, b) => Number(a.resolved !== null) - Number(b.resolved !== null) || b.tokens - a.tokens);
    // customPrices: resolveRate reads them from module state.
  }, [sessions, customPrices]); // eslint-disable-line react-hooks/exhaustive-deps

  if (rows.length === 0) return null;

  const parsed = draft
    ? PRICE_FIELDS.map((f) => parseRate(draft.values[f]))
    : [];
  const draftValid = parsed.every((n) => n !== null);

  const save = () => {
    if (!draft || !draftValid) return;
    const [inputPerMtok, outputPerMtok, cacheReadPerMtok, cacheWritePerMtok] = parsed as number[];
    setCustomPrice(draft.model, { inputPerMtok, outputPerMtok, cacheReadPerMtok, cacheWritePerMtok });
    setDraft(null);
  };

  const fieldLabel: Record<PriceField, string> = {
    inputPerMtok: t("settings.pricing.colInput"),
    outputPerMtok: t("settings.pricing.colOutput"),
    cacheReadPerMtok: t("settings.pricing.colCacheRead"),
    cacheWritePerMtok: t("settings.pricing.used.colCacheWrite"),
  };

  return (
    <div className="used-models">
      <div className="used-models-head">
        <h3 className="used-models-title">{t("settings.pricing.used.title")}</h3>
        <p className="card-subtitle">{t("settings.pricing.used.hint")}</p>
      </div>
      <div className="pricing-table-scroll">
        <table className="pricing-table used-models-table" aria-label={t("settings.pricing.used.title")}>
          <thead>
            <tr>
              <th scope="col">{t("settings.pricing.colModel")}</th>
              <th scope="col" className="num">{t("settings.pricing.used.colSessions")}</th>
              {PRICE_FIELDS.map((f) => (
                <th key={f} scope="col" className="num">{fieldLabel[f]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ model, sessions: count, resolved }) => {
              const key = model.toLowerCase();
              const isCustom = resolved?.source === "custom";
              const editable = resolved === null || isCustom;
              const editing = draft?.model === model;
              const rate = resolved?.rate;
              const shown: Record<PriceField, number | undefined> = {
                inputPerMtok: rate?.inputPerMtok,
                outputPerMtok: rate?.outputPerMtok,
                cacheReadPerMtok: rate?.cacheReadPerMtok,
                cacheWritePerMtok: rate?.cacheWrite5mPerMtok,
              };
              return (
                <tr key={model}>
                  <td>
                    <div className="pricing-model-cell">
                      <span className="model-dot" style={{ background: modelColor(model) }} aria-hidden="true" />
                      <span className="used-model-id" title={model}>{model}</span>
                    </div>
                    <div className="used-model-meta">
                      {resolved ? (
                        <Badge variant={SOURCE_BADGE[resolved.source]}>
                          {t(`settings.pricing.used.source.${resolved.source}`)}
                        </Badge>
                      ) : (
                        <span className="used-model-unpriced">{t("settings.pricing.used.source.none")}</span>
                      )}
                      {editing ? (
                        <>
                          <button type="button" className="btn btn-primary btn-small" onClick={save} disabled={!draftValid}>
                            {t("settings.pricing.used.save")}
                          </button>
                          <button type="button" className="btn btn-secondary btn-small" onClick={() => setDraft(null)}>
                            {t("settings.pricing.used.cancel")}
                          </button>
                        </>
                      ) : editable ? (
                        <>
                          <button
                            type="button"
                            className="btn btn-secondary btn-small"
                            onClick={() => setDraft(draftFor(model, customPrices[key]))}
                          >
                            {isCustom ? t("settings.pricing.used.edit") : t("settings.pricing.used.setPrice")}
                          </button>
                          {isCustom ? (
                            <button
                              type="button"
                              className="btn btn-secondary btn-small"
                              onClick={() => setCustomPrice(model, null)}
                            >
                              {t("settings.pricing.used.remove")}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-secondary btn-small"
                              onClick={() => setCustomPrice(model, FREE_PRICE)}
                            >
                              {t("settings.pricing.used.free")}
                            </button>
                          )}
                        </>
                      ) : null}
                    </div>
                  </td>
                  <td className="num tnum">{count}</td>
                  {PRICE_FIELDS.map((f) =>
                    editing && draft ? (
                      <td key={f} className="num">
                        <label className={`field used-model-input${parseRate(draft.values[f]) === null ? " error" : ""}`}>
                          <span aria-hidden="true">$</span>
                          <input
                            className="field-input tnum"
                            type="text"
                            inputMode="decimal"
                            placeholder="0"
                            value={draft.values[f]}
                            aria-label={`${model} ${fieldLabel[f]}`}
                            onChange={(e) =>
                              setDraft({ ...draft, values: { ...draft.values, [f]: e.target.value } })
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") save();
                              if (e.key === "Escape") setDraft(null);
                            }}
                          />
                        </label>
                      </td>
                    ) : (
                      <td key={f} className="num tnum">
                        {shown[f] === undefined ? "—" : fmtRate(shown[f] as number)}
                      </td>
                    ),
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PricingCard
// ---------------------------------------------------------------------------

export function PricingCard() {
  const { t } = useTranslation();
  const { sessions } = useSessionsContext();
  const [busy, setBusy] = useState(false);
  const busyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const unpricedModels = useMemo<string[]>(() => {
    const seen = new Set<string>();
    const unpriced: string[] = [];
    for (const s of sessions) {
      const m = (s.model ?? "").toLowerCase();
      if (!m || seen.has(m)) continue;
      seen.add(m);
      if (!isModelPriced(s.model)) {
        unpriced.push(s.model ?? m);
      }
    }
    return unpriced;
  }, [sessions]);

  const grouped = useMemo(() => groupByModel(PRICING_TABLE), []);

  const displayRows = useMemo(() => {
    const rows: Array<{
      entry: PricingEntry;
      isMultiRate: boolean;
      role: RowRole;
    }> = [];
    for (const [, entries] of grouped) {
      const isMultiRate = entries.length > 1;
      entries.forEach((entry, idx) => {
        rows.push({ entry, isMultiRate, role: rowRole(entries, idx) });
      });
    }
    return rows;
  }, [grouped]);

  const handleReprice = () => {
    if (busy) return;
    setBusy(true);
    busyTimerRef.current = setTimeout(() => {
      setBusy(false);
      busyTimerRef.current = null;
    }, 1100);
  };

  return (
    <section id="pricing" className="card" aria-labelledby="pricing-card-heading" tabIndex={-1}>
      <div className="card-head">
        <div className="card-head-text">
          <h2 id="pricing-card-heading" className="card-title">{t("settings.pricing.title")}</h2>
          <p className="card-subtitle">
            {t("settings.pricing.subtitle")}
          </p>
        </div>
        <button
          className="btn btn-secondary btn-small"
          onClick={handleReprice}
          disabled={busy}
          aria-busy={busy}
        >
          {busy ? t("settings.pricing.repricing") : t("settings.pricing.reprice")}
        </button>
      </div>

      <OnlinePricesRow />

      {/* Unpriced warning — conditional */}
      <UnpricedWarningStrip models={unpricedModels} t={t} />

      <UsedModelsSection />

      <div className="used-models-head">
        <h3 className="used-models-title">{t("settings.pricing.builtInTitle")}</h3>
      </div>

      {/* Horizontally scrollable pricing table */}
      <div className="pricing-table-scroll">
        <table
          className="pricing-table"
          aria-label={t("settings.pricing.tableLabel")}
        >
          <thead>
            <tr>
              <th scope="col">{t("settings.pricing.colModel")}</th>
              <th scope="col" className="num">{t("settings.pricing.colInput")}</th>
              <th scope="col" className="num">{t("settings.pricing.colOutput")}</th>
              <th scope="col" className="num">{t("settings.pricing.colCacheWrite5m")}</th>
              <th scope="col" className="num">{t("settings.pricing.colCacheWrite1h")}</th>
              <th scope="col" className="num">{t("settings.pricing.colCacheRead")}</th>
              <th scope="col">{t("settings.pricing.colEffective")}</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map(({ entry, isMultiRate, role }, i) => (
              <tr
                key={`${entry.model}-${entry.effectiveDate}`}
                style={isMultiRate ? { background: "var(--accent-wash)" } : undefined}
                aria-rowindex={i + 2}
              >
                <td>
                  <div className="pricing-model-cell">
                    <span
                      className="model-dot"
                      style={{ background: modelColor(entry.model) }}
                      aria-hidden="true"
                    />
                    <span>{entry.model}</span>
                    {role === "introductory" && (
                      <Badge variant="accent">{t("settings.pricing.introductory")}</Badge>
                    )}
                    {role === "standard" && (
                      <Badge variant="neutral">{t("settings.pricing.standard")}</Badge>
                    )}
                  </div>
                </td>
                <td className="num tnum">{fmtRate(entry.inputPerMtok)}</td>
                <td className="num tnum">{fmtRate(entry.outputPerMtok)}</td>
                <td className="num tnum">{fmtRate(entry.cacheWrite5mPerMtok)}</td>
                <td className="num tnum">{fmtRate(entry.cacheWrite1hPerMtok)}</td>
                <td className="num tnum">{fmtRate(entry.cacheReadPerMtok)}</td>
                <td className="tnum">{fmtDate(entry.effectiveDate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pricing footnote */}
      <p className="pricing-footnote">
        {t("settings.pricing.footerNote", {
          defaultValue:
            "Rates are per million tokens ($/Mtok) as published by Anthropic. Cache write 1h is charged at the same rate as cache write 5m. Actual costs may vary; check anthropic.com/pricing for the latest rates.",
        })}
      </p>
    </section>
  );
}
