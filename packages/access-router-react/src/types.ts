import type {
  Document,
  Model,
  ServiceError,
  FilterQuery,
  Projection,
  ResolvedSelectedShape,
  SelectedKeys,
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
 * (Task ARR-05). The `signal` field is composed with the hook's internal
 * controller signal — aborting either source cancels the effective
 * request. Manual `query()` paths honor the caller signal even when the
 * hook's own internal controller is not strictly required for the
 * request (e.g. a one-shot manual read where the caller is the sole
 * cancellation source).
 */
export interface QueryCallOptions {
  signal?: AbortSignal;
}

// ── Projection-aware result shapes (Task ARR-09) ──

/**
 * Narrowed success-wrapper data shape returned by the projection-aware
 * React hooks (Task ARR-09). Reuses the client's exported
 * {@link SelectedKeys} utility (no divergent React approximation) to
 * decide whether the consumer supplied a *literal* projection
 * (`readonly ['name'] as const`, `'name'`, or `{ name: 1 }`). When no
 * literal projection was supplied — i.e. `TSelect` is the default
 * broad `Projection` sentinel, for which `SelectedKeys<T, TSelect>` is
 * `never` — the full model shape `Model<T> & T` is preserved so
 * ergonomic read/list defaults (no `select` or `advanced === false`)
 * keep full-model typing. When a literal `select` was supplied, the
 * shape collapses to `Model<T, ResolvedSelectedShape<T, TSelect, never>>`
 * intersected with the computed selected shape: every key the
 * consumer asked for stays definitely-present, every other model key
 * becomes `T[keyof T] | undefined` via the client's
 * `Pick<T, SelectedKeys<T, TSelect>> & Partial<T>` definition. A
 * consumer that selects only `['name']` will see `data.status` typed
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
 * the historical full-model shape. A consumer that supplies a literal
 * projection supplies a literal `TSelect` (TypeScript infers it from
 * the `select?: TSelect` field on the hook options) and the narrow
 * shape is computed automatically.
 *
 * Note: this is a *static* narrowing — the runtime promise is whatever
 * the server returns. When `advanced === false`, `select` is NOT
 * forwarded to the server (the basic `read`/`list`/`create`/etc. do
 * not accept a `select` argument) so the server returns a full model
 * and the client response is a full `T`. The type still has the
 * provided `TSelect` (if any) applied; supplying a literal `select`
 * without `advanced: true` produces a tighter type than the wire
 * payload really justifies. The package treats this as a documented
 * consumer contract — narrow types only when the consumer opted into
 * a literal projection and accepts responsibility for forwarding it
 * down a path that honors it (the `advanced` paths).
 */
export type ProjectedShape<T extends Document, TSelect extends Projection> = [SelectedKeys<T, TSelect>] extends [never]
  ? Model<T> & T
  : Model<T, ResolvedSelectedShape<T, TSelect, never>> & ResolvedSelectedShape<T, TSelect, never>;

/**
 * Array variant of {@link ProjectedShape} used by `useList` — the
 * projection-narrowed single-element shape lifts to an array of the
 * same wrapped shape, matching the client's `ArrayModelResponse` /
 * `ListModelResponse` data payload type.
 */
export type ProjectedShapeArray<T extends Document, TSelect extends Projection> = [SelectedKeys<T, TSelect>] extends [
  never,
]
  ? (Model<T> & T)[]
  : (Model<T, ResolvedSelectedShape<T, TSelect, never>> & ResolvedSelectedShape<T, TSelect, never>)[];

/**
 * Response alias that picks the client's `ModelResponse<T, S>` (single
 * model) when the consumer supplied a literal `select`, otherwise
 * `ModelResponse<T>` (full-T) for the ergonomically default case. Used
 * by read/create/update/upsert React hooks' `query()`/`refetch()`/
 * `mutate()` return promises and `onSuccess`/`onSettled` callbacks.
 */
export type ProjectedModelResponse<T extends Document, TSelect extends Projection> = [
  SelectedKeys<T, TSelect>,
] extends [never]
  ? ModelResponse<T>
  : ModelResponse<T, ResolvedSelectedShape<T, TSelect, never>>;

/**
 * Response alias for `useList` — full-T `ListModelResponse<T>` when no
 * projection was supplied, or the narrowed `ListModelResponse<T, S>`
 * otherwise. Threads the projection generic through `query()`/
 * `refetch()` and the `onSuccess`/`onSettled` callbacks so a consumer
 * selecting `['name'] as const` sees the same narrowed element shape
 * on the callback result type as on `data`.
 */
export type ProjectedListModelResponse<T extends Document, TSelect extends Projection> = [
  SelectedKeys<T, TSelect>,
] extends [never]
  ? ListModelResponse<T>
  : ListModelResponse<T, ResolvedSelectedShape<T, TSelect, never>>;

// ── Shared ──

export interface UseBaseOptions {
  requestConfig?: RequestConfig;
}

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
   * with the hook's internal controller signal — aborting either source
   * cancels the request (Task ARR-05 req 4). Per-call `query()` does NOT
   * reuse the caller's hook-options `requestConfig.signal`; tests that
   * need a caller signal on the manual path must pass it via the options
   * argument so the composition boundary is explicit.
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
   * internal controller signal — aborting either source cancels the
   * request (Task ARR-05 req 4).
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

export interface UseCreateMutateResult<T extends Document, TSelect extends Projection = Projection> {
  data: ProjectedShape<T, TSelect> | null;
  isPending: boolean;
  error: ServiceError | null;
  mutate: (data: object) => Promise<ProjectedModelResponse<T, TSelect>>;
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

export interface UseUpdateMutateResult<T extends Document, TSelect extends Projection = Projection> {
  data: ProjectedShape<T, TSelect> | null;
  isPending: boolean;
  error: ServiceError | null;
  mutate: (id: string, data: object) => Promise<ProjectedModelResponse<T, TSelect>>;
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

export interface UseUpsertMutateResult<T extends Document, TSelect extends Projection = Projection> {
  data: ProjectedShape<T, TSelect> | null;
  isPending: boolean;
  error: ServiceError | null;
  mutate: (data: object) => Promise<ProjectedModelResponse<T, TSelect>>;
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
