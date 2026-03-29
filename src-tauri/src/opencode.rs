use std::process::Stdio;
use tauri::command;
use tokio::process::Command;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct OpencodeServerResult {
    pub port: u16,
    pub hostname: String,
    pub session_id: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ServerHealth {
    pub healthy: bool,
    pub version: String,
}

/// Start the opencode server for a worktree
/// 
/// This command runs `opencode serve` in the specified worktree directory
/// and returns the port and session information once the server is ready.
#[command]
pub async fn start_opencode_server(
    worktree_path: String,
    port: Option<u16>,
) -> Result<OpencodeServerResult, String> {
    let port = port.unwrap_or(4096);
    let hostname = "127.0.0.1".to_string();
    
    // Check if opencode is available
    let check_output = Command::new("which")
        .arg("opencode")
        .output()
        .await
        .map_err(|e| format!("Failed to check opencode availability: {}", e))?;
    
    if !check_output.status.success() {
        return Err("opencode command not found. Please install opencode first.".to_string());
    }
    
    // Start the opencode server
    let mut child = Command::new("opencode")
        .arg("serve")
        .arg("--port")
        .arg(port.to_string())
        .arg("--hostname")
        .arg(&hostname)
        .current_dir(&worktree_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start opencode server: {}", e))?;
    
    // Wait a bit for the server to start
    tokio::time::sleep(tokio::time::Duration::from_millis(1000)).await;
    
    // Check if the process is still running
    match child.try_wait() {
        Ok(Some(status)) => {
            return Err(format!("Opencode server exited early with status: {:?}", status));
        }
        Ok(None) => {
            // Server is running, proceed
        }
        Err(e) => {
            return Err(format!("Failed to check server status: {}", e));
        }
    }
    
    // Try to connect to the server to verify it's healthy
    let client = reqwest::Client::new();
    let health_url = format!("http://{}:{}/global/health", hostname, port);
    
    let health_check = client
        .get(&health_url)
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await;
    
    match health_check {
        Ok(response) => {
            if response.status().is_success() {
                let health: ServerHealth = response
                    .json()
                    .await
                    .map_err(|e| format!("Failed to parse health response: {}", e))?;
                
                if health.healthy {
                    // Create a session
                    let session_result = create_session(&hostname, port).await?;
                    
                    return Ok(OpencodeServerResult {
                        port,
                        hostname,
                        session_id: session_result,
                    });
                } else {
                    return Err("Opencode server is not healthy".to_string());
                }
            } else {
                return Err(format!("Health check failed with status: {}", response.status()));
            }
        }
        Err(e) => {
            // Server might still be starting, return with a placeholder session ID
            // The frontend can poll for health
            return Ok(OpencodeServerResult {
                port,
                hostname,
                session_id: format!("pending_{}", uuid::Uuid::new_v4()),
            });
        }
    }
}

/// Create a new session on the opencode server
async fn create_session(hostname: &str, port: u16) -> Result<String, String> {
    let client = reqwest::Client::new();
    let session_url = format!("http://{}:{}/session", hostname, port);
    
    let response = client
        .post(&session_url)
        .json(&serde_json::json!({
            "title": "Mandor Workbench Session"
        }))
        .send()
        .await
        .map_err(|e| format!("Failed to create session: {}", e))?;
    
    if response.status().is_success() {
        let session: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse session response: {}", e))?;
        
        session["id"]
            .as_str()
            .map(|s| s.to_string())
            .ok_or_else(|| "Session ID not found in response".to_string())
    } else {
        Err(format!("Failed to create session: {}", response.status()))
    }
}

/// Send a message to an active opencode session
#[command]
pub async fn send_opencode_message(
    hostname: String,
    port: u16,
    session_id: String,
    message: String,
) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let message_url = format!("http://{}:{}/session/{}/message", hostname, port, session_id);
    
    let response = client
        .post(&message_url)
        .json(&serde_json::json!({
            "parts": [
                {
                    "type": "text",
                    "text": message
                }
            ]
        }))
        .send()
        .await
        .map_err(|e| format!("Failed to send message: {}", e))?;
    
    if response.status().is_success() {
        response
            .json()
            .await
            .map_err(|e| format!("Failed to parse message response: {}", e))
    } else {
        Err(format!("Failed to send message: {}", response.status()))
    }
}

/// Check if the opencode server is healthy
#[command]
pub async fn check_opencode_health(
    hostname: String,
    port: u16,
) -> Result<ServerHealth, String> {
    let client = reqwest::Client::new();
    let health_url = format!("http://{}:{}/global/health", hostname, port);
    
    let response = client
        .get(&health_url)
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
        .map_err(|e| format!("Failed to check health: {}", e))?;
    
    if response.status().is_success() {
        response
            .json()
            .await
            .map_err(|e| format!("Failed to parse health response: {}", e))
    } else {
        Err(format!("Health check failed: {}", response.status()))
    }
}

/// Stop the opencode server
#[command]
pub async fn stop_opencode_server(
    hostname: String,
    port: u16,
) -> Result<bool, String> {
    let client = reqwest::Client::new();
    let dispose_url = format!("http://{}:{}/instance/dispose", hostname, port);
    
    let response = client
        .post(&dispose_url)
        .send()
        .await
        .map_err(|e| format!("Failed to stop server: {}", e))?;
    
    Ok(response.status().is_success())
}