use crate::notebook::Cell;

#[derive(Debug, Clone)]
pub struct OperationResult {
    pub version: u64,
    pub data: OperationResultData,
}

#[derive(Debug, Clone)]
pub enum OperationResultData {
    InsertCell {
        position: usize,
        cell: Cell
    },
}
