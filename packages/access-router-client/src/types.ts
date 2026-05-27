import { AxiosRequestConfig } from 'axios';
import { Model } from './model';
import { ModelService, DataService } from './services';
import { SubQueryOptions } from './interface';
import { _FilterQuery } from './mongoose/types';

export interface KeyValueProjection {
  [key: string]: 1 | -1;
}

export type Projection = string[] | string | KeyValueProjection;

export type SortOrder = -1 | 1 | 'asc' | 'ascending' | 'desc' | 'descending';

export type Sort = string | { [key: string]: SortOrder } | [string, SortOrder][] | undefined | null;

export type FilterQuery<T> = _FilterQuery<T>;

export interface Include {
  model: string;
  op: 'list' | 'read' | 'count';
  path: string;
  localField: string;
  foreignField: string;
  filter?: FilterQuery<unknown>;
  args?: Record<string, unknown>;
  options?: Record<string, unknown>;
}

export type PopulateAccess = 'list' | 'read';

export interface Populate {
  path: string;
  select?: Projection;
  match?: Record<string, unknown> | null;
  access?: PopulateAccess;
}

export interface Document {
  _id?: string;
}

export interface Response<T1, T2 = T1> {
  success: boolean;
  raw: T1;
  data: T2;
  message: string;
  status: number;
  headers: Record<string, string>;
}

export type ModelResponse<T, TData extends Partial<T> = T> = Response<TData, Model<T, TData> & TData>;
export type ArrayModelResponse<T, TData extends Partial<T> = T> = Response<TData[], (Model<T, TData> & TData)[]>;
export type ListModelResponse<T, TData extends Partial<T> = T> = ArrayModelResponse<T, TData> & { totalCount: number };

export interface Task {
  type: string;
  args: unknown;
  options: Record<string, unknown>;
}

type RootModelOperation =
  | 'new'
  | 'list'
  | 'read'
  | 'create'
  | 'update'
  | 'upsert'
  | 'delete'
  | 'distinct'
  | 'count'
  | 'subList'
  | 'subRead'
  | 'subCreate'
  | 'subUpdate'
  | 'subBulkUpdate'
  | 'subDelete';

type RootDataOperation = 'list' | 'read';

export interface RootModelQueryMeta {
  target: 'model';
  name: string;
  model: string;
  op: RootModelOperation;
  id?: string;
  sub?: string;
  subId?: string;
  field?: string;
  filter?: unknown;
  data?: unknown;
  args?: Record<string, unknown>;
  options?: Record<string, unknown>;
  sqOptions?: SubQueryOptions;
}

export interface RootDataQueryMeta {
  target: 'data';
  name: string;
  op: RootDataOperation;
  id?: string;
  filter?: unknown;
  data?: unknown;
  args?: Record<string, unknown>;
  options?: Record<string, unknown>;
}

export type RootQueryMeta = RootModelQueryMeta | RootDataQueryMeta;

export interface SubQueryMeta {
  model: string;
  op: 'list' | 'read';
  id?: string;
  filter?: unknown;
  args?: Record<string, unknown>;
  options?: Record<string, unknown>;
  sqOptions?: SubQueryOptions;
}

export interface ModelPromiseMeta {
  __op: string;
  __query: RootModelQueryMeta;
  __requestConfig?: AxiosRequestConfig;
  __service?: ModelService<Document>;
}

export interface LazyRequest<T> extends Promise<T> {
  exec(): Promise<T>;
}

export type DataResponse<T> = Response<T, T>;
export type ArrayDataResponse<T> = Response<T[], T[]>;
export type ListDataResponse<T> = ArrayDataResponse<T> & { totalCount: number };

export interface DataPromiseMeta {
  __op: string;
  __query: RootDataQueryMeta;
  __requestConfig?: AxiosRequestConfig;
  __service?: DataService<unknown>;
}

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

  return prom as M & LazyRequest<T>;
};

export type ResponseCallback = (res: unknown) => void;

export interface WrapOptions {
  queryParams?: Record<string, unknown>;
  pathParams?: Record<string, string | number>;
}
