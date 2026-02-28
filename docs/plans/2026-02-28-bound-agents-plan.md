# Bound Agent Camps Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Spawn bound agents guarded by leashed enemies across the map that players can recruit for tokens, with agents pathfinding back to base on recruitment.

**Architecture:** Bound agent camps spawn deterministically based on a position hash (like chests) but as real ECS entities. A camp spawner system checks positions near the player each tick and spawns camps that haven't been spawned yet. Guardian rogues use a new `GuardianRogue` component with leashed patrol/chase/return AI. Recruitment converts bound agents into normal walking agents heading to base.

**Tech Stack:** Rust (hecs ECS, serde), TypeScript (PixiJS client)

---

### Task 1: Add `GuardianRogue` and `BoundAgent` Components

**Files:**
- Modify: `server/src/ecs/components.rs:199-202` (after `Recruitable` struct)

**Step 1: Add the new component structs**

Add after the `Recruitable` struct (line 202) in `server/src/ecs/components.rs`:

```rust
#[derive(Debug, Clone)]
pub struct BoundAgent;

#[derive(Debug, Clone)]
pub struct GuardianRogue {
    pub home_x: f32,
    pub home_y: f32,
    pub leash_radius: f32,
    pub bound_agent_entity: hecs::Entity,
    pub patrol_waypoint_x: f32,
    pub patrol_waypoint_y: f32,
    pub patrol_pause: u32,
}
```

**Step 2: Verify it compiles**

Run: `cd server && cargo check`
Expected: compiles with no errors

**Step 3: Commit**

```bash
git add server/src/ecs/components.rs
git commit -m "feat: add BoundAgent and GuardianRogue ECS components"
```

---

### Task 2: Add `bound_agent` Field to Protocol

**Files:**
- Modify: `server/src/protocol.rs:53-66` (EntityData::Agent variant)
- Modify: `client/src/network/protocol.ts:47-60` (AgentData interface)

**Step 1: Add `bound` field to server EntityData::Agent**

In `server/src/protocol.rs`, add a `bound` field to the `Agent` variant of `EntityData` (after `recruitable_cost` at line 65):

```rust
    Agent {
        name: String,
        state: AgentStateKind,
        tier: AgentTierKind,
        health_pct: f32,
        morale_pct: f32,
        stars: u8,
        turns_used: u32,
        max_turns: u32,
        model_lore_name: String,
        xp: u64,
        level: u32,
        recruitable_cost: Option<i64>,
        bound: bool,
    },
```

**Step 2: Update entity serialization in main.rs**

In `server/src/main.rs`, find the agent EntityDelta push block (~line 883-901). Add `bound: false` to the `EntityData::Agent` struct literal:

```rust
data: EntityData::Agent {
    name: name.name.clone(),
    state: state.state,
    tier: tier.tier,
    health_pct,
    morale_pct: morale.value,
    stars: vibe.stars,
    turns_used: vibe.turns_used,
    max_turns: vibe.max_turns,
    model_lore_name: vibe.model_lore_name.clone(),
    xp: xp_comp.xp,
    level: xp_comp.level,
    recruitable_cost: None,
    bound: false,
},
```

Then, after the recruitable_cost fill-in loop (~line 904-914), add a similar loop to fill in `bound`:

```rust
// Fill in bound flag for agents that have the BoundAgent component
for delta in &mut entities_changed {
    if let EntityData::Agent { bound, .. } = &mut delta.data {
        let entity = hecs::Entity::from_bits(delta.id);
        if let Some(entity) = entity {
            if world.get::<&BoundAgent>(entity).is_ok() {
                *bound = true;
            }
        }
    }
}
```

Make sure `BoundAgent` is imported at the top of `main.rs` from `crate::ecs::components`.

**Step 3: Update client protocol types**

In `client/src/network/protocol.ts`, add `bound` to `AgentData` interface (after `recruitable_cost` at line 59):

```typescript
export interface AgentData {
  name: string;
  state: AgentStateKind;
  tier: AgentTierKind;
  health_pct: number;
  morale_pct: number;
  stars: number;
  turns_used: number;
  max_turns: number;
  model_lore_name: string;
  xp: number;
  level: number;
  recruitable_cost: number | null;
  bound: boolean;
}
```

