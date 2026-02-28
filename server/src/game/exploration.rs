use hecs::World;
use rand::rngs::StdRng;
use rand::{Rng, SeedableRng};

use crate::ecs::components::{Discovery, DroppedItem, GamePhase, Position, TokenEconomy};
use crate::game::tilemap::{CHUNK_SIZE, TILE_SIZE};
use crate::protocol::BuildingTypeKind;

// ── Discovery types ─────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub enum DiscoveryKind {
    BlueprintFragment { building_type: BuildingTypeKind },
    TokenCache { amount: i64 },
    RogueNest,
    McpRuin,
    AnomalyZone,
    NpcSurvivor { name: String },
    MumsCard { variant: CardVariant },
}

#[derive(Debug, Clone)]
pub enum CardVariant {
    Standard,
    RewardsPoints,
    Expired,
    DadsCard,
}

// ── Building pools per phase ────────────────────────────────────────

fn hut_buildings() -> &'static [BuildingTypeKind] {
    &[
        BuildingTypeKind::Pylon,
        BuildingTypeKind::ComputeFarm,
        BuildingTypeKind::TodoApp,
        BuildingTypeKind::Calculator,
        BuildingTypeKind::LandingPage,
    ]
}

fn outpost_buildings() -> &'static [BuildingTypeKind] {
    &[
        BuildingTypeKind::WeatherDashboard,
        BuildingTypeKind::ChatApp,
        BuildingTypeKind::KanbanBoard,
    ]
}

fn village_buildings() -> &'static [BuildingTypeKind] {
    &[
        BuildingTypeKind::EcommerceStore,
        BuildingTypeKind::AiImageGenerator,
        BuildingTypeKind::ApiDashboard,
    ]
}

fn network_buildings() -> &'static [BuildingTypeKind] {
    &[
        BuildingTypeKind::Blockchain,
    ]
}

fn buildings_for_phase(phase: &GamePhase) -> Vec<BuildingTypeKind> {
    match phase {
        GamePhase::Hut => hut_buildings().to_vec(),
        GamePhase::Outpost => {
            let mut v = hut_buildings().to_vec();
            v.extend_from_slice(outpost_buildings());
            v
        }
        GamePhase::Village => {
            let mut v = hut_buildings().to_vec();
            v.extend_from_slice(outpost_buildings());
            v.extend_from_slice(village_buildings());
            v
        }
        GamePhase::Network | GamePhase::City => {
            let mut v = hut_buildings().to_vec();
            v.extend_from_slice(outpost_buildings());
            v.extend_from_slice(village_buildings());
            v.extend_from_slice(network_buildings());
            v
        }
    }
}

// ── Seeded RNG helper ───────────────────────────────────────────────

fn chunk_rng(chunk_cx: i32, chunk_cy: i32, seed: u32) -> StdRng {
    // Combine chunk coordinates and world seed into a deterministic seed
    let a = chunk_cx as u64;
    let b = chunk_cy as u64;
    let s = seed as u64;
    let combined = a
        .wrapping_mul(73856093)
        .wrapping_add(b.wrapping_mul(19349663))
        .wrapping_add(s.wrapping_mul(83492791));
    StdRng::seed_from_u64(combined)
}

// ── NPC name bank ───────────────────────────────────────────────────

const NPC_NAMES: [&str; 12] = [
    "Grub", "Patches", "Solder", "Flicker", "Remnant", "Cache",
    "Stray", "Glitch", "Nomad", "Pilgrim", "Wisp", "Fragment",
];

// ── Scatter placement ───────────────────────────────────────────────

