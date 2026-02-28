# Crafting & Blueprints Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a complete crafting system with blueprints, crafting materials, map chests, and an expanded inventory — enabling players to craft apps (blueprint + materials), weapons/armour (materials), and agent upgrades (tokens + materials).

**Architecture:** Client-first approach. All recipes defined in client TypeScript (`client/src/data/crafting.ts`). Server tracks inventory as a simple `Vec<InventoryItem>` and validates craft/pickup actions. Chests are placed client-side during chunk rendering using seeded noise, but opened via server action. The existing `crafting-modal.ts` is expanded from placeholder to a full 3-tab crafting interface.

**Tech Stack:** TypeScript (Pixi.js 8 + DOM), Rust (hecs ECS + Tokio), MessagePack binary protocol

---

### Task 1: Create Crafting Data — Recipes, Materials & Blueprint Mappings

**Files:**
- Create: `client/src/data/crafting.ts`

**Step 1: Create the crafting data file**

This file defines all crafting materials, blueprint-to-building mappings, and every recipe in the game. Infrastructure buildings (Pylon, ComputeFarm) do NOT require blueprints since they're basic buildings.

```ts
import type { BuildingTypeKind } from '../network/protocol';

// ── Crafting material types ─────────────────────────────────────────

export type MaterialId =
  | 'iron_powder'
  | 'liquid_gold'
  | 'mana'
  | 'metal_ring'
  | 'ore_coin'
  | 'wood';

export interface MaterialDef {
  id: MaterialId;
  name: string;
  icon: string;          // path under /icons/crafting_materials/
  rarity: 'common' | 'uncommon' | 'rare';
  dropWeight: number;    // relative weight for chest loot rolls
}

export const ALL_MATERIALS: MaterialDef[] = [
  { id: 'iron_powder', name: 'Iron Powder', icon: 'iron_powder.png', rarity: 'common', dropWeight: 30 },
  { id: 'wood',        name: 'Wood',        icon: 'wood.png',        rarity: 'common', dropWeight: 30 },
  { id: 'metal_ring',  name: 'Metal Ring',  icon: 'metal_ring.png',  rarity: 'common', dropWeight: 25 },
  { id: 'ore_coin',    name: 'Ore Coin',    icon: 'ore_coin.png',    rarity: 'uncommon', dropWeight: 15 },
  { id: 'liquid_gold', name: 'Liquid Gold',  icon: 'liquid_gold.png', rarity: 'uncommon', dropWeight: 12 },
  { id: 'mana',        name: 'Mana',        icon: 'mana.png',        rarity: 'rare', dropWeight: 8 },
];

export function getMaterial(id: string): MaterialDef | undefined {
  return ALL_MATERIALS.find(m => m.id === id);
}

// ── Blueprint mappings (building → blueprint icon) ──────────────────

export interface BlueprintDef {
  buildingType: BuildingTypeKind;
  icon: string;          // filename under /blueprints/
}

export const BLUEPRINTS: BlueprintDef[] = [
  { buildingType: 'Pylon',            icon: 'fc1246.png' },
  { buildingType: 'ComputeFarm',      icon: 'fc1256.png' },
  { buildingType: 'TodoApp',          icon: 'fc1261.png' },
  { buildingType: 'Calculator',       icon: 'fc1262.png' },
  { buildingType: 'LandingPage',      icon: 'fc1263.png' },
  { buildingType: 'WeatherDashboard', icon: 'fc1267.png' },
  { buildingType: 'ChatApp',          icon: 'fc1269.png' },
  { buildingType: 'KanbanBoard',      icon: 'fc1272.png' },
  { buildingType: 'EcommerceStore',    icon: 'fc1276.png' },
  { buildingType: 'AiImageGenerator', icon: 'fc1277.png' },
  { buildingType: 'ApiDashboard',     icon: 'fc1278.png' },
  { buildingType: 'Blockchain',       icon: 'fc1279.png' },
];

export function getBlueprintForBuilding(type: BuildingTypeKind): BlueprintDef | undefined {
  return BLUEPRINTS.find(b => b.buildingType === type);
}

// ── Recipe definitions ──────────────────────────────────────────────

export type RecipeCategory = 'app' | 'weapon' | 'armour' | 'upgrade';

export interface Ingredient {
  material: MaterialId;
  count: number;
}

export interface CraftingRecipe {
  id: string;
  category: RecipeCategory;
  name: string;
  description: string;
  result: string;          // building type, weapon id, armour id, or upgrade id
  ingredients: Ingredient[];
  blueprint?: BuildingTypeKind;  // required blueprint (apps only)
  tokenCost?: number;            // token cost (upgrades only)
  prerequisite?: string;         // upgrade prerequisite id (upgrades only)
}

export const ALL_RECIPES: CraftingRecipe[] = [
  // ── App Recipes (blueprint + materials) ───────────────────────────

  // Tier 1
  {
    id: 'craft_todo_app',
    category: 'app',
    name: 'Todo App',
    description: 'A task manager with CRUD and drag-and-drop.',
    result: 'TodoApp',
    blueprint: 'TodoApp',
    ingredients: [
      { material: 'wood', count: 2 },
      { material: 'iron_powder', count: 1 },
    ],
  },
  {
    id: 'craft_calculator',
    category: 'app',
    name: 'Calculator',
    description: 'A scientific calculator with history tape.',
    result: 'Calculator',
    blueprint: 'Calculator',
    ingredients: [
      { material: 'metal_ring', count: 2 },
      { material: 'iron_powder', count: 1 },
    ],
  },
  {
    id: 'craft_landing_page',
    category: 'app',
    name: 'Landing Page',
    description: 'A single-page marketing site.',
    result: 'LandingPage',
    blueprint: 'LandingPage',
    ingredients: [
      { material: 'wood', count: 2 },
      { material: 'ore_coin', count: 1 },
    ],
  },

  // Tier 2
  {
    id: 'craft_weather_dashboard',
    category: 'app',
    name: 'Weather Dashboard',
    description: 'A live weather dashboard with forecasts.',
    result: 'WeatherDashboard',
    blueprint: 'WeatherDashboard',
    ingredients: [
      { material: 'iron_powder', count: 2 },
      { material: 'liquid_gold', count: 1 },
      { material: 'ore_coin', count: 1 },
    ],
  },
  {
    id: 'craft_chat_app',
    category: 'app',
    name: 'Chat App',
    description: 'A real-time messaging app with rooms.',
    result: 'ChatApp',
    blueprint: 'ChatApp',
    ingredients: [
      { material: 'metal_ring', count: 2 },
      { material: 'mana', count: 1 },
      { material: 'wood', count: 1 },
    ],
  },
  {
    id: 'craft_kanban_board',
    category: 'app',
    name: 'Kanban Board',
    description: 'A project management board with columns.',
    result: 'KanbanBoard',
    blueprint: 'KanbanBoard',
    ingredients: [
      { material: 'wood', count: 2 },
      { material: 'iron_powder', count: 1 },
      { material: 'liquid_gold', count: 1 },
    ],
  },

  // Tier 3
  {
    id: 'craft_ecommerce_store',
    category: 'app',
    name: 'E-commerce Store',
    description: 'A storefront with product catalog and checkout.',
    result: 'EcommerceStore',
    blueprint: 'EcommerceStore',
    ingredients: [
      { material: 'liquid_gold', count: 2 },
      { material: 'ore_coin', count: 2 },
      { material: 'metal_ring', count: 1 },
    ],
  },
  {
    id: 'craft_ai_image_generator',
    category: 'app',
    name: 'AI Image Generator',
    description: 'An image generation UI with prompts and gallery.',
    result: 'AiImageGenerator',
    blueprint: 'AiImageGenerator',
    ingredients: [
      { material: 'mana', count: 2 },
      { material: 'liquid_gold', count: 1 },
      { material: 'iron_powder', count: 2 },
    ],
  },
  {
    id: 'craft_api_dashboard',
    category: 'app',
    name: 'API Dashboard',
    description: 'An API monitoring dashboard with stats.',
    result: 'ApiDashboard',
    blueprint: 'ApiDashboard',
    ingredients: [
      { material: 'metal_ring', count: 2 },
      { material: 'ore_coin', count: 2 },
      { material: 'mana', count: 1 },
    ],
  },

  // Tier 4
  {
    id: 'craft_blockchain',
    category: 'app',
    name: 'Blockchain',
    description: 'A blockchain explorer with block visualization.',
    result: 'Blockchain',
    blueprint: 'Blockchain',
    ingredients: [
      { material: 'mana', count: 3 },
      { material: 'liquid_gold', count: 2 },
      { material: 'ore_coin', count: 2 },
      { material: 'iron_powder', count: 1 },
    ],
  },

  // ── Weapon Recipes (materials only) ───────────────────────────────

  {
    id: 'craft_shortsword',
    category: 'weapon',
    name: 'Shortsword',
    description: 'Fast, low damage. Excellent against Swarms.',
    result: 'shortsword',
    ingredients: [
      { material: 'iron_powder', count: 2 },
      { material: 'wood', count: 1 },
    ],
  },
  {
    id: 'craft_greatsword',
    category: 'weapon',
    name: 'Greatsword',
    description: 'Slow, high damage. Staggers Corruptors.',
    result: 'greatsword',
    ingredients: [
      { material: 'iron_powder', count: 3 },
      { material: 'metal_ring', count: 2 },
      { material: 'liquid_gold', count: 1 },
    ],
  },
  {
    id: 'craft_staff',
    category: 'weapon',
    name: 'Staff',
    description: 'Interrupts Loopers. Moderate damage.',
    result: 'staff',
    ingredients: [
      { material: 'wood', count: 3 },
      { material: 'mana', count: 1 },
    ],
  },
  {
    id: 'craft_crossbow',
    category: 'weapon',
    name: 'Crossbow',
    description: 'Ranged. Essential for Token Drains.',
    result: 'crossbow',
    ingredients: [
      { material: 'wood', count: 2 },
      { material: 'metal_ring', count: 2 },
      { material: 'ore_coin', count: 1 },
    ],
  },
  {
    id: 'craft_torch',
    category: 'weapon',
    name: 'Torch Weapon',
    description: 'AOE light burst. Reveals hidden enemies.',
    result: 'torch',
    ingredients: [
      { material: 'wood', count: 2 },
      { material: 'mana', count: 1 },
    ],
  },

  // ── Armour Recipes (materials only) ────────────────────────────────

  {
    id: 'craft_cloth',
    category: 'armour',
    name: 'Cloth Armour',
    description: 'Minimal protection. No movement penalty.',
    result: 'cloth',
    ingredients: [
      { material: 'wood', count: 2 },
    ],
  },
  {
    id: 'craft_leather',
    category: 'armour',
    name: 'Leather Armour',
    description: 'Light and fast. Good for scouts.',
    result: 'leather',
    ingredients: [
      { material: 'wood', count: 2 },
      { material: 'iron_powder', count: 1 },
    ],
  },
  {
    id: 'craft_chain',
    category: 'armour',
    name: 'Chain Mail',
    description: 'Balanced protection. Reliable.',
    result: 'chain',
    ingredients: [
      { material: 'metal_ring', count: 3 },
      { material: 'iron_powder', count: 2 },
    ],
  },
  {
    id: 'craft_plate',
    category: 'armour',
    name: 'Plate Armour',
    description: 'Maximum protection, movement penalty.',
    result: 'plate',
    ingredients: [
      { material: 'metal_ring', count: 3 },
      { material: 'iron_powder', count: 2 },
      { material: 'liquid_gold', count: 2 },
    ],
  },

  // ── Agent Upgrade Recipes (tokens + materials) ─────────────────────

  // Tier 1
  {
    id: 'upgrade_expanded_context',
    category: 'upgrade',
    name: 'Expanded Context Window',
    description: 'Agents handle larger blueprints.',
    result: 'ExpandedContextWindow',
    tokenCost: 100,
    ingredients: [
      { material: 'wood', count: 1 },
    ],
  },
  {
    id: 'upgrade_verbose_logging',
    category: 'upgrade',
    name: 'Verbose Logging',
    description: 'Agent states visible further.',
    result: 'VerboseLogging',
    tokenCost: 75,
    ingredients: [
      { material: 'ore_coin', count: 1 },
    ],
  },
  {
    id: 'upgrade_token_compression',
    category: 'upgrade',
    name: 'Token Compression',
    description: 'Reduced upkeep.',
    result: 'TokenCompression',
    tokenCost: 120,
    ingredients: [
      { material: 'iron_powder', count: 1 },
    ],
  },

  // Tier 2
  {
    id: 'upgrade_git_access',
    category: 'upgrade',
    name: 'Git Access',
    description: 'Extended recovery window.',
    result: 'GitAccess',
    tokenCost: 200,
    prerequisite: 'ExpandedContextWindow',
    ingredients: [
      { material: 'metal_ring', count: 1 },
      { material: 'ore_coin', count: 1 },
    ],
  },
  {
    id: 'upgrade_web_search',
    category: 'upgrade',
    name: 'Web Search',
    description: 'Agents explore better.',
    result: 'WebSearch',
    tokenCost: 180,
    prerequisite: 'VerboseLogging',
    ingredients: [
      { material: 'mana', count: 1 },
      { material: 'wood', count: 1 },
    ],
  },
  {
    id: 'upgrade_file_system',
    category: 'upgrade',
    name: 'File System Access',
    description: 'Faster builds.',
    result: 'FileSystemAccess',
    tokenCost: 250,
    prerequisite: 'TokenCompression',
    ingredients: [
      { material: 'iron_powder', count: 2 },
    ],
  },
  {
    id: 'upgrade_crank_assignment',
    category: 'upgrade',
    name: 'Crank Assignment',
    description: 'Assign agent to crank.',
    result: 'CrankAssignment',
    tokenCost: 150,
    prerequisite: 'TokenCompression',
    ingredients: [
      { material: 'metal_ring', count: 1 },
      { material: 'wood', count: 1 },
    ],
  },

  // Tier 3
  {
    id: 'upgrade_multi_agent',
    category: 'upgrade',
    name: 'Multi-Agent Coordination',
    description: 'Agents collaborate.',
    result: 'MultiAgentCoordination',
    tokenCost: 400,
    prerequisite: 'GitAccess',
    ingredients: [
      { material: 'mana', count: 1 },
      { material: 'liquid_gold', count: 1 },
      { material: 'ore_coin', count: 1 },
    ],
  },
  {
    id: 'upgrade_persistent_memory',
    category: 'upgrade',
    name: 'Persistent Memory',
    description: 'Better XP retention.',
    result: 'PersistentMemory',
    tokenCost: 350,
    prerequisite: 'WebSearch',
    ingredients: [
      { material: 'mana', count: 2 },
      { material: 'metal_ring', count: 1 },
    ],
  },
  {
    id: 'upgrade_autonomous_scouting',
    category: 'upgrade',
    name: 'Autonomous Scouting',
    description: 'Self-assign exploration.',
    result: 'AutonomousScouting',
    tokenCost: 300,
    prerequisite: 'FileSystemAccess',
    ingredients: [
      { material: 'liquid_gold', count: 1 },
      { material: 'wood', count: 2 },
    ],
  },

  // Tier 4
  {
    id: 'upgrade_agent_spawning',
    category: 'upgrade',
    name: 'Agent Spawning',
    description: 'Agents recruit agents.',
    result: 'AgentSpawning',
    tokenCost: 600,
    prerequisite: 'MultiAgentCoordination',
    ingredients: [
      { material: 'mana', count: 2 },
      { material: 'liquid_gold', count: 2 },
    ],
  },
  {
    id: 'upgrade_distributed_compute',
    category: 'upgrade',
    name: 'Distributed Compute',
    description: 'Token gen scales with agents.',
    result: 'DistributedCompute',
    tokenCost: 500,
    prerequisite: 'PersistentMemory',
    ingredients: [
      { material: 'ore_coin', count: 2 },
      { material: 'mana', count: 1 },
      { material: 'iron_powder', count: 1 },
    ],
  },
  {
    id: 'upgrade_alignment',
    category: 'upgrade',
    name: 'Alignment Protocols',
    description: 'Reduced rogue spawns.',
    result: 'AlignmentProtocols',
    tokenCost: 800,
    prerequisite: 'AutonomousScouting',
    ingredients: [
      { material: 'mana', count: 3 },
      { material: 'liquid_gold', count: 2 },
    ],
  },
];

// ── Helper functions ────────────────────────────────────────────────

export function getRecipesByCategory(cat: RecipeCategory): CraftingRecipe[] {
  return ALL_RECIPES.filter(r => r.category === cat);
}

export function getRecipeById(id: string): CraftingRecipe | undefined {
  return ALL_RECIPES.find(r => r.id === id);
}

/** Inventory item type prefixes for materials and blueprints. */
export function materialItemType(id: MaterialId): string {
  return `material:${id}`;
}

export function blueprintItemType(buildingType: BuildingTypeKind): string {
  return `blueprint:${buildingType}`;
}

/** Check if player has all ingredients for a recipe. */
export function canCraft(
  recipe: CraftingRecipe,
  inventory: Map<string, number>,
  tokens: number,
  purchasedUpgrades: Set<string>,
): boolean {
  // Check blueprint requirement
  if (recipe.blueprint) {
    const bpType = blueprintItemType(recipe.blueprint);
    if (!inventory.has(bpType) || (inventory.get(bpType) ?? 0) < 1) return false;
  }

  // Check token cost
  if (recipe.tokenCost && tokens < recipe.tokenCost) return false;

  // Check prerequisite (upgrades)
  if (recipe.prerequisite && !purchasedUpgrades.has(recipe.prerequisite)) return false;

  // Check material ingredients
  for (const ing of recipe.ingredients) {
    const have = inventory.get(materialItemType(ing.material)) ?? 0;
    if (have < ing.count) return false;
  }

  return true;
}
```

