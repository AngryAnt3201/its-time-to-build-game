use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tracing::{error, info};

/// Open a native macOS folder picker using osascript (AppleScript).
/// Works from any thread/context — no windowed environment needed.
async fn pick_folder() -> Option<String> {
    let output = tokio::process::Command::new("osascript")
        .arg("-e")
        .arg("POSIX path of (choose folder with prompt \"Select Project Directory\")")
        .output()
        .await
        .ok()?;

    if !output.status.success() {
        // User cancelled the dialog
        return None;
    }

    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    // Remove trailing slash that osascript adds
    let path = path.trim_end_matches('/').to_string();
    if path.is_empty() {
        None
    } else {
        Some(path)
    }
}

/// Lightweight HTTP API server for pre-game operations (e.g. native file dialog).
///
/// Runs on port 9002, separate from the WebSocket game server.
/// Currently supports a single operation: opening a native directory picker.
pub async fn start() {
    let listener = match TcpListener::bind("127.0.0.1:9002").await {
        Ok(l) => l,
        Err(e) => {
            error!("Failed to bind HTTP API on 127.0.0.1:9002: {}", e);
            return;
        }
    };

    info!("HTTP API listening on http://127.0.0.1:9002");

    loop {
        let (mut stream, _) = match listener.accept().await {
            Ok(conn) => conn,
            Err(e) => {
                error!("HTTP API accept error: {}", e);
                continue;
            }
        };

        tokio::spawn(async move {
            let mut buf = [0u8; 4096];
            let n = match stream.read(&mut buf).await {
                Ok(n) => n,
                Err(_) => return,
            };
            let request = String::from_utf8_lossy(&buf[..n]);

            // CORS preflight
            if request.starts_with("OPTIONS") {
                let response = "HTTP/1.1 204 No Content\r\n\
                    Access-Control-Allow-Origin: *\r\n\
                    Access-Control-Allow-Methods: POST, GET, OPTIONS\r\n\
                    Access-Control-Allow-Headers: Content-Type\r\n\
                    \r\n";
                let _ = stream.write_all(response.as_bytes()).await;
                return;
            }

            // Open native directory picker via osascript
            let folder = pick_folder().await;

            let body = if let Some(path) = folder {
                format!(
                    "{{\"path\":{}}}",
                    serde_json::to_string(&path).unwrap_or_else(|_| "null".to_string())
                )
            } else {
                "{\"path\":null}".to_string()
            };

            let response = format!(
                "HTTP/1.1 200 OK\r\n\
                Content-Type: application/json\r\n\
                Access-Control-Allow-Origin: *\r\n\
                Content-Length: {}\r\n\
                \r\n\
                {}",
                body.len(),
                body,
            );
            let _ = stream.write_all(response.as_bytes()).await;
        });
    }
}
