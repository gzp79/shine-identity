import { EdgeCellsHandle, WasmWorld } from '#wasm';
import * as THREE from 'three';
import { EventSubscriptions } from '../../engine/events';
import { SelectionMesh } from '../../engine/scene/selection-mesh';
import { WireMesh } from '../../engine/scene/wire-mesh';
import { computeLocalCentroids } from '../../mesh/centroid';
import { asPolygonMesh } from '../../mesh/polygon-mesh';
import { ChunkId, HexFlatDir } from './chunk-id';
import { SELECTION_CHANGED, type SelectionChangedEvent } from './selection/selection-event';

export class ChunkEdgeId {
    constructor(
        // The "owner" chunk id. Edge data is stored relative to this chunk.
        public readonly chunkId: ChunkId,
        public readonly edgeIdx: HexFlatDir.NE | HexFlatDir.N | HexFlatDir.NW
    ) {}

    key(): string {
        return `${this.chunkId.key()}-e${this.edgeIdx}`;
    }

    equals(other: ChunkEdgeId): boolean {
        return this.chunkId.equals(other.chunkId) && this.edgeIdx === other.edgeIdx;
    }

    involvedChunkIds(): [ChunkId, ChunkId] {
        return [this.chunkId, this.chunkId.neighbor(this.edgeIdx)];
    }

    isInteractable(reference: ChunkId): boolean {
        return this.involvedChunkIds().some((id) => id.isInteractable(reference));
    }
}

export class ChunkEdge {
    readonly group = new THREE.Group();
    readonly cells: EdgeCellsHandle;
    private wireframe: WireMesh;
    private selectionMesh: SelectionMesh;
    private _centroids: Float32Array | null = null;
    private readonly subscriptions: EventSubscriptions;

    constructor(
        private readonly world: WasmWorld,
        readonly id: ChunkEdgeId,
        events: EventTarget
    ) {
        this.group.userData = { chunkEdgeId: id, chunkEdge: this };
        this.cells = world.edge_cells(id.chunkId.q, id.chunkId.r, id.edgeIdx)!;
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
        if (sel?.type === 'edge-cell' && sel.edge === this) {
            this.selectionMesh.show(sel.cellId);
        } else {
            this.selectionMesh.hide();
        }
    };
}
