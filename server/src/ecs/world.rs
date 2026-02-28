use hecs::World;

use crate::protocol::{AgentStateKind, AgentTierKind, TaskAssignment};

use crate::game::upgrades::UpgradeState;

use super::components::{
    Agent, AgentMorale, AgentName, AgentPersonality, AgentState, AgentStats, AgentTier, AgentXP,
    ArmorType, Assignment, CrankState, CrankTier, CarryCapacity, Facing,
    GamePhase, GameState, Health, Player, Position, TokenEconomy, TorchRange, Velocity,
    VoiceProfile, WeaponType,
};
use super::weapon_stats;

/// Creates a new ECS world pre-populated with the player and one starting
/// agent, along with the initial `GameState` resource.
pub fn create_world() -> (World, GameState) {
    let mut world = World::new();

    // ── Spawn the Player entity ──────────────────────────────────────
    world.spawn((
        Player,
        Position { x: 400.0, y: 300.0 },
        Velocity::default(),
        Health {
            current: 100,
            max: 100,
        },
        TorchRange { radius: 120.0 },
        CarryCapacity { current: 0, max: 5 },
        weapon_stats::weapon_stats(WeaponType::ProcessTerminator),
        weapon_stats::armor_stats(ArmorType::BasePrompt),
        Facing::default(),
    ));

    // ── Spawn starting agent "sol" ───────────────────────────────────
    world.spawn((
        Agent,
        AgentName {
            name: "sol".to_string(),
        },
        Position { x: 420.0, y: 320.0 },
        Velocity::default(),
        AgentTier {
            tier: AgentTierKind::Apprentice,
        },
        AgentState {
            state: AgentStateKind::Idle,
        },
        AgentMorale { value: 0.7 },
        AgentXP { xp: 0, level: 1 },
        AgentStats {
            reliability: 0.6,
            speed: 1.0,
            awareness: 80.0,
            resilience: 50.0,
        },
        AgentPersonality {
            traits: vec!["curious".to_string(), "diligent".to_string()],
        },
        VoiceProfile {
            voice_id: "sol_default".to_string(),
        },
        Assignment {
            task: TaskAssignment::Idle,
        },
        Health {
            current: 50,
            max: 50,
        },
    ));

    // ── Initial GameState ────────────────────────────────────────────
    let game_state = GameState {
        phase: GamePhase::Hut,
        tick: 0,
        crank: CrankState {
            heat: 0.0,
            max_heat: 100.0,
            heat_rate: 1.0,
            cool_rate: 0.5,
            tier: CrankTier::HandCrank,
            is_cranking: false,
            assigned_agent: None,
            tokens_per_rotation: 1.0,
        },
        economy: TokenEconomy {
            balance: 50,
            income_per_tick: 0.0,
            expenditure_per_tick: 0.0,
            income_sources: vec![],
            expenditure_sinks: vec![],
        },
        cascade_active: false,
        city_reached_tick: None,
        upgrades: UpgradeState::new(),
        spawning_enabled: true,
        god_mode: false,
    };

    (world, game_state)
}
