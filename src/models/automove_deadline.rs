use std::cell::Cell;

#[cfg(not(target_arch = "wasm32"))]
use std::sync::OnceLock;
#[cfg(not(target_arch = "wasm32"))]
use std::time::Instant;
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::wasm_bindgen;

pub(crate) const AUTOMOVE_SELECTOR_BUDGET_MS: f64 = 650.0;

#[derive(Clone, Copy)]
struct ActiveDeadline {
    end_ms: f64,
    timed_out: bool,
    nesting: usize,
}

thread_local! {
    static ACTIVE_DEADLINE: Cell<Option<ActiveDeadline>> = const { Cell::new(None) };
    static LAST_OUTER_DEADLINE_TIMED_OUT: Cell<bool> = const { Cell::new(false) };
}

#[cfg(test)]
thread_local! {
    static TEST_NOW_MS: Cell<Option<f64>> = const { Cell::new(None) };
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen(
    inline_js = "export function automove_monotonic_now_ms() { return globalThis.performance.now(); }"
)]
extern "C" {
    fn automove_monotonic_now_ms() -> f64;
}

#[cfg(target_arch = "wasm32")]
#[inline]
fn monotonic_now_ms() -> f64 {
    #[cfg(test)]
    if let Some(now_ms) = TEST_NOW_MS.with(Cell::get) {
        return now_ms;
    }

    automove_monotonic_now_ms()
}

#[cfg(not(target_arch = "wasm32"))]
#[inline]
fn monotonic_now_ms() -> f64 {
    #[cfg(test)]
    if let Some(now_ms) = TEST_NOW_MS.with(Cell::get) {
        return now_ms;
    }

    static EPOCH: OnceLock<Instant> = OnceLock::new();
    EPOCH.get_or_init(Instant::now).elapsed().as_secs_f64() * 1_000.0
}

struct DeadlineGuard;

impl DeadlineGuard {
    fn enter(budget_ms: f64) -> Self {
        ACTIVE_DEADLINE.with(|active| {
            if let Some(mut deadline) = active.get() {
                deadline.nesting = deadline.nesting.saturating_add(1);
                active.set(Some(deadline));
            } else {
                active.set(Some(ActiveDeadline {
                    end_ms: monotonic_now_ms() + budget_ms.max(0.0),
                    timed_out: false,
                    nesting: 1,
                }));
            }
        });
        Self
    }
}

impl Drop for DeadlineGuard {
    fn drop(&mut self) {
        ACTIVE_DEADLINE.with(|active| {
            let Some(mut deadline) = active.get() else {
                return;
            };
            if deadline.nesting <= 1 {
                LAST_OUTER_DEADLINE_TIMED_OUT.with(|last| last.set(deadline.timed_out));
                active.set(None);
            } else {
                deadline.nesting -= 1;
                active.set(Some(deadline));
            }
        });
    }
}

/// Runs `f` under a cooperative deadline, preserving an earlier outer deadline when nested.
///
/// This is checkpoint-driven and non-preemptive: it cannot interrupt checkpoint-free work or
/// compensate for scheduler/browser suspension. The independently cold 700ms promotion gate is
/// therefore the empirical authority for the complete selector call.
pub(crate) fn with_deadline_if_absent<T>(budget_ms: f64, f: impl FnOnce() -> T) -> T {
    let _guard = DeadlineGuard::enter(budget_ms);
    f()
}

struct SubdeadlineGuard {
    outer: Option<ActiveDeadline>,
    finished: bool,
}

impl SubdeadlineGuard {
    fn enter(budget_ms: f64) -> Self {
        let outer = ACTIVE_DEADLINE.with(|active| {
            let outer = active.get();
            if let Some(mut child) = outer {
                child.end_ms = child.end_ms.min(monotonic_now_ms() + budget_ms.max(0.0));
                active.set(Some(child));
            }
            outer
        });
        Self {
            outer,
            finished: false,
        }
    }

    fn finish(mut self) -> bool {
        let timed_out = self.restore();
        self.finished = true;
        timed_out
    }

    fn restore(&mut self) -> bool {
        let Some(mut outer) = self.outer else {
            return false;
        };
        let now_ms = monotonic_now_ms();
        let child_timed_out = ACTIVE_DEADLINE.with(|active| {
            active
                .get()
                .is_none_or(|child| child.timed_out || now_ms >= child.end_ms)
        });
        if now_ms >= outer.end_ms {
            outer.timed_out = true;
        }
        ACTIVE_DEADLINE.with(|active| active.set(Some(outer)));
        child_timed_out
    }
}

