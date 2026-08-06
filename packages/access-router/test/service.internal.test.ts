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

  it('batches include count lookups into a single query', async () => {
    const publicService = {
      genFilter: vi.fn().mockImplementation(async (_access: string, filter: unknown) => filter),
      find: vi.fn().mockResolvedValue({
        success: true,
        data: [{ ownerId: 'u1' }, { ownerId: 'u1' }, { ownerId: 'u2' }],
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
    })) as Array<Record<string, unknown>>;

    expect(publicService.find).toHaveBeenCalledOnce();
    expect(publicService.find).toHaveBeenCalledWith(
      { ownerId: { $in: ['u1', 'u2'] } },
      {
        select: ['ownerId'],
        overrides: {
          filter: { ownerId: { $in: ['u1', 'u2'] } },
        },
      },
      {
        lean: true,
        includePermissions: false,
        includeCount: false,
      },
    );
    expect(result).toEqual([
      { ownerId: 'u1', postCount: 2 },
      { ownerId: 'u2', postCount: 1 },
    ]);
  });
});
