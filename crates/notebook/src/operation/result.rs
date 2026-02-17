use crate::notebook::{Cell, CellId};

#[derive(Debug, Clone)]
pub struct OperationResult {
    pub version: u64,
    pub data: OperationResultData,
}

#[derive(Debug, Clone)]
pub enum OperationResultData {
    InsertCell {
        position: usize,
        cell: Cell,
    },
    DeleteCell {
        cell_id: CellId,
        from_index: usize,
    },
    MoveCell {
        cell_id: CellId,
        from_index: usize,
        to_index: usize,
    },
    TextInsert {
        cell_id: CellId,
        start_position: usize,
        end_position: usize,
        text: String,
    },
    TextDelete {
        cell_id: CellId,
        start_position: usize,
        end_position: usize,
    },
}
