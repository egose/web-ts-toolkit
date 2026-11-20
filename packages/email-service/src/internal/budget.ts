import { addAbortListener } from 'node:events';
import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import { types } from 'node:util';
import type { EmailClock } from '../contracts/message';
import { EmailError, type EmailErrorCode } from '../errors';
import { bindMethod } from './callbacks';
import { boundedOption, invalid, readRecord, type IntegerBounds } from './validation';

export const systemEmailClock: EmailClock = Object.freeze({
  now: Date.now,
  monotonicNow: () => performance.now(),
  sleep: (ms: number, signal: AbortSignal) => sleep(ms, undefined, { signal }),
});

/** An injected clock is trusted and may be a stateful class instance. Retain its method bindings. */
export function readClock(value: unknown): EmailClock {
  if (value === undefined) return systemEmailClock;
  return Object.freeze({
    now: bindMethod<EmailClock['now']>(value, 'now'),
    monotonicNow: bindMethod<EmailClock['monotonicNow']>(value, 'monotonicNow'),
    sleep: bindMethod<EmailClock['sleep']>(value, 'sleep'),
  });
}

export function readCallOptions(input: unknown, bounds: IntegerBounds): { signal?: AbortSignal; timeoutMs: number } {
  const code = 'invalid_config';
  const { signal, timeoutMs } = readRecord(input, [], ['signal', 'timeoutMs'], code);
  const timeout = boundedOption(timeoutMs, bounds, code);
  if (signal === undefined) return { timeoutMs: timeout };
  try {
    if (
      !types.isProxy(signal) &&
      signal instanceof AbortSignal &&
      typeof Reflect.get(AbortSignal.prototype, 'aborted', signal) === 'boolean'
    ) {
      return { signal, timeoutMs: timeout };
    }
  } catch {
    invalid(code);
  }
  return invalid(code);
}

export type OperationBudget = Readonly<{
  signal: AbortSignal;
  /** Absolute monotonic end, even after cancellation. */
  deadline: number;
  /** Remaining monotonic milliseconds (possibly fractional); zero once stopped. */
  remainingMs(): number;
  /** Call before and after non-preemptible stages. */
  check(): void;
  /** Detach external cancellation and cancel the timer, including on successful completion. */
  close(): void;
}>;

export function monotonicNow(clock: EmailClock): number {
  try {
    const now = clock.monotonicNow();
    if (Number.isFinite(now)) return now;
  } catch {
    invalid('invalid_config');
  }
  return invalid('invalid_config');
}

/** One absolute budget. `timeoutMs` may be a shortened internal budget; public option floors are checked separately. */
export function createBudget(clock: EmailClock, timeoutMs: number, external?: AbortSignal): OperationBudget {
  return createBudgetUntil(clock, monotonicNow(clock) + timeoutMs, external);
}

/** An existing dispatch timestamp can anchor a deadline without resampling and extending the window. */
export function createBudgetUntil(clock: EmailClock, end: number, external?: AbortSignal): OperationBudget {
  const operation = new AbortController();
  const timer = new AbortController();
  let externalListener: Disposable | undefined;
  let closed = false;
  let reason: 'aborted' | 'deadline' | 'invalid_config' | undefined;

  function close(): void {
    if (closed) return;
    closed = true;
    externalListener?.[Symbol.dispose]();
    timer.abort();
  }

  function stop(code: NonNullable<typeof reason>): void {
    if (closed) return;
    reason = code;
    close();
    operation.abort(new EmailError(code));
  }

  function remainingMs(): number {
    if (closed) return 0;
    if (external?.aborted) {
      stop('aborted');
    } else {
      try {
        const remaining = end - monotonicNow(clock);
        if (remaining > 0) return remaining;
        stop('deadline');
      } catch {
        stop('invalid_config');
      }
    }
    return 0;
  }

  function arm(remaining: number): void {
    // Round up rather than give the Node timer a fractional delay.
    void Promise.resolve(clock.sleep(Math.ceil(remaining), timer.signal)).then(
      () => {
        try {
          const left = remainingMs();
          if (left <= 0) return;
          // Recheck monotonic time at wakeup. A broken injected sleep must not spin without progress.
          if (left >= remaining) stop('invalid_config');
          else arm(left);
        } catch {
          stop('invalid_config');
        }
      },
      () => stop('invalid_config'),
    );
  }

  try {
    if (external && !external.aborted) externalListener = addAbortListener(external, () => stop('aborted'));
    const remaining = remainingMs();
    if (remaining > 0) arm(remaining);
  } catch {
    stop('invalid_config');
  }

  return {
    signal: operation.signal,
    deadline: end,
    remainingMs,
    check() {
      remainingMs();
      if (reason) invalid(reason);
      if (closed) invalid('aborted');
    },
    close,
  };
}

/** A stage can have a tighter cap, but never a fresh copy of the operation's elapsed budget. */
export function createChildBudget(clock: EmailClock, parent: OperationBudget, maxMs: number): OperationBudget {
  return createChildBudgetUntil(clock, parent, monotonicNow(clock) + maxMs);
}

export function createChildBudgetUntil(
  clock: EmailClock,
  parent: OperationBudget,
  end: number,
  stop?: AbortSignal,
): OperationBudget {
  parent.check();
  const signal = stop ? AbortSignal.any([parent.signal, stop]) : parent.signal;
  const child = createBudgetUntil(clock, Math.min(parent.deadline, end), signal);
  return {
    signal: child.signal,
    deadline: child.deadline,
    remainingMs: () => Math.min(parent.remainingMs(), child.remainingMs()),
    check() {
      parent.check(); // Preserve the parent's deadline code rather than its child's abort code.
      child.check();
    },
    close: child.close,
  };
}

/** No promise subscription survives either stop. Useful when the underlying work may never settle. */
export function waitForAbort(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const listener = addAbortListener(signal, () => {
      listener[Symbol.dispose]();
      resolve();
    });
  });
}

/** Redact stage errors; a real abort/deadline takes precedence over a late result or error. */
export function syncStage<T>(budget: OperationBudget, code: EmailErrorCode, run: () => T): T {
  budget.check();
  let result: T;
  try {
    result = run();
  } catch {
    budget.check();
    return invalid(code);
  }
  budget.check();
  return result;
}
