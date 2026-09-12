import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const crateDir = fileURLToPath(new URL('../../crates/shine-game', import.meta.url));
const wasmOut = fileURLToPath(new URL('./pkg/shine_game.js', import.meta.url));
const wasmBin = fileURLToPath(new URL('./pkg/shine_game_bg.wasm', import.meta.url));
const wasmTypes = fileURLToPath(new URL('./pkg/shine_game.d.ts', import.meta.url));
const typesDir = fileURLToPath(new URL('./src/wasm-types/shine_game.d.ts', import.meta.url));

const WASM_BIN_ID = '#wasm-bin';
const WASM_BIN_RESOLVED = '\0wasm-bin';

export interface WasmPackOptions {
    // Build the wasm with the `heap-profile` feature (allocation metrics on top of the static heap).
    profiling: boolean;
}

export function wasmPackPlugin(options: WasmPackOptions): Plugin {
    let isBuild = false;

    return {
        name: 'wasm-pack',
        enforce: 'pre',
        config(_, env) {
            isBuild = env.command === 'build';
            // Rebuild real runs so the wasm matches the requested feature set; during tests reuse an
            // existing pkg/ (only build if missing) to keep the run fast.
            const isTest = !!process.env.VITEST;
            if (!isTest || !existsSync(wasmOut)) {
                console.log('\n[wasm-pack] building...');
                buildWasm(options.profiling);
            }
            return {
                resolve: {
                    alias: {
                        '#wasm': wasmOut
                    }
                }
            };
        },
        resolveId(id) {
            if (id === WASM_BIN_ID) {
                return WASM_BIN_RESOLVED;
            }
        },
        load(id) {
            if (id === WASM_BIN_RESOLVED) {
                if (isBuild) {
                    const wasmSource = readFileSync(wasmBin);
                    const refId = this.emitFile({
                        type: 'asset',
                        name: 'shine_game_bg.wasm',
                        source: wasmSource
                    });
                    return `export default import.meta.ROLLUP_FILE_URL_${refId};`;
                }
                // Dev mode: serve wasm relative to project root
                return 'export default "/pkg/shine_game_bg.wasm";';
            }
        },
        configureServer(server) {
            const srcDir = `${crateDir}/src`;
            server.watcher.add(srcDir);
            server.watcher.on('change', (path) => {
                if (path.endsWith('.rs')) {
                    console.log(`\n[wasm-pack] Rust file changed: ${path}`);
                    if (buildWasm(options.profiling)) {
                        void server.restart();
                    }
                }
            });
        }
    };
}

function buildWasm(profiling: boolean): boolean {
    try {
        console.log('[wasm-pack] Building...');
        // static-heap on every build keeps wasm linear memory from growing; heap-profile adds metrics.
        const features = profiling ? 'static-heap,heap-profile' : 'static-heap';
        execSync(`wasm-pack build --target web --out-dir ../../client/web/pkg --features ${features}`, {
            cwd: crateDir,
            stdio: 'inherit'
        });
        copyFileSync(wasmTypes, typesDir);
        console.log('[wasm-pack] Done.');
        return true;
    } catch {
        console.error('[wasm-pack] Build failed.');
        return false;
    }
}
