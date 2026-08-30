use crate::conflict_resolver::state::{NotebookState, NotebookStateHolder, OriginId};
use crate::error::NotebookError;
use crate::notebook::{Cell, CellId, CellKind, CellOutput, Notebook};
use crate::operation::NotebookOperation;
use crate::operation::result::{
    NotebookOperationResult, NotebookOperationResultData, TextOperationResult,
};
use crdt::list::FractionalList;
use dashmap::DashMap;
use fractional_index::FractionalIndex;
use ot::text::{TextOperation, apply, transform, transform_position};
use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use tokio::sync::RwLock;

const CELL_OPERATION_HISTORY_CAP: usize = 1000;

#[derive(Debug, Clone)]
struct CellState {
    cell: Cell,
    version: u64,
    history_base_version: u64,
    operation_history: VecDeque<TextOperationResult>,
}

#[derive(Debug, Clone)]
struct OrderingState {
    version: u64,
    cell_order: FractionalList<CellId>,
}

pub struct ConcurrentStateHolder {
    cells: Arc<DashMap<CellId, CellState>>,
    order: RwLock<OrderingState>,
}

#[async_trait::async_trait]
impl NotebookStateHolder for ConcurrentStateHolder {
    async fn apply_cell_operation(
        &self,
        operation: NotebookOperation,
    ) -> Result<NotebookOperationResult, NotebookError> {
        let result = match operation {
            NotebookOperation::InsertCell { index, cell } => self.apply_insert(index, cell).await,
            NotebookOperation::DeleteCell { cell_id } => self.apply_delete(cell_id).await,
            NotebookOperation::MoveCell { cell_id, to_index } => {
                self.apply_move(cell_id, to_index).await
            }
        }?;
        Ok(result)
    }

    async fn get_notebook(&self) -> Notebook {
        let cells = self
            .order
            .read()
            .await
            .cell_order
            .get_ordered()
            .filter_map(|id| self.cells.get(id).map(|state| state.cell.clone()))
            .collect();
        Notebook::new_from_cells(cells)
    }

    async fn get_notebook_state(&self) -> NotebookState {
        let cell_order = &self.order.read().await.cell_order;

        let mut cells: Vec<Cell> = Vec::new();
        let mut cell_versions: HashMap<CellId, u64> = HashMap::new();
        for id in cell_order.get_ordered() {
            if let Some(state) = self.cells.get(id) {
                cells.push(state.cell.clone());
                cell_versions.insert(*id, state.version);
            }
        }

        let cell_metadata = cell_order
            .get_indexes_by_id()
            .iter()
            .map(|(id, idx)| (id.clone(), idx.to_string()))
            .collect();

        NotebookState {
            notebook: Notebook::new_from_cells(cells),
            cell_versions,
            cell_metadata,
        }
    }

    async fn get_version(&self) -> u64 {
        self.order.read().await.version
    }

    async fn apply_text_operation(
        &self,
        operation: TextOperation,
        cell_id: CellId,
        base_cell_version: u64,
        origin_id: OriginId,
    ) -> Result<TextOperationResult, NotebookError> {
        match self.cells.get_mut(&cell_id) {
            Some(mut state) => state.apply_text_operation(base_cell_version, operation, origin_id),
            None => Err(NotebookError::CellNotFound(cell_id)),
        }
    }

    async fn rebase_cursor_position(
        &self,
        cell_id: CellId,
        base_cell_version: u64,
        position: usize,
        origin_id: OriginId,
    ) -> Result<usize, NotebookError> {
        match self.cells.get(&cell_id) {
            Some(state) => Ok(state.rebase_position(base_cell_version, position, origin_id)),
            None => Err(NotebookError::CellNotFound(cell_id)),
        }
    }

    async fn get_cell_version(&self, cell_id: CellId) -> u64 {
        match self.cells.get(&cell_id) {
            Some(state) => state.version,
            None => 0,
        }
    }

    async fn get_cell_content(&self, cell_id: CellId) -> Option<String> {
        self.cells.get(&cell_id).map(|s| s.cell.content.clone())
    }

