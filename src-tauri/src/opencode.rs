//! Opencode server integration module.
//!
//! This module provides Tauri commands to interact with a locally-running opencode
//! TUI server. It handles:
//! - **Server Health Polling**: Waits for the opencode HTTP server to become ready
//! - **Session Management**: Creates new opencode sessions for code analysis
//! - **TUI Interaction**: Sends commands to append text and submit prompts to the TUI
//!
//! The opencode process is expected to be spawned by the frontend via a PTY component.
//! This module provides HTTP-based communication to control the running instance.
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;
use tokio::time::sleep;

// ── Response shapes ──────────────────────────────────────────────────────────
//
// Internal data structures for deserializing/serializing HTTP requests and responses
// from the opencode server API.

#[derive(Debug, Deserialize)]
struct HealthResponse {
    healthy: bool,
}

#[derive(Debug, Serialize)]
struct CreateSessionBody {
    #[serde(skip_serializing_if = "Option::is_none")]
    title: Option<String>,
}

#[derive(Debug, Deserialize)]
struct Session {
    id: String,
}

#[derive(Debug, Serialize)]
struct AppendPromptBody {
    text: String,
}

// ── Return type exposed to the frontend ─────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct OpencodeServerInfo {
    pub port: u16,
    pub hostname: String,
    pub session_id: String,
}

// ── Server state management ──────────────────────────────────────────────────

pub struct OpencodeState {
    cache: Arc<Mutex<HashMap<String, OpencodeServerInfo>>>,
    global_lock: Arc<Mutex<()>>,
}

impl OpencodeState {
    pub fn new() -> Self {
        Self {
            cache: Arc::new(Mutex::new(HashMap::new())),
            global_lock: Arc::new(Mutex::new(())),
        }
    }
}

// ── Commands ─────────────────────────────────────────────────────────────────

/// Poll the opencode health endpoint until the server is ready, then create
/// a session and return the server info.
///
/// The opencode process itself must already be running (spawned by the
/// frontend PTY component). This command never spawns a process.
///
/// Idempotent: uses a global lock to ensure only one initialization
/// runs at a time. Subsequent calls wait for the first to complete and
/// return the cached result.
#[tauri::command]
pub async fn start_opencode_server(
    state: tauri::State<'_, OpencodeState>,
    worktree_path: String,
    port: u16,
    hostname: String,
) -> Result<OpencodeServerInfo, String> {
    eprintln!("[opencode] start_opencode_server called for {} port {}", worktree_path, port);
    let _guard = state.global_lock.lock().await;
    eprintln!("[opencode] global lock acquired for {}", worktree_path);

    let cache = state.cache.lock().await;
    if let Some(cached) = cache.get(&worktree_path) {
        eprintln!(
            "[opencode] returning cached server info for {} (port {})",
            worktree_path, cached.port
        );
        return Ok(cached.clone());
    }
    drop(cache);

    eprintln!("[opencode] cache miss for {}, starting to poll", worktree_path);

    let client = Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;

    let base = format!("http://{}:{}", hostname, port);

    let mut healthy = false;
    for attempt in 1..=30 {
        match client
            .get(format!("{base}/global/health"))
            .send()
            .await
        {
            Ok(resp) if resp.status().is_success() => {
                if let Ok(body) = resp.json::<HealthResponse>().await {
                    if body.healthy {
                        healthy = true;
                        break;
                    }
                }
            }
            _ => {}
        }
        eprintln!(
            "[opencode] waiting for server on port {} (attempt {}/30)…",
            port, attempt
        );
        sleep(Duration::from_millis(500)).await;
    }

    if !healthy {
        return Err(format!(
            "opencode server on port {port} did not become healthy within 15 s"
        ));
    }

    let session: Session = client
        .post(format!("{base}/session"))
        .json(&CreateSessionBody { title: None })
        .send()
        .await
        .map_err(|e| format!("POST /session failed: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Failed to parse session response: {e}"))?;

    let result = OpencodeServerInfo {
        port,
        hostname,
        session_id: session.id,
    };

    let mut cache = state.cache.lock().await;
    cache.insert(worktree_path.clone(), result.clone());
    eprintln!("[opencode] cached result for {}, releasing lock", worktree_path);

    Ok(result)
}

/// Clear the cached server info for a worktree. Called when the TUI/PTY is stopped.
#[tauri::command]
pub async fn stop_opencode_server(
    state: tauri::State<'_, OpencodeState>,
    worktree_path: String,
) -> Result<(), String> {
    let _guard = state.global_lock.lock().await;
    let mut cache = state.cache.lock().await;
    if let Some(removed) = cache.remove(&worktree_path) {
        eprintln!(
            "[opencode] cleared cached server for {} (port {})",
            worktree_path, removed.port
        );
    }
    Ok(())
}

/// Append text to the opencode TUI's prompt input box.
/// POST /tui/append-prompt  { "text": "<text>" }
#[tauri::command]
pub async fn tui_append_prompt(
    hostname: String,
    port: u16,
    text: String,
) -> Result<bool, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;

    let resp = client
        .post(format!("http://{}:{}/tui/append-prompt", hostname, port))
        .json(&AppendPromptBody { text })
        .send()
        .await
        .map_err(|e| format!("POST /tui/append-prompt failed: {e}"))?;

    Ok(resp.status().is_success())
}

/// Submit the current prompt in the opencode TUI (equivalent to pressing Enter).
/// POST /tui/submit-prompt  (no body)
#[tauri::command]
pub async fn tui_submit_prompt(hostname: String, port: u16) -> Result<bool, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;

    let resp = client
        .post(format!("http://{}:{}/tui/submit-prompt", hostname, port))
        .send()
        .await
        .map_err(|e| format!("POST /tui/submit-prompt failed: {e}"))?;

    Ok(resp.status().is_success())
}