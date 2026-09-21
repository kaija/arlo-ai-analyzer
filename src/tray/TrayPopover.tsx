import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import i18n, { getStoredLocale } from "../i18n/i18n";
import type { Session } from "../types";
import {
  dailySpendSnapshot,
  msUntilLocalMidnight,
  readDailySpendAlertSettings,
  type DailySpendAlertSettings,
} from "../lib/spend-alert";
import { fmtCost } from "../lib/format";

// ---------------------------------------------------------------------------
// TrayPopover — the page inside the menu-bar popover window (`#/tray`).
//
// It has no providers: settings, theme and language are written by the main
// window into localStorage (shared, same origin) and re-read on every show.
//
// Show handshake: the backend never shows this window directly. It emits
// `tray-popover-refresh` (or creates the window, which mounts this page); the
// page reloads its data, renders, and answers `tray_popover_ready` with its
// height. The backend then sizes, positions under the tray icon, and shows —
// so the window never appears with stale numbers or the wrong height.
// ---------------------------------------------------------------------------

interface View {
  sessions: Session[];
  settings: DailySpendAlertSettings;
  now: Date;
}

function syncAppearance(): Promise<unknown> {
  let theme: string | null = null;
  try {
    theme = localStorage.getItem("arlo-theme");
  } catch {
    // ignore
  }
  if (theme === "light" || theme === "dark") {
    document.documentElement.setAttribute("data-theme", theme);
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  const locale = getStoredLocale();
  return i18n.language === locale ? Promise.resolve() : i18n.changeLanguage(locale);
}

export function TrayPopover() {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View | null>(null);

  const load = useCallback(async () => {
    await syncAppearance();
    const sessions = await invoke<Session[]>("list_sessions").catch(() => [] as Session[]);
    setView({ sessions, settings: readDailySpendAlertSettings(), now: new Date() });
  }, []);

  useEffect(() => {
    document.documentElement.classList.add("tray-window");
    void load();
    const unlisten = listen("tray-popover-refresh", () => void load());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void invoke("hide_tray_popover");
    };
    window.addEventListener("keydown", onKey);
    return () => {
      void unlisten.then((fn) => fn());
      window.removeEventListener("keydown", onKey);
    };
  }, [load]);

  // Report the rendered height after every data load — this is what shows the window.
  useLayoutEffect(() => {
    if (view === null || rootRef.current === null) return;
    const height = Math.ceil(rootRef.current.getBoundingClientRect().height);
    void invoke("tray_popover_ready", { height });
  }, [view]);

  if (view === null) return null;

  const { settings } = view;
  const snap = dailySpendSnapshot(view.sessions, settings, view.now);
  const active = settings.enabled && settings.dailyBudget > 0;
  const level = active ? snap.level : "ok";

  const untilReset = msUntilLocalMidnight(view.now);
  const hours = Math.floor(untilReset / 3_600_000);
  const minutes = Math.floor((untilReset % 3_600_000) / 60_000);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const title =
    level === "over"
      ? t("tray.overTitle")
      : level === "warn"
        ? t("tray.warnTitle", { pct: settings.warnPercent })
        : t("tray.okTitle");

  const hide = () => void invoke("hide_tray_popover");
  const open = (route: string) => void invoke("open_main_window", { route });

  return (
    <div ref={rootRef} className={`tray-popover level-${level}`} role="alertdialog" aria-labelledby="tray-popover-title">
      <div className="tray-popover-head">
        <span>{t("tray.heading")}</span>
        <button type="button" className="tray-popover-close" aria-label={t("tray.dismiss")} onClick={hide}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>

      <div id="tray-popover-title" className="tray-popover-title">
        {title}
      </div>

      <div className="tray-popover-amount">
        <span className="num tray-popover-spent">{fmtCost(snap.spent)}</span>
        {active && <span className="tray-popover-budget">/ {fmtCost(snap.budget)}</span>}
      </div>

      {active ? (
        <>
          <div
            className="tray-meter"
            role="meter"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(100, Math.round(snap.percent))}
            aria-valuetext={`${Math.round(snap.percent)}%`}
          >
            <div className="tray-meter-fill" style={{ width: `${Math.min(100, snap.percent)}%` }} />
            <div className="tray-meter-mark" style={{ left: `${settings.warnPercent}%` }} />
          </div>
          <div className="tray-popover-meta">
            <span className="num">{Math.round(snap.percent)}%</span>
            <span>{t("tray.resetsIn", { hours, minutes, timeZone })}</span>
          </div>
        </>
      ) : (
        <p className="tray-popover-hint">{t("tray.alertOff")}</p>
      )}

      <div className="tray-popover-actions">
        <button type="button" className="btn btn-ghost btn-small" onClick={hide}>
          {t("tray.dismiss")}
        </button>
        <button
          type="button"
          className="btn btn-primary btn-small"
          onClick={() => open(active ? "/" : "/settings#daily-spend-alert")}
        >
          {active ? t("tray.openDashboard") : t("tray.setBudget")}
        </button>
      </div>
    </div>
  );
}
