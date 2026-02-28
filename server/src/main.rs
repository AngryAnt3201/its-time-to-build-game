use its_time_to_build_server::ecs::components::*;
use its_time_to_build_server::ecs::world::create_world;
use its_time_to_build_server::ecs::systems::{agent_tick, agent_wander, building, combat, crank, economy, spawn};
use its_time_to_build_server::game::{agents, collision};
use its_time_to_build_server::ai::rogue_ai;
use its_time_to_build_server::network::server::GameServer;
use its_time_to_build_server::project;
use its_time_to_build_server::protocol::*;
use tokio::time::{interval, Duration};
use tracing::info;

fn parse_phase(s: &str) -> Option<GamePhase> {
    match s {
        "Hut" => Some(GamePhase::Hut),
        "Outpost" => Some(GamePhase::Outpost),
        "Village" => Some(GamePhase::Village),
        "Network" => Some(GamePhase::Network),
        "City" => Some(GamePhase::City),
        _ => None,
    }
}

fn parse_crank_tier(s: &str) -> Option<CrankTier> {
    match s {
        "HandCrank" => Some(CrankTier::HandCrank),
        "GearAssembly" => Some(CrankTier::GearAssembly),
        "WaterWheel" => Some(CrankTier::WaterWheel),
        "RunicEngine" => Some(CrankTier::RunicEngine),
        _ => None,
    }
}

fn phase_to_string(phase: &GamePhase) -> String {
    match phase {
        GamePhase::Hut => "Hut".to_string(),
        GamePhase::Outpost => "Outpost".to_string(),
        GamePhase::Village => "Village".to_string(),
        GamePhase::Network => "Network".to_string(),
        GamePhase::City => "City".to_string(),
    }
}

fn crank_tier_to_string(tier: &CrankTier) -> String {
    match tier {
        CrankTier::HandCrank => "HandCrank".to_string(),
        CrankTier::GearAssembly => "GearAssembly".to_string(),
        CrankTier::WaterWheel => "WaterWheel".to_string(),
        CrankTier::RunicEngine => "RunicEngine".to_string(),
    }
}

const TICK_RATE_HZ: u64 = 20;
const TICK_DURATION: Duration = Duration::from_millis(1000 / TICK_RATE_HZ);

