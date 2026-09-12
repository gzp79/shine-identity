import * as THREE from 'three';
import { ManagedLineSegments, ManagedMesh } from '../../engine/resources/managed-mesh';
import { disposeObject3D } from '../../engine/resources/ownership';
import { span } from '../../engine/utils';
import type { WiredPolygonMeshLike } from '../../mesh/polygon-mesh';

const EDGE_COLOR = 0x222222;
const DUAL_EDGE_COLOR = 0x222222;

export interface HexMeshGroup {
    group: THREE.Group;
    setPrimalMeshVisible: (visible: boolean) => void;
    setPrimalWireVisible: (visible: boolean) => void;
    setDualMeshVisible: (visible: boolean) => void;
    setDualWireVisible: (visible: boolean) => void;
    setAnchorVisible: (visible: boolean) => void;
    setAnchorVerticesVisible: (visible: boolean) => void;
    dispose: () => void;
}

function buildPrimalMesh(primal: WiredPolygonMeshLike): ManagedMesh {
    const vertices = primal.vertices;
    const quad_indices = primal.indices;
    const quad_ranges = primal.ranges;

    const primalPositions: number[] = [];
    const primalColors: number[] = [];
    const color = new THREE.Color();

    for (let q = 0; q < quad_ranges.length; q += 2) {
        const start = quad_ranges[q];
        const end = quad_ranges[q + 1];

        if (end - start !== 4) continue;

        const a = quad_indices[start];
        const b = quad_indices[start + 1];
        const c = quad_indices[start + 2];
        const d = quad_indices[start + 3];

        const hue = ((q / 2) * 0.618033988749895) % 1.0;
        color.setHSL(hue, 0.6, 0.65);

        for (const idx of [a, b, c]) {
            primalPositions.push(vertices[idx * 2], vertices[idx * 2 + 1], 0);
            primalColors.push(color.r, color.g, color.b);
        }
        for (const idx of [a, c, d]) {
            primalPositions.push(vertices[idx * 2], vertices[idx * 2 + 1], 0);
            primalColors.push(color.r, color.g, color.b);
        }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(primalPositions, 3));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(primalColors, 3));
    geom.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        flatShading: true,
        side: THREE.DoubleSide
    });
    return ManagedMesh.own(geom, mat);
}

function buildPrimalWire(primal: WiredPolygonMeshLike): ManagedLineSegments {
    const vertices = primal.vertices;
    const quad_indices = primal.indices;
    const quad_ranges = primal.ranges;

    const positions: number[] = [];

    for (let q = 0; q < quad_ranges.length; q += 2) {
        const start = quad_ranges[q];
        const end = quad_ranges[q + 1];
        const quadSize = end - start;

        for (let e = 0; e < quadSize; e++) {
            const i0 = quad_indices[start + e];
            const i1 = quad_indices[start + ((e + 1) % quadSize)];
            positions.push(vertices[i0 * 2], vertices[i0 * 2 + 1], 0.01, vertices[i1 * 2], vertices[i1 * 2 + 1], 0.01);
        }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({ color: EDGE_COLOR });
    return ManagedLineSegments.own(geom, mat);
}

function buildDualMesh(dual: WiredPolygonMeshLike): ManagedMesh {
    const dual_vertices = dual.vertices;
    const dual_indices = dual.indices;
    const dual_ranges = dual.ranges;

    const positions: number[] = [];
    const colors: number[] = [];
    const color = new THREE.Color();

    for (let p = 0; p < dual_ranges.length; p += 2) {
        const start = dual_ranges[p];
        const end = dual_ranges[p + 1];
        const polySize = end - start;

        if (polySize < 3) continue;

        const hue = ((p / 2) * 0.618033988749895) % 1.0;
        color.setHSL(hue, 0.7, 0.5);

        const firstIdx = dual_indices[start];
        for (let i = 1; i < polySize - 1; i++) {
            const idx1 = dual_indices[start + i];
            const idx2 = dual_indices[start + i + 1];
            for (const idx of [firstIdx, idx1, idx2]) {
                positions.push(dual_vertices[idx * 2], dual_vertices[idx * 2 + 1], 0.001);
                colors.push(color.r, color.g, color.b);
            }
        }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geom.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        flatShading: true,
        side: THREE.DoubleSide
    });
    const mesh = ManagedMesh.own(geom, mat);
    mesh.visible = false;
    return mesh;
}

