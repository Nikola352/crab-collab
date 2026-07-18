#[cfg(feature = "wasm")]
use wasm_bindgen::JsValue;

#[derive(Debug, Clone)]
pub struct OTError;

impl From<operational_transform::OTError> for OTError {
    fn from(_: operational_transform::OTError) -> Self {
        OTError
    }
}

#[cfg(feature = "wasm")]
impl From<OTError> for JsValue {
    fn from(err: OTError) -> Self {
        JsValue::from_str(&format!("{err:?}"))
    }
}
