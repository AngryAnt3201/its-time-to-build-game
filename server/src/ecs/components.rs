use crate::game::upgrades::UpgradeState;
use crate::protocol::{AgentStateKind, AgentTierKind, BuildingTypeKind, RogueTypeKind, TaskAssignment};

// ── Marker Components ────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct Player;

#[derive(Debug, Clone)]
pub struct Agent;

#[derive(Debug, Clone)]
pub struct Building;

#[derive(Debug, Clone)]
pub struct Rogue;

#[derive(Debug, Clone)]
pub struct DroppedItem;

// ── Spatial ──────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct Position {
    pub x: f32,
    pub y: f32,
}

#[derive(Debug, Clone)]
pub struct Velocity {
    pub x: f32,
    pub y: f32,
}

impl Default for Velocity {
    fn default() -> Self {
        Self { x: 0.0, y: 0.0 }
    }
}

#[derive(Debug, Clone)]
pub struct Collider {
    pub radius: f32,
}

// ── Player Components ────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct Health {
    pub current: i32,
    pub max: i32,
}

#[derive(Debug, Clone)]
pub struct TorchRange {
    pub radius: f32,
}

#[derive(Debug, Clone)]
pub struct CarryCapacity {
    pub current: u32,
    pub max: u32,
}

#[derive(Debug, Clone)]
pub enum WeaponType {
    ProcessTerminator,
    HardReset,
    SignalJammer,
    NullPointer,
    Flare,
}

#[derive(Debug, Clone)]
pub struct CombatPower {
    pub base_damage: i32,
    pub attack_speed: f32,
    pub weapon: WeaponType,
}

#[derive(Debug, Clone)]
pub enum ArmorType {
    BasePrompt,
    FewShotPadding,
    ChainOfThoughtMail,
    ConstitutionalPlate,
}

#[derive(Debug, Clone)]
pub struct Armor {
    pub armor_type: ArmorType,
    pub damage_reduction: f32,
    pub speed_penalty: f32,
}

// ── Agent Components ─────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct AgentStats {
    pub reliability: f32,
    pub speed: f32,
    pub awareness: f32,
    pub resilience: f32,
}

#[derive(Debug, Clone)]
pub struct AgentState {
    pub state: AgentStateKind,
}

#[derive(Debug, Clone)]
pub struct AgentMorale {
    pub value: f32,
}

#[derive(Debug, Clone)]
pub struct AgentXP {
    pub xp: u64,
    pub level: u32,
}

#[derive(Debug, Clone)]
pub struct AgentTier {
    pub tier: AgentTierKind,
}

#[derive(Debug, Clone)]
pub struct AgentName {
    pub name: String,
}

#[derive(Debug, Clone)]
pub struct AgentPersonality {
    pub traits: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct VoiceProfile {
    pub voice_id: String,
}

#[derive(Debug, Clone)]
pub struct AgentVibeConfig {
    pub model_id: String,
    pub model_lore_name: String,
    pub max_turns: u32,
    pub turns_used: u32,
    pub context_window: u32,
    pub token_burn_rate: i64,
    pub error_chance_base: f32,
    pub stars: u8,
}

#[derive(Debug, Clone)]
pub struct Assignment {
    pub task: TaskAssignment,
}

// ── Building Components ──────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct BuildingType {
    pub kind: BuildingTypeKind,
}

#[derive(Debug, Clone)]
pub struct ConstructionProgress {
    pub current: f32,
    pub total: f32,
    pub assigned_agents: Vec<hecs::Entity>,
}

#[derive(Debug, Clone)]
pub struct LightSource {
    pub radius: f32,
    pub color: (f32, f32, f32),
}

#[derive(Debug, Clone)]
pub enum BuildingEffect {
    PassiveIncome(f64),
    AgentMoraleBoost(f32),
    ErrorRateReduction(f32),
    PylonRangeBoost(f32),
    BuildSpeedBoost(f32),
    CrankHeatReduction(f32),
}

#[derive(Debug, Clone)]
pub struct BuildingEffects {
    pub effects: Vec<BuildingEffect>,
}

// ── Rogue Components ─────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct RogueType {
    pub kind: RogueTypeKind,
}

#[derive(Debug, Clone)]
pub enum RogueBehaviorState {
    Wandering,
    Approaching,
    Attacking,
    Attached,
    Fleeing,
}

#[derive(Debug, Clone)]
pub struct RogueAI {
    pub behavior_state: RogueBehaviorState,
    pub target: Option<hecs::Entity>,
}

#[derive(Debug, Clone)]
pub struct RogueVisibility {
    pub visible: bool,
}

// ── World State (plain structs, not ECS entities) ────────────────────

#[derive(Debug, Clone)]
pub enum CrankTier {
    HandCrank,
    GearAssembly,
    WaterWheel,
    RunicEngine,
}

#[derive(Debug, Clone)]
pub struct CrankState {
    pub heat: f32,
    pub max_heat: f32,
    pub heat_rate: f32,
    pub cool_rate: f32,
    pub tier: CrankTier,
    pub is_cranking: bool,
    pub assigned_agent: Option<hecs::Entity>,
    pub tokens_per_rotation: f64,
}

#[derive(Debug, Clone)]
pub struct TokenEconomy {
    pub balance: i64,
    pub income_per_tick: f64,
    pub expenditure_per_tick: f64,
    pub income_sources: Vec<(String, f64)>,
    pub expenditure_sinks: Vec<(String, f64)>,
}

#[derive(Debug, Clone)]
pub enum GamePhase {
    Hut,
    Outpost,
    Village,
    Network,
    City,
}

#[derive(Debug, Clone)]
pub struct GameState {
    pub phase: GamePhase,
    pub tick: u64,
    pub crank: CrankState,
    pub economy: TokenEconomy,
    pub cascade_active: bool,
    pub city_reached_tick: Option<u64>,
    pub upgrades: UpgradeState,
    pub spawning_enabled: bool,
    pub god_mode: bool,
}

// ── Discovery Component ─────────────────────────────────────────────

use crate::game::exploration::DiscoveryKind;

#[derive(Debug, Clone)]
pub struct Discovery {
    pub kind: DiscoveryKind,
    pub interacted: bool,
}
