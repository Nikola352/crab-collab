use crate::conflict_resolver::state::NotebookStateHolder;
use crate::error::NotebookError;
use crate::error::NotebookError::InvalidIndex;
use crate::notebook::{Cell, CellId, CellKind, CellOutput, Notebook};
use crate::operation::result::{
    NotebookOperationResult, NotebookOperationResultData, TextOperationResult,
    TextOperationResultData,
};
use crate::operation::{NotebookOperation, TextOperation};
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
        let result = match operation {
            TextOperation::TextInsert {
                start_position,
                text,
            } => state.apply_text_insert(cell_id, base_cell_version, start_position, text),
            TextOperation::TextDelete {
                start_position,
                end_position,
            } => state.apply_text_delete(cell_id, base_cell_version, start_position, end_position),
        }?;
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

    fn apply_text_insert(
        &mut self,
        cell_id: CellId,
        base_cell_version: u64,
        start_position: usize,
        text: String,
    ) -> Result<TextOperationResult, NotebookError> {
        let cell = self.notebook.get_cell_mut(cell_id)?;
        let clamped_start = start_position.min(cell.content.len());
        cell.content.insert_str(clamped_start, &text);
        let end_position = clamped_start + text.len();

        Ok(TextOperationResult {
            version: self.version + 1,
            data: TextOperationResultData::TextInsert {
                cell_id,
                start_position: clamped_start,
                end_position,
                text,
            },
        })
    }

    fn apply_text_delete(
        &mut self,
        cell_id: CellId,
        base_cell_version: u64,
        start_position: usize,
        end_position: usize,
    ) -> Result<TextOperationResult, NotebookError> {
        let cell = self.notebook.get_cell_mut(cell_id)?;
        let len = cell.content.len();
        let clamped_start = start_position.min(len);
        let clamped_end = end_position.min(len);
        cell.content.drain(clamped_start..clamped_end);

        Ok(TextOperationResult {
            version: self.version + 1,
            data: TextOperationResultData::TextDelete {
                cell_id,
                start_position: clamped_start,
                end_position: clamped_end,
            },
        })
    }
}
