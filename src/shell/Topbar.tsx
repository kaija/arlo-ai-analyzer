import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSettingsContext } from "../context/SettingsContext";

// ---------------------------------------------------------------------------
// Page title mapping
// ---------------------------------------------------------------------------

function pathnameToTitle(pathname: string, t: (key: string) => string): string {
  if (pathname === "/" || pathname === "") return t("page.dashboard");
  if (pathname.startsWith("/sessions/")) return t("page.sessionDetail");
  if (pathname === "/sessions") return t("page.sessions");
  if (pathname === "/insights") return t("page.insights");
  if (pathname === "/settings") return t("page.settings");
  return "Arlo";
}

// ---------------------------------------------------------------------------
// Moon / Sun icons for theme toggle
// ---------------------------------------------------------------------------

function IconMoon() {
  return (
    <svg
      className="moon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>
    </svg>
  );
}

function IconSun() {
  return (
    <svg
      className="sun"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="4"/>
      <line x1="12" y1="2" x2="12" y2="4"/>
      <line x1="12" y1="20" x2="12" y2="22"/>
      <line x1="4.2" y1="4.2" x2="5.6" y2="5.6"/>
      <line x1="18.4" y1="18.4" x2="19.8" y2="19.8"/>
      <line x1="2" y1="12" x2="4" y2="12"/>
      <line x1="20" y1="12" x2="22" y2="12"/>
      <line x1="4.2" y1="19.8" x2="5.6" y2="18.4"/>
      <line x1="18.4" y1="5.6" x2="19.8" y2="4.2"/>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Topbar
// ---------------------------------------------------------------------------

export function Topbar() {
  const location = useLocation();
  const { toggleTheme } = useSettingsContext();
  const { t } = useTranslation();

  const title = pathnameToTitle(location.pathname, t);

  return (
    <div className="topbar">
      <span
        className="topbar-title"
        aria-live="polite"
        aria-atomic="true"
      >
        {title}
      </span>

      <div className="topbar-actions">
        <button
          className="theme-toggle"
          onClick={toggleTheme}
          aria-label={t("topbar.toggleTheme")}
          title={t("topbar.toggleTheme")}
        >
          <IconMoon />
          <IconSun />
        </button>
      </div>
    </div>
  );
}
