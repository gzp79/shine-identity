/// Trait for typed indices backed by some scalar primitive, where
/// the MAX value treated as a NONE sentinel.
pub trait TypedIndex: Copy + Eq + std::fmt::Debug {
    const NONE: Self;

    fn new(index: usize) -> Self;
    fn into_index(self) -> usize;

    #[inline(always)]
    fn try_into_index(self) -> Option<usize> {
        if self.is_none() {
            None
        } else {
            Some(self.into_index())
        }
    }

    #[inline(always)]
    fn is_none(self) -> bool {
        self == Self::NONE
    }

    #[inline(always)]
    fn is_valid(self) -> bool {
        !self.is_none()
    }
}

/// Define a newtype index struct implementing `TypedIndex` with Serialize/Deserialize.
#[macro_export]
macro_rules! define_typed_index {
    ($name:ident, $ty:ident, $doc:expr) => {
        #[doc = $doc]
        #[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
        pub struct $name($ty);

        #[allow(dead_code)]
        impl $name {
            pub fn range(start: Self, end: Self) -> impl Iterator<Item = Self> {
                (start.0..end.0).map(Self)
            }
        }

        impl $crate::indexed::TypedIndex for $name {
            const NONE: Self = Self($ty::MAX);

            #[inline]
            /// Creates a new typed index from a raw usize index.
            /// Panics if the given index would overflow the underlying type or if it is equal to the NONE sentinel.
            fn new(index: usize) -> Self {
                let value: $ty = index
                    .try_into()
                    .expect(concat!(stringify!($name), " index overflow"));
                assert!(value != $ty::MAX, concat!(stringify!($name), " index overflow"));
                Self(value)
            }

            #[inline]
            /// Converts the typed index into a raw usize index
            /// Panics if the typed index is NONE.
            fn into_index(self) -> usize {
                assert!(
                    self.0 < $ty::MAX,
                    concat!("called into_index() on non-real ", stringify!($name))
                );
                self.0 as usize
            }
        }

        impl std::fmt::Debug for $name {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                if $crate::indexed::TypedIndex::is_none(*self) {
                    write!(f, "{}(NONE)", stringify!($name))
                } else {
                    write!(f, "{}({})", stringify!($name), self.0)
                }
            }
        }

        impl serde::Serialize for $name {
            fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
                self.0.serialize(serializer)
            }
        }

        impl<'de> serde::Deserialize<'de> for $name {
            fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
                let v = $ty::deserialize(deserializer)?;
                Ok(Self(v))
            }
        }
    };
}

/// Implement From/Into conversions between a typed index and usize.
#[macro_export]
macro_rules! impl_typed_index_conversions {
    ($name:ident) => {
        impl From<usize> for $name {
            fn from(value: usize) -> Self {
                Self::new(value)
            }
        }

        impl From<$name> for usize {
            fn from(value: $name) -> Self {
                value.into_index()
            }
        }
    };
}

#[cfg(test)]
mod tests {
    use super::*;
    use shine_test::test;

    define_typed_index!(TestIdx, u32, "Test index.");
    define_typed_index!(TestIdxU8, u8, "Test index.");
    define_typed_index!(TestIdxUSize, usize, "Test index.");

    #[test]
    fn round_trip() {
        for i in [0, 1, 42, 1000, u32::MAX as usize - 1] {
            let idx = TestIdx::new(i);
            assert_eq!(idx.into_index(), i);
            assert!(!idx.is_none());
        }
    }

    #[test]
    fn none() {
        assert!(TestIdx::NONE.is_none());
    }

    #[test]
    fn debug_format() {
        assert_eq!(format!("{:?}", TestIdx::new(42)), "TestIdx(42)");
        assert_eq!(format!("{:?}", TestIdx::NONE), "TestIdx(NONE)");
    }

    #[test]
    fn range() {
        let range = TestIdx::range(TestIdx::new(5), TestIdx::new(10));
        let collected: Vec<_> = range.collect();
        let expected: Vec<_> = (5..10).map(TestIdx::new).collect();
        assert_eq!(collected, expected);
    }
}
