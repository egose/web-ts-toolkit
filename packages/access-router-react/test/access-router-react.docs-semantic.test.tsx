import { act, renderHook, waitFor } from '@testing-library/react';
import type { Document, Model, ModelResponse } from '@web-ts-toolkit/access-router-client';
import { describe, expect, it } from 'vitest';

import { createModelHooks } from '../src/create-model-hook';
import { createMockService } from './support';

interface TestDoc extends Document {
  _id: string;
  name: string;
  status: string;
}

function makeModelResponse(id: string, name: string): ModelResponse<TestDoc> {
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
  const read = makeModelResponse('org_123', 'Northwind Labs');

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
    read,
    create: read,
    delete: { success: true, raw: 'org_123', data: 'org_123', message: 'ok', status: 200, headers: {} },
    count: { success: true, raw: 1, data: 1, message: 'ok', status: 200, headers: {} },
    distinct: { success: true, raw: ['active'], data: ['active'], message: 'ok', status: 200, headers: {} },
  };
}

async function runDocumentedCancellation(
  query: (id: string, options?: { signal?: AbortSignal }) => Promise<unknown>,
): Promise<{ cancelled: boolean; error: unknown }> {
  const controller = new AbortController();
  const pending = query('org_123', { signal: controller.signal });
  controller.abort(new DOMException('manual query cancelled', 'AbortError'));

  try {
    await pending;
    return { cancelled: false, error: null };
  } catch (error) {
    return { cancelled: true, error };
  }
}

describe('ARR-H09: documentation runtime semantics', () => {
  it('the cancellation example aborts before awaiting settlement, so the forwarded signal is already aborted while the transport is pending', async () => {
    const mock = createMockService<TestDoc>(makeSeed());
    mock.planDeferred('read', makeSeed().read);
    const { useRead } = createModelHooks({ modelService: mock.service });
    const { result } = renderHook(() => useRead({ enabled: false }));

    const documentedCancellation = runDocumentedCancellation(result.current.query);

    await waitFor(() => expect(mock.spies.read).toHaveBeenCalledTimes(1));
    const controlled = mock.lastCall('read');
    expect(controlled).toBeDefined();
    expect(controlled!.controller.signal?.aborted).toBe(true);

    await act(async () => {
      controlled!.controller.reject(new DOMException('manual query cancelled', 'AbortError'));
    });

    await expect(documentedCancellation).resolves.toMatchObject({
      cancelled: true,
      error: expect.any(DOMException),
    });
    await waitFor(() => expect(result.current.isFetching).toBe(false));
    expect(result.current.error).toBeNull();
  });

  it('the concurrent mutation example keeps Promise.all positions tied to invocation order while hook state still follows the latest invocation', async () => {
    const mock = createMockService<TestDoc>(makeSeed());
    const { useUpdate } = createModelHooks({ modelService: mock.service });
    const { result } = renderHook(() => useUpdate({ advanced: true, select: ['name'] as const }));
    const firstResponse = makeModelResponse('org_1', 'A');
    const secondResponse = makeModelResponse('org_1', 'B');

    mock.planDeferred('updateAdvanced', firstResponse);
    let firstPromise!: ReturnType<typeof result.current.mutate>;
    act(() => {
      firstPromise = result.current.mutate('org_1', { name: 'A' });
    });
    await waitFor(() => expect(mock.spies.updateAdvanced).toHaveBeenCalledTimes(1));
    const firstControlled = mock.lastCall('updateAdvanced');
    expect(firstControlled).toBeDefined();

    mock.planDeferred('updateAdvanced', secondResponse);
    let secondPromise!: ReturnType<typeof result.current.mutate>;
    act(() => {
      secondPromise = result.current.mutate('org_1', { name: 'B' });
    });
    await waitFor(() => expect(mock.spies.updateAdvanced).toHaveBeenCalledTimes(2));
    const secondControlled = mock.lastCall('updateAdvanced');
    expect(secondControlled).toBeDefined();

    const allResults = Promise.all([firstPromise, secondPromise]);

    act(() => {
      secondControlled!.controller.resolve(secondResponse);
    });
    await waitFor(() => expect(result.current.data).toEqual({ _id: 'org_1', name: 'B', status: 'active' }));

    act(() => {
      firstControlled!.controller.resolve(firstResponse);
    });

    const [firstResult, secondResult] = await allResults;
    expect(firstResult).toBe(firstResponse);
    expect(secondResult).toBe(secondResponse);
    expect(result.current.data).toEqual({ _id: 'org_1', name: 'B', status: 'active' });
  });
});
