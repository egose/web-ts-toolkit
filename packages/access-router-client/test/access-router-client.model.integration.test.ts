import { describe, expect, it } from 'vitest';

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
