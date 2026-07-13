use crate::error::OTError;
use operational_transform::OperationSeq;
use serde::{Deserialize, Serialize};
#[cfg(feature = "wasm")]
use tsify::Tsify;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(transparent)]
#[cfg_attr(feature = "wasm", derive(Tsify))]
#[cfg_attr(feature = "wasm", tsify(into_wasm_abi, from_wasm_abi))]
pub struct TextOperation(OperationSeq);

impl TextOperation {
    pub fn default() -> Self {
        Self(OperationSeq::default())
    }

    pub fn insert_at(doc_len: usize, start: usize, text: &str) -> Self {
        let mut op_seq = OperationSeq::default();
        op_seq.retain(start as u64);
        op_seq.insert(text);
        op_seq.retain((doc_len - start) as u64);
        Self(op_seq)
    }

    pub fn delete_range(doc_len: usize, start: usize, end: usize) -> Self {
        let mut op_seq = OperationSeq::default();
        op_seq.retain(start as u64);
        op_seq.delete((end - start) as u64);
        op_seq.retain((doc_len - end) as u64);
        Self(op_seq)
    }

    pub fn retain(&mut self, n: usize) {
        self.0.retain(n as u64)
    }

    pub fn insert(&mut self, s: &str) {
        self.0.insert(s)
    }

    pub fn delete(&mut self, n: usize) {
        self.0.delete(n as u64)
    }

    pub fn base_len(&self) -> usize {
        self.0.base_len()
    }

    pub fn target_len(&self) -> usize {
        self.0.target_len()
    }
}

#[cfg_attr(feature = "wasm", wasm_bindgen)]
pub fn transform(
    a: TextOperation,
    b: TextOperation,
) -> Result<(TextOperation, TextOperation), OTError> {
    let (a_prime, b_prime) = a.0.transform(&b.0)?;
    Ok((TextOperation(a_prime), TextOperation(b_prime)))
}
