import { AxiosRequestConfig } from 'axios';
import type { Model, ModelData } from './model';
import { ModelService, DataService } from './services';
import { SubQueryOptions } from './interface';
import { _FilterQuery } from './mongoose/types';

export type KeyValueProjection<TKey extends string = string> = Partial<Record<TKey, 1 | -1>>;

export type Projection = readonly string[] | string | KeyValueProjection;

type SelectableKey<T> = Extract<keyof T, string>;

type IsTuple<T extends readonly unknown[]> = number extends T['length'] ? false : true;

type SelectedKeysFromProjectionArray<T, TSelect> = TSelect extends readonly (infer K)[]
  ? IsTuple<TSelect> extends true
    ? Extract<K, SelectableKey<T>>
    : never
  : never;

type SelectedKeysFromProjectionString<T, TSelect> = TSelect extends string
  ? string extends TSelect
    ? never
    : Extract<TSelect, SelectableKey<T>>
  : never;

type SelectedKeysFromProjectionObject<T, TSelect> = TSelect extends KeyValueProjection
  ? string extends keyof TSelect
    ? never
    : {
        [K in keyof TSelect]-?: TSelect[K] extends 1 ? Extract<K, SelectableKey<T>> : never;
      }[keyof TSelect]
  : never;

export type SelectedKeys<T, TSelect> =
  | SelectedKeysFromProjectionArray<T, TSelect>
  | SelectedKeysFromProjectionString<T, TSelect>
  | SelectedKeysFromProjectionObject<T, TSelect>;

export type SelectedShape<T, TSelect> = [SelectedKeys<T, TSelect>] extends [never]
  ? Partial<T>
  : Pick<T, SelectedKeys<T, TSelect>> & Partial<T>;

export type ResolvedSelectedShape<T, TSelect, TExplicit> = [TExplicit] extends [never]
  ? SelectedShape<T, TSelect>
  : TExplicit;

export type SortOrder = -1 | 1 | 'asc' | 'ascending' | 'desc' | 'descending';

export type Sort = string | { [key: string]: SortOrder } | [string, SortOrder][] | undefined | null;

export type FilterQuery<T> = _FilterQuery<T>;

// ARC-20: the typed-filter escape hatches live in `./mongoose/types`
// alongside their `_FilterQuery<T>` building block, but the package's
// public type surface (locked by `access-router-client.exports.unit.test.ts`
// and documented in `typescript-and-errors.mdx` + `llms.txt`) treats them
// as named root exports. Re-exporting them here is what makes the published
// `.d.ts` actually deliver the names that the docs, the export-allowlist
// test, and the `filter-query-types` unit test already assume are
// reachable from the package root. Without this re-export, an installed
// consumer importing `DottedPathFilter`/`ServerSideCast` from
// `@web-ts-toolkit/access-router-client` fails to compile.
export type { DottedPathFilter, ServerSideCast } from './mongoose/types';
// ACI-04: the correlated filter surface lives in `./mongoose/types`
// alongside `_FilterQuery<T>`; re-export it from the package root for the
// same reachability reason (consumers spell it at the seven service-method
// call sites and in basic `$include(path, { filter })` options).
import type { CorrelatedFilterQuery, CorrelatedQuerySelector, EscapeLiteral } from './mongoose/types';
export type { CorrelatedFilterQuery, CorrelatedQuerySelector, EscapeLiteral };

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

// ---------------------------------------------------------------------------
// ACI-04: correlated includes.
// ---------------------------------------------------------------------------

/**
 * Explicit parent-field reference created by `parentField(path)` (ACI-01
 * D2.1). Recognition is structural and value-position-only: a plain object
 * whose own enumerable keys are exactly `['$parent']` with a non-empty
 * string value. Magic `$field` strings are never markers — `'$special'` or
 * `'$parent'` in a field-value position keeps its existing literal query
 * meaning.
 *
 * The object returned by `parentField()` is frozen. References resolve
 * against the immediate parent document on the outer server (ACI-01 D3.4).
 */
export interface ParentRef {
  readonly $parent: string;
}

/** Wire operation carried by a correlated include (fixed by the originating method). */
export type CorrelatedIncludeOp = 'list' | 'read' | 'count';

