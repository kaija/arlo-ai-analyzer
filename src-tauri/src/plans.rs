//! Subscription plan and quota status, kept current in the background.
//!
//! What each tool is signed in with, and how much of its limits is used, is
//! worked out by `usage_core::plan`. This owns *when* that runs, the switch for
//! live checks, and the HTTP client they use.
//!
//! Live checks are the only requests that carry anything of the user's — the
//! tool's own sign-in token, sent to that tool's vendor and nowhere else — so
//! they are off until the user turns them on. With the switch off, statuses
//! come from local files only and no request is made.
//!
//! Persisted in the app data dir: `plan-status-state.json` (the switch).

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use usage_core::plan::{self, HttpClient, HttpResponse, PlanStatus};
use usage_core::Roots;

pub const UPDATED_EVENT: &str = "plan-status-updated";

const STATE_FILE: &str = "plan-status-state.json";
/// Background cadence. Live checks run at most this often on their own;
/// both vendors throttle these endpoints.
const POLL_INTERVAL: Duration = Duration::from_secs(5 * 60);
/// A scheduled pass lands a little short of a full interval after the last
/// live check finished; this keeps it from being skipped for that.
const POLL_SLACK: Duration = Duration::from_secs(30);
/// Log changes arrive in bursts while a tool streams; re-reading more often
/// than this shows nothing new.
const LOCAL_MIN_INTERVAL: Duration = Duration::from_secs(15);
/// "Refresh now" right after a live check reuses its answer.
const MANUAL_LIVE_MIN_INTERVAL: Duration = Duration::from_secs(30);
const MAX_BODY_BYTES: u64 = 1024 * 1024;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct PlanState {
    /// Live checks with the tools' own sign-in. Off by default.
    #[serde(default)]
    online: bool,
}

impl PlanState {
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
}

/// What the UI gets.
#[derive(Debug, Clone, Default, Serialize)]
pub struct PlanReport {
    /// Live checks are on.
    pub online: bool,
    /// When the statuses were last worked out; None until the first pass ends.
    pub checked_at: Option<DateTime<Utc>>,
    /// When the vendors were last asked.
    pub live_checked_at: Option<DateTime<Utc>>,
    /// One per installed tool that has a plan provider.
    pub tools: Vec<PlanStatus>,
}

enum Wake {
    /// A watched log folder changed; Codex may have logged new limits.
    Logs,
    /// The user asked, or changed where logs are read from or the switch.
    Now,
}

struct Inner {
    state: PlanState,
    roots: Roots,
    report: PlanReport,
    last_local: Option<Instant>,
    last_live: Option<Instant>,
}

pub struct PlanService {
    data_dir: PathBuf,
    inner: Mutex<Inner>,
    /// Serialises passes so the worker and "Refresh now" never overlap.
    passing: Mutex<()>,
    wake: Mutex<Sender<Wake>>,
}

impl PlanService {
    /// Load the switch and start the background worker.
    pub fn start(app: &AppHandle, data_dir: PathBuf, roots: Roots) -> Arc<Self> {
        let state = PlanState::load(&data_dir);
        let (tx, rx) = mpsc::channel();
        let service = Arc::new(Self {
            inner: Mutex::new(Inner {
                report: PlanReport { online: state.online, ..Default::default() },
                state,
                roots,
                last_local: None,
                last_live: None,
            }),
            data_dir,
            passing: Mutex::new(()),
            wake: Mutex::new(tx),
        });
        let worker = service.clone();
        let handle = app.clone();
        std::thread::spawn(move || worker.run(&handle, rx));
        service
    }

    pub fn report(&self) -> PlanReport {
        self.inner.lock().map(|i| i.report.clone()).unwrap_or_default()
    }

    /// The log folders moved (a grant changed): the tools' homes did too.
    pub fn set_roots(&self, roots: Roots) {
        if let Ok(mut inner) = self.inner.lock() {
            inner.roots = roots;
        }
        self.send(Wake::Now);
    }

    pub fn set_online(&self, online: bool) -> Result<(), String> {
        {
            let mut inner = self.inner.lock().map_err(|e| e.to_string())?;
            inner.state.online = online;
            inner.state.save(&self.data_dir)?;
        }
        self.send(Wake::Now);
        Ok(())
    }

    pub fn logs_changed(&self) {
        self.send(Wake::Logs);
    }

    /// "Refresh now". Blocks on the network while live checks are on.
    pub fn refresh_now(&self, app: &AppHandle) -> PlanReport {
        self.pass(app, Some(MANUAL_LIVE_MIN_INTERVAL));
        self.report()
    }

