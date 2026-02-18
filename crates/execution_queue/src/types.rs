use chrono::{DateTime, Utc};
use notebook::notebook::CellId;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct Execution {
    pub message_id: String,
    pub cell_id: CellId,
    pub requester_id: Uuid,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct ExecutionResult {
    pub execution: Execution,
    pub output: ExecutionOutput,
}

#[derive(Debug, Clone)]
pub enum ExecutionOutput {
    Result {
        execution_count: u32,
        data: String,
    },
    Stream {
        text: String,
    },
    Error {
        ename: String,
        evalue: String,
        traceback: Vec<String>,
    },
}
