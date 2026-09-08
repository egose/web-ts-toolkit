import type {
  Document,
  Model,
  ModelMutationInput,
  ServiceError,
  FilterQuery,
  Projection,
  ResolvedSelectedShape,
  ListArgs,
  ListAdvancedArgs,
  ListOptions,
  ListAdvancedOptions,
  ReadAdvancedArgs,
  ReadOptions,
  ReadAdvancedOptions,
  CreateAdvancedArgs,
  CreateOptions,
  CreateAdvancedOptions,
  UpdateAdvancedArgs,
  UpdateOptions,
  UpdateAdvancedOptions,
  UpsertAdvancedArgs,
  UpsertOptions,
  UpsertAdvancedOptions,
  Response,
  ModelResponse,
  ListModelResponse,
} from '@web-ts-toolkit/access-router-client';

export interface RequestConfig {
  signal?: AbortSignal;
  headers?: Record<string, string>;
  [key: string]: unknown;
}

/**
 * Optional per-call overrides for imperative `query()` invocations
 * (Task ARR-H01). The `signal` field is composed with the hook-owned
 * controller signal and the current hook-options `requestConfig.signal`.
 * Aborting any source cancels the effective request.
 */
export interface QueryCallOptions {
  signal?: AbortSignal;
}

// ── Projection-aware result shapes (Task ARR-09, tightened by ARR-B03) ──

/**
 * True exactly when the consumer did NOT supply a projection — i.e.
 * `TSelect` is still the broad `Projection` default sentinel
 * (`UseReadQueryOptions<T>` with no `select`). Because `TSelect` is
 * constrained to `extends Projection`, `[Projection] extends [TSelect]`
 * holds only for `TSelect = Projection` itself: every narrower
 * supplied selection (a literal tuple/string/object, a broad `string`
 * or `string[]` variable, an exclusion-only object, or a union of
 * alternatives) fails the check and takes the conservative path below.
 * This distinguishes "selection really absent" (safe full-model
 * inference) from "selection supplied but indeterminable" (must NOT
 * fall back to the full model).
 */
type IsAbsentProjection<TSelect extends Projection> = [Projection] extends [TSelect] ? true : false;

/**
 * Conservative narrowed element shape for ONE supplied (non-absent)
 * selection branch. Reuses the client's
 * `ResolvedSelectedShape<T, S, never>` (= `SelectedShape<T, S>` =
 * `Pick<T, SelectedKeys<T, S>> & Partial<T>`): every determinable
 * selected key stays definitely-present, every other model key is
 * `T[key] | undefined`. When the supplied selection is indeterminable
 * — broad `string` / `string[]`, exclusion-only `{ status: -1 }`, or
 * any other shape for which `SelectedKeys<T, S>` is `never` — the
 * resolved shape is `Partial<T>`, so ALL fields become optional rather
 * than falling back to the full required model. No casts and no
 * blanket full-model fallback are used on this path.
 */
type NarrowedDataShape<T extends Document, S extends Projection> = Model<T, ResolvedSelectedShape<T, S, never>> &
  ResolvedSelectedShape<T, S, never>;