    fn send(&self, wake: Wake) {
        if let Ok(tx) = self.wake.lock() {
            let _ = tx.send(wake);
        }
    }

    fn run(&self, app: &AppHandle, rx: Receiver<Wake>) {
        self.pass(app, Some(POLL_INTERVAL - POLL_SLACK));
        let mut next_poll = Instant::now() + POLL_INTERVAL;
        // A local pass owed to log changes, at the end of the throttle window,
        // so the last write of a burst is never the one left unread.
        let mut logs_due: Option<Instant> = None;
        loop {
            let deadline = logs_due.map_or(next_poll, |at| at.min(next_poll));
            match rx.recv_timeout(deadline.saturating_duration_since(Instant::now())) {
                Ok(Wake::Logs) => {
                    let last = self.inner.lock().ok().and_then(|i| i.last_local);
                    let due = last.map_or_else(Instant::now, |t| t + LOCAL_MIN_INTERVAL);
                    logs_due.get_or_insert(due);
                }
                Ok(Wake::Now) => {
                    self.pass(app, Some(MANUAL_LIVE_MIN_INTERVAL));
                    logs_due = None;
                }
                Err(RecvTimeoutError::Timeout) => {
                    let now = Instant::now();
                    if now >= next_poll {
                        self.pass(app, Some(POLL_INTERVAL - POLL_SLACK));
                        next_poll = Instant::now() + POLL_INTERVAL;
                        logs_due = None;
                    } else if logs_due.is_some_and(|at| at <= now) {
                        self.pass(app, None);
                        logs_due = None;
                    }
                }
                Err(RecvTimeoutError::Disconnected) => return,
            }
        }
    }

    /// Work every status out again. `live_min_age`: None reads local files
    /// only; otherwise the vendors are asked too, if the switch is on and the
    /// last live check is at least that old.
    fn pass(&self, app: &AppHandle, live_min_age: Option<Duration>) {
        let Ok(_guard) = self.passing.lock() else {
            return;
        };
        let Ok((online, roots, last_live, previous)) = self
            .inner
            .lock()
            .map(|i| (i.state.online, i.roots.clone(), i.last_live, i.report.tools.clone()))
        else {
            return;
        };
        let go_live = online && live_min_age.is_some_and(|age| last_live.is_none_or(|t| t.elapsed() >= age));

        let now = Utc::now();
        let http = go_live.then(Http::new);
        let mut tools = plan::check_all(&roots, http.as_ref().map(|h| h as &dyn HttpClient), now);
        // With the switch off the app shows only what is on disk, so an
        // earlier live answer is dropped rather than kept.
        if online {
            plan::carry_over(&previous, &mut tools, now);
        }

        let changed = {
            let Ok(mut inner) = self.inner.lock() else {
                return;
            };
            let report = &mut inner.report;
            let changed = report.tools != tools || report.online != online || report.checked_at.is_none();
            report.online = online;
            report.checked_at = Some(now);
            report.tools = tools;
            if go_live {
                report.live_checked_at = Some(now);
                inner.last_live = Some(Instant::now());
            }
            inner.last_local = Some(Instant::now());
            changed
        };
        if changed {
            let _ = app.emit(UPDATED_EVENT, ());
        }
    }
}

/// The client live checks go through: HTTPS only, and every status handed
/// back so the provider can tell a rejected token from a failure.
struct Http(ureq::Agent);

impl Http {
    fn new() -> Self {
        let agent = ureq::Agent::config_builder()
            .timeout_global(Some(Duration::from_secs(20)))
            .https_only(true)
            .http_status_as_error(false)
            .user_agent(concat!("arlo-ai-analyzer/", env!("CARGO_PKG_VERSION")))
            .build()
            .into();
        Self(agent)
    }
}

impl HttpClient for Http {
    fn get(&self, url: &str, headers: &[(&str, &str)]) -> Result<HttpResponse, String> {
        let mut request = self.0.get(url);
        for (name, value) in headers {
            request = request.header(*name, *value);
        }
        let mut response = request.call().map_err(|e| e.to_string())?;
        let status = response.status().as_u16();
        let body = response
            .body_mut()
            .with_config()
            .limit(MAX_BODY_BYTES)
            .read_to_vec()
            .map_err(|e| e.to_string())?;
        Ok(HttpResponse { status, body })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn online_checks_are_off_until_turned_on() {
        let dir = tempfile::tempdir().unwrap();
        assert!(!PlanState::load(dir.path()).online);

        PlanState { online: true }.save(dir.path()).unwrap();
        assert!(PlanState::load(dir.path()).online);

        std::fs::write(dir.path().join(STATE_FILE), b"not json").unwrap();
        assert!(!PlanState::load(dir.path()).online);
    }
}
