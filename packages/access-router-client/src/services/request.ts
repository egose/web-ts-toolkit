import { wrapLazyPromise } from '../lazy-promise';
import { LazyRequest, ModelPromiseMeta, DataPromiseMeta } from '../types';

type RequestMeta = ModelPromiseMeta | DataPromiseMeta;

export function makeRequest<T>(execute: () => Promise<T>, meta: ModelPromiseMeta): ModelPromiseMeta & LazyRequest<T>;
export function makeRequest<T>(execute: () => Promise<T>, meta: DataPromiseMeta): DataPromiseMeta & LazyRequest<T>;
export function makeRequest<T>(execute: () => Promise<T>, meta: RequestMeta): RequestMeta & LazyRequest<T> {
  const effectiveMeta = {
    ...meta,
    __throwOnError: meta.__service?.resolveThrowOnError(meta.__throwOnError) ?? Boolean(meta.__throwOnError),
  };
  return wrapLazyPromise<T, RequestMeta>(execute, effectiveMeta);
}
