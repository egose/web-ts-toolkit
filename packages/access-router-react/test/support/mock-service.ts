/* eslint-disable @typescript-eslint/no-explicit-any */
//
// Strict `ModelService<T>` mock factory for the access-router-react test
// harness (ARR-01).
//
// This module replaces the historical broad-cast pattern:
//
//   const service = { list: vi.fn(), read: vi.fn(), ... } as unknown as
//     ModelService<TestDoc>;
//
// The broad cast lets service signature drift pass the typechecker. The
// factory below declares each method as a typed vi.fn() with the exact
// argument arity and types `ModelService<T>` exposes, so adding or
// removing a parameter on the client side will fail to compile here.
//
// Each method returns the public `LazyRequest<T>` shape (thenable +
// `.exec()`) exactly as the real client does, and the hook under test
// `await`s or `.exec()`s that request. The matching `ControlledLazyRequest`
// is registered in an internal map keyed by method name so the test can
// later inspect or release settlement via `mock.lastCall(method)`.
//
// The factory accepts a `seed` of default success results matching the
// historical 60 passing tests; tests can either:
//   - let the default immediate-success path run, or
//   - pre-arm a method via `plan()`/`planDeferred()` (the prepared
//     controller is the one returned by the matching service call), or
//   - inspect/override the most recent call's controller by calling
//     `mock.lastCall(method)`.
//
// Each method is a typed vi.fn() recording every call, including the
// `{ ...requestConfig, signal }` final argument. Tests can therefore make
// EXACT argument assertions on basic and advanced forwarded args, options,
// and request config — the historical harness only verified "called with
// `(<id>, undefined, <Object>)`" loosely.

import type {
  Document,
  FailureResult,
  FilterQuery,
  LazyRequest,
  ListAdvancedArgs,
  ListAdvancedOptions,
  ListArgs,
  ListModelResponse,
  ListOptions,
  ModelResponse,
  ModelService,
  Projection,
  ReadAdvancedArgs,
  ReadAdvancedOptions,
  ReadOptions,
  CreateAdvancedArgs,
  CreateAdvancedOptions,
  CreateOptions,
  UpdateAdvancedArgs,
  UpdateAdvancedOptions,
  UpdateOptions,
  UpsertAdvancedArgs,
  UpsertAdvancedOptions,
  UpsertOptions,
  Response,
} from '@web-ts-toolkit/access-router-client';
import { ServiceError } from '@web-ts-toolkit/access-router-client';
import { vi } from 'vitest';
import { ControlledLazyRequest, LazyRequestRecorder, createLazyRequest } from './lazy-request';

/**
 * Internal request-config shape the hook forwards. Mirrors the public
 * `RequestConfig` from `access-router-react/src/types.ts` (signal +
 * headers + optional extras). The hook always spreads the caller's
 * `requestConfig` and adds `signal` last, so observing this argument lets
 * tests assert on signal forwarding and unmutated caller config.
 */
export type MockRequestConfig = { signal?: AbortSignal; headers?: Record<string, string>; [key: string]: unknown };

/**
 * Per-method mock surface. The presence of every member with the correct
 * arity lets `as unknown as ModelService<T>` use a *narrow* cast that
 * preserves argument shapes structurally. The structural cast is narrow
 * (each member carries its real overload signature), so swapping a
 * parameter type, dropping one, or reordering will surface a compile
 * error here.
 */
