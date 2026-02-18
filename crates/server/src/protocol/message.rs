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
        index: usize,
        cell_id: CellId,
        cell_type: CellType,
        content: Option<String>,
    },
    CellDelete {
        context: OperationContext,
        cell_id: CellId,
    },
    CellMove {
        context: OperationContext,
        cell_id: CellId,
        to_index: usize,
    },
    TextInsert {
        context: OperationContext,
        cell_id: CellId,
        start_position: usize,
        text: String,
    },
    TextDelete {
        context: OperationContext,
        cell_id: CellId,
        start_position: usize,
        end_position: usize,
    },
    ChangeFocus {
        cell_id: CellId,
        cursor_position: usize,
    },
    ExecuteCell {
        cell_id: CellId,
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
        index: usize,
        cell: Cell,
    },
    CellDelete {
        context: StateUpdateContext,
        cell_id: CellId,
    },
    CellMove {
        context: StateUpdateContext,
        cell_id: CellId,
        from_index: usize,
        to_index: usize,
    },
    TextInsert {
        context: StateUpdateContext,
        cell_id: CellId,
        start_position: usize,
        end_position: usize,
        text: String,
    },
    TextDelete {
        context: StateUpdateContext,
        cell_id: CellId,
        start_position: usize,
        end_position: usize,
    },

    OperationFailed {
        context: StateUpdateContext,
        message: String,
    },
    ChangeFocus {
        user_id: UserId,
        cell_id: CellId,
        cursor_position: usize,
    },
    ExecutionPending {
        cell_id: CellId,
        user_id: UserId,
    },
    CellOutput {
        cell_id: CellId,
        execution_count: u32,
        outputs: Vec<String>,
    },
}