**Step 4: Verify it compiles**

Run: `cd server && cargo check`
Expected: compiles with no errors

**Step 5: Commit**

```bash
git add server/src/protocol.rs server/src/main.rs client/src/network/protocol.ts
git commit -m "feat: add bound field to agent protocol for bound agent camps"
```

---

### Task 3: Create Camp Spawner System

**Files:**
- Create: `server/src/ecs/systems/camp_spawner.rs`
- Modify: `server/src/ecs/systems/mod.rs` (add module declaration)

**Step 1: Create the camp spawner module**

Create `server/src/ecs/systems/camp_spawner.rs`:

```rust
use hecs::World;
use rand::Rng;

use crate::ecs::components::{
    Agent, AgentMorale, AgentName, AgentState, AgentStats, AgentTier, AgentVibeConfig, AgentXP,
    BoundAgent, Collider, GameState, GuardianRogue, Health, Position, Recruitable, Rogue, RogueAI,
    RogueBehaviorState, RogueType, RogueVisibility, Velocity, VoiceProfile, WanderState,
};
use crate::game::agents::generate_vibe_config;
use crate::protocol::{AgentStateKind, AgentTierKind, RogueTypeKind};

/// Grid spacing for bound-agent camp positions (world units).
const CAMP_GRID_STEP: i32 = 384;

/// Hash seed for camp placement.
const CAMP_SEED: i32 = 77777;

/// Distance from player at which camps are spawned.
const CAMP_SPAWN_RADIUS: f32 = 600.0;

/// Percentage chance (0-100) that a grid position hosts a camp.
const CAMP_DENSITY: i32 = 6;

/// Agent name bank for bound agents.
const BOUND_AGENT_NAMES: [&str; 16] = [
    "Drift", "Ember", "Null", "Shard", "Byte", "Flux", "Haze", "Rune",
    "Volt", "Cipher", "Ash", "Echo", "Pulse", "Wraith", "Gloom", "Spark",
];

/// Simple deterministic hash for camp placement (same approach as chests).
fn camp_hash(x: i32, y: i32, seed: i32) -> i32 {
    let mut h = x.wrapping_mul(374761393)
        .wrapping_add(y.wrapping_mul(668265263))
        .wrapping_add(seed);
    h = (h ^ (h >> 13)).wrapping_mul(1274126177);
    h = h ^ (h >> 16);
    h.abs()
}

/// Pick a random tier with weighted distribution.
fn pick_tier(hash_val: i32) -> AgentTierKind {
    let roll = hash_val % 100;
    if roll < 50 {
        AgentTierKind::Apprentice
    } else if roll < 75 {
        AgentTierKind::Journeyman
    } else if roll < 90 {
        AgentTierKind::Artisan
    } else {
        AgentTierKind::Architect
    }
}

/// Number of guardian enemies by agent tier.
fn guardian_count(tier: AgentTierKind) -> usize {
    match tier {
        AgentTierKind::Apprentice => 2,
        AgentTierKind::Journeyman => 3,
        AgentTierKind::Artisan => 4,
        AgentTierKind::Architect => 5,
    }
}

/// Pick guardian rogue types based on agent tier.
fn guardian_types(tier: AgentTierKind, count: usize) -> Vec<RogueTypeKind> {
    let mut types = Vec::with_capacity(count);
    match tier {
        AgentTierKind::Apprentice => {
            for _ in 0..count {
                types.push(RogueTypeKind::Swarm);
            }
        }
        AgentTierKind::Journeyman => {
            for i in 0..count {
                if i % 2 == 0 {
                    types.push(RogueTypeKind::Swarm);
                } else {
                    types.push(RogueTypeKind::Corruptor);
                }
            }
        }
        AgentTierKind::Artisan => {
            for i in 0..count {
                match i % 3 {
                    0 => types.push(RogueTypeKind::Swarm),
                    1 => types.push(RogueTypeKind::Corruptor),
                    _ => types.push(RogueTypeKind::Looper),
                }
            }
        }
        AgentTierKind::Architect => {
            for i in 0..count {
                match i % 4 {
                    0 => types.push(RogueTypeKind::Swarm),
                    1 => types.push(RogueTypeKind::Corruptor),
                    2 => types.push(RogueTypeKind::Looper),
                    _ => types.push(RogueTypeKind::Assassin),
                }
            }
        }
    }
    types
}

/// Recruitment cost by tier (same as normal recruitment).
fn recruit_cost(tier: AgentTierKind) -> i64 {
    match tier {
        AgentTierKind::Apprentice => 20,
        AgentTierKind::Journeyman => 60,
        AgentTierKind::Artisan => 150,
        AgentTierKind::Architect => 400,
    }
}

/// Runs once per tick. Checks grid positions near the player and spawns
/// bound agent camps that haven't been spawned yet.
pub fn camp_spawner_system(
    world: &mut World,
    game_state: &mut GameState,
    player_x: f32,
    player_y: f32,
) {
    let radius = CAMP_SPAWN_RADIUS;
    let step = CAMP_GRID_STEP as f32;

    // Calculate grid range to check
    let min_gx = ((player_x - radius) / step).floor() as i32;
    let max_gx = ((player_x + radius) / step).ceil() as i32;
    let min_gy = ((player_y - radius) / step).floor() as i32;
    let max_gy = ((player_y + radius) / step).ceil() as i32;

    let mut rng = rand::thread_rng();

    for gx in min_gx..=max_gx {
        for gy in min_gy..=max_gy {
            // Skip origin area (player spawn)
            if gx == 0 && gy == 0 {
                continue;
            }
            if gx == 1 && gy == 0 {
                continue;
            }
            if gx == 0 && gy == 1 {
                continue;
            }

            let world_x = gx as f32 * step;
            let world_y = gy as f32 * step;

            // Check if already spawned
            if game_state.spawned_camps.contains(&(gx, gy)) {
                continue;
            }

            // Deterministic roll: does this position have a camp?
            let hash = camp_hash(gx, gy, CAMP_SEED);
            if (hash % 100) >= CAMP_DENSITY {
                continue;
            }

            // Mark as spawned
            game_state.spawned_camps.insert((gx, gy));

            // Determine tier from a second hash
            let tier_hash = camp_hash(gx + 1000, gy + 1000, CAMP_SEED);
            let tier = pick_tier(tier_hash);

            // Pick agent name deterministically
            let name_idx = (hash as usize) % BOUND_AGENT_NAMES.len();
            let agent_name = BOUND_AGENT_NAMES[name_idx].to_string();

            // Spawn the bound agent entity (split into two inserts for hecs tuple limit)
            let hp = match tier {
                AgentTierKind::Apprentice => 50,
                AgentTierKind::Journeyman => 80,
                AgentTierKind::Artisan => 120,
                AgentTierKind::Architect => 200,
            };

            let agent_entity = world.spawn((
                Agent,
                BoundAgent,
                Position { x: world_x, y: world_y },
                Velocity::default(),
                Collider { radius: 5.0 },
                Health { current: hp, max: hp },
                AgentStats {
                    reliability: rng.gen_range(0.4..0.9),
                    speed: rng.gen_range(0.6..1.4),
                    awareness: rng.gen_range(40.0..100.0),
                    resilience: hp as f64,
                },
                AgentState { state: AgentStateKind::Dormant },
                AgentMorale { value: 0.5 },
                AgentXP { xp: 0, level: 1 },
            ));
            // Second insert for remaining components
            let _ = world.insert(agent_entity, (
                AgentTier { tier },
                AgentName { name: agent_name },
                VoiceProfile { voice_id: "bound_default".to_string() },
                generate_vibe_config(tier),
                Recruitable { cost: recruit_cost(tier) },
                WanderState {
                    home_x: world_x,
                    home_y: world_y,
                    waypoint_x: world_x,
                    waypoint_y: world_y,
                    pause_remaining: 0,
                    wander_radius: 20.0,
                    walk_target: None,
                },
            ));

            // Spawn guardian rogues in a ring around the agent
            let count = guardian_count(tier);
            let types = guardian_types(tier, count);
            for (i, rogue_kind) in types.into_iter().enumerate() {
                let angle = (i as f32 / count as f32) * std::f32::consts::TAU;
                let dist = rng.gen_range(30.0..60.0_f32);
                let gx_pos = world_x + angle.cos() * dist;
                let gy_pos = world_y + angle.sin() * dist;

                let (ghp, _dmg) = match rogue_kind {
                    RogueTypeKind::Swarm => (15, 3),
                    RogueTypeKind::Corruptor => (40, 5),
                    RogueTypeKind::Looper => (25, 2),
                    RogueTypeKind::Assassin => (35, 15),
                    _ => (15, 3),
                };

                world.spawn((
                    Rogue,
                    Position { x: gx_pos, y: gy_pos },
                    Velocity::default(),
                    Collider { radius: 6.0 },
                    Health { current: ghp, max: ghp },
                    RogueType { kind: rogue_kind },
                    RogueAI {
                        behavior_state: RogueBehaviorState::Wandering,
                        target: None,
                    },
                    RogueVisibility { visible: true },
                    GuardianRogue {
                        home_x: gx_pos,
                        home_y: gy_pos,
                        leash_radius: 200.0,
                        bound_agent_entity: agent_entity,
                        patrol_waypoint_x: gx_pos,
                        patrol_waypoint_y: gy_pos,
                        patrol_pause: 0,
                    },
                ));
            }
        }
    }
}
```

