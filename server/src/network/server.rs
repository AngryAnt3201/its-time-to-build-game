use futures_util::{SinkExt, StreamExt};
use tokio::net::TcpListener;
use tokio::sync::mpsc;
use tokio_tungstenite::{accept_async, tungstenite::Message};
use tracing::{error, info, warn};

use crate::protocol::{GameStateUpdate, PlayerInput, ServerMessage};

/// Channel for sending serialized state frames to the connected client.
type StateTx = mpsc::UnboundedSender<Vec<u8>>;

/// The game network server.
///
/// Listens for a single client WebSocket connection and provides methods
/// to send state updates and receive player input.
pub struct GameServer {
    /// Sender half – the game loop calls `send_state` which serializes and
    /// forwards the bytes through this channel to the write task.
    client_tx: Option<StateTx>,

    /// Receiver half – the game loop drains this to get decoded `PlayerInput`.
    pub input_rx: mpsc::UnboundedReceiver<PlayerInput>,

    /// Sender half kept around so the read-task can push decoded inputs.
    #[allow(dead_code)]
    input_tx: mpsc::UnboundedSender<PlayerInput>,
}

impl GameServer {
    /// Bind the TCP listener and wait for exactly one WebSocket client to
    /// connect. Once connected, two background tasks are spawned:
    ///
    /// 1. **Write task** – forwards serialized binary frames from `client_tx`
    ///    to the WebSocket sink.
    /// 2. **Read task** – reads binary frames from the WebSocket stream,
    ///    decodes them as `PlayerInput`, and pushes them into `input_tx`.
    pub async fn start() -> Self {
        let (input_tx, input_rx) = mpsc::unbounded_channel::<PlayerInput>();

        let listener = TcpListener::bind("127.0.0.1:9001")
            .await
            .expect("Failed to bind to 127.0.0.1:9001");

        info!("Game server listening on ws://127.0.0.1:9001");
        info!("Waiting for a client connection...");

        // Accept exactly one connection.
        let (stream, addr) = listener
            .accept()
            .await
            .expect("Failed to accept connection");
        info!("Client connected from {}", addr);

        let ws_stream = accept_async(stream)
            .await
            .expect("WebSocket handshake failed");

        let (mut ws_write, mut ws_read) = ws_stream.split();

        // Channel: game loop -> write task -> WebSocket
        let (client_tx, mut client_rx) = mpsc::unbounded_channel::<Vec<u8>>();

        // ── Write task ──────────────────────────────────────────────
        tokio::spawn(async move {
            while let Some(bytes) = client_rx.recv().await {
                if let Err(e) = ws_write.send(Message::Binary(bytes.into())).await {
                    error!("Failed to send WebSocket message: {}", e);
                    break;
                }
            }
            info!("Write task shutting down");
        });

        // ── Read task ───────────────────────────────────────────────
        let input_tx_clone = input_tx.clone();
        tokio::spawn(async move {
            while let Some(result) = ws_read.next().await {
                match result {
                    Ok(msg) => {
                        if msg.is_binary() {
                            let data = msg.into_data();
                            match rmp_serde::from_slice::<PlayerInput>(&data) {
                                Ok(input) => {
                                    if let Err(e) = input_tx_clone.send(input) {
                                        warn!("Input channel closed: {}", e);
                                        break;
                                    }
                                }
                                Err(e) => {
                                    warn!("Failed to decode PlayerInput: {}", e);
                                }
                            }
                        }
                    }
                    Err(e) => {
                        error!("WebSocket read error: {}", e);
                        break;
                    }
                }
            }
            info!("Read task shutting down");
        });

        Self {
            client_tx: Some(client_tx),
            input_rx,
            input_tx,
        }
    }

    /// Serialize `GameStateUpdate` via msgpack wrapped in `ServerMessage::GameState`
    /// and send to the connected client. If no client is connected (or the
    /// channel has been dropped), this is a no-op.
    pub fn send_state(&mut self, update: &GameStateUpdate) {
        let msg = ServerMessage::GameState(update.clone());
        self.send_message(&msg);
    }

    /// Send any ServerMessage to the client.
    pub fn send_message(&mut self, msg: &ServerMessage) {
        if let Some(tx) = &self.client_tx {
            match rmp_serde::to_vec_named(msg) {
                Ok(bytes) => {
                    if tx.send(bytes).is_err() {
                        warn!("Client disconnected — stopping sends");
                        self.client_tx = None;
                    }
                }
                Err(e) => {
                    error!("Failed to serialize ServerMessage: {}", e);
                }
            }
        }
    }
}
