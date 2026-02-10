use crate::cell::CellKind::Markdown;
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
        Cell {
            id: Uuid::new_v4(),
            content,
            kind: Markdown,
        }
    }

    pub fn new_code(content: String) -> Self {
        Cell {
            id: Uuid::new_v4(),
            content,
            kind: CellKind::Code {
                outputs: Vec::new(),
                execution_number: None,
            },
        }
    }
}
