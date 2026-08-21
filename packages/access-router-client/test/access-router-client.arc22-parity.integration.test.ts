import { describe, expect, it } from 'vitest';

import { setupIntegrationSuite, type User } from './support/integration-suite';
import { createAdapter, Model } from '../src';

const suite = setupIntegrationSuite();
const { services, seedState } = suite;

/**
 * ARC-22 re-test the load-bearing direct-vs-grouped parity and subdocument
 * isolation invariants the audited suite establishes only partially.
 *
 * Direct vs grouped dimensions:
 *   - error result shape parity (status, message, raw) for the same failing op,
 *   - `totalCount` parity for `list(..., { includeCount: true })`,
 *   - `count` and `countAdvanced` numeric parity,
 *   - `list` item array / first-item parity,
 *   - `onFailure` callback parity,
 *   - `Model.save()` parity on a grouped-derived wrapper,
 *   - cache bypass / invalidation parity for grouped mutations.
 *
 * Subdocument isolation:
 *   - subdocument `.save === undefined` for every read/list helper output
 *     (structural surface + adversarial runtime probe),
 *   - a subdocument data object passed through the parent service does not
 *     persist at the parent route.
 */
describe('ARC-22 direct vs grouped parity — errors', () => {
  it('produces the same status / message / raw shape for a failing direct and grouped read', async () => {
    const headers = { headers: { user: 'admin' } };
    const bogusId = '000000000000000000000aaa';

    const direct = await services.userService.read(bogusId, undefined, headers);
    const grouped = await suite.adapter.group(services.userService.read(bogusId, undefined, headers));

    expect(grouped).toHaveLength(1);
    expect(direct.success).toBe(false);
    expect(grouped[0].success).toBe(false);
    expect(direct.status).toBe(grouped[0].status);
    expect(direct.status).toBeGreaterThanOrEqual(400);
    expect(grouped[0].status).toBeGreaterThanOrEqual(400);
    expect(direct.data).toBeNull();
    expect(grouped[0].data).toBeNull();
    expect(typeof direct.message).toBe('string');
    expect(typeof grouped[0].message).toBe('string');
    expect(direct.message).toBe(grouped[0].message);

    // Both transports retain their structured service-level error payload.
    expect(direct.raw).toEqual(expect.any(Object));
    expect(grouped[0].raw).toEqual(expect.any(Object));
    expect(grouped[0].raw).toMatchObject({ success: false, code: expect.any(String) });
    expect(direct).not.toHaveProperty('count');
    expect(direct).not.toHaveProperty('totalCount');
    expect(grouped[0]).not.toHaveProperty('count');
    expect(grouped[0]).not.toHaveProperty('totalCount');
  });
});

describe('ARC-22 direct vs grouped parity — counts', () => {
  it('list() initializes totalCount to zero in direct and grouped no-count results', async () => {
    const headers = { headers: { user: 'admin' } };

    const direct = await services.userService.list(undefined, { includeCount: false }, headers);
    const grouped = await suite.adapter.group(services.userService.list(undefined, { includeCount: false }, headers));

    expect(direct.success).toBe(true);
    expect(grouped[0].success).toBe(true);
    expect(direct.totalCount).toBe(0);
    expect(grouped[0].totalCount).toBe(0);
  });

  it('list(..., { includeCount: true }) returns the same totalCount for direct and grouped calls', async () => {
    const headers = { headers: { user: 'admin' } };

    const direct = await services.userService.list(undefined, { includeCount: true }, headers);
    const grouped = await suite.adapter.group(services.userService.list(undefined, { includeCount: true }, headers));

    expect(direct.success).toBe(true);
    expect(grouped[0].success).toBe(true);

    expect(direct.totalCount).toBeDefined();
    expect(grouped[0].totalCount).toBeDefined();
    expect(direct.totalCount).toBe(grouped[0].totalCount);
  });

  it('count() returns the same numeric value for direct and grouped calls', async () => {
    const headers = { headers: { user: 'admin' } };

    const direct = await services.userService.count(headers);
    const grouped = await suite.adapter.group(services.userService.count(headers));

    expect(direct.success).toBe(true);
    expect(grouped[0].success).toBe(true);
    expect(suite.protocolRequestHeaders.at(-2)?.user).toBe('admin');
    expect(suite.protocolRequestHeaders.at(-1)?.user).toBe('admin');
    expect(typeof direct.data).toBe('number');
    expect(typeof grouped[0].data).toBe('number');
    expect(direct.data).toBe(grouped[0].data);
    expect(direct).not.toHaveProperty('count');
    expect(direct).not.toHaveProperty('totalCount');
    expect(grouped[0]).not.toHaveProperty('count');
    expect(grouped[0]).not.toHaveProperty('totalCount');
  });

  it('list() returns the same item array length and matching first-item identities for direct and grouped calls', async () => {
    const headers = { headers: { user: 'admin' } };

    const direct = await services.userService.list(undefined, undefined, headers);
    const grouped = await suite.adapter.group(services.userService.list(undefined, undefined, headers));

    expect(direct.success).toBe(true);
    expect(grouped[0].success).toBe(true);
    expect(Array.isArray(direct.data)).toBe(true);
    expect(Array.isArray(grouped[0].data)).toBe(true);
    expect(direct.data).toHaveLength(grouped[0].data.length);
    if (direct.data.length > 0 && grouped[0].data.length > 0) {
      // Both wrap as Model<User>; assert each is a Model and the first item
      // shares the same `_id`.
      expect(direct.data[0]).toBeInstanceOf(Model);
      expect(grouped[0].data[0]).toBeInstanceOf(Model);
      expect(direct.data[0]._id).toBe(grouped[0].data[0]._id);
    }
  });
});

