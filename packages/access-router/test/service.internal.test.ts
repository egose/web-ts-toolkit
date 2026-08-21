import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ModelRequest } from '../src/interfaces';
import { Base } from '../src/services/base';
import { Service } from '../src/services/service';

let modelCounter = 0;

class TestBase extends Base {
  include(docs: unknown, include: unknown) {
    return this.includeDocs(docs, include as never);
  }
}

afterEach(() => {
  vi.restoreAllMocks();
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
});