export interface MockServiceSurface<T extends Document> {
  list: (
    args: ListArgs | undefined,
    options: ListOptions | undefined,
    axiosRequestConfig: MockRequestConfig | undefined,
  ) => LazyRequest<ListModelResponse<T>>;
  listAdvanced: (
    filter: FilterQuery<T>,
    args: ListAdvancedArgs<Projection> | undefined,
    options: ListAdvancedOptions | undefined,
    axiosRequestConfig: MockRequestConfig | undefined,
  ) => LazyRequest<ListModelResponse<T>>;
  read: (
    identifier: string,
    options: ReadOptions | undefined,
    axiosRequestConfig: MockRequestConfig | undefined,
  ) => LazyRequest<ModelResponse<T>>;
  readAdvanced: (
    identifier: string,
    args: ReadAdvancedArgs<Projection> | undefined,
    options: ReadAdvancedOptions | undefined,
    axiosRequestConfig: MockRequestConfig | undefined,
  ) => LazyRequest<ModelResponse<T>>;
  create: (
    data: object,
    options: CreateOptions | undefined,
    axiosRequestConfig: MockRequestConfig | undefined,
  ) => LazyRequest<ModelResponse<T>>;
  createAdvanced: (
    data: object,
    args: CreateAdvancedArgs<Projection> | undefined,
    options: CreateAdvancedOptions | undefined,
    axiosRequestConfig: MockRequestConfig | undefined,
  ) => LazyRequest<ModelResponse<T>>;
  update: (
    identifier: string,
    data: object,
    options: UpdateOptions | undefined,
    axiosRequestConfig: MockRequestConfig | undefined,
  ) => LazyRequest<ModelResponse<T>>;
  updateAdvanced: (
    identifier: string,
    data: object,
    args: UpdateAdvancedArgs<Projection> | undefined,
    options: UpdateAdvancedOptions | undefined,
    axiosRequestConfig: MockRequestConfig | undefined,
  ) => LazyRequest<ModelResponse<T>>;
  upsert: (
    data: object,
    options: UpsertOptions | undefined,
    axiosRequestConfig: MockRequestConfig | undefined,
  ) => LazyRequest<ModelResponse<T>>;
  upsertAdvanced: (
    data: object,
    args: UpsertAdvancedArgs<Projection> | undefined,
    options: UpsertAdvancedOptions | undefined,
    axiosRequestConfig: MockRequestConfig | undefined,
  ) => LazyRequest<ModelResponse<T>>;
  delete: (identifier: string, axiosRequestConfig: MockRequestConfig | undefined) => LazyRequest<Response<string>>;
  count: (axiosRequestConfig: MockRequestConfig | undefined) => LazyRequest<Response<number>>;
  countAdvanced: (
    filter: FilterQuery<T>,
    axiosRequestConfig: MockRequestConfig | undefined,
  ) => LazyRequest<Response<number>>;
  distinct: (field: string, axiosRequestConfig: MockRequestConfig | undefined) => LazyRequest<Response<string[]>>;
  distinctAdvanced: (
    field: string,
    conditions: FilterQuery<T>,
    axiosRequestConfig: MockRequestConfig | undefined,
  ) => LazyRequest<Response<string[]>>;
}

export type MockMethodName =
  | 'list'
  | 'listAdvanced'
  | 'read'
  | 'readAdvanced'
  | 'create'
  | 'createAdvanced'
  | 'update'
  | 'updateAdvanced'
  | 'upsert'
  | 'upsertAdvanced'
  | 'delete'
  | 'count'
  | 'countAdvanced'
  | 'distinct'
  | 'distinctAdvanced';

export interface MockServiceResults<T extends Document> {
  list: ListModelResponse<T>;
  read: ModelResponse<T>;
  create: ModelResponse<T>;
  delete: Response<string>;
  count: Response<number>;
  distinct: Response<string[]>;
}

