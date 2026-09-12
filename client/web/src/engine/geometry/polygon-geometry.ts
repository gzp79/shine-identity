import * as THREE from 'three';
import type { PolygonMeshLike, WiredPolygonMeshLike } from '../../mesh/polygon-mesh';

const PRISM_HEIGHT = 100.0;

export function buildGeometryFromPolygons(mesh: PolygonMeshLike): THREE.BufferGeometry {
    const positions: number[] = [];
    const { vertices, indices, ranges } = mesh;
    const polygonCount = ranges.length / 2;

    for (let p = 0; p < polygonCount; p++) {
        const start = ranges[p * 2];
        const end = ranges[p * 2 + 1];
        if (end <= start) continue;

        const n = end - start;
        for (let i = 0; i < n; i++) {
            const idx0 = indices[start + i];
            const idx1 = indices[start + ((i + 1) % n)];
            positions.push(
                vertices[idx0 * 2],
                vertices[idx0 * 2 + 1],
                0,
                vertices[idx1 * 2],
                vertices[idx1 * 2 + 1],
                0
            );
        }
    }

    const geometry = new THREE.BufferGeometry();
    if (positions.length > 0) {
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    }
    return geometry;
}

export function buildGeometryFromWires(mesh: WiredPolygonMeshLike): THREE.BufferGeometry {
    const positions: number[] = [];
    const { vertices, wireIndices, wireRanges } = mesh;
    const wireCount = wireRanges.length / 2;

    for (let w = 0; w < wireCount; w++) {
        const start = wireRanges[w * 2];
        const end = wireRanges[w * 2 + 1];
        if (end <= start) continue;

        for (let i = start; i + 1 < end; i++) {
            const idx0 = wireIndices[i];
            const idx1 = wireIndices[i + 1];
            positions.push(
                vertices[idx0 * 2],
                vertices[idx0 * 2 + 1],
                0,
                vertices[idx1 * 2],
                vertices[idx1 * 2 + 1],
                0
            );
        }
    }

    const geometry = new THREE.BufferGeometry();
    if (positions.length > 0) {
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    }
    return geometry;
}

export function buildPrismGeometry(mesh: PolygonMeshLike, polygonId: number): THREE.BufferGeometry {
    const { vertices, indices, ranges } = mesh;
    const start = ranges[polygonId * 2];
    const end = ranges[polygonId * 2 + 1];
    const n = end - start;

    if (n < 3) {
        return new THREE.BufferGeometry();
    }

    const polyVertices: Array<[number, number]> = [];
    for (let i = 0; i < n; i++) {
        const idx = indices[start + i];
        polyVertices.push([vertices[idx * 2], vertices[idx * 2 + 1]]);
    }

    const positions: number[] = [];
    const barycentrics: number[] = [];
    const edgeFlags: number[] = [];
    const colors: number[] = [];

    // Bottom face (z=0) - fan triangulation from first vertex
    for (let i = 1; i < n - 1; i++) {
        positions.push(
            polyVertices[0][0],
            polyVertices[0][1],
            0,
            polyVertices[i][0],
            polyVertices[i][1],
            0,
            polyVertices[i + 1][0],
            polyVertices[i + 1][1],
            0
        );
        barycentrics.push(1, 0, 0, 0, 1, 0, 0, 0, 1);
        const edge0 = 1;
        const edge1 = i === n - 2 ? 1 : 0;
        const edge2 = i === 1 ? 1 : 0;
        const flags = [edge0, edge1, edge2];
        edgeFlags.push(...flags, ...flags, ...flags);
        colors.push(0.2, 0.9, 1.0, 0.2, 0.9, 1.0, 0.2, 0.9, 1.0);
    }

    // Top face (z=PRISM_HEIGHT) - fan triangulation
    for (let i = 1; i < n - 1; i++) {
        positions.push(
            polyVertices[0][0],
            polyVertices[0][1],
            PRISM_HEIGHT,
            polyVertices[i][0],
            polyVertices[i][1],
            PRISM_HEIGHT,
            polyVertices[i + 1][0],
            polyVertices[i + 1][1],
            PRISM_HEIGHT
        );
        barycentrics.push(1, 0, 0, 0, 1, 0, 0, 0, 1);
        const edge0 = 1;
        const edge1 = i === n - 2 ? 1 : 0;
        const edge2 = i === 1 ? 1 : 0;
        const flags = [edge0, edge1, edge2];
        edgeFlags.push(...flags, ...flags, ...flags);
        colors.push(1.0, 0.5, 0.0, 1.0, 0.5, 0.0, 1.0, 0.5, 0.0);
    }

    // Side faces
    for (let i = 0; i < n; i++) {
        const next = (i + 1) % n;
        const [x0, y0] = polyVertices[i];
        const [x1, y1] = polyVertices[next];

        positions.push(x0, y0, 0, x1, y1, 0, x1, y1, PRISM_HEIGHT);
        barycentrics.push(1, 0, 0, 0, 1, 0, 0, 0, 1);
        const flags1 = [1, 0, 1];
        edgeFlags.push(...flags1, ...flags1, ...flags1);
        colors.push(0.2, 0.9, 1.0, 0.2, 0.9, 1.0, 1.0, 0.5, 0.0);

        positions.push(x0, y0, 0, x1, y1, PRISM_HEIGHT, x0, y0, PRISM_HEIGHT);
        barycentrics.push(1, 0, 0, 0, 1, 0, 0, 0, 1);
        const flags2 = [1, 1, 0];
        edgeFlags.push(...flags2, ...flags2, ...flags2);
        colors.push(0.2, 0.9, 1.0, 1.0, 0.5, 0.0, 1.0, 0.5, 0.0);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('barycentric', new THREE.Float32BufferAttribute(barycentrics, 3));
    geometry.setAttribute('edgeFlags', new THREE.Float32BufferAttribute(edgeFlags, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    return geometry;
}
