import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { useSessionsContext } from "../../context/SessionsContext";
import { SessionHeader } from "./SessionHeader";
import { RequestsTable } from "./RequestsTable";
import {
  ContextTimelineChart,
  type RequestPoint,
  type CompactionEvent,
} from "../../charts/ContextTimelineChart";
import type { Request, SessionRequest } from "../../types";
import { toRequest } from "../../types";

// ---------------------------------------------------------------------------
// ContextChartCard — card wrapper around ContextTimelineChart
// ---------------------------------------------------------------------------

interface ContextChartCardProps {
  requests: RequestPoint[];
  compactions: CompactionEvent[];
  ceiling: number;
  ceilingLabel: string;
  /** Human-readable model name shown beside the ceiling token count */
  modelLabel: string;
}

function ContextChartCard({
  requests,
  compactions,
  ceiling,
  ceilingLabel,
  modelLabel,
}: ContextChartCardProps) {
  return (
    <div className="card chart-card">
      <div className="card-head">
        <h2 className="card-title">Context usage across session</h2>
        <div className="ceiling-note">
          Ceiling: {modelLabel} · {ceilingLabel}
        </div>
      </div>
      <div className="ctx-chart-wrap">
        <ContextTimelineChart
          requests={requests}
          compactions={compactions}
          ceiling={ceiling}
          ceilingLabel={ceilingLabel}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SessionDetailPage
// ---------------------------------------------------------------------------

/**
 * SessionDetailPage
 *
 * Reads `params.id` from the URL, finds the session in `SessionsContext`, and
 * renders the full Session Detail screen:
 *
 * - Error state with a link back to /sessions if the session is not found
 * - `SessionHeader` — name, metadata, four stat items
 * - `ContextChartCard` (wrapping `ContextTimelineChart`)
 * - Request toolbar: count label + raw-counts `Switch`
 * - `RequestsTable` — per-request rows with mini-bar / raw-counts toggle
 *
 * Per-request detail (requests, compactions) is not yet available from the
 * backend. Stubs are used with // TODO: needs backend markers.
 *
 * Requirements: 5.1–5.16, 10.6, 10.7, 11.3, 11.4
 */
export default function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { sessions, loading } = useSessionsContext();

  const [rawCounts, setRawCounts] = useState(false);
  const [requests, setRequests] = useState<Request[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);

  // Fetch per-request detail whenever the session id changes.
  // The Tauri command re-reads the .jsonl file from disk.
  useEffect(() => {
    if (!id) return;
    setRequestsLoading(true);
    invoke<SessionRequest[]>("get_session_requests", { sessionId: id })
      .then((raw) => setRequests(raw.map(toRequest)))
      .catch((err) => console.error("get_session_requests failed:", err))
      .finally(() => setRequestsLoading(false));
  }, [id]);

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="session-detail-loading">
        <p className="text-muted">Loading session…</p>
      </div>
    );
  }

  // ── Not found state (Requirement 10.7, 11.3) ──────────────────────────────
  const session = sessions.find((s) => s.session_id === id);

  if (!session) {
    return (
      <div className="session-detail-not-found">
        <h1 className="session-not-found-title">Session not found</h1>
        <p className="text-muted">
          No session matching <code>{id}</code> exists in the current data set.
        </p>
        <Link to="/sessions" className="back-link">
          ← Back to Sessions
        </Link>
      </div>
    );
  }

  // ── Derived: real request data from the backend invoke ───────────────────

  // Compactions: not yet detected from JSONL; derive from drops in context_tokens.
  const compactions: CompactionEvent[] = [];

  // Authoritative request count: prefer live fetched requests; fall back to
  // session.message_count while the fetch is still in-flight.
  const requestCount = requests.length > 0 ? requests.length : session.message_count;

  // Compaction count placeholder — no compaction detection yet.
  const compactionCount = 0;

  // Build RequestPoint[] for the context-usage chart from real context_tokens.
  const requestPoints: RequestPoint[] = requests.map((r) => ({
    index: r.index,
    contextTokens: r.contextTokens,
  }));

  // Model label for the ceiling note.
  const modelLabel = session.model ?? requests[0]?.model ?? "claude";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="detail-body">
      {/* Header: back link, session name, metadata, stat items (Req 5.1, 5.2) */}
      <SessionHeader
        session={session}
        requestCount={requestCount}
        compactionCount={compactionCount}
      />

      {/* Context usage chart card (Req 5.3–5.9) */}
      <ContextChartCard
        requests={requestPoints}
        compactions={compactions}
        ceiling={200_000}
        ceilingLabel="200,000 tokens"
        modelLabel={modelLabel}
      />

      {/* Request table (Req 5.10–5.16) */}
      <RequestsTable
        requests={requests}
        rawCounts={rawCounts}
        onToggleRawCounts={setRawCounts}
        loading={requestsLoading}
      />
    </div>
  );
}
