use std::process::Stdio;
use tauri::{command, Emitter};
use tokio::process::Command;
use serde::{Deserialize, Serialize};
use futures::StreamExt;

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

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct MessagePart {
    pub r#type: String,
    pub text: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct MessageInfo {
    pub id: String,
    pub role: String,
    pub timestamp: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Message {
    pub info: MessageInfo,
    pub parts: Vec<MessagePart>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct StreamEvent {
    pub event: String,
    pub data: serde_json::Value,
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
        Err(_e) => {
            return Err("Failed to check server status".to_string());
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
        Err(_e) => {
            // Server might still be starting, wait a bit more and try to create session
            tokio::time::sleep(tokio::time::Duration::from_millis(2000)).await;

            // Try to create session anyway
            match create_session(&hostname, port).await {
                Ok(session_id) => {
                    return Ok(OpencodeServerResult {
                        port,
                        hostname,
                        session_id,
                    });
                }
                Err(_) => {
                    return Err("Failed to start opencode server and create session".to_string());
                }
            }
        }
    }
}

/// Create a new session on the opencode server
async fn create_session(hostname: &str, port: u16) -> Result<String, String> {
    let client = reqwest::Client::new();
    let session_url = format!("http://{}:{}/session", hostname, port);

    println!("Creating session at: {}", session_url);

    let response = client
        .post(&session_url)
        .json(&serde_json::json!({
            "title": "Mandor Workbench Session"
        }))
        .send()
        .await
        .map_err(|e| format!("Failed to create session: {}", e))?;

    println!("Session creation response status: {}", response.status());

    if response.status().is_success() {
        let session: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse session response: {}", e))?;

        println!("Session response: {:?}", session);

        session["id"]
            .as_str()
            .map(|s| s.to_string())
            .ok_or_else(|| "Session ID not found in response".to_string())
    } else {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        Err(format!("Failed to create session: {} - {}", status, error_text))
    }
}

/// Send a message asynchronously (no wait) and return immediately
#[command]
pub async fn send_opencode_message_async(
    hostname: String,
    port: u16,
    session_id: String,
    message: String,
    provider_id: Option<String>,
    model_id: Option<String>,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let message_url = format!("http://{}:{}/session/{}/message", hostname, port, session_id);

    println!("Sending message to: {}", message_url);
    println!("Session ID: {}", session_id);
    println!("Message: {}", message);
    println!("Provider: {:?}, Model: {:?}", provider_id, model_id);

    // Build request body
    let mut body = serde_json::json!({
        "parts": [
            {
                "type": "text",
                "text": message
            }
        ]
    });

    // Add model if provider and model are specified
    if let (Some(provider), Some(model)) = (&provider_id, &model_id) {
        body["model"] = serde_json::json!({
            "providerID": provider,
            "modelID": model
        });
    }

    let response = client
        .post(&message_url)
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            println!("Network error sending message: {}", e);
            format!("Failed to send message: {}", e)
        })?;

    let status = response.status();
    println!("Response status: {}", status);

    if status.is_success() {
        // Try to get the response body
        let body = response.text().await.unwrap_or_default();
        println!("Response body: {}", body);

        // Parse the response and extract text content from parts
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&body) {
            if let Some(parts) = json.get("parts").and_then(|p| p.as_array()) {
                let text_content: String = parts
                    .iter()
                    .filter_map(|part| {
                        if part.get("type").and_then(|t| t.as_str()) == Some("text") {
                            part.get("text").and_then(|t| t.as_str())
                        } else {
                            None
                        }
                    })
                    .collect::<Vec<_>>()
                    .join("");

                println!("Extracted text content: {}", text_content);
                return Ok(text_content);
            }
        }

        // Fallback: return the raw body if we couldn't parse it
        Ok(body)
    } else {
        // Try to get error details from response
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        println!("Error response: {}", error_text);
        Err(format!("Failed to send message: {} - {}", status, error_text))
    }
}

/// Reply to a question from the opencode server
#[command]
pub async fn reply_question(
    hostname: String,
    port: u16,
    question_id: String,
    answer: String,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let reply_url = format!("http://{}:{}/question/{}/reply", hostname, port, question_id);

    println!("Replying to question: {}", reply_url);
    println!("Question ID: {}", question_id);
    println!("Answer: {}", answer);

    let body = serde_json::json!({
        "answers": [[answer]]
    });

    let response = client
        .post(&reply_url)
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            println!("Network error replying to question: {}", e);
            format!("Failed to reply to question: {}", e)
        })?;

    let status = response.status();
    println!("Response status: {}", status);

    if status.is_success() {
        let body = response.text().await.unwrap_or_else(|_| "OK".to_string());
        println!("Reply response: {}", body);
        Ok(body)
    } else {
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        println!("Error response: {}", error_text);
        Err(format!("Failed to reply to question: {} - {}", status, error_text))
    }
}

