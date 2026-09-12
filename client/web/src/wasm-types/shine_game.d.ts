/* tslint:disable */
/* eslint-disable */

interface WasmWorld {
    chunk_world_offset(ref_q: number, ref_r: number, q: number, r: number): [number, number];
}



/**
 * Zero-copy WASM view over CornerCells.
 * All accessors return views into Wasm linear memory — clone on the JS side
 */
export class CornerCellsHandle {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    cell_ids(): Uint32Array;
    /**
     * Packed [tile_id, vertex, tile_id, vertex, ...] pairs of every quad bordering `cell_id` on the given `side`.
     */
    cell_tiles(side: CornerSide, cell_id: number): Uint32Array;
    indices(): Uint32Array;
    ranges(): Uint32Array;
    tile_distortions(): Float32Array;
    tile_ids(): Uint32Array;
    tile_vertices(): Uint8Array;
    vertices(): Float32Array;
}

/**
 * Which side of a CornerCells polygon a tile belongs to. Matches Rust CornerSide indices exactly.
 */
export enum CornerSide {
    Owner = 0,
    CcwNeighbor = 1,
    CwNeighbor = 2,
}

/**
 * Zero-copy WASM view over EdgeCells.
 * All accessors return views into Wasm linear memory — clone on the JS side
 */
export class EdgeCellsHandle {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    cell_ids(): Uint32Array;
    /**
     * Packed [tile_id, vertex, tile_id, vertex, ...] pairs of every quad bordering `cell_id` on the given `side`.
     */
    cell_tiles(side: EdgeSide, cell_id: number): Uint32Array;
    indices(): Uint32Array;
    ranges(): Uint32Array;
    tile_distortions(): Float32Array;
    tile_ids(): Uint32Array;
    tile_vertices(): Uint8Array;
    vertices(): Float32Array;
}

/**
 * Which side of an EdgeCells polygon a tile belongs to. Matches Rust EdgeSide indices exactly.
 */
export enum EdgeSide {
    Owner = 0,
    Neighbor = 1,
}

/**
 * 6 neighbor direction for a flat-topped hex grid in CCW order. Matches Rust HexFlatDir indices exactly.
 */
export enum HexFlatDir {
    NE = 0,
    N = 1,
    NW = 2,
    SW = 3,
    S = 4,
    SE = 5,
}

/**
 * 6 neighbor direction for a pointy-topped hex grid in CCW order. Matches Rust HexPointyDir indices exactly.
 */
export enum HexPointyDir {
    E = 0,
    NE = 1,
    NW = 2,
    W = 3,
    SW = 4,
    SE = 5,
}

/**
 * Zero-copy WASM view over InnerCells.
 * All accessors return views into Wasm linear memory — clone on the JS side
 */
export class InnerCellsHandle {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    cell_ids(): Uint32Array;
    /**
     * Packed [tile_id, vertex, tile_id, vertex, ...] pairs of every quad bordering `cell_id`.
     */
    cell_tiles(cell_id: number): Uint32Array;
    indices(): Uint32Array;
    ranges(): Uint32Array;
    tile_distortions(): Float32Array;
    tile_ids(): Uint32Array;
    tile_vertices(): Uint8Array;
    vertices(): Float32Array;
}

export class WasmCdtMesh {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    constraints(): Uint32Array;
    error_message(): string | undefined;
    triangles(): Uint32Array;
    vertices(): Float32Array;
}

export class WasmHexMesh {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    dual(): WiredPolygonMeshHandle;
    primal(): WiredPolygonMeshHandle;
    world_size(): number;
}

export class WasmWorld {
    free(): void;
    [Symbol.dispose](): void;
    const_cell_world_size(): number;
    const_chunk_world_size(): number;
    corner_cells(q: number, r: number, corner_idx: HexPointyDir): CornerCellsHandle | undefined;
    edge_cells(q: number, r: number, edge_idx: HexFlatDir): EdgeCellsHandle | undefined;
    init_chunk(q: number, r: number): void;
    inner_cells(q: number, r: number): InnerCellsHandle | undefined;
    constructor();
    remove_chunk(q: number, r: number): void;
}

