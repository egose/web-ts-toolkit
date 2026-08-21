//
// Focused regression tests for concurrent mutation state semantics (Task
// ARR-07). The four mutation hooks (`useCreate`, `useUpdate`,
// `useUpsert`, `useDelete`) share one `useMutation` lifecycle. Before
// ARR-07 the lifecycle:
//
//   - kept a single `useState(false)` for `isPending`. The first
//     invocation's `finally` block unconditionally set it `false`, so a
//     second invocation already in flight would briefly appear settled
//     to the consumer;
//   - wrote hook-level `data` and `error` synchronously inside each
//     hook-specific `execute` (`setData(res.data)` / `setError(err)`),
//     with no invocation token: an older mutation that happened to
//     settle AFTER a newer one overwrote the newer invocation's
//     data/error (the canonical out-of-order-completion defect);
//   - had no documented `reset`-during-pending contract: a `reset()`
//     while an invocation was in flight could see that invocation later
//     repopulate the cleared `data`/`error`.
//
// ARR-07 fixes these by:
//
//   - recording an active-count ref so `setIsPending(false)` only fires
//     when the active count reaches zero;
//   - bumping a monotonic `latestIdRef` at every invocation and gating
//     `setData`/`setError` on `myId === latestIdRef.current`, so a stale
//     invocation cannot overwrite a newer invocation's exposed state;
//   - keeping each invocation's promise and per-invocation callbacks
//     (`onSuccess`/`onSettled`) invocation-specific: a fire-and-forget
//     stale mutation still resolves its OWN promise with its OWN
//     `result` and fires its OWN callbacks (the only writes gated on
//     "is this the latest" are the shared `data`/`error` state writes);
//   - making `reset` bump `latestIdRef.current` so an in-flight stale
//     invocation that settles AFTER `reset` cannot repopulate cleared
//     state, WITHOUT aborting the in-flight promise (no implicit
//     cancellation).
//
// Each test below exercises one of the spec's behavioral requirements
// (`Implementation requirements` in the ARR-07 task). Tests use the
// harness in `./support`; see `./support/mock-service.ts` for the
// planner mechanics and `./support/lazy-request.ts` for the deferred
// controller surface.
//
// Timing convention (matches cancellation.test.tsx): after a
// `controller.resolve()` / `.reject()` call wrapped in `act`, the
// resolver returns synchronously but the `await execute()` continuation
// runs on a follow-up microtask that escapes the act boundary. A single
// `await flushMicrotasks()` is NOT sufficient to reach the
// hook-level state write inside `useMutation`; `await waitFor(() =>
// expect(result.current...))` is required so React Testing Library can
// flush the subsequent microtask plus the resulting state update.
//

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { createModelHooks } from '../src/create-model-hook';
import type { Document, Model, ModelResponse, Response } from '@web-ts-toolkit/access-router-client';
import { ServiceError } from '@web-ts-toolkit/access-router-client';
import { createMockService, type ControlledLazyRequest, type MethodResult, flushMicrotasks } from './support';

interface TestDoc extends Document {
  _id: string;
  name: string;
  status: string;
}

function makeCreateResult(id: string, name: string): ModelResponse<TestDoc> {
  return {
    success: true,
    raw: { _id: id, name, status: 'active' },
    data: { _id: id, name, status: 'active' } as Model<TestDoc> & TestDoc,
    message: 'ok',
    status: 201,
    headers: {},
  };
}

function makeUpdateResult(id: string, name: string): ModelResponse<TestDoc> {
  return {
    success: true,
    raw: { _id: id, name, status: 'active' },
    data: { _id: id, name, status: 'active' } as Model<TestDoc> & TestDoc,
    message: 'ok',
    status: 200,
    headers: {},
  };
}

function makeDeleteResult(id: string): Response<string> {
  return { success: true, raw: id, data: id, message: 'ok', status: 200, headers: {} };
}

function makeServiceError(status = 500, message = 'fail'): ServiceError {
  return new ServiceError({
    success: false,
    raw: { code: 'BOOM' },
    data: null,
    message,
    status,
    headers: {},
  } as never);
}

