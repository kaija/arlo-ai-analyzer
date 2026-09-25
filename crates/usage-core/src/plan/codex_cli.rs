//! Codex CLI: the plan from its saved sign-in, limits from its own logs or
//! ChatGPT's usage endpoint.
//!
//! The sign-in is `<CODEX_HOME>/auth.json`:
//! `{ auth_mode?, OPENAI_API_KEY, tokens { id_token, access_token, account_id } }`.
//! Both tokens are JWTs — the id token's `https://api.openai.com/auth` claims
//! carry `chatgpt_plan_type`, the access token's `exp` its expiry.
//!
//! Codex also logs its limits: each `token_count` event in a rollout carries
//! `rate_limits { primary, secondary, plan_type }` as the server reported them
//! with that response. The newest rollout therefore gives recent limits with
//! no network at all; the live check (`GET /backend-api/wham/usage`, what
//! `/status` asks) only makes them current.

use super::{
    jwt, ok_body, title_case, AuthKind, CredentialSource, Detection, HttpClient, LiveReport, LiveToken, PlanIssue,
    PlanProvider, PlanStatus, QuotaOrigin, QuotaSnapshot, QuotaWindow,
};
use crate::model::ToolKind;
use crate::paths::display_path;
use crate::sources::codex_cli::collect_jsonl;
use chrono::{DateTime, Duration, Utc};
use serde_json::Value;
use std::fs;
use std::io::{ErrorKind, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

const AUTH_FILE: &str = "auth.json";
const CONFIG_FILE: &str = "config.toml";
const USAGE_URL: &str = "https://chatgpt.com/backend-api/wham/usage";
const AUTH_CLAIMS: &str = "https://api.openai.com/auth";
/// A snapshot without a `limit_id` is this one: the plan's own limit.
const MAIN_LIMIT: &str = "codex";
/// Rollouts searched, most recently written first, for recorded limits.
const RECENT_ROLLOUTS: usize = 8;
/// Read from the end of a rollout first. A `token_count` is written every
/// turn, so the last one is nearly always in here, and a long session's
/// rollout runs to many megabytes of tool output.
const TAIL_BYTES: u64 = 512 * 1024;

pub struct CodexCliPlan {
    /// `~/.codex` (`CODEX_HOME`).
    home: PathBuf,
    /// Its `sessions` folder of rollouts.
    sessions: PathBuf,
}

impl CodexCliPlan {
    pub fn new(home: PathBuf, sessions: PathBuf) -> Self {
        Self { home, sessions }
    }

    /// Set to keep the sign-in in the OS keyring instead of `auth.json`, so a
    /// missing file doesn't mean signed out.
    fn uses_keyring(&self) -> bool {
        fs::read_to_string(self.home.join(CONFIG_FILE)).is_ok_and(|config| {
            config.lines().any(|line| {
                let line = line.trim_start();
                line.starts_with("cli_auth_credentials_store") && (line.contains("keyring") || line.contains("auto"))
            })
        })
    }
}

impl PlanProvider for CodexCliPlan {
    fn tool(&self) -> ToolKind {
        ToolKind::CodexCli
    }

    fn detect(&self, _now: DateTime<Utc>) -> Option<Detection> {
        if !self.home.exists() {
            return None;
        }
        let mut status = PlanStatus::new(ToolKind::CodexCli, AuthKind::SignedOut);
        let mut live = None;

        let file = self.home.join(AUTH_FILE);
        let sign_in_elsewhere = match fs::read(&file) {
            Ok(bytes) => match serde_json::from_slice::<Value>(&bytes) {
                Ok(auth) => {
                    let source = CredentialSource::File { path: display_path(&file) };
                    live = read_auth(&auth, source, &mut status);
                    false
                }
                Err(_) => {
                    status.issue = Some(PlanIssue::CredentialsUnreadable);
                    true
                }
            },
            Err(e) if e.kind() == ErrorKind::NotFound => self.uses_keyring(),
            // The sandboxed build granted only `sessions/` can see the file but not read it.
            Err(_) => {
                status.issue = Some(PlanIssue::CredentialsUnreadable);
                true
            }
        };

        if let Some(logged) = latest_logged_limits(&self.sessions) {
            // No readable sign-in, but the logs show which plan Codex ran on.
            if sign_in_elsewhere && status.auth == AuthKind::SignedOut && logged.plan.is_some() {
                status.auth = AuthKind::Subscription;
                status.credential_source = Some(CredentialSource::Logs);
            }
            if status.auth == AuthKind::Subscription {
                status.plan = status.plan.or(logged.plan);
                status.quota = Some(logged.quota);
            }
        }
        Some(Detection { status, live })
    }

    fn fetch_live(&self, token: &LiveToken, http: &dyn HttpClient, now: DateTime<Utc>) -> Result<LiveReport, PlanIssue> {
        let bearer = format!("Bearer {}", token.access_token);
        let mut headers = vec![("Authorization", bearer.as_str())];
        if let Some(account) = &token.account_id {
            headers.push(("ChatGPT-Account-Id", account.as_str()));
        }
        let body = ok_body(http.get(USAGE_URL, &headers))?;
        parse_usage(&body, now)
    }
}

/// Fill `status` from a parsed `auth.json`; the token for a live check when
/// it's a ChatGPT sign-in.
fn read_auth(auth: &Value, source: CredentialSource, status: &mut PlanStatus) -> Option<LiveToken> {
    let tokens = &auth["tokens"];
    let access = tokens["access_token"].as_str().filter(|t| !t.is_empty());
    match access {
        Some(access) if auth["auth_mode"].as_str() != Some("apikey") => {
            let id = tokens["id_token"].as_str().and_then(jwt::claims).unwrap_or(Value::Null);
            let claims = &id[AUTH_CLAIMS];
            status.auth = AuthKind::Subscription;
            status.credential_source = Some(source);
            status.account = str_at(&id, "email");
            status.plan = claims["chatgpt_plan_type"].as_str().map(plan_name);
            Some(LiveToken {
                access_token: access.to_string(),
                account_id: str_at(tokens, "account_id").or_else(|| str_at(claims, "chatgpt_account_id")),
                expires_at: jwt::claims(access)
                    .and_then(|c| c["exp"].as_i64())
                    .and_then(|exp| DateTime::from_timestamp(exp, 0)),
            })
        }
        _ => {
            if auth["OPENAI_API_KEY"].as_str().is_some_and(|key| !key.is_empty()) {
                status.auth = AuthKind::ApiKey;
                status.credential_source = Some(source);
            }
            None
        }
    }
}

/// Codex's own names for its plan ids (`PlanType::display_name`), so the app
/// says what `/status` says.
fn plan_name(raw: &str) -> String {
    match raw {
        "pro" => "Pro (More)".into(),
        "prolite" => "Pro".into(),
        "promax" => "Pro (Max)".into(),
        "ent26" => "Enterprise".into(),
        "enterprise_cbp_automation" => "Enterprise (Automation)".into(),
        "enterprise_cbp_usage_based" => "Enterprise CBP Usage Based".into(),
        "self_serve_business_prolite" => "Self Serve Business ProLite".into(),
        other => title_case(other),
    }
}

fn str_at(value: &Value, key: &str) -> Option<String> {
    value[key].as_str().filter(|s| !s.is_empty()).map(str::to_string)
}

// ---------------------------------------------------------------------------
// Limits Codex logged
// ---------------------------------------------------------------------------

struct LoggedLimits {
    quota: QuotaSnapshot,
    plan: Option<String>,
}

fn latest_logged_limits(sessions: &Path) -> Option<LoggedLimits> {
    let mut files = Vec::new();
    collect_jsonl(sessions, &mut files);
    // By write time, not the dated path: resuming a thread appends to the
    // rollout it started in.
    let mut files: Vec<_> = files
        .into_iter()
        .filter_map(|path| Some((fs::metadata(&path).ok()?.modified().ok()?, path)))
        .collect();
    files.sort_by(|a, b| b.0.cmp(&a.0));
    files.into_iter().take(RECENT_ROLLOUTS).find_map(|(_, path)| last_limits_in(&path))
}

/// The newest main-limit snapshot in one rollout, plus the newest of each
/// extra (per-model) limit written after it.
fn last_limits_in(path: &Path) -> Option<LoggedLimits> {
    let mut file = fs::File::open(path).ok()?;
    let len = file.metadata().ok()?.len();
    if len > TAIL_BYTES {
        let mut tail = Vec::new();
        file.seek(SeekFrom::Start(len - TAIL_BYTES)).ok()?;
        file.read_to_end(&mut tail).ok()?;
        let tail = String::from_utf8_lossy(&tail);
        // The first line is cut off.
        let whole_lines = tail.split_once('\n').map_or("", |(_, rest)| rest);
        if let Some(found) = limits_in(whole_lines) {
            return Some(found);
        }
    }
    limits_in(&fs::read_to_string(path).ok()?)
}

fn limits_in(text: &str) -> Option<LoggedLimits> {
    let mut extra: Vec<(String, QuotaWindow)> = Vec::new();
    for line in text.lines().rev().filter(|l| l.contains("\"rate_limits\"")) {
        let Ok(record) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        let payload = &record["payload"];
        let limits = &payload["rate_limits"];
        let Some(observed_at) = record["timestamp"].as_str().and_then(|t| t.parse::<DateTime<Utc>>().ok()) else {
            continue;
        };
        if payload["type"].as_str() != Some("token_count") || !limits.is_object() {
            continue;
        }

        let limit_id = limits["limit_id"].as_str().unwrap_or(MAIN_LIMIT);
        if limit_id != MAIN_LIMIT {
            if !extra.iter().any(|(id, _)| id == limit_id) {
                let scope = limits["limit_name"].as_str().unwrap_or(limit_id);
                if let Some(window) = logged_window(&format!("{limit_id}_primary"), &limits["primary"], observed_at) {
                    extra.push((limit_id.to_string(), QuotaWindow { scope: Some(scope.to_string()), ..window }));
                }
            }
            continue;
        }

        let mut windows: Vec<QuotaWindow> = [("primary", &limits["primary"]), ("secondary", &limits["secondary"])]
            .into_iter()
            .filter_map(|(id, w)| logged_window(id, w, observed_at))
            .collect();
        if windows.is_empty() {
            continue;
        }
        windows.extend(extra.into_iter().map(|(_, w)| w));
        return Some(LoggedLimits {
            quota: QuotaSnapshot { origin: QuotaOrigin::Logs, observed_at, windows },
            plan: limits["plan_type"].as_str().map(plan_name),
        });
    }
    None
}

/// One logged window. Older Codex wrote `resets_in_seconds`, relative to the
/// record; newer writes `resets_at` in epoch seconds.
fn logged_window(id: &str, window: &Value, observed_at: DateTime<Utc>) -> Option<QuotaWindow> {
    let used_percent = window["used_percent"].as_f64()?;
    let resets_at = window["resets_at"]
        .as_i64()
        .and_then(|at| DateTime::from_timestamp(at, 0))
        .or_else(|| window["resets_in_seconds"].as_i64().map(|s| observed_at + Duration::seconds(s)));
    Some(QuotaWindow {
        id: id.to_string(),
        window_minutes: window["window_minutes"].as_u64().and_then(|m| u32::try_from(m).ok()),
        scope: None,
        used_percent,
        resets_at,
    })
}

// ---------------------------------------------------------------------------
// Live answer
// ---------------------------------------------------------------------------

/// Read a `/wham/usage` answer: `{ plan_type, rate_limit { primary_window,
/// secondary_window }, additional_rate_limits[] }`, windows as
/// `{ used_percent, limit_window_seconds, reset_at }`.
fn parse_usage(body: &[u8], now: DateTime<Utc>) -> Result<LiveReport, PlanIssue> {
    let usage: Value =
        serde_json::from_slice(body).map_err(|e| PlanIssue::Failed(format!("unreadable usage answer: {e}")))?;
    if !usage.is_object() {
        return Err(PlanIssue::Failed("unreadable usage answer".into()));
    }

    let mut windows: Vec<QuotaWindow> = [("primary", "primary_window"), ("secondary", "secondary_window")]
        .into_iter()
        .filter_map(|(id, key)| live_window(id, &usage["rate_limit"][key], None))
        .collect();
    for extra in usage["additional_rate_limits"].as_array().into_iter().flatten() {
        let name = extra["limit_name"].as_str().unwrap_or("other");
        let id = format!("{}_primary", name.to_lowercase().replace(' ', "_"));
        windows.extend(live_window(&id, &extra["rate_limit"]["primary_window"], Some(name)));
    }

    Ok(LiveReport {
        quota: QuotaSnapshot { origin: QuotaOrigin::Live, observed_at: now, windows },
        plan: usage["plan_type"].as_str().map(plan_name),
    })
}

fn live_window(id: &str, window: &Value, scope: Option<&str>) -> Option<QuotaWindow> {
    Some(QuotaWindow {
        id: id.to_string(),
        window_minutes: window["limit_window_seconds"].as_u64().and_then(|s| u32::try_from(s / 60).ok()),
        scope: scope.map(str::to_string),
        used_percent: window["used_percent"].as_f64()?,
        resets_at: window["reset_at"].as_i64().and_then(|at| DateTime::from_timestamp(at, 0)),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::plan::HttpResponse;
    use serde_json::json;
    use std::cell::RefCell;

    fn now() -> DateTime<Utc> {
        "2026-09-25T12:00:00Z".parse().unwrap()
    }

    fn chatgpt_auth(plan: &str) -> String {
        let id = jwt::encode(&json!({
            "email": "dev@example.com",
            AUTH_CLAIMS: {"chatgpt_plan_type": plan, "chatgpt_account_id": "acct-from-claims"}
        }));
        let access = jwt::encode(&json!({"exp": 1_790_000_000}));
        json!({
            "OPENAI_API_KEY": null,
            "tokens": {"id_token": id, "access_token": access, "refresh_token": "r", "account_id": "acct-1"},
            "last_refresh": "2026-09-20T00:00:00Z"
        })
        .to_string()
    }

    fn token_count(ts: &str, limits: Value) -> String {
        json!({"timestamp": ts, "type": "event_msg",
               "payload": {"type": "token_count", "info": null, "rate_limits": limits}})
        .to_string()
    }

    /// `~/.codex` with an optional `auth.json` and one rollout per entry.
    fn codex_home(auth: Option<&str>, rollouts: &[Vec<String>]) -> (tempfile::TempDir, CodexCliPlan) {
        let home = tempfile::tempdir().unwrap();
        let codex = home.path().join(".codex");
        let day = codex.join("sessions/2026/09/25");
        fs::create_dir_all(&day).unwrap();
        if let Some(auth) = auth {
            fs::write(codex.join(AUTH_FILE), auth).unwrap();
        }
        for (i, lines) in rollouts.iter().enumerate() {
            fs::write(day.join(format!("rollout-{i}.jsonl")), lines.join("\n")).unwrap();
            // Distinct write times, in order.
            std::thread::sleep(std::time::Duration::from_millis(15));
        }
        let plan = CodexCliPlan::new(codex.clone(), codex.join("sessions"));
        (home, plan)
    }

    #[test]
    fn reads_plan_account_and_token_from_auth_json() {
        let (_home, plan) = codex_home(Some(&chatgpt_auth("plus")), &[]);
        let found = plan.detect(now()).unwrap();
        assert_eq!(found.status.auth, AuthKind::Subscription);
        assert_eq!(found.status.plan.as_deref(), Some("Plus"));
        assert_eq!(found.status.account.as_deref(), Some("dev@example.com"));
        assert!(found.status.quota.is_none());

        let live = found.live.unwrap();
        assert_eq!(live.account_id.as_deref(), Some("acct-1"));
        assert_eq!(live.expires_at, DateTime::from_timestamp(1_790_000_000, 0));
    }

    #[test]
    fn quota_comes_from_the_most_recently_written_rollout() {
        let window = |used: f64| json!({"used_percent": used, "window_minutes": 300, "resets_at": 1_790_000_000});
        let older = vec![token_count("2026-09-25T09:00:00Z", json!({"primary": window(10.0), "secondary": null}))];
        let newer = vec![
            token_count("2026-09-25T10:00:00Z", json!({"primary": window(20.0), "secondary": null})),
            token_count(
                "2026-09-25T11:00:00Z",
                json!({"limit_id": "codex", "plan_type": "pro",
                       "primary": window(35.0),
                       "secondary": {"used_percent": 60.0, "window_minutes": 10080, "resets_at": 1_790_300_000}}),
            ),
            r#"{"timestamp":"2026-09-25T11:00:01Z","type":"event_msg","payload":{"type":"token_count","info":null,"rate_limits":null}}"#.into(),
        ];
        let (_home, plan) = codex_home(Some(&chatgpt_auth("plus")), &[older, newer]);
        let status = plan.detect(now()).unwrap().status;

        let quota = status.quota.unwrap();
        assert_eq!(quota.origin, QuotaOrigin::Logs);
        assert_eq!(quota.observed_at, "2026-09-25T11:00:00Z".parse::<DateTime<Utc>>().unwrap());
        assert_eq!(quota.windows.len(), 2);
        assert_eq!(quota.windows[0].used_percent, 35.0);
        assert_eq!(quota.windows[1].window_minutes, Some(10_080));
        // The sign-in's plan wins over the logged one.
        assert_eq!(status.plan.as_deref(), Some("Plus"));
    }

    #[test]
    fn a_long_rollout_is_read_from_its_end() {
        let window = |used: f64| json!({"used_percent": used, "window_minutes": 300});
        let filler = format!(r#"{{"type":"response_item","payload":{{"output":"{}"}}}}"#, "x".repeat(1024));
        let mut lines = vec![token_count("2026-09-25T09:00:00Z", json!({"primary": window(10.0)}))];
        lines.extend(std::iter::repeat_n(filler, (TAIL_BYTES / 1024 + 8) as usize));
        let (_home, plan) = codex_home(Some(&chatgpt_auth("plus")), &[lines.clone()]);
        // Only before the tail: still found, by the whole-file fallback.
        assert_eq!(plan.detect(now()).unwrap().status.quota.unwrap().windows[0].used_percent, 10.0);

        lines.push(token_count("2026-09-25T11:00:00Z", json!({"primary": window(30.0)})));
        let (_home, plan) = codex_home(Some(&chatgpt_auth("plus")), &[lines]);
        assert_eq!(plan.detect(now()).unwrap().status.quota.unwrap().windows[0].used_percent, 30.0);
    }

    #[test]
    fn older_relative_reset_times_and_extra_limits() {
        let lines = vec![
            token_count("2026-09-25T10:00:00Z",
                json!({"primary": {"used_percent": 5.0, "window_minutes": 300, "resets_in_seconds": 600}})),
            token_count("2026-09-25T10:05:00Z",
                json!({"limit_id": "codex_other", "limit_name": "GPT-6 Luna",
                       "primary": {"used_percent": 70.0, "window_minutes": 10080, "resets_at": 1_790_000_000}})),
        ];
        let (_home, plan) = codex_home(Some(&chatgpt_auth("plus")), &[lines]);
        let windows = plan.detect(now()).unwrap().status.quota.unwrap().windows;
        assert_eq!(windows[0].resets_at, Some("2026-09-25T10:10:00Z".parse().unwrap()));
        assert_eq!(windows[1].id, "codex_other_primary");
        assert_eq!(windows[1].scope.as_deref(), Some("GPT-6 Luna"));
    }

    #[test]
    fn api_key_sign_in_has_no_plan_or_quota() {
        let auth = r#"{"auth_mode":"apikey","OPENAI_API_KEY":"sk-proj-x","tokens":null}"#;
        let limits = vec![token_count("2026-09-25T10:00:00Z", json!({"primary": {"used_percent": 1.0}}))];
        let (_home, plan) = codex_home(Some(auth), &[limits]);
        let found = plan.detect(now()).unwrap();
        assert_eq!(found.status.auth, AuthKind::ApiKey);
        assert!(found.status.quota.is_none());
        assert!(found.live.is_none());
    }

    #[test]
    fn keyring_sign_in_is_recognised_from_the_logs() {
        let limits = vec![token_count(
            "2026-09-25T10:00:00Z",
            json!({"plan_type": "prolite", "primary": {"used_percent": 1.0, "window_minutes": 300}}),
        )];
        let (_home, plan) = codex_home(None, std::slice::from_ref(&limits));
        // Without the keyring setting, no auth.json means signed out.
        assert_eq!(plan.detect(now()).unwrap().status.auth, AuthKind::SignedOut);

        fs::write(plan.home.join(CONFIG_FILE), "cli_auth_credentials_store = \"keyring\"\n").unwrap();
        let status = plan.detect(now()).unwrap().status;
        assert_eq!(status.auth, AuthKind::Subscription);
        assert_eq!(status.plan.as_deref(), Some("Pro"));
        assert_eq!(status.credential_source, Some(CredentialSource::Logs));
    }

    #[test]
    fn not_installed_is_not_listed() {
        let home = tempfile::tempdir().unwrap();
        let plan = CodexCliPlan::new(home.path().join(".codex"), home.path().join(".codex/sessions"));
        assert!(plan.detect(now()).is_none());
    }

    #[test]
    fn reads_the_usage_answer_and_sends_the_workspace() {
        struct Recorder(RefCell<Vec<Vec<(String, String)>>>);
        impl HttpClient for Recorder {
            fn get(&self, url: &str, headers: &[(&str, &str)]) -> Result<HttpResponse, String> {
                assert_eq!(url, USAGE_URL);
                self.0.borrow_mut().push(headers.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect());
                let body = json!({
                    "plan_type": "plus",
                    "rate_limit": {
                        "allowed": true, "limit_reached": false,
                        "primary_window": {"used_percent": 12, "limit_window_seconds": 18000,
                                           "reset_after_seconds": 600, "reset_at": 1_790_000_000},
                        "secondary_window": null
                    },
                    "credits": {"has_credits": false, "unlimited": false, "balance": null},
                    "additional_rate_limits": [{"limit_name": "GPT-6 Luna", "metered_feature": "x",
                        "rate_limit": {"allowed": true, "limit_reached": false,
                            "primary_window": {"used_percent": 3, "limit_window_seconds": 604800,
                                               "reset_after_seconds": 1, "reset_at": 1_790_300_000}}}]
                });
                Ok(HttpResponse { status: 200, body: body.to_string().into_bytes() })
            }
        }
        let http = Recorder(RefCell::new(Vec::new()));
        let token = LiveToken { access_token: "tok".into(), account_id: Some("acct-1".into()), expires_at: None };
        let plan = CodexCliPlan::new(PathBuf::from("/nowhere"), PathBuf::from("/nowhere/sessions"));
        let report = plan.fetch_live(&token, &http, now()).unwrap();

        assert_eq!(report.plan.as_deref(), Some("Plus"));
        let windows = report.quota.windows;
        assert_eq!(windows.len(), 2);
        assert_eq!(windows[0].window_minutes, Some(300));
        assert_eq!(windows[0].used_percent, 12.0);
        assert_eq!(windows[1].scope.as_deref(), Some("GPT-6 Luna"));
        assert_eq!(windows[1].window_minutes, Some(10_080));
        assert!(http.0.borrow()[0].contains(&("ChatGPT-Account-Id".into(), "acct-1".into())));
    }
}
