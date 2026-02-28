use hecs::World;

use crate::ecs::components::{
    Agent, AgentName, AgentState, AgentStats, AgentVibeConfig, TokenEconomy,
};
use crate::protocol::AgentStateKind;

/// Result of the agent tick system -- log entries for the client.
pub struct AgentTickResult {
    pub log_entries: Vec<String>,
}

/// Tick all working agents: increment turns_used, check for errors, handle erroring state.
pub fn agent_tick_system(world: &mut World, economy: &mut TokenEconomy) -> AgentTickResult {
    let mut log_entries = Vec::new();
    let mut to_error: Vec<hecs::Entity> = Vec::new();
    let mut token_drain: i64 = 0;

    // Phase 1: Check working agents for turn limits and random errors
    for (id, (state, vibe, stats)) in world
        .query_mut::<hecs::With<(&AgentState, &mut AgentVibeConfig, &AgentStats), &Agent>>()
    {
        match state.state {
            AgentStateKind::Building | AgentStateKind::Exploring | AgentStateKind::Defending => {
                vibe.turns_used += 1;

                // Check turn limit
                if vibe.turns_used >= vibe.max_turns {
                    to_error.push(id);
                    continue;
                }

                // Random error check
                let turn_ratio = vibe.turns_used as f32 / vibe.max_turns as f32;
                let error_chance = vibe.error_chance_base * (1.0 - stats.reliability) * turn_ratio;
                let roll: f32 = rand::random();
                if roll < error_chance {
                    to_error.push(id);
                }
            }
            AgentStateKind::Erroring => {
                // Burn tokens while erroring
                token_drain += vibe.token_burn_rate;
            }
            _ => {}
        }
    }

    // Phase 2: Transition agents to Erroring
    for entity in to_error {
        if let Ok(mut state) = world.get::<&mut AgentState>(entity) {
            state.state = AgentStateKind::Erroring;
        }
        if let Ok(name) = world.get::<&AgentName>(entity) {
            log_entries.push(format!("[{}] context limit reached -- ERRORING", name.name));
        }
    }

    // Phase 3: Drain tokens from economy
    economy.balance -= token_drain;

    AgentTickResult { log_entries }
}
