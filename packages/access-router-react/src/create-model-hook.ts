import { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { ServiceError } from '@web-ts-toolkit/access-router-client';
import type {
  Document,
  ModelService,
  FilterQuery,
  Projection,
  ListArgs,
  ListAdvancedArgs,
  ReadAdvancedArgs,
  CreateAdvancedArgs,
  UpdateAdvancedArgs,
  UpsertAdvancedArgs,
  Response,
  FailureResult,
} from '@web-ts-toolkit/access-router-client';
import type {
  UseReadQueryOptions,
  UseReadQueryResult,
  UseListQueryOptions,
  UseListQueryResult,
  UseCreateMutateOptions,
  UseCreateMutateResult,
  UseUpdateMutateOptions,
  UseUpdateMutateResult,
  UseUpsertMutateOptions,
  UseUpsertMutateResult,
  UseDeleteMutateOptions,
  UseDeleteMutateResult,
  UseCountQueryOptions,
  UseCountQueryResult,
  UseDistinctQueryOptions,
  UseDistinctQueryResult,
  QueryCallOptions,
  ProjectedShape,
  ProjectedShapeArray,
  ProjectedModelResponse,
  ProjectedListModelResponse,
} from './types';
import {
  useAbortManager,
  requestKeyFor,
  RequestKeyError,
  useMountRef,
  composeAbortSignals,
  mergeRequestConfig,
  requestConfigKeyInput,
} from './fetch';

// ── Internal helpers ──

/**
 * Narrowed success payload after `assertSuccess` removes the
 * `FailureResult` branch. `ListModelResponse<T>` widens
 * `Response<TData[], ...>` with `totalCount`; the intersection is
 * preserved by leaving the success branch unchanged.
 */
type SuccessResultPayload<T1, T2, TError> = Extract<Response<T1, T2, TError>, { success: true }>;

type ServiceDocument<TService extends ModelService<Document, object, object, object>> =
  TService extends ModelService<infer TDocument, object, object, object> ? TDocument : never;

type ServiceCreateInput<TService extends ModelService<Document, object, object, object>> =
  TService extends ModelService<Document, infer TInput, object, object> ? TInput : never;

type ServiceUpdateInput<TService extends ModelService<Document, object, object, object>> =
  TService extends ModelService<Document, object, infer TInput, object> ? TInput : never;

type ServiceUpsertInput<TService extends ModelService<Document, object, object, object>> =
  TService extends ModelService<Document, object, object, infer TInput> ? TInput : never;

type SingleCreateInput<TInput extends object> = TInput extends readonly unknown[] ? never : TInput;

type CreateModelHooksResult<
  T extends Document,
  TCreateInput extends object,
  TUpdateInput extends object,
  TUpsertInput extends object,
> = {
  useRead: <TSelect extends Projection = Projection>(
    options?: UseReadQueryOptions<T, TSelect>,
  ) => UseReadQueryResult<T, TSelect>;
  useList: <TSelect extends Projection = Projection>(
    options?: UseListQueryOptions<T, TSelect>,
  ) => UseListQueryResult<T, TSelect>;
  useCreate: <TSelect extends Projection = Projection>(
    options?: UseCreateMutateOptions<T, TSelect>,
  ) => UseCreateMutateResult<T, TSelect, SingleCreateInput<TCreateInput>>;
  useUpdate: <TSelect extends Projection = Projection>(
    options?: UseUpdateMutateOptions<T, TSelect>,
  ) => UseUpdateMutateResult<T, TSelect, TUpdateInput>;
  useUpsert: <TSelect extends Projection = Projection>(
    options?: UseUpsertMutateOptions<T, TSelect>,
  ) => UseUpsertMutateResult<T, TSelect, TUpsertInput>;
  useDelete: (options?: UseDeleteMutateOptions) => UseDeleteMutateResult;
  useCount: (options?: UseCountQueryOptions<T>) => UseCountQueryResult;
  useDistinct: (options: UseDistinctQueryOptions<T>) => UseDistinctQueryResult;
};

/**
 * Single typed normalization boundary for every query and mutation
 * response (ARR-02). The client resolves failed HTTP/network operations
 * as `FailureResult` by default (only `throwOnError` makes it reject);
 * the React hooks must treat a resolved `success: false` as the same
 * hook-level failure path as a rejected `ServiceError`.
 *
 * `assertSuccess` branches on the response discriminator and throws a
 * `ServiceError` carrying `message`, `status`, `raw`, and `headers` for
 * any `success: false` value. The thrown `ServiceError` is then handled
 * by the existing `try`/`catch` paths in `useAutoQuery` and
 * `useMutation`, so success callbacks, state writes, and `onSuccess`
 * are never invoked for a resolved failure. The success branch returns
 * the narrowed success payload unchanged so successful responses and
 * callback ordering are preserved.
 */
function assertSuccess<T1, T2, TError>(res: Response<T1, T2, TError>): SuccessResultPayload<T1, T2, TError> {
  if (!res.success) {
    throw new ServiceError(res as FailureResult<TError>);
  }
  return res;
}

/**
 * Convert a caller-supplied callback into a stable-invoker that always
 * calls the *latest* `cb` (Task ARR-06 requirement 5).
 *
 * Each query hook accepts `onSuccess`/`onError`/`onSettled` from the
 * caller. Without this holder every render would either:
 *
 *   - break `react-hooks/exhaustive-deps` if we included the callback
 *     identity in the auto-effect deps (and trigger a refetch every
 *     render because the closure identity changes), OR
 *   - capture a stale callback in a memoized effect closure and silently
 *     route settlement callbacks to an out-of-date handler.
 *
 * `useEventCallback` instead keeps the latest `cb` in a `useRef` updated
 * on every render via `useLayoutEffect`, and returns a stable invoker
 * whose identity never changes. The auto-effect deps array therefore
 * depends on a stable invoker instead of the raw callback identity, so a
 * parent that re-renders with a fresh `(result) => …` arrow every render
 * does NOT retrigger the network request (ARR-06 acceptance: callbacks
 * are kept current without making callback identity trigger a network
 * request). The invoker is `undefined`-safe so optional callbacks remain
 * optional — calling `invoker?.(arg)` from `useAutoQuery` is a no-op
 * when the caller never set the callback.
 *
 * This is the React-core "useEvent" pattern approved for the React 19
 * timeline and shipped as `useEffectEvent`; we keep a local
 * implementation rather than relying on the experimental hook to stay
 * React 18-clean (the package's peerDep range is `^18 || ^19`). The
 * layout effect that updates `latest.current` must run before any
 * settlement microtask so we guarantee a fresh callback at fire time;
 * `useLayoutEffect` is used because there is no DOM-event-driven
 * callback here that would race, and SSR does not invoke the layout
 * effect for the duration of a typical server render.
 */
function useEventCallback<A extends unknown[], R>(cb: ((...args: A) => R) | undefined): (...args: A) => R | undefined {
  const latest = useRef<((...args: A) => R) | undefined>(cb);
  useLayoutEffect(() => {
    latest.current = cb;
  });
  const invoker = useCallback((...args: A): R | undefined => {
    return latest.current?.(...args);
  }, []);
  return invoker;
}

function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

interface AutoQueryConfig<R> {
  /**
   * Builds the request promise for a query invocation. The hook calls it
   * with an `AbortSignal` so every entry path (auto effect, manual
   * `query()`, and `refetch()`) is wired through the same lifecycle.
   * Each query hook supplies an override of `doFetch` to `query()` so
   * manual calls can pass invocation-specific args (`readId`, `listArgs`,
   * etc.) without re-running the auto-effect's `deps`.
   */
  doFetch: (signal?: AbortSignal) => Promise<R>;
  applyResult: (res: R) => void;
  shouldFetch: boolean;
  deps: unknown[];
  getRequestSignal?: () => AbortSignal | undefined;
  onSuccess?: (result: R) => void;
  onError?: (error: ServiceError) => void;
  onSettled?: (result: R | null, error: ServiceError | null) => void;
  /**
   * Lifecycle hook invoked when the current invocation's request settles
   * as a failure (Task ARR-08 req 1). Called AFTER `error`/`isFetching`
   * state writes on the current-owner failure branch, so a hook that
   * attaches ancillary state to the lifecycle (e.g. `useList`'s
   * `previousData`) can clear that state on every terminal path rather
   * than only on success. Only fired for the invocation that still owns
   * state at settlement — a replaced (stale) invocation does not call it
   * (it leaves ancillary state to the newer invocation). NOT called for
   * cancellation (use {@link onAborted}) or for a disabled/`!shouldFetch`
   * effect entry (use {@link onDisabled}).
   */
  onFailed?: () => void;
  /**
   * Lifecycle hook invoked when the current invocation is settled by an
   * authoritative abort (Task ARR-08 req 1): cancellation is not a
   * request error — `error`/`onError`/`onSettled` are NOT invoked — but
   * ancillary state attached to the request lifecycle (e.g.
   * `useList`'s `previousData` captured at request start) must be
   * cleared on this terminal path too. Only fired when the hook is
   * still mounted AND the invocation still owns state at settlement; a
   * replaced invocation leaves ancillary state to the newer invocation.
   * NOT called for the `!shouldFetch` effect branch (use
   * {@link onDisabled}).
   */
  onAborted?: () => void;
  /**
   * Lifecycle hook invoked when the auto-effect re-runs with
   * `shouldFetch === false` (Task ARR-08 req 1). The hook never enters
   * `runWithCallbacks` on this branch — no controller, no
   * `runWithCallbacks` invocation — so ancillary state attached to the
   * request lifecycle must be cleared here as well. Invoked AFTER the
   * synchronous `isLoading`/`isFetching` convergence so a `useList`
   * disable (or a `useRead` id-removed transition that effectively
   * disables the list) does not leave `previousData` pinned to a
   * prior in-flight request.
   */
  onDisabled?: () => void;
}

/**
 * Unified request lifecycle for query hooks (ARR-03). Auto-fetch,
 * manual `query()`, and `refetch()` all route through `runWithCallbacks`
 * so they share the same loading/fetching/error state writes, callback
 * order, and failure normalization.
 *
 * Loading semantics:
 *   - `isFetching` is true while any query request is in flight.
 *   - `isLoading` is true only while no settled data exists for the hook
 *     (the initial auto-fetch, or a `query()`/`refetch()` invoked before
 *     any successful settlement). Once `data` has been applied by
 *     `applyResult`, subsequent `refetch()` calls set `isFetching` but
 *     not `isLoading`, so callers can distinguish background fetches from
 *     the first load.
 *
 * Race ownership (ARR-04):
 *   Each query invocation takes a monotonically increasing owner id from
 *   `ownerIdRef`. Only the invocation whose id equals the current
 *   `ownerIdRef.current` may write data/error/loading/fetching state or
 *   fire callbacks. `manager.replace` aborts the previous controller; the
 *   ownership check additionally guarantees that an older invocation
 *   whose `await doFetch` settles between abort and the next microtask
 *   cannot grandfather stale data/error through the `!signal.aborted`
 *   branch. `signal.aborted` is authoritative for cancellation: a
 *   transport-specific cancellation error (e.g. axios `CanceledError`)
 *   never reaches `error` or `onError` because the catch path branches on
 *   `signal.aborted`, not on `instanceof DOMException`.
 *
 * Callback observers (ARR-03 requirement 5 + deferred decision 1):
 *   `onSuccess`/`onError`/`onSettled` are invoked inside a try/catch. A
 *   thrown callback is rethrown asynchronously via `queueMicrotask` so it
 *   surfaces as an uncaught microtask error without converting a successful
 *   request into a request failure or mutating hook-level `error`. The
 *   promise returned by `query()`/`refetch()` resolves/rejects based on
 *   the request, not on whether a callback threw.
 */
function useAutoQuery<R>({
  doFetch,
  applyResult,
  shouldFetch,
  deps,
  getRequestSignal,
  onSuccess,
  onError,
  onSettled,
  onFailed,
  onAborted,
  onDisabled,
}: AutoQueryConfig<R>) {
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<ServiceError | null>(null);
  // `hasDataRef` records whether `applyResult` has written any settled
  // data for this hook instance. It gates `isLoading`: the first fetch
  // keeps `isLoading` true until settlement; subsequent refetches set
  // only `isFetching`. Stored in a ref so the success path clears it
  // synchronously without depending on a stale closure in callbacks.
  const hasDataRef = useRef(false);
  const manager = useAbortManager();
  // `mountRef` is "true while the hook is mounted" (no `[]` cleanup until
  // final unmount). ARR-04 uses it to suppress any state write after
  // unmount: an aborted request whose microtask fires post-unmount still
  // goes through the catch path, but the mountRef gate prevents
  // `setIsLoading`/`setIsFetching` writes that would be silent no-ops and
  // historically surfaced as "state update on unmounted component"
  // warnings. `useAutoQuery`'s own effect never mutates this ref; only
  // `useMountRef`'s `[]` cleanup does.
  const mountRef = useMountRef();
  // `ownerIdRef` is the latest-invocation-wins token. Each invocation
  // captures `const myId = ++ownerIdRef.current` at the start of
  // `runWithCallbacks`. A previous invocation sees its `myId` differ from
  // the current `ownerIdRef.current` and bails without touching state or
  // callbacks, so an out-of-order settlement cannot grandfather stale
  // data/error through to the hook surface.
  const ownerIdRef = useRef(0);

  const createAbortScope = useCallback(
    (callerSignal?: AbortSignal) => {
      const controller = new AbortController();
      manager.replace(controller);
      const composed = composeAbortSignals(controller.signal, getRequestSignal?.(), callerSignal);
      return {
        controller,
        effectiveSignal: composed.signal,
        release: composed.release,
      };
    },
    [manager, getRequestSignal],
  );

  const fireCallbacksSafely = useCallback(
    (settle: { result: R } | { error: ServiceError }) => {
      try {
        if ('result' in settle) {
          onSuccess?.(settle.result);
          onSettled?.(settle.result, null);
        } else {
          onError?.(settle.error);
          onSettled?.(null, settle.error);
        }
      } catch (cbErr) {
        // Callbacks are observers. A thrown callback does not convert a
        // successful request into a request failure or mutate hook-level
        // `error`. Re-throw asynchronously so the exception still surfaces
        // (it becomes an uncaught microtask error) without affecting the
        // returned promise settlement.
        queueMicrotask(() => {
          throw cbErr;
        });
      }
    },
    [onSuccess, onError, onSettled],
  );

  /**
   * Single lifecycle entry point for every query path. Returns the
   * awaitable promise the caller can `await`/`catch`; rejected promises
   * carry the resolved `ServiceError` so a consumer `await` resolves as
   * a thrown error.
   *
   * The function records a per-invocation owner id and consults it after
   * each `await`. Three paths exist on settlement:
   *
   *   1. Current owner, not aborted: apply result / publish error, fire
   *      callbacks, and converge `isLoading`/`isFetching` (request
   *      succeeded or failed under the hook's current invocation).
   *   2. Current owner, aborted: cancel was authoritative (ARR-04 req 3).
   *      Clear loading/fetching flags as long as the hook is still
   *      mounted; no `error` write, no `onError` / `onSettled` callback.
   *      This is the disable / id-removed / unmount convergence path.
   *   3. Replaced (`myId !== ownerIdRef.current`): a newer invocation
   *      owns state. Bail without touching state or callbacks; the newer
   *      invocation is responsible for converging loading/fetching.
   */
  const runWithCallbacks = useCallback(
    async (
      abortScope: { controller: AbortController; effectiveSignal: AbortSignal; release: () => void },
      doFetchOverride: (signal?: AbortSignal) => Promise<R>,
    ): Promise<R> => {
      const { effectiveSignal, release } = abortScope;
      const myId = ++ownerIdRef.current;
      setIsFetching(true);
      setError(null);
      if (!hasDataRef.current) setIsLoading(true);
      try {
        const res = await doFetchOverride(effectiveSignal);
        if (myId !== ownerIdRef.current) {
          // A newer query owns state. Leave loading/fetching/error to it.
          return res;
        }
        if (effectiveSignal.aborted) {
          // Abort is authoritative for cancellation. If the hook is still
          // mounted, converge loading/fetching flags. No `error`, no
          // callbacks: cancellation is not a request error (ARR-04 req 3,
          // req 2, req 4). After unmount, `mountRef.current === false` and
          // we suppress state writes entirely.
          if (mountRef.current) {
            if (!hasDataRef.current) setIsLoading(false);
            setIsFetching(false);
            // ARR-08 req 1: ancillary state captured at request start
            // (e.g. `useList.previousData`) must be cleared on the cancel
            // terminal path too, not just on success.
            onAborted?.();
          }
          return res;
        }
        applyResult(res);
        hasDataRef.current = true;
        setIsLoading(false);
        setIsFetching(false);
        fireCallbacksSafely({ result: res });
        return res;
      } catch (err) {
        if (myId !== ownerIdRef.current) {
          // Replaced: the newer invocation owns error/loading/fetching.
          throw err;
        }
        if (effectiveSignal.aborted) {
          // Abort is authoritative even when the transport throws a
          // non-DOM cancellation object (e.g. axios `CanceledError`,
          // `Error('Canceled')` with `code: 'ERR_CANCELED'`, or any other
          // shape). `signal.aborted` — not `instanceof DOMException` —
          // decides whether the rejection is a cancellation or a request
          // error (ARR-04 req 3). Same convergence as the success-abort
          // path above: clear flags when mounted, never publish
          // cancellation as `error` and never fire `onError`.
          if (mountRef.current) {
            if (!hasDataRef.current) setIsLoading(false);
            setIsFetching(false);
            // ARR-08 req 1: ancillary state captured at request start
            // (e.g. `useList.previousData`) must be cleared on the cancel
            // terminal path too.
            onAborted?.();
          }
          throw err;
        }
        setError(err as ServiceError);
        if (!hasDataRef.current) setIsLoading(false);
        setIsFetching(false);
        fireCallbacksSafely({ error: err as ServiceError });
        // ARR-08 req 1: ancillary state captured at request start
        // (e.g. `useList.previousData`) must be cleared on the failure
        // terminal path, mirroring the `applyResult` clear on success.
        onFailed?.();
        throw err;
      } finally {
        release();
      }
    },
    [applyResult, fireCallbacksSafely, mountRef, onFailed, onAborted],
  );

  useEffect(() => {
    if (!shouldFetch) {
      // Disabled / id-removed / Nothing-to-fetch path: no controller and
      // no `runWithCallbacks` invocation. Converge loading/fetching flags
      // synchronously for this hook so a previously in-flight auto-fetch
      // does not leave `isLoading`/`isFetching` pinned to true when the
      // request settles only after the transport observes the abort
      // (ARR-04 req 2). `setState(false)` is idempotent; the writes are
      // coalesced into the current render batch.
      setIsLoading(false);
      setIsFetching(false);
      // ARR-08 req 1: ancillary state captured at a prior request start
      // (e.g. `useList.previousData`) must be cleared on the disable /
      // id-removed terminal path; otherwise a stale snapshot of the
      // previously-fetched page stays pinned while the hook is disabled.
      onDisabled?.();
      return;
    }
    setIsLoading(!hasDataRef.current);
    const abortScope = createAbortScope();

    // `runWithCallbacks` handles `setError`, `setIsLoading`,
    // `setIsFetching`, and all callbacks internally; the trailing `.catch`
    // only suppresses the unhandled-promise-rejection warning so the
    // rejection does not bubble past the effect.
    runWithCallbacks(abortScope, doFetch).catch(() => {
      /* handled inside runWithCallbacks; suppress unhandled rejection */
    });

    return () => {
      // Abort the in-flight request on dependency change or unmount. The
      // owned `runWithCallbacks` will converge loading/fetching on its
      // aborted branch (or be replaced by a newer invocation which owns
      // them). We do NOT mutate `mountRef.current` here; `useMountRef`'s
      // own `[]` cleanup is the sole owner of that flag.
      abortScope.controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  /**
   * Imperative query entry point shared by all query hooks (ARR-03
   * requirement 1). Routes a caller-supplied `doFetchOverride` through
   * the same lifecycle as the auto effect: shares
   * `isFetching`/`isLoading`/`error` writes, callback observers, and the
   * abort manager. Returns an awaitable promise so a caller can
   * `await result.current.query(...)` and catch the `ServiceError` on
   * failure. Supersedes the duplicated boilerplate this file had per
   * hook.
   *
   * The promise is a fresh chain per call. A trailing `.catch(() => {})`
   * suppresses unhandled-rejection warnings for callers that fire
   * `query()` without `await`; an awaiter's `await` still throws
   * because `await` observes the returned promise's settled state.
   *
   * Query cancellation is centralized here: every invocation composes the
   * hook-owned controller, the current `requestConfig.signal`, and any
   * per-call `QueryCallOptions.signal` into one effective signal.
   */
  const query = useCallback(
    (doFetchOverride: (signal?: AbortSignal) => Promise<R>, callerSignal?: AbortSignal): Promise<R> => {
      const abortScope = createAbortScope(callerSignal);
      const p = runWithCallbacks(abortScope, doFetchOverride);
      p.catch(() => {
        /* handled inside runWithCallbacks; suppress unhandled rejection */
      });
      return p;
    },
    [createAbortScope, runWithCallbacks],
  );

  /**
   * Re-runs the configured `doFetch` through the unified lifecycle.
   * Returns an awaitable promise (ARR-03 requirement 3): resolving yields
   * the success response, rejecting yields the `ServiceError` so a caller
   * can `await refetch()` and `catch` the hook-level error. The trailing
   * `.catch` suppression lets fire-and-forget callers skip `await` without
   * leaking an unhandled rejection.
   */
  const refetch = useCallback((): Promise<R> => {
    const abortScope = createAbortScope();
    const p = runWithCallbacks(abortScope, doFetch);
    p.catch(() => {
      /* handled inside runWithCallbacks; suppress unhandled rejection */
    });
    return p;
  }, [createAbortScope, runWithCallbacks, doFetch]);

  const resetError = useCallback(() => {
    setError(null);
  }, []);

  const resetLoading = useCallback(() => {
    // Query reset is an authoritative state clear, not transport
    // cancellation. Bump the owner token so any already-running request
    // loses its right to publish state or callbacks when it later settles,
    // then converge the exposed hook activity flags immediately.
    ownerIdRef.current += 1;
    setIsLoading(false);
    setIsFetching(false);
    hasDataRef.current = false;
  }, []);

  return {
    isLoading,
    isFetching,
    error,
    setError,
    refetch,
    query,
    resetError,
    resetLoading,
    manager,
    mountRef,
  };
}

/**
 * Unified lifecycle for mutation hooks (Task ARR-07).
 *
 * A mutation hook may be invoked more than once in flight: a caller
 * clicking "Save" twice, a list-reordering UI that fires two updates,
 * a retry button hit before the first attempt finished. Each invocation
 * produces its own awaitable promise and its own callback observations,
 * but only ONE shared `isPending` / `data` / `error` channel is exposed
 * at the hook surface. The concurrent-mutation contract recorded in
 * the task file (maintainer decision / deferred decision 3) is:
 *
 *   - **Active-count `isPending`**: `isPending` is `true` while ANY
 *     invocation is in flight, and stays `true` until the active count
 *     reaches zero. The first invocation's `finally` block therefore
 *     cannot clear `isPending` while a second invocation is still
 *     pending (the historical bug class where two overlapping mutations
 *     flipped `isPending` false on the first completion). A ref-based
 *     active count is used instead of `setIsPending(false)` directly so
 *     two synchronous `setIsPending(true)` followed by a single
 *     `setIsPending(false)` is not observed (each settlement only clears
 *     when the count reaches zero). The count is read in the `finally`
 *     so an in-flight invocation settling at any time converges
 *     correctly.
 *
 *   - **Latest-invocation-wins for exposed `data` and `error`**: a
 *     monotonically increasing `latestIdRef` is bumped at the start of
 *     every `executeMutate` invocation. Only the invocation whose
 *     `myId === latestIdRef.current` may write `data` or `error` to
 *     the hook's state. An older invocation that settles AFTER a newer
 *     one (out-of-order completion — the historical "A settling last
 *     overwrote B's result" bug class) still resolves its per-
 *     invocation promise and fires its per-invocation callbacks, but
 *     cannot overwrite the newer invocation's exposed state. A newer
 *     invocation ALSO does NOT clear `error` before its own
 *     settlement; `setError(null)` is split: each invocation starts by
 *     clearing `error` only if it IS the latest at invocation time,
 *     matching the latest-invocation-wins semantics for the write
 *     surface.
 *
 *   - **Invocation-specific promise and callbacks** (Task ARR-07 req
 *     3): every returned mutation promise resolves/rejects with that
 *     invocation's own result/error. `onSuccess`/`onSettled` fire for
 *     their own invocation's outcome regardless of whether the
 *     invocation is still the latest when it settles. The only writes
 *     gated on "is this the latest invocation" are the hook-level
 *     `data`/`error` STATE writes; the callbacks are observers of the
 *     invocation, not of the hook's shared state, so a stale
 *     invocation still surfaces its own outcome to its own callbacks.
 *     This matches the maintainer decision recorded as deferred
 *     decision 3: a fire-and-forget `mutate(...)` that is superseded
 *     still receives its `onSuccess` for THAT invocation; it just does
 *     not overwrite the newer invocation's exposed `data`.
 *
 *   - **`reset` semantics during pending** (Task ARR-07 req 4): `reset`
 *     clears `data` and `error` AND bumps `latestIdRef.current` so any
 *     already-running stale invocation loses its claim to being the
 *     latest. When that invocation later settles, its state-write gate
 *     (`myId !== latestIdRef.current`) is false (it has been
 *     superseded), so it cannot repopulate cleared state. `isPending`
 *     remains `true` while any invocation is still in flight — `reset`
 *     does NOT implicitly cancel or wait (Task ARR-07 req 5 forbids
 *     implicit cancellation). The documented policy: `reset` is a
 *     synchronous state-clear; in-flight mutations continue running
 *     and their per-invocation promises/callbacks fire, but they
 *     cannot write to the hook's `data`/`error` after a `reset`
 *     because the latest-id token has been bumped. The next
 *     `mutate(...)` invoked after a `reset` is the new latest and
 *     resumes the latest-invocation-wins chain.
 *
 *   - **No implicit cancellation** (Task ARR-07 req 5): the
 *     in-flight promise is never aborted by another invocation. The
 *     hook continues to expose `isPending === true` until every
 *     pending mutation completes; a newer invocation does NOT abort
 *     an older one and they settle independently.
 *
 * Mount safety (Task ARR-04 req 4): every state write and callback
 * invocation is gated on `mountRef.current`. A mutation settling after
 * unmount neither calls callbacks nor writes state, matching the
 * documented post-unmount contract enforcement shared with the query
 * hooks.
 *
 * @typeParam A  Tuple of mutation arguments (`[createData]`,
 *   `[updateId, updateData]`, ...).
 * @typeParam R  The response wrapper returned by `execute` (e.g.
 *   `ModelResponse<T>` or `Response<string>` for delete).
 * @typeParam D  The projected data shape stored in hook-level `data`
 *   after success (e.g. `Model<T> & T` for create/update/upsert; `null`
 *   for `useDelete`, which does not store data).
 *
 * `execute` is the hook-specific network call returning `R`. The
 * per-hook `useCreate`/`useUpdate`/`useUpsert` `execute` previously
 * called `setData(res.data)` synchronously after `assertSuccess`; that
 * write is now routed through `applyData` here so the
 * latest-invocation-wins gate covers it. `useDelete` supplies an
 * `applyData` that returns `null` (no hook-level data state).
 */
function useMutation<A extends unknown[], R, D>(
  execute: (...args: A) => Promise<R>,
  applyData: (result: R) => D,
  options?: { onSuccess?: (result: R) => void; onSettled?: (result: R | null, error: ServiceError | null) => void },
) {
  const [data, setData] = useState<D | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<ServiceError | null>(null);
  const mountRef = useMountRef();
  const { onSuccess, onSettled } = options ?? {};
  // `activeCountRef` tracks how many invocations of `executeMutate` are
  // in flight at once. `setIsPending(false)` only fires when the count
  // transitions back to zero, so overlapping mutations keep `isPending`
  // `true` until ALL of them settle (Task ARR-07 req 1).
  const activeCountRef = useRef(0);
  // `latestIdRef` is the latest-invocation-wins token, the mutation
  // analogue of `useAutoQuery`'s `ownerIdRef`. A new invocation bumps
  // it to capture the latest claim on hook-level `data`/`error` state.
  // Stale invocations may still resolve their promise and fire their
  // per-invocation callbacks, but they do not write to `data`/`error`
  // because `myId !== latestIdRef.current` on settlement. `reset`
  // bumps this same token to invalidate the claims of any in-flight
  // mutations after a reset (Task ARR-07 req 4).
  const latestIdRef = useRef(0);

  const executeMutate = useCallback(
    async (...args: A): Promise<R> => {
      const myId = ++latestIdRef.current;
      activeCountRef.current += 1;
      setIsPending(true);
      // Only the latest invocation clears `error` on entry. A stale
      // invocation (one whose `myId !== latestIdRef.current` already
      // joined after a newer one started) would otherwise clear a
      // newer invocation's not-yet-failed state; gate the clear on
      // being the latest at the moment the invocation starts. (When
      // the two invocations race on entry, both observe themselves as
      // the latest because the second has not yet bumped the counter,
      // but only the second's `setError(null)` survives because the
      // first's clear runs before the second's `myId` bump in
      // practice; React then renders once with the second's clear.)
      if (myId === latestIdRef.current) {
        setError(null);
      }
      try {
        const result = await execute(...args);
        if (mountRef.current) {
          // Per-invocation observers always fire, regardless of
          // latest-invocation claim (Task ARR-07 req 3). A thrown
          // callback is rethrown asynchronously so it surfaces
          // without converting a successful request into a request
          // failure or mutating hook-level `error` — the same
          // observer-isolation contract `useAutoQuery.fireCallbacksSafely`
          // applies (deferred decision 1).
          try {
            onSuccess?.(result);
            onSettled?.(result, null);
          } catch (cbErr) {
            queueMicrotask(() => {
              throw cbErr;
            });
          }
          // Latest-invocation-wins for the state write (Task ARR-07
          // req 2). `myId === latestIdRef.current` is the gate: a
          // stale invocation that settled after a newer one started
          // has a token smaller than the current latest and skips the
          // `setData`. The newer invocation's `data` is preserved.
          // Assert here is omitted to keep the runtime slim; the
          // gate is the spec.
          if (myId === latestIdRef.current) {
            setData(applyData(result));
          }
        }
        return result;
      } catch (err) {
        const svcErr = err as ServiceError;
        if (mountRef.current) {
          // Per-invocation observer (Task ARR-07 req 3). `onError`
          // is NOT in `useMutation`'s options on purpose: the
          // wrapper at the hook factory (`useCreate.mutate`,
          // `useUpdate.mutate`, ...) owns `onError` so it fires
          // exactly once even when `executeMutate` rethrows for the
          // consumer `await` (ARR-02's contract). `onSettled` lives
          // here as the invocation-specific observer alongside
          // `onSuccess`.
          try {
            onSettled?.(null, svcErr);
          } catch (cbErr) {
            queueMicrotask(() => {
              throw cbErr;
            });
          }
          if (myId === latestIdRef.current) {
            setError(svcErr);
          }
        }
        throw svcErr;
      } finally {
        // Active-count-based convergence: only clear `isPending` when
        // the count reaches zero, regardless of which invocation this
        // is. A still-running sibling keeps `isPending` `true` (Task
        // ARR-07 req 1). `mountRef.current` gates the
        // `setIsPending` write so an unmount-then-settle does not
        // emit a "state update on unmounted component" warning.
        if (activeCountRef.current > 0) activeCountRef.current -= 1;
        if (mountRef.current) {
          setIsPending(activeCountRef.current > 0);
        }
      }
    },
    [execute, applyData, mountRef, onSuccess, onSettled],
  );

  /**
   * Synchronous reset of hook-level `data` and `error`. Bumps
   * `latestIdRef.current` so any already-running in-flight mutation
   * loses its latest-invocation claim: when it later settles, the
   * `myId === latestIdRef.current` gate is false, so it cannot
   * repopulate the cleared `data`/`error` state (Task ARR-07 req 4).
   *
   * `isPending` is NOT cleared by `reset`: a pending mutation is
   * still in flight and the hook truthfully reports it. Implicit
   * cancellation is forbidden (Task ARR-07 req 5), so the in-flight
   * promise is left to settle on its own; its per-invocation
   * `onSuccess`/`onSettled` still fire as observers of THAT
   * invocation, just without writing to the shared `data`/`error`.
   * Once all pending mutations settle, `isPending` converges to
   * `false` via the `activeCountRef` decrement in
   * `executeMutate`'s `finally`.
   *
   * The next `mutate(...)` after `reset` becomes the new latest
   * invocation (its `++latestIdRef.current` makes its `myId` the
   * current claim) and resumes the latest-invocation-wins chain.
   */
  const reset = useCallback(() => {
    latestIdRef.current += 1;
    setData(null);
    setError(null);
  }, []);

  return { data, isPending, error, executeMutate, reset };
}

// ── Factory ──

/**
 * Creates query and mutation hooks bound to one `ModelService<T>`.
 *
 * @example
 * const { useList, useCreate } = createModelHooks({ modelService });
 */
export function createModelHooks<TService extends ModelService<Document, object, object, object>>(config: {
  modelService: TService;
}): CreateModelHooksResult<
  ServiceDocument<TService>,
  ServiceCreateInput<TService>,
  ServiceUpdateInput<TService>,
  ServiceUpsertInput<TService>
>;
export function createModelHooks<
  T extends Document,
  TCreateInput extends object,
  TUpdateInput extends object,
  TUpsertInput extends object,
>(config: { modelService: ModelService<T, TCreateInput, TUpdateInput, TUpsertInput> }) {
  const { modelService } = config;

  // ── Query hooks ──

  function useRead<TSelect extends Projection = Projection>(
    options: UseReadQueryOptions<T, TSelect> = {},
  ): UseReadQueryResult<T, TSelect> {
    const {
      id,
      advanced,
      select,
      populate,
      sort,
      include,
      tasks,
      basicOptions,
      advancedOptions,
      enabled = true,
      initialData = null,
      requestConfig,
      onSuccess,
      onError,
      onSettled,
    } = options;
    // ARR-09: the projection generic threads a literal `select` (the
    // consumer-supplied `TSelect`) to the public surface so
    // `data`/`onSuccess(result)`/`query()`/`refetch()` reflect the
    // server's narrowed `ResolvedSelectedShape<T, TSelect, never>` and
    // omitted properties become `T[key] | undefined` rather than
    // definitely-present. When no literal projection was supplied
    // (`SelectedKeys<T, TSelect> extends never`), the public surface
    // preserves the ergonomic full-model shape `Model<T> & T` via the
    // package's {@link ProjectedShape} utility. The ambient client
    // response is typed as `ProjectedModelResponse<T, TSelect>` at the
    // `.exec()` boundary below so `applyResult` and callbacks propagate
    // the narrowed element shape to hook state without broadening back
    // to `T`. The legacy `as unknown as ModelResponse<T>` cast at the
    // `.exec()` site is replaced by the equivalent narrow cast typed
    // with `ProjectedModelResponse<T, TSelect>` — the cast still only
    // drops `ModelPromiseMeta` (the same narrow-cast rationale ARR-02
    // preserved) AND now provides the projection-aware response shape
    // rather than erasing it back to broad `ModelResponse<T>`. Inside
    // `applyResult` the historical `as Model<T> & T` cast is removed:
    // `setData(res.data as DataShape)` is type-safe because the
    // client's success branch data is `Model<T, S> & S` which is
    // assignable to `ProjectedShape<T, TSelect>` via the cast that
    // mirrors the runtime narrowing (the consumer's `DataShape` may be
    // `Model<T> & T` when no projection was supplied, in which case
    // `res.data` is already `Model<T> & T` and the cast is a no-op).
    type ResM = ProjectedModelResponse<T, TSelect>;
    type DataShape = ProjectedShape<T, TSelect>;
    const [data, setData] = useState<DataShape | null>(initialData as DataShape | null);
    const requestConfigRef = useLatestRef(requestConfig);

    const applyResult = useCallback((res: ResM) => {
      setData(res.data as DataShape);
    }, []);

    // ARR-06 dependency-key policy. Every request-affecting structured
    // input goes through `requestKeyFor` so inline arrays/objects with
    // structurally equivalent contents do NOT trigger an auto-refetch
    // (the historical bug class where `select: ['name']` recreated each
    // render contributed a fresh identity to the deps array every
    // render). A single composite `requestKey` collapses all of the
    // advanced/basic modeling inputs plus `requestConfig` (auth / tenant
    // headers, etc.) into one primitive string. `id`, `enabled`, and
    // `advanced` are primitives already and join the key directly.
    //
    // Throws `RequestKeyError` deterministically on cycles, BigInt,
    // functions, symbols, accessor properties, or unsupported built-in
    // instances (Date is supported; it compares by instant). The throw
    // propagates synchronously from render — handled by React's error
    // boundary the same way any synchronous render failure is — so the
    // package never silently collides or recurses indefinitely.
    let requestKey: string;
    try {
      requestKey = requestKeyFor({
        select,
        populate,
        sort,
        include,
        tasks,
        basicOptions,
        advancedOptions,
        requestConfig: requestConfigKeyInput(requestConfig),
      });
    } catch (e) {
      if (e instanceof RequestKeyError) {
        // Wrap in a ServiceError so the caller's React error boundary
        // (or the hook-level error surface, depending on integration)
        // receives the documented `ServiceError` payload type rather
        // than a bare `RequestKeyError`. The thrown error interrupts
        // the render so the auto-effect never runs with an unsound key.
        // `cause` preserves the original `RequestKeyError` for debugging.
        throw new Error(`useRead: ${e.message}`, { cause: e });
      }
      throw e;
    }

    const doFetchById = useCallback(
      async (targetId: string, signal?: AbortSignal): Promise<ResM> => {
        // The `signal` passed in is already the composed signal that
        // unifies the hook's internal controller, the hook-options
        // `requestConfig.signal`, and (for manual `query()`) the
        // per-call `options.signal` (Task ARR-05). Composition lives in
        // `useAutoQuery`'s entry points; `doFetchById` forwards the
        // signal and `mergeRequestConfig` produces a fresh shallow copy
        // of `requestConfig` so the caller's config object, its headers,
        // and any other fields retain identity/content and are not
        // mutated.
        const forwardedConfig = mergeRequestConfig(requestConfigRef.current, signal);
        if (advanced) {
          const raw = (await modelService
            .readAdvanced(
              targetId,
              { select, populate, sort, include, tasks } as ReadAdvancedArgs<Projection>,
              advancedOptions,
              forwardedConfig,
            )
            .exec()) as unknown as ResM;
          assertSuccess(raw);
          return raw;
        }
        const raw = (await modelService.read(targetId, basicOptions, forwardedConfig).exec()) as unknown as ResM;
        assertSuccess(raw);
        return raw;
      },
      // Only re-memoize when the composite key string changes. When a
      // parent re-renders with structurally-equivalent inline arrays or
      // objects, the key is unchanged and `doFetchById` keeps the same
      // identity — the auto-effect's `deps` therefore stays identical
      // and the network request is not retried. The `requestKey` is a
      // structural digest of `select/populate/sort/include/tasks/
      // basicOptions/advancedOptions/requestConfig`; the lint rule can-
      // not see that derivation, so the missing-deps warning is
      // silenced here intentionally.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [modelService, advanced, requestKey],
    );

    const doFetch = useCallback(
      (signal?: AbortSignal) => {
        if (!id) throw new Error('useRead: id is required');
        return doFetchById(id, signal);
      },
      [doFetchById, id],
    );

    const shouldFetch = Boolean(id && enabled);

    // ARR-06 req 5: keep callbacks current WITHOUT making callback
    // identity trigger a network request. The callback invokers are
    // stable across renders; their latest underlying callback fires at
    // settlement time. The auto-effect `deps` array never references the
    // caller's raw `onSuccess`/`onError`/`onSettled` identity.
    // ARR-09: the callback invoker result generic threads `ResM`
    // (the projected `ModelResponse<T, S>` or full `ModelResponse<T>`)
    // so `onSuccess(result)` and `onSettled(result, …)` observe the
    // narrowed response shape — the hook's public callback types
    // declare the same shape via {@link ProjectedModelResponse}.
    const onSuccessStable = useEventCallback<[ResM], void>(onSuccess);
    const onErrorStable = useEventCallback<[ServiceError], void>(onError);
    const onSettledStable = useEventCallback<[ResM | null, ServiceError | null], void>(onSettled);
    const getRequestSignal = useCallback(() => requestConfigRef.current?.signal, [requestConfigRef]);

    const {
      isLoading,
      isFetching,
      error,
      refetch,
      query: runQuery,
      resetError,
      resetLoading,
    } = useAutoQuery<ResM>({
      doFetch,
      applyResult,
      shouldFetch,
      deps: [id, enabled, advanced, requestKey],
      getRequestSignal,
      onSuccess: onSuccessStable,
      onError: onErrorStable,
      onSettled: onSettledStable,
    });

    // Manual `query()` reuses the unified lifecycle (`useAutoQuery`'s
    // `query`) instead of duplicating boilerplate; the only hook-specific
    // wiring is building the per-call `doFetch` for the supplied `readId`.
    // Per-call `options.signal` (ARR-05) is composed with the hook-owned
    // controller via `runQuery`'s `callerSignal` plumbing.
    // ARR-09: the returned promise is typed `ResM` so a consumer
    // `await useRead(...).query('id')` observes the projected response.
    const query = useCallback(
      (readId: string, callOptions?: QueryCallOptions): Promise<ResM> =>
        runQuery((signal) => doFetchById(readId, signal), callOptions?.signal),
      [runQuery, doFetchById],
    );

    const reset = useCallback(() => {
      setData(initialData as DataShape | null);
      resetError();
      resetLoading();
    }, [initialData, resetError, resetLoading]);

    return { data, isLoading, isFetching, error, query, refetch, reset };
  }

  function useList<TSelect extends Projection = Projection>(
    options: UseListQueryOptions<T, TSelect> = {},
  ): UseListQueryResult<T, TSelect> {
    const {
      listParams,
      filter,
      advanced,
      sort,
      select,
      populate,
      include,
      tasks,
      basicOptions,
      advancedOptions,
      enabled = true,
      keepPreviousData = false,
      initialData,
      requestConfig,
      onSuccess,
      onError,
      onSettled,
    } = options;
    // ARR-09: projection generic threads a literal `select` to the
    // public array data shape, callback result payloads, and the
    // manual `query()`/`refetch()` response payloads. `ResL` is
    // `ListModelResponse<T, S>` when the consumer supplied a literal
    // `select`, else the broad `ListModelResponse<T>` ergonomically.
    // `DataArray` is the public `data`/`previousData` array shape.
    type ResL = ProjectedListModelResponse<T, TSelect>;
    type DataArray = ProjectedShapeArray<T, TSelect>;
    const [data, setData] = useState<DataArray>((initialData as DataArray | undefined) ?? []);
    const requestConfigRef = useLatestRef(requestConfig);
    const [previousData, setPreviousData] = useState<DataArray | undefined>(undefined);
    const [totalCount, setTotalCount] = useState(0);
    const latestDataRef = useRef(data);
    // ARR-08 req 1: mirror `data` into a ref on every render so the async
    // `baseFetch` closure captures the freshest settled data at request
    // start for `previousData`. This MUST happen during render, not in a
    // `useEffect`: `useAutoQuery`'s post-commit refetch effects fire
    // (child-first, declaration-order) before this hook's own commit
    // effects, so a post-commit sync would let the refetch capture the
    // prior-but-not-yet-mirrored data. Writing a read-only mirror into a
    // ref during render is the React-blessed escape hatch when an async
    // callback needs the latest committed value without subscribing to
    // state changes.
    // eslint-disable-next-line react-hooks/refs
    latestDataRef.current = data;
    // `hasSettledRef` records whether `applyResult` has run for this hook
    // instance (i.e. the hook has produced at least one settled list
    // response). ARR-08 req 1: `previousData` exposes the prior settled
    // data while a replacement request is active, so the FIRST request
    // (no prior settlement) must NOT set `previousData` — there is
    // nothing to preserve. The ref is updated inside `applyResult` on
    // success, so a synchronous read after `applyResult` reflects the
    // new "has settled" state for the subsequent request's capture.
    const hasSettledRef = useRef(false);

    const applyResult = useCallback((res: ResL) => {
      setData(res.data as DataArray);
      setTotalCount(res.totalCount);
      setPreviousData(undefined);
      hasSettledRef.current = true;
    }, []);

    // ARR-08 req 1: `previousData` must be cleared on the failure,
    // cancellation, and disable terminal paths too, not only on
    // success. The shared `useAutoQuery` lifecycle invokes these hooks
    // at the matching settlement branches of `runWithCallbacks` and at
    // the `!shouldFetch` effect entry; `useList` is the only query hook
    // that threads ancillary state through `useAutoQuery`, so it is the
    // only consumer of these hooks. Each callback is `[]`-stable so it
    // does not contribute to `runWithCallbacks`'s identity churn.
    const clearPreviousData = useCallback(() => {
      setPreviousData(undefined);
    }, []);

    // ARR-06 dependency-key policy. Combines `listParams`, `filter`,
    // `sort`, `select`, `populate`, `include`, `tasks`, `basicOptions`,
    // `advancedOptions`, and `requestConfig` (auth/tenant headers, etc.)
    // into one structural key. `listParamsKey`, `filterKey`, and
    // `sortKey` are kept as separate deps entries because they are
    // semantically separable for documentation and the test-suite can
    // observe granular changes to a single axis (e.g. only `filter`
    // changing). The aggregate `requestKey` covers the rest so a
    // consumer that re-renders with structurally equivalent inline
    // `select`/`populate`/`include`/`tasks`/`basicOptions`/`advancedOptions`/`requestConfig`
    // objects does NOT force a refetch (the historical bug class).
    //
    // `requestKeyFor` throws `RequestKeyError` deterministically on
    // cycles, BigInt, functions, symbols, accessor properties, and
    // unsupported built-in instances (Date IS supported). The thrown
    // error interrupts render — same path a synchronous render failure
    // takes — so the auto-effect never runs with an unsound key.
    let listParamsKey: string;
    let filterKey: string;
    let sortKey: string;
    let requestKey: string;
    try {
      listParamsKey = requestKeyFor(listParams);
      filterKey = requestKeyFor(filter);
      sortKey = requestKeyFor(sort);
      requestKey = requestKeyFor({
        select,
        populate,
        include,
        tasks,
        basicOptions,
        advancedOptions,
        requestConfig: requestConfigKeyInput(requestConfig),
      });
    } catch (e) {
      if (e instanceof RequestKeyError) {
        throw new Error(`useList: ${e.message}`, { cause: e });
      }
      throw e;
    }

    const baseFetch = useCallback(
      async (args: ListArgs | undefined, signal?: AbortSignal): Promise<ResL> => {
        // ARR-08 req 1: capture the prior settled data while a replacement
        // list request is ACTIVE. The capture happens at request start so
        // `previousData` is meaningful during the pending request, then it
        // is cleared on every terminal path (success / failure /
        // cancellation / disable / reset) — see `clearPreviousData` and
        // the `onFailed`/`onAborted`/`onDisabled` lifecycle hooks wired
        // into `useAutoQuery` below. The first request (no prior
        // settlement) does NOT set `previousData`: there is nothing to
        // preserve, matching the spec ("prior settled data"). Only set
        // when `keepPreviousData` is enabled — the legacy opt-in flag —
        // so a consumer that does not want prior-data surface keeps a
        // stable `undefined` value.
        if (keepPreviousData && hasSettledRef.current) {
          setPreviousData(latestDataRef.current);
        }
        // The `signal` passed in is already the composed signal (Task
        // ARR-05). Composition lives in `useAutoQuery`'s entry points;
        // `baseFetch` forwards the signal via a fresh shallow copy so
        // the caller's `requestConfig`, headers, and other fields are
        // not mutated.
        const forwardedConfig = mergeRequestConfig(requestConfigRef.current, signal);
        const effectiveArgs = args ?? listParams;
        if (advanced) {
          const raw = (await modelService
            .listAdvanced(
              (filter ?? {}) as FilterQuery<T>,
              { sort, select, populate, include, tasks, ...effectiveArgs } as ListAdvancedArgs<Projection>,
              advancedOptions,
              forwardedConfig,
            )
            .exec()) as unknown as ResL;
          assertSuccess(raw);
          return raw;
        }
        const raw = (await modelService.list(effectiveArgs, basicOptions, forwardedConfig).exec()) as unknown as ResL;
        assertSuccess(raw);
        return raw;
      },
      // ARR-06: only re-memoize on a structural key change so an
      // inline-`filter`/`sort`/`select` caller passes identity changes
      // every render but `baseFetch` keeps a stable identity and the
      // auto-effect does NOT refetch. `keepPreviousData` is a primitive
      // boolean and participates in the key as a primitive directly.
      // `modelService` is the only stable identity in this list: the
      // hook lifetime is bound to a fixed `modelService`, so its
      // identity is genuinely `[]`-stable for this `useCallback`.
      // `latestDataRef` and `hasSettledRef` are refs whose identities
      // never change; they participate in the request-time capture of
      // `previousData` (ARR-08 req 1) but not in the memo identity.
      // `filterKey`, `sortKey`, `requestKey` are structural digests of
      // `filter`/`sort`/`{select, populate, include, tasks,
      // basicOptions, advancedOptions, requestConfig}`; the lint rule
      // cannot see that derivation, so the missing-deps warning is
      // silenced here intentionally.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [modelService, advanced, filterKey, sortKey, requestKey, keepPreviousData, latestDataRef],
    );

    // `listParams` is captured by the closure but only its structural
    // key (`listParamsKey`) drives the memo identity. The structural
    // key is sufficient because two structurally-equivalent `listParams`
    // values produce the same wire payload, so capturing either yields
    // the same request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const doFetch = useCallback((signal?: AbortSignal) => baseFetch(listParams, signal), [baseFetch, listParamsKey]);

    const shouldFetch = Boolean((listParams || advanced) && enabled);

    // ARR-06 req 5: keep callbacks current without making callback
    // identity trigger a network request.
    // ARR-09: callback result generic threads `ResL` so `onSuccess`/
    // `onSettled` observe the projected list response.
    const onSuccessStable = useEventCallback<[ResL], void>(onSuccess);
    const onErrorStable = useEventCallback<[ServiceError], void>(onError);
    const onSettledStable = useEventCallback<[ResL | null, ServiceError | null], void>(onSettled);
    const getRequestSignal = useCallback(() => requestConfigRef.current?.signal, [requestConfigRef]);

    const {
      isLoading,
      isFetching,
      error,
      refetch,
      query: runQuery,
      resetError,
      resetLoading,
    } = useAutoQuery<ResL>({
      doFetch,
      applyResult,
      shouldFetch,
      deps: [listParamsKey, filterKey, advanced, enabled, sortKey, requestKey],
      getRequestSignal,
      onSuccess: onSuccessStable,
      onError: onErrorStable,
      onSettled: onSettledStable,
      // ARR-08 req 1: `previousData` must be cleared on every terminal
      // path, not only on success (`applyResult` clears it). The shared
      // `useAutoQuery` lifecycle fires these hooks at the matching
      // branches; the `[]`-stable `clearPreviousData` does not churn
      // those `useCallback` identities that depend on it.
      onFailed: clearPreviousData,
      onAborted: clearPreviousData,
      onDisabled: clearPreviousData,
    });

    // Manual `query(args?)` reuses the unified lifecycle; the only
    // hook-specific wiring is building the per-call `doFetch` for the
    // supplied `args` (falling back to the configured `listParams`).
    // Per-call `options.signal` (ARR-05) is composed with the hook-owned
    // controller via `runQuery`'s `callerSignal` plumbing.
    // ARR-09: the returned promise is typed `ResL` so a consumer
    // `await useList(...).query(...)` observes the projected list
    // response.
    const query = useCallback(
      (args?: ListArgs, callOptions?: QueryCallOptions): Promise<ResL> =>
        runQuery((signal) => baseFetch(args, signal), callOptions?.signal),
      [runQuery, baseFetch],
    );

    const reset = useCallback(() => {
      setData((initialData as DataArray | undefined) ?? []);
      setPreviousData(undefined);
      setTotalCount(0);
      // ARR-08 req 1: after reset, the next request is again the FIRST
      // settling request, so it must NOT capture `previousData` from
      // whatever stale state remains. Clearing the settled flag keeps
      // the first-post-reset pending request's `previousData` at
      // `undefined` and only sets it on the SECOND successful response
      // onward.
      hasSettledRef.current = false;
      resetError();
      resetLoading();
    }, [initialData, resetError, resetLoading]);

    return { data, previousData, totalCount, isLoading, isFetching, error, query, refetch, reset };
  }

  // ── Mutation hooks ──

  function useCreate<TSelect extends Projection = Projection>(
    options: UseCreateMutateOptions<T, TSelect> = {},
  ): UseCreateMutateResult<T, TSelect, SingleCreateInput<TCreateInput>> {
    const {
      advanced,
      select,
      populate,
      tasks,
      basicOptions,
      advancedOptions,
      requestConfig,
      onSuccess,
      onError,
      onSettled,
    } = options;
    const mountRef = useMountRef();
    // ARR-09: same projection threading rationale as `useRead`. `ResM`
    // is the projected `ModelResponse<T, S>` (or full `ModelResponse<T>`
    // when no literal `select` was supplied); `DataShape` is the
    // projected single-model shape used for hook-level `data` state.
    type CreateInput = SingleCreateInput<TCreateInput>;
    type ResM = ProjectedModelResponse<T, TSelect>;
    type DataShape = ProjectedShape<T, TSelect>;

    const execute = useCallback(
      async (createData: CreateInput): Promise<ResM> => {
        let res: ResM;
        if (advanced) {
          res = (await modelService
            .createAdvanced(
              createData,
              { select, populate, tasks } as CreateAdvancedArgs<Projection>,
              advancedOptions,
              requestConfig,
            )
            .exec()) as unknown as ResM;
        } else {
          res = (await modelService.create(createData, basicOptions, requestConfig).exec()) as unknown as ResM;
        }
        assertSuccess(res);
        return res;
      },
      // ARR-06: `modelService` lives in the `createModelHooks`
      // closure but the lint rule's "outer scope" heuristic flags it
      // as unnecessary. It IS necessary: the hook is bound to that
      // specific service instance, and the closure capture is the
      // documented pattern for `createModelHooks`. The same pattern
      // is used in `useRead.useList.useCount.useDistinct` query hooks.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [modelService, advanced, select, populate, tasks, basicOptions, advancedOptions, requestConfig, mountRef],
    );

    // ARR-07: `data` is owned by `useMutation` so the
    // latest-invocation-wins and active-count `isPending` semantics
    // are enforced at one shared lifecycle boundary. The hook's
    // projection here unwraps `ModelResponse<T>.data` to the model
    // surface; the write gate (`myId === latestIdRef.current`) lives
    // inside `useMutation`, so a stale mutation settling after a
    // newer one cannot overwrite the newer one's `data`.
    // ARR-09: the `D` generic on `useMutation` now threads the
    // projected shape `DataShape` (= `Model<T> & T` when no select,
    // or `Model<T, S> & S` when narrowed). The historical
    // `res.data as Model<T> & T` cast is removed: `res.data` is
    // already typed `Model<T, S> & S` from `ResM`, which is
    // assignable to `DataShape` directly.
    const {
      data,
      isPending,
      error,
      executeMutate,
      reset: resetMutation,
    } = useMutation<[CreateInput], ResM, DataShape>(
      execute as (...args: [CreateInput]) => Promise<ResM>,
      (res: ResM) => res.data as DataShape,
      { onSuccess, onSettled },
    );

    const mutate = useCallback(
      async (createData: CreateInput): Promise<ResM> => {
        if (Array.isArray(createData)) {
          throw new TypeError(
            'useCreate.mutate is single-record-only. Array input is not supported by the hook; call modelService.create(...) directly for bulk create.',
          );
        }
        try {
          return await executeMutate(createData);
        } catch (err) {
          // `onError` is the only mutation callback not owned by
          // `useMutation.executeMutate`'s mountRef gate (ARR-02 placed it
          // here so it fires exactly once even when `executeMutate` rethrows
          // for the consumer `await`). ARR-04 req 4: after unmount the
          // mutation must not call any callback, so gate the wrapper's
          // `onError` on `mountRef.current` too.
          if (mountRef.current) onError?.(err as ServiceError);
          throw err;
        }
      },
      [executeMutate, onError, mountRef],
    );

    const reset = useCallback(() => {
      resetMutation();
    }, [resetMutation]);

    return { data, isPending, error, mutate, reset };
  }

  function useUpdate<TSelect extends Projection = Projection>(
    options: UseUpdateMutateOptions<T, TSelect> = {},
  ): UseUpdateMutateResult<T, TSelect, TUpdateInput> {
    const {
      advanced,
      select,
      populate,
      tasks,
      basicOptions,
      advancedOptions,
      requestConfig,
      onSuccess,
      onError,
      onSettled,
    } = options;
    const mountRef = useMountRef();
    // ARR-09: see `useCreate`.
    type UpdateInput = TUpdateInput;
    type ResM = ProjectedModelResponse<T, TSelect>;
    type DataShape = ProjectedShape<T, TSelect>;

    const execute = useCallback(
      async (updateId: string, updateData: UpdateInput): Promise<ResM> => {
        let res: ResM;
        if (advanced) {
          res = (await modelService
            .updateAdvanced(
              updateId,
              updateData,
              { select, populate, tasks } as UpdateAdvancedArgs<Projection>,
              advancedOptions,
              requestConfig,
            )
            .exec()) as unknown as ResM;
        } else {
          res = (await modelService
            .update(updateId, updateData, basicOptions, requestConfig)
            .exec()) as unknown as ResM;
        }
        assertSuccess(res);
        return res;
      },
      // ARR-06: `modelService` lives in the `createModelHooks`
      // closure but the lint rule's "outer scope" heuristic flags it
      // as unnecessary. It IS necessary: the hook is bound to that
      // specific service instance, and the closure capture is the
      // documented pattern for `createModelHooks`. The same pattern
      // is used in `useRead.useList.useCount.useDistinct` query hooks.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [modelService, advanced, select, populate, tasks, basicOptions, advancedOptions, requestConfig, mountRef],
    );

    // ARR-07: see `useCreate` — `data` is owned by `useMutation` so
    // latest-invocation-wins and active-count `isPending` semantics
    // are enforced at one shared boundary.
    // ARR-09: see `useCreate` — `D` threads the projected shape.
    const {
      data,
      isPending,
      error,
      executeMutate,
      reset: resetMutation,
    } = useMutation<[string, UpdateInput], ResM, DataShape>(
      execute as (...args: [string, UpdateInput]) => Promise<ResM>,
      (res: ResM) => res.data as DataShape,
      { onSuccess, onSettled },
    );

    const mutate = useCallback(
      async (updateId: string, updateData: UpdateInput): Promise<ResM> => {
        try {
          return await executeMutate(updateId, updateData);
        } catch (err) {
          // See useCreate.mutate: ARR-04 req 4 gates the wrapper's
          // `onError` on `mountRef.current`.
          if (mountRef.current) onError?.(err as ServiceError);
          throw err;
        }
      },
      [executeMutate, onError, mountRef],
    );

    const reset = useCallback(() => {
      resetMutation();
    }, [resetMutation]);

    return { data, isPending, error, mutate, reset };
  }

  function useUpsert<TSelect extends Projection = Projection>(
    options: UseUpsertMutateOptions<T, TSelect> = {},
  ): UseUpsertMutateResult<T, TSelect, TUpsertInput> {
    const {
      advanced,
      select,
      populate,
      tasks,
      basicOptions,
      advancedOptions,
      requestConfig,
      onSuccess,
      onError,
      onSettled,
    } = options;
    const mountRef = useMountRef();
    // ARR-09: see `useCreate`.
    type UpsertInput = TUpsertInput;
    type ResM = ProjectedModelResponse<T, TSelect>;
    type DataShape = ProjectedShape<T, TSelect>;

    const execute = useCallback(
      async (upsertData: UpsertInput): Promise<ResM> => {
        let res: ResM;
        if (advanced) {
          res = (await modelService
            .upsertAdvanced(
              upsertData,
              { select, populate, tasks } as UpsertAdvancedArgs<Projection>,
              advancedOptions,
              requestConfig,
            )
            .exec()) as unknown as ResM;
        } else {
          res = (await modelService.upsert(upsertData, basicOptions, requestConfig).exec()) as unknown as ResM;
        }
        assertSuccess(res);
        return res;
      },
      // ARR-06: `modelService` lives in the `createModelHooks`
      // closure but the lint rule's "outer scope" heuristic flags it
      // as unnecessary. It IS necessary: the hook is bound to that
      // specific service instance, and the closure capture is the
      // documented pattern for `createModelHooks`. The same pattern
      // is used in `useRead.useList.useCount.useDistinct` query hooks.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [modelService, advanced, select, populate, tasks, basicOptions, advancedOptions, requestConfig, mountRef],
    );

    // ARR-07: see `useCreate` — `data` is owned by `useMutation` so
    // latest-invocation-wins and active-count `isPending` semantics
    // are enforced at one shared boundary.
    // ARR-09: see `useCreate` — `D` threads the projected shape.
    const {
      data,
      isPending,
      error,
      executeMutate,
      reset: resetMutation,
    } = useMutation<[UpsertInput], ResM, DataShape>(
      execute as (...args: [UpsertInput]) => Promise<ResM>,
      (res: ResM) => res.data as DataShape,
      { onSuccess, onSettled },
    );

    const mutate = useCallback(
      async (upsertData: UpsertInput): Promise<ResM> => {
        try {
          return await executeMutate(upsertData);
        } catch (err) {
          // See useCreate.mutate: ARR-04 req 4 gates the wrapper's
          // `onError` on `mountRef.current`.
          if (mountRef.current) onError?.(err as ServiceError);
          throw err;
        }
      },
      [executeMutate, onError, mountRef],
    );

    const reset = useCallback(() => {
      resetMutation();
    }, [resetMutation]);

    return { data, isPending, error, mutate, reset };
  }

  function useDelete(options: UseDeleteMutateOptions = {}): UseDeleteMutateResult {
    const { requestConfig, onSuccess, onError, onSettled } = options;
    // `useDelete` has no hook-level `data` state (delete returns a string
    // the consumer can read off the resolved mutation), but it still
    // needs `mountRef` to gate the `mutate` wrapper's `onError` after
    // unmount (ARR-04 req 4) so the public `onError` callback is not
    // invoked for a mutation that settles post-unmount.
    const mountRef = useMountRef();

    const execute = useCallback(
      async (deleteId: string): Promise<Response<string>> => {
        const res = (await modelService.delete(deleteId, requestConfig).exec()) as unknown as Response<string>;
        assertSuccess(res);
        return res;
      },
      // ARR-06: see the `useCreate.execute` disable rationale — same
      // `createModelHooks` closure-capture pattern.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [modelService, requestConfig],
    );

    // ARR-07: `useDelete` does not expose hook-level `data`, so the
    // projection is a never-called null placeholder (`D = null`). The
    // active-count `isPending` and latest-invocation-wins `error`
    // semantics still apply: a second delete invoked before the first
    // settles keeps `isPending` true, and a stale failure cannot
    // overwrite a newer invocation's already-exposed `error`.
    const {
      isPending,
      error,
      executeMutate,
      reset: resetMutation,
    } = useMutation<[string], Response<string>, null>(
      execute as (...args: [string]) => Promise<Response<string>>,
      () => null,
      { onSuccess, onSettled },
    );

    const mutate = useCallback(
      async (deleteId: string): Promise<Response<string>> => {
        try {
          return await executeMutate(deleteId);
        } catch (err) {
          // See useCreate.mutate: ARR-04 req 4 gates the wrapper's
          // `onError` on `mountRef.current`.
          if (mountRef.current) onError?.(err as ServiceError);
          throw err;
        }
      },
      [executeMutate, onError, mountRef],
    );

    const reset = useCallback(() => {
      resetMutation();
    }, [resetMutation]);

    return { isPending, error, mutate, reset };
  }

  // ── Count ──

  function useCount(options: UseCountQueryOptions<T> = {}): UseCountQueryResult {
    const { advanced, filter, enabled = true, requestConfig, onSuccess, onError, onSettled } = options;
    const [data, setData] = useState<number | null>(null);
    const requestConfigRef = useLatestRef(requestConfig);

    const applyResult = useCallback((res: Response<number>) => {
      setData(res.data as number);
    }, []);

    // ARR-06 dependency-key policy. `filter` and `requestConfig` each
    // become a structural key; the auto-effect deps array contains the
    // resulting primitive strings.
    let filterKey: string;
    let requestKey: string;
    try {
      filterKey = requestKeyFor(filter);
      requestKey = requestKeyFor(requestConfigKeyInput(requestConfig));
    } catch (e) {
      if (e instanceof RequestKeyError) {
        throw new Error(`useCount: ${e.message}`, { cause: e });
      }
      throw e;
    }

    const doFetch = useCallback(
      async (signal?: AbortSignal): Promise<Response<number>> => {
        // The `signal` passed in is already the composed signal (Task
        // ARR-05). Composition lives in `useAutoQuery`'s entry points;
        // `doFetch` forwards the signal via a fresh shallow copy so the
        // caller's `requestConfig` and headers retain identity/content.
        const forwardedConfig = mergeRequestConfig(requestConfigRef.current, signal);
        if (advanced) {
          // ARC-21: countAdvanced no longer accepts the obsolete `access`
          // second argument (the server's `countBodySchema` rejects it).
          const raw = (await modelService
            .countAdvanced((filter ?? {}) as FilterQuery<T>, forwardedConfig)
            .exec()) as unknown as Response<number>;
          assertSuccess(raw);
          return raw;
        }
        const raw = (await modelService.count(forwardedConfig).exec()) as unknown as Response<number>;
        assertSuccess(raw);
        return raw;
      },
      // ARR-06: `filterKey`, `requestKey` are structural digests of
      // `filter` and `requestConfig`; the lint rule cannot see the
      // derivation, so silence the missing-deps warning.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [modelService, advanced, filterKey, requestKey],
    );

    // ARR-06 req 5: keep callbacks current without making callback
    // identity trigger a network request.
    const onSuccessStable = useEventCallback<[Response<number>], void>(onSuccess);
    const onErrorStable = useEventCallback<[ServiceError], void>(onError);
    const onSettledStable = useEventCallback<[Response<number> | null, ServiceError | null], void>(onSettled);
    const getRequestSignal = useCallback(() => requestConfigRef.current?.signal, [requestConfigRef]);

    const {
      isLoading,
      isFetching,
      error,
      refetch,
      query: runQuery,
      resetError,
      resetLoading,
    } = useAutoQuery<Response<number>>({
      doFetch,
      applyResult,
      shouldFetch: enabled,
      deps: [enabled, advanced, filterKey, requestKey],
      getRequestSignal,
      onSuccess: onSuccessStable,
      onError: onErrorStable,
      onSettled: onSettledStable,
    });

    // Manual `query()` reuses the unified lifecycle. The hook's `doFetch`
    // already encodes the advanced vs. basic branch, so the override
    // delegates directly. Per-call `options.signal` (ARR-05) is composed
    // with the hook-owned controller via `runQuery`'s `callerSignal`
    // plumbing.
    const query = useCallback(
      (callOptions?: QueryCallOptions): Promise<Response<number>> => runQuery(doFetch, callOptions?.signal),
      [runQuery, doFetch],
    );

    const reset = useCallback(() => {
      setData(null);
      resetError();
      resetLoading();
    }, [resetError, resetLoading]);

    return { data, isLoading, isFetching, error, query, refetch, reset };
  }

  // ── Distinct ──

  function useDistinct(options: UseDistinctQueryOptions<T>): UseDistinctQueryResult {
    const { field, conditions, enabled = true, requestConfig, onSuccess, onError, onSettled } = options;
    const [data, setData] = useState<string[] | null>(null);
    const requestConfigRef = useLatestRef(requestConfig);

    const applyResult = useCallback((res: Response<string[]>) => {
      setData(res.data as string[]);
    }, []);

    // ARR-06 dependency-key policy.
    let conditionsKey: string;
    let requestKey: string;
    try {
      conditionsKey = requestKeyFor(conditions);
      requestKey = requestKeyFor(requestConfigKeyInput(requestConfig));
    } catch (e) {
      if (e instanceof RequestKeyError) {
        throw new Error(`useDistinct: ${e.message}`, { cause: e });
      }
      throw e;
    }

    const doFetch = useCallback(
      async (signal?: AbortSignal): Promise<Response<string[]>> => {
        // The `signal` passed in is already the composed signal (Task
        // ARR-05). Composition lives in `useAutoQuery`'s entry points;
        // `doFetch` forwards the signal via a fresh shallow copy so the
        // caller's `requestConfig` and headers retain identity/content.
        const forwardedConfig = mergeRequestConfig(requestConfigRef.current, signal);
        if (conditions && Object.keys(conditions).length > 0) {
          const raw = (await modelService
            .distinctAdvanced(field, conditions as FilterQuery<T>, forwardedConfig)
            .exec()) as unknown as Response<string[]>;
          assertSuccess(raw);
          return raw;
        }
        const raw = (await modelService.distinct(field, forwardedConfig).exec()) as unknown as Response<string[]>;
        assertSuccess(raw);
        return raw;
      },
      // ARR-06: `conditionsKey`, `requestKey` are structural digests
      // of `conditions` and `requestConfig`; the lint rule cannot see
      // the derivation, so silence the missing-deps warning.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [modelService, field, conditionsKey, requestKey],
    );

    // ARR-06 req 5: keep callbacks current without making callback
    // identity trigger a network request.
    const onSuccessStable = useEventCallback<[Response<string[]>], void>(onSuccess);
    const onErrorStable = useEventCallback<[ServiceError], void>(onError);
    const onSettledStable = useEventCallback<[Response<string[]> | null, ServiceError | null], void>(onSettled);
    const getRequestSignal = useCallback(() => requestConfigRef.current?.signal, [requestConfigRef]);

    const {
      isLoading,
      isFetching,
      error,
      refetch,
      query: runQuery,
      resetError,
      resetLoading,
    } = useAutoQuery<Response<string[]>>({
      doFetch,
      applyResult,
      shouldFetch: enabled,
      deps: [enabled, field, conditionsKey, requestKey],
      getRequestSignal,
      onSuccess: onSuccessStable,
      onError: onErrorStable,
      onSettled: onSettledStable,
    });

    // Manual `query()` reuses the unified lifecycle. Per-call
    // `options.signal` (ARR-05) is composed with the hook-owned
    // controller via `runQuery`'s `callerSignal` plumbing.
    const query = useCallback(
      (callOptions?: QueryCallOptions): Promise<Response<string[]>> => runQuery(doFetch, callOptions?.signal),
      [runQuery, doFetch],
    );

    const reset = useCallback(() => {
      setData(null);
      resetError();
      resetLoading();
    }, [resetError, resetLoading]);

    return { data, isLoading, isFetching, error, query, refetch, reset };
  }

  return {
    useRead,
    useList,
    useCreate,
    useUpdate,
    useUpsert,
    useDelete,
    useCount,
    useDistinct,
  };
}
