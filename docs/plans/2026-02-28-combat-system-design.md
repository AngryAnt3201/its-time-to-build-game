# Combat System Design

## Overview

Implement a full combat system with directional melee attacks, weapon/armor equipment sync, attack cooldowns, player death/respawn, enemy death effects, and visual feedback (swing arcs, damage numbers, screen shake, death screen).

## 1. Player Facing Direction

Server tracks `Facing { dx: f32, dy: f32 }` component on player entity. Updated on movement, persists when stationary. Sent to client via `PlayerSnapshot.facing: Vec2`.

## 2. Weapon Stats & Equipment Sync

| Weapon | ID | Damage | Cooldown (ticks) | Range | Arc | Type |
|---|---|---|---|---|---|---|
| Process Terminator | shortsword | 8 | 6 | 30 | 90 | Melee |
| Hard Reset | greatsword | 24 | 20 | 35 | 180 | Melee |
| Signal Jammer | staff | 14 | 12 | 40 | 120 | Melee |
| Null Pointer | crossbow | 16 | 16 | 120 | - | Ranged (projectile) |
| Flare | torch | 10 | 10 | 25 | 360 | AOE |

New `PlayerAction` variants: `EquipWeapon { weapon_id: String }`, `EquipArmor { armor_id: String }`.

`CombatPower` component extended with `cooldown_remaining: u32`, `range: f32`, `arc_degrees: f32`. Cooldown decrements each tick; player can only attack when `cooldown_remaining == 0`.

Crossbow spawns a `Projectile` entity traveling at ~6 px/tick in facing direction. Hits first rogue within collision radius. Despawns on hit or after max range.

## 3. Armor Stats & Speed Penalty

| Armor | ID | DEF | Speed Penalty |
|---|---|---|---|
| Base Prompt | cloth | 2 | 0.0 |
| Few-Shot Padding | leather | 5 | 0.0 |
| Chain-of-Thought Mail | chain | 10 | 0.10 |
| Constitutional AI Plate | plate | 18 | 0.25 |

`Armor` component attached to player entity at spawn (defaults to cloth). Damage formula: `max(1, raw_damage - armor_def)`. Speed formula: `PLAYER_SPEED * (1.0 - speed_penalty)`.

## 4. Directional Combat

Melee: check if rogue is within weapon arc by comparing `dot(facing, dir_to_rogue)` against `cos(arc_degrees / 2)`. Only rogues within both range AND arc take damage.

Torch (360 AOE): hits all enemies in range, no arc check.

Crossbow: spawns projectile entity, no arc check at spawn time.

## 5. Player Death & Respawn

1. Health reaches 0 -> server sets `player_dead: true`, `death_tick: current_tick` on GameState
2. Server ignores player movement/actions while dead
3. `PlayerSnapshot` gains `dead: bool` field
4. After 200 ticks (10s), server respawns at (400, 300) with full HP
5. Client shows death overlay: red fade, "SYSTEM FAILURE - Rebooting..." with countdown

## 6. Enemy Death Events

`CombatResult` includes killed rogue positions. `GameStateUpdate` gains `death_events: Vec<DeathEvent { x, y, rogue_type }>`. Client spawns particle burst at death position.

## 7. Visual Effects (Client-Side)

- **Attack arc**: colored arc/slash matching weapon type and facing direction, 8-12 frames
- **Damage numbers**: floating text rises and fades, gold (dealt) or red (taken), ~30 frames
- **Hit flash**: rogues tint white 3 frames on hit, player tints red 3 frames on damage
- **Screen shake**: 2-3px random offset ~5 frames on hit, stronger on big damage
- **Low HP vignette**: red pulsing overlay at screen edges when HP < 25%
- **Death screen**: full-screen fade to black, "SYSTEM FAILURE" glitch text, countdown timer, fade out on respawn
- **Enemy death particles**: 6-10 colored particles burst outward and fade ~20 frames
