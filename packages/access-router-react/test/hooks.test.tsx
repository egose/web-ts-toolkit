/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { createModelHooks } from '../src/create-model-hook';
import type {
  Document,
  Model,
  ModelService,
  Response,
  ModelResponse,
  ListModelResponse,
} from '@web-ts-toolkit/access-router-client';
import { ServiceError } from '@web-ts-toolkit/access-router-client';

// ── Lazy mock helper ──

function createLazyMock<T>(result: T) {
  const execFn = vi.fn().mockResolvedValue(result);
  const resolved = Promise.resolve(result);
  return {
    exec: execFn,
    then: <R1 = T, R2 = never>(
      onfulfilled?: ((value: T) => R1 | PromiseLike<R1>) | null,
      onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
    ) => resolved.then(onfulfilled as any, onrejected as any),
    catch: <R = never,>(onrejected?: ((reason: unknown) => R | PromiseLike<R>) | null) =>
      resolved.catch(onrejected as any),
    finally: (onfinally?: (() => void) | null) => resolved.finally(onfinally),
    [Symbol.toStringTag]: 'Promise',
  } as const;
}

function createRejectingLazyMock(error: unknown) {
  let lazyRejected: Promise<never> | undefined;
  const getRejected = () => (lazyRejected ??= Promise.reject(error));
  const execFn = vi.fn().mockRejectedValue(error);
  return {
    exec: execFn,
    then: <R1 = never, R2 = never>(
      onfulfilled?: ((value: never) => R1 | PromiseLike<R1>) | null,
      onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
    ) => getRejected().then(onfulfilled as any, onrejected as any),
    catch: <R = never,>(onrejected?: ((reason: unknown) => R | PromiseLike<R>) | null) =>
      getRejected().catch(onrejected as any),
    finally: (onfinally?: (() => void) | null) => getRejected().finally(onfinally),
    [Symbol.toStringTag]: 'Promise',
  } as const;
}

// ── Mock service factory ──

interface TestDoc extends Document {
  _id: string;
  name: string;
  status: string;
}

function createMockService() {
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
    raw: { _id: '1', name: 'Test', status: 'active' },
    data: { _id: '1', name: 'Test', status: 'active' } as Model<TestDoc> & TestDoc,
    message: 'ok',
    status: 200,
    headers: {},
  };
  const createResult: ModelResponse<TestDoc> = {
    success: true,
    raw: { _id: '2', name: 'New', status: 'pending' },
    data: { _id: '2', name: 'New', status: 'pending' } as Model<TestDoc> & TestDoc,
    message: 'ok',
    status: 201,
    headers: {},
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
    raw: 5,
    data: 5,
    message: 'ok',
    status: 200,
    headers: {},
  };
  const distinctResult: Response<string[]> = {
    success: true,
    raw: ['active', 'pending'],
    data: ['active', 'pending'],
    message: 'ok',
    status: 200,
    headers: {},
  };

  const service = {
    list: vi.fn().mockReturnValue(createLazyMock(listResult)),
    listAdvanced: vi.fn().mockReturnValue(createLazyMock(listResult)),
    read: vi.fn().mockReturnValue(createLazyMock(readResult)),
    readAdvanced: vi.fn().mockReturnValue(createLazyMock(readResult)),
    create: vi.fn().mockReturnValue(createLazyMock(createResult)),
    createAdvanced: vi.fn().mockReturnValue(createLazyMock(createResult)),
    update: vi.fn().mockReturnValue(createLazyMock(readResult)),
    updateAdvanced: vi.fn().mockReturnValue(createLazyMock(readResult)),
    upsert: vi.fn().mockReturnValue(createLazyMock(readResult)),
    upsertAdvanced: vi.fn().mockReturnValue(createLazyMock(readResult)),
    delete: vi.fn().mockReturnValue(createLazyMock(deleteResult)),
    count: vi.fn().mockReturnValue(createLazyMock(countResult)),
    countAdvanced: vi.fn().mockReturnValue(createLazyMock(countResult)),
    distinct: vi.fn().mockReturnValue(createLazyMock(distinctResult)),
    distinctAdvanced: vi.fn().mockReturnValue(createLazyMock(distinctResult)),
  } as unknown as ModelService<TestDoc>;

  return { service, listResult, readResult, createResult, deleteResult, countResult, distinctResult };
}

