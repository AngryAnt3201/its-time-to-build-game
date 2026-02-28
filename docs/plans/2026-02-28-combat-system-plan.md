# Combat System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement directional melee combat, weapon/armor equipment sync, attack cooldowns, player death/respawn, enemy death effects, and full visual feedback (swing arcs, damage numbers, screen shake, hit flash, death screen).

**Architecture:** Server-authoritative combat with client-side VFX. Server tracks facing direction, weapon/armor stats, attack cooldowns, and death state. Client reads these from `PlayerSnapshot` and `GameStateUpdate` to render VFX. New `CombatVFX` renderer handles all visual effects. Projectiles are ECS entities for crossbow.

**Tech Stack:** Rust (hecs ECS), TypeScript (PixiJS 8), MessagePack serialization

---

### Task 1: Add Facing Direction to Server

**Files:**
- Modify: `server/src/ecs/components.rs:46-52` (add Facing component near Player Components section)
- Modify: `server/src/ecs/world.rs:7-11` (import Facing), `server/src/ecs/world.rs:19-34` (attach to player spawn)
- Modify: `server/src/main.rs:107-130` (update facing on movement)
- Modify: `server/src/protocol.rs:19-26` (add facing to PlayerSnapshot)

**Step 1: Add Facing component**

In `server/src/ecs/components.rs`, after the `Health` struct (line 52), add:

```rust
#[derive(Debug, Clone)]
pub struct Facing {
    pub dx: f32,
    pub dy: f32,
}

impl Default for Facing {
    fn default() -> Self {
        Self { dx: 0.0, dy: 1.0 } // facing down by default
    }
}
```

**Step 2: Add facing to PlayerSnapshot**

In `server/src/protocol.rs`, add `facing` field to `PlayerSnapshot` (line 20-26):

```rust
pub struct PlayerSnapshot {
    pub position: Vec2,
    pub health: f32,
    pub max_health: f32,
    pub tokens: i64,
    pub torch_range: f32,
    pub facing: Vec2,
}
```

**Step 3: Attach Facing to player entity at spawn**

In `server/src/ecs/world.rs`, add `Facing` to the import (line 9) and to the player spawn tuple (after line 33):

```rust
use super::components::{
    Agent, AgentMorale, AgentName, AgentPersonality, AgentState, AgentStats, AgentTier, AgentXP,
    Assignment, CombatPower, CrankState, CrankTier, CarryCapacity, Facing, GamePhase, GameState, Health,
    Player, Position, TokenEconomy, TorchRange, Velocity, VoiceProfile, WeaponType,
};
```

Add `Facing::default(),` to the player spawn tuple.

**Step 4: Update facing on movement in main.rs**

In `server/src/main.rs`, inside the movement block (lines 112-130), after normalizing and before applying position changes, update the Facing component. Change the query to also get `&mut Facing`:

```rust
if len > 0.0 {
    let norm_x = mx / len;
    let norm_y = my / len;
    let dx = norm_x * PLAYER_SPEED;
    let dy = norm_y * PLAYER_SPEED;

    for (_id, (pos, facing)) in world.query_mut::<hecs::With<(&mut Position, &mut Facing), &Player>>() {
        // Update facing direction
        facing.dx = norm_x;
        facing.dy = norm_y;

        // Check X axis independently (wall-sliding)
        let future_tx = collision::pixel_to_tile(pos.x + dx);
        let cur_ty = collision::pixel_to_tile(pos.y);
        if collision::is_walkable(future_tx, cur_ty) {
            pos.x += dx;
        }

        let cur_tx = collision::pixel_to_tile(pos.x);
        let future_ty = collision::pixel_to_tile(pos.y + dy);
        if collision::is_walkable(cur_tx, future_ty) {
            pos.y += dy;
        }
    }
}
```

**Step 5: Populate facing in PlayerSnapshot**

In `server/src/main.rs`, where PlayerSnapshot is built (lines 684-699), add `Facing` to the query and populate it:

```rust
let mut player_snapshot = PlayerSnapshot {
    position: Vec2::default(),
    health: 0.0,
    max_health: 0.0,
    tokens: game_state.economy.balance,
    torch_range: 0.0,
    facing: Vec2::default(),
};

for (_id, (pos, health, torch, facing)) in world
    .query_mut::<hecs::With<(&Position, &Health, &TorchRange, &Facing), &Player>>()
{
    player_snapshot.position = Vec2 { x: pos.x, y: pos.y };
    player_snapshot.health = health.current as f32;
    player_snapshot.max_health = health.max as f32;
    player_snapshot.torch_range = torch.radius;
    player_snapshot.facing = Vec2 { x: facing.dx, y: facing.dy };
}
```

**Step 6: Update client protocol types**

In `client/src/network/protocol.ts`, add `facing` to `PlayerSnapshot` (line 15-21):

```typescript
export interface PlayerSnapshot {
  position: Vec2;
  health: number;
  max_health: number;
  tokens: number;
  torch_range: number;
  facing: Vec2;
}
```

**Step 7: Compile and verify**

Run: `cd server && cargo build 2>&1 | head -30`
Expected: Compiles successfully.

**Step 8: Commit**

```bash
git add -A && git commit -m "feat: add player facing direction tracking"
```

---

### Task 2: Extend Weapon & Armor Stats on Server

**Files:**
- Modify: `server/src/ecs/components.rs:65-94` (extend CombatPower and Armor)
- Modify: `server/src/ecs/world.rs:19-34` (update player spawn)
- Create: `server/src/ecs/weapon_stats.rs` (weapon/armor stat lookups)
- Modify: `server/src/ecs/mod.rs` (add module)

