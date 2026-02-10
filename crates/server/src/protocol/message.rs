use crate::protocol::types::{User, UserId};
use notebook::notebook::Notebook;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientMessage {
    Ping,
    Join { name: String },
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerMessage {
    Ping,
    Join {
        user_id: UserId,
        name: String,
    },
    Leave {
        user_id: UserId,
    },
    FullState {
        notebook: Notebook,
        users: Vec<User>,
        user_id: UserId,
    },
}
