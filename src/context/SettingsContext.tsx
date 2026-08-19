import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { NotificationSettings } from "../types";

// ---------------------------------------------------------------------------
// localStorage keys
// ---------------------------------------------------------------------------

const KEY_THEME = "arlo-theme";
const KEY_SIDEBAR = "arlo-sidebar-collapsed";
const KEY_PLAN_PRICE = "arlo-plan-price";
const KEY_MONTHLY_BUDGET = "arlo-monthly-budget";
const KEY_CONTEXT_THRESHOLD = "arlo-context-threshold";
const KEY_NOTIFICATIONS = "arlo-notifications";

// ---------------------------------------------------------------------------
// Default values
// ---------------------------------------------------------------------------

const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  contextAlerts: true,
  dailyDigest: true,
  budgetWarnings: true,
};

function defaultTheme(): "light" | "dark" {
  try {
    const stored = localStorage.getItem(KEY_THEME);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // localStorage may be unavailable in some test environments
  }
  if (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }
  return "light";
}

function defaultSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(KEY_SIDEBAR) === "1";
  } catch {
    return false;
  }
}

function defaultPlanPrice(): number {
  try {
    const raw = localStorage.getItem(KEY_PLAN_PRICE);
    if (raw !== null) {
      const n = parseFloat(raw);
      if (isFinite(n) && n >= 0) return n;
    }
  } catch {
    // ignore
  }
  return 200.0;
}

function defaultMonthlyBudget(): number {
  try {
    const raw = localStorage.getItem(KEY_MONTHLY_BUDGET);
    if (raw !== null) {
      const n = parseFloat(raw);
      if (isFinite(n) && n >= 0) return n;
    }
  } catch {
    // ignore
  }
  return 1000.0;
}

function defaultContextThreshold(): number {
  try {
    const raw = localStorage.getItem(KEY_CONTEXT_THRESHOLD);
    if (raw !== null) {
      const n = parseInt(raw, 10);
      if (isFinite(n) && n >= 50 && n <= 95) return n;
    }
  } catch {
    // ignore
  }
  return 75;
}

function defaultNotifications(): NotificationSettings {
  try {
    const raw = localStorage.getItem(KEY_NOTIFICATIONS);
    if (raw !== null) {
      const parsed = JSON.parse(raw) as unknown;
      if (
        parsed !== null &&
        typeof parsed === "object" &&
        "contextAlerts" in parsed &&
        "dailyDigest" in parsed &&
        "budgetWarnings" in parsed
      ) {
        const p = parsed as Record<string, unknown>;
        return {
          contextAlerts: Boolean(p.contextAlerts),
          dailyDigest: Boolean(p.dailyDigest),
          budgetWarnings: Boolean(p.budgetWarnings),
        };
      }
    }
  } catch {
    // JSON.parse failed — fall back to defaults
  }
  return DEFAULT_NOTIFICATIONS;
}

// ---------------------------------------------------------------------------
// applyTheme helper — also called by consumers directly if needed
// ---------------------------------------------------------------------------

export function applyTheme(theme: "light" | "dark") {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(KEY_THEME, theme);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

interface SettingsState {
  theme: "light" | "dark";
  toggleTheme: () => void;

  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;

  monthlyPlanPrice: number;
  setMonthlyPlanPrice: (value: number) => void;

  monthlyBudget: number;
  setMonthlyBudget: (value: number) => void;

  contextAlertThreshold: number;
  setContextAlertThreshold: (value: number) => void;

  notifications: NotificationSettings;
  setNotifications: (value: NotificationSettings) => void;
  setNotification: (
    key: keyof NotificationSettings,
    value: boolean
  ) => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const SettingsContext = createContext<SettingsState | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<"light" | "dark">(defaultTheme);
  const [sidebarCollapsed, setSidebarCollapsedState] = useState<boolean>(
    defaultSidebarCollapsed
  );
  const [monthlyPlanPrice, setMonthlyPlanPriceState] =
    useState<number>(defaultPlanPrice);
  const [monthlyBudget, setMonthlyBudgetState] =
    useState<number>(defaultMonthlyBudget);
  const [contextAlertThreshold, setContextAlertThresholdState] =
    useState<number>(defaultContextThreshold);
  const [notifications, setNotificationsState] =
    useState<NotificationSettings>(defaultNotifications);

  // Apply theme to DOM on first mount
  useEffect(() => {
    applyTheme(theme);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === "light" ? "dark" : "light";
      applyTheme(next);
      return next;
    });
  }, []);

  const setSidebarCollapsed = useCallback((collapsed: boolean) => {
    setSidebarCollapsedState(collapsed);
    try {
      localStorage.setItem(KEY_SIDEBAR, collapsed ? "1" : "0");
    } catch {
      // ignore
    }
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsedState((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(KEY_SIDEBAR, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const setMonthlyPlanPrice = useCallback((value: number) => {
    setMonthlyPlanPriceState(value);
    try {
      localStorage.setItem(KEY_PLAN_PRICE, value.toFixed(2));
    } catch {
      // ignore
    }
  }, []);

  const setMonthlyBudget = useCallback((value: number) => {
    setMonthlyBudgetState(value);
    try {
      localStorage.setItem(KEY_MONTHLY_BUDGET, value.toFixed(2));
    } catch {
      // ignore
    }
  }, []);

  const setContextAlertThreshold = useCallback((value: number) => {
    setContextAlertThresholdState(value);
    try {
      localStorage.setItem(KEY_CONTEXT_THRESHOLD, String(value));
    } catch {
      // ignore
    }
  }, []);

  const setNotifications = useCallback((value: NotificationSettings) => {
    setNotificationsState(value);
    try {
      localStorage.setItem(KEY_NOTIFICATIONS, JSON.stringify(value));
    } catch {
      // ignore
    }
  }, []);

  const setNotification = useCallback(
    (key: keyof NotificationSettings, value: boolean) => {
      setNotificationsState((prev) => {
        const next = { ...prev, [key]: value };
        try {
          localStorage.setItem(KEY_NOTIFICATIONS, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    },
    []
  );

  return (
    <SettingsContext.Provider
      value={{
        theme,
        toggleTheme,
        sidebarCollapsed,
        toggleSidebar,
        setSidebarCollapsed,
        monthlyPlanPrice,
        setMonthlyPlanPrice,
        monthlyBudget,
        setMonthlyBudget,
        contextAlertThreshold,
        setContextAlertThreshold,
        notifications,
        setNotifications,
        setNotification,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Consumer hook
// ---------------------------------------------------------------------------

export function useSettingsContext(): SettingsState {
  const ctx = useContext(SettingsContext);
  if (ctx === null) {
    throw new Error(
      "useSettingsContext must be used inside <SettingsProvider>"
    );
  }
  return ctx;
}
