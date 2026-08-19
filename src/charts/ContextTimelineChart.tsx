import { useRef, useState, useEffect, useCallback } from "react";
import { fmtTokens } from "../lib/format";

// ─── Public interfaces ────────────────────────────────────────────────────────

export interface RequestPoint {
  index: number;
  contextTokens: number;
}

export interface CompactionEvent {
  beforeIndex: number;
  preTokens: number;
  postTokens: number;
}

export interface ContextTimelineChartProps {
  requests: RequestPoint[];
  compactions: CompactionEvent[];
  ceiling: number;
  ceilingLabel: string;
}

// ─── Layout constants ─────────────────────────────────────────────────────────

const VIEW_W = 1000;
const VIEW_H = 220;
const PAD_L = 60;
const PAD_T = 20;
const PAD_B = 30;
const PAD_R = 20;
const PLOT_W = VIEW_W - PAD_L - PAD_R;
const PLOT_H = VIEW_H - PAD_T - PAD_B;

// ─── Coordinate helpers ───────────────────────────────────────────────────────

function xFn(i: number, n: number): number {
  return PAD_L + (i / Math.max(n - 1, 1)) * PLOT_W;
}

function yFn(tokens: number, ceiling: number): number {
  return PAD_T + PLOT_H - Math.min(tokens / ceiling, 1.08) * PLOT_H;
}

// ─── SVG path builders ────────────────────────────────────────────────────────

/** Build an SVG polyline "d" attribute from an array of [x,y] pairs. */
function pointsToPath(pts: [number, number][]): string {
  if (pts.length === 0) return "";
  return pts
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");
}

/**
 * Build a closed area-fill "d" attribute: trace the curve, then close down
 * to the x-axis (y = PAD_T + PLOT_H) and back to the start.
 */
function pointsToAreaPath(pts: [number, number][]): string {
  if (pts.length === 0) return "";
  const line = pointsToPath(pts);
  const lastX = pts[pts.length - 1][0].toFixed(2);
  const firstX = pts[0][0].toFixed(2);
  const baseline = (PAD_T + PLOT_H).toFixed(2);
  return `${line} L${lastX},${baseline} L${firstX},${baseline} Z`;
}

// ─── Segment splitting ────────────────────────────────────────────────────────

/**
 * Split a series of RequestPoints into N+1 contiguous segments around the N
 * compaction events.
 *
 * Each segment is a slice of the requests array — the segments overlap by
 * one point at the compaction boundary so curves join seamlessly.
 */
function splitSegments(
  requests: RequestPoint[],
  compactions: CompactionEvent[]
): RequestPoint[][] {
  if (requests.length === 0) return [[]];

  // Sort compaction indices ascending
  const boundaries = [...compactions]
    .map((c) => c.beforeIndex)
    .sort((a, b) => a - b);

  const segments: RequestPoint[][] = [];
  let start = 0;

  for (const boundary of boundaries) {
    // Clamp: boundary must be a valid index inside the array
    const end = Math.min(boundary, requests.length - 1);
    if (end >= start) {
      segments.push(requests.slice(start, end + 1));
    }
    start = end; // next segment starts at the same point (join overlap)
  }
  // Final (or only) segment
  segments.push(requests.slice(start));

  return segments;
}

// ─── Nearest-index snap ───────────────────────────────────────────────────────

/**
 * Given a pointer X in SVG viewBox coordinates, find the index in `requests`
 * that minimises |xFn(i, n) - pointerX|.
 */
