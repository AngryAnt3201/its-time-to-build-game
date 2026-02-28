# Agent System — Vibe Config & Tooltip Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Mistral Vibe configuration to agents (model tier, max turns, error mechanics) and agent hover tooltips matching equipment tooltip style.

**Architecture:** New `AgentVibeConfig` ECS component on server holds model/turn/error config per agent. Protocol extended with new fields synced to client. Client AgentsHUD gains hover tooltips reusing the EquipmentHUD tooltip pattern. Agent turn system ticks in the game loop and transitions agents to Erroring state when turns exhaust.

**Tech Stack:** Rust (server ECS + protocol), TypeScript/PixiJS (client UI)

---

### Task 1: Add AgentVibeConfig Component (Server)

**Files:**
- Modify: `server/src/ecs/components.rs:140` (after VoiceProfile struct)

**Step 1: Add the new component struct**

Insert after line 140 in `components.rs` (after `VoiceProfile`):

```rust
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
```

**Step 2: Verify it compiles**

Run: `cd server && cargo check`
Expected: Compiles with no errors (unused warning is fine)

**Step 3: Commit**

```bash
git add server/src/ecs/components.rs
git commit -m "feat: add AgentVibeConfig ECS component"
```

---

### Task 2: Wire AgentVibeConfig into Agent Recruitment (Server)

**Files:**
- Modify: `server/src/game/agents.rs:1-8` (imports)
- Modify: `server/src/game/agents.rs:30-46` (generate_stats → also generate vibe config)
- Modify: `server/src/game/agents.rs:86-109` (recruit_agent spawn tuple)

**Step 1: Add import for AgentVibeConfig**

In `agents.rs` line 4-7, add `AgentVibeConfig` to the import:

```rust
use crate::ecs::components::{
    Agent, AgentMorale, AgentName, AgentState, AgentStats, AgentTier, AgentVibeConfig, AgentXP,
    Assignment, Collider, Health, Position, TokenEconomy, Velocity, VoiceProfile,
};
```

**Step 2: Add vibe config generator function**

Insert after `generate_stats()` (after line 46):

```rust
/// Generate the Vibe configuration for a given agent tier.
fn generate_vibe_config(tier: AgentTierKind) -> AgentVibeConfig {
    match tier {
        AgentTierKind::Apprentice => AgentVibeConfig {
            model_id: "ministral-3b-2025-01".to_string(),
            model_lore_name: "Flickering Candle".to_string(),
            max_turns: 5,
            turns_used: 0,
            context_window: 128_000,
            token_burn_rate: 3,
            error_chance_base: 0.15,
            stars: 1,
        },
        AgentTierKind::Journeyman => AgentVibeConfig {
            model_id: "ministral-8b-2025-01".to_string(),
            model_lore_name: "Steady Flame".to_string(),
            max_turns: 15,
            turns_used: 0,
            context_window: 128_000,
            token_burn_rate: 2,
            error_chance_base: 0.08,
            stars: 2,
        },
        AgentTierKind::Artisan => AgentVibeConfig {
            model_id: "codestral-2025-05".to_string(),
            model_lore_name: "Codestral Engine".to_string(),
            max_turns: 30,
            turns_used: 0,
            context_window: 256_000,
            token_burn_rate: 1,
            error_chance_base: 0.04,
            stars: 3,
        },
        AgentTierKind::Architect => AgentVibeConfig {
            model_id: "devstral-2-2025-07".to_string(),
            model_lore_name: "Abyssal Architect".to_string(),
            max_turns: 50,
            turns_used: 0,
            context_window: 256_000,
            token_burn_rate: 1,
            error_chance_base: 0.02,
            stars: 3,
        },
    }
}
```

**Step 3: Add AgentVibeConfig to the spawn tuple in recruit_agent**

In `recruit_agent()`, add `generate_vibe_config(tier)` to the `world.spawn((...))` tuple at line 86-109. Add it after `VoiceProfile`:

```rust
    let entity = world.spawn((
        Agent,
        Position {
            x: spawn_x,
            y: spawn_y,
        },
        Velocity::default(),
        Collider { radius: 5.0 },
        Health {
            current: resilience,
            max: resilience,
        },
        stats,
        AgentState {
            state: AgentStateKind::Idle,
        },
        AgentMorale { value: 0.7 },
        AgentXP { xp: 0, level: 1 },
        AgentTier { tier },
        AgentName { name },
        VoiceProfile {
            voice_id: "placeholder".to_string(),
        },
        generate_vibe_config(tier),
    ));
```

