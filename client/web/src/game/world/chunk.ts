import { InnerCellsHandle, WasmWorld } from '#wasm';
import * as THREE from 'three';
import { EventSubscriptions } from '../../engine/events';
import { SelectionMesh } from '../../engine/scene/selection-mesh';
import { WireMesh } from '../../engine/scene/wire-mesh';
import { computeLocalCentroids } from '../../mesh/centroid';
import { asPolygonMesh } from '../../mesh/polygon-mesh';
import { ChunkId } from './chunk-id';
import { SELECTION_CHANGED, type SelectionChangedEvent } from './selection/selection-event';

export class InternalCell {
    readonly position: THREE.Vector3;
    readonly index: number;

    constructor(index: number, x: number, y: number) {
        this.index = index;
        this.position = new THREE.Vector3(x, y, 0);
    }
}

export class Chunk {
    readonly group = new THREE.Group();
    readonly innerCells: InnerCellsHandle;

    private label: THREE.Sprite | null = null;
    private cellWires: WireMesh | null = null;
    private selectionMesh: SelectionMesh;
    private _centroids: Float32Array | null = null;
    private readonly subscriptions: EventSubscriptions;

    constructor(
        private readonly world: WasmWorld,
        readonly id: ChunkId,
        events: EventTarget
    ) {
        this.group.userData = { chunkId: { q: id.q, r: id.r }, chunk: this };
        this.innerCells = world.inner_cells(id.q, id.r)!;
        this.selectionMesh = new SelectionMesh(this.group, asPolygonMesh(this.innerCells));
        this.subscriptions = new EventSubscriptions(events);
        this.subscriptions.on<SelectionChangedEvent>(SELECTION_CHANGED, this.handleSelectionChanged);
    }

    init(referenceChunkId: ChunkId): void {
        const offset = this.worldOffset(referenceChunkId);
        this.group.position.set(offset[0], offset[1], 0);

        if (this.showCellWires) {
            this.buildCellWires();
        }
    }

    dispose(): void {
        this.subscriptions.dispose();
        this.selectionMesh.dispose();
        this.disposeLabel();
        this.cellWires?.dispose();
        this.innerCells.free();
    }

    get showLabel(): boolean {
        return this.label?.visible ?? false;
    }

    set showLabel(value: boolean) {
        if (value) {
            this.createLabel();
        } else {
            this.disposeLabel();
        }
    }

    get showCellWires(): boolean {
        return this.cellWires?.isVisible() ?? false;
    }

    set showCellWires(value: boolean) {
        if (value) {
            this.buildCellWires();
        } else {
            this.cellWires?.dispose();
            this.cellWires = null;
        }
    }

    worldOffset(ref: ChunkId): [number, number] {
        return this.world.chunk_world_offset(ref.q, ref.r, this.id.q, this.id.r);
    }

    get centroids(): Float32Array {
        if (!this._centroids) {
            this._centroids = computeLocalCentroids(asPolygonMesh(this.innerCells))!;
        }
        return this._centroids;
    }

    private handleSelectionChanged = (event: SelectionChangedEvent): void => {
        const sel = event.selection;
        if (sel?.type === 'cell' && sel.chunk === this) {
            this.selectionMesh.show(sel.cellId);
        } else {
            this.selectionMesh.hide();
        }
    };

    private createLabel(): void {
        if (this.label) return;

        // Create canvas for text
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d')!;
        canvas.width = 256;
        canvas.height = 128;

        // Draw text
        context.fillStyle = 'rgba(0, 0, 0, 0.7)';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.font = 'bold 48px monospace';
        context.fillStyle = 'white';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(`(${this.id.q}, ${this.id.r})`, canvas.width / 2, canvas.height / 2);

        // Create sprite
        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({
            map: texture,
            depthTest: false,
            depthWrite: false
        });
        this.label = new THREE.Sprite(material);
        this.label.scale.set(200, 100, 1); // Scale in world units
        this.label.position.set(0, 0, 50); // Position above chunk center
        this.label.renderOrder = 998; // Render before centerDot
        this.group.add(this.label);
    }

    private disposeLabel(): void {
        if (!this.label) return;

        this.group.remove(this.label);
        const material = this.label.material as THREE.SpriteMaterial;
        material.map?.dispose();
        material.dispose();
        this.label = null;
    }

    private buildCellWires(): void {
        if (this.cellWires !== null) {
            return;
        }

        this.cellWires = WireMesh.fromPolygons(this.group, asPolygonMesh(this.innerCells));
        this.cellWires.show();
    }
}
