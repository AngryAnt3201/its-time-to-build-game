# Mistral Vibe Agent Sessions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make agents walk to buildings and spawn real Mistral Vibe CLI sessions in PTY processes, streamed to a terminal overlay on the client via xterm.js.

**Architecture:** Server spawns `vibe` CLI in a PTY per agent (via `portable-pty` crate), reads output in a background tokio task, and streams raw bytes to the client over a separate WebSocket message type. Client renders the terminal with xterm.js. A new `Walking` agent state handles the pathfinding phase before the session starts.

**Tech Stack:** Rust (portable-pty, tokio), TypeScript (xterm.js), WebSocket (msgpack binary)

---

### Task 1: Add `Walking` variant to AgentStateKind

**Files:**
- Modify: `server/src/protocol.rs:78-86` (AgentStateKind enum)
- Modify: `client/src/network/protocol.ts:73-80` (AgentStateKind type)
- Modify: `client/src/renderer/entities.ts:19-27` (AGENT_STATE_COLORS)

**Step 1: Add Walking to server protocol enum**

In `server/src/protocol.rs`, add `Walking` variant to `AgentStateKind`:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AgentStateKind {
    Idle,
    Walking,     // ← NEW: agent is walking toward assigned building
    Building,
    Erroring,
    Exploring,
    Defending,
    Critical,
    Unresponsive,
}
```

**Step 2: Add Walking to client protocol type**

In `client/src/network/protocol.ts`, update `AgentStateKind`:

```typescript
export type AgentStateKind =
  | "Idle"
  | "Walking"       // ← NEW
  | "Building"
  | "Erroring"
  | "Exploring"
  | "Defending"
  | "Critical"
  | "Unresponsive";
```

**Step 3: Add Walking color to entity renderer**

In `client/src/renderer/entities.ts`, add to `AGENT_STATE_COLORS`:

```typescript
const AGENT_STATE_COLORS: Record<AgentStateKind, number> = {
  Idle: 0xccaa44,
  Walking: 0x88ccff,   // ← NEW: light blue for walking
  Building: 0x44cc66,
  Erroring: 0xff6644,
  Exploring: 0x6688cc,
  Defending: 0xcc4444,
  Critical: 0xff0000,
  Unresponsive: 0x444444,
};
```

**Step 4: Build server to verify compilation**

Run: `cd server && cargo build 2>&1 | head -50`
Expected: compilation may show warnings about non-exhaustive match — we will fix those in later tasks.

**Step 5: Commit**

```bash
git add server/src/protocol.rs client/src/network/protocol.ts client/src/renderer/entities.ts
git commit -m "feat: add Walking state to agent state machine"
```

---

### Task 2: Implement Walking state in agent assignment + wander system

**Files:**
- Modify: `server/src/main.rs:302-361` (AssignAgentToProject handler)
- Modify: `server/src/game/agents.rs:194-201` (assign_task state mapping)
- Modify: `server/src/ecs/systems/agent_wander.rs:24-107` (wander system)
- Modify: `server/src/ecs/components.rs:154-162` (WanderState — add target field)

**Step 1: Add walk_target to WanderState**

In `server/src/ecs/components.rs`, add an optional walk target to `WanderState`:

```rust
#[derive(Debug, Clone)]
pub struct WanderState {
    pub home_x: f32,
    pub home_y: f32,
    pub waypoint_x: f32,
    pub waypoint_y: f32,
    pub pause_remaining: u32,
    pub wander_radius: f32,
    /// When set, the agent walks to this target and transitions to Building on arrival.
    pub walk_target: Option<(f32, f32)>,
}
```

**Step 2: Update assign_task to map Build → Walking**

In `server/src/game/agents.rs`, change the Build task mapping in `assign_task`:

```rust
let new_state = match task {
    TaskAssignment::Build => AgentStateKind::Walking,  // ← Changed from Building
    TaskAssignment::Explore => AgentStateKind::Exploring,
    TaskAssignment::Guard => AgentStateKind::Defending,
    TaskAssignment::Crank => AgentStateKind::Building,
    TaskAssignment::Idle => AgentStateKind::Idle,
};
```

**Step 3: Update AssignAgentToProject handler in main.rs**

In `server/src/main.rs`, the existing handler at line 302+ currently sets agent to Building and updates wander home. Change it to set `walk_target` instead:

Replace the block at lines 341-354 with:

```rust
// Set agent to Walking state (will walk to building, then transition to Building)
let _ = agents::assign_task(&mut world, agent_entity, TaskAssignment::Build);

// Set walk target to building position (agent walks there, then starts vibe)
if let Some((bx, by)) = building_pos {
    if let Ok(mut wander) = world.get::<&mut WanderState>(agent_entity) {
        wander.walk_target = Some((bx, by));
        wander.waypoint_x = bx;
        wander.waypoint_y = by;
        wander.pause_remaining = 0;
    }
}
```

**Step 4: Update agent_wander_system to handle Walking state**

In `server/src/ecs/systems/agent_wander.rs`, modify the system to:
1. Include `Walking` state in the filter (alongside Idle and Building)
2. For Walking agents: walk directly to `walk_target`, no pausing, no random waypoints
3. When Walking agent reaches target (within 16px): transition to Building, clear `walk_target`, set home to building pos, reduce wander_radius

```rust
const BUILDING_ARRIVAL_THRESHOLD: f32 = 16.0;