**Step 2: Verify file compiles**

Run: `cd /Users/jackwakem/Desktop/random_shit/its-time-to-build-game/client && npx tsc --noEmit src/data/crafting.ts 2>&1 | head -20`

**Step 3: Commit**

```bash
git add client/src/data/crafting.ts
git commit -m "feat: add crafting data — recipes, materials, and blueprint mappings"
```

---

### Task 2: Server Protocol — Add Inventory & Crafting Actions

**Files:**
- Modify: `server/src/protocol.rs` (lines 253-325 — GameStateUpdate and PlayerAction)
- Modify: `client/src/network/protocol.ts` (lines 224-308 — mirror changes)

**Step 1: Add InventoryItem struct and inventory field to GameStateUpdate in Rust**

In `server/src/protocol.rs`, add before the `GameStateUpdate` struct (around line 250):

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InventoryItem {
    pub item_type: String,
    pub count: u32,
}
```

Then add this field to `GameStateUpdate` (after `player_hit_damage` around line 269):

```rust
    pub inventory: Vec<InventoryItem>,
```

**Step 2: Add new PlayerAction variants**

In `server/src/protocol.rs`, add these variants to the `PlayerAction` enum (after the `EquipArmor` variant, around line 295):

```rust
    // Crafting actions
    CraftItem { recipe_id: String },
    OpenChest { entity_id: u64 },
    PurchaseUpgrade { upgrade_id: String },
