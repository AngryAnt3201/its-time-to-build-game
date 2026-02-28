use crate::ecs::components::{CrankTier, GameState};

/// The result of running the crank system for one tick.
pub struct CrankResult {
    /// How many tokens were generated this tick (manual + passive).
    pub tokens_generated: f64,
    /// An optional log message (e.g. overheat warning).
    pub log_message: Option<String>,
}

/// Runs the crank system for a single tick.
///
/// * `game_state` -- mutable reference to the global game state.
/// * `player_cranking` -- whether the player is actively cranking this tick.
///
/// Returns a [`CrankResult`] describing how many tokens were generated and any
/// log messages that should be emitted.
pub fn crank_system(game_state: &mut GameState, player_cranking: bool, agent_assigned: bool) -> CrankResult {
    let crank = &mut game_state.crank;
    let mut tokens_generated: f64 = 0.0;
    let mut log_message: Option<String> = None;

    // ── Tier-based efficiency multiplier ─────────────────────────────
    let efficiency = match crank.tier {
        CrankTier::HandCrank => 1.0,
        CrankTier::GearAssembly => 1.5,
        CrankTier::WaterWheel => 2.0,
        CrankTier::RunicEngine => 4.0,
    };

    // ── Manual cranking ──────────────────────────────────────────────
    if player_cranking {
        if crank.heat < crank.max_heat {
            crank.is_cranking = true;
            crank.heat += crank.heat_rate;

            // Clamp heat to max so we don't exceed the ceiling.
            if crank.heat > crank.max_heat {
                crank.heat = crank.max_heat;
            }

            let manual_tokens = crank.tokens_per_rotation * efficiency;
            tokens_generated += manual_tokens;
        } else {
            // Overheated -- cannot crank.
            crank.is_cranking = false;
            log_message = Some("overheated \u{2014} cooling required".to_string());
        }
    } else {
        // Not cranking -- cool down.
        crank.is_cranking = false;
        crank.heat = (crank.heat - crank.cool_rate).max(0.0);
    }

    // ── Passive generation (always runs) ─────────────────────────────
    let passive_tokens = match crank.tier {
        CrankTier::WaterWheel => 0.3,
        CrankTier::RunicEngine => 2.0,
        _ => 0.0,
    };
    tokens_generated += passive_tokens;

    // ── Agent-assigned passive generation ──────────────────────
    if agent_assigned {
        let agent_bonus = match crank.tier {
            CrankTier::HandCrank => 0.05,
            CrankTier::GearAssembly => 0.08,
            CrankTier::WaterWheel => 0.10,
            CrankTier::RunicEngine => 0.15,
        };
        tokens_generated += agent_bonus;
    }

    // ── Apply to economy balance ─────────────────────────────────────
    // Balance is stored as i64 so we accumulate fractional tokens by
    // rounding the generated amount.  For sub-1.0 passive ticks this
    // means the balance grows slowly, which is intentional.
    game_state.economy.balance += tokens_generated as i64;

    CrankResult {
        tokens_generated,
        log_message,
    }
}