pub fn agent_wander_system(world: &mut World) {
    // Collect agents that should wander/walk
    let moveable_agents: Vec<(hecs::Entity, f32, AgentStateKind)> = world
        .query::<(&Agent, &AgentState, &AgentStats)>()
        .iter()
        .filter(|(_e, (_a, state, _stats))| {
            matches!(state.state, AgentStateKind::Idle | AgentStateKind::Building | AgentStateKind::Walking)
        })
        .map(|(e, (_a, state, stats))| (e, stats.speed, state.state))
        .collect();

    // Agents that need to transition from Walking -> Building
    let mut arrivals: Vec<hecs::Entity> = Vec::new();

    for (entity, speed, agent_state) in moveable_agents {
        // Walking agents: move directly toward walk_target, no pausing
        if agent_state == AgentStateKind::Walking {
            let Ok(wander) = world.get::<&WanderState>(entity) else { continue; };
            let Some((tx, ty)) = wander.walk_target else { continue; };
            drop(wander);

            let Ok(pos) = world.get::<&Position>(entity) else { continue; };
            let dx = tx - pos.x;
            let dy = ty - pos.y;
            let dist = (dx * dx + dy * dy).sqrt();
            drop(pos);

            if dist < BUILDING_ARRIVAL_THRESHOLD {
                arrivals.push(entity);
            } else {
                let walk_speed = BASE_WANDER_SPEED * speed;
                let nx = dx / dist;
                let ny = dy / dist;
                let vx = nx * walk_speed;
                let vy = ny * walk_speed;

                if let Ok(mut vel) = world.get::<&mut Velocity>(entity) {
                    vel.x = vx;
                    vel.y = vy;
                }
                if let Ok(mut pos) = world.get::<&mut Position>(entity) {
                    pos.x += vx;
                    pos.y += vy;
                }
            }
            continue;
        }

        // Existing idle/building wander logic (unchanged from current code)
        // ... (keep entire existing block)
    }

    // Transition arrived walkers to Building state
    for entity in arrivals {
        if let Ok(mut state) = world.get::<&mut AgentState>(entity) {
            state.state = AgentStateKind::Building;
        }
        if let Ok(mut wander) = world.get::<&mut WanderState>(entity) {
            if let Some((tx, ty)) = wander.walk_target {
                wander.home_x = tx;
                wander.home_y = ty;
                wander.wander_radius = 20.0;
            }
            wander.walk_target = None;
            wander.pause_remaining = 0;
        }
        if let Ok(mut vel) = world.get::<&mut Velocity>(entity) {
            vel.x = 0.0;
            vel.y = 0.0;
        }
    }
}
```

**Step 5: Update UnassignAgentFromProject handler**

In `server/src/main.rs`, the unassign handler at line 362+ should also clear `walk_target`:

```rust
PlayerAction::UnassignAgentFromProject { agent_id, building_id } => {
    project_manager.unassign_agent(building_id, *agent_id);

    if let Some(agent_entity) = hecs::Entity::from_bits(*agent_id) {
        let _ = agents::assign_task(&mut world, agent_entity, TaskAssignment::Idle);

        if let Ok(mut wander) = world.get::<&mut WanderState>(agent_entity) {
            wander.wander_radius = 120.0;
            wander.walk_target = None;  // ← Clear walk target
        }
    }
    // ...
}
```

**Step 6: Fix any exhaustive match warnings for Walking state**

Grep for `AgentStateKind::` across the server to find any match expressions that need the Walking variant. The `agent_tick_system` in `agent_tick.rs` should NOT tick Walking agents (they haven't started working yet). Add `AgentStateKind::Walking` to the `_ => {}` catch-all at line 45.

**Step 7: Update all WanderState initializations to include walk_target: None**

In `server/src/game/agents.rs` (recruit_agent, line 139) and any test helpers, add `walk_target: None` to the WanderState struct literal.

**Step 8: Build and test**

Run: `cd server && cargo build && cargo test 2>&1 | tail -30`
Expected: PASS

**Step 9: Commit**

```bash
git add server/src/main.rs server/src/game/agents.rs server/src/ecs/systems/agent_wander.rs server/src/ecs/components.rs
git commit -m "feat: agents walk to buildings before starting work"
```

---

### Task 3: Add `portable-pty` dependency and create VibeSession module

**Files:**
- Modify: `server/Cargo.toml` (add portable-pty)
- Create: `server/src/vibe/mod.rs`
- Create: `server/src/vibe/session.rs`
- Modify: `server/src/lib.rs` (add vibe module)

**Step 1: Add portable-pty to Cargo.toml**

In `server/Cargo.toml`, add under `[dependencies]`:

```toml
portable-pty = "0.8"
```

**Step 2: Create vibe module**

Create `server/src/vibe/mod.rs`:

```rust
pub mod session;
```

Update `server/src/lib.rs` to include:

```rust
pub mod vibe;
```

**Step 3: Create VibeSession**

Create `server/src/vibe/session.rs`:

```rust
use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem, MasterPty, Child};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;
use tracing::{info, error, warn};