function makeSeed(): ReturnType<typeof createMockService<TestDoc>>['seed'] {
  return {
    list: {
      success: true,
      raw: [],
      data: [],
      message: 'ok',
      status: 200,
      headers: {},
      totalCount: 0,
    },
    read: makeUpdateResult('1', 'Initial'),
    create: makeCreateResult('1', 'Initial'),
    delete: makeDeleteResult('1'),
    count: { success: true, raw: 0, data: 0, message: 'ok', status: 200, headers: {} },
    distinct: { success: true, raw: [], data: [], message: 'ok', status: 200, headers: {} },
  };
}

/**
 * Pre-arm a deferred recorder for `method` with `value` and fire
 * `mutate(...)`. Resolves the `ControlledLazyRequest` once the hook's
 * service call has registered it, so the test can release its
 * settlement in a chosen order.
 *
 * The helper asserts the spy was called exactly `expectCalls` times
 * before capturing `lastCall`, so a misfire (e.g. two pre-armed plans
 * both consumed by one call) surfaces explicitly rather than as a
 * stale-controller race later in the test.
 */
async function armDeferredAndFire<M extends 'create' | 'update' | 'upsert' | 'delete'>(
  mock: ReturnType<typeof createMockService<TestDoc>>,
  method: M,
  value: MethodResult<TestDoc, M>,
  expectCalls: number,
  fire: () => Promise<unknown> | void,
): Promise<ControlledLazyRequest<unknown>> {
  mock.planDeferred(method, value as never);
  await act(async () => {
    // Fire the mutation but do NOT await it; we want the hook to
    // register the deferred recorder and leave the request pending.
    fire();
    await flushMicrotasks();
  });
  await waitFor(() => expect(mock.spies[method]).toHaveBeenCalledTimes(expectCalls));
  const controlled = mock.lastCall(method) as unknown as ControlledLazyRequest<unknown> | undefined;
  expect(controlled).toBeDefined();
  return controlled!;
}

