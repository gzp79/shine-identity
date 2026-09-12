use crate::{indexed::TypedIndex, math::quadrangulation::Rot4Idx, world::TileIndex};
use std::ops::{Index, IndexMut};

/// A container type that packs one `Component` per tile cell (`Rot4Idx`-indexed dual vertex).
pub trait Packed {
    type Component;

    fn get(&self, cell: Rot4Idx) -> Self::Component;
    fn set(&mut self, cell: Rot4Idx, value: Self::Component);
}

impl Packed for u32 {
    type Component = u8;

    #[inline]
    fn get(&self, cell: Rot4Idx) -> u8 {
        self.to_le_bytes()[cell.into_index()]
    }

    #[inline]
    fn set(&mut self, cell: Rot4Idx, value: u8) {
        let mut bytes = self.to_le_bytes();
        bytes[cell.into_index()] = value;
        *self = u32::from_le_bytes(bytes);
    }
}

/// Per-tile data for a chunk, indexed by `TileIndex`. Fixed-size: backed by `Box<[T]>`, not `Vec<T>`.
pub struct Layer<T> {
    data: Box<[T]>,
}

impl<T: Clone> Layer<T> {
    pub fn new(tile_count: usize, value: T) -> Self {
        Self {
            data: vec![value; tile_count].into_boxed_slice(),
        }
    }
}

impl<T> Layer<T> {
    pub fn as_slice(&self) -> &[T] {
        &self.data
    }

    pub fn as_mut_slice(&mut self) -> &mut [T] {
        &mut self.data
    }
}

impl<T> Index<TileIndex> for Layer<T> {
    type Output = T;

    #[inline]
    fn index(&self, index: TileIndex) -> &T {
        &self.data[index.into_index()]
    }
}

impl<T> IndexMut<TileIndex> for Layer<T> {
    #[inline]
    fn index_mut(&mut self, index: TileIndex) -> &mut T {
        &mut self.data[index.into_index()]
    }
}

impl<T: Packed> Layer<T> {
    #[inline]
    pub fn get_tile(&self, tile: TileIndex, cell: Rot4Idx) -> T::Component {
        self[tile].get(cell)
    }

    #[inline]
    pub fn set_tile(&mut self, tile: TileIndex, cell: Rot4Idx, value: T::Component) {
        self[tile].set(cell, value);
    }
}

pub type BaseLayer = Layer<u32>;
