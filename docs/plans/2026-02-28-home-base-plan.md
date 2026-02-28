# Home Base Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the starting home base with a Token Wheel, Crafting Table, and recruitable agent Sol at the player spawn point.

**Architecture:** Three physical ECS entities spawn near the player at (400, 300). The Token Wheel replaces the existing crank system with a visible building entity. The Crafting Table opens a two-tab modal (stubbed crafting + upgrade tree). Sol spawns dormant and costs 10 tokens to recruit. Player starts with 0 tokens.

**Tech Stack:** Rust server (hecs ECS, serde, rmp-serde), TypeScript client (PixiJS, msgpack-lite)

---

### Task 1: Add Protocol Types (Server)

**Files:**
- Modify: `server/src/protocol.rs`

**Step 1: Add new building types to BuildingTypeKind enum**

In `server/src/protocol.rs`, add `TokenWheel` and `CraftingTable` to the `BuildingTypeKind` enum (after `Blockchain`):

```rust
// Home Base
TokenWheel,
CraftingTable,
```

**Step 2: Add Dormant state to AgentStateKind enum**

Add `Dormant` after `Unresponsive`:

```rust
Dormant,
```

**Step 3: Add new PlayerAction variants**

Add these to the `PlayerAction` enum (before the Debug actions section):

```rust
// Home base actions
RecruitAgent { entity_id: u64 },
UpgradeWheel,
AssignAgentToWheel { agent_id: u64 },
UnassignAgentFromWheel,
```

**Step 4: Add recruitable_cost field to EntityData::Agent**

Add `recruitable_cost: Option<i64>` as the last field in `EntityData::Agent`:

```rust
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
    recruitable_cost: Option<i64>,
},
```

**Step 5: Add WheelSnapshot struct and add to GameStateUpdate**

