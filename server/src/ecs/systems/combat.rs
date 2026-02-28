use hecs::World;

use crate::ecs::components::{
    Agent, AgentName, AgentState, Armor, CombatPower, Facing, GameState, Health, Player, Position,
    Rogue, RogueType,
};
use crate::protocol::{AgentStateKind, AudioEvent, CombatEvent, RogueTypeKind};

/// The result of running the combat system for one tick.
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

fn distance_sq(a: &Position, b: &Position) -> f32 {
    let dx = a.x - b.x;
    let dy = a.y - b.y;
    dx * dx + dy * dy
}

fn bounty_for(kind: RogueTypeKind) -> i64 {
    match kind {
        RogueTypeKind::Swarm => 5,
        RogueTypeKind::Corruptor => 15,
        RogueTypeKind::Looper => 10,
        RogueTypeKind::TokenDrain => 12,
        RogueTypeKind::Assassin => 30,
        RogueTypeKind::Mimic => 15,
        RogueTypeKind::Architect => 50,
    }
}

fn rogue_damage_to_player(kind: RogueTypeKind) -> i32 {
    match kind {
        RogueTypeKind::Swarm => 1,
        RogueTypeKind::Corruptor => 2,
        RogueTypeKind::Looper => 1,
        RogueTypeKind::Assassin => 5,
        RogueTypeKind::Mimic => 3,
        RogueTypeKind::TokenDrain => 0,
        RogueTypeKind::Architect => 3,
    }
}

fn rogue_damage_to_agent(kind: RogueTypeKind) -> i32 {
    match kind {
        RogueTypeKind::Assassin => 8,
        RogueTypeKind::Corruptor => 3,
        _ => 2,
    }
}

/// Check if target position is within the weapon arc relative to facing direction.
fn is_in_arc(facing: &Facing, attacker_pos: &Position, target_pos: &Position, arc_degrees: f32) -> bool {
    if arc_degrees >= 360.0 {
        return true;
    }
    let dir_x = target_pos.x - attacker_pos.x;
    let dir_y = target_pos.y - attacker_pos.y;
    let dir_len = (dir_x * dir_x + dir_y * dir_y).sqrt();
    if dir_len < 0.001 {
        return true;
    }
    let norm_x = dir_x / dir_len;
    let norm_y = dir_y / dir_len;
    let dot = facing.dx * norm_x + facing.dy * norm_y;
    let half_arc_rad = (arc_degrees / 2.0).to_radians();
    dot >= half_arc_rad.cos()
}