export class WasmWorldNeighbors {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Returns 12 floats (6 vertices * 2 coords) for the given chunk
     */
    chunk_hex_vertices(chunk_idx: number): Float32Array;
    /**
     * Get corner mesh for the given corner
     */
    corner_mesh(corner_idx: HexPointyDir): WiredPolygonMeshHandle | undefined;
    /**
     * Get edge mesh for the given edge
     */
    edge_mesh(edge_idx: HexFlatDir): WiredPolygonMeshHandle | undefined;
    /**
     * Get inner mesh for the given chunk
     */
    inner_mesh(chunk_idx: number): WiredPolygonMeshHandle | undefined;
}

/**
 * Zero-copy WASM view over a WiredPolygonMesh.
 * All accessors return views into Wasm linear memory — clone on the JS side
 * (e.g. `arr.slice()`) if the data must outlive this object or any further Wasm call.
 */
export class WiredPolygonMeshHandle {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    has_wires(): boolean;
    indices(): Uint32Array;
    ranges(): Uint32Array;
    vertices(): Float32Array;
    wire_indices(): Uint32Array;
    wire_ranges(): Uint32Array;
}

/**
 * Generate a CDT from random points and constraint edges.
 * `config_json`: { "n_points": u32, "n_edges": u32, "seed": u32, "bound": i32 }
 */
export function generate_cdt(config_json: string): WasmCdtMesh;

/**
 * Generate a hex quad mesh from a JSON config string.
 */
export function generate_mesh(config_json: string): WasmHexMesh;

/**
 * Generate world neighbors geometry for visualization
 */
export function generate_world_neighbors(center_q: number, center_r: number): WasmWorldNeighbors;

/**
 * Axial distance between two hex coordinates.
 */
export function hex_distance(aq: number, ar: number, bq: number, br: number): number;

/**
 * Nearest flat-top hex [q, r] for world position (x, y) with given circumradius size.
 * Inverse of hex_flat_to_position.
 */
export function hex_flat_from_position(x: number, y: number, size: number): Int32Array;

/**
 * Neighbor of (q, r) in the given flat-top direction. Returns [q, r].
 */
export function hex_flat_neighbor(q: number, r: number, dir: HexFlatDir): Int32Array;

/**
 * World position [x, y] of the flat-top hex center at (q, r) with given circumradius size.
 */
export function hex_flat_to_position(q: number, r: number, size: number): Float32Array;

/**
 * Nearest pointy-top hex [q, r] for world position (x, y) with given circumradius size.
 * Inverse of hex_pointy_to_position.
 */
export function hex_pointy_from_position(x: number, y: number, size: number): Int32Array;

/**
 * Neighbor of (q, r) in the given pointy-top direction. Returns [q, r].
 */
export function hex_pointy_neighbor(q: number, r: number, dir: HexPointyDir): Int32Array;

/**
 * World position [x, y] of the pointy-top hex center at (q, r) with given circumradius size.
 */
export function hex_pointy_to_position(q: number, r: number, size: number): Float32Array;

/**
 * Flat [q0,r0, q1,r1, ...] for the ring at given radius from (q, r).
 * Order: starts at direction-0 corner, walks CCW — matches Rust RingIterator.
 */
export function hex_ring(q: number, r: number, radius: number): Int32Array;

export function memory_info(): any;

