use crate::{
    mesh::AsPolygonMesh,
    world::{CornerCells, CornerSide as CoreCornerSide, EdgeCells, EdgeSide as CoreEdgeSide, InnerCells},
};
use js_sys::{Float32Array, Uint32Array, Uint8Array};
use wasm_bindgen::prelude::*;

/// Which side of an EdgeCells polygon a tile belongs to. Matches Rust EdgeSide indices exactly.
#[wasm_bindgen]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EdgeSide {
    Owner = 0,
    Neighbor = 1,
}

impl From<EdgeSide> for CoreEdgeSide {
    fn from(side: EdgeSide) -> Self {
        CoreEdgeSide::from_index(side as usize)
    }
}

/// Which side of a CornerCells polygon a tile belongs to. Matches Rust CornerSide indices exactly.
#[wasm_bindgen]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CornerSide {
    Owner = 0,
    CcwNeighbor = 1,
    CwNeighbor = 2,
}

impl From<CornerSide> for CoreCornerSide {
    fn from(side: CornerSide) -> Self {
        CoreCornerSide::from_index(side as usize)
    }
}

/// Zero-copy WASM view over InnerCells.
/// All accessors return views into Wasm linear memory — clone on the JS side
#[wasm_bindgen]
pub struct InnerCellsHandle(InnerCells);

#[wasm_bindgen]
impl InnerCellsHandle {
    pub fn vertices(&self) -> Float32Array {
        unsafe { Float32Array::view(&self.0.vertices) }
    }

    pub fn indices(&self) -> Uint32Array {
        unsafe { Uint32Array::view(&self.0.indices) }
    }

    pub fn ranges(&self) -> Uint32Array {
        unsafe { Uint32Array::view(&self.0.ranges) }
    }

    pub fn cell_ids(&self) -> Uint32Array {
        unsafe { Uint32Array::view(&self.0.cell_ids) }
    }

    pub fn tile_ids(&self) -> Uint32Array {
        unsafe { Uint32Array::view(&self.0.tile_ids) }
    }

    pub fn tile_vertices(&self) -> Uint8Array {
        unsafe { Uint8Array::view(&self.0.tile_vertices) }
    }

    pub fn tile_distortions(&self) -> Float32Array {
        unsafe { Float32Array::view(&self.0.tile_distortions) }
    }

    /// Packed [tile_id, vertex, tile_id, vertex, ...] pairs of every quad bordering `cell_id`.
    pub fn cell_tiles(&self, cell_id: u32) -> Uint32Array {
        let flat: Vec<u32> = self
            .0
            .cell_tiles(cell_id)
            .flat_map(|(tile_id, vertex)| [tile_id, vertex as u32])
            .collect();
        Uint32Array::from(flat.as_slice())
    }
}

impl From<InnerCells> for InnerCellsHandle {
    fn from(data: InnerCells) -> Self {
        Self(data)
    }
}

/// Zero-copy WASM view over EdgeCells.
/// All accessors return views into Wasm linear memory — clone on the JS side
#[wasm_bindgen]
pub struct EdgeCellsHandle(EdgeCells);

#[wasm_bindgen]
impl EdgeCellsHandle {
    pub fn vertices(&self) -> Float32Array {
        unsafe { Float32Array::view(&self.0.vertices) }
    }

    pub fn indices(&self) -> Uint32Array {
        unsafe { Uint32Array::view(&self.0.indices) }
    }

    pub fn ranges(&self) -> Uint32Array {
        unsafe { Uint32Array::view(&self.0.ranges) }
    }

    pub fn cell_ids(&self) -> Uint32Array {
        unsafe { Uint32Array::view(&self.0.cell_ids) }
    }

    pub fn tile_ids(&self) -> Uint32Array {
        unsafe { Uint32Array::view(&self.0.tile_ids) }
    }

    pub fn tile_vertices(&self) -> Uint8Array {
        unsafe { Uint8Array::view(&self.0.tile_vertices) }
    }

    pub fn tile_distortions(&self) -> Float32Array {
        unsafe { Float32Array::view(&self.0.tile_distortions) }
    }

    /// Packed [tile_id, vertex, tile_id, vertex, ...] pairs of every quad bordering `cell_id` on the given `side`.
    pub fn cell_tiles(&self, side: EdgeSide, cell_id: u32) -> Uint32Array {
        let flat: Vec<u32> = self
            .0
            .cell_tiles(side.into(), cell_id)
            .flat_map(|(tile_id, vertex)| [tile_id, vertex as u32])
            .collect();
        Uint32Array::from(flat.as_slice())
    }
}

impl From<EdgeCells> for EdgeCellsHandle {
    fn from(data: EdgeCells) -> Self {
        Self(data)
    }
}

/// Zero-copy WASM view over CornerCells.
/// All accessors return views into Wasm linear memory — clone on the JS side
#[wasm_bindgen]
pub struct CornerCellsHandle(CornerCells);

#[wasm_bindgen]
impl CornerCellsHandle {
    pub fn vertices(&self) -> Float32Array {
        unsafe { Float32Array::view(&self.0.vertices) }
    }

    pub fn indices(&self) -> Uint32Array {
        unsafe { Uint32Array::view(self.0.indices()) }
    }

    pub fn ranges(&self) -> Uint32Array {
        unsafe { Uint32Array::view(self.0.ranges()) }
    }

    pub fn cell_ids(&self) -> Uint32Array {
        unsafe { Uint32Array::view(&self.0.cell_ids) }
    }

    pub fn tile_ids(&self) -> Uint32Array {
        unsafe { Uint32Array::view(&self.0.tile_ids) }
    }

    pub fn tile_vertices(&self) -> Uint8Array {
        unsafe { Uint8Array::view(&self.0.tile_vertices) }
    }

    pub fn tile_distortions(&self) -> Float32Array {
        unsafe { Float32Array::view(&self.0.tile_distortions) }
    }

    /// Packed [tile_id, vertex, tile_id, vertex, ...] pairs of every quad bordering `cell_id` on the given `side`.
    pub fn cell_tiles(&self, side: CornerSide, cell_id: u32) -> Uint32Array {
        let flat: Vec<u32> = self
            .0
            .cell_tiles(side.into(), cell_id)
            .flat_map(|(tile_id, vertex)| [tile_id, vertex as u32])
            .collect();
        Uint32Array::from(flat.as_slice())
    }
}

impl From<CornerCells> for CornerCellsHandle {
    fn from(data: CornerCells) -> Self {
        Self(data)
    }
}