/// Scatter discoverable content within a chunk during generation.
///
/// Returns a list of `(world_x, world_y, DiscoveryKind)` tuples for each
/// discovery placed in this chunk. Uses a seeded RNG so results are
/// deterministic for the same chunk coordinates and world seed.
///
/// The starting chunk `(0, 0)` is always kept clear.
pub fn scatter_discoveries(
    chunk_cx: i32,
    chunk_cy: i32,
    seed: u32,
    game_phase: &GamePhase,
    mums_card_found: bool,
) -> Vec<(f32, f32, DiscoveryKind)> {
    // Starting chunk is always clear
    if chunk_cx == 0 && chunk_cy == 0 {
        return Vec::new();
    }

    let mut rng = chunk_rng(chunk_cx, chunk_cy, seed);
    let mut results: Vec<(f32, f32, DiscoveryKind)> = Vec::new();

    let chunk_world_x = chunk_cx as f32 * CHUNK_SIZE as f32 * TILE_SIZE;
    let chunk_world_y = chunk_cy as f32 * CHUNK_SIZE as f32 * TILE_SIZE;
    let chunk_extent = CHUNK_SIZE as f32 * TILE_SIZE;

    // Helper: generate a random position within this chunk
    let rand_pos = |rng: &mut StdRng| -> (f32, f32) {
        let x = chunk_world_x + rng.gen::<f32>() * chunk_extent;
        let y = chunk_world_y + rng.gen::<f32>() * chunk_extent;
        (x, y)
    };

    // Blueprint fragment: 15% chance
    if rng.gen::<f32>() < 0.15 {
        let pool = buildings_for_phase(game_phase);
        let idx = rng.gen_range(0..pool.len());
        let building_type = pool[idx];
        let (x, y) = rand_pos(&mut rng);
        results.push((x, y, DiscoveryKind::BlueprintFragment { building_type }));
    }

    // Token cache: 10% chance, 10-50 tokens
    if rng.gen::<f32>() < 0.10 {
        let amount = rng.gen_range(10..=50);
        let (x, y) = rand_pos(&mut rng);
        results.push((x, y, DiscoveryKind::TokenCache { amount }));
    }

    // Rogue nest: 5% chance (not in starting-adjacent chunks either — only skip 0,0 above)
    if rng.gen::<f32>() < 0.05 {
        let (x, y) = rand_pos(&mut rng);
        results.push((x, y, DiscoveryKind::RogueNest));
    }

    // MCP ruin: 3% chance (only Village phase or later)
    let is_village_plus = matches!(
        game_phase,
        GamePhase::Village | GamePhase::Network | GamePhase::City
    );
    if is_village_plus && rng.gen::<f32>() < 0.03 {
        let (x, y) = rand_pos(&mut rng);
        results.push((x, y, DiscoveryKind::McpRuin));
    }

    // Anomaly zone: 2% chance
    if rng.gen::<f32>() < 0.02 {
        let (x, y) = rand_pos(&mut rng);
        results.push((x, y, DiscoveryKind::AnomalyZone));
    }

    // NPC survivor: 2% chance
    if rng.gen::<f32>() < 0.02 {
        let name_idx = rng.gen_range(0..NPC_NAMES.len());
        let name = NPC_NAMES[name_idx].to_string();
        let (x, y) = rand_pos(&mut rng);
        results.push((x, y, DiscoveryKind::NpcSurvivor { name }));
    }

    // Mum's Credit Card: 0.5% chance (if not on cooldown)
    if !mums_card_found && rng.gen::<f32>() < 0.005 {
        let variant = pick_card_variant(&mut rng);
        let (x, y) = rand_pos(&mut rng);
        results.push((x, y, DiscoveryKind::MumsCard { variant }));
    }

    results
}

/// Pick a card variant with weighted probabilities:
/// Standard 60%, RewardsPoints 20%, Expired 15%, DadsCard 5%
fn pick_card_variant(rng: &mut StdRng) -> CardVariant {
    let roll: f32 = rng.gen();
    if roll < 0.60 {
        CardVariant::Standard
    } else if roll < 0.80 {
        CardVariant::RewardsPoints
    } else if roll < 0.95 {
        CardVariant::Expired
    } else {
        CardVariant::DadsCard
    }
}

// ── Interaction ─────────────────────────────────────────────────────

/// Process a player interacting with a discovery.
///
/// Applies the discovery's effect to the economy and returns a list of
/// log messages describing what happened.
pub fn interact_with_discovery(
    discovery: &DiscoveryKind,
    economy: &mut TokenEconomy,
) -> Vec<String> {
    match discovery {
        DiscoveryKind::BlueprintFragment { building_type } => {
            vec![format!("[exp] found blueprint fragment: {:?}", building_type)]
        }
        DiscoveryKind::TokenCache { amount } => {
            economy.balance += amount;
            vec![format!("[exp] found token cache: +{}", amount)]
        }
        DiscoveryKind::MumsCard { variant } => match variant {
            CardVariant::Standard => {
                economy.balance += 200;
                vec![
                    "[exp] found: mum's credit card".to_string(),
                    "...she's going to be so mad.".to_string(),
                ]
            }
            CardVariant::RewardsPoints => {
                economy.balance += 250;
                vec![
                    "[exp] found: mum's credit card (rewards points)".to_string(),
                    "bonus points accrued. she won't notice... right?".to_string(),
                ]
            }
            CardVariant::Expired => {
                economy.balance += 5;
                vec![
                    "[exp] found: mum's credit card (expired)".to_string(),
                    "expiry: 01/2026. worth almost nothing.".to_string(),
                ]
            }
            CardVariant::DadsCard => {
                economy.balance += 500;
                vec![
                    "[exp] found: dad's credit card".to_string(),
                    "he never checks this one.".to_string(),
                ]
            }
        },
        DiscoveryKind::RogueNest => {
            vec!["[exp] rogue nest detected nearby \u{2014} proceed with caution".to_string()]
        }
        DiscoveryKind::McpRuin => {
            vec!["[exp] ancient MCP ruin found. the architecture is... familiar.".to_string()]
        }
        DiscoveryKind::AnomalyZone => {
            vec!["[exp] anomaly zone detected. reality feels thin here.".to_string()]
        }
        DiscoveryKind::NpcSurvivor { name } => {
            vec![format!(
                "[exp] found a survivor: {}. they look like they've seen things.",
                name
            )]
        }
    }
}

// ── Entity spawning ─────────────────────────────────────────────────