function buildDualWire(dual: WiredPolygonMeshLike): ManagedLineSegments {
    const dual_vertices = dual.vertices;
    const dual_indices = dual.indices;
    const dual_ranges = dual.ranges;

    const positions: number[] = [];

    for (let p = 0; p < dual_ranges.length; p += 2) {
        const start = dual_ranges[p];
        const end = dual_ranges[p + 1];
        const polySize = end - start;

        if (polySize < 2) continue;

        for (let i = 0; i < polySize; i++) {
            const idx0 = dual_indices[start + i];
            const idx1 = dual_indices[start + ((i + 1) % polySize)];
            positions.push(
                dual_vertices[idx0 * 2],
                dual_vertices[idx0 * 2 + 1],
                0.01,
                dual_vertices[idx1 * 2],
                dual_vertices[idx1 * 2 + 1],
                0.01
            );
        }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({ color: DUAL_EDGE_COLOR });
    const lines = ManagedLineSegments.own(geom, mat);
    lines.visible = false;
    return lines;
}

function buildAnchorWire(primal: WiredPolygonMeshLike): ManagedLineSegments {
    const vertices = primal.vertices;
    const anchor_indices = primal.wireIndices;
    const anchor_ranges = primal.wireRanges;

    const positions: number[] = [];
    const colors: number[] = [];
    const color = new THREE.Color();

    const anchorEdgeCount = anchor_ranges.length / 2;

    for (let a = 0; a < anchor_ranges.length; a += 2) {
        const start = anchor_ranges[a];
        const end = anchor_ranges[a + 1];
        const edgeSize = end - start;

        if (edgeSize < 2) continue;

        const hue = (a / 2 / anchorEdgeCount) % 1.0;
        color.setHSL(hue, 1.0, 0.5);

        for (let i = 0; i < edgeSize - 1; i++) {
            const idx0 = anchor_indices[start + i];
            const idx1 = anchor_indices[start + i + 1];
            positions.push(
                vertices[idx0 * 2],
                vertices[idx0 * 2 + 1],
                0.01,
                vertices[idx1 * 2],
                vertices[idx1 * 2 + 1],
                0.01
            );
            colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
        }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const mat = new THREE.LineBasicMaterial({ vertexColors: true, linewidth: 2 });
    const lines = ManagedLineSegments.own(geom, mat);
    lines.visible = false;
    return lines;
}

function buildAnchorVertices(primal: WiredPolygonMeshLike): THREE.InstancedMesh {
    const vertices = primal.vertices;
    const anchor_indices = primal.wireIndices;
    const anchor_ranges = primal.wireRanges;

    const positions: number[] = [];
    const colors: number[] = [];
    const vertexSet = new Set<number>();
    const color = new THREE.Color();

    const anchorEdgeCount = anchor_ranges.length / 2;

    for (let a = 0; a < anchor_ranges.length; a += 2) {
        const start = anchor_ranges[a];
        const end = anchor_ranges[a + 1];

        const hue = (a / 2 / anchorEdgeCount) % 1.0;
        color.setHSL(hue, 1.0, 0.5);

        for (let i = start; i < end; i++) {
            const idx = anchor_indices[i];
            if (!vertexSet.has(idx)) {
                vertexSet.add(idx);
                positions.push(vertices[idx * 2], vertices[idx * 2 + 1], 0.01);
                colors.push(color.r, color.g, color.b);
            }
        }
    }

    const circleGeom = new THREE.CircleGeometry(0.015, 8);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const vertexCount = positions.length / 3;
    const instancedMesh = new THREE.InstancedMesh(circleGeom, mat, vertexCount);

    const matrix = new THREE.Matrix4();
    const vertexColor = new THREE.Color();

    for (let i = 0; i < vertexCount; i++) {
        matrix.makeTranslation(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
        instancedMesh.setMatrixAt(i, matrix);
        vertexColor.setRGB(colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2]);
        instancedMesh.setColorAt(i, vertexColor);
    }

    instancedMesh.visible = false;
    return instancedMesh;
}

export function buildHexMesh(primal: WiredPolygonMeshLike, dual: WiredPolygonMeshLike): HexMeshGroup {
    const group = new THREE.Group();

    let primalMesh: ManagedMesh;
    let primalWireMesh: ManagedLineSegments;
    let dualMesh: ManagedMesh;
    let dualWireMesh: ManagedLineSegments;
    let anchorWireMesh: ManagedLineSegments;
    let anchorVertexMesh: THREE.InstancedMesh;

    {
        using _s = span('buildPrimalMesh');
        primalMesh = buildPrimalMesh(primal);
    }
    {
        using _s = span('buildPrimalWire');
        primalWireMesh = buildPrimalWire(primal);
    }
    {
        using _s = span('buildDualMesh');
        dualMesh = buildDualMesh(dual);
    }
    {
        using _s = span('buildDualWire');
        dualWireMesh = buildDualWire(dual);
    }
    {
        using _s = span('buildAnchorWire');
        anchorWireMesh = buildAnchorWire(primal);
    }
    {
        using _s = span('buildAnchorVertices');
        anchorVertexMesh = buildAnchorVertices(primal);
    }

    group.add(primalMesh);
    group.add(primalWireMesh);
    group.add(dualMesh);
    group.add(dualWireMesh);
    group.add(anchorWireMesh);
    group.add(anchorVertexMesh);

    return {
        group,
        setPrimalMeshVisible: (visible: boolean) => {
            primalMesh.visible = visible;
        },
        setPrimalWireVisible: (visible: boolean) => {
            primalWireMesh.visible = visible;
        },
        setDualMeshVisible: (visible: boolean) => {
            dualMesh.visible = visible;
        },
        setDualWireVisible: (visible: boolean) => {
            dualWireMesh.visible = visible;
        },
        setAnchorVisible: (visible: boolean) => {
            anchorWireMesh.visible = visible;
        },
        setAnchorVerticesVisible: (visible: boolean) => {
            anchorVertexMesh.visible = visible;
        },
        dispose: () => {
            disposeObject3D(group);
        }
    };
}