Add this struct near the other snapshot types:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WheelSnapshot {
    pub tier: String,
    pub tokens_per_rotation: f64,
    pub agent_bonus_per_tick: f64,
    pub heat: f32,
    pub max_heat: f32,
    pub is_cranking: bool,
    pub assigned_agent_id: Option<u64>,
    pub upgrade_cost: Option<i64>,
}
```

Add `pub wheel: WheelSnapshot` to `GameStateUpdate` (after `debug`).

**Step 6: Commit**

```
feat: add home base protocol types (TokenWheel, CraftingTable, Dormant, RecruitAgent)
```

---

### Task 2: Add Recruitable Component and Building Definitions (Server)

**Files:**
- Modify: `server/src/ecs/components.rs`
- Modify: `server/src/game/building.rs`

**Step 1: Add Recruitable component**

In `server/src/ecs/components.rs`, add after the Agent Components section:

```rust
#[derive(Debug, Clone)]
pub struct Recruitable {
    pub cost: i64,
}
```

**Step 2: Add TokenWheel and CraftingTable building definitions**

In `server/src/game/building.rs`, add two new match arms in `get_building_definition()` before the closing `}`:

```rust
// ── Home Base ──────────────────────────────────────────────
BuildingTypeKind::TokenWheel => BuildingDefinition {
    kind: *kind,
    name: "Token Wheel",
    tier: 0,
    token_cost: 0,
    build_time: 1.0, // pre-built, effectively instant
    width: 2,
    height: 2,
    light_source: Some((60.0, (0.9, 0.75, 0.3))),
    effects: vec![],
    description: "Spin to earn. Upgrade to earn faster.",
},
BuildingTypeKind::CraftingTable => BuildingDefinition {
    kind: *kind,
    name: "Crafting Table",
    tier: 0,
    token_cost: 0,
    build_time: 1.0,
    width: 2,
    height: 2,
    light_source: Some((40.0, (0.7, 0.6, 0.3))),
    effects: vec![],
    description: "Craft items and research upgrades.",
},
```

**Step 3: Commit**

```
feat: add Recruitable component and home base building definitions
```

---

### Task 3: Modify create_world() for Home Base Spawn (Server)

**Files:**
- Modify: `server/src/ecs/world.rs`

**Step 1: Update imports**

Add `Recruitable` and `Building, BuildingType, ConstructionProgress, LightSource, BuildingEffects` to the imports from `super::components`:

```rust
use super::components::{
    Agent, AgentMorale, AgentName, AgentPersonality, AgentState, AgentStats, AgentTier, AgentXP,
    Assignment, Building, BuildingEffects, BuildingType, CombatPower, CarryCapacity,
    ConstructionProgress, CrankState, CrankTier, GamePhase, GameState, Health, LightSource,
    Player, Position, Recruitable, TokenEconomy, TorchRange, Velocity, VoiceProfile, WeaponType,
};
```

Also add:

```rust
use crate::protocol::BuildingTypeKind;
```

**Step 2: Set starting balance to 0**

Change `balance: 50` to `balance: 0` in the GameState initialization.

**Step 3: Make Sol dormant and recruitable**

Change Sol's `AgentState` from `Idle` to `Dormant`:

```rust
AgentState {
    state: AgentStateKind::Dormant,
},
```

Change Sol's position to (400, 330) — below player spawn.

Add the `Recruitable` component to Sol's spawn tuple:

```rust
Recruitable { cost: 10 },
```

Add `AgentVibeConfig` to Sol so entity sync query works (this component is required by the entity serialization query in main.rs):

```rust
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
```

Also add `WanderState` since Sol will need it once recruited:

```rust
WanderState {
    home_x: 400.0,
    home_y: 330.0,
    waypoint_x: 400.0,
    waypoint_y: 330.0,
    pause_remaining: 0,
    wander_radius: 120.0,
    walk_target: None,
},
```

Import `AgentVibeConfig` and `WanderState` in the use statement.

**Step 4: Spawn Token Wheel building entity (pre-built)**

After the Sol spawn, add:

```rust
// ── Spawn Token Wheel (pre-built at spawn) ─────────────────
world.spawn((
    Building,
    Position { x: 370.0, y: 300.0 },
    BuildingType { kind: BuildingTypeKind::TokenWheel },
    ConstructionProgress {
        current: 1.0,
        total: 1.0,
        assigned_agents: Vec::new(),
    },
    Health {
        current: 100,
        max: 100,
    },
    BuildingEffects {
        effects: vec![],
    },
    LightSource {
        radius: 60.0,
        color: (0.9, 0.75, 0.3),
    },
));
```

**Step 5: Spawn Crafting Table building entity (pre-built)**

```rust
// ── Spawn Crafting Table (pre-built at spawn) ──────────────
world.spawn((
    Building,
    Position { x: 430.0, y: 300.0 },
    BuildingType { kind: BuildingTypeKind::CraftingTable },
    ConstructionProgress {
        current: 1.0,
        total: 1.0,
        assigned_agents: Vec::new(),
    },
    Health {
        current: 100,
        max: 100,
    },
    BuildingEffects {
        effects: vec![],
    },
    LightSource {
        radius: 40.0,
        color: (0.7, 0.6, 0.3),
    },
));
```

**Step 6: Commit**

```
feat: spawn home base entities at world creation (wheel, table, dormant Sol)
```

---

### Task 4: Handle New Actions in Server Input (Server)

**Files:**
- Modify: `server/src/main.rs`

**Step 1: Add Recruitable import**

In the top of main.rs, ensure `Recruitable` is accessible via the wildcard import from components (it already imports `*` from components).

**Step 2: Handle RecruitAgent action**

In the `match action` block (after CrankStop handling around line 143), add:

```rust
PlayerAction::RecruitAgent { entity_id } => {
    let target = hecs::Entity::from_bits(*entity_id);
    if let Ok(recruitable) = world.get::<&Recruitable>(target) {
        let cost = recruitable.cost;
        drop(recruitable);
        if game_state.economy.balance >= cost {
            game_state.economy.balance -= cost;
            // Remove Recruitable component and set to Idle
            let _ = world.remove_one::<Recruitable>(target);
            if let Ok(mut state) = world.get::<&mut AgentState>(target) {
                state.state = AgentStateKind::Idle;
            }
            if let Ok(name) = world.get::<&AgentName>(target) {
                log_entries.push(LogEntry {
                    tick: game_state.tick,
                    text: format!("{} recruited!", name.name),
                    category: LogCategory::Agent,
                });
            }
        }
    }
}
```

**Step 3: Handle UpgradeWheel action**

```rust
PlayerAction::UpgradeWheel => {
    let (next_tier, cost) = match game_state.crank.tier {
        CrankTier::HandCrank => (Some(CrankTier::GearAssembly), 25),
        CrankTier::GearAssembly => (Some(CrankTier::WaterWheel), 75),
        CrankTier::WaterWheel => (Some(CrankTier::RunicEngine), 200),
        CrankTier::RunicEngine => (None, 0), // max tier
    };
    if let Some(tier) = next_tier {
        if game_state.economy.balance >= cost {
            game_state.economy.balance -= cost;
            game_state.crank.tier = tier;
            let tier_name = crank_tier_to_string(&game_state.crank.tier);
            log_entries.push(LogEntry {
                tick: game_state.tick,
                text: format!("Wheel upgraded to {}", tier_name),
                category: LogCategory::Economy,
            });
        }
    }
}
```

**Step 4: Handle AssignAgentToWheel action**

```rust
PlayerAction::AssignAgentToWheel { agent_id } => {
    let entity = hecs::Entity::from_bits(*agent_id);
    // Verify entity is a valid, non-dormant agent
    if let Ok(state) = world.get::<&AgentState>(entity) {
        if state.state != AgentStateKind::Dormant {
            game_state.crank.assigned_agent = Some(entity);
        }
    }
}
PlayerAction::UnassignAgentFromWheel => {
    game_state.crank.assigned_agent = None;
}
```

**Step 5: Update entity sync for agents to include recruitable_cost**

In the agent entity sync section (around line 613-650), after building the `EntityData::Agent`, check for `Recruitable` component:

Replace the agent entities_changed push block. After the existing agent query loop, the recruitable_cost needs to be looked up. The simplest approach: collect entity IDs first, then look up Recruitable for each.

Modify the agent sync block to:

```rust
// Agents
for (id, (pos, name, state, tier, health, morale, vibe, xp_comp)) in world.query_mut::<hecs::With<
    (
        &Position,
        &AgentName,
        &AgentState,
        &AgentTier,
        &Health,
        &AgentMorale,
        &AgentVibeConfig,
        &AgentXP,
    ),
    &Agent,
