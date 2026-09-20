import { useState, useRef, useCallback } from "react";
import type { BucketData, Dimension, Measure } from "../types";
import { fmtTokens, fmtCost } from "../lib/format";

export interface StackedBarChartProps {
  buckets: BucketData[];
  dims: Dimension[];
  measure: Measure;
  onBarClick?: (bucketIndex: number) => void;
  drillable?: boolean;
}

interface TooltipState {
  visible: boolean;
  x: number; // pixel offset from chart left edge
  bucketIndex: number;
  flipLeft: boolean;
}

/** Round a max value up to a "nice" scale maximum. */
function niceMax(value: number): number {
  if (value === 0) return 100;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const steps = [1, 2, 2.5, 5, 10];
  for (const step of steps) {
    const candidate = Math.ceil(value / (magnitude * step)) * magnitude * step;
    if (candidate >= value) return candidate;
  }
  return value;
}

/** Format a y-axis tick value according to the active measure. */
function fmtYTick(value: number, measure: Measure): string {
  if (value === 0) return "0";
  if (measure === "cost") return fmtCost(value);
  if (measure === "tokens") return fmtTokens(value);
  // requests — plain integer with K suffix
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(value);
}

/**
 * StackedBarChart — CSS-layout stacked bar chart (no SVG).
 *
 * Structure:
 *   .sbc-wrap
 *   ├── .sbc-y-axis       (5 label spans: 100% → 0%)
 *   └── .sbc-plot-area
 *       ├── .sbc-gridlines (4 gridlines)
 *       ├── .sbc-bars      (flex row of .bar-col divs)
 *       ├── .sbc-x-axis   (label row)
 *       └── .chart-tooltip (absolutely positioned)
 */
export function StackedBarChart({
  buckets,
  dims,
  measure,
  onBarClick,
  drillable = false,
}: StackedBarChartProps) {
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    bucketIndex: 0,
    flipLeft: false,
  });
  const plotRef = useRef<HTMLDivElement>(null);

  const maxTotal = Math.max(...buckets.map((b) => b.total), 0);
  const scale = niceMax(maxTotal);

  // Y-axis labels: 100%, 75%, 50%, 25%, 0%
  const yTicks = [1, 0.75, 0.5, 0.25, 0];

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, index: number) => {
      const plot = plotRef.current;
      if (!plot) return;
      const rect = plot.getBoundingClientRect();
      const xInPlot = e.clientX - rect.left;
      // Flip tooltip to the left when within 160 px of the right edge
      const flipLeft = xInPlot > rect.width - 160;
      setTooltip({ visible: true, x: xInPlot, bucketIndex: index, flipLeft });
    },
    []
  );

  const handlePointerLeave = useCallback(() => {
    setTooltip((prev) => ({ ...prev, visible: false }));
  }, []);

  const handleBarClick = useCallback(
    (index: number) => {
      if (drillable && onBarClick) {
        onBarClick(index);
      }
    },
    [drillable, onBarClick]
  );

  const handleBarKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>, index: number) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleBarClick(index);
      }
    },
    [handleBarClick]
  );

  const activeBucket =
    tooltip.visible && buckets[tooltip.bucketIndex]
      ? buckets[tooltip.bucketIndex]
      : null;

  return (
    <div className="sbc-wrap">
      {/* Y-axis */}
      <div className="sbc-y-axis" aria-hidden="true">
        {yTicks.map((tick) => (
          <span key={tick} className="sbc-y-tick">
            {fmtYTick(scale * tick, measure)}
          </span>
        ))}
      </div>

      {/* Plot area: gridlines + bars + x-axis + tooltip */}
      <div
        className="sbc-plot-area"
        ref={plotRef}
        onPointerLeave={handlePointerLeave}
      >
        {/* Gridlines */}
        <div className="sbc-gridlines" aria-hidden="true">
          {[0.75, 0.5, 0.25, 0].map((tick) => (
            <div
              key={tick}
              className="sbc-gridline"
              style={{ bottom: `${tick * 100}%` }}
            />
          ))}
        </div>

        {/* Bars */}
        <div className="sbc-bars" role="list" aria-label="Usage chart">
          {buckets.map((bucket, i) => {
            const barHeightPct =
              scale > 0 ? (bucket.total / scale) * 100 : 0;
            const isActive =
              tooltip.visible && tooltip.bucketIndex === i;

            return (
              <div
                key={i}
                className={`bar-col${drillable ? " drillable" : ""}${isActive ? " hovered" : ""}`}
                role="listitem"
                aria-label={`${bucket.label}: ${fmtYTick(bucket.total, measure)}`}
                tabIndex={drillable ? 0 : -1}
                onPointerMove={(e) => handlePointerMove(e, i)}
                onClick={() => handleBarClick(i)}
                onKeyDown={(e) => handleBarKeyDown(e, i)}
              >
                <div
                  className="stack"
                  style={{ height: `${barHeightPct}%` }}
                >
                  {dims.map((dim) => {
                    const dimValue = bucket.values[dim.key] ?? 0;
                    const segHeightPct =
                      bucket.total > 0
                        ? (dimValue / bucket.total) * 100
                        : 0;
                    if (segHeightPct === 0) return null;
                    return (
                      <div
                        key={dim.key}
                        className="bar-seg"
                        style={{
                          height: `${segHeightPct}%`,
                          backgroundColor: dim.color,
                        }}
                        aria-hidden="true"
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* X-axis labels — thin to ~10 visible labels to avoid crowding */}
        <div className="sbc-x-axis" aria-hidden="true">
          {buckets.map((bucket, i) => {
            // Show label every Nth bucket so we get ~10 labels regardless of count
            const step = Math.max(1, Math.round(buckets.length / 10));
            const show = i % step === 0;
            return (
              <span key={i} className="sbc-x-tick" style={{ visibility: show ? "visible" : "hidden" }}>
                {bucket.label}
              </span>
            );
          })}
        </div>

        {/* Tooltip */}
        {tooltip.visible && activeBucket && (
          <div
            className="chart-tooltip show"
            role="tooltip"
            style={{
              left: tooltip.flipLeft ? "auto" : `${tooltip.x}px`,
              right: tooltip.flipLeft
                ? `calc(100% - ${tooltip.x}px)`
                : "auto",
            }}
          >
            <div className="chart-tooltip-label">{activeBucket.label}</div>
            <div className="chart-tooltip-total">
              {fmtYTick(activeBucket.total, measure)}
            </div>
            {dims.map((dim) => {
              const v = activeBucket.values[dim.key] ?? 0;
              if (v === 0) return null;
              return (
                <div key={dim.key} className="chart-tooltip-row">
                  <span
                    className="chart-tooltip-swatch"
                    style={{ backgroundColor: dim.color }}
                  />
                  <span className="chart-tooltip-dim">{dim.name}</span>
                  <span className="chart-tooltip-val">
                    {fmtYTick(v, measure)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
