use hecs::World;

use crate::ecs::components::{
    Building, BuildingEffects, BuildingType, ConstructionProgress, Health, LightSource, Position,
    TokenEconomy,
};
use crate::game::building::get_building_definition;
use crate::protocol::BuildingTypeKind;

/// Returns true if this building kind can have multiple instances.
fn is_stackable(kind: &BuildingTypeKind) -> bool {
    matches!(kind, BuildingTypeKind::Pylon | BuildingTypeKind::ComputeFarm)
}

/// Returns true if this building kind has escalating costs per instance.
fn has_escalating_cost(kind: &BuildingTypeKind) -> bool {
    matches!(kind, BuildingTypeKind::Pylon | BuildingTypeKind::ComputeFarm)
}

/// Count how many buildings of the given kind already exist in the world.
fn count_existing(world: &World, kind: &BuildingTypeKind) -> u32 {
    let mut count = 0u32;
    for (_entity, (_building, bt)) in world.query::<(&Building, &BuildingType)>().iter() {
        if bt.kind == *kind {
            count += 1;
        }
    }
    count
}

/// Calculate the escalating cost for stackable buildings (Pylon, ComputeFarm).
/// Each additional instance costs 50% more than the previous one.
/// Formula: base_cost * 1.5^existing_count (rounded up).
fn escalating_cost(base_cost: i64, existing_count: u32) -> i64 {
    let multiplier = 1.5_f64.powi(existing_count as i32);
    (base_cost as f64 * multiplier).ceil() as i64
}

/// Attempts to place a building in the world.
///
/// Checks that the player can afford the building, deducts the token cost from
/// the economy, and spawns a new building entity with the appropriate
/// components (including a light source if the building definition specifies
/// one).
///
/// App buildings (non-infrastructure) are limited to 1 instance each.
/// Pylons and Compute Farms can have multiple instances but cost more each time.
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
    let existing_count = count_existing(world, &building_type);

    // ── Uniqueness check for non-stackable buildings ────────────────
    if !is_stackable(&building_type) && existing_count > 0 {
        return Err(format!(
            "Already built a {}. Only one instance allowed.",
            def.name
        ));
    }

    // ── Calculate actual cost (escalating for ComputeFarm only) ─────
    let actual_cost = if has_escalating_cost(&building_type) {
        escalating_cost(def.token_cost, existing_count)
    } else {
        def.token_cost
    };

    // ── Affordability check ─────────────────────────────────────────
    if economy.balance < actual_cost {
        return Err(format!(
            "Not enough tokens: need {}, have {}",
            actual_cost, economy.balance
        ));
    }

    // ── Deduct cost ─────────────────────────────────────────────────
    economy.balance -= actual_cost;

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