describe('ARR-07: concurrent mutation state semantics', () => {
  // ── Acceptance criterion 1 ──
  // With A and B pending, settlement of either one leaves
  // `isPending === true` until both settle.
  describe('active-count isPending stays true until every invocation settles', () => {
    it('after A settles while B is still pending, isPending stays true and A does not overwrite (B is latest)', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useCreate } = createModelHooks({ modelService: mock.service });
      const onSuccess = vi.fn();

      const { result } = renderHook(() => useCreate({ onSuccess }));

      // A is first; B is invoked after A. B is therefore the latest
      // at invocation time (`latestIdRef.current` was bumped to B's
      // token before A settles). When A settles, A is stale and its
      // exposed-state write is gated. `data` stays null until B.
      const resultA = makeCreateResult('A', 'A');
      const callA = await armDeferredAndFire(mock, 'create', resultA, 1, () => result.current.mutate({ name: 'A' }));

      const resultB = makeCreateResult('B', 'B');
      const callB = await armDeferredAndFire(mock, 'create', resultB, 2, () => result.current.mutate({ name: 'B' }));

      // Both invocations now pending. ARR-07 req 1: `isPending`
      // remains true while any is in flight.
      await waitFor(() => expect(result.current.isPending).toBe(true));
      expect(result.current.data).toBeNull();

      // Release A first. A is stale (B bumped latestIdRef before A
      // settled), so A's `data` state write is suppressed. A's
      // per-invocation observers (onSuccess/onSettled) DO fire.
      act(() => callA.controller.resolve(resultA));
      await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
      expect(onSuccess).toHaveBeenLastCalledWith(resultA);

      // A settled; B still pending: isPending MUST stay true, data
      // MUST stay null (A is stale, B is the latest).
      await waitFor(() => expect(result.current.isPending).toBe(true));
      expect(result.current.data).toBeNull();

      // Now release B. With both settled and active count back to
      // zero, `isPending` converges to false and B's `data` is
      // applied (B is the latest).
      act(() => callB.controller.resolve(resultB));
      await waitFor(() => expect(result.current.isPending).toBe(false));
      expect(result.current.data).toEqual({ _id: 'B', name: 'B', status: 'active' });
      expect(onSuccess).toHaveBeenCalledTimes(2);
    });

    it('after B (latest) settles while A (stale) is still pending, isPending remains true', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useCreate } = createModelHooks({ modelService: mock.service });

      const { result } = renderHook(() => useCreate());

      const resultA = makeCreateResult('A', 'A');
      const callA = await armDeferredAndFire(mock, 'create', resultA, 1, () => result.current.mutate({ name: 'A' }));

      const resultB = makeCreateResult('B', 'B');
      const callB = await armDeferredAndFire(mock, 'create', resultB, 2, () => result.current.mutate({ name: 'B' }));

      // Release B (the latest) first. B's data is published; A
      // remains pending so isPending stays true.
      act(() => callB.controller.resolve(resultB));
      await waitFor(() => expect(result.current.data).toEqual({ _id: 'B', name: 'B', status: 'active' }));
      expect(result.current.isPending).toBe(true);

      // Release A (stale). A cannot overwrite B's data, but the
      // active count decrements toward zero.
      act(() => callA.controller.resolve(resultA));
      await waitFor(() => expect(result.current.isPending).toBe(false));

      // B's data is preserved (stale-A did not overwrite).
      expect(result.current.data).toEqual({ _id: 'B', name: 'B', status: 'active' });
    });

    it('useDelete keeps isPending true across overlapping mutations and clears only when both settle', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useDelete } = createModelHooks({ modelService: mock.service });

      const { result } = renderHook(() => useDelete());

      const callA = await armDeferredAndFire(mock, 'delete', makeDeleteResult('A'), 1, () =>
        result.current.mutate('A'),
      );
      const callB = await armDeferredAndFire(mock, 'delete', makeDeleteResult('B'), 2, () =>
        result.current.mutate('B'),
      );

      await waitFor(() => expect(result.current.isPending).toBe(true));

      // Release A. B still pending: isPending stays true. `useDelete`
      // has no `data` to assert on, but the active-count contract
      // still applies.
      act(() => callA.controller.resolve(makeDeleteResult('A')));
      await waitFor(() => {
        // Both haven't settled yet — A has settled but B is still
        // pending, so isPending is still true.
      });
      expect(result.current.isPending).toBe(true);
      expect(result.current.error).toBeNull();

      act(() => callB.controller.resolve(makeDeleteResult('B')));
      await waitFor(() => expect(result.current.isPending).toBe(false));
      expect(result.current.error).toBeNull();
    });
  });

  // ── Acceptance criterion 2 ──
  // Out-of-order settlement cannot let A overwrite B when B was
  // invoked later.
  describe('latest-invocation-wins: a stale invocation settling later cannot overwrite a newer invocation', () => {
    it('A settling AFTER B (B invoked later) cannot overwrite B.data', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useCreate } = createModelHooks({ modelService: mock.service });
      const onSuccess = vi.fn();

      const { result } = renderHook(() => useCreate({ onSuccess }));

      const resultA = makeCreateResult('A', 'A');
      const callA = await armDeferredAndFire(mock, 'create', resultA, 1, () => result.current.mutate({ name: 'A' }));

      const resultB = makeCreateResult('B', 'B');
      const callB = await armDeferredAndFire(mock, 'create', resultB, 2, () => result.current.mutate({ name: 'B' }));

      // Release B FIRST (the latest invocation). B is the current
      // latest, so B's data is published.
      act(() => callB.controller.resolve(resultB));
      await waitFor(() => expect(result.current.data).toEqual({ _id: 'B', name: 'B', status: 'active' }));
      const successCallsAfterB = onSuccess.mock.calls.length;

      // Now release A (stale). ARR-07 req 2: A's stale write MUST
      // NOT overwrite B's already-applied data.
      act(() => callA.controller.resolve(resultA));
      await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(successCallsAfterB + 1));

      // Exposed `data` is unchanged by stale-A settlement.
      expect(result.current.data).toEqual({ _id: 'B', name: 'B', status: 'active' });
      // Both invocations settled, so `isPending` converges to false.
      await waitFor(() => expect(result.current.isPending).toBe(false));
    });

    it('useUpdate: a stale update settling later cannot overwrite a newer update', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useUpdate } = createModelHooks({ modelService: mock.service });

      const { result } = renderHook(() => useUpdate());

      const updA = makeUpdateResult('1', 'UpdatedA');
      const callA = await armDeferredAndFire(mock, 'update', updA, 1, () => result.current.mutate('1', { name: 'A' }));

      const updB = makeUpdateResult('1', 'UpdatedB');
      const callB = await armDeferredAndFire(mock, 'update', updB, 2, () => result.current.mutate('1', { name: 'B' }));

      // Release B first (latest): B wins. Then A settles stale.
      act(() => callB.controller.resolve(updB));
      await waitFor(() => expect(result.current.data).toEqual({ _id: '1', name: 'UpdatedB', status: 'active' }));

      act(() => callA.controller.resolve(updA));
      await waitFor(() => expect(result.current.isPending).toBe(false));

      // Stale A does not overwrite B.
      expect(result.current.data).toEqual({ _id: '1', name: 'UpdatedB', status: 'active' });
    });
  });

  // ── Acceptance criterion 3 ──
  // Mixed success/failure overlap produces deterministic
  // latest-invocation state while each promise/callback reports its
  // own outcome.
  describe('mixed success / failure overlap: latest-invocation state AND per-invocation outcomes', () => {
    it('A (stale, success) settling AFTER B (latest, failure) does not overwrite B.error or data', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useCreate } = createModelHooks({ modelService: mock.service });
      const onSuccess = vi.fn();
      const onError = vi.fn();
      const onSettled = vi.fn();

      const { result } = renderHook(() => useCreate({ onSuccess, onError, onSettled }));

      // A is the first mutation, succeeds eventually, but settles
      // only AFTER B has already failed.
      const resultA = makeCreateResult('A', 'A');
      const callA = await armDeferredAndFire(mock, 'create', resultA, 1, () => result.current.mutate({ name: 'A' }));

      // B is the latest. It is armed to REJECT.
      const errB = makeServiceError(503, 'B failed');
      mock.planNextRejection('create', errB);
      await act(async () => {
        // Fire B but swallow the rejection: the wrapper rethrows for
        // the consumer `await`, but we are not awaiting here.
        result.current.mutate({ name: 'B' }).catch(() => {
          /* swallow: see wrapper onError assertion below */
        });
        await flushMicrotasks();
      });
      await waitFor(() => expect(mock.spies.create).toHaveBeenCalledTimes(2));

      // B's rejection is `planNextRejection` — non-deferred. Wait
      // for it to settle and apply exposed state.
      await waitFor(() => expect(result.current.error).toBe(errB));
      expect(result.current.data).toBeNull();
      expect(onError).toHaveBeenCalledWith(errB);
      expect(onSettled).toHaveBeenCalledWith(null, errB);
      const settledCallsAfterB = onSettled.mock.calls.length;
      const successCallsAfterB = onSuccess.mock.calls.length;

      // Now release A (stale, success). A is NOT the latest, so its
      // success MUST NOT overwrite B's exposed `error`/`data`. Its
      // OWN `onSuccess(resultA)` and `onSettled(resultA, null)` DO
      // fire as invocation-specific observers (req 3), but its
      // error/data state writes are suppressed.
      act(() => callA.controller.resolve(resultA));
      await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(successCallsAfterB + 1));
      expect(onSuccess).toHaveBeenLastCalledWith(resultA);
      expect(onSettled).toHaveBeenCalledTimes(settledCallsAfterB + 1);
      expect(onSettled).toHaveBeenLastCalledWith(resultA, null);

      // Exposed state unchanged by A's stale settlement.
      expect(result.current.error).toBe(errB);
      expect(result.current.data).toBeNull();

      // Both settled: isPending converges to false.
      await waitFor(() => expect(result.current.isPending).toBe(false));
    });

    it('per-invocation promise resolves with its own result regardless of latest-invocation claim', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useCreate } = createModelHooks({ modelService: mock.service });

      const { result } = renderHook(() => useCreate());

      const resultA = makeCreateResult('A', 'A');
      const callA = await armDeferredAndFire(mock, 'create', resultA, 1, () => result.current.mutate({ name: 'A' }));

      const resultB = makeCreateResult('B', 'B');
      const callB = await armDeferredAndFire(mock, 'create', resultB, 2, () => result.current.mutate({ name: 'B' }));

      // Capture the lazy requests returned by each service call so
      // we can await each invocation's per-invocation resolved
      // value and assert it equals THAT invocation's result (not the
      // latest's).
      const lazyA = mock.spies.create.mock.results[0].value as unknown as Promise<ModelResponse<TestDoc>>;
      const lazyB = mock.spies.create.mock.results[1].value as unknown as Promise<ModelResponse<TestDoc>>;
      const recordedPromiseA = lazyA.then((r) => r);
      const recordedPromiseB = lazyB.then((r) => r);

      // Release B first (latest), then A (stale).
      act(() => callB.controller.resolve(resultB));
      await waitFor(() => expect(result.current.data).toEqual({ _id: 'B', name: 'B', status: 'active' }));

      act(() => callA.controller.resolve(resultA));
      await waitFor(() => expect(result.current.isPending).toBe(false));

      // Hook-level data reflects the LATEST invocation's result (B).
      expect(result.current.data).toEqual({ _id: 'B', name: 'B', status: 'active' });

      // Each per-invocation promise resolves with its own result.
      // A's promise did not silently take B's value (and was not
      // aborted per req 5).
      const aResolved = await recordedPromiseA;
      const bResolved = await recordedPromiseB;
      expect(aResolved).toBe(resultA);
      expect(bResolved).toBe(resultB);
    });
  });

  // ── Acceptance criterion 4 ──
  // Reset-during-pending behavior is documented and regression-tested.
  describe('reset-during-pending: stale mutations cannot repopulate cleared state after reset', () => {
    it('a pending mutation settling AFTER reset does not repopulate cleared data/error', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useCreate } = createModelHooks({ modelService: mock.service });
      const onSuccess = vi.fn();

      const { result } = renderHook(() => useCreate({ onSuccess }));

      const callA = await armDeferredAndFire(mock, 'create', makeCreateResult('A', 'A'), 1, () =>
        result.current.mutate({ name: 'A' }),
      );

      // `reset()` while A is still in flight. ARR-07 req 4 + the
      // documented `reset` policy: `reset` clears `data`/`error`
      // AND bumps `latestIdRef.current` so the in-flight A loses
      // its latest-invocation claim. When A later settles, its
      // state-write gate (`myId === latestIdRef.current`) is
      // false, so it cannot repopulate the cleared state.
      expect(result.current.data).toBeNull();
      act(() => {
        result.current.reset();
      });

      // A is still pending, so isPending stays true (req 1). Cleared
      // state remains null.
      await flushMicrotasks();
      expect(result.current.isPending).toBe(true);
      expect(result.current.data).toBeNull();
      expect(result.current.error).toBeNull();

      // Release A. A's invocation-specific observers (onSuccess,
      // onSettled) DO fire (req 3), but A's `data`/`error` state
      // writes are suppressed because `reset` bumped the latest id.
      act(() => callA.controller.resolve());
      await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));

      // Cleared state remains. isPending converges to false (the
      // active count decremented in the finally; no other
      // invocation remains in flight).
      await waitFor(() => expect(result.current.isPending).toBe(false));
      expect(result.current.data).toBeNull();
      expect(result.current.error).toBeNull();
    });

    it('a newer mutation invoked after reset becomes the new latest and resumes latest-wins', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useCreate } = createModelHooks({ modelService: mock.service });

      const { result } = renderHook(() => useCreate());

      // A is in flight.
      const callA = await armDeferredAndFire(mock, 'create', makeCreateResult('A', 'A'), 1, () =>
        result.current.mutate({ name: 'A' }),
      );

      // Reset (bumps latestIdRef).
      act(() => result.current.reset());

      // B invoked AFTER reset is the new latest.
      const resultB = makeCreateResult('B', 'B');
      const callB = await armDeferredAndFire(mock, 'create', resultB, 2, () => result.current.mutate({ name: 'B' }));

      // Release A first (stale -- reset bumped latestIdRef above
      // B's invocation). A cannot write state. isPending stays true
      // because B is still pending.
      act(() => callA.controller.resolve());
      await waitFor(() => expect(result.current.isPending).toBe(true));

      expect(result.current.data).toBeNull();

      // Release B (the latest). Its data is published.
      act(() => callB.controller.resolve(resultB));
      await waitFor(() => expect(result.current.isPending).toBe(false));
      expect(result.current.data).toEqual({ _id: 'B', name: 'B', status: 'active' });
    });

    it('reset clears error from a prior settled mutation', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useCreate } = createModelHooks({ modelService: mock.service });

      const { result } = renderHook(() => useCreate());

      // A fails. error is set.
      const errA = makeServiceError(500, 'A failed');
      mock.planNextRejection('create', errA);
      await act(async () => {
        try {
          await result.current.mutate({ name: 'A' });
        } catch {
          /* expected */
        }
      });
      await waitFor(() => expect(result.current.error).toBe(errA));

      // Reset clears the error.
      act(() => result.current.reset());
      expect(result.current.error).toBeNull();
    });
  });

  // ── Implementation requirement 5 ──
  // Do not add implicit mutation cancellation. A stale invocation
  // still settles (its promise resolves and its callbacks fire), it
  // just cannot write state if it is no longer the latest.
  describe('no implicit cancellation', () => {
    it('a stale mutation is not aborted; its promise resolves and its onSuccess fires', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useCreate } = createModelHooks({ modelService: mock.service });
      const onSuccess = vi.fn();

      const { result } = renderHook(() => useCreate({ onSuccess }));

      const resultA = makeCreateResult('A', 'A');
      const callA = await armDeferredAndFire(mock, 'create', resultA, 1, () => result.current.mutate({ name: 'A' }));

      const resultB = makeCreateResult('B', 'B');
      const callB = await armDeferredAndFire(mock, 'create', resultB, 2, () => result.current.mutate({ name: 'B' }));

      // Capture the lazy-request promises returned by each
      // service invocation BEFORE releasing settlement. Implicit
      // cancellation would leave A pending forever or reject it; we
      // assert A's per-invocation promise later resolves with its
      // own result and A's `onSuccess(resultA)` fires.
      const lazyA = mock.spies.create.mock.results[0].value as unknown as Promise<ModelResponse<TestDoc>>;
      const lazyB = mock.spies.create.mock.results[1].value as unknown as Promise<ModelResponse<TestDoc>>;
      const promiseA = lazyA.then((r) => r);
      const promiseB = lazyB.then((r) => r);

      // Release B (latest). B's promise resolves; B's `data` is
      // published by latest-invocation-wins.
      act(() => callB.controller.resolve(resultB));
      const bResolved = await promiseB;
      await waitFor(() => expect(result.current.data).toEqual({ _id: 'B', name: 'B', status: 'active' }));

      expect(bResolved).toBe(resultB);
      const successCallsAfterB = onSuccess.mock.calls.length;

      // Release A (stale). A's per-invocation promise STILL resolves
      // with its own result and A's `onSuccess(resultA)` observer
      // fires (invocation-specific). Only A's state writes are
      // suppressed. No implicit cancellation was attached.
      act(() => callA.controller.resolve(resultA));
      const aResolved = await promiseA;
      await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(successCallsAfterB + 1));

      expect(aResolved).toBe(resultA);
      expect(onSuccess).toHaveBeenLastCalledWith(resultA);
      // Latest-wins: stale-A did not overwrite B's hook-level data.
      expect(result.current.data).toEqual({ _id: 'B', name: 'B', status: 'active' });
      await waitFor(() => expect(result.current.isPending).toBe(false));
    });
  });
});
