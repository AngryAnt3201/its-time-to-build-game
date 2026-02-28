// ── Core type aliases ──────────────────────────────────────────────

export type EntityId = number;
export type Tick = number;

// ── Geometry ───────────────────────────────────────────────────────

export interface Vec2 {
  x: number;
  y: number;
}

// ── Player ─────────────────────────────────────────────────────────

export interface PlayerSnapshot {
  position: Vec2;
  health: number;
  max_health: number;
  tokens: number;
  torch_range: number;
}

// ── Entities ───────────────────────────────────────────────────────

// Unit-variant enum serializes as plain strings
export type EntityKind = "Agent" | "Building" | "Rogue" | "Item";

export interface EntityDelta {
  id: EntityId;
  kind: EntityKind;
  position: Vec2;
  data: EntityData;
}

// Serde externally-tagged enum: { "VariantName": { ...fields } }
export type EntityData =
  | { Agent: AgentData }
  | { Building: BuildingData }
  | { Rogue: RogueData }
  | { Item: ItemData };

export interface AgentData {
  name: string;
  state: AgentStateKind;
  tier: AgentTierKind;
  health_pct: number;
  morale_pct: number;
  stars: number;
  turns_used: number;
  max_turns: number;
  model_lore_name: string;
  xp: number;
  level: number;
}

export interface BuildingData {
  building_type: BuildingTypeKind;
  construction_pct: number;
  health_pct: number;
}

export interface RogueData {
  rogue_type: RogueTypeKind;
  health_pct: number;
}

export interface ItemData {
  item_type: string;
}

// ── Agent enums ────────────────────────────────────────────────────

export type AgentStateKind =
  | "Idle"
  | "Building"
  | "Erroring"
  | "Exploring"
  | "Defending"
  | "Critical"
  | "Unresponsive";

export type AgentTierKind =
  | "Apprentice"
  | "Journeyman"
  | "Artisan"
  | "Architect";

// ── Building types ─────────────────────────────────────────────────

export type BuildingTypeKind =
  // Infrastructure
  | "Pylon"
  | "ComputeFarm"
  | "Barracks"
  | "ResearchLab"
  | "Armory"
  // Tier 1
  | "TodoApp"
  | "Calculator"
  | "LandingPage"
  | "PortfolioSite"
  | "PomodoroTimer"
  | "WeatherApp"
  | "ColourPickerTool"
  // Tier 2
  | "RestApi"
  | "AuthenticationSystem"
  | "Database"
  | "AdminDashboard"
  | "SearchBar"
  | "FormWithValidation"
  | "MarkdownEditor"
  | "BudgetTracker"
  // Tier 3
  | "CiCdPipeline"
  | "UnitTestSuite"
  | "CliTool"
  | "BrowserExtension"
  | "RecommendationEngine"
  | "NotificationSystem"
  | "RateLimiter"
  | "OauthIntegration"
  | "WebsocketServer"
  // Tier 4
  | "MachineLearningModel"
  | "VectorDatabase"
  | "GraphqlApi"
  | "TransformerModel"
  | "RagPipeline"
  | "AutonomousAgentFramework"
  // Secret
  | "WordleClone"
  | "NftMarketplace"
  | "Blockchain"
  | "AnotherTodoApp"
  | "HackerNewsClone"
  | "MyFirstPortfolio";

// ── Rogue types ────────────────────────────────────────────────────

export type RogueTypeKind =
  | "Corruptor"
  | "Looper"
  | "TokenDrain"
  | "Assassin"
  | "Swarm"
  | "Mimic"
  | "Architect";

// ── Fog of war / chunks ────────────────────────────────────────────

export interface ChunkPos {
  x: number;
  y: number;
}

export interface FogTile {
  light_level: number;
}

// ── Logging ────────────────────────────────────────────────────────

export interface LogEntry {
  tick: Tick;
  text: string;
  category: LogCategory;
}

export type LogCategory =
  | "System"
  | "Agent"
  | "Combat"
  | "Economy"
  | "Exploration"
  | "Building";

// ── Audio ──────────────────────────────────────────────────────────

// Unit-variant enum serializes as plain strings
export type AudioEvent =
  | "AgentSpeak"
  | "CombatHit"
  | "BuildComplete"
  | "RogueSpawn"
  | "CrankTurn"
  | "AgentDeath";

// ── Economy ────────────────────────────────────────────────────────

export interface EconomySnapshot {
  balance: number;
  income_per_sec: number;
  expenditure_per_sec: number;
}

// ── Debug snapshot ─────────────────────────────────────────────────

export interface DebugSnapshot {
  spawning_enabled: boolean;
  god_mode: boolean;
  phase: string;
  crank_tier: string;
}

// ── Project Management ──────────────────────────────────────────────

export interface ProjectManagerState {
  base_dir: string | null;
  initialized: boolean;
  unlocked_buildings: string[];
  building_statuses: Record<string, string>;
}

// ── Main game state update (Server -> Client) ─────────────────────

export interface GameStateUpdate {
  tick: Tick;
  player: PlayerSnapshot;
  entities_changed: EntityDelta[];
  entities_removed: EntityId[];
  fog_updates: [ChunkPos, FogTile[]][];
  economy: EconomySnapshot;
  log_entries: LogEntry[];
  audio_triggers: AudioEvent[];
  debug: DebugSnapshot;
  project_manager: ProjectManagerState | null;
}

// ── Client -> Server messages ──────────────────────────────────────

// Serde externally-tagged enum: unit variants serialize as plain strings,
// struct variants as { "VariantName": { ...fields } }
export type PlayerAction =
  | "Attack"
  | "Interact"
  | "AssignTask"
  | "OpenBuildMenu"
  | { PlaceBuilding: { building_type: BuildingTypeKind; x: number; y: number } }
  | "CrankStart"
  | "CrankStop"
  | "RollbackAgent"
  // Debug actions
  | { DebugSetTokens: { amount: number } }
  | { DebugAddTokens: { amount: number } }
  | "DebugToggleSpawning"
  | "DebugClearRogues"
  | { DebugSetPhase: { phase: string } }
  | { DebugSetCrankTier: { tier: string } }
  | "DebugToggleGodMode"
  | { DebugSpawnRogue: { rogue_type: RogueTypeKind } }
  | "DebugHealPlayer"
  | { DebugSpawnAgent: { tier: AgentTierKind } }
  | "DebugClearAgents"
  // Project management actions
  | { SetProjectDirectory: { path: string } }
  | "InitializeProjects"
  | "ResetProjects"
  | { StartDevServer: { building_id: string } }
  | { StopDevServer: { building_id: string } }
  | { AssignAgentToProject: { agent_id: number; building_id: string } }
  | { UnassignAgentFromProject: { agent_id: number; building_id: string } }
  | "DebugUnlockAllBuildings"
  | "DebugLockAllBuildings"
  | { UnlockBuilding: { building_id: string } };

export type TaskAssignment =
  | "Build"
  | "Explore"
  | "Guard"
  | "Crank"
  | "Idle";

export interface PlayerInput {
  tick: Tick;
  movement: Vec2;
  action: PlayerAction | null;
  target: EntityId | null;
}
