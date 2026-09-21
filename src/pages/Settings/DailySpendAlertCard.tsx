import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { useSettingsContext } from "../../context/SettingsContext";
import { useSessionsContext } from "../../context/SessionsContext";
import { Switch } from "../../primitives/Switch";
import { CurrencyRow } from "./PlanBudgetCard";
import {
  dailySpendSnapshot,
  WARN_PERCENT_MAX,
  WARN_PERCENT_MIN,
  type SpendLevel,
} from "../../lib/spend-alert";
import { fmtCost } from "../../lib/format";

const BADGE_CLASS: Record<SpendLevel, string> = {
  ok: "badge badge-good",
  warn: "badge badge-warning",
  over: "badge badge-critical",
};

// ---------------------------------------------------------------------------
// DailySpendAlertCard
//
// Daily budget + warn % for the menu-bar pop-up. The alert itself is evaluated
// by <DailySpendAlertWatcher /> in the app shell; this card only edits the
// settings and shows where today stands against them.
// ---------------------------------------------------------------------------

export function DailySpendAlertCard() {
  const { t } = useTranslation();
  const { dailySpendAlert, updateDailySpendAlert } = useSettingsContext();
  const { sessions } = useSessionsContext();

  const baseId = useId();
  const enableLabelId = `${baseId}-enable-label`;
  const budgetId = `${baseId}-budget`;
  const sliderId = `${baseId}-warn`;
  const sliderLabelId = `${sliderId}-label`;

  const [warnDisplay, setWarnDisplay] = useState<number>(dailySpendAlert.warnPercent);

  const snap = useMemo(
    () => dailySpendSnapshot(sessions, dailySpendAlert, new Date()),
    [sessions, dailySpendAlert],
  );
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const active = dailySpendAlert.enabled && dailySpendAlert.dailyBudget > 0;

  return (
    <section
      className="card"
      id="daily-spend-alert"
      aria-labelledby="daily-spend-alert-heading"
      tabIndex={-1}
    >
      <div className="card-head">
        <div className="card-head-text">
          <h2 id="daily-spend-alert-heading" className="card-title">
            {t("settings.dailySpendAlert.title")}
          </h2>
          <p className="card-subtitle">{t("settings.dailySpendAlert.subtitle")}</p>
        </div>
      </div>

      <div className="settings-form">
        <div className="form-row">
          <div className="label-col">
            <div className="lbl" id={enableLabelId}>
              {t("settings.dailySpendAlert.enabled")}
            </div>
            <div className="hint">{t("settings.dailySpendAlert.enabledHint")}</div>
          </div>
          <div className="control-col">
            <Switch
              id={`${baseId}-enable`}
              checked={dailySpendAlert.enabled}
              onChange={(enabled) => updateDailySpendAlert({ enabled })}
              labelledBy={enableLabelId}
            />
          </div>
        </div>

        <CurrencyRow
          id={budgetId}
          label={t("settings.dailySpendAlert.dailyBudget")}
          hint={t("settings.dailySpendAlert.dailyBudgetHint")}
          value={dailySpendAlert.dailyBudget}
          onChange={(dailyBudget) => updateDailySpendAlert({ dailyBudget })}
          errorMessage={t("settings.planBudget.invalidNumber")}
          unitLabel={t("settings.dailySpendAlert.perDay")}
        />

        <div className="form-row threshold-row">
          <div className="label-col">
            <div className="lbl" id={sliderLabelId}>
              {t("settings.dailySpendAlert.warnAt")}
            </div>
            <div className="hint">{t("settings.dailySpendAlert.warnAtHint")}</div>
          </div>
          <div className="control-col">
            <input
              id={sliderId}
              type="range"
              min={WARN_PERCENT_MIN}
              max={WARN_PERCENT_MAX}
              step={5}
              value={warnDisplay}
              onInput={(e) => setWarnDisplay(parseInt((e.target as HTMLInputElement).value, 10))}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                setWarnDisplay(v);
                updateDailySpendAlert({ warnPercent: v });
              }}
              className="settings-range"
              aria-labelledby={sliderLabelId}
              aria-valuetext={`${warnDisplay}%`}
            />
            <span className="threshold-val">{warnDisplay}%</span>
          </div>
        </div>

        <div className="spend-alert-status">
          <div className="spend-alert-status-text">
            <div className="lbl">
              {t("settings.dailySpendAlert.today", {
                spent: fmtCost(snap.spent),
                budget: fmtCost(snap.budget),
              })}
              {active && (
                <span className={BADGE_CLASS[snap.level]}>
                  {Math.round(snap.percent)}%
                </span>
              )}
            </div>
            <div className="hint">
              {t("settings.dailySpendAlert.resetsAt", { timeZone })}
            </div>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={() => void invoke("show_tray_popover", { focus: true })}
          >
            {t("settings.dailySpendAlert.preview")}
          </button>
        </div>
      </div>
    </section>
  );
}
