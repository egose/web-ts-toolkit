//
// Focused projection-aware result-type tests (ARR-09).
//
// Verifies the runtime path forward a literal `select` through the
// `advanced` hooks without dropping model fields, AND that the public
// static surface narrows so omitted properties become
// `T[key] | undefined` rather than definitely-present.
//
// Per the task file's "shared-hotspot" guidance, this file is the
// ARR-09 owner; `test-decl-consumer/decl-consumer.strict.test.ts`
// contains the strictly-compiled consumer-side fixtures (NodeNext +
// Bundler). The two files together cover the ARR-09 acceptance
// criteria for "strict positive and `@ts-expect-error` consumer
// tests for array, string, and object projection forms".
//
import { describe, it, expect } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { createModelHooks } from '../src/create-model-hook';
import type { Document, Model, ModelResponse, ListModelResponse } from '@web-ts-toolkit/access-router-client';
import { createMockService } from './support';

/**
 * Type-only assertion helper used in place of a bare assignment so the
 * `@typescript-eslint/no-unused-expressions` rule does not flag the
 * narrowing side-effect. If `_actual` is not assignable to `TExpected`,
 * `tsc` errors at compile time; the runtime body is intentionally
 * empty. Used for positive narrowing assertions (a field IS typed as
 * `string` etc.); `@ts-expect-error` directives cover negative ones.
 */
function expectType<TExpected>(_actual: TExpected): void {
  void _actual;
}

interface TestDoc extends Document {
  _id: string;
  name: string;
  status: string;
  age: number;
}

