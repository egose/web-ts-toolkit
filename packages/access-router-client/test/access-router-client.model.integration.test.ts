import { describe, expect, it } from 'vitest';

import { cloneDeep } from '@web-ts-toolkit/utils';

import { Model, replaceItemById, removeItemById, type ModelService } from '../src';
import { setupIntegrationSuite, type User } from './support/integration-suite';

interface CollisionDoc {
  _id?: string;
  save: string;
  nested: { value: string };
}

const { services, seedState } = setupIntegrationSuite();

describe('access-router-client Model integration', () => {
  it('supports Model helper methods and preserves dirty state on failed save', async () => {
    const read = await services.userService.read(String(seedState.admin._id), undefined, {
      headers: { user: 'admin' },
    });
    expect(read.success).toBe(true);
    expect(read.data.isDirty()).toBe(false);

    const cloned = read.data.toObject();
    cloned.name = 'changed-outside-model';
    expect(read.data.name).toBe('admin-user');
    expect(JSON.parse(JSON.stringify(read.data))).toMatchObject({ name: 'admin-user' });
    expect(read.data.get('name')).toBe('admin-user');

    read.data.assign({ role: 'admin' });
    read.data.set('name', 'admin-user');
    expect(read.data.isDirty()).toBe(false);

    read.data.markModified('statusHistory.0.flag');
    expect(read.data.isDirty('statusHistory')).toBe(true);
    read.data.reset();

    read.data.assign({ role: 'captain' });
    expect(read.data.isDirty()).toBe(true);
    expect(read.data.isDirty('role')).toBe(true);

    read.data.set('name', 'admiral-user');
    expect(read.data.name).toBe('admiral-user');
    expect(read.data.get('name')).toBe('admiral-user');

    read.data.statusHistory[0].label = 'approved';
    expect(read.data.isDirty('statusHistory')).toBe(false);
    read.data.set('statusHistory.0.label', 'approved-2');
    expect(read.data.isDirty('statusHistory')).toBe(true);

    read.data.reset();
    expect(read.data.isDirty()).toBe(false);
    expect(read.data.name).toBe('admin-user');
    expect(read.data.role).toBe('admin');
    expect(read.data.statusHistory[0].label).toBe('created');

    read.data.assign({ role: 'captain' });
    read.data.set('statusHistory.0.label', 'approved');

    const currentId = String(read.data._id);
    read.data._id = '000000000000000000000000';
    const failedSave = await read.data.save({ headers: { user: 'admin' } });
    expect(failedSave.success).toBe(false);
    expect(read.data.isDirty('role')).toBe(true);
    expect(read.data.isDirty('statusHistory')).toBe(true);

    read.data._id = currentId;
    const saved = await read.data.save({ headers: { user: 'admin' } });
    expect(saved.success).toBe(true);
    expect(read.data.isDirty()).toBe(false);

    const reloaded = await services.userService.read(currentId, undefined, { headers: { user: 'admin' } });
    expect(reloaded.data.role).toBe('captain');
    expect(reloaded.data.statusHistory[0].label).toBe('approved');

    const collisionModel = new Model<CollisionDoc, CollisionDoc>(
      {
        save: 'field-value',
        nested: { value: 'one' },
      },
      services.userService as unknown as ModelService<CollisionDoc>,
    ) as Model<CollisionDoc, CollisionDoc> & CollisionDoc;

    expect(typeof collisionModel.save).toBe('function');
    expect(collisionModel.get('save')).toBe('field-value');
    collisionModel.set('save', 'next-field-value');
    collisionModel.set('nested.value', 'two');
    expect(collisionModel.get('save')).toBe('next-field-value');
    expect(collisionModel.get('nested.value')).toBe('two');
    expect(collisionModel.isDirty('nested')).toBe(true);
    collisionModel.reset();
    expect(collisionModel.get('save')).toBe('field-value');
    expect(collisionModel.get('nested.value')).toBe('one');
  });

  it('supports creating a new unsaved Model instance via save()', async () => {
    const draft = new Model<User, Partial<User>>(
      {
        name: 'draft-user',
        role: 'author',
        public: true,
        orgs: [String(seedState.org1._id)],
        statusHistory: [{ label: 'drafted', flag: 'purple' }],
      },
      services.userService,
    ) as Model<User, Partial<User>> & Partial<User>;

    expect(draft.isDirty()).toBe(true);
    expect(draft.isDirty('name')).toBe(true);

    const saved = await draft.save({ headers: { user: 'admin' } });
    expect(saved.success).toBe(true);
    expect(saved.data._id).toBeTruthy();
    expect(saved.data.name).toBe('draft-user');

    const created = await services.userService.read(String(saved.data._id), undefined, { headers: { user: 'admin' } });
    expect(created.success).toBe(true);
    expect(created.data.role).toBe('author');
    expect(created.data.statusHistory[0]).toMatchObject({ label: 'drafted', flag: 'purple' });
  });

  it('preserves concurrent edits to *other* paths during an in-flight save (ARC-06)', async () => {
    // Reset an admin-style user to a known baseline we can mutate.
    const read = await services.userService.new({ headers: { user: 'admin' } });
    read.data.assign({
      name: 'arc-six-other',
      role: 'reviewer',
      public: true,
      statusHistory: [{ label: 'startup', flag: 'silver' }],
      orgs: [],
    });
    const saved = await read.data.save({ headers: { user: 'admin' } });
    expect(saved.success).toBe(true);
    const userId = String(saved.data._id);

    const fresh = await services.userService.read(userId, undefined, { headers: { user: 'admin' } });
    expect(fresh.success).toBe(true);

    // Submitted edit: change `role`.
    fresh.data.set('role', 'maintainer');
    expect(fresh.data.isDirty('role')).toBe(true);

    // Kick off the save. While the network request is in flight, edit a
    // DIFFERENT path (`public`). The concurrent edit must remain present
    // and flagged dirty after the save completes.
    const saveP = fresh.data.save({ headers: { user: 'admin' } });
    fresh.data.set('public', false);

    const result = await saveP;
    expect(result.success).toBe(true);

    // The submitted path was accepted by the server and cleared from
    // the local dirty tracking.
    expect(fresh.data.isDirty('role')).toBe(false);
    expect(fresh.data.role).toBe('maintainer');

    // The concurrent edit to a different path is preserved and remains dirty
    // so it is resubmitted on the next save().
    expect(fresh.data.public).toBe(false);
    expect(fresh.data.isDirty('public')).toBe(true);

    // Server has not seen the concurrent edit yet.
    const reloadedMid = await services.userService.read(userId, undefined, { headers: { user: 'admin' } });
    expect(reloadedMid.data.public).toBe(true);

    // A second save flushes the concurrent edit.
    const result2 = await fresh.data.save({ headers: { user: 'admin' } });
    expect(result2.success).toBe(true);
    expect(fresh.data.isDirty('public')).toBe(false);

    const reloadedFinal = await services.userService.read(userId, undefined, { headers: { user: 'admin' } });
    expect(reloadedFinal.data.public).toBe(false);

    // Cleanup.
    await services.userService.delete(userId, { headers: { user: 'admin' } });
  });

  it('does not overwrite or mark-clean a newer edit to the same path during an in-flight save (ARC-06)', async () => {
    const read = await services.userService.new({ headers: { user: 'admin' } });
    read.data.assign({
      name: 'arc-six-same',
      role: 'reviewer',
      public: true,
      statusHistory: [{ label: 'startup', flag: 'silver' }],
      orgs: [],
    });
    const saved = await read.data.save({ headers: { user: 'admin' } });
    expect(saved.success).toBe(true);
    const userId = String(saved.data._id);

    const fresh = await services.userService.read(userId, undefined, { headers: { user: 'admin' } });
    expect(fresh.success).toBe(true);

    // Submit role='maintainer', then concurrently re-edit role='author'
    // before the response merges back.
    fresh.data.set('role', 'maintainer');
    const saveP = fresh.data.save({ headers: { user: 'admin' } });
    fresh.data.set('role', 'author');

    const result = await saveP;
    expect(result.success).toBe(true);

    // The newer concurrent edit is preserved locally and stays dirty.
    expect(fresh.data.role).toBe('author');
    expect(fresh.data.isDirty('role')).toBe(true);

    // The server has stored the SUBMITTED value ('maintainer'); the local
    // concurrent edit will overwrite it on the next save().
    const reloadedMid = await services.userService.read(userId, undefined, { headers: { user: 'admin' } });
    expect(reloadedMid.data.role).toBe('maintainer');

    // Flush the concurrent edit.
    const result2 = await fresh.data.save({ headers: { user: 'admin' } });
    expect(result2.success).toBe(true);
    expect(fresh.data.isDirty('role')).toBe(false);

    const reloadedFinal = await services.userService.read(userId, undefined, { headers: { user: 'admin' } });
    expect(reloadedFinal.data.role).toBe('author');

    await services.userService.delete(userId, { headers: { user: 'admin' } });
  });

  it('preserves all dirty paths on a failed save (ARC-06)', async () => {
    const read = await services.userService.new({ headers: { user: 'admin' } });
    read.data.assign({
      name: 'arc-six-fail',
      role: 'reviewer',
      public: true,
      statusHistory: [{ label: 'startup', flag: 'silver' }],
      orgs: [],
    });
    const saved = await read.data.save({ headers: { user: 'admin' } });
    expect(saved.success).toBe(true);
    const userId = String(saved.data._id);

    const fresh = await services.userService.read(userId, undefined, { headers: { user: 'admin' } });
    expect(fresh.success).toBe(true);

    fresh.data.set('role', 'maintainer');
    fresh.data.set('public', false);
    expect(fresh.data.isDirty('role')).toBe(true);
    expect(fresh.data.isDirty('public')).toBe(true);

    // Point `_id` at a bogus id so the PATCH fails with 404.
    const realId = String(fresh.data._id);
    fresh.data._id = '000000000000000000000001';
    const failedSave = await fresh.data.save({ headers: { user: 'admin' } });
    expect(failedSave.success).toBe(false);

    // All dirty paths are retained after a failed save.
    expect(fresh.data.isDirty('role')).toBe(true);
    expect(fresh.data.isDirty('public')).toBe(true);
    expect(fresh.data.role).toBe('maintainer');
    expect(fresh.data.public).toBe(false);

    // Restore the real id and confirm a retry succeeds and flushes dirties.
    fresh.data._id = realId;
    const retry = await fresh.data.save({ headers: { user: 'admin' } });
    expect(retry.success).toBe(true);
    expect(fresh.data.isDirty('role')).toBe(false);
    expect(fresh.data.isDirty('public')).toBe(false);

    await services.userService.delete(userId, { headers: { user: 'admin' } });
  });

  describe('dirty tracking (ARC-07)', () => {
    it('cleans a top-level field when its value reverts to the snapshot via set()', async () => {
      const read = await services.userService.read(String(seedState.admin._id), undefined, {
        headers: { user: 'admin' },
      });
      expect(read.success).toBe(true);
      expect(read.data.isDirty()).toBe(false);

      const baseline = read.data.role;
      read.data.set('role', 'maintainer');
      expect(read.data.isDirty('role')).toBe(true);

      // Revert to snapshot. ARC-07 req 1: dirty flag must clear because the
      // effective value now equals the snapshot baseline.
      read.data.set('role', baseline);
      expect(read.data.isDirty('role')).toBe(false);
      expect(read.data.isDirty()).toBe(false);

      // Saving a model with no dirty paths must be a no-op request body —
      // verified by checking the server still has the baseline value.
      const before = await services.userService.read(String(seedState.admin._id), undefined, {
        headers: { user: 'admin' },
      });
      expect(before.data.role).toBe(baseline);

      // A concurrently-dirty other path triggers a real save, but the
      // reverted field must NOT appear in the request body (server-side
      // behavior unchanged for that field).
      read.data.set('role', 'maintainer');
      read.data.set('role', baseline); // revert
      read.data.set('public', false);
      expect(read.data.isDirty('role')).toBe(false);
      expect(read.data.isDirty('public')).toBe(true);

      // Save and verify server only changed `public` (not `role`).
      const saved = await read.data.save({ headers: { user: 'admin' } });
      expect(saved.success).toBe(true);
      expect(saved.data.role).toBe(baseline);
      expect(saved.data.public).toBe(false);

      // Rewinding: cleanup is optional — restore server state.
      read.data.set('public', true);
      await read.data.save({ headers: { user: 'admin' } });
    });

    it('cleans a top-level field when a nested edit reverts via set(path.nested, baseline)', async () => {
      const read = await services.userService.read(String(seedState.admin._id), undefined, {
        headers: { user: 'admin' },
      });
      expect(read.success).toBe(true);

      const baselineLabel = read.data.statusHistory[0].label;
      read.data.set('statusHistory.0.label', 'pending');
      expect(read.data.isDirty('statusHistory')).toBe(true);

      // Revert nested value via set() to its baseline. ARC-07 req 1 with the
      // nested contract (set normalizes to top-level field and reconciles
      // the top-level value deeply against the snapshot).
      read.data.set('statusHistory.0.label', baselineLabel);
      expect(read.data.isDirty('statusHistory')).toBe(false);
      expect(read.data.isDirty()).toBe(false);

      // The unmodified-by-side-effect server state should match the original.
      const reloaded = await services.userService.read(String(seedState.admin._id), undefined, {
        headers: { user: 'admin' },
      });
      expect(reloaded.data.statusHistory[0].label).toBe(baselineLabel);
    });

    it('honors direct nested-edits contract: raw array mutation is NOT tracked or persisted', async () => {
      const read = await services.userService.read(String(seedState.admin._id), undefined, {
        headers: { user: 'admin' },
      });
      expect(read.success).toBe(true);

      const before = read.data.toObject().statusHistory[0].label;

      // Direct nested mutation must NOT silently appear tracked. Use `set()`
      // or `markModified(...)` to opt in. This is the documented ARC-07
      // nested-edit contract (chosen over a recursive proxy for identity
      // stability).
      read.data.statusHistory[0].label = 'rogue-value';
      expect(read.data.isDirty('statusHistory')).toBe(false);
      expect(read.data.isDirty()).toBe(false);

      // Saving such a model has no dirty paths → exercise that the save
      // itself succeeds without raising and leaves the server unchanged.
      const saved = await read.data.save({ headers: { user: 'admin' } });
      expect(saved.success).toBe(true);

      const after = await services.userService.read(String(seedState.admin._id), undefined, {
        headers: { user: 'admin' },
      });
      expect(after.data.statusHistory[0].label).toBe(before);

      // Array .push() is also a direct nested mutation — not tracked.
      const beforeLen = read.data.toObject().statusHistory.length;
      read.data.statusHistory.push({ label: 'extra', flag: 'red' });
      expect(read.data.isDirty('statusHistory')).toBe(false);
      expect(read.data.statusHistory.length).toBe(beforeLen + 1); // local view mutated, but server will not receive this change
      read.data.reset();
      expect(read.data.statusHistory.length).toBe(beforeLen);
    });

    it('markModified(...) forces a path to stay dirty even if the value equals the snapshot (explicit escape hatch)', async () => {
      const read = await services.userService.read(String(seedState.admin._id), undefined, {
        headers: { user: 'admin' },
      });
      expect(read.success).toBe(true);

      const baseline = read.data.role;
      // markModified is the documented escape hatch: even without an
      // effective change, it must keep `role` in the dirty set so callers
      // can force a re-send to the server.
      read.data.markModified('role');
      expect(read.data.isDirty('role')).toBe(true);
      expect(read.data.role).toBe(baseline);

      const saved = await read.data.save({ headers: { user: 'admin' } });
      expect(saved.success).toBe(true);
      expect(saved.data.role).toBe(baseline);
      expect(read.data.isDirty('role')).toBe(false);
    });

    it('reconciles array values after full replacement via assign() (revert cleans) and reset() restores baseline', async () => {
      const read = await services.userService.read(String(seedState.admin._id), undefined, {
        headers: { user: 'admin' },
      });
      expect(read.success).toBe(true);

      const baselineOrgs = cloneDeep(read.data.orgs);

      // Replace the whole array; dirty tracking must mark orgs as modified.
      read.data.assign({ orgs: [] });
      expect(read.data.isDirty('orgs')).toBe(true);
      expect(read.data.orgs).toEqual([]);

      // Revert by assigning the same baseline back. ARC-07 req 1 + req 4:
      // `assign()` shares the same reconcile rule as `set()` → dirty flag
      // must clear when current == snapshot.
      read.data.assign({ orgs: baselineOrgs });
      expect(read.data.isDirty('orgs')).toBe(false);
      expect(read.data.isDirty()).toBe(false);

      // Mutate to dirty, then reset() rewinds to baseline and clears.
      read.data.set('orgs', []);
      expect(read.data.isDirty('orgs')).toBe(true);
      read.data.reset();
      expect(read.data.isDirty('orgs')).toBe(false);
      expect(read.data.orgs).toEqual(baselineOrgs);
    });
  });

  describe('replaceItemById', () => {
    it('replaces an item by _id with merge', () => {
      const items = [
        { _id: '1', name: 'a' },
        { _id: '2', name: 'b' },
        { _id: '3', name: 'c' },
      ];
      const result = replaceItemById(items, { _id: '2', name: 'updated' });
      expect(result).toEqual([
        { _id: '1', name: 'a' },
        { _id: '2', name: 'updated' },
        { _id: '3', name: 'c' },
      ]);
    });

    it('replaces an item by _id without merge', () => {
      const items = [
        { _id: '1', name: 'a', extra: true },
        { _id: '2', name: 'b', extra: true },
      ];
      const result = replaceItemById(items, { _id: '2', name: 'replaced' }, { merge: false });
      expect(result[1]).toEqual({ _id: '2', name: 'replaced' });
      expect(result[1]).not.toHaveProperty('extra');
    });

    it('returns original items when _id not found', () => {
      const items = [{ _id: '1', name: 'a' }];
      const result = replaceItemById(items, { _id: '99', name: 'nope' });
      expect(result).toEqual([{ _id: '1', name: 'a' }]);
    });
  });

  describe('removeItemById', () => {
    it('removes an item by _id', () => {
      const items = [
        { _id: '1', name: 'a' },
        { _id: '2', name: 'b' },
        { _id: '3', name: 'c' },
      ];
      const result = removeItemById(items, { _id: '2', name: 'b' });
      expect(result).toEqual([
        { _id: '1', name: 'a' },
        { _id: '3', name: 'c' },
      ]);
    });

    it('returns all items when _id not found', () => {
      const items = [{ _id: '1', name: 'a' }];
      const result = removeItemById(items, { _id: '99', name: 'nope' });
      expect(result).toEqual([{ _id: '1', name: 'a' }]);
    });

    it('returns empty array when all items removed', () => {
      const items = [{ _id: '1', name: 'a' }];
      const result = removeItemById(items, { _id: '1', name: 'a' });
      expect(result).toEqual([]);
    });
  });
});
