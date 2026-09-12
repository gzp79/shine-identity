import { generate_mesh } from '#wasm';
import * as THREE from 'three';
import { ManagedMesh } from '../../engine/resources/managed-mesh';
import type { SceneContext } from '../../engine/scene';
import { span } from '../../engine/utils';
import { asWiredPolygonMesh } from '../../mesh/polygon-mesh';
import { Experiment } from '../experiment';
import { createControls, defaultParams, paramsToConfigJson } from './controls';
import { HexMeshGroup, buildHexMesh } from './mesh-builder';

export class HexMesh extends Experiment {
    private params = defaultParams();
    private currentMesh: HexMeshGroup | null = null;
    private debugCircle: ManagedMesh | null = null;
    private axesGroup: THREE.Group | null = null;

    constructor(context: SceneContext) {
        super(context, { title: 'Hex Mesh' });
        createControls(
            this.debugPanel,
            this.params,
            () => this.regenerate(),
            () => this.applyDisplay()
        );
        this.regenerate();
    }

    private applyDisplay() {
        if (this.currentMesh) {
            this.currentMesh.setPrimalMeshVisible(this.params.showPrimalMesh);
            this.currentMesh.setPrimalWireVisible(this.params.showPrimalWire);
            this.currentMesh.setDualMeshVisible(this.params.showDualMesh);
            this.currentMesh.setDualWireVisible(this.params.showDualWire);
            this.currentMesh.setAnchorVisible(this.params.showAnchor);
            this.currentMesh.setAnchorVerticesVisible(this.params.showAnchorVertices);
        }
    }

    private regenerate() {
        if (this.currentMesh) {
            this.scene.remove(this.currentMesh.group);
            this.currentMesh.dispose();
            this.currentMesh = null;
        }
        if (this.debugCircle) {
            this.scene.remove(this.debugCircle);
            this.debugCircle.dispose();
            this.debugCircle = null;
        }
        if (this.axesGroup) {
            this.scene.remove(this.axesGroup);
            this.axesGroup.traverse((obj) => {
                if (obj instanceof THREE.Line) {
                    obj.geometry.dispose();
                    (obj.material as THREE.Material).dispose();
                }
            });
            this.axesGroup = null;
        }

        try {
            using _s = span('regenerate');

            const configJson = paramsToConfigJson(this.params);
            let worldSize: number;
            {
                using _s = span('generate_mesh');
                const wasmMesh = generate_mesh(configJson);
                const primal = wasmMesh.primal();
                const dual = wasmMesh.dual();

                worldSize = wasmMesh.world_size();
                this.currentMesh = buildHexMesh(asWiredPolygonMesh(primal), asWiredPolygonMesh(dual));

                dual.free();
                primal.free();
                wasmMesh.free();
            }

            this.applyDisplay();
            this.scene.add(this.currentMesh.group);

            const ringGeom = new THREE.RingGeometry(0, worldSize, 64);
            const ringMat = new THREE.MeshBasicMaterial({ color: 0x6f6f6f, side: THREE.DoubleSide });
            this.debugCircle = ManagedMesh.own(ringGeom, ringMat);
            this.debugCircle.position.z = -0.001;
            this.scene.add(this.debugCircle);

            const axisLen = worldSize / 6;
            this.axesGroup = new THREE.Group();
            const axes: [THREE.Vector3, number][] = [
                [new THREE.Vector3(axisLen, 0, 0), 0xff0000],
                [new THREE.Vector3(0, axisLen, 0), 0x00ff00],
                [new THREE.Vector3(0, 0, axisLen), 0x0000ff]
            ];
            const origin = new THREE.Vector3(0, 0, 0);
            for (const [dir, color] of axes) {
                const geom = new THREE.BufferGeometry().setFromPoints([origin, dir]);
                const mat = new THREE.LineBasicMaterial({ color });
                this.axesGroup.add(new THREE.Line(geom, mat));
            }
            this.axesGroup.position.z = 0.02;
            this.scene.add(this.axesGroup);
        } catch (e) {
            console.error('Mesh generation failed:', e);
        }
    }

    dispose() {
        if (this.currentMesh) {
            this.scene.remove(this.currentMesh.group);
            this.currentMesh.dispose();
        }
        if (this.debugCircle) {
            this.scene.remove(this.debugCircle);
            this.debugCircle.dispose();
        }
        if (this.axesGroup) {
            this.scene.remove(this.axesGroup);
            this.axesGroup.traverse((obj) => {
                if (obj instanceof THREE.Line) {
                    obj.geometry.dispose();
                    (obj.material as THREE.Material).dispose();
                }
            });
        }
        super.dispose();
    }
}
