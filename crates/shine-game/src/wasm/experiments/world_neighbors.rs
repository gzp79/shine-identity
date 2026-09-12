use crate::{
    indexed::TypedIndex,
    math::hex::HexFlatDir,
    mesh::WiredPolygonMesh,
    wasm::{
        math::{HexFlatDir as WasmHexFlatDir, HexPointyDir as WasmHexPointyDir},
        mesh::WiredPolygonMeshHandle,
    },
    world::{ChunkId, World},
};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct WasmWorldNeighbors {
    world: World,
    center: ChunkId,
}

#[wasm_bindgen]
impl WasmWorldNeighbors {
    fn chunk_id(&self, chunk_idx: u32) -> Option<ChunkId> {
        match chunk_idx {
            0 => Some(self.center),
            1..=6 => Some(self.center.neighbor(HexFlatDir::from_index((chunk_idx - 1) as usize))),
            _ => None,
        }
    }

    fn chunk_offset(&self, chunk_idx: u32) -> glam::Vec2 {
        if chunk_idx == 0 {
            glam::Vec2::ZERO
        } else {
            let neighbor_id = self.center.neighbor(HexFlatDir::from_index((chunk_idx - 1) as usize));
            self.center.relative_world_position(neighbor_id)
        }
    }

    /// Returns 12 floats (6 vertices * 2 coords) for the given chunk
    pub fn chunk_hex_vertices(&self, chunk_idx: u32) -> Vec<f32> {
        use crate::math::quadrangulation::AnchorIndex;

        let (Some(id), offset) = (self.chunk_id(chunk_idx), self.chunk_offset(chunk_idx)) else {
            return vec![];
        };
        let Some(chunk) = self.world.chunk(id) else {
            return vec![];
        };

        let mut vertices = Vec::with_capacity(12);
        for i in 0..6 {
            let vi = chunk.mesh().anchor_vertex(AnchorIndex::new(i));
            let p = chunk.mesh().p(vi) + offset;
            vertices.push(p.x);
            vertices.push(p.y);
        }
        vertices
    }

    /// Get inner mesh for the given chunk
    pub fn inner_mesh(&self, chunk_idx: u32) -> Option<WiredPolygonMeshHandle> {
        let (id, offset) = (self.chunk_id(chunk_idx)?, self.chunk_offset(chunk_idx));
        let mut cells = self.world.inner_cells(id)?;
        for i in (0..cells.vertices.len()).step_by(2) {
            cells.vertices[i] += offset.x;
            cells.vertices[i + 1] += offset.y;
        }
        Some(
            WiredPolygonMesh {
                vertices: cells.vertices,
                indices: cells.indices,
                ranges: cells.ranges,
                wire_indices: Vec::new(),
                wire_ranges: Vec::new(),
            }
            .into(),
        )
    }

    /// Get edge mesh for the given edge
    pub fn edge_mesh(&self, edge_idx: WasmHexFlatDir) -> Option<WiredPolygonMeshHandle> {
        let cells = self.world.edge_cells(self.center, edge_idx.into())?;
        Some(
            WiredPolygonMesh {
                vertices: cells.vertices,
                indices: cells.indices,
                ranges: cells.ranges,
                wire_indices: Vec::new(),
                wire_ranges: Vec::new(),
            }
            .into(),
        )
    }

    /// Get corner mesh for the given corner
    pub fn corner_mesh(&self, corner_idx: WasmHexPointyDir) -> Option<WiredPolygonMeshHandle> {
        let cells = self.world.corner_cells(self.center, corner_idx.into())?;
        Some(
            WiredPolygonMesh {
                vertices: cells.vertices.clone(),
                indices: cells.indices.clone(),
                ranges: cells.ranges.to_vec(),
                wire_indices: Vec::new(),
                wire_ranges: Vec::new(),
            }
            .into(),
        )
    }
}

/// Generate world neighbors geometry for visualization
#[wasm_bindgen]
pub fn generate_world_neighbors(center_q: i32, center_r: i32) -> Result<WasmWorldNeighbors, JsValue> {
    let mut world = World::new();

    let center = ChunkId(center_q, center_r);
    world.init_chunk(center);
    for n in 0..6 {
        world.init_chunk(center.neighbor(HexFlatDir::from_index(n)));
    }

    Ok(WasmWorldNeighbors { world, center })
}
