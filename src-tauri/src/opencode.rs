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
use std::time::Duration;
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

// ── Return type exposed to the frontend ──────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct OpencodeServerInfo {
    pub port: u16,
    pub hostname: String,
    pub session_id: String,
}

// ── Commands ─────────────────────────────────────────────────────────────────

/// Poll the opencode health endpoint until the server is ready, then create
/// a session and return the server info.
///
/// The opencode process itself must already be running (spawned by the
/// frontend PTY component). This command never spawns a process.
#[tauri::command]
pub async fn start_opencode_server(
    worktree_path: String,
    port: u16,
    hostname: String,
) -> Result<OpencodeServerInfo, String> {
    let _ = worktree_path; // routing is by port; path kept for future logging
    let client = Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;

    let base = format!("http://{}:{}", hostname, port);

    // Poll health every 500 ms for up to ~15 s (30 attempts)
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

    // Create a new session
    let session: Session = client
        .post(format!("{base}/session"))
        .json(&CreateSessionBody { title: None })
        .send()
        .await
        .map_err(|e| format!("POST /session failed: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Failed to parse session response: {e}"))?;

    Ok(OpencodeServerInfo {
        port,
        hostname,
        session_id: session.id,
    })
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