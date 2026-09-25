//! Claude Code: the plan from its saved sign-in, limits from Anthropic's usage
//! endpoint.
//!
//! The sign-in is `<config dir>/.credentials.json`, or on macOS the keychain
//! item `Claude Code-credentials` holding the same JSON:
//! `claudeAiOauth { accessToken, expiresAt (ms), scopes, subscriptionType,
//! rateLimitTier }`. The account's email and organisation are in the global
//! config, `~/.claude.json` (inside the config dir when `CLAUDE_CONFIG_DIR` is
//! set), which is also where an API-key login leaves `primaryApiKey`.
//!
//! Claude Code logs no quota, so limits come only from the live check:
//! `GET /api/oauth/usage`, the request behind its own `/usage` screen.

use super::{
    keychain, ok_body, title_case, AuthKind, CredentialSource, Detection, HttpClient, LiveReport, LiveToken,
    PlanIssue, PlanProvider, PlanStatus, QuotaOrigin, QuotaSnapshot, QuotaWindow,
};
use crate::model::ToolKind;
use crate::paths::display_path;
use chrono::{DateTime, Utc};
use serde_json::Value;
use std::fs;
use std::io::ErrorKind;
use std::path::PathBuf;

const CREDENTIALS_FILE: &str = ".credentials.json";
const GLOBAL_CONFIG_FILE: &str = ".claude.json";
// ponytail: Claude Code appends `-<sha256(config dir)[..8]>` to this when
// CLAUDE_CONFIG_DIR is set. A GUI app can't see the user's shell environment,
// so only the default item is read; hash `config_dir` here if that matters.
const KEYCHAIN_SERVICE: &str = "Claude Code-credentials";
/// Claude Code's keychain account when the user name won't do.
const FALLBACK_KEYCHAIN_ACCOUNT: &str = "claude-code-user";
const USAGE_URL: &str = "https://api.anthropic.com/api/oauth/usage";
const OAUTH_BETA: &str = "oauth-2025-04-20";
/// The usage endpoint needs it; tokens from `claude setup-token` lack it.
const PROFILE_SCOPE: &str = "user:profile";
const WEEK_MINUTES: u32 = 7 * 24 * 60;

/// The fixed windows `/api/oauth/usage` reports: (key, minutes, scope).
const WINDOWS: [(&str, u32, Option<&str>); 4] = [
    ("five_hour", 5 * 60, None),
    ("seven_day", WEEK_MINUTES, None),
    ("seven_day_opus", WEEK_MINUTES, Some("Opus")),
    ("seven_day_sonnet", WEEK_MINUTES, Some("Sonnet")),
];

/// (service, account) → the item's secret.
type KeychainReader = fn(&str, &str) -> Result<Option<String>, String>;

pub struct ClaudeCodePlan {
    /// Claude Code's config directory, `~/.claude` by default.
    config_dir: PathBuf,
    /// Injected so tests never touch the real keychain.
    keychain: KeychainReader,
}

enum Credentials {
    Found { json: Value, source: CredentialSource },
    Missing,
    Unreadable,
}

impl ClaudeCodePlan {
    pub fn new(config_dir: PathBuf) -> Self {
        Self { config_dir, keychain: keychain::read_generic_password }
    }

    fn read_credentials(&self) -> Credentials {
        let file = self.config_dir.join(CREDENTIALS_FILE);
        match fs::read(&file) {
            Ok(bytes) => {
                return match serde_json::from_slice(&bytes) {
                    Ok(json) => Credentials::Found { json, source: CredentialSource::File { path: display_path(&file) } },
                    Err(_) => Credentials::Unreadable,
                }
            }
            // No file: macOS keeps the sign-in in the keychain instead.
            Err(e) if e.kind() == ErrorKind::NotFound => {}
            Err(_) => return Credentials::Unreadable,
        }
        let account = keychain_account(std::env::var("USER").ok().as_deref());
        match (self.keychain)(KEYCHAIN_SERVICE, &account) {
            Ok(Some(secret)) => match parse_secret(&secret) {
                Some(json) => Credentials::Found { json, source: CredentialSource::Keychain },
                None => Credentials::Unreadable,
            },
            Ok(None) => Credentials::Missing,
            Err(_) => Credentials::Unreadable,
        }
    }

