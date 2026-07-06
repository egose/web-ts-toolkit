import mongoose from 'mongoose';
import { Core } from '../core';
import { DataCore } from '../core-data';
import { Codes } from '../enums';
import type { AccessRouterRequest } from './request';
import type { BaseFilterAccess } from './access';
import type { PublicCreateArgs, PublicCreateOptions } from './service-create';
import type { PublicListArgs, PublicListOptions } from './service-list';
import type { PublicReadArgs, PublicReadOptions } from './service-read';
import type { PublicUpdateArgs, PublicUpdateOptions, PublicUpsertArgs, PublicUpsertOptions } from './service-update';
import type { DataFindArgs, DataFindOneArgs } from './data';
import type { Filter, ModelDocument, Populate, Sort, SubPopulate } from './query-types';
export * from './request';
export * from './access';
export * from './query-types';

interface KeyValue {
  [key: string]: unknown;
}

export interface Change {
  op: 'add' | 'replace' | 'remove';
  path: Array<string | number>;
  value?: unknown;
}

export interface ModelHookContext {
  modelName: string;
  mongooseModel: mongoose.Model<unknown>;
  operation?: string;
  originalDocumentSnapshot?: Record<string, unknown>;
  finalDocumentSnapshot?: Record<string, unknown>;
  currentDocument?: ModelDocument;
  originalData?: Record<string, unknown>;
  allowedData?: Record<string, unknown>;
  preparedData?: Record<string, unknown>;
  allowedFields?: string[];
  modifiedPaths?: string[];
  changes?: Change[];
  docPermissions?: KeyValue;
  resolvedQuery?: {
    filter?: Filter;
    select?: string[];
    populate?: Populate[] | string;
    sort?: Sort;
    skip?: number;
    limit?: number;
  };
}

export interface DataHookContext {
  dataName?: string;
  operation?: string;
  resolvedQuery?: {
    filter?: Filter;
    select?: string[];
    sort?: Sort;
    skip?: number;
    limit?: number;
  };
}

export type RootTarget = 'model' | 'data';
export type RootSubOperation = 'subList' | 'subRead' | 'subCreate' | 'subUpdate' | 'subBulkUpdate' | 'subDelete';
export type RootModelOperation =
  | 'new'
  | 'list'
  | 'read'
  | 'create'
  | 'update'
  | 'upsert'
  | 'delete'
  | 'distinct'
  | 'count'
  | RootSubOperation;
export type RootDataOperation = 'list' | 'read';

interface RootQueryEntryBase<TTarget extends RootTarget, TOp extends string> {
  target: TTarget;
  name: string;
  op: TOp;
  order?: number;
}

export interface RootModelNewQueryEntry extends RootQueryEntryBase<'model', 'new'> {}

export interface RootModelListQueryEntry extends RootQueryEntryBase<'model', 'list'> {
  filter?: Filter;
  args?: PublicListArgs;
  options?: PublicListOptions;
}

export interface RootModelReadByIdQueryEntry extends RootQueryEntryBase<'model', 'read'> {
  id: string;
  args?: PublicReadArgs;
  options?: PublicReadOptions;
}

export interface RootModelReadByFilterQueryEntry extends RootQueryEntryBase<'model', 'read'> {
  filter: Filter;
  args?: PublicReadArgs & { sort?: Sort };
  options?: PublicReadOptions;
}

export interface RootModelCreateQueryEntry extends RootQueryEntryBase<'model', 'create'> {
  data: unknown;
  args?: PublicCreateArgs;
  options?: PublicCreateOptions;
}

export interface RootModelUpdateQueryEntry extends RootQueryEntryBase<'model', 'update'> {
  id: string;
  data: unknown;
  args?: PublicUpdateArgs;
  options?: PublicUpdateOptions;
}

export interface RootModelUpsertQueryEntry extends RootQueryEntryBase<'model', 'upsert'> {
  data: Record<string, unknown>;
  args?: PublicUpsertArgs;
  options?: PublicUpsertOptions;
}

export interface RootModelDeleteQueryEntry extends RootQueryEntryBase<'model', 'delete'> {
  id: string;
}

export interface RootModelSubListQueryEntry extends RootQueryEntryBase<'model', 'subList'> {
  id: string;
  sub: string;
  filter?: Filter;
  args?: {
    select?: string[];
  };
}

export interface RootModelSubReadQueryEntry extends RootQueryEntryBase<'model', 'subRead'> {
  id: string;
  sub: string;
  subId: string;
  args?: {
    select?: string[];
    populate?: SubPopulate | SubPopulate[] | string | string[];
  };
}

export interface RootModelSubCreateQueryEntry extends RootQueryEntryBase<'model', 'subCreate'> {
  id: string;
  sub: string;
  data: unknown;
}

