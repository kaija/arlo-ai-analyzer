import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useSessionsContext } from "../context/SessionsContext";
import { useSettingsContext } from "../context/SettingsContext";
import {
  dailySpendSnapshot,
  nextAlert,
  readAlertLedger,
  writeAlertLedger,
} from "../lib/spend-alert";

// ---------------------------------------------------------------------------
// TrayBridge
//
// The main window's side of the menu-bar tray. Renders nothing.
//
// - Evaluates the daily spend alert whenever the session list changes and
//   asks the backend to pop the tray popover when a level is crossed. The
//   main window stays alive (hidden) when closed to the tray, so this keeps
//   running in the background.
// - Pushes localized labels for the tray's right-click menu.
// - Follows `navigate` requests from the popover's "Open …" buttons.
// ---------------------------------------------------------------------------

export function TrayBridge() {
  const { sessions, loading } = useSessionsContext();
  const { dailySpendAlert } = useSettingsContext();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  useEffect(() => {
    if (loading || !dailySpendAlert.enabled) return;
    const snap = dailySpendSnapshot(sessions, dailySpendAlert, new Date());
    const { alert, ledger } = nextAlert(readAlertLedger(), snap);
    writeAlertLedger(ledger);
    if (alert !== null) {
      // An alert must not steal focus from whatever the user is typing into.
      void invoke("show_tray_popover", { focus: false });
    }
  }, [sessions, loading, dailySpendAlert]);

  useEffect(() => {
    void invoke("localize_tray", {
      open: t("tray.menuOpen"),
      quit: t("tray.menuQuit"),
    });
  }, [t, i18n.language]);

  useEffect(() => {
    const unlisten = listen<string>("navigate", (e) => navigate(e.payload));
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [navigate]);

  return null;
}