pub fn combat_system(
    world: &mut World,
    game_state: &mut GameState,
    player_attacking: bool,
) -> CombatResult {
    let mut result = CombatResult {
        killed_rogues: Vec::new(),
        killed_agents: Vec::new(),
        player_damaged: false,
        player_hit_damage: 0,
        log_entries: Vec::new(),
        audio_events: Vec::new(),
        bounty_tokens: 0,
        combat_events: Vec::new(),
        player_attacked: false,
    };

    // ── Gather player info ──────────────────────────────────────────
    let mut player_pos: Option<Position> = None;
    let mut player_damage: i32 = 0;
    let mut player_range: f32 = 30.0;
    let mut player_arc: f32 = 90.0;
    let mut player_cooldown_remaining: u32 = 0;
    let mut player_cooldown_ticks: u32 = 6;
    let mut player_is_projectile: bool = false;
    let mut player_entity: Option<hecs::Entity> = None;
    let mut player_facing = Facing::default();
    let mut player_armor_def: f32 = 0.0;

    for (entity, (_player, pos, combat, facing)) in
        world.query::<(&Player, &Position, &CombatPower, &Facing)>().iter()
    {
        player_pos = Some(pos.clone());
        player_damage = combat.base_damage;
        player_range = combat.range;
        player_arc = combat.arc_degrees;
        player_cooldown_remaining = combat.cooldown_remaining;
        player_cooldown_ticks = combat.cooldown_ticks;
        player_is_projectile = combat.is_projectile;
        player_entity = Some(entity);
        player_facing = Facing { dx: facing.dx, dy: facing.dy };
    }

    // Get armor def
    if let Some(pe) = player_entity {
        if let Ok(armor) = world.get::<&Armor>(pe) {
            player_armor_def = armor.damage_reduction;
        }
    }

    let player_pos = match player_pos {
        Some(p) => p,
        None => return result,
    };

    // ── Gather rogue info ───────────────────────────────────────────
    let rogues: Vec<(hecs::Entity, Position, RogueTypeKind)> = world
        .query::<(&Rogue, &Position, &RogueType)>()
        .iter()
        .map(|(entity, (_rogue, pos, rogue_type))| (entity, pos.clone(), rogue_type.kind))
        .collect();

    // ── Player attacks rogues (directional, with cooldown) ──────────
    let attack_range_sq = player_range * player_range;

    if player_attacking && player_cooldown_remaining == 0 && !player_is_projectile {
        result.player_attacked = true;

        // Set cooldown
        if let Some(pe) = player_entity {
            if let Ok(mut combat) = world.get::<&mut CombatPower>(pe) {
                combat.cooldown_remaining = player_cooldown_ticks;
            }
        }

        for &(rogue_entity, ref rogue_pos, rogue_kind) in &rogues {
            if distance_sq(&player_pos, rogue_pos) > attack_range_sq {
                continue;
            }

            // Check directional arc
            if !is_in_arc(&player_facing, &player_pos, rogue_pos, player_arc) {
                continue;
            }

            if let Ok(mut health) = world.get::<&mut Health>(rogue_entity) {
                health.current -= player_damage;
                result.audio_events.push(AudioEvent::CombatHit);

                result.combat_events.push(CombatEvent {
                    x: rogue_pos.x,
                    y: rogue_pos.y,
                    damage: player_damage,
                    is_kill: health.current <= 0,
                    rogue_type: Some(rogue_kind),
                });

                if health.current <= 0 {
                    let bounty = bounty_for(rogue_kind);
                    result.bounty_tokens += bounty;
                    result.killed_rogues.push((rogue_entity, rogue_kind));
                    result.log_entries.push(format!("[combat] {:?} terminated", rogue_kind));
                }
            }
        }
    }

    // Crossbow: spawn projectile (handled by caller / projectile system later)
    if player_attacking && player_cooldown_remaining == 0 && player_is_projectile {
        result.player_attacked = true;
        if let Some(pe) = player_entity {
            if let Ok(mut combat) = world.get::<&mut CombatPower>(pe) {
                combat.cooldown_remaining = player_cooldown_ticks;
            }
        }
        // Projectile spawning is handled in main.rs after combat_system returns
    }

    // ── Rogues attack player (with armor reduction) ──────────────────
    if !game_state.god_mode {
        let player_threat_range_sq: f32 = 20.0 * 20.0;

        for &(_rogue_entity, ref rogue_pos, rogue_kind) in &rogues {
            if distance_sq(&player_pos, rogue_pos) > player_threat_range_sq {
                continue;
            }

            if rogue_kind == RogueTypeKind::TokenDrain {
                game_state.economy.balance = (game_state.economy.balance - 1).max(0);
                continue;
            }

            let raw_dmg = rogue_damage_to_player(rogue_kind);
            if raw_dmg > 0 {
                let final_dmg = (raw_dmg - player_armor_def as i32).max(1);
                if let Some(pe) = player_entity {
                    if let Ok(mut health) = world.get::<&mut Health>(pe) {
                        health.current -= final_dmg;
                        result.player_damaged = true;
                        result.player_hit_damage += final_dmg;
                    }
                }
            }
        }
    }

    // ── Rogues attack nearby agents ─────────────────────────────────
    let agent_threat_range_sq: f32 = 25.0 * 25.0;

    let agents: Vec<(hecs::Entity, Position, String)> = world
        .query::<(&Agent, &Position, &AgentState, &AgentName)>()
        .iter()
        .filter(|(_entity, (_agent, _pos, state, _name))| {
            state.state != AgentStateKind::Unresponsive
                && state.state != AgentStateKind::Dormant
        })
        .map(|(entity, (_agent, pos, _state, name))| (entity, pos.clone(), name.name.clone()))
        .collect();

    for (agent_entity, ref agent_pos, ref agent_name) in &agents {
        for &(_rogue_entity, ref rogue_pos, rogue_kind) in &rogues {
            if distance_sq(agent_pos, rogue_pos) > agent_threat_range_sq {
                continue;
            }

            let dmg = rogue_damage_to_agent(rogue_kind);
            if let Ok(mut health) = world.get::<&mut Health>(*agent_entity) {
                health.current -= dmg;

                if health.current <= 0 {
                    if let Ok(mut agent_state) = world.get::<&mut AgentState>(*agent_entity) {
                        agent_state.state = AgentStateKind::Unresponsive;
                    }
                    result.killed_agents.push((*agent_entity, agent_name.clone()));
                    result.log_entries.push(format!("[agent_{}] has stopped responding.", agent_name));
                    result.audio_events.push(AudioEvent::AgentDeath);
                    break;
                }
            }
        }
    }

    // ── Despawn killed rogues ────────────────────────────────────────
    for &(rogue_entity, _kind) in &result.killed_rogues {
        let _ = world.despawn(rogue_entity);
    }

    game_state.economy.balance += result.bounty_tokens;

    result
}