**Step 4: Verify it compiles**

Run: `cd server && cargo check`
Expected: Compiles with no errors

**Step 5: Run existing tests to verify nothing broke**

Run: `cd server && cargo test -- agents`
Expected: All 7 existing tests pass

**Step 6: Add test for vibe config on recruited agents**

Add to the `tests` module in `agents.rs`:

```rust
    #[test]
    fn recruited_apprentice_has_vibe_config() {
        let mut world = World::new();
        let mut economy = make_economy(100);
        let entity =
            recruit_agent(&mut world, AgentTierKind::Apprentice, 0.0, 0.0, &mut economy).unwrap();

        let vibe = world.get::<&AgentVibeConfig>(entity).unwrap();
        assert_eq!(vibe.max_turns, 5);
        assert_eq!(vibe.stars, 1);
        assert_eq!(vibe.turns_used, 0);
        assert_eq!(vibe.token_burn_rate, 3);
    }

    #[test]
    fn recruited_architect_has_frontier_vibe_config() {
        let mut world = World::new();
        let mut economy = make_economy(500);
        let entity =
            recruit_agent(&mut world, AgentTierKind::Architect, 0.0, 0.0, &mut economy).unwrap();

        let vibe = world.get::<&AgentVibeConfig>(entity).unwrap();
        assert_eq!(vibe.max_turns, 50);
        assert_eq!(vibe.stars, 3);
        assert_eq!(vibe.model_lore_name, "Abyssal Architect");
    }
```

**Step 7: Run tests**

Run: `cd server && cargo test -- agents`
Expected: All 9 tests pass (7 existing + 2 new)

**Step 8: Commit**

```bash
git add server/src/game/agents.rs server/src/ecs/components.rs
git commit -m "feat: wire AgentVibeConfig into agent recruitment with tier-based model mapping"
```

---

### Task 3: Extend Protocol with Vibe Fields (Server)

**Files:**
- Modify: `server/src/protocol.rs:47-53` (EntityData::Agent variant)

**Step 1: Add new fields to EntityData::Agent**

Replace the Agent variant (lines 47-53) with:

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
    },
```

**Step 2: Update entity serialization in main.rs**

In `main.rs` lines 277-306, update the agent query to also fetch `AgentVibeConfig` and `AgentXP`, then include the new fields in `EntityData::Agent`.

Update the query type tuple to add `&AgentVibeConfig` and `&AgentXP`:

```rust
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
                },
            });
        }
```

**Step 3: Add AgentVibeConfig and AgentXP to main.rs imports**

In `main.rs` imports, ensure `AgentVibeConfig` and `AgentXP` are imported from `crate::ecs::components`.

**Step 4: Verify it compiles**

Run: `cd server && cargo check`
Expected: Compiles with no errors

**Step 5: Commit**

```bash
git add server/src/protocol.rs server/src/main.rs
git commit -m "feat: extend agent protocol with vibe config fields (stars, turns, model, xp)"
```

---

### Task 4: Update Client Protocol Types (Client)

**Files:**
- Modify: `client/src/network/protocol.ts:42-48` (AgentData interface)

**Step 1: Add new fields to AgentData interface**

Replace the AgentData interface (lines 42-48) with:

```typescript
interface AgentData {
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
```

**Step 2: Verify the client still builds**

Run: `cd client && npx tsc --noEmit`
Expected: No type errors (downstream consumers may need updating — that's Task 5)

**Step 3: Commit**

```bash
git add client/src/network/protocol.ts
git commit -m "feat: extend client AgentData with vibe fields"
```

---

### Task 5: Update AgentsHUD to Store New Fields (Client)

**Files:**
- Modify: `client/src/ui/agents-hud.ts:67-74` (AgentEntry interface)
- Modify: `client/src/ui/agents-hud.ts:162-172` (update method agent data extraction)

**Step 1: Extend AgentEntry interface**

Replace lines 67-74:

```typescript
interface AgentEntry {
  id: number;
  name: string;
  tier: AgentTierKind;
  state: AgentStateKind;
  health_pct: number;
  morale_pct: number;
  stars: number;
  turns_used: number;
  max_turns: number;
  model_lore_name: string;
  xp: number;
  level: number;
}
```

**Step 2: Update the agent data extraction in update()**

Replace lines 165-172 (the `this.agents.set(...)` call):

```typescript
        this.agents.set(delta.id, {
          id: delta.id,
          name: a.name,
          tier: a.tier,
          state: a.state,
          health_pct: a.health_pct,
          morale_pct: a.morale_pct,
          stars: a.stars,
          turns_used: a.turns_used,
          max_turns: a.max_turns,
          model_lore_name: a.model_lore_name,
          xp: a.xp,
          level: a.level,
        });
```

**Step 3: Verify the client builds**

Run: `cd client && npx tsc --noEmit`
Expected: No type errors

**Step 4: Commit**

```bash
git add client/src/ui/agents-hud.ts
git commit -m "feat: store vibe fields in AgentsHUD agent entries"
```

---

### Task 6: Add Star Display to Agent Cards (Client)

**Files:**
- Modify: `client/src/ui/agents-hud.ts:269-274` (replace tier badge with star display in buildCard)

**Step 1: Replace the tier badge with stars**

In `buildCard()`, replace the tier badge block (lines 269-274) with a star display:

```typescript
    // Star rating (replaces old tier badge dot)
    const starColor = 0xd4a017;
    const emptyStarColor = 0x2a2418;
    const starText = new Text({
      text: '★'.repeat(agent.stars) + '☆'.repeat(3 - agent.stars),
      style: new TextStyle({
        fontFamily: FONT,
        fontSize: 9,
        fill: starColor,
      }),
    });
    starText.x = cw - starText.width - 4;
    starText.y = 3;
    card.addChild(starText);

