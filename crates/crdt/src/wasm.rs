use crate::list::FractionalList as CoreFractionalList;
use fractional_index::FractionalIndex;
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

fn parse_index(index: &str) -> Result<FractionalIndex, JsValue> {
    FractionalIndex::from_string(index).map_err(|err| JsValue::from_str(&err.to_string()))
}

fn parse_indexes(indexes: JsValue) -> Result<HashMap<String, FractionalIndex>, JsValue> {
    let indexes = serde_wasm_bindgen::from_value::<HashMap<String, String>>(indexes)
        .map_err(|err| JsValue::from_str(&err.to_string()))?;

    indexes
        .into_iter()
        .map(|(id, index)| parse_index(&index).map(|index| (id, index)))
        .collect()
}

/// Computes a new fractional index based on a given optional lower and upper bounds.
///
/// Returns a value based on which bounds are provided:
/// - both `left` and `right` given: an index strictly between them (errors if
///   `left` does not sort before `right`).
/// - only `left` given: an index sorting after it.
/// - only `right` given: an index sorting before it.
/// - neither given: the default index for an empty list.
#[wasm_bindgen(js_name = newIndexBetween)]
pub fn new_index_between(left: Option<String>, right: Option<String>) -> Result<String, JsValue> {
    let left = left.as_deref().map(parse_index).transpose()?;
    let right = right.as_deref().map(parse_index).transpose()?;

    FractionalIndex::new(left.as_ref(), right.as_ref())
        .map(|index| index.to_string())
        .ok_or_else(|| JsValue::from_str("`left` must be strictly before `right`"))
}

/// A fractional-index-ordered list, keyed by opaque string element ids.
#[wasm_bindgen]
pub struct FractionalList {
    inner: CoreFractionalList<String>,
}

#[wasm_bindgen]
impl FractionalList {
    /// Creates a new empty `FractionalList`.
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            inner: CoreFractionalList::new(),
        }
    }

    /// Creates a `FractionalList` from element ids and their fractional indexes.
    ///
    /// `indexes` must be an object mapping every id in `ids` to a fractional index string.
    #[wasm_bindgen(js_name = from)]
    pub fn from_js(ids: Vec<String>, indexes: JsValue) -> Result<FractionalList, JsValue> {
        let indexes = parse_indexes(indexes)?;

        for id in &ids {
            if !indexes.contains_key(id) {
                return Err(JsValue::from_str(&format!("missing index for id `{id}`")));
            }
        }

        Ok(Self {
            inner: CoreFractionalList::from(ids, indexes),
        })
    }

    /// Returns the element ids in their current sorted order.
    #[wasm_bindgen(js_name = getOrdered)]
    pub fn get_ordered(&self) -> Vec<String> {
        self.inner.get_ordered().cloned().collect::<Vec<String>>()
    }

    /// Returns a mapping from ids to fractional index strings for all elements.
    #[wasm_bindgen(js_name = getIndexesById)]
    pub fn get_indexes_by_id(&self) -> JsValue {
        let indexes = self
            .inner
            .get_indexes_by_id()
            .iter()
            .map(|(id, index)| (id.clone(), index.to_string()))
            .collect::<HashMap<_, _>>();

        serde_wasm_bindgen::to_value(&indexes)
            .expect("fractional list index serialization is infallible")
    }

    /// Returns the fractional index of the element with the given id, if any.
    #[wasm_bindgen(js_name = getIndex)]
    pub fn get_index(&self, id: &str) -> Option<String> {
        self.inner
            .get_indexes_by_id()
            .get(id)
            .map(|index| index.to_string())
    }

    /// Returns the element id exactly at the given fractional index, if any.
    #[wasm_bindgen(js_name = getElementAt)]
    pub fn get_element_at(&self, index: &str) -> Result<Option<String>, JsValue> {
        let index = parse_index(index)?;
        Ok(self.inner.get_element_at(&index).cloned())
    }

    /// Inserts an element at the specified fractional index.
    ///
    /// Returns the actual fractional index assigned to the element. The returned
    /// index may differ from the requested index when the requested index is
    /// already occupied.
    #[wasm_bindgen(js_name = insertAt)]
    pub fn insert_at(&mut self, id: String, index: &str) -> Result<String, JsValue> {
        let index = parse_index(index)?;
        Ok(self.inner.insert_at(id, &index).to_string())
    }

    /// Deletes an element by id.
    pub fn delete(&mut self, id: String) {
        self.inner.delete(id);
    }

    /// Moves an existing element to the specified fractional index.
    ///
    /// Returns the actual fractional index assigned to the element. The returned
    /// index may differ from the requested index when the requested index is
    /// already occupied.
    #[wasm_bindgen(js_name = moveTo)]
    pub fn move_to(&mut self, id: String, index: &str) -> Result<String, JsValue> {
        let index = parse_index(index)?;
        Ok(self.inner.move_to(id, &index).to_string())
    }

    /// Moves an element to the specified index, preserving that exact index.
    ///
    /// If another element occupies the index, it is moved to a new index first.
    #[wasm_bindgen(js_name = moveToStrict)]
    pub fn move_to_strict(&mut self, id: String, index: &str) -> Result<String, JsValue> {
        let index = parse_index(index)?;
        Ok(self.inner.move_to_strict(id, &index).to_string())
    }
}

impl Default for FractionalList {
    fn default() -> Self {
        Self::new()
    }
}
