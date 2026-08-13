//
// Focused regression tests for `useList.previousData` precise semantics and
// stable imperative function identities (Task ARR-08).
//
// Pre-ARR-08 the historical `keepPreviousData` test never invoked
// `refetch()`, never observed the pending state, and only asserted
// `previousData` was `undefined` after the initial fetch settled —
// trivially passing with or without `keepPreviousData`. Worse, the
// capture happened in `baseFetch` at request start but the clear only
// happened in `applyResult` on success, so a subsequent failure /
// cancellation / disable / reset could leave `previousData` pinned to a
// stale snapshot of the prior settled page indefinitely. And
// `useAbortManager()` returned a fresh `{ replace }` object literal on
// every render, churning the identity of `query`/`refetch` (which list
// `manager` in their `useCallback` deps) even though their effective
// behavior had not changed.
//
// ARR-08 fixes:
//   1. `previousData` is captured at the start of a replacement list
//      request ONLY when there is prior settled data (so the FIRST
//      request leaves it `undefined`). It is then cleared on EVERY
//      terminal path — success, failure, cancellation, disable (id
//      removed / `enabled=false`), and reset — via the shared
//      `useAutoQuery` lifecycle hooks (`onFailed`/`onAborted`/
//      `onDisabled`), not only on the success path inside `applyResult`.
//   2. `useAbortManager` now returns a ref-backed stable handle object so
//      `query`/`refetch` keep the same identity across unrelated
//      rerenders when `runWithCallbacks` and `manager`/`doFetch` are
//      unchanged.
//
// Tests use the harness in `./support`; see `./support/mock-service.ts`
// for the deferred-controller mechanics and `./support/lazy-request.ts`
// for the `controller.resolve()`/`.reject()`/`signal` semantics.
//

import { describe, it, expect } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { createModelHooks } from '../src/create-model-hook';
import type { Document, ListModelResponse, Model } from '@web-ts-toolkit/access-router-client';
import { createMockService, makeServiceError, flushMicrotasks } from './support';

interface TestDoc extends Document {
  _id: string;
  name: string;
  status: string;
}