    // Dim the empty stars with an overlay text
    if (agent.stars < 3) {
      const emptyStars = new Text({
        text: ' '.repeat(agent.stars) + '☆'.repeat(3 - agent.stars),
        style: new TextStyle({
          fontFamily: FONT,
          fontSize: 9,
          fill: emptyStarColor,
        }),
      });
      emptyStars.x = starText.x;
      emptyStars.y = 3;
      card.addChild(emptyStars);
    }
```

**Step 2: Verify the client builds**

Run: `cd client && npx tsc --noEmit`
Expected: No type errors

**Step 3: Commit**

```bash
git add client/src/ui/agents-hud.ts
git commit -m "feat: replace tier badge with star rating display on agent cards"
```

---

### Task 7: Add Hover Tooltip to AgentsHUD (Client)

**Files:**
- Modify: `client/src/ui/agents-hud.ts` (add tooltip infrastructure matching EquipmentHUD pattern)

This is the largest task. It adds the tooltip container, tooltip rendering logic, and hover events to agent cards.

**Step 1: Add tooltip style constants**

After the existing style constants (around line 53), add:

```typescript
// ── Tooltip styles ──────────────────────────────────────────────────

const tooltipNameStyle = new TextStyle({
  fontFamily: FONT,
  fontSize: 12,
  fontWeight: 'bold',
  fill: 0xd4a017,
});

const tooltipLoreStyle = new TextStyle({
  fontFamily: FONT,
  fontSize: 10,
  fontStyle: 'italic',
  fill: 0x8a7a5a,
});

const tooltipStatStyle = new TextStyle({
  fontFamily: FONT,
  fontSize: 9,
  fill: 0x6a8a6a,
});

const tooltipStateStyle = new TextStyle({
  fontFamily: FONT,
  fontSize: 9,
  fill: 0x9a9a8a,
});

const tooltipLabelStyle = new TextStyle({
  fontFamily: FONT,
  fontSize: 9,
  fill: 0x5a5a4a,
});

const TOOLTIP_W = 200;
```

**Step 2: Add tooltip container and elements to the class**

Add new fields to the `AgentsHUD` class (after line 115 `private needsRebuild`):

```typescript
  /** The tooltip container — add to the top-level UI so it renders above everything. */
  readonly tooltipContainer: Container;