/**
 * Allowlisted inner-query args for a correlated include (ACI-01 D9.1):
 * identifier/filter reads forward `{ select, sort, include }`, lists
 * additionally forward per-parent pagination `{ skip, limit, page, pageSize }`,
 * basic `read`/`count` carry no args. Everything else (notably `populate`
 * and `tasks`) is dropped or rejected at `$include()` conversion time.
 */
export interface CorrelatedIncludeArgs {
  readonly select?: unknown;
  readonly sort?: unknown;
  readonly include?: CorrelatedIncludeInput | CorrelatedIncludeInput[];
  readonly skip?: unknown;
  readonly limit?: unknown;
  readonly page?: unknown;
  readonly pageSize?: unknown;
}

/**
 * Serialized correlated include (ACI-01 D1): the discriminated
 * `mode: 'correlated'` variant of the wire `Include` union. Produced purely
 * by `$include()` — synchronously, with zero HTTP calls — from a frozen
 * per-call snapshot, so repeated conversion yields independently owned
 * payloads and never shares mutable state.
 *
 * `Path` is the explicit output path; `Out` is the caller-supplied result
 * generic (default `unknown`, carried type-only via `__correlatedOutput` and
 * never serialized). Inner values are plain: read outputs are `Out | null`,
 * list outputs are `Out[]`, count outputs are `number` (see
 * `WithCorrelatedOutputs`). Nothing is inferred from partial projections, no
 * guaranteed read match is promised, and values are never `Model`-wrapped.
 */
export interface CorrelatedInclude<
  Path extends string = string,
  Out = unknown,
  Op extends CorrelatedIncludeOp = CorrelatedIncludeOp,
> {
  readonly mode: 'correlated';
  readonly model: string;
  readonly op: Op;
  readonly path: Path;
  readonly id?: string | ParentRef;
  readonly filter?: unknown;
  readonly args?: CorrelatedIncludeArgs;
  /** Type-only carrier for the `$include(path)` result generic; never set at runtime. */
  readonly __correlatedOutput?: Out;
}

/** Anything an outer `include` array may carry: legacy joins or correlated payloads. */
export type CorrelatedIncludeInput = Include | CorrelatedInclude<string, unknown, CorrelatedIncludeOp>;

/** Supplemental filter option for basic `list()` / `count()` `$include()` (ACI-01 D9.3). */
export interface SupplementalIncludeOptions<T> {
  filter: CorrelatedFilterQuery<T>;
}

type CorrelatedOutputOf<Entry> =
  Entry extends CorrelatedInclude<infer Path, infer Out, infer Op>
    ? string extends Path
      ? Record<never, never>
      : Op extends 'read'
        ? { [K in Path]: Out | null }
        : Op extends 'list'
          ? { [K in Path]: Out[] }
          : Op extends 'count'
            ? { [K in Path]: number }
            : Record<never, never>
    : Record<never, never>;

type UnionToIntersection<U> = (U extends unknown ? (arg: U) => void : never) extends (arg: infer I) => void ? I : never;

type FlattenIncludeInput<TInc> = TInc extends readonly (infer Entry)[] ? Entry : TInc;

type CorrelatedOutputs<TInc> = UnionToIntersection<CorrelatedOutputOf<FlattenIncludeInput<TInc>>>;

/**
 * Merges `$include(path)` output paths into an outer response shape
 * (ACI-01 D10). Legacy `Include` entries and wide (non-literal) paths
 * contribute nothing, so outer types without correlated payloads are exactly
 * their previous shape. Correlated entries contribute their explicit output
 * path with the caller-supplied generic: reads admit `null` (no guaranteed
 * match), lists are arrays, counts are numbers; values stay plain.
 *
 * Generic order is path-first (`$include<'org', Org>('org')`): TypeScript
 * has no partial type-argument inference, so a result-generic-first order
 * would widen the output path to `string` whenever the generic is supplied
 * explicitly. Path-first keeps the literal in both the untyped
 * (`$include('org')`) and explicitly typed forms; a lone result generic in
 * first position (e.g. `$include<Org>`) is rejected by the `string`
 * constraint instead of silently dropping the merge.
 */
export type WithCorrelatedOutputs<TBase, TInc> = [keyof CorrelatedOutputs<TInc>] extends [never]
  ? TBase
  : TBase & CorrelatedOutputs<TInc>;

/** `$include(path)` mixin for executable or descriptor read-shaped queries. */
export interface IncludableRead {
  $include<const TPath extends string = string, TOut = unknown>(path: TPath): CorrelatedInclude<TPath, TOut, 'read'>;
}

