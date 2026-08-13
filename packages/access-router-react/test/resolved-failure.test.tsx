//
// Focused regression tests for resolved HTTP/authorization failures
// (Task ARR-02). The client defaults to resolving failed
// HTTP/network operations as `FailureResult`; it only rejects when
// `throwOnError: true`. Before ARR-02 every React hook assumed every
// resolved value was a success, so:
//
//   - `onSuccess` ran for 401/403/500 responses,
//   - mutations resolved normally and stored `null` in `data`,
//   - `useList` wrote `null` into its `(Model<T> & T)[]` state,
//   - hook `error` stayed `null` for an authorization failure.
//
// These tests use the harness's `planNextFailure(method, failure)` planner
// (the resolved `{ success: false, data: null }` shape the client takes
// by default — see `./support/mock-service.ts`) and assert the
// post-ARR-02 lifecycle for each entry path:
//
//   1. `error` is set (the hook enters the error lifecycle).
//   2. `onError` is called exactly once with a ServiceError preserving
//      `message`, `status`, `raw`, and `headers`.
//   3. `onSuccess` is NOT called for `success: false`.
//   4. Hook `data` and `useList().totalCount` keep their last valid /
//      default values (no `null` write).
//   5. Mutations reject so a caller `await`s a thrown ServiceError.
//
// The shared-hotspot guidance in the remediation task file asks later
// tasks to prefer focused files over editing `test/hooks.test.tsx`,
// so the regression coverage lives here instead of in the legacy suite.
//

import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { createModelHooks } from '../src/create-model-hook';
import type { Document, ListModelResponse, Model, ModelResponse } from '@web-ts-toolkit/access-router-client';
import { ServiceError } from '@web-ts-toolkit/access-router-client';
import {
  createMockService,
  makeFailureResult,
  flushMicrotasks,
  type MockMethodName,
  type MethodResult,
} from './support';

interface TestDoc extends Document {
  _id: string;
  name: string;
  status: string;
}

/**
 * Standard seed of success results so the post-ARR-02 hook state still
 * observes the success branch for tests that need it. Failure-only
 * tests pre-arm `planNextFailure` and never read this seed.
 */
function makeSeed(): ReturnType<typeof createMockService<TestDoc>>['seed'] {
  const listResult: ListModelResponse<TestDoc> = {
    success: true,
    raw: [{ _id: '1', name: 'Existing', status: 'active' }],
    data: [{ _id: '1', name: 'Existing', status: 'active' }] as (Model<TestDoc> & TestDoc)[],
    message: 'ok',
    status: 200,
    headers: {},
    totalCount: 1,
  };
  const readResult: ModelResponse<TestDoc> = {
    success: true,
    raw: { _id: '1', name: 'Existing', status: 'active' },
    data: { _id: '1', name: 'Existing', status: 'active' } as Model<TestDoc> & TestDoc,
    message: 'ok',
    status: 200,
    headers: {},
  };
  return {
    list: listResult,
    read: readResult,
    create: readResult,
    delete: { success: true, raw: '1', data: '1', message: 'ok', status: 200, headers: {} },
    count: { success: true, raw: 7, data: 7, message: 'ok', status: 200, headers: {} },
    distinct: {
      success: true,
      raw: ['active', 'pending'],
      data: ['active', 'pending'],
      message: 'ok',
      status: 200,
      headers: {},
    },
  };
}

/**
 * Build the resolved `FailureResult` payload the client produces on a
 * failing HTTP response (the default — no `throwOnError`). The same
 * shape is plumbed through every service method's resolved value via
 * `planNextFailure(method, failure)`, so the test exercises the
 * resolved-failure branch rather than a transport rejection.
 */
function makeResolvedFailure(
  overrides: Partial<{ status: number; message: string; raw: unknown; headers: Record<string, string> }>,
) {
  return makeFailureResult({
    status: overrides.status ?? 403,
    message: overrides.message ?? 'Forbidden',
    raw: overrides.raw ?? { code: 'AUTHZ' },
    headers: overrides.headers ?? { 'X-Trace': 'denied' },
  });
}

