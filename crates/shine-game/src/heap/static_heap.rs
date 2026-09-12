//! Talc allocator serving every allocation from a fixed static arena.

use std::sync::atomic::{AtomicBool, Ordering};

// Direct dependency because talc does not re-export lock_api, though it appears on TalcLock's public
// API. Drop this dep for talc's own path if https://github.com/SFBdragon/talc/issues/55 lands.
use lock_api::{GuardSend, RawMutex};
use talc::source::Claim;
use talc::TalcLock;

use super::{Entry, Meter, Report};

pub const HEAP_BYTES: usize = 256 * 1024 * 1024;

static mut ARENA: [u8; HEAP_BYTES] = [0; HEAP_BYTES];

/// Minimal spinlock guarding the talc allocator. Non-allocating and `const`-initializable (unlike
/// `std::sync::Mutex`), and never contended on single-threaded wasm; its critical sections are the
/// allocator's own bookkeeping.
pub struct Spinlock {
    locked: AtomicBool,
}

unsafe impl RawMutex for Spinlock {
    const INIT: Spinlock = Spinlock { locked: AtomicBool::new(false) };
    type GuardMarker = GuardSend;

    fn lock(&self) {
        while !self.try_lock() {
            while self.locked.load(Ordering::Relaxed) {
                core::hint::spin_loop();
            }
        }
    }

    fn try_lock(&self) -> bool {
        self.locked
            .compare_exchange(false, true, Ordering::Acquire, Ordering::Relaxed)
            .is_ok()
    }

    unsafe fn unlock(&self) {
        self.locked.store(false, Ordering::Release);
    }
}

pub type StaticHeap = TalcLock<Spinlock, Claim>;

pub const fn new_heap() -> StaticHeap {
    // SAFETY: ARENA is a unique static claimed once, on the allocator's first request.
    TalcLock::new(unsafe { Claim::array(&raw mut ARENA) })
}

fn reserved_bytes() -> usize {
    #[cfg(target_arch = "wasm32")]
    {
        core::arch::wasm32::memory_size(0) * 65536
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        HEAP_BYTES
    }
}

impl Meter for StaticHeap {
    fn fill(&self, out: &mut Report) {
        out.push(Entry::bytes("talc", "reserved", reserved_bytes()));
        out.push(Entry::bytes("talc", "limit", HEAP_BYTES));
        #[cfg(feature = "heap-profile")]
        {
            // Copy the counters, releasing the lock before pushing so nothing allocates under it.
            let c = *self.lock().counters();
            out.push(Entry::bytes("talc", "allocated", c.allocated_bytes));
            out.push(Entry::bytes("talc", "available", c.available_bytes));
            out.push(Entry::bytes("talc", "claimed", c.claimed_bytes));
            out.push(Entry::count("talc", "fragments", c.fragment_count));
        }
    }
}