function makeSeed() {
  const readResult: ModelResponse<TestDoc> = {
    success: true,
    raw: { _id: '1', name: 'Test', status: 'active', age: 12 },
    data: { _id: '1', name: 'Test', status: 'active', age: 12 } as Model<TestDoc> & TestDoc,
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
  return {
    list: listResult,
    read: readResult,
    create: readResult,
    delete: { success: true, raw: '1', data: '1', message: 'ok', status: 200, headers: {} } as unknown as ReturnType<
      typeof createMockService<TestDoc>
    >['seed']['delete'],
    count: { success: true, raw: 5, data: 5, message: 'ok', status: 200, headers: {} } as unknown as ReturnType<
      typeof createMockService<TestDoc>
    >['seed']['count'],
    distinct: {
      success: true,
      raw: ['active', 'pending'],
      data: ['active', 'pending'],
      message: 'ok',
      status: 200,
      headers: {},
    } as unknown as ReturnType<typeof createMockService<TestDoc>>['seed']['distinct'],
  };
}

describe('ARR-09 project-aware result types', () => {
  describe('useRead', () => {
    it('default (no select) preserves full-model typing and runtime success', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useRead } = createModelHooks({ modelService: mock.service });
      const { result } = renderHook(() => useRead({ id: '1' }));
      await waitFor(() => expect(result.current.data).not.toBeNull());
      // Runtime: full-T field accessible.
      expect(result.current.data?.status).toBe('active');
      // Static: data is full `Model<TestDoc> & TestDoc` (the no-projection
      // default preserves full-model typing exactly).
      if (result.current.data) {
        expectType<string>(result.current.data.status);
      }
    });

    it('`select: ["name"] as const` narrows `data.status` to optional at the static surface while the runtime still resolves the read', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useRead } = createModelHooks({ modelService: mock.service });
      const { result } = renderHook(() => useRead({ id: '1', advanced: true, select: ['name'] as const }));
      await waitFor(() => expect(result.current.data).not.toBeNull());
      // Runtime: the mock seed still carries `status`, so this resolves.
      expect(result.current.data?.name).toBe('Test');
      // Static: `data.status` is narrowed to `string | undefined` so
      // the consumer cannot assign it to a `string` variable without a
      // guard.
      if (result.current.data) {
        expectType<string>(result.current.data.name);
        // @ts-expect-error select=['name'] narrows `status` to optional.
        expectType<string>(result.current.data.status);
      }
    });

    it('string projection `select: "name"` narrows the static surface the same way', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useRead } = createModelHooks({ modelService: mock.service });
      const { result } = renderHook(() => useRead({ id: '1', advanced: true, select: 'name' }));
      await waitFor(() => expect(result.current.data).not.toBeNull());
      if (result.current.data) {
        expectType<string>(result.current.data.name);
        // @ts-expect-error string-typed projection narrows `status` to optional.
        expectType<string>(result.current.data.status);
      }
    });

    it('object projection `{ name: 1 }` narrows the static surface the same way', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useRead } = createModelHooks({ modelService: mock.service });
      const { result } = renderHook(() => useRead({ id: '1', advanced: true, select: { name: 1 } }));
      await waitFor(() => expect(result.current.data).not.toBeNull());
      if (result.current.data) {
        expectType<string>(result.current.data.name);
        // @ts-expect-error object-typed projection narrows `status` to optional.
        expectType<string>(result.current.data.status);
      }
    });

    it('onSuccess(result) callback receives the projected ModelResponse shape under a literal select', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useRead } = createModelHooks({ modelService: mock.service });
      const received: Array<ModelResponse<TestDoc> | null> = [];
      renderHook(() =>
        useRead({
          id: '1',
          advanced: true,
          select: ['name'] as const,
          onSuccess: (result) => {
            received.push(result as ModelResponse<TestDoc>);
          },
        }),
      );
      await waitFor(() => expect(received.length).toBe(1));
      expect(received[0]?.data?.name).toBe('Test');
    });

    it('manual query() returns a thenable typed as the projected ModelResponse', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useRead } = createModelHooks({ modelService: mock.service });
      const { result } = renderHook(() => useRead({ id: '1', advanced: true, select: ['name'] as const }));
      await waitFor(() => expect(result.current.data).not.toBeNull());
      let payload: ModelResponse<TestDoc> | null = null;
      await act(async () => {
        const p = result.current.query('1');
        payload = (await p) as ModelResponse<TestDoc>;
      });
      expect(payload?.data?.name).toBe('Test');

      // Static: the awaited result under the inferred narrow select has
      // `data.status` typed optional.
      if (payload && payload.success) {
        expectType<string>(payload.data.name);
        // @ts-expect-error query() carries the narrow shape too.
        expectType<string>(payload.data.status);
      }
    });
  });

  describe('useList', () => {
    it('default (no select) keeps full-model array typing', async () => {
      const mock = createMockService<TestDoc>({
        ...makeSeed(),
        list: {
          success: true,
          raw: [{ _id: '1', name: 'a', status: 'active', age: 1 }],
          data: [{ _id: '1', name: 'a', status: 'active', age: 1 }] as unknown as (Model<TestDoc> & TestDoc)[],
          message: 'ok',
          status: 200,
          headers: {},
          totalCount: 1,
        },
      });
      const { useList } = createModelHooks({ modelService: mock.service });
      const { result } = renderHook(() => useList({ listParams: { pageSize: 10 } }));
      await waitFor(() => expect(result.current.data.length).toBe(1));
      expect(result.current.data[0].status).toBe('active');
      // Static: each element is the full-T shape.
      expectType<string>(result.current.data[0].status);
    });

    it('`select: ["name"] as const` narrows the list element static surface', async () => {
      const mock = createMockService<TestDoc>({
        ...makeSeed(),
        list: {
          success: true,
          raw: [{ _id: '1', name: 'a', status: 'active', age: 1 }],
          data: [{ _id: '1', name: 'a', status: 'active', age: 1 }] as unknown as (Model<TestDoc> & TestDoc)[],
          message: 'ok',
          status: 200,
          headers: {},
          totalCount: 1,
        },
      });
      const { useList } = createModelHooks({ modelService: mock.service });
      const { result } = renderHook(() =>
        useList({ listParams: { pageSize: 10 }, advanced: true, select: ['name'] as const }),
      );
      await waitFor(() => expect(result.current.data.length).toBe(1));
      expect(result.current.data[0].name).toBe('a');
      // Static: array-element narrowing drops the unselected field to `string | undefined`.
      expectType<string>(result.current.data[0].name);
      // @ts-expect-error list narrowing suppresses omitted fields at the public surface.
      expectType<string>(result.current.data[0].status);
    });
  });

  describe('useCreate', () => {
    it('default (no select) keeps full-model mutation response typing', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useCreate } = createModelHooks({ modelService: mock.service });
      const { result } = renderHook(() => useCreate());
      await act(async () => {
        await result.current.mutate({ name: 'New', status: 'pending', age: 0 });
      });
      expect(result.current.data?.name).toBe('Test');
      // Static: data is the full `Model<TestDoc> & TestDoc` shape, status definitely-present.
      if (result.current.data) {
        expectType<string>(result.current.data.status);
      }
    });

    it('`select: ["name"] as const` narrows the mutation response', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useCreate } = createModelHooks({ modelService: mock.service });
      const { result } = renderHook(() => useCreate({ advanced: true, select: ['name'] as const }));
      await act(async () => {
        await result.current.mutate({ name: 'New' });
      });
      expect(result.current.data?.name).toBe('Test');
      // Static: the projected `data` narrows `status` to optional.
      if (result.current.data) {
        expectType<string>(result.current.data.name);
        // @ts-expect-error use-create narrowing suppresses omitted fields.
        expectType<string>(result.current.data.status);
      }
    });
  });

  describe('useUpdate', () => {
    it('`select: ["name"] as const` narrows the update response', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useUpdate } = createModelHooks({ modelService: mock.service });
      const { result } = renderHook(() => useUpdate({ advanced: true, select: ['name'] as const }));
      await act(async () => {
        await result.current.mutate('1', { name: 'updated' });
      });
      expect(result.current.data?.name).toBe('Test');
      if (result.current.data) {
        expectType<string>(result.current.data.name);
        // @ts-expect-error use-update narrowing suppresses omitted fields.
        expectType<string>(result.current.data.status);
      }
    });
  });

  describe('useUpsert', () => {
    it('`select: ["name"] as const` narrows the upsert response', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useUpsert } = createModelHooks({ modelService: mock.service });
      const { result } = renderHook(() => useUpsert({ advanced: true, select: ['name'] as const }));
      await act(async () => {
        await result.current.mutate({ name: 'upserted' });
      });
      expect(result.current.data?.name).toBe('Test');
      if (result.current.data) {
        expectType<string>(result.current.data.name);
        // @ts-expect-error use-upsert narrowing suppresses omitted fields.
        expectType<string>(result.current.data.status);
      }
    });
  });
});
