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
                version: state.notebook.get_version().await,
                users: state.users.read().await.values().cloned().collect(),
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
    state: &AppState,
) -> Result<(), Box<dyn std::error::Error>> {
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
    if let Some(user) = state.users.write().await.get_mut(&user_id) {
        user.focused_cell = Some(cell_id);
        user.cursor_position = cursor_position;
    }
}

pub async fn clear_focus_for_cell(cell_id: CellId, state: &AppState) {
    let mut users = state.users.write().await;
    for user in users.values_mut() {
        if user.focused_cell == Some(cell_id) {
            user.focused_cell = None;
            user.cursor_position = None;
        }
    }
}
