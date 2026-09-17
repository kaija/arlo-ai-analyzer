use std::sync::Mutex;
use tauri::{Emitter, Manager};
use usage_core::{Db, Session, SessionDetail};

struct AppState {
    db: Mutex<Db>,
}

#[tauri::command]
fn list_sessions(state: tauri::State<AppState>) -> Result<Vec<Session>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.all_sessions().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_session_detail(session_id: String) -> Result<SessionDetail, String> {
    usage_core::get_session_detail(&session_id).map_err(|e| e.to_string())
}

/// Empty the cache and rebuild it from the transcripts on disk.
///
/// The cache is derived data — every row here is recomputed from
/// `~/.claude/projects`. Resetting is the way to drop rows for transcripts
/// that were deleted, and to pick up a pricing or parser change without
/// waiting for a schema bump.
#[tauri::command]
fn reset_database(state: tauri::State<AppState>, app: tauri::AppHandle) -> Result<usize, String> {
    let sessions = usage_core::scan_all().map_err(|e| e.to_string())?;
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.clear_sessions().map_err(|e| e.to_string())?;
        db.upsert_sessions(&sessions).map_err(|e| e.to_string())?;
    }
    let _ = app.emit("usage-updated", ());
    Ok(sessions.len())
}

#[tauri::command]
fn rescan(state: tauri::State<AppState>) -> Result<usize, String> {
    let sessions = usage_core::scan_all().map_err(|e| e.to_string())?;
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.upsert_sessions(&sessions).map_err(|e| e.to_string())?;
    Ok(sessions.len())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let db = Db::open(&data_dir.join("usage.sqlite3")).map_err(|e| e.to_string())?;

            let initial = usage_core::scan_all().unwrap_or_default();
            db.upsert_sessions(&initial).map_err(|e| e.to_string())?;

            app.manage(AppState { db: Mutex::new(db) });

            let roots: Vec<_> = [
                usage_core::sources::claude_code::default_root(),
                usage_core::sources::codex_cli::default_root(),
            ]
            .into_iter()
            .flatten()
            .collect();
            if !roots.is_empty() {
                let handle = app.handle().clone();
                let watcher = usage_core::watcher::watch_paths(&roots, move || {
                    let Ok(sessions) = usage_core::scan_all() else {
                        return;
                    };
                    if let Some(state) = handle.try_state::<AppState>() {
                        if let Ok(db) = state.db.lock() {
                            let _ = db.upsert_sessions(&sessions);
                        }
                    }
                    let _ = handle.emit("usage-updated", ());
                });
                if let Ok(watcher) = watcher {
                    // ponytail: leaked for the app's lifetime so the watcher thread
                    // keeps running; fine for a single long-lived desktop process
                    std::mem::forget(watcher);
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![list_sessions, get_session_detail, rescan, reset_database])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
