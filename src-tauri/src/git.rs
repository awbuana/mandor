use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Worktree {
    pub path: String,
    pub head: String,
    pub branch: Option<String>,
    pub is_main: bool,
    pub is_bare: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileStatus {
    pub path: String,
    pub status: String,
    pub staged: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WorktreeStatus {
    pub branch: String,
    pub commit: String,
    pub ahead: i32,
    pub behind: i32,
    pub modified: Vec<FileStatus>,
    pub staged: Vec<FileStatus>,
    pub untracked: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiffLine {
    pub line_number: i32,
    pub content: String,
    pub change_type: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileDiff {
    pub path: String,
    pub old_path: Option<String>,
    pub lines_added: i32,
    pub lines_deleted: i32,
    pub hunks: Vec<DiffHunk>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiffHunk {
    pub old_start: i32,
    pub old_lines: i32,
    pub new_start: i32,
    pub new_lines: i32,
    pub lines: Vec<DiffLine>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GitCommit {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub author: String,
    pub date: String,
    pub is_head: bool,
}

#[tauri::command]
pub fn list_worktrees(repo_path: String) -> Result<Vec<Worktree>, String> {
    let output = Command::new("git")
        .args(&["-C", &repo_path, "worktree", "list", "--porcelain"])
        .output()
        .map_err(|e| format!("Failed to list worktrees: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut worktrees = Vec::new();
    let mut current_worktree: Option<Worktree> = None;

    for line in stdout.lines() {
        if line.starts_with("worktree ") {
            if let Some(wt) = current_worktree.take() {
                worktrees.push(wt);
            }
            current_worktree = Some(Worktree {
                path: line[9..].to_string(),
                head: String::new(),
                branch: None,
                is_main: false,
                is_bare: false,
            });
        } else if let Some(ref mut wt) = current_worktree {
            if line.starts_with("HEAD ") {
                wt.head = line[5..].to_string();
            } else if line.starts_with("branch ") {
                wt.branch = Some(line[7..].to_string());
            } else if line == "bare" {
                wt.is_bare = true;
            } else if line == "detached" {
                wt.branch = None;
            }
        }
    }

    if let Some(wt) = current_worktree {
        worktrees.push(wt);
    }

    if let Some(first) = worktrees.first_mut() {
        first.is_main = true;
    }

    Ok(worktrees)
}

#[tauri::command]
pub fn create_worktree(
    repo_path: String,
    branch: String,
    path: String,
) -> Result<Worktree, String> {
    let worktree_path = PathBuf::from(&repo_path).join(&path);

    // Check if branch exists
    let branch_check = Command::new("git")
        .args(&["-C", &repo_path, "rev-parse", "--verify", &branch])
        .output();

    let branch_exists = match branch_check {
        Ok(output) => output.status.success(),
        Err(_) => false,
    };

    // Build the worktree add command
    let mut args = vec![
        "-C", &repo_path,
        "worktree", "add",
    ];

    if !branch_exists {
        // Create new branch with -b flag
        args.push("-b");
        args.push(&branch);
    }

    args.push(worktree_path.to_str().unwrap());

    if branch_exists {
        // Use existing branch
        args.push(&branch);
    }

    let output = Command::new("git")
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to create worktree: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(Worktree {
        path: worktree_path.to_string_lossy().to_string(),
        head: String::new(),
        branch: Some(branch),
        is_main: false,
        is_bare: false,
    })
}

#[tauri::command]
pub fn delete_worktree(repo_path: String, worktree_path: String) -> Result<(), String> {
    let output = Command::new("git")
        .args(&["-C", &repo_path, "worktree", "remove", "-f", &worktree_path])
        .output()
        .map_err(|e| format!("Failed to delete worktree: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(())
}

#[tauri::command]
pub fn get_worktree_status(worktree_path: String) -> Result<WorktreeStatus, String> {
    let branch_output = Command::new("git")
        .args(&["-C", &worktree_path, "rev-parse", "--abbrev-ref", "HEAD"])
        .output()
        .map_err(|e| format!("Failed to get branch: {}", e))?;

    let branch = String::from_utf8_lossy(&branch_output.stdout).trim().to_string();

    let commit_output = Command::new("git")
        .args(&["-C", &worktree_path, "rev-parse", "--short", "HEAD"])
        .output()
        .map_err(|e| format!("Failed to get commit: {}", e))?;

    let commit = String::from_utf8_lossy(&commit_output.stdout).trim().to_string();

    let status_output = Command::new("git")
        .args(&["-C", &worktree_path, "status", "--porcelain"])
        .output()
        .map_err(|e| format!("Failed to get status: {}", e))?;

    let stdout = String::from_utf8_lossy(&status_output.stdout);
    let mut modified = Vec::new();
    let mut staged = Vec::new();
    let mut untracked = Vec::new();

    for line in stdout.lines() {
        if line.len() < 3 {
            continue;
        }

        let index_status = line.chars().nth(0).unwrap();
        let worktree_status = line.chars().nth(1).unwrap();
        let file_path = line[3..].to_string();

        match (index_status, worktree_status) {
            ('?', '?') => untracked.push(file_path),
            (' ', m) if m != ' ' => modified.push(FileStatus {
                path: file_path,
                status: worktree_status.to_string(),
                staged: false,
            }),
            (m, ' ') if m != ' ' => staged.push(FileStatus {
                path: file_path,
                status: index_status.to_string(),
                staged: true,
            }),
            (m, w) if m != ' ' && w != ' ' => {
                staged.push(FileStatus {
                    path: file_path.clone(),
                    status: index_status.to_string(),
                    staged: true,
                });
                modified.push(FileStatus {
                    path: file_path,
                    status: worktree_status.to_string(),
                    staged: false,
                });
            }
            _ => {}
        }
    }

    Ok(WorktreeStatus {
        branch,
        commit,
        ahead: 0,
        behind: 0,
        modified,
        staged,
        untracked,
    })
}

#[tauri::command]
pub fn get_diff(worktree_path: String, file_path: Option<String>) -> Result<String, String> {
    // First try regular diff for tracked/modified files
    let diff_output = if let Some(ref file) = file_path {
        Command::new("git")
            .args(&["-C", &worktree_path, "diff", "--", file])
            .output()
            .map_err(|e| format!("Failed to get diff: {}", e))?
    } else {
        Command::new("git")
            .args(&["-C", &worktree_path, "diff"])
            .output()
            .map_err(|e| format!("Failed to get diff: {}", e))?
    };

    // If we have output, return it
    if diff_output.status.success() && !diff_output.stdout.is_empty() {
        return Ok(String::from_utf8_lossy(&diff_output.stdout).to_string());
    }

    // If no diff output, check if it's a new/untracked file
    if let Some(ref file) = file_path {
        // Check if file is untracked
        let untracked_output = Command::new("git")
            .args(&["-C", &worktree_path, "ls-files", "--others", "--exclude-standard", file])
            .output()
            .map_err(|e| format!("Failed to check untracked files: {}", e))?;

        let is_untracked = String::from_utf8_lossy(&untracked_output.stdout).trim() == file;

        // Also check if file is staged (new file)
        let staged_output = Command::new("git")
            .args(&["-C", &worktree_path, "diff", "--cached", "--name-only", "--", file])
            .output()
            .map_err(|e| format!("Failed to check staged files: {}", e))?;

        let is_staged_new = !String::from_utf8_lossy(&staged_output.stdout).trim().is_empty();

        // For new files, generate a diff showing all content as added
        if is_untracked || is_staged_new {
            let file_path_full = PathBuf::from(&worktree_path).join(file);
            
            if file_path_full.exists() {
                // Read file content and format as diff
                let content = std::fs::read_to_string(&file_path_full)
                    .map_err(|e| format!("Failed to read file: {}", e))?;
                
                let line_count = content.lines().count();
                
                // Create diff header
                let mut diff = format!("diff --git a/{} b/{}\n", file, file);
                diff.push_str(&format!("new file mode 100644\n"));
                diff.push_str(&format!("index 0000000..{}\n", "e69de29"));
                diff.push_str(&format!("--- /dev/null\n"));
                diff.push_str(&format!("+++ b/{}\n", file));
                diff.push_str(&format!("@@ -0,0 +1,{} @@\n", line_count));
                
                // Add all lines with + prefix
                for line in content.lines() {
                    diff.push_str(&format!("+{}\n", line));
                }
                
                return Ok(diff);
            }
        }
    }

    // Return empty string if no diff found
    Ok(String::new())
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiffStats {
    pub files_changed: i32,
    pub insertions: i32,
    pub deletions: i32,
}

#[tauri::command]
pub fn get_diff_stats(worktree_path: String) -> Result<DiffStats, String> {
    let output = Command::new("git")
        .args(&["-C", &worktree_path, "diff", "--stat"])
        .output()
        .map_err(|e| format!("Failed to get diff stats: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut files_changed = 0;
    let mut insertions = 0;
    let mut deletions = 0;

    for line in stdout.lines() {
        // Parse lines like: " src/main.rs | 10 ++++++-----"
        // Or summary line: " 3 files changed, 15 insertions(+), 7 deletions(-)"
        if line.contains("files changed") || line.contains("file changed") {
            // Parse summary line
            let parts: Vec<&str> = line.split(',').collect();
            for part in parts {
                let part = part.trim();
                if part.contains("files changed") || part.contains("file changed") {
                    if let Some(num) = part.split_whitespace().next() {
                        files_changed = num.parse().unwrap_or(0);
                    }
                } else if part.contains("insertions") || part.contains("insertion") {
                    if let Some(num) = part.split_whitespace().next() {
                        insertions = num.parse().unwrap_or(0);
                    }
                } else if part.contains("deletions") || part.contains("deletion") {
                    if let Some(num) = part.split_whitespace().next() {
                        deletions = num.parse().unwrap_or(0);
                    }
                }
            }
        } else if line.contains('|') && !line.starts_with('-') {
            // Count individual file lines
            files_changed += 1;
        }
    }

    Ok(DiffStats {
        files_changed,
        insertions,
        deletions,
    })
}

#[tauri::command]
pub fn stage_file(worktree_path: String, file_path: String) -> Result<(), String> {
    let output = Command::new("git")
        .args(&["-C", &worktree_path, "add", &file_path])
        .output()
        .map_err(|e| format!("Failed to stage file: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(())
}

#[tauri::command]
pub fn unstage_file(worktree_path: String, file_path: String) -> Result<(), String> {
    let output = Command::new("git")
        .args(&["-C", &worktree_path, "reset", "HEAD", &file_path])
        .output()
        .map_err(|e| format!("Failed to unstage file: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(())
}

#[tauri::command]
pub fn discard_changes(worktree_path: String, file_path: String) -> Result<(), String> {
    let output = Command::new("git")
        .args(&["-C", &worktree_path, "checkout", "--", &file_path])
        .output()
        .map_err(|e| format!("Failed to discard changes: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(())
}

#[tauri::command]
pub fn commit(worktree_path: String, message: String) -> Result<String, String> {
    let output = Command::new("git")
        .args(&["-C", &worktree_path, "commit", "-m", &message])
        .output()
        .map_err(|e| format!("Failed to commit: {}", e))?;

    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);

    if !output.status.success() {
        let error_msg = if stderr.is_empty() { stdout } else { stderr };
        return Err(error_msg.to_string());
    }

    Ok(stdout.to_string())
}

#[tauri::command]
pub fn get_branches(repo_path: String) -> Result<Vec<String>, String> {
    let output = Command::new("git")
        .args(&["-C", &repo_path, "branch", "-a", "--format=%(refname:short)"])
        .output()
        .map_err(|e| format!("Failed to list branches: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let branches: Vec<String> = String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
        .collect();

    Ok(branches)
}

#[tauri::command]
pub fn get_git_log(worktree_path: String, limit: Option<i32>) -> Result<Vec<GitCommit>, String> {
    let limit = limit.unwrap_or(50);
    
    let output = Command::new("git")
        .args(&[
            "-C", &worktree_path,
            "log",
            &format!("--max-count={}", limit),
            "--pretty=format:%H|%h|%s|%an|%ar|%D"
        ])
        .output()
        .map_err(|e| format!("Failed to get git log: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut commits = Vec::new();

    for line in stdout.lines() {
        let parts: Vec<&str> = line.splitn(6, '|').collect();
        if parts.len() >= 5 {
            let refs = parts.get(5).unwrap_or(&"");
            commits.push(GitCommit {
                hash: parts[0].to_string(),
                short_hash: parts[1].to_string(),
                message: parts[2].to_string(),
                author: parts[3].to_string(),
                date: parts[4].to_string(),
                is_head: refs.contains("HEAD"),
            });
        }
    }

    Ok(commits)
}

#[tauri::command]
pub async fn open_repository(app: tauri::AppHandle) -> Result<String, String> {
    use tauri_plugin_dialog::DialogExt;

    let folder_path = app
        .dialog()
        .file()
        .set_title("Select Git Repository")
        .blocking_pick_folder();

    match folder_path {
        Some(path) => {
            let path_str = path.to_string();

            // Check if it's a git repository
            let output = Command::new("git")
                .args(&["-C", &path_str, "rev-parse", "--git-dir"])
                .output();

            match output {
                Ok(result) if result.status.success() => Ok(path_str),
                _ => Err("Selected directory is not a git repository".to_string()),
            }
        }
        None => Err("No directory selected".to_string()),
    }
}
