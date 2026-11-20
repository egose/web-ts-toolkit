import { addAbortListener } from 'node:events';
import { types } from 'node:util';
import type { EmailErrorCode } from '../errors';
import type { OperationBudget } from './budget';
import { allowedErrorCode, invalid } from './validation';

const promiseThen = Promise.prototype.then;

/** Closing the pipeline does not release its slot until every outstanding host callback settles. */
export class CallbackSlot {
  #pending = 0;
  #closed = false;
  readonly #release: () => void;

  constructor(release: () => void) {
    this.#release = release;
  }

  get pending(): number {
    return this.#pending;
  }

  hold(task: Promise<unknown>): void {
    const settled = () => {
      this.#pending--;
      if (this.#closed && this.#pending === 0) this.#release();
    };
    void promiseThen.call(task, settled, settled);
    this.#pending++;
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    if (this.#pending === 0) this.#release();
  }
}

type Callback = (...args: never[]) => unknown;

export function requireCallback(value: unknown, code: EmailErrorCode = 'invalid_config'): Callback {
  if (typeof value !== 'function' || types.isProxy(value)) invalid(code);
  return value as Callback;
}

/** Read a port member without invoking accessors. Trusted ports may be class instances. */
export function readPortMember(target: unknown, key: string): unknown {
  if (typeof target !== 'object' || target === null) invalid('invalid_config');
  let owner: object | null = target;
  while (owner && owner !== Object.prototype) {
    if (types.isProxy(owner)) invalid('invalid_config');
    const descriptor = Object.getOwnPropertyDescriptor(owner, key);
    if (descriptor) {
      if (!Object.hasOwn(descriptor, 'value')) invalid('invalid_config');
      return descriptor.value;
    }
    owner = Object.getPrototypeOf(owner) as object | null;
  }
}

/** Capture a port method without invoking accessors or relying on the host not to replace it after assembly. */
export function bindMethod<F extends Callback>(target: unknown, key: string): F {
  const method = requireCallback(readPortMember(target, key));
  // Function.bind reads overridable function metadata. Preserve the receiver without reading it.
  return ((...args: never[]) => Reflect.apply(method, target, args)) as F;
}

// Support PromiseLike methods without invoking an accessor or proxy while testing whether a DTO is a thenable.
function dataThen(value: unknown): Callback | undefined {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return undefined;
  let owner: object | null = value;
  while (owner && owner !== Object.prototype && !types.isProxy(owner)) {
    const descriptor = Object.getOwnPropertyDescriptor(owner, 'then');
    if (descriptor) return typeof descriptor.value === 'function' ? (descriptor.value as Callback) : undefined;
    owner = Object.getPrototypeOf(owner) as object | null;
  }
}

function observeThenable<T>(receiver: unknown, then: Callback, capture: (raw: unknown) => T): Promise<() => T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const fulfill = (raw: unknown) => {
      if (settled) return;
      settled = true;
      // Validate/copy on the first fulfillment, without passing the raw DTO to a native
      // Promise resolver (which would look up its `then`, even after a deadline).
      try {
        const result = capture(raw);
        resolve(() => result);
      } catch (error) {
        // Keep validation errors distinct from a rejection from the host callback itself.
        resolve(() => {
          throw error;
        });
      }
    };
    try {
      Reflect.apply(then, receiver, [fulfill, fail]);
    } catch (error) {
      fail(error);
    }
  });
}

/** Observe settlement; only a native promise can supply data on this path. */
export function pendingCallback(value: unknown): Promise<unknown> | undefined {
  if (types.isPromise(value)) return Promise.resolve(value);
  const then = dataThen(value);
  if (then) return observeThenable(value, then, () => undefined);
}

export function runSyncCallback(
  budget: OperationBudget,
  slot: CallbackSlot,
  code: EmailErrorCode,
  invoke: () => unknown,
): unknown {
  budget.check();
  let value: unknown;
  try {
    value = invoke();
    // Reject accidental native promises from synchronous stages, without leaking rejections or freeing their slots.
    if (types.isPromise(value)) slot.hold(Promise.resolve(value));
  } catch {
    budget.check();
    return invalid(code);
  }
  budget.check();
  if (types.isPromise(value)) invalid(code);
  return value;
}

/**
 * Run trusted code, but do not admit a late result. `accept` snapshots a synchronous value in the same turn
 * or a promise value in the first fulfillment observer, before yielding to any next stage.
 */
export async function runHostCallback<T>(
  budget: OperationBudget,
  slot: CallbackSlot,
  code: EmailErrorCode,
  invoke: () => unknown,
  accept: (value: unknown) => T,
  knownErrors: readonly EmailErrorCode[] = [],
): Promise<T> {
  budget.check();
  const capture = (raw: unknown) => {
    budget.check();
    const result = accept(raw);
    budget.check();
    return result;
  };
  let value: unknown;
  let task: Promise<unknown> | undefined;
  let read = capture;
  try {
    value = invoke();
    if (types.isPromise(value)) task = Promise.resolve(value);
    else {
      const then = dataThen(value);
      if (then) {
        budget.check();
        task = observeThenable(value, then, capture);
        read = (readCaptured) => (readCaptured as () => T)();
      }
    }
    if (task) slot.hold(task);
  } catch (error) {
    budget.check();
    return invalid(allowedErrorCode(error, knownErrors) ?? code);
  }
  budget.check();
  if (!task) return capture(value);
  return new Promise((resolve, reject) => {
    const abort = addAbortListener(budget.signal, () => {
      try {
        budget.check();
      } catch (error) {
        reject(error);
      }
    });
    const settle = (receive: () => T) => {
      abort[Symbol.dispose]();
      try {
        budget.check();
        resolve(receive());
      } catch (error) {
        reject(error);
      }
    };
    try {
      void promiseThen.call(
        task,
        (result: unknown) => settle(() => read(result)),
        (error: unknown) => settle(() => invalid(allowedErrorCode(error, knownErrors) ?? code)),
      );
    } catch {
      settle(() => invalid(code));
    }
  });
}
