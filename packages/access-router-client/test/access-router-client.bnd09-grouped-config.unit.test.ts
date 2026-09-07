import { describe, expect, it } from 'vitest';
import type { AxiosResponse } from 'axios';

import { createAdapter } from '../src/adapter';

/**
 * BND-09 grouped-config boundary: lossless validation, bounded cycles,
 * option-level denylist.
 *
 * Supported grammar (see `normalizeGroupedRequestConfig` JSDoc):
 * finite numbers/strings/booleans/null, plain objects, arrays, valid Dates
 * (tagged `{ __type: 'Date', iso }`), URLSearchParams (tagged sorted
 * entries), AxiosHeaders via toJSON. Everything else rejects with
 * `UnsupportedGroupedRequestConfigError` before claims/dispatch.
 */
const groupSuccessPayload = (ids: string[]) => ({
  data: ids.map((id) => ({
    result: { success: true, kind: 'single', data: { _id: id, name: `user-${id}` } },
    statusCode: 200,
  })),
});

function createGroupAdapter(onDispatch?: (config: Record<string, unknown>) => void) {
  let invocations = 0;
  let lastConfig: Record<string, unknown> | undefined;
  const adapter = createAdapter({
    baseURL: 'http://localhost',
    adapter: async (config) => {
      invocations += 1;
      lastConfig = config as unknown as Record<string, unknown>;
      onDispatch?.(lastConfig);
      const raw = (config as { data?: unknown }).data;
      let body: unknown = raw;
      if (typeof raw === 'string') {
        try {
          body = JSON.parse(raw);
        } catch {
          body = raw;
        }
      }
      const count = Array.isArray(body) ? body.length : 1;
      const ids = Array.from({ length: count }, (_, i) => `id-${i}`);
      return {
        data: groupSuccessPayload(ids).data,
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      } as unknown as AxiosResponse;
    },
  });
  const service = adapter.createModelService<{ _id: string; name: string }>({ modelName: 'User', basePath: 'users' });
  return { adapter, service, invocations: () => invocations, lastConfig: () => lastConfig };
}