**Step 2: Add module declaration**

In `server/src/ecs/systems/mod.rs`, add:

```rust
pub mod camp_spawner;
```

**Step 3: Add `spawned_camps` to GameState**

In `server/src/ecs/components.rs`, find the `GameState` struct and add:

```rust
pub spawned_camps: std::collections::HashSet<(i32, i32)>,
```

Then in `server/src/ecs/world.rs`, where `GameState` is initialized (~line 128-158), add:

```rust
spawned_camps: std::collections::HashSet::new(),
```

**Step 4: Make `generate_vibe_config` public**

In `server/src/game/agents.rs`, find the `generate_vibe_config` function and ensure it is `pub`. If it's `pub(crate)` or private, change it to `pub`.

**Step 5: Verify it compiles**

Run: `cd server && cargo check`
Expected: compiles with no errors

**Step 6: Commit**

```bash
git add server/src/ecs/systems/camp_spawner.rs server/src/ecs/systems/mod.rs server/src/ecs/components.rs server/src/ecs/world.rs server/src/game/agents.rs
git commit -m "feat: add camp spawner system for bound agent camps"
```

---

### Task 4: Add Guardian AI to Rogue System

**Files:**
- Modify: `server/src/ai/rogue_ai.rs`

**Step 1: Add guardian AI behavior**