function nearestIndex(pointerSvgX: number, n: number): number {
  if (n === 0) return 0;
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < n; i++) {
    const dist = Math.abs(xFn(i, n) - pointerSvgX);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * ContextTimelineChart
 *
 * SVG-based (viewBox 1000×220) chart showing how context token usage grows
 * across requests in a session, with compaction events as vertical markers.
 *
 * - Gridlines at 0 / 25 / 50 / 75 / 100 % of ceiling
 * - Dashed ceiling line with a label
 * - Area fill under the context curve
 * - Context curve split at compaction boundaries into N+1 path segments
 * - Compaction markers: dashed vertical line + open circles at pre/post points
 * - Filled end-point circle at the last request
 * - Crosshair interaction via transparent <rect> overlay, snapping to nearest index
 * - HTML annotation overlay (.ctx-annot) positioned per compaction event
 * - ResizeObserver re-renders when the container changes width
 */
export function ContextTimelineChart({
  requests,
  compactions,
  ceiling,
  ceilingLabel,
}: ContextTimelineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // containerWidth drives re-renders when the element resizes
  const [, setContainerWidth] = useState<number>(0);

  // Crosshair state: null means hidden
  const [crosshair, setCrosshair] = useState<{
    svgX: number;
    index: number;
  } | null>(null);

  // ── ResizeObserver ──────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setContainerWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Derived geometry ────────────────────────────────────────────────────────
  const n = requests.length;
  const safeCeiling = Math.max(ceiling, 1);
  const segments = splitSegments(requests, compactions);

  // Convert requests to SVG coords
  const points: [number, number][] = requests.map((r) => [
    xFn(r.index, n),
    yFn(r.contextTokens, safeCeiling),
  ]);

  // ── Pointer interaction ─────────────────────────────────────────────────────
  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGRectElement>) => {
      if (n === 0) return;
      const rect = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
      // Map client X → SVG viewBox X
      const scaleX = VIEW_W / rect.width;
      const svgX = (e.clientX - rect.left) * scaleX;
      const idx = nearestIndex(svgX, n);
      setCrosshair({ svgX: xFn(idx, n), index: idx });
    },
    [n]
  );

  const handlePointerLeave = useCallback(() => setCrosshair(null), []);

  // ── Render: empty state ─────────────────────────────────────────────────────
  if (n === 0) {
    return (
      <div
        ref={containerRef}
        className="ctx-chart-container"
        style={{ position: "relative" }}
      >
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          style={{ width: "100%", display: "block" }}
          aria-label="Context timeline chart — no data"
        >
          <text
            x={VIEW_W / 2}
            y={VIEW_H / 2}
            textAnchor="middle"
            fill="var(--muted-2)"
            fontSize="16"
          >
            No request data
          </text>
        </svg>
      </div>
    );
  }

  // ── Gridlines ───────────────────────────────────────────────────────────────
  const gridFractions = [1, 0.75, 0.5, 0.25, 0];
  const gridLines = gridFractions.map((frac) => {
    const y = PAD_T + PLOT_H * (1 - frac);
    const tokens = Math.round(safeCeiling * frac);
    return { y, label: frac === 0 ? "0" : fmtTokens(tokens) };
  });

  // ── Ceiling line ────────────────────────────────────────────────────────────
  const ceilingY = yFn(safeCeiling, safeCeiling);

  // ── All-points area fill ────────────────────────────────────────────────────
  const areaD = pointsToAreaPath(points);

  // ── Context curve segments ──────────────────────────────────────────────────
  const segmentPaths = segments.map((seg) => {
    const segPts: [number, number][] = seg.map((r) => [
      xFn(r.index, n),
      yFn(r.contextTokens, safeCeiling),
    ]);
    return pointsToPath(segPts);
  });

  // ── Crosshair resolved values ───────────────────────────────────────────────
  const crosshairRequest = crosshair !== null ? requests[crosshair.index] : null;
  const crosshairY =
    crosshairRequest !== null && crosshairRequest !== undefined
      ? yFn(crosshairRequest.contextTokens, safeCeiling)
      : 0;

  // ── Annotations: position each compaction annotation ───────────────────────
  // Derive left percentages relative to the full SVG viewBox width so the
  // HTML overlays track the SVG markers as the container resizes.
  const annotationItems = compactions.map((c) => {
    const svgX = xFn(c.beforeIndex, n);
    // svgX is in [0, VIEW_W] — express as percentage of full SVG width
    const leftPct = (svgX / VIEW_W) * 100;
    return { ...c, leftPct };
  });

  return (
    <div
      ref={containerRef}
      className="ctx-chart-container"
      style={{ position: "relative" }}
    >
      {/* ── SVG layer ───────────────────────────────────────────────────────── */}
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        style={{ width: "100%", display: "block" }}
        aria-label="Context token usage timeline"
        role="img"
      >
        {/* ── Gridlines ─────────────────────────────────────────────────────── */}
        {gridLines.map(({ y, label }) => (
          <g key={y}>
            <line
              x1={PAD_L}
              y1={y}
              x2={VIEW_W - PAD_R}
              y2={y}
              stroke="var(--border)"
              strokeWidth="1"
            />
            <text
              x={PAD_L - 6}
              y={y}
              textAnchor="end"
              dominantBaseline="middle"
              fill="var(--muted-2)"
              fontSize="11"
            >
              {label}
            </text>
          </g>
        ))}

        {/* ── Ceiling line (dashed red) ──────────────────────────────────────── */}
        <line
          x1={PAD_L}
          y1={ceilingY}
          x2={VIEW_W - PAD_R}
          y2={ceilingY}
          stroke="var(--critical)"
          strokeWidth="1.5"
          strokeDasharray="6 4"
        />
        <text
          x={VIEW_W - PAD_R - 4}
          y={ceilingY - 5}
          textAnchor="end"
          fill="var(--critical)"
          fontSize="11"
        >
          {ceilingLabel}
        </text>

        {/* ── Area fill ─────────────────────────────────────────────────────── */}
        {areaD && (
          <path
            d={areaD}
            fill="var(--accent)"
            opacity="0.08"
            strokeWidth="0"
          />
        )}

        {/* ── Context curve — N+1 segments ──────────────────────────────────── */}
        {segmentPaths.map((d, i) =>
          d ? (
            <path
              key={i}
              d={d}
              fill="none"
              className="ctx-curve"
              stroke="var(--accent)"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null
        )}

        {/* ── Compaction markers ────────────────────────────────────────────── */}
        {compactions.map((c, i) => {
          const cx = xFn(c.beforeIndex, n);
          const preY = yFn(c.preTokens, safeCeiling);
          const postY = yFn(c.postTokens, safeCeiling);
          return (
            <g key={i} className="compaction-marker">
              {/* Dashed vertical line spanning the full plot height */}
              <line
                x1={cx}
                y1={PAD_T}
                x2={cx}
                y2={PAD_T + PLOT_H}
                stroke="var(--muted-2)"
                strokeWidth="1"
                strokeDasharray="4 3"
              />
              {/* Open circle at pre-compaction peak */}
              <circle
                cx={cx}
                cy={preY}
                r={4}
                fill="none"
                stroke="var(--muted-2)"
                strokeWidth="1.5"
              />
              {/* Open circle at post-compaction resumption */}
              <circle
                cx={cx}
                cy={postY}
                r={4}
                fill="none"
                stroke="var(--accent)"
                strokeWidth="1.5"
              />
            </g>
          );
        })}

        {/* ── End-point filled circle ───────────────────────────────────────── */}
        {points.length > 0 && (() => {
          const last = points[points.length - 1];
          return (
            <circle
              cx={last[0]}
              cy={last[1]}
              r={4}
              fill="var(--accent)"
              stroke="var(--accent)"
              strokeWidth="0"
            />
          );
        })()}

        {/* ── Crosshair ─────────────────────────────────────────────────────── */}
        {crosshair !== null && (
          <g className="crosshair" aria-hidden="true">
            <line
              x1={crosshair.svgX}
              y1={PAD_T}
              x2={crosshair.svgX}
              y2={PAD_T + PLOT_H}
              stroke="var(--muted-2)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            {crosshairRequest !== null && crosshairRequest !== undefined && (
              <circle
                cx={crosshair.svgX}
                cy={crosshairY}
                r={4}
                fill="var(--accent)"
                stroke="var(--surface)"
                strokeWidth="1.5"
              />
            )}
          </g>
        )}

        {/* ── Transparent overlay rect — captures pointer events ────────────── */}
        <rect
          x={PAD_L}
          y={PAD_T}
          width={PLOT_W}
          height={PLOT_H}
          fill="transparent"
          style={{ cursor: "crosshair" }}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
        />

        {/* ── Tooltip (shown near crosshair) ────────────────────────────────── */}
        {crosshair !== null && crosshairRequest !== null && crosshairRequest !== undefined && (() => {
          const tokens = crosshairRequest.contextTokens;
          const pct = Math.round((tokens / safeCeiling) * 100);
          const requestNum = crosshairRequest.index + 1;
          // Flip tooltip to left side when near the right edge
          const flipLeft = crosshair.svgX > VIEW_W * 0.7;
          const tx = flipLeft ? crosshair.svgX - 8 : crosshair.svgX + 8;
          const ty = Math.max(PAD_T + 4, crosshairY - 36);
          const anchor = flipLeft ? "end" : "start";
          const line1 = `Request #${requestNum}`;
          const line2 = `${fmtTokens(tokens)} (${pct}%)`;
          // Rough bg box
          const boxW = 110;
          const boxH = 36;
          const bx = flipLeft ? tx - boxW : tx;
          return (
            <g role="tooltip" aria-label={`${line1}: ${line2}`}>
              <rect
                x={bx}
                y={ty - 4}
                width={boxW}
                height={boxH}
                rx="4"
                fill="var(--surface-2)"
                stroke="var(--border)"
                strokeWidth="1"
                opacity="0.95"
              />
              <text
                x={tx}
                y={ty + 10}
                textAnchor={anchor}
                fill="var(--text)"
                fontSize="11"
                fontWeight="500"
              >
                {line1}
              </text>
              <text
                x={tx}
                y={ty + 24}
                textAnchor={anchor}
                fill="var(--muted-2)"
                fontSize="11"
              >
                {line2}
              </text>
            </g>
          );
        })()}
      </svg>

      {/* ── HTML annotation overlay (compaction annotations) ──────────────── */}
      {annotationItems.map((item, i) => (
        <div
          key={i}
          className="ctx-annot"
          style={{
            position: "absolute",
            left: `${item.leftPct.toFixed(2)}%`,
            top: 0,
            transform: "translateX(-50%)",
            pointerEvents: "none",
          }}
          aria-label={`Compaction: ${fmtTokens(item.preTokens)} → ${fmtTokens(item.postTokens)}`}
        >
          <span className="ctx-annot-label">
            {fmtTokens(item.preTokens)} → {fmtTokens(item.postTokens)}
          </span>
        </div>
      ))}
    </div>
  );
}