>>() {
    let health_pct = if health.max > 0 {
        health.current as f32 / health.max as f32
    } else {
        0.0
    };

    // Check if agent is recruitable (has Recruitable component)
    // We'll store entity id and look up after this borrow ends
    entities_changed.push(EntityDelta {
        id: id.to_bits().into(),
        kind: EntityKind::Agent,
        position: Vec2 { x: pos.x, y: pos.y },
        data: EntityData::Agent {
            name: name.name.clone(),
            state: state.state,
            tier: tier.tier,
            health_pct,
            morale_pct: morale.value,
            stars: vibe.stars,
            turns_used: vibe.turns_used,
            max_turns: vibe.max_turns,
            model_lore_name: vibe.model_lore_name.clone(),
            xp: xp_comp.xp,
            level: xp_comp.level,
            recruitable_cost: None, // filled in below
        },
    });
}

// Fill in recruitable_cost for agents that have the Recruitable component
for delta in &mut entities_changed {
    if let EntityData::Agent { recruitable_cost, .. } = &mut delta.data {
        let entity = hecs::Entity::from_bits(delta.id);
        if let Ok(rec) = world.get::<&Recruitable>(entity) {
            *recruitable_cost = Some(rec.cost);
        }
    }
}
```

**Step 6: Add WheelSnapshot to GameStateUpdate construction**

In the GameStateUpdate construction (around line 705), add the `wheel` field:

```rust
wheel: WheelSnapshot {
    tier: crank_tier_to_string(&game_state.crank.tier),
    tokens_per_rotation: game_state.crank.tokens_per_rotation,
    agent_bonus_per_tick: match game_state.crank.tier {
        CrankTier::HandCrank => 0.05,
        CrankTier::GearAssembly => 0.08,
        CrankTier::WaterWheel => 0.10,
        CrankTier::RunicEngine => 0.15,
    },
    heat: game_state.crank.heat,
    max_heat: game_state.crank.max_heat,
    is_cranking: game_state.crank.is_cranking,
    assigned_agent_id: game_state.crank.assigned_agent.map(|e| e.to_bits().into()),
    upgrade_cost: match game_state.crank.tier {
        CrankTier::HandCrank => Some(25),
        CrankTier::GearAssembly => Some(75),
        CrankTier::WaterWheel => Some(200),
        CrankTier::RunicEngine => None,
    },
},
```

**Step 7: Commit**

```
feat: handle home base actions and send wheel/recruitable state to client
```

---

### Task 5: Update Crank System for Agent Passive Generation (Server)

**Files:**
- Modify: `server/src/ecs/systems/crank.rs`

**Step 1: Add agent bonus parameter to crank_system**

Change the function signature to accept `agent_assigned: bool`:

```rust
pub fn crank_system(game_state: &mut GameState, player_cranking: bool, agent_assigned: bool) -> CrankResult {
```

**Step 2: Add agent passive generation**

After the existing passive generation block (around line 61), add:

```rust
// ── Agent-assigned passive generation ──────────────────────
if agent_assigned {
    let agent_bonus = match crank.tier {
        CrankTier::HandCrank => 0.05,
        CrankTier::GearAssembly => 0.08,
        CrankTier::WaterWheel => 0.10,
        CrankTier::RunicEngine => 0.15,
    };
    tokens_generated += agent_bonus;
}
```

**Step 3: Update crank_system call in main.rs**

In `server/src/main.rs` around line 461, change:

```rust
let agent_assigned = game_state.crank.assigned_agent
    .map(|e| world.contains(e))
    .unwrap_or(false);
let crank_result = crank::crank_system(&mut game_state, player_cranking, agent_assigned);
```

**Step 4: Commit**

```
feat: add agent passive token generation to crank/wheel system
```

---

### Task 6: Skip Dormant Agents in Economy System (Server)

**Files:**
- Modify: `server/src/ecs/systems/economy.rs`

**Step 1: Add Dormant skip**

In the agent wages loop (around line 22), add `Dormant` to the skip condition alongside `Unresponsive`:

```rust
if agent_state.state == AgentStateKind::Unresponsive
    || agent_state.state == AgentStateKind::Dormant
{
    continue;
}
```

**Step 2: Commit**

```
fix: skip dormant agents in economy wage calculation
```

---

### Task 7: Update Client Protocol Types

**Files:**
- Modify: `client/src/network/protocol.ts`

**Step 1: Add Dormant to AgentStateKind**

```typescript
export type AgentStateKind =
  | "Idle"
  | "Walking"
  | "Building"
  | "Erroring"
  | "Exploring"
  | "Defending"
  | "Critical"
  | "Unresponsive"
  | "Dormant";
```

**Step 2: Add TokenWheel and CraftingTable to BuildingTypeKind**

```typescript
  // Home Base
  | "TokenWheel"
  | "CraftingTable";
```

**Step 3: Add recruitable_cost to AgentData**

```typescript
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
  recruitable_cost: number | null;
}
```

**Step 4: Add WheelSnapshot interface and add to GameStateUpdate**

```typescript
export interface WheelSnapshot {
  tier: string;
  tokens_per_rotation: number;
  agent_bonus_per_tick: number;
  heat: number;
  max_heat: number;
  is_cranking: boolean;
  assigned_agent_id: number | null;
  upgrade_cost: number | null;
}
```

Add to `GameStateUpdate`:

```typescript
export interface GameStateUpdate {
  // ... existing fields ...
  wheel: WheelSnapshot;
}
```

**Step 5: Add new PlayerAction variants**

```typescript
export type PlayerAction =
  // ... existing variants ...
  | { RecruitAgent: { entity_id: number } }
  | "UpgradeWheel"
  | { AssignAgentToWheel: { agent_id: number } }
  | "UnassignAgentFromWheel";
