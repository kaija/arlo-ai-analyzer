//! The online model price catalog: the app's one network call.
//!
//! A daily GitHub Action republishes OpenRouter's model list, trimmed, as
//! `models.json` on the project's GitHub Pages site. This fetches that whole
//! file — never a per-model lookup, so the request says nothing about which
//! models the user runs, and a self-hosted model that will never be listed
//! can't cause repeated requests. At most one conditional GET (`ETag`) per
//! day; failures back off 1h → 4h → 24h. The front end uses the catalog only
//! for models the hand-checked tables don't cover (`rateFor` in pricing.ts).
//!
//! Persisted in the app data dir: `model-catalog.json` (the last valid file,
//! byte for byte) and `model-catalog-state.json` (switch, ETag, schedule).

use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

pub const CATALOG_URL: &str = "https://ai-analyzer.arlo-ai.app/models.json";
pub const UPDATED_EVENT: &str = "price-catalog-updated";

const CATALOG_FILE: &str = "model-catalog.json";
const STATE_FILE: &str = "model-catalog-state.json";
/// The only `schemaVersion` this build reads. An incompatible format is
/// published at a new path (`models.v2.json`), so old builds never see it.
const SCHEMA_VERSION: u32 = 1;
/// Fewer models than this means a broken upstream response, not a real list.
pub const MIN_MODELS: usize = 50;
/// A generous ceiling: the real file is a few hundred KB.
const MAX_BYTES: u64 = 16 * 1024 * 1024;
/// "Check now" inside this window after a good check is answered from state.
const MANUAL_MIN_INTERVAL_SECS: i64 = 60;

