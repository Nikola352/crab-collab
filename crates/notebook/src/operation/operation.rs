use crate::notebook::{Cell, CellId};

pub enum NotebookOperation {
    InsertCell { index: usize, cell: Cell },
    DeleteCell { cell_id: CellId },
    MoveCell { cell_id: CellId, to_index: usize },
}

pub enum TextOperation {
    TextInsert {
        start_position: usize,
        text: String,
    },
    TextDelete {
        start_position: usize,
        end_position: usize,
    },
}
