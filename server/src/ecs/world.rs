use hecs::World;

use crate::protocol::{AgentStateKind, AgentTierKind, BuildingTypeKind, TaskAssignment};

use crate::game::upgrades::UpgradeState;

use super::components::{
    Agent, AgentMorale, AgentName, AgentPersonality, AgentState, AgentStats, AgentTier, AgentXP,
    AgentVibeConfig, Assignment, Building, BuildingEffects, BuildingType, CarryCapacity,
    ConstructionProgress, CrankState, CrankTier, GamePhase, GameState, Health, LightSource,
    Player, Position, Recruitable, TokenEconomy, TorchRange, Velocity, VoiceProfile, WanderState,
    WeaponType, ArmorType, Facing,
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
    // Split into two steps to stay within hecs' tuple-size limit.
    let sol = world.spawn((
        Agent,
        AgentName {
            name: "sol".to_string(),
        },
        Position { x: 400.0, y: 390.0 },
        Velocity::default(),
        AgentTier {
            tier: AgentTierKind::Apprentice,
        },
        AgentState {
            state: AgentStateKind::Dormant,
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
    world.insert(sol, (
        Recruitable { cost: 10 },
        AgentVibeConfig {
            model_id: "ministral-3b-2501".to_string(),
            model_lore_name: "ministral-3b".to_string(),
            max_turns: 5,
            turns_used: 0,
            context_window: 32000,
            token_burn_rate: 3,
            error_chance_base: 0.15,
            stars: 1,
        },
        WanderState {
            home_x: 400.0,
            home_y: 390.0,
            waypoint_x: 400.0,
            waypoint_y: 390.0,
            pause_remaining: 0,
            wander_radius: 120.0,
            walk_target: None,
        },
    )).unwrap();

    // ── Spawn Token Wheel (pre-built at spawn) ─────────────────
    world.spawn((
        Building,
        Position { x: 310.0, y: 300.0 },
        BuildingType { kind: BuildingTypeKind::TokenWheel },
        ConstructionProgress {
            current: 1.0,
            total: 1.0,
            assigned_agents: Vec::new(),
        },
        Health { current: 100, max: 100 },
        BuildingEffects { effects: vec![] },
        LightSource { radius: 60.0, color: (0.9, 0.75, 0.3) },
    ));

    // ── Spawn Crafting Table (pre-built at spawn) ──────────────
    world.spawn((
        Building,
        Position { x: 490.0, y: 300.0 },
        BuildingType { kind: BuildingTypeKind::CraftingTable },
        ConstructionProgress {
            current: 1.0,
            total: 1.0,
            assigned_agents: Vec::new(),
        },
        Health { current: 100, max: 100 },
        BuildingEffects { effects: vec![] },
        LightSource { radius: 40.0, color: (0.7, 0.6, 0.3) },
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
            tokens_per_rotation: 0.02,
        },
        economy: TokenEconomy {
            balance: 0,
            fractional: 0.0,
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
        player_dead: false,
        death_tick: None,
        inventory: Vec::new(),
    };

    (world, game_state)
}
