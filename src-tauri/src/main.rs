#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod git;
mod worktree;
mod terminal;
mod opencode;

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
        .invoke_handler(tauri::generate_handler![
            open_app_window,
            git::list_worktrees,
            git::create_worktree,
            git::delete_worktree,
            git::get_worktree_status,
            git::get_diff,
            git::get_diff_stats,
            git::stage_file,
            git::unstage_file,
            git::discard_changes,
            git::commit,
            git::get_branches,
            git::get_git_log,
            git::open_repository,
            worktree::open_in_editor,
            worktree::get_worktree_info,
            terminal::spawn_terminal,
            terminal::write_to_terminal,
            terminal::resize_terminal,
            terminal::kill_terminal,
            opencode::start_opencode_server,
            opencode::send_opencode_message,
            opencode::send_opencode_message_async,
            opencode::reply_question,
            opencode::list_session_messages,
            opencode::stream_opencode_events,
            opencode::check_opencode_health,
            opencode::stop_opencode_server,
            opencode::get_opencode_providers,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
