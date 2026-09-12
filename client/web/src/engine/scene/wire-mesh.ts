import * as THREE from 'three';
import type { PolygonMeshLike, WiredPolygonMeshLike } from '../../mesh/polygon-mesh';
import { buildGeometryFromPolygons, buildGeometryFromWires } from '../geometry/polygon-geometry';

const DEFAULT_COLOR = 0x00ffff;

export type WireMeshOptions = {
    readonly color?: number;
};

export class WireMesh {
    private mesh: THREE.LineSegments | null = null;

    private constructor(
        private readonly parent: THREE.Group,
        private readonly buildGeometryFn: () => THREE.BufferGeometry,
        private readonly color: number
    ) {}

    static fromPolygons(parent: THREE.Group, mesh: PolygonMeshLike, options?: WireMeshOptions): WireMesh {
        return new WireMesh(parent, () => buildGeometryFromPolygons(mesh), options?.color ?? DEFAULT_COLOR);
    }

    static fromWires(parent: THREE.Group, mesh: WiredPolygonMeshLike, options?: WireMeshOptions): WireMesh {
        return new WireMesh(parent, () => buildGeometryFromWires(mesh), options?.color ?? DEFAULT_COLOR);
    }

    show(): void {
        if (this.mesh) return;

        const geometry = this.buildGeometryFn();
        if (!geometry.attributes.position || geometry.attributes.position.count === 0) {
            geometry.dispose();
            return;
        }

        const material = new THREE.LineBasicMaterial({ color: this.color, linewidth: 2 });
        this.mesh = new THREE.LineSegments(geometry, material);
        this.mesh.renderOrder = 1;
        this.parent.add(this.mesh);
    }

    hide(): void {
        if (!this.mesh) return;
        this.parent.remove(this.mesh);
        this.mesh.geometry.dispose();
        (this.mesh.material as THREE.Material).dispose();
        this.mesh = null;
    }

    isVisible(): boolean {
        return this.mesh !== null;
    }

    dispose(): void {
        this.hide();
    }
}
