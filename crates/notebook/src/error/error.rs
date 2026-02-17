use crate::notebook::CellId;
use std::error::Error;
use std::fmt::{Display, Formatter};

#[derive(Debug, Clone)]
pub enum NotebookError {
    CellNotFound(CellId),
    InvalidIndex(usize),
}

impl Display for NotebookError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            NotebookError::CellNotFound(id) => write!(f, "Cell {id} not found"),
            NotebookError::InvalidIndex(idx) => write!(f, "Invalid cell index: {idx}"),
        }
    }
}

impl Error for NotebookError {}
