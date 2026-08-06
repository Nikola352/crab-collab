use crate::notebook::{Cell, CellId};
use fractional_index::FractionalIndex;
use ot::text::TextOperation;

#[derive(Debug, Clone)]
pub struct NotebookOperationResult {
    pub version: u64,
    pub data: NotebookOperationResultData,
}

#[derive(Debug, Clone)]
pub enum NotebookOperationResultData {
    InsertCell {
        index: FractionalIndex,
        cell: Cell,
    },
    DeleteCell {
        cell_id: CellId,
    },
    MoveCell {
        cell_id: CellId,
        to_index: FractionalIndex,
    },
}

#[derive(Debug, Clone)]
pub struct TextOperationResult {
    pub version: u64,
    pub cell_id: CellId,
    pub operation: TextOperation,
}