function makeSeed(): ReturnType<typeof createMockService<TestDoc>>['seed'] {
  const listFirst: ListModelResponse<TestDoc> = {
    success: true,
    raw: [
      { _id: 'a', name: 'Alpha', status: 'active' },
      { _id: 'b', name: 'Bravo', status: 'active' },
    ],
    data: [
      { _id: 'a', name: 'Alpha', status: 'active' } as Model<TestDoc> & TestDoc,
      { _id: 'b', name: 'Bravo', status: 'active' } as Model<TestDoc> & TestDoc,
    ],
    message: 'ok',
    status: 200,
    headers: {},
    totalCount: 2,
  };
  return {
    list: listFirst,
    read: {
      success: true,
      raw: { _id: 'a', name: 'Alpha', status: 'active' },
      data: { _id: 'a', name: 'Alpha', status: 'active' } as Model<TestDoc> & TestDoc,
      message: 'ok',
      status: 200,
      headers: {},
    },
    create: {
      success: true,
      raw: { _id: 'a', name: 'Alpha', status: 'active' },
      data: { _id: 'a', name: 'Alpha', status: 'active' } as Model<TestDoc> & TestDoc,
      message: 'ok',
      status: 200,
      headers: {},
    },
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

describe('ARR-08: useList previousData precise semantics and stable imperative identities', () => {
  describe('previousData capture at request start', () => {
    it('during a SECOND pending request, previousData equals the first successful data', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useList } = createModelHooks({ modelService: mock.service });

      // First call is the initial mount auto-fetch — defer so we can
      // observe settlement explicitly.
      mock.planDeferred('list', makeSeed().list);

      const refs: { current: ReturnType<typeof useList> }[] = [];
      const { result } = renderHook(() => {
        const r = useList({ listParams: { pageSize: 10 }, keepPreviousData: true });
        refs.push({ current: r });
        return r;
      });

      // First request pending: no prior settled data, so previousData
      // MUST stay undefined throughout the first request's pending
      // window (ARR-08 req 1 — "prior settled data" is absent here).
      await waitFor(() => expect(mock.spies.list).toHaveBeenCalledTimes(1));
      const first = mock.lastCall('list');
      expect(first).toBeDefined();
      await flushMicrotasks();
      expect(refs[refs.length - 1].current.isFetching).toBe(true);
      expect(refs[refs.length - 1].current.previousData).toBeUndefined();

      // Settle the first request: data applies, previousData still undefined.
      act(() => {
        first!.controller.resolve();
      });
      await waitFor(() => {
        expect(refs[refs.length - 1].current.data).toEqual(makeSeed().list.data);
      });
      expect(refs[refs.length - 1].current.previousData).toBeUndefined();

      const initialData = refs[refs.length - 1].current.data;

      // Second call: the manual refetch() — defer so we can observe the
      // pending window in which `previousData` should hold initialData.
      mock.planDeferred('list', makeSeed().list);
      act(() => {
        result.current.refetch();
      });
      await waitFor(() => expect(mock.spies.list).toHaveBeenCalledTimes(2));
      const second = mock.lastCall('list');

      // ARR-08 acceptance criterion 1: during the SECOND pending request,
      // previousData equals the first successful data.
      await flushMicrotasks();
      expect(refs[refs.length - 1].current.isFetching).toBe(true);
      expect(refs[refs.length - 1].current.previousData).toEqual(initialData);

      // Settle the second request: success clears previousData (req 1).
      act(() => {
        second!.controller.resolve();
      });
      await waitFor(() => {
        expect(refs[refs.length - 1].current.isFetching).toBe(false);
      });
      expect(refs[refs.length - 1].current.previousData).toBeUndefined();
    });

    it('the FIRST request never sets previousData even with keepPreviousData=true', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useList } = createModelHooks({ modelService: mock.service });
      mock.planDeferred('list', makeSeed().list);

      const refs: { current: ReturnType<typeof useList> }[] = [];
      renderHook(() => {
        const r = useList({ listParams: { pageSize: 5 }, keepPreviousData: true });
        refs.push({ current: r });
        return r;
      });

      await waitFor(() => expect(mock.spies.list).toHaveBeenCalledTimes(1));
      await flushMicrotasks();
      // Pending first request: no prior settlement, previousData is undefined.
      expect(refs[refs.length - 1].current.previousData).toBeUndefined();
      expect(refs[refs.length - 1].current.isFetching).toBe(true);
    });

    it('keepPreviousData=false leaves previousData undefined during a replacement request', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useList } = createModelHooks({ modelService: mock.service });

      // First call resolves immediately on mount.
      const refs: { current: ReturnType<typeof useList> }[] = [];
      const { result } = renderHook(() => {
        const r = useList({ listParams: { pageSize: 5 }, keepPreviousData: false });
        refs.push({ current: r });
        return r;
      });
      await waitFor(() => {
        expect(refs[refs.length - 1].current.data).toEqual(makeSeed().list.data);
      });
      expect(refs[refs.length - 1].current.previousData).toBeUndefined();

      // Second pending request: with keepPreviousData=false, the
      // capture-at-request-start is skipped, so previousData stays
      // undefined throughout the second request's pending window.
      mock.planDeferred('list', makeSeed().list);
      act(() => {
        result.current.refetch();
      });
      await waitFor(() => expect(mock.spies.list).toHaveBeenCalledTimes(2));
      await flushMicrotasks();
      expect(refs[refs.length - 1].current.isFetching).toBe(true);
      expect(refs[refs.length - 1].current.previousData).toBeUndefined();
    });
  });

  describe('previousData clears on every terminal path', () => {
    it('clears after a failed refetch', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useList } = createModelHooks({ modelService: mock.service });

      const refs: { current: ReturnType<typeof useList> }[] = [];
      const { result } = renderHook(() => {
        const r = useList({ listParams: { pageSize: 5 }, keepPreviousData: true });
        refs.push({ current: r });
        return r;
      });
      await waitFor(() => {
        expect(refs[refs.length - 1].current.data).toEqual(makeSeed().list.data);
      });
      const initialData = refs[refs.length - 1].current.data;

      // Second request: deferred so we can observe previousData captured
      // at start, then reject it and observe the clear-on-failure path.
      mock.planDeferred('list', makeSeed().list);
      act(() => {
        result.current.refetch();
      });
      await waitFor(() => expect(mock.spies.list).toHaveBeenCalledTimes(2));
      await flushMicrotasks();
      expect(refs[refs.length - 1].current.previousData).toEqual(initialData);
      expect(refs[refs.length - 1].current.isFetching).toBe(true);

      const svcErr = makeServiceError({ status: 503, message: 'Unavailable' });
      const second = mock.lastCall('list');
      act(() => {
        second!.controller.reject(svcErr);
      });
      await waitFor(() => {
        expect(refs[refs.length - 1].current.error).toBe(svcErr);
      });

      // ARR-08 req 1: previousData cleared on the failure terminal path.
      expect(refs[refs.length - 1].current.previousData).toBeUndefined();
      expect(refs[refs.length - 1].current.isFetching).toBe(false);
      // The previously-settled data is preserved (failure does not
      // replace the existing successful page).
      expect(refs[refs.length - 1].current.data).toEqual(initialData);
    });

    it('clears after a cancellation (refetch replaced by a subsequent refetch)', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useList } = createModelHooks({ modelService: mock.service });

      const refs: { current: ReturnType<typeof useList> }[] = [];
      const { result } = renderHook(() => {
        const r = useList({ listParams: { pageSize: 5 }, keepPreviousData: true });
        refs.push({ current: r });
        return r;
      });
      await waitFor(() => {
        expect(refs[refs.length - 1].current.data).toEqual(makeSeed().list.data);
      });
      const initialData = refs[refs.length - 1].current.data;

      // Second request: deferred; observe previousData captured at start;
      // then a THIRD refetch() aborts the second before it settles.
      mock.planDeferred('list', makeSeed().list);
      act(() => {
        result.current.refetch();
      });
      await waitFor(() => expect(mock.spies.list).toHaveBeenCalledTimes(2));
      await flushMicrotasks();
      expect(refs[refs.length - 1].current.previousData).toEqual(initialData);
      const second = mock.lastCall('list');

      // Third request immediately replaces the second; the second's
      // abort branch must clear previousData (req 1 — cancellation is a
      // terminal path).
      mock.planDeferred('list', makeSeed().list);
      act(() => {
        result.current.refetch();
      });
      await waitFor(() => expect(mock.spies.list).toHaveBeenCalledTimes(3));
      expect(second!.controller.signal?.aborted).toBe(true);

      // Release the aborted second request so its catch branch fires.
      const transportCancel = Object.assign(new Error('Canceled'), {
        name: 'Canceled',
        code: 'ERR_CANCELED',
      });
      act(() => {
        second!.controller.reject(transportCancel);
      });
      await flushMicrotasks();
      await flushMicrotasks();

      // The third request is still pending; it should have re-captured
      // previousData at start (it is a new replacement request and prior
      // settled data still exists). The aborted second request's clear
      // happened before the third's capture because the second's catch
      // branch runs synchronously when the abort is observed, while the
      // third's baseFetch runs at request start.
      expect(refs[refs.length - 1].current.error).toBeNull();
      expect(refs[refs.length - 1].current.previousData).toEqual(initialData);

      // Release the third: success clears previousData (and applies new data).
      const third = mock.lastCall('list');
      act(() => {
        third!.controller.resolve();
      });
      await waitFor(() => {
        expect(refs[refs.length - 1].current.isFetching).toBe(false);
      });
      expect(refs[refs.length - 1].current.previousData).toBeUndefined();
    });

    it('clears when the disable transition (enabled=false) aborts the active auto-fetch', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useList } = createModelHooks({ modelService: mock.service });

      // Plan two deferred auto-fetches:
      //   1st: settle success — establishes `data` and `hasSettledRef`.
      //   2nd: stays pending during the disable transition so we can
      //        observe `previousData` captured at its start and then
      //        cleared by the `onDisabled` lifecycle hook.
      mock.planDeferred('list', makeSeed().list);
      mock.planDeferred('list', makeSeed().list);

      const refs: { current: ReturnType<typeof useList> }[] = [];
      const { rerender } = renderHook(
        ({ enabled, pageSize }: { enabled: boolean; pageSize: number }) => {
          const r = useList({
            listParams: { pageSize },
            keepPreviousData: true,
            enabled,
          });
          refs.push({ current: r });
          return r;
        },
        { initialProps: { enabled: true, pageSize: 5 } },
      );

      await waitFor(() => expect(mock.spies.list).toHaveBeenCalledTimes(1));
      const first = mock.lastCall('list');
      act(() => {
        first!.controller.resolve();
      });
      await waitFor(() => {
        expect(refs[refs.length - 1].current.data).toEqual(makeSeed().list.data);
      });
      const initialData = refs[refs.length - 1].current.data;
      expect(refs[refs.length - 1].current.previousData).toBeUndefined();

      // Trigger a SECOND auto-fetch by changing a structural dep
      // (`pageSize`). The new request is deferred, so we can observe
      // the pending window and the disable transition while it runs.
      rerender({ enabled: true, pageSize: 10 });
      await waitFor(() => expect(mock.spies.list).toHaveBeenCalledTimes(2));
      const second = mock.lastCall('list');
      await flushMicrotasks();
      expect(refs[refs.length - 1].current.previousData).toEqual(initialData);
      expect(refs[refs.length - 1].current.isFetching).toBe(true);

      // Re-render with enabled=false: the effect cleanup aborts the
      // pending second request's controller, and the new `!shouldFetch`
      // branch converges flags and clears previousData via the
      // `onDisabled` lifecycle hook (req 1 — disable is a terminal
      // path). The refetch-equivalent manual path is intentionally
      // not exercised here; the auto-fetch controller IS the one
      // aborted by the effect cleanup.
      rerender({ enabled: false, pageSize: 10 });
      expect(second!.controller.signal?.aborted).toBe(true);

      const disabled = refs[refs.length - 1].current;
      expect(disabled.isFetching).toBe(false);
      expect(disabled.previousData).toBeUndefined();

      // Settle the aborted second request: its aborted-but-still-owner
      // branch fires on the now-disabled hook, re-running `onAborted`
      // (which clears `previousData` again — already undefined — so the
      // visible state stays consistent). No `error`, no `onError`.
      act(() => {
        second!.controller.reject(Object.assign(new Error('Canceled'), { name: 'Canceled' }));
      });
      await flushMicrotasks();
      await flushMicrotasks();

      const settled = refs[refs.length - 1].current;
      expect(settled.previousData).toBeUndefined();
      expect(settled.isFetching).toBe(false);
      expect(settled.error).toBeNull();
    });

    it('clears after reset()', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useList } = createModelHooks({ modelService: mock.service });

      const refs: { current: ReturnType<typeof useList> }[] = [];
      const { result } = renderHook(() => {
        const r = useList({ listParams: { pageSize: 5 }, keepPreviousData: true });
        refs.push({ current: r });
        return r;
      });
      await waitFor(() => {
        expect(refs[refs.length - 1].current.data).toEqual(makeSeed().list.data);
      });
      const initialData = refs[refs.length - 1].current.data;

      // Second request: deferred; observe previousData captured at start.
      mock.planDeferred('list', makeSeed().list);
      act(() => {
        result.current.refetch();
      });
      await waitFor(() => expect(mock.spies.list).toHaveBeenCalledTimes(2));
      await flushMicrotasks();
      expect(refs[refs.length - 1].current.previousData).toEqual(initialData);

      // reset() must clear data, previousData, totalCount (req 1 + ARR-03
      // req 6 — the list ancillary clear). After reset, the next request
      // is again the first settling one, so previousData stays
      // undefined during its pending window as well (the `hasSettledRef`
      // was reset).
      act(() => {
        result.current.reset();
      });
      expect(refs[refs.length - 1].current.previousData).toBeUndefined();
      expect(refs[refs.length - 1].current.data).toEqual([]);
      expect(refs[refs.length - 1].current.totalCount).toBe(0);
    });
  });

  describe('stable imperative function identities across unrelated rerenders', () => {
    it('query, refetch, and reset keep the same identity when their effective inputs do not change', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useList } = createModelHooks({ modelService: mock.service });

      // Render with stable structural inputs (primitive `listParams`,
      // undefined `requestConfig`, no `filter`/`sort`/`select`). Then
      // re-render with EXACTLY the same inputs and assert that `query`,
      // `refetch`, and `reset` retain their reference identity. ARR-08
      // req 3: structural-equivalence of behavioral inputs guarantees a
      // stable identity across unrelated rerenders.
      const refs: { current: ReturnType<typeof useList> }[] = [];
      const { rerender } = renderHook(() => {
        const r = useList({ listParams: { pageSize: 5 }, keepPreviousData: true });
        refs.push({ current: r });
        return r;
      });

      // Drain the auto-fetch so the hook is at steady state before the
      // identity assertions; otherwise the first render's `runWithCallbacks`
      // closure would still be pending an Effect state write.
      await waitFor(() => {
        expect(refs[refs.length - 1].current.isFetching).toBe(false);
      });

      const initialRefetch = refs[refs.length - 1].current.refetch;
      const initialQuery = refs[refs.length - 1].current.query;
      const initialReset = refs[refs.length - 1].current.reset;

      // Re-render with the same inputs. Note that `listParams` is an
      // inline object literal — under the ARR-06 structural-key policy
      // the auto-effect deps feed on `listParamsKey`, not on the raw
      // identity, and `query`/`refetch`/`reset`'s useCallback deps feed
      // on `runWithCallbacks`/`manager`/`baseFetch`/`resetError`/
      // `resetLoading` which are all stable across structurally-
      // equivalent re-renders. (`reset` depends on `initialData` —
      // which is `undefined` here, so the `reset` useCallback also
      // retains identity.)
      rerender();
      await flushMicrotasks();

      const after = refs[refs.length - 1].current;
      expect(after.refetch).toBe(initialRefetch);
      expect(after.query).toBe(initialQuery);
      expect(after.reset).toBe(initialReset);
    });

    it('reset identity changes when `initialData` changes (behavioral input — not an unrelated rerender)', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useList } = createModelHooks({ modelService: mock.service });

      const initialA: (Model<TestDoc> & TestDoc)[] = [
        { _id: 'a', name: 'InitialA', status: 'active' } as Model<TestDoc> & TestDoc,
      ];
      const initialB: (Model<TestDoc> & TestDoc)[] = [
        { _id: 'b', name: 'InitialB', status: 'pending' } as Model<TestDoc> & TestDoc,
      ];

      const refs: { current: ReturnType<typeof useList> }[] = [];
      const { rerender } = renderHook(
        ({ initialData }: { initialData: (Model<TestDoc> & TestDoc)[] }) => {
          const r = useList({ initialData, keepPreviousData: true });
          refs.push({ current: r });
          return r;
        },
        { initialProps: { initialData: initialA } },
      );

      await flushMicrotasks();
      const initialReset = refs[refs.length - 1].current.reset;

      // Changing `initialData` IS a behavioral change for `reset` (the
      // reset target is different), so req 3's stability guarantee does
      // NOT apply — `reset`'s identity is allowed to change. This
      // sanity-guards the assertion in the previous test by showing the
      // identity-stability policy is not a degenerate "always stable".
      rerender({ initialData: initialB });
      await flushMicrotasks();
      expect(refs[refs.length - 1].current.reset).not.toBe(initialReset);
    });

    it('refetch identity changes when a structural request input changes (behavioral input — not an unrelated rerender)', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useList } = createModelHooks({ modelService: mock.service });

      const refs: { current: ReturnType<typeof useList> }[] = [];
      const { rerender } = renderHook(
        ({ pageSize }: { pageSize: number }) => {
          const r = useList({ listParams: { pageSize }, keepPreviousData: true });
          refs.push({ current: r });
          return r;
        },
        { initialProps: { pageSize: 5 } },
      );

      await waitFor(() => {
        expect(refs[refs.length - 1].current.isFetching).toBe(false);
      });
      const initialRefetch = refs[refs.length - 1].current.refetch;

      // Changing `pageSize` (a structural request input) IS a behavioral
      // change — the wire payload differs. `baseFetch`/`doFetch` re-
      // memoize on the new `listParamsKey`, so `refetch` (which depends
      // on them) re-memoizes too. Req 3's stability guarantee only
      // covers UNRELATED rerenders.
      rerender({ pageSize: 10 });
      await waitFor(() => expect(mock.spies.list).toHaveBeenCalledTimes(2));
      await flushMicrotasks();
      expect(refs[refs.length - 1].current.refetch).not.toBe(initialRefetch);
    });
  });
});
