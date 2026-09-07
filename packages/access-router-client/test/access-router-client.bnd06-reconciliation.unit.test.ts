import { describe, expect, it, vi } from 'vitest';

import { Model, type ModelResponse, type ModelService } from '../src';

interface Doc {
  _id?: string;
  name: string;
  status?: string;
}

const success = (raw: Partial<Doc>) =>
  ({ success: true, raw, data: null, message: '', status: 200, headers: {} }) as unknown as ModelResponse<
    Doc,
    Partial<Doc>
  >;

const createService = (update: ReturnType<typeof vi.fn>, create?: ReturnType<typeof vi.fn>) =>
  ({ update, create: create ?? vi.fn() }) as unknown as ModelService<Doc>;

const deferred = () => {
  let resolve!: (v: ModelResponse<Doc, Partial<Doc>>) => void;
  const promise = new Promise<ModelResponse<Doc, Partial<Doc>>>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

const existing = (update: ReturnType<typeof vi.fn>, data: Partial<Doc>) =>
  Model.create<Doc, Partial<Doc>>(data, createService(update), undefined, true);

describe('BND-06 save reconciliation', () => {
  it('A->B->save->A via set (echoed) stays dirty with persisted baseline', async () => {
    const d = deferred();
    const update = vi.fn().mockReturnValue(d.promise);
    const m = existing(update, { _id: 'id', name: 'A' });
    m.set('name', 'B');
    const saving = m.save();
    m.set('name', 'A'); // revert during save clears dirty vs old snapshot
    d.resolve(success({ name: 'B' }));
    const result = await saving;
    expect(result.success).toBe(true);
    expect(update).toHaveBeenCalledWith('id', { name: 'B' }, { returningAll: false }, undefined);
    // Must not record A clean with B persisted.
    expect(m.name).toBe('A');
    expect(m.isDirty('name')).toBe(true);
    m.reset();
    expect(m.name).toBe('B'); // reset returns persisted
    expect(m.isDirty()).toBe(false);
    // Next save persists pending A.
    m.set('name', 'A');
    const d2 = deferred();
    update.mockReturnValueOnce(d2.promise);
    const s2 = m.save();
    d2.resolve(success({ name: 'A' }));
    await s2;
    expect(update).toHaveBeenLastCalledWith('id', { name: 'A' }, { returningAll: false }, undefined);
  });

  it('A->B->save->A via assign and via reset (omitted field) stays dirty', async () => {
    for (const mode of ['assign', 'reset'] as const) {
      const d = deferred();
      const update = vi.fn().mockReturnValue(d.promise);
      const m = existing(update, { _id: 'id', name: 'A' });
      m.set('name', 'B');
      const saving = m.save();
      if (mode === 'assign') m.assign({ name: 'A' });
      else m.reset();
      d.resolve(success({})); // omitted submitted field
      await saving;
      expect(m.name).toBe('A');
      expect(m.isDirty('name')).toBe(true);
      m.reset();
      expect(m.name).toBe('B'); // omitted falls back to submitted value
    }
  });

  it('queued saves serialize: second save submits concurrent revert', async () => {
    const first = deferred();
    const second = deferred();
    const update = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const m = existing(update, { _id: 'id', name: 'A' });
    m.set('name', 'B');
    const s1 = m.save();
    m.set('name', 'A');
    const s2 = m.save();
    first.resolve(success({ name: 'B' }));
    await s1;
    await Promise.resolve();
    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenNthCalledWith(1, 'id', { name: 'B' }, { returningAll: false }, undefined);
    expect(update).toHaveBeenNthCalledWith(2, 'id', { name: 'A' }, { returningAll: false }, undefined);
    second.resolve(success({ name: 'A' }));
    await s2;
    expect(m.name).toBe('A');
    expect(m.isDirty()).toBe(false);
  });

  it('result.data preserves dirty+baseline independently', async () => {
    const d = deferred();
    const update = vi.fn().mockReturnValue(d.promise);
    const m = existing(update, { _id: 'id', name: 'A' });
    m.set('name', 'B');
    const saving = m.save();
    m.set('name', 'C');
    d.resolve(success({ name: 'B' }));
    const result = await saving;
    const returned = result.data as unknown as Model<Doc, Partial<Doc>> & Partial<Doc>;
    expect(returned.name).toBe('C');
    expect(returned.isDirty('name')).toBe(true);
    expect(m.isDirty('name')).toBe(true);
    // Independence: mutate returned, original unaffected.
    returned.set('name', 'D');
    expect(m.name).toBe('C');
    expect(returned.name).toBe('D');
    // Both reset to persisted B.
    returned.reset();
    expect(returned.name).toBe('B');
    m.reset();
    expect(m.name).toBe('B');
  });

  it('unchanged fields stay omitted from PATCH', async () => {
    const update = vi.fn().mockResolvedValue(success({ name: 'B' }));
    const m = existing(update, { _id: 'id', name: 'A', status: 's' });
    m.set('name', 'B');
    await m.save();
    expect(update).toHaveBeenCalledWith('id', { name: 'B' }, { returningAll: false }, undefined);
  });

  it('draft reset/revert still POSTs full body', async () => {
    const create = vi.fn().mockResolvedValue(success({ _id: 'new', name: 'n', status: 's' }));
    const draft = Model.create<Doc, Partial<Doc>>({ name: 'n', status: 's' }, createService(vi.fn(), create));
    draft.reset();
    expect(draft.isDirty()).toBe(true);
    await draft.save();
    expect(create).toHaveBeenCalledWith({ name: 'n', status: 's' }, undefined, undefined);

    const create2 = vi.fn().mockResolvedValue(success({ _id: 'new2', name: 'n', status: 's' }));
    const draft2 = Model.create<Doc, Partial<Doc>>({ name: 'n', status: 's' }, createService(vi.fn(), create2));
    draft2.set('name', 'x');
    draft2.assign({ name: 'n' }); // revert to initial stays dirty for drafts
    expect(draft2.isDirty('name')).toBe(true);
    await draft2.save();
    expect(create2).toHaveBeenCalledWith({ name: 'n', status: 's' }, undefined, undefined);
  });
});
