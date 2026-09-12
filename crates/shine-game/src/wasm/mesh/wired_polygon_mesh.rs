use crate::mesh::WiredPolygonMesh;
use js_sys::{Float32Array, Uint32Array};
use wasm_bindgen::prelude::*;

/// Zero-copy WASM view over a WiredPolygonMesh.
/// All accessors return views into Wasm linear memory — clone on the JS side
/// (e.g. `arr.slice()`) if the data must outlive this object or any further Wasm call.
#[wasm_bindgen]
#[derive(Clone)]
pub struct WiredPolygonMeshHandle(WiredPolygonMesh);

#[wasm_bindgen]
impl WiredPolygonMeshHandle {
    pub fn vertices(&self) -> Float32Array {
        unsafe { Float32Array::view(&self.0.vertices) }
    }

    pub fn indices(&self) -> Uint32Array {
        unsafe { Uint32Array::view(&self.0.indices) }
    }

    pub fn ranges(&self) -> Uint32Array {
        unsafe { Uint32Array::view(&self.0.ranges) }
    }

    pub fn wire_indices(&self) -> Uint32Array {
        unsafe { Uint32Array::view(&self.0.wire_indices) }
    }

    pub fn wire_ranges(&self) -> Uint32Array {
        unsafe { Uint32Array::view(&self.0.wire_ranges) }
    }

    pub fn has_wires(&self) -> bool {
        !self.0.wire_indices.is_empty()
    }
}

impl From<WiredPolygonMesh> for WiredPolygonMeshHandle {
    fn from(mesh: WiredPolygonMesh) -> Self {
        Self(mesh)
    }
}

impl From<WiredPolygonMeshHandle> for WiredPolygonMesh {
    fn from(handle: WiredPolygonMeshHandle) -> Self {
        handle.0
    }
}
