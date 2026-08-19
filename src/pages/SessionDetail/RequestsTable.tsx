import { useState } from "react";
import type { Request, StopReason, TokenKind } from "../../types";
import { EffortBadge } from "../../primitives/Badge";
import { Switch } from "../../primitives/Switch";
import { fmtCost, fmtDate, fmtTokens } from "../../lib/format";
import { modelColor } from "../../pricing";

// How many rows to show per "Load more" batch
const PAGE_SIZE = 40;

// Token kind colors — cache_read uses the recessive series (low-chroma gray)
// so it visually recedes against the more prominent input/output segments.
const TOKEN_KIND_COLORS: Record<TokenKind, string> = {
  input:          "var(--series-1)",
  output:         "var(--series-7)",
  cache_write_5m: "var(--series-3)",
  cache_write_1h: "var(--series-2)",
  cache_read:     "var(--series-recessive)",
};

// Abbreviated labels for raw-counts display
const TOKEN_KIND_LABELS: Record<TokenKind, string> = {
  input:          "in",
  output:         "out",
  cache_write_5m: "cw5",
  cache_write_1h: "cw1h",
  cache_read:     "read",
};

// Consistent segment order
const TOKEN_KIND_ORDER: TokenKind[] = [
  "input",
  "output",
  "cache_write_5m",
  "cache_write_1h",
  "cache_read",
];

// Stop-reason display labels
const STOP_REASON_LABELS: Record<StopReason, string> = {
  end_turn:   "end_turn",
  tool_use:   "tool_use",
  max_tokens: "max_tokens",
  refusal:    "refusal",
};

// ---------------------------------------------------------------------------
// RequestsTable
// ---------------------------------------------------------------------------

interface RequestsTableProps {
  requests: Request[];
  rawCounts: boolean;
  onToggleRawCounts: (on: boolean) => void;
  loading?: boolean;
}

/**
 * RequestsTable — table of API requests for a session.
 *
 * Matches the mockup grid layout exactly:
 *   Time (96px) | Model (150px) | Effort (74px) | Tokens (1fr) |
 *   Cost (92px) | Stop / Skill (150px) | ↗ (30px)
 *
 * - Token mini-bar: 96 px proportional bar (5 token-kind segments)
 * - Raw counts toggle (Switch) replaces mini-bar with abbreviated counts
 * - Initially shows 40 rows; "Load 40 more" button reveals next batch
 * - Stop reason and skill are combined in one column
 * - Transcript link icon in the last column (placeholder href)
 * - Cost column hidden at ≤ 900 px via responsive CSS
 *
 * Requirements: 5.10–5.16, 8.6, 8.11
 */
