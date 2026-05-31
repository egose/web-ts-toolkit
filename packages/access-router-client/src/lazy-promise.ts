import type { LazyRequest } from './types';

/**
 * Wraps a lazy promise function with optional metadata.
 * The promise is only created when `.then()`, `.catch()`, `.finally()`, or `.exec()` is called.
 * Metadata properties are merged onto the returned object via `Object.assign`.
 */
export const wrapLazyPromise = <T, M = undefined>(promiseFn: () => Promise<T>, meta?: M): M & LazyRequest<T> => {
  let promise: Promise<T> | undefined;

  const exec = () => {
    if (!promise) {
      promise = promiseFn();
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

  Object.assign(prom, meta);

  // The cast is necessary because `Object.assign` dynamically merges `meta` onto `prom`,
  // which TypeScript cannot statically verify. The runtime shape matches `M & LazyRequest<T>`.
  return prom as M & LazyRequest<T>;
};
