use crate::protocol::message::ServerMessage;
use crate::protocol::types::{User, UserId};
use notebook::notebook::Notebook;
use std::collections::HashMap;
use std::error::Error;
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Clone)]
pub struct AppState {
    pub users: Arc<RwLock<HashMap<UserId, User>>>,
    pub notebook: Arc<Notebook>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            users: Arc::new(RwLock::new(HashMap::new())),
            notebook: Arc::new(Notebook::new()),
        }
    }

    pub async fn broadcast(
        &self,
        message: ServerMessage,
        except: Option<UserId>,
    ) -> Result<(), Box<dyn Error>> {
        for (user_id, user) in self.users.read().await.iter() {
            if let Some(except_id) = except
                && *user_id == except_id
            {
                continue;
            }
            user.tx_channel.send(message.clone()).await?;
        }
        Ok(())
    }
}
