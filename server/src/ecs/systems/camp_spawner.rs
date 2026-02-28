use hecs::World;
use rand::Rng;

use crate::ecs::components::{
    Agent, AgentMorale, AgentName, AgentState, AgentStats, AgentTier, AgentXP,
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
                    resilience: hp as f32,
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
