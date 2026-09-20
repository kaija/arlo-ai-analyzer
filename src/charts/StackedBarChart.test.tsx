import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StackedBarChart } from "./StackedBarChart";
import { UsageChartCard } from "../pages/Dashboard/UsageChartCard";
import type { BucketData, Dimension } from "../types";

afterEach(cleanup);

const dims: Dimension[] = [
  { key: "claude-sonnet-4", name: "claude-sonnet-4", color: "#7c3aed" },
  { key: "claude-haiku-4", name: "claude-haiku-4", color: "#f97316" },
];

const buckets: BucketData[] = [
  {
    label: "Sep 19",
    total: 1_500,
    values: {
      "claude-sonnet-4": 1_200,
      "claude-haiku-4": 300,
    },
  },
];

describe("StackedBarChart discoverability", () => {
  it("shows the model and its token count in a visible tooltip on hover", () => {
    render(<StackedBarChart buckets={buckets} dims={dims} measure="tokens" />);

    fireEvent.pointerMove(screen.getByRole("listitem"), { clientX: 20 });

    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveClass("show");
    expect(tooltip).toHaveTextContent("claude-sonnet-4");
    expect(tooltip).toHaveTextContent("1.2K");
    expect(tooltip).toHaveTextContent("claude-haiku-4");
    expect(tooltip).toHaveTextContent("300");
  });

  it("displays a colour legend for every stack dimension above the chart", () => {
    render(
      <UsageChartCard
        buckets={buckets}
        dims={dims}
        measure="tokens"
        granularity="day"
        stackBy="model"
        kindOn={{
          input: true,
          output: true,
          cache_write_5m: true,
          cache_write_1h: true,
          cache_read: true,
        }}
        kindTotals={{
          input: 0,
          output: 0,
          cache_write_5m: 0,
          cache_write_1h: 0,
          cache_read: 0,
        }}
        drillDayIndex={null}
        drillLabel={null}
        onBarClick={() => {}}
        onKindToggle={() => {}}
        onClearDrill={() => {}}
      />,
    );

    const legend = screen.getByRole("list", { name: "Chart legend" });
    expect(legend).toHaveTextContent("claude-sonnet-4");
    expect(legend).toHaveTextContent("claude-haiku-4");
    expect(legend.querySelector('[style*="rgb(124, 58, 237)"]')).not.toBeNull();
    expect(legend.querySelector('[style*="rgb(249, 115, 22)"]')).not.toBeNull();
  });
});
