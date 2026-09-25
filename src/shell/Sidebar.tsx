import { useEffect, useRef } from "react";
import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSettingsContext } from "../context/SettingsContext";

// ---------------------------------------------------------------------------
// Inline SVG icons
// ---------------------------------------------------------------------------

function IconDashboard() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <line x1="4" y1="20" x2="4" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="20" y1="20" x2="20" y2="14"/>
    </svg>
  );
}

function IconSessions() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <polygon points="12 2 2 7 12 12 22 7 12 2"/>
      <polyline points="2 17 12 22 22 17"/>
      <polyline points="2 12 12 17 22 12"/>
    </svg>
  );
}

function IconInsights() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  );
}

function IconTools() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
    </svg>
  );
}

function IconSettings() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <line x1="4" y1="21" x2="4" y2="14"/>
      <line x1="4" y1="10" x2="4" y2="3"/>
      <line x1="12" y1="21" x2="12" y2="12"/>
      <line x1="12" y1="8" x2="12" y2="3"/>
      <line x1="20" y1="21" x2="20" y2="16"/>
      <line x1="20" y1="12" x2="20" y2="3"/>
      <line x1="1" y1="14" x2="7" y2="14"/>
      <line x1="9" y1="8" x2="15" y2="8"/>
      <line x1="17" y1="16" x2="23" y2="16"/>
    </svg>
  );
}

function IconChevronLeft() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  );
}

function IconChevronRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Brand mark
// ---------------------------------------------------------------------------

function BrandMark() {
  return (
    <div className="sidebar-brand">
      {/* .mark matches tokens.css: width/height 22px, border-radius 7px, background: var(--accent) */}
      <span className="mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M6 18 12 6l6 12" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </span>
      <span>Arlo</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Nav items configuration
// ---------------------------------------------------------------------------

const NAV_ITEMS = [
  { to: "/", labelKey: "nav.dashboard", icon: <IconDashboard />, end: true },
  { to: "/sessions", labelKey: "nav.sessions", icon: <IconSessions />, end: false },
  { to: "/insights", labelKey: "nav.insights", icon: <IconInsights />, end: false },
  { to: "/tools", labelKey: "nav.tools", icon: <IconTools />, end: false },
  { to: "/settings", labelKey: "nav.settings", icon: <IconSettings />, end: false },
] as const;

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useSettingsContext();
  const { t } = useTranslation();
  const backdropRef = useRef<HTMLDivElement>(null);

  // Close sidebar when clicking outside in overlay (mobile) mode
  useEffect(() => {
    if (sidebarCollapsed) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        toggleSidebar();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [sidebarCollapsed, toggleSidebar]);

  return (
    <>
      {/* Backdrop — only visible in overlay mode (≤ 920 px) when sidebar is open */}
      {!sidebarCollapsed && (
        <div
          ref={backdropRef}
          className="sidebar-backdrop"
          onClick={toggleSidebar}
          aria-hidden="true"
        />
      )}

      <aside className={`sidebar${sidebarCollapsed ? " collapsed" : ""}`}>
        <BrandMark />

        <nav className="sidebar-nav" aria-label="Main navigation">
          {NAV_ITEMS.map(({ to, labelKey, icon, end }) => {
            const label = t(labelKey);
            return (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  "nav-item" + (isActive ? " active" : "")
                }
                title={sidebarCollapsed ? label : undefined}
                aria-label={sidebarCollapsed ? label : undefined}
              >
                {/* svg is the direct child — tokens.css: .nav-item svg { width:17px; height:17px } */}
                {icon}
                <span>{label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-foot">
          <button
            className="sidebar-collapse-btn"
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
            title={sidebarCollapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
          >
            {sidebarCollapsed ? <IconChevronRight /> : <IconChevronLeft />}
          </button>
        </div>
      </aside>
    </>
  );
}
