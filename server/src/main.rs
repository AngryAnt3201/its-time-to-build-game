use its_time_to_build_server::ecs::components::*;
use its_time_to_build_server::ecs::weapon_stats;
use its_time_to_build_server::ecs::world::create_world;
use its_time_to_build_server::ecs::systems::{agent_tick, agent_wander, building, combat, crank, economy, placement, projectile, spawn};
use its_time_to_build_server::game::{agents, collision};
use its_time_to_build_server::ai::rogue_ai;
use its_time_to_build_server::network::server::GameServer;
use its_time_to_build_server::project;
use its_time_to_build_server::protocol::*;
use its_time_to_build_server::vibe::manager::VibeManager;
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
    // Load .env file if present (silently ignore if missing)
    let _ = dotenvy::dotenv();
    tracing_subscriber::fmt::init();

    // Start the HTTP API server (for native file dialog, etc.) in the background.
    tokio::spawn(its_time_to_build_server::network::http_api::start());

    // Start the server and wait for a client to connect.
    let mut server = GameServer::start().await;

    info!("Client connected — starting game loop at {} Hz", TICK_RATE_HZ);

    // ── Create ECS world and game state ──────────────────────────────
    let (mut world, mut game_state) = create_world();

    // ── Create project manager ───────────────────────────────────────
    // The manifest lives at the repo root. Resolve relative to the cargo
    // manifest dir at compile time, or fall back to ../buildings_manifest.json
    // when running from the server/ directory.
    let manifest_path = std::path::Path::new("buildings_manifest.json");
    let manifest_path = if manifest_path.exists() {
        manifest_path.to_path_buf()
    } else {
        std::path::PathBuf::from("../buildings_manifest.json")
    };
    let mut project_manager = project::ProjectManager::new(&manifest_path);
    let mut vibe_manager = VibeManager::new();

    let mut ticker = interval(TICK_DURATION);

    // ── Per-tick player action tracking ──────────────────────────────
    let mut player_attacking: bool;
    let mut player_cranking: bool = false;

    loop {
        ticker.tick().await;
        game_state.tick += 1;

        // Reset per-tick flags
        player_attacking = false;

        // Decrement attack cooldown each tick
        for (_id, combat) in world.query_mut::<hecs::With<&mut CombatPower, &Player>>() {
            if combat.cooldown_remaining > 0 {
                combat.cooldown_remaining -= 1;
            }
        }

        // Debug actions may generate log entries and remove entities
        let mut debug_log_entries: Vec<String> = Vec::new();
        let mut debug_entities_removed: Vec<EntityId> = Vec::new();

        // ── 1. Process player input (movement + actions) ─────────────
        while let Ok(input) = server.input_rx.try_recv() {
            // Skip all input processing while dead
            if game_state.player_dead {
                continue;
            }

            // Movement with collision
            let mx = input.movement.x;
            let my = input.movement.y;

            let len = (mx * mx + my * my).sqrt();
            if len > 0.0 {
                let norm_x = mx / len;
                let norm_y = my / len;

                for (_id, (pos, facing, armor)) in world.query_mut::<hecs::With<(&mut Position, &mut Facing, &Armor), &Player>>() {
                    let effective_speed = PLAYER_SPEED * (1.0 - armor.speed_penalty);
                    // Update facing direction
                    facing.dx = norm_x;
                    facing.dy = norm_y;

                    let dx = norm_x * effective_speed;
                    let dy = norm_y * effective_speed;

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
                    PlayerAction::EquipWeapon { weapon_id } => {
                        if let Some(wtype) = weapon_stats::weapon_from_id(weapon_id) {
                            let new_stats = weapon_stats::weapon_stats(wtype);
                            for (_id, combat) in world.query_mut::<hecs::With<&mut CombatPower, &Player>>() {
                                // Preserve current cooldown if mid-attack
                                let old_cooldown = combat.cooldown_remaining;
                                *combat = new_stats.clone();
                                combat.cooldown_remaining = old_cooldown;
                            }
                        }
                    }
                    PlayerAction::EquipArmor { armor_id } => {
                        if let Some(atype) = weapon_stats::armor_from_id(armor_id) {
                            let new_armor = weapon_stats::armor_stats(atype);
                            for (_id, armor) in world.query_mut::<hecs::With<&mut Armor, &Player>>() {
                                *armor = new_armor.clone();
                            }
                        }
                    }
                    PlayerAction::CrankStart => {
                        player_cranking = true;
                    }
                    PlayerAction::CrankStop => {
                        player_cranking = false;
                    }

                    // ── Home base actions ──────────────────────────────
                    PlayerAction::RecruitAgent { entity_id } => {
                        let target = hecs::Entity::from_bits(*entity_id);
                        if let Some(target) = target {
                            let cost = world.get::<&Recruitable>(target).ok().map(|r| r.cost);
                            if let Some(cost) = cost {
                                if game_state.economy.balance >= cost {
                                    game_state.economy.balance -= cost;
                                    let _ = world.remove_one::<Recruitable>(target);
                                    if let Ok(mut state) = world.get::<&mut AgentState>(target) {
                                        state.state = AgentStateKind::Idle;
                                    }
                                    if let Ok(name) = world.get::<&AgentName>(target) {
                                        debug_log_entries.push(format!("{} recruited!", name.name));
                                    }
                                }
                            }
                        }
                    }
                    PlayerAction::UpgradeWheel => {
                        let (next_tier, cost) = match game_state.crank.tier {
                            CrankTier::HandCrank => (Some(CrankTier::GearAssembly), 25),
                            CrankTier::GearAssembly => (Some(CrankTier::WaterWheel), 75),
                            CrankTier::WaterWheel => (Some(CrankTier::RunicEngine), 200),
                            CrankTier::RunicEngine => (None, 0),
                        };
                        if let Some(tier) = next_tier {
                            if game_state.economy.balance >= cost {
                                game_state.economy.balance -= cost;
                                game_state.crank.tier = tier;
                                let tier_name = crank_tier_to_string(&game_state.crank.tier);
                                debug_log_entries.push(format!("Wheel upgraded to {}", tier_name));
                            }
                        }
                    }
                    PlayerAction::AssignAgentToWheel { agent_id } => {
                        let entity = hecs::Entity::from_bits(*agent_id);
                        if let Some(entity) = entity {
                            if let Ok(state) = world.get::<&AgentState>(entity) {
                                if state.state != AgentStateKind::Dormant {
                                    game_state.crank.assigned_agent = Some(entity);
                                }
                            }
                        }
                    }
                    PlayerAction::UnassignAgentFromWheel => {
                        game_state.crank.assigned_agent = None;
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
                        // Convert agent_id (u64) to hecs::Entity
                        let Some(agent_entity) = hecs::Entity::from_bits(*agent_id) else {
                            debug_log_entries.push(format!(
                                "[project] invalid agent entity id {}",
                                agent_id
                            ));
                            continue;
                        };

                        // Validate agent exists and is Idle
                        let agent_ok = world
                            .get::<&AgentState>(agent_entity)
                            .map(|s| s.state == AgentStateKind::Idle)
                            .unwrap_or(false);

                        if !agent_ok {
                            debug_log_entries.push(format!(
                                "[project] agent {} not idle or not found",
                                agent_id
                            ));
                        } else if !project_manager.assign_agent(building_id, *agent_id) {
                            debug_log_entries.push(format!(
                                "[project] cannot assign agent {} to {} (full or duplicate)",
                                agent_id, building_id
                            ));
                        } else {
                            // Find the building entity position by matching building_id
                            let mut building_pos: Option<(f32, f32)> = None;
                            for (_e, (pos, bt)) in world.query::<hecs::With<(&Position, &BuildingType), &Building>>().iter() {
                                let type_name = format!("{:?}", bt.kind);
                                if let Some(bid) = project::ProjectManager::building_type_to_id(&type_name) {
                                    if bid == *building_id {
                                        building_pos = Some((pos.x, pos.y));
                                        break;
                                    }
                                }
                            }

                            // Set agent to Walking state (will walk to building, then transition)
                            let _ = agents::assign_task(&mut world, agent_entity, TaskAssignment::Build);

                            // Set walk target to building position
                            if let Some((bx, by)) = building_pos {
                                if let Ok(mut wander) = world.get::<&mut WanderState>(agent_entity) {
                                    wander.walk_target = Some((bx, by));
                                    wander.waypoint_x = bx;
                                    wander.waypoint_y = by;
                                    wander.pause_remaining = 0;
                                }
                            }

                            debug_log_entries.push(format!(
                                "[project] agent {} assigned to {}",
                                agent_id, building_id
                            ));
                        }
                    }
                    PlayerAction::UnassignAgentFromProject { agent_id, building_id } => {
                        project_manager.unassign_agent(building_id, *agent_id);
                        vibe_manager.kill_session(*agent_id);
                        vibe_manager.clear_failed(*agent_id);

                        // Reset agent to Idle state
                        if let Some(agent_entity) = hecs::Entity::from_bits(*agent_id) {
                            let _ = agents::assign_task(&mut world, agent_entity, TaskAssignment::Idle);

                            // Reset wander radius to default and clear walk target
                            if let Ok(mut wander) = world.get::<&mut WanderState>(agent_entity) {
                                wander.wander_radius = 120.0;
                                wander.walk_target = None;
                            }
                        }

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

                    // ── Vibe session actions ─────────────────────────
                    PlayerAction::SetMistralApiKey { key } => {
                        vibe_manager.set_api_key(key.clone());
                        debug_log_entries.push("[vibe] Mistral API key set".to_string());
                    }
                    PlayerAction::VibeInput { agent_id, data } => {
                        if let Err(e) = vibe_manager.send_input(*agent_id, data.as_bytes()) {
                            debug_log_entries.push(format!("[vibe] input error: {}", e));
                        }
                    }

                    PlayerAction::PlaceBuilding { building_type, x, y } => {
                        match placement::place_building(&mut world, *building_type, *x, *y, &mut game_state.economy) {
                            Ok(_entity) => {
                                debug_log_entries.push(format!("[build] placed {:?} at ({:.0}, {:.0})", building_type, x, y));
                            }
                            Err(e) => {
                                debug_log_entries.push(format!("[build] failed: {}", e));
                            }
                        }
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

        // Spawn projectile if player used crossbow
        if combat_result.player_attacked {
            let proj_data: Option<(f32, f32, f32, f32, i32, f32)> = {
                let mut data = None;
                for (_id, (pos, combat, facing)) in
                    world.query::<(&Position, &CombatPower, &Facing)>().with::<&Player>().iter()
                {
                    if combat.is_projectile {
                        data = Some((pos.x, pos.y, facing.dx, facing.dy, combat.base_damage, combat.range));
                    }
                    break;
                }
                data
            };
            if let Some((px, py, dx, dy, damage, range)) = proj_data {
                world.spawn((
                    Position { x: px, y: py },
                    Projectile { dx, dy, speed: 6.0, damage, range_remaining: range, owner_is_player: true },
                ));
            }
        }

        // ── 4b. Projectile system ──────────────────────────────────
        let projectile_result = projectile::projectile_system(&mut world);

        // ── Check for player death ──────────────────────────────────
        if !game_state.player_dead {
            for (_id, health) in world.query::<&Health>().with::<&Player>().iter() {
                if health.current <= 0 {
                    game_state.player_dead = true;
                    game_state.death_tick = Some(game_state.tick);
                }
            }
        }

        // ── Handle respawn after 200 ticks (10 seconds) ──────────────
        if game_state.player_dead {
            if let Some(death_tick) = game_state.death_tick {
                let elapsed = game_state.tick - death_tick;
                if elapsed >= 200 {
                    game_state.player_dead = false;
                    game_state.death_tick = None;
                    for (_id, (pos, health)) in world.query_mut::<hecs::With<(&mut Position, &mut Health), &Player>>() {
                        pos.x = 400.0;
                        pos.y = 300.0;
                        health.current = health.max;
                    }
                }
            }
        }

        // Collect entity IDs of killed rogues before they were despawned
        let mut entities_removed: Vec<EntityId> = combat_result
            .killed_rogues
            .iter()
            .map(|(entity, _kind)| entity.to_bits().into())
            .collect();

        // Merge projectile results
        for &(_rogue_entity, _kind) in &projectile_result.killed_rogues {
            entities_removed.push(_rogue_entity.to_bits().into());
        }
        entities_removed.extend(projectile_result.despawned.iter().map(|e| -> EntityId { e.to_bits().into() }));
        game_state.economy.balance += projectile_result.bounty_tokens;

        // Include debug-removed entities
        entities_removed.extend(debug_entities_removed);

        // ── 5. Building system ───────────────────────────────────────
        let building_result = building::building_system(&mut world);

        // ── 6. Economy system ────────────────────────────────────────
        // Called after all mutable systems are done so we can pass &World
        economy::economy_system(&world, &mut game_state);

        // ── 7. Crank system ──────────────────────────────────────────
        let agent_assigned = game_state.crank.assigned_agent
            .map(|e| world.contains(e))
            .unwrap_or(false);
        let crank_result = crank::crank_system(&mut game_state, player_cranking, agent_assigned);

        // ── 7b. Agent turn tick ─────────────────────────────────────
        let agent_tick_result = agent_tick::agent_tick_system(&mut world, &mut game_state.economy);

        // ── 7c. Idle agent wandering ─────────────────────────────────
        agent_wander::agent_wander_system(&mut world);

        // ── 7d. Vibe session management ─────────────────────────────
        // Spawn sessions for agents that just arrived at buildings (in Building state without a session)
        {
            let agents_needing_sessions: Vec<(u64, String, u32)> = world
                .query::<hecs::With<(&AgentState, &AgentVibeConfig), &Agent>>()
                .iter()
                .filter(|(_id, (state, _vibe))| state.state == AgentStateKind::Building)
                .filter(|(id, _)| {
                    let aid: u64 = id.to_bits().into();
                    !vibe_manager.has_session(aid) && !vibe_manager.has_failed(aid)
                })
                .map(|(id, (_state, vibe))| (id.to_bits().into(), vibe.model_id.clone(), vibe.max_turns))
                .collect();

            for (agent_id, model_id, max_turns) in agents_needing_sessions {
                if let Some(base) = project_manager.base_dir.as_ref() {
                    // Find which building this agent is assigned to
                    let mut found_building = None;
                    for (bid, agents) in &project_manager.agent_assignments {
                        if agents.contains(&agent_id) {
                            if let Some(building) = project_manager.manifest.get_building(bid) {
                                let work_dir = base.join(&building.directory_name);
                                if work_dir.exists() {
                                    found_building = Some((bid.clone(), work_dir));
                                }
                            }
                            break;
                        }
                    }

                    if let Some((bid, work_dir)) = found_building {
                        match vibe_manager.start_session(
                            agent_id,
                            bid.clone(),
                            work_dir,
                            model_id,
                            max_turns,
                        ) {
                            Ok(()) => {
                                debug_log_entries.push(format!(
                                    "[vibe] session started for agent {} on {}",
                                    agent_id, bid
                                ));
                                server.send_message(&ServerMessage::VibeSessionStarted { agent_id });
                            }
                            Err(e) => {
                                debug_log_entries.push(format!(
                                    "[vibe] failed to start session: {}", e
                                ));
                                vibe_manager.mark_failed(agent_id);
                            }
                        }
                    }
                }
            }
        }

        // Drain vibe output and send to client
        for (agent_id, data) in vibe_manager.drain_output() {
            server.send_message(&ServerMessage::VibeOutput { agent_id, data });
        }

        // Poll for finished sessions
        for (agent_id, _success) in vibe_manager.poll_exits() {
            server.send_message(&ServerMessage::VibeSessionEnded {
                agent_id,
                reason: "Session completed".to_string(),
            });
        }

        // Kill vibe sessions for agents in Erroring state
        {
            let erroring_with_sessions: Vec<u64> = world
                .query::<hecs::With<&AgentState, &Agent>>()
                .iter()
                .filter(|(_id, state)| state.state == AgentStateKind::Erroring)
                .filter(|(id, _)| vibe_manager.has_session(id.to_bits().into()))
                .map(|(id, _)| id.to_bits().into())
                .collect();

            for agent_id in erroring_with_sessions {
                vibe_manager.kill_session(agent_id);
                server.send_message(&ServerMessage::VibeSessionEnded {
                    agent_id,
                    reason: "Agent errored — context limit reached".to_string(),
                });
            }
        }

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
                    recruitable_cost: None,
                },
            });
        }

        // Fill in recruitable_cost for agents that have the Recruitable component
        for delta in &mut entities_changed {
            if let EntityData::Agent { recruitable_cost, .. } = &mut delta.data {
                let entity = hecs::Entity::from_bits(delta.id);
                if let Some(entity) = entity {
                    if let Ok(rec) = world.get::<&Recruitable>(entity) {
                        *recruitable_cost = Some(rec.cost);
                    }
                }
            }
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

        // Projectiles
        for (id, (pos, proj)) in world.query_mut::<(&Position, &Projectile)>() {
            entities_changed.push(EntityDelta {
                id: id.to_bits().into(),
                kind: EntityKind::Projectile,
                position: Vec2 { x: pos.x, y: pos.y },
                data: EntityData::Projectile { dx: proj.dx, dy: proj.dy },
            });
        }

        // ── Query player entity for snapshot ─────────────────────────
        let mut player_snapshot = PlayerSnapshot {
            position: Vec2::default(),
            health: 0.0,
            max_health: 0.0,
            tokens: game_state.economy.balance,
            torch_range: 0.0,
            facing: Vec2::default(),
            dead: false,
            death_timer: 0.0,
            attack_cooldown_pct: 0.0,
        };

        for (_id, (pos, health, torch, facing, combat)) in world
            .query_mut::<hecs::With<(&Position, &Health, &TorchRange, &Facing, &CombatPower), &Player>>()
        {
            player_snapshot.position = Vec2 { x: pos.x, y: pos.y };
            player_snapshot.health = health.current as f32;
            player_snapshot.max_health = health.max as f32;
            player_snapshot.torch_range = torch.radius;
            player_snapshot.facing = Vec2 { x: facing.dx, y: facing.dy };
            if combat.cooldown_ticks > 0 {
                player_snapshot.attack_cooldown_pct = combat.cooldown_remaining as f32 / combat.cooldown_ticks as f32;
            }
        }

        player_snapshot.dead = game_state.player_dead;
        player_snapshot.death_timer = if let Some(dt) = game_state.death_tick {
            let elapsed = game_state.tick - dt;
            let remaining = 200u64.saturating_sub(elapsed);
            remaining as f32 / 20.0
        } else {
            0.0
        };

        // ── Collect audio triggers ───────────────────────────────────
        let audio_triggers = {
            let mut triggers = combat_result.audio_events;
            triggers.extend(projectile_result.audio_events);
            triggers
        };

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
            wheel: WheelSnapshot {
                tier: crank_tier_to_string(&game_state.crank.tier),
                tokens_per_rotation: game_state.crank.tokens_per_rotation,
                agent_bonus_per_tick: match game_state.crank.tier {
                    CrankTier::HandCrank => 0.05,
                    CrankTier::GearAssembly => 0.08,
                    CrankTier::WaterWheel => 0.10,
                    CrankTier::RunicEngine => 0.15,
                },
                heat: game_state.crank.heat,
                max_heat: game_state.crank.max_heat,
                is_cranking: game_state.crank.is_cranking,
                assigned_agent_id: game_state.crank.assigned_agent.map(|e| e.to_bits().into()),
                upgrade_cost: match game_state.crank.tier {
                    CrankTier::HandCrank => Some(25),
                    CrankTier::GearAssembly => Some(75),
                    CrankTier::WaterWheel => Some(200),
                    CrankTier::RunicEngine => None,
                },
            },
            combat_events: {
                let mut events = combat_result.combat_events.clone();
                events.extend(projectile_result.combat_events);
                events
            },
            player_hit: combat_result.player_damaged,
            player_hit_damage: combat_result.player_hit_damage,
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
                agent_assignments: project_manager.agent_assignments.clone(),
            }),
        };

        // ── Send to client ───────────────────────────────────────────
        server.send_state(&update);
    }
}