Replace the entire `rogue_ai_system` function in `server/src/ai/rogue_ai.rs` to handle guardians separately. Guardians with a `GuardianRogue` component use leashed patrol/chase/return behavior instead of global target-seeking.

At the top, add `GuardianRogue` to the imports:

```rust
use crate::ecs::components::{
    Agent, AgentXP, GuardianRogue, Player, Position, Rogue, RogueAI, RogueBehaviorState,
    RogueType, Velocity,
};
```

Inside `rogue_ai_system`, after collecting player_target and agent_targets (after line 49), add guardian processing BEFORE the normal rogue loop. The key change: collect guardian entity IDs into a set, then skip them in the normal rogue loop.

After line 55 (`let highest_xp_agent = ...`), add:

```rust
// ── Process guardian rogues (leashed behavior) ──────────────────
let mut guardian_entities: std::collections::HashSet<hecs::Entity> = std::collections::HashSet::new();

// Collect guardian data
let guardians: Vec<(hecs::Entity, f32, f32, RogueTypeKind, f32, f32, f32, u32)> = world
    .query::<(&Rogue, &Position, &RogueType, &GuardianRogue)>()
    .iter()
    .map(|(entity, (_rogue, pos, rtype, guard))| {
        (entity, pos.x, pos.y, rtype.kind, guard.home_x, guard.home_y, guard.leash_radius, guard.patrol_pause)
    })
    .collect();

for (entity, rx, ry, rogue_kind, home_x, home_y, leash_radius, patrol_pause) in &guardians {
    guardian_entities.insert(*entity);
    let speed = speed_for_type(*rogue_kind);

    let dx_home = home_x - rx;
    let dy_home = home_y - ry;
    let dist_from_home = (dx_home * dx_home + dy_home * dy_home).sqrt();

    // Find distance to player
    let player_dist = if let Some((_pe, px, py)) = player_target {
        let dx = px - rx;
        let dy = py - ry;
        (dx * dx + dy * dy).sqrt()
    } else {
        f32::MAX
    };

    // Decision: return home if too far from leash, chase player if close, otherwise patrol
    if dist_from_home > *leash_radius {
        // Return to home
        if speed > 0.0 && dist_from_home > 1.0 {
            let nx = dx_home / dist_from_home;
            let ny = dy_home / dist_from_home;
            let vx = nx * speed;
            let vy = ny * speed;
            if let Ok(mut vel) = world.get::<&mut Velocity>(*entity) { vel.x = vx; vel.y = vy; }
            if let Ok(mut pos) = world.get::<&mut Position>(*entity) { pos.x += vx; pos.y += vy; }
        }
        if let Ok(mut ai) = world.get::<&mut RogueAI>(*entity) {
            ai.behavior_state = RogueBehaviorState::Fleeing;
            ai.target = None;
        }
    } else if player_dist < 100.0 {
        // Chase player (but leash will pull back next tick if over limit)
        if let Some((_pe, px, py)) = player_target {
            let dx = px - rx;
            let dy = py - ry;
            let dist = (dx * dx + dy * dy).sqrt();
            if speed > 0.0 && dist > 0.001 {
                let nx = dx / dist;
                let ny = dy / dist;
                let vx = nx * speed;
                let vy = ny * speed;
                if let Ok(mut vel) = world.get::<&mut Velocity>(*entity) { vel.x = vx; vel.y = vy; }
                if let Ok(mut pos) = world.get::<&mut Position>(*entity) { pos.x += vx; pos.y += vy; }
            }
        }
        let new_state = if player_dist < 20.0 {
            RogueBehaviorState::Attacking
        } else {
            RogueBehaviorState::Approaching
        };
        if let Ok(mut ai) = world.get::<&mut RogueAI>(*entity) {
            ai.behavior_state = new_state;
            ai.target = player_target.map(|(e, _, _)| e);
        }
    } else {
        // Patrol: wander near home
        if *patrol_pause > 0 {
            // Pausing at waypoint
            if let Ok(mut vel) = world.get::<&mut Velocity>(*entity) { vel.x = 0.0; vel.y = 0.0; }
            if let Ok(mut guard) = world.get::<&mut GuardianRogue>(*entity) {
                guard.patrol_pause = guard.patrol_pause.saturating_sub(1);
            }
        } else {
            // Move toward patrol waypoint
            if let Ok(guard) = world.get::<&GuardianRogue>(*entity) {
                let wpx = guard.patrol_waypoint_x;
                let wpy = guard.patrol_waypoint_y;
                let dx = wpx - rx;
                let dy = wpy - ry;
                let dist = (dx * dx + dy * dy).sqrt();
                if dist < 3.0 {
                    // Reached waypoint — pick new one and pause
                    let mut rng = rand::thread_rng();
                    let angle = rng.gen::<f32>() * std::f32::consts::TAU;
                    let r = rng.gen_range(10.0..40.0_f32);
                    drop(guard);
                    if let Ok(mut guard) = world.get::<&mut GuardianRogue>(*entity) {
                        guard.patrol_waypoint_x = guard.home_x + angle.cos() * r;
                        guard.patrol_waypoint_y = guard.home_y + angle.sin() * r;
                        guard.patrol_pause = rng.gen_range(30..80);
                    }
                    if let Ok(mut vel) = world.get::<&mut Velocity>(*entity) { vel.x = 0.0; vel.y = 0.0; }
                } else if speed > 0.0 {
                    let patrol_speed = speed * 0.4; // Patrol slower than chase
                    let nx = dx / dist;
                    let ny = dy / dist;
                    let vx = nx * patrol_speed;
                    let vy = ny * patrol_speed;
                    if let Ok(mut vel) = world.get::<&mut Velocity>(*entity) { vel.x = vx; vel.y = vy; }
                    if let Ok(mut pos) = world.get::<&mut Position>(*entity) { pos.x += vx; pos.y += vy; }
                }
            }
        }
        if let Ok(mut ai) = world.get::<&mut RogueAI>(*entity) {
            ai.behavior_state = RogueBehaviorState::Wandering;
            ai.target = None;
        }
    }
}
```

