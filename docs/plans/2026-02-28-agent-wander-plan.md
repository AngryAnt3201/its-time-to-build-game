# Agent Wander System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add autonomous wandering behavior for idle agents — walk-pause-walk pattern within ~120px of home position, tier-based speed.

**Architecture:** New `WanderState` ECS component + new `agent_wander` system that runs each tick on idle agents. Follows the existing rogue AI movement pattern (collect → process → update position).

**Tech Stack:** Rust, hecs ECS, rand crate (already in use)

---

### Task 1: Add WanderState component

**Files:**
- Modify: `server/src/ecs/components.rs:96` (Agent Components section)

**Step 1: Add the WanderState struct after AgentVibeConfig (after line 152)**

Add this after the `AgentVibeConfig` struct and before the `Assignment` struct:

```rust
#[derive(Debug, Clone)]
pub struct WanderState {
    pub home_x: f32,
    pub home_y: f32,
    pub waypoint_x: f32,
    pub waypoint_y: f32,
    pub pause_remaining: u32,
    pub wander_radius: f32,
}
```

**Step 2: Verify it compiles**

Run: `cd server && cargo check`
Expected: compiles with no errors (component is defined but unused — warning is fine)

**Step 3: Commit**

```
git add server/src/ecs/components.rs
git commit -m "feat: add WanderState component for idle agent wandering"
```

---

### Task 2: Add WanderState to agent spawn bundle

**Files:**
- Modify: `server/src/game/agents.rs:132-156` (the `world.spawn((...))` tuple)

**Step 1: Add the import**

At the top of `server/src/game/agents.rs`, the existing import line includes components from `crate::ecs::components`. Add `WanderState` to that import.

**Step 2: Add WanderState to the spawn bundle**

In the `recruit_agent` function, add `WanderState` to the entity spawn tuple (after `Velocity::default()` on line 138):

```rust
WanderState {
    home_x: spawn_x,
    home_y: spawn_y,
    waypoint_x: spawn_x + (rand::random::<f32>() - 0.5) * 240.0,
    waypoint_y: spawn_y + (rand::random::<f32>() - 0.5) * 240.0,
    pause_remaining: (rand::random::<f32>() * 40.0) as u32 + 20,
    wander_radius: 120.0,
},
```

Note: Initial waypoint is random within radius. Initial pause of 20-60 ticks so agents don't all start walking at the same instant.

**Step 3: Verify it compiles**

Run: `cd server && cargo check`
Expected: compiles (warning about unused WanderState fields is fine)

**Step 4: Commit**

```
git add server/src/game/agents.rs
git commit -m "feat: attach WanderState to recruited agents"
```

---

### Task 3: Create the agent_wander system

**Files:**
- Create: `server/src/ecs/systems/agent_wander.rs`
- Modify: `server/src/ecs/systems/mod.rs` (add module declaration)

**Step 1: Register the module**

In `server/src/ecs/systems/mod.rs`, add at the end:

```rust
pub mod agent_wander;
```

**Step 2: Create the system file**

Create `server/src/ecs/systems/agent_wander.rs` with this content:

