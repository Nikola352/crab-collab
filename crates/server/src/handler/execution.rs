use crate::protocol::message::ServerMessage;
use crate::protocol::types::{CellId, UserId};
use crate::state::AppState;
use execution_queue::types::{ExecutionOutput, ExecutionResult};
use notebook::notebook::{CellKind, CellOutput};
use std::error::Error;

pub async fn handle_execute(
    user_id: UserId,
    cell_id: CellId,
    state: &AppState,
) -> Result<(), Box<dyn Error>> {
    let notebook = state.notebook.get_notebook().await;
    let cell = notebook.get_cell(cell_id)?;

    if !matches!(cell.kind, CellKind::Code { .. }) {
        tracing::error!("Cell {cell_id} is not a code cell");
        return Ok(());
    }

    let cell_clone = cell.clone();
    state
        .execution_queue
        .lock()
        .await
        .execute(cell_clone, user_id)
        .await
        .map_err(|e| {
            tracing::error!("Failed to queue execution for cell {cell_id}: {e}");
            e
        })?;

    state
        .broadcast(ServerMessage::ExecutionPending { cell_id, user_id }, None)
        .await?;

    Ok(())
}

pub async fn handle_output(
    output: ExecutionResult,
    state: &AppState,
) -> Result<(), Box<dyn Error>> {
    let cell_id = output.execution.cell_id;

    match output.output {
        ExecutionOutput::Result {
            execution_count,
            data,
        } => {
            state
                .notebook
                .append_cell_output(
                    cell_id,
                    CellOutput {
                        text: data.clone(),
                        execution_number: Some(execution_count),
                    },
                )
                .await?;

            state
                .broadcast(
                    ServerMessage::CellOutput {
                        cell_id,
                        execution_count,
                        text: data,
                    },
                    None,
                )
                .await?;
        }
        ExecutionOutput::Stream { text } => {
            state
                .notebook
                .append_cell_output(
                    cell_id,
                    CellOutput {
                        text: text.clone(),
                        execution_number: None,
                    },
                )
                .await?;

            state
                .broadcast(
                    ServerMessage::CellOutput {
                        cell_id,
                        execution_count: 0,
                        text,
                    },
                    None,
                )
                .await?;
        }
        ExecutionOutput::Error {
            ename,
            evalue,
            traceback,
        } => {
            let error_text = format!("{ename}: {evalue}\n{}", traceback.join("\n"));

            state
                .notebook
                .append_cell_output(
                    cell_id,
                    CellOutput {
                        text: error_text.clone(),
                        execution_number: None,
                    },
                )
                .await?;

            state
                .broadcast(
                    ServerMessage::CellOutput {
                        cell_id,
                        execution_count: 0,
                        text: error_text,
                    },
                    None,
                )
                .await?;
        }
        ExecutionOutput::ExecutionStarted {} => {
            state.notebook.clear_cell_output(cell_id).await?;

            state
                .broadcast(ServerMessage::ExecutionStarted { cell_id }, None)
                .await?;
        }
        ExecutionOutput::ExecutionFinished {
            status,
            execution_count,
        } => {
            state
                .notebook
                .set_cell_execution_number(cell_id, execution_count)
                .await?;

            state
                .broadcast(
                    ServerMessage::ExecutionFinished {
                        cell_id,
                        status,
                        execution_count,
                    },
                    None,
                )
                .await?;
        }
        ExecutionOutput::CellIdle => {
            state
                .broadcast(ServerMessage::CellIdle { cell_id }, None)
                .await?;
        }
    }

    Ok(())
}