/**
 * Narrowed success-wrapper data shape returned by the projection-aware
 * React hooks (Task ARR-09, conservative-union semantics by ARR-B03).
 * When no projection was supplied (`TSelect` is the broad `Projection`
 * default) the full model shape `Model<T> & T` is preserved so
 * ergonomic read/list defaults (no `select` or `advanced === false`)
 * keep full-model typing. When a selection WAS supplied, the shape
 * distributes over a union `TSelect` (`S extends unknown ? ...`) so
 * each alternative keeps its own required/optional contract instead of
 * merging keys into one overly-required shape: a consumer selecting
 * `readonly ['name'] | readonly ['status']` sees
 * `Shape<['name']> | Shape<['status']>`, and required access to either
 * field alone fails to compile. Supplied-but-indeterminable selections
 * (broad `string`, `string[]`, exclusion-only objects) resolve to
 * `Model<T, Partial<T>> & Partial<T>` — every field optional.
 *
 * A consumer that selects only `['name']` will see `data.status` typed
 * as `string | undefined` (so `data.status.toUpperCase()` requires a
 * guard or non-null assertion), eliminating the historical "consumer
 * accesses a server-omitted field as definitely present" defect.
 *
 * The shape is shared by query-hook `data`, mutation-hook `data`,
 * `onSuccess(result)`/`onSettled(result, …)` callbacks, manual
 * `query()`/`refetch()` response payloads, and mutation `mutate()`
 * return promises so projection narrowing threads uniformly across
 * every result surface — the package no longer erases the projection
 * generic and casts through `unknown` to a full `T`.
 *
 * `TSelect` defaults to the broad `Projection` sentinel so a consumer
 * that calls `useRead({ id: '1' })` (no `select` — the default) keeps
 * the historical full-model shape. A consumer that supplies a
 * projection supplies a `TSelect` (TypeScript infers it from the
 * `select?: TSelect` field on the hook options) and the narrow
 * shape is computed automatically.
 *
 * Note: this is a *static* narrowing — the runtime promise is whatever
 * the server returns. When `advanced === false`, `select` is NOT
 * forwarded to the server (the basic `read`/`list`/`create`/etc. do
 * not accept a `select` argument) so the server returns a full model
 * and the client response is a full `T`. The type still has the
 * provided `TSelect` (if any) applied; supplying a `select`
 * without `advanced: true` produces a tighter type than the wire
 * payload really justifies. The package treats this as a documented
 * consumer contract — narrow types only when the consumer opted into
 * a projection and accepts responsibility for forwarding it
 * down a path that honors it (the `advanced` paths).
 *
 * Declaration tightening (ARR-B03): dynamic, exclusion-only, and union
 * selections no longer resolve to the full required model. Consumers
 * relying on the old fallback must narrow with guards or supply a
 * literal projection.
 */
export type ProjectedShape<T extends Document, TSelect extends Projection> =
  IsAbsentProjection<TSelect> extends true
    ? Model<T> & T
    : [TSelect] extends [never]
      ? NarrowedDataShape<T, TSelect>
      : TSelect extends unknown
        ? NarrowedDataShape<T, TSelect>
        : never;

/**
 * Array variant of {@link ProjectedShape} used by `useList` — the
 * projection-narrowed single-element shape lifts to an array of the
 * same wrapped shape, matching the client's `ArrayModelResponse` /
 * `ListModelResponse` data payload type. Absent selection keeps
 * `(Model<T> & T)[]`; supplied selections (including unions, which
 * distribute to a union of arrays) use the same conservative
 * per-branch element shape as {@link ProjectedShape}.
 */
export type ProjectedShapeArray<T extends Document, TSelect extends Projection> =
  IsAbsentProjection<TSelect> extends true
    ? (Model<T> & T)[]
    : [TSelect] extends [never]
      ? NarrowedDataShape<T, TSelect>[]
      : TSelect extends unknown
        ? NarrowedDataShape<T, TSelect>[]
        : never;

/**
 * Response alias that picks the client's `ModelResponse<T, S>` (single
 * model) when the consumer supplied a `select`, otherwise
 * `ModelResponse<T>` (full-T) for the ergonomically default case. Used
 * by read/create/update/upsert React hooks' `query()`/`refetch()`/
 * `mutate()` return promises and `onSuccess`/`onSettled` callbacks.
 * Supplied selections distribute over unions and fall back to
 * `ModelResponse<T, Partial<T>>` (all fields optional) when the fields
 * cannot be determined — never to the full required model.
 */
export type ProjectedModelResponse<T extends Document, TSelect extends Projection> =
  IsAbsentProjection<TSelect> extends true
    ? ModelResponse<T>
    : [TSelect] extends [never]
      ? ModelResponse<T, ResolvedSelectedShape<T, TSelect, never>>
      : TSelect extends unknown
        ? ModelResponse<T, ResolvedSelectedShape<T, TSelect, never>>
        : never;