/** `$include(path)` mixin for executable or descriptor list-shaped queries. */
export interface IncludableList {
  $include<const TPath extends string = string, TOut = unknown>(path: TPath): CorrelatedInclude<TPath, TOut, 'list'>;
}

/** `$include(path)` mixin for executable or descriptor count-shaped queries. */
export interface IncludableCount {
  $include<const TPath extends string = string, TOut = unknown>(path: TPath): CorrelatedInclude<TPath, TOut, 'count'>;
}

/**
 * `$include(path, { filter })` mixin for basic `list()` executables. The
 * supplemental filter is the inner filter (basic methods have no filter of
 * their own, so the sources cannot conflict by construction — ACI-01 D9.3).
 */
export interface IncludableBasicList<T> {
  $include<const TPath extends string = string, TOut = unknown>(
    path: TPath,
    options: SupplementalIncludeOptions<T>,
  ): CorrelatedInclude<TPath, TOut, 'list'>;
}

/** `$include(path, { filter })` mixin for basic `count()` executables. */
export interface IncludableBasicCount<T> {
  $include<const TPath extends string = string, TOut = unknown>(
    path: TPath,
    options: SupplementalIncludeOptions<T>,
  ): CorrelatedInclude<TPath, TOut, 'count'>;
}

/**
 * Frozen, non-thenable reference-bearing descriptor returned by the seven
 * correlated-capable methods when their reference positions (`id` / `filter`)
 * contain live `ParentRef` markers (ACI-01 D8.1). It carries no executor, so
 * zero HTTP is possible from it; `await` yields the descriptor unchanged
 * (a programming error, documented rather than guarded — JavaScript
 * `await` on non-thenables cannot be intercepted).
 *
 * Convert with `$include(path)` into a detached wire payload and embed it in
 * an outer request's `include` array. The descriptor holds a frozen snapshot
 * captured at call time: conversion is synchronous, pure, and repeatable.
 */
export interface CorrelatedReadDescriptor {
  $include<const TPath extends string = string, TOut = unknown>(path: TPath): CorrelatedInclude<TPath, TOut, 'read'>;
}

/** List-shaped variant of {@link CorrelatedReadDescriptor}. */
export interface CorrelatedListDescriptor {
  $include<const TPath extends string = string, TOut = unknown>(path: TPath): CorrelatedInclude<TPath, TOut, 'list'>;
}

