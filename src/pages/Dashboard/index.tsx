import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type {
  Granularity,
  Measure,
  StackBy,
  TokenKind,
  BucketData,
  Dimension,
  DateRange,
} from "../../types";
import {
  sumSessions,
  activeDays,
  filterByDateRange,
  bucketByDay,
  bucketByWeek,
  bucketByHour,
  localDateKey,
} from "../../lib/aggregate";
import { isModelPriced, modelColor } from "../../pricing";
import { TOKEN_KIND_COLORS } from "../../charts/MiniStackBar";
import { useSessionsContext } from "../../context/SessionsContext";
import { useSettingsContext } from "../../context/SettingsContext";
import { contextHealthSessions } from "../../lib/insights";
import { planTools } from "../../lib/plan";
import { usePlanStatus } from "../../hooks/usePlanStatus";
import { FilterBar, FilterBarSep } from "../../primitives/FilterBar";
import { FilterChip } from "../../primitives/FilterChip";
import { SegmentedControl } from "../../primitives/SegmentedControl";
import { CustomDatePopover } from "../../primitives/CustomDatePopover";
import { AlertBanner } from "./AlertBanner";
import { WarnStrip } from "./WarnStrip";
import { StatTilesRow } from "./StatTilesRow";
import { PlanUsageCard } from "./PlanUsageCard";
import { UsageChartCard } from "./UsageChartCard";
import { BreakdownTables } from "./BreakdownTables";
import { Onboarding } from "./Onboarding";
import { ScanState } from "./ScanState";

// ---------------------------------------------------------------------------
// Date preset helpers
// ---------------------------------------------------------------------------

type DatePreset = "7d" | "30d" | "90d" | "mtd" | "all" | "custom";

export function dateRangeForPreset(
  preset: DatePreset,
  sessions?: { started_at: string }[],
  customStart?: string,
  customEnd?: string,
): DateRange {
  const today = new Date();
  const end = localDateKey(today);

  if (preset === "custom") {
    // Use explicit custom range when provided
    if (customStart && customEnd) {
      return { start: customStart, end: customEnd };
    }
    // Fallback: same as "all" until the user picks dates
    if (sessions && sessions.length > 0) {
      const earliest = sessions.map((s) => localDateKey(s.started_at)).sort()[0];
      return { start: earliest, end };
    }
    return { start: end, end };
  }

  if (preset === "all") {
    // Use the earliest session date so we don't generate thousands of empty buckets
    if (sessions && sessions.length > 0) {
      const earliest = sessions
        .map((s) => localDateKey(s.started_at))
        .sort()[0];
      return { start: earliest, end };
    }
    return { start: end, end }; // no sessions — single-day range (no buckets)
  }

  if (preset === "mtd") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { start: localDateKey(start), end };
  }

  const days = preset === "7d" ? 7 : preset === "30d" ? 30 : 90;
  const start = new Date(today);
  start.setDate(today.getDate() - (days - 1));
  return { start: localDateKey(start), end };
}

// ---------------------------------------------------------------------------
// Token kind label map for Dimension names
// ---------------------------------------------------------------------------

const TOKEN_KIND_NAMES: Record<TokenKind, string> = {
  input: "Input",
  output: "Output",
  cache_write_5m: "Cache write 5m",
  cache_write_1h: "Cache write 1h",
  cache_read: "Cache read",
};

const ALL_TOKEN_KINDS: TokenKind[] = [
  "input",
  "output",
  "cache_write_5m",
  "cache_write_1h",
  "cache_read",
];

const CHART_SERIES_COLORS = Array.from(
  { length: 12 },
  (_, index) => `var(--series-${index + 1})`,
);

// Unique model colors keyed by model string (computed once per session list).
// Prefer the cross-app family color, then resolve collisions inside this chart
// so two stacked segments never become visually indistinguishable.
export function modelDims(sessions: { model: string | null }[]): Dimension[] {
  const seen = new Set<string>();
  const usedColors = new Set<string>();
  const dims: Dimension[] = [];
  for (const s of sessions) {
    const m = s.model ?? "unknown";
    if (!seen.has(m)) {
      seen.add(m);
      const preferredColor = modelColor(m);
      const color = usedColors.has(preferredColor)
        ? CHART_SERIES_COLORS.find((candidate) => !usedColors.has(candidate)) ?? preferredColor
        : preferredColor;
      usedColors.add(color);
      dims.push({ key: m, name: m, color });
    }
  }
  return dims;
}