describe('ARC-22 direct vs grouped parity — callbacks', () => {
  it('onFailure fires once for the failing entry of a grouped batch (matching the direct call behavior)', async () => {
    const bogusId = '0000000000000000000000bb';
    const headers = { headers: { user: 'admin' } };

    let directFailureCount = 0;
    let groupedFailureCount = 0;

    const directAdapter = createAdapter(
      { baseURL: suite.adapter.axios.defaults.baseURL },
      {
        onFailure: () => {
          directFailureCount += 1;
        },
      },
    );
    const directService = directAdapter.createModelService<User>({
      modelName: 'AdapterJsIntegrationUser',
      basePath: 'users',
    });
    const directRes = await directService.read(bogusId, undefined, headers);
    expect(directRes.success).toBe(false);
    expect(directFailureCount).toBe(1);

    const groupedAdapter = createAdapter(
      { baseURL: suite.adapter.axios.defaults.baseURL },
      {
        onFailure: () => {
          groupedFailureCount += 1;
        },
      },
    );
    const groupedService = groupedAdapter.createModelService<User>({
      modelName: 'AdapterJsIntegrationUser',
      basePath: 'users',
    });
    const groupedRes = await groupedAdapter.group(groupedService.read(bogusId, undefined, headers));
    expect(groupedRes[0].success).toBe(false);
    expect(groupedFailureCount).toBe(1);
  });
});

describe('ARC-22 direct vs grouped parity — Model.save', () => {
  it('a Model returned from a grouped read captures the persistence identity and persists via PATCH (not POST)', async () => {
    const headers = { headers: { user: 'admin' } };

    // Create a fresh row to mutate.
    const created = await services.userService.create(
      { name: 'arc22-grouped-save', role: 'editor', public: true },
      undefined,
      headers,
    );
    expect(created.success).toBe(true);
    const userId = String(created.data._id);

    // Grouped read returns a Model wrapper. The wrapper must capture the
    // persistence identity so a subsequent save() PATCHes rather than POSTs.
    const grouped = await suite.adapter.group(services.userService.read(userId, undefined, headers));
    expect(grouped[0].success).toBe(true);
    expect(grouped[0].data).toBeInstanceOf(Model);

    const wrappedModel = grouped[0].data as Model<User, User>;
    wrappedModel.set('role', 'maintainer');
    expect(wrappedModel.isDirty('role')).toBe(true);

    const saved = await wrappedModel.save(headers);
    expect(saved.success).toBe(true);
    expect(suite.protocolRequestHeaders.at(-1)?.user).toBe('admin');
    // No second create happened; the server PATCHed the row.
    const reloaded = await services.userService.read(userId, undefined, headers);
    expect(reloaded.success).toBe(true);
    expect(reloaded.data.role).toBe('maintainer');

    await services.userService.delete(userId, { headers });
  });
});