**Step 1: Extend CombatPower component**

In `server/src/ecs/components.rs`, replace the `CombatPower` struct (lines 74-79):

```rust
#[derive(Debug, Clone)]
pub struct CombatPower {
    pub base_damage: i32,
    pub attack_speed: f32,
    pub weapon: WeaponType,
    pub cooldown_ticks: u32,
    pub cooldown_remaining: u32,
    pub range: f32,
    pub arc_degrees: f32,
    pub is_projectile: bool,
}
```

**Step 2: Create weapon/armor stat lookup module**

Create `server/src/ecs/weapon_stats.rs`:

```rust
use super::components::{ArmorType, CombatPower, WeaponType, Armor};

/// Returns the full CombatPower for a given weapon type.
pub fn weapon_stats(weapon: WeaponType) -> CombatPower {
    match weapon {
        WeaponType::ProcessTerminator => CombatPower {
            base_damage: 8,
            attack_speed: 1.0,
            weapon: WeaponType::ProcessTerminator,
            cooldown_ticks: 6,
            cooldown_remaining: 0,
            range: 30.0,
            arc_degrees: 90.0,
            is_projectile: false,
        },
        WeaponType::HardReset => CombatPower {
            base_damage: 24,
            attack_speed: 1.0,
            weapon: WeaponType::HardReset,
            cooldown_ticks: 20,
            cooldown_remaining: 0,
            range: 35.0,
            arc_degrees: 180.0,
            is_projectile: false,
        },
        WeaponType::SignalJammer => CombatPower {
            base_damage: 14,
            attack_speed: 1.0,
            weapon: WeaponType::SignalJammer,
            cooldown_ticks: 12,
            cooldown_remaining: 0,
            range: 40.0,
            arc_degrees: 120.0,
            is_projectile: false,
        },
        WeaponType::NullPointer => CombatPower {
            base_damage: 16,
            attack_speed: 1.0,
            weapon: WeaponType::NullPointer,
            cooldown_ticks: 16,
            cooldown_remaining: 0,
            range: 120.0,
            arc_degrees: 0.0,
            is_projectile: true,
        },
        WeaponType::Flare => CombatPower {
            base_damage: 10,
            attack_speed: 1.0,
            weapon: WeaponType::Flare,
            cooldown_ticks: 10,
            cooldown_remaining: 0,
            range: 25.0,
            arc_degrees: 360.0,
            is_projectile: false,
        },
    }
}

/// Returns the full Armor stats for a given armor type.
pub fn armor_stats(armor: ArmorType) -> Armor {
    match armor {
        ArmorType::BasePrompt => Armor {
            armor_type: ArmorType::BasePrompt,
            damage_reduction: 2.0,
            speed_penalty: 0.0,
        },
        ArmorType::FewShotPadding => Armor {
            armor_type: ArmorType::FewShotPadding,
            damage_reduction: 5.0,
            speed_penalty: 0.0,
        },
        ArmorType::ChainOfThoughtMail => Armor {
            armor_type: ArmorType::ChainOfThoughtMail,
            damage_reduction: 10.0,
            speed_penalty: 0.10,
        },
        ArmorType::ConstitutionalPlate => Armor {
            armor_type: ArmorType::ConstitutionalPlate,
            damage_reduction: 18.0,
            speed_penalty: 0.25,
        },
    }
}

/// Maps client weapon IDs to server WeaponType.
pub fn weapon_from_id(id: &str) -> Option<WeaponType> {
    match id {
        "shortsword" => Some(WeaponType::ProcessTerminator),
        "greatsword" => Some(WeaponType::HardReset),
        "staff" => Some(WeaponType::SignalJammer),
        "crossbow" => Some(WeaponType::NullPointer),
        "torch" => Some(WeaponType::Flare),
        _ => None,
    }
}

/// Maps client armor IDs to server ArmorType.
pub fn armor_from_id(id: &str) -> Option<ArmorType> {
    match id {
        "cloth" => Some(ArmorType::BasePrompt),
        "leather" => Some(ArmorType::FewShotPadding),
        "chain" => Some(ArmorType::ChainOfThoughtMail),
        "plate" => Some(ArmorType::ConstitutionalPlate),
        _ => None,
    }
}
```

**Step 3: Register module**

Check `server/src/ecs/mod.rs` for module declarations and add `pub mod weapon_stats;`.

**Step 4: Update player spawn with full weapon + armor**

In `server/src/ecs/world.rs`, import `weapon_stats` and `Armor`, spawn with full stats:

```rust
use super::weapon_stats;

// In the player spawn tuple, replace the CombatPower line with:
weapon_stats::weapon_stats(WeaponType::ProcessTerminator),
weapon_stats::armor_stats(ArmorType::BasePrompt),
```

Also add imports for `Armor` and `ArmorType` to world.rs.

**Step 5: Compile and verify**

Run: `cd server && cargo build 2>&1 | head -30`
Expected: Compiles (may show warnings about unused fields — that's fine, we'll use them in Task 3).

**Step 6: Commit**

```bash
git add -A && git commit -m "feat: add weapon/armor stat definitions and lookup module"
```

---

### Task 3: Add Equipment Actions & Cooldown Tick

**Files:**
- Modify: `server/src/protocol.rs:230-272` (add EquipWeapon, EquipArmor variants)
- Modify: `server/src/main.rs:132-137` (handle EquipWeapon/EquipArmor actions)
- Modify: `server/src/main.rs:94-99` (add cooldown decrement per tick)
- Modify: `server/src/main.rs:107-130` (apply armor speed penalty to movement)
- Modify: `client/src/network/protocol.ts:212-245` (add new action types)

