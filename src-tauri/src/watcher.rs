use log::info;
use std::path::Path;
use std::sync::Mutex;
use std::time::Duration;

macro_rules! log_watcher {
    ($($arg:tt)*) => (info!(target: "mandor::watcher", $($arg)*))
}

use notify::RecommendedWatcher;
use notify_debouncer_mini::{new_debouncer, DebounceEventResult, Debouncer};
use tauri::{AppHandle, Emitter, State};

use crate::git::{compute_diff_stats, compute_worktree_status};

/// Tauri-managed state for the filesystem watcher.
///
/// `debouncer` holds the active `notify` debouncer instance.  Dropping it
/// stops all OS-level watches, so we wrap it in `Option` so we can take it
/// out cleanly when stopping.
///
/// `watched_paths` is the authoritative list of worktree root directories
/// currently being monitored.
pub struct WatcherState {
    pub debouncer: Mutex<Option<Debouncer<RecommendedWatcher>>>,
    pub watched_paths: Mutex<Vec<String>>,
}

impl WatcherState {
    pub fn new() -> Self {
        WatcherState {
            debouncer: Mutex::new(None),
            watched_paths: Mutex::new(Vec::new()),
        }
    }
}

// ---------------------------------------------------------------------------
// Helper: decide whether a changed path should trigger a status refresh.
//
// Paths inside `.git/` are almost all internal bookkeeping that we don't care
// about.  The exception is `.git/index`, which is written by `git add` /
// `git reset` and directly maps to a staging change.
// ---------------------------------------------------------------------------
fn should_process_path(path: &Path) -> bool {
    let path_str = path.to_string_lossy();

    // Check if path contains /.git/
    if let Some(git_pos) = path_str.find("/.git/") {
        let after_git = &path_str[git_pos + 6..]; // skip "/.git/"
                                                  // Only include .git/index (staging changes)
        return after_git == "index" || after_git.starts_with("index");
    }

    // Also skip paths that are exactly /.git (the directory itself)
    if path_str.ends_with("/.git") {
        return false;
    }

    true
}

// ---------------------------------------------------------------------------
// Helper: find which registered worktree paths are ancestors of `changed`.
// ---------------------------------------------------------------------------
fn affected_worktrees(changed: &Path, watched_paths: &[String]) -> Vec<String> {
    let changed_str = changed.to_string_lossy();
    watched_paths
        .iter()
        .filter(|wt| {
            let wt_with_slash = format!("{}/", wt);
            changed_str.starts_with(wt_with_slash.as_str()) || changed_str.as_ref() == wt.as_str()
        })
        .cloned()
        .collect()
}