  private tooltipBg: Graphics;
  private tooltipBrackets: Graphics;
  private tooltipName: Text;
  private tooltipStars: Text;
  private tooltipLore: Text;
  private tooltipStats1: Text;
  private tooltipStats2: Text;
  private tooltipState: Text;
  private tooltipMoraleLabel: Text;
  private tooltipMoraleBar: Graphics;
  private tooltipTurns: Text;
  private tooltipXP: Text;
  private hoveredAgent: AgentEntry | null = null;
```

**Step 3: Initialize tooltip in constructor**

Add at the end of the constructor (before the closing `}`), after `this.drawPanel(0)`:

```typescript
    // ── Tooltip (separate container for z-order) ──
    this.tooltipContainer = new Container();
    this.tooltipContainer.label = 'agent-tooltip';
    this.tooltipContainer.visible = false;

    this.tooltipBg = new Graphics();
    this.tooltipContainer.addChild(this.tooltipBg);

    this.tooltipBrackets = new Graphics();
    this.tooltipContainer.addChild(this.tooltipBrackets);

    this.tooltipName = new Text({ text: '', style: tooltipNameStyle });
    this.tooltipName.x = 10;
    this.tooltipName.y = 8;
    this.tooltipContainer.addChild(this.tooltipName);

    this.tooltipStars = new Text({ text: '', style: new TextStyle({ fontFamily: FONT, fontSize: 11, fill: 0xd4a017 }) });
    this.tooltipContainer.addChild(this.tooltipStars);

    this.tooltipLore = new Text({ text: '', style: tooltipLoreStyle });
    this.tooltipLore.x = 10;
    this.tooltipLore.y = 24;
    this.tooltipContainer.addChild(this.tooltipLore);

    this.tooltipStats1 = new Text({ text: '', style: tooltipStatStyle });
    this.tooltipStats1.x = 10;
    this.tooltipStats1.y = 44;
    this.tooltipContainer.addChild(this.tooltipStats1);

    this.tooltipStats2 = new Text({ text: '', style: tooltipStatStyle });
    this.tooltipStats2.x = 10;
    this.tooltipStats2.y = 56;
    this.tooltipContainer.addChild(this.tooltipStats2);

    this.tooltipState = new Text({ text: '', style: tooltipStateStyle });
    this.tooltipState.x = 10;
    this.tooltipState.y = 74;
    this.tooltipContainer.addChild(this.tooltipState);

    this.tooltipMoraleLabel = new Text({ text: '', style: tooltipLabelStyle });
    this.tooltipMoraleLabel.x = 10;
    this.tooltipMoraleLabel.y = 88;
    this.tooltipContainer.addChild(this.tooltipMoraleLabel);

    this.tooltipMoraleBar = new Graphics();
    this.tooltipMoraleBar.y = 88;
    this.tooltipContainer.addChild(this.tooltipMoraleBar);

    this.tooltipTurns = new Text({ text: '', style: tooltipLabelStyle });
    this.tooltipTurns.x = 10;
    this.tooltipTurns.y = 102;
    this.tooltipContainer.addChild(this.tooltipTurns);

    this.tooltipXP = new Text({ text: '', style: tooltipLabelStyle });
    this.tooltipXP.x = 10;
    this.tooltipXP.y = 116;
    this.tooltipContainer.addChild(this.tooltipXP);
