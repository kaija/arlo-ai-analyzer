import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSessionsContext } from "../../context/SessionsContext";
import { filterByDateRange } from "../../lib/aggregate";
import { totalTokens, estimatedCostUsd } from "../../pricing";
import { contextPct } from "./SessionsTable";
import type { Measure, Session } from "../../types";
import { FilterBar, FilterBarSep } from "../../primitives/FilterBar";
import { FilterChip } from "../../primitives/FilterChip";
import { SegmentedControl } from "../../primitives/SegmentedControl";
import { CustomDatePopover } from "../../primitives/CustomDatePopover";
import { SessionsTable } from "./SessionsTable";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 15;

const DATE_PRESETS = [
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
  { value: "all", label: "All" },
] as const;

type DatePreset = (typeof DATE_PRESETS)[number]["value"] | "custom";

const MEASURE_OPTIONS: Array<{ value: Measure; label: string }> = [
  { value: "tokens", label: "Tokens" },
  { value: "requests", label: "Requests" },
  { value: "cost", label: "Cost" },
];

// Sort keys that SessionsTable understands
type SortKey =
  | "session_id"
  | "project"
  | "branch"
  | "started_at"
  | "duration"
  | "requests"
  | "tokens"
  | "cost"
  | "context"
  | "compactions";

// ---------------------------------------------------------------------------
// Types for filter chips
// ---------------------------------------------------------------------------

interface FilterChipDef {
  field: "project" | "model";
  value: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns an ISO date string (YYYY-MM-DD) for `daysAgo` days before today. */
function daysAgoIso(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

/** Derive the [start, end] date range from the active preset. */
function presetToRange(
  preset: DatePreset,
  customStart?: string,
  customEnd?: string,
): { start: string; end: string } {
  const end = new Date().toISOString().slice(0, 10);
  switch (preset) {
    case "7d":
      return { start: daysAgoIso(6), end };
    case "30d":
      return { start: daysAgoIso(29), end };
    case "90d":
      return { start: daysAgoIso(89), end };
    case "custom":
      if (customStart && customEnd) return { start: customStart, end: customEnd };
      return { start: "2020-01-01", end }; // fallback until user picks dates
    case "all":
      // Use a very early start date to include everything
      return { start: "2020-01-01", end };
  }
}

/** Case-insensitive search across session_id, project, and model fields. */
function searchFilter(sessions: Session[], query: string): Session[] {
  if (!query.trim()) return sessions;
  const q = query.toLowerCase();
  return sessions.filter(
    (s) =>
      s.session_id.toLowerCase().includes(q) ||
      s.project.toLowerCase().includes(q) ||
      (s.model ?? "").toLowerCase().includes(q),
  );
}

/** AND-filter: every chip must match its field on the session. */
function applyChips(sessions: Session[], chips: FilterChipDef[]): Session[] {
  if (chips.length === 0) return sessions;
  return sessions.filter((s) =>
    chips.every((chip) => {
      const fieldValue = chip.field === "project" ? s.project : (s.model ?? "");
      return fieldValue === chip.value;
    }),
  );
}

/** Sort sessions by the given key and direction. */
function sortSessions(
  sessions: Session[],
  key: SortKey,
  dir: "asc" | "desc",
): Session[] {
  const sorted = [...sessions].sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case "session_id":
        cmp = a.session_id.localeCompare(b.session_id);
        break;
      case "project":
        cmp = a.project.localeCompare(b.project);
        break;
      case "branch":
        // branch is not in the backend yet; fall back to session_id sort
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        cmp = ((a as any).branch ?? "").localeCompare((b as any).branch ?? "");
        break;
      case "started_at":
        cmp = a.started_at.localeCompare(b.started_at);
        break;
      case "duration":
        // Sort by started_at as a proxy (backend doesn't expose end time yet)
        // TODO: needs backend — use real duration once end_time is available
        cmp = a.started_at.localeCompare(b.started_at);
        break;
      case "requests":
        cmp = a.message_count - b.message_count;
        break;
      case "tokens":
        cmp = totalTokens(a) - totalTokens(b);
        break;
      case "cost":
        cmp = estimatedCostUsd(a) - estimatedCostUsd(b);
        break;
      case "context":
        // Sort by what the column shows: peak prompt against its model's window.
        cmp = contextPct(a) - contextPct(b);
        break;
      case "compactions":
        cmp = a.compaction_count - b.compaction_count;
        break;
    }
    return dir === "asc" ? cmp : -cmp;
  });
  return sorted;
}

// ---------------------------------------------------------------------------
// useDebounce — no external library, inline 300 ms debounce
// ---------------------------------------------------------------------------

function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      setDebounced(value);
    }, delayMs);

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, [value, delayMs]);

  return debounced;
}

// ---------------------------------------------------------------------------
// SessionsPage
// ---------------------------------------------------------------------------

