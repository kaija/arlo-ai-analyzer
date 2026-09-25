import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import PlanBudgetCard from "./PlanBudgetCard";
import { DailySpendAlertCard } from "./DailySpendAlertCard";
import { NotificationsCard } from "./NotificationsCard";
import { LogsDirectoryCard } from "./LogsDirectoryCard";
import { PlansCard } from "./PlansCard";
import { PricingCard } from "./PricingCard";
import { LanguageCard } from "./LanguageCard";
import { DatabaseCard } from "./DatabaseCard";

// ---------------------------------------------------------------------------
// SettingsPage
//
// Composes the Settings cards in a responsive `.settings-grid` layout.
// All cards read from and write to SettingsContext or SessionsContext
// internally — no props are threaded through here.
//
// Requirements: 7.1–7.14
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const location = useLocation();

  useEffect(() => {
    if (!["#pricing", "#daily-spend-alert", "#logs-directory", "#plans"].includes(location.hash)) return;

    const card = document.getElementById(location.hash.slice(1));
    card?.scrollIntoView({ block: "start" });
    card?.focus({ preventScroll: true });
  }, [location.hash]);

  return (
    <div className="settings-page">
      {/* Screen-reader page heading — topbar title is visual-only (req 9.2) */}
      <h1 className="sr-only">Settings</h1>
      <div className="settings-grid">
        <PlanBudgetCard />
        <DailySpendAlertCard />
        <NotificationsCard />
        <LogsDirectoryCard />
        <PlansCard />
        <PricingCard />
        <LanguageCard />
        <DatabaseCard />
      </div>
    </div>
  );
}
