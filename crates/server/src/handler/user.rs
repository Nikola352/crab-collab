use crate::handler::execution::get_pending_executions;
use crate::protocol::message::ServerMessage;
use crate::protocol::types::{CellId, UserId};
use crate::state::AppState;

pub async fn handle_join(
    user_id: UserId,
    name: String,
    state: &AppState,
) -> Result<(), Box<dyn std::error::Error>> {
    let (display_name, tx) = {
        let mut users = state.users.write().await;
        if let Some(user) = users.get_mut(&user_id) {
            user.name = Some(name);
            (user.name.clone(), Some(user.tx_channel.clone()))
        } else {
            (None, None)
        }
    };

    if let Some(name) = display_name {
        state
            .broadcast(ServerMessage::Join { user_id, name }, Some(user_id))
            .await?;
    }

    if let Some(sender) = tx {
        sender
            .send(ServerMessage::FullState {
                notebook: state.notebook.get_notebook().await.clone(),
                cell_metadata: state.notebook.get_cell_metadata().await,
                version: state.notebook.get_version().await,
                cell_versions: state.notebook.get_cell_versions().await,
                pending_executions: get_pending_executions(state).await,
                users: state.users_snapshot().await,
                user_id,
            })
            .await?;
    }

    Ok(())
}

pub async fn handle_leave(
    user_id: UserId,
    state: &AppState,
) -> Result<(), Box<dyn std::error::Error>> {
    state
        .broadcast(ServerMessage::Leave { user_id }, None)
        .await?;
    Ok(())
}

pub async fn handle_change_focus(
    user_id: UserId,
    cell_id: CellId,
    cursor_position: usize,
    base_cell_version: u64,
    state: &AppState,
) -> Result<(), Box<dyn std::error::Error>> {
    let cursor_position = state
        .notebook
        .rebase_cursor_position(cell_id, base_cell_version, cursor_position, user_id)
        .await;

    set_focus(user_id, cell_id, Some(cursor_position), state).await;

    state
        .broadcast(
            ServerMessage::ChangeFocus {
                user_id,
                cell_id,
                cursor_position,
            },
            Some(user_id),
        )
        .await?;
    Ok(())
}

pub async fn set_focus(
    user_id: UserId,
    cell_id: CellId,
    cursor_position: Option<usize>,
    state: &AppState,
) {
    if let Some(cursor_position) = cursor_position {
        state
            .focus
            .set_focus(user_id, cell_id, cursor_position)
            .await;
    } else {
        state.focus.clear_user_focus(user_id).await;
    }
}
