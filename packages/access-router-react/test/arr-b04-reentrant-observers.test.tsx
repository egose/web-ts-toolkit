import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Document, ListModelResponse, Model, ModelResponse } from '@web-ts-toolkit/access-router-client';
import { createModelHooks } from '../src/create-model-hook';
import { createMockService, flushMicrotasks, makeServiceError } from './support';

interface TestDoc extends Document {
  _id: string;
  name: string;
  status: string;
}

function listResult(names: string[]): ListModelResponse<TestDoc> {
  return {
    success: true,
    raw: names.map((name) => ({ _id: name, name, status: 'active' })),
    data: names.map((name) => ({ _id: name, name, status: 'active' }) as Model<TestDoc> & TestDoc),
    message: 'ok',
    status: 200,
    headers: {},
    totalCount: names.length,
  };
}

function readResult(id: string, name: string): ModelResponse<TestDoc> {
  return {
    success: true,
    raw: { _id: id, name, status: 'active' },
    data: { _id: id, name, status: 'active' } as Model<TestDoc> & TestDoc,
    message: 'ok',
    status: 200,
    headers: {},
  };
}

function makeSeed(): ReturnType<typeof createMockService<TestDoc>>['seed'] {
  return {
    list: listResult(['a', 'b']),
    read: readResult('1', 'Initial'),
    create: readResult('1', 'Initial'),
    delete: { success: true, raw: '1', data: '1', message: 'ok', status: 200, headers: {} },
    count: { success: true, raw: 0, data: 0, message: 'ok', status: 200, headers: {} },
    distinct: { success: true, raw: [], data: [], message: 'ok', status: 200, headers: {} },
  };
}