**Step 1: Add EquipWeapon/EquipArmor to server protocol**

In `server/src/protocol.rs`, add after `RollbackAgent` (line 242):

```rust
EquipWeapon { weapon_id: String },
EquipArmor { armor_id: String },
```

**Step 2: Add to client protocol types**

In `client/src/network/protocol.ts`, add to the `PlayerAction` type:

```typescript
| { EquipWeapon: { weapon_id: string } }
| { EquipArmor: { armor_id: string } }
```

**Step 3: Handle EquipWeapon/EquipArmor in main.rs**

In `server/src/main.rs`, in the action match block (after the `PlayerAction::Attack` case), add:

```rust
PlayerAction::EquipWeapon { weapon_id } => {
    if let Some(wtype) = weapon_stats::weapon_from_id(weapon_id) {
        let new_stats = weapon_stats::weapon_stats(wtype);
        for (_id, combat) in world.query_mut::<hecs::With<&mut CombatPower, &Player>>() {
            *combat = new_stats.clone();
        }
    }
}
PlayerAction::EquipArmor { armor_id } => {
    if let Some(atype) = weapon_stats::armor_from_id(armor_id) {
        let new_armor = weapon_stats::armor_stats(atype);
        for (_id, armor) in world.query_mut::<hecs::With<&mut Armor, &Player>>() {
            *armor = new_armor.clone();
        }
    }
}
```

Also add necessary imports at top of main.rs: `use crate::ecs::weapon_stats;` and `Armor` to the components import.

**Step 4: Add cooldown decrement per tick**

In `server/src/main.rs`, right after `player_attacking = false;` (line 99), add:

```rust
// Decrement attack cooldown each tick
for (_id, combat) in world.query_mut::<hecs::With<&mut CombatPower, &Player>>() {
    if combat.cooldown_remaining > 0 {
        combat.cooldown_remaining -= 1;
    }
}
```

**Step 5: Apply armor speed penalty to movement**

In `server/src/main.rs`, in the movement block, query Armor alongside Position and calculate effective speed:

```rust
if len > 0.0 {
    let norm_x = mx / len;
    let norm_y = my / len;

    for (_id, (pos, facing, armor)) in world.query_mut::<hecs::With<(&mut Position, &mut Facing, &Armor), &Player>>() {
        let effective_speed = PLAYER_SPEED * (1.0 - armor.speed_penalty);
        let dx = norm_x * effective_speed;
        let dy = norm_y * effective_speed;

        facing.dx = norm_x;
        facing.dy = norm_y;

        let future_tx = collision::pixel_to_tile(pos.x + dx);
        let cur_ty = collision::pixel_to_tile(pos.y);
        if collision::is_walkable(future_tx, cur_ty) {
            pos.x += dx;
        }

        let cur_tx = collision::pixel_to_tile(pos.x);
        let future_ty = collision::pixel_to_tile(pos.y + dy);
        if collision::is_walkable(cur_tx, future_ty) {
            pos.y += dy;
        }
    }
}
```

**Step 6: Wire client equipment changes to server**

In `client/src/main.tsx`, where `equipmentHud.equipWeapon('shortsword')` is called (line ~405), also send the action to the server. Add an `onEquipWeapon` / `onEquipArmour` callback pattern. After the equipment HUD calls, add:

```typescript
// Send equipment changes to server
equipmentHud.onEquipChange = (kind: 'weapon' | 'armour', id: string) => {
  const action: PlayerAction = kind === 'weapon'
    ? { EquipWeapon: { weapon_id: id } }
    : { EquipArmor: { armor_id: id } };
  connection.sendInput({ tick: clientTickRef, movement: { x: 0, y: 0 }, action, target: null });
};
```

In `client/src/ui/equipment-hud.ts`, add the callback property and call it from `equipWeapon`/`equipArmour`:

```typescript
// In EquipmentHUD class, add:
onEquipChange: ((kind: 'weapon' | 'armour', id: string) => void) | null = null;

// In equipWeapon method, add at end:
this.onEquipChange?.('weapon', weaponId);

// In equipArmour method, add at end:
this.onEquipChange?.('armour', armourId);
```

Also send initial equipment on startup:

```typescript
connection.sendInput({ tick: 0, movement: { x: 0, y: 0 }, action: { EquipWeapon: { weapon_id: 'shortsword' } }, target: null });
connection.sendInput({ tick: 0, movement: { x: 0, y: 0 }, action: { EquipArmor: { armor_id: 'cloth' } }, target: null });
```

**Step 7: Compile and verify**

Run: `cd server && cargo build 2>&1 | head -30`
Expected: Compiles successfully.

**Step 8: Commit**

```bash
git add -A && git commit -m "feat: equipment sync, attack cooldown, armor speed penalty"
```

---

### Task 4: Rewrite Combat System with Directional Attacks

**Files:**
- Modify: `server/src/ecs/systems/combat.rs` (full rewrite of player attack logic)
- Modify: `server/src/protocol.rs` (add CombatEvent and death_events to GameStateUpdate)
- Modify: `client/src/network/protocol.ts` (mirror protocol changes)

**Step 1: Add CombatEvent to server protocol**

