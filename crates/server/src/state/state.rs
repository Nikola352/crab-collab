use crate::protocol::message::ServerMessage;
use crate::protocol::types::{User, UserId};
use crate::state::FocusState;
use execution_queue::execution_queue::ExecutionQueue;
use notebook::conflict_resolver::state::NotebookStateHolder;
use std::collections::HashMap;
use std::error::Error;
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock, mpsc::Sender};

#[derive(Clone)]
pub struct AppState {
    pub users: Arc<RwLock<HashMap<UserId, User>>>,
    pub focus: Arc<FocusState>,
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
            focus: Arc::new(FocusState::new()),
            notebook: Arc::new(state_holder),
            execution_queue: Arc::new(Mutex::new(jupyter_client)),
        }
    }

    pub async fn broadcast(
        &self,
        message: ServerMessage,
        except: Option<UserId>,
    ) -> Result<(), Box<dyn Error>> {
        let recipients = self
            .users
            .read()
            .await
            .iter()
            .filter_map(|(user_id, user)| {
                if except.is_some_and(|except_id| *user_id == except_id) {
                    None
                } else {
                    Some(user.tx_channel.clone())
                }
            })
            .collect::<Vec<_>>();

        for recipient in recipients {
            recipient.send(message.clone()).await?;
        }

        Ok(())
    }

    pub async fn user_sender(&self, user_id: UserId) -> Option<Sender<ServerMessage>> {
        self.users
            .read()
            .await
            .get(&user_id)
            .map(|user| user.tx_channel.clone())
    }

    pub async fn users_snapshot(&self) -> Vec<User> {
        let focus = self.focus.snapshot().await;

        self.users
            .read()
            .await
            .values()
            .cloned()
            .map(|mut user| {
                if let Some((cell_id, cursor_position)) = focus.get(&user.id) {
                    user.focused_cell = Some(*cell_id);
                    user.cursor_position = Some(*cursor_position);
                } else {
                    user.focused_cell = None;
                    user.cursor_position = None;
                }
                user
            })
            .collect()
    }
}
