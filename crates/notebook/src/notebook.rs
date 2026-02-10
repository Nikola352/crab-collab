use crate::cell::{Cell, CellId};
use crate::error::NotebookError;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Notebook {
    cells: Vec<Cell>,
}

impl Notebook {
    pub fn new() -> Self {
        Self { cells: Vec::new() }
    }

    pub fn cells(&self) -> &[Cell] {
        &self.cells
    }

    pub fn get_cell(&self, cell_id: CellId) -> Result<&Cell, NotebookError> {
        self.cells
            .iter()
            .find(|c| c.id == cell_id)
            .ok_or(NotebookError::CellNotFound(cell_id))
    }

    pub fn get_cell_mut(&mut self, cell_id: CellId) -> Result<&mut Cell, NotebookError> {
        self.cells
            .iter_mut()
            .find(|c| c.id == cell_id)
            .ok_or(NotebookError::CellNotFound(cell_id))
    }

    pub fn insert_cell(&mut self, cell: Cell, index: usize) -> Result<(), NotebookError> {
        if index > self.cells.len() {
            return Err(NotebookError::InvalidIndex(index));
        }
        self.cells.insert(index, cell);
        Ok(())
    }

    pub fn delete_cell(&mut self, cell_id: CellId) -> Result<(), NotebookError> {
        let pos = self
            .cells
            .iter()
            .position(|c| c.id == cell_id)
            .ok_or(NotebookError::CellNotFound(cell_id))?;
        self.cells.remove(pos);
        Ok(())
    }
}
