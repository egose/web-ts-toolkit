import isFunction from './isFunction';

export default function isPromise<T = unknown>(value: unknown): value is PromiseLike<T> {
  return !!value && isFunction((value as { then?: unknown }).then);
}
