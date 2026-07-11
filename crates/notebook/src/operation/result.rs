use crate::notebook::{Cell, CellId};

#[derive(Debug, Clone)]
pub struct NotebookOperationResult {
    pub version: u64,
    pub data: NotebookOperationResultData,
}

#[derive(Debug, Clone)]
pub enum NotebookOperationResultData {
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
}

#[derive(Debug, Clone)]
pub struct TextOperationResult {
    pub version: u64,
    pub data: TextOperationResultData,
}

#[derive(Debug, Clone)]
pub enum TextOperationResultData {
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
