use its_time_to_build_server::network::server::GameServer;
use its_time_to_build_server::protocol::{
    EconomySnapshot, GameStateUpdate, PlayerSnapshot, Vec2,
};
use tokio::time::{interval, Duration};
use tracing::info;

const TICK_RATE_HZ: u64 = 20;
const TICK_DURATION: Duration = Duration::from_millis(1000 / TICK_RATE_HZ);

const PLAYER_SPEED: f32 = 3.0; // pixels per tick

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    // Start the server and wait for a client to connect.
    let mut server = GameServer::start().await;

    info!("Client connected — starting game loop at {} Hz", TICK_RATE_HZ);

    // ── Initial player state ────────────────────────────────────────
    let mut player_pos = Vec2 { x: 400.0, y: 300.0 };
    let player_health: f32 = 100.0;
    let player_max_health: f32 = 100.0;
    let player_tokens: i64 = 50;
    let player_torch_range: f32 = 120.0;

    let mut tick: u64 = 0;
    let mut ticker = interval(TICK_DURATION);

    loop {
        ticker.tick().await;
        tick += 1;

        // ── Read all pending inputs ─────────────────────────────────
        while let Ok(input) = server.input_rx.try_recv() {
            // Apply movement (simple, no collision)
            let mx = input.movement.x;
            let my = input.movement.y;

            // Normalise diagonal movement
            let len = (mx * mx + my * my).sqrt();
            if len > 0.0 {
                player_pos.x += (mx / len) * PLAYER_SPEED;
                player_pos.y += (my / len) * PLAYER_SPEED;
            }
        }

        // ── Build state update ──────────────────────────────────────
        let update = GameStateUpdate {
            tick,
            player: PlayerSnapshot {
                position: player_pos,
                health: player_health,
                max_health: player_max_health,
                tokens: player_tokens,
                torch_range: player_torch_range,
            },
            entities_changed: vec![],
            entities_removed: vec![],
            fog_updates: vec![],
            economy: EconomySnapshot {
                balance: player_tokens,
                income_per_sec: 0.0,
                expenditure_per_sec: 0.0,
            },
            log_entries: vec![],
            audio_triggers: vec![],
        };

        // ── Send to client ──────────────────────────────────────────
        server.send_state(&update);
    }
}
