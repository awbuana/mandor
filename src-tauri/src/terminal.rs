use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::process::{Command, Stdio};
use std::sync::Mutex;
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TerminalSession {
    pub id: String,
    pub worktree_path: String,
    pub agent_type: String,
}

pub struct TerminalManager {
    sessions: Mutex<HashMap<String, std::process::Child>>,
}

impl TerminalManager {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }
}

#[tauri::command]
pub fn spawn_terminal(
    worktree_path: String,
    agent_type: String,
) -> Result<TerminalSession, String> {
    let session_id = format!("term_{}_{}", 
        agent_type, 
        chrono::Utc::now().timestamp_millis()
    );

    let cmd = match agent_type.as_str() {
        "opencode" => {
            let mut cmd = Command::new("opencode");
            cmd.current_dir(&worktree_path)
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped());
            cmd
        }
        "claude" => {
            let mut cmd = Command::new("claude");
            cmd.current_dir(&worktree_path)
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped());
            cmd
        }
        "bash" | _ => {
            let mut cmd = if cfg!(target_os = "windows") {
                Command::new("cmd")
            } else {
                let mut cmd = Command::new("bash");
                cmd.arg("-l");
                cmd
            };
            cmd.current_dir(&worktree_path)
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped());
            cmd
        }
    };

    let child = cmd.spawn().map_err(|e| format!("Failed to spawn terminal: {}", e))?;

    Ok(TerminalSession {
        id: session_id,
        worktree_path,
        agent_type,
    })
}

#[tauri::command]
pub fn write_to_terminal(session_id: String, input: String) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub fn resize_terminal(session_id: String, cols: u16, rows: u16) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub fn kill_terminal(session_id: String) -> Result<(), String> {
    Ok(())
}
