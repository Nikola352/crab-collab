use crate::error::NotebookError;
use crate::notebook::{Cell, CellId};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Notebook {
    cells: Vec<Cell>,
}

impl Notebook {
    pub fn new() -> Self {
        Self { cells: Vec::new() }
    }

    pub fn new_from_cells(cells: Vec<Cell>) -> Self {
        Notebook { cells }
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

    /// Moves a cell to a new index. Returns `(from_index, actual_to_index)`.
    /// `to_index` is interpreted after removing the cell from its current position.
    pub fn move_cell(
        &mut self,
        cell_id: CellId,
        to_index: usize,
    ) -> Result<(usize, usize), NotebookError> {
        let from_index = self
            .cells
            .iter()
            .position(|c| c.id == cell_id)
            .ok_or(NotebookError::CellNotFound(cell_id))?;
        let cell = self.cells.remove(from_index);
        let clamped_index = to_index.min(self.cells.len());
        self.cells.insert(clamped_index, cell);
        Ok((from_index, clamped_index))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::notebook::{CellKind, CellOutput};
    use uuid::Uuid;

    #[test]
    fn test_new_notebook_is_empty() {
        let notebook = Notebook::new();
        assert!(notebook.cells().is_empty());
        assert_eq!(notebook.cells().len(), 0);
    }

    #[test]
    fn test_insert_cell_valid_index() {
        let mut notebook = Notebook::new();
        let cell = Cell::new_markdown("Hello".to_string());
        let cell_id = cell.id;

        // Insert at beginning of empty notebook
        assert!(notebook.insert_cell(cell.clone(), 0).is_ok());
        assert_eq!(notebook.cells().len(), 1);

        // Verify we can retrieve the cell
        let retrieved = notebook.get_cell(cell_id);
        assert!(retrieved.is_ok());
        let retrieved = retrieved.unwrap();
        assert_eq!(retrieved.id, cell_id);
        assert_eq!(retrieved.content, "Hello");

        // Insert another cell at position 0 (beginning)
        let cell2 = Cell::new_code("print('world')".to_string());
        let cell2_id = cell2.id;
        assert!(notebook.insert_cell(cell2, 0).is_ok());
        assert_eq!(notebook.cells().len(), 2);

        // Verify order - cell2 should now be first
        assert_eq!(notebook.cells()[0].id, cell2_id);
        assert_eq!(notebook.cells()[1].id, cell_id);
    }

    #[test]
    fn test_insert_cell_invalid_index() {
        let mut notebook = Notebook::new();
        let cell = Cell::new_markdown("Test".to_string());
        let cell2 = cell.clone();

        // Index greater than length should fail
        assert!(notebook.insert_cell(cell, 1).is_err());

        // Empty notebook, only index 0 is valid
        assert!(matches!(notebook.insert_cell(cell2.clone(), 0), Ok(())));

        // Now with 1 cell, index 2 should fail
        let cell2 = Cell::new_markdown("Test2".to_string());
        assert!(matches!(
            notebook.insert_cell(cell2, 2),
            Err(NotebookError::InvalidIndex(2))
        ));

        // But index 0 and 1 should work
        let cell3 = Cell::new_markdown("Test3".to_string());
        assert!(notebook.insert_cell(cell3.clone(), 1).is_ok());
        assert!(notebook.insert_cell(cell3.clone(), 0).is_ok());
    }

    #[test]
    fn test_get_cell_exists() {
        let mut notebook = Notebook::new();
        let cell = Cell::new_code("x = 1 + 1".to_string());
        let cell_id = cell.id;

        notebook.insert_cell(cell, 0).unwrap();

        let retrieved = notebook.get_cell(cell_id);
        assert!(retrieved.is_ok());
        let cell_ref = retrieved.unwrap();
        assert_eq!(cell_ref.id, cell_id);

        // Verify cell properties
        match &cell_ref.kind {
            CellKind::Code {
                outputs,
                execution_number,
            } => {
                assert!(outputs.is_empty());
                assert!(execution_number.is_none());
            }
            _ => panic!("Expected Code cell"),
        }
    }

    #[test]
    fn test_get_cell_not_found() {
        let notebook = Notebook::new();
        let non_existent_id = Uuid::new_v4();

        let result = notebook.get_cell(non_existent_id);
        assert!(result.is_err());
        assert!(matches!(
            result,
            Err(NotebookError::CellNotFound(id)) if id == non_existent_id
        ));
    }

    #[test]
    fn test_get_cell_mut() {
        let mut notebook = Notebook::new();
        let cell = Cell::new_code("x = 1".to_string());
        let cell_id = cell.id;

        notebook.insert_cell(cell, 0).unwrap();

        // Get mutable reference and modify
        let cell_mut = notebook.get_cell_mut(cell_id).unwrap();
        cell_mut.content = "x = 2".to_string();

        // Verify modification
        let cell_ref = notebook.get_cell(cell_id).unwrap();
        assert_eq!(cell_ref.content, "x = 2");
    }

    #[test]
    fn test_delete_cell_exists() {
        let mut notebook = Notebook::new();

        // Add multiple cells
        let cell1 = Cell::new_markdown("# Title".to_string());
        let cell1_id = cell1.id;
        let cell2 = Cell::new_code("print('hello')".to_string());
        let cell2_id = cell2.id;
        let cell3 = Cell::new_markdown("## Subtitle".to_string());
        let cell3_id = cell3.id;

        notebook.insert_cell(cell1, 0).unwrap();
        notebook.insert_cell(cell2, 1).unwrap();
        notebook.insert_cell(cell3, 2).unwrap();
        assert_eq!(notebook.cells().len(), 3);

        // Delete middle cell
        assert!(notebook.delete_cell(cell2_id).is_ok());
        assert_eq!(notebook.cells().len(), 2);

        // Verify remaining cells
        assert_eq!(notebook.cells()[0].id, cell1_id);
        assert_eq!(notebook.cells()[1].id, cell3_id);

        // Verify deleted cell is gone
        assert!(notebook.get_cell(cell2_id).is_err());
    }

    #[test]
    fn test_delete_cell_not_found() {
        let mut notebook = Notebook::new();
        let cell = Cell::new_markdown("Test".to_string());
        let cell_id = cell.id;

        notebook.insert_cell(cell, 0).unwrap();

        let non_existent_id = Uuid::new_v4();
        let result = notebook.delete_cell(non_existent_id);
        assert!(result.is_err());
        assert!(matches!(
            result,
            Err(NotebookError::CellNotFound(id)) if id == non_existent_id
        ));

        // Original cell should still exist
        assert!(notebook.get_cell(cell_id).is_ok());
    }

    #[test]
    fn test_serialization_deserialization() {
        // Create a notebook with different cell types
        let mut notebook = Notebook::new();

        let md_cell = Cell::new_markdown("## Documentation".to_string());
        let code_cell = Cell::new_code("import numpy as np".to_string());

        notebook.insert_cell(md_cell, 0).unwrap();
        notebook.insert_cell(code_cell, 1).unwrap();

        // Serialize
        let serialized = serde_json::to_string(&notebook).unwrap();
        assert!(!serialized.is_empty());
        assert!(serialized.contains("Documentation"));
        assert!(serialized.contains("cell_type"));

        // Deserialize
        let deserialized: Notebook = serde_json::from_str(&serialized).unwrap();
        assert_eq!(deserialized.cells().len(), 2);
        assert_eq!(deserialized.cells()[0].content, "## Documentation");
        assert_eq!(deserialized.cells()[1].content, "import numpy as np");
    }

    #[test]
    fn test_edge_cases() {
        let mut notebook = Notebook::new();

        // Test inserting at exactly the end (append)
        let cell1 = Cell::new_markdown("First".to_string());
        assert!(notebook.insert_cell(cell1, 0).is_ok());

        let cell2 = Cell::new_markdown("Second".to_string());
        assert!(notebook.insert_cell(cell2, 1).is_ok()); // Append

        assert_eq!(notebook.cells().len(), 2);

        // Test duplicate insertion (should be allowed - cells have unique IDs)
        let cell3 = Cell::new_markdown("Third".to_string());
        let cell3_id = cell3.id;
        notebook.insert_cell(cell3, 1).unwrap();

        // The same cell inserted again (clone) - different IDs even if same content
        let cell4 = Cell::new_markdown("Third".to_string());
        notebook.insert_cell(cell4, 2).unwrap();

        assert_eq!(notebook.cells().len(), 4);
        assert_ne!(notebook.cells()[1].id, notebook.cells()[2].id);
        assert_eq!(notebook.cells()[1].content, notebook.cells()[2].content);

        // Delete and reinsert
        notebook.delete_cell(cell3_id).unwrap();
        assert_eq!(notebook.cells().len(), 3);
    }

    #[test]
    fn test_code_cell_modification() {
        let mut notebook = Notebook::new();
        let code_cell = Cell::new_code("x = 1".to_string());
        let cell_id = code_cell.id;

        notebook.insert_cell(code_cell, 0).unwrap();

        // Modify code cell properties
        let cell_mut = notebook.get_cell_mut(cell_id).unwrap();

        if let CellKind::Code {
            outputs,
            execution_number,
        } = &mut cell_mut.kind
        {
            outputs.push(CellOutput {
                text: "2".to_string(),
                execution_number: None,
            });
            outputs.push(CellOutput {
                text: "3".to_string(),
                execution_number: Some(42),
            });
            *execution_number = Some(42);
        }

        // Verify modifications
        let cell_ref = notebook.get_cell(cell_id).unwrap();
        if let CellKind::Code {
            outputs,
            execution_number,
        } = &cell_ref.kind
        {
            assert_eq!(outputs.len(), 2);
            assert_eq!(outputs[0].text, "2");
            assert_eq!(outputs[1].text, "3");
            assert_eq!(outputs[0].execution_number, None);
            assert_eq!(outputs[1].execution_number, Some(42));
            assert_eq!(*execution_number, Some(42));
        }
    }

    #[test]
    fn test_notebook_clone() {
        let mut notebook = Notebook::new();
        let cell = Cell::new_markdown("Original".to_string());
        let cell_id = cell.id;

        notebook.insert_cell(cell, 0).unwrap();

        // Clone should create independent copy
        let mut cloned_notebook = notebook.clone();

        // Modify original
        let cell_mut = notebook.get_cell_mut(cell_id).unwrap();
        cell_mut.content = "Modified".to_string();

        // Clone should not be affected
        let cloned_cell = cloned_notebook.get_cell(cell_id).unwrap();
        assert_eq!(cloned_cell.content, "Original");

        // Modify clone
        let cell_mut_clone = cloned_notebook.get_cell_mut(cell_id).unwrap();
        cell_mut_clone.content = "Clone Modified".to_string();

        // Original should not be affected
        let original_cell = notebook.get_cell(cell_id).unwrap();
        assert_eq!(original_cell.content, "Modified");
    }
}
