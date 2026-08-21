//
// Focused regression tests for the dependency-key policy (Task ARR-06).
//
// Before ARR-06 the four query hooks (`useRead`, `useList`, `useCount`,
// `useDistinct`) built their `useEffect` dependency arrays from a mix
// of structural keys (`stableStringify(listParams)` etc.) and raw
// reference identities (`select`, `populate`, `include`, `tasks`,
// `basicOptions`, `advancedOptions`). The historical bug classes were:
//
//   - Inline array/object literals — e.g. `select: ['name', 'status']`
//     written at the call site — are recreated each render. Before
//     ARR-06 they contributed a new identity to the deps array every
//     render, so the auto-fetch effect re-ran continuously and the hook
//     looped network requests after every state update. The legacy
//     `stableStringify` did not cover these inputs.
//   - `requestConfig` (which carries authorization/tenant headers)
//     was OMITTED from `deps`, so flipping an auth/tenant header alone
//     did NOT trigger a new request — the hook kept using stale
//     credentials until some other dep changed.
//   - `stableStringify` collided a `Date` with its own ISO string
//     (both went through `Date.prototype.toJSON` and produced the same
//     `"<date>"` string). A filter like `{ createdAt: { $gte: new
//     Date('2026-01-01') } }` therefore compared the Date as if it
//     were a string. Worse, `stableStringify` threw `TypeError` on
//     BigInt and recursively infinite values (cycle), and silently
//     dropped functions and symbols — so a filter containing a BigInt
//     or a cycle crashed the consumer's render, and a getter that
//     happened to be enumerable would fire during dep-key construction.
//
// ARR-06 replaces all of those with one canonical `requestKeyFor`
// (see `src/fetch.ts`):
//
//   - composite structural key for every request-affecting input,
//     including `requestConfig`;
//   - `Date` compared by instant (distinct from a same-looking
//     ISO string);
//   - explicit `RequestKeyError` for cycles, BigInt, functions,
//     symbols, accessor properties, and unsupported built-in instances;
//   - the hook surface catches `RequestKeyError` and re-throws as an
//     `Error` so the consumer's error boundary has a documented
//     reason rather than a crash in the serializer.
//
// ARR-06 req 5: callback identity no longer triggers a network
// request. `useEventCallback` keeps the latest `onSuccess` /
// `onError` / `onSettled` invoker stable across renders while always
// invoking the latest underlying callback. The deps array never
// references the caller's raw callback identity, so a parent that
// passes a fresh arrow every render does not retrigger the request.
//
// Each test below exercises one ARR-06 acceptance criterion.

import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { createModelHooks } from '../src/create-model-hook';
import { requestKeyFor, RequestKeyError } from '../src/fetch';
import type {
  Document,
  FilterQuery,
  ListModelResponse,
  Model,
  ModelResponse,
} from '@web-ts-toolkit/access-router-client';
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

// ── requestKeyFor unit behavior ──

