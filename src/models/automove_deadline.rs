use std::cell::Cell;
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

#[wasm_bindgen(
    inline_js = "export function automove_monotonic_now_ms() { return globalThis.performance.now(); }"
)]
extern "C" {
    fn automove_monotonic_now_ms() -> f64;
}

#[inline]
fn monotonic_now_ms() -> f64 {
    automove_monotonic_now_ms()
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
/// compensate for scheduler/browser suspension.
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

/// Cache writes are safe only while the active computation is still complete.
#[inline]
pub(crate) fn cache_write_allowed() -> bool {
    !checkpoint()
}
