use crate::conflict_resolver::state::NotebookStateHolder;
use crate::error::NotebookError;
use crate::error::NotebookError::InvalidIndex;
use crate::notebook::{Cell, CellId, CellKind, CellOutput, Notebook};
use crate::operation::NotebookOperation;
use crate::operation::result::{
    NotebookOperationResult, NotebookOperationResultData, TextOperationResult,
};
use ot::text::{TextOperation, apply, transform};
use std::collections::HashMap;
use tokio::sync::RwLock;

pub struct NaiveStateHolder {
    inner: RwLock<State>,
}

struct State {
    notebook: Notebook,
    version: u64,
    cell_versions: HashMap<CellId, u64>,
    operation_history: Vec<NotebookOperationResult>,
    text_operation_history: HashMap<CellId, Vec<TextOperationResult>>,
}

#[async_trait::async_trait]
impl NotebookStateHolder for NaiveStateHolder {
    async fn apply_cell_operation(
        &self,
        operation: NotebookOperation,
        base_version: u64,
    ) -> Result<NotebookOperationResult, NotebookError> {
        let mut state = self.inner.write().await;
        let result = match operation {
            NotebookOperation::InsertCell { index, cell } => {
                state.apply_insert(index, cell, base_version)
            }
            NotebookOperation::DeleteCell { cell_id } => state.apply_delete(cell_id),
            NotebookOperation::MoveCell { cell_id, to_index } => {
                state.apply_move(cell_id, to_index, base_version)
            }
        }?;
        state.version += 1;
        state.operation_history.push(result.clone());
        Ok(result)
    }

    async fn get_notebook(&self) -> Notebook {
        self.inner.read().await.notebook.clone()
    }

    async fn get_version(&self) -> u64 {
        self.inner.read().await.version
    }

    async fn apply_text_operation(
        &self,
        operation: TextOperation,
        cell_id: CellId,
        base_cell_version: u64,
    ) -> Result<TextOperationResult, NotebookError> {
        let mut state = self.inner.write().await;
        let result = state.apply_text_operation(cell_id, base_cell_version, operation)?;
        *state.cell_versions.entry(cell_id).or_insert(0) += 1;
        state
            .text_operation_history
            .entry(cell_id)
            .or_insert(Vec::new())
            .push(result.clone());
        Ok(result)
    }

    async fn get_cell_version(&self, cell_id: CellId) -> u64 {
        let state = self.inner.read().await;
        match state.cell_versions.get(&cell_id) {
            Some(v) => *v,
            None => 0,
        }
    }

    async fn get_cell_versions(&self) -> HashMap<CellId, u64> {
        let state = self.inner.read().await;
        state.cell_versions.clone()
    }

    async fn append_cell_output(
        &self,
        cell_id: CellId,
        output: CellOutput,
    ) -> Result<(), NotebookError> {
        let mut state = self.inner.write().await;
        let cell = state.notebook.get_cell_mut(cell_id)?;
        match &mut cell.kind {
            CellKind::Code {
                outputs: cell_outputs,
                ..
            } => {
                cell_outputs.push(output);
                Ok(())
            }
            _ => Err(NotebookError::CellNotFound(cell_id)),
        }
    }

    async fn clear_cell_output(&self, cell_id: CellId) -> Result<(), NotebookError> {
        let mut state = self.inner.write().await;
        let cell = state.notebook.get_cell_mut(cell_id)?;
        match &mut cell.kind {
            CellKind::Code {
                outputs: cell_outputs,
                execution_number: cell_exec_num,
            } => {
                cell_outputs.clear();
                *cell_exec_num = None;
                Ok(())
            }
            _ => Err(NotebookError::CellNotFound(cell_id)),
        }
    }

