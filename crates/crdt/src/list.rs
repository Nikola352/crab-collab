use fractional_index::FractionalIndex;
use std::collections::{BTreeMap, HashMap};
use std::hash::Hash;
use std::ops::Bound::{Excluded, Unbounded};

/// Bound required of any id used with `FractionalList`: cheap to duplicate and usable as a `HashMap` key.
/// Blanket-implemented so `Uuid`, `String`, `u64`, etc. all qualify without extra boilerplate.
pub trait ElementId: Clone + Eq + Hash {}
impl<T: Clone + Eq + Hash> ElementId for T {}

/// A fractional-index-ordered list
pub struct FractionalList<Id: ElementId> {
    by_id: HashMap<Id, FractionalIndex>,
    by_index: BTreeMap<FractionalIndex, Id>,
}

impl<Id: ElementId> FractionalList<Id> {
    /// Creates a new empty `FractionalList`.
    pub fn new() -> Self {
        Self {
            by_id: HashMap::new(),
            by_index: BTreeMap::new(),
        }
    }

    /// Creates a new `FractionalList` with elements and their mapping to fractional indexes.
    pub fn from<I>(ids: I, indexes: HashMap<Id, FractionalIndex>) -> Self
    where
        I: IntoIterator<Item = Id>,
    {
        let by_index = ids
            .into_iter()
            .map(|id| {
                let idx = indexes[&id].clone();
                (idx, id)
            })
            .collect::<BTreeMap<_, _>>();

        Self {
            by_id: indexes,
            by_index,
        }
    }

    /// Returns an iterator over the element IDs in their current sorted order.
    pub fn get_ordered(&self) -> impl Iterator<Item = &Id> {
        self.by_index.values()
    }

    /// Returns a mapping from ids to fractional indexes for all elements.
    pub fn get_indexes_by_id(&self) -> &HashMap<Id, FractionalIndex> {
        &self.by_id
    }

    /// Returns a reference to an element exactly at the given index, if any.
    pub fn get_element_at(&self, index: &FractionalIndex) -> Option<&Id> {
        self.by_index.get(index)
    }

    /// Inserts an element at the specified position in the list.
    ///
    /// This method attempts to place the element at the given `index`. If the index is already
    /// occupied, it automatically generates a new fractional index that places the element
    /// immediately after the existing element at that position.
    ///
    /// # Returns
    /// The actual `FractionalIndex` assigned to the element, which may differ from the
    /// requested index if a collision occurred.
    pub fn insert_at(&mut self, id: Id, index: &FractionalIndex) -> FractionalIndex {
        let new_index = self.get_real_index(index);
        self.by_id.insert(id.clone(), new_index.clone());
        self.by_index.insert(new_index.clone(), id);
        new_index
    }

    /// Deletes an element from the list by its ID.
    ///
    /// If the element exists, it is removed from both the ID-to-index mapping and the
    /// ordered index mapping. If the element doesn't exist, this method does nothing.
    pub fn delete(&mut self, id: Id) {
        if let Some(idx) = self.by_id.remove(&id) {
            self.by_index.remove(&idx);
        }
    }

    /// Moves an existing element to a new position in the list.
    ///
    /// If the element exists, it is removed from its current position and reinserted at the
    /// specified index. If the target index is occupied, a new fractional index is generated
    /// to place the element immediately after the existing element at that position.
    ///
    /// # Returns
    /// The actual `FractionalIndex` assigned to the element after the move, which may differ
    /// from the requested index if a collision occurred.
    pub fn move_to(&mut self, id: Id, index: &FractionalIndex) -> FractionalIndex {
        let new_index = self.get_real_index(index);

        if let Some(idx) = self.by_id.get_mut(&id) {
            self.by_index.remove(idx);
            self.by_index.insert(new_index.clone(), id);
            *idx = new_index.clone();
        }

        new_index
    }

