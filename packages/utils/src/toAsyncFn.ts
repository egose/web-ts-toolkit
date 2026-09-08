import isPromise from './isPromise';

/**
 * Wrap a function so sync results are lifted into a promise.
 *
 * UTILS-07 contract (current behavior, locked by tests):
 * - This is NOT a full async-function boundary. A synchronous `throw`
 *   from `fn` escapes synchronously instead of becoming a rejection.
 * - Thenable results (including foreign/cross-realm thenables) are
 *   returned unchanged with identity preserved; they are not converted
 *   into native promises. A throwing `then` accessor therefore throws
 *   synchronously during the `isPromise` check.
 * - When `fn` is absent/null, the wrapper resolves `defaultValue` in a
 *   native promise. `this` is forwarded via `fn.apply`.
 * - UTILS-09 gave this contract an explicit truthful result type (see the
 *   overloads); do not widen behavior here without maintainer approval.
 *
 * UTILS-09 typing note: the overloads below type that contract truthfully.
 * A present `fn` yields `Promise<Awaited<TResult>> | PromiseLike<TResult>` —
 * deliberately NOT a bare `Promise`, because thenables pass through with
 * identity preserved (so `instanceof Promise` may be false). A synchronous
 * `throw` is not expressible in the return type and stays documented above.
 * An absent `fn` yields `Promise<TResult | undefined>` since an omitted
 * `defaultValue` resolves `undefined`.
 */
export default function toAsyncFn<TArgs extends unknown[], TResult>(
  fn: (this: unknown, ...args: TArgs) => TResult | PromiseLike<TResult>,
  defaultValue?: TResult,
): (this: unknown, ...args: TArgs) => Promise<Awaited<TResult>> | PromiseLike<TResult>;
export default function toAsyncFn<TArgs extends unknown[], TResult>(
  fn: null | undefined,
  defaultValue?: TResult,
): (this: unknown, ...args: TArgs) => Promise<TResult | undefined>;
export default function toAsyncFn<TArgs extends unknown[], TResult>(
  fn?: ((this: unknown, ...args: TArgs) => TResult | PromiseLike<TResult>) | null,
  defaultValue?: TResult,
): (this: unknown, ...args: TArgs) => unknown {
  if (!fn) return () => Promise.resolve(defaultValue);

  return function asyncFn(this: unknown, ...args: TArgs) {
    const ret = fn.apply(this, args);
    return isPromise(ret) ? ret : Promise.resolve(ret);
  };
}
