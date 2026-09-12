import type { PolygonMeshLike } from './polygon-mesh';

export function computeLocalCentroids(mesh: PolygonMeshLike): Float32Array {
    const { vertices, indices, ranges } = mesh;
    const count = ranges.length / 2;
    const centroids = new Float32Array(count * 2);
    for (let p = 0; p < count; p++) {
        const start = ranges[p * 2];
        const end = ranges[p * 2 + 1];
        const n = end - start;
        if (n === 0) continue;
        let sumX = 0;
        let sumY = 0;
        for (let i = start; i < end; i++) {
            const idx = indices[i];
            sumX += vertices[idx * 2];
            sumY += vertices[idx * 2 + 1];
        }
        centroids[p * 2] = sumX / n;
        centroids[p * 2 + 1] = sumY / n;
    }
    return centroids;
}
