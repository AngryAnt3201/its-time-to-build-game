# Agent Wander System Design

## Overview
Add autonomous wandering behavior for idle agents. When agents have no task assigned, they roam around their home position with a walk-pause-walk pattern, making the game feel alive.

## Decisions
- **Movement style:** Random walk within ~100-150px radius of home position
- **Pacing:** Walk to waypoint, pause 1-3s, pick new waypoint, repeat
- **Speed:** Tier-based using existing `speed` stat — Apprentices amble, Architects stride
- **Architecture:** Server-side ECS system (authoritative), follows existing rogue AI pattern

## New Component: `WanderState`
Added to all agents on spawn.

```rust
pub struct WanderState {
    pub home: Vec2,           // Spawn/assigned position
    pub waypoint: Vec2,       // Current movement target
    pub pause_remaining: u32, // Ticks left in pause (0 = walking)
    pub wander_radius: f32,   // Distance from home (100-150px)
}
```

## New System: `agent_wander_system`
Runs each tick. Only processes agents in `Idle` state.

### Per-tick logic:
1. If `pause_remaining > 0`: decrement, skip movement
2. If walking: move toward `waypoint` at `0.4 * agent_stats.speed` px/tick
3. If within 2px of waypoint: set random pause (20-60 ticks), pick new random waypoint within `wander_radius` of `home`

### Effective speeds:
| Tier | Speed stat | Wander speed (px/tick) |
|------|-----------|----------------------|
| Apprentice | 0.8-1.0 | 0.32-0.40 |
| Journeyman | 1.0-1.3 | 0.40-0.52 |
| Artisan | 1.2-1.5 | 0.48-0.60 |
| Architect | 1.4-1.7 | 0.56-0.68 |

## Integration Points
- **Spawn:** Add `WanderState` with `home = spawn_position`, random initial waypoint
- **Main loop:** Call after `agent_tick_system()`
- **Task transitions:** System only runs on Idle agents — assigning a task stops wandering automatically. Returning to Idle resumes wandering with existing `WanderState`

## Client Impact
None. Existing entity delta sync sends updated positions. Client renderer already handles position changes.

## Files to modify
1. `server/src/ecs/components.rs` or equivalent — add `WanderState` component
2. `server/src/ecs/systems/` — new `agent_wander.rs` system
3. `server/src/ecs/systems/mod.rs` — register new system
4. `server/src/game/agents.rs` — add `WanderState` to spawn bundle
5. `server/src/game/mod.rs` — call system in tick loop