// ── createModelHooks tests ──

describe('createModelHooks', () => {
  it('returns an object with all 8 hooks', () => {
    const { service } = createMockService();
    const hooks = createModelHooks({ modelService: service });
    expect(typeof hooks.useReadModel).toBe('function');
    expect(typeof hooks.useListModel).toBe('function');
    expect(typeof hooks.useCreateModel).toBe('function');
    expect(typeof hooks.useUpdateModel).toBe('function');
    expect(typeof hooks.useUpsertModel).toBe('function');
    expect(typeof hooks.useDeleteModel).toBe('function');
    expect(typeof hooks.useCountModel).toBe('function');
    expect(typeof hooks.useDistinctModel).toBe('function');
  });

  // ── useReadModel ──

  describe('useReadModel', () => {
    it('returns initial state', () => {
      const { service } = createMockService();
      const { useReadModel } = createModelHooks({ modelService: service });
      const { result } = renderHook(() => useReadModel());
      expect(result.current.data).toBeNull();
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isFetching).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('auto-fetches on mount when id is provided', async () => {
      const { service } = createMockService();
      const { useReadModel } = createModelHooks({ modelService: service });
      renderHook(() => useReadModel({ id: '1' }));
      await waitFor(() => {
        expect(service.read).toHaveBeenCalledWith('1', undefined, expect.any(Object));
      });
    });

    it('does not fetch when enabled is false', () => {
      const { service } = createMockService();
      const { useReadModel } = createModelHooks({ modelService: service });
      renderHook(() => useReadModel({ id: '1', enabled: false }));
      expect(service.read).not.toHaveBeenCalled();
    });

    it('does not fetch when id is missing', () => {
      const { service } = createMockService();
      const { useReadModel } = createModelHooks({ modelService: service });
      renderHook(() => useReadModel());
      expect(service.read).not.toHaveBeenCalled();
    });

    it('manual read() populates data', async () => {
      const { service } = createMockService();
      const { useReadModel } = createModelHooks({ modelService: service });
      const { result } = renderHook(() => useReadModel());
      await act(async () => {
        await result.current.readModel('1');
      });
      expect(result.current.data).toEqual({ _id: '1', name: 'Test', status: 'active' });
    });

    it('calls onSuccess after fetch', async () => {
      const { service } = createMockService();
      const onSuccess = vi.fn();
      const { useReadModel } = createModelHooks({ modelService: service });
      renderHook(() => useReadModel({ id: '1', onSuccess }));
      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
      });
    });

    it('calls onError on failure', async () => {
      const { service } = createMockService();
      const error = new ServiceError({
        success: false,
        message: 'fail',
        status: 500,
        raw: null,
        data: null,
        headers: {},
      });
      (service.read as ReturnType<typeof vi.fn>).mockReturnValue(createRejectingLazyMock(error));
      const onError = vi.fn();
      const { useReadModel } = createModelHooks({ modelService: service });
      renderHook(() => useReadModel({ id: '1', onError }));
      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith(error);
      });
    });

    it('calls onSettled on success', async () => {
      const { service } = createMockService();
      const onSettled = vi.fn();
      const { useReadModel } = createModelHooks({ modelService: service });
      renderHook(() => useReadModel({ id: '1', onSettled }));
      await waitFor(() => {
        expect(onSettled).toHaveBeenCalledWith(expect.objectContaining({ success: true }), null);
      });
    });

    it('calls onSettled on error', async () => {
      const { service } = createMockService();
      const error = new ServiceError({
        success: false,
        message: 'fail',
        status: 500,
        raw: null,
        data: null,
        headers: {},
      });
      (service.read as ReturnType<typeof vi.fn>).mockReturnValue(createRejectingLazyMock(error));
      const onSettled = vi.fn();
      const { useReadModel } = createModelHooks({ modelService: service });
      renderHook(() => useReadModel({ id: '1', onSettled }));
      await waitFor(() => {
        expect(onSettled).toHaveBeenCalledWith(null, error);
      });
    });

    it('uses initialData', () => {
      const { service } = createMockService();
      const { useReadModel } = createModelHooks({ modelService: service });
      const initial = { _id: '0', name: 'Cached', status: 'active' } as Model<TestDoc> & TestDoc;
      const { result } = renderHook(() => useReadModel({ initialData: initial }));
      expect(result.current.data).toEqual(initial);
    });

    it('advanced mode calls readAdvanced', async () => {
      const { service } = createMockService();
      const { useReadModel } = createModelHooks({ modelService: service });
      renderHook(() => useReadModel({ id: '1', advanced: true }));
      await waitFor(() => {
        expect(service.readAdvanced).toHaveBeenCalled();
      });
    });
  });

  // ── useListModel ──

  describe('useListModel', () => {
    it('returns initial state', () => {
      const { service } = createMockService();
      const { useListModel } = createModelHooks({ modelService: service });
      const { result } = renderHook(() => useListModel());
      expect(result.current.data).toEqual([]);
      expect(result.current.totalCount).toBe(0);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.previousData).toBeUndefined();
    });

    it('auto-fetches on mount when listParams is provided', async () => {
      const { service } = createMockService();
      const { useListModel } = createModelHooks({ modelService: service });
      renderHook(() => useListModel({ listParams: { pageSize: 10 } }));
      await waitFor(() => {
        expect(service.list).toHaveBeenCalled();
      });
    });

    it('does not fetch when enabled is false', () => {
      const { service } = createMockService();
      const { useListModel } = createModelHooks({ modelService: service });
      renderHook(() => useListModel({ listParams: {}, enabled: false }));
      expect(service.list).not.toHaveBeenCalled();
    });

    it('advanced mode calls listAdvanced', async () => {
      const { service } = createMockService();
      const { useListModel } = createModelHooks({ modelService: service });
      renderHook(() => useListModel({ advanced: true, filter: { status: 'active' } }));
      await waitFor(() => {
        expect(service.listAdvanced).toHaveBeenCalled();
      });
    });

    it('manual list() populates data', async () => {
      const { service } = createMockService();
      const { useListModel } = createModelHooks({ modelService: service });
      const { result } = renderHook(() => useListModel());
      await act(async () => {
        await result.current.listModel();
      });
      expect(result.current.data).toEqual([]);
      expect(result.current.totalCount).toBe(0);
    });

    it('calls onError on failure', async () => {
      const { service } = createMockService();
      const error = new ServiceError({
        success: false,
        message: 'fail',
        status: 500,
        raw: null,
        data: null,
        headers: {},
      });
      (service.list as ReturnType<typeof vi.fn>).mockReturnValue(createRejectingLazyMock(error));
      const onError = vi.fn();
      const { useListModel } = createModelHooks({ modelService: service });
      renderHook(() => useListModel({ listParams: {}, onError }));
      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith(error);
      });
    });

    it('calls onSuccess after fetch', async () => {
      const { service } = createMockService();
      const onSuccess = vi.fn();
      const { useListModel } = createModelHooks({ modelService: service });
      renderHook(() => useListModel({ listParams: {}, onSuccess }));
      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalled();
      });
    });

    it('uses initialData', () => {
      const { service } = createMockService();
      const { useListModel } = createModelHooks({ modelService: service });
      const initial = [{ _id: '0', name: 'Cached', status: 'active' }] as (Model<TestDoc> & TestDoc)[];
      const { result } = renderHook(() => useListModel({ initialData: initial }));
      expect(result.current.data).toEqual(initial);
    });

    it('keepPreviousData sets previousData during refetch', async () => {
      const { service } = createMockService();
      const { useListModel } = createModelHooks({ modelService: service });
      const { result } = renderHook(() => useListModel({ listParams: {}, keepPreviousData: true }));

      // Wait for the initial fetch to complete
      await waitFor(() => {
        expect(result.current.isFetching).toBe(false);
      });

      expect(result.current.previousData).toBeUndefined();
    });
  });

  // ── useCreateModel ──

  describe('useCreateModel', () => {
    it('returns initial state', () => {
      const { service } = createMockService();
      const { useCreateModel } = createModelHooks({ modelService: service });
      const { result } = renderHook(() => useCreateModel());
      expect(result.current.data).toBeNull();
      expect(result.current.isPending).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('create() populates data', async () => {
      const { service } = createMockService();
      const { useCreateModel } = createModelHooks({ modelService: service });
      const { result } = renderHook(() => useCreateModel());
      await act(async () => {
        await result.current.createModel({ name: 'New' });
      });
      expect(result.current.data).toEqual({ _id: '2', name: 'New', status: 'pending' });
      expect(service.create).toHaveBeenCalled();
    });

    it('calls onSuccess callback', async () => {
      const { service } = createMockService();
      const onSuccess = vi.fn();
      const { useCreateModel } = createModelHooks({ modelService: service });
      const { result } = renderHook(() => useCreateModel({ onSuccess }));
      await act(async () => {
        await result.current.createModel({ name: 'New' });
      });
      expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('calls onError on failure', async () => {
      const { service } = createMockService();
      const error = new ServiceError({
        success: false,
        message: 'fail',
        status: 500,
        raw: null,
        data: null,
        headers: {},
      });
      (service.create as ReturnType<typeof vi.fn>).mockReturnValue(createRejectingLazyMock(error));
      const onError = vi.fn();
      const { useCreateModel } = createModelHooks({ modelService: service });
      const { result } = renderHook(() => useCreateModel({ onError }));
      await act(async () => {
        try {
          await result.current.createModel({ name: 'New' });
        } catch {
          /* expected */
        }
      });
      expect(onError).toHaveBeenCalledWith(error);
      expect(result.current.error).toBe(error);
    });

    it('calls onSettled on success', async () => {
      const { service } = createMockService();
      const onSettled = vi.fn();
      const { useCreateModel } = createModelHooks({ modelService: service });
      const { result } = renderHook(() => useCreateModel({ onSettled }));
      await act(async () => {
        await result.current.createModel({ name: 'New' });
      });
      expect(onSettled).toHaveBeenCalledWith(expect.objectContaining({ success: true }), null);
    });

    it('reset() clears data and error', async () => {
      const { service } = createMockService();
      const { useCreateModel } = createModelHooks({ modelService: service });
      const { result } = renderHook(() => useCreateModel());
      await act(async () => {
        await result.current.createModel({ name: 'New' });
      });
      expect(result.current.data).not.toBeNull();
      act(() => {
        result.current.reset();
      });
      expect(result.current.data).toBeNull();
      expect(result.current.error).toBeNull();
    });

    it('advanced mode calls createAdvanced', async () => {
      const { service } = createMockService();
      const { useCreateModel } = createModelHooks({ modelService: service });
      const { result } = renderHook(() => useCreateModel({ advanced: true }));
      await act(async () => {
        await result.current.createModel({ name: 'New' });
      });
      expect(service.createAdvanced).toHaveBeenCalled();
    });
  });

  // ── useUpdateModel ──

  describe('useUpdateModel', () => {
    it('returns initial state', () => {
      const { service } = createMockService();
      const { useUpdateModel } = createModelHooks({ modelService: service });
      const { result } = renderHook(() => useUpdateModel());
      expect(result.current.data).toBeNull();
      expect(result.current.isPending).toBe(false);
    });

    it('update() populates data', async () => {
      const { service } = createMockService();
      const { useUpdateModel } = createModelHooks({ modelService: service });
      const { result } = renderHook(() => useUpdateModel());
      await act(async () => {
        await result.current.updateModel('1', { name: 'Updated' });
      });
      expect(result.current.data).toEqual({ _id: '1', name: 'Test', status: 'active' });
      expect(service.update).toHaveBeenCalled();
    });

    it('calls onSuccess callback', async () => {
      const { service } = createMockService();
      const onSuccess = vi.fn();
      const { useUpdateModel } = createModelHooks({ modelService: service });
      const { result } = renderHook(() => useUpdateModel({ onSuccess }));
      await act(async () => {
        await result.current.updateModel('1', { name: 'Updated' });
      });
      expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('calls onError on failure', async () => {
      const { service } = createMockService();
      const error = new ServiceError({
        success: false,
        message: 'fail',
        status: 500,
        raw: null,
        data: null,
        headers: {},
      });
      (service.update as ReturnType<typeof vi.fn>).mockReturnValue(createRejectingLazyMock(error));
      const onError = vi.fn();
      const { useUpdateModel } = createModelHooks({ modelService: service });
      const { result } = renderHook(() => useUpdateModel({ onError }));
      await act(async () => {
        try {
          await result.current.updateModel('1', { name: 'Updated' });
        } catch {
          /* expected */
        }
      });
      expect(onError).toHaveBeenCalledWith(error);
      expect(result.current.error).toBe(error);
    });

    it('reset() clears data and error', async () => {
      const { service } = createMockService();
      const { useUpdateModel } = createModelHooks({ modelService: service });
      const { result } = renderHook(() => useUpdateModel());
      await act(async () => {
        await result.current.updateModel('1', { name: 'Updated' });
      });
      act(() => {
        result.current.reset();
      });
      expect(result.current.data).toBeNull();
      expect(result.current.error).toBeNull();
    });

    it('advanced mode calls updateAdvanced', async () => {
      const { service } = createMockService();
      const { useUpdateModel } = createModelHooks({ modelService: service });
      const { result } = renderHook(() => useUpdateModel({ advanced: true }));
      await act(async () => {
        await result.current.updateModel('1', { name: 'Updated' });
      });
      expect(service.updateAdvanced).toHaveBeenCalled();
    });
  });

  // ── useUpsertModel ──

  describe('useUpsertModel', () => {
    it('returns initial state', () => {
      const { service } = createMockService();
      const { useUpsertModel } = createModelHooks({ modelService: service });
      const { result } = renderHook(() => useUpsertModel());
      expect(result.current.data).toBeNull();
      expect(result.current.isPending).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('upsert() populates data', async () => {
      const { service } = createMockService();
      const { useUpsertModel } = createModelHooks({ modelService: service });
      const { result } = renderHook(() => useUpsertModel());
      await act(async () => {
        await result.current.upsertModel({ name: 'Upserted' });
      });
      expect(result.current.data).toEqual({ _id: '1', name: 'Test', status: 'active' });
      expect(service.upsert).toHaveBeenCalled();
    });

    it('calls onSuccess callback', async () => {
      const { service } = createMockService();
      const onSuccess = vi.fn();
      const { useUpsertModel } = createModelHooks({ modelService: service });
      const { result } = renderHook(() => useUpsertModel({ onSuccess }));
      await act(async () => {
        await result.current.upsertModel({ name: 'Upserted' });
      });
      expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('calls onError on failure', async () => {
      const { service } = createMockService();
      const error = new ServiceError({
        success: false,
        message: 'fail',
        status: 500,
        raw: null,
        data: null,
        headers: {},
      });
      (service.upsert as ReturnType<typeof vi.fn>).mockReturnValue(createRejectingLazyMock(error));
      const onError = vi.fn();
      const { useUpsertModel } = createModelHooks({ modelService: service });
      const { result } = renderHook(() => useUpsertModel({ onError }));
      await act(async () => {
        try {
          await result.current.upsertModel({ name: 'Upserted' });
        } catch {
          /* expected */
        }
      });
      expect(onError).toHaveBeenCalledWith(error);
      expect(result.current.error).toBe(error);
    });

    it('reset() clears data and error', async () => {
      const { service } = createMockService();
      const { useUpsertModel } = createModelHooks({ modelService: service });
      const { result } = renderHook(() => useUpsertModel());
      await act(async () => {
        await result.current.upsertModel({ name: 'Upserted' });
      });
      expect(result.current.data).not.toBeNull();
      act(() => {
        result.current.reset();
      });
      expect(result.current.data).toBeNull();
      expect(result.current.error).toBeNull();
    });

    it('advanced mode calls upsertAdvanced', async () => {
      const { service } = createMockService();
      const { useUpsertModel } = createModelHooks({ modelService: service });
      const { result } = renderHook(() => useUpsertModel({ advanced: true }));
      await act(async () => {
        await result.current.upsertModel({ name: 'Upserted' });
      });
      expect(service.upsertAdvanced).toHaveBeenCalled();
    });
  });

  // ── useDeleteModel ──

  describe('useDeleteModel', () => {
    it('returns initial state', () => {
      const { service } = createMockService();
      const { useDeleteModel } = createModelHooks({ modelService: service });
      const { result } = renderHook(() => useDeleteModel());
      expect(result.current.isPending).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('deleteModel() calls service', async () => {
      const { service } = createMockService();
      const { useDeleteModel } = createModelHooks({ modelService: service });
      const { result } = renderHook(() => useDeleteModel());
      let deleteResult: Response<string> | undefined;
      await act(async () => {
        deleteResult = await result.current.deleteModel('1');
      });
      expect(deleteResult?.success).toBe(true);
      expect(service.delete).toHaveBeenCalledWith('1', undefined);
    });

    it('calls onSuccess callback', async () => {
      const { service } = createMockService();
      const onSuccess = vi.fn();
      const { useDeleteModel } = createModelHooks({ modelService: service });
      const { result } = renderHook(() => useDeleteModel({ onSuccess }));
      await act(async () => {
        await result.current.deleteModel('1');
      });
      expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('calls onError on failure', async () => {
      const { service } = createMockService();
      const error = new ServiceError({
        success: false,
        message: 'fail',
        status: 500,
        raw: null,
        data: null,
        headers: {},
      });
      (service.delete as ReturnType<typeof vi.fn>).mockReturnValue(createRejectingLazyMock(error));
      const onError = vi.fn();
      const { useDeleteModel } = createModelHooks({ modelService: service });
      const { result } = renderHook(() => useDeleteModel({ onError }));
      await act(async () => {
        try {
          await result.current.deleteModel('1');
        } catch {
          /* expected */
        }
      });
      expect(onError).toHaveBeenCalledWith(error);
      expect(result.current.error).toBe(error);
    });

    it('reset() clears error', async () => {
      const { service } = createMockService();
      const error = new ServiceError({
        success: false,
        message: 'fail',
        status: 500,
        raw: null,
        data: null,
        headers: {},
      });
      (service.delete as ReturnType<typeof vi.fn>).mockReturnValue(createRejectingLazyMock(error));
      const { useDeleteModel } = createModelHooks({ modelService: service });
      const { result } = renderHook(() => useDeleteModel());
      await act(async () => {
        try {
          await result.current.deleteModel('1');
        } catch {
          /* expected */
        }
      });
      expect(result.current.error).toBe(error);
      act(() => {
        result.current.reset();
      });
      expect(result.current.error).toBeNull();
    });
  });

  // ── useCountModel ──

  describe('useCountModel', () => {
    it('returns initial state', async () => {
      const { service } = createMockService();
      const { useCountModel } = createModelHooks({ modelService: service });
      const { result } = renderHook(() => useCountModel());
      expect(result.current.data).toBeNull();
      expect(result.current.error).toBeNull();
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('auto-fetches on mount', async () => {
      const { service } = createMockService();
      const { useCountModel } = createModelHooks({ modelService: service });
      renderHook(() => useCountModel());
      await waitFor(() => {
        expect(service.count).toHaveBeenCalled();
      });
    });

    it('does not fetch when enabled is false', () => {
      const { service } = createMockService();
      const { useCountModel } = createModelHooks({ modelService: service });
      renderHook(() => useCountModel({ enabled: false }));
      expect(service.count).not.toHaveBeenCalled();
    });

    it('advanced mode calls countAdvanced', async () => {
      const { service } = createMockService();
      const { useCountModel } = createModelHooks({ modelService: service });
      renderHook(() => useCountModel({ advanced: true }));
      await waitFor(() => {
        expect(service.countAdvanced).toHaveBeenCalled();
      });
    });

    it('calls onSuccess after fetch', async () => {
      const { service } = createMockService();
      const onSuccess = vi.fn();
      const { useCountModel } = createModelHooks({ modelService: service });
      renderHook(() => useCountModel({ onSuccess }));
      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ data: 5 }));
      });
    });

    it('calls onError on failure', async () => {
      const { service } = createMockService();
      const error = new ServiceError({
        success: false,
        message: 'fail',
        status: 500,
        raw: null,
        data: null,
        headers: {},
      });
      (service.count as ReturnType<typeof vi.fn>).mockReturnValue(createRejectingLazyMock(error));
      const onError = vi.fn();
      const { useCountModel } = createModelHooks({ modelService: service });
      renderHook(() => useCountModel({ onError }));
      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith(error);
      });
    });

    it('manual count() returns data', async () => {
      const { service } = createMockService();
      const { useCountModel } = createModelHooks({ modelService: service });
      const { result } = renderHook(() => useCountModel({ enabled: false }));
      let countResult: Response<number> | undefined;
      await act(async () => {
        countResult = await result.current.countModel();
      });
      expect(countResult?.data).toBe(5);
      expect(result.current.data).toBe(5);
    });
  });

  // ── useDistinctModel ──

  describe('useDistinctModel', () => {
    it('returns initial state', async () => {
      const { service } = createMockService();
      const { useDistinctModel } = createModelHooks({ modelService: service });
      const { result } = renderHook(() => useDistinctModel({ field: 'status' }));
      expect(result.current.data).toBeNull();
      expect(result.current.error).toBeNull();
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('auto-fetches on mount using basic distinct', async () => {
      const { service } = createMockService();
      const { useDistinctModel } = createModelHooks({ modelService: service });
      renderHook(() => useDistinctModel({ field: 'status' }));
      await waitFor(() => {
        expect(service.distinct).toHaveBeenCalledWith('status', expect.any(Object));
      });
    });

    it('uses distinctAdvanced when conditions are provided', async () => {
      const { service } = createMockService();
      const { useDistinctModel } = createModelHooks({ modelService: service });
      renderHook(() => useDistinctModel({ field: 'status', conditions: { org: '1' } }));
      await waitFor(() => {
        expect(service.distinctAdvanced).toHaveBeenCalledWith('status', { org: '1' }, expect.any(Object));
      });
    });

    it('does not fetch when enabled is false', () => {
      const { service } = createMockService();
      const { useDistinctModel } = createModelHooks({ modelService: service });
      renderHook(() => useDistinctModel({ field: 'status', enabled: false }));
      expect(service.distinct).not.toHaveBeenCalled();
    });

    it('calls onSuccess after fetch', async () => {
      const { service } = createMockService();
      const onSuccess = vi.fn();
      const { useDistinctModel } = createModelHooks({ modelService: service });
      renderHook(() => useDistinctModel({ field: 'status', onSuccess }));
      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ data: ['active', 'pending'] }));
      });
    });

    it('calls onError on failure', async () => {
      const { service } = createMockService();
      const error = new ServiceError({
        success: false,
        message: 'fail',
        status: 500,
        raw: null,
        data: null,
        headers: {},
      });
      (service.distinct as ReturnType<typeof vi.fn>).mockReturnValue(createRejectingLazyMock(error));
      const onError = vi.fn();
      const { useDistinctModel } = createModelHooks({ modelService: service });
      renderHook(() => useDistinctModel({ field: 'status', onError }));
      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith(error);
      });
    });

    it('manual distinctModel() returns data', async () => {
      const { service } = createMockService();
      const { useDistinctModel } = createModelHooks({ modelService: service });
      const { result } = renderHook(() => useDistinctModel({ field: 'status', enabled: false }));
      let distinctResult: Response<string[]> | undefined;
      await act(async () => {
        distinctResult = await result.current.distinctModel();
      });
      expect(distinctResult?.data).toEqual(['active', 'pending']);
      expect(result.current.data).toEqual(['active', 'pending']);
    });

    it('reset() clears data', async () => {
      const { service } = createMockService();
      const { useDistinctModel } = createModelHooks({ modelService: service });
      const { result } = renderHook(() => useDistinctModel({ field: 'status' }));
      await waitFor(() => {
        expect(result.current.data).toEqual(['active', 'pending']);
      });
      act(() => {
        result.current.reset();
      });
      expect(result.current.data).toBeNull();
    });
  });
});
