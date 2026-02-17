use crate::conflict_resolver::state::NotebookStateHolder;
use crate::error::NotebookError;
use crate::error::NotebookError::InvalidIndex;
use crate::notebook::{Cell, CellId, Notebook};
use crate::operation::Operation;
use crate::operation::result::{OperationResult, OperationResultData};
use tokio::sync::RwLock;

pub struct NaiveStateHolder {
    inner: RwLock<State>,
}

struct State {
    version: u64,
    notebook: Notebook,
    operation_history: Vec<OperationResult>,
}

#[async_trait::async_trait]
impl NotebookStateHolder for NaiveStateHolder {
    async fn apply_operation(
        &self,
        operation: Operation,
        base_version: u64,
    ) -> Result<OperationResult, NotebookError> {
        let mut state = self.inner.write().await;
        let result = match operation {
            Operation::InsertCell { index, cell } => state.apply_insert(index, cell, base_version),
            Operation::DeleteCell { cell_id } => state.apply_delete(cell_id),
            Operation::MoveCell { cell_id, to_index } => {
                state.apply_move(cell_id, to_index, base_version)
            }
            Operation::TextInsert {
                cell_id,
                start_position,
                text,
            } => state.apply_text_insert(cell_id, start_position, text),
            Operation::TextDelete {
                cell_id,
                start_position,
                end_position,
            } => state.apply_text_delete(cell_id, start_position, end_position),
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
}

impl NaiveStateHolder {
    pub fn new() -> Self {
        Self {
            inner: RwLock::new(State {
                version: 0,
                notebook: Notebook::new(),
                operation_history: Vec::new(),
            }),
        }
    }
}

impl State {
    fn transform_index(&self, mut index: usize, base_version: u64) -> usize {
        let ops = &self.operation_history[base_version as usize..self.version as usize];
        for op in ops {
            match op.data {
                OperationResultData::InsertCell {
                    position: insert_idx,
                    ..
                } => {
                    if insert_idx <= index {
                        index += 1;
                    }
                }
                OperationResultData::DeleteCell { from_index, .. } => {
                    if from_index < index {
                        index -= 1;
                    }
                }
                OperationResultData::MoveCell {
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
                _ => {}
            }
        }
        index
    }

    fn apply_insert(
        &mut self,
        index: usize,
        cell: Cell,
        base_version: u64,
    ) -> Result<OperationResult, NotebookError> {
        let real_index = self.transform_index(index, base_version);

        if real_index > self.notebook.cells().len() {
            return Err(InvalidIndex(real_index));
        }

        self.notebook.insert_cell(cell.clone(), real_index)?;

        Ok(OperationResult {
            version: self.version + 1,
            data: OperationResultData::InsertCell {
                position: real_index,
                cell,
            },
        })
    }

    fn apply_delete(&mut self, cell_id: CellId) -> Result<OperationResult, NotebookError> {
        let from_index = self
            .notebook
            .cells()
            .iter()
            .position(|c| c.id == cell_id)
            .unwrap_or(0);

        self.notebook.delete_cell(cell_id)?;

        Ok(OperationResult {
            version: self.version + 1,
            data: OperationResultData::DeleteCell {
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
    ) -> Result<OperationResult, NotebookError> {
        let real_to_index = self.transform_index(to_index, base_version);
        let (from_index, actual_to_index) = self.notebook.move_cell(cell_id, real_to_index)?;

        Ok(OperationResult {
            version: self.version + 1,
            data: OperationResultData::MoveCell {
                cell_id,
                from_index,
                to_index: actual_to_index,
            },
        })
    }

    fn apply_text_insert(
        &mut self,
        cell_id: CellId,
        start_position: usize,
        text: String,
    ) -> Result<OperationResult, NotebookError> {
        let cell = self.notebook.get_cell_mut(cell_id)?;
        let clamped_start = start_position.min(cell.content.len());
        cell.content.insert_str(clamped_start, &text);
        let end_position = clamped_start + text.len();

        Ok(OperationResult {
            version: self.version + 1,
            data: OperationResultData::TextInsert {
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
        start_position: usize,
        end_position: usize,
    ) -> Result<OperationResult, NotebookError> {
        let cell = self.notebook.get_cell_mut(cell_id)?;
        let len = cell.content.len();
        let clamped_start = start_position.min(len);
        let clamped_end = end_position.min(len);
        cell.content.drain(clamped_start..clamped_end);

        Ok(OperationResult {
            version: self.version + 1,
            data: OperationResultData::TextDelete {
                cell_id,
                start_position: clamped_start,
                end_position: clamped_end,
            },
        })
    }
}
