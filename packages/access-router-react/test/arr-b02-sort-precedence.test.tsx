import { describe, it, expect } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { createModelHooks } from '../src/create-model-hook';
import { requestKeyFor, sortKeyFor, RequestKeyError } from '../src/fetch';
import type { Document, ListModelResponse, Model, ModelResponse } from '@web-ts-toolkit/access-router-client';
import { createMockService, flushMicrotasks } from './support';

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
    raw: { _id: '1', name: 'Test', status: 'active' },
    data: { _id: '1', name: 'Test', status: 'active' } as Model<TestDoc> & TestDoc,
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

describe('ARR-B02: compound-sort precedence in request identity', () => {
  it('generic dictionaries stay unordered (filter equivalence must not change)', () => {
    expect(requestKeyFor({ a: 1, b: 2 })).toBe(requestKeyFor({ b: 2, a: 1 }));
  });

  it('reversing only compound-sort field order triggers a replacement automatic request', async () => {
    const mock = createMockService<TestDoc>(makeSeed());
    const { useList } = createModelHooks({ modelService: mock.service });

    const { rerender } = renderHook(
      ({ sort }: { sort: Record<string, 1> }) => useList({ advanced: true, filter: {}, sort: sort as never }),
      { initialProps: { sort: { status: 1, name: 1 } as Record<string, 1> } },
    );

    await waitFor(() => expect(mock.spies.listAdvanced).toHaveBeenCalledTimes(1));

    rerender({ sort: { name: 1, status: 1 } as Record<string, 1> });
    await waitFor(() => expect(mock.spies.listAdvanced).toHaveBeenCalledTimes(2));

    const [, args] = mock.spies.listAdvanced.mock.calls.at(-1) as [unknown, { sort: Record<string, 1> }];
    expect(Object.keys(args.sort)).toEqual(['name', 'status']);
  });

  it('query()/refetch() after a sort reorder forward the new precedence, not a retained closure', async () => {
    const mock = createMockService<TestDoc>(makeSeed());
    const { useList } = createModelHooks({ modelService: mock.service });

    const { rerender, result } = renderHook(
      ({ sort }: { sort: Record<string, 1> }) => useList({ advanced: true, filter: {}, sort: sort as never }),
      { initialProps: { sort: { status: 1, name: 1 } as Record<string, 1> } },
    );

    await waitFor(() => expect(mock.spies.listAdvanced).toHaveBeenCalledTimes(1));

    rerender({ sort: { name: 1, status: 1 } as Record<string, 1> });
    await waitFor(() => expect(mock.spies.listAdvanced).toHaveBeenCalledTimes(2));

    let queryResult: Promise<unknown> | undefined;
    act(() => {
      queryResult = result.current.query();
    });
    await queryResult;
    const [, queryArgs] = mock.spies.listAdvanced.mock.calls.at(-1) as [unknown, { sort: Record<string, 1> }];
    expect(Object.keys(queryArgs.sort)).toEqual(['name', 'status']);

    let refetchResult: Promise<unknown> | undefined;
    act(() => {
      refetchResult = result.current.refetch();
    });
    await refetchResult;
    const [, refetchArgs] = mock.spies.listAdvanced.mock.calls.at(-1) as [unknown, { sort: Record<string, 1> }];
    expect(Object.keys(refetchArgs.sort)).toEqual(['name', 'status']);
  });

  it('reordered filter alone does NOT refetch (ordinary dictionary equality stable)', async () => {
    const mock = createMockService<TestDoc>(makeSeed());
    const { useList } = createModelHooks({ modelService: mock.service });

    const { rerender } = renderHook(
      ({ filter }: { filter: Record<string, string> }) =>
        useList({ advanced: true, filter: filter as never, sort: { name: 1 } as never }),
      { initialProps: { filter: { a: '1', b: '2' } } },
    );

    await waitFor(() => expect(mock.spies.listAdvanced).toHaveBeenCalledTimes(1));
    rerender({ filter: { b: '2', a: '1' } });
    await flushMicrotasks();
    expect(mock.spies.listAdvanced).toHaveBeenCalledTimes(1);
  });

  it('tuple-array sort order is significant and string sorts stay supported', async () => {
    const mock = createMockService<TestDoc>(makeSeed());
    const { useList } = createModelHooks({ modelService: mock.service });

    const { rerender } = renderHook(
      ({ sort }: { sort: unknown }) => useList({ advanced: true, filter: {}, sort: sort as never }),
      {
        initialProps: {
          sort: [
            ['status', 1],
            ['name', 1],
          ] as unknown,
        },
      },
    );
    await waitFor(() => expect(mock.spies.listAdvanced).toHaveBeenCalledTimes(1));
    rerender({
      sort: [
        ['name', 1],
        ['status', 1],
      ] as unknown,
    });
    await waitFor(() => expect(mock.spies.listAdvanced).toHaveBeenCalledTimes(2));

    const mock2 = createMockService<TestDoc>(makeSeed());
    const hooks2 = createModelHooks({ modelService: mock2.service });
    const { rerender: rerender2 } = renderHook(
      ({ sort }: { sort: string }) => hooks2.useList({ advanced: true, filter: {}, sort: sort as never }),
      {
        initialProps: { sort: 'name' },
      },
    );
    await waitFor(() => expect(mock2.spies.listAdvanced).toHaveBeenCalledTimes(1));
    rerender2({ sort: 'name' });
    await flushMicrotasks();
    expect(mock2.spies.listAdvanced).toHaveBeenCalledTimes(1);
  });

  it('useRead with advanced sort reorders trigger a replacement request with new precedence', async () => {
    const mock = createMockService<TestDoc>(makeSeed());
    const { useRead } = createModelHooks({ modelService: mock.service });

    const { rerender } = renderHook(
      ({ sort }: { sort: Record<string, 1> }) => useRead({ id: '1', advanced: true, sort: sort as never }),
      { initialProps: { sort: { status: 1, name: 1 } as Record<string, 1> } },
    );
    await waitFor(() => expect(mock.spies.readAdvanced).toHaveBeenCalledTimes(1));
    rerender({ sort: { name: 1, status: 1 } as Record<string, 1> });
    await waitFor(() => expect(mock.spies.readAdvanced).toHaveBeenCalledTimes(2));
    const [, args] = mock.spies.readAdvanced.mock.calls.at(-1) as [string, { sort: Record<string, 1> }];
    expect(Object.keys(args.sort)).toEqual(['name', 'status']);
  });
});

