use crate::protocol::types::{CellId, UserId};
use ot::text::{TextOperation, transform_position};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

type CellFocusBucket = Arc<RwLock<HashMap<UserId, usize>>>;

struct FocusIndex {
    by_user: HashMap<UserId, CellId>,
    by_cell: HashMap<CellId, CellFocusBucket>,
}

pub struct FocusState {
    // by_user and by_cell are guarded together so a user's cell membership
    // change (set_focus/clear_user_focus/clear_cell_focus) is atomic and
    // can't interleave with another such change for the same cell. Cursor
    // positions live in the per-cell buckets, so text edits only ever lock
    // the edited cell's bucket, not this index.
    index: RwLock<FocusIndex>,
}

impl FocusState {
    pub fn new() -> Self {
        Self {
            index: RwLock::new(FocusIndex {
                by_user: HashMap::new(),
                by_cell: HashMap::new(),
            }),
        }
    }

    pub async fn set_focus(&self, user_id: UserId, cell_id: CellId, cursor_position: usize) {
        let mut index = self.index.write().await;

        let previous_cell = index.by_user.insert(user_id, cell_id);
        if let Some(previous_cell) = previous_cell
            && previous_cell != cell_id
            && let Some(previous_bucket) = index.by_cell.get(&previous_cell).cloned()
        {
            previous_bucket.write().await.remove(&user_id);
        }

        let current_bucket = index
            .by_cell
            .entry(cell_id)
            .or_insert_with(|| Arc::new(RwLock::new(HashMap::new())))
            .clone();

        current_bucket.write().await.insert(user_id, cursor_position);
    }

    pub async fn clear_user_focus(&self, user_id: UserId) {
        let mut index = self.index.write().await;

        let Some(previous_cell) = index.by_user.remove(&user_id) else {
            return;
        };

        if let Some(bucket) = index.by_cell.get(&previous_cell).cloned() {
            bucket.write().await.remove(&user_id);
        }
    }

    pub async fn clear_cell_focus(&self, cell_id: CellId) {
        let mut index = self.index.write().await;

        let Some(bucket) = index.by_cell.remove(&cell_id) else {
            return;
        };

        let focused_users = {
            let mut positions = bucket.write().await;
            let focused_users = positions.keys().copied().collect::<Vec<_>>();
            positions.clear();
            focused_users
        };

        for user_id in focused_users {
            if index.by_user.get(&user_id) == Some(&cell_id) {
                index.by_user.remove(&user_id);
            }
        }
    }

    pub async fn transform_positions_for_text_edit(
        &self,
        cell_id: CellId,
        operation: &TextOperation,
    ) {
        let bucket = {
            let index = self.index.read().await;
            index.by_cell.get(&cell_id).cloned()
        };

        let Some(bucket) = bucket else {
            return;
        };

        let mut positions = bucket.write().await;
        for position in positions.values_mut() {
            *position = transform_position(*position, operation);
        }
    }

    pub async fn snapshot(&self) -> HashMap<UserId, (CellId, usize)> {
        let buckets = {
            let index = self.index.read().await;
            index
                .by_cell
                .iter()
                .map(|(cell_id, bucket)| (*cell_id, bucket.clone()))
                .collect::<Vec<_>>()
        };

        let mut focus = HashMap::new();
        for (cell_id, bucket) in buckets {
            for (user_id, position) in bucket.read().await.iter() {
                focus.insert(*user_id, (cell_id, *position));
            }
        }

        focus
    }
}
