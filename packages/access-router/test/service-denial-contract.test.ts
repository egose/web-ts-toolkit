import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Filter, ModelRequest } from '../src/interfaces/index.ts';
import type { ModelAdapter } from '../src/model.ts';
import { PublicService } from '../src/services/public-service.ts';
import { Cache } from '../src/cache.ts';
import { resolveAccessFilter } from '../src/core-shared.ts';
import Permission from '../src/permission.ts';

const forbidden = { success: false, kind: 'error', code: 'forbidden', query: { filter: false } };
const generated = { tenant: 'allowed' };
const original = { name: 'original' };

const fixture = () => {
  const adapter: ModelAdapter = {
    modelName: 'ArcDenial',
    mongooseModel: {} as ModelAdapter['mongooseModel'],
    new: vi.fn(),
    create: vi.fn(),
    find: vi.fn().mockResolvedValue([]),
    findOne: vi.fn().mockResolvedValue(null),
    exists: vi.fn().mockResolvedValue(null),
    countDocuments: vi.fn().mockResolvedValue(0),
    distinct: vi.fn(),
    aggregate: vi.fn(),
  };
  const macl = {
    getPublicService: vi.fn(),
    genFilter: vi.fn(async (_model, _access, filter) => (filter === false ? false : generated)),
    genIDFilter: vi.fn().mockResolvedValue(original),
    genSelect: vi.fn().mockResolvedValue(['_id', 'name']),
    genPopulate: vi.fn().mockResolvedValue([]),
    genAllowedFields: vi.fn().mockResolvedValue(['_id', 'name']),
    isAllowed: vi.fn().mockResolvedValue(true),
    getIdentifier: vi.fn().mockReturnValue('_id'),
    decorate: vi.fn(async (_model, doc) => doc),
  };
  const service = new (class extends PublicService {
    protected createModelAdapter() {
      return adapter;
    }
    protected getModelRouterOptions() {
      return { defaults: {}, documentPermissionField: '_permissions', listHardLimit: 1000 };
    }
  })({ macl } as unknown as ModelRequest, 'ArcDenial');
  const create = vi.spyOn(service, 'create').mockResolvedValue({
    success: true,
    kind: 'list',
    code: 'created',
    data: [],
    count: 0,
  } as never);
  const save = vi.spyOn(mongoose.Model.prototype, 'save');
  const expectNoPersistence = () => {
    for (const [name, method] of Object.entries(adapter)) {
      if (typeof method === 'function') expect(method, name).not.toHaveBeenCalled();
    }
    expect(create).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  };
  return { service, adapter, macl, create, expectNoPersistence };
};

afterEach(() => vi.restoreAllMocks());

const options = { skim: true, includePermissions: false };
const paths = ['findOne', 'find', 'updateOne', 'upsert', 'findById', 'updateById'] as const;
type Path = (typeof paths)[number];
const invoke = (service: PublicService, path: Path, override: Filter | undefined, omitted = false) => {
  const isId = path === 'findById' || path === 'updateById';
  const args = omitted ? undefined : { overrides: { [isId ? 'idFilter' : 'filter']: override } };
  switch (path) {
    case 'findOne':
      return service.findOne(original, args, options);
    case 'find':
      return service.find(original, args, { ...options, includeCount: true });
    case 'updateOne':
      return service.updateOne(original, { name: 'changed' }, args, options);
    case 'upsert':
      return service.upsert(original, { name: 'changed' }, args, options);
    case 'findById':
      return service.findById('identifier', args, options);
    case 'updateById':
      return service.updateById('identifier', { name: 'changed' }, args, options);
  }
};