    async fn append_cell_output(
        &self,
        cell_id: CellId,
        output: CellOutput,
    ) -> Result<(), NotebookError> {
        match self.cells.get_mut(&cell_id) {
            Some(mut state) => state.append_cell_output(output),
            None => Err(NotebookError::CellNotFound(cell_id)),
        }
    }

    async fn clear_cell_output(&self, cell_id: CellId) -> Result<(), NotebookError> {
        match self.cells.get_mut(&cell_id) {
            Some(mut state) => state.clear_cell_output(),
            None => Err(NotebookError::CellNotFound(cell_id)),
        }
    }

    async fn set_cell_execution_number(
        &self,
        cell_id: CellId,
        execution_number: u32,
    ) -> Result<(), NotebookError> {
        match self.cells.get_mut(&cell_id) {
            Some(mut state) => state.set_cell_execution_number(execution_number),
            None => Err(NotebookError::CellNotFound(cell_id)),
        }
    }
}

impl ConcurrentStateHolder {
    pub fn new() -> Self {
        Self {
            cells: Arc::new(DashMap::new()),
            order: RwLock::new(OrderingState {
                version: 0,
                cell_order: FractionalList::new(),
            }),
        }
    }

    async fn apply_insert(
        &self,
        index: FractionalIndex,
        cell: Cell,
    ) -> Result<NotebookOperationResult, NotebookError> {
        let mut state = self.order.write().await;
        state.version += 1;
        let new_index = state.cell_order.insert_at(cell.id, &index);

        self.cells.insert(
            cell.id.clone(),
            CellState {
                cell: cell.clone(),
                version: 0,
                history_base_version: 0,
                operation_history: VecDeque::new(),
            },
        );

        Ok(NotebookOperationResult {
            version: state.version,
            data: NotebookOperationResultData::InsertCell {
                index: new_index,
                cell,
            },
        })
    }

    async fn apply_delete(
        &self,
        cell_id: CellId,
    ) -> Result<NotebookOperationResult, NotebookError> {
        let mut state = self.order.write().await;
        state.version += 1;
        state.cell_order.delete(cell_id);

        self.cells.remove(&cell_id);

        Ok(NotebookOperationResult {
            version: state.version,
            data: NotebookOperationResultData::DeleteCell { cell_id },
        })
    }

    async fn apply_move(
        &self,
        cell_id: CellId,
        to_index: FractionalIndex,
    ) -> Result<NotebookOperationResult, NotebookError> {
        let mut state = self.order.write().await;
        state.version += 1;
        let new_index = state.cell_order.move_to(cell_id.clone(), &to_index);

        Ok(NotebookOperationResult {
            version: state.version,
            data: NotebookOperationResultData::MoveCell {
                cell_id,
                to_index: new_index,
            },
        })
    }
}

impl CellState {
    fn apply_text_operation(
        &mut self,
        base_cell_version: u64,
        operation: TextOperation,
        origin_id: OriginId,
    ) -> Result<TextOperationResult, NotebookError> {
        if base_cell_version < self.history_base_version {
            return Err(NotebookError::CellVersionTooOld {
                cell_id: self.cell.id,
                requested_version: base_cell_version,
                oldest_available_version: self.history_base_version,
            });
        }
        self.version += 1;

        let start = (base_cell_version - self.history_base_version) as usize;
        let mut real_op = operation;
        for op_result in self.operation_history.iter().skip(start) {
            let transform_result = transform(&op_result.operation, &real_op)?;
            real_op = transform_result.b_prime();
        }
        self.cell.content = apply(&real_op, &self.cell.content)?;

        let result = TextOperationResult {
            version: self.version,
            cell_id: self.cell.id,
            operation: real_op,
            origin_id,
        };

        self.operation_history.push_back(result.clone());
        if self.operation_history.len() > CELL_OPERATION_HISTORY_CAP {
            self.operation_history.pop_front();
            self.history_base_version += 1;
        }

        Ok(result)
    }

