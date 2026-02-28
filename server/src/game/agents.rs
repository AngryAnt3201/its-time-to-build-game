use hecs::World;
use rand::Rng;

use crate::ecs::components::{
    Agent, AgentMorale, AgentName, AgentState, AgentStats, AgentTier, AgentVibeConfig, AgentXP,
    Assignment, Collider, Health, Position, TokenEconomy, Velocity, VoiceProfile,
};
use crate::protocol::{AgentStateKind, AgentTierKind, TaskAssignment};

/// Bank of 24 procedural agent names.
const NAME_BANK: [&str; 24] = [
    "sol", "mira", "echo", "nova", "kai", "iris", "ash", "luna", "byte", "flux", "pip", "hex",
    "reed", "sage", "fern", "rune", "wren", "arc", "ori", "lux", "coda", "vale", "drift",
    "ember",
];

/// Returns the recruitment cost in tokens for a given agent tier.
fn recruitment_cost(tier: AgentTierKind) -> i64 {
    match tier {
        AgentTierKind::Apprentice => 20,
        AgentTierKind::Journeyman => 60,
        AgentTierKind::Artisan => 150,
        AgentTierKind::Architect => 400,
    }
}

/// Generate random agent stats based on tier.
///
/// Each tier defines min/max ranges for reliability, speed, awareness, and resilience.
fn generate_stats(tier: AgentTierKind) -> AgentStats {
    let mut rng = rand::thread_rng();

    let (rel_min, rel_max, spd_min, spd_max, awa_min, awa_max, res_min, res_max) = match tier {
        AgentTierKind::Apprentice => (0.5, 0.65, 0.8, 1.0, 60.0, 80.0, 40.0, 55.0),
        AgentTierKind::Journeyman => (0.65, 0.8, 1.0, 1.3, 80.0, 105.0, 60.0, 80.0),
        AgentTierKind::Artisan => (0.8, 0.9, 1.2, 1.5, 100.0, 130.0, 80.0, 105.0),
        AgentTierKind::Architect => (0.9, 0.98, 1.4, 1.7, 120.0, 150.0, 100.0, 130.0),
    };

    AgentStats {
        reliability: rng.gen_range(rel_min..=rel_max),
        speed: rng.gen_range(spd_min..=spd_max),
        awareness: rng.gen_range(awa_min..=awa_max),
        resilience: rng.gen_range(res_min..=res_max),
    }
}

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

/// Pick a random name from the name bank.
fn pick_name() -> String {
    let mut rng = rand::thread_rng();
    let idx = rng.gen_range(0..NAME_BANK.len());
    NAME_BANK[idx].to_string()
}

/// Recruit a new agent into the world.
///
/// Checks that the economy has sufficient balance for the tier's cost, deducts the cost,
/// generates random stats and a procedural name, then spawns the agent entity with all
/// required components.
///
/// # Errors
///
/// Returns an error string if the economy balance is insufficient for the recruitment cost.
pub fn recruit_agent(
    world: &mut World,
    tier: AgentTierKind,
    spawn_x: f32,
    spawn_y: f32,
    economy: &mut TokenEconomy,
) -> Result<hecs::Entity, String> {
    let cost = recruitment_cost(tier);

    if economy.balance < cost {
        return Err(format!(
            "Insufficient balance: need {} tokens but only have {}",
            cost, economy.balance
        ));
    }

    economy.balance -= cost;

    let stats = generate_stats(tier);
    let resilience = stats.resilience as i32;
    let name = pick_name();

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

    Ok(entity)
}

