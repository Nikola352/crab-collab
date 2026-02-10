use crate::protocol::message::ServerMessage;
use crate::protocol::types::UserId;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::sync::mpsc::Sender;

#[derive(Clone)]
pub struct AppState {
    pub connections: Arc<RwLock<HashMap<UserId, Sender<ServerMessage>>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            connections: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn broadcast(&self, message: ServerMessage) {
        for (user_id, conn) in self.connections.read().await.iter() {
            if let Err(e) = conn.send(message.clone()).await {
                tracing::error!("Failed to send broadcast message to {user_id}: {e}");
            }
        }
    }
}