```

**Step 4: Add tooltip show/hide/move methods**

Add these private methods to the class:

```typescript
  private showAgentTooltip(agent: AgentEntry): void {
    this.hoveredAgent = agent;

    this.tooltipName.text = agent.name.toUpperCase();

    // Stars — position to the right of the name
    const starFull = '★'.repeat(agent.stars);
    const starEmpty = '☆'.repeat(3 - agent.stars);
    this.tooltipStars.text = starFull + starEmpty;
    this.tooltipStars.x = TOOLTIP_W - this.tooltipStars.width - 10;
    this.tooltipStars.y = 10;

    this.tooltipLore.text = `"${agent.model_lore_name}"`;

    // Stats — we don't have raw stats on client yet, show tier-implied info
    this.tooltipStats1.text = `Tier: ${agent.tier}`;
    this.tooltipStats2.text = `Health: ${Math.round(agent.health_pct * 100)}%`;

    // State with color
    const stateColor = STATE_COLORS[agent.state] ?? 0x9a9a8a;
    this.tooltipState.style.fill = stateColor;
    this.tooltipState.text = `State: ${agent.state === 'Unresponsive' ? 'DEAD' : agent.state}`;

    // Morale
    const moralePct = Math.round(agent.morale_pct * 100);
    this.tooltipMoraleLabel.text = `Morale: ${moralePct}%`;

    // Morale bar
    const barX = 70;
    const barW = 80;
    const barH = 6;
    this.tooltipMoraleBar.clear();
    this.tooltipMoraleBar.rect(barX, 2, barW, barH);
    this.tooltipMoraleBar.fill({ color: 0x1a1210, alpha: 0.9 });
    this.tooltipMoraleBar.rect(barX, 2, barW * agent.morale_pct, barH);
    this.tooltipMoraleBar.fill({ color: moralePct < 30 ? 0x883333 : 0x887733, alpha: 1.0 });

    // Turns
    const turnRatio = agent.max_turns > 0 ? agent.turns_used / agent.max_turns : 0;
    const turnColor = turnRatio > 0.8 ? 0xaa3333 : 0x5a5a4a;
    this.tooltipTurns.style.fill = turnColor;
    this.tooltipTurns.text = `Turns: ${agent.turns_used}/${agent.max_turns}`;

    // XP
    this.tooltipXP.text = `XP: ${agent.xp}  Lv.${agent.level}`;

    // Resize tooltip background
    const tooltipH = 134;
    this.tooltipBg.clear();
    this.tooltipBg.roundRect(0, 0, TOOLTIP_W, tooltipH, 3);
    this.tooltipBg.fill({ color: 0x0d0b08, alpha: 0.94 });
    this.tooltipBg.roundRect(0, 0, TOOLTIP_W, tooltipH, 3);
    this.tooltipBg.stroke({ color: 0x3a3020, alpha: 0.7, width: 1 });

    this.tooltipBrackets.clear();
    drawCornerBrackets(this.tooltipBrackets, 0, 0, TOOLTIP_W, tooltipH, 6, 0xd4a017, 0.35);

    this.tooltipContainer.visible = true;
  }

  private hideAgentTooltip(): void {
    this.hoveredAgent = null;
    this.tooltipContainer.visible = false;
  }

  private moveAgentTooltip(globalX: number, globalY: number): void {
    this.tooltipContainer.x = globalX + 16;
    this.tooltipContainer.y = globalY - 20;
  }
```

**Step 5: Wire hover events into buildCard()**

In `buildCard()`, make the card interactive and add event listeners. Add after the card background is created (after `card.addChild(bg)` around line 247):

```typescript
    // Make card interactive for tooltip
    card.eventMode = 'static';
    card.cursor = 'pointer';
    card.on('pointerover', () => this.showAgentTooltip(agent));
    card.on('pointerout', () => this.hideAgentTooltip());
    card.on('pointermove', (e) => this.moveAgentTooltip(e.globalX, e.globalY));
```

**Step 6: Verify the client builds**

Run: `cd client && npx tsc --noEmit`
Expected: No type errors

**Step 7: Commit**

```bash
git add client/src/ui/agents-hud.ts
git commit -m "feat: add hover tooltips to agent cards with vibe config display"
```

---

### Task 8: Register Tooltip Container in Main UI (Client)

**Files:**
- Modify: `client/src/main.tsx` or wherever the AgentsHUD is instantiated and added to the stage

**Step 1: Find where AgentsHUD is created and add tooltipContainer to stage**

Wherever `agentsHud.container` is added to the PixiJS stage, also add `agentsHud.tooltipContainer` to the stage at a higher z-index (same pattern as EquipmentHUD):

```typescript
// After adding agentsHud.container to the UI layer:
uiContainer.addChild(agentsHud.tooltipContainer);
```

The tooltip container must be added AFTER all other UI containers so it renders on top.

**Step 2: Verify it builds and renders**

Run: `cd client && npm run dev`
Expected: Agent cards show tooltips on hover

**Step 3: Commit**

```bash
git add client/src/main.tsx
git commit -m "feat: register agent tooltip container in main UI layer"
```

---

### Task 9: Add Agent Turn Tick System (Server)

**Files:**
- Create: `server/src/ecs/systems/agent_tick.rs`
- Modify: `server/src/ecs/systems/mod.rs` (add module declaration)
- Modify: `server/src/main.rs` (call agent_tick system in game loop)

**Step 1: Create the agent tick system**

```rust
use hecs::World;
use crate::ecs::components::{
    Agent, AgentMorale, AgentState, AgentVibeConfig, Health, TokenEconomy,
};
use crate::protocol::AgentStateKind;

/// Result of the agent tick system — log entries for the client.
pub struct AgentTickResult {
    pub log_entries: Vec<String>,
}

