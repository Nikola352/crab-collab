use crate::notebook::{Cell, CellId};

pub enum Operation {
    InsertCell { index: usize, cell: Cell },
    DeleteCell { cell_id: CellId },
}