/**
 * Response alias for `useList` — full-T `ListModelResponse<T>` when no
 * projection was supplied, or the narrowed `ListModelResponse<T, S>`
 * otherwise. Threads the projection generic through `query()`/
 * `refetch()` and the `onSuccess`/`onSettled` callbacks so a consumer
 * selecting `['name'] as const` sees the same narrowed element shape
 * on the callback result type as on `data`. Union selections
 * distribute to a union of list responses; indeterminable selections
 * resolve to `ListModelResponse<T, Partial<T>>`.
 */
export type ProjectedListModelResponse<T extends Document, TSelect extends Projection> =
  IsAbsentProjection<TSelect> extends true
    ? ListModelResponse<T>
    : [TSelect] extends [never]
      ? ListModelResponse<T, ResolvedSelectedShape<T, TSelect, never>>
      : TSelect extends unknown
        ? ListModelResponse<T, ResolvedSelectedShape<T, TSelect, never>>
        : never;

// ── Shared ──

export interface UseBaseOptions {
  requestConfig?: RequestConfig;
}

type SingleMutationInput<TInput extends object> = TInput extends readonly unknown[] ? never : TInput;

// ── Read ──

export interface UseReadQueryOptions<
  T extends Document,
  TSelect extends Projection = Projection,
> extends UseBaseOptions {
  id?: string;
  advanced?: boolean;
  /**
   * Server-side field projection (Task ARR-09). Supply a *literal*
   * tuple (`['name', 'status'] as const`), a literal string
   * (`'name'`), or a `{ name: 1; age: -1 }` object to create a
   * type-level narrowing of {@link UseReadQueryResult.data},
   * callback result types, and the manual `query()`/`refetch()`
   * response payloads. A literal `select` narrows every
   * projection-aware result so omitted properties become
   * `T[keyof T] | undefined` rather than definitely-present; this is
   * the static reflection of the server actually dropping those
   * fields from the response when `advanced === true`. Requires
   * `advanced: true` for the projection to take effect at the request
   * layer (the basic `read` API does not forward `select`).
   */
  select?: TSelect;
  populate?: ReadAdvancedArgs['populate'];
  sort?: ReadAdvancedArgs['sort'];
  include?: ReadAdvancedArgs['include'];
  tasks?: ReadAdvancedArgs['tasks'];
  basicOptions?: ReadOptions;
  advancedOptions?: ReadAdvancedOptions;
  enabled?: boolean;
  initialData?: (Model<T> & T) | null;
  onSuccess?: (result: ProjectedModelResponse<T, TSelect>) => void;
  onError?: (error: ServiceError) => void;
  onSettled?: (result: ProjectedModelResponse<T, TSelect> | null, error: ServiceError | null) => void;
}

export interface UseReadQueryResult<T extends Document, TSelect extends Projection = Projection> {
  data: ProjectedShape<T, TSelect> | null;
  isLoading: boolean;
  isFetching: boolean;
  error: ServiceError | null;
  /**
   * Re-run the read for `id` via the unified query lifecycle. Accepts an
   * optional per-call {@link QueryCallOptions} whose `signal` is composed
   * with the hook-owned controller signal and the current hook-options
   * `requestConfig.signal` — aborting any source cancels the request.
   */
  query: (id: string, options?: QueryCallOptions) => Promise<ProjectedModelResponse<T, TSelect>>;
  refetch: () => Promise<ProjectedModelResponse<T, TSelect>>;
  reset: () => void;
}

// ── List ──

export interface UseListQueryOptions<
  T extends Document,
  TSelect extends Projection = Projection,