#[derive(Debug, Clone, PartialEq)]
pub enum VibeSessionState {
    Starting,
    Running,
    Errored(String),
    Completed,
}

/// A single Mistral Vibe CLI session running in a PTY.
pub struct VibeSession {
    pub agent_id: u64,
    pub building_id: String,
    pub state: VibeSessionState,
    master: Option<Box<dyn MasterPty + Send>>,
    child: Option<Box<dyn Child + Send + Sync>>,
    /// Channel to send PTY output bytes to the network layer.
    output_tx: mpsc::UnboundedSender<Vec<u8>>,
    /// Reader thread handle.
    _reader_handle: Option<std::thread::JoinHandle<()>>,
}

impl VibeSession {
    /// Spawn a new Mistral Vibe CLI session in a PTY.
    ///
    /// - `working_dir`: The building's project directory
    /// - `model_id`: The Mistral model to use (from agent tier)
    /// - `max_turns`: Maximum CLI turns (from AgentVibeConfig)
    /// - `api_key`: The player's Mistral API key
    /// - `output_tx`: Channel to send PTY output for streaming to client
    pub fn spawn(
        agent_id: u64,
        building_id: String,
        working_dir: PathBuf,
        model_id: String,
        max_turns: u32,
        api_key: String,
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
        cmd.arg("--max-turns");
        cmd.arg(max_turns.to_string());
        cmd.env("MISTRAL_API_KEY", &api_key);
        // Set the model via environment (vibe respects MISTRAL_MODEL or config)
        cmd.env("MISTRAL_MODEL", &model_id);
        cmd.cwd(&working_dir);

        let child = pty_pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn vibe process: {}", e))?;

        // Read PTY output in a background thread (PTY I/O is blocking)
        let mut reader = pty_pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to clone PTY reader: {}", e))?;

        let tx = output_tx.clone();
        let reader_agent_id = agent_id;
        let reader_handle = std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break, // EOF
                    Ok(n) => {
                        if tx.send(buf[..n].to_vec()).is_err() {
                            break; // Channel closed
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
            "Vibe session spawned for agent {} on building {} (model: {}, max_turns: {})",
            agent_id, building_id, model_id, max_turns
        );

        Ok(Self {
            agent_id,
            building_id,
            state: VibeSessionState::Running,
            master: Some(pty_pair.master),
            child: Some(child),
            output_tx,
            _reader_handle: Some(reader_handle),
        })
    }

    /// Write input bytes to the PTY (player keyboard input).
    pub fn write_input(&mut self, data: &[u8]) -> Result<(), String> {
        if let Some(master) = &mut self.master {
            let mut writer = master
                .try_clone_writer()
                .map_err(|e| format!("Failed to clone PTY writer: {}", e))?;
            writer
                .write_all(data)
                .map_err(|e| format!("Failed to write to PTY: {}", e))?;
            Ok(())
        } else {
            Err("PTY master not available".to_string())
        }
    }

    /// Check if the child process has exited.
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
                Ok(None) => None, // Still running
                Err(e) => {
                    self.state = VibeSessionState::Errored(format!("Wait error: {}", e));
                    Some(false)
                }
            }
        } else {
            Some(false)
        }
    }

    /// Kill the PTY process.
    pub fn kill(&mut self) {
        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        self.master.take();
        self.state = VibeSessionState::Completed;
        info!("Vibe session killed for agent {}", self.agent_id);
    }
}

impl Drop for VibeSession {
    fn drop(&mut self) {
        self.kill();
    }
}
```

**Step 4: Build to verify**

Run: `cd server && cargo build 2>&1 | tail -20`
Expected: PASS (may need minor tweaks to imports)

**Step 5: Commit**

```bash
git add server/Cargo.toml server/src/lib.rs server/src/vibe/
git commit -m "feat: add VibeSession PTY management module"
```

---

### Task 4: Create VibeManager and integrate with game loop

**Files:**
- Create: `server/src/vibe/manager.rs`
- Modify: `server/src/vibe/mod.rs`
- Modify: `server/src/main.rs` (integrate VibeManager)

**Step 1: Create VibeManager**

Create `server/src/vibe/manager.rs`:

```rust
use std::collections::HashMap;
use std::path::PathBuf;
use tokio::sync::mpsc;
use tracing::{info, warn};

use super::session::{VibeSession, VibeSessionState};

/// Manages all active Vibe CLI sessions.
pub struct VibeManager {
    sessions: HashMap<u64, VibeSession>,
    /// API key provided by the player.
    api_key: Option<String>,
    /// Channel senders for PTY output, keyed by agent_id.
    /// The receiver side is polled in the game loop to forward to WebSocket.
    output_receivers: HashMap<u64, mpsc::UnboundedReceiver<Vec<u8>>>,
}

