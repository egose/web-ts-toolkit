import { describe, expect, it, vi } from 'vitest';

import { Model, type ModelResponse, type ModelService } from '../src';

interface AbsentDoc {
  _id?: string;
  name: string;
  nickname?: string;
  status?: string;
}

const success = (raw: Partial<AbsentDoc>) =>
  ({
    success: true,
    raw,
    data: null,
    message: '',
    status: 200,
    headers: {},
  }) as unknown as ModelResponse<AbsentDoc, Partial<AbsentDoc>>;

const createService = (update: ReturnType<typeof vi.fn>) =>
  ({ update, create: vi.fn() }) as unknown as ModelService<AbsentDoc>;

const asWrapper = (m: unknown) =>
  m as Model<AbsentDoc, Partial<AbsentDoc>> & Partial<AbsentDoc> & Record<string, unknown>;

describe('BND-07 absent-field characterization (no fix — documents current contract)', () => {
  it('direct assignment to an absent optional field creates an untracked shadow property', () => {
    const update = vi.fn();
    const model = Model.create<AbsentDoc, Partial<AbsentDoc>>(
      { _id: 'doc-1', name: 'base' },
      createService(update),
      undefined,
      true,
    );
    const m = asWrapper(model);

    expect('nickname' in model).toBe(false);
    m.nickname = 'shadow-value';

    // Shadow-write signature: plain own property, _data untouched, nothing dirty.
    expect(Object.hasOwn(model, 'nickname')).toBe(true);
    expect(model.toObject()).not.toHaveProperty('nickname');
    expect(model.isDirty()).toBe(false);
    expect(model.isDirty('nickname')).toBe(false);
    expect(model.get('nickname')).toBeUndefined();
  });

  it('shadow write is omitted from save payload and survives reset as a stale wrapper property', async () => {
    const update = vi.fn().mockResolvedValue(success({ name: 'server-name' }));
    const model = Model.create<AbsentDoc, Partial<AbsentDoc>>(
      { _id: 'doc-1', name: 'base' },
      createService(update),
      undefined,
      true,
    );
    const m = asWrapper(model);
    m.nickname = 'shadow-value';

    model.set('name', 'edited');
    await model.save();

    // PATCH omits the shadowed field; only the tracked edit is sent.
    expect(update).toHaveBeenCalledWith('doc-1', { name: 'edited' }, { returningAll: false }, undefined);
    // reset() restores _data baseline but the shadow own-property persists on the wrapper.
    model.reset();
    expect(model.toObject()).not.toHaveProperty('nickname');
    expect(m.nickname).toBe('shadow-value');
  });

  it('set() helper on an absent field tracks dirty and persists, diverging from direct assignment', async () => {
    const update = vi.fn().mockResolvedValue(success({ nickname: 'server-nick' }));
    const model = Model.create<AbsentDoc, Partial<AbsentDoc>>(
      { _id: 'doc-1', name: 'base' },
      createService(update),
      undefined,
      true,
    );

    model.set('nickname', 'helper-value');
    expect(model.isDirty('nickname')).toBe(true);
    expect(model.get('nickname')).toBe('helper-value');
    // set() installs a forwarder via definePublicDataProps, so direct read agrees.
    expect(asWrapper(model).nickname).toBe('helper-value');

    await model.save();
    expect(update).toHaveBeenCalledWith('doc-1', { nickname: 'helper-value' }, { returningAll: false }, undefined);
  });

  it('later set() cannot repair an existing shadow: direct read stays stale while get() sees _data', () => {
    const update = vi.fn();
    const model = Model.create<AbsentDoc, Partial<AbsentDoc>>(
      { _id: 'doc-1', name: 'base' },
      createService(update),
      undefined,
      true,
    );
    const m = asWrapper(model);
    m.status = 'shadow-status';

    model.set('status', 'helper-status');

    // _data holds the helper value and is dirty, but the own-property shadow blocks forwarder install.
    expect(model.get('status')).toBe('helper-status');
    expect(model.isDirty('status')).toBe(true);
    expect(m.status).toBe('shadow-status');
    expect(Object.hasOwn(model, 'status')).toBe(true);
    // definePublicDataProps skips keys where `key in this` succeeds — the forwarder is never installed.
    const descriptor = Object.getOwnPropertyDescriptor(model, 'status');
    expect(descriptor?.get).toBeUndefined();
  });

  it('assign() helper on an absent field tracks dirty (helper contract works when no shadow exists)', () => {
    const update = vi.fn();
    const model = Model.create<AbsentDoc, Partial<AbsentDoc>>(
      { _id: 'doc-1', name: 'base' },
      createService(update),
      undefined,
      true,
    );
    model.assign({ nickname: 'assigned-value' });
    expect(model.isDirty('nickname')).toBe(true);
    expect(model.toObject()).toMatchObject({ nickname: 'assigned-value' });
  });

  it('projection-omitted present-via-set field behaves like absent-optional: direct write shadows, set() persists', async () => {
    const update = vi.fn().mockResolvedValue(success({ name: 'server-name' }));
    // Simulates readAdvanced with select omitting `status`: only { name } projected, identity captured.
    const model = Model.create<AbsentDoc, Partial<AbsentDoc>>(
      { name: 'projected-name' },
      createService(update),
      'document-id',
      true,
    );
    const m = asWrapper(model);
    m.status = 'direct-shadow';
    expect(model.isDirty('status')).toBe(false);
    expect(model.toObject()).not.toHaveProperty('status');

    model.set('status', 'helper-status');
    // After a prior shadow, the same repair failure applies to projection-omitted fields.
    expect(model.get('status')).toBe('helper-status');
    expect(m.status).toBe('direct-shadow');
  });

  it('reserved-name behavior is preserved: direct access stays reserved for the wrapper API', () => {
    const update = vi.fn();
    const model = Model.create<AbsentDoc, Partial<AbsentDoc>>(
      { _id: 'doc-1', name: 'base' },
      createService(update),
      undefined,
      true,
    );
    // `save` resolves to the wrapper method, not data, even though ModelData omits it from the type surface.
    expect(typeof (model as unknown as Record<string, unknown>).save).toBe('function');
    expect(model.get('save')).toBeUndefined();
  });
});
