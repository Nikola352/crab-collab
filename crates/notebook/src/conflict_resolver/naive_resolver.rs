use crate::conflict_resolver::state::NotebookStateHolder;
use crate::error::NotebookError;
use crate::error::NotebookError::InvalidIndex;
use crate::notebook::{Cell, CellId, Notebook};
use crate::operation::Operation;
use crate::operation::result::{OperationResult, OperationResultData};
use std::collections::HashMap;
use tokio::sync::RwLock;

pub struct NaiveStateHolder {
    inner: RwLock<State>,
}

struct State {
    version: u64,
    notebook: Notebook,
    operation_history: Vec<Operation>,
    delete_indexes: HashMap<CellId, usize>, // index of cell when it was deleted
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
                state.apply_delete(cell_id)?;
                Ok(OperationResult {
                    version: state.version + 1,
                    data: OperationResultData::DeleteCell { cell_id },
                })
            }
        };
        state.version += 1;
        state.operation_history.push(operation);
        result
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
                delete_indexes: HashMap::new(),
            }),
        }
    }
}

impl State {
    fn transform_index(&self, mut index: usize, base_version: u64) -> usize {
        let ops = &self.operation_history[base_version as usize..self.version as usize];
        for op in ops {
            match op {
                Operation::InsertCell {
                    index: insert_idx, ..
                } => {
                    if *insert_idx <= index {
                        index += 1;
                    }
                }
                Operation::DeleteCell { cell_id } => {
                    let idx = self.delete_indexes.get(cell_id);
                    if let Some(idx) = idx
                        && *idx < index
                    {
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
        let idx = self.notebook.cells().iter().position(|c| c.id == cell_id);
        if let Some(idx) = idx {
            self.delete_indexes.insert(cell_id, idx);
        }
        self.notebook.delete_cell(cell_id)?;
        Ok(())
    }
}
