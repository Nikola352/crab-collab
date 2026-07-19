use crate::error::NotebookError;
use crate::notebook::{CellId, CellOutput, Notebook};
use crate::operation::result::{NotebookOperationResult, TextOperationResult};
use crate::operation::{NotebookOperation};
use std::collections::HashMap;
use ot::text::TextOperation;

#[async_trait::async_trait]
pub trait NotebookStateHolder: Send + Sync {
    async fn apply_cell_operation(
        &self,
        operation: NotebookOperation,
        base_version: u64,
    ) -> Result<NotebookOperationResult, NotebookError>;

    async fn get_notebook(&self) -> Notebook;

    async fn get_version(&self) -> u64;

    async fn apply_text_operation(
        &self,
        operation: TextOperation,
        cell_id: CellId,
        base_cell_version: u64,
    ) -> Result<TextOperationResult, NotebookError>;

    async fn get_cell_version(&self, cell_id: CellId) -> u64;

    async fn get_cell_versions(&self) -> HashMap<CellId, u64>;

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