impl Drop for SubdeadlineGuard {
    fn drop(&mut self) {
        if !self.finished {
            self.restore();
        }
    }
}

/// Runs `f` under a shorter cooperative child deadline without consuming its outer deadline.
///
/// A child timeout remains sticky while `f` unwinds, so partial cache writes stay suppressed. On
/// return the prior outer deadline is restored; it is cancelled only when its own wall-clock end
/// was also crossed. The caller must discard `None` and clear any caches written before the child
/// observed cancellation. Like the outer deadline, this cannot preempt checkpoint-free work or a
/// suspended thread.
pub(crate) fn with_cooperative_subdeadline<T>(budget_ms: f64, f: impl FnOnce() -> T) -> Option<T> {
    if ACTIVE_DEADLINE.with(|active| active.get().is_none()) {
        let mut completed = None;
        with_deadline_if_absent(budget_ms, || {
            if checkpoint() {
                return;
            }
            let result = f();
            if !checkpoint() {
                completed = Some(result);
            }
        });
        return completed;
    }
    if checkpoint() {
        return None;
    }

    let guard = SubdeadlineGuard::enter(budget_ms);
    if checkpoint() {
        debug_assert!(guard.finish());
        return None;
    }
    let result = f();
    (!guard.finish()).then_some(result)
}

/// Polls the active clock and returns whether the current selector must stop.
///
/// Once this returns `true`, cancellation remains sticky until the outermost guard exits.
#[inline]
pub(crate) fn checkpoint() -> bool {
    ACTIVE_DEADLINE.with(|active| {
        let Some(mut deadline) = active.get() else {
            return false;
        };
        if deadline.timed_out {
            return true;
        }
        if monotonic_now_ms() >= deadline.end_ms {
            deadline.timed_out = true;
            active.set(Some(deadline));
            return true;
        }
        false
    })
}

/// Stops work early when an active deadline has at most `reserve_ms` remaining.
///
/// Use this before entering an indivisible phase so cleanup and fallback selection retain an
/// intended unwind reserve. Like [`checkpoint`], cancellation is sticky for the outer selector.
#[inline]
pub(crate) fn checkpoint_with_reserve(reserve_ms: f64) -> bool {
    ACTIVE_DEADLINE.with(|active| {
        let Some(mut deadline) = active.get() else {
            return false;
        };
        if deadline.timed_out {
            return true;
        }
        if monotonic_now_ms() + reserve_ms.max(0.0) >= deadline.end_ms {
            deadline.timed_out = true;
            active.set(Some(deadline));
            return true;
        }
        false
    })
}

/// Returns sticky cancellation state without polling the clock.
#[inline]
pub(crate) fn cancelled() -> bool {
    ACTIVE_DEADLINE.with(|active| active.get().is_some_and(|deadline| deadline.timed_out))
}

/// Returns and clears whether the previous outer selector timed out.
///
/// Nested selector helpers must not consume this bit while their outer deadline is active. The
/// next top-level selector uses it to discard caches warmed by an abandoned attempt before doing
/// more work.
pub(crate) fn take_previous_timeout() -> bool {
    if ACTIVE_DEADLINE.with(|active| active.get().is_some()) {
        return false;
    }
    LAST_OUTER_DEADLINE_TIMED_OUT.with(|last| last.replace(false))
}

/// Returns the remaining active budget, polling and sticking cancellation at zero.
#[cfg(test)]
pub(crate) fn remaining_ms() -> Option<f64> {
    ACTIVE_DEADLINE.with(|active| {
        let mut deadline = active.get()?;
        if deadline.timed_out {
            return Some(0.0);
        }
        let remaining = deadline.end_ms - monotonic_now_ms();
        if remaining <= 0.0 {
            deadline.timed_out = true;
            active.set(Some(deadline));
            Some(0.0)
        } else {
            Some(remaining)
        }
    })
}

/// Cache writes are safe only while the active computation is still complete.
#[inline]
pub(crate) fn cache_write_allowed() -> bool {
    !checkpoint()
}

#[cfg(test)]
pub(crate) fn set_test_now_ms(now_ms: f64) {
    TEST_NOW_MS.with(|clock| clock.set(Some(now_ms)));
}

#[cfg(test)]
pub(crate) fn with_test_clock<T>(now_ms: f64, f: impl FnOnce() -> T) -> T {
    struct TestClockGuard(Option<f64>);

    impl Drop for TestClockGuard {
        fn drop(&mut self) {
            TEST_NOW_MS.with(|clock| clock.set(self.0));
        }
    }

    let previous = TEST_NOW_MS.with(|clock| clock.replace(Some(now_ms)));
    let _guard = TestClockGuard(previous);
    f()
}

