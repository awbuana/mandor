use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WorktreeInfo {
    pub path: String,
    pub branch: String,
    pub commit: String,
    pub last_modified: String,
    pub file_count: i32,
}

#[tauri::command]
pub fn open_in_editor(editor: String, path: String) -> Result<(), String> {
    let cmd = match editor.as_str() {
        "vscode" => "code",
        "cursor" => "cursor",
        "windsurf" => "windsurf",
        "zed" => "zed",
        "fleet" => "fleet",
        _ => &editor,
    };

    let output = Command::new(cmd)
        .arg(&path)
        .output()
        .map_err(|e| format!("Failed to open editor: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(())
}

#[tauri::command]
pub fn get_worktree_info(path: String) -> Result<WorktreeInfo, String> {
    let branch_output = Command::new("git")
        .args(&["-C", &path, "rev-parse", "--abbrev-ref", "HEAD"])
        .output()
        .map_err(|e| format!("Failed to get branch: {}", e))?;

    let branch = String::from_utf8_lossy(&branch_output.stdout).trim().to_string();

    let commit_output = Command::new("git")
        .args(&["-C", &path, "rev-parse", "--short", "HEAD"])
        .output()
        .map_err(|e| format!("Failed to get commit: {}", e))?;

    let commit = String::from_utf8_lossy(&commit_output.stdout).trim().to_string();

    Ok(WorktreeInfo {
        path,
        branch,
        commit,
        last_modified: String::from("Recently"),
        file_count: 0,
    })
}