    /// The global config and where it was found.
    fn global_config(&self) -> Option<(PathBuf, Value)> {
        let inside = self.config_dir.join(GLOBAL_CONFIG_FILE);
        let beside = self.config_dir.parent().map(|home| home.join(GLOBAL_CONFIG_FILE));
        [Some(inside), beside].into_iter().flatten().find_map(|path| {
            let json = serde_json::from_slice(&fs::read(&path).ok()?).ok()?;
            Some((path, json))
        })
    }
}

impl PlanProvider for ClaudeCodePlan {
    fn tool(&self) -> ToolKind {
        ToolKind::ClaudeCode
    }

    fn detect(&self, _now: DateTime<Utc>) -> Option<Detection> {
        if !self.config_dir.exists() {
            return None;
        }
        let mut status = PlanStatus::new(ToolKind::ClaudeCode, AuthKind::SignedOut);
        let config = self.global_config();
        if let Some((_, config)) = &config {
            let account = &config["oauthAccount"];
            status.account = str_at(account, "emailAddress");
            status.organization = str_at(account, "organizationName");
        }

        let mut live = None;
        match self.read_credentials() {
            Credentials::Found { json, source } => {
                let oauth = &json["claudeAiOauth"];
                // A dead sign-in is cleared to empty strings rather than removed.
                if let Some(token) = oauth["accessToken"].as_str().filter(|t| !t.is_empty()) {
                    status.auth = AuthKind::Subscription;
                    status.credential_source = Some(source);
                    status.plan = oauth["subscriptionType"]
                        .as_str()
                        .map(|kind| plan_name(kind, oauth["rateLimitTier"].as_str()));
                    let can_query = oauth["scopes"]
                        .as_array()
                        .is_none_or(|scopes| scopes.iter().any(|s| s.as_str() == Some(PROFILE_SCOPE)));
                    if can_query {
                        live = Some(LiveToken {
                            access_token: token.to_string(),
                            account_id: None,
                            expires_at: oauth["expiresAt"].as_i64().and_then(DateTime::from_timestamp_millis),
                        });
                    } else {
                        status.issue = Some(PlanIssue::NoUsageAccess);
                    }
                }
            }
            Credentials::Unreadable => status.issue = Some(PlanIssue::CredentialsUnreadable),
            Credentials::Missing => {}
        }

        if status.auth == AuthKind::SignedOut {
            if let Some((path, config)) = &config {
                if config["primaryApiKey"].as_str().is_some_and(|key| !key.is_empty()) {
                    status.auth = AuthKind::ApiKey;
                    status.credential_source = Some(CredentialSource::File { path: display_path(path) });
                }
            }
        }
        Some(Detection { status, live })
    }

    fn fetch_live(&self, token: &LiveToken, http: &dyn HttpClient, now: DateTime<Utc>) -> Result<LiveReport, PlanIssue> {
        let bearer = format!("Bearer {}", token.access_token);
        let headers = [
            ("Authorization", bearer.as_str()),
            ("anthropic-beta", OAUTH_BETA),
            ("Content-Type", "application/json"),
        ];
        let body = ok_body(http.get(USAGE_URL, &headers))?;
        Ok(LiveReport { quota: parse_usage(&body, now)?, plan: None })
    }
}

/// The account Claude Code files its keychain item under: `$USER`, or a fixed
/// name when that is unset or has characters it won't use.
fn keychain_account(user: Option<&str>) -> String {
    let usable = |name: &&str| {
        !name.is_empty() && name.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
    };
    user.filter(usable).unwrap_or(FALLBACK_KEYCHAIN_ACCOUNT).to_string()
}

/// `subscriptionType`, with Max split by its rate-limit tier the way claude.ai
/// names the two Max plans.
fn plan_name(subscription: &str, tier: Option<&str>) -> String {
    match (subscription, tier) {
        ("max", Some(tier)) if tier.ends_with("max_20x") => "Max 20x".into(),
        ("max", Some(tier)) if tier.ends_with("max_5x") => "Max 5x".into(),
        (other, _) => title_case(other),
    }
}