In `server/src/protocol.rs`, before the `GameStateUpdate` struct, add:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CombatEvent {
    pub x: f32,
    pub y: f32,
    pub damage: i32,
    pub is_kill: bool,
    pub rogue_type: Option<RogueTypeKind>,
}
```

Add to `GameStateUpdate`:

```rust
pub combat_events: Vec<CombatEvent>,
pub player_hit: bool,
pub player_hit_damage: i32,
```

**Step 2: Mirror in client protocol**

In `client/src/network/protocol.ts`, add:

```typescript
export interface CombatEvent {
  x: number;
  y: number;
  damage: number;
  is_kill: boolean;
  rogue_type: RogueTypeKind | null;
}
```

Add to `GameStateUpdate`:

```typescript
combat_events: CombatEvent[];
player_hit: boolean;
player_hit_damage: number;
```

**Step 3: Rewrite combat system**

Replace the player attack section in `server/src/ecs/systems/combat.rs`. The new combat system:

1. Reads player `Facing`, `CombatPower`, and `Position`
2. Only attacks if `cooldown_remaining == 0`
3. Sets `cooldown_remaining = cooldown_ticks` on attack
4. For melee: checks range AND arc (dot product of facing vs direction-to-rogue >= cos(arc/2))
5. For 360 AOE (torch): checks range only
6. For projectile (crossbow): spawns a Projectile entity instead of direct damage
7. Applies armor damage reduction to rogue-vs-player damage

Add `Facing` and `Armor` to the imports and update the function signature. The `CombatResult` struct gains `combat_events: Vec<CombatEvent>`, `player_hit_damage: i32`.

Key directional check logic:

```rust
fn is_in_arc(facing: &Facing, attacker_pos: &Position, target_pos: &Position, arc_degrees: f32) -> bool {
    if arc_degrees >= 360.0 {
        return true;
    }
    let dir_x = target_pos.x - attacker_pos.x;
    let dir_y = target_pos.y - attacker_pos.y;
    let dir_len = (dir_x * dir_x + dir_y * dir_y).sqrt();
    if dir_len < 0.001 {
        return true; // on top of attacker
    }
    let norm_x = dir_x / dir_len;
    let norm_y = dir_y / dir_len;
    let dot = facing.dx * norm_x + facing.dy * norm_y;
    let half_arc_rad = (arc_degrees / 2.0).to_radians();
    dot >= half_arc_rad.cos()
}
```

For armor damage reduction on rogue-vs-player:

```rust
// In the rogue attacks player section, after computing raw dmg:
let armor_def = player_armor.map(|a| a.damage_reduction as i32).unwrap_or(0);
let final_dmg = (dmg - armor_def).max(1);
```

**Step 4: Update CombatResult struct**

```rust
pub struct CombatResult {
    pub killed_rogues: Vec<(hecs::Entity, RogueTypeKind)>,
    pub killed_agents: Vec<(hecs::Entity, String)>,
    pub player_damaged: bool,
    pub player_hit_damage: i32,
    pub log_entries: Vec<String>,
    pub audio_events: Vec<AudioEvent>,
    pub bounty_tokens: i64,
    pub combat_events: Vec<CombatEvent>,
    pub player_attacked: bool,
}
```

**Step 5: Update combat_system call in main.rs**

The combat system now needs to read more components. Update the call and pass results into `GameStateUpdate`:

```rust
// In the GameStateUpdate construction, add:
combat_events: combat_result.combat_events.clone(),
player_hit: combat_result.player_damaged,
player_hit_damage: combat_result.player_hit_damage,
```

Also initialize these new fields in the `GameStateUpdate` default.

**Step 6: Compile and verify**

Run: `cd server && cargo build 2>&1 | head -30`
Expected: Compiles.

**Step 7: Commit**

```bash
git add -A && git commit -m "feat: directional combat with arc checking, armor reduction, cooldowns"
```

---

### Task 5: Add Projectile System for Crossbow

**Files:**
- Create: `server/src/ecs/systems/projectile.rs`
- Modify: `server/src/ecs/systems/mod.rs` (register module)
- Modify: `server/src/ecs/components.rs` (add Projectile component)
- Modify: `server/src/main.rs` (run projectile system, send projectile entities)
- Modify: `server/src/protocol.rs` (add Projectile entity kind)
- Modify: `client/src/network/protocol.ts` (add Projectile)
- Modify: `client/src/renderer/entities.ts` (render projectiles)

**Step 1: Add Projectile component**

In `server/src/ecs/components.rs`, add after `DroppedItem`:

```rust
#[derive(Debug, Clone)]
pub struct Projectile {
    pub dx: f32,
    pub dy: f32,
    pub speed: f32,
    pub damage: i32,
    pub range_remaining: f32,
    pub owner_is_player: bool,
}
```

**Step 2: Create projectile system**

Create `server/src/ecs/systems/projectile.rs`:

```rust
use hecs::World;
use crate::ecs::components::{Health, Position, Projectile, Rogue, RogueType};
use crate::protocol::{AudioEvent, CombatEvent, RogueTypeKind};

pub struct ProjectileResult {
    pub despawned: Vec<hecs::Entity>,
    pub killed_rogues: Vec<(hecs::Entity, RogueTypeKind)>,
    pub combat_events: Vec<CombatEvent>,
    pub audio_events: Vec<AudioEvent>,
    pub bounty_tokens: i64,
}

