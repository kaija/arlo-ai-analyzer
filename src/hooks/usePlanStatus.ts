import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { PlanReport } from "../types";

export interface PlanStatusState {
  /** null until the first answer from the backend. */
  report: PlanReport | null;
  refreshing: boolean;
  /** Re-detect now; asks the vendors too while live checks are on. */
  refresh: () => Promise<void>;
  setOnline: (enabled: boolean) => Promise<void>;
}

/**
 * The plan/quota report, kept current by the backend's `plan-status-updated`
 * event. Detection runs in the background (src-tauri/src/plans.rs), so reading
 * the report is cheap and each consumer can hold its own copy.
 */
export function usePlanStatus(): PlanStatusState {
  const [report, setReport] = useState<PlanReport | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const load = () =>
      invoke<PlanReport>("get_plan_status").then(setReport).catch(() => {});
    void load();
    const unlisten = listen("plan-status-updated", () => void load());
    return () => void unlisten.then((fn) => fn());
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setReport(await invoke<PlanReport>("refresh_plan_status"));
    } catch {
      // Failures are part of the report itself; nothing else to show.
    } finally {
      setRefreshing(false);
    }
  }, []);

  const setOnline = useCallback(async (enabled: boolean) => {
    try {
      setReport(await invoke<PlanReport>("set_plan_online_enabled", { enabled }));
    } catch {
      // Unchanged; the switch keeps showing the stored state.
    }
  }, []);

  return { report, refreshing, refresh, setOnline };
}
