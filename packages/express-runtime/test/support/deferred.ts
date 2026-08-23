/**
 * Deferred promise helper for deterministic lifecycle tests.
 * Avoids fixed sleeps by exposing resolve/reject to coordinate events.
 */
export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
  settled: () => boolean;
}

export function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  let isSettled = false;
  const promise = new Promise<T>((res, rej) => {
    resolve = (v) => {
      if (!isSettled) {
        isSettled = true;
        res(v);
      }
    };
    reject = (e) => {
      if (!isSettled) {
        isSettled = true;
        rej(e);
      }
    };
  });
  // Prevent unhandled rejection warnings for deferreds that are expected to reject later.
  // Consumers still must await or handle the promise.
  promise.catch(() => {});
  return {
    promise,
    resolve,
    reject,
    settled: () => isSettled,
  };
}

/**
 * Create a deferred that resolves on next event loop tick, useful for
 * coordinating in-flight request entry without sleeps.
 */
export function createTrigger(): { promise: Promise<void>; trigger: () => void; wait: () => Promise<void> } {
  let trigger!: () => void;
  const promise = new Promise<void>((resolve) => {
    trigger = resolve;
  });
  return {
    get promise() {
      return promise;
    },
    trigger: () => trigger(),
    wait: () => promise,
  };
}