impl VibeManager {
    pub fn new() -> Self {
        Self {
            sessions: HashMap::new(),
            api_key: None,
            output_receivers: HashMap::new(),
        }
    }

    pub fn set_api_key(&mut self, key: String) {
        self.api_key = Some(key);
        info!("Mistral API key set");
    }

    pub fn has_api_key(&self) -> bool {
        self.api_key.as_ref().map_or(false, |k| !k.is_empty())
    }

    /// Spawn a vibe session for an agent that has arrived at its building.
    pub fn start_session(
        &mut self,
        agent_id: u64,
        building_id: String,
        working_dir: PathBuf,
        model_id: String,
        max_turns: u32,
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
            model_id,
            max_turns,
            api_key,
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

    /// Kill and remove a session (on unassign, error, etc).
    pub fn kill_session(&mut self, agent_id: u64) {
        if let Some(mut session) = self.sessions.remove(&agent_id) {
            session.kill();
        }
        self.output_receivers.remove(&agent_id);
        info!("Vibe session removed for agent {}", agent_id);
    }

    /// Check all sessions for process exits. Returns list of (agent_id, success).
    pub fn poll_exits(&mut self) -> Vec<(u64, bool)> {
        let mut finished = Vec::new();
        for (agent_id, session) in &mut self.sessions {
            if let Some(success) = session.try_wait() {
                finished.push((*agent_id, success));
            }
        }
        // Remove finished sessions
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

    /// Check if an agent has an active session.
    pub fn has_session(&self, agent_id: u64) -> bool {
        self.sessions.contains_key(&agent_id)
    }

    /// Kill all sessions.
    pub fn kill_all(&mut self) {
        let ids: Vec<u64> = self.sessions.keys().cloned().collect();
        for id in ids {
            self.kill_session(id);
        }
    }
}
```

**Step 2: Update vibe/mod.rs**

```rust
pub mod manager;
pub mod session;
```

**Step 3: Add new protocol messages**

In `server/src/protocol.rs`, add new types for vibe I/O:

```rust
/// Separate server-to-client message for real-time vibe terminal output.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ServerMessage {
    /// Normal game state update (20Hz).
    GameState(GameStateUpdate),
    /// Real-time PTY output from a vibe session.
    VibeOutput { agent_id: u64, data: Vec<u8> },
    /// Vibe session lifecycle event.
    VibeSessionStarted { agent_id: u64 },
    VibeSessionEnded { agent_id: u64, reason: String },
}
```

Add new `PlayerAction` variants:

```rust
// In the PlayerAction enum, add:
VibeInput { agent_id: u64, data: String },
SetMistralApiKey { key: String },
```

**Step 4: Update server network layer to support ServerMessage**

In `server/src/network/server.rs`, add a method to send arbitrary `ServerMessage`:

```rust
/// Send a ServerMessage (for vibe output, events, etc).
pub fn send_message(&mut self, msg: &ServerMessage) {
    if let Some(tx) = &self.client_tx {
        match rmp_serde::to_vec_named(msg) {
            Ok(bytes) => {
                if tx.send(bytes).is_err() {
                    warn!("Client disconnected — stopping sends");
                    self.client_tx = None;
                }
            }
            Err(e) => {
                error!("Failed to serialize ServerMessage: {}", e);
            }
        }
    }
}
```

Change `send_state` to wrap in `ServerMessage::GameState`:

```rust
pub fn send_state(&mut self, update: &GameStateUpdate) {
    let msg = ServerMessage::GameState(update.clone());
    self.send_message(&msg);
}
```

**Step 5: Integrate VibeManager into game loop**

In `server/src/main.rs`:

1. Import vibe manager: `use its_time_to_build_server::vibe::manager::VibeManager;`
2. Create manager after project_manager: `let mut vibe_manager = VibeManager::new();`
3. Handle `SetMistralApiKey` action: `vibe_manager.set_api_key(key.clone());`
4. Handle `VibeInput` action: `vibe_manager.send_input(*agent_id, data.as_bytes());`
5. After agent_wander_system, detect newly-arrived agents (Walking→Building transitions) and spawn vibe sessions
6. Poll vibe exits and drain output in the game loop, send via `server.send_message()`
7. Kill vibe sessions when agents are unassigned or enter Erroring state

Add after agent_wander_system (line ~451):

```rust
// ── 7d. Vibe session management ─────────────────────────────
// Spawn sessions for agents that just arrived at buildings
for (id, (state, vibe_config)) in world
    .query_mut::<hecs::With<(&AgentState, &AgentVibeConfig), &Agent>>()
{
    if state.state == AgentStateKind::Building && !vibe_manager.has_session(id.to_bits()) {
        if let Some(base) = project_manager.base_dir.as_ref() {
            // Find which building this agent is assigned to
            for (bid, agents) in &project_manager.agent_assignments {
                if agents.contains(&id.to_bits()) {
                    if let Some(building) = project_manager.manifest.get_building(bid) {
                        let work_dir = base.join(&building.directory_name);
                        if work_dir.exists() {
                            match vibe_manager.start_session(
                                id.to_bits(),
                                bid.clone(),
                                work_dir,
                                vibe_config.model_id.clone(),
                                vibe_config.max_turns,
                            ) {
                                Ok(()) => {
                                    debug_log_entries.push(format!(
                                        "[vibe] session started for agent {} on {}",
                                        id.to_bits(), bid
                                    ));
                                    server.send_message(&ServerMessage::VibeSessionStarted {
                                        agent_id: id.to_bits(),
                                    });
                                }
                                Err(e) => {
                                    debug_log_entries.push(format!(
                                        "[vibe] failed to start session: {}", e
                                    ));
                                }
                            }
                        }
                    }
                    break;
                }
            }
        }
    }
}

// Drain vibe output and send to client
for (agent_id, data) in vibe_manager.drain_output() {
    server.send_message(&ServerMessage::VibeOutput { agent_id, data });
}

// Poll for finished sessions
for (agent_id, _success) in vibe_manager.poll_exits() {
    server.send_message(&ServerMessage::VibeSessionEnded {
        agent_id,
        reason: "Session completed".to_string(),
    });
}
```

Also, in the unassign handler, kill the vibe session:

```rust
// After project_manager.unassign_agent():
vibe_manager.kill_session(*agent_id);
```

And in the erroring transition in agent_tick, add killing:

This requires making vibe_manager accessible to agent_tick or handling it in main.rs after agent_tick returns the to_error list. Since agent_tick returns log entries, we can check for agents that just entered Erroring state. The simplest approach: after agent_tick runs, iterate agents in Erroring state and kill any sessions they have.

**Step 6: Build and test**

Run: `cd server && cargo build 2>&1 | tail -30`
Expected: PASS

**Step 7: Commit**

```bash
git add server/src/vibe/ server/src/protocol.rs server/src/network/server.rs server/src/main.rs
git commit -m "feat: VibeManager spawns PTY sessions for agents at buildings"
```

---

### Task 5: Update client protocol and Connection to handle ServerMessage

**Files:**
- Modify: `client/src/network/protocol.ts` (add ServerMessage, new actions)
- Modify: `client/src/network/connection.ts` (decode ServerMessage, add callbacks)

**Step 1: Add ServerMessage types to client protocol**

In `client/src/network/protocol.ts`, add:

```typescript
// ── Server → Client message wrapper ────────────────────────────
// The server now wraps all messages in a ServerMessage envelope.

export type ServerMessage =
  | { GameState: GameStateUpdate }
  | { VibeOutput: { agent_id: number; data: number[] } }
  | { VibeSessionStarted: { agent_id: number } }
  | { VibeSessionEnded: { agent_id: number; reason: string } };
```

Add new PlayerAction variants:

```typescript
// Add to the PlayerAction union:
  | { VibeInput: { agent_id: number; data: string } }
  | { SetMistralApiKey: { key: string } }
```

**Step 2: Update Connection to decode ServerMessage**

In `client/src/network/connection.ts`, update the message handler to decode `ServerMessage` instead of raw `GameStateUpdate`:

```typescript
import type { GameStateUpdate, PlayerInput, ServerMessage } from './protocol';

export class Connection {
  private ws: WebSocket;
  private stateCallback: ((state: GameStateUpdate) => void) | null = null;
  private vibeOutputCallback: ((agentId: number, data: Uint8Array) => void) | null = null;
  private vibeSessionCallback: ((event: { type: 'started' | 'ended'; agentId: number; reason?: string }) => void) | null = null;
  // ... existing fields ...

