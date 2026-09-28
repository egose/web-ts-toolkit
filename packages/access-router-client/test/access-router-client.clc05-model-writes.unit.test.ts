import { describe, expect, it, vi } from 'vitest';
import { MissingPersistenceIdentityError, Model, type ModelData, type ModelResponse, type ModelService } from '../src';

interface Doc {
  _id?: string;
  name?: string;
  optional?: string;
  later?: string;
  nested?: { value: string };
}
type Wrapper = Model<Doc> & ModelData<Doc>;
const success = (raw: Partial<Doc>) =>
  ({ success: true, raw, data: null, message: '', status: 200, headers: {} }) as unknown as ModelResponse<Doc>;
const service = (update = vi.fn(), create = vi.fn()) => ({ update, create }) as unknown as ModelService<Doc>;
const deferred = () => {
  let resolve!: (value: ModelResponse<Doc>) => void;
  const promise = new Promise<ModelResponse<Doc>>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

describe('CLC-05 wrapper assignment and persistence ownership', () => {
  it.each(['constructor', 'create'] as const)(
    '%s returns a model with tracked absent fields and fluent identity',
    async (route) => {
      const update = vi.fn().mockResolvedValue(success({ optional: 'server' }));
      const adapter = service(update);
      const model = (
        route === 'constructor' ? new Model<Doc>({ _id: 'id' }, adapter) : Model.create<Doc>({ _id: 'id' }, adapter)
      ) as Wrapper;
      expect(model).toBeInstanceOf(Model);
      expect(model.constructor).toBe(Model);
      expect(model.save).toBe(model.save);
      expect(await Promise.resolve(model)).toBe(model);
      expect(model.set('name', 'name')).toBe(model);
      expect(model.assign({ name: 'name' })).toBe(model);
      expect(model.markModified('name')).toBe(model);
      expect(model.reset()).toBe(model);
      model.optional = 'direct';
      expect(model.get('optional')).toBe('direct');
      expect(JSON.parse(JSON.stringify(model))).toEqual({ _id: 'id', optional: 'direct' });
      expect(Object.keys(model)).toContain('optional');
      const result = await model.save();
      expect(update).toHaveBeenCalledWith('id', { optional: 'direct' }, { returningAll: false }, undefined);
      expect(result.data).toBeInstanceOf(Model);
      expect(model.optional).toBe('server');
      expect(model.isDirty()).toBe(false);
    },
  );

  it.each(['direct', 'set', 'assign'] as const)(
    '%s reverts an absent field to undefined and reset removes its value',
    (mode) => {
      const model = Model.create<Doc>({ _id: 'id' }, service());
      model.optional = 'added';
      expect(model.isDirty('optional')).toBe(true);
      if (mode === 'direct') model.optional = undefined;
      else if (mode === 'set') model.set('optional', undefined);
      else model.assign({ optional: undefined });
      expect(model.isDirty()).toBe(false);
      model.optional = 'again';
      model.reset();
      expect(model.optional).toBeUndefined();
      expect(model.get('optional')).toBeUndefined();
      expect(model.toObject()).not.toHaveProperty('optional');
      expect(model.isDirty()).toBe(false);
      model.optional = 're-added';
      expect(model.get('optional')).toBe('re-added');
      expect(model.isDirty('optional')).toBe(true);
    },
  );

  it('draft reset still creates the full draft, then queued save updates the new identity', async () => {
    const first = deferred();
    const create = vi.fn().mockReturnValue(first.promise);
    const update = vi.fn().mockResolvedValue(success({ optional: 'second' }));
    const model = Model.create<Doc>({ name: 'draft' }, service(update, create));
    model.optional = 'discarded';
    model.reset();
    expect(model.optional).toBeUndefined();
    expect(model.isDirty('name')).toBe(true);
    model.optional = 'first';
    const saving = model.save();
    model.optional = 'second';
    const queued = model.save();
    expect(create).toHaveBeenCalledWith({ name: 'draft', optional: 'first' }, undefined, undefined);
    expect(update).not.toHaveBeenCalled();
    first.resolve(success({ _id: 'created', name: 'draft', optional: 'first' }));
    await saving;
    await queued;
    expect(update).toHaveBeenCalledWith('created', { optional: 'second' }, { returningAll: false }, undefined);
    expect(model.isDirty()).toBe(false);
  });

  it.each(['echo', 'omitted'] as const)(
    'reset during save of an absent field retains the persisted baseline (%s)',
    async (response) => {
      const first = deferred();
      const update = vi.fn().mockReturnValue(first.promise);
      const model = Model.create<Doc>({ _id: 'id' }, service(update));
      model.optional = 'submitted';
      const saving = model.save();
      model.reset();
      first.resolve(success(response === 'echo' ? { optional: 'persisted' } : {}));
      const returned = (await saving).data!;
      for (const wrapper of [model, returned]) {
        expect(wrapper.optional).toBeUndefined();
        expect(wrapper.isDirty('optional')).toBe(true);
        wrapper.reset();
        expect(wrapper.optional).toBe(response === 'echo' ? 'persisted' : 'submitted');
        expect(wrapper.isDirty()).toBe(false);
      }
    },
  );

  it('queues new and re-edited absent fields, preserving independent returned dirty state and reset baselines', async () => {
    const first = deferred();
    const second = deferred();
    const update = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const model = Model.create<Doc>({ name: 'projection' }, service(update), 'captured', true);
    model.optional = 'first';
    const s1 = model.save();
    model.optional = 'second';
    model.later = 'new-during-save';
    const s2 = model.save();
    expect(update).toHaveBeenCalledTimes(1);
    first.resolve(success({ optional: 'canonical-first', later: 'server-later' }));
    const returned = (await s1).data!;
    await Promise.resolve();
    expect(update).toHaveBeenNthCalledWith(
      2,
      'captured',
      { optional: 'second', later: 'new-during-save' },
      { returningAll: false },
      undefined,
    );
    expect(returned.optional).toBe('second');
    expect(returned.later).toBe('new-during-save');
    expect(returned.isDirty('later')).toBe(true);
    returned.optional = 'returned-only';
    returned.nested = { value: 'returned' };
    expect(model.optional).toBe('second');
    expect(model.nested).toBeUndefined();
    second.resolve(success({ optional: 'canonical-second', later: 'saved-later' }));
    await s2;
    expect(model.optional).toBe('canonical-second');
    expect(model.isDirty()).toBe(false);
    expect(returned.optional).toBe('returned-only');
    returned.reset();
    expect(returned.optional).toBe('canonical-first');
    expect(returned.later).toBeUndefined();
    expect(returned.toObject()).not.toHaveProperty('later');
    expect(model.later).toBe('saved-later');
  });

  it('keeps absent edits on failure and queued retry submits them', async () => {
    const first = deferred();
    const update = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(success({ optional: 'retry' }));
    const model = Model.create<Doc>({ _id: 'id' }, service(update));
    model.optional = 'retry';
    const s1 = model.save();
    const s2 = model.save();
    first.resolve({ ...success({}), success: false } as ModelResponse<Doc>);
    expect((await s1).data).toBeNull();
    await s2;
    expect(update).toHaveBeenNthCalledWith(2, 'id', { optional: 'retry' }, { returningAll: false }, undefined);
    expect(model.isDirty()).toBe(false);
  });

  it('returned wrappers own independent save queues and state', async () => {
    const originalRequest = deferred();
    const returnedRequest = deferred();
    const update = vi
      .fn()
      .mockResolvedValueOnce(success({}))
      .mockReturnValueOnce(originalRequest.promise)
      .mockReturnValueOnce(returnedRequest.promise);
    const model = Model.create<Doc>({ _id: 'id' }, service(update));
    const returned = (await model.save()).data!;
    model.optional = 'original';
    const originalSave = model.save();
    returned.optional = 'returned';
    const returnedSave = returned.save();
    expect(update).toHaveBeenCalledTimes(3);
    expect(update).toHaveBeenNthCalledWith(2, 'id', { optional: 'original' }, { returningAll: false }, undefined);
    expect(update).toHaveBeenNthCalledWith(3, 'id', { optional: 'returned' }, { returningAll: false }, undefined);
    returnedRequest.resolve(success({ optional: 'saved-returned' }));
    await returnedSave;
    expect(model.optional).toBe('original');
    expect(model.isDirty('optional')).toBe(true);
    originalRequest.resolve(success({ optional: 'saved-original' }));
    await originalSave;
    expect(returned.optional).toBe('saved-returned');
  });

  it('does not turn identity-less projected reads into drafts', async () => {
    const adapter = service();
    const model = Model.create<Doc>({ name: 'projection' }, adapter, undefined, true);
    model.optional = 'edit';
    await expect(model.save()).rejects.toBeInstanceOf(MissingPersistenceIdentityError);
    expect(adapter.create).not.toHaveBeenCalled();
    expect(adapter.update).not.toHaveBeenCalled();
    expect(model.isDirty('optional')).toBe(true);
  });

  it('reserved data stays helper-only, including then and private-state names, without becoming thenable', async () => {
    const then = vi.fn();
    const update = vi.fn().mockResolvedValue(success({ then } as Doc));
    const model = Model.create<Doc>({ _id: 'id' }, service(update));
    model.set('save', 'data-save').set('_snapshot', { optional: 'fake' }).set('_saveQueue', 'fake-queue');
    model.assign({ then } as Partial<Doc>);
    expect(model.get('save')).toBe('data-save');
    expect(model.get('_saveQueue')).toBe('fake-queue');
    expect(model.get('then')).toBe(then);
    expect(typeof model.save).toBe('function');
    expect(Reflect.get(model, 'then')).toBeUndefined();
    expect(await Promise.resolve(model)).toBe(model);
    expect(then).not.toHaveBeenCalled();
    model.reset();
    expect(model.toObject()).toEqual({ _id: 'id' });
    const initial = Model.create<Doc>(
      { _id: 'id', then, _saveQueue: 'data-queue', _snapshot: 'data-snapshot' } as Doc,
      service(update),
    );
    expect(await Promise.resolve(initial)).toBe(initial);
    expect(initial.get('then')).toBe(then);
    const returned = (await initial.save()).data!;
    expect(Reflect.get(returned, 'then')).toBeUndefined();
    expect(await Promise.resolve(returned)).toBe(returned);
    expect(returned.get('then')).toBe(then);
    expect(returned.get('_saveQueue')).toBe('data-queue');
    expect(returned.reset()).toBe(returned);
    expect(returned.get('_snapshot')).toBe('data-snapshot');
    expect(returned.isDirty()).toBe(false);
    expect(then).not.toHaveBeenCalled();
  });

  it.each([
    'save',
    'reset',
    '_data',
    '_snapshot',
    '_service',
    '_saveQueue',
    '_persistenceId',
    '_fromExisting',
    'modifiedPaths',
    'then',
    '__proto__',
    'constructor',
    'prototype',
    '',
    'a.b',
    'a[0]',
    '01',
    Symbol('field'),
  ])('rejects unsafe direct key %s without changing state', (key) => {
    const model = Model.create<Doc>({ _id: 'id' }, service());
    const before = model.toObject();
    expect(() => Reflect.set(model, key, 'unsafe')).toThrow();
    expect(model.toObject()).toEqual(before);
    expect(model.isDirty()).toBe(false);
    expect(model).toBeInstanceOf(Model);
    expect(typeof model.save).toBe('function');
    model.optional = 'still-working';
    expect(model.get('optional')).toBe('still-working');
  });

  it.each(['__proto__', 'constructor', 'prototype', '', 'a.b', 'a[0]', '01'])(
    'assign validates all keys before mutating for %s',
    (key) => {
      const model = Model.create<Doc>({ _id: 'id' }, service());
      const partial = { optional: 'must-not-write', [key]: 'unsafe' };
      expect(() => model.assign(partial)).toThrow();
      expect(model.toObject()).toEqual({ _id: 'id' });
      expect(model.isDirty()).toBe(false);
    },
  );

  it('rejects structural wrapper mutations that could bypass tracking or break future forwarders', () => {
    const model = Model.create<Doc>({ _id: 'id' }, service());
    expect(() => Object.defineProperty(model, 'optional', { value: 'shadow' })).toThrow();
    expect(() => Reflect.deleteProperty(model, 'save')).toThrow();
    expect(() => Object.setPrototypeOf(model, {})).toThrow();
    expect(() => Object.preventExtensions(model)).toThrow();
    expect(() => Reflect.apply(Reflect.get(model, '__defineGetter__'), model, ['optional', () => 'shadow'])).toThrow();
    expect(() => Reflect.apply(Reflect.get(model, '__defineSetter__'), model, ['optional', () => undefined])).toThrow();
    expect(model.valueOf()).toBe(model);
    expect(Object.isExtensible(model)).toBe(true);
    model.optional = 'tracked';
    expect(() => Reflect.deleteProperty(model, 'optional')).toThrow();
    expect(model.get('optional')).toBe('tracked');
  });

  it('rejects enumerable symbol fields in assign before any string fields are written', () => {
    const model = Model.create<Doc>({ _id: 'id' }, service());
    expect(() => model.assign({ optional: 'not-written', [Symbol('field')]: 'unsafe' })).toThrow();
    expect(model.toObject()).toEqual({ _id: 'id' });
    expect(model.isDirty()).toBe(false);
  });

  it('preserves untracked nested mutation and detaches snapshots and returned models', async () => {
    const input = { _id: 'id', nested: { value: 'base' } };
    const update = vi.fn().mockResolvedValue(success({}));
    const model = Model.create<Doc>(input, service(update));
    model.nested!.value = 'nested-edit';
    expect(input.nested.value).toBe('base');
    expect(model.isDirty()).toBe(false);
    await model.save();
    expect(update).toHaveBeenLastCalledWith('id', {}, { returningAll: false }, undefined);
    model.markModified('nested');
    const returned = (await model.save()).data!;
    expect(update).toHaveBeenLastCalledWith(
      'id',
      { nested: { value: 'nested-edit' } },
      { returningAll: false },
      undefined,
    );
    returned.nested!.value = 'returned';
    expect(model.nested!.value).toBe('nested-edit');
    expect(returned.isDirty()).toBe(false);
    model.nested = { value: 'replacement' };
    expect(model.isDirty('nested')).toBe(true);
  });
});
