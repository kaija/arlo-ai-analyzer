import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Session } from "./types";

export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    invoke<Session[]>("list_sessions")
      .then(setSessions)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
    const unlisten = listen("usage-updated", refresh);
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [refresh]);

  return { sessions, loading, refresh };
}
