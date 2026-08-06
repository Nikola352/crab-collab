use crate::protocol::types::{
    CellId, Execution, NotebookOperationContext, NotebookStateUpdateContext, TextOperationContext,
    TextStateUpdateContext, User, UserId,
};
use fractional_index::FractionalIndex;
use notebook::notebook::{Cell, Notebook};
use ot::text::TextOperation;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

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
        context: NotebookOperationContext,
        index: FractionalIndex,
        cell_id: CellId,
        cell_type: CellType,
        content: Option<String>,
    },
    CellDelete {
        context: NotebookOperationContext,
        cell_id: CellId,
    },
    CellMove {
        context: NotebookOperationContext,
        cell_id: CellId,
        to_index: FractionalIndex,
    },
    TextEdit {
        context: TextOperationContext,
        cell_id: CellId,
        operation: TextOperation,
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
        cell_metadata: HashMap<CellId, String>,
        version: u64,
        cell_versions: HashMap<CellId, u64>,
        pending_executions: Vec<Execution>,
        users: Vec<User>,
        user_id: UserId,
    },
    CellInsert {
        context: NotebookStateUpdateContext,
        index: FractionalIndex,
        cell: Cell,
    },
    CellDelete {
        context: NotebookStateUpdateContext,
        cell_id: CellId,
    },
    CellMove {
        context: NotebookStateUpdateContext,
        cell_id: CellId,
        to_index: FractionalIndex,
    },

    TextEdit {
        context: TextStateUpdateContext,
        cell_id: CellId,
        operation: TextOperation,
    },

    OperationFailed {
        context: NotebookStateUpdateContext,
        message: String,
    },

    TextOperationFailed {
        context: TextStateUpdateContext,
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
    ExecutionStarted {
        cell_id: CellId,
    },
    CellOutput {
        cell_id: CellId,
        execution_count: u32,
        text: String,
    },
    ExecutionFinished {
        cell_id: CellId,
        status: String,
        execution_count: u32,
    },
    CellIdle {
        cell_id: CellId,
    },
}