/// The keychain item holds the same JSON as the file. `security -w` prints a
/// secret that isn't plain text as hex, so take that too.
fn parse_secret(secret: &str) -> Option<Value> {
    serde_json::from_str(secret)
        .ok()
        .or_else(|| serde_json::from_slice(&decode_hex(secret)?).ok())
}

fn decode_hex(text: &str) -> Option<Vec<u8>> {
    if !text.len().is_multiple_of(2) {
        return None;
    }
    (0..text.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(text.get(i..i + 2)?, 16).ok())
        .collect()
}

fn str_at(value: &Value, key: &str) -> Option<String> {
    value[key].as_str().filter(|s| !s.is_empty()).map(str::to_string)
}

fn time_at(value: &Value) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value.as_str()?).ok().map(|t| t.with_timezone(&Utc))
}

/// Read an `/api/oauth/usage` answer. A window whose `utilization` is null
/// hasn't been measured and is left out rather than shown as 0%.
fn parse_usage(body: &[u8], now: DateTime<Utc>) -> Result<QuotaSnapshot, PlanIssue> {
    let usage: Value =
        serde_json::from_slice(body).map_err(|e| PlanIssue::Failed(format!("unreadable usage answer: {e}")))?;
    if !usage.is_object() {
        return Err(PlanIssue::Failed("unreadable usage answer".into()));
    }

    let mut windows = Vec::new();
    for (key, minutes, scope) in WINDOWS {
        let window = &usage[key];
        if let Some(used) = window["utilization"].as_f64() {
            windows.push(QuotaWindow {
                id: key.into(),
                window_minutes: Some(minutes),
                scope: scope.map(Into::into),
                used_percent: used,
                resets_at: time_at(&window["resets_at"]),
            });
        }
    }

    // Weekly limits for newer model families are only listed in `limits[]`.
    for limit in usage["limits"].as_array().into_iter().flatten() {
        if limit["kind"].as_str() != Some("weekly_scoped") {
            continue;
        }
        let (Some(model), Some(used)) = (limit["scope"]["model"]["display_name"].as_str(), limit["percent"].as_f64())
        else {
            continue;
        };
        let listed = windows.iter().any(|w| w.scope.as_deref().is_some_and(|s| s.eq_ignore_ascii_case(model)));
        if !listed {
            windows.push(QuotaWindow {
                id: format!("weekly_{}", model.to_lowercase()),
                window_minutes: Some(WEEK_MINUTES),
                scope: Some(model.to_string()),
                used_percent: used,
                resets_at: time_at(&limit["resets_at"]),
            });
        }
    }

    // Pay-as-you-go usage past the plan, against the monthly cap the user set.
    let extra = &usage["extra_usage"];
    if extra["is_enabled"].as_bool() == Some(true) {
        if let Some(used) = extra["utilization"].as_f64() {
            windows.push(QuotaWindow {
                id: "extra_usage".into(),
                window_minutes: None,
                scope: None,
                used_percent: used,
                resets_at: None,
            });
        }
    }

    Ok(QuotaSnapshot { origin: QuotaOrigin::Live, observed_at: now, windows })
}

