import type { BuildingTypeKind } from '../network/protocol';

// ── Material IDs ─────────────────────────────────────────────────────

export type MaterialId =
  | 'iron_powder'
  | 'liquid_gold'
  | 'mana'
  | 'metal_ring'
  | 'ore_coin'
  | 'wood';

// ── Material definition ──────────────────────────────────────────────

export interface MaterialDef {
  id: MaterialId;
  name: string;
  icon: string;
  rarity: 'common' | 'uncommon' | 'rare';
  dropWeight: number;
}

// ── All materials ────────────────────────────────────────────────────

export const ALL_MATERIALS: MaterialDef[] = [
  { id: 'iron_powder',  name: 'Iron Powder',  icon: 'iron_powder.png',  rarity: 'common',   dropWeight: 30 },
  { id: 'wood',         name: 'Wood',         icon: 'wood.png',         rarity: 'common',   dropWeight: 30 },
  { id: 'metal_ring',   name: 'Metal Ring',   icon: 'metal_ring.png',   rarity: 'common',   dropWeight: 25 },
  { id: 'ore_coin',     name: 'Ore Coin',     icon: 'ore_coin.png',     rarity: 'uncommon', dropWeight: 15 },
  { id: 'liquid_gold',  name: 'Liquid Gold',  icon: 'liquid_gold.png',  rarity: 'uncommon', dropWeight: 12 },
  { id: 'mana',         name: 'Mana',         icon: 'mana.png',         rarity: 'rare',     dropWeight: 8  },
];

// ── Blueprint definition ─────────────────────────────────────────────

export interface BlueprintDef {
  buildingType: BuildingTypeKind;
  icon: string;
}

// ── All blueprints ───────────────────────────────────────────────────

export const BLUEPRINTS: BlueprintDef[] = [
  // Infrastructure
  { buildingType: 'Pylon',              icon: '/blueprints/fc1246.png' },
  { buildingType: 'ComputeFarm',        icon: '/blueprints/fc1256.png' },
  // Tier 1
  { buildingType: 'TodoApp',            icon: '/blueprints/fc1261.png' },
  { buildingType: 'Calculator',         icon: '/blueprints/fc1262.png' },
  { buildingType: 'LandingPage',        icon: '/blueprints/fc1263.png' },
  // Tier 2
  { buildingType: 'WeatherDashboard',   icon: '/blueprints/fc1267.png' },
  { buildingType: 'ChatApp',            icon: '/blueprints/fc1269.png' },
  { buildingType: 'KanbanBoard',        icon: '/blueprints/fc1272.png' },
  // Tier 3
  { buildingType: 'EcommerceStore',     icon: '/blueprints/fc1276.png' },
  { buildingType: 'AiImageGenerator',   icon: '/blueprints/fc1277.png' },
  { buildingType: 'ApiDashboard',       icon: '/blueprints/fc1278.png' },
  // Tier 4
  { buildingType: 'Blockchain',         icon: '/blueprints/fc1279.png' },
];

// ── Recipe category ──────────────────────────────────────────────────

export type RecipeCategory = 'app' | 'weapon' | 'armour' | 'upgrade';

// ── Crafting recipe definition ───────────────────────────────────────

export interface CraftingRecipe {
  id: string;
  category: RecipeCategory;
  name: string;
  description: string;
  result: string;
  ingredients: { material: MaterialId; count: number }[];
  blueprint?: BuildingTypeKind;
  tokenCost?: number;
  prerequisite?: string;
}

// ── All recipes ──────────────────────────────────────────────────────

