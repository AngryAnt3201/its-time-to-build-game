use hecs::World;

use crate::ecs::components::{
    Agent, AgentState, AgentTier, Building, BuildingType, ConstructionProgress, GameState,
};
use crate::protocol::{AgentStateKind, AgentTierKind, BuildingTypeKind};

/// Runs the economy system for a single tick.
///
/// Calculates total agent wages (expenditure) and building passive income,
/// then updates `game_state.economy` with the computed values and applies
/// the net change to the balance.
pub fn economy_system(world: &World, game_state: &mut GameState) {
    let mut total_wages: f64 = 0.0;
    let mut wage_sinks: Vec<(String, f64)> = Vec::new();

    // ── Agent wages (expenditure) ────────────────────────────────────
    for (_entity, (_agent, agent_state, agent_tier)) in
        world.query::<(&Agent, &AgentState, &AgentTier)>().iter()
    {
        // Dead and dormant agents cost nothing.
        if agent_state.state == AgentStateKind::Unresponsive
            || agent_state.state == AgentStateKind::Dormant
        {
            continue;
        }

        let base_wage = match agent_tier.tier {
            AgentTierKind::Apprentice => 0.05,
            AgentTierKind::Journeyman => 0.1,
            AgentTierKind::Artisan => 0.2,
            AgentTierKind::Architect => 0.4,
        };

        // Idle agents cost half.
        let wage = if agent_state.state == AgentStateKind::Idle {
            base_wage * 0.5
        } else {
            base_wage
        };

        total_wages += wage;
        wage_sinks.push((format!("{:?}", agent_tier.tier), wage));
    }

    // ── Building passive income ──────────────────────────────────────
    let mut total_income: f64 = 0.0;
    let mut income_sources: Vec<(String, f64)> = Vec::new();

    for (_entity, (_building, building_type, progress)) in world
        .query::<(&Building, &BuildingType, &ConstructionProgress)>()
        .iter()
    {
        // Only completed buildings generate income.
        if progress.current < progress.total {
            continue;
        }

        let income = match building_type.kind {
            BuildingTypeKind::ComputeFarm => 0.5,
            BuildingTypeKind::TodoApp => 0.02,
            BuildingTypeKind::WeatherDashboard => 0.1,
            BuildingTypeKind::EcommerceStore => 0.3,
            BuildingTypeKind::AiImageGenerator => 0.25,
            BuildingTypeKind::Blockchain => 1.0,
            _ => 0.0,
        };

        if income > 0.0 {
            total_income += income;
            income_sources.push((format!("{:?}", building_type.kind), income));
        }
    }

    // ── Update economy state ─────────────────────────────────────────
    game_state.economy.income_per_tick = total_income;
    game_state.economy.expenditure_per_tick = total_wages;
    game_state.economy.income_sources = income_sources;
    game_state.economy.expenditure_sinks = wage_sinks;

    // Apply net change to balance.
    let net = total_income - total_wages;
    // Convert fractional net to integer balance change. For small values this
    // will often round to zero, letting fractional accumulation happen over
    // multiple ticks.
    game_state.economy.balance += net as i64;
}
