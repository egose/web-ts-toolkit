import { describe, expect, it } from 'vitest';

import { MissingPersistenceIdentityError, Model } from '../src';
import { setupIntegrationSuite, type User } from './support/integration-suite';

const { services, seedState } = setupIntegrationSuite();

/**
 * ARC-21 (client side): Projection identity contracts. The accompanying
 * cross-package server contract test
 * (`packages/access-router/test/arc21-projection-identity-and-count-argument.contract.test.ts`)
 * proves the server's behavior for inclusion vs `_id`-excluding projections.
 * These tests prove the client `Model.save()` path uses a captured
 * persistence identity (decoupled from the projected `_data._id`) so an
 * `_id`-stripping read cannot silently create a duplicate, and throws
 * `MissingPersistenceIdentityError` when an `_id`-stripping filter read
 * (no captured identity) is mutated-then-saved.
 */
describe('access-router-client projection identity and count argument (ARC-21)', () => {
  describe('read -> save() with an _id-stripping projection', () => {
    it('read(id) returns a Model whose `_id` resolves from the projected response (default inclusion)', async () => {
      const headers = { headers: { user: 'admin' } };
      const read = await services.userService.read(String(seedState.admin._id), undefined, headers);
      expect(read.success).toBe(true);
      expect(read.data._id).toBe(String(seedState.admin._id));
      expect(read.data.isDirty()).toBe(false);
    });

    it('readAdvanced(id, { select: ["name", "-_id"] }) still save()s as an UPDATE because the wrapper captured the persistence identity', async () => {
      const headers = { headers: { user: 'admin' } };
      const readProjected = await services.userService.readAdvanced(
        String(seedState.admin._id),
        { select: ['name', '-_id'] },
        { includePermissions: false },
        headers,
      );
      expect(readProjected.success).toBe(true);

      // The projection strips `_id` from the projected data payload.
      expect(readProjected.data._id).toBeUndefined();
      expect(readProjected.data.name).toBe('admin-user');

      // Use the tracked `set()` entry point so dirty state is captured even
      // for the projected `name` field (direct property assignment on a
      // field absent from the initial projection is not tracked by the
      // proxy; this matches the documented contract in `model.ts` — use
      // `set`, `assign`, or `markModified` for tracked writes).
      readProjected.data.set('name', 'arc21-admin-projected');
      expect(readProjected.data.isDirty('name')).toBe(true);

      // save() must route to PATCH /users/<adminId>, NOT to POST /users.
      const saved = await readProjected.data.save(headers);
      expect(saved.success).toBe(true);

      // The original document is updated in place — no duplicate was
      // created. Reload the doc through a default read to confirm.
      const reloaded = await services.userService.read(String(seedState.admin._id), undefined, headers);
      expect(reloaded.success).toBe(true);
      expect(reloaded.data.name).toBe('arc21-admin-projected');

      // Cleanup: restore the seeded name so other tests stay deterministic.
      reloaded.data.set('name', 'admin-user');
      await reloaded.data.save(headers);
    });
  });

  describe('readAdvancedFilter -> save() with an _id-stripping projection (no captured identity)', () => {
    it('save() throws MissingPersistenceIdentityError rather than silently POSTing a new document', async () => {
      const headers = { headers: { user: 'admin' } };
      // Create a throwaway user so cleaning up duplicated state is not a
      // concern if the contract ever regresses and a silent dup leaks.
      const draft = await services.userService.create(
        {
          name: 'arc21-filter-cleanup',
          role: 'reviewer',
          public: true,
          orgs: [],
          statusHistory: [{ label: 'seed', flag: 'gray' }],
        },
        undefined,
        headers,
      );
      expect(draft.success).toBe(true);
      const cleanup = () => services.userService.delete(String(draft.data._id), headers);

      // readAdvancedFilter does NOT capture an identifier as a persistence
      // identity; combine it with a projection that strips `_id`.
      const projected = await services.userService.readAdvancedFilter(
        { name: 'arc21-filter-cleanup' },
        { select: ['name', '-_id'] },
        { includePermissions: false },
        headers,
      );
      expect(projected.success).toBe(true);
      expect(projected.data._id).toBeUndefined();

      // Mutating the wrapper and then saving must throw BEFORE issuing any
      // network request, because save() cannot tell create-vs-update apart
      // safely when there is no resolvable identity AND the wrapper came
      // from an existing-document read (the `_fromExisting` flag).
      projected.data.set('name', 'arc21-should-not-persist');
      await expect(projected.data.save(headers)).rejects.toBeInstanceOf(MissingPersistenceIdentityError);

      // No duplicate was created on the server. A count of users with this
      // name must still be 1 (the cleanup seed).
      const counted = await services.userService.countAdvanced({ name: 'arc21-filter-cleanup' }, headers);
      expect(counted.success).toBe(true);
      expect(counted.data).toBe(1);

      await cleanup();
    });
  });

  describe('a draft Model (constructed directly with new Model(...)) still creates (backward compat)', () => {
    it('save() on a fresh draft Model POSTs a new document (no persistenceId, _fromExisting=false)', async () => {
      const headers = { headers: { user: 'admin' } };
      const draft = new Model<User, Partial<User>>(
        {
          name: 'arc21-direct-draft',
          role: 'reviewer',
          public: true,
          orgs: [],
          statusHistory: [{ label: 'drafted', flag: 'purple' }],
        },
        services.userService,
      ) as Model<User, Partial<User>> & Partial<User>;

      expect(draft.isDirty()).toBe(true);
      expect(draft._id).toBeUndefined();

      // The historic drafting API surface continues to create new documents.
      const saved = await draft.save(headers);
      expect(saved.success).toBe(true);
      expect(saved.data._id).toBeTruthy();

      const cleanup = () => services.userService.delete(String(saved.data._id), headers);
      try {
        const created = await services.userService.read(String(saved.data._id), undefined, headers);
        expect(created.success).toBe(true);
        expect(created.data.name).toBe('arc21-direct-draft');
      } finally {
        await cleanup();
      }
    });
  });
});
