use portable_pty::{native_pty_system, CommandBuilder, PtyPair, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TerminalSession {
    pub id: String,
    pub worktree_path: String,
    pub agent_type: String,
}

struct PtySession {
    worktree_path: String,
    agent_type: String,
    _pty_pair: PtyPair,
    writer: Box<dyn Write + Send>,
    output_thread: Option<thread::JoinHandle<()>>,
}

pub struct TerminalManager {
    sessions: Mutex<HashMap<String, Arc<Mutex<Option<PtySession>>>>>,
}

impl TerminalManager {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }
}

impl Default for TerminalManager {
    fn default() -> Self {
        Self::new()
    }
}

#[tauri::command]
pub fn spawn_terminal(
    app: AppHandle,
    worktree_path: String,
    agent_type: String,
) -> Result<TerminalSession, String> {
    let session_id = format!(
        "term_{}_{}",
        agent_type,
        chrono::Utc::now().timestamp_millis()
    );

    let pty_system = native_pty_system();

    let pty_pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to open PTY: {}", e))?;

    let mut cmd: CommandBuilder = match agent_type.as_str() {
        "opencode" => {
            let mut cmd = CommandBuilder::new("opencode");
            cmd.cwd(&worktree_path);
            cmd.env("TERM", "xterm-256color");
            cmd
        }
        "claude" => {
            let mut cmd = CommandBuilder::new("claude");
            cmd.cwd(&worktree_path);
            cmd.env("TERM", "xterm-256color");
            cmd
        }
        "bash" | _ => {
            let mut cmd = CommandBuilder::new("bash");
            cmd.arg("-l");
            cmd.cwd(&worktree_path);
            cmd.env("TERM", "xterm-256color");
            cmd
        }
    };

    let _child = pty_pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn terminal: {}", e))?;

    let mut writer = pty_pair
        .master
        .take_writer()
        .map_err(|e| format!("Failed to get PTY writer: {}", e))?;

    let mut reader = pty_pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to clone PTY reader: {}", e))?;

    let session_id_clone = session_id.clone();
    let app_clone = app.clone();

    let output_thread = thread::spawn(move || {
        let mut reader = reader;
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => {
                    let _ = app_clone.emit(&format!("terminal-output-{}", session_id_clone), "EOF");
                    break;
                }
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    if let Err(e) =
                        app_clone.emit(&format!("terminal-output-{}", session_id_clone), data)
                    {
                        eprintln!("Failed to emit terminal output: {}", e);
                        break;
                    }
                }
                Err(e) => {
                    eprintln!("PTY read error: {}", e);
                    let _ = app_clone.emit(
                        &format!("terminal-output-{}", session_id_clone),
                        format!("\r\n[PTY error: {}]\r\n", e),
                    );
                    break;
                }
            }
        }
    });

    let pty_session = PtySession {
        worktree_path: worktree_path.clone(),
        agent_type: agent_type.clone(),
        _pty_pair: pty_pair,
        writer,
        output_thread: Some(output_thread),
    };

    let session = Arc::new(Mutex::new(Some(pty_session)));

    if let Some(tm) = app.try_state::<TerminalManager>() {
        tm.sessions
            .lock()
            .unwrap()
            .insert(session_id.clone(), session);
    }

    Ok(TerminalSession {
        id: session_id,
        worktree_path,
        agent_type,
    })
}

#[tauri::command]
pub fn write_to_terminal(session_id: String, input: String, app: AppHandle) -> Result<(), String> {
    if let Some(tm) = app.try_state::<TerminalManager>() {
        let sessions = tm.sessions.lock().unwrap();
        if let Some(session_arc) = sessions.get(&session_id) {
            let mut guard = session_arc.lock().unwrap();
            if let Some(ref mut session) = *guard {
                session
                    .writer
                    .write_all(input.as_bytes())
                    .map_err(|e| format!("Failed to write to PTY: {}", e))?;
                session
                    .writer
                    .flush()
                    .map_err(|e| format!("Failed to flush PTY: {}", e))?;
                return Ok(());
            }
        }
    }
    Err("Session not found".to_string())
}

#[tauri::command]
pub fn resize_terminal(
    session_id: String,
    cols: u16,
    rows: u16,
    app: AppHandle,
) -> Result<(), String> {
    if let Some(tm) = app.try_state::<TerminalManager>() {
        let sessions = tm.sessions.lock().unwrap();
        if let Some(session_arc) = sessions.get(&session_id) {
            let guard = session_arc.lock().unwrap();
            if let Some(ref session) = *guard {
                session
                    ._pty_pair
                    .master
                    .resize(PtySize {
                        rows,
                        cols,
                        pixel_width: 0,
                        pixel_height: 0,
                    })
                    .map_err(|e| format!("Failed to resize PTY: {}", e))?;
                return Ok(());
            }
        }
    }
    Err("Session not found".to_string())
}

#[tauri::command]
pub fn kill_terminal(session_id: String, app: AppHandle) -> Result<(), String> {
    if let Some(tm) = app.try_state::<TerminalManager>() {
        let mut sessions = tm.sessions.lock().unwrap();
        sessions.remove(&session_id);
        return Ok(());
    }
    Err("Session not found".to_string())
}
