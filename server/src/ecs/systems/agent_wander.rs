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
