//! Global-allocator wrapper counting live and peak requested bytes.

use std::alloc::{GlobalAlloc, Layout};
use std::sync::atomic::{AtomicUsize, Ordering};

pub struct CountingAlloc<A> {
    inner: A,
    current: AtomicUsize,
    peak: AtomicUsize,
}

impl<A> CountingAlloc<A> {
    pub const fn new(inner: A) -> Self {
        Self {
            inner,
            current: AtomicUsize::new(0),
            peak: AtomicUsize::new(0),
        }
    }

    pub fn inner(&self) -> &A {
        &self.inner
    }

    pub fn used(&self) -> usize {
        self.current.load(Ordering::Relaxed)
    }

    pub fn peak(&self) -> usize {
        self.peak.load(Ordering::Relaxed)
    }

    fn record_grow(&self, bytes: usize) {
        let current = self.current.fetch_add(bytes, Ordering::Relaxed) + bytes;
        self.peak.fetch_max(current, Ordering::Relaxed);
    }
}

unsafe impl<A: GlobalAlloc> GlobalAlloc for CountingAlloc<A> {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        let ptr = self.inner.alloc(layout);
        if !ptr.is_null() {
            self.record_grow(layout.size());
        }
        ptr
    }

    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
        self.inner.dealloc(ptr, layout);
        self.current.fetch_sub(layout.size(), Ordering::Relaxed);
    }

    unsafe fn realloc(&self, ptr: *mut u8, layout: Layout, new_size: usize) -> *mut u8 {
        let new_ptr = self.inner.realloc(ptr, layout, new_size);
        if !new_ptr.is_null() {
            if new_size >= layout.size() {
                self.record_grow(new_size - layout.size());
            } else {
                self.current.fetch_sub(layout.size() - new_size, Ordering::Relaxed);
            }
        }
        new_ptr
    }
}
