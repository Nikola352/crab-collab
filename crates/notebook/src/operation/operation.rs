use crate::notebook::{Cell, CellId};
use fractional_index::FractionalIndex;

pub enum NotebookOperation {
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