describe('ARR-06: requestKeyFor canonical behavior', () => {
  it('structural equivalence: inline array literals compare equal', () => {
    expect(requestKeyFor(['name', 'status'])).toBe(requestKeyFor(['name', 'status']));
  });

  it('structural equivalence: inline object literals compare equal regardless of key order', () => {
    expect(requestKeyFor({ a: 1, b: 2 })).toBe(requestKeyFor({ b: 2, a: 1 }));
  });

  it('structural difference: an added element produces a different key', () => {
    expect(requestKeyFor(['name'])).not.toBe(requestKeyFor(['name', 'status']));
  });

  it('structural difference: a changed primitive produces a different key', () => {
    expect(requestKeyFor({ status: 'active' })).not.toBe(requestKeyFor({ status: 'inactive' }));
  });

  it('Date compares by instant and does NOT collide with an ISO-string filter', () => {
    const d = new Date('2026-01-01T00:00:00.000Z');
    const iso = '2026-01-01T00:00:00.000Z';
    // Same instant — equal keys.
    expect(requestKeyFor(new Date(d.getTime()))).toBe(requestKeyFor(d));
    // Date vs string with the same ISO text — distinct prefix makes
    // them unequal. Pre-ARR-06 both produced `"<date>"` via
    // `Date.prototype.toJSON` and colliding keys silently.
    expect(requestKeyFor(d)).not.toBe(requestKeyFor(iso));
  });

  it('null and undefined produce distinct keys', () => {
    expect(requestKeyFor(null)).not.toBe(requestKeyFor(undefined));
    expect(requestKeyFor(null)).not.toBe('');
    expect(requestKeyFor(undefined)).not.toBe('');
  });

  it('+0 and -0 produce distinct keys (Object.is(0, -0) is false)', () => {
    expect(requestKeyFor(0)).not.toBe(requestKeyFor(-0));
  });

  it('NaN compares equal to itself (d:+0 NaN sentinel)', () => {
    expect(requestKeyFor(NaN)).toBe(requestKeyFor(NaN));
    expect(requestKeyFor(NaN)).not.toBe(requestKeyFor(0));
  });

  it('nested structural equivalence is symmetric', () => {
    expect(requestKeyFor({ filter: { status: 'active', age: { $gte: 18 } }, sort: ['name'] })).toBe(
      requestKeyFor({ sort: ['name'], filter: { age: { $gte: 18 }, status: 'active' } }),
    );
  });

  it('cycles throw RequestKeyError', () => {
    const a: { self?: unknown } = {};
    a.self = a;
    expect(() => requestKeyFor(a)).toThrow(RequestKeyError);
  });

  it('indirect cycles throw RequestKeyError', () => {
    const a: { b?: unknown } = {};
    const b: { a?: unknown } = {};
    a.b = b;
    b.a = a;
    expect(() => requestKeyFor(a)).toThrow(RequestKeyError);
  });

  it('BigInt throws RequestKeyError', () => {
    expect(() => requestKeyFor(BigInt(1))).toThrow(RequestKeyError);
  });

  it('BigInt nested in a filter throws RequestKeyError', () => {
    expect(() => requestKeyFor({ count: BigInt(1) })).toThrow(RequestKeyError);
  });

  it('function throws RequestKeyError', () => {
    expect(() => requestKeyFor(() => undefined)).toThrow(RequestKeyError);
  });

  it('symbol throws RequestKeyError', () => {
    expect(() => requestKeyFor(Symbol('x'))).toThrow(RequestKeyError);
  });

  it('symbol-valued object property throws RequestKeyError', () => {
    const sym = Symbol('x');
    expect(() => requestKeyFor({ [sym]: 1 })).toThrow(RequestKeyError);
  });

  it('accessor property throws RequestKeyError WITHOUT executing the getter', () => {
    let calls = 0;
    const obj: object = {};
    Object.defineProperty(obj, 'count', {
      enumerable: true,
      get() {
        calls++;
        return 1;
      },
    });
    expect(() => requestKeyFor(obj)).toThrow(RequestKeyError);
    expect(calls).toBe(0);
  });

  it('RegExp instance throws RequestKeyError', () => {
    expect(() => requestKeyFor(/foo/)).toThrow(RequestKeyError);
  });

  it('Map instance throws RequestKeyError', () => {
    expect(() => requestKeyFor(new Map())).toThrow(RequestKeyError);
  });

  it('Array cycles throw RequestKeyError', () => {
    const arr: unknown[] = [];
    arr.push(arr);
    expect(() => requestKeyFor(arr)).toThrow(RequestKeyError);
  });

  it('Error throws RequestKeyError', () => {
    expect(() => requestKeyFor(new Error('x'))).toThrow(RequestKeyError);
  });

  it('Array of dates keys by instant', () => {
    const d1 = new Date('2026-01-01T00:00:00.000Z');
    const d2 = new Date('2026-02-01T00:00:00.000Z');
    expect(requestKeyFor([d1, d2])).toBe(requestKeyFor([new Date(d1.getTime()), new Date(d2.getTime())]));
    expect(requestKeyFor([d1, d2])).not.toBe(requestKeyFor([d2, d1]));
  });

  it('plain object null-prototype is supported (Object.create(null))', () => {
    const o = Object.create(null);
    o.x = 1;
    o.y = 2;
    const o2 = Object.create(null);
    o2.y = 2;
    o2.x = 1;
    expect(requestKeyFor(o)).toBe(requestKeyFor(o2));
  });
});