pub fn projectile_system(world: &mut World) -> ProjectileResult {
    let mut result = ProjectileResult {
        despawned: Vec::new(),
        killed_rogues: Vec::new(),
        combat_events: Vec::new(),
        audio_events: Vec::new(),
        bounty_tokens: 0,
    };

    // Move projectiles and check range
    let mut projectiles: Vec<(hecs::Entity, Position, i32, bool)> = Vec::new();
    let mut to_despawn: Vec<hecs::Entity> = Vec::new();

    for (entity, (pos, proj)) in world.query_mut::<(&mut Position, &mut Projectile)>() {
        pos.x += proj.dx * proj.speed;
        pos.y += proj.dy * proj.speed;
        proj.range_remaining -= proj.speed;

        if proj.range_remaining <= 0.0 {
            to_despawn.push(entity);
        } else {
            projectiles.push((entity, pos.clone(), proj.damage, proj.owner_is_player));
        }
    }

    // Check collisions with rogues (for player projectiles)
    let rogues: Vec<(hecs::Entity, Position, RogueTypeKind)> = world
        .query::<(&Rogue, &Position, &RogueType)>()
        .iter()
        .map(|(e, (_, p, rt))| (e, p.clone(), rt.kind))
        .collect();

    for (proj_entity, proj_pos, proj_damage, is_player) in &projectiles {
        if !is_player { continue; }
        let hit_range_sq = 8.0 * 8.0; // projectile hit radius

        for &(rogue_entity, ref rogue_pos, rogue_kind) in &rogues {
            let dx = proj_pos.x - rogue_pos.x;
            let dy = proj_pos.y - rogue_pos.y;
            if dx * dx + dy * dy > hit_range_sq { continue; }

            // Hit!
            if let Ok(mut health) = world.get::<&mut Health>(rogue_entity) {
                health.current -= proj_damage;
                result.audio_events.push(AudioEvent::CombatHit);
                result.combat_events.push(CombatEvent {
                    x: rogue_pos.x,
                    y: rogue_pos.y,
                    damage: *proj_damage,
                    is_kill: health.current <= 0,
                    rogue_type: Some(rogue_kind),
                });

                if health.current <= 0 {
                    result.killed_rogues.push((rogue_entity, rogue_kind));
                    // bounty handled by combat system's bounty_for
                }
            }

            to_despawn.push(*proj_entity);
            break; // projectile hits only one target
        }
    }

    // Despawn expired/hit projectiles and killed rogues
    for entity in &to_despawn {
        let _ = world.despawn(*entity);
        result.despawned.push(*entity);
    }
    for &(rogue_entity, _) in &result.killed_rogues {
        let _ = world.despawn(rogue_entity);
    }

    result
}
```

**Step 3: Register module and add to game loop**

Add `pub mod projectile;` to `server/src/ecs/systems/mod.rs`.

In `server/src/main.rs`, after the combat system call (line ~441), add:

```rust
// ── 4b. Projectile system ──────────────────────────────────────
let projectile_result = projectile::projectile_system(&mut world);
```

Merge projectile results into entities_removed and combat_events.

**Step 4: Spawn projectile in combat system**

In the combat system, when player attacks with a projectile weapon (crossbow), instead of checking arc and applying damage directly, spawn a Projectile entity:

```rust
if combat.is_projectile {
    // Spawn projectile entity
    let proj_entity = world.spawn((
        Position { x: player_pos.x, y: player_pos.y },
        Projectile {
            dx: facing.dx,
            dy: facing.dy,
            speed: 6.0,
            damage: combat.base_damage,
            range_remaining: combat.range,
            owner_is_player: true,
        },
    ));
    // Don't check melee arc — projectile handles collision
}
```

**Step 5: Add Projectile to EntityKind and rendering**

In server protocol, add `Projectile` to `EntityKind`. Add `Projectile { dx: f32, dy: f32 }` to `EntityData`.

In client protocol, add matching types.

In the main.rs entity collection loop, query projectiles and add them to `entities_changed`.

In `client/src/renderer/entities.ts`, add a `drawProjectile` case that draws a small bright bolt (a 3px line in the direction of travel).

**Step 6: Compile and verify**

Run: `cd server && cargo build 2>&1 | head -30`
Expected: Compiles.

**Step 7: Commit**

```bash
git add -A && git commit -m "feat: projectile system for crossbow attacks"
```

---

### Task 6: Player Death & Respawn

**Files:**
- Modify: `server/src/ecs/components.rs` (add death fields to GameState)
- Modify: `server/src/main.rs` (check for death, block input, respawn after 200 ticks)
- Modify: `server/src/protocol.rs` (add dead flag to PlayerSnapshot)
- Modify: `client/src/network/protocol.ts` (mirror)
- Create: `client/src/ui/death-screen.ts` (death overlay UI)
- Modify: `client/src/main.tsx` (show death screen, block input while dead)

**Step 1: Add death state to GameState**

In `server/src/ecs/components.rs`, add to `GameState`:

```rust
pub player_dead: bool,
pub death_tick: Option<u64>,
```

Initialize them as `false` and `None` in `world.rs`.

**Step 2: Add dead flag to PlayerSnapshot**

In `server/src/protocol.rs`, add to `PlayerSnapshot`:

```rust
pub dead: bool,
pub death_timer: f32, // seconds remaining until respawn
```

Mirror in `client/src/network/protocol.ts`.

**Step 3: Check for death and handle respawn in main.rs**

After the combat system runs, check if player health <= 0 and player is not already dead:

```rust
// Check for player death
if !game_state.player_dead {
    for (_id, health) in world.query_mut::<hecs::With<&Health, &Player>>() {
        if health.current <= 0 {
            game_state.player_dead = true;
            game_state.death_tick = Some(game_state.tick);
        }
    }
}