describe('ARC-22 direct vs grouped parity — cache policy', () => {
  const countRequests = (path: string) => suite.protocolRequests.filter((request) => request.path === path).length;

  it('keeps a cached GET after an all-read group on the same cached adapter', async () => {
    const cachedAdapter = suite.createCachedAdapter((config) => {
      return (config.headers?.['user'] as string) ?? undefined;
    });
    const cachedService = cachedAdapter.createModelService<User>({
      modelName: 'AdapterJsIntegrationUser',
      basePath: 'users',
    });
    const headers = { headers: { user: 'admin' } };
    const userId = String(seedState.admin._id);
    const userPath = `/api/users/${userId}`;

    await cachedService.read(userId, undefined, headers);
    await cachedService.read(userId, undefined, headers);
    expect(countRequests(userPath)).toBe(1);

    const grouped = await cachedAdapter.group(cachedService.read(userId, undefined, headers));
    expect(grouped[0].success).toBe(true);
    expect(countRequests('/api/root')).toBe(1);

    await cachedService.read(userId, undefined, headers);
    expect(countRequests(userPath)).toBe(1);
  });

  it('a successful grouped mutation invalidates the cached reads on the same cached adapter; a failed grouped mutation does not', async () => {
    const cachedAdapter = suite.createCachedAdapter((config) => {
      // Partition on the `user` header so credentialed admin reads cache.
      return (config.headers?.['user'] as string) ?? undefined;
    });
    const cachedService = cachedAdapter.createModelService<User>({
      modelName: 'AdapterJsIntegrationUser',
      basePath: 'users',
    });
    const headers = { headers: { user: 'admin' } };

    const created = await services.userService.create(
      { name: 'arc22-grouped-cache', role: 'editor', public: true },
      undefined,
      headers,
    );
    expect(created.success).toBe(true);
    const userId = String(created.data._id);
    const userPath = `/api/users/${userId}`;

    // Two direct reads; second coalesces into the cached entry under the
    // `admin` partition.
    const read1 = await cachedService.read(userId, undefined, headers);
    const read2 = await cachedService.read(userId, undefined, headers);
    expect(read1.success).toBe(true);
    expect(read2.success).toBe(true);
    expect(countRequests(userPath)).toBe(1);

    // Grouped UPDATE through the cached adapter triggers a mutation. The
    // store.clear() on a 2xx mutation bypasses the previously cached entry.
    const updated = await cachedAdapter.group(cachedService.update(userId, { role: 'maintainer' }, undefined, headers));
    expect(updated[0].success).toBe(true);

    // After a successful grouped mutation, the next read through the same
    // cached adapter must bust (the entire store is cleared).
    const read3 = await cachedService.read(userId, undefined, headers);
    expect(read3.success).toBe(true);
    expect(read3.data.role).toBe('maintainer');
    expect(countRequests(userPath)).toBe(2);

    // A failed grouped mutation must NOT invalidate the fresh entry just
    // cached by read3.
    const bogusUpdate = await cachedAdapter.group(
      cachedService.update('000000000000000000000be0', { role: 'ghost' }, undefined, headers),
    );
    expect(bogusUpdate[0].success).toBe(false);

    const read4 = await cachedService.read(userId, undefined, headers);
    expect(read4.success).toBe(true);
    // Still cached from read3 (failed grouped mutation must not invalidate).
    expect(read4.data.role).toBe('maintainer');
    expect(countRequests(userPath)).toBe(2);

    await services.userService.delete(userId, { headers });
  });
});

