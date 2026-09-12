use crate::{
    define_typed_index, impl_typed_index_conversions,
    indexed::{IdxVec, TypedIndex},
    math::{
        hex::{HexFlatDir, HexPointyDir, LatticeMesher},
        prng::{Pcg32, SplitMix64},
        quadrangulation::{AnchorIndex, QuadIndex, Quadrangulation, VertexIndex},
    },
    world::{BaseLayer, ChunkId, InnerCells, CHUNK_WORLD_SIZE, SUBDIVISION_BASE},
};
use std::{cell::RefCell, rc::Rc};

define_typed_index!(TileIndex, u32, "Dense, chunk-local tile id (finite quads only).");
impl_typed_index_conversions!(TileIndex);

define_typed_index!(CellIndex, u32, "Dense, chunk-local cell id (finite vertices only).");
impl_typed_index_conversions!(CellIndex);

/// Stable random streams for different aspects of chunk generation.
/// Streams are cheap, create a new one for each aspect to ensure deterministic independence.
pub struct ChunkRngStreams {
    pub mesh: Rc<RefCell<Pcg32>>,
}

impl ChunkRngStreams {
    pub fn new(mut seed: SplitMix64) -> Self {
        let mesh = Rc::new(RefCell::new(seed.generate_stream()));
        Self { mesh }
    }
}

pub struct Chunk {
    rng_streams: ChunkRngStreams,
    mesh: Quadrangulation,
    quad_to_tile: IdxVec<QuadIndex, TileIndex>,
    tile_to_quad: IdxVec<TileIndex, QuadIndex>,
    vert_to_cell: IdxVec<VertexIndex, CellIndex>,
    cell_to_vert: IdxVec<CellIndex, VertexIndex>,
    base_layer: BaseLayer,
}

impl Chunk {
    pub fn new(parent_seed: &SplitMix64, id: ChunkId) -> Self {
        let rng_streams = ChunkRngStreams::new(parent_seed.create_seed(id.id_64()));
        let topology = LatticeMesher::new(SUBDIVISION_BASE, rng_streams.mesh.clone())
            .with_size(CHUNK_WORLD_SIZE)
            .generate();

        let mut quad_to_tile = IdxVec::from_elem(TileIndex::NONE, topology.quad_count());
        let mut tile_to_quad = IdxVec::with_capacity(topology.finite_quad_count());
        for qi in topology.finite_quad_index_iter() {
            let ti = tile_to_quad.push(qi);
            quad_to_tile[qi] = ti;
        }

        let mut vert_to_cell = IdxVec::from_elem(CellIndex::NONE, topology.vertex_count());
        let mut cell_to_vert = IdxVec::with_capacity(topology.finite_vertex_count());
        for vi in topology.finite_vertex_index_iter() {
            let ci = cell_to_vert.push(vi);
            vert_to_cell[vi] = ci;
        }

        let base_layer = BaseLayer::new(tile_to_quad.len(), 0);

        Self {
            rng_streams,
            mesh: topology,
            quad_to_tile,
            tile_to_quad,
            vert_to_cell,
            cell_to_vert,
            base_layer,
        }
    }

    pub fn rng_streams(&self) -> &ChunkRngStreams {
        &self.rng_streams
    }

    pub fn mesh(&self) -> &Quadrangulation {
        &self.mesh
    }

    /// Dense `QuadIndex -> TileIndex` map, `TileIndex::NONE` for ghost (infinite) quads.
    pub fn quad_to_tile(&self) -> &IdxVec<QuadIndex, TileIndex> {
        &self.quad_to_tile
    }

    pub fn tile_to_quad(&self) -> &IdxVec<TileIndex, QuadIndex> {
        &self.tile_to_quad
    }

    /// Dense `VertexIndex -> CellIndex` map, `CellIndex::NONE` for infinite (ghost) vertices.
    pub fn vert_to_cell(&self) -> &IdxVec<VertexIndex, CellIndex> {
        &self.vert_to_cell
    }

    pub fn cell_to_vert(&self) -> &IdxVec<CellIndex, VertexIndex> {
        &self.cell_to_vert
    }

