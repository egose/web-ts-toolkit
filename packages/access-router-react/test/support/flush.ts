//
// Helpers for flushing React work without arbitrary sleeps (ARR-01).
//
// The hooks under test schedule state updates inside microtasks and
// `useEffect` callbacks. Waiting for them with `setTimeout`-based sleeps
// introduces timing fizzle. Prefer microtask flushing plus the testing
// library's built-in `waitFor` (which already wraps `act`/flushing).
//
// Two helpers are provided:
//   - `flushMicrotasks()`: resolves one microtask tick, suitable for a
//     single awaited `.then`/`.catch` chain on a lazy request.
//   - `flushAsync(actor)`: runs a callback inside React's `act()`, then
//     drains pending React effects/callbacks by `await`ing a dedicated
//     resolved promise. Use this when a test performs an imperative
//     action (`query()`/`mutate()`/`refetch()`/`reset()`) that schedules
//     both microtask settlement and a React state update.
//
// These helpers intentionally avoid `setTimeout(0)`-style waits so the test
// runs deterministically without a real timer. Vitest's microtask queue is
// drained synchronously.
//
// `act` is imported from `@testing-library/react` to ensure React batches
// effects and flushes them under the test renderer's `act` boundary.
//
import { act } from '@testing-library/react';

/**
 * Resolves after a single microtask tick. Suitable for tests that need to
 * flush a single awaited promise on a lazy request before asserting on
 * pending state.
 */
export function flushMicrotasks(): Promise<void> {
  return Promise.resolve().then(() => undefined);
}

/**
 * Run an actor inside `act` and then flush microtasks plus a follow-up
 * microtask tick. Used to await an imperative hook action
 * (`query()`/`mutate()`/`refetch()`/`reset()`) that schedules both
 * promise settlement and a React state update.
 *
 * Resolves when the act boundary has been entered and pending microtasks
 * have drained. Does NOT use real timers.
 */
export async function flushAsync<T>(actor: () => Promise<T> | T): Promise<T> {
  let result: T;
  await act(async () => {
    result = await actor();
    await flushMicrotasks();
  });
  return result!;
}
