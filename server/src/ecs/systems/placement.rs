use hecs::World;

use crate::ecs::components::{
    Building, BuildingEffects, BuildingType, ConstructionProgress, Health, LightSource, Position,
    TokenEconomy,
};
use crate::game::building::get_building_definition;
use crate::protocol::BuildingTypeKind;

/// Attempts to place a building in the world.
///
/// Checks that the player can afford the building, deducts the token cost from
/// the economy, and spawns a new building entity with the appropriate
/// components (including a light source if the building definition specifies
/// one).
///
/// Returns the newly spawned entity on success, or a descriptive error string.
pub fn place_building(
    world: &mut World,
    building_type: BuildingTypeKind,
    x: f32,
    y: f32,
    economy: &mut TokenEconomy,
) -> Result<hecs::Entity, String> {
    let def = get_building_definition(&building_type);

    // ── Affordability check ─────────────────────────────────────────
    if economy.balance < def.token_cost {
        return Err(format!(
            "Not enough tokens: need {}, have {}",
            def.token_cost, economy.balance
        ));
    }

    // ── Deduct cost ─────────────────────────────────────────────────
    economy.balance -= def.token_cost;

    // ── Spawn the building entity ───────────────────────────────────
    let entity = if let Some((radius, color)) = def.light_source {
        world.spawn((
            Building,
            Position { x, y },
            BuildingType { kind: building_type },
            ConstructionProgress {
                current: 0.0,
                total: def.build_time,
                assigned_agents: Vec::new(),
            },
            Health {
                current: 100,
                max: 100,
            },
            BuildingEffects {
                effects: def.effects,
            },
            LightSource { radius, color },
        ))
    } else {
        world.spawn((
            Building,
            Position { x, y },
            BuildingType { kind: building_type },
            ConstructionProgress {
                current: 0.0,
                total: def.build_time,
                assigned_agents: Vec::new(),
            },
            Health {
                current: 100,
                max: 100,
            },
            BuildingEffects {
                effects: def.effects,
            },
        ))
    };

    Ok(entity)
}
