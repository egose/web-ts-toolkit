import { describe, expect, it } from 'vitest';
import type { AxiosResponse } from 'axios';

import { createAdapter } from '../src/adapter';

/**
 * BND-11: distinct result types are truthful (`unknown[]`, not `string[]`).
 * The sibling server returns raw distinct values without string conversion,
 * and the client must not stringify them. Direct and grouped numeric/boolean
 * results retain runtime values; strict consumers narrow before assuming
 * strings (see `test-decl-consumer/decl-consumer.strict.test.ts`).
 */

const VALUES: Record<string, unknown[]> = {
  age: [1, 3, 5],
  public: [true, false],
  role: ['admin', 'user'],
};

function distinctFor(field: string): unknown[] {
  return VALUES[field] ?? [];
}

function createDistinctAdapter() {
  const adapter = createAdapter({
    baseURL: 'http://localhost',
    adapter: async (config) => {
      const url = String((config as { url?: unknown }).url ?? '');
      const method = String((config as { method?: unknown }).method ?? 'get').toLowerCase();
      if (url === 'root' || url === '/root' || url.endsWith('/root')) {
        const raw = (config as { data?: unknown }).data;
        let defs: Array<Record<string, unknown>> = [];
        if (typeof raw === 'string') {
          try {
            defs = JSON.parse(raw) as Array<Record<string, unknown>>;
          } catch {
            defs = [];
          }
        } else if (Array.isArray(raw)) {
          defs = raw as Array<Record<string, unknown>>;
        }
        return {
          data: defs.map((def) => ({
            result: { success: true, kind: 'list', data: distinctFor(String(def.field ?? '')) },
            message: '',
            statusCode: 200,
            op: 'distinct',
          })),
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        } as unknown as AxiosResponse;
      }
      const match = url.match(/\/distinct\/(.+)$/);
      const field = match ? decodeURIComponent(match[1]) : '';
      let values = distinctFor(field);
      if (method === 'post') {
        const raw = (config as { data?: unknown }).data;
        let body: Record<string, unknown> = {};
        if (typeof raw === 'string') {
          try {
            body = JSON.parse(raw) as Record<string, unknown>;
          } catch {
            body = {};
          }
        } else if (raw && typeof raw === 'object') {
          body = raw as Record<string, unknown>;
        }
        // Filtered variant: `{ public: false }` excludes every row in this
        // fixture, proving the `{ filter: conditions }` body still reaches
        // the server while values stay un-stringified.
        const filter = body.filter as Record<string, unknown> | undefined;
        if (filter && filter.public === false) values = [];
      }
      return {
        data: values,
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      } as unknown as AxiosResponse;
    },
  });
  const service = adapter.createModelService<{ _id?: string; age: number; public: boolean; role: string }>({
    modelName: 'User',
    basePath: 'users',
  });
  return { adapter, service };
}

describe('BND-11 distinct results retain runtime values', () => {
  it('direct distinct() preserves numeric values without stringification', async () => {
    const { service } = createDistinctAdapter();
    const dynamicField: string = ['a', 'g', 'e'].join('');
    const res = await service.distinct(dynamicField);
    expect(res.success).toBe(true);
    if (!res.success) throw new Error('expected success');
    expect(res.data).toStrictEqual([1, 3, 5]);
    expect(res.raw).toStrictEqual([1, 3, 5]);
    for (const value of res.data) expect(typeof value).toBe('number');
    expect(res.data).not.toStrictEqual(['1', '3', '5']);
  });

  it('direct distinct() preserves boolean values without stringification', async () => {
    const { service } = createDistinctAdapter();
    const dynamicField: string = 'public';
    const res = await service.distinct(dynamicField);
    expect(res.success).toBe(true);
    if (!res.success) throw new Error('expected success');
    expect(res.data).toStrictEqual([true, false]);
    for (const value of res.data) expect(typeof value).toBe('boolean');
    expect(res.data).not.toStrictEqual(['true', 'false']);
  });

  it('direct distinctAdvanced() preserves values and sends { filter: conditions }', async () => {
    const { service } = createDistinctAdapter();
    const dynamicField: string = ['p', 'u', 'b', 'l', 'i', 'c'].join('');
    const res = await service.distinctAdvanced(dynamicField, { public: true } as never);
    expect(res.success).toBe(true);
    if (!res.success) throw new Error('expected success');
    expect(res.data).toStrictEqual([true, false]);

    const numeric = await service.distinctAdvanced('age', { public: true } as never);
    expect(numeric.success).toBe(true);
    if (!numeric.success) throw new Error('expected success');
    expect(numeric.data).toStrictEqual([1, 3, 5]);

    const filtered = await service.distinctAdvanced(dynamicField, { public: false } as never);
    expect(filtered.success).toBe(true);
    if (!filtered.success) throw new Error('expected success');
    expect(filtered.data).toStrictEqual([]);
  });

  it('grouped distinct()/distinctAdvanced() preserve numeric and boolean values', async () => {
    const { adapter, service } = createDistinctAdapter();
    const numericField: string = 'age';
    const booleanField: string = 'public';
    const [numeric, boolean, numericFiltered] = await adapter.group(
      service.distinct(numericField),
      service.distinct(booleanField),
      service.distinctAdvanced(numericField, { public: true } as never),
    );
    for (const res of [numeric, boolean, numericFiltered]) expect(res.success).toBe(true);
    if (!numeric.success || !boolean.success || !numericFiltered.success) throw new Error('expected success');
    expect(numeric.data).toStrictEqual([1, 3, 5]);
    expect(boolean.data).toStrictEqual([true, false]);
    expect(numericFiltered.data).toStrictEqual([1, 3, 5]);
    for (const value of numeric.data) expect(typeof value).toBe('number');
    for (const value of boolean.data) expect(typeof value).toBe('boolean');
  });

  it('string distinct values still work through both variants', async () => {
    const { adapter, service } = createDistinctAdapter();
    const dynamicField: string = 'role';
    const direct = await service.distinct(dynamicField);
    const directAdvanced = await service.distinctAdvanced(dynamicField, {});
    expect(direct.success && directAdvanced.success).toBe(true);
    if (!direct.success || !directAdvanced.success) throw new Error('expected success');
    expect([...direct.data].sort()).toStrictEqual(['admin', 'user']);
    expect([...directAdvanced.data].sort()).toStrictEqual(['admin', 'user']);
    const [grouped] = await adapter.group(service.distinct(dynamicField));
    expect(grouped.success).toBe(true);
    if (!grouped.success) throw new Error('expected success');
    expect([...grouped.data].sort()).toStrictEqual(['admin', 'user']);
  });
});
