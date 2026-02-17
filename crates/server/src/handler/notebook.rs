use crate::handler;
use crate::protocol::message::{CellType, ServerMessage};
use crate::protocol::types::{CellId, OperationContext, StateUpdateContext, UserId};
use crate::state::AppState;
use notebook::error::NotebookError;
use notebook::notebook::Cell;
use notebook::operation::Operation;
use notebook::operation::result::OperationResultData;
use std::error::Error;

pub async fn handle_insert_cell(
    user_id: UserId,
    context: OperationContext,
    index: usize,
    cell_id: CellId,
    cell_type: CellType,
    content: Option<String>,
    state: &AppState,
) -> Result<(), Box<dyn Error>> {
    let operation = Operation::InsertCell {
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
        .apply_operation(operation, context.base_version)
        .await;

    match result {
        Ok(result) => {
            if let OperationResultData::InsertCell {
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
    context: OperationContext,
    cell_id: CellId,
    state: &AppState,
) -> Result<(), Box<dyn Error>> {
    let operation = Operation::DeleteCell { cell_id };

    let result = state
        .notebook
        .apply_operation(operation, context.base_version)
        .await;

    match result {
        Ok(result) => {
            if let OperationResultData::DeleteCell { cell_id, .. } = result.data {
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
    context: OperationContext,
    cell_id: CellId,
    to_index: usize,
    state: &AppState,
) -> Result<(), Box<dyn Error>> {
    let operation = Operation::MoveCell { cell_id, to_index };

    let result = state
        .notebook
        .apply_operation(operation, context.base_version)
        .await;

    match result {
        Ok(result) => {
            if let OperationResultData::MoveCell {
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

pub async fn handle_text_insert(
    user_id: UserId,
    context: OperationContext,
    cell_id: CellId,
    start_position: usize,
    text: String,
    state: &AppState,
) -> Result<(), Box<dyn Error>> {
    let operation = Operation::TextInsert {
        cell_id,
        start_position,
        text,
    };

    let result = state
        .notebook
        .apply_operation(operation, context.base_version)
        .await;

    match result {
        Ok(result) => {
            if let OperationResultData::TextInsert {
                cell_id,
                start_position,
                end_position,
                text,
            } = result.data
            {
                handler::user::set_focus(user_id, cell_id, Some(end_position), state).await;

                state
                    .broadcast(
                        ServerMessage::TextInsert {
                            context: create_output_context(result.version, user_id, &context),
                            cell_id,
                            start_position,
                            end_position,
                            text,
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

pub async fn handle_text_delete(
    user_id: UserId,
    context: OperationContext,
    cell_id: CellId,
    start_position: usize,
    end_position: usize,
    state: &AppState,
) -> Result<(), Box<dyn Error>> {
    let operation = Operation::TextDelete {
        cell_id,
        start_position,
        end_position,
    };

    let result = state
        .notebook
        .apply_operation(operation, context.base_version)
        .await;

    match result {
        Ok(result) => {
            if let OperationResultData::TextDelete {
                cell_id,
                start_position,
                end_position,
            } = result.data
            {
                handler::user::set_focus(user_id, cell_id, Some(start_position), state).await;

                state
                    .broadcast(
                        ServerMessage::TextDelete {
                            context: create_output_context(result.version, user_id, &context),
                            cell_id,
                            start_position,
                            end_position,
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

fn create_output_context(
    version: u64,
    user_id: UserId,
    context: &OperationContext,
) -> StateUpdateContext {
    StateUpdateContext {
        version,
        user_id,
        request_id: context.request_id,
    }
}

async fn send_error_message(
    user_id: UserId,
    context: &OperationContext,
    state: &AppState,
    err: NotebookError,
) -> Result<(), Box<dyn Error>> {
    if let Some(user) = state.users.read().await.get(&user_id) {
        user.tx_channel
            .send(ServerMessage::OperationFailed {
                context: StateUpdateContext {
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
