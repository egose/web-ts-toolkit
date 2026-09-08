//
// ARR-B01 regression: disabling (or ID removal) must invalidate + abort the
// current request owner regardless of entry path (auto vs query()/refetch()).
//
// Before the fix, `useAutoQuery`'s `!shouldFetch` effect branch only converged
// flags without aborting the manager's current controller or bumping the
// owner token. After an auto settlement, a deferred manual `query()`/`refetch()`
// replaced the abort scope; disabling then aborted only the stale auto scope,
// so the manual invocation remained authoritative and could publish stale
// success/failure/rejection into the disabled hook. Likewise, a structural
// request-context change while disabled did not invalidate pending disabled
// manual work.

import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { createModelHooks } from '../src/create-model-hook';
import type {
  Document,
  FilterQuery,
  ListArgs,
  ListModelResponse,
  Model,
  ModelResponse,
} from '@web-ts-toolkit/access-router-client';
import { createMockService, makeServiceError, flushMicrotasks } from './support';
import type { MethodResult } from './support';

interface TestDoc extends Document {
  _id: string;
  name: string;
  status: string;
}

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

function manualSuccessFor(method: 'read', tag: string): MethodResult<TestDoc, 'read'>;
function manualSuccessFor(method: 'list', tag: string): MethodResult<TestDoc, 'list'>;
function manualSuccessFor(method: 'count', tag: string): MethodResult<TestDoc, 'count'>;
function manualSuccessFor(method: 'distinct', tag: string): MethodResult<TestDoc, 'distinct'>;
function manualSuccessFor(
  method: 'read' | 'list' | 'count' | 'distinct',
  tag: string,
): MethodResult<TestDoc, 'read' | 'list' | 'count' | 'distinct'> {
  if (method === 'read') {
    const doc = { _id: tag, name: tag, status: 'active' } as Model<TestDoc> & TestDoc;
    return {
      success: true,
      raw: { _id: tag, name: tag, status: 'active' },
      data: doc,
      message: 'ok',
      status: 200,
      headers: {},
    };
  }
  if (method === 'list') {
    const doc = { _id: tag, name: tag, status: 'active' } as Model<TestDoc> & TestDoc;
    return {
      success: true,
      raw: [{ _id: tag, name: tag, status: 'active' }],
      data: [doc],
      message: 'ok',
      status: 200,
      headers: {},
      totalCount: 1,
    };
  }
  if (method === 'count') {
    return { success: true, raw: 99, data: 99, message: 'ok', status: 200, headers: {} };
  }
  return { success: true, raw: [tag], data: [tag], message: 'ok', status: 200, headers: {} };
}