function projectDims(sessions: { project: string }[]): Dimension[] {
  const seen = new Set<string>();
  const dims: Dimension[] = [];
  let idx = 0;
  for (const s of sessions) {
    if (!seen.has(s.project)) {
      seen.add(s.project);
      dims.push({
        key: s.project,
        name: s.project,
        color: CHART_SERIES_COLORS[idx % CHART_SERIES_COLORS.length],
      });
      idx++;
    }
  }
  return dims;
}

// ---------------------------------------------------------------------------
// DashboardPage
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  // --- contexts ---
  const { sessions, loading, scanState } = useSessionsContext();
  const { contextAlertThreshold } = useSettingsContext();
  const navigate = useNavigate();
  const plans = usePlanStatus();
  const plannedTools = planTools(plans.report);

  // --- filter state ---
  const [measure, setMeasure] = useState<Measure>("tokens");
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [stackBy, setStackBy] = useState<StackBy>("model");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd]     = useState<string>("");
  const [showCustomPopover, setShowCustomPopover] = useState(false);
  const [drillDayIndex, setDrillDayIndex] = useState<number | null>(null);
  const [kindOn, setKindOn] = useState<Record<TokenKind, boolean>>({
    input: true,
    output: true,
    cache_write_5m: true,
    cache_write_1h: true,
    cache_read: false, // off by default — cache read dominates scale and makes other bars unreadable
  });
  const [entityFilter, setEntityFilter] = useState<{
    kind: "model" | "project";
    name: string;
  } | null>(null);

  // --- derived date range ---
  const dateRange = useMemo(
    () => dateRangeForPreset(datePreset, sessions, customStart, customEnd),
    [datePreset, sessions, customStart, customEnd],
  );

  // --- filtered sessions (by date range) ---
  const filteredSessions = useMemo(
    () => filterByDateRange(sessions, dateRange.start, dateRange.end),
    [sessions, dateRange]
  );

  // --- entity-filtered sessions (for breakdown tables) ---
  const entityFilteredSessions = useMemo(() => {
    if (!entityFilter) return filteredSessions;
    return filteredSessions.filter((s) => {
      if (entityFilter.kind === "model")
        return (s.model ?? "unknown") === entityFilter.name;
      if (entityFilter.kind === "project")
        return s.project === entityFilter.name;
      return false;
    });
  }, [filteredSessions, entityFilter]);

  // --- stat tile totals (from entity-filtered sessions) ---
  const totals = useMemo(() => sumSessions(entityFilteredSessions), [entityFilteredSessions]);
  const activeDaysCount = useMemo(() => activeDays(entityFilteredSessions), [entityFilteredSessions]);
  const projectCount = useMemo(
    () => new Set(entityFilteredSessions.map((s) => s.project)).size,
    [entityFilteredSessions]
  );
  const branchCount = useMemo(
    () => new Set(entityFilteredSessions.map((s) => (s as any).branch ?? "—").filter((b: string) => b !== "—")).size,
    [entityFilteredSessions]
  );

  // --- token kind totals (from entity-filtered sessions) ---
  const kindTotals = useMemo((): Record<TokenKind, number> => {
    return entityFilteredSessions.reduce<Record<TokenKind, number>>(
      (acc, s) => ({
        input: acc.input + s.input_tokens,
        output: acc.output + s.output_tokens,
        cache_write_5m: acc.cache_write_5m + s.cache_creation_tokens,
        cache_write_1h: acc.cache_write_1h + 0,
        cache_read: acc.cache_read + s.cache_read_tokens,
      }),
      { input: 0, output: 0, cache_write_5m: 0, cache_write_1h: 0, cache_read: 0 }
    );
  }, [entityFilteredSessions]);

  // --- day buckets (for drill-down metadata) ---
  const dayBuckets = useMemo(
    () => bucketByDay(entityFilteredSessions, dateRange),
    [entityFilteredSessions, dateRange]
  );

  // --- chart buckets ---
  const chartBuckets = useMemo(() => {
    if (drillDayIndex !== null) {
      // Drill-down: hourly for the selected day
      const dayDate =
        dayBuckets[drillDayIndex]?.date ?? dateRange.start;
      return bucketByHour(entityFilteredSessions, dayDate);
    }
    if (granularity === "week") {
      return bucketByWeek(entityFilteredSessions, dateRange);
    }
    return dayBuckets;
  }, [drillDayIndex, granularity, entityFilteredSessions, dateRange, dayBuckets]);

  // --- dimensions for the chart based on stackBy ---
  const chartDims = useMemo((): Dimension[] => {
    if (stackBy === "tokenkind") {
      // Only enabled token kinds
      return ALL_TOKEN_KINDS.filter((k) => kindOn[k]).map((k) => ({
        key: k,
        name: TOKEN_KIND_NAMES[k],
        color: TOKEN_KIND_COLORS[k],
      }));
    }
    if (stackBy === "project") {
      return projectDims(entityFilteredSessions);
    }
    // stackBy === "model" (default) or "skill" (stub)
    return modelDims(entityFilteredSessions);
  }, [stackBy, kindOn, entityFilteredSessions]);

  // --- convert raw buckets to BucketData[] based on stackBy ---
  const bucketData = useMemo((): BucketData[] => {
    return chartBuckets.map((b) => {
      let values: Record<string, number>;
      let total: number;

      if (measure === "cost") {
        // Recompute cost per dim from sessions in the bucket
        // Because buckets only have token breakdowns, approximate cost from tokens
        // using the byModel/byProject breakdowns where available
        total = b.cost;
        if (stackBy === "model") {
          values = {};
          for (const [model, tokens] of Object.entries(b.byModel)) {
            // Approximate cost: (tokens / totalTokens) * totalCost
            values[model] =
              b.tokens > 0 ? (tokens / b.tokens) * b.cost : 0;
          }
        } else if (stackBy === "project") {
          values = {};
          for (const [project, tokens] of Object.entries(b.byProject)) {
            values[project] =
              b.tokens > 0 ? (tokens / b.tokens) * b.cost : 0;
          }
        } else if (stackBy === "tokenkind") {
          // Token kind cost breakdown: not directly in bucket, use ratio
          values = {};
          const kindTokens: Record<TokenKind, number> = b.byTokenKind;
          for (const k of ALL_TOKEN_KINDS) {
            if (!kindOn[k]) continue;
            values[k] = b.tokens > 0
              ? ((kindTokens[k] ?? 0) / b.tokens) * b.cost
              : 0;
          }
        } else {
          values = { default: total };
        }
      } else if (measure === "requests") {
        total = b.requests;
        // Requests don't have per-dim breakdown in buckets; show single bar
        values = { default: b.requests };
      } else {
        // measure === "tokens"
        total = stackBy === "tokenkind"
          ? ALL_TOKEN_KINDS.filter((k) => kindOn[k]).reduce(
              (sum, k) => sum + (b.byTokenKind[k] ?? 0),
              0
            )
          : b.tokens;

        if (stackBy === "model") {
          values = { ...b.byModel };
        } else if (stackBy === "project") {
          values = { ...b.byProject };
        } else if (stackBy === "tokenkind") {
          values = {};
          for (const k of ALL_TOKEN_KINDS) {
            if (kindOn[k]) values[k] = b.byTokenKind[k] ?? 0;
          }
        } else {
          values = { default: b.tokens };
        }
      }

      return { label: b.label, total, values };
    });
  }, [chartBuckets, measure, stackBy, kindOn]);

  // --- drill label (for breadcrumb) ---
  const drillLabel = useMemo(() => {
    if (drillDayIndex === null) return null;
    return dayBuckets[drillDayIndex]?.label ?? null;
  }, [drillDayIndex, dayBuckets]);

  // --- alert banner: highest-context session above threshold ---
  const alertSession = useMemo(() => {
    const flagged = contextHealthSessions(sessions, contextAlertThreshold);
    return flagged.length > 0 ? flagged[0] : null;
  }, [sessions, contextAlertThreshold]);

  // --- unpriced model warning ---
  const hasUnpricedModel = useMemo(
    () => sessions.some((s) => s.model !== null && !isModelPriced(s.model)),
    [sessions]
  );

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  function handleBarClick(index: number) {
    setDrillDayIndex(index);
    setGranularity("hour");
  }

  function handleClearDrill() {
    setDrillDayIndex(null);
    setGranularity("day");
  }

  function handleKindToggle(kind: TokenKind) {
    setKindOn((prev) => ({ ...prev, [kind]: !prev[kind] }));
  }

  function handleDatePreset(preset: DatePreset) {
    setDatePreset(preset);
    // Clear drill when changing date range
    setDrillDayIndex(null);
    if (granularity === "hour") setGranularity("day");
    if (preset === "custom") {
      // Open popover; seed with current dateRange if no custom range yet
      if (!customStart || !customEnd) {
        const today = localDateKey(new Date());
        const fallbackStart =
          sessions.length > 0
            ? sessions.map((s) => localDateKey(s.started_at)).sort()[0]
            : today;
        setCustomStart(fallbackStart);
        setCustomEnd(today);
      }
      setShowCustomPopover(true);
    }
  }

  function handleCustomApply(start: string, end: string) {
    setCustomStart(start);
    setCustomEnd(end);
  }

  // ---------------------------------------------------------------------------
  // Render guard: show scan states
  // ---------------------------------------------------------------------------

  const showEmpty =
    !loading && scanState !== "scanning" && sessions.length === 0;
  const showScanning = scanState === "scanning";

  // ---------------------------------------------------------------------------
  // Effective dims for the chart (filtered when requests — single dim only)
  // ---------------------------------------------------------------------------

  const effectiveDims = useMemo((): Dimension[] => {
    if (measure === "requests") {
      return [{ key: "default", name: "Requests", color: "var(--accent)" }];
    }
    if (measure === "cost" && stackBy === "tokenkind") {
      return ALL_TOKEN_KINDS.filter((k) => kindOn[k]).map((k) => ({
        key: k,
        name: TOKEN_KIND_NAMES[k],
        color: TOKEN_KIND_COLORS[k],
      }));
    }
    if (measure === "cost" && (stackBy === "skill")) {
      return [{ key: "default", name: "Cost", color: "var(--accent)" }];
    }
    return chartDims;
  }, [measure, stackBy, chartDims, kindOn]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // Nothing to chart yet: setup takes the whole page instead of a row of $0 tiles.
  if (showEmpty) {
    return (
      <div className="dashboard-page">
        <h1 className="sr-only">Dashboard</h1>
        <Onboarding />
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      {/* Screen-reader page heading — topbar title is visual-only (req 9.2) */}
      <h1 className="sr-only">Dashboard</h1>

      {/* Alerts */}
      {alertSession && (
        <AlertBanner
          message={`Session ${alertSession.sessionName} is at ${Math.round(alertSession.contextPct)}% of its context window.`}
          meta="Consider /compact, or hand off to a fresh session."
          sessionId={alertSession.sessionId}
        />
      )}
      {hasUnpricedModel && (
        <WarnStrip
          message={<><strong>Some models unpriced</strong> — requests / tokens excluded from cost totals.</>}
          linkText="View"
          onLinkClick={() => navigate("/settings#pricing")}
        />
      )}

      {/* Filter bar — matches mockup layout exactly:
          [All time ▾] [7d 30d 90d MTD All Custom] | [Tokens Requests Cost] | [Hour Day Week] [Stack by: Model ▾]  ···grow···  [+ Filter] */}
      <FilterBar>
        {/* Date range field dropdown */}
        <div className="field date-range-field-wrap" id="dateRangeField">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          <span>
            {datePreset === "all"    ? "All time"      :
             datePreset === "7d"    ? "Last 7 days"   :
             datePreset === "30d"   ? "Last 30 days"  :
             datePreset === "90d"   ? "Last 90 days"  :
             datePreset === "mtd"   ? "Month to date" :
             (customStart && customEnd) ? `${customStart} – ${customEnd}` : "Custom"}
          </span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>

          {/* Custom date popover — anchored to this field */}
          {showCustomPopover && (
            <CustomDatePopover
              start={customStart}
              end={customEnd}
              onApply={handleCustomApply}
              onClose={() => setShowCustomPopover(false)}
            />
          )}
        </div>

        {/* Date presets */}
        <SegmentedControl<DatePreset>
          options={[
            { value: "7d", label: "7d" },
            { value: "30d", label: "30d" },
            { value: "90d", label: "90d" },
            { value: "mtd", label: "MTD" },
            { value: "all", label: "All" },
            { value: "custom", label: "Custom" },
          ]}
          value={datePreset}
          onChange={handleDatePreset}
          ariaLabel="Date preset"
        />

        <FilterBarSep />

        {/* Measure */}
        <SegmentedControl<Measure>
          options={[
            { value: "tokens", label: "Tokens" },
            { value: "requests", label: "Requests" },
            { value: "cost", label: "Cost" },
          ]}
          value={measure}
          onChange={setMeasure}
          ariaLabel="Measure"
        />

        <FilterBarSep />

        {/* Granularity — includes Hour when in drill-down */}
        <SegmentedControl<Granularity | "hour">
          options={[
            { value: "hour", label: "Hour" },
            { value: "day", label: "Day" },
            { value: "week", label: "Week" },
          ]}
          value={drillDayIndex !== null ? "hour" : granularity}
          onChange={(g) => {
            if (g === "hour") return; // hour only available via bar drill-down
            setGranularity(g as Granularity);
            if (drillDayIndex !== null) setDrillDayIndex(null);
          }}
          ariaLabel="Granularity"
        />

        {/* Stack by: Model field dropdown */}
        <div
          className="field"
          id="stackByField"
          role="button"
          tabIndex={0}
          onClick={() => {
            const cycle: StackBy[] = ["model", "project", "tokenkind"];
            const next = cycle[(cycle.indexOf(stackBy) + 1) % cycle.length];
            setStackBy(next);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              const cycle: StackBy[] = ["model", "project", "tokenkind"];
              const next = cycle[(cycle.indexOf(stackBy) + 1) % cycle.length];
              setStackBy(next);
            }
          }}
          aria-label={`Stack by: ${stackBy}`}
        >
          <span>Stack by: <strong>{stackBy === "model" ? "Model" : stackBy === "project" ? "Project" : "Token kind"}</strong></span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>

        {/* Active entity filter chip */}
        {entityFilter && (
          <>
            <FilterBarSep />
            <FilterChip
              label={entityFilter.kind.charAt(0).toUpperCase() + entityFilter.kind.slice(1)}
              value={entityFilter.name}
              onRemove={() => setEntityFilter(null)}
            />
          </>
        )}

        {/* Grow spacer + Filter chip-add */}
        <div className="grow" style={{ flex: "1 1 auto" }} />
        <div className="chip-add" role="button" tabIndex={0} aria-label="Add filter">
          + Filter
        </div>
      </FilterBar>

      {/* Main content body — .dash-body provides 24px padding, max-width 1400px */}
      <div className="dash-body">
        {/* Stat tiles */}
        <StatTilesRow
          totals={totals}
          activeDays={activeDaysCount}
          sessions={entityFilteredSessions.length}
          projects={projectCount}
          branches={branchCount}
        />

        {/* Plan limits — tools signed in with a subscription, or whose sign-in couldn't be read */}
        {plannedTools.length > 0 && (
          <div className="section-gap">
            <PlanUsageCard
              tools={plannedTools}
              online={plans.report?.online ?? false}
              refreshing={plans.refreshing}
              onRefresh={() => void plans.refresh()}
            />
          </div>
        )}

        {/* Usage chart */}
        {!showScanning && (
          <div className="section-gap">
            <UsageChartCard
              buckets={bucketData}
              dims={effectiveDims}
              measure={measure}
              granularity={drillDayIndex !== null ? "hour" : granularity}
              stackBy={stackBy}
              kindOn={kindOn}
              kindTotals={kindTotals}
              drillDayIndex={drillDayIndex}
              drillLabel={drillLabel}
              onBarClick={handleBarClick}
              onKindToggle={handleKindToggle}
              onClearDrill={handleClearDrill}
            />
          </div>
        )}

        {/* Breakdown tables */}
        {!showScanning && (
          <div className="section-gap">
            <BreakdownTables
              sessions={filteredSessions}
              measure={measure}
              entityFilter={entityFilter}
              onEntityFilter={setEntityFilter}
            />
          </div>
        )}

        {/* Scan state — full-page centering via padding-top */}
        {showScanning && (
          <div style={{ paddingTop: "80px" }}>
            <ScanState />
          </div>
        )}
      </div>
    </div>
  );
}
