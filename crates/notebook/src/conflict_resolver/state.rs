use crate::error::NotebookError;
use crate::notebook::{CellId, CellOutput, Notebook};
use crate::operation::NotebookOperation;
use crate::operation::result::{NotebookOperationResult, TextOperationResult};
use ot::text::TextOperation;
use std::collections::HashMap;
use uuid::Uuid;

/// Identifier for the origin (author) of edits, needed for correctly rebasing cursor positions
pub type OriginId = Uuid;

pub struct NotebookState {
    pub notebook: Notebook,
    pub cell_versions: HashMap<CellId, u64>,
    pub cell_metadata: HashMap<CellId, String>,
}

#[async_trait::async_trait]
pub trait NotebookStateHolder: Send + Sync {
    async fn apply_cell_operation(
        &self,
        operation: NotebookOperation,
    ) -> Result<NotebookOperationResult, NotebookError>;

    async fn get_notebook(&self) -> Notebook;

    async fn get_notebook_state(&self) -> NotebookState;

    async fn get_version(&self) -> u64;

    async fn apply_text_operation(
        &self,
        operation: TextOperation,
        cell_id: CellId,
        base_cell_version: u64,
        origin_id: OriginId,
    ) -> Result<TextOperationResult, NotebookError>;

    async fn rebase_cursor_position(
        &self,
        cell_id: CellId,
        base_cell_version: u64,
        position: usize,
        origin_id: OriginId,
    ) -> Result<usize, NotebookError>;

    async fn get_cell_version(&self, cell_id: CellId) -> u64;

    async fn get_cell_content(&self, cell_id: CellId) -> Option<String>;

    async fn append_cell_output(
        &self,
        cell_id: CellId,
        output: CellOutput,
    ) -> Result<(), NotebookError>;

    async fn clear_cell_output(&self, cell_id: CellId) -> Result<(), NotebookError>;

    async fn set_cell_execution_number(
        &self,
        cell_id: CellId,
        execution_number: u32,
    ) -> Result<(), NotebookError>;
}
