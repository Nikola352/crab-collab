use crate::error::ExecutionError;
use crate::types::{Execution, ExecutionOutput, ExecutionResult};
use kernel::client::{JupyterClient, KernelOutput, OutputEvent};
use kernel::model::{ExecutionStatus, KernelState};
use notebook::notebook::{Cell, CellId};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::mpsc::{Receiver, Sender};
use tokio::sync::{RwLock, mpsc};
use uuid::Uuid;

pub struct ExecutionQueue {
    jupyter_client: JupyterClient,
    pending_executions: Arc<RwLock<HashMap<CellId, Execution>>>,
}

impl ExecutionQueue {
    pub async fn new() -> Result<(Self, Receiver<ExecutionResult>), ExecutionError> {
        let (jupyter_client, kernel_rx) = JupyterClient::new().await?;
        let (tx, rx) = mpsc::channel::<ExecutionResult>(256);

        let pending = Arc::new(RwLock::new(HashMap::new()));
        tokio::spawn(output_receiver(kernel_rx, tx, Arc::clone(&pending)));

        Ok((
            Self {
                jupyter_client,
                pending_executions: pending,
            },
            rx,
        ))
    }

    pub async fn execute(&mut self, cell: Cell, requester_id: Uuid) -> Result<(), ExecutionError> {
        {
            if self.pending_executions.read().await.contains_key(&cell.id) {
                return Err(ExecutionError::AlreadyQueued(cell.id));
            }
        }

        let msg_id = self.jupyter_client.execute_code(&cell.content).await?;

        let execution = Execution {
            message_id: msg_id,
            cell_id: cell.id,
            requester_id,
            timestamp: chrono::Utc::now(),
        };

        self.pending_executions
            .write()
            .await
            .insert(cell.id, execution);

        Ok(())
    }
}

async fn output_receiver(
    mut kernel_rx: Receiver<KernelOutput>,
    tx: Sender<ExecutionResult>,
    pending_executions: Arc<RwLock<HashMap<CellId, Execution>>>,
) {
    while let Some(msg) = kernel_rx.recv().await {
        let parent_id = match &msg.parent_id {
            Some(id) => id.clone(),
            None => continue,
        };

        match msg.output {
            OutputEvent::ExecuteResult {
                execution_count,
                data,
            } => {
                let execution = find_execution_by_parent(&pending_executions, &parent_id).await;
                if let Some(execution) = execution {
                    let text = data.text_plain.unwrap_or_default();
                    let _ = tx
                        .send(ExecutionResult {
                            execution,
                            output: ExecutionOutput::Result {
                                execution_count,
                                data: text,
                            },
                        })
                        .await;
                }
            }
            OutputEvent::Stream { text, .. } => {
                let execution = find_execution_by_parent(&pending_executions, &parent_id).await;
                if let Some(execution) = execution {
                    let _ = tx
                        .send(ExecutionResult {
                            execution,
                            output: ExecutionOutput::Stream { text },
                        })
                        .await;
                }
            }
            OutputEvent::Error {
                ename,
                evalue,
                traceback,
            } => {
                let execution = find_execution_by_parent(&pending_executions, &parent_id).await;
                if let Some(execution) = execution {
                    let _ = tx
                        .send(ExecutionResult {
                            execution,
                            output: ExecutionOutput::Error {
                                ename,
                                evalue,
                                traceback,
                            },
                        })
                        .await;
                }
            }
            OutputEvent::ExecutionFinished {
                execution_count,
                status,
            } => {
                let execution = find_execution_by_parent(&pending_executions, &parent_id).await;
                if let Some(execution) = execution {
                    let _ = tx
                        .send(ExecutionResult {
                            execution,
                            output: ExecutionOutput::ExecutionFinished {
                                status: match status {
                                    ExecutionStatus::Ok => "ok".to_owned(),
                                    ExecutionStatus::Error => "error".to_owned(),
                                    ExecutionStatus::Abort => "abort".to_owned(),
                                },
                                execution_count,
                            },
                        })
                        .await;
                }
            }
            OutputEvent::Status { state } => {
                if let KernelState::Idle = state {
                    let execution = take_execution_by_parent(&pending_executions, &parent_id).await;
                    if let Some(execution) = execution {
                        let _ = tx
                            .send(ExecutionResult {
                                execution,
                                output: ExecutionOutput::CellIdle,
                            })
                            .await;
                    }
                }
            }
            _ => {}
        }
    }
}

async fn find_execution_by_parent(
    pending: &Arc<RwLock<HashMap<CellId, Execution>>>,
    parent_id: &str,
) -> Option<Execution> {
    let map = pending.read().await;
    map.values()
        .find(|exec| exec.message_id == parent_id)
        .cloned()
}

/// Find and remove the execution from pending, allowing the cell to be re-executed.
async fn take_execution_by_parent(
    pending: &Arc<RwLock<HashMap<CellId, Execution>>>,
    parent_id: &str,
) -> Option<Execution> {
    let mut map = pending.write().await;
    let cell_id = map
        .iter()
        .find(|(_, exec)| exec.message_id == parent_id)
        .map(|(id, _)| *id);
    cell_id.and_then(|id| map.remove(&id))
}