```

**Step 3: Mirror in TypeScript protocol**

In `client/src/network/protocol.ts`, add to the `GameStateUpdate` interface (after `player_hit_damage` around line 239):

```ts
  inventory: InventoryItem[];
```

Add this interface (anywhere near other interfaces):

```ts
export interface InventoryItem {
  item_type: string;
  count: number;
}
```

Add to the `PlayerAction` type union (after `EquipArmor` around line 269):

```ts
  | { CraftItem: { recipe_id: string } }
  | { OpenChest: { entity_id: number } }
  | { PurchaseUpgrade: { upgrade_id: string } }
```

**Step 4: Commit**

```bash
git add server/src/protocol.rs client/src/network/protocol.ts
git commit -m "feat: add inventory and crafting actions to protocol"
```

---

### Task 3: Server — Inventory State & Craft/Chest/Upgrade Handlers

**Files:**
- Modify: `server/src/ecs/components.rs` (line 307-320 — GameState struct)
- Modify: `server/src/main.rs` (lines 154-204 — action handler, lines 900-961 — GameStateUpdate construction)

**Step 1: Add inventory to GameState**

In `server/src/ecs/components.rs`, add to the `GameState` struct (after `death_tick` on line 319):

```rust
    pub inventory: Vec<crate::protocol::InventoryItem>,
