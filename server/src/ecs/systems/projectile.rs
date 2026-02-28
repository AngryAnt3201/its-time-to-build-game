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

pub fn projectile_system(world: &mut World) -> ProjectileResult {
    let mut result = ProjectileResult {
        despawned: Vec::new(),
        killed_rogues: Vec::new(),
        combat_events: Vec::new(),
        audio_events: Vec::new(),
        bounty_tokens: 0,
    };

    // Move projectiles and track which are still alive
    let mut live_projectiles: Vec<(hecs::Entity, Position, i32, bool)> = Vec::new();
    let mut to_despawn: Vec<hecs::Entity> = Vec::new();

    for (entity, (pos, proj)) in world.query_mut::<(&mut Position, &mut Projectile)>() {
        pos.x += proj.dx * proj.speed;
        pos.y += proj.dy * proj.speed;
        proj.range_remaining -= proj.speed;

        if proj.range_remaining <= 0.0 {
            to_despawn.push(entity);
        } else {
            live_projectiles.push((entity, pos.clone(), proj.damage, proj.owner_is_player));
        }
    }

    // Gather rogues for collision
    let rogues: Vec<(hecs::Entity, Position, RogueTypeKind)> = world
        .query::<(&Rogue, &Position, &RogueType)>()
        .iter()
        .map(|(e, (_, p, rt))| (e, p.clone(), rt.kind))
        .collect();

    // Check collisions
    let hit_range_sq: f32 = 8.0 * 8.0;

    for (proj_entity, proj_pos, proj_damage, is_player) in &live_projectiles {
        if !is_player { continue; }

        for &(rogue_entity, ref rogue_pos, rogue_kind) in &rogues {
            let dx = proj_pos.x - rogue_pos.x;
            let dy = proj_pos.y - rogue_pos.y;
            if dx * dx + dy * dy > hit_range_sq { continue; }

            // Hit!
            if let Ok(mut health) = world.get::<&mut Health>(rogue_entity) {
                health.current -= proj_damage;
                result.audio_events.push(AudioEvent::CombatHit);
                let is_kill = health.current <= 0;
                result.combat_events.push(CombatEvent {
                    x: rogue_pos.x,
                    y: rogue_pos.y,
                    damage: *proj_damage,
                    is_kill,
                    rogue_type: Some(rogue_kind),
                });

                if is_kill {
                    let bounty = bounty_for(rogue_kind);
                    result.bounty_tokens += bounty;
                    result.killed_rogues.push((rogue_entity, rogue_kind));
                }
            }

            to_despawn.push(*proj_entity);
            break;
        }
    }

    // Despawn projectiles that expired or hit
    for entity in &to_despawn {
        let _ = world.despawn(*entity);
        result.despawned.push(*entity);
    }

    // Despawn killed rogues
    for &(rogue_entity, _) in &result.killed_rogues {
        let _ = world.despawn(rogue_entity);
    }

    result
}
