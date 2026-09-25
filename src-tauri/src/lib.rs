mod access;
mod bookmark;
mod catalog;
mod plans;
mod tray;

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use access::{AccessConfig, DataAccess, Granted};
use catalog::{Catalog, CatalogService, CatalogStatus};
use notify::RecommendedWatcher;
use plans::{PlanReport, PlanService};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::DialogExt;
use usage_core::{Db, Roots, Session, SessionDetail, ToolKind};

struct AppState {
    data_dir: PathBuf,
    db: Mutex<Db>,
    sources: Mutex<Sources>,
    catalog: Arc<CatalogService>,
    plans: Arc<PlanService>,
}

/// Where data is read from right now. Replaced as a whole whenever the user
/// grants a folder or toggles sample data.
struct Sources {
    config: AccessConfig,
    granted: Granted,
    roots: Roots,
    /// Only held, never read: dropping the old watcher stops it, so replacing
    /// this re-targets it.
    _watcher: Option<RecommendedWatcher>,
}

/// Real logs and sample data are cached in separate files so trying the sample
/// never touches the history cached from the user's own transcripts, which may
/// outlive the transcripts themselves.
fn db_path(data_dir: &Path, sample: bool) -> PathBuf {
    data_dir.join(if sample { "usage-sample.sqlite3" } else { "usage.sqlite3" })
}

fn sample_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("sample")
}

/// Roots for the current config. Sample mode regenerates the sample tree so
/// its dates are relative to now.
fn resolve_roots(data_dir: &Path, config: &AccessConfig, granted: &Granted) -> Roots {
    if config.sample {
        match usage_core::sample::write_sample(&sample_dir(data_dir), chrono::Utc::now()) {
            Ok(roots) => return roots,
            Err(e) => eprintln!("could not write sample data: {e:#}"),
        }
    }
    granted.roots()
}

fn start_watcher(app: &AppHandle, roots: &Roots) -> Option<RecommendedWatcher> {
    let handle = app.clone();
    let watch_roots = roots.clone();
    usage_core::watcher::watch_paths(&roots.paths(), move || {
        let Ok(sessions) = usage_core::scan_all(&watch_roots) else {
            return;
        };
        if let Some(state) = handle.try_state::<AppState>() {
            if let Ok(db) = state.db.lock() {
                let _ = db.upsert_sessions(&sessions);
            }
            state.plans.logs_changed();
        }
        let _ = handle.emit("usage-updated", ());
    })
    .ok()
}

fn current_roots(state: &AppState) -> Result<Roots, String> {
    Ok(state.sources.lock().map_err(|e| e.to_string())?.roots.clone())
}

/// Apply a changed config: persist it, re-point the roots, the cache and the
/// watcher, rescan, and tell the windows.
fn apply_config(app: &AppHandle, config: AccessConfig, granted: Granted) -> Result<DataAccess, String> {
    let state = app.state::<AppState>();
    config.save(&state.data_dir)?;

    let roots = resolve_roots(&state.data_dir, &config, &granted);
    let sessions = usage_core::scan_all(&roots).map_err(|e| e.to_string())?;
    {
        let mut db = state.db.lock().map_err(|e| e.to_string())?;
        *db = Db::open(&db_path(&state.data_dir, config.sample)).map_err(|e| e.to_string())?;
        if config.sample {
            db.clear_sessions().map_err(|e| e.to_string())?;
        }
        db.upsert_sessions(&sessions).map_err(|e| e.to_string())?;
    }

    let watcher = start_watcher(app, &roots);
    let described = access::describe(config.sample, &granted);
    // Plans follow the user's own sign-in, so they read the real folders even
    // while sample data is shown.
    state.plans.set_roots(granted.roots());
    *state.sources.lock().map_err(|e| e.to_string())? = Sources { config, granted, roots, _watcher: watcher };

    let _ = app.emit("usage-updated", ());
    Ok(described)
}

fn grantable(tool: ToolKind) -> Result<ToolKind, String> {
    if access::GRANTABLE.contains(&tool) {
        Ok(tool)
    } else {
        Err(format!("{} has no log folder to grant", tool.as_str()))
    }
}

#[tauri::command]
fn list_sessions(state: tauri::State<AppState>) -> Result<Vec<Session>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.all_sessions().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_session_detail(state: tauri::State<AppState>, session_id: String) -> Result<SessionDetail, String> {
    let roots = current_roots(&state)?;
    usage_core::get_session_detail(&roots, &session_id).map_err(|e| e.to_string())
}

/// Empty the cache and rebuild it from the transcripts on disk.
///
/// The cache is derived data — every row here is recomputed from the log
/// folders. Resetting is the way to drop rows for transcripts that were
/// deleted, and to pick up a pricing or parser change without waiting for a
/// schema bump.
#[tauri::command]
fn reset_database(state: tauri::State<AppState>, app: AppHandle) -> Result<usize, String> {
    let sessions = usage_core::scan_all(&current_roots(&state)?).map_err(|e| e.to_string())?;
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
    let sessions = usage_core::scan_all(&current_roots(&state)?).map_err(|e| e.to_string())?;
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.upsert_sessions(&sessions).map_err(|e| e.to_string())?;
    Ok(sessions.len())
}

#[tauri::command]
fn get_data_access(state: tauri::State<AppState>) -> Result<DataAccess, String> {
    let sources = state.sources.lock().map_err(|e| e.to_string())?;
    Ok(access::describe(sources.config.sample, &sources.granted))
}

