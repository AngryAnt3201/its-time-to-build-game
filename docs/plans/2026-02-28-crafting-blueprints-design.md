# Crafting & Blueprints System Design

**Date:** 2026-02-28
**Status:** Approved

## Overview

Add a crafting system with blueprints, crafting materials, chests, and an expanded inventory. Three crafting categories:

1. **Apps** — Require a blueprint + crafting materials
2. **Weapons & Armour** — Require crafting materials only
3. **Agent Upgrades** — Require tokens + crafting materials (moved from XP/upgrade tree)

## Data Model

### Crafting Materials (6 types)

| Material    | Icon               | Rarity   |
|-------------|-------------------|----------|
| Iron Powder | iron_powder.png   | Common   |
| Liquid Gold | liquid_gold.png   | Uncommon |
| Mana        | mana.png          | Rare     |
| Metal Ring  | metal_ring.png    | Common   |
| Ore Coin    | ore_coin.png      | Uncommon |
| Wood        | wood.png          | Common   |

### Blueprints

One unique blueprint icon per building (11 buildings, 17 PNGs available). Stored as inventory items with type `blueprint:<BuildingType>`.

### Recipe Structure

```ts
interface CraftingRecipe {
  id: string;
  category: 'app' | 'weapon' | 'armour' | 'upgrade';
  name: string;
  result: string;
  ingredients: { material: string; count: number }[];
  blueprint?: string;    // required blueprint (apps only)
  tokenCost?: number;    // token cost (upgrades only)
}
```

### Progressive Scaling

- Tier 1 apps: 1 blueprint + 2 materials
- Tier 2 apps: 1 blueprint + 3-4 materials
- Tier 3 apps: 1 blueprint + 4-5 materials (including rarer)
- Tier 4 apps: 1 blueprint + 6+ materials (multiple rare)
- Basic weapons/armour: 2-3 materials
- Advanced weapons/armour: 4-5 materials
- Agent upgrades: tokens + 1-3 materials (scaling with tier)

## Inventory System

### Expansion

- Current: 5x2 = 10 slots (Pixi.js)
- New: 5x3 = 15 slots
- Render actual icons instead of text abbreviations
- Item types: `material:iron_powder`, `blueprint:TodoApp`, etc.

### Server Sync

- Add `inventory: Vec<InventoryItem>` to `GameStateUpdate`
- `InventoryItem { item_type: String, count: u32 }`
- Server is canonical source, client renders from it

## Chest System

### Placement

- Client-side during chunk rendering using seeded noise (offset from terrain seed)
- ~1-2 chests per chunk on Grass/Dirt terrain
- Not within 3 tiles of water

### Loot Table

- Tokens: 5-15 (always)
- Blueprint: 30% chance of random uncollected blueprint
- Materials: 1-3 random crafting materials

### Interaction

- Player walks to chest + presses Interact (E key)
- Client sends `PickupChest { chest_id }` action
- Server validates, adds to inventory, removes chest entity

## Crafting Modal

### Tab Layout (expanding existing crafting-modal.ts)

1. **Apps** — Blueprint icon (greyed if not owned) + material costs + "Craft" button. Crafting unlocks the building in build menu.
2. **Forge** — Weapon/armour recipes with material costs and stats preview.
3. **Agent Upgrades** — Moved from upgrade-tree.ts. Token cost + material costs. Same tier/prerequisite system.

### Recipe Card

Shows ingredient icons with quantities. Green count = have enough, red = insufficient.

## Build Menu & Hotbar Integration

- Build menu cards show blueprint icon alongside building name
- Greyed out with lock overlay if blueprint not owned
- Hotbar slots show small blueprint icon in corner
- Buildings require blueprint ownership + token cost to place

## Architecture

- **Client-first:** Recipes defined in `client/src/data/crafting.ts`
- **Minimal server changes:** inventory tracking, chest spawning, craft/pickup actions
- **Protocol additions:**
  - `PlayerAction::Craft { recipe_id: String }`
  - `PlayerAction::PickupChest { chest_id: u64 }`
  - `PlayerAction::PurchaseUpgrade { upgrade_id: String }` (replacing token-only purchase)
  - `inventory` field in `GameStateUpdate`