// ── Hook-level ARR-06 regression suite ──

describe('ARR-06: hook dependency-key policy', () => {
  describe('useRead: inline structural inputs do NOT refetch on identity change', () => {
    it('useRead with inline `select: ["name"]` issues ONE request across rerenders with structurally equivalent inline arrays', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useRead } = createModelHooks({ modelService: mock.service });

      const { rerender } = renderHook(
        ({ _tick }: { _tick: number }) => useRead({ id: '1', advanced: true, select: ['name'] }),
        {
          initialProps: { _tick: 0 },
        },
      );

      await waitFor(() => expect(mock.spies.readAdvanced).toHaveBeenCalledTimes(1));

      // Five rerenders with a NEW inline array (identity changes each
      // render) but the SAME structural content. Before ARR-06 every
      // render contributed a fresh `select` identity, so the effect
      // re-ran and `service.readAdvanced` was called again every tick.
      for (let i = 1; i <= 5; i++) {
        rerender({ _tick: i });
      }
      await flushMicrotasks();

      // Still exactly one call: the structural key stayed equal across
      // all rerenders, so the effect never re-ran.
      expect(mock.spies.readAdvanced).toHaveBeenCalledTimes(1);
    });

    it('useRead refetches exactly ONCE when `select` grows structurally', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useRead } = createModelHooks({ modelService: mock.service });

      const { rerender } = renderHook(
        ({ select }: { select: string[] }) => useRead({ id: '1', advanced: true, select }),
        { initialProps: { select: ['name'] } },
      );

      await waitFor(() => expect(mock.spies.readAdvanced).toHaveBeenCalledTimes(1));

      // Same identity-for-the-same-content is irrelevant — we change
      // the content structurally here so the request must be reloaded.
      rerender({ select: ['name', 'status'] });
      await waitFor(() => expect(mock.spies.readAdvanced).toHaveBeenCalledTimes(2));

      // No further requests triggered.
      await flushMicrotasks();
      expect(mock.spies.readAdvanced).toHaveBeenCalledTimes(2);
    });

    it('useRead refetches exactly ONCE when `requestConfig.headers` changes (previously OMITTED from deps)', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useRead } = createModelHooks({ modelService: mock.service });

      const { rerender } = renderHook(
        ({ headers }: { headers: Record<string, string> }) => useRead({ id: '1', requestConfig: { headers } }),
        { initialProps: { headers: { Authorization: 'Bearer A' } } },
      );

      await waitFor(() => expect(mock.spies.read).toHaveBeenCalledTimes(1));

      // Same identity (we re-supply with a new equivalent inline
      // object) — no refetch.
      rerender({ headers: { Authorization: 'Bearer A' } });
      await flushMicrotasks();
      expect(mock.spies.read).toHaveBeenCalledTimes(1);

      // Change the auth header to a different token. Pre-ARR-06 the
      // deps array omitted `requestConfig`, so the stale auth header
      // was retained. Post-ARR-06 a structural change to headers forces
      // exactly one new request.
      rerender({ headers: { Authorization: 'Bearer B' } });
      await waitFor(() => expect(mock.spies.read).toHaveBeenCalledTimes(2));
      expect(mock.spies.read).toHaveBeenCalledTimes(2);

      const [, , lastConfigArg] = mock.spies.read.mock.calls.at(-1) as [
        string,
        unknown,
        { headers: Record<string, string> },
      ];
      expect(lastConfigArg.headers).toEqual({ Authorization: 'Bearer B' });
    });

    it('useRead with inline `populate` does NOT refetch when the populate object is recreated each render', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useRead } = createModelHooks({ modelService: mock.service });

      const { rerender } = renderHook(
        ({ _tick }: { _tick: number }) =>
          useRead({
            id: '1',
            advanced: true,
            populate: [{ path: 'owner', select: ['name'] as const }],
          }),
        { initialProps: { _tick: 0 } },
      );

      await waitFor(() => expect(mock.spies.readAdvanced).toHaveBeenCalledTimes(1));

      // Five rerenders with NEW inline `populate` arrays per render.
      // Pre-ARR-06 every rerender retriggered the request.
      for (let i = 1; i <= 5; i++) {
        rerender({ _tick: i });
      }
      await flushMicrotasks();
      expect(mock.spies.readAdvanced).toHaveBeenCalledTimes(1);
    });

    it('useRead does NOT refetch on identity-only changes to `onSuccess` callback (ARR-06 req 5)', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useRead } = createModelHooks({ modelService: mock.service });

      const onSuccessA = vi.fn();
      const onSuccessB = vi.fn();

      const { rerender } = renderHook(({ cb }: { cb: typeof onSuccessA }) => useRead({ id: '1', onSuccess: cb }), {
        initialProps: { cb: onSuccessA },
      });

      await waitFor(() => expect(onSuccessA).toHaveBeenCalledTimes(1));

      // New callback identity: pre-ARR-06 (had it included the
      // callback identity in deps) would refetch. ARR-06 wraps
      // callbacks in a stable invoker so identity churn does NOT
      // re-trigger the network request.
      for (let i = 1; i <= 5; i++) {
        rerender({ cb: i % 2 === 0 ? onSuccessA : onSuccessB });
      }
      await flushMicrotasks();

      // Total network requests should remain at one — the request key
      // (id, advanced, requestKey) never changed.
      expect(mock.spies.read).toHaveBeenCalledTimes(1);
      // The callback invoker fires the LATEST underlying callback at
      // settlement time. The test's first settlement already fired
      // `onSuccessA` once; no further settlements happened because no
      // refetch was triggered. So only A is called, exactly once.
      expect(onSuccessA).toHaveBeenCalledTimes(1);
      expect(onSuccessB).toHaveBeenCalledTimes(0);
    });

    it('useRead uses the LATEST `onSuccess` callback when a structural refetch DOES occur (ARR-06 req 5: current-not-stale)', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useRead } = createModelHooks({ modelService: mock.service });

      const onSuccessA = vi.fn();
      const onSuccessB = vi.fn();

      const { rerender } = renderHook(
        ({ id, cb }: { id: string; cb: typeof onSuccessA }) => useRead({ id, onSuccess: cb }),
        { initialProps: { id: '1', cb: onSuccessA } },
      );

      await waitFor(() => expect(onSuccessA).toHaveBeenCalledTimes(1));

      // Change `id` (structural change). The refetch fires successfully,
      // and the most recent callback must be invoked at settlement —
      // even though `onSuccessB` was set AFTER the effect re-ran.
      rerender({ id: '2', cb: onSuccessB });
      await waitFor(() => expect(onSuccessB).toHaveBeenCalledTimes(1));
      expect(mock.spies.read).toHaveBeenCalledTimes(2);
      expect(onSuccessA).toHaveBeenCalledTimes(1);
    });

    it('useRead throws a documented Error (not a bare RequestKeyError) when a filter value cycles (preventing render hang)', () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useRead } = createModelHooks({ modelService: mock.service });

      const cycleOwner: { self?: unknown } = {};
      cycleOwner.self = cycleOwner;
      // The hook's request-config payload does not currently accept
      // `select` cycles via the typed surface, but `select`-as-array
      // is the documented invariant the policy protects. Here we
      // smuggle the cycle via `requestConfig` (which is `{ [key:
      // string]: unknown }`) so the throw path is exercised through
      // the public hook API.
      const requestConfig = { cycle: cycleOwner } as { cycle: unknown } as unknown as {
        headers?: Record<string, string>;
        signal?: AbortSignal;
      };

      // The hook catches the `RequestKeyError` thrown by
      // `requestKeyFor` and re-throws as a plain `Error` carrying the
      // `useRead:` prefix and the original `RequestKeyError` message
      // text. The plain-`Error` wrapping keeps the public hook surface
      // stable: a downstream consumer's error boundary sees an `Error`,
      // and the original `RequestKeyError` message text is preserved
      // for diagnostics. The bare `RequestKeyError` is reachable via
      // `requestKeyFor` directly (see the `requestKeyFor canonical
      // behavior` suite above); the hook tests assert the wrapping
      // instead.
      expect(() => renderHook(() => useRead({ id: '1', requestConfig }))).toThrow(/useRead:.*cycle detected/);
      // The thrown object is a plain `Error`, NOT a `RequestKeyError`,
      // confirming the wrapping contract.
      let caught: unknown;
      try {
        renderHook(() => useRead({ id: '1', requestConfig }));
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(Error);
      expect(caught).not.toBeInstanceOf(RequestKeyError);
    });

    it('useRead structural key for `sort` (advanced read) survives identity churn when `sort` is null across rerenders', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useRead } = createModelHooks({ modelService: mock.service });

      const { rerender } = renderHook(
        ({ _tick }: { _tick: number }) => useRead({ id: '1', advanced: true, sort: undefined, select: ['_id'] }),
        { initialProps: { _tick: 0 } },
      );
      await waitFor(() => expect(mock.spies.readAdvanced).toHaveBeenCalledTimes(1));
      for (let i = 1; i <= 5; i++) {
        rerender({ _tick: i });
      }
      await flushMicrotasks();
      expect(mock.spies.readAdvanced).toHaveBeenCalledTimes(1);
    });
  });

  describe('useList: inline structural inputs do NOT refetch on identity change', () => {
    it('useList with inline `filter` and `select` does NOT refetch each render', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useList } = createModelHooks({ modelService: mock.service });

      const { rerender } = renderHook(
        ({ _tick }: { _tick: number }) =>
          useList({
            advanced: true,
            filter: { status: 'active' },
            sort: { name: 1 },
            select: ['name'],
          }),
        { initialProps: { _tick: 0 } },
      );

      await waitFor(() => expect(mock.spies.listAdvanced).toHaveBeenCalledTimes(1));

      for (let i = 1; i <= 5; i++) {
        rerender({ _tick: i });
      }
      await flushMicrotasks();
      expect(mock.spies.listAdvanced).toHaveBeenCalledTimes(1);
    });

    it('useList refetches exactly ONCE when `filter` changes structurally', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useList } = createModelHooks({ modelService: mock.service });

      const { rerender } = renderHook(
        ({ status }: { status: string }) => useList({ advanced: true, filter: { status } as { status: string } }),
        { initialProps: { status: 'active' } },
      );

      await waitFor(() => expect(mock.spies.listAdvanced).toHaveBeenCalledTimes(1));

      rerender({ status: 'inactive' });
      await waitFor(() => expect(mock.spies.listAdvanced).toHaveBeenCalledTimes(2));

      await flushMicrotasks();
      expect(mock.spies.listAdvanced).toHaveBeenCalledTimes(2);

      const [filterArg] = mock.spies.listAdvanced.mock.calls.at(-1) as [{ status: string }, unknown, unknown, unknown];
      expect(filterArg).toMatchObject({ status: 'inactive' });
    });

    it('useList uses the LATEST `onSuccess` after a structural refetch', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useList } = createModelHooks({ modelService: mock.service });

      const onSuccessA = vi.fn();
      const onSuccessB = vi.fn();

      const { rerender } = renderHook(
        ({ listParams, cb }: { listParams: { pageSize: number } | undefined; cb: typeof onSuccessA }) =>
          useList({ listParams, onSuccess: cb }),
        { initialProps: { listParams: { pageSize: 10 }, cb: onSuccessA } },
      );

      await waitFor(() => expect(onSuccessA).toHaveBeenCalledTimes(1));

      rerender({ listParams: { pageSize: 20 }, cb: onSuccessB });
      await waitFor(() => expect(onSuccessB).toHaveBeenCalledTimes(1));
      expect(onSuccessA).toHaveBeenCalledTimes(1);
    });

    it('useList refetches once when `requestConfig.headers` changes (previously OMITTED from deps)', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useList } = createModelHooks({ modelService: mock.service });

      const { rerender } = renderHook(
        ({ headers }: { headers: Record<string, string> }) =>
          useList({ listParams: { pageSize: 10 }, requestConfig: { headers } }),
        { initialProps: { headers: { Authorization: 'Bearer A' } } },
      );

      await waitFor(() => expect(mock.spies.list).toHaveBeenCalledTimes(1));
      rerender({ headers: { Authorization: 'Bearer B' } });
      await waitFor(() => expect(mock.spies.list).toHaveBeenCalledTimes(2));
      expect(mock.spies.list).toHaveBeenCalledTimes(2);

      const [, , lastConfigArg] = mock.spies.list.mock.calls.at(-1) as [
        unknown,
        unknown,
        { headers: Record<string, string> },
      ];
      expect(lastConfigArg.headers).toEqual({ Authorization: 'Bearer B' });
    });

    it('useList Date-valued filter triggers exactly one refetch when the instant changes', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useList } = createModelHooks({ modelService: mock.service });

      const d1 = new Date('2026-01-01T00:00:00.000Z');
      const d2 = new Date('2026-02-01T00:00:00.000Z');

      const { rerender } = renderHook(
        ({ since }: { since: Date }) =>
          useList({ advanced: true, filter: { since } as unknown as FilterQuery<TestDoc> }),
        { initialProps: { since: d1 } },
      );

      await waitFor(() => expect(mock.spies.listAdvanced).toHaveBeenCalledTimes(1));

      // Same instant, NEW Date instance: structural key unchanged, no
      // refetch. Pre-ARR-06 `stableStringify` already produced unequal
      // keys for two `Date` instances of the same instant? No — pre-
      // ARR-06 `Date` went through `toJSON` and produced the same ISO
      // string for the same instant, so it actually compared equal
      // (but ALSO collided with the same ISO string). Post-ARR-06 the
      // instant-by-`getTime` comparison preserves this equivalence.
      rerender({ since: new Date(d1.getTime()) });
      await flushMicrotasks();
      expect(mock.spies.listAdvanced).toHaveBeenCalledTimes(1);

      // Different instant: exactly one new request.
      rerender({ since: d2 });
      await waitFor(() => expect(mock.spies.listAdvanced).toHaveBeenCalledTimes(2));
      expect(mock.spies.listAdvanced).toHaveBeenCalledTimes(2);
    });

    it('useList throws a documented Error for a cycling filter value (no render hang)', () => {
      const { useList } = createModelHooks({ modelService: createMockService<TestDoc>(makeSeed()).service });

      const cycleOwner: { self?: unknown } = {};
      cycleOwner.self = cycleOwner;

      // Pass a `filter` literal that contains a cycle. This is a
      // programming error; the documented contract is that the hook
      // throws an `Error` (caused by `RequestKeyError`) at render
      // time so the consumer's React error boundary can recover,
      // rather than recursing indefinitely or hanging the render.
      expect(() =>
        renderHook(() => useList({ advanced: true, filter: cycleOwner as unknown as { status: string } })),
      ).toThrow(/useList:.*cycle detected/);
    });
  });

  describe('useCount: dependency-key policy', () => {
    it('useCount with inline `filter` does NOT refetch on identity churn', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useCount } = createModelHooks({ modelService: mock.service });

      const { rerender } = renderHook(
        ({ _tick }: { _tick: number }) => useCount({ advanced: true, filter: { status: 'active' } }),
        { initialProps: { _tick: 0 } },
      );

      await waitFor(() => expect(mock.spies.countAdvanced).toHaveBeenCalledTimes(1));

      for (let i = 1; i <= 5; i++) {
        rerender({ _tick: i });
      }
      await flushMicrotasks();
      expect(mock.spies.countAdvanced).toHaveBeenCalledTimes(1);
    });

    it('useCount refetches exactly ONCE when `requestConfig.headers` changes (previously OMITTED)', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useCount } = createModelHooks({ modelService: mock.service });

      const { rerender } = renderHook(
        ({ headers }: { headers: Record<string, string> }) => useCount({ requestConfig: { headers } }),
        { initialProps: { headers: { Authorization: 'Bearer A' } } },
      );

      await waitFor(() => expect(mock.spies.count).toHaveBeenCalledTimes(1));
      rerender({ headers: { Authorization: 'Bearer B' } });
      await waitFor(() => expect(mock.spies.count).toHaveBeenCalledTimes(2));
      expect(mock.spies.count).toHaveBeenCalledTimes(2);

      const [lastConfigArg] = mock.spies.count.mock.calls.at(-1) as [{ headers: Record<string, string> }];
      expect(lastConfigArg.headers).toEqual({ Authorization: 'Bearer B' });
    });

    it('useCount Date-valued filter triggers exactly one refetch when the instant changes', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useCount } = createModelHooks({ modelService: mock.service });

      const d1 = new Date('2026-01-01T00:00:00.000Z');
      const d2 = new Date('2026-02-01T00:00:00.000Z');

      const { rerender } = renderHook(
        ({ since }: { since: Date }) =>
          useCount({ advanced: true, filter: { since } as unknown as FilterQuery<TestDoc> }),
        { initialProps: { since: d1 } },
      );

      await waitFor(() => expect(mock.spies.countAdvanced).toHaveBeenCalledTimes(1));

      rerender({ since: new Date(d1.getTime()) });
      await flushMicrotasks();
      expect(mock.spies.countAdvanced).toHaveBeenCalledTimes(1);

      rerender({ since: d2 });
      await waitFor(() => expect(mock.spies.countAdvanced).toHaveBeenCalledTimes(2));
    });
  });

  describe('useDistinct: dependency-key policy', () => {
    it('useDistinct with inline `conditions` does NOT refetch on identity churn', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useDistinct } = createModelHooks({ modelService: mock.service });

      const { rerender } = renderHook(
        ({ _tick }: { _tick: number }) =>
          useDistinct({ field: 'status', conditions: { org: '1' } as unknown as FilterQuery<TestDoc> }),
        { initialProps: { _tick: 0 } },
      );

      await waitFor(() => expect(mock.spies.distinctAdvanced).toHaveBeenCalledTimes(1));

      for (let i = 1; i <= 5; i++) {
        rerender({ _tick: i });
      }
      await flushMicrotasks();
      expect(mock.spies.distinctAdvanced).toHaveBeenCalledTimes(1);
    });

    it('useDistinct refetches exactly ONCE when `conditions` changes structurally', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useDistinct } = createModelHooks({ modelService: mock.service });

      const { rerender } = renderHook(
        ({ org }: { org: string }) =>
          useDistinct({ field: 'status', conditions: { org } as unknown as FilterQuery<TestDoc> }),
        { initialProps: { org: 'a' } },
      );

      await waitFor(() => expect(mock.spies.distinctAdvanced).toHaveBeenCalledTimes(1));
      rerender({ org: 'b' });
      await waitFor(() => expect(mock.spies.distinctAdvanced).toHaveBeenCalledTimes(2));
      await flushMicrotasks();
      expect(mock.spies.distinctAdvanced).toHaveBeenCalledTimes(2);

      const [fieldArg, conditionsArg, configArg] = mock.spies.distinctAdvanced.mock.calls.at(-1) as [
        string,
        unknown,
        unknown,
      ];
      expect(fieldArg).toBe('status');
      expect(conditionsArg).toEqual({ org: 'b' });
      expect(configArg).toMatchObject({ signal: expect.any(AbortSignal) });
    });

    it('useDistinct refetches exactly ONCE when `requestConfig.headers` changes (previously OMITTED)', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useDistinct } = createModelHooks({ modelService: mock.service });

      const { rerender } = renderHook(
        ({ headers }: { headers: Record<string, string> }) =>
          useDistinct({ field: 'status', requestConfig: { headers } }),
        { initialProps: { headers: { Authorization: 'Bearer A' } } },
      );

      await waitFor(() => expect(mock.spies.distinct).toHaveBeenCalledTimes(1));
      rerender({ headers: { Authorization: 'Bearer B' } });
      await waitFor(() => expect(mock.spies.distinct).toHaveBeenCalledTimes(2));
      expect(mock.spies.distinct).toHaveBeenCalledTimes(2);

      const [fieldArg, configArg] = mock.spies.distinct.mock.calls.at(-1) as [
        string,
        { headers: Record<string, string> },
      ];
      expect(fieldArg).toBe('status');
      expect(configArg.headers).toEqual({ Authorization: 'Bearer B' });
    });
  });

  describe('useRead manual query() forwards per-call QueryCallOptions.signal (ARR-05 wiring preserved under ARR-06 deps restructure)', () => {
    it('useRead manual query() forwards a per-call caller signal through the composition layer and observes caller abort', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      // Pre-arm a DEFERRED read so the request stays pending while the
      // test aborts the caller signal; the composition layer must
      // propagate the abort to the forwarded signal the service
      // observes.
      mock.planDeferred('read', makeSeed().read);
      const { useRead } = createModelHooks({ modelService: mock.service });

      const { result } = renderHook(() => useRead({ enabled: false }));

      const callerController = new AbortController();
      let queryPromise: Promise<unknown> | undefined;
      act(() => {
        // Do NOT await: the request stays pending through the test.
        queryPromise = result.current.query('1', { signal: callerController.signal });
      });

      await waitFor(() => expect(mock.spies.read).toHaveBeenCalledTimes(1));
      const [, , configArg] = mock.spies.read.mock.calls.at(-1) as [string, unknown, { signal: AbortSignal }];
      const forwarded = configArg.signal;
      // Pre-abort: forwarded signal reflects neither source aborted.
      expect(forwarded.aborted).toBe(false);

      // Abort the caller: the composition listener must fire and the
      // forwarded signal the service observes must show aborted.
      callerController.abort();
      expect(forwarded.aborted).toBe(true);

      // Release the deferred request so the test cleans up. Its
      // resolve will settle after abort, at which point the
      // `runWithCallbacks` aborted-but-still-owner branch converges
      // loading/fetching flags. The `queryPromise` rejection is
      // suppressed by the hook's trailing `.catch`.
      const controlled = mock.lastCall('read');
      controlled?.controller.resolve();
      await flushMicrotasks();
      // Suppress unhandled rejection on the dangling promise.
      await queryPromise?.catch(() => undefined);
    });
  });

  describe('React Strict Mode: one logical request per structural state', () => {
    it('useRead with inline `select` iconic to Strict Mode still converges to a single settled request', async () => {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useRead } = createModelHooks({ modelService: mock.service });

      // We pass a `select` literal INSIDE the hook; Strict Mode mounts,
      // cleans up, and remounts the effect. ARR-06 must keep the
      // remount request count to exactly the two Strict-Mode
      // invocations (the first is aborted; the second wins). The
      // assertion logs `(reactStrictMode: true)` as the harness
      // canonicalizes.
      renderHook(() => useRead({ id: 'strict1', advanced: true, select: ['name'] }), {
        reactStrictMode: true,
      });

      // First invocation is aborted by Strict Mode cleanup and a new
      // controller mounted. Both run real network calls through the
      // mock; pre-ARR-06 inline `select` would re-run on every
      // identity churn, but StrictMode is configured in
      // `renderHook` so we expect exactly 2 calls (mount + remount).
      await waitFor(() => expect(mock.spies.readAdvanced).toHaveBeenCalledTimes(2));
      await flushMicrotasks();
      // After Strict Mode settles, no further requests.
      expect(mock.spies.readAdvanced).toHaveBeenCalledTimes(2);
    });
  });
});
