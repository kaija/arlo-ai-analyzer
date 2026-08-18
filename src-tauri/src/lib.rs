use std::sync::Mutex;
use tauri::{Emitter, Manager};
use usage_core::{Db, Session};

struct AppState {
    db: Mutex<Db>,
}

#[tauri::command]
fn list_sessions(state: tauri::State<AppState>) -> Result<Vec<Session>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.all_sessions().map_err(|e| e.to_string())
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

            if let Some(root) = usage_core::sources::claude_code::default_root() {
                let handle = app.handle().clone();
                let watcher = usage_core::watcher::watch_paths(&[root], move || {
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
        .invoke_handler(tauri::generate_handler![list_sessions, rescan])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
