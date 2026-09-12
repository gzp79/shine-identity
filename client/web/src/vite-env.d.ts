/// <reference types="vite/client" />

declare module '#wasm-bin' {
    const url: string;
    export default url;
}

interface ImportMetaEnv {
    // True when the wasm was built with the `heap-profile` feature; injected by vite.
    readonly VITE_HEAP_PROFILING: boolean;
}
