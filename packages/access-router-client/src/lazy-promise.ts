import type { LazyRequest } from './types';

/**
 * Symbol-keyed flag set non-enumerably on a wrapped lazy request once it is
 * claimed for direct or grouped execution. Used for internal diagnostics;
 * ownership transitions are enforced through the module-private WeakMap.
 */
export const STARTED_KEY = Symbol('started');

type ExecutionMode = 'direct' | 'grouped';

interface ExecutionClaim {
  mode: ExecutionMode;
  owner?: symbol;
}

const executionClaims = new WeakMap<object, ExecutionClaim>();

export const claimLazyRequest = (request: object, mode: ExecutionMode, owner?: symbol): void => {
  const claim = executionClaims.get(request);
  if (!claim) {
    executionClaims.set(request, { mode, owner });
    return;
  }

  if (mode === 'grouped') {
    if (claim.mode === 'direct') {
      throw new Error(
        'Cannot group a request that has already started execution; group() must be called before await/then/catch/finally/exec on each input',
      );
    }
    throw new Error('Cannot group a request already claimed for grouped execution');
  }

  throw new Error('Cannot execute a request already claimed for grouped execution');
};

export const releaseLazyRequestClaim = (request: object, owner: symbol): void => {
  const claim = executionClaims.get(request);
  if (claim?.mode === 'grouped' && claim.owner === owner) {
    executionClaims.delete(request);
  }
};

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
 *   configurable: false })` so consumers cannot accidentally iterate,
 *   serialize, or reassign it. Direct property reads (`prom.__query`) still
 *   work for adapter-internal machinery (e.g. `adapter.group(...)`).
 * - **One execution.** The first call to `exec()`, `.then()`,
 *   `.catch()`, or `.finally()` caches the underlying promise and stamps
 *   the wrapper with `STARTED_KEY = true`. Subsequent calls reuse the same
 *   promise and never re-invoke the executor.
 */
export const wrapLazyPromise = <T, M = undefined>(promiseFn: () => Promise<T>, meta?: M): M & LazyRequest<T> => {
  let promise: Promise<T> | undefined;

  const exec = () => {
    if (!promise) {
      try {
        claimLazyRequest(prom, 'direct');
        // Use `Promise.resolve().then(...)` so a synchronous throw from
        // `promiseFn` becomes a rejection that reaches `.then`/`.catch`/
        // `await` consumers rather than escaping the call site.
        promise = Promise.resolve().then(promiseFn);
      } catch (error) {
        promise = Promise.reject(error);
      }
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
    configurable: false,
  });

  // Expose claim state for adapter diagnostics without making the ownership
  // record itself reachable or mutable.
  Object.defineProperty(prom, STARTED_KEY, {
    get: () => executionClaims.has(prom),
    enumerable: false,
    configurable: false,
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
        configurable: false,
      });
    }
  }

  // The cast is necessary because `Object.defineProperty` dynamically merges
  // `meta` onto `prom`, which TypeScript cannot statically verify. The
  // runtime shape matches `M & LazyRequest<T>`.
  return prom as M & LazyRequest<T>;
};
