use crate::handler;
use crate::protocol::message::{CellType, ServerMessage};
use crate::protocol::types::{
    CellId, NotebookOperationContext, NotebookStateUpdateContext, TextOperationContext,
    TextStateUpdateContext, UserId,
};
use crate::state::AppState;
use notebook::error::NotebookError;
use notebook::notebook::Cell;
use notebook::operation::NotebookOperation;
use notebook::operation::result::NotebookOperationResultData;
use ot::text::TextOperation;
use std::error::Error;

pub async fn handle_insert_cell(
    user_id: UserId,
    context: NotebookOperationContext,
    index: usize,
    cell_id: CellId,
    cell_type: CellType,
    content: Option<String>,
    state: &AppState,
) -> Result<(), Box<dyn Error>> {
    let operation = NotebookOperation::InsertCell {
        index,
        cell: match cell_type {
            CellType::Markdown => {
                Cell::new_markdown_with_id(cell_id, content.unwrap_or(String::from("")))
            }
            CellType::Code => Cell::new_code_with_id(cell_id, content.unwrap_or(String::from(""))),
        },
    };

    let result = state
        .notebook
        .apply_cell_operation(operation, context.base_version)
        .await;

    match result {
        Ok(result) => {
            if let NotebookOperationResultData::InsertCell {
                position: index,
                cell,
            } = result.data
            {
                handler::user::set_focus(user_id, cell.id, Some(0), state).await;

                state
                    .broadcast(
                        ServerMessage::CellInsert {
                            context: create_output_context(result.version, user_id, &context),
                            index,
                            cell,
                        },
                        None,
                    )
                    .await?;
            } else {
                tracing::error!("Operation produced incorrect result type. Result: {result:?}");
            }
        }
        Err(err) => send_error_message(user_id, &context, state, err).await?,
    }

    Ok(())
}

pub async fn handle_delete_cell(
    user_id: UserId,
    context: NotebookOperationContext,
    cell_id: CellId,
    state: &AppState,
) -> Result<(), Box<dyn Error>> {
    let operation = NotebookOperation::DeleteCell { cell_id };

    let result = state
        .notebook
        .apply_cell_operation(operation, context.base_version)
        .await;

    match result {
        Ok(result) => {
            if let NotebookOperationResultData::DeleteCell { cell_id, .. } = result.data {
                handler::user::clear_focus_for_cell(cell_id, &state).await;

                state
                    .broadcast(
                        ServerMessage::CellDelete {
                            context: create_output_context(result.version, user_id, &context),
                            cell_id,
                        },
                        None,
                    )
                    .await?;
            } else {
                tracing::error!("Operation produced incorrect result type. Result: {result:?}");
            }
        }
        Err(err) => send_error_message(user_id, &context, state, err).await?,
    }

    Ok(())
}

pub async fn handle_move_cell(
    user_id: UserId,
    context: NotebookOperationContext,
    cell_id: CellId,
    to_index: usize,
    state: &AppState,
) -> Result<(), Box<dyn Error>> {
    let operation = NotebookOperation::MoveCell { cell_id, to_index };

    let result = state
        .notebook
        .apply_cell_operation(operation, context.base_version)
        .await;

    match result {
        Ok(result) => {
            if let NotebookOperationResultData::MoveCell {
                cell_id,
                from_index,
                to_index,
            } = result.data
            {
                state
                    .broadcast(
                        ServerMessage::CellMove {
                            context: create_output_context(result.version, user_id, &context),
                            cell_id,
                            from_index,
                            to_index,
                        },
                        None,
                    )
                    .await?;
            } else {
                tracing::error!("Operation produced incorrect result type. Result: {result:?}");
            }
        }
        Err(err) => send_error_message(user_id, &context, state, err).await?,
    }

    Ok(())
}

pub async fn handle_text_edit(
    user_id: UserId,
    context: TextOperationContext,
    cell_id: CellId,
    operation: TextOperation,
    state: &AppState,
) -> Result<(), Box<dyn Error>> {
    let result = state
        .notebook
        .apply_text_operation(operation, cell_id, context.base_cell_version)
        .await;

    match result {
        Ok(result) => {
            // TODO: sync focus
            // handler::user::set_focus(user_id, cell_id, Some(end_position), state).await;

            state
                .broadcast(
                    ServerMessage::TextEdit {
                        context: create_text_output_context(result.version, user_id, &context),
                        cell_id,
                        operation: result.operation,
                    },
                    None,
                )
                .await?;
        }
        Err(err) => send_text_error_message(user_id, &context, cell_id, state, err).await?,
    }

    Ok(())
}

fn create_output_context(
    version: u64,
    user_id: UserId,
    context: &NotebookOperationContext,
) -> NotebookStateUpdateContext {
    NotebookStateUpdateContext {
        version,
        user_id,
        request_id: context.request_id,
    }
}

fn create_text_output_context(
    cell_version: u64,
    user_id: UserId,
    context: &TextOperationContext,
) -> TextStateUpdateContext {
    TextStateUpdateContext {
        cell_version,
        user_id,
        request_id: context.request_id,
    }
}

async fn send_error_message(
    user_id: UserId,
    context: &NotebookOperationContext,
    state: &AppState,
    err: NotebookError,
) -> Result<(), Box<dyn Error>> {
    if let Some(user) = state.users.read().await.get(&user_id) {
        user.tx_channel
            .send(ServerMessage::OperationFailed {
                context: NotebookStateUpdateContext {
                    version: state.notebook.get_version().await,
                    user_id,
                    request_id: context.request_id,
                },
                message: err.to_string(),
            })
            .await?;
    }
    Ok(())
}

async fn send_text_error_message(
    user_id: UserId,
    context: &TextOperationContext,
    cell_id: CellId,
    state: &AppState,
    err: NotebookError,
) -> Result<(), Box<dyn Error>> {
    if let Some(user) = state.users.read().await.get(&user_id) {
        user.tx_channel
            .send(ServerMessage::TextOperationFailed {
                context: TextStateUpdateContext {
                    cell_version: state.notebook.get_cell_version(cell_id).await,
                    user_id,
                    request_id: context.request_id,
                },
                message: err.to_string(),
            })
            .await?;
    }
    Ok(())
}