/// Spawn a discovery as an entity in the ECS world.
///
/// The entity receives a `DroppedItem` marker, a `Position`, and a
/// `Discovery` component so the interaction system can identify it.
pub fn spawn_discovery(
    world: &mut World,
    x: f32,
    y: f32,
    kind: DiscoveryKind,
) -> hecs::Entity {
    world.spawn((
        DroppedItem,
        Position { x, y },
        Discovery {
            kind,
            interacted: false,
        },
    ))
}

// ── Tests ───────────────────────────────────────────────────────────

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
    fn starting_chunk_is_clear() {
        let results = scatter_discoveries(0, 0, 42, &GamePhase::Hut, false);
        assert!(results.is_empty());
    }

    #[test]
    fn scatter_is_deterministic() {
        let a = scatter_discoveries(3, 5, 42, &GamePhase::Village, false);
        let b = scatter_discoveries(3, 5, 42, &GamePhase::Village, false);
        assert_eq!(a.len(), b.len());
        for (da, db) in a.iter().zip(b.iter()) {
            assert_eq!(da.0, db.0);
            assert_eq!(da.1, db.1);
        }
    }

    #[test]
    fn mcp_ruin_only_in_village_plus() {
        // Run many seeds in Hut phase — should never produce McpRuin
        for seed in 0..500 {
            let results = scatter_discoveries(10, 10, seed, &GamePhase::Hut, false);
            for (_, _, kind) in &results {
                assert!(
                    !matches!(kind, DiscoveryKind::McpRuin),
                    "McpRuin appeared in Hut phase with seed {}",
                    seed
                );
            }
        }
    }

    #[test]
    fn token_cache_interaction_adds_balance() {
        let mut economy = make_economy(100);
        let msgs = interact_with_discovery(&DiscoveryKind::TokenCache { amount: 30 }, &mut economy);
        assert_eq!(economy.balance, 130);
        assert_eq!(msgs.len(), 1);
        assert!(msgs[0].contains("+30"));
    }

    #[test]
    fn mums_card_standard_adds_200() {
        let mut economy = make_economy(0);
        let msgs = interact_with_discovery(
            &DiscoveryKind::MumsCard {
                variant: CardVariant::Standard,
            },
            &mut economy,
        );
        assert_eq!(economy.balance, 200);
        assert_eq!(msgs.len(), 2);
        assert!(msgs[0].contains("mum's credit card"));
        assert!(msgs[1].contains("she's going to be so mad"));
    }

    #[test]
    fn mums_card_expired_adds_5() {
        let mut economy = make_economy(0);
        let msgs = interact_with_discovery(
            &DiscoveryKind::MumsCard {
                variant: CardVariant::Expired,
            },
            &mut economy,
        );
        assert_eq!(economy.balance, 5);
        assert!(msgs[0].contains("expired"));
    }

    #[test]
    fn dads_card_adds_500() {
        let mut economy = make_economy(0);
        let msgs = interact_with_discovery(
            &DiscoveryKind::MumsCard {
                variant: CardVariant::DadsCard,
            },
            &mut economy,
        );
        assert_eq!(economy.balance, 500);
        assert!(msgs[0].contains("dad's credit card"));
        assert!(msgs[1].contains("he never checks this one"));
    }

    #[test]
    fn rewards_points_adds_250() {
        let mut economy = make_economy(0);
        let msgs = interact_with_discovery(
            &DiscoveryKind::MumsCard {
                variant: CardVariant::RewardsPoints,
            },
            &mut economy,
        );
        assert_eq!(economy.balance, 250);
        assert!(msgs[0].contains("rewards points"));
    }

    #[test]
    fn spawn_discovery_creates_entity() {
        let mut world = World::new();
        let entity = spawn_discovery(
            &mut world,
            100.0,
            200.0,
            DiscoveryKind::TokenCache { amount: 42 },
        );

        assert!(world.get::<&DroppedItem>(entity).is_ok());
        assert!(world.get::<&Position>(entity).is_ok());
        assert!(world.get::<&Discovery>(entity).is_ok());

        let pos = world.get::<&Position>(entity).unwrap();
        assert_eq!(pos.x, 100.0);
        assert_eq!(pos.y, 200.0);

        let disc = world.get::<&Discovery>(entity).unwrap();
        assert!(!disc.interacted);
    }

    #[test]
    fn blueprint_interaction_logs_type() {
        let mut economy = make_economy(100);
        let msgs = interact_with_discovery(
            &DiscoveryKind::BlueprintFragment {
                building_type: BuildingTypeKind::TodoApp,
            },
            &mut economy,
        );
        assert_eq!(economy.balance, 100); // no token change
        assert!(msgs[0].contains("blueprint fragment"));
        assert!(msgs[0].contains("TodoApp"));
    }

    #[test]
    fn rogue_nest_interaction_warns() {
        let mut economy = make_economy(100);
        let msgs = interact_with_discovery(&DiscoveryKind::RogueNest, &mut economy);
        assert!(msgs[0].contains("rogue nest"));
        assert!(msgs[0].contains("caution"));
    }
}
