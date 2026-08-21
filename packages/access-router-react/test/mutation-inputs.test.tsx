import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Document, Model, ModelResponse, ListModelResponse, Response } from '@web-ts-toolkit/access-router-client';
import { createModelHooks } from '../src/create-model-hook';
import { createMockService } from './support';

interface TestDoc extends Document {
  _id: string;
  name: string;
  status: string;
}

function makeSeed() {
  const readResult: ModelResponse<TestDoc> = {
    success: true,
    raw: { _id: '1', name: 'Test', status: 'active' },
    data: { _id: '1', name: 'Test', status: 'active' } as Model<TestDoc> & TestDoc,
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

  const deleteResult: Response<string> = {
    success: true,
    raw: '1',
    data: '1',
    message: 'ok',
    status: 200,
    headers: {},
  };

  const countResult: Response<number> = {
    success: true,
    raw: 1,
    data: 1,
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
    delete: deleteResult,
    count: countResult,
    distinct: distinctResult,
  };
}

describe('mutation input contracts (ARR-H04)', () => {
  it.each([
    { advanced: false, createMethod: 'create', advancedMethod: 'createAdvanced' },
    { advanced: true, createMethod: 'createAdvanced', advancedMethod: 'create' },
  ] as const)(
    'useCreate rejects array input before calling the service in $createMethod mode',
    async ({ advanced, createMethod, advancedMethod }) => {
      const mock = createMockService<TestDoc>(makeSeed());
      const onError = vi.fn();
      const onSuccess = vi.fn();
      const onSettled = vi.fn();
      const { useCreate } = createModelHooks({ modelService: mock.service });
      const { result } = renderHook(() => useCreate({ advanced, onError, onSuccess, onSettled }));

      let thrown: unknown;
      await act(async () => {
        try {
          await result.current.mutate([{ name: 'Bulk' }] as never);
        } catch (error) {
          thrown = error;
        }
      });

      expect(thrown).toBeInstanceOf(TypeError);
      expect((thrown as Error).message).toContain('single-record-only');
      expect(mock.spies[createMethod]).not.toHaveBeenCalled();
      expect(mock.spies[advancedMethod]).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onSettled).not.toHaveBeenCalled();
      expect(result.current.data).toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.isPending).toBe(false);
    },
  );
});
