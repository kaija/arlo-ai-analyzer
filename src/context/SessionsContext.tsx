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
import type { Session } from "../types";

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

  useEffect(() => {
    // Initial load
    refresh();

    // Listen for backend "usage-updated" events; debounce re-fetches by 500 ms
    const unlistenPromise = listen("usage-updated", () => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        refresh();
      }, 500);
    });

    return () => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
      }
      unlistenPromise.then((fn) => fn());
    };
  }, [refresh]);

  return (
    <SessionsContext.Provider
      value={{ sessions, loading, scanState, scanError, refresh, triggerRescan }}
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
