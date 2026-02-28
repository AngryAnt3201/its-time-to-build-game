use hecs::World;
use rand::Rng;

use crate::ecs::components::{
    Building, Collider, GamePhase, GameState, Health, Position, Rogue, RogueAI,
    RogueBehaviorState, RogueType, RogueVisibility, Velocity,
};
use crate::protocol::RogueTypeKind;

/// Runs the spawn system for a single tick.
///
/// Determines whether to spawn a new rogue enemy based on the current game
/// phase and building count, then places it at a random position around the
/// player.
pub fn spawn_system(world: &mut World, game_state: &GameState, player_x: f32, player_y: f32) {
    let mut rng = rand::thread_rng();

    // ── Count buildings for scaling spawn rate ─────────────────────────
    let building_count = world.query::<&Building>().iter().count() as f32;

    // ── Base spawn rate by phase ──────────────────────────────────────
    let base_rate = match game_state.phase {
        GamePhase::Hut => 0.002,
        GamePhase::Outpost => 0.005,
        GamePhase::Village => 0.01,
        GamePhase::Network => 0.02,
        GamePhase::City => 0.03,
    };

    let spawn_chance = base_rate + building_count * 0.002;

    // ── Roll for spawn ────────────────────────────────────────────────
    if rng.gen::<f32>() > spawn_chance {
        return;
    }

    // ── Spawn position: random angle, 300-500 units from player ───────
    let angle = rng.gen::<f32>() * std::f32::consts::TAU;
    let distance = rng.gen_range(300.0..500.0_f32);
    let spawn_x = player_x + angle.cos() * distance;
    let spawn_y = player_y + angle.sin() * distance;

    // ── Choose rogue type based on game phase ─────────────────────────
    let roll: f32 = rng.gen();
    let rogue_kind = match game_state.phase {
        GamePhase::Hut => {
            if roll < 0.70 {
                RogueTypeKind::Swarm
            } else {
                RogueTypeKind::Corruptor
            }
        }
        GamePhase::Outpost => {
            if roll < 0.40 {
                RogueTypeKind::Swarm
            } else if roll < 0.70 {
                RogueTypeKind::Corruptor
            } else if roll < 0.85 {
                RogueTypeKind::Looper
            } else {
                RogueTypeKind::TokenDrain
            }
        }
        GamePhase::Village | GamePhase::Network | GamePhase::City => {
            if roll < 0.25 {
                RogueTypeKind::Swarm
            } else if roll < 0.45 {
                RogueTypeKind::Corruptor
            } else if roll < 0.60 {
                RogueTypeKind::Looper
            } else if roll < 0.75 {
                RogueTypeKind::TokenDrain
            } else if roll < 0.85 {
                RogueTypeKind::Assassin
            } else if roll < 0.95 {
                RogueTypeKind::Mimic
            } else {
                RogueTypeKind::Architect
            }
        }
    };

    // ── HP and damage by type ─────────────────────────────────────────
    let (hp, _damage) = match rogue_kind {
        RogueTypeKind::Swarm => (15, 3),
        RogueTypeKind::Corruptor => (40, 5),
        RogueTypeKind::Looper => (25, 2),
        RogueTypeKind::TokenDrain => (20, 1),
        RogueTypeKind::Assassin => (35, 15),
        RogueTypeKind::Mimic => (30, 8),
        RogueTypeKind::Architect => (80, 10),
    };

    // ── Visibility: TokenDrain starts invisible ───────────────────────
    let visible = rogue_kind != RogueTypeKind::TokenDrain;

    // ── Spawn the rogue entity ────────────────────────────────────────
    world.spawn((
        Rogue,
        Position {
            x: spawn_x,
            y: spawn_y,
        },
        Velocity::default(),
        Collider { radius: 6.0 },
        Health {
            current: hp,
            max: hp,
        },
        RogueType { kind: rogue_kind },
        RogueAI {
            behavior_state: RogueBehaviorState::Wandering,
            target: None,
        },
        RogueVisibility { visible },
    ));
}
