use crate::protocol::message::ServerMessage;
use crate::protocol::types::UserId;
use crate::state::AppState;

pub async fn handle_join(user_id: UserId, name: String, state: &AppState) {
    let display_name = {
        let mut users = state.users.write().await;
        if let Some(user) = users.get_mut(&user_id) {
            user.name = Some(name);
            user.name.clone()
        } else {
            None
        }
    };

    if let Some(name) = display_name {
        state
            .broadcast(ServerMessage::Join { user_id, name }, Some(user_id))
            .await;
    }
}

pub async fn handle_leave(user_id: UserId, state: &AppState) {
    state
        .broadcast(ServerMessage::Leave { user_id }, None)
        .await;
}
