import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createModelHooks } from '../src/create-model-hook';
import type { Document, ListModelResponse, Model, ModelResponse, Response } from '@web-ts-toolkit/access-router-client';
import { flushMicrotasks, createMockService, makeFailureResult, makeServiceError } from './support';

interface TestDoc extends Document {
  _id: string;
  name: string;
  status: string;
}

function makeSeed(): ReturnType<typeof createMockService<TestDoc>>['seed'] {
  const read: ModelResponse<TestDoc> = {
    success: true,
    raw: { _id: '1', name: 'Alpha', status: 'active' },
    data: { _id: '1', name: 'Alpha', status: 'active' } as Model<TestDoc> & TestDoc,
    message: 'ok',
    status: 200,
    headers: {},
  };
  const list: ListModelResponse<TestDoc> = {
    success: true,
    raw: [{ _id: '1', name: 'Alpha', status: 'active' }],
    data: [{ _id: '1', name: 'Alpha', status: 'active' } as Model<TestDoc> & TestDoc],
    message: 'ok',
    status: 200,
    headers: {},
    totalCount: 1,
  };
  return {
    list,
    read,
    create: read,
    delete: { success: true, raw: '1', data: '1', message: 'ok', status: 200, headers: {} },
    count: { success: true, raw: 5, data: 5, message: 'ok', status: 200, headers: {} },
    distinct: {
      success: true,
      raw: ['active'],
      data: ['active'],
      message: 'ok',
      status: 200,
      headers: {},
    },
  };
}

