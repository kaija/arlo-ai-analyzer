import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { DataAccess, Session, ToolKind } from "../types";
import { loadPriceCatalog } from "../lib/price-catalog";

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

interface SessionsState {
  sessions: Session[];
  loading: boolean;
  scanState: "idle" | "scanning" | "done" | "error";
  scanError: string | null;
  refresh: () => Promise<void>;
  triggerRescan: () => Promise<void>;
  /** Which folders are read; null until the first answer from the backend. */
  access: DataAccess | null;
  /**
   * Open the folder picker for a tool's logs; `title` is the panel's prompt.
   * Resolves to the new access state — unchanged if the user cancelled.
   */
  grantAccess: (tool: ToolKind, title: string) => Promise<DataAccess>;
  /** Forget a picked folder; the tool falls back to its default location. */
  clearAccess: (tool: ToolKind) => Promise<DataAccess>;
  setSampleData: (enabled: boolean) => Promise<DataAccess>;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const SessionsContext = createContext<SessionsState | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function SessionsProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanState, setScanState] = useState<
    "idle" | "scanning" | "done" | "error"
  >("idle");
  const [scanError, setScanError] = useState<string | null>(null);
  const [access, setAccess] = useState<DataAccess | null>(null);

  // Used to debounce the "usage-updated" event re-fetch (500 ms)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    setScanError(null);
    try {
      const result = await invoke<Session[]>("list_sessions");
      setSessions(result);
      setScanState("done");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : String(err ?? "Unknown error");
      setScanState("error");
      setScanError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const triggerRescan = useCallback(async () => {
    setScanState("scanning");
    setScanError(null);
    try {
      await invoke("rescan");
      // The backend will emit "usage-updated" when done; refresh handles it.
      // But also do a direct refresh in case the event fires before we listen.
      await refresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : String(err ?? "Unknown error");
      setScanState("error");
      setScanError(message);
    }
  }, [refresh]);

  // The access commands rescan and emit "usage-updated" themselves; refreshing
  // here as well just makes the new sessions show up without the debounce.
  const changeAccess = useCallback(
    async (cmd: string, args: Record<string, unknown>) => {
      const next = await invoke<DataAccess>(cmd, args);
      setAccess(next);
      await refresh();
      return next;
    },
    [refresh],
  );

  const grantAccess = useCallback(
    (tool: ToolKind, title: string) => changeAccess("grant_source_access", { tool, title }),
    [changeAccess],
  );
  const clearAccess = useCallback(
    (tool: ToolKind) => changeAccess("clear_source_access", { tool }),
    [changeAccess],
  );
  const setSampleData = useCallback(
    (enabled: boolean) => changeAccess("set_sample_data", { enabled }),
    [changeAccess],
  );

  useEffect(() => {
    // Initial load. The price catalog goes first so the first render already
    // prices models only the downloaded catalog knows.
    void loadPriceCatalog().then(refresh);
    invoke<DataAccess>("get_data_access")
      .then(setAccess)
      .catch(() => {});

    // Listen for backend "usage-updated" events; debounce re-fetches by 500 ms
    const unlistenPromise = listen("usage-updated", () => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        refresh();
      }, 500);
    });

    // A new catalog (or the online-updates switch) changes what `rateFor`
    // returns. Costs are derived in memos keyed on `sessions`, so a fresh
    // array is what makes every view recompute.
    const unlistenCatalog = listen("price-catalog-updated", () => {
      void loadPriceCatalog().then(() => setSessions((prev) => [...prev]));
    });

    return () => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
      }
      unlistenPromise.then((fn) => fn());
      unlistenCatalog.then((fn) => fn());
    };
  }, [refresh]);

  return (
    <SessionsContext.Provider
      value={{
        sessions,
        loading,
        scanState,
        scanError,
        refresh,
        triggerRescan,
        access,
        grantAccess,
        clearAccess,
        setSampleData,
      }}
    >
      {children}
    </SessionsContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Consumer hook
// ---------------------------------------------------------------------------

export function useSessionsContext(): SessionsState {
  const ctx = useContext(SessionsContext);
  if (ctx === null) {
    throw new Error("useSessionsContext must be used inside <SessionsProvider>");
  }
  return ctx;
}
