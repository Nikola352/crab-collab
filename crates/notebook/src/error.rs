use crate::cell::CellId;

#[derive(Debug, Clone)]
pub enum NotebookError {
    CellNotFound(CellId),
    InvalidIndex(usize),
}
