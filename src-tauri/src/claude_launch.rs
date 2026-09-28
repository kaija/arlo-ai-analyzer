//! Open an interactive Claude Code session for a recommendation.

use std::path::{Path, PathBuf};

#[cfg(target_os = "macos")]
use std::process::Command;

#[cfg(target_os = "macos")]
const TERMINAL_SCRIPT: &str = r#"
on run argv
  set projectPath to item 1 of argv
  set cliPath to item 2 of argv
  set userPrompt to item 3 of argv
  set launchCommand to "cd " & quoted form of projectPath & " && " & quoted form of cliPath & " --permission-mode default " & quoted form of userPrompt
  tell application "Terminal"
    activate
    do script launchCommand
  end tell
end run
"#;

fn find_binary() -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|path| {
            std::env::split_paths(&path)
                .map(|dir| dir.join("claude"))
                .collect()
        })
        .unwrap_or_default();
    if let Some(home) = usage_core::paths::real_home_dir() {
        candidates.push(home.join(".local/bin/claude"));
    }
    candidates.extend([
        PathBuf::from("/opt/homebrew/bin/claude"),
        PathBuf::from("/usr/local/bin/claude"),
    ]);
    candidates
        .into_iter()
        .find(|path| is_executable(path))
        .and_then(|path| path.canonicalize().ok())
}

#[cfg(unix)]
fn is_executable(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    path.metadata()
        .is_ok_and(|meta| meta.is_file() && meta.permissions().mode() & 0o111 != 0)
}

#[cfg(not(unix))]
fn is_executable(path: &Path) -> bool {
    path.is_file()
}

pub fn available() -> bool {
    cfg!(target_os = "macos") && find_binary().is_some()
}

#[cfg(target_os = "macos")]
pub fn launch(project: &Path, prompt: &str) -> Result<(), String> {
    if !project.is_dir() {
        return Err("The selected project folder is no longer available".into());
    }
    if prompt.trim().is_empty() || prompt.len() > 32_000 {
        return Err("The Claude Code prompt is empty or too long".into());
    }
    let binary = find_binary().ok_or("Claude Code CLI was not found")?;
    // Pass each value as an osascript argument. AppleScript's `quoted form of`
    // escapes it for the shell, including quotes and newlines in the prompt.
    let output = Command::new("/usr/bin/osascript")
        .arg("-e")
        .arg(TERMINAL_SCRIPT)
        .arg(project)
        .arg(&binary)
        .arg(prompt)
        .output()
        .map_err(|error| format!("Could not open Terminal: {error}"))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "Could not open Terminal: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ))
    }
}

#[cfg(not(target_os = "macos"))]
pub fn launch(_project: &Path, _prompt: &str) -> Result<(), String> {
    Err("Opening an interactive Claude Code terminal is not supported on this platform".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(unix)]
    #[test]
    fn detection_requires_an_executable_file() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let binary = dir.path().join("claude");
        std::fs::write(&binary, "#!/bin/sh\n").unwrap();
        std::fs::set_permissions(&binary, std::fs::Permissions::from_mode(0o644)).unwrap();
        assert!(!is_executable(&binary));
        std::fs::set_permissions(&binary, std::fs::Permissions::from_mode(0o755)).unwrap();
        assert!(is_executable(&binary));
    }
}