/// Tick all working agents: increment turns_used, check for errors, handle erroring state.
pub fn agent_tick_system(world: &mut World, economy: &mut TokenEconomy) -> AgentTickResult {
    let mut log_entries = Vec::new();
    let mut to_error: Vec<hecs::Entity> = Vec::new();
    let mut token_drain: i64 = 0;

    // Phase 1: Check working agents for turn limits and random errors
    for (id, (state, vibe, stats)) in world
        .query_mut::<hecs::With<(&AgentState, &mut AgentVibeConfig, &crate::ecs::components::AgentStats), &Agent>>()
    {
        match state.state {
            AgentStateKind::Building | AgentStateKind::Exploring | AgentStateKind::Defending => {
                vibe.turns_used += 1;

                // Check turn limit
                if vibe.turns_used >= vibe.max_turns {
                    to_error.push(id);
                    continue;
                }

                // Random error check
                let turn_ratio = vibe.turns_used as f32 / vibe.max_turns as f32;
                let error_chance = vibe.error_chance_base * (1.0 - stats.reliability) * turn_ratio;
                let roll: f32 = rand::random();
                if roll < error_chance {
                    to_error.push(id);
                }
            }
            AgentStateKind::Erroring => {
                // Burn tokens while erroring
                token_drain += vibe.token_burn_rate;
            }
            _ => {}
        }
    }

    // Phase 2: Transition agents to Erroring
    for entity in to_error {
        if let Ok(mut state) = world.get::<&mut AgentState>(entity) {
            state.state = AgentStateKind::Erroring;
        }
        if let Ok(name) = world.get::<&crate::ecs::components::AgentName>(entity) {
            log_entries.push(format!("[{}] context limit reached — ERRORING", name.name));
        }
    }

    // Phase 3: Drain tokens from economy
    economy.balance -= token_drain;

    AgentTickResult { log_entries }
}
```

**Step 2: Register the module**

In `server/src/ecs/systems/mod.rs`, add:

```rust
pub mod agent_tick;
```

**Step 3: Call agent_tick_system in the game loop**

In `main.rs`, after the existing system calls (around line 228, after crank system), add:

```rust
        // Agent turn tick
        let agent_tick_result = crate::ecs::systems::agent_tick::agent_tick_system(&mut world, &mut economy);
        for entry in &agent_tick_result.log_entries {
            log_feed.push(entry.clone());
        }
```

**Step 4: Verify it compiles**

Run: `cd server && cargo check`
Expected: Compiles with no errors

**Step 5: Commit**

```bash
git add server/src/ecs/systems/agent_tick.rs server/src/ecs/systems/mod.rs server/src/main.rs
git commit -m "feat: add agent turn tick system with error chance and token drain"
```

---

### Task 10: Integration Test — Full Agent Lifecycle

**Files:**
- Modify: `server/src/game/agents.rs` (add integration test)

**Step 1: Add a test that verifies the full lifecycle**

```rust
    #[test]
    fn vibe_config_varies_by_tier() {
        let mut world = World::new();
        let mut economy = make_economy(1000);

        let apprentice =
            recruit_agent(&mut world, AgentTierKind::Apprentice, 0.0, 0.0, &mut economy).unwrap();
        let architect =
            recruit_agent(&mut world, AgentTierKind::Architect, 10.0, 0.0, &mut economy).unwrap();

        let a_vibe = world.get::<&AgentVibeConfig>(apprentice).unwrap();
        let arch_vibe = world.get::<&AgentVibeConfig>(architect).unwrap();

        // Apprentice has fewer turns and higher error rate
        assert!(a_vibe.max_turns < arch_vibe.max_turns);
        assert!(a_vibe.error_chance_base > arch_vibe.error_chance_base);
        assert!(a_vibe.stars < arch_vibe.stars);

        // Apprentice burns more tokens when erroring
        assert!(a_vibe.token_burn_rate > arch_vibe.token_burn_rate);
    }
```

**Step 2: Run all agent tests**

Run: `cd server && cargo test -- agents`
Expected: All tests pass

**Step 3: Run full test suite**

Run: `cd server && cargo test`
Expected: All tests pass

**Step 4: Commit**

```bash
git add server/src/game/agents.rs
git commit -m "test: add integration test for tier-varying vibe config"
```