export const ALL_RECIPES: CraftingRecipe[] = [

  // ── Apps — Tier 1 (2-3 materials + blueprint) ────────────────────
  {
    id: 'app_todo',
    category: 'app',
    name: 'Todo App',
    description: 'A task manager with CRUD, drag-and-drop reordering, and filters.',
    result: 'TodoApp',
    ingredients: [
      { material: 'wood', count: 2 },
      { material: 'iron_powder', count: 1 },
    ],
    blueprint: 'TodoApp',
  },
  {
    id: 'app_calculator',
    category: 'app',
    name: 'Calculator',
    description: 'A scientific calculator with history tape and keyboard input.',
    result: 'Calculator',
    ingredients: [
      { material: 'metal_ring', count: 2 },
      { material: 'iron_powder', count: 1 },
    ],
    blueprint: 'Calculator',
  },
  {
    id: 'app_landing_page',
    category: 'app',
    name: 'Landing Page',
    description: 'A single-page marketing site with hero, features, and CTA sections.',
    result: 'LandingPage',
    ingredients: [
      { material: 'wood', count: 2 },
      { material: 'ore_coin', count: 1 },
    ],
    blueprint: 'LandingPage',
  },

  // ── Apps — Tier 2 (3-4 materials + blueprint) ────────────────────
  {
    id: 'app_weather_dashboard',
    category: 'app',
    name: 'Weather Dashboard',
    description: 'A live weather dashboard with forecasts, maps, and location search.',
    result: 'WeatherDashboard',
    ingredients: [
      { material: 'iron_powder', count: 2 },
      { material: 'liquid_gold', count: 1 },
      { material: 'ore_coin', count: 1 },
    ],
    blueprint: 'WeatherDashboard',
  },
  {
    id: 'app_chat',
    category: 'app',
    name: 'Chat App',
    description: 'A real-time messaging app with rooms, typing indicators, and history.',
    result: 'ChatApp',
    ingredients: [
      { material: 'metal_ring', count: 2 },
      { material: 'mana', count: 1 },
      { material: 'wood', count: 1 },
    ],
    blueprint: 'ChatApp',
  },
  {
    id: 'app_kanban',
    category: 'app',
    name: 'Kanban Board',
    description: 'A project management board with columns, cards, and drag-and-drop.',
    result: 'KanbanBoard',
    ingredients: [
      { material: 'wood', count: 2 },
      { material: 'iron_powder', count: 1 },
      { material: 'liquid_gold', count: 1 },
    ],
    blueprint: 'KanbanBoard',
  },

  // ── Apps — Tier 3 (4-5 materials + blueprint) ────────────────────
  {
    id: 'app_ecommerce',
    category: 'app',
    name: 'E-commerce Store',
    description: 'A storefront with product catalog, cart, and checkout flow.',
    result: 'EcommerceStore',
    ingredients: [
      { material: 'liquid_gold', count: 2 },
      { material: 'ore_coin', count: 2 },
      { material: 'metal_ring', count: 1 },
    ],
    blueprint: 'EcommerceStore',
  },
  {
    id: 'app_ai_image',
    category: 'app',
    name: 'AI Image Generator',
    description: 'An image generation UI with prompt input, gallery, and style controls.',
    result: 'AiImageGenerator',
    ingredients: [
      { material: 'mana', count: 2 },
      { material: 'liquid_gold', count: 1 },
      { material: 'iron_powder', count: 2 },
    ],
    blueprint: 'AiImageGenerator',
  },
  {
    id: 'app_api_dashboard',
    category: 'app',
    name: 'API Dashboard',
    description: 'An API monitoring dashboard with endpoint stats and request logs.',
    result: 'ApiDashboard',
    ingredients: [
      { material: 'metal_ring', count: 2 },
      { material: 'ore_coin', count: 2 },
      { material: 'mana', count: 1 },
    ],
    blueprint: 'ApiDashboard',
  },

  // ── Apps — Tier 4 (6+ materials + blueprint) ─────────────────────
  {
    id: 'app_blockchain',
    category: 'app',
    name: 'Blockchain',
    description: 'A blockchain explorer with block visualization and transaction history.',
    result: 'Blockchain',
    ingredients: [
      { material: 'mana', count: 3 },
      { material: 'liquid_gold', count: 2 },
      { material: 'ore_coin', count: 2 },
      { material: 'iron_powder', count: 1 },
    ],
    blueprint: 'Blockchain',
  },

  // ── Weapons ──────────────────────────────────────────────────────
  {
    id: 'weapon_shortsword',
    category: 'weapon',
    name: 'Shortsword',
    description: 'A simple blade. Quick and reliable.',
    result: 'shortsword',
    ingredients: [
      { material: 'iron_powder', count: 2 },
      { material: 'wood', count: 1 },
    ],
  },
  {
    id: 'weapon_greatsword',
    category: 'weapon',
    name: 'Greatsword',
    description: 'A massive two-handed blade. Slow but devastating.',
    result: 'greatsword',
    ingredients: [
      { material: 'iron_powder', count: 3 },
      { material: 'metal_ring', count: 2 },
      { material: 'liquid_gold', count: 1 },
    ],
  },
  {
    id: 'weapon_staff',
    category: 'weapon',
    name: 'Staff',
    description: 'A wooden staff imbued with mana. Channels arcane energy.',
    result: 'staff',
    ingredients: [
      { material: 'wood', count: 3 },
      { material: 'mana', count: 1 },
    ],
  },
  {
    id: 'weapon_crossbow',
    category: 'weapon',
    name: 'Crossbow',
    description: 'A mechanical ranged weapon. Precision at a distance.',
    result: 'crossbow',
    ingredients: [
      { material: 'wood', count: 2 },
      { material: 'metal_ring', count: 2 },
      { material: 'ore_coin', count: 1 },
    ],
  },
  {
    id: 'weapon_torch',
    category: 'weapon',
    name: 'Torch',
    description: 'A burning brand. Lights the way and scorches enemies.',
    result: 'torch',
    ingredients: [
      { material: 'wood', count: 2 },
      { material: 'mana', count: 1 },
    ],
  },

  // ── Armour ───────────────────────────────────────────────────────
  {
    id: 'armour_cloth',
    category: 'armour',
    name: 'Cloth Armour',
    description: 'Light woven garments. Minimal protection, maximum mobility.',
    result: 'cloth',
    ingredients: [
      { material: 'wood', count: 2 },
    ],
  },
  {
    id: 'armour_leather',
    category: 'armour',
    name: 'Leather Armour',
    description: 'Tanned hide layered for protection. Balanced defense.',
    result: 'leather',
    ingredients: [
      { material: 'wood', count: 2 },
      { material: 'iron_powder', count: 1 },
    ],
  },
  {
    id: 'armour_chain',
    category: 'armour',
    name: 'Chain Armour',
    description: 'Interlocking metal rings. Sturdy against slashing attacks.',
    result: 'chain',
    ingredients: [
      { material: 'metal_ring', count: 3 },
      { material: 'iron_powder', count: 2 },
    ],
  },
  {
    id: 'armour_plate',
    category: 'armour',
    name: 'Plate Armour',
    description: 'Full plate forged with liquid gold. Maximum protection.',
    result: 'plate',
    ingredients: [
      { material: 'metal_ring', count: 3 },
      { material: 'iron_powder', count: 2 },
      { material: 'liquid_gold', count: 2 },
    ],
  },

  // ── Agent Upgrades — Tier 1 ──────────────────────────────────────
  {
    id: 'upgrade_expanded_context',
    category: 'upgrade',
    name: 'Expanded Context Window',
    description: 'Increases the agent context window, allowing longer reasoning chains.',
    result: 'ExpandedContextWindow',
    ingredients: [
      { material: 'wood', count: 1 },
    ],
    tokenCost: 100,
  },
  {
    id: 'upgrade_verbose_logging',
    category: 'upgrade',
    name: 'Verbose Logging',
    description: 'Enables detailed output logs for agent actions and decisions.',
    result: 'VerboseLogging',
    ingredients: [
      { material: 'ore_coin', count: 1 },
    ],
    tokenCost: 75,
  },
  {
    id: 'upgrade_token_compression',
    category: 'upgrade',
    name: 'Token Compression',
    description: 'Reduces token consumption per action through efficient encoding.',
    result: 'TokenCompression',
    ingredients: [
      { material: 'iron_powder', count: 1 },
    ],
    tokenCost: 120,
  },

  // ── Agent Upgrades — Tier 2 ──────────────────────────────────────
  {
    id: 'upgrade_git_access',
    category: 'upgrade',
    name: 'Git Access',
    description: 'Grants the agent access to version control operations.',
    result: 'GitAccess',
    ingredients: [
      { material: 'metal_ring', count: 1 },
      { material: 'ore_coin', count: 1 },
    ],
    tokenCost: 200,
    prerequisite: 'ExpandedContextWindow',
  },
  {
    id: 'upgrade_web_search',
    category: 'upgrade',
    name: 'Web Search',
    description: 'Allows the agent to search the web for information.',
    result: 'WebSearch',
    ingredients: [
      { material: 'mana', count: 1 },
      { material: 'wood', count: 1 },
    ],
    tokenCost: 180,
    prerequisite: 'VerboseLogging',
  },
  {
    id: 'upgrade_filesystem_access',
    category: 'upgrade',
    name: 'File System Access',
    description: 'Enables direct file system read/write operations.',
    result: 'FileSystemAccess',
    ingredients: [
      { material: 'iron_powder', count: 2 },
    ],
    tokenCost: 250,
    prerequisite: 'TokenCompression',
  },
  {
    id: 'upgrade_crank_assignment',
    category: 'upgrade',
    name: 'Crank Assignment',
    description: 'Allows the agent to be assigned to cranking tasks.',
    result: 'CrankAssignment',
    ingredients: [
      { material: 'metal_ring', count: 1 },
      { material: 'wood', count: 1 },
    ],
    tokenCost: 150,
    prerequisite: 'TokenCompression',
  },

  // ── Agent Upgrades — Tier 3 ──────────────────────────────────────
  {
    id: 'upgrade_multi_agent',
    category: 'upgrade',
    name: 'Multi-Agent Coordination',
    description: 'Enables coordination between multiple agents for complex tasks.',
    result: 'MultiAgentCoordination',
    ingredients: [
      { material: 'mana', count: 1 },
      { material: 'liquid_gold', count: 1 },
      { material: 'ore_coin', count: 1 },
    ],
    tokenCost: 400,
    prerequisite: 'GitAccess',
  },
  {
    id: 'upgrade_persistent_memory',
    category: 'upgrade',
    name: 'Persistent Memory',
    description: 'Gives the agent persistent memory across sessions.',
    result: 'PersistentMemory',
    ingredients: [
      { material: 'mana', count: 2 },
      { material: 'metal_ring', count: 1 },
    ],
    tokenCost: 350,
    prerequisite: 'WebSearch',
  },
  {
    id: 'upgrade_autonomous_scouting',
    category: 'upgrade',
    name: 'Autonomous Scouting',
    description: 'Allows agents to independently explore and report findings.',
    result: 'AutonomousScouting',
    ingredients: [
      { material: 'liquid_gold', count: 1 },
      { material: 'wood', count: 2 },
    ],
    tokenCost: 300,
    prerequisite: 'FileSystemAccess',
  },

  // ── Agent Upgrades — Tier 4 ──────────────────────────────────────
  {
    id: 'upgrade_agent_spawning',
    category: 'upgrade',
    name: 'Agent Spawning',
    description: 'Enables spawning new agents dynamically for parallel work.',
    result: 'AgentSpawning',
    ingredients: [
      { material: 'mana', count: 2 },
      { material: 'liquid_gold', count: 2 },
    ],
    tokenCost: 600,
    prerequisite: 'MultiAgentCoordination',
  },
  {
    id: 'upgrade_distributed_compute',
    category: 'upgrade',
    name: 'Distributed Compute',
    description: 'Distributes computation across multiple nodes for faster processing.',
    result: 'DistributedCompute',
    ingredients: [
      { material: 'ore_coin', count: 2 },
      { material: 'mana', count: 1 },
      { material: 'iron_powder', count: 1 },
    ],
    tokenCost: 500,
    prerequisite: 'PersistentMemory',
  },
  {
    id: 'upgrade_alignment_protocols',
    category: 'upgrade',
    name: 'Alignment Protocols',
    description: 'Advanced alignment safeguards for autonomous agent behaviour.',
    result: 'AlignmentProtocols',
    ingredients: [
      { material: 'mana', count: 3 },
      { material: 'liquid_gold', count: 2 },
    ],
    tokenCost: 800,
    prerequisite: 'AutonomousScouting',
  },
];