describe('BND-09 grouped config validation is lossless and bounded', () => {
  it('groups equal URLSearchParams (order-insensitive) with a single dispatch', async () => {
    const { adapter, service, invocations } = createGroupAdapter();
    const grouped = await adapter.group(
      service.read('1', undefined, { params: new URLSearchParams('a=1&b=2') }),
      service.read('2', undefined, { params: new URLSearchParams('b=2&a=1') }),
    );
    expect(invocations()).toBe(1);
    expect(grouped).toHaveLength(2);
    expect(grouped[0].success).toBe(true);
  });

  it('rejects distinct URLSearchParams before dispatch and keeps requests directly executable', async () => {
    const { adapter, service, invocations } = createGroupAdapter();
    const first = service.read('1', undefined, { params: new URLSearchParams('a=1') });
    const second = service.read('2', undefined, { params: new URLSearchParams('b=2') });
    await expect(adapter.group(first, second)).rejects.toThrow(
      'Grouped requests must share the same axios request config',
    );
    expect(invocations()).toBe(0);
    await expect(first).resolves.toMatchObject({ success: true });
    expect(invocations()).toBeGreaterThanOrEqual(1);
  });

  it('groups equal nested dates and rejects distinct nested dates', async () => {
    const at = new Date('2024-01-01T00:00:00.000Z');
    const same = createGroupAdapter();
    const grouped = await same.adapter.group(
      same.service.read('1', undefined, { params: { at } }),
      same.service.read('2', undefined, { params: { at: new Date('2024-01-01T00:00:00.000Z') } }),
    );
    expect(same.invocations()).toBe(1);
    expect(grouped[0].success).toBe(true);

    const distinct = createGroupAdapter();
    const first = distinct.service.read('1', undefined, { params: { at: new Date('2024-01-01T00:00:00.000Z') } });
    const second = distinct.service.read('2', undefined, { params: { at: new Date('2025-06-01T00:00:00.000Z') } });
    await expect(distinct.adapter.group(first, second)).rejects.toThrow(
      'Grouped requests must share the same axios request config',
    );
    expect(distinct.invocations()).toBe(0);
  });

  it('distinguishes a Date from its ISO string', async () => {
    const { adapter, service, invocations } = createGroupAdapter();
    const first = service.read('1', undefined, { params: { at: new Date('2024-01-01T00:00:00.000Z') } });
    const second = service.read('2', undefined, { params: { at: '2024-01-01T00:00:00.000Z' } });
    await expect(adapter.group(first, second)).rejects.toThrow(
      'Grouped requests must share the same axios request config',
    );
    expect(invocations()).toBe(0);
  });

  it('rejects unsupported instances predictably with zero dispatch', async () => {
    const cases: Array<[string, unknown]> = [
      ['Map', new Map([['a', 1]])],
      ['bigint', 1n],
      ['non-finite number', Number.NaN],
      ['invalid Date', new Date(Number.NaN)],
      ['AbortSignal', new AbortController().signal],
    ];
    for (const [name, value] of cases) {
      const { adapter, service, invocations } = createGroupAdapter();
      await expect(
        adapter.group(service.read('1', undefined, { params: { v: value } })),
        `case ${name}`,
      ).rejects.toThrow(/Grouped requests do not support/);
      expect(invocations(), `case ${name}`).toBe(0);
    }
  });

  it('rejects self-array and mixed array/object cycles with controlled errors and zero dispatch', async () => {
    const selfArray: unknown[] = [];
    selfArray.push(selfArray);
    const mixedOuter: unknown[] = [];
    const mixedInner: Record<string, unknown> = { back: mixedOuter };
    mixedOuter.push(mixedInner);

    for (const [name, value] of [
      ['self-array', { list: selfArray }],
      ['mixed cycle', { v: mixedOuter }],
    ] as Array<[string, unknown]>) {
      const { adapter, service, invocations } = createGroupAdapter();
      await expect(adapter.group(service.read('1', undefined, { params: value })), `case ${name}`).rejects.toThrow(
        /circular axios config/,
      );
      expect(invocations(), `case ${name}`).toBe(0);
      const clean = await adapter.group(service.read('1'));
      expect(clean[0].success).toBe(true);
    }
  });

  it('accepts nested params.adapter/params.signal scalar data', async () => {
    const { adapter, service, invocations } = createGroupAdapter();
    const grouped = await adapter.group(
      service.read('1', undefined, { params: { adapter: 'mobile', signal: 'scalar-ok' } }),
      service.read('2', undefined, { params: { adapter: 'mobile', signal: 'scalar-ok' } }),
    );
    expect(invocations()).toBe(1);
    expect(grouped).toHaveLength(2);
  });

  it('still rejects top-level axios option keys and preserves function/cancellation rejection', async () => {
    const top = createGroupAdapter();
    await expect(top.adapter.group(top.service.read('1', undefined, { adapter: 'x' }))).rejects.toThrow(/adapter/);
    expect(top.invocations()).toBe(0);

    const fn = createGroupAdapter();
    await expect(fn.adapter.group(fn.service.read('1', undefined, { validateStatus: () => true }))).rejects.toThrow(
      /validateStatus/,
    );
    expect(fn.invocations()).toBe(0);
  });

  it('rolls back claims when grouping an already-claimed request', async () => {
    const { adapter, service, invocations } = createGroupAdapter();
    const shared = service.read('1');
    const other = service.read('2');
    const grouped = await adapter.group(shared, other);
    expect(grouped).toHaveLength(2);
    expect(invocations()).toBe(1);
    await expect(adapter.group(shared, service.read('3'))).rejects.toThrow(/already claimed/);
    const fresh = await adapter.group(service.read('4'));
    expect(fresh).toHaveLength(1);
    expect(invocations()).toBe(2);
  });
});