    fn get_real_index(&self, index: &FractionalIndex) -> FractionalIndex {
        if !self.by_index.contains_key(index) {
            return index.clone();
        }
        match self.by_index.range((Excluded(index), Unbounded)).next() {
            Some((idx, _)) => FractionalIndex::new_between(index, idx).unwrap(),
            None => FractionalIndex::new_after(index),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ordered_ids(list: &FractionalList<&'static str>) -> Vec<&'static str> {
        list.get_ordered().copied().collect()
    }

    #[test]
    fn new_list_is_empty() {
        let list: FractionalList<&str> = FractionalList::new();

        assert_eq!(ordered_ids(&list), Vec::<&str>::new());
        assert_eq!(list.get_element_at(&FractionalIndex::default()), None);
    }

    #[test]
    fn inserts_items_in_fractional_index_order() {
        let mut list = FractionalList::new();
        let middle = FractionalIndex::default();
        let first = FractionalIndex::new_before(&middle);
        let last = FractionalIndex::new_after(&middle);

        assert_eq!(list.insert_at("middle", &middle), middle);
        assert_eq!(list.insert_at("last", &last), last);
        assert_eq!(list.insert_at("first", &first), first);

        assert_eq!(ordered_ids(&list), vec!["first", "middle", "last"]);
        assert_eq!(list.get_element_at(&middle), Some(&"middle"));
    }

    #[test]
    fn from_reconstructs_list_from_ids_and_indexes() {
        let middle = FractionalIndex::default();
        let first = FractionalIndex::new_before(&middle);
        let last = FractionalIndex::new_after(&middle);
        let indexes = HashMap::from([("middle", middle), ("first", first), ("last", last)]);

        let list = FractionalList::from(["middle", "first", "last"], indexes.clone());

        assert_eq!(ordered_ids(&list), vec!["first", "middle", "last"]);
        assert_eq!(list.get_indexes_by_id(), &indexes);
    }

    #[test]
    fn insert_at_occupied_index_assigns_next_available_index() {
        let mut list = FractionalList::new();
        let requested = FractionalIndex::default();

        let first = list.insert_at("first", &requested);
        let second = list.insert_at("second", &requested);

        assert_eq!(first, requested);
        assert_ne!(second, requested);
        assert!(requested < second);
        assert_eq!(ordered_ids(&list), vec!["first", "second"]);
        assert_eq!(list.get_element_at(&requested), Some(&"first"));
        assert_eq!(list.get_element_at(&second), Some(&"second"));
    }

    #[test]
    fn delete_removes_existing_item_and_ignores_missing_item() {
        let mut list = FractionalList::new();
        let middle = FractionalIndex::default();
        let first = FractionalIndex::new_before(&middle);
        let last = FractionalIndex::new_after(&middle);

        list.insert_at("first", &first);
        list.insert_at("middle", &middle);
        list.insert_at("last", &last);

        list.delete("middle");
        assert_eq!(ordered_ids(&list), vec!["first", "last"]);
        assert_eq!(list.get_element_at(&middle), None);

        list.delete("missing");
        assert_eq!(ordered_ids(&list), vec!["first", "last"]);
    }

    #[test]
    fn move_to_reorders_existing_item() {
        let mut list = FractionalList::new();
        let middle = FractionalIndex::default();
        let first = FractionalIndex::new_before(&middle);
        let last = FractionalIndex::new_after(&middle);

        list.insert_at("first", &first);
        list.insert_at("middle", &middle);
        list.insert_at("last", &last);

        let moved = list.move_to("first", &last);

        assert!(last < moved);
        assert_eq!(ordered_ids(&list), vec!["middle", "last", "first"]);
        assert_eq!(list.get_element_at(&first), None);
        assert_eq!(list.get_element_at(&moved), Some(&"first"));
    }

    #[test]
    fn move_to_missing_item_does_not_insert() {
        let mut list = FractionalList::new();
        let existing = FractionalIndex::default();
        let requested = FractionalIndex::new_after(&existing);

        list.insert_at("existing", &existing);
        let assigned = list.move_to("missing", &requested);

        assert_eq!(assigned, requested);
        assert_eq!(ordered_ids(&list), vec!["existing"]);
        assert_eq!(list.get_element_at(&requested), None);
    }
}
