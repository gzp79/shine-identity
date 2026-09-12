//! Global allocator selection and the allocator-agnostic memory report.
//!
//! `memory_info` is a plain function available on every target; each client adds its own binding
//! (e.g. `wasm::heap`) that exposes the report to its host.

use serde::ser::{Serialize, Serializer};

#[cfg(feature = "heap-profile")]
mod counting;
#[cfg(feature = "static-heap")]
mod static_heap;

#[cfg(all(feature = "static-heap", feature = "heap-profile"))]
#[global_allocator]
static GLOBAL: counting::CountingAlloc<static_heap::StaticHeap> = counting::CountingAlloc::new(static_heap::new_heap());

#[cfg(all(feature = "static-heap", not(feature = "heap-profile")))]
#[global_allocator]
static GLOBAL: static_heap::StaticHeap = static_heap::new_heap();

#[cfg(all(not(feature = "static-heap"), feature = "heap-profile"))]
#[global_allocator]
static GLOBAL: counting::CountingAlloc<std::alloc::System> = counting::CountingAlloc::new(std::alloc::System);

/// One metric. `unit` lets a client format the value without knowing which allocator produced it.
#[derive(Clone, Copy, serde::Serialize)]
pub struct Entry {
    pub source: &'static str,
    pub label: &'static str,
    pub value: f64,
    pub unit: &'static str,
}

impl Entry {
    const EMPTY: Entry = Entry {
        source: "",
        label: "",
        value: 0.0,
        unit: "",
    };

    pub fn bytes(source: &'static str, label: &'static str, value: usize) -> Entry {
        Entry {
            source,
            label,
            value: value as f64,
            unit: "bytes",
        }
    }

    pub fn count(source: &'static str, label: &'static str, value: usize) -> Entry {
        Entry {
            source,
            label,
            value: value as f64,
            unit: "count",
        }
    }
}

/// Fixed-capacity report the active allocator fills. Gathering allocates nothing, so it cannot
/// perturb the very allocator being measured. Serializes to a JSON array of entries, sorted by
/// `source` then `label`.
pub struct Report {
    entries: [Entry; Report::CAP],
    len: usize,
}

impl Report {
    const CAP: usize = 8;

    fn new() -> Report {
        Report {
            entries: [Entry::EMPTY; Report::CAP],
            len: 0,
        }
    }

    pub fn push(&mut self, entry: Entry) {
        if self.len < Report::CAP {
            self.entries[self.len] = entry;
            self.len += 1;
        }
    }
}

impl Serialize for Report {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut sorted = self.entries;
        let sorted = &mut sorted[..self.len];
        sorted.sort_unstable_by_key(|e| (e.source, e.label));
        serializer.collect_seq(sorted.iter())
    }
}

/// An allocator that describes itself into the agnostic report.
pub trait Meter {
    fn fill(&self, out: &mut Report);
}

#[cfg(feature = "heap-profile")]
impl Meter for std::alloc::System {
    fn fill(&self, _out: &mut Report) {}
}

/// Snapshot of the active allocator's metrics; empty when no allocator feature is enabled.
pub fn memory_info() -> Report {
    #[allow(unused_mut)]
    let mut report = Report::new();
    #[cfg(any(feature = "static-heap", feature = "heap-profile"))]
    GLOBAL.fill(&mut report);
    report
}
