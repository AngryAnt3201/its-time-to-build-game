use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem, Child};
use std::io::{Read, Write};
use std::path::PathBuf;
use tokio::sync::mpsc;
use tracing::{info, warn};

#[derive(Debug, Clone, PartialEq)]
pub enum VibeSessionState {
    Running,
    Errored(String),
    Completed,
}

/// A single Mistral Vibe CLI session running in a PTY.
pub struct VibeSession {
    pub agent_id: u64,
    pub building_id: String,
    pub state: VibeSessionState,
    writer: Option<Box<dyn Write + Send>>,
    child: Option<Box<dyn Child + Send + Sync>>,
    reader_handle: Option<std::thread::JoinHandle<()>>,
}

impl VibeSession {
    /// Spawn a new Mistral Vibe CLI session in a PTY.
    pub fn spawn(
        agent_id: u64,
        building_id: String,
        working_dir: PathBuf,
        vibe_agent_name: String,
        max_turns: u32,
        api_key: String,
        enabled_tools: Vec<String>,
        output_tx: mpsc::UnboundedSender<Vec<u8>>,
    ) -> Result<Self, String> {
        let pty_system = NativePtySystem::default();

        let pty_pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to open PTY: {}", e))?;

        let mut cmd = CommandBuilder::new("vibe");
        cmd.arg("--agent");
        cmd.arg(&vibe_agent_name);
        cmd.arg("--max-turns");
        cmd.arg(max_turns.to_string());
        for tool in &enabled_tools {
            cmd.arg("--enabled-tools");
            cmd.arg(tool);
        }
        cmd.env("MISTRAL_API_KEY", &api_key);
        cmd.cwd(&working_dir);

        let child = pty_pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn vibe process: {}", e))?;

        // Read PTY output in a background thread (blocking I/O)
        let mut reader = pty_pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to clone PTY reader: {}", e))?;

        let reader_agent_id = agent_id;
        let reader_handle = std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        if output_tx.send(buf[..n].to_vec()).is_err() {
                            break;
                        }
                    }
                    Err(e) => {
                        warn!("PTY read error for agent {}: {}", reader_agent_id, e);
                        break;
                    }
                }
            }
        });

        info!(
            "Vibe session spawned for agent {} on building {} (agent: {}, max_turns: {}, tools: {:?})",
            agent_id, building_id, vibe_agent_name, max_turns, enabled_tools
        );

        // Take the writer once and store it for reuse
        let writer = pty_pair
            .master
            .take_writer()
            .map_err(|e| format!("Failed to take PTY writer: {}", e))?;

        // We no longer need the master (reader was cloned, writer was taken)
        drop(pty_pair.master);

        Ok(Self {
            agent_id,
            building_id,
            state: VibeSessionState::Running,
            writer: Some(writer),
            child: Some(child),
            reader_handle: Some(reader_handle),
        })
    }

    /// Write input bytes to the PTY stdin.
    pub fn write_input(&mut self, data: &[u8]) -> Result<(), String> {
        if let Some(writer) = &mut self.writer {
            writer
                .write_all(data)
                .map_err(|e| format!("Failed to write to PTY: {}", e))?;
            Ok(())
        } else {
            Err("PTY writer not available".to_string())
        }
    }

    /// Check if the child process has exited. Returns Some(success) if exited.
    pub fn try_wait(&mut self) -> Option<bool> {
        if let Some(child) = &mut self.child {
            match child.try_wait() {
                Ok(Some(status)) => {
                    self.state = if status.success() {
                        VibeSessionState::Completed
                    } else {
                        VibeSessionState::Errored("Process exited with error".to_string())
                    };
                    Some(status.success())
                }
                Ok(None) => None,
                Err(e) => {
                    self.state = VibeSessionState::Errored(format!("Wait error: {}", e));
                    Some(false)
                }
            }
        } else {
            Some(false)
        }
    }

    /// Kill the PTY process and join the reader thread.
    pub fn kill(&mut self) {
        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        // Drop writer to unblock the reader thread (EOF on PTY)
        self.writer.take();
        // Join the reader thread so it doesn't leak
        if let Some(handle) = self.reader_handle.take() {
            let _ = handle.join();
        }
        self.state = VibeSessionState::Completed;
        info!("Vibe session killed for agent {}", self.agent_id);
    }
}

impl Drop for VibeSession {
    fn drop(&mut self) {
        self.kill();
    }
}
