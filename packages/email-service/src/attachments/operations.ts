import { addAbortListener } from 'node:events';
import type { Readable } from 'node:stream';
import type { CallOptions, EmailClock } from '../contracts/message';
import { createBudget, readClock, type OperationBudget } from '../internal/budget';
import { CallbackSlot, runHostCallback } from '../internal/callbacks';
import { invalid, unixMs } from '../internal/validation';
import type { DispatchHooks, ManagedAttachmentOperation, ManagedAttachmentRequest } from './backing';

export const MANAGED_ATTACHMENT_CALL_BOUNDS = Object.freeze({ default: 5_000, min: 50, max: 30_000 });
const MAX_IN_FLIGHT = 8;
const MANAGED_ERRORS = [
  'aborted',
  'deadline',
  'invalid_config',
  'invalid_input',
  'invalid_snapshot',
  'expired',
  'attachment_conflict',
  'attachment_retention',
  'store_incompatible',
  'store_unavailable',
  'write_unconfirmed',
  'busy',
] as const;

function holdStream(slot: CallbackSlot, signal: AbortSignal, stream: Readable): void {
  if (stream.closed) return;
  // Unlike a read/error promise, 'close' observes the completion of _destroy too. The backing
  // must supply a Node Readable with close notification; a nonsettling stream still occupies capacity.
  const closed = new Promise<void>((resolve) => {
    const destroy = () => stream.destroy();
    const ignore = () => {};
    const abort = addAbortListener(signal, destroy);
    stream.on('error', ignore);
    stream.once('close', () => {
      abort[Symbol.dispose]();
      stream.off('error', ignore);
      resolve();
    });
    if (signal.aborted) destroy();
  });
  slot.hold(closed);
}

async function withRequest<T>(
  budget: OperationBudget,
  slot: CallbackSlot,
  invoke: (request: ManagedAttachmentRequest) => Promise<T>,
  hooks?: DispatchHooks,
): Promise<T> {
  budget.check();
  const controller = new AbortController();
  const signal = AbortSignal.any([budget.signal, controller.signal]);
  const streams = new Set<Readable>();
  let started = false;
  let blocked: { error: unknown } | undefined;
  const request: ManagedAttachmentRequest = Object.freeze({
    signal,
    get dispatched() {
      return started;
    },
    check: budget.check,
    begin() {
      try {
        budget.check();
        if (started || signal.aborted) invalid('store_incompatible');
        hooks?.beforeDispatch?.();
        const left = Math.floor(budget.remainingMs());
        budget.check();
        if (left < 1) invalid('deadline');
        started = true;
        hooks?.onDispatch?.();
        return left;
      } catch (error) {
        // A dispatch guard is ours, not an SDK result the adapter can reclassify.
        blocked ??= { error };
        throw error;
      }
    },
    ownStream(stream: Readable) {
      if (!streams.has(stream)) {
        streams.add(stream);
        holdStream(slot, signal, stream);
      }
      return stream;
    },
    hold: (task: Promise<unknown>) => slot.hold(task),
  });
  try {
    const result = await invoke(request);
    if (blocked) throw blocked.error;
    return result;
  } catch (error) {
    throw blocked ? blocked.error : error;
  } finally {
    // Also abort if headers were rejected by the SDK before it exposed the response stream.
    // On a successful read only a fully consumed body can reach this point.
    controller.abort();
  }
}

/** One runtime per store instance. Readiness uses the same slots and budget via run(). */
export function createManagedAttachmentOperations(clockInput?: EmailClock) {
  const clock = readClock(clockInput);
  let occupied = 0;

  async function run<T, R>(
    call: CallOptions & { timeoutMs: number },
    task: (op: ManagedAttachmentOperation) => Promise<T>,
    accept: (result: T) => R,
  ): Promise<R> {
    if (occupied >= MAX_IN_FLIGHT) invalid('busy');
    const budget = createBudget(clock, call.timeoutMs, call.signal);
    const slot = new CallbackSlot(() => occupied--);
    occupied++;
    const op: ManagedAttachmentOperation = Object.freeze({
      check: budget.check,
      request: <U>(invoke: (request: ManagedAttachmentRequest) => Promise<U>, hooks?: DispatchHooks) =>
        withRequest(budget, slot, invoke, hooks),
    });
    try {
      return await runHostCallback(
        budget,
        slot,
        'store_incompatible',
        () => task(op),
        (value) => accept(value as T),
        MANAGED_ERRORS,
      );
    } finally {
      budget.close();
      slot.close();
    }
  }

  return Object.freeze({
    run,
    wallNow() {
      try {
        return unixMs(clock.now(), 'invalid_config');
      } catch {
        return invalid('invalid_config');
      }
    },
  });
}
