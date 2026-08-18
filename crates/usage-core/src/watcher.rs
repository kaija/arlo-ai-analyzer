use anyhow::Result;
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use std::path::PathBuf;
use std::sync::mpsc::channel;

/// Watches the given paths and calls `on_change` whenever anything under them changes.
/// The returned watcher must be kept alive for the duration of the watch.
pub fn watch_paths<F>(paths: &[PathBuf], on_change: F) -> Result<RecommendedWatcher>
where
    F: Fn() + Send + 'static,
{
    let (tx, rx) = channel();
    let mut watcher: RecommendedWatcher = notify::recommended_watcher(tx)?;
    for path in paths {
        if path.exists() {
            watcher.watch(path, RecursiveMode::Recursive)?;
        }
    }

    std::thread::spawn(move || {
        // ponytail: fires on every raw fs event, no debounce — add notify-debouncer-mini
        // if rapid writes (e.g. mid-stream transcript flushes) cause excessive re-scans
        for event in rx {
            if event.is_ok() {
                on_change();
            }
        }
    });

    Ok(watcher)
}
