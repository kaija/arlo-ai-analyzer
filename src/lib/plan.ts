/**
 * Pure helpers for showing plan and quota status (`PlanReport` from the
 * backend). Wording lives in the locale files under `plans.*`; these pick the
 * key and its parameters, so every tool's windows are named the same way.
 */

import type { PlanIssue, PlanReport, PlanStatus, QuotaWindow } from "../types";

/** An i18n key and the values it interpolates. */
export interface Phrase {
  key: string;
  params?: Record<string, string | number>;
}

const HOUR = 60;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/**
 * Tools the dashboard card and the popover list: those signed in with a plan
 * that has limits, and those whose sign-in couldn't be read — so a failure
 * says why instead of the tool silently not being there. Signed out or on an
 * API key without a problem, a tool has no limits to show.
 */
export function planTools(report: PlanReport | null): PlanStatus[] {
  return (report?.tools ?? []).filter((t) => t.auth === "subscription" || t.issue !== null);
}

/** What a window limits, named by its length: "5-hour limit", "Weekly limit". */
export function windowPhrase(window: QuotaWindow): Phrase {
  const minutes = window.window_minutes;
  if (minutes === null) {
    return { key: window.id === "extra_usage" ? "plans.window.extraUsage" : "plans.window.other" };
  }
  if (minutes === WEEK) return { key: "plans.window.weekly" };
  if (minutes === DAY) return { key: "plans.window.daily" };
  if (minutes % DAY === 0) return { key: "plans.window.days", params: { count: minutes / DAY } };
  if (minutes % HOUR === 0) return { key: "plans.window.hours", params: { count: minutes / HOUR } };
  return { key: "plans.window.minutes", params: { count: minutes } };
}

/** The two largest units of a positive span, for "resets in 2h 14m". */
export function durationPhrase(ms: number): Phrase {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  const d = Math.floor(totalMinutes / DAY);
  const h = Math.floor((totalMinutes % DAY) / HOUR);
  const m = totalMinutes % HOUR;
  if (d > 0) return { key: "plans.duration.dh", params: { d, h } };
  if (h > 0) return { key: "plans.duration.hm", params: { h, m } };
  if (m > 0) return { key: "plans.duration.m", params: { m } };
  return { key: "plans.duration.lessThanMinute" };
}

/** Time until `resetsAt`, or null when there is none or it has passed. */
export function resetsInMs(resetsAt: string | null, now: number): number | null {
  if (resetsAt === null) return null;
  const at = Date.parse(resetsAt);
  if (Number.isNaN(at) || at <= now) return null;
  return at - now;
}

/** "just now" / "5 min ago" for when a snapshot was taken. */
export function agoPhrase(iso: string, now: number): Phrase {
  const at = Date.parse(iso);
  const minutes = Number.isNaN(at) ? 0 : Math.floor(Math.max(0, now - at) / 60_000);
  if (minutes < 1) return { key: "plans.ago.justNow" };
  if (minutes < HOUR) return { key: "plans.ago.minutes", params: { count: minutes } };
  if (minutes < DAY) return { key: "plans.ago.hours", params: { count: Math.floor(minutes / HOUR) } };
  return { key: "plans.ago.days", params: { count: Math.floor(minutes / DAY) } };
}

/** The key explaining an issue; `failed` carries its detail for a tooltip. */
export function issueKey(issue: PlanIssue): string {
  return `plans.issue.${issue.kind}`;
}

/** 0–100, whatever the vendor sent (extra usage can run past 100). */
export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}
