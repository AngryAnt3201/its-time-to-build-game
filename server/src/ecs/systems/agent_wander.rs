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
        .filter(|(_e, (_a, state, _stats))| {
            state.state == AgentStateKind::Idle || state.state == AgentStateKind::Building
        })
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ecs::components::{
        Agent, AgentState, AgentStats, Position, Velocity, WanderState,
    };
    use crate::protocol::AgentStateKind;

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
                state: AgentStateKind::Erroring,
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
        assert_eq!(pos.x, 100.0, "Erroring agent should not wander");
    }

    #[test]
    fn agent_pauses_when_reaching_waypoint() {
        let mut world = World::new();
        let entity = spawn_idle_agent(&mut world, 100.0, 100.0, 1.0);

        // Place agent right at the waypoint
        {
            let mut pos = world.get::<&mut Position>(entity).unwrap();
            pos.x = 150.0;
            let mut wander = world.get::<&mut WanderState>(entity).unwrap();
            wander.waypoint_x = 150.0;
            wander.waypoint_y = 100.0;
        }

        agent_wander_system(&mut world);

        let wander = world.get::<&WanderState>(entity).unwrap();
        assert!(wander.pause_remaining > 0, "Should start pausing at waypoint");
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