// ── Helper functions ─────────────────────────────────────────────────

/** Look up a material definition by its ID. */
export function getMaterial(id: string): MaterialDef | undefined {
  return ALL_MATERIALS.find(m => m.id === id);
}

/** Get the blueprint definition for a given building type. */
export function getBlueprintForBuilding(type: BuildingTypeKind): BlueprintDef | undefined {
  return BLUEPRINTS.find(b => b.buildingType === type);
}

/** Get all recipes in a given category. */
export function getRecipesByCategory(cat: RecipeCategory): CraftingRecipe[] {
  return ALL_RECIPES.filter(r => r.category === cat);
}

/** Look up a single recipe by its ID. */
export function getRecipeById(id: string): CraftingRecipe | undefined {
  return ALL_RECIPES.find(r => r.id === id);
}

/** Build the inventory item-type string for a material. */
export function materialItemType(id: MaterialId): string {
  return `material:${id}`;
}

/** Build the inventory item-type string for a blueprint. */
export function blueprintItemType(buildingType: BuildingTypeKind): string {
  return `blueprint:${buildingType}`;
}

/**
 * Check whether a recipe can be crafted given the player's current
 * inventory, token balance, and set of already-purchased upgrades.
 */
export function canCraft(
  recipe: CraftingRecipe,
  inventory: Map<string, number>,
  tokens: number,
  purchasedUpgrades: Set<string>,
): boolean {
  // Check prerequisite upgrade
  if (recipe.prerequisite && !purchasedUpgrades.has(recipe.prerequisite)) {
    return false;
  }

  // Check token cost
  if (recipe.tokenCost !== undefined && tokens < recipe.tokenCost) {
    return false;
  }

  // Check blueprint requirement
  if (recipe.blueprint) {
    const bpKey = blueprintItemType(recipe.blueprint);
    if (!inventory.has(bpKey) || (inventory.get(bpKey) ?? 0) < 1) {
      return false;
    }
  }

  // Check material ingredients
  for (const ing of recipe.ingredients) {
    const matKey = materialItemType(ing.material);
    if ((inventory.get(matKey) ?? 0) < ing.count) {
      return false;
    }
  }

  return true;
}
