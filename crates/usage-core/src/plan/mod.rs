//! Subscription plan and quota for each tool's signed-in account.
//!
//! Separate from `sources`: those read *history* (what was spent), this reads
//! *standing* — which plan the account is on and how much of its current
//! limits is used. Each tool gets a [`PlanProvider`] that works in two tiers:
//!
//! - [`PlanProvider::detect`] — local only. Reads the tool's own credential
//!   store for the sign-in kind and plan, plus any quota the tool itself logged
//!   (Codex writes its rate limits into every rollout). Never touches the
//!   network.
//! - [`PlanProvider::fetch_live`] — asks the vendor for current quota with the
//!   tool's own saved token: the same request the CLI makes for `/usage` or
//!   `/status`. Only called when the user turned online checks on; the app
//!   layer owns that switch and the [`HttpClient`], so this crate stays
//!   offline and testable.
//!
//! Tokens are only ever *read*. Both CLIs rotate their refresh token on use,
//! so renewing an expired access token here would sign the CLI out — an
//! expired one is reported as [`PlanIssue::SignInExpired`] instead.
//!
//! Adding a tool: a module implementing [`PlanProvider`], one line in
//! [`providers`]. The front end renders whatever statuses come back.

pub mod claude_code;
pub mod codex_cli;
mod jwt;
mod keychain;

use crate::model::ToolKind;
use crate::Roots;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// What the UI gets
// ---------------------------------------------------------------------------

/// How a tool is signed in.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuthKind {
    /// A consumer or team subscription (claude.ai, ChatGPT) — the kind with
    /// plan limits.
    Subscription,
    /// A pay-as-you-go API key: billed per token, no plan limits.
    ApiKey,
    /// No sign-in found where the tool keeps it.
    SignedOut,
}

/// One tool's account, as far as this machine (and, if allowed, the vendor)
/// can tell.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PlanStatus {
    pub tool: ToolKind,
    pub auth: AuthKind,
    /// Plan name as the vendor shows it ("Max 20x", "Plus"). None when the
    /// sign-in doesn't say.
    pub plan: Option<String>,
    /// The signed-in account's email, when the tool records it.
    pub account: Option<String>,
    pub organization: Option<String>,
    /// Where the sign-in was read from.
    pub credential_source: Option<CredentialSource>,
    /// Usage against the plan's limits: the fresher of what the tool logged
    /// and what the vendor reported.
    pub quota: Option<QuotaSnapshot>,
    /// Why part of the above is missing or may be stale. None when every step
    /// that was attempted worked.
    pub issue: Option<PlanIssue>,
}

