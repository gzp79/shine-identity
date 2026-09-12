mod experiments;
mod heap;
mod math;
mod mesh;
mod world;

use tracing_subscriber::layer::SubscriberExt;
use wasm_bindgen::prelude::*;

#[wasm_bindgen(start)]
fn start() {
    console_error_panic_hook::set_once();
    wasm_logger::init(wasm_logger::Config::default());

    let perf_layer = tracing_web::performance_layer();
    let _ = tracing::subscriber::set_global_default(tracing_subscriber::registry().with(perf_layer));
}