export interface RootModelSubUpdateQueryEntry extends RootQueryEntryBase<'model', 'subUpdate'> {
  id: string;
  sub: string;
  subId: string;
  data: unknown;
}

export interface RootModelSubBulkUpdateQueryEntry extends RootQueryEntryBase<'model', 'subBulkUpdate'> {
  id: string;
  sub: string;
  data: unknown;
}

export interface RootModelSubDeleteQueryEntry extends RootQueryEntryBase<'model', 'subDelete'> {
  id: string;
  sub: string;
  subId: string;
}

export interface RootModelDistinctQueryEntry extends RootQueryEntryBase<'model', 'distinct'> {
  field: string;
  filter?: Filter;
}

export interface RootModelCountQueryEntry extends RootQueryEntryBase<'model', 'count'> {
  filter?: Filter;
  options?: {
    access?: BaseFilterAccess;
    [key: string]: unknown;
  };
}

export interface RootDataListQueryEntry extends RootQueryEntryBase<'data', 'list'> {
  filter?: Filter;
  args?: DataFindArgs;
  options?: {
    includeCount?: boolean;
    [key: string]: unknown;
  };
}

export interface RootDataReadByIdQueryEntry extends RootQueryEntryBase<'data', 'read'> {
  id: string;
  args?: DataFindOneArgs;
}

export interface RootDataReadByFilterQueryEntry extends RootQueryEntryBase<'data', 'read'> {
  filter: Filter;
  args?: DataFindOneArgs;
}

export type RootQueryEntry =
  | RootModelNewQueryEntry
  | RootModelListQueryEntry
  | RootModelReadByIdQueryEntry
  | RootModelReadByFilterQueryEntry
  | RootModelCreateQueryEntry
  | RootModelUpdateQueryEntry
  | RootModelUpsertQueryEntry
  | RootModelDeleteQueryEntry
  | RootModelSubListQueryEntry
  | RootModelSubReadQueryEntry
  | RootModelSubCreateQueryEntry
  | RootModelSubUpdateQueryEntry
  | RootModelSubBulkUpdateQueryEntry
  | RootModelSubDeleteQueryEntry
  | RootModelDistinctQueryEntry
  | RootModelCountQueryEntry
  | RootDataListQueryEntry
  | RootDataReadByIdQueryEntry
  | RootDataReadByFilterQueryEntry;

export interface RootOperationResult<T = unknown, TError = unknown, TInput = unknown, TQuery = unknown> {
  index: number;
  target: RootTarget;
  name: string;
  op: RootModelOperation | RootDataOperation;
  result: ServiceResult<T, TError, TInput, TQuery>;
  statusCode: number;
  message: string;
}

export interface SubQueryEntry {
  model: string;
  op: 'list' | 'read' | string;
  id?: string;
  filter?: Filter;
  args?: Record<string, unknown>;
  options?: Record<string, unknown>;
  sqOptions?: {
    path?: string;
    compact?: boolean;
  };
}

export interface Task {
  type: string;
  args: unknown;
  options: Record<string, unknown>;
}

export interface AccessRouterBaseRequest extends AccessRouterRequest {
  query: Record<
    | 'skip'
    | 'limit'
    | 'page'
    | 'page_size'
    | 'try_list'
    | 'skim'
    | 'include_permissions'
    | 'include_count'
    | 'include_extra_headers'
    | 'returning_all',
    string
  >;
}

export interface ModelRequest extends AccessRouterBaseRequest {
  macl: Core;
}

export interface DataRequest extends AccessRouterBaseRequest {
  dacl: DataCore;
}

export type Request = AccessRouterBaseRequest;

export interface ErrorResult<TError = unknown, TQuery = unknown> {
  success: false;
  code: Codes.BadRequest | Codes.Unauthorized | Codes.Forbidden | Codes.NotFound;
  errors?: TError[];
  query?: TQuery;
}

export interface SingleResult<T = unknown, TInput = unknown, TQuery = unknown> {
  success: true;
  kind: 'single';
  code: Codes.Success | Codes.Created;
  data: T;
  input?: TInput;
  query?: TQuery;
  context?: ModelHookContext;
}

export interface ListResult<T = unknown, TInput = unknown, TQuery = unknown> {
  success: true;
  kind: 'list';
  code: Codes.Success | Codes.Created;
  data: T[];
  count: number;
  totalCount?: number | null;
  input?: TInput;
  query?: TQuery;
  contexts?: ModelHookContext[];
}

export type ServiceResult<T = unknown, TError = unknown, TInput = unknown, TQuery = unknown> =
  | SingleResult<T, TInput, TQuery>
  | ListResult<T, TInput, TQuery>
  | ErrorResult<TError, TQuery>;
