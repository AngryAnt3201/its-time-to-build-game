use futures_util::{SinkExt, StreamExt};
use tokio::net::TcpListener;
use tokio_tungstenite::accept_async;
use tracing::{info, error};

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let listener = TcpListener::bind("127.0.0.1:9001").await.expect("Failed to bind");
    info!("Game server listening on ws://127.0.0.1:9001");

    while let Ok((stream, addr)) = listener.accept().await {
        info!("New connection from: {}", addr);
        tokio::spawn(async move {
            let ws_stream = match accept_async(stream).await {
                Ok(ws) => ws,
                Err(e) => {
                    error!("WebSocket handshake failed: {}", e);
                    return;
                }
            };
            let (mut write, mut read) = ws_stream.split();
            while let Some(Ok(msg)) = read.next().await {
                if msg.is_text() || msg.is_binary() {
                    let _ = write.send(msg).await;
                }
            }
        });
    }
}