Then modify the existing rogue processing loop (line 58) to skip guardians:

```rust
for (rogue_entity, rx, ry, rogue_kind) in &rogues {
    // Skip guardians — they were already processed above
    if guardian_entities.contains(rogue_entity) {
        continue;
    }
    // ... rest of existing code unchanged
```

**Step 2: Verify it compiles**

Run: `cd server && cargo check`
Expected: compiles with no errors

**Step 3: Commit**

```bash
git add server/src/ai/rogue_ai.rs
git commit -m "feat: add leashed guardian AI for bound agent camp enemies"
```

---

### Task 5: Wire Camp Spawner and Recruitment into Game Loop

**Files:**
- Modify: `server/src/main.rs`

**Step 1: Add camp spawner system call**

In `server/src/main.rs`, find where the spawn system is called (~line 625 area, the "2. Rogue AI behavior" comment). Add the camp spawner call BEFORE the spawn system:

```rust
// ── 1b. Spawn bound-agent camps near player ─────────────────────
crate::ecs::systems::camp_spawner::camp_spawner_system(
    &mut world,
    &mut game_state,
    player_x,
    player_y,
);
```

**Step 2: Update RecruitAgent handler for bound agents**

Find the `RecruitAgent` handler (~line 186-204). After the existing recruitment logic that removes `Recruitable` and sets state to `Idle`, add handling for bound agents. When a bound agent is recruited, remove `BoundAgent`, set state to `Walking`, and set `walk_target` to base (0,0). Also remove `GuardianRogue` from any guardians that reference this entity.