impl PlanStatus {
    fn new(tool: ToolKind, auth: AuthKind) -> Self {
        Self {
            tool,
            auth,
            plan: None,
            account: None,
            organization: None,
            credential_source: None,
            quota: None,
            issue: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum CredentialSource {
    /// A file the tool wrote, shown with `~` for the home directory.
    File { path: String },
    /// The macOS login keychain.
    Keychain,
    /// No readable sign-in, but the tool's own logs say which plan it ran on
    /// (Codex set to keep its sign-in in the OS keyring, say).
    Logs,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum QuotaOrigin {
    /// Written by the tool itself during a session (no network involved).
    Logs,
    /// Asked of the vendor just now.
    Live,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct QuotaSnapshot {
    pub origin: QuotaOrigin,
    /// When these numbers were true: the fetch time, or the log record's.
    pub observed_at: DateTime<Utc>,
    pub windows: Vec<QuotaWindow>,
}

/// One rate-limit window ("5-hour", "weekly", "weekly · Opus").
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct QuotaWindow {
    /// The vendor's name for the window ("five_hour", "primary", …). Stable,
    /// but only meaningful per tool.
    pub id: String,
    /// Window length. The UI names windows by it (300 → 5-hour, 10080 →
    /// weekly); None for ones that aren't time-boxed, like monthly extra usage.
    pub window_minutes: Option<u32>,
    /// What the window is limited to — a model family ("Opus") or a feature.
    /// None for the plan's overall limit.
    pub scope: Option<String>,
    /// 0–100.
    pub used_percent: f64,
    /// None when unknown, or when the window has reset since it was observed
    /// (the next one starts with the next request).
    pub resets_at: Option<DateTime<Utc>>,
}

/// Why detection or the live check came up short. The UI words each kind.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "detail", rename_all = "snake_case")]
pub enum PlanIssue {
    /// The tool keeps a sign-in here, but it couldn't be read (the sandboxed
    /// build without access to the folder, a keychain refusal).
    CredentialsUnreadable,
    /// The saved access token has expired. The tool renews it the next time
    /// it runs.
    SignInExpired,
    /// Signed in, but with a token that can't query plan usage (e.g. Claude
    /// Code's long-lived `setup-token`, which lacks the profile scope).
    NoUsageAccess,
    /// The vendor rejected the token.
    Unauthorized,
    /// The vendor asked us to slow down.
    RateLimited,
    /// Network failure or an answer we couldn't read.
    Failed(String),
}

// ---------------------------------------------------------------------------
// Provider contract
// ---------------------------------------------------------------------------

/// What `detect` found: the status to show, and the token for a live check.
pub struct Detection {
    pub status: PlanStatus,
    /// Present when the sign-in is a subscription whose token can query usage.
    pub live: Option<LiveToken>,
}

/// A saved access token, held only for the one request that needs it.
pub struct LiveToken {
    pub access_token: String,
    /// Workspace the request is for (Codex's `ChatGPT-Account-Id`).
    pub account_id: Option<String>,
    pub expires_at: Option<DateTime<Utc>>,
}

/// Redacted, so a token can never end up in a log line by way of `{:?}`.
impl std::fmt::Debug for LiveToken {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("LiveToken")
            .field("access_token", &"<redacted>")
            .field("account_id", &self.account_id)
            .field("expires_at", &self.expires_at)
            .finish()
    }
}

/// What a live check returns.
pub struct LiveReport {
    pub quota: QuotaSnapshot,
    /// The plan as the vendor reports it right now, when the answer says.
    pub plan: Option<String>,
}

pub trait PlanProvider {
    fn tool(&self) -> ToolKind;
    /// Everything this machine alone can tell. None when the tool isn't
    /// installed here, so it isn't listed at all.
    fn detect(&self, now: DateTime<Utc>) -> Option<Detection>;
    /// Current quota from the vendor, using the token `detect` found.
    fn fetch_live(&self, token: &LiveToken, http: &dyn HttpClient, now: DateTime<Utc>) -> Result<LiveReport, PlanIssue>;
}

// ---------------------------------------------------------------------------
// HTTP, injected by the app
// ---------------------------------------------------------------------------

pub struct HttpResponse {
    pub status: u16,
    pub body: Vec<u8>,
}

pub trait HttpClient {
    /// GET `url`. Any HTTP status is an `Ok`; `Err` is for transport failures.
    fn get(&self, url: &str, headers: &[(&str, &str)]) -> Result<HttpResponse, String>;
}

/// The body of a successful answer, or the issue a failed one amounts to.
fn ok_body(response: Result<HttpResponse, String>) -> Result<Vec<u8>, PlanIssue> {
    let response = response.map_err(PlanIssue::Failed)?;
    match response.status {
        200..=299 => Ok(response.body),
        401 | 403 => Err(PlanIssue::Unauthorized),
        429 => Err(PlanIssue::RateLimited),
        status => Err(PlanIssue::Failed(format!("HTTP {status}"))),
    }
}

// ---------------------------------------------------------------------------
// Running providers
// ---------------------------------------------------------------------------

/// A provider for every tool that has one, pointed at the tool's home — the
/// folder above the log root the app already resolved (`~/.claude/projects`
/// → `~/.claude`), so a granted folder in the sandboxed build covers both.
pub fn providers(roots: &Roots) -> Vec<Box<dyn PlanProvider>> {
    let mut list: Vec<Box<dyn PlanProvider>> = Vec::new();
    if let Some(config_dir) = roots.claude_code.as_deref().and_then(|p| p.parent()) {
        list.push(Box::new(claude_code::ClaudeCodePlan::new(config_dir.to_path_buf())));
    }
    if let Some(sessions) = &roots.codex_cli {
        if let Some(home) = sessions.parent() {
            list.push(Box::new(codex_cli::CodexCliPlan::new(home.to_path_buf(), sessions.clone())));
        }
    }
    list
}

/// Detect one tool and, when `http` is given (online checks on), ask the
/// vendor for live quota. None when the tool isn't installed.
pub fn check(provider: &dyn PlanProvider, http: Option<&dyn HttpClient>, now: DateTime<Utc>) -> Option<PlanStatus> {
    let Detection { mut status, live } = provider.detect(now)?;
    if let (Some(http), Some(token)) = (http, live) {
        if token.expires_at.is_some_and(|at| at <= now) {
            status.issue = Some(PlanIssue::SignInExpired);
        } else {
            match provider.fetch_live(&token, http, now) {
                Ok(report) => {
                    status.quota = freshest(status.quota.take(), Some(report.quota));
                    if report.plan.is_some() {
                        status.plan = report.plan;
                    }
                }
                Err(issue) => status.issue = Some(issue),
            }
        }
    }
    status.quota = status.quota.map(|q| q.settled(now));
    Some(status)
}

pub fn check_all(roots: &Roots, http: Option<&dyn HttpClient>, now: DateTime<Utc>) -> Vec<PlanStatus> {
    providers(roots).iter().filter_map(|p| check(p.as_ref(), http, now)).collect()
}

/// Keep a quota from the previous check where it is fresher than this one's —
/// live answers are fetched less often than the logs are read, and the pass
/// in between must not blank them out. Only for the same signed-in account.
pub fn carry_over(previous: &[PlanStatus], next: &mut [PlanStatus], now: DateTime<Utc>) {
    for status in next.iter_mut() {
        let Some(prev) = previous.iter().find(|p| p.tool == status.tool) else {
            continue;
        };
        if prev.auth != AuthKind::Subscription || status.auth != AuthKind::Subscription || prev.account != status.account {
            continue;
        }
        status.quota = freshest(status.quota.take(), prev.quota.clone()).map(|q| q.settled(now));
    }
}

fn freshest(a: Option<QuotaSnapshot>, b: Option<QuotaSnapshot>) -> Option<QuotaSnapshot> {
    match (a, b) {
        (Some(a), Some(b)) => Some(if b.observed_at > a.observed_at { b } else { a }),
        (a, b) => a.or(b),
    }
}

impl QuotaSnapshot {
    /// A window whose reset time has passed since it was observed is empty
    /// now: nothing has been used in the next one yet, or a newer record
    /// would say so.
    fn settled(mut self, now: DateTime<Utc>) -> Self {
        for window in &mut self.windows {
            if window.resets_at.is_some_and(|at| at <= now) {
                window.used_percent = 0.0;
                window.resets_at = None;
            }
        }
        self
    }
}

/// `max` → `Max`, `self_serve_business` → `Self Serve Business`: a readable
/// fallback for plan ids a provider has no name for yet.
fn title_case(raw: &str) -> String {
    raw.split(['_', '-', ' '])
        .filter(|w| !w.is_empty())
        .map(|w| {
            let mut chars = w.chars();
            chars.next().map(|c| c.to_uppercase().chain(chars).collect::<String>()).unwrap_or_default()
        })
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Duration;
    use std::cell::RefCell;

    fn at(s: &str) -> DateTime<Utc> {
        s.parse().unwrap()
    }

    fn snapshot(origin: QuotaOrigin, observed_at: DateTime<Utc>, used: f64) -> QuotaSnapshot {
        QuotaSnapshot {
            origin,
            observed_at,
            windows: vec![QuotaWindow {
                id: "primary".into(),
                window_minutes: Some(300),
                scope: None,
                used_percent: used,
                resets_at: Some(observed_at + Duration::hours(3)),
            }],
        }
    }

    /// A provider with canned answers that records whether the network was used.
    struct Fake {
        logged: Option<QuotaSnapshot>,
        live: Result<LiveReport, PlanIssue>,
        expires_at: Option<DateTime<Utc>>,
        fetched: RefCell<bool>,
    }

    impl Fake {
        fn new(logged: Option<QuotaSnapshot>, live: Result<LiveReport, PlanIssue>) -> Self {
            Self { logged, live, expires_at: None, fetched: RefCell::new(false) }
        }
    }

    impl PlanProvider for Fake {
        fn tool(&self) -> ToolKind {
            ToolKind::CodexCli
        }

        fn detect(&self, _now: DateTime<Utc>) -> Option<Detection> {
            let mut status = PlanStatus::new(ToolKind::CodexCli, AuthKind::Subscription);
            status.plan = Some("Plus".into());
            status.quota = self.logged.clone();
            let live = LiveToken { access_token: "secret".into(), account_id: None, expires_at: self.expires_at };
            Some(Detection { status, live: Some(live) })
        }

        fn fetch_live(&self, _: &LiveToken, _: &dyn HttpClient, _: DateTime<Utc>) -> Result<LiveReport, PlanIssue> {
            *self.fetched.borrow_mut() = true;
            match &self.live {
                Ok(r) => Ok(LiveReport { quota: r.quota.clone(), plan: r.plan.clone() }),
                Err(e) => Err(e.clone()),
            }
        }
    }

    struct NoNetwork;
    impl HttpClient for NoNetwork {
        fn get(&self, _: &str, _: &[(&str, &str)]) -> Result<HttpResponse, String> {
            Err("offline".into())
        }
    }

    #[test]
    fn stays_offline_without_a_client() {
        let now = at("2026-09-25T12:00:00Z");
        let fake = Fake::new(None, Err(PlanIssue::RateLimited));
        let status = check(&fake, None, now).unwrap();
        assert!(!*fake.fetched.borrow());
        assert_eq!(status.issue, None);
    }

    #[test]
    fn the_fresher_snapshot_wins() {
        let now = at("2026-09-25T12:00:00Z");
        let logged = snapshot(QuotaOrigin::Logs, now - Duration::minutes(5), 40.0);
        let live = snapshot(QuotaOrigin::Live, now, 55.0);
        let fake = Fake::new(Some(logged.clone()), Ok(LiveReport { quota: live, plan: Some("Pro".into()) }));
        let status = check(&fake, Some(&NoNetwork), now).unwrap();
        let quota = status.quota.unwrap();
        assert_eq!(quota.origin, QuotaOrigin::Live);
        assert_eq!(quota.windows[0].used_percent, 55.0);
        assert_eq!(status.plan.as_deref(), Some("Pro"));

        // A log record written after the live answer is newer still.
        let newer_log = snapshot(QuotaOrigin::Logs, now + Duration::minutes(1), 60.0);
        let stale_live = snapshot(QuotaOrigin::Live, now, 55.0);
        let fake = Fake::new(Some(newer_log), Ok(LiveReport { quota: stale_live, plan: None }));
        let status = check(&fake, Some(&NoNetwork), now).unwrap();
        assert_eq!(status.quota.unwrap().origin, QuotaOrigin::Logs);
        assert_eq!(status.plan.as_deref(), Some("Plus"));
    }

    #[test]
    fn a_failed_live_check_keeps_the_logged_quota() {
        let now = at("2026-09-25T12:00:00Z");
        let logged = snapshot(QuotaOrigin::Logs, now, 40.0);
        let fake = Fake::new(Some(logged), Err(PlanIssue::Unauthorized));
        let status = check(&fake, Some(&NoNetwork), now).unwrap();
        assert_eq!(status.issue, Some(PlanIssue::Unauthorized));
        assert_eq!(status.quota.unwrap().origin, QuotaOrigin::Logs);
    }

    #[test]
    fn an_expired_token_is_reported_not_sent() {
        let now = at("2026-09-25T12:00:00Z");
        let mut fake = Fake::new(None, Err(PlanIssue::Unauthorized));
        fake.expires_at = Some(now - Duration::seconds(1));
        let status = check(&fake, Some(&NoNetwork), now).unwrap();
        assert!(!*fake.fetched.borrow());
        assert_eq!(status.issue, Some(PlanIssue::SignInExpired));
    }

    #[test]
    fn a_window_past_its_reset_reads_as_empty() {
        let now = at("2026-09-25T12:00:00Z");
        let old = snapshot(QuotaOrigin::Logs, now - Duration::hours(4), 80.0);
        let fake = Fake::new(Some(old), Err(PlanIssue::RateLimited));
        let window = &check(&fake, None, now).unwrap().quota.unwrap().windows[0];
        assert_eq!(window.used_percent, 0.0);
        assert_eq!(window.resets_at, None);
    }

    #[test]
    fn carry_over_keeps_a_newer_live_quota_for_the_same_account_only() {
        let now = at("2026-09-25T12:00:00Z");
        let mut prev = PlanStatus::new(ToolKind::ClaudeCode, AuthKind::Subscription);
        prev.account = Some("dev@example.com".into());
        prev.quota = Some(snapshot(QuotaOrigin::Live, now - Duration::minutes(2), 30.0));

        let mut next = vec![PlanStatus { quota: None, ..prev.clone() }];
        carry_over(std::slice::from_ref(&prev), &mut next, now);
        assert_eq!(next[0].quota.as_ref().unwrap().origin, QuotaOrigin::Live);

        let mut switched = vec![PlanStatus { quota: None, account: Some("other@example.com".into()), ..prev.clone() }];
        carry_over(&[prev], &mut switched, now);
        assert!(switched[0].quota.is_none());
    }

    #[test]
    fn http_statuses_map_to_issues() {
        let resp = |status| Ok(HttpResponse { status, body: b"{}".to_vec() });
        assert!(ok_body(resp(200)).is_ok());
        assert_eq!(ok_body(resp(401)), Err(PlanIssue::Unauthorized));
        assert_eq!(ok_body(resp(429)), Err(PlanIssue::RateLimited));
        assert_eq!(ok_body(resp(500)), Err(PlanIssue::Failed("HTTP 500".into())));
        assert_eq!(ok_body(Err("dns".into())), Err(PlanIssue::Failed("dns".into())));
    }

    #[test]
    fn token_debug_output_is_redacted() {
        let token = LiveToken { access_token: "sk-secret".into(), account_id: None, expires_at: None };
        assert!(!format!("{token:?}").contains("sk-secret"));
    }

    #[test]
    fn title_case_reads_plan_ids() {
        assert_eq!(title_case("self_serve_business"), "Self Serve Business");
        assert_eq!(title_case("max"), "Max");
    }
}
