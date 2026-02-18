use crate::protocol::message::ServerMessage;
use crate::protocol::types::{User, UserId};
use execution_queue::execution_queue::ExecutionQueue;
use notebook::conflict_resolver::state::NotebookStateHolder;
use std::collections::HashMap;
use std::error::Error;
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};

#[derive(Clone)]
pub struct AppState {
    pub users: Arc<RwLock<HashMap<UserId, User>>>,
    pub notebook: Arc<dyn NotebookStateHolder>,
    pub execution_queue: Arc<Mutex<ExecutionQueue>>,
}

impl AppState {
    pub fn new(
        state_holder: impl NotebookStateHolder + 'static,
        jupyter_client: ExecutionQueue,
    ) -> Self {
        Self {
            users: Arc::new(RwLock::new(HashMap::new())),
            notebook: Arc::new(state_holder),
            execution_queue: Arc::new(Mutex::new(jupyter_client)),
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
