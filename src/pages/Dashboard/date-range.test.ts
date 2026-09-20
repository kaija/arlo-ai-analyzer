import { afterEach, describe, expect, it, vi } from "vitest";
import { dateRangeForPreset } from "./index";

afterEach(() => vi.useRealTimers());

describe("Dashboard month-to-date preset", () => {
  it("starts on the first local calendar day of the current month", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 19, 10, 30));

    expect(dateRangeForPreset("mtd")).toEqual({
      start: "2026-09-01",
      end: "2026-09-19",
    });
  });
});
