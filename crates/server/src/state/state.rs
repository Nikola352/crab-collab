use crate::protocol::message::ServerMessage;
use crate::protocol::types::{User, UserId};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Clone)]
pub struct AppState {
    pub users: Arc<RwLock<HashMap<UserId, User>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            users: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn broadcast(&self, message: ServerMessage, except: Option<UserId>) {
        for (user_id, user) in self.users.read().await.iter() {
            if let Some(except_id) = except
                && *user_id == except_id
            {
                continue;
            }
            if let Err(e) = user.tx_channel.send(message.clone()).await {
                tracing::error!("Failed to send broadcast message to {user_id}: {e}");
            }
        }
    }
}
