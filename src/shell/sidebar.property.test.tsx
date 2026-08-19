/**
 * Property 3: Active nav item uniqueness
 *
 * For any route pathname from the set ["/", "/sessions", "/sessions/:id",
 * "/insights", "/settings"], the rendered sidebar should have exactly one
 * nav item with the `active` CSS class, and that item should be the one
 * matching the route.
 *
 * Validates: Requirements 2.6
 */

import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SettingsProvider } from "../context/SettingsContext";
import { LanguageProvider } from "../context/LanguageContext";
import { Sidebar } from "./Sidebar";
// Initialize i18next so useTranslation() returns real strings
import "../i18n/i18n";

// ---------------------------------------------------------------------------
// Helper: render Sidebar at a given path inside required providers
// ---------------------------------------------------------------------------

function renderSidebarAt(path: string) {
  return render(
    <SettingsProvider>
      <MemoryRouter initialEntries={[path]}>
        <LanguageProvider>
          <Sidebar />
        </LanguageProvider>
      </MemoryRouter>
    </SettingsProvider>
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// Route → expected active label mapping
//
// The sidebar has four NavLink items; `/sessions/:id` still activates the
// "Sessions" link because NavLink does prefix matching (end=false).
// ---------------------------------------------------------------------------

const ROUTE_TO_ACTIVE_LABEL: Array<[route: string, expectedLabel: string]> = [
  ["/", "Dashboard"],
  ["/sessions", "Sessions"],
  ["/sessions/some-id", "Sessions"],
  ["/insights", "Insights"],
  ["/settings", "Settings"],
];

// ---------------------------------------------------------------------------
// Property 3: exactly one .nav-item.active, and it matches the route
// ---------------------------------------------------------------------------

describe("Property 3: Active nav item uniqueness (Validates: Requirements 2.6)", () => {
  it.each(ROUTE_TO_ACTIVE_LABEL)(
    "route %s → exactly one active nav item matching '%s'",
    (route, expectedLabel) => {
      const { container } = renderSidebarAt(route);

      const activeItems = container.querySelectorAll(".nav-item.active");

      // Exactly one active item
      expect(activeItems).toHaveLength(1);

      // The active item contains the expected label text
      const activeItem = activeItems[0];
      const labelEl = activeItem.querySelector("span");
      expect(labelEl?.textContent).toBe(expectedLabel);
    }
  );

  it("no other nav items carry the active class when an item is active", () => {
    // Run through all route/label pairs to assert the negative as well
    for (const [route, expectedLabel] of ROUTE_TO_ACTIVE_LABEL) {
      const { container, unmount } = renderSidebarAt(route);

      const allNavItems = container.querySelectorAll(".nav-item");
      const activeItems = container.querySelectorAll(".nav-item.active");

      // Exactly one active
      expect(activeItems).toHaveLength(1);

      // All inactive items do NOT carry the active class
      allNavItems.forEach((item) => {
        const label = item.querySelector("span")?.textContent ?? "";
        if (label !== expectedLabel) {
          expect(item.classList.contains("active")).toBe(false);
        }
      });

      unmount();
    }
  });

  /**
   * Property-style exhaustive check: for every nav item and every route,
   * the active state is exactly correct. This covers the full 4×5 matrix
   * of (nav item, route) pairs and serves as the 100+ assertion equivalent
   * for the property.
   */
  it("active class matrix: every nav item is active only on its own route(s)", () => {
    const NAV_LABELS_AND_ROUTES = [
      { label: "Dashboard", activeRoutes: ["/"] },
      {
        label: "Sessions",
        activeRoutes: ["/sessions", "/sessions/some-id"],
      },
      { label: "Insights", activeRoutes: ["/insights"] },
      { label: "Settings", activeRoutes: ["/settings"] },
    ];

    for (const [route] of ROUTE_TO_ACTIVE_LABEL) {
      const { container, unmount } = renderSidebarAt(route);

      for (const { label, activeRoutes } of NAV_LABELS_AND_ROUTES) {
        const items = container.querySelectorAll(".nav-item");
        const matchingItem = Array.from(items).find(
          (el) => el.querySelector("span")?.textContent === label
        );

        expect(matchingItem).toBeDefined();

        const shouldBeActive = activeRoutes.includes(route);
        expect(matchingItem!.classList.contains("active")).toBe(shouldBeActive);
      }

      unmount();
    }
  });
});