    fn rebase_position(
        &self,
        base_cell_version: u64,
        position: usize,
        origin_id: OriginId,
    ) -> usize {
        // best-effort if not enough history
        let start = base_cell_version.saturating_sub(self.history_base_version) as usize;
        let mut pos = position;
        for op_result in self.operation_history.iter().skip(start) {
            pos = transform_position(pos, &op_result.operation, op_result.origin_id == origin_id);
        }
        pos
    }

    fn append_cell_output(&mut self, output: CellOutput) -> Result<(), NotebookError> {
        match &mut self.cell.kind {
            CellKind::Code {
                outputs: cell_outputs,
                ..
            } => {
                cell_outputs.push(output);
                Ok(())
            }
            _ => Err(NotebookError::CellNotFound(self.cell.id)),
        }
    }

    fn clear_cell_output(&mut self) -> Result<(), NotebookError> {
        match &mut self.cell.kind {
            CellKind::Code {
                outputs: cell_outputs,
                execution_number: cell_exec_num,
            } => {
                cell_outputs.clear();
                *cell_exec_num = None;
                Ok(())
            }
            _ => Err(NotebookError::CellNotFound(self.cell.id)),
        }
    }

    fn set_cell_execution_number(&mut self, execution_number: u32) -> Result<(), NotebookError> {
        match &mut self.cell.kind {
            CellKind::Code {
                execution_number: cell_exec_num,
                ..
            } => {
                *cell_exec_num = Some(execution_number);
                Ok(())
            }
            _ => Err(NotebookError::CellNotFound(self.cell.id)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn new_cell_state() -> CellState {
        CellState {
            cell: Cell::new_code_with_id(CellId::new_v4(), String::new()),
            version: 0,
            history_base_version: 0,
            operation_history: VecDeque::new(),
        }
    }

    #[test]
    fn caps_operation_history_and_advances_history_base_version() {
        let mut cell_state = new_cell_state();
        let origin_id = OriginId::new_v4();
        let total_ops = CELL_OPERATION_HISTORY_CAP + 50;

        let mut base_version = 0u64;
        for i in 0..total_ops {
            let op = TextOperation::insert_at(i, i, "a");
            let result = cell_state
                .apply_text_operation(base_version, op, origin_id)
                .expect("op within current version should apply");
            base_version = result.version;
        }

        assert_eq!(cell_state.version, total_ops as u64);
        assert_eq!(
            cell_state.operation_history.len(),
            CELL_OPERATION_HISTORY_CAP
        );
        assert_eq!(
            cell_state.history_base_version,
            total_ops as u64 - CELL_OPERATION_HISTORY_CAP as u64
        );
    }

    #[test]
    fn rejects_and_resyncs_when_base_version_older_than_retained_history() {
        let mut cell_state = new_cell_state();
        let origin_id = OriginId::new_v4();
        let total_ops = CELL_OPERATION_HISTORY_CAP + 50;

        let mut base_version = 0u64;
        for i in 0..total_ops {
            let op = TextOperation::insert_at(i, i, "a");
            let result = cell_state
                .apply_text_operation(base_version, op, origin_id)
                .expect("op within current version should apply");
            base_version = result.version;
        }

        let version_before = cell_state.version;
        let stale_op = TextOperation::insert_at(total_ops, 0, "x");
        let err = cell_state
            .apply_text_operation(0, stale_op, origin_id)
            .expect_err("stale base_cell_version should be rejected");

        assert!(matches!(err, NotebookError::CellVersionTooOld { .. }));
        assert_eq!(cell_state.version, version_before);
    }

    #[test]
    fn rebase_position_clamps_instead_of_panicking_on_stale_base_version() {
        let mut cell_state = new_cell_state();
        let origin_id = OriginId::new_v4();
        let total_ops = CELL_OPERATION_HISTORY_CAP + 50;

        let mut base_version = 0u64;
        for i in 0..total_ops {
            let op = TextOperation::insert_at(i, i, "a");
            let result = cell_state
                .apply_text_operation(base_version, op, origin_id)
                .expect("op within current version should apply");
            base_version = result.version;
        }

        // Should not panic even though version 0 predates history_base_version.
        let _ = cell_state.rebase_position(0, 0, origin_id);
    }
}
