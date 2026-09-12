use crate::math::quadrangulation::{
    EdgeCirculator, QuadEdge, QuadEdgeType, QuadIndex, QuadVertex, Quadrangulation, Rot4Idx, VertexIndex,
};
use glam::Vec2;
use std::iter;

impl Quadrangulation {
    pub fn edge_twin(&self, qe: QuadEdge) -> QuadEdge {
        let neighbor_quad = self.quads[qe.quad].neighbors[qe.edge];
        let neighbor_edge = self.quads[neighbor_quad].find_neighbor(qe.quad).unwrap();
        QuadEdge {
            quad: neighbor_quad,
            edge: neighbor_edge,
        }
    }

    pub fn edge_vertices(&self, qe: QuadEdge) -> (VertexIndex, VertexIndex) {
        let quad = &self.quads[qe.quad].vertices;
        (quad[qe.edge], quad[qe.edge.increment()])
    }

    pub fn quad_vertices(&self, qi: QuadIndex) -> &[VertexIndex] {
        self.quads[qi].vertices.as_slice()
    }

    /// Returns the quad-local corner (0..4) of vi within qi, or None if vi is not a corner of qi.
    pub fn quad_local_vertex(&self, qi: QuadIndex, vi: VertexIndex) -> Option<Rot4Idx> {
        self.quads[qi].find_vertex(vi)
    }

    pub fn edge_type(&self, a: VertexIndex, b: VertexIndex) -> QuadEdgeType {
        // Find the quad containing edge a→b
        for qv in self.vertex_ring_ccw(a) {
            if self.vi(qv.next()) == b {
                let edge = qv.outgoing_edge();
                let neighbor = self.edge_twin(edge);

                // Boundary if either side of the edge is a ghost quad
                if self.is_infinite_quad(qv.quad) || self.is_infinite_quad(neighbor.quad) {
                    return QuadEdgeType::Boundary;
                } else {
                    return QuadEdgeType::Interior;
                }
            }
        }

        QuadEdgeType::NotAnEdge
    }

    pub fn adjacent_vertices(&self, vi: VertexIndex) -> impl Iterator<Item = VertexIndex> + '_ {
        self.vertex_ring_ccw(vi).map(move |qv| self.vi(qv.next()))
    }

    /// Compute the average position of adjacent vertices.
    /// Infinite vertices are excluded from the average.
    /// Returns the vertex's own position if it has no finite neighbors.
    pub fn average_adjacent_positions(&self, vi: VertexIndex) -> Vec2 {
        assert_ne!(vi, self.infinite_vertex());

        let (sum, count) = self
            .adjacent_vertices(vi)
            .filter(|&v| !self.is_infinite_vertex(v))
            .fold((Vec2::ZERO, 0), |(sum, count), v| (sum + self.p(v), count + 1));

        if count > 0 {
            sum / count as f32
        } else {
            self.p(vi)
        }
    }

    /// Returns an iterator of QuadIndex for all finite quads around a vertex.
    /// For boundary vertices: starts from the first finite quad after the boundary (CCW from first infinite in CW direction).
    /// For interior vertices: returns all surrounding quads in some rotation.
    pub fn boundary_dual_vertices(&self, vi: VertexIndex) -> impl Iterator<Item = QuadIndex> + '_ {
        let mut circulator = EdgeCirculator::new(self, vi);
        let start_quad = circulator.current().quad;

        // Step 1: Circulate CW until we hit the first infinite quad (or complete a circle for interior vertices)
        loop {
            if self.is_infinite_quad(circulator.quad()) {
                break;
            }
            circulator.advance_cw();
            if circulator.quad() == start_quad {
                // Completed a full circle - this is an interior vertex, no infinite quads
                break;
            }
        }

        // Step 2: If we started from an infinite quad or ended up in one, circulate CCW to the first finite quad
        while self.is_infinite_quad(circulator.quad()) {
            circulator.advance_ccw();
        }

        // Now we're positioned at the first finite quad after the boundary edge
        let first_finite = circulator.quad();

        // Step 3: Iterate CCW, yielding finite quads until we hit an infinite quad or complete the circle
        let mut done = false;
        iter::from_fn(move || {
            if done {
                return None;
            }

            let result = circulator.quad();

            // Filter out infinite quads
            if !self.is_infinite_quad(result) {
                circulator.advance_ccw();

                // Check termination: either back to start or hit an infinite quad
                if circulator.quad() == first_finite || self.is_infinite_quad(circulator.quad()) {
                    done = true;
                }

                Some(result)
            } else {
                done = true;
                None
            }
        })
    }

    pub fn vertex_ring_ccw_repeated(&self, vi: VertexIndex, max_loops: usize) -> impl Iterator<Item = QuadVertex> + '_ {
        self.vertex_ring_impl(vi, max_loops, true)
    }

    pub fn vertex_ring_ccw(&self, vi: VertexIndex) -> impl Iterator<Item = QuadVertex> + '_ {
        self.vertex_ring_impl(vi, 1, true)
    }

    pub fn vertex_ring_cw_repeated(&self, vi: VertexIndex, max_loops: usize) -> impl Iterator<Item = QuadVertex> + '_ {
        self.vertex_ring_impl(vi, max_loops, false)
    }

    pub fn vertex_ring_cw(&self, vi: VertexIndex) -> impl Iterator<Item = QuadVertex> + '_ {
        self.vertex_ring_impl(vi, 1, false)
    }

    fn vertex_ring_impl(&self, vi: VertexIndex, max_loops: usize, ccw: bool) -> impl Iterator<Item = QuadVertex> + '_ {
        let mut circulator = EdgeCirculator::new(self, vi);
        let start_quad = circulator.current().quad;

        let mut loops_remaining = max_loops;
        let mut done = false;

        iter::from_fn(move || {
            if done {
                return None;
            }

            let result = if ccw {
                circulator.next_ccw()
            } else {
                circulator.next_cw()
            };

            // Check if we've completed a ring loop
            if circulator.quad() == start_quad {
                assert!(
                    loops_remaining > 0,
                    "vertex_ring completed too many loops - likely skip_while/take_while didn't terminate"
                );
                loops_remaining -= 1;
                if loops_remaining == 0 {
                    done = true;
                }
            }

            Some(result)
        })
    }
}