> extends UseBaseOptions {
  listParams?: ListArgs;
  filter?: FilterQuery<T>;
  advanced?: boolean;
  sort?: ListAdvancedArgs['sort'];
  /**
   * Server-side field projection (Task ARR-09). Supply a *literal*
   * tuple (`['name', 'status'] as const`), a literal string
   * (`'name'`), or a `{ name: 1 }` object to narrow the list element
   * shape on {@link UseListQueryResult.data}, the `onSuccess`/`onSettled`
   * callback result payloads, and the manual `query()`/`refetch()`
   * response payloads. Requires `advanced: true` for the basic
   * `list` API does not forward `select`.
   */
  select?: TSelect;
  populate?: ListAdvancedArgs['populate'];
  include?: ListAdvancedArgs['include'];
  tasks?: ListAdvancedArgs['tasks'];
  basicOptions?: ListOptions;
  advancedOptions?: ListAdvancedOptions;
  enabled?: boolean;
  keepPreviousData?: boolean;
  initialData?: (Model<T> & T)[];
  onSuccess?: (result: ProjectedListModelResponse<T, TSelect>) => void;
  onError?: (error: ServiceError) => void;
  onSettled?: (result: ProjectedListModelResponse<T, TSelect> | null, error: ServiceError | null) => void;
}

export interface UseListQueryResult<T extends Document, TSelect extends Projection = Projection> {
  data: ProjectedShapeArray<T, TSelect>;
  previousData: ProjectedShapeArray<T, TSelect> | undefined;
  totalCount: number;
  isLoading: boolean;
  isFetching: boolean;
  error: ServiceError | null;
  /**
   * Re-run the list for `args` (or the configured `listParams`) via the
   * unified query lifecycle. Accepts an optional per-call
   * {@link QueryCallOptions} whose `signal` is composed with the hook's
   * controller signal and the current hook-options `requestConfig.signal`
   * — aborting any source cancels the request.
   */
  query: (args?: ListArgs, options?: QueryCallOptions) => Promise<ProjectedListModelResponse<T, TSelect>>;
  refetch: () => Promise<ProjectedListModelResponse<T, TSelect>>;
  reset: () => void;
}

// ── Create ──

export interface UseCreateMutateOptions<
  T extends Document,
  TSelect extends Projection = Projection,
> extends UseBaseOptions {
  advanced?: boolean;
  /**
   * Server-side field projection (Task ARR-09). Supply a literal
   * tuple/string/object projection to narrow the create response
   * `data` shape on {@link UseCreateMutateResult.data}, the
   * `onSuccess`/`onSettled` callback result payloads, and the
   * `mutate()` return promise. Requires `advanced: true` for the
   * basic `create` API does not forward `select`.
   */
  select?: TSelect;
  populate?: CreateAdvancedArgs['populate'];
  tasks?: CreateAdvancedArgs['tasks'];
  basicOptions?: CreateOptions;
  advancedOptions?: CreateAdvancedOptions;
  onSuccess?: (result: ProjectedModelResponse<T, TSelect>) => void;
  onError?: (error: ServiceError) => void;
  onSettled?: (result: ProjectedModelResponse<T, TSelect> | null, error: ServiceError | null) => void;
}

export interface UseCreateMutateResult<
  T extends Document,
  TSelect extends Projection = Projection,
  TCreateInput extends object = ModelMutationInput<T>,
> {
  data: ProjectedShape<T, TSelect> | null;
  isPending: boolean;
  error: ServiceError | null;
  mutate: (data: SingleMutationInput<TCreateInput>) => Promise<ProjectedModelResponse<T, TSelect>>;
  reset: () => void;
}

// ── Update ──

export interface UseUpdateMutateOptions<
  T extends Document,
  TSelect extends Projection = Projection,
> extends UseBaseOptions {
  advanced?: boolean;
  /**
   * Server-side field projection (Task ARR-09). See
   * {@link UseCreateMutateOptions.select}.
   */
  select?: TSelect;
  populate?: UpdateAdvancedArgs['populate'];
  tasks?: UpdateAdvancedArgs['tasks'];
  basicOptions?: UpdateOptions;
  advancedOptions?: UpdateAdvancedOptions;
  onSuccess?: (result: ProjectedModelResponse<T, TSelect>) => void;
  onError?: (error: ServiceError) => void;
  onSettled?: (result: ProjectedModelResponse<T, TSelect> | null, error: ServiceError | null) => void;
}

