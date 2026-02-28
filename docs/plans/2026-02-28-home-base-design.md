# Home Base Design

## Overview

The home base is the starting scenario for the game. Three physical entities are placed near the player spawn point (400, 300): a Token Wheel, a Crafting Table, and a recruitable agent (Sol). The player starts with 0 tokens and must use the wheel to earn enough to recruit Sol.

## 1. Token Wheel

**Position:** (370, 300) — left of player spawn.

**Entity type:** Pre-built building with `BuildingType::TokenWheel`. Uses existing `CrankState` in `GameState` as its mechanical backing. The existing crank system is replaced/absorbed — no separate crank concept remains.

### Upgrade Tiers

| Tier | Name | Upgrade Cost | Tokens/rotation | Agent Bonus/tick |
|------|------|-------------|-----------------|------------------|
| 1 | HandCrank | Free (starting) | 1.0 | +0.05 |
| 2 | GearAssembly | 25 tokens | 1.5 | +0.08 |
| 3 | WaterWheel | 75 tokens | 2.0 | +0.10 |
| 4 | RunicEngine | 200 tokens | 3.0 | +0.15 |

### Interaction
- Player clicks the wheel or presses interact key when near it
- Opens a panel showing: current tier, generation rate, upgrade button (with cost), agent assignment slot
- Manual cranking uses existing heat mechanics (heat builds up, cools down)
- Agent assignment: one slot. Assigned agent walks to the wheel and passively generates tokens at the agent bonus rate per tick

### Agent Passive Generation
At top tier with agent: ~0.15 tokens/tick = ~3 tokens/sec at 20Hz. Not overwhelming — takes ~67 seconds to earn 200 tokens passively.

## 2. Crafting Table

**Position:** (430, 300) — right of player spawn.

**Entity type:** Pre-built building with `BuildingType::CraftingTable`. No upgrades on the table itself.

### Interaction
Click to open a modal with two tabs:

**Crafting Tab (stubbed):**
- Shows an action bar with empty crafting slots
- Greyed out / "Coming Soon" state
- No actual crafting logic implemented yet

**Upgrade Tree Tab:**
- Displays the existing global upgrade tree (`UpgradeTree` UI)
- Allows purchasing upgrades from within the crafting table context

### Visual
Terminal aesthetic modal — gold borders (#d4a017), dark background (#0d0b08), IBM Plex Mono font.

## 3. Recruitable Agent — Sol

**Position:** (400, 330) — below player spawn, between wheel and table.

**Cost:** 10 tokens.

### Mechanic
- Sol spawns with all normal Agent components plus a `Recruitable { cost: 10, recruited: false }` component
- While not recruited: renders in a dormant/locked visual state, agent systems (wander, economy, etc.) skip Sol
- Click on Sol to see recruitment prompt: "Recruit Sol — 10 tokens"
- If player has < 10 tokens: button disabled, shows "Not enough tokens"
- On recruit: 10 tokens deducted, `Recruitable` component removed, Sol transitions to Idle state and becomes a normal controllable agent
- Sol gets Apprentice tier stats (same as current world.rs setup)

## 4. Starting State Changes

| Property | Old Value | New Value |
|----------|-----------|-----------|
| Starting tokens | 50 | 0 |
| Free agents | Sol (Apprentice, active) | Sol (Apprentice, dormant/locked) |
| Spawn entities | None | Token Wheel + Crafting Table + Sol |

## 5. Early Game Loop

1. Player spawns with 0 tokens, sees wheel, table, and dormant Sol
2. Player walks to Token Wheel, clicks to start cranking
3. After earning 10 tokens (~10 rotations at tier 1), player clicks Sol to recruit
4. Sol becomes active — player can assign Sol to the wheel for passive income
5. Player uses tokens to upgrade the wheel (25 for tier 2) or purchase global upgrades at the crafting table
6. As tokens accumulate, player can place new buildings, recruit more agents from the grimoire, explore

## 6. Server Changes

- Add `BuildingTypeKind::TokenWheel` and `BuildingTypeKind::CraftingTable` to protocol
- Add `Recruitable` component to ECS
- Modify `create_world()`: spawn wheel + table + dormant Sol, set balance to 0
- Add `PlayerAction::RecruitAgent { entity_id }` to protocol
- Add recruitment handling in input system
- Ensure agent systems skip `Recruitable { recruited: false }` entities
- Token Wheel upgrade action: `PlayerAction::UpgradeWheel`

## 7. Client Changes

- Render TokenWheel and CraftingTable as buildings (new sprite/visual representation)
- Token Wheel panel: tier display, upgrade button, agent slot
- Crafting Table modal: two-tab layout (Crafting stub + Upgrade Tree)
- Sol recruitment tooltip: cost display, recruit button
- Dormant agent visual: muted/greyed appearance until recruited
