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
            Operation::InsertCell { index, ref cell } => {
                let real_index = state.transform_index(index, base_version);
                state.apply_insert(real_index, cell.clone())?;
                Ok(OperationResult {
                    version: state.version + 1,
                    data: OperationResultData::InsertCell {
                        position: real_index,
                        cell: cell.clone(),
                    },
                })
            }
            Operation::DeleteCell { cell_id } => {
                let from_index = state
                    .notebook
                    .cells()
                    .iter()
                    .position(|c| c.id == cell_id)
                    .unwrap_or(0);
                state.apply_delete(cell_id)?;
                Ok(OperationResult {
                    version: state.version + 1,
                    data: OperationResultData::DeleteCell {
                        cell_id,
                        from_index,
                    },
                })
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
            }
        }
        index
    }

    fn apply_insert(&mut self, index: usize, cell: Cell) -> Result<(), NotebookError> {
        if index > self.notebook.cells().len() {
            return Err(InvalidIndex(index));
        }
        self.notebook.insert_cell(cell, index)?;
        Ok(())
    }

    fn apply_delete(&mut self, cell_id: CellId) -> Result<(), NotebookError> {
        self.notebook.delete_cell(cell_id)?;
        Ok(())
    }
}
