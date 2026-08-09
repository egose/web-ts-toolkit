import { describe, expect, expectTypeOf, it } from 'vitest';

import { ServiceError } from '../src';
import { setupIntegrationSuite, type User } from './support/integration-suite';

const suite = setupIntegrationSuite();
const { services, seedState } = suite;

describe('access-router-client model-service integration', () => {
  it('supports basic model CRUD helpers, distinctAdvanced(), and id().fetch()', async () => {
    const created = await services.userService.create(
      {
        name: 'basic-user',
        role: 'reviewer',
        public: true,
        orgs: [String(seedState.org1._id)],
        statusHistory: [{ label: 'created-basic', flag: 'silver' }],
      },
      undefined,
      { headers: { user: 'admin' } },
    );

    expect(created.success).toBe(true);
    expect(created.data.name).toBe('basic-user');

    const listed = await services.userService.list(
      { limit: 20 },
      { includeCount: true },
      { headers: { user: 'admin' } },
    );
    expect(listed.success).toBe(true);
    expect(listed.totalCount).toBeGreaterThanOrEqual(3);
    expect(listed.data.some((row) => row.name === 'basic-user')).toBe(true);

    const updated = await services.userService.update(String(created.data._id), { role: 'maintainer' }, undefined, {
      headers: { user: 'admin' },
    });
    expect(updated.success).toBe(true);
    expect(updated.data.role).toBe('maintainer');

    const fetched = await services.userService.id(String(created.data._id)).fetch(undefined, undefined, {
      headers: { user: 'admin' },
    });
    expect(fetched.success).toBe(true);
    expect(fetched.data.name).toBe('basic-user');

    const upserted = await services.userService.upsert({ _id: String(created.data._id), role: 'director' }, undefined, {
      headers: { user: 'admin' },
    });
    expect(upserted.success).toBe(true);
    expect(upserted.data.role).toBe('director');

    const distinct = await services.userService.distinctAdvanced(
      'role',
      { public: true },
      { headers: { user: 'admin' } },
    );
    expect(distinct.success).toBe(true);
    expect(distinct.data).toContain('director');

    const count = await services.userService.count({ headers: { user: 'admin' } });
    expect(count.success).toBe(true);
    expect(count.data).toBeGreaterThanOrEqual(3);
  });

  it('supports advanced model operations, nested requestSchemas.data validation, and model.save()', async () => {
    const created = await services.userService.createAdvanced(
      { name: 'lucy', role: 'user', public: true },
      { select: ['name', 'role', 'public'] },
      undefined,
      { headers: { user: 'admin' } },
    );

    expect(created.status).toBe(201);
    expect(created.data.name).toBe('lucy');

    const listed = await services.userService.listAdvanced(
      { public: true },
      { select: ['name'], limit: 10 },
      { includeCount: true },
      { headers: { user: 'admin' } },
    );

    expect(listed.success).toBe(true);
    expect(listed.totalCount).toBeGreaterThanOrEqual(3);

    const readById = await services.userService.readAdvanced(
      String(seedState.admin._id),
      { select: ['name', 'role'] },
      undefined,
      { headers: { user: 'admin' } },
    );
    expect(readById.data.name).toBe('admin-user');

    const readByFilter = await services.userService.readAdvancedFilter(
      { name: 'lucy2' },
      { select: ['name', 'role'] },
      undefined,
      { headers: { user: 'admin' } },
    );
    expect(readByFilter.data.name).toBe('lucy2');

    const updated = await services.userService.updateAdvanced(
      String(seedState.admin._id),
      { role: 'owner' },
      { select: ['name', 'role'] },
      undefined,
      { headers: { user: 'admin' } },
    );
    expect(updated.data.role).toBe('owner');

    updated.data.role = 'maintainer';
    const saved = await updated.data.save({ headers: { user: 'admin' } });
    expect(saved.success).toBe(true);
    expect(saved.data.role).toBe('maintainer');

    const upserted = await services.userService.upsertAdvanced(
      { _id: String(seedState.admin._id), role: 'director' },
      { select: ['name', 'role'] },
      undefined,
      { headers: { user: 'admin' } },
    );
    expect(upserted.data.role).toBe('director');

    const distinct = await services.userService.distinct('role', { headers: { user: 'admin' } });
    expect(distinct.data.sort()).toEqual(['director', 'user']);

    const counted = await services.userService.countAdvanced({ public: true }, undefined, {
      headers: { user: 'admin' },
    });
    expect(counted.data).toBeGreaterThanOrEqual(2);

    const invalidCreateError = await services.userServiceWithError
      .createAdvanced({ name: 'no', role: 'x', public: true }, undefined, undefined, {
        headers: { user: 'admin' },
      })
      .catch((error) => error);

    expect(invalidCreateError).toBeInstanceOf(ServiceError);
    expect(invalidCreateError.message).not.toBe('[object Object]');
    expect(invalidCreateError.message.length).toBeGreaterThan(0);
    expect(invalidCreateError.raw).toBeTruthy();
  });

  it('supports new(), delete(), and subdocument mutation routes', async () => {
    const draft = await services.userService.new({ headers: { user: 'admin' } });
    expect(draft.success).toBe(true);
    expect(draft.data._id).toBeUndefined();

    draft.data.assign({
      name: 'new-route-user',
      role: 'reviewer',
      public: true,
      statusHistory: [],
      orgs: [],
    });

    const savedDraft = await draft.data.save({ headers: { user: 'admin' } });
    expect(savedDraft.success).toBe(true);
    expect(savedDraft.data._id).toBeTruthy();

    const subService = services.userService.id(String(seedState.admin._id)).subs('statusHistory');
    const createdSub = await subService.create({ label: 'queued', flag: 'orange' }, { headers: { user: 'admin' } });
    expect(createdSub.success).toBe(true);
    expect(createdSub.raw).toHaveLength(3);

    // ARC-05: `create()` always returns the array shape (server returns the
    // full post-create subdocument list when count > 1). The `data` field is
    // a plain array of plain objects — NOT `Model` instances — so callers
    // cannot accidentally `save()` a subdocument through the parent route.
    expect(Array.isArray(createdSub.data)).toBe(true);
    expect(createdSub.data).toHaveLength(3);
    expect(createdSub.count).toBe(3);

    const createdSubDoc = createdSub.raw[2];
    expect(createdSubDoc).toMatchObject({ label: 'queued', flag: 'orange' });
    // ARC-05 regression: subdocument items are plain data, not save-capable
    // Models. No public property or method should be able to target the
    // parent route with a subdocument `_id`.
    expect((createdSubDoc as { save?: unknown }).save).toBeUndefined();
    expect((createdSub.data[2] as { save?: unknown }).save).toBeUndefined();

    const createdSubId = String(createdSubDoc._id);
    const updatedSub = await subService.update(createdSubId, { label: 'processed' }, { headers: { user: 'admin' } });
    expect(updatedSub.success).toBe(true);
    expect(updatedSub.raw).toMatchObject({ _id: createdSubId, label: 'processed', flag: 'orange' });
    // ARC-05: `update()` returns a plain subdocument object as `data`.
    expect((updatedSub.data as { save?: unknown }).save).toBeUndefined();
    expect((updatedSub.data as { _id?: string })._id).toBe(createdSubId);

    const deletedSub = await subService.delete(createdSubId, { headers: { user: 'admin' } });
    expect(deletedSub.success).toBe(true);

    const listedSubs = await subService.list({ headers: { user: 'admin' } });
    expect(listedSubs.raw).toHaveLength(2);
    expect(listedSubs.raw.some((item) => String(item._id) === createdSubId)).toBe(false);

    const deleted = await services.userService.delete(String(savedDraft.data._id), { headers: { user: 'admin' } });
    expect(deleted.success).toBe(true);

    const missing = await services.userService.read(String(savedDraft.data._id), undefined, {
      headers: { user: 'admin' },
    });
    expect(missing.success).toBe(false);
    expect(missing.status).toBe(404);
  });

  it('supports subdocument bulkUpdate()', async () => {
    const subService = services.userService.id(String(seedState.admin._id)).subs('statusHistory');
    const listed = await subService.list({ headers: { user: 'admin' } });
    expect(listed.success).toBe(true);
    expect(listed.raw).toHaveLength(2);

    const first = listed.raw[0];
    const second = listed.raw[1];

    const bulkUpdated = await subService.bulkUpdate(
      [
        { _id: String(first._id), label: 'bulk-first', flag: 'teal' },
        { _id: String(second._id), label: 'bulk-second', flag: 'purple' },
      ],
      undefined,
      { headers: { user: 'admin' } },
    );

    expect(bulkUpdated.success).toBe(true);
    expect(bulkUpdated.raw).toHaveLength(2);
    // ARC-05: bulkUpdate() data is the plain updated subdocument array,
    // no Model wrapping, and count mirrors the server's `count` field.
    expect(Array.isArray(bulkUpdated.data)).toBe(true);
    expect(bulkUpdated.data).toHaveLength(2);
    expect(bulkUpdated.count).toBe(2);
    expect((bulkUpdated.data[0] as { save?: unknown }).save).toBeUndefined();

    const reloaded = await subService.list({ headers: { user: 'admin' } });
    expect(reloaded.raw).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ _id: String(first._id), label: 'bulk-first', flag: 'teal' }),
        expect.objectContaining({ _id: String(second._id), label: 'bulk-second', flag: 'purple' }),
      ]),
    );
  });

  it('supports subqueries and subdocument read routes without an external backend', async () => {
    const orgResponse = await services.orgService.listAdvanced(
      {
        _id: services.userService.readAdvancedFilter(
          { name: 'lucy2' },
          undefined,
          { sq: { path: 'orgs', compact: true } },
          { headers: { user: 'admin' } },
        ),
      },
      { select: ['name'] },
      undefined,
      { headers: { user: 'admin' } },
    );

    expect(orgResponse.success).toBe(true);
    expect(orgResponse.data.map((row) => row.name).sort()).toEqual(['blue', 'red']);

    const subService = services.userService.id(String(seedState.admin._id)).subs('statusHistory');
    const listed = await subService.list({ headers: { user: 'admin' } });
    expect(listed.raw).toHaveLength(2);
    // ARC-05: list() data is a plain array, no Model wrapping.
    expect(Array.isArray(listed.data)).toBe(true);
    expect(listed.data).toHaveLength(2);
    expect(listed.count).toBe(2);
    expect((listed.data[0] as { save?: unknown }).save).toBeUndefined();

    const existingSubId = String(seedState.admin.statusHistory[0]._id);
    const read = await subService.read(existingSubId, { headers: { user: 'admin' } });
    expect(read.success).toBe(true);
    expect(read.raw).toMatchObject({ _id: existingSubId });
    // ARC-05: read() data is the plain subdocument object, no Model wrapping.
    expect((read.data as { save?: unknown }).save).toBeUndefined();
    expect((read.data as { _id?: string })._id).toBe(existingSubId);

    const advancedListed = await subService.listAdvanced(
      { flag: 'green' },
      { select: ['label', 'flag'] },
      { headers: { user: 'admin' } },
    );
    expect(advancedListed.success).toBe(true);
    expect(advancedListed.raw).toHaveLength(1);
    expect(String(advancedListed.raw[0]._id)).toBe(existingSubId);
    // ARC-05: listAdvanced() data is a plain array, no Model wrapping.
    expect(Array.isArray(advancedListed.data)).toBe(true);
    expect(advancedListed.count).toBe(1);
    expect((advancedListed.data[0] as { save?: unknown }).save).toBeUndefined();

    const advancedRead = await subService.readAdvanced(
      existingSubId,
      { select: ['label'], populate: [] },
      { headers: { user: 'admin' } },
    );
    expect(advancedRead.success).toBe(true);
    expect(String(advancedRead.raw._id)).toBe(existingSubId);
    // ARC-05: readAdvanced() data is the plain subdocument object, no Model wrapping.
    expect((advancedRead.data as { save?: unknown }).save).toBeUndefined();
  });

  it('infers selected field types for advanced selects', async () => {
    const typedUser = await services.userService.readAdvanced(
      String(seedState.admin._id),
      { select: ['name', 'role'] as const },
      undefined,
      { headers: { user: 'admin' } },
    );

    const typedProjectedUser = await services.userService.readAdvanced(
      String(seedState.admin._id),
      { select: { name: 1, role: 1 } as const },
      undefined,
      { headers: { user: 'admin' } },
    );

    const explicitTypedUser = await services.userService.readAdvanced<{ name: string }>(
      String(seedState.admin._id),
      { select: { name: 1, role: 1 } as const },
      undefined,
      { headers: { user: 'admin' } },
    );

    expectTypeOf(typedUser.raw).toMatchTypeOf<Pick<User, 'name' | 'role'>>();
    expectTypeOf(typedProjectedUser.raw).toMatchTypeOf<Pick<User, 'name' | 'role'>>();
    expectTypeOf(explicitTypedUser.raw).toEqualTypeOf<{ name: string }>();

    expect(typedUser.success).toBe(true);
    expect(typedProjectedUser.success).toBe(true);
    expect(explicitTypedUser.success).toBe(true);
  });

  it('repeated identical subdocument mutations reach the server each time when cacheTTL > 0', async () => {
    const cachedAdapter = suite.createCachedAdapter((config) => {
      const headers = config.headers as Record<string, unknown> | undefined;
      return typeof headers?.user === 'string' ? (headers.user as string) : 'anon';
    });
    const userSvc = cachedAdapter.createModelService<User>({
      modelName: 'AdapterJsIntegrationUser',
      basePath: 'users',
    });

    const subService = userSvc
      .id(String(seedState.admin._id))
      .subs<{ label: string; flag: string }>('statusHistory' as keyof User);

    const createdFirst = await subService.create({ label: 'first', flag: 'green' }, { headers: { user: 'admin' } });
    expect(createdFirst.success).toBe(true);
    expect(createdFirst.raw).toHaveLength(3);

    const createdSecond = await subService.create({ label: 'first', flag: 'green' }, { headers: { user: 'admin' } });
    expect(createdSecond.success).toBe(true);
    expect(createdSecond.raw).toHaveLength(4);
  });

  it('a cached subdocument list is invalidated after a subdocument create', async () => {
    const cachedAdapter = suite.createCachedAdapter((config) => {
      const headers = config.headers as Record<string, unknown> | undefined;
      return typeof headers?.user === 'string' ? (headers.user as string) : 'anon';
    });
    const userSvc = cachedAdapter.createModelService<User>({
      modelName: 'AdapterJsIntegrationUser',
      basePath: 'users',
    });
    const subService = userSvc
      .id(String(seedState.admin._id))
      .subs<{ label: string; flag: string }>('statusHistory' as keyof User);

    const listBefore = await subService.list({ headers: { user: 'admin' } });
    expect(listBefore.success).toBe(true);
    expect(listBefore.raw).toHaveLength(2);

    const listCached = await subService.list({ headers: { user: 'admin' } });
    expect(listCached.raw).toHaveLength(2);

    const created = await subService.create({ label: 'post-cache', flag: 'magenta' }, { headers: { user: 'admin' } });
    expect(created.success).toBe(true);
    expect(created.raw).toHaveLength(3);

    const listAfter = await subService.list({ headers: { user: 'admin' } });
    expect(listAfter.raw).toHaveLength(3);
  });
});