// ---------------------------------------------------------------------------
// Build a fresh debouncer that emits `worktree-changed` events.
// This is factored out so both `start_file_watcher` and `add_watch_path`
// can rebuild the watcher with an updated path list.
// ---------------------------------------------------------------------------
fn build_debouncer(
    app: AppHandle,
    paths: Vec<String>,
) -> Result<Debouncer<RecommendedWatcher>, String> {
    let watched_paths_clone = paths.clone();

    let debouncer = new_debouncer(
        Duration::from_millis(500),
        move |result: DebounceEventResult| {
            let events = match result {
                Ok(events) => events,
                Err(e) => {
                    eprintln!("[watcher] debounce error: {:?}", e);
                    return;
                }
            };

            // Collect which worktrees are affected by this batch of events
            let mut affected: Vec<String> = Vec::new();
            for event in &events {
                let path = &event.path;
                if !should_process_path(path) {
                    continue;
                }
                let new_affected = affected_worktrees(path, &watched_paths_clone);
                for wt in new_affected {
                    if !affected.contains(&wt) {
                        affected.push(wt);
                    }
                }
            }

            // For each affected worktree, compute fresh status and push to frontend
            for worktree_path in affected {
                let status = match compute_worktree_status(&worktree_path) {
                    Ok(s) => s,
                    Err(e) => {
                        eprintln!("[watcher] status error for {}: {}", worktree_path, e);
                        continue;
                    }
                };

                let diff_stats = match compute_diff_stats(&worktree_path) {
                    Ok(d) => d,
                    Err(e) => {
                        eprintln!("[watcher] diff_stats error for {}: {}", worktree_path, e);
                        continue;
                    }
                };

                let payload = serde_json::json!({
                    "worktree_path": worktree_path,
                    "status": status,
                    "diff_stats": diff_stats,
                });

                if let Err(e) = app.emit("worktree-changed", payload) {
                    eprintln!("[watcher] emit error: {}", e);
                }
            }
        },
    )
    .map_err(|e| format!("Failed to create file watcher: {}", e))?;

    Ok(debouncer)
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Start watching all provided worktree paths.
/// Should be called once on app startup after `list_worktrees` resolves.
#[tauri::command]
pub fn start_file_watcher(
    app: AppHandle,
    state: State<WatcherState>,
    paths: Vec<String>,
) -> Result<(), String> {
    log_watcher!("start_file_watcher called with paths: {:?}", paths);
    use notify::RecursiveMode;

    let mut debouncer = build_debouncer(app, paths.clone())?;

    for path in &paths {
        debouncer
            .watcher()
            .watch(Path::new(path), RecursiveMode::Recursive)
            .map_err(|e| format!("Failed to watch path {}: {}", path, e))?;
    }

    *state.debouncer.lock().unwrap() = Some(debouncer);
    *state.watched_paths.lock().unwrap() = paths.clone();

    Ok(())
}

/// Stop the file watcher and release all OS resources.
#[tauri::command]
pub fn stop_file_watcher(state: State<WatcherState>) -> Result<(), String> {
    log_watcher!("stop_file_watcher called");
    *state.debouncer.lock().unwrap() = None;
    state.watched_paths.lock().unwrap().clear();
    Ok(())
}

/// Add a newly created worktree path to the active watcher.
/// Rebuilds the debouncer with the updated path list so the internal closure
/// has an up-to-date copy.
#[tauri::command]
pub fn add_watch_path(
    app: AppHandle,
    state: State<WatcherState>,
    path: String,
) -> Result<(), String> {
    log_watcher!("add_watch_path called with path: {}", path);
    use notify::RecursiveMode;

    let mut paths = state.watched_paths.lock().unwrap();
    if paths.contains(&path) {
        return Ok(()); // already watched
    }
    paths.push(path.clone());
    let new_paths = paths.clone();
    drop(paths); // release lock before rebuilding

    let mut new_debouncer = build_debouncer(app, new_paths.clone())?;

    for p in &new_paths {
        new_debouncer
            .watcher()
            .watch(Path::new(p), RecursiveMode::Recursive)
            .map_err(|e| format!("Failed to watch path {}: {}", p, e))?;
    }

    *state.debouncer.lock().unwrap() = Some(new_debouncer);
    *state.watched_paths.lock().unwrap() = new_paths;

    Ok(())
}

/// Remove a deleted worktree from the active watcher.
/// Rebuilds the debouncer with the updated path list.
#[tauri::command]
pub fn remove_watch_path(
    app: AppHandle,
    state: State<WatcherState>,
    path: String,
) -> Result<(), String> {
    log_watcher!("remove_watch_path called with path: {}", path);
    use notify::RecursiveMode;

    let mut paths = state.watched_paths.lock().unwrap();
    paths.retain(|p| p != &path);
    let new_paths = paths.clone();
    drop(paths);

    if new_paths.is_empty() {
        *state.debouncer.lock().unwrap() = None;
        return Ok(());
    }

    let mut new_debouncer = build_debouncer(app, new_paths.clone())?;

    for p in &new_paths {
        new_debouncer
            .watcher()
            .watch(Path::new(p), RecursiveMode::Recursive)
            .map_err(|e| format!("Failed to watch path {}: {}", p, e))?;
    }

    *state.debouncer.lock().unwrap() = Some(new_debouncer);
    *state.watched_paths.lock().unwrap() = new_paths;

    Ok(())
}