    pub fn base_layer(&self) -> &BaseLayer {
        &self.base_layer
    }

    pub fn base_layer_mut(&mut self) -> &mut BaseLayer {
        &mut self.base_layer
    }

    /// Flat (real) quad vertex positions [x, y, x, y, ...]
    pub fn quad_vertices(&self) -> Vec<f32> {
        let mut flat = Vec::with_capacity(self.mesh.vertex_count() * 2);
        for vi in self.mesh.finite_vertex_index_iter() {
            let p = self.mesh[vi].position;
            flat.push(p.x);
            flat.push(p.y);
        }
        flat
    }

    /// Flat (real) quad indices [a, b, c, d, ...].
    pub fn quad_indices(&self) -> Vec<u32> {
        let mut indices = Vec::with_capacity(self.mesh.finite_quad_count() * 4);
        for qi in self.mesh.finite_quad_index_iter() {
            let verts = self.mesh.quad_vertices(qi);
            for &v in verts {
                indices.push(v.into_index() as u32);
            }
        }
        indices
    }

    /// Flat boundary edge indices [a, b, ...].
    pub fn boundary_indices(&self) -> Vec<u32> {
        // Each boundary vertex corresponds to one edge, so N vertices = N edges
        let edge_count = self.mesh.boundary_vertex_count();
        let mut flat = Vec::with_capacity(edge_count * 2);
        for [a, b] in self.mesh.boundary_edges() {
            flat.push(a);
            flat.push(b);
        }
        flat
    }

    pub fn cell_data(&self) -> InnerCells {
        let site_count = self.mesh.finite_vertex_count();
        let tile_count = self.mesh.finite_quad_count();

        // Some optimistic preallocation, actual counts may be smaller due to boundary vertices and quads

        let mut indices = Vec::with_capacity(site_count * 4); // 4 quads per vertex on average
        let mut ranges = Vec::with_capacity(site_count * 2);
        let mut cell_ids = Vec::with_capacity(site_count);
        let mut tile_ids = Vec::with_capacity(tile_count);
        let mut tile_distortions = Vec::with_capacity(tile_count * 8);
        let mut tile_vertices = Vec::with_capacity(site_count * 4);

        let mut vertices = Vec::with_capacity(tile_count * 2);
        for qi in self.mesh.finite_quad_index_iter() {
            let center = self.mesh.dual_p(qi).expect("finite quad must have a dual point");
            vertices.push(center.x);
            vertices.push(center.y);
            tile_ids.push(self.quad_to_tile[qi].into_index() as u32);
            for &qv in self.mesh.quad_vertices(qi) {
                tile_distortions.push(self.mesh[qv].position.x);
                tile_distortions.push(self.mesh[qv].position.y);
            }
        }

        for vi in self.mesh.finite_vertex_index_iter() {
            if self.mesh.is_boundary_vertex(vi) {
                continue;
            }

            ranges.push(indices.len() as u32);
            cell_ids.push(self.vert_to_cell[vi].into_index() as u32);

            for qv in self.mesh.vertex_ring_ccw(vi) {
                indices.push(self.quad_to_tile[qv.quad].into_index() as u32);
                tile_vertices.push(qv.local.into());
            }

            ranges.push(indices.len() as u32);
        }

        // cell_tiles() binary-searches cell_ids, relying on this ascending order
        debug_assert!(cell_ids.is_sorted());

        InnerCells {
            vertices,
            indices,
            ranges,
            cell_ids,
            tile_ids,
            tile_vertices,
            tile_distortions,
        }
    }

    /// Returns VertexIndex values along specified hex edge (inclusive of both corners)
    pub fn boundary_edge_vertices(&self, edge_idx: HexFlatDir) -> impl Iterator<Item = VertexIndex> + '_ {
        self.mesh.anchor_edge(AnchorIndex::new(edge_idx as usize))
    }

    /// Returns VertexIndex at specified hex corner (0..5)
    pub fn boundary_corner_vertex(&self, corner_idx: HexPointyDir) -> VertexIndex {
        // assume anchor points are corresponding to hex corners in correct  order
        self.mesh.anchor_vertex(AnchorIndex::new(corner_idx as usize))
    }
}
