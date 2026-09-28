import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import type { CapabilityRow, ToolAnalysis, UsageTier } from "../../lib/tool-usage";
import { fmtDate, fmtTokens } from "../../lib/format";
import { Badge } from "../../primitives/Badge";
import { SegmentedControl } from "../../primitives/SegmentedControl";
import type { CapabilityKind } from "../../types";

type KindFilter = CapabilityKind | "all";
const KINDS: KindFilter[] = ["all", "builtin", "mcp", "skill", "subagent"];

const TIER_VARIANT: Record<UsageTier, "good" | "accent" | "warning" | "critical" | "neutral"> = {
  core: "good",
  regular: "accent",
  rare: "warning",
  unused: "critical",
  new: "neutral",
};

/** A failure rate worth pointing at. */
const HIGH_ERROR_RATE = 0.2;

const COLUMNS = [
  { key: "name", width: 240, min: 140 },
  { key: "type", width: 80, min: 65 },
  { key: "status", width: 85, min: 70 },
  { key: "calls", width: 110, min: 85 },
  { key: "sessions", width: 205, min: 150 },
  { key: "errors", width: 110, min: 90 },
  { key: "lastUsed", width: 145, min: 110 },
  { key: "perRequest", width: 130, min: 105 },
] as const;
const COLUMN_WIDTHS_KEY = "arlo-tools-column-widths";
const MAX_COLUMN_WIDTH = 2000;

function initialColumnWidths(): number[] {
  const defaults = COLUMNS.map((column) => column.width);
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(COLUMN_WIDTHS_KEY) ?? "null");
    if (Array.isArray(saved) && saved.length === COLUMNS.length && saved.every((width, index) =>
      Number.isInteger(width) && width >= COLUMNS[index].min && width <= MAX_COLUMN_WIDTH
    )) return saved as number[];
  } catch { /* Storage can be unavailable in embedded webviews. */ }
  return defaults;
}

