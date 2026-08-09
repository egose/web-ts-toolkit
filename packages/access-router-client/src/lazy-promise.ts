import type { LazyRequest } from './types';

/**
 * Symbol-keyed flag set non-enumerably on a wrapped lazy request once
 * execution has started (i.e., once `exec()`, `.then()`, `.catch()`, or
 * `.finally()` has been called). Used by `adapter.group(...)` to reject
 * already-executed requests before any network activity begins.
 */
export const STARTED_KEY = Symbol('started');

/**
 * Wraps a lazy promise function with optional metadata.
 *
 * The promise is only created when `.then()`, `.catch()`, `.finally()`, or
 * `.exec()` is called, and a single underlying promise is shared across all
 * of those entry points so repeated chaining attaches to the same execution
 * rather than re-invoking the executor.
 *
 * Behavior notes:
 *
 * - **Sync executor failures become rejections.** The executor is invoked
 *   through `Promise.resolve().then(execute)`, so a synchronous throw from
 *   `execute` is converted to a rejected promise and reaches `.catch()`
 *   and `await` as a rejection rather than escaping synchronously.
 * - **Metadata is private.** Each meta entry is installed with
 *   `Object.defineProperty(..., { enumerable: false, writable: false,
 *   configurable: true })` so consumers cannot accidentally iterate,
 *   serialize, or reassign it. Direct property reads (`prom.__query`) still
 *   work for adapter-internal machinery (e.g. `adapter.group(...)`).
 * - **One execution.** The first call to `exec()`, `.then()`,
 *   `.catch()`, or `.finally()` caches the underlying promise and stamps
 *   the wrapper with `STARTED_KEY = true`. Subsequent calls reuse the same
 *   promise and never re-invoke the executor.
 */
export const wrapLazyPromise = <T, M = undefined>(promiseFn: () => Promise<T>, meta?: M): M & LazyRequest<T> => {
  let promise: Promise<T> | undefined;
  let started = false;

  const exec = () => {
    if (!promise) {
      // Use `Promise.resolve().then(...)` so a synchronous throw from
      // `promiseFn` becomes a rejection that reaches `.then`/`.catch`/
      // `await` consumers rather than escaping the call site.
      promise = Promise.resolve().then(promiseFn);
      started = true;
    }

    return promise;
  };

  const prom = {
    exec,
    then<TResult1 = T, TResult2 = never>(
      onFulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
      onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return exec().then(onFulfilled, onRejected);
    },
    catch<TResult = never>(onRejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null) {
      return exec().catch(onRejected);
    },
    finally(onFinally?: (() => void) | null) {
      return exec().finally(onFinally);
    },
    [Symbol.for('nodejs.util.inspect.custom')]() {
      return 'LazyPromise';
    },
  };

  Object.defineProperty(prom, Symbol.toStringTag, {
    value: 'Promise',
    writable: false,
    enumerable: false,
    configurable: true,
  });

  // Expose the started-flag for adapter grouping diagnostics. Non-enumerable
  // so consumers can't accidentally reassign or serialize it.
  Object.defineProperty(prom, STARTED_KEY, {
    get: () => started,
    enumerable: false,
    configurable: true,
  });

  // Install metadata keys as non-enumerable + non-writable so consumers
  // cannot accidentally iterate, serialize, or reassign them. They are still
  // readable via direct property access (`prom.__query`) for adapter-internal
  // machinery such as `adapter.group(...)`.
  if (meta != null) {
    const metaKeys = Object.keys(meta as Record<string, unknown>);
    for (let i = 0; i < metaKeys.length; i++) {
      const key = metaKeys[i];
      Object.defineProperty(prom, key, {
        value: (meta as Record<string, unknown>)[key],
        enumerable: false,
        writable: false,
        configurable: true,
      });
    }
  }

  // The cast is necessary because `Object.defineProperty` dynamically merges
  // `meta` onto `prom`, which TypeScript cannot statically verify. The
  // runtime shape matches `M & LazyRequest<T>`.
  return prom as M & LazyRequest<T>;
};
