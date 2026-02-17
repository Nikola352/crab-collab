use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub type CellId = Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Cell {
    pub id: CellId,
    pub content: String,
    #[serde(flatten)]
    pub kind: CellKind,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "cell_type", rename_all = "snake_case")]
pub enum CellKind {
    Markdown,
    Code {
        outputs: Vec<String>,
        execution_number: Option<u32>,
    },
}

impl Cell {
    pub fn new_markdown(content: String) -> Self {
        Self::new_markdown_with_id(Uuid::new_v4(), content)
    }

    pub fn new_markdown_with_id(id: CellId, content: String) -> Self {
        Cell {
            id,
            content,
            kind: CellKind::Markdown,
        }
    }

    pub fn new_code(content: String) -> Self {
        Self::new_code_with_id(Uuid::new_v4(), content)
    }

    pub fn new_code_with_id(id: CellId, content: String) -> Self {
        Cell {
            id,
            content,
            kind: CellKind::Code {
                outputs: Vec::new(),
                execution_number: None,
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cell_creation() {
        // Test Markdown cell creation
        let md_cell = Cell::new_markdown("# Hello World".to_string());
        assert!(!md_cell.id.is_nil());
        assert_eq!(md_cell.content, "# Hello World");
        match md_cell.kind {
            CellKind::Markdown => (), // Expected
            _ => panic!("Expected Markdown cell"),
        }

        // Test code cell creation
        let code_cell = Cell::new_code("print('test')".to_string());
        assert!(!code_cell.id.is_nil());
        assert_eq!(code_cell.content, "print('test')");
        match code_cell.kind {
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
}
