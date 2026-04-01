#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod git;
mod opencode;
mod watcher;
mod worktree;

use tauri::Manager;

#[tauri::command]
async fn open_app_window(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn main() {
    // Initialize CrabNebula DevTools as early as possible (debug builds only)
    #[cfg(debug_assertions)]
    let devtools = tauri_plugin_devtools::init();

    let mut builder = tauri::Builder::default();

    #[cfg(debug_assertions)]
    {
        builder = builder.plugin(devtools);
    }

    builder
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_pty::init())
        .manage(watcher::WatcherState::new())
        .manage(opencode::OpencodeState::new())
        .invoke_handler(tauri::generate_handler![
            open_app_window,
            git::list_worktrees,
            git::create_worktree,
            git::delete_worktree,
            git::get_worktree_status,
            git::get_diff,
            git::get_diff_stats,
            git::stage_file,
            git::stage_all_files,
            git::unstage_file,
            git::unstage_all_files,
            git::discard_changes,
            git::commit,
            git::git_push,
            git::get_branches,
            git::get_git_log,
            git::open_repository,
            worktree::open_in_editor,
            worktree::get_worktree_info,
            watcher::start_file_watcher,
            watcher::stop_file_watcher,
            watcher::add_watch_path,
            watcher::remove_watch_path,
            opencode::start_opencode_server,
            opencode::stop_opencode_server,
            opencode::tui_append_prompt,
            opencode::tui_submit_prompt,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}