```

And initialize it in wherever `GameState` is constructed (search for `GameState {` in main.rs) — add:

```rust
    inventory: Vec::new(),
```

**Step 2: Add inventory helper methods**

Add these free functions near the bottom of `server/src/ecs/components.rs`:

```rust
impl GameState {
    /// Add an item to the player's inventory. Stacks if same type exists.
    pub fn add_inventory_item(&mut self, item_type: &str, count: u32) {
        for item in &mut self.inventory {
            if item.item_type == item_type {
                item.count += count;
                return;
            }
        }
        self.inventory.push(crate::protocol::InventoryItem {
            item_type: item_type.to_string(),
            count,
        });
    }

    /// Remove items from inventory. Returns true if successful.
    pub fn remove_inventory_item(&mut self, item_type: &str, count: u32) -> bool {
        for item in &mut self.inventory {
            if item.item_type == item_type {
                if item.count >= count {
                    item.count -= count;
                    if item.count == 0 {
                        self.inventory.retain(|i| i.count > 0);
                    }
                    return true;
                }
                return false;
            }
        }
        false
    }

    /// Check if inventory has at least `count` of `item_type`.
    pub fn has_inventory_item(&self, item_type: &str, count: u32) -> bool {
        self.inventory.iter().any(|i| i.item_type == item_type && i.count >= count)
    }
}
```

**Step 3: Handle CraftItem action in main.rs**

In the `match action` block (around line 156 in `server/src/main.rs`), add a new arm:

```rust
PlayerAction::CraftItem { recipe_id } => {
    // Client-authoritative crafting — server just validates inventory
    // and deducts materials. Recipe definitions are client-side.
    // The client sends the recipe_id; server trusts the ingredient
    // list embedded in the action for simplicity. A more robust
    // approach would duplicate recipes server-side.
    debug_log_entries.push(format!("Crafted: {}", recipe_id));
}
```

Note: Since we're doing client-first recipes, the actual deduction logic will be handled in a follow-up step when we wire the crafting modal. For now, the server just acknowledges the action. The real inventory manipulation happens when the client sends specific `add_inventory_item` / `remove_inventory_item` style messages — OR we can handle it all client-side and just sync state.

**Simpler approach for this game:** Since the server is the authority for inventory, we handle crafting server-side with a simple "deduct these items, add this result" pattern. The `CraftItem` handler will:

```rust
PlayerAction::CraftItem { recipe_id } => {
    // For now, log it. Full recipe validation comes in Task 6
    // when the crafting modal sends structured craft requests.
    debug_log_entries.push(format!("Craft request: {}", recipe_id));
}
```

**Step 4: Handle OpenChest action**

```rust
PlayerAction::OpenChest { entity_id } => {
    let target = hecs::Entity::from_bits(*entity_id);
    if let Some(target) = target {
        // Check if entity exists and is an Item with type "chest"
        let is_chest = world.get::<&crate::protocol::EntityData>(target)
            .ok()
            .map(|_| true)
            .unwrap_or(false);
        if is_chest {
            // Remove the chest entity
            let _ = world.despawn(target);
            debug_log_entries.push("Chest opened!".to_string());
            // Loot generation handled client-side for simplicity;
            // server adds items via separate mechanism
        }
    }
}
```

**Step 5: Handle PurchaseUpgrade action**

```rust
PlayerAction::PurchaseUpgrade { upgrade_id } => {
    // Parse upgrade_id string to UpgradeId enum
    use crate::game::upgrades::UpgradeId;
    let id = match upgrade_id.as_str() {
        "ExpandedContextWindow" => Some(UpgradeId::ExpandedContextWindow),
        "VerboseLogging" => Some(UpgradeId::VerboseLogging),
        "TokenCompression" => Some(UpgradeId::TokenCompression),
        "GitAccess" => Some(UpgradeId::GitAccess),
        "WebSearch" => Some(UpgradeId::WebSearch),
        "FileSystemAccess" => Some(UpgradeId::FileSystemAccess),
        "CrankAssignment" => Some(UpgradeId::CrankAssignment),
        "MultiAgentCoordination" => Some(UpgradeId::MultiAgentCoordination),
        "PersistentMemory" => Some(UpgradeId::PersistentMemory),
        "AutonomousScouting" => Some(UpgradeId::AutonomousScouting),
        "AgentSpawning" => Some(UpgradeId::AgentSpawning),
        "DistributedCompute" => Some(UpgradeId::DistributedCompute),
        "AlignmentProtocols" => Some(UpgradeId::AlignmentProtocols),
        _ => None,
    };
    if let Some(id) = id {
        match game_state.upgrades.purchase(id, &mut game_state.economy) {
            Ok(()) => {
                let def = crate::game::upgrades::get_upgrade(id);
                debug_log_entries.push(format!("Upgrade purchased: {}", def.name));
            }
            Err(reason) => {
                debug_log_entries.push(format!("Upgrade failed: {}", reason));
            }
        }
    }
}
```

**Step 6: Add inventory to GameStateUpdate construction**

In the `GameStateUpdate` construction block (around line 900-961 in main.rs), add after `player_hit_damage`:

```rust
    inventory: game_state.inventory.clone(),
```

**Step 7: Add purchased upgrades to GameStateUpdate**

We also need to send purchased upgrade IDs to the client. Add a field to `GameStateUpdate` in protocol.rs:

```rust
    pub purchased_upgrades: Vec<String>,
```

And in the construction block:

```rust
    purchased_upgrades: game_state.upgrades.purchased.iter()
        .map(|id| format!("{:?}", id))
        .collect(),
```

Mirror in TypeScript `GameStateUpdate`:

```ts
  purchased_upgrades: string[];
```

**Step 8: Verify server compiles**

Run: `cd /Users/jackwakem/Desktop/random_shit/its-time-to-build-game/server && cargo check 2>&1 | tail -20`

**Step 9: Commit**

```bash
git add server/src/ecs/components.rs server/src/main.rs server/src/protocol.rs client/src/network/protocol.ts
git commit -m "feat: server inventory state, craft/chest/upgrade action handlers"
```

---

### Task 4: Expand Inventory HUD — Icons & 15 Slots

**Files:**
- Modify: `client/src/ui/inventory-hud.ts` (full file, 260 lines)

**Step 1: Expand grid to 5x3 and add icon rendering**

The key changes to `client/src/ui/inventory-hud.ts`:

1. Change `ROWS` constant from `2` to `3` (line 38)
2. Add texture loading for material and blueprint icons
3. Replace the text-based `redrawSlot` with icon-based rendering using Sprites
4. Add a `getItemIcon()` helper that maps item_type strings to texture paths:
   - `material:iron_powder` → `/icons/crafting_materials/iron_powder.png`
   - `blueprint:TodoApp` → `/blueprints/fc1261.png` (using the mapping from crafting.ts)

Changes to make:

- Line 38: `const ROWS = 2;` → `const ROWS = 3;`
- Add `import { Assets, Sprite, Texture } from 'pixi.js';` (Sprite and Texture already imported via Container parent, but Assets needs adding)
- Add `import { getBlueprintForBuilding, type MaterialId } from '../data/crafting';`
- Add a `private textures: Map<string, Texture> = new Map();` field
- Add an async `loadTextures()` method called from constructor
- Replace the text abbreviation rendering in `redrawSlot` (lines 243-249) with Sprite icon rendering

The `getIconPath()` function:

```ts
private getIconPath(itemType: string): string | null {
  if (itemType.startsWith('material:')) {
    const matId = itemType.slice('material:'.length);
    return `/icons/crafting_materials/${matId}.png`;
  }
  if (itemType.startsWith('blueprint:')) {
    const buildingType = itemType.slice('blueprint:'.length);
    const bp = getBlueprintForBuilding(buildingType as any);
    return bp ? `/blueprints/${bp.icon}` : null;
  }
  return null;
}
```

**Step 2: Verify it renders**

Run the client dev server and check that the inventory grid now shows 3 rows instead of 2, and that adding test items renders icons.

**Step 3: Commit**

```bash
git add client/src/ui/inventory-hud.ts
git commit -m "feat: expand inventory to 15 slots with icon rendering"
```

---

### Task 5: Chest Placement on Map

**Files:**
- Modify: `client/src/renderer/world.ts` (lines 487-529 — scatterObjects / placeObjectGrid)

**Step 1: Create a chest icon**

We need a chest sprite. Since there's no chest icon in the project yet, create one by adding a simple chest object definition. We can repurpose one of the existing object sprites or we'll need to add a `chest.png` to `client/public/objects/`.

For now, add chest to the object pool using the existing `skull_door.png` as a placeholder (it's the closest "interactive object" feel), or better yet, create a distinct entry. Check if there's a suitable existing sprite first.

Alternative: Add chests as a new category in `scatterObjects`, placed using `placeObjectGrid` with a unique seed, low frequency, and a distinct "chest" tag that the entity system can reference.

**Step 2: Add chest object definition and scatter call**

In `client/src/renderer/world.ts`, add after the `OBJECTS_LARGE` array (around line 103):

```ts
const OBJECTS_CHEST: ObjectDef[] = [
  { path: 'crystal1.png', size: 32, tileCover: 2 },  // placeholder until chest.png exists
];
```

In the `scatterObjects` method (line 487), add:

```ts
this.placeChests(layer, cx, cy);
```

Add a new method after `placeObjectGrid`:

```ts
private placeChests(layer: Container, cx: number, cy: number): void {
  // ~1-2 chests per chunk, seeded deterministically
  const CHEST_SEED = 7777;
  const CHEST_STEP = 16;  // check every 16 tiles = ~4 candidates per chunk

  for (let ty = 0; ty < CHUNK_SIZE; ty += CHEST_STEP) {
    for (let tx = 0; tx < CHUNK_SIZE; tx += CHEST_STEP) {
      const wx = cx * CHUNK_SIZE + tx;
      const wy = cy * CHUNK_SIZE + ty;

      if (!isWalkable(wx, wy)) continue;

      // ~12% chance per candidate = ~1-2 chests per chunk
      const roll = hash(wx, wy, CHEST_SEED) % 1000;
      if (roll >= 120) continue;

      // Use a glowing crystal sprite as chest placeholder
      const tex = this.objectTextures.get('crystal2.png');
      if (!tex) continue;

      const spr = new Sprite(tex);
      const offsetX = ((hash(wx, wy, CHEST_SEED + 200) % 8) - 4);
      const offsetY = ((hash(wx, wy, CHEST_SEED + 300) % 8) - 4);
      spr.x = tx * TILE_PX + offsetX - 16;
      spr.y = ty * TILE_PX + offsetY - 16;
      spr.width = 32;
      spr.height = 32;

      // Tint chest golden to distinguish from regular crystals
      spr.tint = 0xd4a017;
      spr.alpha = 0.9;

      // Tag for interaction detection
      spr.label = `chest_${wx}_${wy}`;

      layer.addChild(spr);
    }
  }
}
```

**Step 3: Server-side chest entities**

For interaction, chests also need server-side entities. In the server's spawn system or tilemap generation, spawn `Item` entities with `item_type: "chest"` at the same deterministic positions (using the same hash function ported to Rust).

Add to `server/src/main.rs` or a new `server/src/game/chests.rs`:

```rust
/// Deterministic hash matching the client's hash function.
fn chest_hash(x: i32, y: i32, seed: i32) -> u32 {
    let mut h = (x.wrapping_mul(374761393)
        .wrapping_add(y.wrapping_mul(668265263))
        .wrapping_add(seed)) as u32;
    h = (h ^ (h >> 13)).wrapping_mul(1274126177);
    (h ^ (h >> 16)) & 0x7FFFFFFF
}

/// Spawn chest entities for chunks near the player.
pub fn spawn_chests_for_chunk(world: &mut hecs::World, cx: i32, cy: i32) {
    let chunk_size = 32i32;
    let step = 16i32;
    let seed = 7777i32;

    for ty in (0..chunk_size).step_by(step as usize) {
        for tx in (0..chunk_size).step_by(step as usize) {
            let wx = cx * chunk_size + tx;
            let wy = cy * chunk_size + ty;

            let roll = chest_hash(wx, wy, seed) % 1000;
            if roll >= 120 { continue; }

            // Spawn chest entity at world position
            let px = wx as f32 * 16.0 + 8.0;
            let py = wy as f32 * 16.0 + 8.0;

            world.spawn((
                crate::ecs::components::Position { x: px, y: py },
                crate::protocol::EntityData::Item {
                    item_type: "chest".to_string(),
                },
            ));
        }
    }
}
```

**Step 4: Commit**

```bash
git add client/src/renderer/world.ts server/src/game/chests.rs server/src/main.rs
git commit -m "feat: deterministic chest placement on map with server entities"
```

---

### Task 6: Chest Interaction — Loot Generation & Inventory Pickup

**Files:**
- Modify: `client/src/main.tsx` (around lines 1020-1058 — E-key interaction handler)
- Modify: `server/src/main.rs` (OpenChest action handler from Task 3)

**Step 1: Client-side chest interaction**

In `client/src/main.tsx`, in the E-key / Interact handler (around line 1020), add chest detection logic. When the player presses E near a chest entity (kind === 'Item', item_type === 'chest'), send an `OpenChest` action:

```ts
// Check for nearby chest entities
for (const entity of entityMap.values()) {
  if (entity.kind !== 'Item') continue;
  const data = (entity.data as { Item?: { item_type: string } }).Item;
  if (!data || data.item_type !== 'chest') continue;
  const dx = entity.position.x - px;
  const dy = entity.position.y - py;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 40) {  // interaction range
    const input: PlayerInput = {
      tick: clientTick,
      movement: { x: 0, y: 0 },
      action: { OpenChest: { entity_id: entity.id } },
      target: null,
    };
    connection.sendInput(input);
    interactedWithBuilding = true;
    break;
  }
}
```

**Step 2: Server-side loot generation**

In the `OpenChest` handler in `server/src/main.rs`, generate random loot and add to inventory:

```rust
PlayerAction::OpenChest { entity_id } => {
    let target = hecs::Entity::from_bits(*entity_id);
    if let Some(target) = target {
        if world.contains(target) {
            let _ = world.despawn(target);

            // Generate loot
            let mut rng = rand::thread_rng();
            use rand::Rng;

            // Always: 5-15 tokens
            let token_reward = rng.gen_range(5..=15);
            game_state.economy.balance += token_reward;

            // 30% chance: random blueprint
            if rng.gen_range(0..100) < 30 {
                let blueprints = [
                    "TodoApp", "Calculator", "LandingPage",
                    "WeatherDashboard", "ChatApp", "KanbanBoard",
                    "EcommerceStore", "AiImageGenerator", "ApiDashboard",
                    "Blockchain",
                ];
                let bp = blueprints[rng.gen_range(0..blueprints.len())];
                let bp_type = format!("blueprint:{}", bp);
                if !game_state.has_inventory_item(&bp_type, 1) {
                    game_state.add_inventory_item(&bp_type, 1);
                    debug_log_entries.push(format!("Found blueprint: {}!", bp));
                }
            }

            // 1-3 random materials
            let materials = [
                "material:iron_powder",
                "material:wood",
                "material:metal_ring",
                "material:ore_coin",
                "material:liquid_gold",
                "material:mana",
            ];
            let weights = [30u32, 30, 25, 15, 12, 8];
            let total_weight: u32 = weights.iter().sum();
            let mat_count = rng.gen_range(1..=3);

            for _ in 0..mat_count {
                let mut roll = rng.gen_range(0..total_weight);
                for (i, &w) in weights.iter().enumerate() {
                    if roll < w {
                        game_state.add_inventory_item(materials[i], 1);
                        break;
                    }
                    roll -= w;
                }
            }

            debug_log_entries.push(format!("Chest opened! +{} tokens", token_reward));
        }
    }
}
```

**Step 3: Commit**

```bash
git add client/src/main.tsx server/src/main.rs
git commit -m "feat: chest interaction with loot generation"
```

---

### Task 7: Rewrite Crafting Modal — 3 Tabs with Recipe Cards

**Files:**
- Modify: `client/src/ui/crafting-modal.ts` (full rewrite, currently 218 lines)

**Step 1: Rewrite the crafting modal**

Replace the placeholder crafting modal with a full implementation. The new modal has:

- 3 tabs: **Apps**, **Forge**, **Agent Upgrades**
- Each tab shows a scrollable list of recipe cards
- Each recipe card displays:
  - Recipe name and description
  - Blueprint icon (apps only, greyed if not owned)
  - Ingredient list with material icons and counts (green if have enough, red if not)
  - Token cost (upgrades only)
  - "Craft" button (enabled only when all requirements met)
- Width: 550px, max-height: 80vh with scroll

Key imports needed:
```ts
import { ALL_RECIPES, getRecipesByCategory, canCraft, materialItemType, blueprintItemType, getMaterial, getBlueprintForBuilding, type CraftingRecipe, type RecipeCategory } from '../data/crafting';
import type { PlayerAction, InventoryItem } from '../network/protocol';
```

The modal needs these public methods:
- `open()` / `close()` — show/hide
- `updateInventory(items: InventoryItem[])` — refresh ingredient availability display
- `updateTokens(balance: number)` — refresh token cost display
- `updatePurchasedUpgrades(ids: string[])` — refresh upgrade prerequisites

The `onAction` callback fires `{ CraftItem: { recipe_id } }` when the player clicks Craft.

**Step 2: Wire crafting modal to game loop**

In `client/src/main.tsx`, in the game state update section (around line 1293), add:

```ts
// Update crafting modal with inventory and economy
if (state.inventory) {
  inventoryHud.setItems(state.inventory.map(i => ({ type: i.item_type, count: i.count })));
  craftingModal.updateInventory(state.inventory);
}
craftingModal.updateTokens(state.economy.balance);
if (state.purchased_upgrades) {
  craftingModal.updatePurchasedUpgrades(state.purchased_upgrades);
  upgradeTree.updateState(state.economy.balance, state.purchased_upgrades);
}
```

**Step 3: Commit**

```bash
git add client/src/ui/crafting-modal.ts client/src/main.tsx
git commit -m "feat: full crafting modal with Apps, Forge, and Agent Upgrades tabs"
```

---

### Task 8: Server-Side CraftItem Handler — Deduct Materials & Grant Results

**Files:**
- Modify: `server/src/main.rs` (CraftItem handler from Task 3)

**Step 1: Implement full CraftItem handling**

The server needs to validate and process craft requests. Since recipes are client-defined, the CraftItem message should include the ingredients to deduct. We have two options:

**Option A (simpler):** Trust the client's recipe_id and have the server maintain a minimal recipe table.
**Option B (simplest):** Have the client send structured deduction data.

Go with Option A — add a minimal server-side recipe lookup. Create `server/src/game/crafting.rs`:

```rust
/// Minimal server-side recipe validation.
/// Maps recipe_id to (ingredients_to_deduct, result_item_type, token_cost).
pub struct ServerRecipe {
    pub recipe_id: &'static str,
    pub ingredients: &'static [(&'static str, u32)],  // (item_type, count)
    pub token_cost: i64,
    pub result_type: &'static str,  // what to add to inventory or unlock
}
```

However, for simplicity and to avoid maintaining two recipe lists, we can use a **trust-the-client** approach: the client sends the recipe_id, and the server checks that the inventory has the materials and deducts them. The client pre-validates with `canCraft()`.

Updated CraftItem handler:

```rust
PlayerAction::CraftItem { recipe_id } => {
    // Acknowledge craft — actual deduction handled by client sending
    // inventory delta. For now, just log.
    debug_log_entries.push(format!("Item crafted: {}", recipe_id));
}
```

**Better approach for integrity:** Have the client send the full deduction list along with the craft. But for this single-player game, client-side validation with `canCraft()` is sufficient. The client will:
1. Check `canCraft()`
2. Send `CraftItem { recipe_id }`
3. The server deducts materials based on the recipe_id

For the actual deduction, add the recipe data server-side as a simple match:

```rust
PlayerAction::CraftItem { recipe_id } => {
    // Process craft based on recipe_id
    // Deductions and results are handled by client sending
    // structured data or by maintaining a server recipe table.
    // For this single-player game, we trust the client.
    debug_log_entries.push(format!("Crafted: {}", recipe_id));
}
```

Given the complexity of duplicating all recipes in Rust, the pragmatic approach is: **the client manages inventory optimistically and syncs via the `inventory` field in GameStateUpdate.** The server stores the canonical inventory, and the client sends delta operations (add/remove) rather than full craft validation.

Add two new simple actions:

In protocol.rs:
```rust
    AddInventoryItem { item_type: String, count: u32 },
    RemoveInventoryItem { item_type: String, count: u32 },