export interface UseUpdateMutateResult<
  T extends Document,
  TSelect extends Projection = Projection,
  TUpdateInput extends object = ModelMutationInput<T>,
> {
  data: ProjectedShape<T, TSelect> | null;
  isPending: boolean;
  error: ServiceError | null;
  mutate: (id: string, data: TUpdateInput) => Promise<ProjectedModelResponse<T, TSelect>>;
  reset: () => void;
}

// ── Upsert ──

export interface UseUpsertMutateOptions<
  T extends Document,
  TSelect extends Projection = Projection,
> extends UseBaseOptions {
  advanced?: boolean;
  /**
   * Server-side field projection (Task ARR-09). See
   * {@link UseCreateMutateOptions.select}.
   */
  select?: TSelect;
  populate?: UpsertAdvancedArgs['populate'];
  tasks?: UpsertAdvancedArgs['tasks'];
  basicOptions?: UpsertOptions;
  advancedOptions?: UpsertAdvancedOptions;
  onSuccess?: (result: ProjectedModelResponse<T, TSelect>) => void;
  onError?: (error: ServiceError) => void;
  onSettled?: (result: ProjectedModelResponse<T, TSelect> | null, error: ServiceError | null) => void;
}

export interface UseUpsertMutateResult<
  T extends Document,
  TSelect extends Projection = Projection,
  TUpsertInput extends object = ModelMutationInput<T>,
> {
  data: ProjectedShape<T, TSelect> | null;
  isPending: boolean;
  error: ServiceError | null;
  mutate: (data: TUpsertInput) => Promise<ProjectedModelResponse<T, TSelect>>;
  reset: () => void;
}

// ── Delete ──

export interface UseDeleteMutateOptions extends UseBaseOptions {
  onSuccess?: (result: Response<string>) => void;
  onError?: (error: ServiceError) => void;
  onSettled?: (result: Response<string> | null, error: ServiceError | null) => void;
}

export interface UseDeleteMutateResult {
  isPending: boolean;
  error: ServiceError | null;
  mutate: (id: string) => Promise<Response<string>>;
  reset: () => void;
}

// ── Count ──

export interface UseCountQueryOptions<T extends Document> extends UseBaseOptions {
  advanced?: boolean;
  filter?: FilterQuery<T>;
  enabled?: boolean;
  onSuccess?: (result: Response<number>) => void;
  onError?: (error: ServiceError) => void;
  onSettled?: (result: Response<number> | null, error: ServiceError | null) => void;
}

export interface UseCountQueryResult {
  data: number | null;
  isLoading: boolean;
  isFetching: boolean;
  error: ServiceError | null;
  /**
   * Re-run the count via the unified query lifecycle. Accepts an optional
   * per-call {@link QueryCallOptions} whose `signal` is composed with the
   * hook's internal controller signal (Task ARR-05 req 4).
   */
  query: (options?: QueryCallOptions) => Promise<Response<number>>;
  refetch: () => Promise<Response<number>>;
  reset: () => void;
}

// ── Distinct ──

export interface UseDistinctQueryOptions<T extends Document> extends UseBaseOptions {
  field: string;
  conditions?: FilterQuery<T>;
  enabled?: boolean;
  onSuccess?: (result: Response<string[]>) => void;
  onError?: (error: ServiceError) => void;
  onSettled?: (result: Response<string[]> | null, error: ServiceError | null) => void;
}

export interface UseDistinctQueryResult {
  data: string[] | null;
  isLoading: boolean;
  isFetching: boolean;
  error: ServiceError | null;
  /**
   * Re-run the distinct query via the unified query lifecycle. Accepts an
   * optional per-call {@link QueryCallOptions} whose `signal` is composed
   * with the hook's internal controller signal (Task ARR-05 req 4).
   */
  query: (options?: QueryCallOptions) => Promise<Response<string[]>>;
  refetch: () => Promise<Response<string[]>>;
  reset: () => void;
}