/** Count-shaped variant of {@link CorrelatedReadDescriptor}. */
export interface CorrelatedCountDescriptor {
  $include<const TPath extends string = string, TOut = unknown>(path: TPath): CorrelatedInclude<TPath, TOut, 'count'>;
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

/**
 * Default request payload type for model mutations.
 *
 * The sibling access-router runtime accepts generic records and does not know
 * a consumer application's required create/update schema. The client therefore
 * defaults mutation inputs to `Partial<T>` so known fields are checked without
 * claiming compile-time requiredness. Consumers with distinct request schemas
 * can pass explicit `ModelService<T, TCreateInput, TUpdateInput, TUpsertInput>`
 * or `createModelService<T, ...>(...)` generics.
 */
export type ModelMutationInput<T extends Document> = Partial<T>;

/** Default request payload type for subdocument create/update helpers. */
export type SubDocumentMutationInput<T> = T extends object ? Partial<T> : T;

/**
 * Successful response. `raw` and `data` are non-null and `success` is
 * narrowed to `true` so `if (result.success)` exposes the documented
 * payload shape. `message` is initialized for symmetry with failures but
 * may be the empty string when the server omits a message on success.
 */
export interface SuccessResult<T1, T2 = T1> {
  success: true;
  raw: T1;
  data: T2;
  message: string;
  status: number;
  headers: Record<string, string>;
}

/**
 * Failure response. `raw` carries the server error payload (or `null`
 * when no response body was received, e.g. a network error). `data` is
 * always `null` on failure. `message` is populated from the structured
 * problem payload when possible; `status` is the failing HTTP status
 * (or `0` when no response was received).
 */
export interface FailureResult<TError = unknown> {
  success: false;
  raw: TError | null;
  data: null;
  message: string;
  status: number;
  headers: Record<string, string>;
}

/**
 * Discriminated response union. Branch on `result.success` to narrow
 * `raw`/`data` to their successful shapes or to the documented error
 * payload.
 *
 * `T1` is the successful `raw` payload type; `T2` is the successful `data`
 * payload type (after client wrapping, e.g. `Model<T>`). `TError` is the
 * optional server error payload type and defaults to `unknown`. On failure,
 * `data` is `null` and `raw` is `TError | null`, never the success payload
 * type unless a caller explicitly chooses that error type.
 */
export type Response<T1, T2 = T1, TError = unknown> = SuccessResult<T1, T2> | FailureResult<TError>;

export type ModelResponse<T extends Document, TData extends Partial<T> = T> = Response<
  TData,
  Model<T, TData> & ModelData<T, TData>
>;
export type ArrayModelResponse<T extends Document, TData extends Partial<T> = T> = Response<
  TData[],
  (Model<T, TData> & ModelData<T, TData>)[]
>;
/**
 * `ListModelResponse` always carries `totalCount` on both branches. The field
 * defaults to `0` at runtime on failure or when the server did not emit count
 * metadata (`includeCount: false`), so callers that read it without narrowing
 * see a deterministic number rather than `undefined`.
 */
export type ListModelResponse<T extends Document, TData extends Partial<T> = T> = ArrayModelResponse<T, TData> & {
  totalCount: number;
};

/**
 * Subdocument responses deliberately do NOT wrap `data` in `Model<S>`.
 * Returning a save-capable `Model<S>` here was unsafe because `Model.save()`
 * would target the parent route with the subdocument `_id` instead of
 * `/:parentId/:sub/:subId`. Subdocument callers that need persistence must
 * call `subService.update(subId, data)` (or `create`/`bulkUpdate`) explicitly
 * with the parent-scoped helper returned by `id(parentId).subs(field)`.
 *
 * `SubDocumentResponse` is the single-document shape; `data` is the plain
 * subdocument payload or `null` on failure.
 */
export type SubDocumentResponse<S, TData extends Partial<S> = S> = Response<TData, TData>;

/**
 * Subdocument list/array responses. `data` is the plain array of subdocument
 * payloads (no `Model` wrapping) and `raw` is the server's original array
 * payload. `count` mirrors the server's `count` field (the length of the
 * returned array); the sibling server never emits a `totalCount` here.
 */
export type SubDocumentListResponse<S, TData extends Partial<S> = S> = Response<TData[], TData[]> & {
  count: number;
};

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
  /**
   * Carries the model name when this entry is consumed as a sub-query
   * source: the sibling server reads `model` from a `$$sq` payload to
   * resolve the target model service. Top-level root entries omit `model`
   * (the sibling `RootQueryEntry` schema uses `name`); the server schema
   * permits extra fields via `.passthrough()`, so a stray `model` is
   * harmless there.
   */
  model?: string;
  op: RootModelOperation;
  id?: string;
  sub?: string;
  subId?: string;
  field?: string;
  filter?: unknown;
  data?: unknown;
  args?: Record<string, unknown>;
  options?: Record<string, unknown>;
  order?: number;
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
  order?: number;
}

export type RootQueryMeta = RootModelQueryMeta | RootDataQueryMeta;

export interface ModelPromiseMeta {
  __op: string;
  __throwOnError?: boolean;
  __query: RootModelQueryMeta;
  __requestConfig?: AxiosRequestConfig;
  __service?: ModelService<Document>;
}

export interface LazyRequest<T> extends Promise<T> {
  exec(): Promise<T>;
}

export type ModelRequest<T> = ModelPromiseMeta & LazyRequest<T>;

export type DataResponse<T> = Response<T, T>;
export type ArrayDataResponse<T> = Response<T[], T[]>;
export type ListDataResponse<T> = ArrayDataResponse<T> & { totalCount: number };

export interface DataPromiseMeta {
  __op: string;
  __throwOnError?: boolean;
  __query: RootDataQueryMeta;
  __requestConfig?: AxiosRequestConfig;
  __service?: DataService<unknown>;
}

export type DataRequest<T> = DataPromiseMeta & LazyRequest<T>;

export { wrapLazyPromise } from './lazy-promise';

export type ResponseCallback = (res: unknown) => void;

export interface WrapOptions {
  queryParams?: Record<string, unknown>;
  pathParams?: Record<string, string | number>;
}