describe('ARR-H02: query reset invalidates pending settlement ownership', () => {
  it('useRead reset clears authoritative activity, ignores stale success, and lets a later query own state', async () => {
    const mock = createMockService<TestDoc>(makeSeed());
    const { useRead } = createModelHooks({ modelService: mock.service });
    const initialData = { _id: '0', name: 'Cached', status: 'cached' } as Model<TestDoc> & TestDoc;
    const staleSuccess = {
      success: true,
      raw: { _id: '1', name: 'Stale', status: 'active' },
      data: { _id: '1', name: 'Stale', status: 'active' } as Model<TestDoc> & TestDoc,
      message: 'ok',
      status: 200,
      headers: {},
    } satisfies ModelResponse<TestDoc>;
    const freshSuccess = {
      success: true,
      raw: { _id: '2', name: 'Fresh', status: 'active' },
      data: { _id: '2', name: 'Fresh', status: 'active' } as Model<TestDoc> & TestDoc,
      message: 'ok',
      status: 200,
      headers: {},
    } satisfies ModelResponse<TestDoc>;
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const onSettled = vi.fn();

    mock.planDeferred('read', staleSuccess);

    const { result } = renderHook(() => useRead({ enabled: false, initialData, onSuccess, onError, onSettled }));

    act(() => {
      void result.current.query('1');
    });
    await waitFor(() => expect(mock.spies.read).toHaveBeenCalledTimes(1));
    const first = mock.lastCall('read');
    await flushMicrotasks();
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isFetching).toBe(true);

    act(() => {
      result.current.reset();
    });
    expect(result.current.data).toEqual(initialData);
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);

    act(() => {
      first!.controller.resolve();
    });
    await flushMicrotasks();
    await flushMicrotasks();
    expect(result.current.data).toEqual(initialData);
    expect(result.current.error).toBeNull();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(onSettled).not.toHaveBeenCalled();

    mock.planNextSuccess('read', freshSuccess);
    await act(async () => {
      await result.current.query('2');
    });
    expect(result.current.data).toEqual(freshSuccess.data);
    expect(result.current.error).toBeNull();
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('useList reset clears list-specific state, ignores stale success, and treats the next request as a fresh first request', async () => {
    const mock = createMockService<TestDoc>(makeSeed());
    const { useList } = createModelHooks({ modelService: mock.service });
    const firstPage = {
      success: true,
      raw: [{ _id: '1', name: 'Alpha', status: 'active' }],
      data: [{ _id: '1', name: 'Alpha', status: 'active' } as Model<TestDoc> & TestDoc],
      message: 'ok',
      status: 200,
      headers: {},
      totalCount: 1,
    } satisfies ListModelResponse<TestDoc>;
    const stalePage = {
      success: true,
      raw: [{ _id: '2', name: 'Stale', status: 'active' }],
      data: [{ _id: '2', name: 'Stale', status: 'active' } as Model<TestDoc> & TestDoc],
      message: 'ok',
      status: 200,
      headers: {},
      totalCount: 99,
    } satisfies ListModelResponse<TestDoc>;
    const freshPage = {
      success: true,
      raw: [{ _id: '3', name: 'Fresh', status: 'active' }],
      data: [{ _id: '3', name: 'Fresh', status: 'active' } as Model<TestDoc> & TestDoc],
      message: 'ok',
      status: 200,
      headers: {},
      totalCount: 3,
    } satisfies ListModelResponse<TestDoc>;
    const onSuccess = vi.fn();
    const onSettled = vi.fn();

    mock.planNextSuccess('list', firstPage);

    const { result } = renderHook(() =>
      useList({ listParams: { pageSize: 5 }, keepPreviousData: true, onSuccess, onSettled }),
    );

    await waitFor(() => {
      expect(result.current.data).toEqual(firstPage.data);
    });
    expect(result.current.totalCount).toBe(1);
    expect(result.current.previousData).toBeUndefined();
    onSuccess.mockClear();
    onSettled.mockClear();

    mock.planDeferred('list', stalePage);
    act(() => {
      void result.current.refetch();
    });
    await waitFor(() => expect(mock.spies.list).toHaveBeenCalledTimes(2));
    const second = mock.lastCall('list');
    await flushMicrotasks();
    expect(result.current.isFetching).toBe(true);
    expect(result.current.previousData).toEqual(firstPage.data);

    act(() => {
      result.current.reset();
    });
    expect(result.current.data).toEqual([]);
    expect(result.current.previousData).toBeUndefined();
    expect(result.current.totalCount).toBe(0);
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);

    act(() => {
      second!.controller.resolve();
    });
    await flushMicrotasks();
    await flushMicrotasks();
    expect(result.current.data).toEqual([]);
    expect(result.current.previousData).toBeUndefined();
    expect(result.current.totalCount).toBe(0);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onSettled).not.toHaveBeenCalled();

    mock.planDeferred('list', freshPage);
    act(() => {
      void result.current.refetch();
    });
    await waitFor(() => expect(mock.spies.list).toHaveBeenCalledTimes(3));
    const third = mock.lastCall('list');
    await flushMicrotasks();
    expect(result.current.previousData).toBeUndefined();

    act(() => {
      third!.controller.resolve();
    });
    await waitFor(() => {
      expect(result.current.data).toEqual(freshPage.data);
    });
    expect(result.current.totalCount).toBe(3);
    expect(result.current.previousData).toBeUndefined();
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('useCount reset ignores a stale resolved failure and lets a later query own state', async () => {
    const mock = createMockService<TestDoc>(makeSeed());
    const { useCount } = createModelHooks({ modelService: mock.service });
    const onError = vi.fn();
    const onSettled = vi.fn();

    mock.planDeferred('count', makeSeed().count);

    const { result } = renderHook(() => useCount({ enabled: false, onError, onSettled }));

    act(() => {
      void result.current.query();
    });
    await waitFor(() => expect(mock.spies.count).toHaveBeenCalledTimes(1));
    const first = mock.lastCall('count');
    await flushMicrotasks();
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isFetching).toBe(true);

    act(() => {
      result.current.reset();
    });
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);

    act(() => {
      first!.controller.resolveFailure(makeFailureResult({ status: 503, message: 'Unavailable' }) as Response<number>);
    });
    await flushMicrotasks();
    await flushMicrotasks();
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(onError).not.toHaveBeenCalled();
    expect(onSettled).not.toHaveBeenCalled();

    mock.planNextSuccess('count', { success: true, raw: 7, data: 7, message: 'ok', status: 200, headers: {} });
    await act(async () => {
      await result.current.query();
    });
    expect(result.current.data).toBe(7);
    expect(result.current.error).toBeNull();
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('useDistinct reset ignores a stale rejection and lets a later query own state', async () => {
    const mock = createMockService<TestDoc>(makeSeed());
    const { useDistinct } = createModelHooks({ modelService: mock.service });
    const rejection = makeServiceError({ status: 502, message: 'Bad gateway' });
    const onError = vi.fn();
    const onSettled = vi.fn();

    mock.planDeferred('distinct', makeSeed().distinct);

    const { result } = renderHook(() => useDistinct({ field: 'status', enabled: false, onError, onSettled }));

    act(() => {
      void result.current.query();
    });
    await waitFor(() => expect(mock.spies.distinct).toHaveBeenCalledTimes(1));
    const first = mock.lastCall('distinct');
    await flushMicrotasks();
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isFetching).toBe(true);

    act(() => {
      result.current.reset();
    });
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);

    act(() => {
      first!.controller.reject(rejection);
    });
    await flushMicrotasks();
    await flushMicrotasks();
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(onError).not.toHaveBeenCalled();
    expect(onSettled).not.toHaveBeenCalled();

    mock.planNextSuccess('distinct', {
      success: true,
      raw: ['active', 'pending'],
      data: ['active', 'pending'],
      message: 'ok',
      status: 200,
      headers: {},
    });
    await act(async () => {
      await result.current.query();
    });
    expect(result.current.data).toEqual(['active', 'pending']);
    expect(result.current.error).toBeNull();
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('a caller-signal abort after reset cannot publish stale query state or callbacks', async () => {
    const mock = createMockService<TestDoc>(makeSeed());
    const { useRead } = createModelHooks({ modelService: mock.service });
    const callerController = new AbortController();
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const onSettled = vi.fn();

    mock.planDeferred('read', makeSeed().read);

    const { result } = renderHook(() => useRead({ enabled: false, onSuccess, onError, onSettled }));

    act(() => {
      void result.current.query('1', { signal: callerController.signal });
    });
    await waitFor(() => expect(mock.spies.read).toHaveBeenCalledTimes(1));
    const first = mock.lastCall('read');
    await flushMicrotasks();

    act(() => {
      result.current.reset();
    });
    callerController.abort(new DOMException('Reset stale request', 'AbortError'));
    expect(first!.controller.signal?.aborted).toBe(true);

    act(() => {
      first!.controller.reject(Object.assign(new Error('Canceled'), { code: 'ERR_CANCELED' }));
    });
    await flushMicrotasks();
    await flushMicrotasks();
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(onSettled).not.toHaveBeenCalled();
  });
});
