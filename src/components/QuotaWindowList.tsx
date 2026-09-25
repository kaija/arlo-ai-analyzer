import { useTranslation } from "react-i18next";
import { Meter } from "../primitives/Meter";
import { clampPercent, durationPhrase, resetsInMs, windowPhrase } from "../lib/plan";
import type { QuotaWindow } from "../types";

// ---------------------------------------------------------------------------
// QuotaWindowList
//
// One row per plan limit: what it limits, a meter, and when it resets. Shared
// by the dashboard's Plan usage card and the menu-bar popover; `compact` fits
// the popover's width by showing the reset as a bare duration ("2h 13m"),
// with the full sentence in its tooltip.
// ---------------------------------------------------------------------------

interface QuotaWindowListProps {
  windows: QuotaWindow[];
  /** Epoch ms the countdowns are measured from. */
  now: number;
  compact?: boolean;
}

export function QuotaWindowList({ windows, now, compact = false }: QuotaWindowListProps) {
  return (
    <ul className={compact ? "plan-windows compact" : "plan-windows"}>
      {windows.map((w) => (
        <QuotaWindowRow key={w.id} window={w} now={now} compact={compact} />
      ))}
    </ul>
  );
}

function QuotaWindowRow({ window: w, now, compact }: { window: QuotaWindow; now: number; compact: boolean }) {
  const { t } = useTranslation();
  const phrase = windowPhrase(w);
  const base = t(phrase.key, phrase.params);
  const label = w.scope ? t("plans.window.scoped", { window: base, scope: w.scope }) : base;

  const ms = resetsInMs(w.resets_at, now);
  const duration = ms === null ? null : durationPhrase(ms);
  const time = duration === null ? null : t(duration.key, duration.params);
  const sentence = time === null ? "" : t("plans.resetsIn", { time });

  return (
    <li className="plan-window">
      <span className="plan-window-label" title={label}>{label}</span>
      <Meter value={clampPercent(w.used_percent)} showLabel />
      <span className="plan-window-reset" title={compact && sentence ? sentence : undefined}>
        {compact ? (time ?? "") : sentence}
      </span>
    </li>
  );
}