/**
 * Cast the failure payload to the matching `MethodResult<T, M>`. The
 * harness declares `MethodResult<T, 'list'>` as a `ListModelResponse<T>`
 * — a success-shaped `Response<...>` widended with `totalCount`. The
 * client's default failure carries `data: null` and no `totalCount`,
 * but the runtime hook only inspects the failure's `success`/`message`/
 * `status`/`raw`/`headers` fields. `assertSuccess` branches on
 * `success: false` and never reads `totalCount` from the failure, so the
 * structural absence is safe at runtime. The test-side cast keeps the
 * `planNextFailure` input type aligned with the harness signature.
 */
function asMethodFailure<T extends Document, M extends MockMethodName>(
  method: M,
  failure: ReturnType<typeof makeResolvedFailure>,
): MethodResult<T, M> {
  // The failure always satisfies the base `Response<...>` failure
  // branch; `ListModelResponse<T>` adds `totalCount`, but the hook
  // never reads it on the failure path. The cast is the documented
  // single test-side skipping described in `mock-service.ts`'s
  // `planNextFailure`; the harness itself performs the resolved-failure
  // delivery without any client-side cast.
  if (method === 'list' || method === 'listAdvanced') {
    return { ...(failure as object), totalCount: 0 } as unknown as MethodResult<T, M>;
  }
  return failure as unknown as MethodResult<T, M>;
}

// ── Shared assertion helpers ──

/**
 * Asserts the resolved-failure lifecycle for a query hook: `onError`
 * is called once with a `ServiceError` preserving the failure's
 * `message`/`status`/`raw`/`headers`; `onSuccess` is never called; the
 * hook's `error` state is set to the same ServiceError.
 */
function expectQueryFailureLifecycle(
  onSuccess: ReturnType<typeof vi.fn>,
  onError: ReturnType<typeof vi.fn>,
  failure: ReturnType<typeof makeResolvedFailure>,
) {
  expect(onSuccess).not.toHaveBeenCalled();
  expect(onError).toHaveBeenCalledTimes(1);
  const [errArg] = onError.mock.calls[0] as [ServiceError];
  expect(errArg).toBeInstanceOf(ServiceError);
  expect(errArg.success).toBe(false);
  expect(errArg.data).toBeNull();
  expect(errArg.status).toBe(failure.status);
  expect(errArg.message).toBe(failure.message);
  expect(errArg.raw).toEqual(failure.raw);
  expect(errArg.headers).toEqual(failure.headers);
}

/**
 * Asserts the resolved-failure lifecycle for a mutation: the mutation
 * rejects with a `ServiceError` preserving the failure's
 * `message`/`status`/`raw`/`headers`; `onSuccess` is never called;
 * `onError` is called exactly once; the hook's `error` state is set.
 */
function expectMutationFailureLifecycle(
  onSuccess: ReturnType<typeof vi.fn>,
  onError: ReturnType<typeof vi.fn>,
  failure: ReturnType<typeof makeResolvedFailure>,
  thrown: unknown,
) {
  expect(thrown).toBeInstanceOf(ServiceError);
  const svcErr = thrown as ServiceError;
  expect(svcErr.success).toBe(false);
  expect(svcErr.data).toBeNull();
  expect(svcErr.status).toBe(failure.status);
  expect(svcErr.message).toBe(failure.message);
  expect(svcErr.raw).toEqual(failure.raw);
  expect(svcErr.headers).toEqual(failure.headers);
  expect(onSuccess).not.toHaveBeenCalled();
  expect(onError).toHaveBeenCalledTimes(1);
  expect(onError).toHaveBeenCalledWith(svcErr);
}

