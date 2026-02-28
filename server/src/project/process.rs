use std::path::Path;
use tokio::process::{Child, Command};
use tracing::{info, warn};

/// A handle to a running dev server process (npm run dev).
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

/// Spawn `npm run dev -- --port {port} --host` inside `dir`.
/// The child is configured with `kill_on_drop(true)` so it will be
/// automatically cleaned up if the handle is dropped.
pub async fn start_dev_server(dir: &Path, port: u16) -> Result<DevServerProcess, String> {
    info!(
        "Starting dev server in {} on port {}",
        dir.display(),
        port
    );

    let child = Command::new("npm")
        .args(["run", "dev", "--", "--port", &port.to_string(), "--host"])
        .current_dir(dir)
        .kill_on_drop(true)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn dev server in {}: {}", dir.display(), e))?;

    Ok(DevServerProcess { child, port })
}
