import isFunction from './isFunction';

/**
 * Thenable check: true for any non-null value whose `then` is a function.
 *
 * UTILS-07 contract: native promises and foreign/cross-realm thenables
 * satisfy this; a throwing `then` accessor propagates its throw. It does
 * not verify genuine promise semantics beyond a callable `then`.
 */
export default function isPromise<T = unknown>(value: unknown): value is PromiseLike<T> {
  return !!value && isFunction((value as { then?: unknown }).then);
}
