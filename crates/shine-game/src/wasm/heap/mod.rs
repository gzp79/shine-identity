//! JS binding exposing the memory report (`crate::heap`) as a plain object keyed by metric label.

use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn memory_info() -> JsValue {
    let json = serde_json::to_string(&crate::heap::memory_info()).unwrap_or_else(|_| "{}".into());
    js_sys::JSON::parse(&json).unwrap_or(JsValue::NULL)
}
