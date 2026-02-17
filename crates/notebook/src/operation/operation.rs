use crate::notebook::Cell;

pub enum Operation {
    InsertCell { index: usize, cell: Cell },
}
