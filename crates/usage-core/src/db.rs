use crate::model::{Session, ToolKind};
use crate::tool_usage::StoredSession;
use anyhow::Result;
use rusqlite::{params, Connection};
use std::path::Path;

/// Bump whenever the `sessions` columns change.
///
/// The table is a pure cache of the on-disk transcripts — every launch and
/// every rescan recomputes it from source — so a schema change is handled by
/// dropping the table and letting the next scan refill it. That is cheaper
/// than per-column `ALTER TABLE` migrations and can't drift.
const SCHEMA_VERSION: i64 = 6;

pub struct Db {
    conn: Connection,
}

impl Db {
    pub fn open(path: &Path) -> Result<Self> {
        let conn = Connection::open(path)?;

        let version: i64 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
        if version != SCHEMA_VERSION {
            conn.execute_batch("DROP TABLE IF EXISTS sessions;")?;
            conn.pragma_update(None, "user_version", SCHEMA_VERSION)?;
        }

        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS sessions (
                tool TEXT NOT NULL,
                session_id TEXT NOT NULL,
                project TEXT NOT NULL,
                started_at TEXT NOT NULL,
                model TEXT,
                input_tokens INTEGER NOT NULL,
                output_tokens INTEGER NOT NULL,
                cache_creation_tokens INTEGER NOT NULL,
                cache_write_5m INTEGER NOT NULL,
                cache_write_1h INTEGER NOT NULL,
                cache_read_tokens INTEGER NOT NULL,
                peak_context_tokens INTEGER NOT NULL,
                peak_context_model TEXT,
                compaction_count INTEGER NOT NULL,
                message_count INTEGER NOT NULL,
                cost_usd REAL NOT NULL,
                tools_json TEXT NOT NULL DEFAULT '{}',
                PRIMARY KEY (tool, session_id)
            );
            CREATE INDEX IF NOT EXISTS sessions_started_at ON sessions (started_at);",
        )?;
        Ok(Self { conn })
    }

    pub fn upsert_sessions(&self, sessions: &[Session]) -> Result<()> {
        for s in sessions {
            self.conn.execute(
                "INSERT INTO sessions
                    (tool, session_id, project, started_at, model, input_tokens, output_tokens, cache_creation_tokens, cache_write_5m, cache_write_1h, cache_read_tokens, peak_context_tokens, peak_context_model, compaction_count, message_count, cost_usd, tools_json)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)
                 ON CONFLICT(tool, session_id) DO UPDATE SET
                    project = excluded.project,
                    started_at = excluded.started_at,
                    model = excluded.model,
                    input_tokens = excluded.input_tokens,
                    output_tokens = excluded.output_tokens,
                    cache_creation_tokens = excluded.cache_creation_tokens,
                    cache_write_5m = excluded.cache_write_5m,
                    cache_write_1h = excluded.cache_write_1h,
                    cache_read_tokens = excluded.cache_read_tokens,
                    peak_context_tokens = excluded.peak_context_tokens,
                    peak_context_model = excluded.peak_context_model,
                    compaction_count = excluded.compaction_count,
                    message_count = excluded.message_count,
                    cost_usd = excluded.cost_usd,
                    tools_json = excluded.tools_json",
                params![
                    s.tool.as_str(),
                    s.session_id,
                    s.project,
                    s.started_at.to_rfc3339(),
                    s.model,
                    s.input_tokens,
                    s.output_tokens,
                    s.cache_creation_tokens,
                    s.cache_write_5m,
                    s.cache_write_1h,
                    s.cache_read_tokens,
                    s.peak_context_tokens,
                    s.peak_context_model,
                    s.compaction_count,
                    s.message_count,
                    s.cost_usd,
                    serde_json::to_string(&s.tools)?,
                ],
            )?;
        }
        Ok(())
    }

    /// Drop every cached row.
    ///
    /// `upsert_sessions` only ever inserts or updates, so a session whose
    /// transcript was deleted lingers in the cache forever. Clearing before a
    /// rescan is the only way to get rid of those.
    pub fn clear_sessions(&self) -> Result<usize> {
        let removed = self.conn.execute("DELETE FROM sessions", [])?;
        Ok(removed)
    }

    pub fn all_sessions(&self) -> Result<Vec<Session>> {
        let mut stmt = self.conn.prepare(
            "SELECT tool, session_id, project, started_at, model, input_tokens, output_tokens, cache_creation_tokens, cache_write_5m, cache_write_1h, cache_read_tokens, peak_context_tokens, peak_context_model, compaction_count, message_count, cost_usd
             FROM sessions",
        )?;
        let rows = stmt.query_map([], |row| {
            let tool: String = row.get(0)?;
            let started_at: String = row.get(3)?;
            Ok(Session {
                tool: tool.parse().unwrap_or(ToolKind::ClaudeCode),
                session_id: row.get(1)?,
                project: row.get(2)?,
                started_at: chrono::DateTime::parse_from_rfc3339(&started_at)
                    .map(|d| d.with_timezone(&chrono::Utc))
                    .unwrap_or_else(|_| chrono::Utc::now()),
                model: row.get(4)?,
                input_tokens: row.get(5)?,
                output_tokens: row.get(6)?,
                cache_creation_tokens: row.get(7)?,
                cache_write_5m: row.get(8)?,
                cache_write_1h: row.get(9)?,
                cache_read_tokens: row.get(10)?,
                peak_context_tokens: row.get(11)?,
                peak_context_model: row.get(12)?,
                compaction_count: row.get(13)?,
                message_count: row.get(14)?,
                cost_usd: row.get(15)?,
                // Only the Tools page needs it, through `tool_sessions`.
                tools: Default::default(),
            })
        })?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(Into::into)
    }

    /// Every session's tool data, for the cross-session Tools report.
    pub fn tool_sessions(&self) -> Result<Vec<StoredSession>> {
        let mut stmt = self
            .conn
            .prepare("SELECT tool, session_id, started_at, message_count, tools_json FROM sessions")?;
        let rows = stmt.query_map([], |row| {
            let tool: String = row.get(0)?;
            let started_at: String = row.get(2)?;
            let json: String = row.get(4)?;
            Ok(StoredSession {
                tool: tool.parse().unwrap_or(ToolKind::ClaudeCode),
                session_id: row.get(1)?,
                started_at: chrono::DateTime::parse_from_rfc3339(&started_at)
                    .map(|d| d.with_timezone(&chrono::Utc))
                    .unwrap_or_else(|_| chrono::Utc::now()),
                requests: row.get(3)?,
                data: serde_json::from_str(&json).unwrap_or_default(),
            })
        })?;
        rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    fn sample() -> Session {
        Session {
            tool: ToolKind::ClaudeCode,
            session_id: "s1".into(),
            project: "/tmp/p".into(),
            started_at: Utc::now(),
            model: Some("claude-opus-5".into()),
            input_tokens: 1,
            output_tokens: 2,
            cache_creation_tokens: 30,
            cache_write_5m: 10,
            cache_write_1h: 20,
            cache_read_tokens: 4,
            peak_context_tokens: 41,
            peak_context_model: Some("claude-opus-5".into()),
            compaction_count: 2,
            message_count: 5,
            cost_usd: 1.25,
            tools: Default::default(),
        }
    }

    /// The bug this schema change fixes: cost and the 5m/1h split were computed
    /// during the scan and then dropped on the way through the cache, so the UI
    /// always saw cost 0 and fell back to a coarser estimate.
    #[test]
    fn round_trip_preserves_cost_and_cache_tiers() {
        let dir = tempfile::tempdir().unwrap();
        let db = Db::open(&dir.path().join("usage.sqlite3")).unwrap();
        db.upsert_sessions(&[sample()]).unwrap();

        let loaded = db.all_sessions().unwrap();
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].cost_usd, 1.25);
        assert_eq!(loaded[0].cache_write_5m, 10);
        assert_eq!(loaded[0].cache_write_1h, 20);
        assert_eq!(loaded[0].peak_context_tokens, 41);
    }

    #[test]
    fn tool_data_round_trips_through_its_own_reader() {
        use crate::tool_usage::{CallCount, CapabilityKind, SessionTools};
        let dir = tempfile::tempdir().unwrap();
        let db = Db::open(&dir.path().join("usage.sqlite3")).unwrap();
        let mut s = sample();
        s.tools = SessionTools {
            baseline_tokens: Some(52_000),
            calls: vec![CallCount { kind: CapabilityKind::Builtin, name: "Bash".into(), tool: None, calls: 7, errors: 1 }],
            listed: None,
        };
        db.upsert_sessions(&[s.clone()]).unwrap();

        // The session list stays light.
        assert!(db.all_sessions().unwrap()[0].tools.calls.is_empty());
        let stored = db.tool_sessions().unwrap();
        assert_eq!(stored[0].data, s.tools);
        assert_eq!(stored[0].requests, 5);
    }

    /// Rows for transcripts that no longer exist can only leave the cache
    /// through an explicit clear — upsert never deletes.
    #[test]
    fn clear_removes_rows_that_a_rescan_would_have_left_behind() {
        let dir = tempfile::tempdir().unwrap();
        let db = Db::open(&dir.path().join("usage.sqlite3")).unwrap();
        db.upsert_sessions(&[sample()]).unwrap();

        assert_eq!(db.clear_sessions().unwrap(), 1);
        assert!(db.all_sessions().unwrap().is_empty());

        // Still usable afterwards — the table is emptied, not dropped.
        db.upsert_sessions(&[sample()]).unwrap();
        assert_eq!(db.all_sessions().unwrap().len(), 1);
    }

    #[test]
    fn stale_schema_is_rebuilt_rather_than_migrated() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("usage.sqlite3");

        // Simulate a cache written by an older build: previous schema, no
        // cost_usd column, and a row in it.
        let old = Connection::open(&path).unwrap();
        old.execute_batch(
            "CREATE TABLE sessions (tool TEXT, session_id TEXT, PRIMARY KEY (tool, session_id));
             INSERT INTO sessions VALUES ('claude_code', 'old');",
        )
        .unwrap();
        old.pragma_update(None, "user_version", 1i64).unwrap();
        drop(old);

        let db = Db::open(&path).unwrap();
        assert!(db.all_sessions().unwrap().is_empty());
        db.upsert_sessions(&[sample()]).unwrap();
        assert_eq!(db.all_sessions().unwrap()[0].cost_usd, 1.25);
    }
}
