use crate::mesh::AsPolygonMesh;

crate::define_enum_index! {
    /// Which side of an EdgeCells polygon a tile belongs to.
    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    pub EdgeSide {
        0 => Owner,
        1 => Neighbor,
    }
}

crate::define_enum_index! {
    /// Which side of a CornerCells polygon a tile belongs to.
    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    pub CornerSide {
        0 => Owner,
        1 => CcwNeighbor,
        2 => CwNeighbor,
    }
}

/// Standalone geometry snapshot of a chunk's internal cells: owned data, safe to hold and
/// marshal independently of the chunk. Rebuild to refresh. Mutable state lives in the layer.
#[derive(Debug, Clone, Default)]
pub struct InnerCells {
    /// Vertex positions packed as [x, y, x, y, ...]
    pub vertices: Vec<f32>,
    /// Polygon indices - flat index array
    pub indices: Vec<u32>,
    /// Index ranges forming a closed polygon packed as [start0, end0, start1, end1, ...] pairs
    pub ranges: Vec<u32>,
    /// Cell id of each polygon in the same order as the polygon indices.
    pub cell_ids: Vec<u32>,
    /// Tile id of each vertex in the same order as the vertex positions.
    pub tile_ids: Vec<u32>,
    /// Tile-local vertex (0..4) of each polygon index entry, in the same order as `indices`
    pub tile_vertices: Vec<u8>,
    /// Tile distortion in the same order as tile_ids packed as [x, y, ...], where each octet corresponds to a single tile
    pub tile_distortions: Vec<f32>,
}

impl AsPolygonMesh for InnerCells {
    fn vertices(&self) -> &[f32] {
        &self.vertices
    }

    fn indices(&self) -> &[u32] {
        &self.indices
    }

    fn ranges(&self) -> &[u32] {
        &self.ranges
    }
}

impl InnerCells {
    /// (tile_id, quad-local vertex 0..4) pairs of every quad bordering `cell_id`.
    pub fn cell_tiles(&self, cell_id: u32) -> impl Iterator<Item = (u32, u8)> + '_ {
        // `cell_ids` is sorted ascending, so this is a binary search.
        let range = self
            .cell_ids
            .binary_search(&cell_id)
            .ok()
            .map(|i| (self.ranges[2 * i] as usize, self.ranges[2 * i + 1] as usize));
        range.into_iter().flat_map(move |(s, e)| {
            (s..e).map(move |k| (self.tile_ids[self.indices[k] as usize], self.tile_vertices[k]))
        })
    }
}

/// Standalone geometry snapshot of a chunk's edge cells: owned data, safe to hold and
/// marshal independently of the chunk. Rebuild to refresh. Mutable state lives in the layer.
#[derive(Debug, Clone, Default)]
pub struct EdgeCells {
    /// Vertex positions packed as [x, y, x, y, ...]
    pub vertices: Vec<f32>,
    /// Polygon indices - flat index array
    pub indices: Vec<u32>,
    /// Index ranges forming a closed polygon packed as [start0, end0, start1, end1, ...] pairs
    pub ranges: Vec<u32>,
    /// Cell id pairs in the same order as the polygon indices [owner_cell_id, neighbor_cell_id, owner_cell_id, neighbor_cell_id, ...]
    pub cell_ids: Vec<u32>,
    /// Packed owner chunk and tile id pairs in the same order as the vertex positions [owner, tile_id, owner, tile_id, ...],
    /// where 0 means the owning chunk, 1 the neighbor chunk
    pub tile_ids: Vec<u32>,
    /// Tile-local vertex (0..4) of each polygon index entry, in the same order as `indices`
    pub tile_vertices: Vec<u8>,
    /// Tile distortion in the same order as tile_ids packed as [x, y, ...], where each octet corresponds to a single tile
    pub tile_distortions: Vec<f32>,
}

impl AsPolygonMesh for EdgeCells {
    fn vertices(&self) -> &[f32] {
        &self.vertices
    }

    fn indices(&self) -> &[u32] {
        &self.indices
    }

    fn ranges(&self) -> &[u32] {
        &self.ranges
    }
}

impl EdgeCells {
    /// (tile_id, quad-local vertex 0..4) pairs of every quad bordering `cell_id` on the given `side`.
    pub fn cell_tiles(&self, side: EdgeSide, cell_id: u32) -> impl Iterator<Item = (u32, u8)> + '_ {
        let side = side.into_index();
        let range = self
            .cell_ids
            .iter()
            .skip(side)
            .step_by(2)
            .position(|&c| c == cell_id)
            .map(|i| (self.ranges[2 * i] as usize, self.ranges[2 * i + 1] as usize));
        let side = side as u32;
        range.into_iter().flat_map(move |(s, e)| {
            (s..e).filter_map(move |k| {
                let p = self.indices[k] as usize;
                (self.tile_ids[2 * p] == side).then(|| (self.tile_ids[2 * p + 1], self.tile_vertices[k]))
            })
        })
    }
}

/// Standalone geometry snapshot of a chunk's corner cells (single polygon, at most ~10 vertices):
/// owned data, safe to hold and marshal independently of the chunk. Rebuild to refresh.
/// Mutable state lives in the layer.
#[derive(Debug, Clone, Default)]
pub struct CornerCells {
    /// Vertex positions packed as [x, y, x, y, ...]
    pub vertices: Vec<f32>,
    /// Polygon indices (0..vertex_count)
    pub indices: Vec<u32>,
    /// Index range [0, vertex_count]
    pub ranges: [u32; 2],
    /// Cell id in the [owner, ccw_neighbor, cw_neighbor (same as 2*ccw neighbor) ] order
    pub cell_ids: Vec<u32>,
    /// Packed owner chunk and tile id pairs in the same order as the vertex positions [owner, tile_id, owner, tile_id, ...],
    /// where 0 means the owning chunk, 1 the ccw neighbor chunk, and 2 the cw (2*ccw) neighbor chunk
    pub tile_ids: Vec<u32>,
    /// Tile-local vertex (0..4) of each vertex in the same order as the vertex positions.
    pub tile_vertices: Vec<u8>,
    /// Tile distortion in the same order as tile_ids packed as [x, y, ...], where each octet corresponds to a single tile
    pub tile_distortions: Vec<f32>,
}

impl AsPolygonMesh for CornerCells {
    fn vertices(&self) -> &[f32] {
        &self.vertices
    }

    fn indices(&self) -> &[u32] {
        &self.indices
    }

    fn ranges(&self) -> &[u32] {
        &self.ranges
    }
}

impl CornerCells {
    /// (tile_id, quad-local vertex 0..4) pairs of every quad bordering `cell_id` on the given `side`.
    pub fn cell_tiles(&self, side: CornerSide, cell_id: u32) -> impl Iterator<Item = (u32, u8)> + '_ {
        let valid = self.cell_ids.get(side.into_index()) == Some(&cell_id);
        let side = side.into_index() as u32;
        (0..self.tile_vertices.len())
            .filter(move |&k| valid && self.tile_ids[2 * k] == side)
            .map(move |k| (self.tile_ids[2 * k + 1], self.tile_vertices[k]))
    }
}