```

In main.rs handlers:
```rust
PlayerAction::AddInventoryItem { item_type, count } => {
    game_state.add_inventory_item(item_type, *count);
}
PlayerAction::RemoveInventoryItem { item_type, count } => {
    game_state.remove_inventory_item(item_type, *count);
}
```

Then the crafting modal's craft flow becomes:
1. Client validates with `canCraft()`
2. Client sends `RemoveInventoryItem` for each ingredient
3. Client sends `RemoveInventoryItem` for the blueprint (if app recipe)
4. Client sends `CraftItem` with recipe_id (for logging/tracking)
5. If weapon/armour: client sends `EquipWeapon`/`EquipArmor`
6. If app: client sends `UnlockBuilding`
7. If upgrade: client sends `PurchaseUpgrade`

**Step 2: Mirror in TypeScript**

Add to PlayerAction type:
```ts
  | { AddInventoryItem: { item_type: string; count: number } }
  | { RemoveInventoryItem: { item_type: string; count: number } }
```

**Step 3: Commit**

```bash
git add server/src/protocol.rs server/src/main.rs client/src/network/protocol.ts
git commit -m "feat: inventory delta actions for crafting flow"
```

---

### Task 9: Blueprint Icons in Build Menu & Hotbar

**Files:**
- Modify: `client/src/ui/build-menu.ts` (lines 500-560 — createCard method)
- Modify: `client/src/ui/build-hotbar.ts` (lines 313-386 — buildSlots method)

**Step 1: Add blueprint icons to build menu cards**

In `client/src/ui/build-menu.ts`, the `createCard` method (around line 500) creates a card for each building. Add a blueprint icon to each card:

1. Import `getBlueprintForBuilding` from `../data/crafting`
2. In `createCard`, after creating the card container, add a small blueprint icon image
3. If the blueprint is NOT in inventory, apply a greyscale CSS filter and reduced opacity
4. Add a `setInventory(items)` method to the BuildMenu class to track blueprint ownership

The build menu already has `setUnlockedBuildings` — extend this to also check blueprint ownership. A building should be locked if the player doesn't have its blueprint.

Add to the BuildMenu class:

```ts
private ownedBlueprints: Set<string> = new Set();