export function ToolUsageTable({ analysis: a }: { analysis: ToolAnalysis }) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<KindFilter>("all");
  const [columnWidths, setColumnWidths] = useState(initialColumnWidths);
  const drag = useRef<{ pointerId: number; index: number; x: number; width: number } | null>(null);
  const rows = useMemo(() => a.rows.filter((r) => kind === "all" || r.kind === kind), [a.rows, kind]);
  const maxShare = Math.max(0.0001, ...a.rows.map((r) => r.sessionShare));

  useEffect(() => {
    try { localStorage.setItem(COLUMN_WIDTHS_KEY, JSON.stringify(columnWidths)); }
    catch { /* Keep the current widths when storage is unavailable. */ }
  }, [columnWidths]);

  function setColumnWidth(index: number, width: number) {
    setColumnWidths((current) => {
      const next = [...current];
      next[index] = Math.max(COLUMNS[index].min, Math.min(MAX_COLUMN_WIDTH, Math.round(width)));
      return next;
    });
  }

  function finishResize() {
    drag.current = null;
  }

  function startResize(event: PointerEvent<HTMLSpanElement>, index: number) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    // A wide table stretches its columns to fill the card. Lock their rendered
    // widths before dragging so the pointer moves the divider by the same amount.
    const renderedWidths = [...event.currentTarget.closest("table")!.querySelectorAll("thead th")]
      .map((header) => Math.round(header.getBoundingClientRect().width));
    setColumnWidths(renderedWidths);
    drag.current = {
      pointerId: event.pointerId,
      index,
      x: event.clientX,
      width: renderedWidths[index],
    };
  }

  function moveResize(event: PointerEvent<HTMLSpanElement>) {
    const current = drag.current;
    if (current?.pointerId === event.pointerId) {
      setColumnWidth(current.index, current.width + event.clientX - current.x);
    }
  }

  function keyResize(event: KeyboardEvent<HTMLSpanElement>, index: number) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next = [...event.currentTarget.closest("table")!.querySelectorAll("thead th")]
      .map((header) => Math.round(header.getBoundingClientRect().width));
    next[index] = Math.max(COLUMNS[index].min, Math.min(MAX_COLUMN_WIDTH,
      next[index] + (event.key === "ArrowRight" ? 10 : -10)));
    setColumnWidths(next);
  }

  return (
    <div className="card tools-table-card">
      <div className="card-head">
        <div className="card-title">{t("tools.table.title")}</div>
        <div className="tools-table-tools">
          <span className="sess-count">{t("tools.table.count", { count: rows.length })}</span>
          <SegmentedControl
            options={KINDS.map((k) => ({ value: k, label: t(`tools.table.kinds.${k}`) }))}
            value={kind}
            onChange={setKind}
            ariaLabel={t("tools.table.type")}
          />
        </div>
      </div>
      <div className="table-scroll-x">
        <table className="dtable tools-table" style={{ minWidth: columnWidths.reduce((sum, width) => sum + width, 0) }}>
          <colgroup>{columnWidths.map((width, index) => <col key={COLUMNS[index].key} style={{ width }} />)}</colgroup>
          <thead>
            <tr>
              {COLUMNS.map((column, index) => {
                const label = t(`tools.table.${column.key}`);
                return (
                  <th key={column.key} className={column.key === "calls" || column.key === "errors" || column.key === "perRequest" ? "num" : undefined}
                    title={column.key === "perRequest" ? t("tools.table.perRequestTitle") : undefined}>
                    {label}
                    <span className="tools-column-resize" role="separator" tabIndex={0}
                      aria-label={t("tools.table.resizeColumn", { column: label })}
                      aria-orientation="vertical" aria-valuemin={column.min} aria-valuemax={MAX_COLUMN_WIDTH}
                      aria-valuenow={columnWidths[index]}
                      onPointerDown={(event) => startResize(event, index)} onPointerMove={moveResize}
                      onPointerUp={finishResize} onPointerCancel={finishResize}
                      onKeyDown={(event) => keyResize(event, index)} />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Row key={`${r.kind}:${r.name}`} row={r} maxShare={maxShare} showRemoved={a.hasListing} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({ row: r, maxShare, showRemoved }: { row: CapabilityRow; maxShare: number; showRemoved: boolean }) {
  const { t } = useTranslation();
  const errorRate = r.calls > 0 ? r.errors / r.calls : 0;
  const toolsTitle = r.toolCalls.map((c) => `${c.tool} · ${c.calls}`).join("\n");

  return (
    <tr className={r.tier === "unused" && r.removable && r.installed ? "tools-row-unused" : undefined}>
      <td className="tools-name">
        <span className="tools-name-text" title={r.path ?? r.name}>
          {r.name}
        </span>
        {r.kind === "mcp" && (r.mcpTools > 0 || r.toolCalls.length > 0) && (
          <span className="tools-name-sub" title={toolsTitle || undefined}>
            {/* A partial listing can name fewer tools than were called. */}
            {r.mcpTools >= r.toolCalls.length && r.mcpTools > 0
              ? t("tools.table.mcpTools", { used: r.toolCalls.length, total: r.mcpTools })
              : t("tools.table.mcpToolsUsed", { count: r.toolCalls.length })}
          </span>
        )}
        {/* MCP servers loaded up front never appear in the deferred-tool
            listing, so only skills and subagents can be called removed. */}
        {showRemoved && r.everListed && !r.installed && (r.kind === "skill" || r.kind === "subagent") && (
          <span className="tools-name-sub">{t("tools.table.removed")}</span>
        )}
      </td>
      <td className="muted">{t(`tools.table.kinds.${r.kind}`)}</td>
      <td>
        <Badge variant={TIER_VARIANT[r.tier]}>{t(`tools.tier.${r.tier}`)}</Badge>
      </td>
      <td className="num tnum">{r.calls.toLocaleString()}</td>
      <td>
        <span className="share-cell">
          <span className="rbar-track">
            <span className="rbar-fill" style={{ width: `${(r.sessionShare / maxShare) * 100}%` }} />
          </span>
          <span className="tnum">
            {r.sessionsUsed.toLocaleString()} · {Math.round(r.sessionShare * 100)}%
          </span>
        </span>
      </td>
      <td className={`num tnum${errorRate >= HIGH_ERROR_RATE && r.calls >= 5 ? " tools-err-high" : ""}`}>
        {r.errors === 0 ? "—" : `${r.errors.toLocaleString()} · ${Math.round(errorRate * 100)}%`}
      </td>
      <td className="tnum">{r.lastUsed ? fmtDate(r.lastUsed) : "—"}</td>
      <td className="num tnum" title={r.kind === "builtin" ? t("tools.table.builtinCost") : undefined}>
        {r.listingTokens === null || !r.installed ? "—" : fmtTokens(r.listingTokens)}
      </td>
    </tr>
  );
}
