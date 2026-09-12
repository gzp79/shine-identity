import { CornerCellsHandle, CornerSide, WasmWorld } from '#wasm';
import * as THREE from 'three';
import { EventSubscriptions } from '../../engine/events';
import { SelectionMesh } from '../../engine/scene/selection-mesh';
import { WireMesh } from '../../engine/scene/wire-mesh';
import { computeLocalCentroids } from '../../mesh/centroid';
import { asPolygonMesh } from '../../mesh/polygon-mesh';
import { ChunkId, HexFlatDir, HexPointyDir } from './chunk-id';
import { SELECTION_CHANGED, type SelectionChangedEvent } from './selection/selection-event';

export { CornerSide };

export class ChunkCornerId {
    constructor(
        public readonly chunkId: ChunkId,
        public readonly cornerIdx: HexPointyDir.E | HexPointyDir.NE | HexPointyDir.NW
    ) {}

    key(): string {
        return `${this.chunkId.key()}-c${this.cornerIdx}`;
    }

    equals(other: ChunkCornerId): boolean {
        return this.chunkId.equals(other.chunkId) && this.cornerIdx === other.cornerIdx;
    }

    involvedChunkIds(): [ChunkId, ChunkId, ChunkId] {
        const CORNER_NEIGHBORS: Record<HexPointyDir.E | HexPointyDir.NE | HexPointyDir.NW, [HexFlatDir, HexFlatDir]> = {
            [HexPointyDir.E]: [HexFlatDir.SE, HexFlatDir.NE],
            [HexPointyDir.NE]: [HexFlatDir.NE, HexFlatDir.N],
            [HexPointyDir.NW]: [HexFlatDir.N, HexFlatDir.NW]
        };
        const [n1, n2] = CORNER_NEIGHBORS[this.cornerIdx];
        return [this.chunkId, this.chunkId.neighbor(n1), this.chunkId.neighbor(n2)];
    }

    isInteractable(reference: ChunkId): boolean {
        return this.involvedChunkIds().some((id) => id.isInteractable(reference));
    }
}

export class ChunkCorner {
    readonly group = new THREE.Group();
    readonly cells: CornerCellsHandle;
    private wireframe: WireMesh;
    private selectionMesh: SelectionMesh;
    private _centroids: Float32Array | null = null;
    private readonly subscriptions: EventSubscriptions;

    constructor(
        private readonly world: WasmWorld,
        readonly id: ChunkCornerId,
        events: EventTarget
    ) {
        this.group.userData = { chunkCornerId: id, chunkCorner: this };
        this.cells = world.corner_cells(id.chunkId.q, id.chunkId.r, id.cornerIdx)!;
        this.wireframe = WireMesh.fromPolygons(this.group, asPolygonMesh(this.cells));
        this.selectionMesh = new SelectionMesh(this.group, asPolygonMesh(this.cells));
        this.subscriptions = new EventSubscriptions(events);
        this.subscriptions.on<SelectionChangedEvent>(SELECTION_CHANGED, this.handleSelectionChanged);
    }

    init(referenceChunkId: ChunkId): void {
        const offset = this.worldOffset(referenceChunkId);
        this.group.position.set(offset[0], offset[1], 0);
    }

    worldOffset(ref: ChunkId): [number, number] {
        return this.world.chunk_world_offset(ref.q, ref.r, this.id.chunkId.q, this.id.chunkId.r);
    }

    get centroids(): Float32Array {
        if (!this._centroids) {
            this._centroids = computeLocalCentroids(asPolygonMesh(this.cells))!;
        }
        return this._centroids;
    }

    get showCellWires(): boolean {
        return this.wireframe.isVisible();
    }

    set showCellWires(value: boolean) {
        if (value) this.wireframe.show();
        else this.wireframe.hide();
    }

    dispose(): void {
        this.subscriptions.dispose();
        this.selectionMesh.dispose();
        this.wireframe.dispose();
        this.cells.free();
    }

    private handleSelectionChanged = (event: SelectionChangedEvent): void => {
        const sel = event.selection;
        if (sel?.type === 'corner-cell' && sel.corner === this) {
            this.selectionMesh.show(sel.cellId);
        } else {
            this.selectionMesh.hide();
        }
    };
}