#[cfg(test)]
fn has_active_deadline() -> bool {
    ACTIVE_DEADLINE.with(|active| active.get().is_some())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn automove_deadline_nested_guard_does_not_reset_outer_deadline() {
        with_test_clock(10.0, || {
            with_deadline_if_absent(50.0, || {
                set_test_now_ms(40.0);
                with_deadline_if_absent(1_000.0, || {
                    set_test_now_ms(61.0);
                    assert!(checkpoint());
                    assert_eq!(remaining_ms(), Some(0.0));
                });
                assert!(cancelled());
            });
            assert!(!has_active_deadline());
        });
    }

    #[test]
    fn automove_deadline_timeout_is_sticky_and_guard_cleans_up() {
        with_test_clock(100.0, || {
            assert!(!checkpoint());
            assert!(cache_write_allowed());
            with_deadline_if_absent(10.0, || {
                assert!(!checkpoint());
                set_test_now_ms(111.0);
                assert!(checkpoint());
                set_test_now_ms(100.0);
                assert!(checkpoint());
                assert!(cancelled());
                assert!(!cache_write_allowed());
            });
            assert!(!has_active_deadline());
            assert!(!cancelled());
            assert!(take_previous_timeout());
            assert!(!take_previous_timeout());
            assert!(!checkpoint());
            assert!(cache_write_allowed());
        });
    }

    #[test]
    fn automove_deadline_reserve_cancels_before_the_absolute_end() {
        with_test_clock(100.0, || {
            with_deadline_if_absent(50.0, || {
                set_test_now_ms(129.0);
                assert!(!checkpoint_with_reserve(20.0));
                set_test_now_ms(130.0);
                assert!(checkpoint_with_reserve(20.0));
                assert!(cancelled());
            });
            assert!(take_previous_timeout());
        });
    }

    #[test]
    fn automove_subdeadline_times_out_without_consuming_live_outer_deadline() {
        with_test_clock(0.0, || {
            with_deadline_if_absent(650.0, || {
                let result = with_cooperative_subdeadline(200.0, || {
                    set_test_now_ms(201.0);
                    assert!(checkpoint());
                    assert!(cancelled());
                    assert!(!cache_write_allowed());
                    set_test_now_ms(100.0);
                    assert!(checkpoint());
                    assert!(cancelled());
                    assert!(!cache_write_allowed());
                    set_test_now_ms(201.0);
                    7
                });
                assert_eq!(result, None);
                assert!(!cancelled());
                assert_eq!(remaining_ms(), Some(449.0));
                assert!(cache_write_allowed());
            });
            assert!(!take_previous_timeout());
        });
    }

    #[test]
    fn automove_subdeadline_discards_unpolled_late_result_and_preserves_early_result() {
        with_test_clock(0.0, || {
            with_deadline_if_absent(650.0, || {
                let early = with_cooperative_subdeadline(200.0, || {
                    set_test_now_ms(199.0);
                    11
                });
                assert_eq!(early, Some(11));
                assert_eq!(remaining_ms(), Some(451.0));

                let late = with_cooperative_subdeadline(200.0, || {
                    set_test_now_ms(400.0);
                    13
                });
                assert_eq!(late, None);
                assert!(!cancelled());
                assert_eq!(remaining_ms(), Some(250.0));
            });
        });
    }

    #[test]
    fn automove_subdeadline_preserves_outer_timeout() {
        with_test_clock(0.0, || {
            with_deadline_if_absent(650.0, || {
                let result = with_cooperative_subdeadline(200.0, || {
                    set_test_now_ms(651.0);
                    17
                });
                assert_eq!(result, None);
                assert!(cancelled());
            });
            assert!(take_previous_timeout());
        });
    }

    #[test]
    fn automove_standalone_subdeadline_discards_late_result_and_cleans_up() {
        with_test_clock(0.0, || {
            let result = with_cooperative_subdeadline(10.0, || {
                set_test_now_ms(11.0);
                19
            });
            assert_eq!(result, None);
            assert!(!has_active_deadline());
            assert!(take_previous_timeout());
        });
    }

    #[test]
    fn automove_zero_budget_subdeadline_does_not_invoke_closure() {
        with_test_clock(0.0, || {
            let invoked = Cell::new(false);
            with_deadline_if_absent(650.0, || {
                let result = with_cooperative_subdeadline(0.0, || {
                    invoked.set(true);
                    23
                });
                assert_eq!(result, None);
                assert!(!cancelled());
            });
            assert!(!invoked.get());
            assert!(!take_previous_timeout());
        });
    }
}
