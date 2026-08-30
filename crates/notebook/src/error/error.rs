use crate::notebook::CellId;
use ot::error::OTError;
use std::error::Error;
use std::fmt::{Display, Formatter};

#[derive(Debug, Clone)]
pub enum NotebookError {
    CellNotFound(CellId),
    InvalidIndex(usize),
    InvalidTextOperation(OTError),
    CellVersionTooOld {
        cell_id: CellId,
        requested_version: u64,
        oldest_available_version: u64,
    },
}

impl Display for NotebookError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            NotebookError::CellNotFound(id) => write!(f, "Cell {id} not found"),
            NotebookError::InvalidIndex(idx) => write!(f, "Invalid cell index: {idx}"),
            NotebookError::InvalidTextOperation(_err) => write!(f, "Invalid OT transform"),
            NotebookError::CellVersionTooOld {
                cell_id,
                requested_version,
                oldest_available_version,
            } => write!(
                f,
                "Cell {cell_id} version {requested_version} too old, oldest available is {oldest_available_version}"
            ),
        }
    }
}

impl Error for NotebookError {}

impl From<OTError> for NotebookError {
    fn from(err: OTError) -> Self {
        NotebookError::InvalidTextOperation(err)
    }
}
