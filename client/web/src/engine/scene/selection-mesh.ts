import * as THREE from 'three';
import type { PolygonMeshLike } from '../../mesh/polygon-mesh';
import { buildPrismGeometry } from '../geometry/polygon-geometry';

export class SelectionMesh {
    private mesh: THREE.Mesh | null = null;
    private readonly material: THREE.MeshBasicMaterial;

    constructor(
        private readonly parent: THREE.Group,
        private readonly polygonData: PolygonMeshLike
    ) {
        this.material = new THREE.MeshBasicMaterial({
            color: 0xffdd00,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide,
            depthWrite: false
        });
    }

    show(polygonId: number): void {
        this.hide();

        const geometry = buildPrismGeometry(this.polygonData, polygonId);
        if (!geometry.attributes.position || geometry.attributes.position.count === 0) {
            geometry.dispose();
            return;
        }

        this.mesh = new THREE.Mesh(geometry, this.material);
        this.parent.add(this.mesh);
    }

    hide(): void {
        if (!this.mesh) return;
        this.parent.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh = null;
    }

    isVisible(): boolean {
        return this.mesh !== null;
    }

    dispose(): void {
        this.hide();
        this.material.dispose();
    }
}
