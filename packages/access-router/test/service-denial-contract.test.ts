import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Filter, ModelRequest, ServiceAuthorization } from '../src/interfaces/index.ts';
import type { ServiceExecutors } from '../src/acl/service-execution';
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
  // Upsert now dispatches its create branch through the private execution seam.
  const create = vi
    .spyOn(
      service as unknown as { createPrepared: ServiceExecutors<unknown, Record<never, never>>['create'] },
      'createPrepared',
    )
    .mockResolvedValue({
      success: true,
      kind: 'list',
      code: 'created',
      data: [],
      count: 0,
      contexts: [],
    });
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
const invoke = (
  service: PublicService,
  path: Path,
  authorization?: ServiceAuthorization,
  filter: Filter = original,
) => {
  const callOptions = { ...options, authorization };
  switch (path) {
    case 'findOne':
      return service.findOne(filter, {}, callOptions);
    case 'find':
      return service.find(filter, {}, { ...callOptions, includeCount: true });
    case 'updateOne':
      return service.updateOne(filter, { name: 'changed' }, {}, callOptions);
    case 'upsert':
      return service.upsert(filter, { name: 'changed' }, {}, callOptions);
    case 'findById':
      return service.findById('identifier', {}, callOptions);
    case 'updateById':
      return service.updateById('identifier', { name: 'changed' }, {}, callOptions);
  }
};

// Historical false/nullish service overrides are retired by SVA-09. D00 retains
// their baseline; live denial now uses ordinary queries/IDs and explicit scopes.
describe('ARC-01 / SVA-09 service policy denial', () => {
  it.each(['findOne', 'find'] as const)(
    '%s skips persistence-bearing client subqueries under a false scope',
    async (path) => {
      const { service, macl, expectNoPersistence } = fixture();
      const list = vi.fn().mockResolvedValue({ success: true, kind: 'list', data: ['owner'] });
      macl.getPublicService.mockReturnValue({ _list: list });
      const result = await service[path](
        { owner: { $$sq: { model: 'Owner', op: 'list' } } },
        {},
        { ...options, authorization: { rows: { mode: 'scope', filter: false } } },
      );
      expect(result).toMatchObject(forbidden);
      expectNoPersistence();
      expect(list).not.toHaveBeenCalled();
      expect(macl.getPublicService).not.toHaveBeenCalled();
    },
  );

  it.each(paths)('%s preserves false scope without fallback generators or persistence', async (path) => {
    const { service, macl, expectNoPersistence } = fixture();
    const result = await invoke(service, path, { rows: { mode: 'scope', filter: false } });
    expectNoPersistence();
    expect(macl.genFilter).not.toHaveBeenCalled();
    expect(macl.genIDFilter).not.toHaveBeenCalled();
    expect(result).toMatchObject(forbidden);
  });

  describe.each(paths)('%s controls', (path) => {
    it.each(['omitted', 'undefined', 'empty', 'request'] as const)(
      '%s policy generates the normal filter exactly once',
      async (kind) => {
        const { service, macl, adapter } = fixture();
        const authorization: ServiceAuthorization | undefined =
          kind === 'omitted'
            ? undefined
            : kind === 'undefined'
              ? { rows: undefined }
              : kind === 'empty'
                ? {}
                : { rows: { mode: 'request' } };
        await invoke(service, path, authorization);
        expect(macl.genFilter).toHaveBeenCalledExactlyOnceWith(
          'ArcDenial',
          path === 'find' ? 'list' : path === 'findOne' || path === 'findById' ? 'read' : 'update',
          original,
        );
        expect(macl.genIDFilter).toHaveBeenCalledTimes(path.endsWith('ById') ? 1 : 0);
        expect(path === 'find' ? adapter.find : adapter.findOne).toHaveBeenCalledWith(
          expect.objectContaining({ filter: generated }),
        );
      },
    );

    it.each([null, undefined])('rejects scope.filter=%s before generators/persistence', async (filter) => {
      const { service, macl, expectNoPersistence } = fixture();
      expect(await invoke(service, path, { rows: { mode: 'scope', filter } } as never)).toMatchObject({
        success: false,
        code: 'bad_request',
      });
      expectNoPersistence();
      expect(macl.genIDFilter).not.toHaveBeenCalled();
      expect(macl.genFilter).not.toHaveBeenCalled();
    });

    it.each(['scope', 'unrestricted'] as const)(
      '%s preserves the ordinary query and normal identifier resolution',
      async (mode) => {
        const { service, macl, adapter } = fixture();
        const scope = { tenant: 'trusted' };
        await invoke(service, path, { rows: mode === 'scope' ? { mode, filter: scope } : { mode } });
        expect(macl.genIDFilter).toHaveBeenCalledTimes(path.endsWith('ById') ? 1 : 0);
        expect(macl.genFilter).not.toHaveBeenCalled();
        expect(path === 'find' ? adapter.find : adapter.findOne).toHaveBeenCalledWith(
          expect.objectContaining({ filter: mode === 'scope' ? { ...original, ...scope } : original }),
        );
      },
    );
  });

  it.each(paths)('%s preserves a false query/identifier even under unrestricted rows', async (path) => {
    const { service, macl, expectNoPersistence } = fixture();
    macl.genIDFilter.mockResolvedValue(false);
    expect(await invoke(service, path, { rows: { mode: 'unrestricted' } }, false)).toMatchObject(forbidden);
    expectNoPersistence();
    expect(macl.genFilter).not.toHaveBeenCalled();
    expect(macl.genIDFilter).toHaveBeenCalledTimes(path.endsWith('ById') ? 1 : 0);
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
    expect(macl.genFilter).toHaveBeenCalledExactlyOnceWith('ArcDenial', 'update', original);
    expect(macl.genIDFilter).toHaveBeenCalledTimes(1);
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
