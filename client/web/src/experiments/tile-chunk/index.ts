import { InnerCellsHandle, WasmWorld } from '#wasm';
import * as THREE from 'three';
import { color } from 'three/tsl';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { own, share } from '../../engine/resources/ownership';
import type { SceneContext } from '../../engine/scene';
import { InstancedTileSet } from '../../engine/scene/instancing/instanced-tile-set';
import type { TileDistortion } from '../../engine/scene/instancing/instanced-tile-set';
import { WireMesh } from '../../engine/scene/wire-mesh';
import { fireAndForget } from '../../engine/utils';
import { asPolygonMesh, asTileOutlineMesh } from '../../mesh/polygon-mesh';
import { AssetSourcePicker } from '../asset-source-picker';
import { Experiment } from '../experiment';

const TILE_HEIGHT = 80;
const INSTANCE_COUNT_HINT = 2048;

function buildProceduralTileSet(parent: THREE.Object3D, instanceCountHint: number): InstancedTileSet {
    const sphereGeo = new THREE.SphereGeometry(0.4, 16, 12);
    sphereGeo.translate(0.5, 0.5, 0.5);
    const boxGeo = new THREE.BoxGeometry(1, 1, 1, 2, 2, 2);
    boxGeo.translate(0.5, 0.5, 0.5);
    const torusGeo = new THREE.TorusGeometry(0.3, 0.12, 12, 24);
    torusGeo.translate(0.5, 0.5, 0.5);

    const geos = [sphereGeo, boxGeo, torusGeo];
    let totalVerts = 0;
    let totalIndices = 0;
    for (const g of geos) {
        totalVerts += g.attributes.position.count;
        totalIndices += g.index!.count;
    }

    const positions = new Float32Array(totalVerts * 3);
    const indices = new Uint32Array(totalIndices);
    const ranges: number[] = [];
    let vOffset = 0;
    let iOffset = 0;

    for (const g of geos) {
        const pos = g.attributes.position.array as Float32Array;
        positions.set(pos, vOffset * 3);
        const src = g.index!.array;
        ranges.push(iOffset);
        for (let i = 0; i < src.length; i++) indices[iOffset + i] = src[i] + vOffset;
        iOffset += src.length;
        ranges.push(iOffset);
        vOffset += g.attributes.position.count;
        g.dispose();
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));

    const makeMat = (hex: number) => {
        const m = new MeshStandardNodeMaterial({ roughness: 0.6, metalness: 0.2, side: THREE.DoubleSide });
        m.colorNode = color(hex);
        return share(m);
    };

    return new InstancedTileSet(parent, {
        geometry: own(geometry),
        variants: [
            { parts: [{ baseMaterial: makeMat(0x4488cc), indexStart: ranges[0], indexEnd: ranges[1] }] },
            { parts: [{ baseMaterial: makeMat(0xcc4444), indexStart: ranges[2], indexEnd: ranges[3] }] },
            { parts: [{ baseMaterial: makeMat(0x44cc88), indexStart: ranges[4], indexEnd: ranges[5] }] }
        ],
        instanceCountHint
    });
}

// CCW quad corners [BL, BR, TR, TL] → trilinear cp indices [0, 1, 3, 2]
// cp layout: (0,0)=cp0, (1,0)=cp1, (0,1)=cp2, (1,1)=cp3  (bottom face, z=0)
//            (0,0)=cp4, (1,0)=cp5, (0,1)=cp6, (1,1)=cp7  (top face,    z=1)
const CCW_TO_CP = [0, 1, 3, 2];

function buildTileDistortion(tileDistortions: Float32Array, tileIdx: number): TileDistortion {
    const d = new Float32Array(24);
    const base = tileIdx * 8; // 4 corners × 2 coords
    for (let c = 0; c < 4; c++) {
        const x = tileDistortions[base + c * 2];
        const y = tileDistortions[base + c * 2 + 1];
        const cp = CCW_TO_CP[c];
        d[cp * 3] = x;
        d[cp * 3 + 1] = y;
        d[cp * 3 + 2] = 0;
        d[(cp + 4) * 3] = x;
        d[(cp + 4) * 3 + 1] = y;
        d[(cp + 4) * 3 + 2] = TILE_HEIGHT;
    }
    return d;
}

// Quad outlines of every tile, taken straight from the packed [x, y] × 4 corners of `tile_distortions`.

export class TileChunk extends Experiment {
    private readonly world: WasmWorld;
    private tileNode: InstancedTileSet;
    private readonly chunkGroup: THREE.Group;
    private readonly assetPicker: AssetSourcePicker;
    private readonly params = { q: 0, r: 0 };
    private readonly displayParams = { showMeshes: true, showCells: true, showTiles: false };
    private readonly fillParams = { variant: 0 };

