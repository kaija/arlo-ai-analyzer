import PlanBudgetCard from "./PlanBudgetCard";
import { NotificationsCard } from "./NotificationsCard";
import { LogsDirectoryCard } from "./LogsDirectoryCard";
import { PricingCard } from "./PricingCard";
import { LanguageCard } from "./LanguageCard";

// ---------------------------------------------------------------------------
// SettingsPage
//
// Composes the four Settings cards in a responsive `.settings-grid` layout.
// All cards read from and write to SettingsContext or SessionsContext
// internally — no props are threaded through here.
//
// Requirements: 7.1–7.14
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  return (
    <div className="settings-page">
      {/* Screen-reader page heading — topbar title is visual-only (req 9.2) */}
      <h1 className="sr-only">Settings</h1>
      <div className="settings-grid">
        <PlanBudgetCard />
        <NotificationsCard />
        <LogsDirectoryCard />
        <PricingCard />
        <LanguageCard />
      </div>
    </div>
  );
}
