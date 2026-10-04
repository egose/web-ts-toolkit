import { describe, expect, it } from 'vitest';
import { createAdapter } from '../src/adapter';
import { serializeSelectParam } from '../src/services/shared';

type Doc = { _id: string; name: string; secret: string };

function fixture(defaults?: Parameters<ReturnType<typeof createAdapter>['createModelService']>[1]) {
  const dispatched: Array<{ config: { timeout?: unknown }; query: URLSearchParams; body: unknown }> = [];
  const adapter = createAdapter({
    baseURL: 'http://localhost',
    adapter: async (config) => {
      const query = new URL(adapter.axios.getUri(config)).searchParams;
      const body: unknown = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      dispatched.push({ config: { timeout: (config as { timeout?: unknown }).timeout }, query, body });
      return {
        data: { _id: '1', name: 'alpha', secret: 's1' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    },
  });
  const model = adapter.createModelService<Doc>({ modelName: 'User', basePath: 'users' }, defaults);
  return { model, dispatched };
}

describe('basic select query param', () => {
  describe('serializeSelectParam', () => {
    it('returns undefined when absent or empty', () => {
      expect(serializeSelectParam(undefined)).toBeUndefined();
      expect(serializeSelectParam('')).toBeUndefined();
      expect(serializeSelectParam([])).toBeUndefined();
      expect(serializeSelectParam({})).toBeUndefined();
    });

    it('joins arrays with commas', () => {
      expect(serializeSelectParam(['name', 'secret'])).toBe('name,secret');
    });

    it('flattens objects with - prefix for descending', () => {
      expect(serializeSelectParam({ name: 1, secret: -1 })).toBe('name,-secret');
    });

    it('passes strings through for server-side splitting', () => {
      expect(serializeSelectParam('name secret')).toBe('name secret');
    });
  });

  describe('model list', () => {
    it('sends select as a single query value', async () => {
      const { model, dispatched } = fixture();
      await model.list({ select: ['name', 'secret'] });
      expect(dispatched).toHaveLength(1);
      expect(dispatched[0].query.get('select')).toBe('name,secret');
    });

    it('omits select when not provided', async () => {
      const { model, dispatched } = fixture();
      await model.list({ limit: 5 });
      expect(dispatched[0].query.getAll('select')).toEqual([]);
    });

    it('applies service-default select and lets per-call win', async () => {
      const { model, dispatched } = fixture({ listArgs: { select: ['name'] } });
      await model.list();
      expect(dispatched[0].query.get('select')).toBe('name');
      await model.list({ select: ['secret'] });
      expect(dispatched[1].query.get('select')).toBe('secret');
    });

    it('keeps the original projection in __query args for root fidelity', async () => {
      const { model } = fixture();
      const req = model.list({ select: ['name', 'secret'] });
      await req;
      expect((req as unknown as { __query: { args: { select: unknown } } }).__query.args.select).toEqual([
        'name',
        'secret',
      ]);
    });

    it('forwards select into $include payloads', () => {
      const { model } = fixture();
      const wire = model.list({ select: ['name'] }).$include('posts', { filter: { authorId: 'u1' } });
      expect((wire as { args: unknown }).args).toMatchObject({ select: ['name'] });
    });
  });

  describe('model read', () => {
    it('sends select as a single query value', async () => {
      const { model, dispatched } = fixture();
      await model.read('1', { select: ['name'] });
      expect(dispatched).toHaveLength(1);
      expect(dispatched[0].query.get('select')).toBe('name');
    });

    it('omits select when not provided', async () => {
      const { model, dispatched } = fixture();
      await model.read('1');
      expect(dispatched[0].query.getAll('select')).toEqual([]);
    });

    it('applies service-default select and lets per-call win', async () => {
      const { model, dispatched } = fixture({ readArgs: { select: ['name'] } });
      await model.read('1');
      expect(dispatched[0].query.get('select')).toBe('name');
      await model.read('1', { select: ['secret'] });
      expect(dispatched[1].query.get('select')).toBe('secret');
    });

    it('keeps the original projection in __query args for root fidelity', async () => {
      const { model } = fixture();
      const req = model.read('1', { select: ['name'] });
      await req;
      expect((req as unknown as { __query: { args: { select: unknown } } }).__query.args.select).toEqual(['name']);
    });

    it('forwards select into $include payloads', () => {
      const { model } = fixture();
      const wire = model.read('1', { select: ['name'] }).$include('posts');
      expect((wire as { args: unknown }).args).toMatchObject({ select: ['name'] });
    });

    it('keeps legacy options-position calls working', async () => {
      const { model, dispatched } = fixture();
      await model.read('1', { tryList: false });
      expect(dispatched[0].query.get('try_list')).toBe('false');
      expect(dispatched[0].query.getAll('select')).toEqual([]);
    });

    it('keeps legacy options-plus-config calls working', async () => {
      const { model, dispatched } = fixture();
      await model.read('1', { tryList: false }, { timeout: 1234 });
      expect(dispatched[0].query.get('try_list')).toBe('false');
      expect(dispatched[0].config.timeout).toBe(1234);
    });

    it('passes options and config through in the args arrangement', async () => {
      const { model, dispatched } = fixture();
      await model.read('1', { select: ['name'] }, { tryList: false }, { timeout: 1234 });
      expect(dispatched[0].query.get('select')).toBe('name');
      expect(dispatched[0].query.get('try_list')).toBe('false');
      expect(dispatched[0].config.timeout).toBe(1234);
    });

    it('rejects mixed args/options keys in one object', () => {
      const { model } = fixture();
      expect(() => model.read('1', { select: ['name'], tryList: false } as never)).toThrow(
        "'tryList' belongs in options",
      );
    });
  });

  describe('model update', () => {
    it('sends select as a single query value', async () => {
      const { model, dispatched } = fixture();
      await model.update('1', { name: 'beta' }, { select: ['name'] });
      expect(dispatched).toHaveLength(1);
      expect(dispatched[0].query.get('select')).toBe('name');
    });

    it('omits select when not provided', async () => {
      const { model, dispatched } = fixture();
      await model.update('1', { name: 'beta' });
      expect(dispatched[0].query.getAll('select')).toEqual([]);
    });

    it('applies service-default select and lets per-call win', async () => {
      const { model, dispatched } = fixture({ updateArgs: { select: ['name'] } });
      await model.update('1', { name: 'beta' });
      expect(dispatched[0].query.get('select')).toBe('name');
      await model.update('1', { name: 'beta' }, { select: ['secret'] });
      expect(dispatched[1].query.get('select')).toBe('secret');
    });

    it('keeps the original projection in __query args for root fidelity', async () => {
      const { model } = fixture();
      const req = model.update('1', { name: 'beta' }, { select: ['name'] });
      await req;
      expect((req as unknown as { __query: { args: { select: unknown } } }).__query.args.select).toEqual(['name']);
    });

    it('keeps legacy options-position calls working', async () => {
      const { model, dispatched } = fixture();
      await model.update('1', { name: 'beta' }, { returningAll: false });
      expect(dispatched[0].query.get('returning_all')).toBe('false');
      expect(dispatched[0].query.getAll('select')).toEqual([]);
    });

    it('keeps legacy options-plus-config calls working', async () => {
      const { model, dispatched } = fixture();
      await model.update('1', { name: 'beta' }, { returningAll: false }, { timeout: 1234 });
      expect(dispatched[0].query.get('returning_all')).toBe('false');
      expect(dispatched[0].config.timeout).toBe(1234);
    });

    it('passes options and config through in the args arrangement', async () => {
      const { model, dispatched } = fixture();
      await model.update('1', { name: 'beta' }, { select: ['name'] }, { returningAll: false }, { timeout: 1234 });
      expect(dispatched[0].query.get('select')).toBe('name');
      expect(dispatched[0].query.get('returning_all')).toBe('false');
      expect(dispatched[0].config.timeout).toBe(1234);
    });

    it('rejects mixed args/options keys in one object', () => {
      const { model } = fixture();
      expect(() => model.update('1', { name: 'beta' }, { select: ['name'], returningAll: false } as never)).toThrow(
        "'returningAll' belongs in options",
      );
    });
  });
});
