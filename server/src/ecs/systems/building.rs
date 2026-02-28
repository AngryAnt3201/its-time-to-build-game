use hecs::World;

use crate::ecs::components::{
    Agent, AgentState, AgentStats, Assignment, Building, BuildingType, ConstructionProgress,
};
use crate::protocol::{AgentStateKind, BuildingTypeKind, TaskAssignment};

/// The result of running the building construction system for one tick.
pub struct BuildingSystemResult {
    /// Buildings that were completed this tick, along with their type.
    pub completed_buildings: Vec<(hecs::Entity, BuildingTypeKind)>,
    /// Log messages generated (e.g. construction-complete announcements).
    pub log_entries: Vec<String>,
}

/// Runs the building construction system for a single tick.
///
/// Finds all agents in the `Building` state with a `Build` task assignment,
/// sums their construction speed, and distributes that speed equally among all
/// incomplete buildings.  When a building reaches its target construction
/// points it is marked complete.
pub fn building_system(world: &mut World) -> BuildingSystemResult {
    let mut completed_buildings: Vec<(hecs::Entity, BuildingTypeKind)> = Vec::new();
    let mut log_entries: Vec<String> = Vec::new();

    // ── Gather total build power from qualifying agents ───────────
    let mut total_build_speed: f32 = 0.0;
    let mut builder_count: u32 = 0;

    for (_entity, (_agent, agent_state, agent_stats, assignment)) in world
        .query::<(&Agent, &AgentState, &AgentStats, &Assignment)>()
        .iter()
    {
        if agent_state.state == AgentStateKind::Building
            && assignment.task == TaskAssignment::Build
        {
            total_build_speed += agent_stats.speed;
            builder_count += 1;
        }
    }

    // Nothing to do if nobody is building.
    if builder_count == 0 || total_build_speed <= 0.0 {
        return BuildingSystemResult {
            completed_buildings,
            log_entries,
        };
    }

    // ── Count incomplete buildings ────────────────────────────────
    let mut incomplete_count: u32 = 0;
    for (_entity, (_building, progress)) in
        world.query::<(&Building, &ConstructionProgress)>().iter()
    {
        if progress.current < progress.total {
            incomplete_count += 1;
        }
    }

    if incomplete_count == 0 {
        return BuildingSystemResult {
            completed_buildings,
            log_entries,
        };
    }

    // ── Distribute build power equally among incomplete buildings ─
    let speed_per_building = total_build_speed / incomplete_count as f32;

    // Collect entities to update (we cannot mutate while iterating with
    // a query that borrows the world, so gather first, mutate second).
    let targets: Vec<hecs::Entity> = world
        .query::<(&Building, &ConstructionProgress)>()
        .iter()
        .filter(|(_entity, (_building, progress))| progress.current < progress.total)
        .map(|(entity, _)| entity)
        .collect();

    for entity in targets {
        // Fetch mutable components for this entity.
        let (progress, building_type) = match world
            .query_one::<(&mut ConstructionProgress, &BuildingType)>(entity)
        {
            Ok(mut q) => match q.get() {
                Some((p, bt)) => {
                    let was_incomplete = p.current < p.total;
                    p.current += speed_per_building;
                    let now_complete = p.current >= p.total;
                    if now_complete {
                        p.current = p.total;
                    }
                    (was_incomplete && now_complete, bt.kind)
                }
                None => continue,
            },
            Err(_) => continue,
        };

        if progress {
            completed_buildings.push((entity, building_type));
            log_entries.push(format!("{:?} construction complete!", building_type));
        }
    }

    BuildingSystemResult {
        completed_buildings,
        log_entries,
    }
}