#[cfg(test)]
impl ClaudeCodePlan {
    fn with_keychain(config_dir: &std::path::Path, keychain: KeychainReader) -> Self {
        Self { config_dir: config_dir.to_path_buf(), keychain }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::plan::HttpResponse;
    use std::cell::RefCell;
    use std::path::Path;

    type Headers = Vec<(String, String)>;

    const CREDENTIALS: &str = r#"{"claudeAiOauth":{"accessToken":"sk-ant-oat01-x","refreshToken":"sk-ant-ort01-x",
        "expiresAt":1790000000000,"scopes":["user:inference","user:profile"],
        "subscriptionType":"max","rateLimitTier":"default_claude_max_20x"}}"#;

    fn no_keychain(_: &str, _: &str) -> Result<Option<String>, String> {
        Ok(None)
    }

    fn now() -> DateTime<Utc> {
        "2026-09-25T12:00:00Z".parse().unwrap()
    }

    /// `~/.claude` inside a temporary home, with `~/.claude.json` beside it.
    fn home_with(credentials: Option<&str>, global: Option<&str>) -> (tempfile::TempDir, PathBuf) {
        let home = tempfile::tempdir().unwrap();
        let config_dir = home.path().join(".claude");
        fs::create_dir_all(&config_dir).unwrap();
        if let Some(c) = credentials {
            fs::write(config_dir.join(CREDENTIALS_FILE), c).unwrap();
        }
        if let Some(g) = global {
            fs::write(home.path().join(GLOBAL_CONFIG_FILE), g).unwrap();
        }
        (home, config_dir)
    }

    #[test]
    fn reads_plan_and_account_from_the_credentials_file() {
        let global = r#"{"oauthAccount":{"emailAddress":"dev@example.com","organizationName":"Example"}}"#;
        let (_home, dir) = home_with(Some(CREDENTIALS), Some(global));
        let found = ClaudeCodePlan::with_keychain(&dir, no_keychain).detect(now()).unwrap();

        let status = found.status;
        assert_eq!(status.auth, AuthKind::Subscription);
        assert_eq!(status.plan.as_deref(), Some("Max 20x"));
        assert_eq!(status.account.as_deref(), Some("dev@example.com"));
        assert_eq!(status.organization.as_deref(), Some("Example"));
        assert!(matches!(status.credential_source, Some(CredentialSource::File { ref path }) if path.ends_with(".claude/.credentials.json")));
        assert_eq!(status.issue, None);

        let live = found.live.unwrap();
        assert_eq!(live.access_token, "sk-ant-oat01-x");
        assert_eq!(live.expires_at, DateTime::from_timestamp_millis(1_790_000_000_000));
    }

    #[test]
    fn falls_back_to_the_keychain_as_json_or_hex() {
        fn json(service: &str, account: &str) -> Result<Option<String>, String> {
            assert_eq!(service, "Claude Code-credentials");
            assert!(!account.is_empty());
            Ok(Some(CREDENTIALS.to_string()))
        }
        fn hex(_: &str, _: &str) -> Result<Option<String>, String> {
            Ok(Some(CREDENTIALS.bytes().map(|b| format!("{b:02x}")).collect()))
        }
        let (_home, dir) = home_with(None, None);
        for reader in [json as KeychainReader, hex] {
            let status = ClaudeCodePlan::with_keychain(&dir, reader).detect(now()).unwrap().status;
            assert_eq!(status.auth, AuthKind::Subscription);
            assert_eq!(status.credential_source, Some(CredentialSource::Keychain));
        }
    }

    #[test]
    fn a_keychain_refusal_is_reported() {
        fn denied(_: &str, _: &str) -> Result<Option<String>, String> {
            Err("User interaction is not allowed.".into())
        }
        let (_home, dir) = home_with(None, None);
        let status = ClaudeCodePlan::with_keychain(&dir, denied).detect(now()).unwrap().status;
        assert_eq!(status.auth, AuthKind::SignedOut);
        assert_eq!(status.issue, Some(PlanIssue::CredentialsUnreadable));
    }

    #[test]
    fn keychain_account_follows_claude_code() {
        assert_eq!(keychain_account(Some("kaija")), "kaija");
        assert_eq!(keychain_account(Some("first.last-2")), "first.last-2");
        assert_eq!(keychain_account(Some("名前")), FALLBACK_KEYCHAIN_ACCOUNT);
        assert_eq!(keychain_account(Some("")), FALLBACK_KEYCHAIN_ACCOUNT);
        assert_eq!(keychain_account(None), FALLBACK_KEYCHAIN_ACCOUNT);
    }

    #[test]
    fn a_setup_token_cannot_query_usage() {
        let creds = r#"{"claudeAiOauth":{"accessToken":"t","scopes":["user:inference"],"subscriptionType":"pro"}}"#;
        let (_home, dir) = home_with(Some(creds), None);
        let found = ClaudeCodePlan::with_keychain(&dir, no_keychain).detect(now()).unwrap();
        assert_eq!(found.status.plan.as_deref(), Some("Pro"));
        assert_eq!(found.status.issue, Some(PlanIssue::NoUsageAccess));
        assert!(found.live.is_none());
    }

    #[test]
    fn api_key_and_signed_out() {
        let (_home, dir) = home_with(None, Some(r#"{"primaryApiKey":"sk-ant-api03-x"}"#));
        let status = ClaudeCodePlan::with_keychain(&dir, no_keychain).detect(now()).unwrap().status;
        assert_eq!(status.auth, AuthKind::ApiKey);
        assert_eq!(status.plan, None);

        // A dead sign-in is blanked in place.
        let blank = r#"{"claudeAiOauth":{"accessToken":"","refreshToken":"","expiresAt":0}}"#;
        let (_home, dir) = home_with(Some(blank), None);
        let found = ClaudeCodePlan::with_keychain(&dir, no_keychain).detect(now()).unwrap();
        assert_eq!(found.status.auth, AuthKind::SignedOut);
        assert!(found.live.is_none());
    }

    #[test]
    fn not_installed_is_not_listed() {
        let home = tempfile::tempdir().unwrap();
        let plan = ClaudeCodePlan::with_keychain(&home.path().join(".claude"), no_keychain);
        assert!(plan.detect(now()).is_none());
    }

    #[test]
    fn reads_the_usage_answer() {
        let body = br#"{
            "five_hour": {"utilization": 23.0, "resets_at": "2026-09-25T15:00:00.000000+00:00"},
            "seven_day": {"utilization": 41.5, "resets_at": "2026-09-29T08:00:00+00:00"},
            "seven_day_oauth_apps": null,
            "seven_day_opus": {"utilization": null, "resets_at": null},
            "seven_day_sonnet": {"utilization": 12.0, "resets_at": null},
            "limits": [
                {"kind": "weekly_scoped", "percent": 64.0, "resets_at": "2026-09-29T08:00:00Z",
                 "scope": {"model": {"display_name": "Fable"}}},
                {"kind": "weekly_scoped", "percent": 12.0, "resets_at": null,
                 "scope": {"model": {"display_name": "sonnet"}}},
                {"kind": "session", "percent": 23.0}
            ],
            "extra_usage": {"is_enabled": true, "monthly_limit": 5000, "used_credits": 1250, "utilization": 25.0}
        }"#;
        let quota = parse_usage(body, now()).unwrap();
        assert_eq!(quota.origin, QuotaOrigin::Live);
        let ids: Vec<&str> = quota.windows.iter().map(|w| w.id.as_str()).collect();
        assert_eq!(ids, ["five_hour", "seven_day", "seven_day_sonnet", "weekly_fable", "extra_usage"]);

        let five = &quota.windows[0];
        assert_eq!(five.window_minutes, Some(300));
        assert_eq!(five.used_percent, 23.0);
        assert_eq!(five.resets_at, Some("2026-09-25T15:00:00Z".parse().unwrap()));
        assert_eq!(quota.windows[3].scope.as_deref(), Some("Fable"));
        assert_eq!(quota.windows[4].window_minutes, None);

        assert!(parse_usage(b"[]", now()).is_err());
        assert!(parse_usage(b"<html>", now()).is_err());
    }

    #[test]
    fn live_check_sends_the_token_the_way_claude_code_does() {
        struct Recorder(RefCell<Vec<(String, Headers)>>);
        impl HttpClient for Recorder {
            fn get(&self, url: &str, headers: &[(&str, &str)]) -> Result<HttpResponse, String> {
                let headers = headers.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect();
                self.0.borrow_mut().push((url.to_string(), headers));
                Ok(HttpResponse { status: 200, body: br#"{"five_hour":{"utilization":5,"resets_at":null}}"#.to_vec() })
            }
        }
        let http = Recorder(RefCell::new(Vec::new()));
        let token = LiveToken { access_token: "tok".into(), account_id: None, expires_at: None };
        let plan = ClaudeCodePlan::with_keychain(Path::new("/nowhere"), no_keychain);
        let report = plan.fetch_live(&token, &http, now()).unwrap();
        assert_eq!(report.quota.windows.len(), 1);

        let calls = http.0.borrow();
        assert_eq!(calls[0].0, USAGE_URL);
        assert!(calls[0].1.contains(&("Authorization".into(), "Bearer tok".into())));
        assert!(calls[0].1.contains(&("anthropic-beta".into(), OAUTH_BETA.into())));
    }
}
