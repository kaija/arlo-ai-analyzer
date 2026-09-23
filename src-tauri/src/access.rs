//! Which folders the app reads, and the user's grants to read them.
//!
//! The App Store build is sandboxed with no standing access to `~/.claude` or
//! `~/.codex`; the user picks each folder once and a security-scoped bookmark
//! (see `bookmark.rs`) keeps that grant across launches. Outside the sandbox
//! the default locations are readable without any grant, so a missing grant
//! falls back to them.
//!
//! Persisted as `access.json` in the app data dir.

use crate::bookmark;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use usage_core::{Roots, ToolKind};

const FILE: &str = "access.json";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AccessConfig {
    /// Show generated sample data instead of the user's logs.
    #[serde(default)]
    pub sample: bool,
    #[serde(default)]
    pub claude_code: Option<Grant>,
    #[serde(default)]
    pub codex_cli: Option<Grant>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Grant {
    /// Bookmark of the folder the user picked.
    pub bookmark: Vec<u8>,
    /// Where the logs live inside it: picking `~/.claude` (or even `~`) is
    /// accepted and the `projects` directory found underneath.
    #[serde(default)]
    pub subdir: Option<String>,
}

impl AccessConfig {
    pub fn load(data_dir: &Path) -> Self {
        std::fs::read(data_dir.join(FILE))
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, data_dir: &Path) -> Result<(), String> {
        let json = serde_json::to_vec_pretty(self).map_err(|e| e.to_string())?;
        std::fs::write(data_dir.join(FILE), json).map_err(|e| e.to_string())
    }

    pub fn grant(&self, tool: ToolKind) -> Option<&Grant> {
        match tool {
            ToolKind::ClaudeCode => self.claude_code.as_ref(),
            ToolKind::CodexCli => self.codex_cli.as_ref(),
            _ => None,
        }
    }

    pub fn set_grant(&mut self, tool: ToolKind, grant: Option<Grant>) {
        match tool {
            ToolKind::ClaudeCode => self.claude_code = grant,
            ToolKind::CodexCli => self.codex_cli = grant,
            _ => {}
        }
    }
}

/// The tools the user can grant a folder for.
pub const GRANTABLE: [ToolKind; 2] = [ToolKind::ClaudeCode, ToolKind::CodexCli];

pub fn default_root(tool: ToolKind) -> Option<PathBuf> {
    match tool {
        ToolKind::ClaudeCode => usage_core::sources::claude_code::default_root(),
        ToolKind::CodexCli => usage_core::sources::codex_cli::default_root(),
        _ => None,
    }
}

/// Subdirectories of a picked folder that hold the logs, most specific first,
/// so the user can pick the log folder itself, its tool folder, or home.
fn log_subdirs(tool: ToolKind) -> &'static [&'static str] {
    match tool {
        ToolKind::ClaudeCode => &["projects", ".claude/projects"],
        ToolKind::CodexCli => &["sessions", ".codex/sessions"],
        _ => &[],
    }
}

/// Build a grant for a folder the open panel just returned (access is live).
pub fn grant_for_picked(tool: ToolKind, picked: &Path) -> Result<Grant, String> {
    let subdir = log_subdirs(tool)
        .iter()
        .find(|sub| picked.join(sub).is_dir())
        .map(|sub| sub.to_string());
    Ok(Grant { bookmark: bookmark::create(picked)?, subdir })
}

/// Resolve every stored grant, starting access for each. Stale bookmarks are
/// re-created in place; the caller saves the config if this returns `true`.
pub fn resolve_grants(config: &mut AccessConfig) -> (Granted, bool) {
    let mut granted = Granted::default();
    let mut changed = false;
    for tool in GRANTABLE {
        let Some(grant) = config.grant(tool).cloned() else {
            continue;
        };
        match bookmark::resolve(&grant.bookmark) {
            Ok(resolved) => {
                if resolved.stale {
                    if let Ok(fresh) = bookmark::create(&resolved.path) {
                        config.set_grant(tool, Some(Grant { bookmark: fresh, ..grant.clone() }));
                        changed = true;
                    }
                }
                let root = match &grant.subdir {
                    Some(sub) => resolved.path.join(sub),
                    None => resolved.path,
                };
                granted.set(tool, Some(root));
            }
            Err(e) => eprintln!("could not resolve {} folder bookmark: {e}", tool.as_str()),
        }
    }
    (granted, changed)
}

/// Folders currently readable through a resolved grant.
#[derive(Debug, Clone, Default)]
pub struct Granted {
    pub claude_code: Option<PathBuf>,
    pub codex_cli: Option<PathBuf>,
}

