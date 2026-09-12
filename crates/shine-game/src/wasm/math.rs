use crate::math::hex::{
    AxialCoord, FlatAxialCoord, HexFlatDir as CoreHexFlatDir, HexPointyDir as CoreHexPointyDir, PointyAxialCoord,
};
use glam::Vec2;
use wasm_bindgen::prelude::*;

/// 6 neighbor direction for a flat-topped hex grid in CCW order. Matches Rust HexFlatDir indices exactly.
#[wasm_bindgen]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HexFlatDir {
    NE = 0,
    N = 1,
    NW = 2,
    SW = 3,
    S = 4,
    SE = 5,
}

impl From<HexFlatDir> for CoreHexFlatDir {
    fn from(dir: HexFlatDir) -> Self {
        CoreHexFlatDir::from_index(dir as usize)
    }
}

/// 6 neighbor direction for a pointy-topped hex grid in CCW order. Matches Rust HexPointyDir indices exactly.
#[wasm_bindgen]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HexPointyDir {
    E = 0,
    NE = 1,
    NW = 2,
    W = 3,
    SW = 4,
    SE = 5,
}

impl From<HexPointyDir> for CoreHexPointyDir {
    fn from(dir: HexPointyDir) -> Self {
        CoreHexPointyDir::from_index(dir as usize)
    }
}

/// Axial distance between two hex coordinates.
#[wasm_bindgen]
pub fn hex_distance(aq: i32, ar: i32, bq: i32, br: i32) -> i32 {
    AxialCoord::new(aq, ar).distance(&AxialCoord::new(bq, br))
}

/// Flat [q0,r0, q1,r1, ...] for the ring at given radius from (q, r).
/// Order: starts at direction-0 corner, walks CCW — matches Rust RingIterator.
#[wasm_bindgen]
pub fn hex_ring(q: i32, r: i32, radius: u32) -> Vec<i32> {
    AxialCoord::new(q, r).ring(radius).flat_map(|c| [c.q, c.r]).collect()
}

/// Neighbor of (q, r) in the given flat-top direction. Returns [q, r].
#[wasm_bindgen]
pub fn hex_flat_neighbor(q: i32, r: i32, dir: HexFlatDir) -> Vec<i32> {
    let n = AxialCoord::new(q, r).flat().neighbor(dir.into());
    vec![n.q, n.r]
}

/// World position [x, y] of the flat-top hex center at (q, r) with given circumradius size.
#[wasm_bindgen]
pub fn hex_flat_to_position(q: i32, r: i32, size: f32) -> Vec<f32> {
    let p = AxialCoord::new(q, r).flat().to_position(size);
    vec![p.x, p.y]
}

/// Nearest flat-top hex [q, r] for world position (x, y) with given circumradius size.
/// Inverse of hex_flat_to_position.
#[wasm_bindgen]
pub fn hex_flat_from_position(x: f32, y: f32, size: f32) -> Vec<i32> {
    let c = FlatAxialCoord::from_position(Vec2::new(x, y), size);
    vec![c.q, c.r]
}

/// Neighbor of (q, r) in the given pointy-top direction. Returns [q, r].
#[wasm_bindgen]
pub fn hex_pointy_neighbor(q: i32, r: i32, dir: HexPointyDir) -> Vec<i32> {
    let n = AxialCoord::new(q, r).pointy().neighbor(dir.into());
    vec![n.q, n.r]
}

/// World position [x, y] of the pointy-top hex center at (q, r) with given circumradius size.
#[wasm_bindgen]
pub fn hex_pointy_to_position(q: i32, r: i32, size: f32) -> Vec<f32> {
    let p = AxialCoord::new(q, r).pointy().to_position(size);
    vec![p.x, p.y]
}

/// Nearest pointy-top hex [q, r] for world position (x, y) with given circumradius size.
/// Inverse of hex_pointy_to_position.
#[wasm_bindgen]
pub fn hex_pointy_from_position(x: f32, y: f32, size: f32) -> Vec<i32> {
    let c = PointyAxialCoord::from_position(Vec2::new(x, y), size);
    vec![c.q, c.r]
}
