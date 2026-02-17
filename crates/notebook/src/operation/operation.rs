use crate::notebook::{Cell, CellId};

pub enum Operation {
    InsertCell {
        index: usize,
        cell: Cell,
    },
    DeleteCell {
        cell_id: CellId,
    },
    MoveCell {
        cell_id: CellId,
        to_index: usize,
    },
    TextInsert {
        cell_id: CellId,
        start_position: usize,
        text: String,
    },
    TextDelete {
        cell_id: CellId,
        start_position: usize,
        end_position: usize,
    },
}
