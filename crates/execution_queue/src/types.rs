use chrono::{DateTime, Utc};
use notebook::notebook::CellId;
use serde::Serialize;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct Execution {
    pub message_id: String,
    pub cell_id: CellId,
    pub requester_id: Uuid,
    pub timestamp: DateTime<Utc>,
    pub status: ExecutionStatus,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionStatus {
    Pending,
    Executing,
    Finished,
}

#[derive(Debug, Clone)]
pub struct ExecutionResult {
    pub execution: Execution,
    pub output: ExecutionOutput,
}

#[derive(Debug, Clone)]
pub enum ExecutionOutput {
    ExecutionStarted,
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
    ExecutionFinished {
        status: String,
        execution_count: u32,
    },
    CellIdle,
}
