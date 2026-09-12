import * as wasm from '#wasm';
import type { AssetCatalog } from './engine/assets/catalog';
import { createRoutedScene } from './index';

// Local-dev catalog for the shine-assets bucket. Lives only in the standalone entry, so
// it stays out of the library bundle a host consumes — that host injects its own catalog
// with a server-resolved version.
const ASSET_URL = 'https://assets.local.scytta.com:8093';
const ASSET_PLATFORM = 'web';
const ASSET_MODULE = 'models';

type Manifest = Record<string, string>;

// Resolves the shine-assets manifest up front so url() is synchronous afterwards.
// Protocol: latest.json -> version, {version}/{platform}/{module}/assets.json ->
// name -> relative blob path, blob at {baseUrl}/{relativeBlobPath}.
async function buildDefaultCatalog(): Promise<AssetCatalog> {
    const base = ASSET_URL.replace(/\/$/, '');
    const version = (await fetchJson<{ version: string }>(`${base}/latest.json`)).version;
    const manifest = await fetchJson<Manifest>(`${base}/${version}/${ASSET_PLATFORM}/${ASSET_MODULE}/assets.json`);

    return {
        list: () => Object.keys(manifest).map((name) => ({ name })),
        url: (name) => {
            const path = manifest[name];
            if (path === undefined) throw new Error(`[AssetCatalog] unknown asset "${name}"`);
            return `${base}/${path}`;
        }
    };
}

async function fetchJson<T>(url: string): Promise<T> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`[AssetCatalog] failed to fetch ${url}: ${res.status}`);
    return (await res.json()) as T;
}

// memory_info() returns an allocator-agnostic array of entries, sorted by source then label; which
// entries appear depends on the wasm feature set.
interface MemoryMetric {
    source: string;
    label: string;
    value: number;
    unit: 'bytes' | 'count' | 'ratio' | string;
}
interface MemoryApi {
    memory_info?: () => MemoryMetric[];
}

// Fills the #heap-stats box in the collapsible nav overlay once a second. Skipped unless the wasm
// was built with heap profiling, so the box stays hidden in production.
function startHeapStats(): void {
    if (!import.meta.env.VITE_HEAP_PROFILING) return;
    const el = document.getElementById('heap-stats');
    const api: MemoryApi = wasm;
    if (!el || !api.memory_info) return;

    const format = ({ value, unit }: MemoryMetric): string => {
        switch (unit) {
            case 'bytes':
                return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
            case 'ratio':
                return `${(value * 100).toFixed(1)} %`;
            default:
                return String(value);
        }
    };
    const update = (): void => {
        const entries = api.memory_info!().map((m) => ({ key: `${m.source}.${m.label}`, text: format(m) }));
        const width = entries.reduce((w, e) => Math.max(w, e.key.length), 0);
        el.textContent = entries.map((e) => `${e.key.padEnd(width)}  ${e.text}`).join('\n');
    };
    update();
    el.style.display = 'block';
    window.setInterval(update, 1000);
}

const container = document.getElementById('app')!;

// Standalone dev host, standing in for a real embedder: a rejection means the scene failed to
// start, onError means it died after starting. Both land here; a real host would render its own UI.
function showFatal(error: unknown): void {
    console.error('[shine-web] scene error:', error);
    container.replaceChildren();
    const box = document.createElement('div');
    box.textContent = describe(error);
    box.style.cssText = `
        position: absolute; inset: 0; overflow: auto;
        box-sizing: border-box; padding: 1.5rem;
        background: #101014; color: #ff9a9a;
        font: 13px/1.6 ui-monospace, Consolas, monospace;
        white-space: pre-wrap; word-break: break-word;
        user-select: text;
    `;
    container.appendChild(box);
}

// Full stack plus the cause chain, so the actual throw site is visible without opening the console.
function describe(error: unknown): string {
    if (!(error instanceof Error)) return String(error);
    let text = error.stack ?? `${error.name}: ${error.message}`;
    let cause: unknown = error.cause;
    while (cause !== undefined && cause !== null) {
        text += `\n\nCaused by: ${cause instanceof Error ? (cause.stack ?? cause.message) : String(cause)}`;
        cause = cause instanceof Error ? cause.cause : undefined;
    }
    return text;
}

// Anything escaping the runtime's error boundary (listeners, timers, foreign promises) would
// otherwise only show up in the console; surface it in the page too.
window.addEventListener('error', (event) => {
    showFatal(event.error ?? event.message);
});
window.addEventListener('unhandledrejection', (event) => {
    showFatal(event.reason);
});

void createRoutedScene(container, buildDefaultCatalog, showFatal).then(startHeapStats).catch(showFatal);