  // In the message handler:
  this.ws.addEventListener('message', (event: MessageEvent) => {
    if (event.data instanceof ArrayBuffer) {
      try {
        const msg = decode(new Uint8Array(event.data)) as ServerMessage;

        if ('GameState' in msg) {
          if (this.stateCallback) {
            this.stateCallback(msg.GameState);
          }
        } else if ('VibeOutput' in msg) {
          if (this.vibeOutputCallback) {
            this.vibeOutputCallback(
              msg.VibeOutput.agent_id,
              new Uint8Array(msg.VibeOutput.data),
            );
          }
        } else if ('VibeSessionStarted' in msg) {
          if (this.vibeSessionCallback) {
            this.vibeSessionCallback({
              type: 'started',
              agentId: msg.VibeSessionStarted.agent_id,
            });
          }
        } else if ('VibeSessionEnded' in msg) {
          if (this.vibeSessionCallback) {
            this.vibeSessionCallback({
              type: 'ended',
              agentId: msg.VibeSessionEnded.agent_id,
              reason: msg.VibeSessionEnded.reason,
            });
          }
        }
      } catch (err) {
        console.error('[network] Failed to decode ServerMessage:', err);
      }
    }
  });

  /** Register callback for vibe terminal output. */
  onVibeOutput(callback: (agentId: number, data: Uint8Array) => void): void {
    this.vibeOutputCallback = callback;
  }

