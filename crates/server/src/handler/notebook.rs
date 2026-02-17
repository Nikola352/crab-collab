use crate::protocol::message::{CellType, ServerMessage};
use crate::protocol::types::{CellId, OperationContext, StateUpdateContext, UserId};
use crate::state::AppState;
use notebook::notebook::Cell;
use notebook::operation::Operation;
use notebook::operation::result::OperationResultData;

pub async fn handle_insert_cell(
    user_id: UserId,
    context: OperationContext,
    position: usize,
    cell_id: CellId,
    cell_type: CellType,
    content: Option<String>,
    state: &AppState,
) -> Result<(), Box<dyn std::error::Error>> {
    let operation = Operation::InsertCell {
        index: position,
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
            if let OperationResultData::InsertCell { position, cell } = result.data {
                state
                    .broadcast(
                        ServerMessage::CellInsert {
                            context: StateUpdateContext {
                                version: result.version,
                                user_id,
                                request_id: context.request_id,
                            },
                            position,
                            cell,
                        },
                        None,
                    )
                    .await?;
            } else {
                tracing::error!("Operation produced incorrect result type. Result: {result:?}");
            }
        }
        Err(err) => {
            if let Some(user) = state.users.read().await.values().find(|u| u.id == user_id) {
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
        }
    }

    Ok(())
}
