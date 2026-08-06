use crate::conflict_resolver::state::NotebookStateHolder;
use crate::error::NotebookError;
use crate::notebook::{Cell, CellId, CellKind, CellOutput, Notebook};
use crate::operation::NotebookOperation;
use crate::operation::result::{
    NotebookOperationResult, NotebookOperationResultData, TextOperationResult,
};
use crdt::list::FractionalList;
use fractional_index::FractionalIndex;
use ot::text::{TextOperation, apply, transform};
use std::collections::HashMap;
use tokio::sync::RwLock;

pub struct NaiveStateHolder {
    inner: RwLock<State>,
}

struct State {
    version: u64,
    cells: HashMap<CellId, Cell>,
    cell_order: FractionalList<CellId>,
    cell_versions: HashMap<CellId, u64>,
    text_operation_history: HashMap<CellId, Vec<TextOperationResult>>,
}

#[async_trait::async_trait]
impl NotebookStateHolder for NaiveStateHolder {
    async fn apply_cell_operation(
        &self,
        operation: NotebookOperation,
    ) -> Result<NotebookOperationResult, NotebookError> {
        let mut state = self.inner.write().await;
        let result = match operation {
            NotebookOperation::InsertCell { index, cell } => state.apply_insert(index, cell),
            NotebookOperation::DeleteCell { cell_id } => state.apply_delete(cell_id),
            NotebookOperation::MoveCell { cell_id, to_index } => {
                state.apply_move(cell_id, to_index)
            }
        }?;
        state.version += 1;
        Ok(result)
    }

    async fn get_notebook(&self) -> Notebook {
        let state = self.inner.read().await;
        Notebook::new_from_cells(
            state
                .cell_order
                .get_ordered()
                .map(|id| state.cells[id].clone())
                .collect(),
        )
    }

    async fn get_cell_metadata(&self) -> HashMap<CellId, String> {
        let state = self.inner.read().await;
        state
            .cell_order
            .get_indexes_by_id()
            .iter()
            .map(|(id, idx)| (id.clone(), idx.to_string()))
            .collect()
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
        let cell = state.get_cell_mut(cell_id)?;
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
        let cell = state.get_cell_mut(cell_id)?;
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
        let cell = state.get_cell_mut(cell_id)?;
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
                version: 0,
                cells: HashMap::new(),
                cell_order: FractionalList::new(),
                cell_versions: HashMap::new(),
                text_operation_history: HashMap::new(),
            }),
        }
    }
}

impl State {
    fn get_cell_mut(&mut self, cell_id: CellId) -> Result<&mut Cell, NotebookError> {
        match self.cells.get_mut(&cell_id) {
            Some(cell) => Ok(cell),
            None => Err(NotebookError::CellNotFound(cell_id.clone())),
        }
    }

    fn apply_insert(
        &mut self,
        index: FractionalIndex,
        cell: Cell,
    ) -> Result<NotebookOperationResult, NotebookError> {
        let new_index = self.cell_order.insert_at(cell.id.clone(), &index);

        self.cells.insert(cell.id.clone(), cell.clone());

        Ok(NotebookOperationResult {
            version: self.version + 1,
            data: NotebookOperationResultData::InsertCell {
                index: new_index,
                cell,
            },
        })
    }

    fn apply_delete(&mut self, cell_id: CellId) -> Result<NotebookOperationResult, NotebookError> {
        self.cells.remove(&cell_id);
        self.cell_order.delete(cell_id.clone());

        Ok(NotebookOperationResult {
            version: self.version + 1,
            data: NotebookOperationResultData::DeleteCell { cell_id },
        })
    }

    fn apply_move(
        &mut self,
        cell_id: CellId,
        to_index: FractionalIndex,
    ) -> Result<NotebookOperationResult, NotebookError> {
        let new_index = self.cell_order.move_to(cell_id.clone(), &to_index);

        Ok(NotebookOperationResult {
            version: self.version + 1,
            data: NotebookOperationResultData::MoveCell {
                cell_id,
                to_index: new_index,
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

        let cell = self.get_cell_mut(cell_id)?;
        cell.content = apply(&real_op, &cell.content)?;

        Ok(TextOperationResult {
            version: *self.cell_versions.entry(cell_id).or_default() + 1,
            cell_id,
            operation: real_op,
        })
    }
}
