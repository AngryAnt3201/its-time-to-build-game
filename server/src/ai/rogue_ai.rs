use hecs::World;
use rand::Rng;

use crate::ecs::components::{
    Agent, AgentXP, GuardianRogue, Player, Position, Rogue, RogueAI, RogueBehaviorState,
    RogueType, Velocity,
};
use crate::protocol::RogueTypeKind;

/// Returns the movement speed for a given rogue type.
fn speed_for_type(kind: RogueTypeKind) -> f32 {
    match kind {
        RogueTypeKind::Swarm => 0.98,
        RogueTypeKind::Assassin => 1.95,
        RogueTypeKind::Corruptor => 0.52,
        RogueTypeKind::Looper => 0.65,
        RogueTypeKind::TokenDrain => 0.33,
        RogueTypeKind::Mimic => 0.0, // stationary
        RogueTypeKind::Architect => 0.39,
    }
}

/// Runs the rogue AI behavior system for a single tick.
///
/// 1. Collects all rogues with their positions and types (to avoid borrow conflicts).
/// 2. Collects all agent positions and the player position as potential targets.
/// 3. For each rogue, finds the nearest target and moves toward it at type-specific speed.
/// 4. Updates behavior state based on distance to nearest target.
/// 5. Special: Assassin targets the highest-XP agent specifically.
pub fn rogue_ai_system(world: &mut World) {
    // ── Collect rogue data ────────────────────────────────────────────
    let rogues: Vec<(hecs::Entity, f32, f32, RogueTypeKind)> = world
        .query::<(&Rogue, &Position, &RogueType)>()
        .iter()
        .map(|(entity, (_rogue, pos, rogue_type))| (entity, pos.x, pos.y, rogue_type.kind))
        .collect();

    // ── Collect potential targets ─────────────────────────────────────
    // Player position
    let player_target: Option<(hecs::Entity, f32, f32)> = world
        .query::<(&Player, &Position)>()
        .iter()
        .map(|(entity, (_player, pos))| (entity, pos.x, pos.y))
        .next();

    // Agent positions (with XP for assassin targeting)
    let agent_targets: Vec<(hecs::Entity, f32, f32, u64)> = world
        .query::<(&Agent, &Position, &AgentXP)>()
        .iter()
        .map(|(entity, (_agent, pos, xp))| (entity, pos.x, pos.y, xp.xp))
        .collect();

    // ── Find the highest-XP agent for assassin targeting ──────────────
    let highest_xp_agent: Option<(hecs::Entity, f32, f32)> = agent_targets
        .iter()
        .max_by_key(|(_e, _x, _y, xp)| *xp)
        .map(|(e, x, y, _xp)| (*e, *x, *y));

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

    // ── Process each rogue ────────────────────────────────────────────
    for (rogue_entity, rx, ry, rogue_kind) in &rogues {
        // Skip guardians — they were already processed above
        if guardian_entities.contains(rogue_entity) {
            continue;
        }

        let speed = speed_for_type(*rogue_kind);

        // Determine the target based on rogue type.
        // Assassins specifically target the highest-XP agent.
        let target: Option<(hecs::Entity, f32, f32)> = if *rogue_kind == RogueTypeKind::Assassin {
            // Prefer highest-XP agent, fall back to player
            highest_xp_agent.or(player_target)
        } else {
            // Find nearest target among all agents and the player.
            let mut nearest: Option<(hecs::Entity, f32, f32, f32)> = None; // (entity, x, y, dist_sq)

            if let Some((pe, px, py)) = player_target {
                let dx = px - rx;
                let dy = py - ry;
                let dist_sq = dx * dx + dy * dy;
                nearest = Some((pe, px, py, dist_sq));
            }

            for (ae, ax, ay, _xp) in &agent_targets {
                let dx = ax - rx;
                let dy = ay - ry;
                let dist_sq = dx * dx + dy * dy;
                match nearest {
                    Some((_ne, _nx, _ny, nd)) if nd <= dist_sq => {}
                    _ => {
                        nearest = Some((*ae, *ax, *ay, dist_sq));
                    }
                }
            }

            nearest.map(|(e, x, y, _d)| (e, x, y))
        };

        // Compute direction and distance to target.
        let (target_entity, dist) = if let Some((te, tx, ty)) = target {
            let dx = tx - rx;
            let dy = ty - ry;
            let dist = (dx * dx + dy * dy).sqrt();

            // Move toward target (if speed > 0 and distance > 0).
            if speed > 0.0 && dist > 0.001 {
                let nx = dx / dist;
                let ny = dy / dist;
                let vx = nx * speed;
                let vy = ny * speed;

                // Update velocity and position.
                if let Ok(mut vel) = world.get::<&mut Velocity>(*rogue_entity) {
                    vel.x = vx;
                    vel.y = vy;
                }
                if let Ok(mut pos) = world.get::<&mut Position>(*rogue_entity) {
                    pos.x += vx;
                    pos.y += vy;
                }
            }

            (Some(te), dist)
        } else {
            // No target found -- stay still.
            if let Ok(mut vel) = world.get::<&mut Velocity>(*rogue_entity) {
                vel.x = 0.0;
                vel.y = 0.0;
            }
            (None, f32::MAX)
        };

        // Update behavior state based on distance.
        let new_state = if dist < 20.0 {
            RogueBehaviorState::Attacking
        } else if dist < 200.0 {
            RogueBehaviorState::Approaching
        } else {
            RogueBehaviorState::Wandering
        };

        if let Ok(mut ai) = world.get::<&mut RogueAI>(*rogue_entity) {
            ai.behavior_state = new_state;
            ai.target = target_entity;
        }
    }
}