  /** Register callback for vibe session lifecycle events. */
  onVibeSession(callback: (event: { type: 'started' | 'ended'; agentId: number; reason?: string }) => void): void {
    this.vibeSessionCallback = callback;
  }
}
```

**Step 3: Commit**

```bash
git add client/src/network/
git commit -m "feat: client handles ServerMessage envelope with vibe events"
```

---

### Task 6: Install xterm.js and create TerminalOverlay component

**Files:**
- Modify: `client/package.json` (add @xterm/xterm, @xterm/addon-fit)
- Create: `client/src/ui/terminal-overlay.ts`

**Step 1: Install xterm.js**

Run: `cd client && npm install @xterm/xterm @xterm/addon-fit`

**Step 2: Create TerminalOverlay component**

Create `client/src/ui/terminal-overlay.ts`:

```typescript
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export interface TerminalOverlayCallbacks {
  onInput: (agentId: number, data: string) => void;
}

interface TerminalInstance {
  terminal: Terminal;
  fitAddon: FitAddon;
  agentId: number;
  buildingId: string;
  agentName: string;
  buildingName: string;
}

/**
 * Terminal overlay that renders Mistral Vibe CLI output.
 *
 * - Hover to peek: small read-only preview near entity
 * - Click to pin: larger interactive terminal
 * - Positioned near the agent/building in world space
 */
export class TerminalOverlay {
  private container: HTMLDivElement;
  private header: HTMLDivElement;
  private titleEl: HTMLSpanElement;
  private statusEl: HTMLSpanElement;
  private closeBtn: HTMLButtonElement;
  private terminalEl: HTMLDivElement;
  private callbacks: TerminalOverlayCallbacks;

  private instances: Map<number, TerminalInstance> = new Map();
  private activeAgentId: number | null = null;
  private pinned = false;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  visible = false;

