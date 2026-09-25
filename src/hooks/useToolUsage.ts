import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ToolUsageReport } from "../types";

/**
 * The cross-session tool report, re-read after every rescan. Only the Tools
 * page needs it, so it is fetched there rather than carried by
 * SessionsContext with every session.
 */
export function useToolUsage(): { report: ToolUsageReport | null; error: string | null } {
  const [report, setReport] = useState<ToolUsageReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const load = () =>
      invoke<ToolUsageReport>("get_tool_usage")
        .then((r) => {
          setReport(r ?? { sessions: [], listed: [] });
          setError(null);
        })
        .catch((e) => setError(String(e)));
    void load();
    const unlisten = listen("usage-updated", () => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => void load(), 500);
    });
    return () => {
      if (timer !== null) clearTimeout(timer);
      void unlisten.then((fn) => fn());
    };
  }, []);

  return { report, error };
}