```rust
use hecs::World;

use crate::ecs::components::{Agent, AgentState, AgentStats, Position, Velocity, WanderState};
use crate::protocol::AgentStateKind;

/// Base wander speed multiplier. Effective speed = BASE_WANDER_SPEED * agent.speed.
const BASE_WANDER_SPEED: f32 = 0.4;

/// Distance threshold to consider waypoint "reached".
const WAYPOINT_THRESHOLD: f32 = 2.0;

/// Minimum pause ticks at waypoint (1 second at 20Hz).
const MIN_PAUSE_TICKS: u32 = 20;

/// Maximum pause ticks at waypoint (3 seconds at 20Hz).
const MAX_PAUSE_TICKS: u32 = 60;

/// Runs the agent wander system for a single tick.
///
/// Only processes agents in the Idle state. Walking agents move toward
/// their current waypoint; pausing agents decrement their timer. When a
/// waypoint is reached, the agent pauses then picks a new random waypoint
/// within wander_radius of home.
pub fn agent_wander_system(world: &mut World) {
    // Collect idle agents to avoid borrow conflicts.
    let idle_agents: Vec<(hecs::Entity, f32)> = world
        .query::<(&Agent, &AgentState, &AgentStats)>()
        .iter()
        .filter(|(_e, (_a, state, _stats))| state.state == AgentStateKind::Idle)
        .map(|(e, (_a, _state, stats))| (e, stats.speed))
        .collect();

    for (entity, speed) in idle_agents {
        let Ok(mut wander) = world.get::<&mut WanderState>(entity) else {
            continue;
        };

        // If pausing, decrement and skip movement.
        if wander.pause_remaining > 0 {
            wander.pause_remaining -= 1;

            // Zero out velocity while paused.
            drop(wander);
            if let Ok(mut vel) = world.get::<&mut Velocity>(entity) {
                vel.x = 0.0;
                vel.y = 0.0;
            }
            continue;
        }

        // Calculate direction to waypoint.
        let (home_x, home_y) = (wander.home_x, wander.home_y);
        let (wp_x, wp_y) = (wander.waypoint_x, wander.waypoint_y);
        let radius = wander.wander_radius;

        // Need current position — drop wander borrow first.
        drop(wander);

        let Ok(pos) = world.get::<&Position>(entity) else {
            continue;
        };
        let dx = wp_x - pos.x;
        let dy = wp_y - pos.y;
        let dist = (dx * dx + dy * dy).sqrt();
        drop(pos);

        if dist < WAYPOINT_THRESHOLD {
            // Reached waypoint — pause, then pick a new one.
            let Ok(mut wander) = world.get::<&mut WanderState>(entity) else {
                continue;
            };
            wander.pause_remaining =
                MIN_PAUSE_TICKS + (rand::random::<f32>() * (MAX_PAUSE_TICKS - MIN_PAUSE_TICKS) as f32) as u32;

            // Pick new random waypoint within wander_radius of home.
            let angle = rand::random::<f32>() * std::f32::consts::TAU;
            let r = rand::random::<f32>().sqrt() * radius;
            wander.waypoint_x = home_x + angle.cos() * r;
            wander.waypoint_y = home_y + angle.sin() * r;

            // Zero velocity while starting pause.
            drop(wander);
            if let Ok(mut vel) = world.get::<&mut Velocity>(entity) {
                vel.x = 0.0;
                vel.y = 0.0;
            }
        } else {
            // Move toward waypoint.
            let wander_speed = BASE_WANDER_SPEED * speed;
            let nx = dx / dist;
            let ny = dy / dist;
            let vx = nx * wander_speed;
            let vy = ny * wander_speed;

            if let Ok(mut vel) = world.get::<&mut Velocity>(entity) {
                vel.x = vx;
                vel.y = vy;
            }
            if let Ok(mut pos) = world.get::<&mut Position>(entity) {
                pos.x += vx;
                pos.y += vy;
            }
        }
    }
}
```

**Step 3: Verify it compiles**

Run: `cd server && cargo check`
Expected: compiles clean (or with minor warnings)

**Step 4: Commit**

```
git add server/src/ecs/systems/agent_wander.rs server/src/ecs/systems/mod.rs
git commit -m "feat: add agent_wander_system for idle agent movement"
```

---

### Task 4: Wire the system into the game loop

**Files:**
- Modify: `server/src/main.rs:3` (add import)
- Modify: `server/src/main.rs:363` (add system call after agent_tick)

**Step 1: Add the import**

On line 3 of `server/src/main.rs`, add `agent_wander` to the systems import:

```rust
use its_time_to_build_server::ecs::systems::{agent_tick, agent_wander, building, combat, crank, economy, spawn};
```

**Step 2: Call the system after agent_tick**

After line 363 (`let agent_tick_result = agent_tick::agent_tick_system(...)`) add:

```rust
// ── 7c. Idle agent wandering ─────────────────────────────────
agent_wander::agent_wander_system(&mut world);
```

**Step 3: Verify it compiles**

Run: `cd server && cargo check`
Expected: compiles clean

**Step 4: Commit**

```
git add server/src/main.rs
git commit -m "feat: wire agent_wander_system into game tick loop"
```

---

### Task 5: Add tests for the wander system

**Files:**
- Modify: `server/src/ecs/systems/agent_wander.rs` (add test module at bottom)

**Step 1: Add test module**