```

**Step 6: Commit**

```
feat: add home base types to client protocol
```

---

### Task 8: Add Dormant Agent Visual to Entity Renderer (Client)

**Files:**
- Modify: `client/src/renderer/entities.ts`

**Step 1: Add Dormant color to AGENT_STATE_COLORS**

```typescript
const AGENT_STATE_COLORS: Record<AgentStateKind, number> = {
  Idle: 0xccaa44,
  Walking: 0x88ccff,
  Building: 0x44cc66,
  Erroring: 0xff6644,
  Exploring: 0x6688cc,
  Defending: 0xcc4444,
  Critical: 0xff0000,
  Unresponsive: 0x444444,
  Dormant: 0x666655,
};
```

**Step 2: Add dormant visual in drawAgent**

After the state-colored ring (line 281), add a dimming effect for dormant agents:

```typescript
// Dim dormant (recruitable) agents
if (agent.state === 'Dormant') {
  sprite.graphic.circle(0, 0, 10);
  sprite.graphic.stroke({ color: 0x666655, width: 1.5 });
  sprite.container.alpha = 0.6;
} else {
  sprite.container.alpha = 1.0;
}
```

**Step 3: Commit**

```
feat: add dormant agent visual (dimmed, muted color)
```

---

### Task 9: Create Token Wheel Panel UI (Client)

**Files:**
- Create: `client/src/ui/wheel-panel.ts`

**Step 1: Create the Token Wheel panel**

Create `client/src/ui/wheel-panel.ts` — an HTML-based panel (following BuildingPanel pattern):

```typescript
import type { PlayerAction, WheelSnapshot, GameStateUpdate } from '../network/protocol';

const FONT = "'IBM Plex Mono', monospace";

