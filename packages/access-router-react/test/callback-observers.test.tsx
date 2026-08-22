import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Document, Model, ModelResponse, Response } from '@web-ts-toolkit/access-router-client';
import { createModelHooks } from '../src/create-model-hook';
import { createMockService, flushMicrotasks, makeServiceError } from './support';

interface TestDoc extends Document {
  _id: string;
  name: string;
  status: string;
}

function makeReadResult(id: string, name: string): ModelResponse<TestDoc> {
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
    read: makeReadResult('1', 'Initial'),
    create: makeReadResult('1', 'Initial'),
    delete: makeDeleteResult('1'),
    count: { success: true, raw: 0, data: 0, message: 'ok', status: 200, headers: {} },
    distinct: { success: true, raw: [], data: [], message: 'ok', status: 200, headers: {} },
  };
}

function captureQueuedObserverErrors() {
  const errors: unknown[] = [];
  const queueMicrotaskSpy = vi.spyOn(globalThis, 'queueMicrotask').mockImplementation((cb: VoidFunction) => {
    Promise.resolve().then(() => {
      try {
        cb();
      } catch (error) {
        errors.push(error);
      }
    });
  });

  return {
    errors,
    restore() {
      queueMicrotaskSpy.mockRestore();
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ARR-H05 callback observer isolation', () => {
  it('a throwing query onSuccess still runs onSettled once and preserves the successful query() result', async () => {
    const mock = createMockService<TestDoc>(makeSeed());
    const observerError = new Error('query onSuccess failed');
    const onSettled = vi.fn();
    const onError = vi.fn();
    const queued = captureQueuedObserverErrors();

    try {
      const { useRead } = createModelHooks({ modelService: mock.service });
      const { result } = renderHook(() =>
        useRead({
          enabled: false,
          onSuccess: () => {
            throw observerError;
          },
          onError,
          onSettled,
        }),
      );

      let resolved: ModelResponse<TestDoc> | undefined;
      await act(async () => {
        resolved = await result.current.query('1');
      });
      await flushMicrotasks();

      expect(resolved).toBe(mock.seed.read);
      expect(result.current.data).toEqual(mock.seed.read.data);
      expect(result.current.error).toBeNull();
      expect(onError).not.toHaveBeenCalled();
      expect(onSettled).toHaveBeenCalledTimes(1);
      expect(onSettled).toHaveBeenCalledWith(mock.seed.read, null);
      expect(queued.errors).toEqual([observerError]);
    } finally {
      queued.restore();
    }
  });

  it('a throwing mutation onError still runs failure-form onSettled once and preserves the request rejection', async () => {
    const mock = createMockService<TestDoc>(makeSeed());
    const requestError = makeServiceError({ status: 503, message: 'mutation failed' });
    const observerError = new Error('mutation onError failed');
    const onSuccess = vi.fn();
    const onSettled = vi.fn();
    const queued = captureQueuedObserverErrors();

    mock.planNextRejection('update', requestError);

    try {
      const { useUpdate } = createModelHooks({ modelService: mock.service });
      const { result } = renderHook(() =>
        useUpdate({
          onSuccess,
          onError: () => {
            throw observerError;
          },
          onSettled,
        }),
      );

      let thrown: unknown;
      await act(async () => {
        try {
          await result.current.mutate('1', { name: 'Updated' });
        } catch (error) {
          thrown = error;
        }
      });
      await flushMicrotasks();

      expect(thrown).toBe(requestError);
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onSettled).toHaveBeenCalledTimes(1);
      expect(onSettled).toHaveBeenCalledWith(null, requestError);
      expect(result.current.error).toBe(requestError);
      expect(queued.errors).toEqual([observerError]);
    } finally {
      queued.restore();
    }
  });

  it('does not fire mutation callbacks after unmount even when the request settles later', async () => {
    const mock = createMockService<TestDoc>(makeSeed());
    const requestError = makeServiceError({ status: 500, message: 'late failure' });
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const onSettled = vi.fn();
    const { useDelete } = createModelHooks({ modelService: mock.service });
    const { result, unmount } = renderHook(() => useDelete({ onSuccess, onError, onSettled }));

    mock.planDeferred('delete', makeDeleteResult('1'));

    let pendingMutation: Promise<unknown> | undefined;
    await act(async () => {
      pendingMutation = result.current.mutate('1').catch((error) => error);
      await flushMicrotasks();
    });
    await waitFor(() => expect(mock.spies.delete).toHaveBeenCalledTimes(1));

    const call = mock.lastCall('delete');
    expect(call).toBeDefined();

    unmount();

    act(() => {
      call!.controller.reject(requestError);
    });
    const settled = await pendingMutation;
    await flushMicrotasks();

    expect(settled).toBe(requestError);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(onSettled).not.toHaveBeenCalled();
  });
});
