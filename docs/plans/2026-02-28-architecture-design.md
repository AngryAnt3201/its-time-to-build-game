# Architecture Design — "It's Time to Build" Game

**Date:** 2026-02-28
**Status:** Approved

## Decisions

- **Full build** — complete GDD implementation, no hackathon scoping
- **Rust ECS game server** + **TypeScript/PixiJS thin web client** over WebSocket
- **Mistral Vibe** integrated as in-game agent AI behavior engine
- **ElevenLabs** pluggable voice system — interface defined, placeholder audio first
- **Placeholder art** — colored geometric shapes, gameplay-first approach
- **ECS library:** `hecs` (lightweight, no renderer baggage)
- **Protocol:** Binary msgpack state deltas at 20 ticks/sec

## High-Level Architecture

```
┌─────────────────────────────────────┐
│         TypeScript Client           │
│  PixiJS Renderer + UI + Audio       │
│  Input Handler + Client Prediction  │
└──────────────┬──────────────────────┘
               │ WebSocket (binary msgpack)
               │ ↑ state deltas @ 20 ticks/sec
               │ ↓ player input events
┌──────────────┴──────────────────────┐
│          Rust Game Server           │
│  ECS Core (hecs) + Systems Pipeline │
│  Mistral Vibe Agent AI (async)      │
│  Proc-Gen / Pathfinding             │
│  Voice Service (pluggable)          │
└─────────────────────────────────────┘
```

## ECS Design

### Entity Types & Components

**Player Entity:**
- Position, Velocity, Collider
- Health, TorchRange, CarryCapacity, CombatPower
- Inventory (blueprint fragments, items)
- InputState (from client)

**Agent Entity:**
- Position, Velocity, Collider
- AgentStats { reliability, speed, awareness, resilience }
- AgentState (idle | building | erroring | exploring | defending | critical | unresponsive)
- Morale, XP, Level
- AgentTier (Apprentice | Journeyman | Artisan | Architect)
- VoiceProfile { voice_id, line_bank_cache }
- Assignment (task reference)
- Name, Personality

**Building Entity:**
- Position, Footprint (tile dimensions)
- BuildingType (enum of all 34+ buildings)
- ConstructionProgress { current, total, assigned_agents }
- Health, Effects (buffs/debuffs)
- LightSource (for pylons)

**Rogue Entity:**
- Position, Velocity, Collider
- RogueType (Corruptor | Looper | TokenDrain | Assassin | Swarm | Mimic | Architect)
- Health, Damage, AttackPattern
- AIBehavior (state machine per type)
- Visibility (for semi-invisible types)

**World:**
- TileMap { terrain, fog_of_war, light_level per tile }
- TokenEconomy { balance, income_sources, expenditures }
- CrankState { heat, tier, assigned_agent }
- GamePhase (Hut | Outpost | Village | Network | City)

### Systems Pipeline (per tick, in order)

1. `input_system` — process player input from WebSocket
2. `ai_system` — run Mistral Vibe agent AI + rogue AI behavior
3. `movement_system` — apply velocity, collision detection
4. `combat_system` — resolve attacks, damage, recovery windows
5. `building_system` — progress construction, apply building effects
6. `economy_system` — tick token income/expenditure, agent wages
7. `crank_system` — handle crank interaction, heat, generation
8. `morale_system` — update agent morale based on events
9. `fog_system` — recalculate light/fog based on pylons + torch
10. `spawn_system` — rogue AI spawning based on village state
11. `exploration_system` — proc-gen chunks as player moves into dark
12. `state_sync_system` — diff game state, send deltas to client

## Client Architecture

```
client/src/
├── main.ts              — entry point, WebSocket connect, game loop
├── network/
│   ├── connection.ts    — WebSocket management, reconnection
│   ├── protocol.ts      — msgpack encode/decode, state delta types
│   └── input.ts         — capture & send player input
├── renderer/
│   ├── world.ts         — tilemap rendering, fog-of-war shader
│   ├── entities.ts      — sprite management for all entity types
│   ├── lighting.ts      — pylon light, torch light, darkness overlay
│   ├── effects.ts       — glitch effects, scan lines, particles
│   └── camera.ts        — follow player, smooth pan, zoom
├── ui/
│   ├── hud.ts           — token counter, health bar, minimap
│   ├── log-feed.ts      — scrolling monospace parchment log
│   ├── grimoire.ts      — agent roster book UI
│   ├── blueprint-queue.ts — active construction display
│   └── menus.ts         — build menu, upgrade tree, inventory
├── audio/
│   ├── manager.ts       — audio context, spatial audio
│   ├── ambient.ts       — server hum, weather, environmental
│   ├── voice.ts         — proximity voice system (pluggable)
│   └── sfx.ts           — combat, build, crank sound effects
└── state/
    ├── game-state.ts    — local mirror of server state
    ├── interpolation.ts — smooth between server ticks
    └── prediction.ts    — client-side movement prediction
```