setOwnedBlueprints(blueprintTypes: string[]): void {
  this.ownedBlueprints = new Set(blueprintTypes);
  this.rebuildPage();
}
```

In `createCard`, add blueprint icon rendering:

```ts
const bp = getBlueprintForBuilding(def.type);
if (bp) {
  const bpImg = document.createElement('img');
  bpImg.src = `/blueprints/${bp.icon}`;
  bpImg.style.width = '24px';
  bpImg.style.height = '24px';
  bpImg.style.imageRendering = 'pixelated';
  if (!this.ownedBlueprints.has(def.type)) {
    bpImg.style.filter = 'grayscale(100%)';
    bpImg.style.opacity = '0.4';
  }
  // Insert into the card header area
  nameRow.appendChild(bpImg);
}
```

**Step 2: Add blueprint icons to hotbar**

In `client/src/ui/build-hotbar.ts`, in the `buildSlots` method (around line 313), add a small blueprint icon sprite to each slot:

1. Import `getBlueprintForBuilding` from `../data/crafting`
2. Load blueprint textures in the constructor
3. In the slot rendering loop, add a 16x16 blueprint Sprite in the top-right corner of each slot
4. Grey it out if not owned

**Step 3: Wire blueprint ownership data from game loop**

In `client/src/main.tsx`, after the inventory update section, extract blueprint types from inventory and pass to build menu and hotbar:

```ts
const ownedBlueprints = (state.inventory ?? [])
  .filter(i => i.item_type.startsWith('blueprint:'))
  .map(i => i.item_type.slice('blueprint:'.length));
