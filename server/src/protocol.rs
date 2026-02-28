use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ── Core type aliases ──────────────────────────────────────────────

pub type EntityId = u64;
pub type Tick = u64;

// ── Geometry ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default)]
pub struct Vec2 {
    pub x: f32,
    pub y: f32,
}

// ── Player ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayerSnapshot {
    pub position: Vec2,
    pub health: f32,
    pub max_health: f32,
    pub tokens: i64,
    pub torch_range: f32,
    pub facing: Vec2,
}

// ── Entities ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum EntityKind {
    Agent,
    Building,
    Rogue,
    Item,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntityDelta {
    pub id: EntityId,
    pub kind: EntityKind,
    pub position: Vec2,
    pub data: EntityData,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum EntityData {
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
    },
    Building {
        building_type: BuildingTypeKind,
        construction_pct: f32,
        health_pct: f32,
    },
    Rogue {
        rogue_type: RogueTypeKind,
        health_pct: f32,
    },
    Item {
        item_type: String,
    },
}

// ── Agent enums ────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AgentStateKind {
    Idle,
    Walking,
    Building,
    Erroring,
    Exploring,
    Defending,
    Critical,
    Unresponsive,
    Dormant,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AgentTierKind {
    Apprentice,
    Journeyman,
    Artisan,
    Architect,
}

// ── Building types ─────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum BuildingTypeKind {
    // Infrastructure
    Pylon,
    ComputeFarm,

    // Tier 1
    TodoApp,
    Calculator,
    LandingPage,

    // Tier 2
    WeatherDashboard,
    ChatApp,
    KanbanBoard,

    // Tier 3
    EcommerceStore,
    AiImageGenerator,
    ApiDashboard,

    // Tier 4
    Blockchain,

    // Home Base
    TokenWheel,
    CraftingTable,
}

// ── Rogue types ────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RogueTypeKind {
    Corruptor,
    Looper,
    TokenDrain,
    Assassin,
    Swarm,
    Mimic,
    Architect,
}

// ── Fog of war / chunks ────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct ChunkPos {
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct FogTile {
    pub light_level: f32,
}

// ── Logging ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub tick: Tick,
    pub text: String,
    pub category: LogCategory,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum LogCategory {
    System,
    Agent,
    Combat,
    Economy,
    Exploration,
    Building,
}

// ── Audio ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AudioEvent {
    AgentSpeak,
    CombatHit,
    BuildComplete,
    RogueSpawn,
    CrankTurn,
    AgentDeath,
}

// ── Economy ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EconomySnapshot {
    pub balance: i64,
    pub income_per_sec: f64,
    pub expenditure_per_sec: f64,
}

// ── Debug snapshot ─────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DebugSnapshot {
    pub spawning_enabled: bool,
    pub god_mode: bool,
    pub phase: String,
    pub crank_tier: String,
}

// ── Project manager ───────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectManagerState {
    pub base_dir: Option<String>,
    pub initialized: bool,
    pub unlocked_buildings: Vec<String>,
    pub building_statuses: HashMap<String, String>, // building_id -> status string
    pub agent_assignments: HashMap<String, Vec<u64>>, // building_id -> agent entity ids
}

// ── Main game state update (Server → Client) ──────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameStateUpdate {
    pub tick: Tick,
    pub player: PlayerSnapshot,
    pub entities_changed: Vec<EntityDelta>,
    pub entities_removed: Vec<EntityId>,
    pub fog_updates: Vec<(ChunkPos, Vec<FogTile>)>,
    pub economy: EconomySnapshot,
    pub log_entries: Vec<LogEntry>,
    pub audio_triggers: Vec<AudioEvent>,
    pub debug: DebugSnapshot,
    pub project_manager: Option<ProjectManagerState>,
}

// ── Client → Server messages ───────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PlayerAction {
    Attack,
    Interact,
    AssignTask,
    OpenBuildMenu,
    PlaceBuilding {
        building_type: BuildingTypeKind,
        x: f32,
        y: f32,
    },
    CrankStart,
    CrankStop,
    RollbackAgent,
    EquipWeapon { weapon_id: String },
    EquipArmor { armor_id: String },

    // Debug actions
    DebugSetTokens { amount: i64 },
    DebugAddTokens { amount: i64 },
    DebugToggleSpawning,
    DebugClearRogues,
    DebugSetPhase { phase: String },
    DebugSetCrankTier { tier: String },
    DebugToggleGodMode,
    DebugSpawnRogue { rogue_type: RogueTypeKind },
    DebugHealPlayer,
    DebugSpawnAgent { tier: AgentTierKind },
    DebugClearAgents,

    // Project management actions
    SetProjectDirectory { path: String },
    InitializeProjects,
    ResetProjects,
    StartDevServer { building_id: String },
    StopDevServer { building_id: String },
    AssignAgentToProject { agent_id: u64, building_id: String },
    UnassignAgentFromProject { agent_id: u64, building_id: String },
    DebugUnlockAllBuildings,
    DebugLockAllBuildings,
    UnlockBuilding { building_id: String },

    // Vibe session actions
    VibeInput { agent_id: u64, data: String },
    SetMistralApiKey { key: String },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TaskAssignment {
    Build,
    Explore,
    Guard,
    Crank,
    Idle,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayerInput {
    pub tick: Tick,
    pub movement: Vec2,
    pub action: Option<PlayerAction>,
    pub target: Option<EntityId>,
}

/// Server-to-client message wrapper. All messages sent to the client
/// are wrapped in this enum so the client can distinguish between
/// game state updates and vibe terminal I/O.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ServerMessage {
    /// Normal game state update (20Hz).
    GameState(GameStateUpdate),
    /// Real-time PTY output from a vibe session.
    VibeOutput { agent_id: u64, data: Vec<u8> },
    /// Vibe session started.
    VibeSessionStarted { agent_id: u64 },
    /// Vibe session ended.
    VibeSessionEnded { agent_id: u64, reason: String },
}
