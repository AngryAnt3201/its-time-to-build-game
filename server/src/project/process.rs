use std::path::Path;
use tokio::net::TcpStream;
use tokio::process::{Child, Command};
use tokio::time::{sleep, Duration};
use tracing::{info, warn};

/// A handle to a running dev server process.
pub struct DevServerProcess {
    child: Child,
    pub port: u16,
}

impl DevServerProcess {
    /// Kill the child process and wait for it to exit.
    pub async fn kill(&mut self) {
        info!("Killing dev server on port {}", self.port);
        if let Err(e) = self.child.kill().await {
            warn!("Failed to kill dev server on port {}: {}", self.port, e);
        }
    }
}

/// Spawn a Vite dev server inside `dir` on the given port.
/// Uses the project-local vite binary directly (node_modules/.bin/vite)
/// to ensure the correct working directory is used.
/// Waits for the server to actually accept connections before returning.
pub async fn start_dev_server(dir: &Path, port: u16) -> Result<DevServerProcess, String> {
    info!(
        "Starting dev server in {} on port {}",
        dir.display(),
        port
    );

    let port_str = port.to_string();

    // Use the project-local vite binary directly for reliable cwd handling.
    // Falls back to npx if the binary isn't found.
    let vite_bin = dir.join("node_modules").join(".bin").join("vite");
    let child = if vite_bin.exists() {
        Command::new(&vite_bin)
            .args(["--port", &port_str, "--host"])
            .current_dir(dir)
            .kill_on_drop(true)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn vite in {}: {}", dir.display(), e))?
    } else {
        Command::new("npx")
            .args(["vite", "--port", &port_str, "--host"])
            .current_dir(dir)
            .kill_on_drop(true)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn npx vite in {}: {}", dir.display(), e))?
    };

    // Wait for the server to accept TCP connections before reporting ready.
    let addr = format!("127.0.0.1:{}", port);
    let mut ready = false;
    for _ in 0..60 {
        sleep(Duration::from_millis(250)).await;
        if TcpStream::connect(&addr).await.is_ok() {
            ready = true;
            break;
        }
    }

    if !ready {
        warn!("Dev server on port {} did not become ready within 15s", port);
    } else {
        info!("Dev server on port {} is ready", port);
    }

    Ok(DevServerProcess { child, port })
}