export function RequestsTable({
  requests,
  rawCounts,
  onToggleRawCounts,
  loading = false,
}: RequestsTableProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const visibleRequests = requests.slice(0, visibleCount);
  const hasMore = visibleCount < requests.length;

  function loadMore() {
    setVisibleCount((n) => Math.min(n + PAGE_SIZE, requests.length));
  }

  return (
    <>
      {/* Toolbar */}
      <div className="req-toolbar">
        <div className="req-count">
          Showing <strong>{visibleRequests.length}</strong> of{" "}
          <strong>{requests.length}</strong> requests
        </div>
        <div className="raw-toggle">
          <label id="raw-counts-label" htmlFor="raw-counts-switch">
            Raw token counts
          </label>
          <Switch
            id="raw-counts-switch"
            checked={rawCounts}
            onChange={onToggleRawCounts}
            labelledBy="raw-counts-label"
          />
        </div>
      </div>

      {/* Table */}
      <div className="req-table-wrap">
        {/* Header row */}
        <div className="req-head-row" role="row">
          <span>Time</span>
          <span>Model</span>
          <span>Effort</span>
          <span>
            Tokens
            {rawCounts && (
              <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                {" "}(in·out·cw5·cw1h·read)
              </span>
            )}
          </span>
          <span className="req-cost-col">Cost</span>
          <span>Stop / Skill</span>
          <span />
        </div>

        {/* Data rows */}
        {loading ? (
          <div
            style={{
              padding: "32px 14px",
              textAlign: "center",
              color: "var(--muted)",
              fontSize: "12.5px",
            }}
          >
            Loading requests…
          </div>
        ) : visibleRequests.length === 0 ? (
          <div
            style={{
              padding: "32px 14px",
              textAlign: "center",
              color: "var(--muted)",
              fontSize: "12.5px",
            }}
          >
            No requests recorded for this session.
          </div>
        ) : (
          visibleRequests.map((req) => (
            <RequestRow key={req.index} request={req} rawCounts={rawCounts} />
          ))
        )}

        {/* Load more */}
        {hasMore && (
          <div className="req-load-more">
            <button className="btn btn-secondary btn-small" onClick={loadMore}>
              Load {Math.min(PAGE_SIZE, requests.length - visibleCount)} more
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// RequestRow
// ---------------------------------------------------------------------------

interface RequestRowProps {
  request: Request;
  rawCounts: boolean;
}

function RequestRow({ request, rawCounts }: RequestRowProps) {
  const {
    index,
    timestamp,
    model,
    effort,
    inputTokens,
    outputTokens,
    cacheWrite5m,
    cacheWrite1h,
    cacheRead,
    costUsd,
    stopReason,
    skill,
  } = request;

  const totalTok =
    inputTokens + outputTokens + cacheWrite5m + cacheWrite1h + cacheRead;

  return (
    <div className="req-row" role="row">
      {/* Time */}
      <span className="req-time mono">{fmtDate(timestamp)}</span>

      {/* Model */}
      <span className="req-model">
        <span
          className="dot"
          style={{ background: modelColor(model) }}
          aria-hidden="true"
        />
        <span>{model}</span>
      </span>

      {/* Effort */}
      <span>
        <EffortBadge effort={effort} />
      </span>

      {/* Tokens — mini-bar or raw counts */}
      <span className="tok-bar">
        {rawCounts ? (
          <RawTokenCounts request={request} />
        ) : (
          <>
            <span className="tok-mini" aria-label="Token distribution">
              {TOKEN_KIND_ORDER.map((kind) => {
                const val = tokenValueForKind(request, kind);
                if (val === 0 || totalTok === 0) return null;
                return (
                  <span
                    key={kind}
                    style={{
                      width: `${(val / totalTok) * 100}%`,
                      background: TOKEN_KIND_COLORS[kind],
                    }}
                    title={`${TOKEN_KIND_LABELS[kind]}: ${val.toLocaleString()}`}
                  />
                );
              })}
            </span>
            <span className="tok-total">{fmtTokens(totalTok)}</span>
          </>
        )}
      </span>

      {/* Cost */}
      <span className="req-cost req-cost-col">{fmtCost(costUsd)}</span>

      {/* Stop reason + Skill (combined) */}
      <span className="req-stop-skill">
        <span className={`stop-tag stop-${stopReason}`}>
          {STOP_REASON_LABELS[stopReason]}
        </span>
        {skill && <span className="skill-pill">{skill}</span>}
      </span>

      {/* Transcript link — placeholder */}
      <a
        className="transcript-link"
        href="#"
        title={`Transcript line ~${(index + 1) * 14}`}
        aria-label="Open transcript"
        onClick={(e) => e.preventDefault()}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="7" y1="17" x2="17" y2="7" />
          <polyline points="7 7 17 7 17 17" />
        </svg>
      </a>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RawTokenCounts — abbreviated counts shown when rawCounts toggle is on
// ---------------------------------------------------------------------------

interface RawTokenCountsProps {
  request: Request;
}

function RawTokenCounts({ request }: RawTokenCountsProps) {
  return (
    <span className="tok-raw">
      {TOKEN_KIND_ORDER.map((kind) => {
        const value = tokenValueForKind(request, kind);
        const isRead = kind === "cache_read";
        return (
          <span
            key={kind}
            title={kind}
            style={{ color: TOKEN_KIND_COLORS[kind] }}
          >
            {isRead ? <b>{fmtTokens(value)}</b> : fmtTokens(value)}
          </span>
        );
      })}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Helper — extract the token count for a given kind from a Request
// ---------------------------------------------------------------------------

function tokenValueForKind(req: Request, kind: TokenKind): number {
  switch (kind) {
    case "input":          return req.inputTokens;
    case "output":         return req.outputTokens;
    case "cache_write_5m": return req.cacheWrite5m;
    case "cache_write_1h": return req.cacheWrite1h;
    case "cache_read":     return req.cacheRead;
  }
}
