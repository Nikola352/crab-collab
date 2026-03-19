use crate::error::NotebookError;
use crate::notebook::{CellId, CellOutput, Notebook};
use crate::operation::Operation;
use crate::operation::result::OperationResult;

#[async_trait::async_trait]
pub trait NotebookStateHolder: Send + Sync {
    async fn apply_operation(
        &self,
        operation: Operation,
        base_version: u64,
    ) -> Result<OperationResult, NotebookError>;

    async fn get_notebook(&self) -> Notebook;

    async fn get_version(&self) -> u64;

    async fn append_cell_output(
        &self,
        cell_id: CellId,
        output: CellOutput,
    ) -> Result<(), NotebookError>;

    async fn clear_cell_output(&self, cell_id: CellId) -> Result<(), NotebookError>;
}