describe('ARR-02 resolved-failure normalization', () => {
  describe('auto query hooks (effect path)', () => {
    it('useRead: a resolved 403 enters the error lifecycle exactly once and preserves data', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const failure = makeResolvedFailure({ status: 403, message: 'Forbidden' });
      mock.planNextFailure('read', asMethodFailure<TestDoc, 'read'>('read', failure));

      const onSuccess = vi.fn();
      const onError = vi.fn();
      const onSettled = vi.fn();
      const { useRead } = createModelHooks({ modelService: mock.service });
      const initial = { _id: 'cached', name: 'Cached', status: 'active' } as Model<TestDoc> & TestDoc;
      const { result } = renderHook(() => useRead({ id: '1', initialData: initial, onSuccess, onError, onSettled }));

      await waitFor(() => {
        expect(result.current.error).toBeInstanceOf(ServiceError);
      });

      expectQueryFailureLifecycle(onSuccess, onError, failure);
      // onSettled called once with (null, ServiceError) exactly.
      expect(onSettled).toHaveBeenCalledTimes(1);
      const [, settledErrArg] = onSettled.mock.calls[0] as [unknown, ServiceError];
      expect(settledErrArg).toBeInstanceOf(ServiceError);
      // Pre-ARR-02 the hook wrote `null` into `data` from `res.data`.
      // Post-ARR-02 the last valid (here: initialData) value is preserved.
      expect(result.current.data).toEqual(initial);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isFetching).toBe(false);
    });

    it('useList: a resolved 401 leaves `data` as an array and `totalCount` valid; success callbacks never fire', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const failure = makeResolvedFailure({ status: 401, message: 'Unauthorized' });
      mock.planNextFailure('list', asMethodFailure<TestDoc, 'list'>('list', failure));

      const onSuccess = vi.fn();
      const onError = vi.fn();
      const onSettled = vi.fn();
      const { useList } = createModelHooks({ modelService: mock.service });
      const initial = [{ _id: 'a', name: 'First', status: 'active' }] as (Model<TestDoc> & TestDoc)[];
      const { result } = renderHook(() =>
        useList({ listParams: { page: 1 }, initialData: initial, onSuccess, onError, onSettled }),
      );

      await waitFor(() => {
        expect(result.current.error).toBeInstanceOf(ServiceError);
      });

      expectQueryFailureLifecycle(onSuccess, onError, failure);
      expect(onSettled).toHaveBeenCalledTimes(1);
      // The hook contracts `data` to an array; a resolved failure must
      // NOT write `null` here. Pre-ARR-02 useList set `data = null`.
      expect(Array.isArray(result.current.data)).toBe(true);
      expect(result.current.data).toEqual(initial);
      // `totalCount` is not part of the failure payload, so a resolved
      // failure must not overwrite the initial/last valid total. The
      // hook's initial `totalCount` state is `0` (the hook does not
      // infer it from `initialData` length); ARR-02's invariant is
      // that this default is preserved through a resolved failure.
      expect(result.current.totalCount).toBe(0);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isFetching).toBe(false);
    });

    it('useCount: a resolved 500 enters the error lifecycle and preserves last valid data', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const failure = makeResolvedFailure({ status: 500, message: 'Server error' });
      mock.planNextFailure('count', asMethodFailure<TestDoc, 'count'>('count', failure));

      const onSuccess = vi.fn();
      const onError = vi.fn();
      const { useCount } = createModelHooks({ modelService: mock.service });
      const { result } = renderHook(() => useCount({ onSuccess, onError }));

      await waitFor(() => {
        expect(result.current.error).toBeInstanceOf(ServiceError);
      });

      expectQueryFailureLifecycle(onSuccess, onError, failure);
      // Count's data stays at its initial value (`null` here); the hook
      // must NOT write `failure.data` (also `null` in this case) into
      // state via `applyResult`. The assertion below is structural —
      // the failure path skips `setData` entirely.
      expect(result.current.data).toBeNull();
      expect(result.current.error).toBeInstanceOf(ServiceError);
    });

    it('useDistinct: a resolved 403 enters the error lifecycle and preserves data', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const failure = makeResolvedFailure({ status: 403, message: 'Forbidden' });
      mock.planNextFailure('distinct', asMethodFailure<TestDoc, 'distinct'>('distinct', failure));

      const onSuccess = vi.fn();
      const onError = vi.fn();
      const { useDistinct } = createModelHooks({ modelService: mock.service });
      const { result } = renderHook(() => useDistinct({ field: 'status', onSuccess, onError }));

      await waitFor(() => {
        expect(result.current.error).toBeInstanceOf(ServiceError);
      });

      expectQueryFailureLifecycle(onSuccess, onError, failure);
      expect(result.current.data).toBeNull();
    });
  });

  describe('useList advanced path', () => {
    it('useList(listAdvanced): a resolved 403 enters the error lifecycle; data stays array', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const failure = makeResolvedFailure({ status: 403, message: 'Forbidden' });
      mock.planNextFailure('listAdvanced', asMethodFailure<TestDoc, 'listAdvanced'>('listAdvanced', failure));

      const onSuccess = vi.fn();
      const onError = vi.fn();
      const { useList } = createModelHooks({ modelService: mock.service });
      const initial = [{ _id: 'b', name: 'Cached', status: 'pending' }] as (Model<TestDoc> & TestDoc)[];
      const { result } = renderHook(() =>
        useList({ advanced: true, filter: { status: 'active' }, initialData: initial, onSuccess, onError }),
      );

      await waitFor(() => {
        expect(result.current.error).toBeInstanceOf(ServiceError);
      });

      expectQueryFailureLifecycle(onSuccess, onError, failure);
      expect(Array.isArray(result.current.data)).toBe(true);
      expect(result.current.data).toEqual(initial);
    });
  });

  describe('manual query() path', () => {
    it('useRead.query(): a resolved 403 rejects, sets error, and never calls onSuccess', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const failure = makeResolvedFailure({ status: 403, message: 'Forbidden' });
      // The first call is the manual `query('1')`, so pre-arm failure
      // for the next read invocation. enabled:false suppresses the
      // auto-fetch effect so only the manual call fires.
      mock.planNextFailure('read', asMethodFailure<TestDoc, 'read'>('read', failure));

      const onSuccess = vi.fn();
      const onError = vi.fn();
      const onSettled = vi.fn();
      const { useRead } = createModelHooks({ modelService: mock.service });
      const { result } = renderHook(() => useRead({ id: undefined, enabled: false, onSuccess, onError, onSettled }));

      let thrown: unknown;
      await act(async () => {
        try {
          await result.current.query('1');
        } catch (err) {
          thrown = err;
        }
      });
      await flushMicrotasks();

      expect(thrown).toBeInstanceOf(ServiceError);
      expectQueryFailureLifecycle(onSuccess, onError, failure);
      expect(onSettled).toHaveBeenCalledTimes(1);
      const [, settledErrArg] = onSettled.mock.calls[0] as [unknown, ServiceError];
      expect(settledErrArg).toBeInstanceOf(ServiceError);
      expect(result.current.error).toBeInstanceOf(ServiceError);
    });

    it('useList.query(): a resolved 401 rejects, leaves `data` an array, and preserves totalCount', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const failure = makeResolvedFailure({ status: 401, message: 'Unauthorized' });
      mock.planNextFailure('list', asMethodFailure<TestDoc, 'list'>('list', failure));

      const onSuccess = vi.fn();
      const onError = vi.fn();
      const { useList } = createModelHooks({ modelService: mock.service });
      const initial = [{ _id: 'c', name: 'Initial', status: 'active' }] as (Model<TestDoc> & TestDoc)[];
      const { result } = renderHook(() => useList({ initialData: initial, enabled: false, onSuccess, onError }));

      let thrown: unknown;
      await act(async () => {
        try {
          await result.current.query({ page: 1 });
        } catch (err) {
          thrown = err;
        }
      });
      await flushMicrotasks();

      expect(thrown).toBeInstanceOf(ServiceError);
      expectQueryFailureLifecycle(onSuccess, onError, failure);
      expect(Array.isArray(result.current.data)).toBe(true);
      expect(result.current.data).toEqual(initial);
      // The hook's `totalCount` initial state is `0` (the hook does
      // not infer from `initialData` length); the failure must not
      // advance or regress it.
      expect(result.current.totalCount).toBe(0);
    });

    it('useCount.query(): a resolved 500 rejects and sets error', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const failure = makeResolvedFailure({ status: 500, message: 'Server error' });
      mock.planNextFailure('count', asMethodFailure<TestDoc, 'count'>('count', failure));

      const onSuccess = vi.fn();
      const onError = vi.fn();
      const { useCount } = createModelHooks({ modelService: mock.service });
      const { result } = renderHook(() => useCount({ enabled: false, onSuccess, onError }));

      let thrown: unknown;
      await act(async () => {
        try {
          await result.current.query();
        } catch (err) {
          thrown = err;
        }
      });
      await flushMicrotasks();

      expect(thrown).toBeInstanceOf(ServiceError);
      expectQueryFailureLifecycle(onSuccess, onError, failure);
      expect(result.current.error).toBeInstanceOf(ServiceError);
    });

    it('useDistinct.query(): a resolved 403 rejects and sets error', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const failure = makeResolvedFailure({ status: 403, message: 'Forbidden' });
      mock.planNextFailure('distinct', asMethodFailure<TestDoc, 'distinct'>('distinct', failure));

      const onSuccess = vi.fn();
      const onError = vi.fn();
      const { useDistinct } = createModelHooks({ modelService: mock.service });
      const { result } = renderHook(() => useDistinct({ field: 'status', enabled: false, onSuccess, onError }));

      let thrown: unknown;
      await act(async () => {
        try {
          await result.current.query();
        } catch (err) {
          thrown = err;
        }
      });
      await flushMicrotasks();

      expect(thrown).toBeInstanceOf(ServiceError);
      expectQueryFailureLifecycle(onSuccess, onError, failure);
      expect(result.current.error).toBeInstanceOf(ServiceError);
    });
  });

  describe('refetch() path', () => {
    it('useRead.refetch(): a resolved 403 calls onError once and sets error state', async () => {
      // First call is the auto-fetch on mount — arm it as success;
      // second call is the manual refetch() — arm it as failure.
      const seed = makeSeed();
      const mock = createMockService<TestDoc>(seed);
      const { useRead } = createModelHooks({ modelService: mock.service });
      const onSuccess = vi.fn();
      const onError = vi.fn();
      const onSettled = vi.fn();
      const { result } = renderHook(() => useRead({ id: '1', onSuccess, onError, onSettled }));
      await waitFor(() => {
        expect(result.current.data).toEqual(seed.read.data);
      });

      const failure = makeResolvedFailure({ status: 403, message: 'Forbidden' });
      mock.planNextFailure('read', asMethodFailure<TestDoc, 'read'>('read', failure));

      act(() => {
        result.current.refetch();
      });
      await waitFor(() => {
        expect(result.current.error).toBeInstanceOf(ServiceError);
      });

      // The auto-fetch's success settled once; refetch's failure settles
      // once. onSuccess has exactly one call (the auto success).
      expect(onSuccess).toHaveBeenCalledTimes(1);
      // onError fires exactly once for the refetch failure.
      expect(onError).toHaveBeenCalledTimes(1);
      const [errArg] = onError.mock.calls[0] as [ServiceError];
      expect(errArg).toBeInstanceOf(ServiceError);
      expect(errArg.status).toBe(failure.status);
      expect(errArg.message).toBe(failure.message);
      expect(errArg.raw).toEqual(failure.raw);
      expect(errArg.headers).toEqual(failure.headers);
      // The previously-fetched data is preserved — the failure did NOT
      // overwrite it.
      expect(result.current.data).toEqual(seed.read.data);
    });
  });

  describe('mutation hooks', () => {
    it('useCreate: a resolved 403 rejects, calls onError exactly once, never calls onSuccess, and does not replace data', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const failure = makeResolvedFailure({ status: 403, message: 'Forbidden' });
      mock.planNextFailure('create', asMethodFailure<TestDoc, 'create'>('create', failure));

      const onSuccess = vi.fn();
      const onError = vi.fn();
      const onSettled = vi.fn();
      const { useCreate } = createModelHooks({ modelService: mock.service });
      const { result } = renderHook(() => useCreate({ onSuccess, onError, onSettled }));

      let thrown: unknown;
      await act(async () => {
        try {
          await result.current.mutate({ name: 'New' });
        } catch (err) {
          thrown = err;
        }
      });
      await flushMicrotasks();

      expectMutationFailureLifecycle(onSuccess, onError, failure, thrown);
      expect(onSettled).toHaveBeenCalledTimes(1);
      const [, settledErrArg] = onSettled.mock.calls[0] as [unknown, ServiceError];
      expect(settledErrArg).toBeInstanceOf(ServiceError);
      expect(result.current.isPending).toBe(false);
      // The hook issued NO `setData(res.data)` because the failure
      // path rejects before the data-state write.
      expect(result.current.data).toBeNull();
      expect(result.current.error).toBeInstanceOf(ServiceError);
    });

    it('useCreate preserves last successful data after a resolved failure', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useCreate } = createModelHooks({ modelService: mock.service });
      const { result } = renderHook(() => useCreate());

      // First mutation succeeds; `data` is set to the created record.
      await act(async () => {
        await result.current.mutate({ name: 'First' });
      });
      const firstData = result.current.data;
      expect(firstData).not.toBeNull();

      // Second mutation resolves to a failure.
      const failure = makeResolvedFailure({ status: 500, message: 'Server error' });
      mock.planNextFailure('create', asMethodFailure<TestDoc, 'create'>('create', failure));
      const onError = vi.fn();
      // Re-arming callbacks is not necessary; mutate failure still
      // propagates via `useMutation`. The onError here just verifies
      // the user-facing failure callback fires once for the push.

      let thrown: unknown;
      await act(async () => {
        try {
          // Re-render with onError so the mutate() wrapper sees it.
          // (Without re-render, the original useMutation option has no
          // onError registered. We instead assert on hook state and the
          // rejection of the promise.)
          await result.current.mutate({ name: 'Second' });
        } catch (err) {
          thrown = err;
        }
      });
      await flushMicrotasks();

      expect(thrown).toBeInstanceOf(ServiceError);
      // Pre-ARR-02 the hook wrote `null` into `data` (the failure's
      // `data: null`). Post-ARR-02 the last successful value stays.
      expect(result.current.data).toEqual(firstData);
      expect(result.current.error).toBeInstanceOf(ServiceError);
      void onError;
    });

    it('useUpdate: a resolved 403 rejects, calls onError once, never calls onSuccess, and does not replace data', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const failure = makeResolvedFailure({ status: 403, message: 'Forbidden' });
      mock.planNextFailure('update', asMethodFailure<TestDoc, 'update'>('update', failure));

      const onSuccess = vi.fn();
      const onError = vi.fn();
      const { useUpdate } = createModelHooks({ modelService: mock.service });
      const { result } = renderHook(() => useUpdate({ onSuccess, onError }));

      let thrown: unknown;
      await act(async () => {
        try {
          await result.current.mutate('1', { name: 'Updated' });
        } catch (err) {
          thrown = err;
        }
      });
      await flushMicrotasks();

      expectMutationFailureLifecycle(onSuccess, onError, failure, thrown);
      expect(result.current.data).toBeNull();
      expect(result.current.error).toBeInstanceOf(ServiceError);
    });

    it('useUpsert: a resolved 401 rejects, calls onError once, never calls onSuccess', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const failure = makeResolvedFailure({ status: 401, message: 'Unauthorized' });
      mock.planNextFailure('upsert', asMethodFailure<TestDoc, 'upsert'>('upsert', failure));

      const onSuccess = vi.fn();
      const onError = vi.fn();
      const { useUpsert } = createModelHooks({ modelService: mock.service });
      const { result } = renderHook(() => useUpsert({ onSuccess, onError }));

      let thrown: unknown;
      await act(async () => {
        try {
          await result.current.mutate({ name: 'Upserted' });
        } catch (err) {
          thrown = err;
        }
      });
      await flushMicrotasks();

      expectMutationFailureLifecycle(onSuccess, onError, failure, thrown);
      expect(result.current.data).toBeNull();
      expect(result.current.error).toBeInstanceOf(ServiceError);
    });

    it('useDelete: a resolved 403 rejects, calls onError once, never calls onSuccess', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const failure = makeResolvedFailure({ status: 403, message: 'Forbidden' });
      mock.planNextFailure('delete', asMethodFailure<TestDoc, 'delete'>('delete', failure));

      const onSuccess = vi.fn();
      const onError = vi.fn();
      const { useDelete } = createModelHooks({ modelService: mock.service });
      const { result } = renderHook(() => useDelete({ onSuccess, onError }));

      let thrown: unknown;
      await act(async () => {
        try {
          await result.current.mutate('1');
        } catch (err) {
          thrown = err;
        }
      });
      await flushMicrotasks();

      expectMutationFailureLifecycle(onSuccess, onError, failure, thrown);
      expect(result.current.error).toBeInstanceOf(ServiceError);
    });
  });

  describe('discriminated clients do not require throwOnError', () => {
    it('a resolved failure reaches the error lifecycle even when no throwOnError option exists on the React hook', async () => {
      // The React hook surface never exposes a throwOnError escape hatch
      // for query/mutation options; ARR-02's contract is that resolved
      // failures enter the error lifecycle WITHOUT the consumer having
      // to opt into throwing. This test simply repeats a useRead 403
      // and asserts that the absence of any throwOnError-style option
      // does not let the failure slip past the lifecycle boundary.
      const mock = createMockService<TestDoc>(makeSeed());
      const failure = makeResolvedFailure({ status: 403, message: 'Forbidden' });
      mock.planNextFailure('read', asMethodFailure<TestDoc, 'read'>('read', failure));

      const onError = vi.fn();
      const { useRead } = createModelHooks({ modelService: mock.service });
      const { result } = renderHook(() => useRead({ id: '1', onError }));

      await waitFor(() => {
        expect(result.current.error).toBeInstanceOf(ServiceError);
      });
      expect(onError).toHaveBeenCalledTimes(1);
    });
  });

  describe('Response discriminated payload round-trip', () => {
    it('a resolved failure preserves message, status, raw, headers on the wire ServiceError', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const failure = makeResolvedFailure({
        status: 500,
        message: 'Gateway timeout',
        raw: { code: 'TIMEOUT', retryAfter: 30 },
        headers: { 'X-Trace': 'denied', 'Retry-After': '30' },
      });
      mock.planNextFailure('read', asMethodFailure<TestDoc, 'read'>('read', failure));

      const onError = vi.fn();
      const { useRead } = createModelHooks({ modelService: mock.service });
      const { result } = renderHook(() => useRead({ id: '1', onError }));

      await waitFor(() => {
        expect(result.current.error).toBeInstanceOf(ServiceError);
      });
      const [errArg] = onError.mock.calls[0] as [ServiceError];
      expect(errArg).toBeInstanceOf(ServiceError);
      expect(errArg.status).toBe(500);
      expect(errArg.message).toBe('Gateway timeout');
      expect(errArg.raw).toEqual({ code: 'TIMEOUT', retryAfter: 30 });
      expect(errArg.headers).toEqual({ 'X-Trace': 'denied', 'Retry-After': '30' });
    });
  });
});
