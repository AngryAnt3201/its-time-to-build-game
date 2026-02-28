# Agent System Design — Mistral Vibe Integration

## Overview

Each agent is a Mistral Vibe instance. Agent tier determines the underlying model, which directly affects context window, max turns, reliability, and cost. Agents have procedurally generated names, stats that grow with XP, and a turn budget that creates real gameplay tension.

## Mistral Model Mapping

| Tier | Model | Params | Context | Max Turns | Stars | Token Burn | Error Base |
|------|-------|--------|---------|-----------|-------|------------|------------|
| Apprentice | Ministral 3 3B | 3B | 128K | 5 | 1 | 3/tick | 0.15 |
| Journeyman | Ministral 3 8B | 8B | 128K | 15 | 2 | 2/tick | 0.08 |
| Artisan | Codestral | 22B | 256K | 30 | 3 | 1/tick | 0.04 |
| Architect | Devstral 2 | 123B | 256K | 50 | 3 | 1/tick | 0.02 |

## Lore Names (shown in UI instead of raw model names)

- Ministral 3B → "Flickering Candle"
- Ministral 8B → "Steady Flame"
- Codestral → "Codestral Engine"
- Devstral 2 → "Abyssal Architect"

## New ECS Component: AgentVibeConfig

```rust
pub struct AgentVibeConfig {
    pub model_id: String,        // e.g. "ministral-3b-2025-01"
    pub model_lore_name: String, // e.g. "Flickering Candle"
    pub max_turns: u32,          // turn budget before erroring
    pub turns_used: u32,         // current turn count
    pub context_window: u32,     // max context tokens
    pub token_burn_rate: i64,    // tokens/tick while erroring
    pub error_chance_base: f32,  // base probability of erroring per turn
    pub stars: u8,               // 1-3 star rating
}
```

## Error Chance Formula

```
error_chance = error_chance_base * (1.0 - agent.reliability) * (turns_used / max_turns)
```

Errors become more likely as an agent approaches its turn limit. Reliability stat (0.0-1.0) reduces the chance. An Apprentice with 0.55 reliability hitting turn 4/5 has a much higher error chance than an Artisan with 0.85 reliability at turn 15/30.

## Agent State Machine

```
                    ┌──────────┐
                    │   IDLE   │◄─────── cancel task / morale recovery
                    └────┬─────┘
                         │ assign task
              ┌──────────┼──────────┐
              ▼          ▼          ▼
         ┌─────────┐ ┌────────┐ ┌──────────┐
         │BUILDING │ │EXPLORING│ │DEFENDING │
         └────┬────┘ └───┬────┘ └────┬─────┘
              │          │           │
              ▼          ▼           ▼
    ┌─── turn limit hit / random error ───┐
    │                                      │
    ▼                                      ▼
┌──────────┐                        ┌──────────┐
│ ERRORING │──── player feeds ────► │ resume   │
│ (burns   │     tokens             │ prev     │
│  tokens) │                        │ state    │
└────┬─────┘                        └──────────┘
     │
     │ health reaches 0
     ▼
┌──────────┐     recovery window     ┌──────────────┐
│ CRITICAL │────── expires ────────► │ UNRESPONSIVE │
│ (window) │                         │   (dead)     │
└──────────┘                         └──────────────┘
     │
     │ player spends tokens during window
     ▼
┌──────────┐
│ IDLE     │ (rolled back, loses recent XP)
└──────────┘
```

### Erroring Mechanic

Each game tick while an agent is working (Building, Exploring, Defending), `turns_used` increments. When `turns_used >= max_turns`, the agent enters the Erroring state.

While erroring:
- Agent burns `token_burn_rate` tokens/tick from the economy
- Agent cannot complete its current task
- Agent is vulnerable — rogues deal bonus damage to erroring agents

Player intervention options:
1. **Cancel task** → agent goes Idle, progress on current task is lost
2. **Feed tokens** → extends turn budget by N more turns, agent resumes previous state
3. **Reassign to stronger agent** → new agent picks up where the old one left off

### Critical & Recovery

When an agent's health reaches 0:
- Agent enters Critical state
- Recovery window duration = `resilience * 0.5` seconds
- Player can spend tokens during the window to "rollback" the agent (survives but loses recent XP)
- If the window expires: agent becomes Unresponsive (permanent death)

## Protocol Changes

New fields added to `EntityData::Agent`:

```typescript
interface AgentEntityData {
    name: string;
    state: AgentStateKind;
    tier: AgentTierKind;
    health_pct: number;
    morale_pct: number;
    // NEW:
    stars: number;        // 1-3
    turns_used: number;
    max_turns: number;
    model_lore_name: string;
    xp: number;
    level: number;
}
```

## Agent Hover Tooltip UI

Mirrors the `EquipmentHUD` tooltip pattern:
- Same dark parchment background (`0x0d0b08`, alpha 0.94)
- Same gold corner brackets (`0xd4a017`, alpha 0.35)
- Follows cursor on `pointermove`
- Shows on `pointerover` of agent card in `AgentsHUD`

### Tooltip Layout

```
 ┌─ gold brackets ──────────────────┐
 │ MIRA                    ★★☆     │  name (gold) + stars (amber)
 │ "Codestral Engine"               │  lore name (italic, muted)
 │                                  │
 │ REL: 0.85  SPD: 1.3x            │  stats row 1 (green tint)
 │ AWA: 110   RES: 92              │  stats row 2 (green tint)
 │                                  │
 │ State: Building                  │  state (color matches state)
 │ Morale: █████░░ 70%             │  morale bar
 │ Turns: 18/30                     │  turn budget
 │ XP: 240  Lv.3                    │  xp and level
 └──────────────────────────────────┘
```

### Color Coding

- Filled stars (`★`): `0xd4a017` (gold)
- Empty stars (`☆`): `0x2a2418` (dark)
- Turns text turns red when `turns_used / max_turns > 0.8`
- State text uses existing state colors from AgentsHUD

## Stats Reference (from GDD)

- **Reliability** — base chance of completing a build without erroring
- **Speed** — build time multiplier
- **Awareness** — detection radius for incoming rogue AI
- **Resilience** — total hit points; recovery window duration on critical hit

## Tier Stat Ranges

| Tier | Reliability | Speed | Awareness | Resilience | Recruit Cost |
|------|-------------|-------|-----------|------------|--------------|
| Apprentice | 0.50-0.65 | 0.8-1.0 | 60-80 | 40-55 | 20 tokens |
| Journeyman | 0.65-0.80 | 1.0-1.3 | 80-105 | 60-80 | 60 tokens |
| Artisan | 0.80-0.90 | 1.2-1.5 | 100-130 | 80-105 | 150 tokens |
| Architect | 0.90-0.98 | 1.4-1.7 | 120-150 | 100-130 | 400 tokens |