impl Granted {
    pub fn get(&self, tool: ToolKind) -> Option<&PathBuf> {
        match tool {
            ToolKind::ClaudeCode => self.claude_code.as_ref(),
            ToolKind::CodexCli => self.codex_cli.as_ref(),
            _ => None,
        }
    }

    pub fn set(&mut self, tool: ToolKind, root: Option<PathBuf>) {
        match tool {
            ToolKind::ClaudeCode => self.claude_code = root,
            ToolKind::CodexCli => self.codex_cli = root,
            _ => {}
        }
    }

    /// Granted folders where present, the tools' default locations otherwise.
    pub fn roots(&self) -> Roots {
        Roots {
            claude_code: self.claude_code.clone().or_else(|| default_root(ToolKind::ClaudeCode)),
            codex_cli: self.codex_cli.clone().or_else(|| default_root(ToolKind::CodexCli)),
        }
    }
}

/// What the UI needs to explain where data comes from.
#[derive(Debug, Clone, Serialize)]
pub struct DataAccess {
    pub sample: bool,
    /// Running inside the App Sandbox, where only granted folders are readable.
    pub sandboxed: bool,
    pub sources: Vec<SourceAccess>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SourceAccess {
    pub tool: ToolKind,
    /// The folder scanned for this tool (granted, else the default location).
    pub path: Option<String>,
    pub granted: bool,
    /// The folder exists and can be listed right now.
    pub readable: bool,
    /// The folder exists, whether or not it can be read yet. The sandbox still
    /// answers `stat` for paths it won't let the app list, which is what lets
    /// onboarding say "Claude Code found" before any access is granted.
    pub detected: bool,
}

pub fn is_sandboxed() -> bool {
    std::env::var_os("APP_SANDBOX_CONTAINER_ID").is_some()
}

pub fn describe(sample: bool, granted: &Granted) -> DataAccess {
    let roots = granted.roots();
    let sources = GRANTABLE
        .iter()
        .map(|&tool| {
            let path = match tool {
                ToolKind::ClaudeCode => roots.claude_code.clone(),
                _ => roots.codex_cli.clone(),
            };
            SourceAccess {
                tool,
                readable: path.as_deref().is_some_and(|p| std::fs::read_dir(p).is_ok()),
                detected: path.as_deref().is_some_and(|p| p.is_dir()),
                path: path.map(|p| p.to_string_lossy().to_string()),
                granted: granted.get(tool).is_some(),
            }
        })
        .collect();
    DataAccess { sample, sandboxed: is_sandboxed(), sources }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_round_trips_and_tolerates_missing_file() {
        let dir = tempfile::tempdir().unwrap();
        assert!(!AccessConfig::load(dir.path()).sample);

        let mut config = AccessConfig { sample: true, ..Default::default() };
        config.set_grant(
            ToolKind::CodexCli,
            Some(Grant { bookmark: vec![1, 2, 3], subdir: Some("sessions".into()) }),
        );
        config.save(dir.path()).unwrap();

        let loaded = AccessConfig::load(dir.path());
        assert!(loaded.sample);
        assert!(loaded.claude_code.is_none());
        assert_eq!(loaded.codex_cli.unwrap().subdir.as_deref(), Some("sessions"));
    }

    #[test]
    fn picked_folder_finds_the_log_directory_underneath() {
        let home = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(home.path().join(".claude/projects")).unwrap();

        // Picking home or ~/.claude both land on ~/.claude/projects.
        let from_home = grant_for_picked(ToolKind::ClaudeCode, home.path()).unwrap();
        assert_eq!(from_home.subdir.as_deref(), Some(".claude/projects"));
        let from_tool_dir = grant_for_picked(ToolKind::ClaudeCode, &home.path().join(".claude")).unwrap();
        assert_eq!(from_tool_dir.subdir.as_deref(), Some("projects"));
        // Picking the log folder itself needs no subdir.
        let direct = grant_for_picked(ToolKind::ClaudeCode, &home.path().join(".claude/projects")).unwrap();
        assert_eq!(direct.subdir, None);
    }

    #[test]
    fn roots_fall_back_to_default_locations() {
        let mut granted = Granted::default();
        granted.set(ToolKind::CodexCli, Some(PathBuf::from("/granted/codex")));
        let roots = granted.roots();
        assert_eq!(roots.codex_cli, Some(PathBuf::from("/granted/codex")));
        assert_eq!(roots.claude_code, default_root(ToolKind::ClaudeCode));
    }
}