Replace the RecruitAgent handler with:

```rust
PlayerAction::RecruitAgent { entity_id } => {
    let target = hecs::Entity::from_bits(*entity_id);
    if let Some(target) = target {
        let cost = world.get::<&Recruitable>(target).ok().map(|r| r.cost);
        if let Some(cost) = cost {
            if game_state.economy.balance >= cost {
                game_state.economy.balance -= cost;
                let _ = world.remove_one::<Recruitable>(target);

                // Check if this is a bound agent
                let was_bound = world.get::<&BoundAgent>(target).is_ok();
                if was_bound {
                    let _ = world.remove_one::<BoundAgent>(target);
                    // Set walk target to base
                    if let Ok(mut wander) = world.get::<&mut WanderState>(target) {
                        wander.walk_target = Some((400.0, 300.0));
                    }
                    if let Ok(mut state) = world.get::<&mut AgentState>(target) {
                        state.state = AgentStateKind::Walking;
                    }
                    // Release guardians: remove GuardianRogue component from
                    // all rogues guarding this agent so they become normal rogues
                    let guardian_entities: Vec<hecs::Entity> = world
                        .query::<&GuardianRogue>()
                        .iter()
                        .filter(|(_e, g)| g.bound_agent_entity == target)
                        .map(|(e, _g)| e)
                        .collect();
                    for ge in guardian_entities {
                        let _ = world.remove_one::<GuardianRogue>(ge);
                    }
                    if let Ok(name) = world.get::<&AgentName>(target) {
                        debug_log_entries.push(format!("{} freed! returning to base.", name.name));
                    }
                } else {
                    if let Ok(mut state) = world.get::<&mut AgentState>(target) {
                        state.state = AgentStateKind::Idle;
                    }
                    if let Ok(name) = world.get::<&AgentName>(target) {
                        debug_log_entries.push(format!("{} recruited!", name.name));
                    }
                }
            }
        }
    }
}
```

Make sure `BoundAgent`, `GuardianRogue`, and `WanderState` are imported at the top of `main.rs`.