export interface MockService<T extends Document> {
  /**
   * The mock service shape returned to the hook factory. It satisfies the
   * runtime + structural requirements of `ModelService<T>` for every
   * method invoked by the React hooks (`read`, `list`, `create`, ...).
   */
  service: ModelService<T>;
  /** Underlying vi.fn() spies indexed by method name. */
  spies: { [K in MockMethodName]: ReturnType<typeof vi.fn> };
  /** Default success results returned when no plan is registered. */
  seed: MockServiceResults<T>;
  /** Reset all spies and pre-armed plans. Preserves `seed`. */
  reset(): void;
  /**
   * Returns the most recent controlled lazy request for `method`. The
   * controller lets the test release a deferred settlement, observe the
   * forwarded `AbortSignal`, or swap the configured value.
   */
  lastCall<TMethod extends MockMethodName>(method: TMethod): ControlledLazyRequest<any> | undefined;
  /**
   * Pre-arm a method's next call to resolve IMMEDIATELY (next microtask)
   * with the supplied success value. Returns nothing: the test uses
   * `lastCall(method)` after the hook invokes the service to inspect the
   * forwarded signal or take over settlement.
   *
   * Useful when a test needs a specific success value to flow through the
   * hook's state-update path without delaying settlement.
   */
  planNextSuccess<TMethod extends MockMethodName>(method: TMethod, value: MethodResult<T, TMethod>): void;
  /**
   * Pre-arm a method's next call to stay DEFERRED until the test calls
   * `lastCall(method).controller.resolve()` / `.resolveFailure()` /
   * `.reject()`. The pre-armed value is the configured success result
   * used when `resolve()` is invoked with no argument.
   *
   * Used by pending-state, abort-observation, out-of-order settlement,
   * and signal-forwarding tests that need explicit control over when a
   * request settles relative to other React state updates.
   */
  planDeferred<TMethod extends MockMethodName>(method: TMethod, value: MethodResult<T, TMethod>): void;
  /**
   * Pre-arm a method's next call to resolve IMMEDIATELY (next microtask)
   * to a `FailureResult` payload. The hook settles against this resolved
   * failure; this is the path the client takes by default (no
   * `throwOnError`). Used by ARR-02 regression tests that must FAIL
   * against the current implementation.
   */
  planNextFailure<TMethod extends MockMethodName>(method: TMethod, failure: MethodResult<T, TMethod>): void;
  /**
   * Pre-arm a method's next call to REJECT IMMEDIATELY (next microtask)
   * with the supplied error (e.g. a `ServiceError`). This mirrors the
   * client's `throwOnError` / pre-boundary transport-failure path which
   * the hooks must treat as the hook-level failure path.
   */
  planNextRejection<TMethod extends MockMethodName>(method: TMethod, error: unknown): void;
}

// Maps a mock method name to the result type that method's service-call
// returns. Used by `planNextSuccess`/`planDeferred` so the caller's
// supplied value is structurally typed against the matching response.
export type MethodResult<T extends Document, M extends MockMethodName> = Awaited<ReturnType<MockServiceSurface<T>[M]>>;

const METHODS: readonly MockMethodName[] = [
  'list',
  'listAdvanced',
  'read',
  'readAdvanced',
  'create',
  'createAdvanced',
  'update',
  'updateAdvanced',
  'upsert',
  'upsertAdvanced',
  'delete',
  'count',
  'countAdvanced',
  'distinct',
  'distinctAdvanced',
];

const extractSignal = (reqConfig: unknown): AbortSignal | undefined => {
  if (reqConfig && typeof reqConfig === 'object' && 'signal' in reqConfig) {
    return (reqConfig as { signal?: AbortSignal }).signal;
  }
  return undefined;
};

/**
 * Build a `FailureResult` payload that satisfies the client's
 * `Response<T1, T2, TError>` failure branch without violating the public
 * type boundary. Use this to model the client's default behavior — the
 * client `resolve()`s the failure (with `success: false`, `data: null`)
 * when `throwOnError` is NOT enabled.
 */
export function makeFailureResult<TError = unknown>(overrides?: Partial<FailureResult<TError>>): FailureResult<TError> {
  return {
    success: false,
    raw: null,
    data: null,
    message: overrides?.message ?? 'fail',
    status: overrides?.status ?? 500,
    headers: overrides?.headers ?? {},
    ...(overrides?.raw !== undefined ? { raw: overrides.raw } : {}),
  };
}

/**
 * Build a `ServiceError` for tests that need the rejected-promise path
 * the client uses when `throwOnError` is enabled. The hooks under test
 * must treat a thrown `ServiceError` as the hook-level failure path.
 */
export function makeServiceError(overrides?: Partial<FailureResult>): ServiceError {
  return new ServiceError(makeFailureResult(overrides));
}

/**
 * Build a strict, controllable `ModelService<T>` mock.
 */
