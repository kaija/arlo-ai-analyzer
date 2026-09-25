/**
 * tauri-mock.ts
 *
 * Browser-mode stub for @tauri-apps/api/core and @tauri-apps/api/event.
 * Only active in Vite dev server (no real Tauri IPC available).
 *
 * All commands return empty / no-op responses — run `make dev` with the
 * full Tauri runtime to get real data.
 */

// ---------------------------------------------------------------------------
// invoke stub
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function invoke<T = unknown>(cmd: string, _args?: unknown): Promise<T> {
  if (cmd === "list_sessions") {
    return [] as unknown as T;
  }
  if (cmd === "get_tool_usage") {
    return { sessions: [], listed: [] } as unknown as T;
  }
  if (cmd === "get_session_detail") {
    return { requests: [], compactions: [], transcript_path: null } as unknown as T;
  }
  if (cmd === "reset_database") {
    await new Promise((r) => setTimeout(r, 300));
    return 0 as unknown as T;
  }
  if (cmd === "rescan") {
    await new Promise((r) => setTimeout(r, 300));
    return undefined as unknown as T;
  }
  if (
    cmd === "get_data_access" ||
    cmd === "grant_source_access" ||
    cmd === "clear_source_access" ||
    cmd === "set_sample_data"
  ) {
    return {
      sample: false,
      sandboxed: false,
      sources: [
        { tool: "claude_code", path: "~/.claude/projects", granted: false, readable: false, detected: true },
        { tool: "codex_cli", path: "~/.codex/sessions", granted: false, readable: false, detected: true },
      ],
    } as unknown as T;
  }
  if (cmd === "get_price_catalog") {
    return null as unknown as T;
  }
  if (
    cmd === "get_price_catalog_status" ||
    cmd === "set_price_catalog_enabled" ||
    cmd === "check_price_catalog"
  ) {
    return {
      enabled: (_args as { enabled?: boolean } | undefined)?.enabled ?? true,
      url: "https://ai-analyzer.arlo-ai.app/models.json",
      last_checked: null,
      last_updated: null,
      last_error: null,
      generated_at: null,
      model_count: 0,
    } as unknown as T;
  }
  if (cmd === "get_plan_status" || cmd === "refresh_plan_status" || cmd === "set_plan_online_enabled") {
    return {
      online: (_args as { enabled?: boolean } | undefined)?.enabled ?? false,
      checked_at: null,
      live_checked_at: null,
      tools: [],
    } as unknown as T;
  }
  return undefined as unknown as T;
}

// ---------------------------------------------------------------------------
// opener stub — no OS to hand the path to in browser mode
// ---------------------------------------------------------------------------

export async function openPath(path: string): Promise<void> {
  console.info("[tauri-mock] openPath:", path);
}

export async function openUrl(url: string): Promise<void> {
  console.info("[tauri-mock] openUrl:", url);
}

// ---------------------------------------------------------------------------
// listen stub — returns an unlisten function
// ---------------------------------------------------------------------------

type UnlistenFn = () => void;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listen(_event: string, _handler: (e: any) => void): Promise<UnlistenFn> {
  return () => {};
}
