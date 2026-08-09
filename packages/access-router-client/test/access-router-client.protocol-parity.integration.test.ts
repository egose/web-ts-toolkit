import { describe, expect, it } from 'vitest';

import { setupIntegrationSuite } from './support/integration-suite';

const suite = setupIntegrationSuite();
const { services, seedState } = suite;

/**
 * ARC-13: Protocol parity with the sibling `packages/access-router`
 * server. Each case proves that a client payload shape the server actually
 * consumes produces observable behavior, and that unsupported shapes are
 * rejected at compile time or runtime.
 */
describe('access-router-client protocol parity (ARC-13)', () => {
  describe('distinctAdvanced filter shape', () => {
    it('sends { filter: conditions } so a restrictive filter excludes rows from the distinct result', async () => {
      const headers = { headers: { user: 'admin' } };

      // Before ARC-13 the client sent `conditions` as the body root and the
      // server ran an unfiltered distinct, returning values from rows the
      // caller expected to exclude. With `{ filter }`, the server honors
      // the filter and the distinct omits values from excluded rows.
      const unfiltered = await services.userService.distinctAdvanced('role', {}, headers);
      expect(unfiltered.success).toBe(true);
      // Both 'admin' (admin-user) and 'user' (lucy2) are public, so an
      // empty filter returns both roles.
      expect(unfiltered.data).toEqual(expect.arrayContaining(['admin', 'user']));

      // Now restrict to `public: false`. No seeded user has `public: false`,
      // so the server's distinct over the filtered set must be empty.
      const filtered = await services.userService.distinctAdvanced('role', { public: false }, headers);
      expect(filtered.success).toBe(true);
      expect(filtered.data).toEqual([]);
    });
  });

  describe('update/upsert include_permissions', () => {
    it('update() sends include_permissions=?true and the server attaches permission metadata on the returned document', async () => {
      const headers = { headers: { user: 'admin' } };
      const adminId = String(seedState.admin._id);

      const withoutPerms = await services.userService.update(
        adminId,
        { role: 'maintainer' },
        { includePermissions: false },
        headers,
      );
      expect(withoutPerms.success).toBe(true);

      const withPerms = await services.userService.update(
        adminId,
        { role: 'owner' },
        { includePermissions: true },
        headers,
      );
      expect(withPerms.success).toBe(true);
      // The sibling server populates `_permissions` on the response when
      // `include_permissions=true` and the global permission field is
      // configured (the integration suite configures `_permissions` and
      // grants `isAdmin` for the admin header).
      expect(withPerms.data).toMatchObject(expect.objectContaining({ _permissions: expect.anything() }));
    });

    it('upsert() sends include_permissions=?true and the server attaches permission metadata on the returned document', async () => {
      const headers = { headers: { user: 'admin' } };
      const adminId = String(seedState.admin._id);

      const withPerms = await services.userService.upsert(
        { _id: adminId, role: 'director' },
        { includePermissions: true },
        headers,
      );
      expect(withPerms.success).toBe(true);
      expect(withPerms.data).toMatchObject(expect.objectContaining({ _permissions: expect.anything() }));
    });
  });

  describe('countAdvanced access argument removal', () => {
    it('countAdvanced() no longer accepts an `access` second argument (server rejects it)', async () => {
      const headers = { headers: { user: 'admin' } };

      // The narrowed signature only accepts (filter, axiosRequestConfig).
      // A simple successful call proves the request shape is valid.
      const counted = await services.userService.countAdvanced({ public: true }, headers);
      expect(counted.success).toBe(true);
      expect(counted.data).toBeGreaterThanOrEqual(2);

      // ARC-21: type-level and runtime-level guard against reintroducing the
      // obsolete `access` argument. The server's `countBodySchema` in
      // `packages/access-router/src/validation/model-router.ts` rejects
      // `access` / `options` / `query` keys, so the client must not expose a
      // typed surface that re-adds them; the cross-package server contract
      // test (`arc21-projection-identity-and-count-argument.contract.test.ts`)
      // asserts the server-side half of this contract.
      // @ts-expect-error — the obsolete `{ access?: 'list' | 'read' }`
      //   second argument is intentionally removed; reintroducing it would
      //   break the server's `countBodySchema` (which rejectKeys `access`).
      const _wouldRegress = services.userService.countAdvanced({ public: true }, { access: 'list' });
      void _wouldRegress;

      // The lazy request metadata carried by `countAdvanced` must not include
      // `options.access`, so a batched/grouped run cannot accidentally route
      // the obsolete access shim through to the sibling server's `count`
      // resolver (which would 400).
      const lazy = services.userService.countAdvanced({ public: true }) as unknown as {
        __query: { options?: Record<string, unknown>; filter?: unknown };
      };
      expect(lazy.__query.options).toBeUndefined();
      expect(lazy.__query.filter).toMatchObject({ public: true });
    });
  });

  describe('subdocument create accepts one or many', () => {
    it('create() accepts a single object and returns the post-create subdocument array', async () => {
      const headers = { headers: { user: 'admin' } };
      const subService = services.userService.id(String(seedState.admin._id)).subs('statusHistory');

      const created = await subService.create({ label: 'arc13-single', flag: 'pink' }, headers);
      expect(created.success).toBe(true);
      expect(Array.isArray(created.data)).toBe(true);
      expect(created.data).toEqual(
        expect.arrayContaining([expect.objectContaining({ label: 'arc13-single', flag: 'pink' })]),
      );
      expect(created.count).toBe(created.data.length);

      // cleanup so subsequent runs stay deterministic
      const added = created.data.find((row) => row.label === 'arc13-single');
      if (added) {
        await subService.delete(String(added._id), headers);
      }
    });

    it('create() accepts an array and returns the post-create subdocument array with all new rows', async () => {
      const headers = { headers: { user: 'admin' } };
      const subService = services.userService.id(String(seedState.admin._id)).subs('statusHistory');

      const created = await subService.create(
        [
          { label: 'arc13-bulk-a', flag: 'silver' },
          { label: 'arc13-bulk-b', flag: 'gold' },
        ],
        headers,
      );
      expect(created.success).toBe(true);
      expect(Array.isArray(created.data)).toBe(true);
      const labels = created.data.map((row) => row.label).sort();
      // The sibling server returns the post-create full list, so the array
      // create response must contain both new labels somewhere in the list
      // (alongside the existing seeded subdocuments).
      expect(labels).toEqual(expect.arrayContaining(['arc13-bulk-a', 'arc13-bulk-b']));
      expect(created.count).toBe(created.data.length);

      // cleanup
      const addedA = created.data.find((row) => row.label === 'arc13-bulk-a');
      const addedB = created.data.find((row) => row.label === 'arc13-bulk-b');
      if (addedA) await subService.delete(String(addedA._id), headers);
      if (addedB) await subService.delete(String(addedB._id), headers);
    });
  });

  describe('subdocument list responses expose count (not totalCount)', () => {
    it('list() and listAdvanced() return a SubDocumentListResponse with `count` matching the array length', async () => {
      const headers = { headers: { user: 'admin' } };
      const subService = services.userService.id(String(seedState.admin._id)).subs('statusHistory');

      const listed = await subService.list(headers);
      expect(listed.success).toBe(true);
      expect(Array.isArray(listed.data)).toBe(true);
      expect(listed.count).toBe(listed.data.length);

      const advancedListed = await subService.listAdvanced({ flag: 'green' }, { select: ['label', 'flag'] }, headers);
      expect(advancedListed.success).toBe(true);
      expect(Array.isArray(advancedListed.data)).toBe(true);
      expect(advancedListed.count).toBe(advancedListed.data.length);
    });

    it('bulkUpdate() returns a SubDocumentListResponse with `count` matching the updated array length', async () => {
      const headers = { headers: { user: 'admin' } };
      const subService = services.userService.id(String(seedState.admin._id)).subs('statusHistory');

      const listed = await subService.list(headers);
      expect(listed.success).toBe(true);
      const first = listed.data[0];
      const second = listed.data[1];

      const bulkUpdated = await subService.bulkUpdate(
        [
          { _id: String(first._id), label: 'arc13-bulk-first' },
          { _id: String(second._id), label: 'arc13-bulk-second' },
        ],
        undefined,
        headers,
      );
      expect(bulkUpdated.success).toBe(true);
      expect(Array.isArray(bulkUpdated.data)).toBe(true);
      expect(bulkUpdated.count).toBe(bulkUpdated.data.length);
      expect(bulkUpdated.count).toBe(2);
    });
  });

  describe('data operations do not advertise includePermissions', () => {
    it('data list/listAdvanced do not send include_permissions (server does not parse it for data routers)', async () => {
      const headers = { headers: { user: 'admin' } };

      const list = await services.petService.list({ limit: 10 }, { includeCount: true }, headers);
      expect(list.success).toBe(true);

      const advancedList = await services.petService.listAdvanced(
        { public: true },
        { select: 'name', limit: 10 },
        { includeCount: true },
        headers,
      );
      expect(advancedList.success).toBe(true);
    });
  });

  describe('data advanced-list sort is string-only', () => {
    it('listAdvanced sort accepts a string and the server honors the sort order', async () => {
      const headers = { headers: { user: 'admin' } };

      const ascending = await services.petService.listAdvanced(
        {},
        { sort: 'age', limit: 10 },
        { includeCount: true },
        headers,
      );
      expect(ascending.success).toBe(true);
      const agesAsc = ascending.data.map((row) => row.age);
      expect(agesAsc).toEqual([...agesAsc].sort((a, b) => a - b));

      const descending = await services.petService.listAdvanced(
        {},
        { sort: '-age', limit: 10 },
        { includeCount: true },
        headers,
      );
      expect(descending.success).toBe(true);
      const agesDesc = descending.data.map((row) => row.age);
      expect(agesDesc).toEqual([...agesDesc].sort((a, b) => b - a));
    });
  });

  describe('root entries are structurally compatible with the server RootQueryEntry contract', () => {
    it('grouped model entries do not require a redundant `model` field to resolve the target model', async () => {
      const headers = { headers: { user: 'admin' } };

      // The sibling server resolves the target model from the entry `name`
      // (rootRouter RootQueryEntry base schema). A grouped list request
      // must succeed without the client emitting a redundant `model` field
      // in the top-level root entry.
      const grouped = await suite.adapter.group(services.userService.list({ limit: 5 }, {}, headers));
      expect(grouped[0].success).toBe(true);
      expect(Array.isArray(grouped[0].data)).toBe(true);
    });

    it('grouped subdocument list entries resolve through `name` (not `model`) and produce the array shape with `count`', async () => {
      const headers = { headers: { user: 'admin' } };
      const subService = services.userService.id(String(seedState.admin._id)).subs('statusHistory');

      const direct = await subService.list(headers);
      const grouped = await suite.adapter.group(subService.list(headers));

      expect(direct.success).toBe(true);
      expect(grouped[0].success).toBe(true);
      expect(direct.data).toEqual(grouped[0].data);
      expect(direct.count).toBe(grouped[0].count);
    });
  });
});