export function start(): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly memory_info: () => any;
    readonly hex_distance: (a: number, b: number, c: number, d: number) => number;
    readonly hex_flat_from_position: (a: number, b: number, c: number) => [number, number];
    readonly hex_flat_neighbor: (a: number, b: number, c: number) => [number, number];
    readonly hex_flat_to_position: (a: number, b: number, c: number) => [number, number];
    readonly hex_pointy_from_position: (a: number, b: number, c: number) => [number, number];
    readonly hex_pointy_to_position: (a: number, b: number, c: number) => [number, number];
    readonly hex_ring: (a: number, b: number, c: number) => [number, number];
    readonly hex_pointy_neighbor: (a: number, b: number, c: number) => [number, number];
    readonly __wbg_cornercellshandle_free: (a: number, b: number) => void;
    readonly __wbg_edgecellshandle_free: (a: number, b: number) => void;
    readonly __wbg_wiredpolygonmeshhandle_free: (a: number, b: number) => void;
    readonly cornercellshandle_cell_ids: (a: number) => any;
    readonly cornercellshandle_cell_tiles: (a: number, b: number, c: number) => any;
    readonly cornercellshandle_indices: (a: number) => any;
    readonly cornercellshandle_ranges: (a: number) => any;
    readonly cornercellshandle_tile_distortions: (a: number) => any;
    readonly cornercellshandle_tile_ids: (a: number) => any;
    readonly cornercellshandle_tile_vertices: (a: number) => any;
    readonly cornercellshandle_vertices: (a: number) => any;
    readonly edgecellshandle_cell_ids: (a: number) => any;
    readonly edgecellshandle_cell_tiles: (a: number, b: number, c: number) => any;
    readonly edgecellshandle_indices: (a: number) => any;
    readonly edgecellshandle_ranges: (a: number) => any;
    readonly edgecellshandle_tile_distortions: (a: number) => any;
    readonly edgecellshandle_tile_ids: (a: number) => any;
    readonly edgecellshandle_tile_vertices: (a: number) => any;
    readonly edgecellshandle_vertices: (a: number) => any;
    readonly innercellshandle_cell_tiles: (a: number, b: number) => any;
    readonly start: () => void;
    readonly wiredpolygonmeshhandle_has_wires: (a: number) => number;
    readonly wiredpolygonmeshhandle_indices: (a: number) => any;
    readonly wiredpolygonmeshhandle_ranges: (a: number) => any;
    readonly wiredpolygonmeshhandle_vertices: (a: number) => any;
    readonly wiredpolygonmeshhandle_wire_indices: (a: number) => any;
    readonly wiredpolygonmeshhandle_wire_ranges: (a: number) => any;
    readonly __wbg_innercellshandle_free: (a: number, b: number) => void;
    readonly innercellshandle_vertices: (a: number) => any;
    readonly innercellshandle_tile_vertices: (a: number) => any;
    readonly innercellshandle_tile_ids: (a: number) => any;
    readonly innercellshandle_tile_distortions: (a: number) => any;
    readonly innercellshandle_ranges: (a: number) => any;
    readonly innercellshandle_indices: (a: number) => any;
    readonly innercellshandle_cell_ids: (a: number) => any;
    readonly __wbg_wasmcdtmesh_free: (a: number, b: number) => void;
    readonly __wbg_wasmhexmesh_free: (a: number, b: number) => void;
    readonly __wbg_wasmworldneighbors_free: (a: number, b: number) => void;
    readonly generate_cdt: (a: number, b: number) => number;
    readonly generate_mesh: (a: number, b: number) => [number, number, number];
    readonly generate_world_neighbors: (a: number, b: number) => [number, number, number];
    readonly wasmcdtmesh_constraints: (a: number) => any;
    readonly wasmcdtmesh_error_message: (a: number) => [number, number];
    readonly wasmcdtmesh_triangles: (a: number) => any;
    readonly wasmcdtmesh_vertices: (a: number) => any;
    readonly wasmhexmesh_dual: (a: number) => number;
    readonly wasmhexmesh_primal: (a: number) => number;
    readonly wasmhexmesh_world_size: (a: number) => number;
    readonly wasmworldneighbors_chunk_hex_vertices: (a: number, b: number) => [number, number];
    readonly wasmworldneighbors_corner_mesh: (a: number, b: number) => number;
    readonly wasmworldneighbors_edge_mesh: (a: number, b: number) => number;
    readonly wasmworldneighbors_inner_mesh: (a: number, b: number) => number;
    readonly __wbg_wasmworld_free: (a: number, b: number) => void;
    readonly wasmworld_chunk_world_offset: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly wasmworld_const_cell_world_size: (a: number) => number;
    readonly wasmworld_const_chunk_world_size: (a: number) => number;
    readonly wasmworld_corner_cells: (a: number, b: number, c: number, d: number) => number;
    readonly wasmworld_edge_cells: (a: number, b: number, c: number, d: number) => number;
    readonly wasmworld_init_chunk: (a: number, b: number, c: number) => void;
    readonly wasmworld_inner_cells: (a: number, b: number, c: number) => number;
    readonly wasmworld_new: () => number;
    readonly wasmworld_remove_chunk: (a: number, b: number, c: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
