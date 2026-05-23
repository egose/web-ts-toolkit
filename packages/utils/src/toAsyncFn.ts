import isPromise from './isPromise';

export default function toAsyncFn<TArgs extends unknown[], TResult>(
  fn?: ((this: unknown, ...args: TArgs) => TResult | PromiseLike<TResult>) | null,
  defaultValue?: TResult,
) {
  if (!fn) return () => Promise.resolve(defaultValue);

  return function asyncFn(this: unknown, ...args: TArgs) {
    const ret = fn.apply(this, args);
    return isPromise(ret) ? ret : Promise.resolve(ret);
  };
}