// ---------------------------------------------------------------------------
// File format
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Catalog {
    pub schema_version: u32,
    pub generated_at: String,
    pub source: String,
    pub models: BTreeMap<String, CatalogModel>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogModel {
    pub name: String,
    pub context_length: u64,
    pub input_per_mtok: f64,
    pub output_per_mtok: f64,
    pub cache_read_per_mtok: f64,
    pub cache_write_per_mtok: f64,
    pub cache_write1h_per_mtok: f64,
}

impl CatalogModel {
    fn rates(&self) -> [f64; 5] {
        [
            self.input_per_mtok,
            self.output_per_mtok,
            self.cache_read_per_mtok,
            self.cache_write_per_mtok,
            self.cache_write1h_per_mtok,
        ]
    }
}

/// Parse and sanity-check a downloaded catalog. Anything that fails is
/// discarded and the previous file kept — a bad upstream day must never wipe
/// out working prices.
pub fn validate(bytes: &[u8]) -> Result<Catalog, String> {
    let catalog: Catalog = serde_json::from_slice(bytes).map_err(|e| format!("invalid catalog: {e}"))?;
    if catalog.schema_version != SCHEMA_VERSION {
        return Err(format!("unsupported catalog schemaVersion {}", catalog.schema_version));
    }
    if catalog.models.len() < MIN_MODELS {
        return Err(format!("catalog lists only {} models", catalog.models.len()));
    }
    if let Some((id, _)) = catalog
        .models
        .iter()
        .find(|(_, m)| m.rates().iter().any(|r| !r.is_finite() || *r < 0.0))
    {
        return Err(format!("catalog has an invalid rate for {id}"));
    }
    Ok(catalog)
}

// ---------------------------------------------------------------------------
// Persisted state and schedule
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CatalogState {
    #[serde(default = "enabled_by_default")]
    pub enabled: bool,
    #[serde(default)]
    pub etag: Option<String>,
    /// Last attempt, successful or not.
    #[serde(default)]
    pub last_checked: Option<DateTime<Utc>>,
    /// Last time a new file was stored.
    #[serde(default)]
    pub last_updated: Option<DateTime<Utc>>,
    #[serde(default)]
    pub last_error: Option<String>,
    /// Consecutive failed attempts; drives the backoff.
    #[serde(default)]
    pub failures: u32,
    /// None means due now.
    #[serde(default)]
    pub next_check: Option<DateTime<Utc>>,
}

fn enabled_by_default() -> bool {
    true
}

impl Default for CatalogState {
    fn default() -> Self {
        Self {
            enabled: true,
            etag: None,
            last_checked: None,
            last_updated: None,
            last_error: None,
            failures: 0,
            next_check: None,
        }
    }
}

impl CatalogState {
    fn load(data_dir: &Path) -> Self {
        std::fs::read(data_dir.join(STATE_FILE))
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default()
    }

    fn save(&self, data_dir: &Path) -> Result<(), String> {
        let json = serde_json::to_vec_pretty(self).map_err(|e| e.to_string())?;
        std::fs::write(data_dir.join(STATE_FILE), json).map_err(|e| e.to_string())
    }

    fn is_due(&self, now: DateTime<Utc>) -> bool {
        self.next_check.is_none_or(|at| at <= now)
    }
}

/// Wait before the next attempt: a day after a good check, and a backoff of
/// 1h, 4h, then 24h after consecutive failures.
pub fn base_delay(failures: u32) -> Duration {
    match failures {
        0 => Duration::hours(24),
        1 => Duration::hours(1),
        2 => Duration::hours(4),
        _ => Duration::hours(24),
    }
}

/// `jitter` in [0, 1) stretches the delay by up to 10% so installs that
/// launched together don't stay in lockstep.
pub fn next_check_after(now: DateTime<Utc>, failures: u32, jitter: f64) -> DateTime<Utc> {
    let base = base_delay(failures);
    let extra = (base.num_seconds() as f64 * 0.1 * jitter.clamp(0.0, 1.0)) as i64;
    now + base + Duration::seconds(extra)
}

fn jitter() -> f64 {
    // No `rand` for one number: the clock's sub-second part is spread enough.
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(0);
    f64::from(nanos) / 1e9
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

enum Fetched {
    NotModified,
    New { bytes: Vec<u8>, etag: Option<String> },
}

fn fetch(etag: Option<&str>) -> Result<Fetched, String> {
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(std::time::Duration::from_secs(30)))
        .https_only(true)
        .user_agent(concat!("arlo-ai-analyzer/", env!("CARGO_PKG_VERSION")))
        .build()
        .into();
    let mut request = agent.get(CATALOG_URL);
    if let Some(tag) = etag {
        request = request.header("If-None-Match", tag);
    }
    let mut response = request.call().map_err(|e| e.to_string())?;
    match response.status().as_u16() {
        304 => Ok(Fetched::NotModified),
        200 => {
            let etag = response
                .headers()
                .get("etag")
                .and_then(|v| v.to_str().ok())
                .map(str::to_string);
            let bytes = response
                .body_mut()
                .with_config()
                .limit(MAX_BYTES)
                .read_to_vec()
                .map_err(|e| e.to_string())?;
            Ok(Fetched::New { bytes, etag })
        }
        status => Err(format!("HTTP {status}")),
    }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/// What Settings shows about the catalog.
#[derive(Debug, Clone, Serialize)]
pub struct CatalogStatus {
    pub enabled: bool,
    pub url: &'static str,
    pub last_checked: Option<DateTime<Utc>>,
    pub last_updated: Option<DateTime<Utc>>,
    pub last_error: Option<String>,
    pub generated_at: Option<String>,
    pub model_count: usize,
}

pub struct CatalogService {
    data_dir: PathBuf,
    state: Mutex<CatalogState>,
    /// Serialises attempts so the worker and "Check now" never overlap.
    fetching: Mutex<()>,
    wake: Mutex<Sender<()>>,
}

impl CatalogService {
    /// Load state and start the background worker.
    pub fn start(app: &AppHandle, data_dir: PathBuf) -> std::sync::Arc<Self> {
        let (tx, rx) = mpsc::channel();
        let service = std::sync::Arc::new(Self {
            state: Mutex::new(CatalogState::load(&data_dir)),
            data_dir,
            fetching: Mutex::new(()),
            wake: Mutex::new(tx),
        });
        let worker = service.clone();
        let handle = app.clone();
        std::thread::spawn(move || worker.run(&handle, rx));
        service
    }

    fn catalog_path(&self) -> PathBuf {
        self.data_dir.join(CATALOG_FILE)
    }

    fn state(&self) -> CatalogState {
        self.state.lock().map(|s| s.clone()).unwrap_or_default()
    }

    fn update_state(&self, f: impl FnOnce(&mut CatalogState)) {
        if let Ok(mut state) = self.state.lock() {
            f(&mut state);
            if let Err(e) = state.save(&self.data_dir) {
                eprintln!("could not save price catalog state: {e}");
            }
        }
    }

    /// The stored catalog, or None while the switch is off — off means the
    /// app prices exactly as it would without this feature.
    pub fn catalog(&self) -> Option<Catalog> {
        if !self.state().enabled {
            return None;
        }
        let bytes = std::fs::read(self.catalog_path()).ok()?;
        validate(&bytes).ok()
    }

    pub fn status(&self) -> CatalogStatus {
        let state = self.state();
        let catalog = std::fs::read(self.catalog_path()).ok().and_then(|b| validate(&b).ok());
        CatalogStatus {
            enabled: state.enabled,
            url: CATALOG_URL,
            last_checked: state.last_checked,
            last_updated: state.last_updated,
            last_error: state.last_error,
            generated_at: catalog.as_ref().map(|c| c.generated_at.clone()),
            model_count: catalog.map_or(0, |c| c.models.len()),
        }
    }

    pub fn set_enabled(&self, app: &AppHandle, enabled: bool) {
        self.update_state(|s| s.enabled = enabled);
        self.wake();
        // Pricing switches between the catalog and the bundled table either way.
        let _ = app.emit(UPDATED_EVENT, ());
    }

    fn wake(&self) {
        if let Ok(tx) = self.wake.lock() {
            let _ = tx.send(());
        }
    }

    /// One attempt, now. Refuses while the switch is off; right after a good
    /// check it answers from state instead of asking again.
    pub fn check_now(&self, app: &AppHandle) -> Result<(), String> {
        let state = self.state();
        if !state.enabled {
            return Err("online price updates are turned off".into());
        }
        let recent = state
            .last_checked
            .is_some_and(|at| Utc::now() - at < Duration::seconds(MANUAL_MIN_INTERVAL_SECS));
        if recent && state.last_error.is_none() {
            return Ok(());
        }
        self.attempt(app)
    }

    fn attempt(&self, app: &AppHandle) -> Result<(), String> {
        let _guard = self.fetching.lock().map_err(|e| e.to_string())?;
        let etag = self.state().etag;
        // Only send the ETag when the file it describes is still on disk.
        let etag = etag.filter(|_| self.catalog_path().is_file());

        let outcome = fetch(etag.as_deref()).and_then(|fetched| match fetched {
            Fetched::NotModified => Ok(None),
            Fetched::New { bytes, etag } => {
                validate(&bytes)?;
                let tmp = self.data_dir.join(format!("{CATALOG_FILE}.tmp"));
                std::fs::write(&tmp, &bytes).map_err(|e| e.to_string())?;
                std::fs::rename(&tmp, self.catalog_path()).map_err(|e| e.to_string())?;
                Ok(Some(etag))
            }
        });

        let now = Utc::now();
        match outcome {
            Ok(stored) => {
                self.update_state(|s| {
                    s.last_checked = Some(now);
                    s.last_error = None;
                    s.failures = 0;
                    s.next_check = Some(next_check_after(now, 0, jitter()));
                    if let Some(etag) = &stored {
                        s.etag = etag.clone();
                        s.last_updated = Some(now);
                    }
                });
                if stored.is_some() {
                    let _ = app.emit(UPDATED_EVENT, ());
                }
                Ok(())
            }
            Err(e) => {
                self.update_state(|s| {
                    s.last_checked = Some(now);
                    s.last_error = Some(e.clone());
                    s.failures = s.failures.saturating_add(1);
                    s.next_check = Some(next_check_after(now, s.failures, jitter()));
                });
                Err(e)
            }
        }
    }

    fn run(&self, app: &AppHandle, rx: Receiver<()>) {
        loop {
            let state = self.state();
            let now = Utc::now();
            if state.enabled && state.is_due(now) {
                if let Err(e) = self.attempt(app) {
                    eprintln!("price catalog update failed: {e}");
                }
                continue;
            }
            // Sleep until due, or until the switch or "Check now" wakes us.
            let woke = if state.enabled {
                let wait = state.next_check.map_or(Duration::zero(), |at| at - now);
                rx.recv_timeout(wait.to_std().unwrap_or_default())
            } else {
                rx.recv().map_err(|_| RecvTimeoutError::Disconnected)
            };
            if let Err(RecvTimeoutError::Disconnected) = woke {
                return;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn model(input: f64) -> CatalogModel {
        CatalogModel {
            name: "Test".into(),
            context_length: 128_000,
            input_per_mtok: input,
            output_per_mtok: input * 4.0,
            cache_read_per_mtok: input * 0.1,
            cache_write_per_mtok: 0.0,
            cache_write1h_per_mtok: 0.0,
        }
    }

    fn catalog_json(count: usize, version: u32) -> Vec<u8> {
        let models = (0..count).map(|i| (format!("vendor/model-{i}"), model(1.0))).collect();
        serde_json::to_vec(&Catalog {
            schema_version: version,
            generated_at: "2026-09-23T03:17:00Z".into(),
            source: "https://openrouter.ai/api/v1/models".into(),
            models,
        })
        .unwrap()
    }

    #[test]
    fn accepts_a_well_formed_catalog() {
        let catalog = validate(&catalog_json(MIN_MODELS, 1)).unwrap();
        assert_eq!(catalog.models.len(), MIN_MODELS);
    }

    #[test]
    fn reads_the_published_field_names() {
        let mut models = String::new();
        for i in 0..MIN_MODELS {
            models.push_str(&format!(
                r#"{}"m/{i}": {{"name":"M","contextLength":1,"inputPerMtok":2,"outputPerMtok":12,
                   "cacheReadPerMtok":0.2,"cacheWritePerMtok":2.5,"cacheWrite1hPerMtok":0}}"#,
                if i == 0 { "" } else { "," }
            ));
        }
        let json = format!(
            r#"{{"schemaVersion":1,"generatedAt":"x","source":"y","models":{{{models}}}}}"#
        );
        let catalog = validate(json.as_bytes()).unwrap();
        assert_eq!(catalog.models["m/0"].cache_write_per_mtok, 2.5);
    }

    #[test]
    fn rejects_unknown_schema_versions() {
        assert!(validate(&catalog_json(MIN_MODELS, 2)).is_err());
    }

    #[test]
    fn rejects_a_suspiciously_short_list() {
        assert!(validate(&catalog_json(MIN_MODELS - 1, 1)).is_err());
    }

    #[test]
    fn rejects_negative_or_non_finite_rates() {
        let mut catalog: Catalog = serde_json::from_slice(&catalog_json(MIN_MODELS, 1)).unwrap();
        catalog.models.insert("bad/negative".into(), model(-1.0));
        assert!(validate(&serde_json::to_vec(&catalog).unwrap()).is_err());
        assert!(validate(b"not json").is_err());
    }

    #[test]
    fn schedule_backs_off_then_settles_daily() {
        let now = Utc::now();
        assert_eq!(next_check_after(now, 0, 0.0), now + Duration::hours(24));
        assert_eq!(next_check_after(now, 1, 0.0), now + Duration::hours(1));
        assert_eq!(next_check_after(now, 2, 0.0), now + Duration::hours(4));
        assert_eq!(next_check_after(now, 9, 0.0), now + Duration::hours(24));
    }

    #[test]
    fn jitter_adds_at_most_ten_percent() {
        let now = Utc::now();
        let latest = next_check_after(now, 0, 0.999_999);
        assert!(latest > now + Duration::hours(24));
        assert!(latest <= now + Duration::hours(24) + Duration::minutes(144));
    }

    #[test]
    fn state_defaults_to_enabled_and_due() {
        let dir = tempfile::tempdir().unwrap();
        let state = CatalogState::load(dir.path());
        assert!(state.enabled);
        assert!(state.is_due(Utc::now()));

        // An older state file without the switch still reads as on.
        std::fs::write(dir.path().join(STATE_FILE), br#"{"failures":2}"#).unwrap();
        let state = CatalogState::load(dir.path());
        assert!(state.enabled);
        assert_eq!(state.failures, 2);
    }

    #[test]
    fn state_round_trips() {
        let dir = tempfile::tempdir().unwrap();
        let later = Utc::now() + Duration::hours(3);
        let state = CatalogState { enabled: false, etag: Some("\"abc\"".into()), next_check: Some(later), ..Default::default() };
        state.save(dir.path()).unwrap();
        let loaded = CatalogState::load(dir.path());
        assert!(!loaded.enabled);
        assert_eq!(loaded.etag.as_deref(), Some("\"abc\""));
        assert!(!loaded.is_due(Utc::now()));
    }
}
