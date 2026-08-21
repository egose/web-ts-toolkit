import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ModelRequest } from '../src/interfaces/index.ts';
import { RequestConcurrencyScheduler } from '../src/helpers/concurrency.ts';
import { setGlobalOptions } from '../src/options/index.ts';
import { Base } from '../src/services/base.ts';
import { Service } from '../src/services/service.ts';

let modelCounter = 0;

class TestBase extends Base {
  include(docs: unknown, include: unknown) {
    return this.includeDocs(docs, include as never);
  }

  parse<T>(value: T, scheduler?: RequestConcurrencyScheduler, scheduled?: boolean) {
    return this.parseClientData(value, scheduler, scheduled);
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  setGlobalOptions({ requestComplexity: {} });
  mongoose.deleteModel(/AclServiceInternal.*/);
});

describe('access-router internals', () => {
  it('uses the authorized upsert filter for the existence check', async () => {
    const modelName = `AclServiceInternal${++modelCounter}`;
    mongoose.model(modelName, new mongoose.Schema({ name: String, public: Boolean }));

    const service = new Service({ macl: {} } as ModelRequest, modelName);
    const authorizedFilter = { public: true, name: 'hidden-user' };
    const findOneSpy = vi.spyOn(
      (service as never as { model: { findOne: (query: unknown) => Promise<unknown> } }).model,
      'findOne',
    );
    findOneSpy.mockResolvedValue(null);

    vi.spyOn(
      service as never as { genFilter: (access: string, filter: unknown) => Promise<unknown> },
      'genFilter',
    ).mockResolvedValue(authorizedFilter);
    const createSpy = vi.spyOn(service, 'create').mockResolvedValue({
      success: true,
      kind: 'list',
      code: 'created',
      data: [],
      count: 0,
    } as never);
    const updateSpy = vi.spyOn(service, 'updateOne');

    await service.upsert({ name: 'hidden-user' }, { name: 'replacement-user' });

    expect(findOneSpy).toHaveBeenCalledWith({ filter: authorizedFilter });
    expect(createSpy).toHaveBeenCalledOnce();
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('builds grouped counts with the requested access filter and canonical keys', async () => {
    const modelName = `AclServiceInternal${++modelCounter}`;
    mongoose.model(modelName, new mongoose.Schema({ ownerId: String, public: Boolean }));

    const service = new Service({ macl: {} } as ModelRequest, modelName);
    vi.spyOn(
      service as never as { genFilter: (access: string, filter: unknown) => Promise<unknown> },
      'genFilter',
    ).mockImplementation(async (access, filter) => ({ ...(filter as object), access }));
    const aggregateSpy = vi
      .spyOn(
        (service as never as { model: { model: { aggregate: (pipeline: unknown[]) => Promise<unknown[]> } } }).model
          .model,
        'aggregate',
      )
      .mockResolvedValue([
        { _id: 'u1', documentIds: ['p1', 'p2'] },
        { _id: 'u2', documentIds: ['p2'] },
      ]);

    const result = await service.countByFieldValues('ownerId', ['u1', 'u1', 'u2'], { public: true }, 'count');

    expect(aggregateSpy).toHaveBeenCalledOnce();
    expect(aggregateSpy.mock.calls[0]?.[0]?.[0]).toEqual({
      $match: { public: true, ownerId: { $in: ['u1', 'u2'] }, access: 'count' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.get('u1')).toEqual(new Set(['p1', 'p2']));
      expect(result.data.get('u2')).toEqual(new Set(['p2']));
    }
  });

  it('batches include count lookups into a single query', async () => {
    const counts = new Map([
      ['u1', new Set(['p1', 'p2'])],
      ['u2', new Set(['p3'])],
    ]);
    const publicService = {
      countByFieldValues: vi.fn().mockResolvedValue({
        success: true,
        kind: 'single',
        data: counts,
      }),
    };
    const req = {
      macl: {
        isAllowed: vi.fn().mockResolvedValue(true),
        getPublicService: vi.fn().mockReturnValue(publicService),
      },
    } as ModelRequest;
    const base = new TestBase(req, 'User');

    const docs = [{ ownerId: 'u1' }, { ownerId: 'u2' }];
    const result = (await base.include(docs, {
      model: 'Post',
      op: 'count',
      path: 'postCount',
      localField: 'ownerId',
      foreignField: 'ownerId',
      args: { limit: 1 },
    })) as Array<Record<string, unknown>>;

    expect(publicService.countByFieldValues).toHaveBeenCalledOnce();
    expect(publicService.countByFieldValues).toHaveBeenCalledWith('ownerId', ['u1', 'u2'], {}, 'count');
    expect(result).toEqual([
      { ownerId: 'u1', postCount: 2 },
      { ownerId: 'u2', postCount: 1 },
    ]);
  });

  it('counts each target row once for source and target arrays', async () => {
    const counts = new Map([
      ['u1', new Set(['p1', 'p2'])],
      ['u2', new Set(['p2', 'p3'])],
    ]);
    const publicService = {
      countByFieldValues: vi.fn().mockResolvedValue({
        success: true,
        kind: 'single',
        data: counts,
      }),
    };
    const req = {
      macl: {
        isAllowed: vi.fn().mockResolvedValue(true),
        getPublicService: vi.fn().mockReturnValue(publicService),
      },
    } as ModelRequest;
    const base = new TestBase(req, 'User');

    const docs = [{ ownerIds: ['u1', 'u2'] }, { ownerIds: ['u2'] }];
    const result = (await base.include(docs, {
      model: 'Post',
      op: 'count',
      path: 'postCount',
      localField: 'ownerIds',
      foreignField: 'ownerIds',
    })) as Array<Record<string, unknown>>;

    expect(result).toEqual([
      { ownerIds: ['u1', 'u2'], postCount: 3 },
      { ownerIds: ['u2'], postCount: 2 },
    ]);
  });

  it('indexes include list matches instead of rescanning target rows per source row', async () => {
    let targetForeignReads = 0;
    const targetRows = Array.from({ length: 20 }, (_, i) => {
      const row: Record<string, unknown> = { title: `post-${i}` };
      Object.defineProperty(row, 'ownerId', {
        enumerable: true,
        get() {
          targetForeignReads += 1;
          return `u${i % 4}`;
        },
      });
      return row;
    });
    const publicService = {
      genFilter: vi.fn().mockImplementation(async (_access: string, filter: unknown) => filter),
      find: vi.fn().mockResolvedValue({ success: true, data: targetRows }),
    };
    const req = {
      macl: {
        isAllowed: vi.fn().mockResolvedValue(true),
        getPublicService: vi.fn().mockReturnValue(publicService),
      },
    } as ModelRequest;
    const base = new TestBase(req, 'User');

    const docs = Array.from({ length: 12 }, (_, i) => ({ ownerId: `u${i % 4}` }));
    const result = (await base.include(docs, {
      model: 'Post',
      op: 'list',
      path: 'posts',
      localField: 'ownerId',
      foreignField: 'ownerId',
    })) as Array<Record<string, unknown>>;

    expect(targetForeignReads).toBe(targetRows.length);
    expect(result[0].posts).toHaveLength(5);
  });

  it('preserves list matching for multiple source keys and array-valued foreign fields', async () => {
    const targetRows = [
      { ownerIds: ['u1'], title: 'one' },
      { ownerIds: ['u1', 'u2'], title: 'both' },
      { ownerIds: ['u3'], title: 'three' },
    ];
    const publicService = {
      genFilter: vi.fn().mockImplementation(async (_access: string, filter: unknown) => filter),
      find: vi.fn().mockResolvedValue({ success: true, data: targetRows }),
    };
    const req = {
      macl: {
        isAllowed: vi.fn().mockResolvedValue(true),
        getPublicService: vi.fn().mockReturnValue(publicService),
      },
    } as ModelRequest;
    const base = new TestBase(req, 'User');

    const docs = [{ ownerIds: ['u1', 'u2'] }, { ownerIds: ['u3'] }];
    const result = (await base.include(docs, {
      model: 'Post',
      op: 'list',
      path: 'posts',
      localField: 'ownerIds',
      foreignField: 'ownerIds',
    })) as Array<Record<string, unknown>>;

    expect(result).toEqual([
      { ownerIds: ['u1', 'u2'], posts: [targetRows[0], targetRows[1]] },
      { ownerIds: ['u3'], posts: [targetRows[2]] },
    ]);
  });

  it('bounds bulk parsing subquery scheduling across items and nested arrays', async () => {
    setGlobalOptions({ requestComplexity: { maxBulkConcurrency: 3 } });
    let active = 0;
    let peak = 0;
    const calls: number[] = [];
    const targetService = {
      _list: vi.fn(async (filter: { order: number }) => {
        active += 1;
        peak = Math.max(peak, active);
        calls.push(filter.order);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return { success: true, kind: 'list', data: [`owner-${filter.order}`] };
      }),
    };
    const req = {
      macl: {
        isAllowed: vi.fn().mockResolvedValue(true),
        getPublicService: vi.fn().mockReturnValue(targetService),
      },
    } as unknown as ModelRequest;
    const base = new TestBase(req, 'User');
    const scheduler = new RequestConcurrencyScheduler(3);
    const input = Array.from({ length: 8 }, (_, order) => ({
      order,
      groups: [{ ownerId: { $$sq: { model: 'Post', op: 'list', filter: { order } } } }],
    }));

    const parsed = await scheduler.map(input, (item) => base.parse(item, scheduler, true));

    expect(peak).toBeLessThanOrEqual(3);
    expect(calls).toEqual(input.map((item) => item.order));
    expect(parsed.map((item) => item.groups[0].ownerId)).toEqual(input.map((item) => [`owner-${item.order}`]));
  });

  it('returns stable indexed bulk parse errors before validation or persistence', async () => {
    setGlobalOptions({ requestComplexity: { maxBulkConcurrency: 3 } });
    const modelName = `AclServiceInternal${++modelCounter}`;
    mongoose.model(modelName, new mongoose.Schema({ ownerId: String }));
    const req = {
      macl: {
        isAllowed: vi.fn(async () => false),
        getPublicService: vi.fn(),
        genAllowedFields: vi.fn(),
        validate: vi.fn(),
        prepare: vi.fn(),
      },
    } as unknown as ModelRequest;
    const service = new Service(req, modelName);
    const createSpy = vi.spyOn(
      (service as never as { model: { create: (items: unknown[]) => Promise<unknown[]> } }).model,
      'create',
    );

    const result = await service.create([
      { ownerId: { $$sq: { model: 'Post', op: 'list', filter: { order: 0 } } } },
      { ownerId: { $$sq: { model: 'Post', op: 'list', filter: { order: 1 } } } },
    ]);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors).toEqual([
        { detail: 'Unauthorized', pointer: '#/0' },
        { detail: 'Unauthorized', pointer: '#/1' },
      ]);
    }
    expect(req.macl.validate).not.toHaveBeenCalled();
    expect(req.macl.prepare).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
  });
});