buildMenu.setOwnedBlueprints(ownedBlueprints);
buildHotbar.setOwnedBlueprints(ownedBlueprints);
```

**Step 4: Commit**

```bash
git add client/src/ui/build-menu.ts client/src/ui/build-hotbar.ts client/src/main.tsx
git commit -m "feat: blueprint icons in build menu and hotbar with ownership state"
```

---

### Task 10: Wire Upgrade Tree to Server & Add Material Requirements Display

**Files:**
- Modify: `client/src/ui/upgrade-tree.ts` (lines 298-316 — confirmSelection, and render)
- Modify: `client/src/main.tsx` (around line 118 — upgradeTree setup, and line 1293 — state sync)

**Step 1: Wire upgradeTree.onPurchase to server**

In `client/src/main.tsx`, after the upgradeTree is created (line 118), add:

```ts
upgradeTree.onPurchase = (upgradeId: string) => {
  const input: PlayerInput = {
    tick: clientTick,
    movement: { x: 0, y: 0 },
    action: { PurchaseUpgrade: { upgrade_id: upgradeId } },
    target: null,
  };
  connection.sendInput(input);
};
```

**Step 2: Wire state sync**

In the game state update section (around line 1293), add:

```ts
if (state.purchased_upgrades) {
  upgradeTree.updateState(state.economy.balance, state.purchased_upgrades);
}
```

**Step 3: Add material cost display to upgrade tree**

In `client/src/ui/upgrade-tree.ts`, import the recipe data and show material requirements alongside token costs. In the `rebuildRows` method (around line 418), for each upgrade row, look up the corresponding upgrade recipe and display its material requirements:

```ts
import { ALL_RECIPES, type CraftingRecipe, materialItemType } from '../data/crafting';
```

In the upgrade row rendering, after the cost text, add material icons as small colored dots or text indicators showing what materials are needed.

**Step 4: Commit**

```bash
git add client/src/ui/upgrade-tree.ts client/src/main.tsx
git commit -m "feat: wire upgrade tree to server and show material requirements"
```

---

### Task 11: Integration Testing & Polish

**Files:**
- All modified files from previous tasks

**Step 1: Build and run both client and server**

```bash
cd /Users/jackwakem/Desktop/random_shit/its-time-to-build-game/server && cargo build 2>&1 | tail -20
cd /Users/jackwakem/Desktop/random_shit/its-time-to-build-game/client && npx tsc --noEmit 2>&1 | tail -20
```

**Step 2: Fix any compilation errors**

Address any type mismatches, missing imports, or protocol sync issues between client and server.

**Step 3: Manual integration test checklist**

- [ ] Inventory HUD shows 15 slots (5x3)
- [ ] Chests appear on the map (golden crystals)
- [ ] Walking to a chest and pressing E opens it
- [ ] Chest loot (tokens, materials, blueprints) appears in inventory
- [ ] Crafting modal opens at crafting table with 3 tabs
- [ ] Apps tab shows all app recipes with blueprint requirements
- [ ] Forge tab shows weapon and armour recipes
- [ ] Agent Upgrades tab shows all upgrades with material + token costs
- [ ] Crafting a weapon with sufficient materials succeeds
- [ ] Crafting an app with blueprint + materials unlocks it in build menu
- [ ] Blueprint icons appear in build menu cards
- [ ] Blueprint icons appear in hotbar slots
- [ ] Uncrafted buildings show greyed-out blueprints
- [ ] Upgrade tree shows material requirements and purchases work

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete crafting & blueprints system integration"
```
