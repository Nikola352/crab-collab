use crate::notebook::{Cell, CellId};

pub enum NotebookOperation {
    InsertCell { index: usize, cell: Cell },
    DeleteCell { cell_id: CellId },
    MoveCell { cell_id: CellId, to_index: usize },
}
