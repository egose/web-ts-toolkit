import { types } from 'node:util';
import type { EmailClock } from '../contracts/message';
import type { StoreCall } from '../contracts/store';
import type { EmailErrorCode } from '../errors';
import { createChildBudgetUntil, monotonicNow, type OperationBudget } from './budget';
import { allowedErrorCode, invalid } from './validation';

export const STORE_PERSISTENCE_ERRORS = [
  'store_capacity',
  'store_unavailable',
  'store_incompatible',
  'write_unconfirmed',
] as const;

const STOP_ERRORS = ['aborted', 'deadline'] as const;

/**
 * Pass a bounded signal AND timeout to a cooperative store; never abandon its actual I/O. Decode/copy the
 * acknowledgement in the first observer. Before dispatch, a stop is definite. Once a mutation was called,
 * missing/late/unusable evidence is uncertain unless the store explicitly reported a known rejection.
 */
export async function runStoreCall<T>(
  clock: EmailClock,
  parent: OperationBudget,
  options: {
    maxMs: number;
    /** Additional absolute cutoff, e.g. the conservative end of a confirmed lease. */
    deadline?: number;
    effect: 'read' | 'mutation';
    beforeInvoke?: () => void;
    invoke: (call: StoreCall, dispatchedAt: number) => unknown;
    accept: (value: unknown) => T;
    /** Additional definite domain rejections for this particular primitive, not timeouts. */
    definite?: readonly EmailErrorCode[];
    /** Latch a normalized fault before another run item can proceed to launch. */
    onError?: (error: unknown) => void;
  },
): Promise<T> {
  let budget: OperationBudget | undefined;
  try {
    budget = createChildBudgetUntil(
      clock,
      parent,
      Math.min(monotonicNow(clock) + options.maxMs, options.deadline ?? Infinity),
    );
    const mutation = options.effect === 'mutation';
    options.beforeInvoke?.();
    budget.check();
    const dispatchedAt = monotonicNow(clock);
    const timeoutMs = Math.floor(budget.deadline - dispatchedAt);
    if (timeoutMs < 1 || budget.signal.aborted) {
      budget.check();
      invalid('deadline');
    }
    const call = Object.freeze({ timeoutMs, signal: budget.signal });
    let raw: unknown;
    try {
      const pending = options.invoke(call, dispatchedAt);
      // Store methods return native promises. If a JS store returns a value synchronously, do not
      // assimilate it as a thenable or invoke an accessor while trying to validate it.
      raw = types.isPromise(pending) ? await pending : pending;
    } catch (error) {
      const known =
        allowedErrorCode(error, options.definite ?? []) ??
        allowedErrorCode(error, STORE_PERSISTENCE_ERRORS) ??
        allowedErrorCode(error, ['busy']);
      if (mutation) return invalid(known ?? 'write_unconfirmed');
      budget.check();
      if (known === 'write_unconfirmed') invalid('store_unavailable');
      return invalid(known ?? allowedErrorCode(error, STOP_ERRORS) ?? 'store_unavailable');
    }
    try {
      budget.check();
      let captured: T;
      try {
        captured = options.accept(raw);
      } catch {
        budget.check();
        return invalid('store_incompatible');
      }
      budget.check();
      return captured;
    } catch (error) {
      if (mutation) invalid('write_unconfirmed');
      throw error;
    }
  } catch (error) {
    options.onError?.(error);
    throw error;
  } finally {
    budget?.close();
  }
}
