import { describe, it, expect } from "vitest";
import { fmtTokens, fmtCost, fmtDate, fmtTime, fmtDuration } from "./format";

// Requirements: 3.1

describe("fmtTokens", () => {
  it("returns '0' for zero", () => {
    expect(fmtTokens(0)).toBe("0");
  });

  it("returns plain number for values below 1,000", () => {
    expect(fmtTokens(999)).toBe("999");
    expect(fmtTokens(1)).toBe("1");
    expect(fmtTokens(500)).toBe("500");
  });

  it("returns K suffix for exactly 1,000", () => {
    expect(fmtTokens(1_000)).toBe("1K");
  });

  it("returns K suffix with decimal for non-round thousands", () => {
    expect(fmtTokens(1_500)).toBe("1.5K");
  });

  it("returns K suffix for 999,999 (just below 1M)", () => {
    expect(fmtTokens(999_999)).toBe("1000K");
  });

  it("returns M suffix for exactly 1,000,000", () => {
    expect(fmtTokens(1_000_000)).toBe("1M");
  });

  it("returns M suffix with decimal for non-round millions", () => {
    expect(fmtTokens(1_500_000)).toBe("1.5M");
  });

  it("returns B suffix for values >= 1,000,000,000", () => {
    expect(fmtTokens(1_000_000_000)).toBe("1B");
    expect(fmtTokens(2_500_000_000)).toBe("2.5B");
  });

  it("formats negative values with a leading minus sign", () => {
    expect(fmtTokens(-999)).toBe("-999");
    expect(fmtTokens(-1_000)).toBe("-1K");
    expect(fmtTokens(-1_500_000)).toBe("-1.5M");
  });

  it("trims trailing .0 from suffix formatting", () => {
    // 2,000 → "2K", not "2.0K"
    expect(fmtTokens(2_000)).toBe("2K");
    // 3,000,000 → "3M", not "3.0M"
    expect(fmtTokens(3_000_000)).toBe("3M");
  });
});

describe("fmtCost", () => {
  it("formats zero as '$0.00'", () => {
    expect(fmtCost(0)).toBe("$0.00");
  });

  it("rounds sub-cent values (0.001 → '$0.00')", () => {
    expect(fmtCost(0.001)).toBe("$0.00");
  });

  it("formats fractional dollar values correctly", () => {
    expect(fmtCost(1.5)).toBe("$1.50");
  });

  it("formats large values with exactly two decimal places", () => {
    expect(fmtCost(999.99)).toBe("$999.99");
  });

  it("formats negative costs with a leading minus sign before the dollar symbol", () => {
    expect(fmtCost(-0.5)).toBe("-$0.50");
    expect(fmtCost(-10)).toBe("-$10.00");
  });
});

describe("fmtDate", () => {
  it("keeps the year for dates outside the current year", () => {
    // Noon UTC avoids a local-timezone rollover at midnight.
    expect(fmtDate("2023-12-31T12:00:00Z")).toMatch(
      /^31 Dec 2023, \d{2}:\d{2}$/,
    );
  });

  it("drops the year for dates in the current year", () => {
    const now = new Date();
    const sameYear = new Date(now.getFullYear(), 5, 15, 12, 0, 0);
    const out = fmtDate(sameYear.toISOString());
    expect(out).not.toContain(String(now.getFullYear()));
    expect(out).toMatch(/^15 Jun, \d{2}:\d{2}$/);
  });

  it("always carries a time — the date alone repeats on every row", () => {
    expect(fmtDate("2023-12-31T12:00:00Z")).toMatch(/\d{2}:\d{2}$/);
  });

  it("returns an em dash for a missing or unparseable timestamp", () => {
    expect(fmtDate("")).toBe("—");
    expect(fmtDate("nope")).toBe("—");
  });
});

describe("fmtDuration", () => {
  it("returns '0s' when start equals end", () => {
    expect(fmtDuration("2024-01-01T00:00:00Z", "2024-01-01T00:00:00Z")).toBe("0s");
  });

  it("returns '0s' when end is before start", () => {
    expect(fmtDuration("2024-01-01T01:00:00Z", "2024-01-01T00:00:00Z")).toBe("0s");
  });

  it("formats sub-minute durations as seconds", () => {
    expect(fmtDuration("2024-01-01T00:00:00Z", "2024-01-01T00:00:45Z")).toBe("45s");
  });

  it("formats minute-level durations with seconds", () => {
    expect(fmtDuration("2024-01-01T00:00:00Z", "2024-01-01T00:15:30Z")).toBe("15m 30s");
  });

  it("formats exact-minute durations without seconds part", () => {
    expect(fmtDuration("2024-01-01T00:00:00Z", "2024-01-01T00:05:00Z")).toBe("5m");
  });

  it("formats hour-level durations with minutes", () => {
    expect(fmtDuration("2024-01-01T00:00:00Z", "2024-01-01T02:15:00Z")).toBe("2h 15m");
  });

  it("formats exact-hour durations without minutes part", () => {
    expect(fmtDuration("2024-01-01T00:00:00Z", "2024-01-01T03:00:00Z")).toBe("3h");
  });

  it("formats day-level durations with hours", () => {
    expect(fmtDuration("2024-01-01T00:00:00Z", "2024-01-04T02:00:00Z")).toBe("3d 2h");
  });

  it("formats exact-day durations without hours part", () => {
    expect(fmtDuration("2024-01-01T00:00:00Z", "2024-01-04T00:00:00Z")).toBe("3d");
  });
});

describe("fmtTime", () => {
  it("renders a 24-hour clock so row order is legible", () => {
    expect(fmtTime("2026-08-19T10:30:05Z")).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it("returns an em dash for a missing or unparseable timestamp", () => {
    expect(fmtTime("")).toBe("—");
    expect(fmtTime("not-a-date")).toBe("—");
  });
});