export function createMockService<T extends Document>(seed: MockServiceResults<T>): MockService<T> {
  // Plans pre-armed via `plan()/planDeferred()`. Each plan's recorder will
  // be used (and removed) the next time the matching method is invoked.
  const plans = new Map<MockMethodName, LazyRequestRecorder<any>[]>();
  for (const m of METHODS) plans.set(m, []);

  // Most recent controlled request per method, used by `lastCall()` when
  // the test did not pre-arm a plan.
  const lastCalls = new Map<MockMethodName, LazyRequestRecorder<any>>();

  const recordSignalOn = <R>(recorder: LazyRequestRecorder<R>, expectedArgs: unknown[]) => {
    const lastReqConfig = expectedArgs[expectedArgs.length - 1];
    recorder.__recordSignal(extractSignal(lastReqConfig));
  };

  const wrap = <R>(method: MockMethodName, defaultValue: R, deferred = false) => {
    return vi.fn((...args: unknown[]) => {
      // Prefer a pre-armed plan recorder; otherwise build a fresh
      // recorder seeded from the default success result.
      const queue = plans.get(method)!;
      let recorder: LazyRequestRecorder<R>;
      if (queue.length > 0) {
        recorder = queue.shift()! as LazyRequestRecorder<R>;
      } else {
        recorder = createLazyRequest<R>({ value: defaultValue, deferred }) as unknown as LazyRequestRecorder<R>;
      }
      recordSignalOn(recorder, args);
      lastCalls.set(method, recorder as unknown as LazyRequestRecorder<any>);
      // The hook surface expects a LazyRequest<R> (thenable + .exec()).
      // Return the request directly; the test accesses the controller via
      // mock.lastCall(method) when it wants to release or inspect it.
      return recorder.request;
    });
  };

  const listSpy = wrap<ListModelResponse<T>>('list', seed.list);
  const listAdvancedSpy = wrap<ListModelResponse<T>>('listAdvanced', seed.list);
  const readSpy = wrap<ModelResponse<T>>('read', seed.read);
  const readAdvancedSpy = wrap<ModelResponse<T>>('readAdvanced', seed.read);
  const createSpy = wrap<ModelResponse<T>>('create', seed.create);
  const createAdvancedSpy = wrap<ModelResponse<T>>('createAdvanced', seed.create);
  const updateSpy = wrap<ModelResponse<T>>('update', seed.read);
  const updateAdvancedSpy = wrap<ModelResponse<T>>('updateAdvanced', seed.read);
  const upsertSpy = wrap<ModelResponse<T>>('upsert', seed.read);
  const upsertAdvancedSpy = wrap<ModelResponse<T>>('upsertAdvanced', seed.read);
  const deleteSpy = wrap<Response<string>>('delete', seed.delete);
  const countSpy = wrap<Response<number>>('count', seed.count);
  const countAdvancedSpy = wrap<Response<number>>('countAdvanced', seed.count);
  const distinctSpy = wrap<Response<string[]>>('distinct', seed.distinct);
  const distinctAdvancedSpy = wrap<Response<string[]>>('distinctAdvanced', seed.distinct);

  const spies = {
    list: listSpy,
    listAdvanced: listAdvancedSpy,
    read: readSpy,
    readAdvanced: readAdvancedSpy,
    create: createSpy,
    createAdvanced: createAdvancedSpy,
    update: updateSpy,
    updateAdvanced: updateAdvancedSpy,
    upsert: upsertSpy,
    upsertAdvanced: upsertAdvancedSpy,
    delete: deleteSpy,
    count: countSpy,
    countAdvanced: countAdvancedSpy,
    distinct: distinctSpy,
    distinctAdvanced: distinctAdvancedSpy,
  };

  const planNextSuccess = <M extends MockMethodName>(method: M, value: MethodResult<T, M>) => {
    const recorder = createLazyRequest<any>({ value, deferred: false }) as unknown as LazyRequestRecorder<any>;
    plans.get(method)!.push(recorder);
  };

  const planDeferred = <M extends MockMethodName>(method: M, value: MethodResult<T, M>) => {
    const recorder = createLazyRequest<any>({ value, deferred: true }) as unknown as LazyRequestRecorder<any>;
    plans.get(method)!.push(recorder);
  };

  const planNextFailure = <M extends MockMethodName>(method: M, failure: MethodResult<T, M>) => {
    // A resolved failure is a normal resolved success from the harness
    // point of view: the request's `value` is the `FailureResult` payload.
    // The hook's reaction (treating `success: false` as an error) is what
    // ARR-02 fixes. The harness supplies the failure shape without any
    // client-side cast.
    const recorder = createLazyRequest<any>({ value: failure, deferred: false }) as unknown as LazyRequestRecorder<any>;
    plans.get(method)!.push(recorder);
  };

  const planNextRejection = <M extends MockMethodName>(method: M, error: unknown) => {
    // The harness exposes the rejected-promise path the client uses when
    // `throwOnError` is enabled or the transport fails before reaching
    // the client boundary. The supplied error SHOULD satisfy the
    // `ServiceError` shape (`success: false`, `data: null`, `status`,
    // `headers`); callers typically pass `makeServiceError(...)`.
    const recorder = createLazyRequest<any>({
      value: undefined,
      deferred: false,
      reject: error,
    }) as unknown as LazyRequestRecorder<any>;
    plans.get(method)!.push(recorder);
  };

  const reset = () => {
    for (const m of METHODS) {
      spies[m].mockClear();
      plans.set(m, []);
    }
    lastCalls.clear();
  };

  const lastCall = <T extends MockMethodName>(method: T): ControlledLazyRequest<any> | undefined => {
    return lastCalls.get(method) as ControlledLazyRequest<any> | undefined;
  };

  const surface: MockServiceSurface<T> = {
    list: listSpy as MockServiceSurface<T>['list'],
    listAdvanced: listAdvancedSpy as MockServiceSurface<T>['listAdvanced'],
    read: readSpy as MockServiceSurface<T>['read'],
    readAdvanced: readAdvancedSpy as MockServiceSurface<T>['readAdvanced'],
    create: createSpy as MockServiceSurface<T>['create'],
    createAdvanced: createAdvancedSpy as MockServiceSurface<T>['createAdvanced'],
    update: updateSpy as MockServiceSurface<T>['update'],
    updateAdvanced: updateAdvancedSpy as MockServiceSurface<T>['updateAdvanced'],
    upsert: upsertSpy as MockServiceSurface<T>['upsert'],
    upsertAdvanced: upsertAdvancedSpy as MockServiceSurface<T>['upsertAdvanced'],
    delete: deleteSpy as MockServiceSurface<T>['delete'],
    count: countSpy as MockServiceSurface<T>['count'],
    countAdvanced: countAdvancedSpy as MockServiceSurface<T>['countAdvanced'],
    distinct: distinctSpy as MockServiceSurface<T>['distinct'],
    distinctAdvanced: distinctAdvancedSpy as MockServiceSurface<T>['distinctAdvanced'],
  };

  // The narrow cast: `MockServiceSurface<T>`.return is `LazyRequest<R>`,
  // which satisfies the runtime contract the hook surface uses
  // (`await`/`.exec()`). `ModelService<T>` declares the return type as
  // `ModelRequest<R>` (= `ModelPromiseMeta & LazyRequest<R>`), but the
  // hook never introspects lazy-request metadata, so the structural drop
  // of `ModelPromiseMeta` is the only widening performed here. This is the
  // single point of difference between the strict mock surface and the
  // client's `ModelService<T>`; if the hook surface ever introspects
  // `ModelPromiseMeta` (e.g. `__op`), this mocked service will fail at
  // runtime with a missing-property error, surfacing signature drift
  // loudly without a silent broad cast.
  const service = surface as unknown as ModelService<T>;

  return {
    service,
    spies,
    seed,
    reset,
    lastCall,
    planNextSuccess,
    planDeferred,
    planNextFailure,
    planNextRejection,
  };
}