// Handle respawn after 200 ticks (10 seconds)
if game_state.player_dead {
    if let Some(death_tick) = game_state.death_tick {
        let elapsed = game_state.tick - death_tick;
        if elapsed >= 200 {
            // Respawn
            game_state.player_dead = false;
            game_state.death_tick = None;
            for (_id, (pos, health)) in world.query_mut::<hecs::With<(&mut Position, &mut Health), &Player>>() {
                pos.x = 400.0;
                pos.y = 300.0;
                health.current = health.max;
            }
        }
    }
}
```

At the top of the input processing loop, skip movement and attack actions when dead:

```rust
if game_state.player_dead {
    // Still drain the input queue but don't process
    while let Ok(_input) = server.input_rx.try_recv() {}
    // Skip to systems
} else {
    // ... existing input processing ...
}
```

**Step 4: Populate death state in PlayerSnapshot**

```rust
player_snapshot.dead = game_state.player_dead;
player_snapshot.death_timer = if let Some(dt) = game_state.death_tick {
    let elapsed = game_state.tick - dt;
    let remaining = 200u64.saturating_sub(elapsed);
    remaining as f32 / 20.0 // convert ticks to seconds
} else {
    0.0
};
```

**Step 5: Create death screen UI**

Create `client/src/ui/death-screen.ts`:

```typescript
import { Container, Graphics, Text, TextStyle } from 'pixi.js';

const FONT = '"IBM Plex Mono", monospace';

export class DeathScreen {
  readonly container: Container;
  private bg: Graphics;
  private title: Text;
  private subtitle: Text;
  private timer: Text;
  private fadeAlpha = 0;
  private visible = false;

  constructor() {
    this.container = new Container();
    this.container.label = 'death-screen';
    this.container.visible = false;
    this.container.zIndex = 9999;

    this.bg = new Graphics();
    this.container.addChild(this.bg);

    this.title = new Text({
      text: 'SYSTEM FAILURE',
      style: new TextStyle({
        fontFamily: FONT,
        fontSize: 32,
        fill: 0xff2222,
        letterSpacing: 6,
        fontWeight: 'bold',
      }),
    });
    this.title.anchor.set(0.5);
    this.container.addChild(this.title);

    this.subtitle = new Text({
      text: 'Connection terminated by hostile process',
      style: new TextStyle({
        fontFamily: FONT,
        fontSize: 14,
        fill: 0x884444,
        fontStyle: 'italic',
      }),
    });
    this.subtitle.anchor.set(0.5);
    this.container.addChild(this.subtitle);

    this.timer = new Text({
      text: 'Rebooting in 10.0...',
      style: new TextStyle({
        fontFamily: FONT,
        fontSize: 16,
        fill: 0x666666,
      }),
    });
    this.timer.anchor.set(0.5);
    this.container.addChild(this.timer);
  }

  show(): void {
    this.visible = true;
    this.fadeAlpha = 0;
    this.container.visible = true;
  }

  hide(): void {
    this.visible = false;
    this.container.visible = false;
    this.fadeAlpha = 0;
  }

  update(deathTimer: number, screenW: number, screenH: number): void {
    if (!this.visible) return;

    // Fade in
    this.fadeAlpha = Math.min(1, this.fadeAlpha + 0.03);

    this.bg.clear();
    this.bg.rect(0, 0, screenW, screenH);
    this.bg.fill({ color: 0x110000, alpha: this.fadeAlpha * 0.92 });

    // Red vignette border
    this.bg.rect(0, 0, screenW, screenH);
    this.bg.stroke({ color: 0xff0000, alpha: this.fadeAlpha * 0.3, width: 4 });

    const cx = screenW / 2;
    const cy = screenH / 2;

    this.title.x = cx;
    this.title.y = cy - 40;
    this.title.alpha = this.fadeAlpha;

    // Glitch effect: randomly replace chars
    if (Math.random() < 0.15) {
      const base = 'SYSTEM FAILURE';
      let glitched = '';
      for (const ch of base) {
        glitched += Math.random() < 0.2
          ? String.fromCharCode(33 + Math.floor(Math.random() * 94))
          : ch;
      }
      this.title.text = glitched;
    } else {
      this.title.text = 'SYSTEM FAILURE';
    }

    this.subtitle.x = cx;
    this.subtitle.y = cy;
    this.subtitle.alpha = this.fadeAlpha * 0.7;

    this.timer.x = cx;
    this.timer.y = cy + 50;
    this.timer.alpha = this.fadeAlpha;
    this.timer.text = `Rebooting in ${deathTimer.toFixed(1)}...`;
  }

  resize(screenW: number, screenH: number): void {
    // Handled in update()
  }
}
```

**Step 6: Wire death screen into main.tsx**

In `client/src/main.tsx`:

1. Import `DeathScreen`
2. Create instance and add to uiContainer
3. In the game loop, check `state.player.dead`:
   - If dead and death screen not showing: call `deathScreen.show()`
   - If dead: call `deathScreen.update(state.player.death_timer, screenW, screenH)` and skip movement input
   - If not dead and death screen is showing: call `deathScreen.hide()`

**Step 7: Compile and verify**

Run: `cd server && cargo build 2>&1 | head -30`
Expected: Compiles.

**Step 8: Commit**

```bash
git add -A && git commit -m "feat: player death screen with 10-second respawn timer"
```

---

### Task 7: Client-Side Combat VFX Renderer

**Files:**
- Create: `client/src/renderer/combat-vfx.ts`
- Modify: `client/src/main.tsx` (instantiate and update VFX renderer)

**Step 1: Create CombatVFX renderer**

Create `client/src/renderer/combat-vfx.ts` with these effect systems:

1. **Swing arc** — rendered as a colored arc for melee weapons, expanding ring for torch
2. **Damage numbers** — floating text that rises and fades
3. **Hit flash** — white tint on enemy sprites for 3 frames
4. **Screen shake** — random camera offset that decays
5. **Low HP vignette** — red pulsing overlay
6. **Enemy death particles** — burst of colored particles

```typescript
import { Container, Graphics, Text, TextStyle } from 'pixi.js';

const FONT = '"IBM Plex Mono", monospace';