/// Assign a task to an existing agent entity.
///
/// Checks that the agent is not in the `Unresponsive` state, maps the task to the
/// appropriate `AgentStateKind`, updates the agent's state, and inserts (or replaces)
/// the `Assignment` component on the entity.
///
/// # Errors
///
/// Returns an error if the entity does not exist, lacks an `AgentState` component,
/// or is currently `Unresponsive`.
pub fn assign_task(
    world: &mut World,
    agent_entity: hecs::Entity,
    task: TaskAssignment,
) -> Result<(), String> {
    // Read the current agent state
    let current_state = world
        .get::<&AgentState>(agent_entity)
        .map(|s| s.state)
        .map_err(|_| "Entity does not have an AgentState component".to_string())?;

    if current_state == AgentStateKind::Unresponsive {
        return Err("Agent is unresponsive and cannot accept tasks".to_string());
    }

    // Map task to the corresponding agent state
    let new_state = match task {
        TaskAssignment::Build => AgentStateKind::Building,
        TaskAssignment::Explore => AgentStateKind::Exploring,
        TaskAssignment::Guard => AgentStateKind::Defending,
        TaskAssignment::Crank => AgentStateKind::Building,
        TaskAssignment::Idle => AgentStateKind::Idle,
    };

    // Update the agent's state
    if let Ok(mut state) = world.get::<&mut AgentState>(agent_entity) {
        state.state = new_state;
    }

    // Insert or replace the Assignment component
    world
        .insert_one(agent_entity, Assignment { task })
        .map_err(|e| format!("Failed to insert Assignment component: {}", e))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_economy(balance: i64) -> TokenEconomy {
        TokenEconomy {
            balance,
            income_per_tick: 0.0,
            expenditure_per_tick: 0.0,
            income_sources: Vec::new(),
            expenditure_sinks: Vec::new(),
        }
    }

    #[test]
    fn recruit_apprentice_deducts_cost() {
        let mut world = World::new();
        let mut economy = make_economy(100);
        let result = recruit_agent(&mut world, AgentTierKind::Apprentice, 10.0, 20.0, &mut economy);
        assert!(result.is_ok());
        assert_eq!(economy.balance, 80); // 100 - 20
    }

    #[test]
    fn recruit_fails_with_insufficient_balance() {
        let mut world = World::new();
        let mut economy = make_economy(10);
        let result = recruit_agent(&mut world, AgentTierKind::Apprentice, 0.0, 0.0, &mut economy);
        assert!(result.is_err());
        assert_eq!(economy.balance, 10); // unchanged
    }

    #[test]
    fn recruit_architect_costs_400() {
        let mut world = World::new();
        let mut economy = make_economy(500);
        let result = recruit_agent(&mut world, AgentTierKind::Architect, 0.0, 0.0, &mut economy);
        assert!(result.is_ok());
        assert_eq!(economy.balance, 100); // 500 - 400
    }

    #[test]
    fn recruited_agent_has_correct_components() {
        let mut world = World::new();
        let mut economy = make_economy(200);
        let entity =
            recruit_agent(&mut world, AgentTierKind::Journeyman, 5.0, 15.0, &mut economy).unwrap();

        // Verify position
        let pos = world.get::<&Position>(entity).unwrap();
        assert_eq!(pos.x, 5.0);
        assert_eq!(pos.y, 15.0);

        // Verify state is Idle
        let state = world.get::<&AgentState>(entity).unwrap();
        assert_eq!(state.state, AgentStateKind::Idle);

        // Verify morale is 0.7
        let morale = world.get::<&AgentMorale>(entity).unwrap();
        assert!((morale.value - 0.7).abs() < f32::EPSILON);

        // Verify tier
        let tier = world.get::<&AgentTier>(entity).unwrap();
        assert_eq!(tier.tier, AgentTierKind::Journeyman);

        // Verify name is from the bank
        let name = world.get::<&AgentName>(entity).unwrap();
        assert!(NAME_BANK.contains(&name.name.as_str()));
    }

    #[test]
    fn assign_task_updates_state() {
        let mut world = World::new();
        let mut economy = make_economy(100);
        let entity =
            recruit_agent(&mut world, AgentTierKind::Apprentice, 0.0, 0.0, &mut economy).unwrap();

        let result = assign_task(&mut world, entity, TaskAssignment::Explore);
        assert!(result.is_ok());

        let state = world.get::<&AgentState>(entity).unwrap();
        assert_eq!(state.state, AgentStateKind::Exploring);

        let assignment = world.get::<&Assignment>(entity).unwrap();
        assert_eq!(assignment.task, TaskAssignment::Explore);
    }

    #[test]
    fn assign_task_rejects_unresponsive() {
        let mut world = World::new();
        let mut economy = make_economy(100);
        let entity =
            recruit_agent(&mut world, AgentTierKind::Apprentice, 0.0, 0.0, &mut economy).unwrap();

        // Force unresponsive state
        if let Ok(mut state) = world.get::<&mut AgentState>(entity) {
            state.state = AgentStateKind::Unresponsive;
        }

        let result = assign_task(&mut world, entity, TaskAssignment::Build);
        assert!(result.is_err());
    }

    #[test]
    fn assign_guard_sets_defending() {
        let mut world = World::new();
        let mut economy = make_economy(100);
        let entity =
            recruit_agent(&mut world, AgentTierKind::Apprentice, 0.0, 0.0, &mut economy).unwrap();

        assign_task(&mut world, entity, TaskAssignment::Guard).unwrap();

        let state = world.get::<&AgentState>(entity).unwrap();
        assert_eq!(state.state, AgentStateKind::Defending);
    }

    #[test]
    fn assign_crank_sets_building() {
        let mut world = World::new();
        let mut economy = make_economy(100);
        let entity =
            recruit_agent(&mut world, AgentTierKind::Apprentice, 0.0, 0.0, &mut economy).unwrap();

        assign_task(&mut world, entity, TaskAssignment::Crank).unwrap();

        let state = world.get::<&AgentState>(entity).unwrap();
        assert_eq!(state.state, AgentStateKind::Building);
    }

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
}
