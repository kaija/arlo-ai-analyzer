import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { PRICING_TABLE, isModelPriced, modelColor } from "../../pricing";
import type { PricingEntry } from "../../pricing";
import { Badge } from "../../primitives/Badge";
import { useSessionsContext } from "../../context/SessionsContext";
import { Switch } from "../../primitives/Switch";
import type { PriceCatalogStatus } from "../../lib/price-catalog";

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
