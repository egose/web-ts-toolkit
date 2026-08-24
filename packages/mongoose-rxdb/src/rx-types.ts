import type { SqliteBackend, SqliteStorageInfo } from './storage/loader';

export type RxDocument = {
  toJSON(includeVirtuals?: boolean): any;
  incrementalPatch(patch: any): Promise<void>;
  incrementalModify(fn: (doc: any) => any | Promise<any>): Promise<void>;
  remove(): Promise<void>;
};

export interface RxQuery<T = any> {
  exec(): Promise<T>;
  sort(params: string | Record<string, 'asc' | 'desc'>): RxQuery<T>;
  limit(n: number): RxQuery<T>;
}

export interface RxCollection<O = any> {
  find(query?: any): RxQuery<any[]>;
  findOne(query?: any): RxQuery<any>;
  count?(query?: any): RxQuery<number | { count: number }>;
  insert(doc: any): Promise<RxDocument>;
  name: string;
  options: O;
  storage: any;
  schema: any;
}

export interface RxDatabase<T = any> {
  storage: any;
  sqliteBackend?: SqliteBackend;
  sqliteStorageInfo?: SqliteStorageInfo;
  collections: Record<string, RxCollection>;
  addCollections(defs: Record<string, any>): Promise<Record<string, any>>;
  removeCollection(name: string): Promise<void>;
  close(): Promise<void>;
  destroy(): Promise<void>;
  name: string;
  options: T;
}