Append to the bottom of `agent_wander.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::ecs::components::{
        Agent, AgentMorale, AgentName, AgentState, AgentStats, AgentTier, AgentXP, AgentVibeConfig,
        Collider, Health, Position, Velocity, VoiceProfile, WanderState,
    };
    use crate::protocol::{AgentStateKind, AgentTierKind};

    /// Helper: spawn a minimal idle agent with WanderState for testing.
    fn spawn_idle_agent(world: &mut World, x: f32, y: f32, speed: f32) -> hecs::Entity {
        world.spawn((
            Agent,
            Position { x, y },
            Velocity::default(),
            AgentStats {
                reliability: 0.8,
                speed,
                awareness: 80.0,
                resilience: 60.0,
            },
            AgentState {
                state: AgentStateKind::Idle,
            },
            WanderState {
                home_x: x,
                home_y: y,
                waypoint_x: x + 50.0,
                waypoint_y: y,
                pause_remaining: 0,
                wander_radius: 120.0,
            },
        ))
    }

    #[test]
    fn idle_agent_moves_toward_waypoint() {
        let mut world = World::new();
        let entity = spawn_idle_agent(&mut world, 100.0, 100.0, 1.0);

        agent_wander_system(&mut world);

        let pos = world.get::<&Position>(entity).unwrap();
        // Agent should have moved rightward (waypoint is at x+50)
        assert!(pos.x > 100.0, "Agent should have moved toward waypoint");
    }

    #[test]
    fn pausing_agent_does_not_move() {
        let mut world = World::new();
        let entity = spawn_idle_agent(&mut world, 100.0, 100.0, 1.0);

        // Set pause
        {
            let mut wander = world.get::<&mut WanderState>(entity).unwrap();
            wander.pause_remaining = 10;
        }

        agent_wander_system(&mut world);

        let pos = world.get::<&Position>(entity).unwrap();
        assert_eq!(pos.x, 100.0, "Pausing agent should not move");
        assert_eq!(pos.y, 100.0);

        // Pause should have decremented
        let wander = world.get::<&WanderState>(entity).unwrap();
        assert_eq!(wander.pause_remaining, 9);
    }

    #[test]
    fn non_idle_agent_is_skipped() {
        let mut world = World::new();
        let entity = world.spawn((
            Agent,
            Position { x: 100.0, y: 100.0 },
            Velocity::default(),
            AgentStats {
                reliability: 0.8,
                speed: 1.0,
                awareness: 80.0,
                resilience: 60.0,
            },
            AgentState {
                state: AgentStateKind::Building,
            },
            WanderState {
                home_x: 100.0,
                home_y: 100.0,
                waypoint_x: 200.0,
                waypoint_y: 100.0,
                pause_remaining: 0,
                wander_radius: 120.0,
            },
        ));

        agent_wander_system(&mut world);

        let pos = world.get::<&Position>(entity).unwrap();
        assert_eq!(pos.x, 100.0, "Building agent should not wander");
    }

    #[test]
    fn agent_pauses_when_reaching_waypoint() {
        let mut world = World::new();
        let entity = spawn_idle_agent(&mut world, 100.0, 100.0, 1.0);

        // Place agent right at the waypoint
        {
            let mut pos = world.get::<&mut Position>(entity).unwrap();
            pos.x = 150.0; // waypoint is at (150, 100)
            let mut wander = world.get::<&mut WanderState>(entity).unwrap();
            wander.waypoint_x = 150.0;
            wander.waypoint_y = 100.0;
        }

        agent_wander_system(&mut world);

        let wander = world.get::<&WanderState>(entity).unwrap();
        assert!(wander.pause_remaining > 0, "Should start pausing at waypoint");
        // New waypoint should be different from old one (within radius of home)
        let dx = wander.waypoint_x - 100.0;
        let dy = wander.waypoint_y - 100.0;
        let dist = (dx * dx + dy * dy).sqrt();
        assert!(dist <= 120.0, "New waypoint should be within wander radius");
    }

    #[test]
    fn speed_scales_with_agent_stats() {
        let mut world = World::new();
        let slow = spawn_idle_agent(&mut world, 0.0, 0.0, 0.8);
        let fast = spawn_idle_agent(&mut world, 0.0, 0.0, 1.7);

        // Both have waypoint at (50, 0)
        {
            let mut w = world.get::<&mut WanderState>(fast).unwrap();
            w.waypoint_x = 50.0;
            w.waypoint_y = 0.0;
        }

        agent_wander_system(&mut world);

        let slow_pos = world.get::<&Position>(slow).unwrap();
        let fast_pos = world.get::<&Position>(fast).unwrap();
        assert!(
            fast_pos.x > slow_pos.x,
            "Faster agent should move further per tick"
        );
    }
}
```

**Step 2: Run the tests**

Run: `cd server && cargo test agent_wander`
Expected: all 5 tests pass

**Step 3: Commit**

```
git add server/src/ecs/systems/agent_wander.rs
git commit -m "test: add unit tests for agent wander system"
```

---

### Task 6: Smoke test — full server build and run

**Step 1: Full build**

Run: `cd server && cargo build`
Expected: compiles with no errors

**Step 2: Run all tests**

Run: `cd server && cargo test`
Expected: all existing tests + new wander tests pass

**Step 3: Manual smoke test**

Run the server and client. Recruit an idle agent and observe that it wanders around its spawn position with walk-pause-walk behavior. Verify:
- Agent moves when idle
- Agent stops moving when assigned a task
- Agent resumes wandering when returned to idle
- Movement speed looks reasonable (not too fast, not too slow)

**Step 4: Final commit if any tweaks were needed**