interface DamageNumber {
  text: Text;
  life: number;
  vy: number;
}

interface DeathParticle {
  gfx: Graphics;
  vx: number;
  vy: number;
  life: number;
}

interface SwingArc {
  gfx: Graphics;
  life: number;
}

export class CombatVFX {
  /** Add to worldContainer for in-world effects */
  readonly worldLayer: Container;
  /** Add to uiContainer for screen-space effects (vignette, shake) */
  readonly screenLayer: Container;

  private damageNumbers: DamageNumber[] = [];
  private deathParticles: DeathParticle[] = [];
  private swingArcs: SwingArc[] = [];
  private shakeFrames = 0;
  private shakeIntensity = 0;
  private vignette: Graphics;
  private vignetteAlpha = 0;

  constructor() {
    this.worldLayer = new Container();
    this.worldLayer.label = 'combat-vfx-world';
    this.screenLayer = new Container();
    this.screenLayer.label = 'combat-vfx-screen';

    this.vignette = new Graphics();
    this.screenLayer.addChild(this.vignette);
  }

  /** Spawn a weapon swing arc at the player's position */
  spawnSwingArc(
    px: number, py: number,
    facingX: number, facingY: number,
    arcDegrees: number, range: number,
    color: number,
  ): void {
    const gfx = new Graphics();
    this.worldLayer.addChild(gfx);

    if (arcDegrees >= 360) {
      // AOE ring
      gfx.circle(px, py, range);
      gfx.stroke({ color, alpha: 0.7, width: 2 });
      gfx.circle(px, py, range * 0.6);
      gfx.fill({ color, alpha: 0.15 });
    } else {
      // Directional arc
      const angle = Math.atan2(facingY, facingX);
      const halfArc = (arcDegrees / 2) * (Math.PI / 180);
      const startAngle = angle - halfArc;
      const endAngle = angle + halfArc;

      gfx.moveTo(px, py);
      gfx.arc(px, py, range, startAngle, endAngle);
      gfx.closePath();
      gfx.fill({ color, alpha: 0.25 });

      // Slash edge
      gfx.moveTo(px, py);
      gfx.arc(px, py, range, startAngle, endAngle);
      gfx.stroke({ color, alpha: 0.8, width: 2 });
    }

    this.swingArcs.push({ gfx, life: 8 });
  }

  /** Spawn floating damage number */
  spawnDamageNumber(x: number, y: number, damage: number, isPlayerDamage: boolean): void {
    const color = isPlayerDamage ? 0xff4444 : 0xffcc44;
    const text = new Text({
      text: `${damage}`,
      style: new TextStyle({
        fontFamily: FONT,
        fontSize: 8,
        fill: color,
        fontWeight: 'bold',
        stroke: { color: 0x000000, width: 2 },
      }),
    });
    text.anchor.set(0.5);
    text.x = x + (Math.random() - 0.5) * 8;
    text.y = y - 8;
    this.worldLayer.addChild(text);
    this.damageNumbers.push({ text, life: 30, vy: -0.5 });
  }

  /** Spawn death particles at position */
  spawnDeathParticles(x: number, y: number, color: number): void {
    const count = 8;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const speed = 1.0 + Math.random() * 1.5;
      const gfx = new Graphics();
      gfx.rect(-1.5, -1.5, 3, 3);
      gfx.fill(color);
      gfx.x = x;
      gfx.y = y;
      this.worldLayer.addChild(gfx);
      this.deathParticles.push({
        gfx,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 20,
      });
    }
  }

  /** Trigger screen shake */
  triggerShake(intensity: number, frames: number): void {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
    this.shakeFrames = Math.max(this.shakeFrames, frames);
  }

  /** Get current shake offset (apply to camera) */
  getShakeOffset(): { x: number; y: number } {
    if (this.shakeFrames <= 0) return { x: 0, y: 0 };
    const t = this.shakeFrames / 8; // decay
    return {
      x: (Math.random() - 0.5) * this.shakeIntensity * t,
      y: (Math.random() - 0.5) * this.shakeIntensity * t,
    };
  }

  /** Update low HP vignette */
  updateVignette(healthPct: number, screenW: number, screenH: number): void {
    this.vignette.clear();
    if (healthPct < 0.25 && healthPct > 0) {
      const pulse = 0.15 + Math.sin(Date.now() / 300) * 0.1;
      this.vignette.rect(0, 0, screenW, screenH);
      this.vignette.fill({ color: 0xff0000, alpha: pulse });
    }
  }

  /** Tick all effects */
  update(): void {
    // Update swing arcs
    for (let i = this.swingArcs.length - 1; i >= 0; i--) {
      const arc = this.swingArcs[i];
      arc.life--;
      arc.gfx.alpha = arc.life / 8;
      if (arc.life <= 0) {
        this.worldLayer.removeChild(arc.gfx);
        arc.gfx.destroy();
        this.swingArcs.splice(i, 1);
      }
    }

    // Update damage numbers
    for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
      const dn = this.damageNumbers[i];
      dn.life--;
      dn.text.y += dn.vy;
      dn.text.alpha = dn.life / 30;
      if (dn.life <= 0) {
        this.worldLayer.removeChild(dn.text);
        dn.text.destroy();
        this.damageNumbers.splice(i, 1);
      }
    }

    // Update death particles
    for (let i = this.deathParticles.length - 1; i >= 0; i--) {
      const p = this.deathParticles[i];
      p.life--;
      p.gfx.x += p.vx;
      p.gfx.y += p.vy;
      p.gfx.alpha = p.life / 20;
      if (p.life <= 0) {
        this.worldLayer.removeChild(p.gfx);
        p.gfx.destroy();
        this.deathParticles.splice(i, 1);
      }
    }

    // Update shake
    if (this.shakeFrames > 0) {
      this.shakeFrames--;
      if (this.shakeFrames <= 0) {
        this.shakeIntensity = 0;
      }
    }
  }
}
```

**Step 2: Wire VFX into main.tsx game loop**

In `client/src/main.tsx`:

1. Import `CombatVFX` and create instance
2. Add `combatVFX.worldLayer` to `worldContainer` (above player layer)
3. Add `combatVFX.screenLayer` to `uiContainer` (high z-index)
4. In the game loop, after processing `latestState`:

```typescript
// Process combat events for VFX
if (state.combat_events) {
  for (const evt of state.combat_events) {
    combatVFX.spawnDamageNumber(evt.x, evt.y, evt.damage, false);
    if (evt.is_kill && evt.rogue_type) {
      const color = ROGUE_TYPE_COLORS[evt.rogue_type] ?? 0xffffff;
      combatVFX.spawnDeathParticles(evt.x, evt.y, color);
      combatVFX.triggerShake(3, 5);
    }
  }
}