describe('ARR-B01: disable invalidates the current query owner', () => {
  it('useRead: auto settle -> pending query() -> disable aborts forwarded signal, flags converge, late success cannot publish', async () => {
    const mock = createMockService<TestDoc>(makeSeed());
    const { useRead } = createModelHooks({ modelService: mock.service });
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const onSettled = vi.fn();

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useRead({ id: '1', enabled, onSuccess, onError, onSettled }),
      { initialProps: { enabled: true } },
    );

    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(result.current.error).toBeNull();
    onSuccess.mockClear();
    onError.mockClear();
    onSettled.mockClear();

    mock.planDeferred('read', manualSuccessFor('read', 'Manual'));
    let q: Promise<unknown> | undefined;
    act(() => {
      q = result.current.query('1');
    });
    q!.catch(() => {});
    await waitFor(() => expect(mock.spies.read).toHaveBeenCalledTimes(2));
    const manual = mock.lastCall('read');
    expect(manual!.controller.signal?.aborted).toBe(false);
    await flushMicrotasks();
    expect(result.current.isFetching).toBe(true);

    rerender({ enabled: false });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
    expect(manual!.controller.signal?.aborted).toBe(true);

    act(() => {
      manual!.controller.resolve();
    });
    await flushMicrotasks();
    await flushMicrotasks();

    expect(result.current.data).toEqual({ _id: '1', name: 'Existing', status: 'active' });
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(onSettled).not.toHaveBeenCalled();
  });

  it('useRead: auto settle -> pending refetch() -> disable aborts forwarded signal and suppresses late success', async () => {
    const mock = createMockService<TestDoc>(makeSeed());
    const { useRead } = createModelHooks({ modelService: mock.service });
    const onSuccess = vi.fn();

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useRead({ id: '1', enabled, onSuccess }),
      { initialProps: { enabled: true } },
    );
    await waitFor(() => expect(result.current.data).not.toBeNull());
    onSuccess.mockClear();

    mock.planDeferred('read', manualSuccessFor('read', 'Refetched'));
    let q: Promise<unknown> | undefined;
    act(() => {
      q = result.current.refetch();
    });
    q!.catch(() => {});
    await waitFor(() => expect(mock.spies.read).toHaveBeenCalledTimes(2));
    const manual = mock.lastCall('read');

    rerender({ enabled: false });
    expect(manual!.controller.signal?.aborted).toBe(true);
    expect(result.current.isFetching).toBe(false);

    act(() => {
      manual!.controller.resolve();
    });
    await flushMicrotasks();
    await flushMicrotasks();
    expect(result.current.data).toEqual({ _id: '1', name: 'Existing', status: 'active' });
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('useList: auto settle -> pending query() -> disable aborts forwarded signal and suppresses late success', async () => {
    const mock = createMockService<TestDoc>(makeSeed());
    const { useList } = createModelHooks({ modelService: mock.service });
    const onSuccess = vi.fn();

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useList({ listParams: { pageSize: 5 }, enabled, onSuccess }),
      { initialProps: { enabled: true } },
    );
    await waitFor(() => expect(mock.spies.list).toHaveBeenCalledTimes(1));
    await flushMicrotasks();
    await flushMicrotasks();
    onSuccess.mockClear();

    mock.planDeferred('list', manualSuccessFor('list', 'ManualList'));
    let q: Promise<unknown> | undefined;
    act(() => {
      q = result.current.query({ pageSize: 5 });
    });
    q!.catch(() => {});
    await waitFor(() => expect(mock.spies.list).toHaveBeenCalledTimes(2));
    const manual = mock.lastCall('list');
    expect(manual!.controller.signal?.aborted).toBe(false);

    rerender({ enabled: false });
    expect(result.current.isFetching).toBe(false);
    expect(manual!.controller.signal?.aborted).toBe(true);

    act(() => {
      manual!.controller.resolve();
    });
    await flushMicrotasks();
    await flushMicrotasks();
    expect(result.current.data).toEqual([]);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('useList: auto settle -> pending refetch() -> disable suppresses late success', async () => {
    const mock = createMockService<TestDoc>(makeSeed());
    const { useList } = createModelHooks({ modelService: mock.service });
    const onSuccess = vi.fn();
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useList({ listParams: { pageSize: 5 }, enabled, onSuccess }),
      { initialProps: { enabled: true } },
    );
    await waitFor(() => expect(mock.spies.list).toHaveBeenCalledTimes(1));
    await flushMicrotasks();
    await flushMicrotasks();
    onSuccess.mockClear();

    mock.planDeferred('list', manualSuccessFor('list', 'RefetchList'));
    let q: Promise<unknown> | undefined;
    act(() => {
      q = result.current.refetch();
    });
    q!.catch(() => {});
    await waitFor(() => expect(mock.spies.list).toHaveBeenCalledTimes(2));
    const manual = mock.lastCall('list');
    rerender({ enabled: false });
    expect(manual!.controller.signal?.aborted).toBe(true);
    act(() => {
      manual!.controller.resolve();
    });
    await flushMicrotasks();
    await flushMicrotasks();
    expect(result.current.data).toEqual([]);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('useCount: auto settle -> pending query() -> disable aborts forwarded signal and suppresses late success', async () => {
    const mock = createMockService<TestDoc>(makeSeed());
    const { useCount } = createModelHooks({ modelService: mock.service });
    const onSuccess = vi.fn();
    const { result, rerender } = renderHook(({ enabled }: { enabled: boolean }) => useCount({ enabled, onSuccess }), {
      initialProps: { enabled: true },
    });
    await waitFor(() => expect(result.current.data).not.toBeNull());
    onSuccess.mockClear();

    mock.planDeferred('count', manualSuccessFor('count', 'x'));
    let q: Promise<unknown> | undefined;
    act(() => {
      q = result.current.query();
    });
    q!.catch(() => {});
    await waitFor(() => expect(mock.spies.count).toHaveBeenCalledTimes(2));
    const manual = mock.lastCall('count');
    rerender({ enabled: false });
    expect(manual!.controller.signal?.aborted).toBe(true);
    expect(result.current.isFetching).toBe(false);
    act(() => {
      manual!.controller.resolve();
    });
    await flushMicrotasks();
    await flushMicrotasks();
    expect(result.current.data).toBe(5);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('useCount: auto settle -> pending refetch() -> disable suppresses late success', async () => {
    const mock = createMockService<TestDoc>(makeSeed());
    const { useCount } = createModelHooks({ modelService: mock.service });
    const onSuccess = vi.fn();
    const { result, rerender } = renderHook(({ enabled }: { enabled: boolean }) => useCount({ enabled, onSuccess }), {
      initialProps: { enabled: true },
    });
    await waitFor(() => expect(result.current.data).not.toBeNull());
    onSuccess.mockClear();
    mock.planDeferred('count', manualSuccessFor('count', 'x'));
    let q: Promise<unknown> | undefined;
    act(() => {
      q = result.current.refetch();
    });
    q!.catch(() => {});
    await waitFor(() => expect(mock.spies.count).toHaveBeenCalledTimes(2));
    const manual = mock.lastCall('count');
    rerender({ enabled: false });
    expect(manual!.controller.signal?.aborted).toBe(true);
    act(() => {
      manual!.controller.resolve();
    });
    await flushMicrotasks();
    await flushMicrotasks();
    expect(result.current.data).toBe(5);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('useDistinct: auto settle -> pending query() -> disable aborts forwarded signal and suppresses late success', async () => {
    const mock = createMockService<TestDoc>(makeSeed());
    const { useDistinct } = createModelHooks({ modelService: mock.service });
    const onSuccess = vi.fn();
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useDistinct({ field: 'status', enabled, onSuccess }),
      { initialProps: { enabled: true } },
    );
    await waitFor(() => expect(result.current.data).not.toBeNull());
    onSuccess.mockClear();

    mock.planDeferred('distinct', manualSuccessFor('distinct', 'ManualDistinct'));
    let q: Promise<unknown> | undefined;
    act(() => {
      q = result.current.query();
    });
    q!.catch(() => {});
    await waitFor(() => expect(mock.spies.distinct).toHaveBeenCalledTimes(2));
    const manual = mock.lastCall('distinct');
    rerender({ enabled: false });
    expect(manual!.controller.signal?.aborted).toBe(true);
    act(() => {
      manual!.controller.resolve();
    });
    await flushMicrotasks();
    await flushMicrotasks();
    expect(result.current.data).toEqual(['active', 'pending']);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('useDistinct: auto settle -> pending refetch() -> disable suppresses late success', async () => {
    const mock = createMockService<TestDoc>(makeSeed());
    const { useDistinct } = createModelHooks({ modelService: mock.service });
    const onSuccess = vi.fn();
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useDistinct({ field: 'status', enabled, onSuccess }),
      { initialProps: { enabled: true } },
    );
    await waitFor(() => expect(result.current.data).not.toBeNull());
    onSuccess.mockClear();
    mock.planDeferred('distinct', manualSuccessFor('distinct', 'RefetchDistinct'));
    let q: Promise<unknown> | undefined;
    act(() => {
      q = result.current.refetch();
    });
    q!.catch(() => {});
    await waitFor(() => expect(mock.spies.distinct).toHaveBeenCalledTimes(2));
    const manual = mock.lastCall('distinct');
    rerender({ enabled: false });
    expect(manual!.controller.signal?.aborted).toBe(true);
    act(() => {
      manual!.controller.resolve();
    });
    await flushMicrotasks();
    await flushMicrotasks();
    expect(result.current.data).toEqual(['active', 'pending']);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('useRead: late resolved-failure and rejection after disable cannot publish error/observers', async () => {
    for (const mode of ['failure', 'rejection'] as const) {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useRead } = createModelHooks({ modelService: mock.service });
      const onError = vi.fn();
      const onSettled = vi.fn();
      const { result, rerender } = renderHook(
        ({ enabled }: { enabled: boolean }) => useRead({ id: '1', enabled, onError, onSettled }),
        { initialProps: { enabled: true } },
      );
      await waitFor(() => expect(result.current.data).not.toBeNull());
      onError.mockClear();
      onSettled.mockClear();

      if (mode === 'failure') {
        mock.planDeferred('read', {
          success: false,
          raw: { code: 'AUTHZ' },
          data: null,
          message: 'Forbidden',
          status: 403,
          headers: {},
        } as unknown as MethodResult<TestDoc, 'read'>);
      } else {
        mock.planDeferred('read', makeSeed().read);
      }
      let q: Promise<unknown> | undefined;
      act(() => {
        q = result.current.query('1');
      });
      q!.catch(() => {});
      await waitFor(() => expect(mock.spies.read).toHaveBeenCalledTimes(2));
      const manual = mock.lastCall('read');
      rerender({ enabled: false });
      expect(manual!.controller.signal?.aborted).toBe(true);
      act(() => {
        if (mode === 'failure') manual!.controller.resolve();
        else manual!.controller.reject(makeServiceError({ status: 500, message: 'boom' }));
      });
      await flushMicrotasks();
      await flushMicrotasks();
      expect(result.current.error).toBeNull();
      expect(result.current.isFetching).toBe(false);
      expect(result.current.isLoading).toBe(false);
      expect(onError).not.toHaveBeenCalled();
      expect(onSettled).not.toHaveBeenCalled();
    }
  });

  it('useRead: id removal after a pending manual query aborts it and suppresses late settlement', async () => {
    const mock = createMockService<TestDoc>(makeSeed());
    const { useRead } = createModelHooks({ modelService: mock.service });
    const onSuccess = vi.fn();
    const { result, rerender } = renderHook(({ id }: { id: string | undefined }) => useRead({ id, onSuccess }), {
      initialProps: { id: '1' as string | undefined },
    });
    await waitFor(() => expect(result.current.data).not.toBeNull());
    onSuccess.mockClear();

    mock.planDeferred('read', manualSuccessFor('read', 'ManualAfterSettle'));
    let q: Promise<unknown> | undefined;
    act(() => {
      q = result.current.query('1');
    });
    q!.catch(() => {});
    await waitFor(() => expect(mock.spies.read).toHaveBeenCalledTimes(2));
    const manual = mock.lastCall('read');

    rerender({ id: undefined });
    expect(result.current.isFetching).toBe(false);
    expect(manual!.controller.signal?.aborted).toBe(true);
    act(() => {
      manual!.controller.resolve();
    });
    await flushMicrotasks();
    await flushMicrotasks();
    expect(result.current.data).toEqual({ _id: '1', name: 'Existing', status: 'active' });
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('disabled manual request + structural context change cannot settle into the new context, but a newly invoked manual request still works', async () => {
    const mock = createMockService<TestDoc>(makeSeed());
    const { useList } = createModelHooks({ modelService: mock.service });
    const onSuccess = vi.fn();

    const { result, rerender } = renderHook(
      ({ filter }: { filter: { status: string } }) =>
        useList({ advanced: true, filter: filter as FilterQuery<TestDoc>, enabled: false, onSuccess }),
      { initialProps: { filter: { status: 'active' } } },
    );
    expect(mock.spies.listAdvanced).not.toHaveBeenCalled();

    // Explicit manual request while disabled: pending under the old context.
    mock.planDeferred('listAdvanced', {
      success: true,
      raw: [{ _id: 'old', name: 'Old', status: 'active' }],
      data: [{ _id: 'old', name: 'Old', status: 'active' }],
      message: 'ok',
      status: 200,
      headers: {},
      totalCount: 1,
    } as unknown as MethodResult<TestDoc, 'listAdvanced'>);
    let oldQ: Promise<unknown> | undefined;
    act(() => {
      oldQ = result.current.query({ pageSize: 5 } as ListArgs);
    });
    oldQ!.catch(() => {});
    await waitFor(() => expect(mock.spies.listAdvanced).toHaveBeenCalledTimes(1));
    const stale = mock.lastCall('listAdvanced');

    // Structural context change while remaining disabled invalidates stale work.
    rerender({ filter: { status: 'archived' } });
    expect(stale!.controller.signal?.aborted).toBe(true);

    act(() => {
      stale!.controller.resolve();
    });
    await flushMicrotasks();
    await flushMicrotasks();
    expect(result.current.data).toEqual([]);
    expect(onSuccess).not.toHaveBeenCalled();

    // A newly invoked manual request after the context change still works.
    onSuccess.mockClear();
    mock.planDeferred('listAdvanced', {
      success: true,
      raw: [{ _id: 'new', name: 'New', status: 'archived' }],
      data: [{ _id: 'new', name: 'New', status: 'archived' }],
      message: 'ok',
      status: 200,
      headers: {},
      totalCount: 1,
    } as unknown as MethodResult<TestDoc, 'listAdvanced'>);
    let newQ: Promise<unknown> | undefined;
    act(() => {
      newQ = result.current.query({ pageSize: 5 } as ListArgs);
    });
    const settled = await act(async () => {
      mock.lastCall('listAdvanced')!.controller.resolve();
      await flushMicrotasks();
      return newQ!;
    });
    await flushMicrotasks();
    expect((settled as { data: unknown }).data).toEqual([{ _id: 'new', name: 'New', status: 'archived' }]);
    expect(result.current.data).toEqual([{ _id: 'new', name: 'New', status: 'archived' }]);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });
});
