use log::info;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;

macro_rules! log_git {
    ($($arg:tt)*) => (info!(target: "mandor::git", $($arg)*))
}

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
    log_git!("list_worktrees called with repo_path: {}", repo_path);
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
    log_git!("create_worktree called with repo_path: {}, branch: {}, path: {}", repo_path, branch, path);
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
    log_git!("delete_worktree called with repo_path: {}, worktree_path: {}", repo_path, worktree_path);
    let output = Command::new("git")
        .args(&["-C", &repo_path, "worktree", "remove", "-f", &worktree_path])
        .output()
        .map_err(|e| format!("Failed to delete worktree: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(())
}

/// Core logic for computing worktree status. Called both by the Tauri command
/// and by the filesystem watcher to push real-time updates.
pub fn compute_worktree_status(worktree_path: &str) -> Result<WorktreeStatus, String> {
    let branch_output = Command::new("git")
        .args(&["-C", worktree_path, "rev-parse", "--abbrev-ref", "HEAD"])
        .output()
        .map_err(|e| format!("Failed to get branch: {}", e))?;

    let branch = String::from_utf8_lossy(&branch_output.stdout).trim().to_string();

    let commit_output = Command::new("git")
        .args(&["-C", worktree_path, "rev-parse", "--short", "HEAD"])
        .output()
        .map_err(|e| format!("Failed to get commit: {}", e))?;

    let commit = String::from_utf8_lossy(&commit_output.stdout).trim().to_string();

    let status_output = Command::new("git")
        .args(&["-C", worktree_path, "status", "--porcelain"])
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
            ('?', '?') => {
                if file_path.ends_with('/') {
                    let ls_output = Command::new("git")
                        .args(&[
                            "-C", worktree_path,
                            "ls-files", "--others", "--exclude-standard", &file_path,
                        ])
                        .output();
                    if let Ok(out) = ls_output {
                        for child in String::from_utf8_lossy(&out.stdout).lines() {
                            if !child.is_empty() {
                                untracked.push(child.to_string());
                            }
                        }
                    }
                } else {
                    untracked.push(file_path);
                }
            },
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
pub async fn get_worktree_status(worktree_path: String) -> Result<WorktreeStatus, String> {
    log_git!("get_worktree_status called with worktree_path: {}", worktree_path);
    let path = worktree_path.clone();
    tokio::task::spawn_blocking(move || {
        compute_worktree_status(&path)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub fn git_push(worktree_path: String) -> Result<(), String> {
    log_git!("git_push called with worktree_path: {}", worktree_path);
    let output = Command::new("git")
        .args(&["-C", &worktree_path, "push"])
        .output()
        .map_err(|e| format!("Failed to execute git push: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(())
}

#[tauri::command]
pub fn get_diff(worktree_path: String, file_path: Option<String>) -> Result<String, String> {
    log_git!("get_diff called with worktree_path: {}, file_path: {:?}", worktree_path, file_path);
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

    // If no diff output, check if it's a new/untracked file (or directory)
    if let Some(ref file) = file_path {
        let full_path = PathBuf::from(&worktree_path).join(file);

        // If the path is a directory (e.g. "plan/"), expand all untracked files
        // inside it and concatenate their diffs.
        if full_path.is_dir() {
            let ls_output = Command::new("git")
                .args(&[
                    "-C", &worktree_path,
                    "ls-files", "--others", "--exclude-standard", file,
                ])
                .output()
                .map_err(|e| format!("Failed to list untracked files in dir: {}", e))?;

            let mut combined = String::new();
            for child in String::from_utf8_lossy(&ls_output.stdout).lines() {
                if child.is_empty() {
                    continue;
                }
                // Recursively get diff for each child file
                if let Ok(child_diff) = get_diff(worktree_path.clone(), Some(child.to_string())) {
                    combined.push_str(&child_diff);
                }
            }
            return Ok(combined);
        }

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

/// Core logic for computing diff stats. Called both by the Tauri command
/// and by the filesystem watcher to push real-time updates.
pub fn compute_diff_stats(worktree_path: &str) -> Result<DiffStats, String> {
    let status_output = Command::new("git")
        .args(&["-C", worktree_path, "status", "--porcelain"])
        .output()
        .map_err(|e| format!("Failed to get status for diff stats: {}", e))?;

    let status_stdout = String::from_utf8_lossy(&status_output.stdout);
    let files_changed = status_stdout
        .lines()
        .filter(|l| l.len() >= 2)
        .count() as i32;

    let mut insertions = 0i32;
    let mut deletions = 0i32;

    for extra_args in &[&[][..], &["--cached"][..]] {
        let mut args = vec!["-C", worktree_path, "diff", "--stat"];
        args.extend_from_slice(extra_args);

        let output = Command::new("git")
            .args(&args)
            .output()
            .map_err(|e| format!("Failed to get diff stats: {}", e))?;

        if !output.status.success() {
            continue;
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            if line.contains("files changed") || line.contains("file changed") {
                let parts: Vec<&str> = line.split(',').collect();
                for part in parts {
                    let part = part.trim();
                    if part.contains("insertions") || part.contains("insertion") {
                        if let Some(num) = part.split_whitespace().next() {
                            insertions += num.parse::<i32>().unwrap_or(0);
                        }
                    } else if part.contains("deletions") || part.contains("deletion") {
                        if let Some(num) = part.split_whitespace().next() {
                            deletions += num.parse::<i32>().unwrap_or(0);
                        }
                    }
                }
            }
        }
    }

    Ok(DiffStats {
        files_changed,
        insertions,
        deletions,
    })
}

#[tauri::command]
pub async fn get_diff_stats(worktree_path: String) -> Result<DiffStats, String> {
    log_git!("get_diff_stats called with worktree_path: {}", worktree_path);
    let path = worktree_path.clone();
    tokio::task::spawn_blocking(move || {
        compute_diff_stats(&path)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub fn stage_file(worktree_path: String, file_path: String) -> Result<(), String> {
    log_git!("stage_file called with worktree_path: {}, file_path: {}", worktree_path, file_path);
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
pub fn stage_all_files(worktree_path: String) -> Result<(), String> {
    log_git!("stage_all_files called with worktree_path: {}", worktree_path);
    let output = Command::new("git")
        .args(&["-C", &worktree_path, "add", "-A"])
        .output()
        .map_err(|e| format!("Failed to stage all files: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(())
}

#[tauri::command]
pub fn unstage_all_files(worktree_path: String) -> Result<(), String> {
    log_git!("unstage_all_files called with worktree_path: {}", worktree_path);
    let output = Command::new("git")
        .args(&["-C", &worktree_path, "reset"])
        .output()
        .map_err(|e| format!("Failed to unstage all files: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(())
}

#[tauri::command]
pub fn unstage_file(worktree_path: String, file_path: String) -> Result<(), String> {
    log_git!("unstage_file called with worktree_path: {}, file_path: {}", worktree_path, file_path);
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
    log_git!("discard_changes called with worktree_path: {}, file_path: {}", worktree_path, file_path);
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
    log_git!("commit called with worktree_path: {}, message: {}", worktree_path, message);
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
    log_git!("get_branches called with repo_path: {}", repo_path);
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
pub async fn get_git_log(worktree_path: String, limit: Option<i32>) -> Result<Vec<GitCommit>, String> {
    log_git!("get_git_log called with worktree_path: {}, limit: {:?}", worktree_path, limit);
    let path = worktree_path.clone();
    let lim = limit.unwrap_or(50);
    
    tokio::task::spawn_blocking(move || {
        let output = Command::new("git")
            .args(&[
                "-C", &path,
                "log",
                &format!("--max-count={}", lim),
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
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn open_repository(app: tauri::AppHandle) -> Result<String, String> {
    log_git!("open_repository called");
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