describe('ARR-B04 reentrant observers', () => {
  it('retry B started in A onError retains B snapshot', async () => {
    const mock = createMockService<TestDoc>(makeSeed());
    const { useList } = createModelHooks({ modelService: mock.service });
    const refs: { current: ReturnType<typeof useList> }[] = [];
    let retryPromise: Promise<unknown> | undefined;
    const onError = vi.fn(() => {
      retryPromise = refs[refs.length - 1].current.refetch();
      (retryPromise as Promise<unknown>).catch(() => {});
    });
    const { result } = renderHook(() => {
      const r = useList({ listParams: { pageSize: 5 }, keepPreviousData: true, onError });
      refs.push({ current: r });
      return r;
    });
    await waitFor(() => expect(refs[refs.length - 1].current.data).toEqual(makeSeed().list.data));
    const initialData = refs[refs.length - 1].current.data;

    const svcErr = makeServiceError({ status: 503, message: 'A failed' });
    mock.planDeferred('list', listResult(['c']));
    act(() => {
      result.current.refetch().catch(() => {});
    });
    await waitFor(() => expect(mock.spies.list).toHaveBeenCalledTimes(2));
    // B retry resolves to ['c']; defer it so we can observe the pending window.
    mock.planDeferred('list', listResult(['c']));
    // Hmm: onError fires on A settlement; B is started inside onError.
    // To control B explicitly, pre-arm is not possible because B starts
    // synchronously inside the observer. Instead observe via lastCall.
    const callA = mock.lastCall('list');
    act(() => {
      callA!.controller.reject(svcErr);
    });
    await flushMicrotasks();
    await flushMicrotasks();
    expect(onError).toHaveBeenCalledTimes(1);
    // B is now pending; its snapshot must be the pre-A page.
    await waitFor(() => expect(mock.spies.list).toHaveBeenCalledTimes(3));
    await flushMicrotasks();
    expect(refs[refs.length - 1].current.previousData).toEqual(initialData);
    const callB = mock.lastCall('list');
    act(() => {
      callB!.controller.resolve();
    });
    await waitFor(() => expect(refs[refs.length - 1].current.data.map((d) => d.name)).toEqual(['c']));
    expect(refs[refs.length - 1].current.previousData).toBeUndefined();
  });

  it('B started in A onSuccess captures A data on first settlement', async () => {
    const mock = createMockService<TestDoc>(makeSeed());
    const { useList } = createModelHooks({ modelService: mock.service });
    const refs: { current: ReturnType<typeof useList> }[] = [];
    const onSuccess = vi.fn(() => {
      refs[refs.length - 1].current.refetch().catch(() => {});
    });
    renderHook(() => {
      const r = useList({ listParams: { pageSize: 5 }, keepPreviousData: true, enabled: false, onSuccess });
      refs.push({ current: r });
      return r;
    });
    const pageA = listResult(['A1']);
    mock.planDeferred('list', pageA);
    let pA: Promise<unknown> | undefined;
    act(() => {
      pA = refs[refs.length - 1].current.query({ pageSize: 5 });
      (pA as Promise<unknown>).catch(() => {});
    });
    await waitFor(() => expect(mock.spies.list).toHaveBeenCalledTimes(1));
    const callA = mock.lastCall('list');
    // Pre-arm B as deferred so it stays pending after onSuccess starts it.
    mock.planDeferred('list', listResult(['B1']));
    act(() => {
      callA!.controller.resolve(pageA);
    });
    await flushMicrotasks();
    await flushMicrotasks();
    expect(onSuccess).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mock.spies.list).toHaveBeenCalledTimes(2));
    await flushMicrotasks();
    // B must see A's just-settled page as previousData.
    expect(refs[refs.length - 1].current.previousData).toEqual(pageA.data);
  });

  it('B started in A onSuccess captures A data post-reset', async () => {
    const mock = createMockService<TestDoc>(makeSeed());
    const { useList } = createModelHooks({ modelService: mock.service });
    const refs: { current: ReturnType<typeof useList> }[] = [];
    let armed = false;
    const onSuccess = vi.fn(() => {
      if (!armed) return;
      refs[refs.length - 1].current.refetch().catch(() => {});
    });
    const { result } = renderHook(() => {
      const r = useList({ listParams: { pageSize: 5 }, keepPreviousData: true, enabled: false, onSuccess });
      refs.push({ current: r });
      return r;
    });
    // Establish settlement then reset so next settlement is first-post-reset.
    const page0 = listResult(['z']);
    mock.planDeferred('list', page0);
    act(() => {
      result.current.query({ pageSize: 5 }).catch(() => {});
    });
    await waitFor(() => expect(mock.spies.list).toHaveBeenCalledTimes(1));
    act(() => {
      mock.lastCall('list')!.controller.resolve(page0);
    });
    await waitFor(() => expect(refs[refs.length - 1].current.data).toEqual(page0.data));
    onSuccess.mockClear();
    armed = true;
    act(() => {
      result.current.reset();
    });
    expect(refs[refs.length - 1].current.data).toEqual([]);
    const pageA = listResult(['A2']);
    mock.planDeferred('list', pageA);
    act(() => {
      result.current.query({ pageSize: 5 }).catch(() => {});
    });
    await waitFor(() => expect(mock.spies.list).toHaveBeenCalledTimes(2));
    const callA = mock.lastCall('list');
    mock.planDeferred('list', listResult(['B2']));
    act(() => {
      callA!.controller.resolve(pageA);
    });
    await flushMicrotasks();
    await flushMicrotasks();
    expect(onSuccess).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mock.spies.list).toHaveBeenCalledTimes(3));
    await flushMicrotasks();
    expect(refs[refs.length - 1].current.previousData).toEqual(pageA.data);
  });

  it('sync unmount in query onSuccess skips onSettled', async () => {
    const mock = createMockService<TestDoc>(makeSeed());
    const { useRead } = createModelHooks({ modelService: mock.service });
    const onSettled = vi.fn();
    let unmountFn: () => void = () => {};
    const onSuccess = vi.fn(() => {
      unmountFn();
    });
    const { result, unmount } = renderHook(() => useRead({ enabled: false, onSuccess, onSettled }));
    unmountFn = unmount;
    mock.planDeferred('read', makeSeed().read);
    let p: Promise<unknown> | undefined;
    act(() => {
      p = result.current.query('1');
      (p as Promise<unknown>).catch(() => {});
    });
    await waitFor(() => expect(mock.spies.read).toHaveBeenCalledTimes(1));
    const call = mock.lastCall('read');
    await act(async () => {
      call!.controller.resolve();
      await flushMicrotasks();
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSettled).not.toHaveBeenCalled();
  });

  it('sync unmount in query onError skips onSettled', async () => {
    const mock = createMockService<TestDoc>(makeSeed());
    const { useRead } = createModelHooks({ modelService: mock.service });
    const onSettled = vi.fn();
    let unmountFn: () => void = () => {};
    const onError = vi.fn(() => {
      unmountFn();
    });
    const { result, unmount } = renderHook(() => useRead({ enabled: false, onError, onSettled }));
    unmountFn = unmount;
    const svcErr = makeServiceError({ status: 500, message: 'boom' });
    mock.planDeferred('read', makeSeed().read);
    act(() => {
      result.current.query('1').catch(() => {});
    });
    await waitFor(() => expect(mock.spies.read).toHaveBeenCalledTimes(1));
    const call = mock.lastCall('read');
    await act(async () => {
      call!.controller.reject(svcErr);
      await flushMicrotasks();
    });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onSettled).not.toHaveBeenCalled();
  });

  it('sync unmount in mutation onSuccess skips onSettled and data write', async () => {
    const mock = createMockService<TestDoc>(makeSeed());
    const { useCreate } = createModelHooks({ modelService: mock.service });
    const onSettled = vi.fn();
    let unmountFn: () => void = () => {};
    const onSuccess = vi.fn(() => {
      unmountFn();
      // capture is intentionally after unmount; hook must not write data
    });
    const { result, unmount } = renderHook(() => useCreate({ onSuccess, onSettled }));
    unmountFn = unmount;
    mock.planDeferred('create', makeSeed().create);
    let p: Promise<unknown> | undefined;
    act(() => {
      p = result.current.mutate({ name: 'x' } as never);
      (p as Promise<unknown>).catch(() => {});
    });
    await waitFor(() => expect(mock.spies.create).toHaveBeenCalledTimes(1));
    const call = mock.lastCall('create');
    await act(async () => {
      call!.controller.resolve();
      await flushMicrotasks();
    });
    await (p as Promise<unknown>).catch(() => {});
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSettled).not.toHaveBeenCalled();
    const seenDataAfter: unknown = result.current.data;
    expect(seenDataAfter).toBeNull();
  });

  it('sync unmount in mutation onError skips onSettled', async () => {
    const mock = createMockService<TestDoc>(makeSeed());
    const { useUpdate } = createModelHooks({ modelService: mock.service });
    const onSettled = vi.fn();
    let unmountFn: () => void = () => {};
    const onError = vi.fn(() => {
      unmountFn();
    });
    const { result, unmount } = renderHook(() => useUpdate({ onError, onSettled }));
    unmountFn = unmount;
    const svcErr = makeServiceError({ status: 500, message: 'mut fail' });
    mock.planDeferred('update', makeSeed().read);
    act(() => {
      result.current.mutate('1', { name: 'y' } as never).catch(() => {});
    });
    await waitFor(() => expect(mock.spies.update).toHaveBeenCalledTimes(1));
    const call = mock.lastCall('update');
    await act(async () => {
      call!.controller.reject(svcErr);
      await flushMicrotasks();
    });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onSettled).not.toHaveBeenCalled();
  });

  it('throwing query onSuccess still runs onSettled and preserves promise', async () => {
    const mock = createMockService<TestDoc>(makeSeed());
    const { useRead } = createModelHooks({ modelService: mock.service });
    const observerError = new Error('boom-success');
    const onSettled = vi.fn();
    const errors: unknown[] = [];
    const spy = vi.spyOn(globalThis, 'queueMicrotask').mockImplementation((cb: VoidFunction) => {
      Promise.resolve().then(() => {
        try {
          cb();
        } catch (e) {
          errors.push(e);
        }
      });
    });
    try {
      const { result } = renderHook(() =>
        useRead({
          enabled: false,
          onSuccess: () => {
            throw observerError;
          },
          onSettled,
        }),
      );
      let resolved: unknown;
      await act(async () => {
        resolved = await result.current.query('1');
      });
      await flushMicrotasks();
      expect(resolved).toBe(mock.seed.read);
      expect(onSettled).toHaveBeenCalledTimes(1);
      expect(errors).toEqual([observerError]);
    } finally {
      spy.mockRestore();
    }
  });
});
