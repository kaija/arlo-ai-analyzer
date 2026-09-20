import { describe, expect, it } from "vitest";
import { bucketByDay, bucketByHour, filterByDateRange } from "./aggregate";
import type { Session } from "../types";

const session: Session = {
  tool: "claude_code",
  session_id: "local-calendar-session",
  project: "/tmp/project",
  // This falls on the following calendar day and hour in UTC+8.
  started_at: "2026-09-18T18:30:00Z",
  model: "claude-sonnet-4",
  input_tokens: 100,
  output_tokens: 50,
  cache_creation_tokens: 0,
  cache_write_5m: 0,
  cache_write_1h: 0,
  cache_read_tokens: 0,
  peak_context_tokens: 150,
  peak_context_model: "claude-sonnet-4",
  compaction_count: 0,
  message_count: 1,
  cost_usd: 0.01,
};

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

describe("dashboard calendar time", () => {
  it("uses the device-local day and hour for filtering and chart buckets", () => {
    const localTime = new Date(session.started_at);
    const day = localDateKey(localTime);
    const hour = localTime.getHours();

    expect(filterByDateRange([session], day, day)).toEqual([session]);

    const [dayBucket] = bucketByDay([session], { start: day, end: day });
    expect(dayBucket.tokens).toBe(150);

    const hourlyBuckets = bucketByHour([session], day);
    expect(hourlyBuckets[hour].tokens).toBe(150);
  });
});
