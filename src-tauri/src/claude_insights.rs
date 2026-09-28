//! Claude Code's own `/insights` report, generated with the user's CLI.

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::UNIX_EPOCH;

const MAX_REPORT_BYTES: u64 = 12 * 1024 * 1024;

#[derive(Serialize)]
pub struct InsightsReport {
    pub html: String,
    pub path: String,
    pub generated_at_ms: u64,
}

fn report_dir() -> Result<PathBuf, String> {
    usage_core::paths::real_home_dir()
        .map(|home| home.join(".claude/usage-data"))
        .ok_or_else(|| "Could not find the user's home folder".into())
}

fn is_report_name(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
        return false;
    };
    name == "report.html" || (name.starts_with("report-") && name.ends_with(".html"))
}

fn latest_report(dir: &Path) -> Result<Option<InsightsReport>, String> {
    if !dir.exists() {
        return Ok(None);
    }
    let base = dir.canonicalize().map_err(|error| error.to_string())?;
    let mut candidates = Vec::new();
    for entry in fs::read_dir(dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if !is_report_name(&path) {
            continue;
        }
        let Ok(canonical) = path.canonicalize() else {
            continue;
        };
        if canonical.parent() != Some(base.as_path()) {
            continue;
        }
        let Ok(metadata) = canonical.metadata() else {
            continue;
        };
        if !metadata.is_file() || metadata.len() > MAX_REPORT_BYTES {
            continue;
        }
        let Ok(modified) = metadata.modified() else {
            continue;
        };
        candidates.push((modified, canonical));
    }
    candidates.sort_by_key(|a| std::cmp::Reverse(a.0));
    let Some((modified, path)) = candidates.into_iter().next() else {
        return Ok(None);
    };
    let html = fs::read_to_string(&path)
        .map_err(|error| format!("Could not read Claude Code report: {error}"))?;
    if !html.to_ascii_lowercase().contains("<html") {
        return Err("Claude Code report is not a valid HTML document".into());
    }
    let generated_at_ms = modified
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    Ok(Some(InsightsReport {
        html,
        path: path.to_string_lossy().into_owned(),
        generated_at_ms,
    }))
}

pub fn current_report() -> Result<Option<InsightsReport>, String> {
    latest_report(&report_dir()?)
}

fn validated_report_path(dir: &Path, requested: &str) -> Result<PathBuf, String> {
    let report = latest_report(dir)?.ok_or("Claude Code insights report was not found")?;
    if report.path != requested {
        return Err("The Claude Code insights report changed; reload it and try again".into());
    }
    Ok(PathBuf::from(report.path))
}

pub fn open_report(path: &str) -> Result<(), String> {
    // Only open the report we just found in Claude Code's own report folder.
    // The webview never gets a general filesystem-opening capability.
    let verified = validated_report_path(&report_dir()?, path)?;
    tauri_plugin_opener::open_path(&verified, None::<&str>)
        .map_err(|error| format!("Could not open Claude Code report: {error}"))
}

/// Print mode executes the built-in command without leaving a new session in
/// the history it analyzes. The command itself may use the user's Claude plan.
pub fn generate() -> Result<InsightsReport, String> {
    let binary = crate::claude_launch::find_binary().ok_or("Claude Code CLI was not found")?;
    let before = current_report()?
        .map(|report| report.generated_at_ms)
        .unwrap_or(0);
    let home = usage_core::paths::real_home_dir().ok_or("Could not find the user's home folder")?;
    let output = Command::new(binary)
        .args(["-p", "--no-session-persistence", "/insights"])
        .current_dir(home)
        .output()
        .map_err(|error| format!("Could not start Claude Code: {error}"))?;
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Claude Code /insights failed: {}", detail.trim()));
    }
    let report = current_report()?.ok_or("Claude Code did not create an insights report")?;
    if report.generated_at_ms <= before {
        return Err("Claude Code did not create a new insights report".into());
    }
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn picks_newest_report_and_ignores_other_html() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("report-old.html"), "<html>old</html>").unwrap();
        std::thread::sleep(std::time::Duration::from_millis(15));
        fs::write(dir.path().join("report.html"), "<html>new</html>").unwrap();
        fs::write(dir.path().join("other.html"), "<html>other</html>").unwrap();
        assert_eq!(
            latest_report(dir.path()).unwrap().unwrap().html,
            "<html>new</html>"
        );
    }

    #[test]
    fn opening_only_accepts_the_current_report_path() {
        let dir = tempfile::tempdir().unwrap();
        let report = dir.path().join("report.html");
        fs::write(&report, "<html>report</html>").unwrap();
        let selected = report.canonicalize().unwrap();
        assert_eq!(
            validated_report_path(dir.path(), selected.to_str().unwrap()).unwrap(),
            selected
        );
        assert!(validated_report_path(dir.path(), "/tmp/unrelated.html").is_err());
    }
}