  constructor(callbacks: TerminalOverlayCallbacks) {
    this.callbacks = callbacks;

    // Root container
    this.container = document.createElement('div');
    this.container.id = 'terminal-overlay';
    this.container.style.cssText = `
      display: none;
      position: fixed;
      z-index: 1100;
      background: #0d0d0d;
      border: 1px solid #333;
      border-radius: 6px;
      overflow: hidden;
      font-family: 'IBM Plex Mono', monospace;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.8);
      transition: opacity 0.15s ease;
    `;

    // Header bar
    this.header = document.createElement('div');
    this.header.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 8px;
      background: #1a1a1a;
      border-bottom: 1px solid #333;
      cursor: pointer;
      user-select: none;
    `;

    this.titleEl = document.createElement('span');
    this.titleEl.style.cssText = 'color: #aaa; font-size: 11px; flex: 1;';

    this.statusEl = document.createElement('span');
    this.statusEl.style.cssText = 'font-size: 9px; padding: 1px 6px; border-radius: 3px; background: #1a2e1a; color: #4a8;';
    this.statusEl.textContent = 'running';

    this.closeBtn = document.createElement('button');
    this.closeBtn.textContent = 'x';
    this.closeBtn.style.cssText = `
      background: none;
      border: none;
      color: #666;
      font-size: 12px;
      cursor: pointer;
      padding: 0 4px;
      font-family: 'IBM Plex Mono', monospace;
    `;
    this.closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.unpin();
    });

    this.header.appendChild(this.titleEl);
    this.header.appendChild(this.statusEl);
    this.header.appendChild(this.closeBtn);

    // Terminal container
    this.terminalEl = document.createElement('div');
    this.terminalEl.style.cssText = 'width: 100%; height: calc(100% - 28px);';

    this.container.appendChild(this.header);
    this.container.appendChild(this.terminalEl);

    // Click header to pin
    this.header.addEventListener('click', () => {
      if (!this.pinned) {
        this.pin();
      }
    });

    // Hover behavior
    this.container.addEventListener('mouseenter', () => {
      this.cancelScheduledHide();
    });
    this.container.addEventListener('mouseleave', () => {
      if (!this.pinned) {
        this.scheduleHide();
      }
    });

    document.body.appendChild(this.container);
  }

  /** Get or create a terminal instance for an agent. */
  private getOrCreateInstance(agentId: number, buildingId: string, agentName: string, buildingName: string): TerminalInstance {
    let instance = this.instances.get(agentId);
    if (!instance) {
      const terminal = new Terminal({
        rows: 24,
        cols: 80,
        theme: {
          background: '#0d0d0d',
          foreground: '#cccccc',
          cursor: '#d4a017',
          selectionBackground: '#333333',
        },
        fontSize: 12,
        fontFamily: "'IBM Plex Mono', monospace",
        cursorBlink: true,
        scrollback: 5000,
        convertEol: true,
      });

      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);

      // Forward user input to the server
      terminal.onData((data) => {
        if (this.pinned) {
          this.callbacks.onInput(agentId, data);
        }
      });

      instance = { terminal, fitAddon, agentId, buildingId, agentName, buildingName };
      this.instances.set(agentId, instance);
    }
    return instance;
  }

  /** Write PTY output to an agent's terminal. */
  writeOutput(agentId: number, data: Uint8Array): void {
    const instance = this.instances.get(agentId);
    if (instance) {
      instance.terminal.write(data);
    }
  }

  /** Show the terminal for an agent (hover peek mode). */
  showPeek(agentId: number, buildingId: string, agentName: string, buildingName: string, screenX: number, screenY: number): void {
    if (this.pinned && this.activeAgentId === agentId) return; // Already pinned to this agent
    if (this.pinned) return; // Don't interrupt a pinned terminal

    this.cancelScheduledHide();

    const instance = this.getOrCreateInstance(agentId, buildingId, agentName, buildingName);
    this.activeAgentId = agentId;

    // Set peek size
    this.container.style.width = '400px';
    this.container.style.height = '250px';
    this.container.style.opacity = '0.85';
    this.container.style.pointerEvents = 'auto';

    // Position near entity
    this.container.style.left = `${screenX}px`;
    this.container.style.top = `${screenY}px`;
    this.container.style.transform = 'translateX(-50%)';

    this.titleEl.textContent = `${agentName} → ${buildingName}`;

    // Mount terminal if not already
    if (!instance.terminal.element) {
      this.terminalEl.innerHTML = '';
      instance.terminal.open(this.terminalEl);
      instance.fitAddon.fit();
    } else if (instance.terminal.element.parentElement !== this.terminalEl) {
      this.terminalEl.innerHTML = '';
      this.terminalEl.appendChild(instance.terminal.element);
      instance.fitAddon.fit();
    }

    this.container.style.display = 'block';
    this.visible = true;
  }

  /** Pin the terminal (interactive mode). */
  pin(): void {
    this.pinned = true;
    this.container.style.width = '700px';
    this.container.style.height = '450px';
    this.container.style.opacity = '1';

    const instance = this.activeAgentId !== null ? this.instances.get(this.activeAgentId) : null;
    if (instance) {
      // Re-fit to new size
      requestAnimationFrame(() => instance.fitAddon.fit());
      instance.terminal.focus();
    }
  }

  /** Unpin (close) the terminal. */
  unpin(): void {
    this.pinned = false;
    this.container.style.display = 'none';
    this.visible = false;
    this.activeAgentId = null;
  }

  /** Update position (follows camera). */
  updatePosition(screenX: number, screenY: number): void {
    if (!this.pinned) {
      this.container.style.left = `${screenX}px`;
      this.container.style.top = `${screenY}px`;
    }
  }

  /** Mark a session as ended. */
  sessionEnded(agentId: number, reason: string): void {
    const instance = this.instances.get(agentId);
    if (instance) {
      instance.terminal.write(`\r\n\x1b[33m[session ended: ${reason}]\x1b[0m\r\n`);
    }
    if (this.activeAgentId === agentId) {
      this.statusEl.textContent = 'ended';
      this.statusEl.style.background = '#2e1a1a';
      this.statusEl.style.color = '#c44';
    }
  }

  /** Remove a session instance (agent despawned or fully done). */
  removeSession(agentId: number): void {
    const instance = this.instances.get(agentId);
    if (instance) {
      instance.terminal.dispose();
      this.instances.delete(agentId);
    }
    if (this.activeAgentId === agentId) {
      this.unpin();
    }
  }

  private scheduleHide(): void {
    if (this.hideTimer) return;
    this.hideTimer = setTimeout(() => {
      this.hideTimer = null;
      if (!this.pinned) {
        this.container.style.display = 'none';
        this.visible = false;
        this.activeAgentId = null;
      }
    }, 500);
  }

  private cancelScheduledHide(): void {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }

  destroy(): void {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    for (const instance of this.instances.values()) {
      instance.terminal.dispose();
    }
    this.container.remove();
  }
}
```

**Step 3: Commit**

```bash
git add client/package.json client/package-lock.json client/src/ui/terminal-overlay.ts
git commit -m "feat: xterm.js terminal overlay component for vibe sessions"
```

---

### Task 7: Wire TerminalOverlay into main.tsx

**Files:**
- Modify: `client/src/main.tsx`

**Step 1: Import and instantiate TerminalOverlay**

Add import near top of `client/src/main.tsx`:

```typescript
import { TerminalOverlay } from './ui/terminal-overlay';
import { getApiKey } from './utils/api-keys';
```

After `buildingToolbar` creation (around line 145), add:

```typescript
const terminalOverlay = new TerminalOverlay({
  onInput: (agentId, data) => {
    connectionRef?.sendInput({
      tick: clientTickRef,
      movement: { x: 0, y: 0 },
      action: { VibeInput: { agent_id: agentId, data } },
      target: null,
    });
  },
});
```

**Step 2: Send Mistral API key to server on startup**

After the existing `SetProjectDirectory` send (around line 265), add:

```typescript
// Send Mistral API key to server for vibe sessions
const mistralKey = getApiKey('mistral');
if (mistralKey) {
  connection.sendInput({
    tick: 0,
    movement: { x: 0, y: 0 },
    action: { SetMistralApiKey: { key: mistralKey } },
    target: null,
  });
}
```

**Step 3: Register vibe output and session callbacks on connection**

After `connection.onState(...)` (around line 260):

```typescript
// Vibe terminal output → write to terminal overlay
connection.onVibeOutput((agentId, data) => {
  terminalOverlay.writeOutput(agentId, data);
});

// Vibe session events
connection.onVibeSession((event) => {
  if (event.type === 'started') {
    console.log(`[vibe] Session started for agent ${event.agentId}`);
  } else if (event.type === 'ended') {
    terminalOverlay.sessionEnded(event.agentId, event.reason ?? 'unknown');
  }
});
```

**Step 4: Show terminal overlay on hover over building agents**

In the existing `window.addEventListener('mousemove', ...)` handler (around line 418), after checking for buildings, also check for agents in Building state that have vibe sessions. When hovering near a building-assigned agent, show the terminal peek:

```typescript
// After the nearestBuildingId check, also look for building-state agents near cursor
if (nearestBuildingId !== null) {
  // ... existing building toolbar code ...

  // Also check if this building has agents with vibe sessions
  const bid = buildingTypeToId(nearestBuildingType);
  const assignments = latestState?.project_manager?.agent_assignments?.[bid] ?? [];
  if (assignments.length > 0) {
    const firstAgentId = assignments[0];
    const agentEntity = entityMap.get(firstAgentId);
    const agentData = agentEntity ? (agentEntity.data as { Agent?: { name: string; state: string } }).Agent : null;
    if (agentData && agentData.state === 'Building') {
      const screenBx = nearestBx * ZOOM + worldContainer.x;
      const screenBy = nearestBy * ZOOM + worldContainer.y - 40 * ZOOM; // Above the building
      const name = buildingTypeToName(nearestBuildingType);
      terminalOverlay.showPeek(firstAgentId, bid, agentData.name, name, screenBx, screenBy);
    }
  }
}
```

**Step 5: Add terminal overlay to menuBlocking check**

Update the `menuBlocking` variable to include the pinned terminal:

```typescript
const menuBlocking = buildMenu.visible || upgradeTree.visible || grimoire.visible || debugPanel.visible || minimap.expanded || buildingPanel.visible || terminalOverlay.visible;
```

Actually, we probably don't want the terminal to block movement — the player should still be able to move while watching the terminal. Keep it out of menuBlocking. But we should close it on Escape:

In the keydown handler, add before the build menu handling:

```typescript
// ── Terminal overlay key handling ─────────────────────────────
if (terminalOverlay.visible && key === 'escape') {
  terminalOverlay.unpin();
  return;
}
```

**Step 6: Commit**

```bash
git add client/src/main.tsx
git commit -m "feat: wire terminal overlay into game loop with vibe I/O"
```

---

### Task 8: Handle error state → kill vibe session

**Files:**
- Modify: `server/src/main.rs` (after agent_tick, kill sessions for erroring agents)

**Step 1: After agent_tick_system, check for newly-erroring agents and kill their sessions**

After `agent_tick_result` is computed (around line 448), add:

```rust
// Kill vibe sessions for agents that just entered Erroring state
for (id, state) in world
    .query::<hecs::With<&AgentState, &Agent>>()
    .iter()
{
    if state.state == AgentStateKind::Erroring && vibe_manager.has_session(id.to_bits()) {
        vibe_manager.kill_session(id.to_bits());
        server.send_message(&ServerMessage::VibeSessionEnded {
            agent_id: id.to_bits(),
            reason: "Agent errored — context limit reached".to_string(),
        });
    }
}
```

**Step 2: Build and test**

Run: `cd server && cargo build && cargo test 2>&1 | tail -20`
Expected: PASS

**Step 3: Commit**

```bash
git add server/src/main.rs
git commit -m "feat: kill vibe session when agent enters Erroring state"
```

---

### Task 9: End-to-end test and polish

**Files:**
- Various small fixes across client and server

**Step 1: Verify the full flow manually**

1. Start the server: `cd server && cargo run`
2. Start the client: `cd client && npm run dev`
3. Enter Mistral API key in Settings
4. Place a building (e.g. Todo App)
5. Recruit an agent
6. Assign agent to building
7. Watch agent walk to building
8. See terminal overlay appear on hover
9. Click to pin terminal
10. Type a prompt (e.g. "build a todo app")
11. Watch the vibe CLI output stream in real-time

**Step 2: Fix any issues found during testing**

Common things to check:
- Does the agent stop at the building correctly?
- Does the terminal overlay position correctly near the building?
- Does input from the terminal reach the vibe CLI?
- Does Escape close the pinned terminal?
- Does unassigning an agent kill the session?
- Does the error state kill the session?

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: Mistral Vibe agent sessions with PTY terminals"
```
