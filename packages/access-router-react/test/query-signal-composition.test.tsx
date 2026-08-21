import { describe, it, expect, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Document, ListModelResponse, Model, ModelResponse, Response } from '@web-ts-toolkit/access-router-client';
import { createModelHooks } from '../src/create-model-hook';
import { createMockService, flushMicrotasks, makeServiceError } from './support';

interface TestDoc extends Document {
  _id: string;
  name: string;
  status: string;
}

function makeSeed() {
  const readResult: ModelResponse<TestDoc> = {
    success: true,
    raw: { _id: '1', name: 'Existing', status: 'active' },
    data: { _id: '1', name: 'Existing', status: 'active' } as Model<TestDoc> & TestDoc,
    message: 'ok',
    status: 200,
    headers: {},
  };
  const listResult: ListModelResponse<TestDoc> = {
    success: true,
    raw: [],
    data: [],
    message: 'ok',
    status: 200,
    headers: {},
    totalCount: 0,
  };
  const countResult: Response<number> = {
    success: true,
    raw: 2,
    data: 2,
    message: 'ok',
    status: 200,
    headers: {},
  };
  const distinctResult: Response<string[]> = {
    success: true,
    raw: ['active'],
    data: ['active'],
    message: 'ok',
    status: 200,
    headers: {},
  };

  return {
    list: listResult,
    read: readResult,
    create: readResult,
    delete: { success: true, raw: '1', data: '1', message: 'ok', status: 200, headers: {} },
    count: countResult,
    distinct: distinctResult,
  };
}

describe('ARR-H01: query signal composition', () => {
  it('useRead, useList, useCount, and useDistinct accept requestConfig.signal without throwing during render', async () => {
    const signal = new AbortController().signal;

    {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useRead } = createModelHooks({ modelService: mock.service });
      renderHook(() => useRead({ id: '1', requestConfig: { signal } }));
      await waitFor(() => expect(mock.spies.read).toHaveBeenCalledTimes(1));
    }

    {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useList } = createModelHooks({ modelService: mock.service });
      renderHook(() => useList({ listParams: { page: 1 }, requestConfig: { signal } }));
      await waitFor(() => expect(mock.spies.list).toHaveBeenCalledTimes(1));
    }

    {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useCount } = createModelHooks({ modelService: mock.service });
      renderHook(() => useCount({ requestConfig: { signal } }));
      await waitFor(() => expect(mock.spies.count).toHaveBeenCalledTimes(1));
    }

    {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useDistinct } = createModelHooks({ modelService: mock.service });
      renderHook(() => useDistinct({ field: 'status', requestConfig: { signal } }));
      await waitFor(() => expect(mock.spies.distinct).toHaveBeenCalledTimes(1));
    }
  });

  it('changing only requestConfig.signal does not trigger an automatic refetch', async () => {
    const mock = createMockService<TestDoc>(makeSeed());
    const { useCount } = createModelHooks({ modelService: mock.service });
    const first = new AbortController();
    const second = new AbortController();

    const { rerender } = renderHook(
      ({ signal }: { signal: AbortSignal }) => useCount({ requestConfig: { headers: { 'X-Test': '1' }, signal } }),
      { initialProps: { signal: first.signal } },
    );

    await waitFor(() => expect(mock.spies.count).toHaveBeenCalledTimes(1));
    rerender({ signal: second.signal });
    await flushMicrotasks();
    expect(mock.spies.count).toHaveBeenCalledTimes(1);
  });

  it('a future manual query uses the latest requestConfig.signal after a signal-only rerender', async () => {
    const mock = createMockService<TestDoc>(makeSeed());
    mock.planDeferred('read', makeSeed().read);
    const { useRead } = createModelHooks({ modelService: mock.service });
    const first = new AbortController();
    const second = new AbortController();

    const { result, rerender } = renderHook(
      ({ signal }: { signal: AbortSignal }) => useRead({ enabled: false, requestConfig: { signal } }),
      { initialProps: { signal: first.signal } },
    );

    rerender({ signal: second.signal });

    let queryPromise: Promise<unknown> | undefined;
    act(() => {
      queryPromise = result.current.query('1');
    });

    await waitFor(() => expect(mock.spies.read).toHaveBeenCalledTimes(1));
    const [, , configArg] = mock.spies.read.mock.calls.at(-1) as [string, unknown, { signal: AbortSignal }];
    expect(configArg.signal.aborted).toBe(false);

    second.abort('latest-request-config-signal');
    expect(configArg.signal.aborted).toBe(true);
    expect(configArg.signal.reason).toBe('latest-request-config-signal');

    const controlled = mock.lastCall('read');
    act(() => {
      controlled!.controller.resolve();
    });
    await queryPromise;
  });

  it('a transport resolve after per-call abort does not write data or invoke success/settled callbacks', async () => {
    const mock = createMockService<TestDoc>(makeSeed());
    mock.planDeferred('read', makeSeed().read);
    const { useRead } = createModelHooks({ modelService: mock.service });
    const onSuccess = vi.fn();
    const onSettled = vi.fn();
    const callerController = new AbortController();

    const { result } = renderHook(() => useRead({ enabled: false, onSuccess, onSettled }));

    let queryPromise: Promise<unknown> | undefined;
    act(() => {
      queryPromise = result.current.query('1', { signal: callerController.signal });
    });

    await waitFor(() => expect(mock.spies.read).toHaveBeenCalledTimes(1));
    const controlled = mock.lastCall('read');
    await act(async () => {
      callerController.abort('manual-query-abort');
      controlled!.controller.resolve();
      await queryPromise;
    });
    await flushMicrotasks();

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isFetching).toBe(false);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onSettled).not.toHaveBeenCalled();
  });

  it('a transport reject after requestConfig abort does not write error or invoke error/settled callbacks', async () => {
    const mock = createMockService<TestDoc>(makeSeed());
    mock.planDeferred('read', makeSeed().read);
    const { useRead } = createModelHooks({ modelService: mock.service });
    const requestController = new AbortController();
    const onError = vi.fn();
    const onSettled = vi.fn();

    const { result } = renderHook(() =>
      useRead({ id: '1', requestConfig: { signal: requestController.signal }, onError, onSettled }),
    );

    await waitFor(() => expect(mock.spies.read).toHaveBeenCalledTimes(1));
    const controlled = mock.lastCall('read');
    await act(async () => {
      requestController.abort('request-config-abort');
      controlled!.controller.reject(makeServiceError({ message: 'late failure', status: 499 }));
    });
    await flushMicrotasks();
    await flushMicrotasks();

    expect(result.current.error).toBeNull();
    expect(result.current.isFetching).toBe(false);
    expect(onError).not.toHaveBeenCalled();
    expect(onSettled).not.toHaveBeenCalled();
  });
});