export default function SessionsPage() {
  const { sessions } = useSessionsContext();

  // ── Filter state ──────────────────────────────────────────────────────────
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd,   setCustomEnd]   = useState<string>("");
  const [showCustomPopover, setShowCustomPopover] = useState(false);
  const [measure, setMeasure] = useState<Measure>("tokens");
  const [searchText, setSearchText] = useState("");
  const [chips, setChips] = useState<FilterChipDef[]>([]);

  // ── Sort state ─────────────────────────────────────────────────────────────
  const [sortKey, setSortKey] = useState<SortKey>("started_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // ── Pagination state ──────────────────────────────────────────────────────
  const [page, setPage] = useState(0);

  // Debounced search text (300 ms)
  const debouncedSearch = useDebounce(searchText, 300);

  // Reset to first page whenever filters change
  useEffect(() => {
    setPage(0);
  }, [datePreset, customStart, customEnd, debouncedSearch, chips, sortKey, sortDir]);

  // ── Derived: date range from preset ───────────────────────────────────────
  const dateRange = useMemo(
    () => presetToRange(datePreset, customStart, customEnd),
    [datePreset, customStart, customEnd],
  );

  // ── Derived: filtered + sorted sessions ───────────────────────────────────
  const filteredSessions = useMemo(() => {
    let result = filterByDateRange(sessions, dateRange.start, dateRange.end);
    result = searchFilter(result, debouncedSearch);
    result = applyChips(result, chips);
    result = sortSessions(result, sortKey, sortDir);
    return result;
  }, [sessions, dateRange, debouncedSearch, chips, sortKey, sortDir]);

  // ── Derived: pagination ───────────────────────────────────────────────────
  const totalPages = Math.ceil(filteredSessions.length / PAGE_SIZE);
  const safePage = Math.min(page, Math.max(totalPages - 1, 0));
  const pageSlice = useMemo(
    () => filteredSessions.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE),
    [filteredSessions, safePage],
  );

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleSort(key: string) {
    const typedKey = key as SortKey;
    if (typedKey === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(typedKey);
      setSortDir("desc");
    }
  }

  /**
   * Called when a table row is clicked to navigate to session detail.
   * Also used as an entry point for adding filter chips from row cells.
   * We expose the callback so SessionsTable can call it; navigation is
   * handled inside SessionsTable itself via `useNavigate`.
   */
  const handleRowClick = useCallback((_sessionId: string) => {
    // Navigation is handled in SessionsTable; nothing extra needed here
  }, []);

  function removeChip(index: number) {
    setChips((prev) => prev.filter((_, i) => i !== index));
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="sessions-page">
      {/* Screen-reader page heading — topbar title is visual-only (req 9.2) */}
      <h1 className="sr-only">Sessions</h1>

      {/* Filter bar — matches mockup: [All time ▾] [7d 30d 90d All Custom] | [Tokens Requests Cost] | [🔍 Filter sessions…] */}
      <FilterBar>
        {/* Date range field dropdown */}
        <div className="field date-range-field-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          <span>
            {datePreset === "all"  ? "All time"      :
             datePreset === "7d"  ? "Last 7 days"   :
             datePreset === "30d" ? "Last 30 days"  :
             datePreset === "90d" ? "Last 90 days"  :
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
              onApply={(start, end) => { setCustomStart(start); setCustomEnd(end); }}
              onClose={() => setShowCustomPopover(false)}
            />
          )}
        </div>

        <SegmentedControl
          options={[
            { value: "7d", label: "7d" },
            { value: "30d", label: "30d" },
            { value: "90d", label: "90d" },
            { value: "all", label: "All" },
            { value: "custom", label: "Custom" },
          ]}
          value={datePreset}
          onChange={(v) => {
            const preset = v as DatePreset;
            setDatePreset(preset);
            if (preset === "custom") {
              if (!customStart || !customEnd) {
                const today = new Date().toISOString().slice(0, 10);
                setCustomStart(daysAgoIso(29)); // seed with last-30-days range
                setCustomEnd(today);
              }
              setShowCustomPopover(true);
            }
          }}
          ariaLabel="Date range preset"
        />

        <FilterBarSep />

        {/* Measure control */}
        <SegmentedControl
          options={MEASURE_OPTIONS}
          value={measure}
          onChange={setMeasure}
          ariaLabel="Measure"
        />

        <FilterBarSep />

        {/* Search field — .field.search-field with magnifier icon */}
        <div className="field search-field">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.6" y2="16.6"/>
          </svg>
          <label htmlFor="sessions-search" className="sr-only">Search sessions</label>
          <input
            id="sessions-search"
            type="search"
            placeholder="Filter sessions…"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            aria-label="Search sessions by ID, project, or model"
          />
        </div>

        <div style={{ flex: "1 1 auto" }} />
      </FilterBar>

      {/* Active filter chips */}
      {chips.length > 0 && (
        <div style={{ display: "flex", gap: "6px", padding: "0 24px 12px", flexWrap: "wrap" }} role="group" aria-label="Active filters">
          {chips.map((chip, i) => (
            <FilterChip
              key={`${chip.field}:${chip.value}:${i}`}
              label={chip.field === "project" ? "Project" : "Model"}
              value={chip.value}
              onRemove={() => removeChip(i)}
            />
          ))}
        </div>
      )}

      {/* Session count + table card */}
      <div className="sess-body">
        <div className="sess-toolbar">
          <div className="sess-count" aria-live="polite" aria-atomic="true">
            Showing <strong>{filteredSessions.length}</strong> of <strong>{sessions.length}</strong> sessions
          </div>
        </div>

        <div className="table-wrap">
          <div className="table-scroll-x">
            <SessionsTable
              sessions={pageSlice}
              measure={measure}
              onRowClick={handleRowClick}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
            />
          </div>

          <div className="pager">
            <span className="sess-count" aria-live="polite" aria-atomic="true">
              Page {safePage + 1} of {Math.max(totalPages, 1)}
            </span>
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                className="btn btn-secondary btn-small"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage <= 0}
                aria-label="Previous page"
              >
                Previous
              </button>
              <button
                className="btn btn-secondary btn-small"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={safePage >= totalPages - 1 || totalPages === 0}
                aria-label="Next page"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// end of file
