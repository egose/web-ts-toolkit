import express from 'express';
import mongoose from 'mongoose';
import { Diff } from 'deep-diff';
import type { AccessRouterPermissions } from '../permission';
import { Core } from '../core';
import { DataCore } from '../core-data';
import { Codes } from '../enums';
import type { AccessRouterRequest, BaseFilterAccess } from './root';
import type { PublicCreateArgs, PublicCreateOptions } from './service-create';
import type { PublicListArgs, PublicListOptions } from './service-list';
import type { PublicReadArgs, PublicReadOptions } from './service-read';
import type { PublicUpdateArgs, PublicUpdateOptions, PublicUpsertArgs, PublicUpsertOptions } from './service-update';
import type { DataFindArgs, DataFindOneArgs } from './data';

export type GuardHook<TRequest extends AccessRouterRequest = AccessRouterRequest> = (
  this: TRequest,
  permissions: AccessRouterPermissions,
) => boolean | Promise<boolean>;

export type Validation = boolean | string | string[] | GuardHook;

export interface KeyValueProjection {
  [key: string]: 1 | -1;
}

export type Projection = string[] | string | KeyValueProjection;

export type SortOrder = -1 | 1 | 'asc' | 'ascending' | 'desc' | 'descending';

export type Sort = string | { [key: string]: SortOrder } | [string, SortOrder][] | undefined | null;

type Primitive = string | number | boolean | bigint | symbol | null | undefined;
type NonTraversable = Primitive | Date | RegExp | Function;
type PrevDepth = [never, 0, 1, 2, 3, 4, 5];

type IsUnknown<T> = unknown extends T ? ([keyof T] extends [never] ? true : false) : false;
type Descend<T> = T extends readonly (infer U)[] ? U : T;
type ArrayValue<T> = T extends readonly (infer U)[] ? U : T;
type ComparableValue = string | number | bigint | Date;

type WithDefaultId<T> = T extends object ? T & { _id?: unknown } : { _id?: unknown };
export type PublicOutput<T> = T extends object ? T & Record<string, unknown> : Record<string, unknown>;
export type ModelDocument<TModel = unknown> = mongoose.Document & TModel;

type TrimLeft<S extends string> = S extends ` ${infer Rest}` ? TrimLeft<Rest> : S;
type TrimRight<S extends string> = S extends `${infer Rest} ` ? TrimRight<Rest> : S;
type Trim<S extends string> = TrimLeft<TrimRight<S>>;
type SplitProjectionString<S extends string> = S extends `${infer Head} ${infer Tail}`
  ? SplitProjectionString<Head> | SplitProjectionString<Tail>
  : Trim<S>;
type ProjectionTokens<TProjection> = TProjection extends readonly string[]
  ? TProjection[number]
  : TProjection extends string
    ? SplitProjectionString<TProjection>
    : TProjection extends KeyValueProjection
      ? {
          [K in Extract<keyof TProjection, string>]: TProjection[K] extends 1 ? K : never;
        }[Extract<keyof TProjection, string>]
      : never;
type PositiveProjectionPaths<TProjection> =
  ProjectionTokens<TProjection> extends infer TToken
    ? TToken extends string
      ? TToken extends ''
        ? never
        : TToken extends `-${string}`
          ? never
          : TToken
      : never
    : never;
type UnionToIntersection<T> = (T extends unknown ? (value: T) => void : never) extends (value: infer I) => void
  ? I
  : never;
type Simplify<T> = { [K in keyof T]: T[K] } & {};
type DeepPickSingle<T, TPath extends string> = TPath extends `${infer Head}.${infer Tail}`
  ? Head extends keyof WithDefaultId<T>
    ? Head extends string
      ? {
          [K in Head]: WithDefaultId<T>[K] extends readonly (infer U)[]
            ? Array<Simplify<DeepPickSingle<U, Tail>>>
            : WithDefaultId<T>[K] extends object
              ? Simplify<DeepPickSingle<WithDefaultId<T>[K], Tail>>
              : WithDefaultId<T>[K];
        }
      : {}
    : {}
  : TPath extends keyof WithDefaultId<T>
    ? Pick<WithDefaultId<T>, TPath>
    : {};
type DeepPick<T, TPaths extends string> = Simplify<UnionToIntersection<DeepPickSingle<T, TPaths>>>;
export type SelectedPublicOutput<T, TProjection> =
  string extends PositiveProjectionPaths<TProjection>
    ? PublicOutput<T>
    : [PositiveProjectionPaths<TProjection>] extends [never]
      ? PublicOutput<T>
      : DeepPick<T, Extract<PositiveProjectionPaths<TProjection>, string>>;
type PopulateInput = Populate | string;
type PopulateInputs<TPopulate> = TPopulate extends readonly (infer U)[] ? U : TPopulate;
type PopulatePath<TPopulateEntry> = TPopulateEntry extends string
  ? TPopulateEntry
  : TPopulateEntry extends { path: infer TPath extends string }
    ? TPath
    : never;
