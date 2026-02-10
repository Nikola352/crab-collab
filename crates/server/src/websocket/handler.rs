use crate::protocol::message::{ClientMessage, ServerMessage};
use crate::protocol::types::UserId;
use crate::state::AppState;
use axum::extract::ws::{Message, WebSocket};
use axum::extract::{State, WebSocketUpgrade};
use axum::response::IntoResponse;
use futures::{SinkExt, StreamExt};
use std::sync::Arc;
use tokio::sync::mpsc;
use uuid::Uuid;

pub async fn websocket_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(|socket| websocket_connection(socket, state))
}

async fn websocket_connection(stream: WebSocket, state: AppState) {
    let (mut sender, mut receiver) = stream.split();

    let (tx, mut rx) = mpsc::channel::<ServerMessage>(100);

    let user_id: UserId = Uuid::new_v4();

    {
        state.connections.write().await.insert(user_id, tx.clone());
    }

    let state = Arc::new(state);
    let recv_state = Arc::clone(&state);

    // Task to receive client messages and dispatch to handler
    let mut recv_handle = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            if let Message::Text(text) = msg {
                match serde_json::from_str::<ClientMessage>(&text) {
                    Ok(message) => {
                        if let Err(e) = handle_client_message(message, user_id, &recv_state).await {
                            tracing::error!("Failed to handle message: {}", e);
                        }
                    }
                    Err(e) => {
                        tracing::warn!("Failed to parse message: {}", e);
                    }
                }
            }
        }
    });

    // Task to send messages to client
    let mut send_handle = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if let Ok(json) = serde_json::to_string(&msg) {
                if let Err(_) = sender.send(Message::text(json)).await {
                    break;
                }
            }
        }
    });

    // Wait until the connection is closed (either task completes)
    tokio::select! {
        _ = &mut recv_handle => send_handle.abort(),
        _ = &mut send_handle => recv_handle.abort(),
    }

    {
        state.connections.write().await.remove(&user_id);
    }

    // TODO: notify other that user has left
}

async fn handle_client_message(
    message: ClientMessage,
    user_id: UserId,
    state: &AppState,
) -> Result<(), Box<dyn std::error::Error>> {
    match message {
        ClientMessage::Ping => {
            state.broadcast(ServerMessage::Ping).await;
        }
    }
    Ok(())
}