### Rendering

- **Fog of War:** Full-screen darkness overlay with circular cutouts for pylon/torch light
- **Scan Lines:** Post-processing CRT filter
- **Terminal Aesthetic:** Monospace font (IBM Plex Mono) in parchment containers
- **Placeholder Entities:** Colored geometric shapes — amber circles (agents), red (rogues), blue dot (player), gold squares (buildings)
- **Lighting:** Per-tile light level from server. Warm amber (pylons), cool blue-white (torch), sickly green (corruption)
- **Client-Side Prediction:** Player movement only, reconciled on server state

## Network Protocol

### Server → Client (20 Hz)

```
GameStateUpdate {
    tick: u64,
    player_state: PlayerSnapshot,
    entities_changed: Vec<EntityDelta>,
    entities_removed: Vec<EntityId>,
    fog_updates: Vec<(ChunkPos, FogData)>,
    economy: EconomySnapshot,
    log_entries: Vec<LogEntry>,
    audio_triggers: Vec<AudioEvent>,
}
```

### Client → Server (immediate)

```
PlayerInput {
    tick: u64,
    movement: Vec2,
    action: Option<Action>,
    target: Option<EntityId>,
}
```

### State Delta Strategy

Server tracks "last sent" snapshot per client. Each tick, diff against current state. Only send changes. Binary msgpack serialization.

### Audio Events

Server sends trigger events, client handles playback:
- `AgentSpeak { agent_id, line_category, proximity }`
- `CombatHit { weapon_type, position }`
- `BuildComplete { building_type }`
- `RogueSpawn { rogue_type, position }`
- `CrankTurn`
- `AgentDeath { agent_id }`

## Game Systems

### Token Economy
Single `i64` balance. Atomic transactions within economy system tick. Scarcity-first tuning — agent upkeep slightly exceeds passive income until mid-game Compute Farms.

### Procedural World Generation
Chunk-based (32x32 tiles). Seeded simplex noise for terrain. Scatter placement for discoveries. Starting area is pre-authored — flat clearing, water source nearby, guaranteed first blueprint fragment within 2 chunks.

### Rogue AI Spawning
`spawn_rate = base_rate + (total_light_tiles * 0.01) + (active_buildings * 0.05) + (token_balance * 0.001)`. Types weighted by game phase. Spawns at edge of explored darkness.

### Combat
Tick-based resolution. Windup frames, hitboxes, cooldowns. Rogues use state machine attack patterns. Armor provides damage reduction percentage.

### Agent AI (Mistral Vibe)
Agent context (task, nearby entities, morale, village state) sent to Mistral Vibe. Responses determine action priority. Batched async — agents continue current action until new decision arrives. Rule-based fallback when API unavailable.

### Progression
Phase transitions triggered by building milestones. The Cascade triggers at City phase after timer. All enemy types spawn in waves. Survive N waves to complete the run.

## Project Structure

```
its-time-to-build-game/
├── server/                    — Rust workspace
│   ├── Cargo.toml
│   └── src/
│       ├── main.rs, lib.rs
│       ├── ecs/ (components.rs, systems/, world.rs)
│       ├── network/ (server.rs, protocol.rs, sync.rs)
│       ├── game/ (economy.rs, combat.rs, building.rs, exploration.rs, progression.rs)
│       ├── ai/ (agent_ai.rs, rogue_ai.rs, fallback.rs)
│       └── config/ (balance.rs, buildings.rs)
├── client/                    — TypeScript/PixiJS
│   ├── package.json, tsconfig.json, vite.config.ts
│   ├── index.html
│   └── src/ (see client architecture above)
├── shared/
│   └── protocol.md
└── docs/plans/
```

### Dependencies

**Rust:** hecs, tokio, tokio-tungstenite, rmp-serde, noise, rand, serde
**TypeScript:** pixi.js, msgpack-lite, vite