**Step 3: Verify it compiles**

Run: `cd server && cargo check`
Expected: compiles with no errors

**Step 4: Commit**

```bash
git add server/src/main.rs
git commit -m "feat: wire camp spawner and bound agent recruitment into game loop"
```

---

### Task 6: Client Rendering for Bound Agents

**Files:**
- Modify: `client/src/renderer/entities.ts` (~line 256-304, `drawAgent` function)
- Modify: `client/src/main.tsx` (~lines 723-777, agent click handler)

**Step 1: Update agent rendering for bound state**

In `client/src/renderer/entities.ts`, find the `drawAgent` method. After the dormant alpha dimming (~lines 287-291), add a visual indicator for bound agents. The method receives agent data — check for the `bound` field:

Update the `drawAgent` call signature and body to accept bound state. The EntityData for agents already includes `bound: boolean`. Where `drawAgent` is called from the `update` method, pass the bound field.

In the `drawAgent` method, after the dormant alpha dimming, add a pulsing cyan ring for bound agents:

```typescript
// Bound agent visual: pulsing cyan glow
if ((agent as any).bound) {
  const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 300);
  const glowAlpha = 0.3 + 0.4 * pulse;
  g.circle(0, 0, 14);
  g.fill({ color: 0x00ccff, alpha: glowAlpha });
  sprite.container.alpha = 0.8 + 0.2 * pulse;
}
```

**Step 2: Update click handler for bound agents**

In `client/src/main.tsx`, find the dormant agent click section (~lines 761-777). The existing code checks for `state === 'Dormant'` and sends `RecruitAgent`. This already works for bound agents since they are `Dormant` + `Recruitable`. No change needed here — the existing recruitment flow handles it.

However, to show a better tooltip, update the `AgentWorldTooltip` to indicate "bound" status. In the tooltip code, if the agent data has `bound: true`, show "Bound Agent - Click to recruit" instead of just the recruit cost.

**Step 3: Verify client builds**

Run: `cd client && npx tsc --noEmit`
Expected: no type errors

**Step 4: Commit**

```bash
git add client/src/renderer/entities.ts client/src/main.tsx
git commit -m "feat: add bound agent rendering with pulsing glow effect"
```

---

### Task 7: Update Minimap for Bound Agents

**Files:**
- Modify: `client/src/ui/minimap.ts`

**Step 1: Add bound agent indicator on minimap**

In the minimap's `redraw()` method, where agents are rendered as colored dots, add a distinct color for bound agents. Bound agents should appear as a cyan dot (distinct from normal agent state colors and rogue red dots) so players can spot them while exploring.

Find where agent entities are drawn on the minimap (look for the agent icon/dot rendering section). Add a check: if the agent data has `bound === true`, draw a cyan dot instead of the normal state-colored one.

```typescript
// If bound agent, draw cyan dot
const agentData = (entity.data as { Agent?: AgentData }).Agent;
if (agentData?.bound) {
  ctx.fillStyle = '#00ccff';
  ctx.fillRect(mx - 2, my - 2, 4, 4);
  continue; // Skip normal agent rendering
}
```

**Step 2: Commit**

```bash
git add client/src/ui/minimap.ts
git commit -m "feat: show bound agents as cyan dots on minimap"
```

---

### Task 8: Integration Test — Play and Verify

**Step 1: Run the full game**

Start the server and client:
```bash
cd server && cargo run &
cd client && npm run dev
```

**Step 2: Manual verification checklist**

- [ ] Walk away from spawn — bound agent camps appear on minimap as cyan dots
- [ ] Approach a camp — see the bound agent with pulsing glow and guardian rogues nearby
- [ ] Guardian rogues patrol near the camp (small area)
- [ ] Walk near guardians — they chase the player
- [ ] Run 200+ units away — guardians return to patrol
- [ ] Kill all guardians at a camp
- [ ] Click the bound agent — tokens deducted, agent starts walking to base
- [ ] Agent arrives at base area and transitions to Idle state
- [ ] Released guardians (if any survived) behave as normal aggressive rogues

**Step 3: Fix any issues found during testing**

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete bound agent camps with guardian enemies"
```