type PopulateSelect<TPopulateEntry> = TPopulateEntry extends { select?: infer TSelect } ? TSelect : undefined;
type PopulateLeafValue<TValue, TPopulateEntry> = TValue extends readonly (infer U)[]
  ? Array<SelectedPublicOutput<U, PopulateSelect<TPopulateEntry>>>
  : SelectedPublicOutput<TValue, PopulateSelect<TPopulateEntry>>;
type PopulateEntryShape<T, TPath extends string, TValue> = TPath extends `${infer Head}.${infer Tail}`
  ? Head extends keyof WithDefaultId<T>
    ? Head extends string
      ? {
          [K in Head]: WithDefaultId<T>[K] extends readonly (infer U)[]
            ? Array<Simplify<PopulateEntryShape<U, Tail, TValue>>>
            : Simplify<PopulateEntryShape<WithDefaultId<T>[K], Tail, TValue>>;
        }
      : {}
    : {}
  : TPath extends keyof WithDefaultId<T>
    ? Pick<{ [K in TPath]: TValue }, TPath>
    : {};
type PopulateOutputShape<T, TPopulateEntry> =
  PopulatePath<TPopulateEntry> extends infer TPath extends string
    ? PopulateEntryShape<T, TPath, PopulateLeafValue<PathValue<WithDefaultId<T>, TPath>, TPopulateEntry>>
    : {};
type PopulateOutput<T, TPopulate> =
  string extends PopulatePath<PopulateInputs<TPopulate>>
    ? {}
    : [PopulatePath<PopulateInputs<TPopulate>>] extends [never]
      ? {}
      : Simplify<UnionToIntersection<PopulateOutputShape<T, Extract<PopulateInputs<TPopulate>, PopulateInput>>>>;
export type SelectedPopulatedPublicOutput<T, TProjection, TPopulate> = Simplify<
  SelectedPublicOutput<T, TProjection> & PopulateOutput<T, TPopulate>
>;

export type DeepFieldPath<T, Depth extends number = 4> = [Depth] extends [never]
  ? never
  : Descend<T> extends NonTraversable
    ? never
    : {
        [K in Extract<keyof Descend<T>, string>]:
          | K
          | (Descend<T>[K] extends NonTraversable
              ? never
              : Descend<T>[K] extends readonly (infer U)[]
                ? U extends NonTraversable
                  ? never
                  : `${K}.${DeepFieldPath<U, PrevDepth[Depth]>}`
                : Descend<T>[K] extends object
                  ? `${K}.${DeepFieldPath<Descend<T>[K], PrevDepth[Depth]>}`
                  : never);
      }[Extract<keyof Descend<T>, string>];

export type PathValue<T, TPath extends string> = TPath extends `${infer Head}.${infer Tail}`
  ? Head extends Extract<keyof Descend<T>, string>
    ? PathValue<Descend<Descend<T>[Head]>, Tail>
    : unknown
  : TPath extends Extract<keyof Descend<T>, string>
    ? Descend<T>[TPath]
    : unknown;

type FieldFilterOperators<T> = {
  $eq?: T;
  $ne?: T;
  $in?: Array<ArrayValue<T>>;
  $nin?: Array<ArrayValue<T>>;
  $exists?: boolean;
  $gt?: ArrayValue<T> extends ComparableValue ? ArrayValue<T> : never;
  $gte?: ArrayValue<T> extends ComparableValue ? ArrayValue<T> : never;
  $lt?: ArrayValue<T> extends ComparableValue ? ArrayValue<T> : never;
  $lte?: ArrayValue<T> extends ComparableValue ? ArrayValue<T> : never;
  $regex?: ArrayValue<T> extends string ? string | RegExp : never;
  $all?: T extends readonly unknown[] ? Array<ArrayValue<T>> : never;
  $size?: T extends readonly unknown[] ? number : never;
  $elemMatch?: ArrayValue<T> extends object ? TypedFilter<ArrayValue<T>> : never;
  $$sq?: unknown;
  $$date?: unknown;
  [key: `$${string}`]: unknown;
};

type FieldFilterValue<T> = T | FieldFilterOperators<NonNullable<T>>;
type LooseFilter = false | Record<string, unknown>;

type TypedFilterObject<T> = {
  [K in DeepFieldPath<T>]?: FieldFilterValue<PathValue<T, K>>;
} & {
  _id?: FieldFilterValue<unknown>;
  $and?: TypedFilter<T>[];
  $or?: TypedFilter<T>[];
  $nor?: TypedFilter<T>[];
  [key: `$${string}`]: unknown;
};

export type TypedFilter<T> = false | TypedFilterObject<WithDefaultId<T>>;
export type Filter<T = unknown> = IsUnknown<T> extends true ? LooseFilter : TypedFilter<T>;

export interface Include {
  model: string;
  op: 'list' | 'read' | 'count';
  path: string;
  filter?: Filter;
  localField: string;
  foreignField: string;
  args?: unknown;
  options?: unknown;
}

export type FindAccess = 'list' | 'read';
export type PopulateAccess = 'list' | 'read';

export interface Populate {
  path: string;
  select?: Projection;
  match?: unknown;
  access?: PopulateAccess;
}

export interface SubPopulate {
  path: string;
  select?: Projection;
}

interface KeyValue {
  [key: string]: unknown;
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
  changes?: Diff<unknown>[];
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
