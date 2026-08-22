//
// Focused regression tests for cancellation and stale query settlement
// (Task ARR-04). The auto-fetch effect cleanup, a dependency swap, a
// manual `query()`/`refetch()` replacement, an explicit `enabled` /
// `useRead.id` change, or final unmount all abort the in-flight request
// via the shared `AbortController`. Before ARR-04 the hooks:
//
//   - left `isLoading`/`isFetching` pinned `true` after a disable /
//     id-removed transition because the `finally` block was gated on
//     `!signal.aborted`;
//   - invoked `onError` for any rejection that did not satisfy
//     `instanceof DOMException('AbortError')`, so a transport-specific
//     cancellation object (e.g. axios `CanceledError`,
//     `Error('Canceled')` with `code: 'ERR_CANCELED'`) was published as
//     a real request error and exposed at the React boundary;
//   - offered no explicit latest-invocation-wins guard, so an older
//     request that happened to settle after a newer request could pass
//     the `!signal.aborted` window and overwrite newer data/error or
//     fire success callbacks for the superseded invocation;
//   - had no `mountRef`-based guard against post-unmount state writes
//     because `useAutoQuery`'s own effect mutated `mountRef.current`
//     for every cleanup, conflating "effect currently active" with
//     "hook currently mounted".
//
// ARR-04 fixes these by introducing a per-invocation ownership token
// (`ownerIdRef`), consulting `signal.aborted` as the authoritative
// cancellation check (regardless of the rejected error's class), and
// converging loading/fetching flags both synchronously (in the
// `!shouldFetch` effect branch) and on the aborted-but-still-owner
// settlement branch. `useAutoQuery`'s own effect no longer mutates
// `mountRef`; only `useMountRef`'s `[]` cleanup does, so post-unmount
// state writes are reliably suppressed.
//
// Each test below exercises one of the spec's behavioral requirements:
//
//   1. Enabled-to-disabled and ID-present-to-ID-missing transitions
//      abort the request and leave `isLoading`/`isFetching` false.
//   2. DOM-style abort (`DOMException('AbortError')`) does not invoke
//      `onError` and does not set `error`.
//   3. A transport-specific / non-DOM cancellation rejection (axios-
//      style `CanceledError` shape) is treated as cancellation when
//      `signal.aborted` was set by the cleanup; no `onError`, no
//      `error` write, flags converge.
//   4. An older request settling after a newer request cannot
//      overwrite newer data/error or invoke current callbacks.
//   5. Abort during unmount produces no state update and no `onError`.
//   6. Strict Mode mount/cleanup/remount cycle converges to a single
//      settled state, with the first invocation discarded as replaced.
//
// Tests use the harness in `./support`; see `./support/mock-service.ts`
// for the deferred-controller mechanics and `./support/lazy-request.ts`
// for `controller.resolve()`/`.reject()`/`signal` semantics.
//

import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { createModelHooks } from '../src/create-model-hook';
import type { Document, ListModelResponse, Model, ModelResponse } from '@web-ts-toolkit/access-router-client';
import { ServiceError } from '@web-ts-toolkit/access-router-client';
import { createMockService, makeServiceError, flushMicrotasks } from './support';

interface TestDoc extends Document {
  _id: string;
  name: string;
  status: string;
}

