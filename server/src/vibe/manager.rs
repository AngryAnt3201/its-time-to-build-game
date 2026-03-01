use std::collections::HashMap;
use std::path::PathBuf;
use tokio::sync::mpsc;
use tracing::info;

use super::session::VibeSession;

/// Manages all active Vibe CLI sessions.
pub struct VibeManager {
    sessions: HashMap<u64, VibeSession>,
    api_key: Option<String>,
    output_receivers: HashMap<u64, mpsc::UnboundedReceiver<Vec<u8>>>,
    /// Tracks agents whose session spawn failed, so we don't retry every tick.
    failed_spawns: std::collections::HashSet<u64>,
}

impl VibeManager {
    pub fn new() -> Self {
        let api_key = std::env::var("MISTRAL_API_KEY").ok().filter(|k| !k.is_empty());
        if api_key.is_some() {
            info!("Using MISTRAL_API_KEY from environment");
        }
        Self {
            sessions: HashMap::new(),
            api_key,
            output_receivers: HashMap::new(),
            failed_spawns: std::collections::HashSet::new(),
        }
    }

    pub fn set_api_key(&mut self, key: String) {
        self.api_key = Some(key);
        info!("Mistral API key set");
    }

    pub fn has_api_key(&self) -> bool {
        self.api_key.as_ref().map_or(false, |k| !k.is_empty())
    }

    /// Spawn a vibe session for an agent at its building.
    pub fn start_session(
        &mut self,
        agent_id: u64,
        building_id: String,
        working_dir: PathBuf,
        vibe_agent_name: String,
        max_turns: u32,
        enabled_tools: Vec<String>,
    ) -> Result<(), String> {
        let api_key = self
            .api_key
            .as_ref()
            .ok_or_else(|| "No Mistral API key set".to_string())?
            .clone();

        if self.sessions.contains_key(&agent_id) {
            return Err(format!("Session already exists for agent {}", agent_id));
        }

        let (output_tx, output_rx) = mpsc::unbounded_channel();

        let session = VibeSession::spawn(
            agent_id,
            building_id,
            working_dir,
            vibe_agent_name,
            max_turns,
            api_key,
            enabled_tools,
            output_tx,
        )?;

        self.sessions.insert(agent_id, session);
        self.output_receivers.insert(agent_id, output_rx);

        Ok(())
    }

    /// Send player keyboard input to an agent's vibe session.
    pub fn send_input(&mut self, agent_id: u64, data: &[u8]) -> Result<(), String> {
        let session = self
            .sessions
            .get_mut(&agent_id)
            .ok_or_else(|| format!("No session for agent {}", agent_id))?;
        session.write_input(data)
    }

    /// Kill and remove a session.
    pub fn kill_session(&mut self, agent_id: u64) {
        if let Some(mut session) = self.sessions.remove(&agent_id) {
            session.kill();
        }
        self.output_receivers.remove(&agent_id);
        info!("Vibe session removed for agent {}", agent_id);
    }

    /// Check for exited sessions. Returns (agent_id, success).
    pub fn poll_exits(&mut self) -> Vec<(u64, bool)> {
        let mut finished = Vec::new();
        for (agent_id, session) in &mut self.sessions {
            if let Some(success) = session.try_wait() {
                finished.push((*agent_id, success));
            }
        }
        for (agent_id, _) in &finished {
            self.sessions.remove(agent_id);
            self.output_receivers.remove(agent_id);
        }
        finished
    }

    /// Drain all pending PTY output. Returns Vec of (agent_id, bytes).
    pub fn drain_output(&mut self) -> Vec<(u64, Vec<u8>)> {
        let mut results = Vec::new();
        for (agent_id, rx) in &mut self.output_receivers {
            while let Ok(bytes) = rx.try_recv() {
                results.push((*agent_id, bytes));
            }
        }
        results
    }

    pub fn has_session(&self, agent_id: u64) -> bool {
        self.sessions.contains_key(&agent_id)
    }

    /// Returns true if a session spawn previously failed for this agent.
    pub fn has_failed(&self, agent_id: u64) -> bool {
        self.failed_spawns.contains(&agent_id)
    }

    /// Mark a session spawn as failed so we don't retry every tick.
    pub fn mark_failed(&mut self, agent_id: u64) {
        self.failed_spawns.insert(agent_id);
    }

    /// Clear the failed-spawn flag (e.g. when agent is unassigned and could be reassigned later).
    pub fn clear_failed(&mut self, agent_id: u64) {
        self.failed_spawns.remove(&agent_id);
    }

    pub fn kill_all(&mut self) {
        let ids: Vec<u64> = self.sessions.keys().cloned().collect();
        for id in ids {
            self.kill_session(id);
        }
    }
}