    async fn set_cell_execution_number(
        &self,
        cell_id: CellId,
        execution_number: u32,
    ) -> Result<(), NotebookError> {
        let mut state = self.inner.write().await;
        let cell = state.notebook.get_cell_mut(cell_id)?;
        match &mut cell.kind {
            CellKind::Code {
                execution_number: cell_exec_num,
                ..
            } => {
                *cell_exec_num = Some(execution_number);
                Ok(())
            }
            _ => Err(NotebookError::CellNotFound(cell_id)),
        }
    }
}

impl NaiveStateHolder {
    pub fn new() -> Self {
        Self {
            inner: RwLock::new(State {
                notebook: Notebook::new(),
                version: 0,
                cell_versions: HashMap::new(),
                operation_history: Vec::new(),
                text_operation_history: HashMap::new(),
            }),
        }
    }
}

impl State {
    fn transform_index(&self, mut index: usize, base_version: u64) -> usize {
        let ops = &self.operation_history[base_version as usize..self.version as usize];
        for op in ops {
            match op.data {
                NotebookOperationResultData::InsertCell {
                    position: insert_idx,
                    ..
                } => {
                    if insert_idx <= index {
                        index += 1;
                    }
                }
                NotebookOperationResultData::DeleteCell { from_index, .. } => {
                    if from_index < index {
                        index -= 1;
                    }
                }
                NotebookOperationResultData::MoveCell {
                    from_index,
                    to_index,
                    ..
                } => {
                    if from_index < index {
                        index -= 1;
                    }
                    if to_index <= index {
                        index += 1;
                    }
                }
            }
        }
        index
    }

    fn apply_insert(
        &mut self,
        index: usize,
        cell: Cell,
        base_version: u64,
    ) -> Result<NotebookOperationResult, NotebookError> {
        let real_index = self.transform_index(index, base_version);

        if real_index > self.notebook.cells().len() {
            return Err(InvalidIndex(real_index));
        }

        self.notebook.insert_cell(cell.clone(), real_index)?;

        Ok(NotebookOperationResult {
            version: self.version + 1,
            data: NotebookOperationResultData::InsertCell {
                position: real_index,
                cell,
            },
        })
    }

    fn apply_delete(&mut self, cell_id: CellId) -> Result<NotebookOperationResult, NotebookError> {
        let from_index = self
            .notebook
            .cells()
            .iter()
            .position(|c| c.id == cell_id)
            .unwrap_or(0);

        self.notebook.delete_cell(cell_id)?;

        Ok(NotebookOperationResult {
            version: self.version + 1,
            data: NotebookOperationResultData::DeleteCell {
                cell_id,
                from_index,
            },
        })
    }

    fn apply_move(
        &mut self,
        cell_id: CellId,
        to_index: usize,
        base_version: u64,
    ) -> Result<NotebookOperationResult, NotebookError> {
        let real_to_index = self.transform_index(to_index, base_version);
        let (from_index, actual_to_index) = self.notebook.move_cell(cell_id, real_to_index)?;

        Ok(NotebookOperationResult {
            version: self.version + 1,
            data: NotebookOperationResultData::MoveCell {
                cell_id,
                from_index,
                to_index: actual_to_index,
            },
        })
    }

    fn apply_text_operation(
        &mut self,
        cell_id: CellId,
        base_cell_version: u64,
        operation: TextOperation,
    ) -> Result<TextOperationResult, NotebookError> {
        let mut real_op = operation;

        match self.text_operation_history.get(&cell_id) {
            Some(operations) => {
                let op_results = &operations[base_cell_version as usize..operations.len()];
                for op_result in op_results {
                    let transform_result = transform(&op_result.operation, &real_op)?;
                    real_op = transform_result.b_prime();
                }
            }
            None => {}
        };

        let cell = self.notebook.get_cell_mut(cell_id)?;
        cell.content = apply(&real_op, &cell.content)?;

        Ok(TextOperationResult {
            version: *self.cell_versions.entry(cell_id).or_default() + 1,
            cell_id,
            operation: real_op,
        })
    }
}