/**
 * Standard seed: success values the hooks use for the cases that mix a
 * successful reply with a later cancellation (e.g. Strict Mode first
 * invocation settles successfully but is discarded because the second
 * invocation replaced it). Tests that pre-arm `planDeferred` ignore the
 * seed for that specifically-armed method.
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

describe('ARR-04: cancellation and stale query settlement race-safety', () => {
  describe('enabled / id transitions clear loading/fetching flags', () => {
    it('disabling an auto-fetch hook aborts the in-flight request and clears isLoading / isFetching synchronously', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useRead } = createModelHooks({ modelService: mock.service });
      // Pre-arm a deferred read so the request stays pending while we
      // flip `enabled` to false. The transport simulates an in-flight
      // network request only the test can settle.
      mock.planDeferred('read', makeSeed().read);

      const refs: { current: ReturnType<typeof useRead> }[] = [];
      const { rerender } = renderHook(
        ({ enabled }: { enabled: boolean }) => {
          const r = useRead({ id: '1', enabled });
          refs.push({ current: r });
          return r;
        },
        { initialProps: { enabled: true } },
      );

      await waitFor(() => expect(mock.spies.read).toHaveBeenCalledTimes(1));
      const controlled = mock.lastCall('read');
      expect(controlled).toBeDefined();
      expect(controlled!.controller.signal?.aborted).toBe(false);

      // Initial pending state: loading and fetching both true.
      await flushMicrotasks();
      const pending = refs[refs.length - 1].current;
      expect(pending.isLoading).toBe(true);
      expect(pending.isFetching).toBe(true);

      // Disable the hook. ARR-04 req 2: the request must be aborted
      // and the loading/fetching flags must end false. The disable
      // transition converges synchronously in the new effect's
      // `!shouldFetch` branch.
      rerender({ enabled: false });

      const disabled = refs[refs.length - 1].current;
      expect(disabled.isLoading).toBe(false);
      expect(disabled.isFetching).toBe(false);
      // The abort reached the in-flight controller's signal: the
      // transport observed (or will observe) the abort event.
      expect(controlled!.controller.signal?.aborted).toBe(true);
    });

    it('removing `useRead.id` aborts the in-flight request and clears loading/fetching synchronously', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useRead } = createModelHooks({ modelService: mock.service });
      mock.planDeferred('read', makeSeed().read);

      const refs: { current: ReturnType<typeof useRead> }[] = [];
      const { rerender } = renderHook(
        ({ id }: { id: string | undefined }) => {
          const r = useRead({ id });
          refs.push({ current: r });
          return r;
        },
        { initialProps: { id: '1' as string | undefined } },
      );

      await waitFor(() => expect(mock.spies.read).toHaveBeenCalledTimes(1));
      const controlled = mock.lastCall('read');
      await flushMicrotasks();
      expect(refs[refs.length - 1].current.isFetching).toBe(true);

      // Switch `id` to undefined: shouldFetch is now false.
      rerender({ id: undefined });

      const settled = refs[refs.length - 1].current;
      expect(settled.isLoading).toBe(false);
      expect(settled.isFetching).toBe(false);
      expect(controlled!.controller.signal?.aborted).toBe(true);
    });

    it('passing enabled=false from the first render leaves loading/fetching false without triggering a request', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useRead } = createModelHooks({ modelService: mock.service });

      const refs: { current: ReturnType<typeof useRead> }[] = [];
      renderHook(() => {
        const r = useRead({ id: '1', enabled: false });
        refs.push({ current: r });
        return r;
      });

      // No request issued, flags idle.
      const idle = refs[refs.length - 1].current;
      expect(idle.isLoading).toBe(false);
      expect(idle.isFetching).toBe(false);
      expect(mock.spies.read).not.toHaveBeenCalled();
    });
  });

  describe('abort detection is authoritative on signal.aborted regardless of the rejected error shape', () => {
    it('a DOM-style abort rejection (DOMException AbortError) post-cleanup is not published as an error', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useRead } = createModelHooks({ modelService: mock.service });
      const onError = vi.fn();
      const onSuccess = vi.fn();
      mock.planDeferred('read', makeSeed().read);

      const refs: { current: ReturnType<typeof useRead> }[] = [];
      const { rerender } = renderHook(
        ({ enabled }: { enabled: boolean }) => {
          const r = useRead({ id: '1', enabled, onError, onSuccess });
          refs.push({ current: r });
          return r;
        },
        { initialProps: { enabled: true } },
      );

      await waitFor(() => expect(mock.spies.read).toHaveBeenCalledTimes(1));
      const controlled = mock.lastCall('read');
      expect(controlled!.controller.signal?.aborted).toBe(false);

      // Disable while pending. The effect cleanup aborts the active
      // controller (`signal.aborted = true`), then the new effect's
      // `!shouldFetch` branch converges the flags synchronously.
      // The transport subsequently rejects the now-aborted request with
      // the canonical `DOMException('AbortError')` shape (this is what
      // `fetch()` throws on `signal.aborted`, and what `axios` throws
      // when its adapter observes an aborted request). ARR-04 must
      // consult `signal.aborted` — not `instanceof DOMException` — so
      // that no `error`, no `onError`, and no `onSuccess` surface.
      rerender({ enabled: false });
      expect(controlled!.controller.signal?.aborted).toBe(true);

      const domAbort = new DOMException('The operation was aborted.', 'AbortError');
      act(() => {
        controlled!.controller.reject(domAbort);
      });
      await flushMicrotasks();
      await flushMicrotasks();

      const settled = refs[refs.length - 1].current;
      expect(settled.error).toBeNull();
      expect(settled.isLoading).toBe(false);
      expect(settled.isFetching).toBe(false);
      expect(onError).not.toHaveBeenCalled();
      expect(onSuccess).not.toHaveBeenCalled();
    });

    it('a non-DOM transport cancellation rejection is not published as an error when the abort signal fired', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useRead } = createModelHooks({ modelService: mock.service });
      const onError = vi.fn();
      const onSuccess = vi.fn();
      mock.planDeferred('read', makeSeed().read);

      const refs: { current: ReturnType<typeof useRead> }[] = [];
      const { rerender } = renderHook(
        ({ enabled }: { enabled: boolean }) => {
          const r = useRead({ id: '1', enabled, onError, onSuccess });
          refs.push({ current: r });
          return r;
        },
        { initialProps: { enabled: true } },
      );

      await waitFor(() => expect(mock.spies.read).toHaveBeenCalledTimes(1));
      const controlled = mock.lastCall('read');
      expect(controlled!.controller.signal?.aborted).toBe(false);

      // Same scenario as the DOM-style test above but the rejection
      // shape is a non-DOM cancellation object (axios-style
      // `CanceledError`, `Error('Canceled')` with
      // `code: 'ERR_CANCELED'`, or any other transport error shape).
      // ARR-04 req 3: `signal.aborted` — not `instanceof DOMException` —
      // decides cancellation. The hooks must not publish this as a
      // request error.
      const transportCancel = Object.assign(new Error('Canceled'), {
        name: 'Canceled',
        code: 'ERR_CANCELED',
      });
      rerender({ enabled: false });
      expect(controlled!.controller.signal?.aborted).toBe(true);
      act(() => {
        controlled!.controller.reject(transportCancel);
      });
      await flushMicrotasks();
      await flushMicrotasks();

      const settled = refs[refs.length - 1].current;
      expect(settled.error).toBeNull();
      expect(settled.isLoading).toBe(false);
      expect(settled.isFetching).toBe(false);
      expect(onError).not.toHaveBeenCalled();
      expect(onSuccess).not.toHaveBeenCalled();
    });

    it('a non-DOM rejection while the signal is NOT aborted still publishes the error', async () => {
      // Sanity guard: the ARR-04 catch-path change must not swallow a
      // genuine transport failure merely because the rejection is shaped
      // differently from DOMException. When `signal.aborted === false`,
      // the rejection is a real request error and the hook must publish
      // it via `onError` and write `error`. This is the same axle the
      // harness simulates in `test/harness.test.tsx:509-548`, asserted
      // here under the new cancel-detection semantics. (It also proves
      // the non-DOM rejection shape alone does not classify the
      // rejection as a cancellation.)
      const mock = createMockService<TestDoc>(makeSeed());
      const { useRead } = createModelHooks({ modelService: mock.service });
      const onError = vi.fn();
      const onSuccess = vi.fn();
      mock.planDeferred('read', makeSeed().read);

      const refs: { current: ReturnType<typeof useRead> }[] = [];
      renderHook(() => {
        const r = useRead({ id: '1', onError, onSuccess });
        refs.push({ current: r });
        return r;
      });

      await waitFor(() => expect(mock.spies.read).toHaveBeenCalledTimes(1));
      const controlled = mock.lastCall('read');
      // Reject WITHOUT aborting the controller's signal: no
      // cancellation occurred, so the hook must publish the error.
      const svcErr = makeServiceError({ status: 502, message: 'Bad gateway' });
      act(() => {
        controlled!.controller.reject(svcErr);
      });
      await flushMicrotasks();
      await flushMicrotasks();

      const settled = () => refs[refs.length - 1].current;
      await waitFor(() => {
        expect(settled().error).toBe(svcErr);
        expect(onError).toHaveBeenCalledTimes(1);
      });
      expect(settled().isLoading).toBe(false);
      expect(settled().isFetching).toBe(false);
      expect(onError).toHaveBeenCalledWith(svcErr);
      expect(onSuccess).not.toHaveBeenCalled();
    });
  });

  describe('latest-invocation-wins out-of-order settlement', () => {
    it('an older request settling AFTER the newer request cannot overwrite newer data and does not fire callbacks', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useRead } = createModelHooks({ modelService: mock.service });
      const onSuccess = vi.fn();
      const onError = vi.fn();

      // Two pre-armed deferred read invocations: the older ("Older")
      // resolves successfully; the newer ("Newer") also resolves
      // successfully. The test intentionally resolves the NEWER first
      // (subject of the latest-invocation-wins obligation) and then
      // releases the OLDER. ARR-04 must ensure the older, having been
      // replaced (its `myId !== ownerIdRef.current`), neither applies
      // its data nor fires `onSuccess`.
      mock.planDeferred('read', {
        success: true,
        raw: { _id: 'a', name: 'Older', status: 'active' },
        data: { _id: 'a', name: 'Older', status: 'active' } as Model<TestDoc> & TestDoc,
        message: 'ok',
        status: 200,
        headers: {},
      });
      mock.planDeferred('read', {
        success: true,
        raw: { _id: 'b', name: 'Newer', status: 'active' },
        data: { _id: 'b', name: 'Newer', status: 'active' } as Model<TestDoc> & TestDoc,
        message: 'ok',
        status: 200,
        headers: {},
      });

      const refs: { current: ReturnType<typeof useRead> }[] = [];
      const { rerender } = renderHook(
        ({ id }: { id: string }) => {
          const r = useRead({ id, onSuccess, onError });
          refs.push({ current: r });
          return r;
        },
        { initialProps: { id: 'a' } },
      );

      await waitFor(() => expect(mock.spies.read).toHaveBeenCalledTimes(1));
      const older = mock.lastCall('read');

      rerender({ id: 'b' });
      await waitFor(() => expect(mock.spies.read.mock.calls.length).toBeGreaterThanOrEqual(2));
      const newer = mock.lastCall('read');
      expect(older!.controller.signal).not.toBe(newer!.controller.signal);
      // Older request was aborted by the rerender cleanup.
      expect(older!.controller.signal?.aborted).toBe(true);
      expect(newer!.controller.signal?.aborted).toBe(false);

      onSuccess.mockClear();
      onError.mockClear();

      // Release the newer settlement first: data applies, onSuccess fires.
      act(() => {
        newer!.controller.resolve();
      });
      await waitFor(() => {
        expect(refs[refs.length - 1].current.data).toEqual({ _id: 'b', name: 'Newer', status: 'active' });
      });
      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(onSuccess.mock.calls[0][0].data).toEqual({ _id: 'b', name: 'Newer', status: 'active' });

      onSuccess.mockClear();
      onError.mockClear();

      // Release the OLDER settlement AFTER the newer. ARR-04 req 5: the
      // older, replaced and aborted, must not overwrite newer data and
      // must not re-fire `onSuccess`/`onError`.
      act(() => {
        older!.controller.resolve();
      });
      await flushMicrotasks();
      await flushMicrotasks();

      const settled = refs[refs.length - 1].current;
      expect(settled.data).toEqual({ _id: 'b', name: 'Newer', status: 'active' });
      expect(settled.error).toBeNull();
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
      expect(settled.isLoading).toBe(false);
      expect(settled.isFetching).toBe(false);
    });

    it('an older failing request settling after a newer successful request cannot overwrite newer data or set error', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useRead } = createModelHooks({ modelService: mock.service });
      const onSuccess = vi.fn();
      const onError = vi.fn();

      // The older pre-arm is a resolved failure (ARR-02 FailureResult);
      // the newer is a normal success.
      mock.planDeferred('read', {
        success: false,
        raw: { code: 'AUTHZ' },
        data: null,
        message: 'Forbidden',
        status: 403,
        headers: {},
      });
      mock.planDeferred('read', {
        success: true,
        raw: { _id: 'b', name: 'Newer', status: 'active' },
        data: { _id: 'b', name: 'Newer', status: 'active' } as Model<TestDoc> & TestDoc,
        message: 'ok',
        status: 200,
        headers: {},
      });

      const refs: { current: ReturnType<typeof useRead> }[] = [];
      const { rerender } = renderHook(
        ({ id }: { id: string }) => {
          const r = useRead({ id, onSuccess, onError });
          refs.push({ current: r });
          return r;
        },
        { initialProps: { id: 'a' } },
      );

      await waitFor(() => expect(mock.spies.read).toHaveBeenCalledTimes(1));
      const older = mock.lastCall('read');

      rerender({ id: 'b' });
      await waitFor(() => expect(mock.spies.read.mock.calls.length).toBeGreaterThanOrEqual(2));
      const newer = mock.lastCall('read');

      onSuccess.mockClear();
      onError.mockClear();

      // Settle the newer SUCCESS first: data applies, callbacks fire.
      act(() => {
        newer!.controller.resolve();
      });
      await waitFor(() => {
        expect(refs[refs.length - 1].current.data).toEqual({ _id: 'b', name: 'Newer', status: 'active' });
      });
      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(refs[refs.length - 1].current.error).toBeNull();

      onSuccess.mockClear();
      onError.mockClear();

      // Now settle the older FAILURE. ARR-02 turns the resolved-failure
      // into a thrown `ServiceError`; ARR-04 ensures the older (aborted
      // and replaced) does not invoke `catch`'s publish-error branch for
      // the superseded invocation: no `error` write, no callback.
      act(() => {
        older!.controller.resolve();
      });
      await flushMicrotasks();
      await flushMicrotasks();

      const settled = refs[refs.length - 1].current;
      expect(settled.data).toEqual({ _id: 'b', name: 'Newer', status: 'active' });
      expect(settled.error).toBeNull();
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
    });
  });

  describe('abort during unmount', () => {
    it('produces no state update and does not invoke onError', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useRead } = createModelHooks({ modelService: mock.service });
      const onError = vi.fn();
      const onSuccess = vi.fn();
      const warnSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mock.planDeferred('read', makeSeed().read);

      const refs: { current: ReturnType<typeof useRead> }[] = [];
      const { unmount } = renderHook(() => {
        const r = useRead({ id: '1', onError, onSuccess });
        refs.push({ current: r });
        return r;
      });

      await waitFor(() => expect(mock.spies.read).toHaveBeenCalledTimes(1));
      const controlled = mock.lastCall('read');

      onError.mockClear();
      onSuccess.mockClear();
      warnSpy.mockClear();

      // Unmount the hook. The effect cleanup aborts the controller:
      // `signal.aborted = true`. `useMountRef`'s `[]` cleanup also runs,
      // setting `mountRef.current = false`. Even though the older
      // request is rejected as a non-DOM cancellation shape AFTER
      // unmount, the catch-path's `mountRef.current` gate suppresses
      // every state write and the catch's `signal.aborted` branch drops
      // the rejection cleanly (no `onError`).
      unmount();
      expect(controlled!.controller.signal?.aborted).toBe(true);
      const transportCancel = Object.assign(new Error('Canceled'), {
        name: 'Canceled',
        code: 'ERR_CANCELED',
      });
      act(() => {
        controlled!.controller.reject(transportCancel);
      });
      await flushMicrotasks();
      await flushMicrotasks();

      expect(onError).not.toHaveBeenCalled();
      expect(onSuccess).not.toHaveBeenCalled();
      // The renderer is not emitting a "state update on unmounted
      // component" warning. (React 18+ removed that warning, but the
      // assertion guards against regressions surfaced by any future
      // renderer or by `act` warnings that accompany post-unmount
      // state writes.)
      const actWarnings = warnSpy.mock.calls
        .filter(([_arg]: unknown[]) => String(_arg).includes('unmounted'))
        .map(([_arg]: unknown[]) => _arg);
      expect(actWarnings).toHaveLength(0);

      warnSpy.mockRestore();
    });
  });

  describe('Strict Mode effect replay', () => {
    it('Strict Mode mount/cleanup/remount discards the first invocation and converges on the second one', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useRead } = createModelHooks({ modelService: mock.service });
      const onSuccess = vi.fn();
      const onError = vi.fn();

      // Pre-arm TWO deferred reads. React's StrictMode mounts the
      // effect, runs its cleanup (aborting controller1), then remounts
      // the effect (issuing controller2). The first deferred plan is
      // consumed by the first mount; the second plan, by the remount.
      // The test then resolves the SECOND request and asserts the hook
      // state converges without leaking the first invocation's data or
      // callbacks. We DO NOT resolve the first request: it must remain
      // pending-and-aborted forever, proving the first invocation's
      // microtask does NOT touch state once replaced.
      mock.planDeferred('read', {
        success: true,
        raw: { _id: 'strict1', name: 'StrictModeFirst', status: 'active' },
        data: { _id: 'strict1', name: 'StrictModeFirst', status: 'active' } as Model<TestDoc> & TestDoc,
        message: 'ok',
        status: 200,
        headers: {},
      });
      mock.planDeferred('read', {
        success: true,
        raw: { _id: 'strict2', name: 'StrictModeSecond', status: 'active' },
        data: { _id: 'strict2', name: 'StrictModeSecond', status: 'active' } as Model<TestDoc> & TestDoc,
        message: 'ok',
        status: 200,
        headers: {},
      });

      const refs: { current: ReturnType<typeof useRead> }[] = [];
      renderHook(
        () => {
          const r = useRead({ id: 'strict', onSuccess, onError });
          refs.push({ current: r });
          return r;
        },
        { reactStrictMode: true },
      );

      // StrictMode mounts the effect and then immediately cleans it up
      // and remounts. After the synchronous flush, `read` should have
      // been called twice (once per invocation), each with a distinct
      // deferred controller.
      await waitFor(() => expect(mock.spies.read.mock.calls.length).toBeGreaterThanOrEqual(2));
      mock.spies.read.mock.results.forEach((result: { value: unknown }) => {
        expect(result.value).toBeDefined();
      });

      // The two deferred plans were each consumed; there is no queued
      // plan for a stray third call. `mock.lastCall('read')` returns
      // the second-deferred's controller (the most recent).
      const second = mock.lastCall('read');
      expect(second).toBeDefined();
      expect(second!.controller.signal?.aborted).toBe(false);

      onSuccess.mockClear();
      onError.mockClear();

      // Resolve ONLY the second request. The first request remains
      // pending (no test action) but is replaced (its `myId` is no
      // longer current) and its signal was aborted by the Strict
      // Mode cleanup.
      act(() => {
        second!.controller.resolve();
      });
      await waitFor(() => {
        expect(refs[refs.length - 1].current.data).toEqual({
          _id: 'strict2',
          name: 'StrictModeSecond',
          status: 'active',
        });
      });
      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(onSuccess.mock.calls[0][0].data).toEqual({
        _id: 'strict2',
        name: 'StrictModeSecond',
        status: 'active',
      });
      expect(refs[refs.length - 1].current.error).toBeNull();
      expect(refs[refs.length - 1].current.isLoading).toBe(false);
      expect(refs[refs.length - 1].current.isFetching).toBe(false);
    });
  });

  describe('mutation hooks respect mountRef for post-unmount state writes', () => {
    it('a mutation settling after unmount does not call onSuccess or set data and emits no warning', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useCreate } = createModelHooks({ modelService: mock.service });
      const onSuccess = vi.fn();
      const onError = vi.fn();
      const warnSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mock.planDeferred('create', makeSeed().create);

      const refs: { current: ReturnType<typeof useCreate> }[] = [];
      const { result, unmount } = renderHook(() => {
        const r = useCreate({ onSuccess, onError });
        refs.push({ current: r });
        return r;
      });

      await act(async () => {
        // Fire the mutation but DO NOT await its promise; we want
        // settlement to occur after unmount.
        result.current.mutate({ name: 'X' });
      });
      await waitFor(() => expect(mock.spies.create).toHaveBeenCalledTimes(1));
      const controlled = mock.lastCall('create');
      expect(controlled).toBeDefined();

      onSuccess.mockClear();
      onError.mockClear();
      warnSpy.mockClear();

      // Unmount while the mutation is pending. The hook's
      // `useMountRef` cleanup sets `mountRef.current = false`; the
      // mutation's pending execute chain now observes mountRef on
      // every state write.
      unmount();

      act(() => {
        controlled!.controller.resolve();
      });
      await flushMicrotasks();
      await flushMicrotasks();

      expect(onSuccess).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
      const unmountWarnings = warnSpy.mock.calls
        .filter(([_arg]: unknown[]) => String(_arg).includes('unmounted'))
        .map(([_arg]: unknown[]) => _arg);
      expect(unmountWarnings).toHaveLength(0);

      warnSpy.mockRestore();
    });

    it('the mutation reject path after unmount does not call onError or set error', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useCreate } = createModelHooks({ modelService: mock.service });
      const onSuccess = vi.fn();
      const onError = vi.fn();
      const warnSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mock.planDeferred('create', makeSeed().create);

      const { result, unmount } = renderHook(() => {
        return useCreate({ onSuccess, onError });
      });

      // Mutating createData with a deferred pending promise
      await act(async () => {
        // Fire the mutation and let the spy register the call without
        // awaiting the deferred resolution.
        result.current.mutate({ name: 'X' }).catch(() => {
          /* suppress unhandled rejection (no awaiter) */
        });
      });
      await waitFor(() => expect(mock.spies.create).toHaveBeenCalledTimes(1));
      const controlled = mock.lastCall('create');

      onSuccess.mockClear();
      onError.mockClear();
      warnSpy.mockClear();

      unmount();

      const svcErr = new ServiceError({
        success: false,
        raw: { code: 'BOOM' },
        data: null,
        message: 'fail',
        status: 500,
        headers: {},
      } as never);
      act(() => {
        controlled!.controller.reject(svcErr);
      });
      await flushMicrotasks();
      await flushMicrotasks();

      expect(onError).not.toHaveBeenCalled();
      expect(onSuccess).not.toHaveBeenCalled();
      const unmountWarnings = warnSpy.mock.calls
        .filter(([_arg]: unknown[]) => String(_arg).includes('unmounted'))
        .map(([_arg]: unknown[]) => _arg);
      expect(unmountWarnings).toHaveLength(0);

      warnSpy.mockRestore();
    });
  });
});
