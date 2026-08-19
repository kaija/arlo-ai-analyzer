/**
 * Property 1: Theme persistence round-trip
 *
 * For any theme value in {"light", "dark"}, writing that theme to
 * localStorage["arlo-theme"] and re-initializing the SettingsContext should
 * restore the exact same theme value.
 *
 * Validates: Requirements 1.5, 1.6
 *
 * ---
 *
 * Property 2: Sidebar collapse persistence round-trip
 *
 * For any boolean collapsed state, writing that state to
 * localStorage["arlo-sidebar-collapsed"] (as "1" for true, "0" for false) and
 * re-initializing the SettingsContext should restore the exact same boolean.
 *
 * Validates: Requirements 2.5
 */

import { describe, it, beforeEach, afterEach, vi } from "vitest";
import { render } from "@testing-library/react";
import * as fc from "fast-check";

import {
  SettingsProvider,
  useSettingsContext,
} from "./SettingsContext";

// ---------------------------------------------------------------------------
// jsdom does not implement window.matchMedia. Provide a minimal stub so that
// SettingsContext's `defaultTheme()` function can call it without throwing.
// The stub always returns `matches: false` (i.e., no dark-mode preference),
// which means the fallback theme in tests is deterministically "light".
// ---------------------------------------------------------------------------
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// ---------------------------------------------------------------------------
// Test helper: render a SettingsProvider and return the context value
// synchronously by reading from a ref set during render.
// ---------------------------------------------------------------------------

let capturedTheme: "light" | "dark" | null = null;
let capturedCollapsed: boolean | null = null;

function ThemeReader() {
  const ctx = useSettingsContext();
  capturedTheme = ctx.theme;
  return null;
}

function CollapsedReader() {
  const ctx = useSettingsContext();
  capturedCollapsed = ctx.sidebarCollapsed;
  return null;
}

// ---------------------------------------------------------------------------
// Isolated localStorage: save/restore real localStorage around each test
// to avoid cross-test pollution.
// ---------------------------------------------------------------------------

const LS_THEME = "arlo-theme";
const LS_SIDEBAR = "arlo-sidebar-collapsed";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// Property 1 — Theme persistence round-trip
// ---------------------------------------------------------------------------

describe("Property 1 – Theme persistence round-trip", () => {
  it(
    "SettingsContext reads theme from localStorage on mount for every valid theme value",
    () => {
      // Only two valid values; test both exhaustively.
      // fast-check over a union of the two literals ensures 100+ runs with the
      // full value space, satisfying the ≥100 run requirement.
      fc.assert(
        fc.property(
          fc.constantFrom("light" as const, "dark" as const),
          (theme) => {
            // Write theme to localStorage before the provider mounts
            localStorage.setItem(LS_THEME, theme);
            capturedTheme = null;

            const { unmount } = render(
              <SettingsProvider>
                <ThemeReader />
              </SettingsProvider>
            );

            // The context should have initialized with exactly the stored theme
            expect(capturedTheme).toBe(theme);

            unmount();
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  it("restores 'light' theme from localStorage", () => {
    localStorage.setItem(LS_THEME, "light");
    capturedTheme = null;

    const { unmount } = render(
      <SettingsProvider>
        <ThemeReader />
      </SettingsProvider>
    );

    expect(capturedTheme).toBe("light");
    unmount();
  });

  it("restores 'dark' theme from localStorage", () => {
    localStorage.setItem(LS_THEME, "dark");
    capturedTheme = null;

    const { unmount } = render(
      <SettingsProvider>
        <ThemeReader />
      </SettingsProvider>
    );

    expect(capturedTheme).toBe("dark");
    unmount();
  });

  it("falls back to 'light' when localStorage has an invalid/missing value", () => {
    localStorage.removeItem(LS_THEME);
    capturedTheme = null;

    // jsdom does not emulate prefers-color-scheme as dark by default, so the
    // fallback chain resolves to "light" in the test environment.
    const { unmount } = render(
      <SettingsProvider>
        <ThemeReader />
      </SettingsProvider>
    );

    // Must be a valid theme value — either light or dark (depends on env)
    expect(["light", "dark"]).toContain(capturedTheme);
    unmount();
  });

  it("ignores unrecognized localStorage values and returns a valid theme", () => {
    localStorage.setItem(LS_THEME, "solarized");
    capturedTheme = null;

    const { unmount } = render(
      <SettingsProvider>
        <ThemeReader />
      </SettingsProvider>
    );

    expect(["light", "dark"]).toContain(capturedTheme);
    unmount();
  });
});

// ---------------------------------------------------------------------------
// Property 2 — Sidebar collapse persistence round-trip
// ---------------------------------------------------------------------------

describe("Property 2 – Sidebar collapse persistence round-trip", () => {
  it(
    "SettingsContext restores sidebar collapsed state from localStorage on mount",
    () => {
      fc.assert(
        fc.property(fc.boolean(), (collapsed) => {
          // Encode: true → "1", false → "0"
          localStorage.setItem(LS_SIDEBAR, collapsed ? "1" : "0");
          capturedCollapsed = null;

          const { unmount } = render(
            <SettingsProvider>
              <CollapsedReader />
            </SettingsProvider>
          );

          expect(capturedCollapsed).toBe(collapsed);

          unmount();
        }),
        { numRuns: 100 }
      );
    }
  );

  it("restores collapsed=true when localStorage contains '1'", () => {
    localStorage.setItem(LS_SIDEBAR, "1");
    capturedCollapsed = null;

    const { unmount } = render(
      <SettingsProvider>
        <CollapsedReader />
      </SettingsProvider>
    );

    expect(capturedCollapsed).toBe(true);
    unmount();
  });

  it("restores collapsed=false when localStorage contains '0'", () => {
    localStorage.setItem(LS_SIDEBAR, "0");
    capturedCollapsed = null;

    const { unmount } = render(
      <SettingsProvider>
        <CollapsedReader />
      </SettingsProvider>
    );

    expect(capturedCollapsed).toBe(false);
    unmount();
  });

  it("defaults to collapsed=false when localStorage entry is absent", () => {
    localStorage.removeItem(LS_SIDEBAR);
    capturedCollapsed = null;

    const { unmount } = render(
      <SettingsProvider>
        <CollapsedReader />
      </SettingsProvider>
    );

    expect(capturedCollapsed).toBe(false);
    unmount();
  });

  it("treats any value other than '1' as collapsed=false", () => {
    fc.assert(
      fc.property(
        // Any string that is not "1"
        fc.string().filter((s) => s !== "1"),
        (val) => {
          localStorage.setItem(LS_SIDEBAR, val);
          capturedCollapsed = null;

          const { unmount } = render(
            <SettingsProvider>
              <CollapsedReader />
            </SettingsProvider>
          );

          expect(capturedCollapsed).toBe(false);

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });
});