/// Ask the user to pick a tool's log folder, and keep access to it.
///
/// Opens the panel at the tool's default location under the real home, so in
/// the common case the user only has to press Open. Choosing the folder also
/// leaves sample mode — that is what the user is asking for. Cancelling
/// changes nothing.
#[tauri::command]
async fn grant_source_access(app: AppHandle, tool: ToolKind, title: String) -> Result<DataAccess, String> {
    let tool = grantable(tool)?;
    let mut dialog = app.dialog().file().set_title(title).set_can_create_directories(false);
    if let Some(dir) = access::default_root(tool) {
        dialog = dialog.set_directory(dir);
    }
    if let Some(main) = app.get_webview_window(tray::MAIN) {
        dialog = dialog.set_parent(&main);
    }
    let Some(picked) = dialog.blocking_pick_folder() else {
        return get_data_access(app.state::<AppState>());
    };
    let picked = picked.into_path().map_err(|e| e.to_string())?;

    let grant = access::grant_for_picked(tool, &picked)?;
    let root = match &grant.subdir {
        Some(sub) => picked.join(sub),
        None => picked,
    };

    let (mut config, mut granted) = {
        let state = app.state::<AppState>();
        let sources = state.sources.lock().map_err(|e| e.to_string())?;
        (sources.config.clone(), sources.granted.clone())
    };
    config.set_grant(tool, Some(grant));
    config.sample = false;
    granted.set(tool, Some(root));
    apply_config(&app, config, granted)
}

/// Forget a granted folder; the tool falls back to its default location.
#[tauri::command]
fn clear_source_access(app: AppHandle, tool: ToolKind) -> Result<DataAccess, String> {
    let tool = grantable(tool)?;
    let (mut config, mut granted) = {
        let state = app.state::<AppState>();
        let sources = state.sources.lock().map_err(|e| e.to_string())?;
        (sources.config.clone(), sources.granted.clone())
    };
    config.set_grant(tool, None);
    granted.set(tool, None);
    apply_config(&app, config, granted)
}

#[tauri::command]
fn set_sample_data(app: AppHandle, enabled: bool) -> Result<DataAccess, String> {
    let (mut config, granted) = {
        let state = app.state::<AppState>();
        let sources = state.sources.lock().map_err(|e| e.to_string())?;
        (sources.config.clone(), sources.granted.clone())
    };
    config.sample = enabled;
    apply_config(&app, config, granted)
}

/// The downloaded price catalog, or null while online updates are off or
/// nothing valid has been downloaded yet.
#[tauri::command]
fn get_price_catalog(state: tauri::State<AppState>) -> Option<Catalog> {
    state.catalog.catalog()
}

#[tauri::command]
fn get_price_catalog_status(state: tauri::State<AppState>) -> CatalogStatus {
    state.catalog.status()
}

#[tauri::command]
fn set_price_catalog_enabled(state: tauri::State<AppState>, app: AppHandle, enabled: bool) -> CatalogStatus {
    state.catalog.set_enabled(&app, enabled);
    state.catalog.status()
}

/// "Check now" in Settings. Blocks on the network, so it runs off the main thread.
#[tauri::command]
async fn check_price_catalog(app: AppHandle) -> Result<CatalogStatus, String> {
    let service = app.state::<AppState>().catalog.clone();
    tauri::async_runtime::spawn_blocking(move || {
        service.check_now(&app)?;
        Ok(service.status())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn get_plan_status(state: tauri::State<AppState>) -> PlanReport {
    state.plans.report()
}

/// "Refresh now" in the UI. Blocks on the network while live checks are on,
/// so it runs off the main thread.
#[tauri::command]
async fn refresh_plan_status(app: AppHandle) -> Result<PlanReport, String> {
    let service = app.state::<AppState>().plans.clone();
    tauri::async_runtime::spawn_blocking(move || service.refresh_now(&app))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn set_plan_online_enabled(state: tauri::State<AppState>, enabled: bool) -> Result<PlanReport, String> {
    state.plans.set_online(enabled)?;
    Ok(state.plans.report())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;

            let mut config = AccessConfig::load(&data_dir);
            let (granted, refreshed) = access::resolve_grants(&mut config);
            if refreshed {
                let _ = config.save(&data_dir);
            }
            let roots = resolve_roots(&data_dir, &config, &granted);

            let db = Db::open(&db_path(&data_dir, config.sample)).map_err(|e| e.to_string())?;
            let initial = usage_core::scan_all(&roots).unwrap_or_default();
            if config.sample {
                db.clear_sessions().map_err(|e| e.to_string())?;
            }
            db.upsert_sessions(&initial).map_err(|e| e.to_string())?;

            let watcher = start_watcher(app.handle(), &roots);
            let catalog = CatalogService::start(app.handle(), data_dir.clone());
            let plans = PlanService::start(app.handle(), data_dir.clone(), granted.roots());
            app.manage(AppState {
                data_dir,
                catalog,
                plans,
                db: Mutex::new(db),
                sources: Mutex::new(Sources { config, granted, roots, _watcher: watcher }),
            });
            tray::init(app.handle())?;

            Ok(())
        })
        .on_window_event(tray::on_window_event)
        .invoke_handler(tauri::generate_handler![
            list_sessions,
            get_session_detail,
            rescan,
            reset_database,
            get_data_access,
            grant_source_access,
            clear_source_access,
            set_sample_data,
            get_price_catalog,
            get_price_catalog_status,
            set_price_catalog_enabled,
            check_price_catalog,
            get_plan_status,
            refresh_plan_status,
            set_plan_online_enabled,
            tray::show_tray_popover,
            tray::tray_popover_ready,
            tray::hide_tray_popover,
            tray::open_main_window,
            tray::localize_tray,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, _event| {
            // Dock icon (or re-launching the app) while the window is hidden in the tray.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = _event {
                tray::show_main(_app);
            }
        });
}