// Player took damage VFX
if (state.player_hit && state.player_hit_damage > 0) {
  combatVFX.spawnDamageNumber(pos.x, pos.y - 4, state.player_hit_damage, true);
  if (state.player_hit_damage >= 3) {
    combatVFX.triggerShake(5, 8);
  }
}

// Player attacked — show swing arc
// Track locally when player pressed attack and weapon type
if (action === 'Attack' && !state.player.dead) {
  const facing = state.player.facing;
  // Weapon arc colors (look up from equipped weapon)
  combatVFX.spawnSwingArc(pos.x, pos.y, facing.x, facing.y, /* arc and range from equipped weapon */);
}

// Low HP vignette
const hpPct = state.player.health / state.player.max_health;
combatVFX.updateVignette(hpPct, window.innerWidth, window.innerHeight);

// Apply screen shake to camera
const shake = combatVFX.getShakeOffset();
worldContainer.x = halfW - pos.x * ZOOM + shake.x;
worldContainer.y = halfH - pos.y * ZOOM + shake.y;

// Tick all VFX
combatVFX.update();
```

**Step 3: Add rogue hit flash to entity renderer**

In `client/src/renderer/entities.ts`, when processing combat events, briefly tint rogue sprites white. Add a `hitFlashTimers` map tracking entity IDs that were just hit. In `update()`, decrement timers and apply tint.

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: combat VFX - swing arcs, damage numbers, particles, screen shake, vignette"
```

---

### Task 8: Integrate & Polish

**Files:**
- Modify: `client/src/main.tsx` (final wiring, track weapon state for arc rendering)
- Modify: `client/src/renderer/entities.ts` (hit flash integration)
- Modify: `client/src/ui/equipment-hud.ts` (export getEquippedWeapon for VFX color lookup)

**Step 1: Track equipped weapon on client for VFX**

The client needs to know the equipped weapon's arc, range, and color for rendering swing arcs. Add a getter to `EquipmentHUD`:

```typescript
getEquippedWeapon(): WeaponDef | null {
  return this.equippedWeapon;
}
```

Create a `WEAPON_COMBAT_STATS` map in main.tsx or import from equipment-hud:

```typescript
const WEAPON_COMBAT_STATS: Record<string, { arc: number; range: number; color: number }> = {
  shortsword: { arc: 90, range: 30, color: 0xffffff },
  greatsword: { arc: 180, range: 35, color: 0xff6622 },
  staff: { arc: 120, range: 40, color: 0x6644ff },
  crossbow: { arc: 0, range: 120, color: 0x44ccff },
  torch: { arc: 360, range: 25, color: 0xff8800 },
};
```

Use this to determine swing arc visual when the player attacks.

**Step 2: Handle crossbow visual differently**

For crossbow, don't render a swing arc. Instead, the projectile entity rendering handles the visual. The server sends projectile entities which the entity renderer draws as small bolts.

**Step 3: Player graphic flash on damage**

Tint the player circle red briefly when hit. Add a `playerHitFlash` counter in main.tsx:

```typescript
let playerHitFlash = 0;

// In game loop when player hit:
if (state.player_hit) {
  playerHitFlash = 6;
}

// Each frame:
if (playerHitFlash > 0) {
  player.tint = 0xff4444;
  playerHitFlash--;
} else {
  player.tint = 0xffffff;
}
```

**Step 4: Send attack cooldown state to client**

Add `attack_cooldown_pct: f32` to `PlayerSnapshot` (ratio of remaining/total cooldown). Client can use this to show a cooldown indicator on the weapon slot in the equipment HUD.

In `server/src/protocol.rs` PlayerSnapshot:
```rust
pub attack_cooldown_pct: f32,
```

Mirror in client protocol.ts. Populate in main.rs snapshot build.

**Step 5: Full integration test**

1. Start server: `cd server && cargo run`
2. Start client: `cd client && npm run dev`
3. Verify:
   - Player faces direction of movement
   - Spacebar swings weapon in facing direction with visible arc
   - Only enemies in the arc take damage
   - Damage numbers float up
   - Enemy death shows particle burst
   - Screen shakes on hits
   - Player flashes red when hit
   - Low HP shows red vignette
   - Player death shows death screen
   - After 10 seconds, respawns at home base
   - Equipment switching changes weapon stats
   - Armor reduces incoming damage
   - Heavy armor slows movement
   - Crossbow fires projectile

**Step 6: Commit**

```bash
git add -A && git commit -m "feat: complete combat system with VFX, death, equipment sync"
```
