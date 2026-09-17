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
import { contextWindow } from "../../pricing";
import type { Compaction, Request, SessionDetailPayload } from "../../types";
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
 * Per-request detail and compaction events come from the `get_session_detail`
 * Tauri command, which re-reads the transcript from disk.
 *
 * Requirements: 5.1–5.16, 10.6, 10.7, 11.3, 11.4
 */
export default function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { sessions, loading } = useSessionsContext();

  const [rawCounts, setRawCounts] = useState(false);
  const [requests, setRequests] = useState<Request[]>([]);
  const [compactions, setCompactions] = useState<Compaction[]>([]);
  const [transcriptPath, setTranscriptPath] = useState<string | null>(null);
  const [requestsLoading, setRequestsLoading] = useState(false);

  // Fetch per-request detail whenever the session id changes.
  // The Tauri command re-reads the .jsonl file from disk.
  useEffect(() => {
    if (!id) return;
    setRequestsLoading(true);
    invoke<SessionDetailPayload>("get_session_detail", { sessionId: id })
      .then((detail) => {
        setRequests(detail.requests.map(toRequest));
        setCompactions(detail.compactions);
        setTranscriptPath(detail.transcript_path);
      })
      .catch((err) => console.error("get_session_detail failed:", err))
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

  // Authoritative request count: prefer live fetched requests; fall back to
  // session.message_count while the fetch is still in-flight.
  const requestCount = requests.length > 0 ? requests.length : session.message_count;

  // Claude Code logs each compaction explicitly, so this is a count of real
  // events rather than an inference from the context curve.
  const compactionEvents: CompactionEvent[] = compactions.map((c) => ({
    beforeIndex: c.before_index,
    preTokens: c.pre_tokens,
    postTokens: c.post_tokens,
  }));
  const compactionCount = compactions.length;

  // Build RequestPoint[] for the context-usage chart from real context_tokens.
  const requestPoints: RequestPoint[] = requests.map((r) => ({
    index: r.index,
    contextTokens: r.contextTokens,
  }));

  // Ceiling comes from the model that carried the largest prompt, not the
  // session's first turn: Claude Code opens many sessions with a Haiku title
  // call, whose 200K window would understate a 1M-window session fivefold.
  const peakRequest = requests.reduce<Request | null>(
    (peak, r) => (peak === null || r.contextTokens > peak.contextTokens ? r : peak),
    null,
  );
  const ceilingModel = peakRequest?.model ?? session.model ?? null;
  const modelLabel = ceilingModel ?? "claude";
  const ceiling = contextWindow(ceilingModel);

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
        compactions={compactionEvents}
        ceiling={ceiling}
        ceilingLabel={`${ceiling.toLocaleString()} tokens`}
        modelLabel={modelLabel}
      />

      {/* Request table (Req 5.10–5.16) */}
      <RequestsTable
        requests={requests}
        rawCounts={rawCounts}
        onToggleRawCounts={setRawCounts}
        loading={requestsLoading}
        transcriptPath={transcriptPath}
      />
    </div>
  );
}