const COLORS = {
  gold: '#d4a017',
  mutedGold: '#c8b06b',
  darkBg: '#1a1a1a',
  panelBg: '#2a2a1a',
  headerBorder: '#3a3020',
  buttonBg: '#2a2418',
  buttonBgHover: '#3a3020',
  white: '#e0d8c0',
  disabled: '#555544',
} as const;

export interface WheelPanelCallbacks {
  onAction: (action: PlayerAction) => void;
  onClose: () => void;
}

export class WheelPanel {
  visible = false;
  private readonly container: HTMLDivElement;
  private readonly tierEl: HTMLSpanElement;
  private readonly rateEl: HTMLSpanElement;
  private readonly heatBar: HTMLDivElement;
  private readonly heatFill: HTMLDivElement;
  private readonly upgradeBtn: HTMLButtonElement;
  private readonly agentSlotEl: HTMLDivElement;
  private readonly callbacks: WheelPanelCallbacks;

  constructor(callbacks: WheelPanelCallbacks) {
    this.callbacks = callbacks;

    this.container = document.createElement('div');
    this.container.id = 'wheel-panel';
    Object.assign(this.container.style, {
      display: 'none',
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: '320px',
      background: COLORS.panelBg,
      border: `1px solid ${COLORS.gold}`,
      borderRadius: '4px',
      fontFamily: FONT,
      color: COLORS.white,
      zIndex: '1000',
      padding: '0',
    });

    // Header
    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '8px 12px',
      borderBottom: `1px solid ${COLORS.headerBorder}`,
      background: COLORS.darkBg,
    });

    const title = document.createElement('h3');
    title.textContent = 'Token Wheel';
    Object.assign(title.style, {
      margin: '0',
      fontSize: '14px',
      color: COLORS.gold,
      fontFamily: FONT,
    });

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    Object.assign(closeBtn.style, {
      background: 'none',
      border: 'none',
      color: COLORS.mutedGold,
      fontSize: '18px',
      cursor: 'pointer',
      fontFamily: FONT,
    });
    closeBtn.onclick = () => this.close();

    header.appendChild(title);
    header.appendChild(closeBtn);
    this.container.appendChild(header);

    // Body
    const body = document.createElement('div');
    Object.assign(body.style, { padding: '12px' });

    // Tier display
    const tierRow = document.createElement('div');
    Object.assign(tierRow.style, { marginBottom: '8px', fontSize: '12px' });
    tierRow.textContent = 'Tier: ';
    this.tierEl = document.createElement('span');
    this.tierEl.style.color = COLORS.gold;
    tierRow.appendChild(this.tierEl);
    body.appendChild(tierRow);

    // Rate display
    const rateRow = document.createElement('div');
    Object.assign(rateRow.style, { marginBottom: '8px', fontSize: '12px' });
    rateRow.textContent = 'Rate: ';
    this.rateEl = document.createElement('span');
    this.rateEl.style.color = COLORS.gold;
    rateRow.appendChild(this.rateEl);
    body.appendChild(rateRow);

    // Heat bar
    const heatLabel = document.createElement('div');
    heatLabel.textContent = 'Heat';
    Object.assign(heatLabel.style, { fontSize: '11px', marginBottom: '4px', color: COLORS.mutedGold });
    body.appendChild(heatLabel);

    this.heatBar = document.createElement('div');
    Object.assign(this.heatBar.style, {
      width: '100%',
      height: '8px',
      background: COLORS.darkBg,
      borderRadius: '2px',
      marginBottom: '12px',
      overflow: 'hidden',
    });
    this.heatFill = document.createElement('div');
    Object.assign(this.heatFill.style, {
      height: '100%',
      width: '0%',
      background: '#cc6644',
      transition: 'width 0.1s',
    });
    this.heatBar.appendChild(this.heatFill);
    body.appendChild(this.heatBar);

    // Upgrade button
    this.upgradeBtn = document.createElement('button');
    Object.assign(this.upgradeBtn.style, {
      width: '100%',
      padding: '8px',
      background: COLORS.buttonBg,
      border: `1px solid ${COLORS.gold}`,
      color: COLORS.gold,
      fontFamily: FONT,
      fontSize: '12px',
      cursor: 'pointer',
      borderRadius: '2px',
      marginBottom: '12px',
    });
    this.upgradeBtn.onmouseenter = () => { this.upgradeBtn.style.background = COLORS.buttonBgHover; };
    this.upgradeBtn.onmouseleave = () => { this.upgradeBtn.style.background = COLORS.buttonBg; };
    this.upgradeBtn.onclick = () => this.callbacks.onAction('UpgradeWheel');
    body.appendChild(this.upgradeBtn);

    // Agent slot
    const agentLabel = document.createElement('div');
    agentLabel.textContent = 'Assigned Agent';
    Object.assign(agentLabel.style, { fontSize: '11px', marginBottom: '4px', color: COLORS.mutedGold });
    body.appendChild(agentLabel);

    this.agentSlotEl = document.createElement('div');
    Object.assign(this.agentSlotEl.style, {
      padding: '8px',
      background: COLORS.darkBg,
      border: `1px solid ${COLORS.headerBorder}`,
      borderRadius: '2px',
      fontSize: '12px',
      textAlign: 'center',
    });
    this.agentSlotEl.textContent = 'None';
    body.appendChild(this.agentSlotEl);

    this.container.appendChild(body);
    document.body.appendChild(this.container);
  }

  open(): void {
    this.visible = true;
    this.container.style.display = 'block';
  }

  close(): void {
    this.visible = false;
    this.container.style.display = 'none';
    this.callbacks.onClose();
  }

  update(wheel: WheelSnapshot, agentNames: Map<number, string>): void {
    this.tierEl.textContent = wheel.tier;
    const rateText = `${wheel.tokens_per_rotation}/crank`;
    const agentText = wheel.assigned_agent_id != null
      ? ` + ${(wheel.agent_bonus_per_tick * 20).toFixed(1)}/sec (agent)`
      : '';
    this.rateEl.textContent = rateText + agentText;

    // Heat bar
    const heatPct = wheel.max_heat > 0 ? (wheel.heat / wheel.max_heat) * 100 : 0;
    this.heatFill.style.width = `${heatPct}%`;

    // Upgrade button
    if (wheel.upgrade_cost != null) {
      this.upgradeBtn.textContent = `Upgrade — ${wheel.upgrade_cost} tokens`;
      this.upgradeBtn.disabled = false;
      this.upgradeBtn.style.opacity = '1';
    } else {
      this.upgradeBtn.textContent = 'MAX TIER';
      this.upgradeBtn.disabled = true;
      this.upgradeBtn.style.opacity = '0.5';
    }

    // Agent slot
    if (wheel.assigned_agent_id != null) {
      const name = agentNames.get(wheel.assigned_agent_id) ?? 'Unknown';
      this.agentSlotEl.textContent = name;
    } else {
      this.agentSlotEl.textContent = 'None — click an agent to assign';
    }
  }
}
```

**Step 2: Commit**

```
feat: create Token Wheel panel UI component
```

---

### Task 10: Create Crafting Table Modal UI (Client)

**Files:**
- Create: `client/src/ui/crafting-modal.ts`

**Step 1: Create the Crafting Table modal**

Create `client/src/ui/crafting-modal.ts` — two-tab modal:

```typescript
import type { PlayerAction } from '../network/protocol';