describe('ARC-01 trusted service override denial', () => {
  it.each(['findOne', 'find'] as const)(
    '%s skips persistence-bearing client subqueries under a false override',
    async (path) => {
      const { service, macl, expectNoPersistence } = fixture();
      const list = vi.fn().mockResolvedValue({ success: true, kind: 'list', data: ['owner'] });
      macl.getPublicService.mockReturnValue({ _list: list });
      const result = await service[path](
        { owner: { $$sq: { model: 'Owner', op: 'list' } } },
        { overrides: { filter: false } },
        options,
      );
      expect(result).toMatchObject(forbidden);
      expectNoPersistence();
      expect(list).not.toHaveBeenCalled();
      expect(macl.getPublicService).not.toHaveBeenCalled();
    },
  );

  it.each(paths)('%s preserves false without fallback generators or persistence', async (path) => {
    const { service, macl, expectNoPersistence } = fixture();
    const result = await invoke(service, path, false);
    expectNoPersistence();
    expect(macl.genFilter).not.toHaveBeenCalled();
    expect(macl.genIDFilter).not.toHaveBeenCalled();
    expect(result).toMatchObject(forbidden);
  });

  describe.each(paths)('%s controls', (path) => {
    it.each(['omitted', 'undefined', 'null'] as const)('%s generates the normal filter exactly once', async (kind) => {
      const { service, macl, adapter } = fixture();
      await invoke(service, path, kind === 'null' ? null : undefined, kind === 'omitted');
      expect(macl.genFilter).toHaveBeenCalledExactlyOnceWith(
        'ArcDenial',
        path === 'find' ? 'list' : path === 'findOne' || path === 'findById' ? 'read' : 'update',
        original,
      );
      expect(macl.genIDFilter).toHaveBeenCalledTimes(path.endsWith('ById') ? 1 : 0);
      expect(path === 'find' ? adapter.find : adapter.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ filter: generated }),
      );
    });

    it('retains trusted object replacement (id objects still receive row policy)', async () => {
      const { service, macl, adapter } = fixture();
      const replacement = { name: 'replacement' };
      await invoke(service, path, replacement);
      expect(macl.genIDFilter).not.toHaveBeenCalled();
      if (path.endsWith('ById')) {
        expect(macl.genFilter).toHaveBeenCalledExactlyOnceWith(
          'ArcDenial',
          path === 'findById' ? 'read' : 'update',
          replacement,
        );
      } else {
        expect(macl.genFilter).not.toHaveBeenCalled();
      }
      expect(path === 'find' ? adapter.find : adapter.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ filter: path.endsWith('ById') ? generated : replacement }),
      );
    });
  });
});

describe('ARC-01 exists denial', () => {
  describe.each([false, true])('includeId=%s', (includeId) => {
    it.each(['explicit', 'base', 'override'] as const)(
      '%s false returns Forbidden before adapter dispatch',
      async (source) => {
        const { service, macl, expectNoPersistence } = fixture();
        const override = vi.fn((filter: Filter) => (source === 'override' ? false : filter));
        macl.genFilter.mockImplementation(async (_model, _access, filter) =>
          resolveAccessFilter({
            req: {} as ModelRequest,
            permissions: new Permission({}),
            cache: new Cache<string, unknown>(),
            cacheKey: 'exists',
            filter,
            getOption: (key, fallback) =>
              ({
                'baseFilter.read': () => (source === 'base' ? false : {}),
                'overrideFilter.read': override,
              })[key] ?? fallback,
          }),
        );
        const result = await service.exists(source === 'explicit' ? false : original, { includeId });
        expectNoPersistence();
        expect(result).toMatchObject(forbidden);
        expect(result).not.toHaveProperty('data');
        if (source === 'explicit') expect(override).not.toHaveBeenCalled();
      },
    );
  });
});

describe('ARC-01 public callers', () => {
  it('resolves a denied public read identifier only once, with no list retry', async () => {
    const { service, macl, expectNoPersistence } = fixture();
    // A second resolution would allow the identifier: false must be terminal.
    macl.genIDFilter.mockResolvedValueOnce(false).mockResolvedValue(original);
    const result = await service._read('identifier', {}, { ...options, tryList: true });
    expectNoPersistence();
    expect(result).toMatchObject(forbidden);
    expect(macl.genIDFilter).toHaveBeenCalledTimes(1);
    expect(macl.genFilter).not.toHaveBeenCalled();
    expect(macl.isAllowed).not.toHaveBeenCalled();
  });

  it.each(['_read', '_readFilter'] as const)('%s never retries a terminal read-policy denial as list', async (path) => {
    const { service, macl, expectNoPersistence } = fixture();
    macl.genFilter.mockImplementation(async (_model, access) => (access === 'read' ? false : generated));
    const result =
      path === '_read'
        ? await service._read('identifier', {}, { ...options, tryList: true })
        : await service._readFilter(original, {}, { ...options, tryList: true });
    expectNoPersistence();
    expect(result).toMatchObject(forbidden);
    expect(macl.genFilter).toHaveBeenCalledTimes(1);
    expect(macl.isAllowed).not.toHaveBeenCalled();
  });

  it('propagates denied exists from public upsert without update/create', async () => {
    const { service, macl, expectNoPersistence } = fixture();
    macl.genFilter.mockResolvedValue(false);
    const update = vi.spyOn(service, '_update');
    const result = await service._upsert({ _id: 'identifier', name: 'changed' });
    expectNoPersistence();
    expect(result).toMatchObject(forbidden);
    expect(macl.genFilter).toHaveBeenCalledExactlyOnceWith('ArcDenial', 'update', { _id: 'identifier' });
    expect(update).not.toHaveBeenCalled();
  });

  it('keeps allowed no-match public upsert Unauthorized without creating', async () => {
    const { service, adapter, create } = fixture();
    const update = vi.spyOn(service, '_update');
    expect(await service._upsert({ _id: 'identifier' })).toMatchObject({ success: false, code: 'unauthorized' });
    expect(adapter.exists).toHaveBeenCalledExactlyOnceWith(generated);
    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});
