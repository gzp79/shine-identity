import { WasmWorldNeighbors } from '#wasm';
import * as THREE from 'three';
import { ManagedMesh } from '../../engine/resources/managed-mesh';
import { disposeObject3D } from '../../engine/resources/ownership';
import { asWiredPolygonMesh } from '../../mesh/polygon-mesh';

const EDGE_COLOR = 0x222222;

export interface ToggleableGroup {
    group: THREE.Group;
    setVisible: (visible: boolean) => void;
    setIndividualVisible: (index: number, visible: boolean) => void;
    dispose: () => void;
}

// Build a colored polygon mesh from vertices/indices/ranges with z-offset
function buildPolygonMesh(
    vertices: Float32Array,
    indices: Uint32Array,
    ranges: Uint32Array,
    color: THREE.Color,
    zOffset: number
): THREE.Mesh {
    const positions: number[] = [];
    const colors: number[] = [];

    for (let p = 0; p < ranges.length; p += 2) {
        const start = ranges[p];
        const end = ranges[p + 1];
        const polySize = end - start;

        if (polySize < 3) continue; // Skip degenerate polygons

        // Fan triangulation from first vertex
        const firstIdx = indices[start];
        for (let i = 1; i < polySize - 1; i++) {
            const idx1 = indices[start + i];
            const idx2 = indices[start + i + 1];

            for (const idx of [firstIdx, idx1, idx2]) {
                positions.push(vertices[idx * 2], vertices[idx * 2 + 1], zOffset);
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

    return ManagedMesh.own(geom, mat);
}

// Build wireframe for polygons with z-offset
function buildPolygonWireframe(
    vertices: Float32Array,
    indices: Uint32Array,
    ranges: Uint32Array,
    zOffset: number
): THREE.LineSegments {
    const positions: number[] = [];

    for (let p = 0; p < ranges.length; p += 2) {
        const start = ranges[p];
        const end = ranges[p + 1];
        const polySize = end - start;

        if (polySize < 2) continue;

        for (let i = 0; i < polySize; i++) {
            const idx0 = indices[start + i];
            const idx1 = indices[start + ((i + 1) % polySize)];
            positions.push(
                vertices[idx0 * 2],
                vertices[idx0 * 2 + 1],
                zOffset,
                vertices[idx1 * 2],
                vertices[idx1 * 2 + 1],
                zOffset
            );
        }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({ color: EDGE_COLOR });

    return new THREE.LineSegments(geom, mat);
}

export function buildChunkHexagons(data: WasmWorldNeighbors): THREE.Group {
    const group = new THREE.Group();
    const color = new THREE.Color();

    for (let chunk_idx = 0; chunk_idx < 7; chunk_idx++) {
        const hexVerts = data.chunk_hex_vertices(chunk_idx);
        if (hexVerts.length !== 12) continue;

        // Color coding: HSL wheel
        const hue = chunk_idx / 7;
        color.setHSL(hue, 0.5, 0.6);

        // Build line loop from 6 vertices
        const positions: number[] = [];
        for (let i = 0; i < 6; i++) {
            positions.push(hexVerts[i * 2], hexVerts[i * 2 + 1], 2.0);
        }
        // Close the loop
        positions.push(hexVerts[0], hexVerts[1], 2.0);

        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        const mat = new THREE.LineBasicMaterial({ color: color.getHex() });
        const line = new THREE.Line(geom, mat);

        group.add(line);
    }

    return group;
}

export function buildInteriorMeshes(data: WasmWorldNeighbors): ToggleableGroup {
    const group = new THREE.Group();
    const meshGroups: THREE.Group[] = [];
    const color = new THREE.Color();

    for (let chunk_idx = 0; chunk_idx < 7; chunk_idx++) {
        const meshData = data.inner_mesh(chunk_idx);
        const chunkGroup = new THREE.Group();

        if (meshData) {
            const { vertices, indices, ranges } = asWiredPolygonMesh(meshData);

            if (vertices.length > 0) {
                // Color coding: HSL wheel
                const hue = chunk_idx / 7;
                color.setHSL(hue, 0.7, 0.5);

                // Build polygon mesh (z = 0.0)
                const mesh = buildPolygonMesh(vertices, indices, ranges, color, 0.0);
                chunkGroup.add(mesh);

                // Build wireframe (z = 1.0)
                const wire = buildPolygonWireframe(vertices, indices, ranges, 1.0);
                chunkGroup.add(wire);
            }

            meshData.free();
        }

        meshGroups.push(chunkGroup);
        group.add(chunkGroup);
    }

    return {
        group,
        setVisible: (visible: boolean) => {
            meshGroups.forEach((g) => (g.visible = visible));
        },
        setIndividualVisible: (index: number, visible: boolean) => {
            if (index >= 0 && index < meshGroups.length) {
                meshGroups[index].visible = visible;
            }
        },
        dispose: () => {
            meshGroups.forEach((g) => disposeObject3D(g));
        }
    };
}

export function buildEdgeMeshes(data: WasmWorldNeighbors): ToggleableGroup {
    const group = new THREE.Group();
    const meshGroups: THREE.Group[] = [];
    const color = new THREE.Color();

    for (let edge_idx = 0; edge_idx < 6; edge_idx++) {
        const meshData = data.edge_mesh(edge_idx);
        const edgeGroup = new THREE.Group();

        if (meshData) {
            const { vertices, indices, ranges } = asWiredPolygonMesh(meshData);

            if (vertices.length > 0) {
                // Color coding: HSL wheel
                const hue = edge_idx / 6;
                color.setHSL(hue, 0.8, 0.5);

                // Build polygon mesh (z = 0.2)
                const mesh = buildPolygonMesh(vertices, indices, ranges, color, 0.2);
                edgeGroup.add(mesh);

                // Build wireframe (z = 1.2)
                const wire = buildPolygonWireframe(vertices, indices, ranges, 1.2);
                edgeGroup.add(wire);
            }

            meshData.free();
        }

        meshGroups.push(edgeGroup);
        group.add(edgeGroup);
    }

    return {
        group,
        setVisible: (visible: boolean) => {
            meshGroups.forEach((g) => (g.visible = visible));
        },
        setIndividualVisible: (index: number, visible: boolean) => {
            if (index >= 0 && index < meshGroups.length) {
                meshGroups[index].visible = visible;
            }
        },
        dispose: () => {
            meshGroups.forEach((g) => disposeObject3D(g));
        }
    };
}

export function buildCornerMeshes(data: WasmWorldNeighbors): ToggleableGroup {
    const group = new THREE.Group();
    const meshGroups: THREE.Group[] = [];
    const color = new THREE.Color();

    for (let corner_idx = 0; corner_idx < 6; corner_idx++) {
        const meshData = data.corner_mesh(corner_idx);
        const cornerGroup = new THREE.Group();

        if (meshData) {
            const { vertices, indices, ranges } = asWiredPolygonMesh(meshData);

            if (vertices.length > 0) {
                // Color coding: HSL wheel
                const hue = corner_idx / 6;
                color.setHSL(hue, 0.8, 0.4);

                // Build polygon mesh (z = 0.4)
                const mesh = buildPolygonMesh(vertices, indices, ranges, color, 0.4);
                cornerGroup.add(mesh);

                // Build wireframe (z = 1.4)
                const wire = buildPolygonWireframe(vertices, indices, ranges, 1.4);
                cornerGroup.add(wire);
            }

            meshData.free();
        }

        meshGroups.push(cornerGroup);
        group.add(cornerGroup);
    }

    return {
        group,
        setVisible: (visible: boolean) => {
            meshGroups.forEach((g) => (g.visible = visible));
        },
        setIndividualVisible: (index: number, visible: boolean) => {
            if (index >= 0 && index < meshGroups.length) {
                meshGroups[index].visible = visible;
            }
        },
        dispose: () => {
            meshGroups.forEach((g) => disposeObject3D(g));
        }
    };
}
