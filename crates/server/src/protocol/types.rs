use crate::protocol::message::ServerMessage;
use tokio::sync::mpsc::Sender;
use uuid::Uuid;

pub type UserId = Uuid;

pub type CellId = Uuid;

pub struct User {
    pub id: UserId,
    pub name: Option<String>,
    pub focused_cell: Option<CellId>,
    pub cursor_position: Option<usize>,
    pub tx_channel: Sender<ServerMessage>,
}

impl User {
    pub fn new(tx_channel: Sender<ServerMessage>) -> Self {
        Self {
            id: UserId::new_v4(),
            name: None,
            focused_cell: None,
            cursor_position: None,
            tx_channel,
        }
    }
}
