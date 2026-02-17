use crate::protocol::types::{CellId, OperationContext, StateUpdateContext, User, UserId};
use notebook::notebook::{Cell, Notebook};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CellType {
    Markdown,
    Code,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientMessage {
    Join {
        name: String,
    },
    CellInsert {
        context: OperationContext,
        position: usize,
        cell_id: CellId,
        cell_type: CellType,
        content: Option<String>,
    },
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerMessage {
    Join {
        user_id: UserId,
        name: String,
    },
    Leave {
        user_id: UserId,
    },
    FullState {
        notebook: Notebook,
        version: u64,
        users: Vec<User>,
        user_id: UserId,
    },
    CellInsert {
        context: StateUpdateContext,
        position: usize,
        cell: Cell,
    },

    OperationFailed {
        context: StateUpdateContext,
        message: String,
    },
}
