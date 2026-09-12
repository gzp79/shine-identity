import { HexFlatDir, HexPointyDir } from '#wasm';
import * as THREE from 'three';
import { ChunkConst } from '../../constants';
import { range } from '../../engine/utils';

export { HexFlatDir, HexPointyDir };

/** (dq, dr) deltas indexed by HexFlatDir. */
const HEX_DIRECTIONS: ReadonlyArray<[number, number]> = [
    [1, -1], // NE
    [0, -1], // N
    [-1, 0], // NW
    [-1, 1], // SW
    [0, 1], // S
    [1, 0] // SE
];

/** Ring walk directions (NW→SW→S→SE→NE→N), matching Rust RingIterator. */
const RING_WALK: ReadonlyArray<HexFlatDir> = [
    HexFlatDir.NW,
    HexFlatDir.SW,
    HexFlatDir.S,
    HexFlatDir.SE,
    HexFlatDir.NE,
    HexFlatDir.N
];

/** Chunk grid coordinate. */
export class ChunkId {
    static readonly ORIGIN = new ChunkId(0, 0);

    constructor(
        readonly q: number,
        readonly r: number
    ) {}

    key(): string {
        return `${this.q},${this.r}`;
    }

    /** Check equality with another chunk coordinate. */
    equals(other: ChunkId): boolean {
        return this.q === other.q && this.r === other.r;
    }

    /** Calculate hex distance to another chunk using cube coordinates. */
    distanceTo(other: ChunkId): number {
        const dq = this.q - other.q;
        const dr = this.r - other.r;
        const ds = -this.q - this.r - (-other.q - other.r);
        return (Math.abs(dq) + Math.abs(dr) + Math.abs(ds)) / 2;
    }

    isTracked(reference: ChunkId): boolean {
        return this.distanceTo(reference) <= ChunkConst.MAX_TRACKED_DISTANCE;
    }

    isInteractable(reference: ChunkId): boolean {
        return this.distanceTo(reference) <= ChunkConst.MAX_ACTIVE_DISTANCE;
    }

    /** Return the 6 immediate hex neighbors in HexFlatDir order. */
    neighbors(): ChunkId[] {
        return HEX_DIRECTIONS.map(([dq, dr]) => new ChunkId(this.q + dq, this.r + dr));
    }

    /** Get neighbor in the given HexFlatDir direction. */
    neighbor(direction: HexFlatDir): ChunkId {
        const [dq, dr] = HEX_DIRECTIONS[direction];
        return new ChunkId(this.q + dq, this.r + dr);
    }

    /**
     * Return all coordinates on the hex ring at the given radius.
     * Starts at the NE corner, walks NW→SW→S→SE→NE→N — matches Rust RingIterator.
     */
    ring(radius: number): ChunkId[] {
        if (radius === 0) return [new ChunkId(this.q, this.r)];

        const results: ChunkId[] = [];
        // Start at NE corner: center + NE * radius
        const [dq0, dr0] = HEX_DIRECTIONS[HexFlatDir.NE];
        let q = this.q + dq0 * radius;
        let r = this.r + dr0 * radius;

        for (const dir of RING_WALK) {
            const [dq, dr] = HEX_DIRECTIONS[dir];
            for (let step = 0; step < radius; step++) {
                results.push(new ChunkId(q, r));
                q += dq;
                r += dr;
            }
        }

        return results;
    }

    /** Return all coordinates within the given radius. */
    spiral(radius: number): ChunkId[] {
        return range(0, radius)
            .map((r: number) => this.ring(r))
            .flatten()
            .toArray();
    }

    /** World position of this chunk relative to a reference chunk (matches Rust FlatAxialCoord::to_position). */
    toWorldPosition(reference: ChunkId): THREE.Vector2 {
        const x = ChunkConst.WORLD_SIZE * 1.5 * this.q;
        const y = -ChunkConst.WORLD_SIZE * (Math.sqrt(3) * this.r + (Math.sqrt(3) / 2) * this.q);
        const refX = ChunkConst.WORLD_SIZE * 1.5 * reference.q;
        const refY = -ChunkConst.WORLD_SIZE * (Math.sqrt(3) * reference.r + (Math.sqrt(3) / 2) * reference.q);
        return new THREE.Vector2(x - refX, y - refY);
    }

    /** Chunk containing the given world position (position is relative to reference chunk). */
    static fromWorldPosition(reference: ChunkId, worldPos: THREE.Vector2): ChunkId {
        const refX = ChunkConst.WORLD_SIZE * 1.5 * reference.q;
        const refY = -ChunkConst.WORLD_SIZE * (Math.sqrt(3) * reference.r + (Math.sqrt(3) / 2) * reference.q);
        const absX = worldPos.x + refX;
        const absY = worldPos.y + refY;
        const q = (2 / 3) * (absX / ChunkConst.WORLD_SIZE);
        const r = -absY / ChunkConst.WORLD_SIZE / Math.sqrt(3) - q / 2;
        return ChunkId.roundAxial(q, r);
    }

    private static roundAxial(q: number, r: number): ChunkId {
        const s = -q - r;
        let rq = Math.round(q);
        let rr = Math.round(r);
        const rs = Math.round(s);
        const qd = Math.abs(rq - q);
        const rd = Math.abs(rr - r);
        const sd = Math.abs(rs - s);
        if (qd > rd && qd > sd) rq = -rr - rs;
        else if (rd > sd) rr = -rq - rs;
        return new ChunkId(rq, rr);
    }
}

/** Hex axial coordinate. */
export class AxialCoord {
    constructor(
        readonly q: number,
        readonly r: number
    ) {}
    key(): string {
        return `${this.q},${this.r}`;
    }
}