describe('ARR-B02: sortKeyFor unit behavior', () => {
  it('compound-sort objects are order-sensitive while requestKeyFor stays unordered', () => {
    expect(requestKeyFor({ status: 1, name: 1 })).toBe(requestKeyFor({ name: 1, status: 1 }));
    expect(sortKeyFor({ status: 1, name: 1 })).not.toBe(sortKeyFor({ name: 1, status: 1 }));
    expect(sortKeyFor({ status: 1, name: 1 })).toBe(sortKeyFor({ status: 1, name: 1 }));
  });

  it('string and tuple-array sorts keep their requestKeyFor behavior', () => {
    expect(sortKeyFor('name')).toBe(requestKeyFor('name'));
    expect(
      sortKeyFor([
        ['status', 1],
        ['name', 1],
      ]),
    ).toBe(
      requestKeyFor([
        ['status', 1],
        ['name', 1],
      ]),
    );
    expect(
      sortKeyFor([
        ['status', 1],
        ['name', 1],
      ]),
    ).not.toBe(
      sortKeyFor([
        ['name', 1],
        ['status', 1],
      ]),
    );
    expect(sortKeyFor(null)).toBe(requestKeyFor(null));
    expect(sortKeyFor(undefined)).toBe(requestKeyFor(undefined));
  });

  it('accessor property in a sort object throws WITHOUT executing the getter', () => {
    let calls = 0;
    const obj: object = {};
    Object.defineProperty(obj, 'name', {
      enumerable: true,
      get() {
        calls++;
        return 1;
      },
    });
    expect(() => sortKeyFor(obj)).toThrow(RequestKeyError);
    expect(calls).toBe(0);
  });
});
