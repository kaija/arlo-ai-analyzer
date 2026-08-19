/**
 * tauri-mock.ts
 *
 * Browser-mode stub for @tauri-apps/api/core and @tauri-apps/api/event.
 * Only active in Vite dev server (no real Tauri IPC available).
 * Provides enough fixture data to render the full dashboard chart.
 */

import type { Session } from "./types";

// ---------------------------------------------------------------------------
// Fixture data — 90 days of realistic sessions
// ---------------------------------------------------------------------------

function seedRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

const rng = seedRng(20260819);

const MODELS = [
  "claude-opus-4-5",
  "claude-sonnet-4-5",
  "claude-sonnet-4-5",
  "claude-sonnet-4-5",
  "claude-haiku-4-5",
  "claude-haiku-4-5",
];

const PROJECTS = [
  "arlo-ai-analyzer",
  "api-gateway",
  "design-system",
  "infra-terraform",
  "docs-site",
  "mobile-app",
];

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function isoDate(daysAgo: number): string {
  const d = new Date("2026-08-19");
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}

const MOCK_SESSIONS: Session[] = Array.from({ length: 275 }, (_, i) => {
  const model = randomElement(MODELS);
  const inputTokens = Math.floor(rng() * 800_000 + 50_000);
  const outputTokens = Math.floor(rng() * 120_000 + 10_000);
  const cacheWrite = Math.floor(rng() * 200_000);
  const cacheRead = Math.floor(rng() * 2_000_000);

  return {
    tool: "claude_code" as const,
    session_id: `sess_${i.toString(16).padStart(6, "0")}`,
    project: randomElement(PROJECTS),
    started_at: isoDate(Math.floor(rng() * 90)),
    model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_creation_tokens: cacheWrite,
    cache_read_tokens: cacheRead,
    message_count: Math.floor(rng() * 200 + 10),
  };
});

// ---------------------------------------------------------------------------
// invoke stub
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function invoke<T = unknown>(cmd: string, _args?: unknown): Promise<T> {
  if (cmd === "list_sessions") {
    return MOCK_SESSIONS as unknown as T;
  }
  if (cmd === "rescan") {
    // Simulate a short delay then return
    await new Promise((r) => setTimeout(r, 800));
    return undefined as unknown as T;
  }
  // Tauri dialog plugin
  if (cmd === "plugin:dialog|open") {
    return null as unknown as T;
  }
  return undefined as unknown as T;
}

// ---------------------------------------------------------------------------
// listen stub — returns an unlisten function
// ---------------------------------------------------------------------------

type UnlistenFn = () => void;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listen(_event: string, _handler: (e: any) => void): Promise<UnlistenFn> {
  return () => {};
}