describe('ARC-22 subdocument isolation — runtime probes', () => {
  it('gives failed subdocument list-like operations count: 0 and no totalCount in both execution modes', async () => {
    const parentId = '000000000000000000000f11';
    const directSubService = services.userService.id(parentId).subs('statusHistory');
    const headers = { headers: { user: 'admin', 'x-axios-cache': 'false' } };
    const direct = await Promise.all([
      directSubService.list(headers),
      directSubService.create({ label: 'missing', flag: 'red' }, headers),
      directSubService.bulkUpdate([{ _id: '000000000000000000000f12', flag: 'red' }], headers),
    ]);
    const groupedSubService = services.userService.id(parentId).subs('statusHistory');
    const grouped = await suite.adapter.group(
      groupedSubService.list(headers),
      groupedSubService.create({ label: 'missing', flag: 'red' }, headers),
      groupedSubService.bulkUpdate([{ _id: '000000000000000000000f12', flag: 'red' }], headers),
    );

    for (const result of [...direct, ...grouped]) {
      expect(result.success).toBe(false);
      expect(result).toHaveProperty('count', 0);
      expect(result).not.toHaveProperty('totalCount');
    }
  });

  it('every public subdocument op response shape has `save === undefined` (no callable save path)', async () => {
    const parentId = String(seedState.admin._id);
    const subService = services.userService.id(parentId).subs('statusHistory');

    // Pre-seed one new subdoc so read/list have content beyond the seeded
    // `statusHistory` entries. `create` returns the FULL post-create array.
    const seeded = await subService.create({ label: 'initial', flag: 'green' }, { headers: { user: 'admin' } });
    expect(seeded.success).toBe(true);
    expect(Array.isArray(seeded.data)).toBe(true);
    const seededSub = seeded.raw[seeded.raw.length - 1];
    const subId = String(seededSub._id);

    // list
    const listed = await subService.list({ headers: { user: 'admin' } });
    expect(listed.success).toBe(true);
    expect(Array.isArray(listed.data)).toBe(true);
    if (listed.data.length > 0) {
      expect((listed.data[0] as { save?: unknown }).save).toBeUndefined();
    }

    // listAdvanced
    const listedAdv = await subService.listAdvanced(
      { flag: 'green' },
      { select: ['label'] },
      { headers: { user: 'admin' } },
    );
    expect(listedAdv.success).toBe(true);
    if (listedAdv.data.length > 0) {
      expect((listedAdv.data[0] as { save?: unknown }).save).toBeUndefined();
    }

    // read
    const read = await subService.read(subId, { headers: { user: 'admin' } });
    expect(read.success).toBe(true);
    expect((read.data as { save?: unknown }).save).toBeUndefined();

    // readAdvanced
    const readAdv = await subService.readAdvanced(subId, { select: ['label'] }, { headers: { user: 'admin' } });
    expect(readAdv.success).toBe(true);
    expect((readAdv.data as { save?: unknown }).save).toBeUndefined();

    // update — the response payload has no save either
    const updated = await subService.update(subId, { flag: 'yellow' }, { headers: { user: 'admin' } });
    expect(updated.success).toBe(true);
    expect((updated.data as { save?: unknown }).save).toBeUndefined();

    // bulkUpdate
    const bulkUpdated = await subService.bulkUpdate([{ _id: subId, flag: 'silver' }], { headers: { user: 'admin' } });
    expect(bulkUpdated.success).toBe(true);
    if (bulkUpdated.data.length > 0) {
      expect((bulkUpdated.data[0] as { save?: unknown }).save).toBeUndefined();
    }

    // Every grouped subdocument path returns the same plain-data shape as
    // direct execution and never attaches the parent ModelService.
    const [groupedList, groupedListAdvanced, groupedRead, groupedReadAdvanced] = await suite.adapter.group(
      subService.list({ headers: { user: 'admin' } }),
      subService.listAdvanced({ flag: 'silver' }, undefined, { headers: { user: 'admin' } }),
      subService.read(subId, { headers: { user: 'admin' } }),
      subService.readAdvanced(subId, { select: ['label'] }, { headers: { user: 'admin' } }),
    );
    expect(groupedList.success).toBe(true);
    expect(groupedList.raw).toEqual(groupedList.data);
    expect(groupedList.count).toBe(groupedList.data.length);
    expect((groupedList.data[0] as { save?: unknown }).save).toBeUndefined();
    expect(groupedListAdvanced.success).toBe(true);
    expect(groupedListAdvanced.raw).toEqual(groupedListAdvanced.data);
    expect((groupedListAdvanced.data[0] as { save?: unknown }).save).toBeUndefined();
    expect(groupedRead.success).toBe(true);
    expect(groupedRead.raw).toEqual(groupedRead.data);
    expect((groupedRead.data as { save?: unknown }).save).toBeUndefined();
    expect(groupedReadAdvanced.success).toBe(true);
    expect(groupedReadAdvanced.raw).toEqual(groupedReadAdvanced.data);
    expect((groupedReadAdvanced.data as { save?: unknown }).save).toBeUndefined();

    const [groupedCreated] = await suite.adapter.group(
      subService.create({ label: 'grouped', flag: 'violet' }, { headers: { user: 'admin' } }),
    );
    expect(groupedCreated.success).toBe(true);
    expect(Array.isArray(groupedCreated.data)).toBe(true);
    expect(groupedCreated.raw).toEqual(groupedCreated.data);
    expect(groupedCreated.count).toBe(groupedCreated.data.length);
    expect(groupedCreated.data.every((item) => (item as { save?: unknown }).save === undefined)).toBe(true);
    const groupedSub = groupedCreated.data.find((item) => item.label === 'grouped');
    expect(groupedSub).toBeDefined();
    const groupedSubId = String(groupedSub?._id);

    const [groupedUpdated, groupedBulkUpdated] = await suite.adapter.group(
      subService.update(groupedSubId, { flag: 'indigo' }, { headers: { user: 'admin' } }),
      subService.bulkUpdate([{ _id: subId, flag: 'bronze' }], { headers: { user: 'admin' } }),
    );
    expect(groupedUpdated.success).toBe(true);
    expect(groupedUpdated.raw).toEqual(groupedUpdated.data);
    expect((groupedUpdated.data as { save?: unknown }).save).toBeUndefined();
    expect(groupedBulkUpdated.success).toBe(true);
    expect(Array.isArray(groupedBulkUpdated.data)).toBe(true);
    expect(groupedBulkUpdated.raw).toEqual(groupedBulkUpdated.data);
    expect(groupedBulkUpdated.count).toBe(groupedBulkUpdated.data.length);
    expect(groupedBulkUpdated.data.every((item) => (item as { save?: unknown }).save === undefined)).toBe(true);

    // Cleanup through the parent-scoped helper (the only sanctioned path).
    const deleted = await subService.delete(subId, { headers: { user: 'admin' } });
    expect(deleted.success).toBe(true);
    const groupedDeleted = await subService.delete(groupedSubId, { headers: { user: 'admin' } });
    expect(groupedDeleted.success).toBe(true);
  });

  it('a subdocument data object cannot be persisted through the parent Model.save route (the parent service rejects subdoc ids)', async () => {
    const headers = { headers: { user: 'admin' } };
    const parentId = String(seedState.admin._id);
    const subService = services.userService.id(parentId).subs('statusHistory');

    // Create a fresh subdoc and capture its `_id`. The array shape returns
    // the full post-create subdoc list; the new row is the LAST entry.
    const seeded = await subService.create({ label: 'isolated', flag: 'green' }, { headers: { user: 'admin' } });
    expect(seeded.success).toBe(true);
    const seededSub = seeded.raw[seeded.raw.length - 1];
    const subId = String(seededSub._id);

    // Adversarially probe: passing the subdoc `_id` to the parent
    // `userService.update(subId, { ... })` would target the parent route
    // (`/api/users/:id`) with subId as the parent id, which Mongoose /
    // the access-router server rejects as CastError / 404. This pins the
    // contract: a subdoc data object has no path to silently persist
    // through the parent route via the client's service wrappers.
    const parentUpdateAttempt = await services.userService.update(
      subId,
      { name: 'attempted-through-parent' } as Partial<User>,
      undefined,
      headers,
    );
    expect(parentUpdateAttempt.success).toBe(false);
    expect(parentUpdateAttempt.status).toBeGreaterThanOrEqual(400);

    // Cleanup the subdoc through the parent-scoped helper — proving the
    // parent-scoped helper is the only sanctioned persistence path.
    const deleted = await subService.delete(subId, { headers: { user: 'admin' } });
    expect(deleted.success).toBe(true);

    // The parent User's name is unchanged: the attempted parent-route
    // mutation never persisted.
    const reloaded = await services.userService.read(parentId, undefined, headers);
    expect(reloaded.success).toBe(true);
    expect(reloaded.data.name).toBe(seedState.admin.name);
  });
});