/// Get available providers and models from opencode server
#[command]
pub async fn get_opencode_providers(
    hostname: String,
    port: u16,
) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let providers_url = format!("http://{}:{}/provider", hostname, port);

    println!("Fetching providers from: {}", providers_url);

    let response = client
        .get(&providers_url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch providers: {}", e))?;

    let status = response.status();
    if status.is_success() {
        let providers: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse providers response: {}", e))?;

        println!("Found providers: {:?}", providers.get("all").and_then(|a| a.as_array()).map(|a| a.len()));
        Ok(providers)
    } else {
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        Err(format!("Failed to fetch providers: {} - {}", status, error_text))
    }
}

/// Send a message to an active opencode session and wait for full response
#[command]
pub async fn send_opencode_message(
    hostname: String,
    port: u16,
    session_id: String,
    message: String,
    provider_id: Option<String>,
    model_id: Option<String>,
) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let message_url = format!("http://{}:{}/session/{}/message", hostname, port, session_id);

    // Build request body with optional model
    let mut body = serde_json::json!({
        "parts": [
            {
                "type": "text",
                "text": message
            }
        ]
    });

    if let (Some(provider), Some(model)) = (provider_id, model_id) {
        body["model"] = serde_json::json!({
            "providerID": provider,
            "modelID": model
        });
    }

    let response = client
        .post(&message_url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to send message: {}", e))?;

    let status = response.status();
    if status.is_success() {
        response
            .json()
            .await
            .map_err(|e| format!("Failed to parse message response: {}", e))
    } else {
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        println!("Send message error: {} - {}", status, error_text);
        Err(format!("Failed to send message: {} - {}", status, error_text))
    }
}

/// List messages in a session
#[command]
pub async fn list_session_messages(
    hostname: String,
    port: u16,
    session_id: String,
    limit: Option<u32>,
) -> Result<Vec<Message>, String> {
    let client = reqwest::Client::new();
    let limit = limit.unwrap_or(50);
    let messages_url = format!("http://{}:{}/session/{}/message?limit={}", hostname, port, session_id, limit);

    println!("Listing messages from: {}", messages_url);

    let response = client
        .get(&messages_url)
        .send()
        .await
        .map_err(|e| format!("Failed to list messages: {}", e))?;

    if response.status().is_success() {
        let messages: Vec<Message> = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse messages response: {}", e))?;

        println!("Got {} messages", messages.len());
        Ok(messages)
    } else {
        Err(format!("Failed to list messages: {}", response.status()))
    }
}

/// Stream events from the opencode server
/// This uses Server-Sent Events (SSE) to receive real-time updates
/// Spawns a background task and returns immediately
#[command]
pub async fn stream_opencode_events(
    hostname: String,
    port: u16,
    session_id: String,
    window: tauri::Window,
) -> Result<(), String> {
    let window_clone = window.clone();
    
    tauri::async_runtime::spawn(async move {
        stream_events_loop(hostname, port, session_id, window_clone).await;
    });

    Ok(())
}

async fn stream_events_loop(
    hostname: String,
    port: u16,
    session_id: String,
    window: tauri::Window,
) {
    let client = reqwest::Client::new();
    let event_url = format!("http://{}:{}/event", hostname, port);

    println!("[SSE] Connecting to event stream: {}", event_url);

    let response = match client.get(&event_url).send().await {
        Ok(resp) => resp,
        Err(e) => {
            eprintln!("[SSE] Failed to connect to event stream: {}", e);
            let _ = window.emit("opencode-error", serde_json::json!({
                "session_id": &session_id,
                "error": format!("Failed to connect: {}", e)
            }));
            return;
        }
    };

    if !response.status().is_success() {
        eprintln!("[SSE] Failed to connect to event stream: {}", response.status());
        let _ = window.emit("opencode-error", serde_json::json!({
            "session_id": &session_id,
            "error": format!("Failed to connect: {}", response.status())
        }));
        return;
    }

    println!("[SSE] Connected to event stream, waiting for events...");

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();

    while let Some(chunk) = stream.next().await {
        match chunk {
            Ok(bytes) => {
                let text = String::from_utf8_lossy(&bytes);
                buffer.push_str(&text);

                while let Some(pos) = buffer.find("\n\n") {
                    let event_text = buffer[..pos].to_string();
                    buffer = buffer[pos + 2..].to_string();

                    let mut event_name = String::new();
                    let mut event_data = String::new();

                    for line in event_text.lines() {
                        if line.starts_with("event: ") {
                            event_name = line[7..].to_string();
                        } else if line.starts_with("data: ") {
                            event_data = line[6..].to_string();
                        }
                    }

                    if !event_data.is_empty() {
                        println!("[SSE] Received event: {} with data: {}", event_name, event_data);

                        if let Ok(json_data) = serde_json::from_str::<serde_json::Value>(&event_data) {
                            let emit_result = window.emit("opencode-event", serde_json::json!({
                                "session_id": &session_id,
                                "event": event_name,
                                "data": json_data
                            }));

                            if let Err(e) = emit_result {
                                eprintln!("[SSE] Failed to emit event: {}", e);
                            }
                        }
                    }
                }
            }
            Err(e) => {
                eprintln!("[SSE] Error reading event stream: {}", e);
                let _ = window.emit("opencode-error", serde_json::json!({
                    "session_id": &session_id,
                    "error": format!("Stream error: {}", e)
                }));
                break;
            }
        }
    }

    println!("[SSE] Event stream ended");
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