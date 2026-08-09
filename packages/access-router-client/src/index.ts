import { createAdapter } from './adapter';
export * from './services';
export * from './model';
export * from './types';
export * from './interface';
export * from './enums';
export * from './utils';

// Public cache policy types referenced by {@link AdapterOptions}. These
// names are exported so consumers can name the option types instead of
// relying on structural inline literals; the cache implementation itself
// (interceptors, snapshot storage, helpers) remains un-exported.
export type { CacheController, CachePartitioner } from './services/interceptors';

export { createAdapter };
export type { AdapterOptions, ModelServiceOptions, DataServiceOptions } from './adapter';
