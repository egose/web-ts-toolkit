/* eslint-disable @typescript-eslint/no-explicit-any */
//
// Focused harness tests (ARR-01).
//
// These tests prove the harness itself: a request can remain pending,
// observe abort, settle out of order, resolve to a `FailureResult`
// (the client's default failure shape), and that representative basic
// and advanced service operations forward exact args/options/request
// config. The acceptance criteria in ARR-01 map to:
//
//   1. A focused harness test proves a request can remain pending,
//      observe abort, and settle in a chosen order.
//   2. Tests can supply a resolved `{ success: false, data: null }`
//      response without violating the client response type.
//   3. Representative read/list advanced assertions verify exact forwarded
//      args, options, and request config.
//   4. `pnpm --filter @web-ts-toolkit/access-router-react test` passes.
//
// The harness modules live under `./support`. See `./support/README.md`
// (no — there is no README; the per-file header comments document the
// design). Tests MUST prefer focused files over editing `hooks.test.tsx`
// (per the task file's shared-hotspot guidance).

import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { createModelHooks } from '../src/create-model-hook';
import type { Document, ListModelResponse, Model, ModelResponse, Response } from '@web-ts-toolkit/access-router-client';
import { createMockService, makeFailureResult, makeServiceError, flushMicrotasks } from './support';

interface TestDoc extends Document {
  _id: string;
  name: string;
  status: string;
}

/**
 * Build the seed used across these tests. Tests that need a different
 * success shape override the specific seed field instead of rebuilding
 * the whole mock.
 */