const PLAYER_SPEED: f32 = 3.0; // pixels per tick

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    // Start the server and wait for a client to connect.
    let mut server = GameServer::start().await;

    info!("Client connected — starting game loop at {} Hz", TICK_RATE_HZ);

    // ── Create ECS world and game state ──────────────────────────────
    let (mut world, mut game_state) = create_world();

    // ── Create project manager ───────────────────────────────────────
    let mut project_manager = project::ProjectManager::new(
        std::path::Path::new("buildings_manifest.json"),
    );

    let mut ticker = interval(TICK_DURATION);

    // ── Per-tick player action tracking ──────────────────────────────
    let mut player_attacking: bool;
    let mut player_cranking: bool = false;

    loop {
        ticker.tick().await;
        game_state.tick += 1;

        // Reset per-tick flags
        player_attacking = false;

        // Debug actions may generate log entries and remove entities
        let mut debug_log_entries: Vec<String> = Vec::new();
        let mut debug_entities_removed: Vec<EntityId> = Vec::new();

        // ── 1. Process player input (movement + actions) ─────────────
        while let Ok(input) = server.input_rx.try_recv() {
            // Movement with collision
            let mx = input.movement.x;
            let my = input.movement.y;

            let len = (mx * mx + my * my).sqrt();
            if len > 0.0 {
                let dx = (mx / len) * PLAYER_SPEED;
                let dy = (my / len) * PLAYER_SPEED;
                for (_id, pos) in world.query_mut::<hecs::With<&mut Position, &Player>>() {
                    // Check X axis independently (wall-sliding)
                    let future_tx = collision::pixel_to_tile(pos.x + dx);
                    let cur_ty = collision::pixel_to_tile(pos.y);
                    if collision::is_walkable(future_tx, cur_ty) {
                        pos.x += dx;
                    }

                    // Check Y axis independently (wall-sliding)
                    let cur_tx = collision::pixel_to_tile(pos.x);
                    let future_ty = collision::pixel_to_tile(pos.y + dy);
                    if collision::is_walkable(cur_tx, future_ty) {
                        pos.y += dy;
                    }
                }
            }

            // Actions
            if let Some(action) = &input.action {
                match action {
                    PlayerAction::Attack => {
                        player_attacking = true;
                    }
                    PlayerAction::CrankStart => {
                        player_cranking = true;
                    }
                    PlayerAction::CrankStop => {
                        player_cranking = false;
                    }

                    // ── Debug actions ──────────────────────────────────
                    PlayerAction::DebugSetTokens { amount } => {
                        game_state.economy.balance = *amount;
                        debug_log_entries.push(format!("[debug] tokens set to {}", amount));
                    }
                    PlayerAction::DebugAddTokens { amount } => {
                        game_state.economy.balance += amount;
                        debug_log_entries.push(format!("[debug] added {} tokens", amount));
                    }
                    PlayerAction::DebugToggleSpawning => {
                        game_state.spawning_enabled = !game_state.spawning_enabled;
                        let status = if game_state.spawning_enabled { "ON" } else { "OFF" };
                        debug_log_entries.push(format!("[debug] spawning {}", status));
                    }
                    PlayerAction::DebugClearRogues => {
                        let rogue_entities: Vec<hecs::Entity> = world
                            .query::<&Rogue>()
                            .iter()
                            .map(|(entity, _)| entity)
                            .collect();
                        let count = rogue_entities.len();
                        for entity in rogue_entities {
                            debug_entities_removed.push(entity.to_bits().into());
                            let _ = world.despawn(entity);
                        }
                        debug_log_entries.push(format!("[debug] cleared {} rogues", count));
                    }
                    PlayerAction::DebugSetPhase { phase } => {
                        if let Some(p) = parse_phase(phase) {
                            game_state.phase = p;
                            debug_log_entries.push(format!("[debug] phase set to {}", phase));
                        }
                    }
                    PlayerAction::DebugSetCrankTier { tier } => {
                        if let Some(t) = parse_crank_tier(tier) {
                            game_state.crank.tier = t;
                            debug_log_entries.push(format!("[debug] crank tier set to {}", tier));
                        }
                    }
                    PlayerAction::DebugToggleGodMode => {
                        game_state.god_mode = !game_state.god_mode;
                        let status = if game_state.god_mode { "ON" } else { "OFF" };
                        debug_log_entries.push(format!("[debug] god mode {}", status));
                    }
                    PlayerAction::DebugSpawnRogue { rogue_type } => {
                        // Spawn near the player with a small offset
                        let mut px = 400.0_f32;
                        let mut py = 300.0_f32;
                        for (_id, pos) in world.query_mut::<hecs::With<&Position, &Player>>() {
                            px = pos.x;
                            py = pos.y;
                        }
                        spawn::spawn_rogue(&mut world, px + 50.0, py + 50.0, *rogue_type);
                        debug_log_entries.push(format!("[debug] spawned {:?}", rogue_type));
                    }
                    PlayerAction::DebugHealPlayer => {
                        for (_id, health) in world.query_mut::<hecs::With<&mut Health, &Player>>() {
                            health.current = health.max;
                        }
                        debug_log_entries.push("[debug] player healed to max".to_string());
                    }
                    PlayerAction::DebugSpawnAgent { tier } => {
                        // Spawn near the player with a small offset
                        let mut px = 400.0_f32;
                        let mut py = 300.0_f32;
                        for (_id, pos) in world.query_mut::<hecs::With<&Position, &Player>>() {
                            px = pos.x;
                            py = pos.y;
                        }
                        match agents::recruit_agent(&mut world, *tier, px + 30.0, py + 30.0, &mut game_state.economy) {
                            Ok(_) => {
                                debug_log_entries.push(format!("[debug] spawned {:?} agent", tier));
                            }
                            Err(e) => {
                                debug_log_entries.push(format!("[debug] agent spawn failed: {}", e));
                            }
                        }
                    }
                    PlayerAction::DebugClearAgents => {
                        let agent_entities: Vec<hecs::Entity> = world
                            .query::<&Agent>()
                            .iter()
                            .map(|(entity, _)| entity)
                            .collect();
                        let count = agent_entities.len();
                        for entity in agent_entities {
                            debug_entities_removed.push(entity.to_bits().into());
                            let _ = world.despawn(entity);
                        }
                        debug_log_entries.push(format!("[debug] cleared {} agents", count));
                    }

                    // ── Project management actions ──────────────────────
                    PlayerAction::SetProjectDirectory { path } => {
                        match project_manager.set_base_dir(path.clone()) {
                            Ok(()) => {
                                debug_log_entries.push(format!("[project] base dir set to {}", path));
                            }
                            Err(e) => {
                                debug_log_entries.push(format!("[project] set dir failed: {}", e));
                            }
                        }
                    }
                    PlayerAction::InitializeProjects => {
                        match project_manager.initialize_projects().await {
                            Ok(msgs) => {
                                for msg in &msgs {
                                    debug_log_entries.push(format!("[project] {}", msg));
                                }
                                debug_log_entries.push("[project] initialization complete".to_string());
                            }
                            Err(e) => {
                                debug_log_entries.push(format!("[project] init failed: {}", e));
                            }
                        }
                    }
                    PlayerAction::ResetProjects => {
                        match project_manager.reset_projects().await {
                            Ok(msgs) => {
                                for msg in &msgs {
                                    debug_log_entries.push(format!("[project] {}", msg));
                                }
                                debug_log_entries.push("[project] reset complete".to_string());
                            }
                            Err(e) => {
                                debug_log_entries.push(format!("[project] reset failed: {}", e));
                            }
                        }
                    }
                    PlayerAction::StartDevServer { building_id } => {
                        match project_manager.start_dev_server(building_id).await {
                            Ok(port) => {
                                debug_log_entries.push(format!(
                                    "[project] dev server for {} started on port {}",
                                    building_id, port
                                ));
                            }
                            Err(e) => {
                                debug_log_entries.push(format!(
                                    "[project] start dev server {} failed: {}",
                                    building_id, e
                                ));
                            }
                        }
                    }
                    PlayerAction::StopDevServer { building_id } => {
                        match project_manager.stop_dev_server(building_id).await {
                            Ok(()) => {
                                debug_log_entries.push(format!(
                                    "[project] dev server for {} stopped",
                                    building_id
                                ));
                            }
                            Err(e) => {
                                debug_log_entries.push(format!(
                                    "[project] stop dev server {} failed: {}",
                                    building_id, e
                                ));
                            }
                        }
                    }
                    PlayerAction::AssignAgentToProject { agent_id, building_id } => {
                        project_manager.assign_agent(building_id, *agent_id);
                        debug_log_entries.push(format!(
                            "[project] agent {} assigned to {}",
                            agent_id, building_id
                        ));
                    }
                    PlayerAction::UnassignAgentFromProject { agent_id, building_id } => {
                        project_manager.unassign_agent(building_id, *agent_id);
                        debug_log_entries.push(format!(
                            "[project] agent {} unassigned from {}",
                            agent_id, building_id
                        ));
                    }
                    PlayerAction::DebugUnlockAllBuildings => {
                        project_manager.unlock_all();
                        debug_log_entries.push("[debug] all buildings unlocked".to_string());
                    }
                    PlayerAction::DebugLockAllBuildings => {
                        project_manager.lock_all_non_default();
                        debug_log_entries.push("[debug] non-default buildings locked".to_string());
                    }
                    PlayerAction::UnlockBuilding { building_id } => {
                        project_manager.unlock_building(building_id);
                        debug_log_entries.push(format!("[project] building {} unlocked", building_id));
                    }

                    _ => {}
                }
            }
        }

        // ── Read player position for spawn system ────────────────────
        let mut player_x: f32 = 0.0;
        let mut player_y: f32 = 0.0;

        for (_id, pos) in world.query_mut::<hecs::With<&Position, &Player>>() {
            player_x = pos.x;
            player_y = pos.y;
        }

        // ── 2. Rogue AI behavior ─────────────────────────────────────
        rogue_ai::rogue_ai_system(&mut world);

        // ── 3. Spawn system ──────────────────────────────────────────
        let spawn_result = spawn::spawn_system(&mut world, &mut game_state, player_x, player_y);

        // ── 4. Combat system ─────────────────────────────────────────
        let combat_result = combat::combat_system(&mut world, &mut game_state, player_attacking);

        // Collect entity IDs of killed rogues before they were despawned
        let mut entities_removed: Vec<EntityId> = combat_result
            .killed_rogues
            .iter()
            .map(|(entity, _kind)| entity.to_bits().into())
            .collect();

        // Include debug-removed entities
        entities_removed.extend(debug_entities_removed);

        // ── 5. Building system ───────────────────────────────────────
        let building_result = building::building_system(&mut world);

        // ── 6. Economy system ────────────────────────────────────────
        // Called after all mutable systems are done so we can pass &World
        economy::economy_system(&world, &mut game_state);

        // ── 7. Crank system ──────────────────────────────────────────
        let crank_result = crank::crank_system(&mut game_state, player_cranking);

        // ── 7b. Agent turn tick ─────────────────────────────────────
        let agent_tick_result = agent_tick::agent_tick_system(&mut world, &mut game_state.economy);

        // ── 7c. Idle agent wandering ─────────────────────────────────
        agent_wander::agent_wander_system(&mut world);

        // ── 8. Collect log entries from system results ───────────────
        let mut log_entries: Vec<LogEntry> = Vec::new();

        for text in &combat_result.log_entries {
            log_entries.push(LogEntry {
                tick: game_state.tick,
                text: text.clone(),
                category: LogCategory::Combat,
            });
        }

        for text in &building_result.log_entries {
            log_entries.push(LogEntry {
                tick: game_state.tick,
                text: text.clone(),
                category: LogCategory::Building,
            });
        }

        if let Some(text) = &crank_result.log_message {
            log_entries.push(LogEntry {
                tick: game_state.tick,
                text: text.clone(),
                category: LogCategory::Economy,
            });
        }

        for text in &spawn_result.log_entries {
            log_entries.push(LogEntry {
                tick: game_state.tick,
                text: text.clone(),
                category: LogCategory::System,
            });
        }

        for text in &agent_tick_result.log_entries {
            log_entries.push(LogEntry {
                tick: game_state.tick,
                text: text.clone(),
                category: LogCategory::Agent,
            });
        }

        for text in &debug_log_entries {
            log_entries.push(LogEntry {
                tick: game_state.tick,
                text: text.clone(),
                category: LogCategory::System,
            });
        }

        // ── 9. Build entities_changed from ALL entity types ──────────
        let mut entities_changed: Vec<EntityDelta> = Vec::new();

        // Agents
        for (id, (pos, name, state, tier, health, morale, vibe, xp_comp)) in world.query_mut::<hecs::With<
            (
                &Position,
                &AgentName,
                &AgentState,
                &AgentTier,
                &Health,
                &AgentMorale,
                &AgentVibeConfig,
                &AgentXP,
            ),
            &Agent,
        >>() {
            let health_pct = if health.max > 0 {
                health.current as f32 / health.max as f32
            } else {
                0.0
            };

            entities_changed.push(EntityDelta {
                id: id.to_bits().into(),
                kind: EntityKind::Agent,
                position: Vec2 { x: pos.x, y: pos.y },
                data: EntityData::Agent {
                    name: name.name.clone(),
                    state: state.state,
                    tier: tier.tier,
                    health_pct,
                    morale_pct: morale.value,
                    stars: vibe.stars,
                    turns_used: vibe.turns_used,
                    max_turns: vibe.max_turns,
                    model_lore_name: vibe.model_lore_name.clone(),
                    xp: xp_comp.xp,
                    level: xp_comp.level,
                },
            });
        }

        // Buildings
        for (id, (pos, building_type, progress, health)) in world
            .query_mut::<hecs::With<(&Position, &BuildingType, &ConstructionProgress, &Health), &Building>>()
        {
            entities_changed.push(EntityDelta {
                id: id.to_bits().into(),
                kind: EntityKind::Building,
                position: Vec2 { x: pos.x, y: pos.y },
                data: EntityData::Building {
                    building_type: building_type.kind,
                    construction_pct: progress.current / progress.total,
                    health_pct: health.current as f32 / health.max.max(1) as f32,
                },
            });
        }

        // Rogues
        for (id, (pos, rogue_type, health)) in
            world.query_mut::<hecs::With<(&Position, &RogueType, &Health), &Rogue>>()
        {
            entities_changed.push(EntityDelta {
                id: id.to_bits().into(),
                kind: EntityKind::Rogue,
                position: Vec2 { x: pos.x, y: pos.y },
                data: EntityData::Rogue {
                    rogue_type: rogue_type.kind,
                    health_pct: health.current as f32 / health.max.max(1) as f32,
                },
            });
        }

        // ── Query player entity for snapshot ─────────────────────────
        let mut player_snapshot = PlayerSnapshot {
            position: Vec2::default(),
            health: 0.0,
            max_health: 0.0,
            tokens: game_state.economy.balance,
            torch_range: 0.0,
        };

        for (_id, (pos, health, torch)) in world
            .query_mut::<hecs::With<(&Position, &Health, &TorchRange), &Player>>()
        {
            player_snapshot.position = Vec2 { x: pos.x, y: pos.y };
            player_snapshot.health = health.current as f32;
            player_snapshot.max_health = health.max as f32;
            player_snapshot.torch_range = torch.radius;
        }

        // ── Collect audio triggers ───────────────────────────────────
        let audio_triggers = combat_result.audio_events;

        // ── 10. Build GameStateUpdate and send ───────────────────────
        let update = GameStateUpdate {
            tick: game_state.tick,
            player: player_snapshot,
            entities_changed,
            entities_removed,
            fog_updates: vec![],
            economy: EconomySnapshot {
                balance: game_state.economy.balance,
                income_per_sec: game_state.economy.income_per_tick * TICK_RATE_HZ as f64,
                expenditure_per_sec: game_state.economy.expenditure_per_tick * TICK_RATE_HZ as f64,
            },
            log_entries,
            audio_triggers,
            debug: DebugSnapshot {
                spawning_enabled: game_state.spawning_enabled,
                god_mode: game_state.god_mode,
                phase: phase_to_string(&game_state.phase),
                crank_tier: crank_tier_to_string(&game_state.crank.tier),
            },
            project_manager: Some(ProjectManagerState {
                base_dir: project_manager.base_dir.as_ref().map(|p| p.to_string_lossy().to_string()),
                initialized: project_manager.initialized,
                unlocked_buildings: project_manager.get_unlocked_buildings(),
                building_statuses: project_manager.statuses.iter().map(|(k, v)| {
                    let status_str = match v {
                        project::ProjectStatus::NotInitialized => "NotInitialized".to_string(),
                        project::ProjectStatus::Ready => "Ready".to_string(),
                        project::ProjectStatus::Running(port) => format!("Running:{port}"),
                        project::ProjectStatus::Error(msg) => format!("Error:{msg}"),
                    };
                    (k.clone(), status_str)
                }).collect(),
            }),
        };

        // ── Send to client ───────────────────────────────────────────
        server.send_state(&update);
    }
}
