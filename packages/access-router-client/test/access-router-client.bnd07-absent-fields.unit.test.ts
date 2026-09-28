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

describe('BND-07 absent-field regressions (CLC-05 consistent assignment)', () => {
  it('direct assignment to an absent optional field forwards to tracked data', () => {
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

    expect(Object.hasOwn(model, 'nickname')).toBe(true);
    expect(model.toObject()).toHaveProperty('nickname', 'shadow-value');
    expect(model.isDirty()).toBe(true);
    expect(model.isDirty('nickname')).toBe(true);
    expect(model.get('nickname')).toBe('shadow-value');
  });

  it('direct write is saved and reset restores the persisted baseline', async () => {
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

    expect(update).toHaveBeenCalledWith(
      'doc-1',
      { name: 'edited', nickname: 'shadow-value' },
      { returningAll: false },
      undefined,
    );
    m.nickname = 'later';
    model.reset();
    expect(model.toObject()).toHaveProperty('nickname', 'shadow-value');
    expect(m.nickname).toBe('shadow-value');
  });

  it('set() helper on an absent field tracks dirty and persists like direct assignment', async () => {
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

  it('later set() and assign() agree with direct reads and save after direct assignment', async () => {
    const update = vi.fn().mockResolvedValue(success({}));
    const model = Model.create<AbsentDoc, Partial<AbsentDoc>>(
      { _id: 'doc-1', name: 'base' },
      createService(update),
      undefined,
      true,
    );
    const m = asWrapper(model);
    m.status = 'shadow-status';

    model.set('status', 'helper-status');

    expect(model.get('status')).toBe('helper-status');
    expect(model.isDirty('status')).toBe(true);
    expect(m.status).toBe('helper-status');
    expect(Object.hasOwn(model, 'status')).toBe(true);
    const descriptor = Object.getOwnPropertyDescriptor(model, 'status');
    expect(descriptor?.get).toBeTypeOf('function');
    model.assign({ status: 'assigned-status' });
    expect(m.status).toBe('assigned-status');
    expect(model.get('status')).toBe('assigned-status');
    await model.save();
    expect(update).toHaveBeenCalledWith('doc-1', { status: 'assigned-status' }, { returningAll: false }, undefined);
  });

  it('assign() helper on an absent field tracks dirty', () => {
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

  it('projection-omitted field persists direct assignment using the captured identity', async () => {
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
    expect(model.isDirty('status')).toBe(true);
    expect(model.toObject()).toHaveProperty('status', 'direct-shadow');
    await model.save();
    expect(update).toHaveBeenCalledWith('document-id', { status: 'direct-shadow' }, { returningAll: false }, undefined);
    expect(model.toObject()).not.toHaveProperty('_id');

    model.set('status', 'helper-status');
    expect(model.get('status')).toBe('helper-status');
    expect(m.status).toBe('helper-status');
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