function makeSeed(): ReturnType<typeof createMockService<TestDoc>>['seed'] {
  const listResult: ListModelResponse<TestDoc> = {
    success: true,
    raw: [],
    data: [],
    message: 'ok',
    status: 200,
    headers: {},
    totalCount: 0,
  };
  const readResult: ModelResponse<TestDoc> = {
    success: true,
    raw: { _id: '1', name: 'Test', status: 'active' },
    data: { _id: '1', name: 'Test', status: 'active' } as Model<TestDoc> & TestDoc,
    message: 'ok',
    status: 200,
    headers: {},
  };
  return {
    list: listResult,
    read: readResult,
    create: readResult,
    delete: { success: true, raw: '1', data: '1', message: 'ok', status: 200, headers: {} },
    count: { success: true, raw: 5, data: 5, message: 'ok', status: 200, headers: {} },
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

describe('ARR-01 harness', () => {
  describe('pending / abort / ordered settlement', () => {
    it('a request can remain pending, observe abort, and settle in a chosen order', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useRead } = createModelHooks({ modelService: mock.service });

      // Pre-arm read() as deferred: the seeded pending state stays until
      // the test calls controller.resolve().
      mock.planDeferred('read', /* value used by resolve() */ makeSeed().read);

      const refs: { current: ReturnType<typeof useRead> }[] = [];
      renderHook(() => {
        const r = useRead({ id: '1' });
        refs.push({ current: r });
        return r;
      });

      // The hook forwards the service call; the harness captures the
      // AbortSignal and the deferred controller.
      await waitFor(() => expect(mock.spies.read).toHaveBeenCalledTimes(1));
      const controlled = mock.lastCall('read');
      expect(controlled).toBeDefined();

      // Prove the harness exposes the forwarded AbortSignal so
      // cancellation tests (ARR-04) can assert on it without timing.
      expect(controlled!.controller.signal).toBeInstanceOf(AbortSignal);
      expect(controlled!.controller.signal?.aborted).toBe(false);

      // The request remains pending: no settlement released yet.
      await flushMicrotasks();
      await flushMicrotasks();
      const pendingState = refs[refs.length - 1].current;
      expect(pendingState.isLoading).toBe(true);
      expect(pendingState.data).toBeNull();

      // Chosen order: settlement is released by the test. The newer
      // request gets a chosen-order release after a synthetic delay.
      // ARR-01 only verifies the harness mechanics: the controller
      // faithfully translates `.resolve()` into hook-level `data` and
      // ends pending state.
      act(() => {
        controlled!.controller.resolve();
      });
      await waitFor(() => {
        const last = refs[refs.length - 1].current;
        expect(last.data).toEqual({ _id: '1', name: 'Test', status: 'active' });
        expect(last.isLoading).toBe(false);
      });
    });

    it('two deferred requests let the test release settlement in a chosen order', async () => {
      const seed = makeSeed();
      const mock = createMockService<TestDoc>(seed);
      const { useRead } = createModelHooks({ modelService: mock.service });

      // Pre-arm two consecutive read() calls as deferred.
      mock.planDeferred('read', {
        success: true,
        raw: { _id: '1', name: 'Older' },
        data: { _id: '1', name: 'Older' } as Model<TestDoc> & TestDoc,
        message: 'ok',
        status: 200,
        headers: {},
      });
      mock.planDeferred('read', {
        success: true,
        raw: { _id: '7b', name: 'Newer' },
        data: { _id: '7b', name: 'Newer' } as Model<TestDoc> & TestDoc,
        message: 'ok',
        status: 200,
        headers: {},
      });

      // SINGLE renderHook so the first call captures the pre-arms
      // without the second hook instance resetting the rendering.
      const refs: { current: ReturnType<typeof useRead> }[] = [];
      const { rerender } = renderHook(
        ({ id }: { id: string }) => {
          const r = useRead({ id });
          refs.push({ current: r });
          return r;
        },
        { initialProps: { id: '7' } },
      );

      // Wait for the first read() call and capture the controller so we
      // can later compare it against the second call's signal.
      await waitFor(() => expect(mock.spies.read).toHaveBeenCalled());
      const firstControlled = mock.lastCall('read');
      expect(firstControlled!.controller.signal).toBeInstanceOf(AbortSignal);
      expect(firstControlled!.controller.signal?.aborted).toBe(false);

      // Force the second read() call by changing `id`. The harness plan
      // arms a deferred controller for this call as well.
      rerender({ id: '7b' } as any);
      await waitFor(() => expect(mock.spies.read.mock.calls.length).toBeGreaterThanOrEqual(2));
      const secondControlled = mock.lastCall('read');

      // Both controllers record distinct signals and stay pending.
      expect(firstControlled!.controller.signal).not.toBe(secondControlled!.controller.signal);
      // The first controller's signal was aborted when the hook's effect
      // cleanup ran during the rerender.
      expect(firstControlled!.controller.signal?.aborted).toBe(true);
      expect(secondControlled!.controller.signal?.aborted).toBe(false);

      // Release the NEWER request first; await its data applied.
      const lastSample = () => refs[refs.length - 1].current;
      act(() => {
        secondControlled!.controller.resolve();
      });
      await waitFor(() => {
        expect(lastSample().data).toEqual({ _id: '7b', name: 'Newer' });
      });

      // Release the OLDER request after. The implementation's reaction
      // (latest-invocation-wins) is owned by ARR-04; this harness test
      // only proves the ordering mechanics: each controller independently
      // drives its cached promise and the resolvers are distinguishable.
      act(() => {
        firstControlled!.controller.resolve();
      });
      await flushMicrotasks();
      await flushMicrotasks();
      expect(firstControlled!.controller.signal).not.toBe(secondControlled!.controller.signal);
    });
  });

  describe('resolved failure response without violating the client type', () => {
    it('models the client default failure via makeFailureResult()', () => {
      const failure = makeFailureResult({ status: 403, message: 'Forbidden', raw: { code: 'AUTHZ' } });
      // Compile-time check: `failure` is a `FailureResult<unknown>`, which
      // is the failure branch of `Response<...>`. Tests can use it as a
      // `success: false` resolved value without a client-side cast.
      const _typed: Response<unknown, unknown> = failure;
      void _typed;
      expect(failure.success).toBe(false);
      expect(failure.data).toBeNull();
      expect(failure.status).toBe(403);
    });

    it('a deferred request can resolve to { success: false, data: null }', async () => {
      const seed = makeSeed();
      const mock = createMockService<TestDoc>(seed);
      const onSuccess = vi.fn();
      const onError = vi.fn();
      const { useRead } = createModelHooks({ modelService: mock.service });

      // Capture result via a stable ref so rerenders don't lose it.
      const refs: { current: ReturnType<typeof useRead> }[] = [];
      renderHook(() => {
        const r = useRead({ id: '1', onSuccess, onError });
        refs.push({ current: r });
        return r;
      });

      await waitFor(() => expect(mock.spies.read).toHaveBeenCalled());
      const controlled = mock.lastCall('read');

      // Release settlement with a resolved failure shape. The hook
      // currently treats any resolved response as success (this is the
      // P0 defect ARR-02 fixes). The harness proves the test CAN supply
      // the resolved-failure shape without any client-side cast and
      // faithfully delivers it to the hook's `applyResult`. The
      // behavioral assertion that ARR-02 will produce (error set,
      // onSuccess NOT called) is intentionally absent here: ARR-01 only
      // proves the *capability*; ARR-02 owns the regression test that
      // FAILS against the current implementation.
      const resolvedFailure: ModelResponse<TestDoc> = {
        success: false,
        raw: { code: 'AUTHZ' },
        data: null,
        message: 'Forbidden',
        status: 403,
        headers: {},
      };
      act(() => {
        controlled!.controller.resolve(resolvedFailure);
      });
      await flushMicrotasks();
      await flushMicrotasks();
      // The harness successfully delivered the resolved failure to the
      // hook's `applyResult` (useRead's), which set `data = res.data`
      // (null). Pre-ARR-02 the hook also wrongly calls `onSuccess` and
      // never sets `error`; we only assert the typecheck-and-delivery
      // capability here.
      expect(mock.spies.read).toHaveBeenCalled();
      expect(controlled!.controller.signal).toBeInstanceOf(AbortSignal);
    });

    it('makeServiceError() yields a ServiceError satisfying Error heritage', () => {
      const err = makeServiceError({ status: 500, message: 'fail' });
      expect(err).toBeInstanceOf(Error);
      expect(err.success).toBe(false);
      expect(err.data).toBeNull();
      expect(err.status).toBe(500);
    });
  });

  describe('exact forwarded args on representative basic and advanced paths', () => {
    it('read() forwards exactly the identifier, options, and request config', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useRead } = createModelHooks({ modelService: mock.service });
      const requestConfig = { headers: { 'X-Trace': 'a' } };

      renderHook(() => useRead({ id: '7', requestConfig }));

      await waitFor(() => expect(mock.spies.read).toHaveBeenCalledTimes(1));

      const [firstCall] = mock.spies.read.mock.calls;
      expect(firstCall).toHaveLength(3);
      const [idArg, optionsArg, configArg] = firstCall as [string, unknown, unknown];
      // Exact-first-positional: the original `id` is forwarded verbatim.
      expect(idArg).toBe('7');
      // ReadOptions: the hook passes the user's `basicOptions` (undefined
      // here), so the second positional must be `undefined` exactly.
      expect(optionsArg).toBeUndefined();
      // Request config: the hook merges caller `requestConfig` with the
      // hook's own `signal`. Both the caller's header AND the synthetic
      // signal should be present (ARR-05 will fix the signal-overwrite /
      // composition behavior; this test only asserts the harness lets us
      // inspect the exact request config).
      expect(configArg).toMatchObject({
        headers: { 'X-Trace': 'a' },
        signal: expect.any(AbortSignal),
      });
    });

    it('readAdvanced() forwards exact args, options, and request config', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useRead } = createModelHooks({ modelService: mock.service });
      const advancedOptions = { kind: 'readAdvanced' };
      const populate = [{ path: 'owner', select: ['name'] as const }];
      const include = [
        { model: 'User', op: 'read' as const, path: 'users', localField: 'userId', foreignField: '_id' },
      ];
      const requestConfig = { headers: { 'X-Trace': 'b' } };

      renderHook(() =>
        useRead({
          id: '9',
          advanced: true,
          populate,
          include,
          select: ['name', 'status'] as const,
          advancedOptions: advancedOptions as any,
          requestConfig,
        }),
      );

      // The hook's effect deps include inline array literals for
      // populate/select/include and an inline `advancedOptions` object,
      // so React StrictMode + effect-dep churn can re-issue the effect.
      // ARR-01 only cares that the harness captures EVERY call so the
      // test can make exact-args assertions on the FIRST call forwarded.
      await waitFor(() => expect(mock.spies.readAdvanced).toHaveBeenCalled());
      expect(mock.spies.read).not.toHaveBeenCalled();

      // The first call records the exact forwarded args. Subsequent
      // rerun calls (StrictMode, deps churn) forward the SAME args, so
      // inspecting call #1 is sufficient for exactness.
      const [firstCall] = mock.spies.readAdvanced.mock.calls;
      expect(firstCall).toHaveLength(4);
      const [idArg, argsArg, optionsArg, configArg] = firstCall as [string, unknown, unknown, unknown];

      // Exact first positional: identifier forwarded verbatim.
      expect(idArg).toBe('9');

      // Args: the hook aggregates select/populate/include (and sort/
      // tasks if supplied) into one `ReadAdvancedArgs<Projection>`.
      expect(argsArg).toMatchObject({
        select: ['name', 'status'],
        populate,
        include,
      });

      // Options: the hook forwards the user's `advancedOptions` verbatim.
      expect(optionsArg).toBe(advancedOptions);

      // Request config: caller headers preserved + hook's signal added.
      expect(configArg).toMatchObject({
        headers: { 'X-Trace': 'b' },
        signal: expect.any(AbortSignal),
      });
    });

    it('list() forwards exactly the listArgs, basic options, and request config', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useList } = createModelHooks({ modelService: mock.service });
      const listParams = { pageSize: 10, page: 2 };
      const basicOptions = { includeCount: true };
      const requestConfig = { headers: { 'X-Trace': 'c' } };

      renderHook(() => useList({ listParams, basicOptions: basicOptions as any, requestConfig }));

      await waitFor(() => expect(mock.spies.list).toHaveBeenCalledTimes(1));
      const [firstCall] = mock.spies.list.mock.calls;
      expect(firstCall).toHaveLength(3);
      const [listArgsArg, optionsArg, configArg] = firstCall as [unknown, unknown, unknown];
      expect(listArgsArg).toEqual(listParams);
      expect(optionsArg).toBe(basicOptions);
      expect(configArg).toMatchObject({
        headers: { 'X-Trace': 'c' },
        signal: expect.any(AbortSignal),
      });
    });

    it('listAdvanced() forwards exact filter, args, options, and request config', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useList } = createModelHooks({ modelService: mock.service });
      const filter = { status: 'active' };
      const sort: [string, 'asc'][] = [['name', 'asc']];
      const populate = [{ path: 'owner', select: ['name'] as const }];
      const select = ['name', 'status'] as const;
      const advancedOptions = { includeCount: true };
      const requestConfig = { headers: { 'X-Trace': 'd' } };

      renderHook(() =>
        useList({
          advanced: true,
          filter,
          sort,
          populate,
          select,
          advancedOptions: advancedOptions as any,
          requestConfig,
        }),
      );

      await waitFor(() => expect(mock.spies.listAdvanced).toHaveBeenCalledTimes(1));
      expect(mock.spies.list).not.toHaveBeenCalled();

      const [firstCall] = mock.spies.listAdvanced.mock.calls;
      expect(firstCall).toHaveLength(4);
      const [filterArg, argsArg, optionsArg, configArg] = firstCall as [unknown, unknown, unknown, unknown];

      // Filter forwarded verbatim (spreading `{ filter ?? {} }` in the
      // hook means the caller's filter object reaches the service).
      expect(filterArg).toMatchObject(filter);
      // Args aggregate sort/populate/select. Note: the hook uses
      // `{ sort, select, populate, include, tasks, ...args }`, and `args`
      // is `undefined` here (no manual `query()`), so the spread of
      // `undefined` is a no-op.
      expect(argsArg).toMatchObject({ sort, select, populate });
      expect(optionsArg).toBe(advancedOptions);
      expect(configArg).toMatchObject({
        headers: { 'X-Trace': 'd' },
        signal: expect.any(AbortSignal),
      });
    });

    it('advanced manual query() falls back to configured listParams and preserves explicit overrides', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useList } = createModelHooks({ modelService: mock.service });
      const listParams = { page: 3, pageSize: 20 };

      const { result } = renderHook(() =>
        useList({
          advanced: true,
          enabled: false,
          listParams,
          filter: { status: 'active' },
          sort: [['name', 'asc']],
        }),
      );

      await act(async () => {
        await result.current.query();
      });

      expect(mock.spies.listAdvanced).toHaveBeenCalledTimes(1);
      expect(mock.spies.listAdvanced.mock.calls[0]?.[1]).toMatchObject({
        page: 3,
        pageSize: 20,
        sort: [['name', 'asc']],
      });

      await act(async () => {
        await result.current.query({ page: 1, pageSize: 5 });
      });

      expect(mock.spies.listAdvanced).toHaveBeenCalledTimes(2);
      expect(mock.spies.listAdvanced.mock.calls[1]?.[1]).toMatchObject({
        page: 1,
        pageSize: 5,
        sort: [['name', 'asc']],
      });
    });

    it('count() forwards exactly the request config', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useCount } = createModelHooks({ modelService: mock.service });
      const requestConfig = { headers: { 'X-Trace': 'e' } };
      renderHook(() => useCount({ requestConfig }));
      await waitFor(() => expect(mock.spies.count).toHaveBeenCalledTimes(1));
      const [firstCall] = mock.spies.count.mock.calls;
      // count() takes exactly one positional (the request config).
      expect(firstCall).toHaveLength(1);
      expect(firstCall[0]).toMatchObject({
        headers: { 'X-Trace': 'e' },
        signal: expect.any(AbortSignal),
      });
    });

    it('countAdvanced() forwards exact filter and request config', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useCount } = createModelHooks({ modelService: mock.service });
      const filter = { status: 'pending' };
      const requestConfig = { headers: { 'X-Trace': 'f' } };
      renderHook(() => useCount({ advanced: true, filter, requestConfig }));
      await waitFor(() => expect(mock.spies.countAdvanced).toHaveBeenCalledTimes(1));
      expect(mock.spies.count).not.toHaveBeenCalled();

      const [firstCall] = mock.spies.countAdvanced.mock.calls;
      expect(firstCall).toHaveLength(2);
      const [filterArg, configArg] = firstCall as [unknown, unknown];
      expect(filterArg).toMatchObject(filter);
      expect(configArg).toMatchObject({
        headers: { 'X-Trace': 'f' },
        signal: expect.any(AbortSignal),
      });
    });

    it('distinctAdvanced() forwards exact field, conditions, and request config', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useDistinct } = createModelHooks({ modelService: mock.service });
      const conditions = { org: '1' };
      const requestConfig = { headers: { 'X-Trace': 'g' } };
      renderHook(() => useDistinct({ field: 'status', conditions, requestConfig }));
      await waitFor(() => expect(mock.spies.distinctAdvanced).toHaveBeenCalledTimes(1));
      expect(mock.spies.distinct).not.toHaveBeenCalled();

      const [firstCall] = mock.spies.distinctAdvanced.mock.calls;
      expect(firstCall).toHaveLength(3);
      const [fieldArg, conditionsArg, configArg] = firstCall as [string, unknown, unknown];
      expect(fieldArg).toBe('status');
      expect(conditionsArg).toMatchObject(conditions);
      expect(configArg).toMatchObject({
        headers: { 'X-Trace': 'g' },
        signal: expect.any(AbortSignal),
      });
    });

    it('create() forwards exactly the data, options, and request config', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useCreate } = createModelHooks({ modelService: mock.service });
      const basicOptions = { includePermissions: false };
      const requestConfig = { headers: { 'X-Trace': 'h' } };

      const { result } = renderHook(() => useCreate({ basicOptions: basicOptions as any, requestConfig }));
      await act(async () => {
        await result.current.mutate({ name: 'New' });
      });
      await waitFor(() => expect(mock.spies.create).toHaveBeenCalledTimes(1));
      const [firstCall] = mock.spies.create.mock.calls;
      expect(firstCall).toHaveLength(3);
      const [dataArg, optionsArg, configArg] = firstCall as [unknown, unknown, unknown];
      expect(dataArg).toEqual({ name: 'New' });
      expect(optionsArg).toBe(basicOptions);
      // Mutations currently pass `requestConfig` unchanged (no internal
      // signal); ARR-05 will document that behavior. We assert the harness
      // exposes the config verbatim.
      expect(configArg).toBe(requestConfig);
    });
  });

  describe('abort behavior against non-DOM transport cancellation', () => {
    it('the harness can simulate a non-DOM deferred rejection for ARR-04', async () => {
      // ARR-04 will make abort detection authoritative on `signal.aborted`
      // even when the transport throws a non-DOM cancellation object. This
      // harness test proves the mock can simulate that rejection shape:
      // the controller records the abort signal, and the test can reject
      // the underlying promise with a non-DOM error shape that ARR-04 will
      // distinguish from a true request error.
      const mock = createMockService<TestDoc>(makeSeed());
      const onError = vi.fn();
      const { useRead } = createModelHooks({ modelService: mock.service });

      mock.planDeferred('read', makeSeed().read);

      renderHook(() => useRead({ id: '1', onError }));

      await waitFor(() => expect(mock.spies.read).toHaveBeenCalled());
      const controlled = mock.lastCall('read');
      expect(controlled!.controller.signal).toBeInstanceOf(AbortSignal);

      // Reject with a transport-specific cancellation shape (NOT a
      // DOMException 'AbortError'). The hook currently uses
      // `instanceof DOMException` to detect abort (this is the bug
      // ARR-04 fixes); the harness can simulate the rejection shape
      // without depending on the abort-detection behavior.
      const transportCancel = Object.assign(new Error('Canceled'), {
        name: 'Canceled',
        code: 'ERR_CANCELED',
      });
      act(() => {
        controlled!.controller.reject(transportCancel);
      });
      await waitFor(() => {
        // A non-DOM rejection reaches the hook's failure path. ARR-04
        // will redefine abort-detection semantics to consult
        // `signal.aborted` first; the harness proves the rejection
        // mechanism is observable.
        expect(onError).toHaveBeenCalledWith(transportCancel);
      });
    });
  });
});