const FONT = "'IBM Plex Mono', monospace";

const COLORS = {
  gold: '#d4a017',
  mutedGold: '#c8b06b',
  darkBg: '#1a1a1a',
  panelBg: '#2a2a1a',
  headerBorder: '#3a3020',
  buttonBg: '#2a2418',
  buttonBgHover: '#3a3020',
  white: '#e0d8c0',
  disabled: '#555544',
} as const;

export interface CraftingModalCallbacks {
  onAction: (action: PlayerAction) => void;
  onClose: () => void;
}

export class CraftingModal {
  visible = false;
  private readonly container: HTMLDivElement;
  private readonly craftingTab: HTMLDivElement;
  private readonly upgradeTab: HTMLDivElement;
  private readonly craftingContent: HTMLDivElement;
  private readonly upgradeContent: HTMLDivElement;
  private activeTab: 'crafting' | 'upgrades' = 'crafting';
  private readonly callbacks: CraftingModalCallbacks;

  constructor(callbacks: CraftingModalCallbacks) {
    this.callbacks = callbacks;

    this.container = document.createElement('div');
    this.container.id = 'crafting-modal';
    Object.assign(this.container.style, {
      display: 'none',
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: '400px',
      height: '350px',
      background: COLORS.panelBg,
      border: `1px solid ${COLORS.gold}`,
      borderRadius: '4px',
      fontFamily: FONT,
      color: COLORS.white,
      zIndex: '1000',
      overflow: 'hidden',
    });

    // Header with tabs
    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex',
      alignItems: 'center',
      borderBottom: `1px solid ${COLORS.headerBorder}`,
      background: COLORS.darkBg,
    });

    // Crafting tab button
    this.craftingTab = document.createElement('div');
    this.craftingTab.textContent = 'Crafting';
    Object.assign(this.craftingTab.style, {
      padding: '8px 16px',
      fontSize: '12px',
      cursor: 'pointer',
      borderBottom: `2px solid ${COLORS.gold}`,
      color: COLORS.gold,
      fontFamily: FONT,
    });
    this.craftingTab.onclick = () => this.switchTab('crafting');

    // Upgrades tab button
    this.upgradeTab = document.createElement('div');
    this.upgradeTab.textContent = 'Upgrades';
    Object.assign(this.upgradeTab.style, {
      padding: '8px 16px',
      fontSize: '12px',
      cursor: 'pointer',
      borderBottom: '2px solid transparent',
      color: COLORS.mutedGold,
      fontFamily: FONT,
    });
    this.upgradeTab.onclick = () => this.switchTab('upgrades');

    // Close button (pushed to right)
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    const closeBtn = document.createElement('div');
    closeBtn.textContent = '×';
    Object.assign(closeBtn.style, {
      padding: '8px 12px',
      fontSize: '18px',
      cursor: 'pointer',
      color: COLORS.mutedGold,
    });
    closeBtn.onclick = () => this.close();

    header.appendChild(this.craftingTab);
    header.appendChild(this.upgradeTab);
    header.appendChild(spacer);
    header.appendChild(closeBtn);
    this.container.appendChild(header);

    // Crafting content (stubbed)
    this.craftingContent = document.createElement('div');
    Object.assign(this.craftingContent.style, {
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: 'calc(100% - 40px)',
    });

    // Crafting slots grid (stubbed)
    const slotsGrid = document.createElement('div');
    Object.assign(slotsGrid.style, {
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 48px)',
      gap: '8px',
      marginBottom: '16px',
    });

    for (let i = 0; i < 8; i++) {
      const slot = document.createElement('div');
      Object.assign(slot.style, {
        width: '48px',
        height: '48px',
        border: `1px solid ${COLORS.headerBorder}`,
        borderRadius: '2px',
        background: COLORS.darkBg,
        opacity: '0.4',
      });
      slotsGrid.appendChild(slot);
    }

    this.craftingContent.appendChild(slotsGrid);

    const comingSoon = document.createElement('div');
    comingSoon.textContent = 'Crafting coming soon...';
    Object.assign(comingSoon.style, {
      color: COLORS.disabled,
      fontSize: '12px',
      fontStyle: 'italic',
    });
    this.craftingContent.appendChild(comingSoon);
    this.container.appendChild(this.craftingContent);

    // Upgrades content (placeholder — will integrate with UpgradeTree)
    this.upgradeContent = document.createElement('div');
    Object.assign(this.upgradeContent.style, {
      padding: '20px',
      display: 'none',
      height: 'calc(100% - 40px)',
      overflowY: 'auto',
    });

    const upgradesPlaceholder = document.createElement('div');
    upgradesPlaceholder.textContent = 'Upgrade Tree — Coming Soon';
    Object.assign(upgradesPlaceholder.style, {
      color: COLORS.disabled,
      fontSize: '12px',
      fontStyle: 'italic',
      textAlign: 'center',
      paddingTop: '40px',
    });
    this.upgradeContent.appendChild(upgradesPlaceholder);
    this.container.appendChild(this.upgradeContent);

    document.body.appendChild(this.container);
  }

  private switchTab(tab: 'crafting' | 'upgrades'): void {
    this.activeTab = tab;
    if (tab === 'crafting') {
      this.craftingTab.style.borderBottom = `2px solid ${COLORS.gold}`;
      this.craftingTab.style.color = COLORS.gold;
      this.upgradeTab.style.borderBottom = '2px solid transparent';
      this.upgradeTab.style.color = COLORS.mutedGold;
      this.craftingContent.style.display = 'flex';
      this.upgradeContent.style.display = 'none';
    } else {
      this.upgradeTab.style.borderBottom = `2px solid ${COLORS.gold}`;
      this.upgradeTab.style.color = COLORS.gold;
      this.craftingTab.style.borderBottom = '2px solid transparent';
      this.craftingTab.style.color = COLORS.mutedGold;
      this.craftingContent.style.display = 'none';
      this.upgradeContent.style.display = 'block';
    }
  }

  open(): void {
    this.visible = true;
    this.container.style.display = 'block';
    this.switchTab('crafting');
  }

  close(): void {
    this.visible = false;
    this.container.style.display = 'none';
    this.callbacks.onClose();
  }
}
```

**Step 2: Commit**

```
feat: create Crafting Table modal UI (stubbed crafting + upgrades tab)
```

---

### Task 11: Wire Up Home Base Interactions in main.tsx (Client)

**Files:**
- Modify: `client/src/main.tsx`

**Step 1: Import new UI components**

Add imports at the top:

```typescript
import { WheelPanel } from './ui/wheel-panel';
import { CraftingModal } from './ui/crafting-modal';
```

**Step 2: Initialize WheelPanel and CraftingModal**

After the existing `buildingPanel` initialization (around line 98-110), add:

```typescript
const wheelPanel = new WheelPanel({
  onAction: (action) => {
    const input: PlayerInput = { tick: clientTick, movement: { x: 0, y: 0 }, action, target: null };
    connection.sendInput(input);
  },
  onClose: () => {},
});

