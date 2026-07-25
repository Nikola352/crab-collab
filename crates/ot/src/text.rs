use crate::error::OTError;
use operational_transform::{Operation, OperationSeq};
use serde::{Deserialize, Serialize};
use std::cmp::min;
#[cfg(feature = "wasm")]
use wasm_bindgen::prelude::*;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(transparent)]
#[cfg_attr(feature = "wasm", wasm_bindgen)]
pub struct TextOperation(OperationSeq);

#[cfg_attr(feature = "wasm", wasm_bindgen)]
impl TextOperation {
    pub fn default() -> Self {
        Self(OperationSeq::default())
    }

    #[cfg_attr(feature = "wasm", wasm_bindgen(js_name = insertAt))]
    pub fn insert_at(doc_len: usize, start: usize, text: &str) -> Self {
        let mut op_seq = OperationSeq::default();
        op_seq.retain(start as u64);
        op_seq.insert(text);
        op_seq.retain((doc_len - start) as u64);
        Self(op_seq)
    }

    #[cfg_attr(feature = "wasm", wasm_bindgen(js_name = deleteRange))]
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

    #[cfg_attr(feature = "wasm", wasm_bindgen(js_name = baseLen))]
    pub fn base_len(&self) -> usize {
        self.0.base_len()
    }

    #[cfg_attr(feature = "wasm", wasm_bindgen(js_name = targetLen))]
    pub fn target_len(&self) -> usize {
        self.0.target_len()
    }

    #[cfg(feature = "wasm")]
    #[wasm_bindgen(js_name = toJSON)]
    pub fn to_json(&self) -> JsValue {
        serde_wasm_bindgen::to_value(&self.0).expect("TextOperation serialization is infallible")
    }

    #[cfg(feature = "wasm")]
    #[wasm_bindgen(js_name = fromJSON)]
    pub fn from_json(json: &str) -> Result<TextOperation, JsValue> {
        serde_json::from_str(json).map_err(|e| JsValue::from_str(&e.to_string()))
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[cfg_attr(feature = "wasm", wasm_bindgen)]
pub struct TextTransformResult {
    a_prime: TextOperation,
    b_prime: TextOperation,
}

#[cfg_attr(feature = "wasm", wasm_bindgen)]
impl TextTransformResult {
    #[cfg_attr(feature = "wasm", wasm_bindgen(getter, js_name = aPrime))]
    pub fn a_prime(&self) -> TextOperation {
        self.a_prime.clone()
    }

    #[cfg_attr(feature = "wasm", wasm_bindgen(getter, js_name = bPrime))]
    pub fn b_prime(&self) -> TextOperation {
        self.b_prime.clone()
    }
}

#[cfg_attr(feature = "wasm", wasm_bindgen)]
pub fn transform(a: &TextOperation, b: &TextOperation) -> Result<TextTransformResult, OTError> {
    let (a_prime, b_prime) = a.0.transform(&b.0)?;
    Ok(TextTransformResult {
        a_prime: TextOperation(a_prime),
        b_prime: TextOperation(b_prime),
    })
}

#[cfg_attr(feature = "wasm", wasm_bindgen)]
pub fn apply(operation: &TextOperation, text: &str) -> Result<String, OTError> {
    Ok(operation.0.apply(text)?)
}

#[cfg_attr(feature = "wasm", wasm_bindgen)]
pub fn transform_position(position: usize, operation: &TextOperation) -> usize {
    let mut pos = position;
    let mut new_pos = position;
    for op in operation.0.ops() {
        match op {
            Operation::Retain(len) => {
                if pos < *len as usize {
                    break;
                }
                pos -= *len as usize;
            }
            Operation::Insert(text) => {
                new_pos += text.chars().count();
            }
            Operation::Delete(len) => {
                new_pos -= min(pos, *len as usize);
                if pos < *len as usize {
                    break;
                }
                pos -= *len as usize;
            }
        }
    }

    new_pos
}
