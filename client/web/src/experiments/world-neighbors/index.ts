import { generate_world_neighbors } from '#wasm';
import * as THREE from 'three';
import type { SceneContext } from '../../engine/scene';
import { Experiment } from '../experiment';
import { createControls, defaultParams } from './controls';
import { buildChunkHexagons, buildCornerMeshes, buildEdgeMeshes, buildInteriorMeshes } from './mesh-builder';

export class WorldNeighbors extends Experiment {
    private params = defaultParams();
    private hexagons: THREE.Group | null = null;
    private interiorGroup: ReturnType<typeof buildInteriorMeshes> | null = null;
    private edgeGroup: ReturnType<typeof buildEdgeMeshes> | null = null;
    private cornerGroup: ReturnType<typeof buildCornerMeshes> | null = null;
    constructor(context: SceneContext) {
        super(context, { title: 'World Neighbors' });

        this.camera.far = 10000;
        this.camera.updateProjectionMatrix();
        this.camera.position.set(0, -2500, 2000);
        this.camera.lookAt(0, 0, 0);
        if (this.controls) this.controls.update();

        createControls(
            this.debugPanel,
            this.params,
            () => this.applyDisplay(),
            () => this.regenerate()
        );
        this.regenerate();
    }

    private applyDisplay() {
        if (this.hexagons) this.hexagons.visible = this.params.showHexagons;
        if (this.interiorGroup) {
            for (let i = 0; i < 7; i++) this.interiorGroup.setIndividualVisible(i, this.params.showInterior[i]);
        }
        if (this.edgeGroup) {
            for (let i = 0; i < 6; i++) this.edgeGroup.setIndividualVisible(i, this.params.showEdges[i]);
        }
        if (this.cornerGroup) {
            for (let i = 0; i < 6; i++) this.cornerGroup.setIndividualVisible(i, this.params.showCorners[i]);
        }
    }

    private disposeScene() {
        if (this.hexagons) {
            this.scene.remove(this.hexagons);
            this.hexagons.traverse((obj) => {
                if (obj instanceof THREE.Line) {
                    obj.geometry.dispose();
                    (obj.material as THREE.Material).dispose();
                }
            });
            this.hexagons = null;
        }
        if (this.interiorGroup) {
            this.scene.remove(this.interiorGroup.group);
            this.interiorGroup.dispose();
            this.interiorGroup = null;
        }
        if (this.edgeGroup) {
            this.scene.remove(this.edgeGroup.group);
            this.edgeGroup.dispose();
            this.edgeGroup = null;
        }
        if (this.cornerGroup) {
            this.scene.remove(this.cornerGroup.group);
            this.cornerGroup.dispose();
            this.cornerGroup = null;
        }
    }

    private regenerate() {
        this.disposeScene();
        try {
            const wasmData = generate_world_neighbors(this.params.centerQ, this.params.centerR);

            this.hexagons = buildChunkHexagons(wasmData);
            this.scene.add(this.hexagons);

            this.interiorGroup = buildInteriorMeshes(wasmData);
            this.scene.add(this.interiorGroup.group);

            this.edgeGroup = buildEdgeMeshes(wasmData);
            this.scene.add(this.edgeGroup.group);

            this.cornerGroup = buildCornerMeshes(wasmData);
            this.scene.add(this.cornerGroup.group);

            wasmData.free();
            this.applyDisplay();
        } catch (e) {
            console.error('World neighbors generation failed:', e);
        }
    }

    dispose() {
        this.disposeScene();
        super.dispose();
    }
}
