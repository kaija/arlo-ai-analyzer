use crate::model::{Session, ToolKind};
use anyhow::Result;
use rusqlite::{params, Connection};
use std::path::Path;

pub struct Db {
    conn: Connection,
}

impl Db {
    pub fn open(path: &Path) -> Result<Self> {
        let conn = Connection::open(path)?;
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
                cache_read_tokens INTEGER NOT NULL,
                message_count INTEGER NOT NULL,
                PRIMARY KEY (tool, session_id)
            );",
        )?;
        Ok(Self { conn })
    }

    pub fn upsert_sessions(&self, sessions: &[Session]) -> Result<()> {
        for s in sessions {
            self.conn.execute(
                "INSERT INTO sessions
                    (tool, session_id, project, started_at, model, input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, message_count)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
                 ON CONFLICT(tool, session_id) DO UPDATE SET
                    project = excluded.project,
                    started_at = excluded.started_at,
                    model = excluded.model,
                    input_tokens = excluded.input_tokens,
                    output_tokens = excluded.output_tokens,
                    cache_creation_tokens = excluded.cache_creation_tokens,
                    cache_read_tokens = excluded.cache_read_tokens,
                    message_count = excluded.message_count",
                params![
                    s.tool.as_str(),
                    s.session_id,
                    s.project,
                    s.started_at.to_rfc3339(),
                    s.model,
                    s.input_tokens,
                    s.output_tokens,
                    s.cache_creation_tokens,
                    s.cache_read_tokens,
                    s.message_count,
                ],
            )?;
        }
        Ok(())
    }

    pub fn all_sessions(&self) -> Result<Vec<Session>> {
        let mut stmt = self.conn.prepare(
            "SELECT tool, session_id, project, started_at, model, input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, message_count
             FROM sessions",
        )?;
        let rows = stmt.query_map([], |row| {
            let tool: String = row.get(0)?;
            let started_at: String = row.get(3)?;
            Ok(Session {
                tool: ToolKind::from_str(&tool),
                session_id: row.get(1)?,
                project: row.get(2)?,
                started_at: chrono::DateTime::parse_from_rfc3339(&started_at)
                    .map(|d| d.with_timezone(&chrono::Utc))
                    .unwrap_or_else(|_| chrono::Utc::now()),
                model: row.get(4)?,
                input_tokens: row.get(5)?,
                output_tokens: row.get(6)?,
                cache_creation_tokens: row.get(7)?,
                cache_read_tokens: row.get(8)?,
                message_count: row.get(9)?,
            })
        })?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(Into::into)
    }
}