    private tileCount = 0;
    private tileVariants = new Uint8Array(0);
    private distortions: TileDistortion[] = [];
    private loadedChunk: { q: number; r: number } | null = null;
    private innerCells: InnerCellsHandle | null = null;
    private cellWire: WireMesh | null = null;
    private tileWire: WireMesh | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private fillVariantCtrl: any = null;
    private variantVisible: boolean[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private variantVisibleFolder: any = null;

    constructor(context: SceneContext) {
        super(context, { title: 'Tile Chunk' });

        this.camera.far = 8000;
        this.camera.updateProjectionMatrix();
        this.camera.position.set(0, -1800, 2000);
        this.camera.lookAt(0, 0, 0);
        if (this.controls) this.controls.update();

        this.world = new WasmWorld();
        this.chunkGroup = new THREE.Group();
        this.scene.add(this.chunkGroup);
        this.tileNode = buildProceduralTileSet(this.chunkGroup, INSTANCE_COUNT_HINT);
        this.tileNode.group.visible = this.displayParams.showMeshes;

        const gui = this.debugPanel.root();
        const qCtrl = gui
            .add(this.params, 'q')
            .name('Q')
            .step(1)
            .onFinishChange(() => this.regenerate());
        const rCtrl = gui
            .add(this.params, 'r')
            .name('R')
            .step(1)
            .onFinishChange(() => this.regenerate());
        gui.add(
            {
                randomize: () => {
                    const range = 100;
                    this.params.q = Math.floor(Math.random() * 2 * range) - range;
                    this.params.r = Math.floor(Math.random() * 2 * range) - range;
                    qCtrl.updateDisplay();
                    rCtrl.updateDisplay();
                    this.regenerate();
                }
            },
            'randomize'
        ).name('Random Chunk');

        gui.add({ switchRandom: () => this.switchRandomTile() }, 'switchRandom').name('Switch Random Tile');
        gui.add(this.displayParams, 'showMeshes')
            .name('Show Meshes')
            .onChange((v: boolean) => (this.tileNode.group.visible = v));
        gui.add(this.displayParams, 'showCells')
            .name('Show Cells')
            .onChange((v: boolean) => (v ? this.cellWire?.show() : this.cellWire?.hide()));
        gui.add(this.displayParams, 'showTiles')
            .name('Show Tiles')
            .onChange((v: boolean) => (v ? this.tileWire?.show() : this.tileWire?.hide()));

        this.assetPicker = new AssetSourcePicker(gui, this.assets, {
            onNone: () => this.replaceTileSet(buildProceduralTileSet(this.chunkGroup, INSTANCE_COUNT_HINT)),
            onAsset: (name) => fireAndForget(this.loadAsset(name)),
            onFile: (url) => fireAndForget(this.loadFile(url))
        });

        this.fillVariantCtrl = gui
            .add(this.fillParams, 'variant')
            .name('Fill Variant')
            .min(0)
            .max(this.tileNode.variantCount - 1)
            .step(1);
        gui.add({ fillAll: () => this.fillAll() }, 'fillAll').name('Fill All');

        this.rebuildVariantVisibilityFolder();

        this.regenerate();
    }

    init(): void {
        this.context.runtime.spawn(this.assetPicker.populate());
    }

    private async loadAsset(name: string): Promise<void> {
        try {
            const modelSet = await this.assets.loadModelSet(name);
            this.replaceTileSet(
                InstancedTileSet.fromModelSet(this.chunkGroup, modelSet, { instanceCountHint: INSTANCE_COUNT_HINT })
            );
        } catch (err) {
            console.error(`[TileChunk] failed to load asset "${name}":`, err);
        }
    }

    private async loadFile(url: string): Promise<void> {
        try {
            const next = await InstancedTileSet.fromGltf(this.chunkGroup, url, {
                instanceCountHint: INSTANCE_COUNT_HINT
            });
            this.replaceTileSet(next);
        } catch (err) {
            console.error('Failed to load glTF:', err);
        }
    }

    private replaceTileSet(next: InstancedTileSet): void {
        this.tileNode.dispose();
        this.tileNode = next;
        this.tileNode.group.visible = this.displayParams.showMeshes;
        this.fillParams.variant = 0;
        this.fillVariantCtrl?.max(next.variantCount - 1).updateDisplay();
        this.rebuildVariantVisibilityFolder();
        for (let i = 0; i < this.tileCount; i++) {
            const v = i % this.tileNode.variantCount;
            this.tileVariants[i] = v;
            this.tileNode.setTile(v, this.innerCells!.tile_ids()[i], new THREE.Matrix4(), this.distortions[i]);
        }
        for (let i = 0; i < this.tileNode.variantCount; i++) {
            this.tileNode.setVariantVisible(i, this.variantVisible[i] ?? true);
        }
    }

    private fillAll(): void {
        if (this.tileCount === 0) return;
        const v = Math.min(this.fillParams.variant, this.tileNode.variantCount - 1);
        for (let i = 0; i < this.tileCount; i++) {
            if (this.tileVariants[i] !== v) {
                const tileId = this.innerCells!.tile_ids()[i];
                this.tileNode.removeTile(this.tileVariants[i], tileId);
                this.tileNode.setTile(v, tileId, new THREE.Matrix4(), this.distortions[i]);
                this.tileVariants[i] = v;
            }
        }
    }

    private regenerate(): void {
        if (this.loadedChunk) {
            for (let i = 0; i < this.tileCount; i++) {
                this.tileNode.removeTile(this.tileVariants[i], this.innerCells!.tile_ids()[i]);
            }
            this.world.remove_chunk(this.loadedChunk.q, this.loadedChunk.r);
            this.loadedChunk = null;
        }
        this.tileCount = 0;
        this.tileVariants = new Uint8Array(0);
        this.distortions = [];

        this.cellWire?.dispose();
        this.cellWire = null;
        this.tileWire?.dispose();
        this.tileWire = null;

        // drop the previous chunk's view before requesting the new one
        this.innerCells?.free();
        this.innerCells = null;

        const { q, r } = this.params;
        this.world.init_chunk(q, r);
        this.loadedChunk = { q, r };

        this.innerCells = this.world.inner_cells(q, r)!;
        const tileCount = this.innerCells.tile_ids().length;
        const tileDistortions = this.innerCells.tile_distortions();

        this.tileCount = tileCount;
        this.tileVariants = new Uint8Array(tileCount).map((_, i) => i % this.tileNode.variantCount);

        for (let i = 0; i < tileCount; i++) {
            const d = buildTileDistortion(tileDistortions, i);
            this.distortions.push(d);
            this.tileNode.setTile(this.tileVariants[i], this.innerCells.tile_ids()[i], new THREE.Matrix4(), d);
        }
        this.cellWire = WireMesh.fromPolygons(this.chunkGroup, asPolygonMesh(this.innerCells));
        if (this.displayParams.showCells) this.cellWire.show();

        this.tileWire = WireMesh.fromPolygons(this.chunkGroup, asTileOutlineMesh(this.innerCells), {
            color: 0xffaa00
        });
        if (this.displayParams.showTiles) this.tileWire.show();
    }

    private switchRandomTile(): void {
        if (this.tileCount === 0) return;
        const idx = Math.floor(Math.random() * this.tileCount);
        const tileId = this.innerCells!.tile_ids()[idx];
        const currentVariant = this.tileVariants[idx];
        const nextVariant = (currentVariant + 1) % this.tileNode.variantCount;
        this.tileNode.removeTile(currentVariant, tileId);
        this.tileNode.setTile(nextVariant, tileId, new THREE.Matrix4(), this.distortions[idx]);
        this.tileVariants[idx] = nextVariant;
    }

    private rebuildVariantVisibilityFolder(): void {
        const gui = this.debugPanel.root();
        if (this.variantVisibleFolder) {
            this.variantVisibleFolder.destroy();
            this.variantVisibleFolder = null;
        }

        const count = this.tileNode.variantCount;
        this.variantVisible = Array.from({ length: count }, (_, i) =>
            i < this.variantVisible.length ? this.variantVisible[i] : true
        );

        const folder = gui.addFolder('Variants');
        folder.close();
        this.variantVisibleFolder = folder;

        const allParam = { showAll: this.variantVisible.every((v) => v) };
        const allCtrl = folder.add(allParam, 'showAll').name('Show All');

        const row = document.createElement('div');
        row.style.cssText =
            'display:flex;gap:8px;padding:0 var(--padding);height:var(--widget-height);align-items:center;';

        const checkboxes = this.variantVisible.map((checked, i) => {
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = checked;
            checkbox.style.cssText = 'cursor:pointer;';
            checkbox.addEventListener('change', () => {
                this.variantVisible[i] = checkbox.checked;
                allParam.showAll = this.variantVisible.every((v) => v);
                allCtrl.updateDisplay();
                this.tileNode.setVariantVisible(i, checkbox.checked);
            });
            const label = document.createElement('label');
            label.textContent = String(i);
            label.style.cssText = 'display:flex;gap:4px;align-items:center;cursor:pointer;';
            label.prepend(checkbox);
            row.appendChild(label);
            return checkbox;
        });

        (folder as unknown as { $children: HTMLElement }).$children.appendChild(row);

        allCtrl.onChange((value: boolean) => {
            this.variantVisible.fill(value);
            checkboxes.forEach((cb) => (cb.checked = value));
            for (let i = 0; i < count; i++) this.tileNode.setVariantVisible(i, value);
        });
    }

    dispose(): void {
        this.assetPicker.dispose();
        if (this.loadedChunk) {
            this.world.remove_chunk(this.loadedChunk.q, this.loadedChunk.r);
        }
        this.innerCells?.free();
        this.cellWire?.dispose();
        this.tileWire?.dispose();
        this.scene.remove(this.chunkGroup);
        this.tileNode.dispose();
        this.world.free();
        super.dispose();
    }
}