const craftingModal = new CraftingModal({
  onAction: (action) => {
    const input: PlayerInput = { tick: clientTick, movement: { x: 0, y: 0 }, action, target: null };
    connection.sendInput(input);
  },
  onClose: () => {},
});
```

**Step 3: Handle building click for TokenWheel and CraftingTable**

In the 'E' key interact handler (around line 880-907), where it finds the nearest building and opens the buildingPanel, add special handling before the existing `if (nearestType)` block:

```typescript
if (nearestType === 'TokenWheel') {
  wheelPanel.open();
  interactedWithBuilding = true;
} else if (nearestType === 'CraftingTable') {
  craftingModal.open();
  interactedWithBuilding = true;
} else if (nearestType) {
  // existing building panel open code...
```

**Step 4: Handle click on dormant agent for recruitment**

In the canvas click handler (around line 611-650), modify the agent click detection to also handle dormant agents. After the existing check for `clickedAgentData.state === 'Building'`, add an else-if for Dormant:

```typescript
if (clickedAgentId !== null && clickedAgentData !== null) {
  if (clickedAgentData.state === 'Building') {
    // existing terminal overlay code...
  } else if (clickedAgentData.state === 'Dormant') {
    // Find the entity delta for this agent to check recruitable_cost
    const entity = entityMap.get(clickedAgentId);
    const agentData = entity ? (entity.data as { Agent?: { recruitable_cost: number | null } }).Agent : null;
    if (agentData?.recruitable_cost != null) {
      const cost = agentData.recruitable_cost;
      const balance = latestState?.player?.tokens ?? 0;
      if (balance >= cost) {
        const input: PlayerInput = {
          tick: clientTick,
          movement: { x: 0, y: 0 },
          action: { RecruitAgent: { entity_id: clickedAgentId } },
          target: null,
        };
        connection.sendInput(input);
      }
    }
  }
}
```

**Step 5: Update WheelPanel each frame**

In the state update callback (where `latestState` is set), add wheel panel update:

```typescript
// Update wheel panel if visible
if (wheelPanel.visible && latestState?.wheel) {
  const agentNames = new Map<number, string>();
  for (const entity of entityMap.values()) {
    if (entity.kind === 'Agent') {
      const data = (entity.data as { Agent?: { name: string } }).Agent;
      if (data) agentNames.set(entity.id, data.name);
    }
  }
  wheelPanel.update(latestState.wheel, agentNames);
}
```

**Step 6: Close panels on Escape**

In the keydown handler, add panel close for Escape:

```typescript
if (e.key === 'Escape') {
  if (wheelPanel.visible) wheelPanel.close();
  if (craftingModal.visible) craftingModal.close();
}
```

**Step 7: Commit**

```
feat: wire up home base interactions (wheel panel, crafting modal, agent recruitment)
```

---

### Task 12: Build and Test

**Step 1: Build the server**

```bash
cd server && cargo build 2>&1
```

Fix any compilation errors.

**Step 2: Build the client**

```bash
cd client && npx tsc --noEmit 2>&1
```

Fix any TypeScript errors.

**Step 3: Run the game and verify**

```bash
cd server && cargo run &
cd client && npm run dev
```

Verify:
- Player spawns with 0 tokens
- Token Wheel visible at (370, 300) — click/E opens wheel panel
- Crafting Table visible at (430, 300) — click/E opens crafting modal with two tabs
- Sol visible at (400, 330) in dormant/dimmed state
- Cranking the wheel generates tokens
- After 10 tokens, clicking Sol recruits them
- Sol becomes active and wanders
- Wheel upgrade button works
- Wheel panel shows correct tier, rate, heat

**Step 4: Final commit**

```
feat: home base complete — Token Wheel, Crafting Table, recruitable Sol
```
