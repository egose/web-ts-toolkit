import { describe, expect, it, vi } from 'vitest';

import { Model, type ModelResponse, type ModelService } from '../src';

interface ReconciliationDocument {
  _id?: string;
  name: string;
  status?: string;
  generated?: string;
  note?: string;
}

const success = (raw: Partial<ReconciliationDocument>) =>
  ({
    success: true,
    raw,
    data: null,
    message: '',
    status: 200,
    headers: {},
  }) as unknown as ModelResponse<ReconciliationDocument, Partial<ReconciliationDocument>>;

const createService = (update: ReturnType<typeof vi.fn>) =>
  ({ update, create: vi.fn() }) as unknown as ModelService<ReconciliationDocument>;

const deferredSuccess = () => {
  let resolve!: (value: ModelResponse<ReconciliationDocument, Partial<ReconciliationDocument>>) => void;
  const promise = new Promise<ModelResponse<ReconciliationDocument, Partial<ReconciliationDocument>>>(
    (innerResolve) => {
      resolve = innerResolve;
    },
  );
  return { promise, resolve };
};

describe('Model save reconciliation', () => {
  it('starts an existing projected model clean and merges unsubmitted server fields into its reset baseline', async () => {
    const update = vi.fn().mockResolvedValue(success({ name: 'SERVER-NAME', generated: 'server-value' }));
    const model = Model.create<ReconciliationDocument, Partial<ReconciliationDocument>>(
      { name: 'projected-name' },
      createService(update),
      'document-id',
      true,
    );

    expect(model.isDirty()).toBe(false);
    model.set('name', 'client-name');

    const result = await model.save();

    expect(result.success).toBe(true);
    expect(update).toHaveBeenCalledWith('document-id', { name: 'client-name' }, { returningAll: false }, undefined);
    expect(model.name).toBe('SERVER-NAME');
    expect(model.generated).toBe('server-value');
    expect(model.isDirty()).toBe(false);

    model.set('generated', 'local-change');
    model.reset();
    expect(model.generated).toBe('server-value');
    expect(model.name).toBe('SERVER-NAME');
  });

  it('preserves concurrent edits and resets them to the latest persisted baseline', async () => {
    let resolveUpdate!: (value: ModelResponse<ReconciliationDocument, Partial<ReconciliationDocument>>) => void;
    const update = vi.fn(
      () =>
        new Promise<ModelResponse<ReconciliationDocument, Partial<ReconciliationDocument>>>((resolve) => {
          resolveUpdate = resolve;
        }),
    );
    const model = Model.create<ReconciliationDocument, Partial<ReconciliationDocument>>(
      { _id: 'document-id', name: 'before', status: 'old', note: 'before-note' },
      createService(update),
      undefined,
      true,
    );

    model.set('name', 'submitted');
    model.set('note', 'submitted-note');
    const saving = model.save();
    model.set('name', 'newer-local');
    model.set('note', 'newer-note');
    model.set('status', 'concurrent-local');

    resolveUpdate(success({ name: 'server-name', status: 'server-status', generated: 'server-value' }));
    await saving;

    expect(model.name).toBe('newer-local');
    expect(model.status).toBe('concurrent-local');
    expect(model.note).toBe('newer-note');
    expect(model.generated).toBe('server-value');
    expect(model.isDirty('name')).toBe(true);
    expect(model.isDirty('status')).toBe(true);
    expect(model.isDirty('note')).toBe(true);
    expect(model.isDirty('generated')).toBe(false);

    model.reset();
    expect(model.toObject()).toEqual({
      _id: 'document-id',
      name: 'server-name',
      status: 'old',
      note: 'submitted-note',
      generated: 'server-value',
    });
  });

  it('serializes overlapping saves and resubmits a newer same-path edit after the first save reconciles', async () => {
    const firstUpdate = deferredSuccess();
    const secondUpdate = deferredSuccess();
    const update = vi.fn().mockReturnValueOnce(firstUpdate.promise).mockReturnValueOnce(secondUpdate.promise);
    const model = Model.create<ReconciliationDocument, Partial<ReconciliationDocument>>(
      { _id: 'document-id', name: 'before' },
      createService(update),
      undefined,
      true,
    );

    model.set('name', 'first-submit');
    const firstSave = model.save();
    model.set('name', 'second-submit');
    const secondSave = model.save();

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenNthCalledWith(
      1,
      'document-id',
      { name: 'first-submit' },
      { returningAll: false },
      undefined,
    );

    firstUpdate.resolve(success({ name: 'server-first' }));
    await firstSave;
    await Promise.resolve();

    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenNthCalledWith(
      2,
      'document-id',
      { name: 'second-submit' },
      { returningAll: false },
      undefined,
    );

    secondUpdate.resolve(success({ name: 'server-second' }));
    await secondSave;

    expect(model.name).toBe('server-second');
    expect(model.isDirty()).toBe(false);
  });

  it('serializes overlapping saves and sends only the later different-path edit on the queued save', async () => {
    const firstUpdate = deferredSuccess();
    const secondUpdate = deferredSuccess();
    const update = vi.fn().mockReturnValueOnce(firstUpdate.promise).mockReturnValueOnce(secondUpdate.promise);
    const model = Model.create<ReconciliationDocument, Partial<ReconciliationDocument>>(
      { _id: 'document-id', name: 'before', status: 'old' },
      createService(update),
      undefined,
      true,
    );

    model.set('name', 'first-submit');
    const firstSave = model.save();
    model.set('status', 'second-submit');
    const secondSave = model.save();

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenNthCalledWith(
      1,
      'document-id',
      { name: 'first-submit' },
      { returningAll: false },
      undefined,
    );

    firstUpdate.resolve(success({ name: 'server-first' }));
    await firstSave;
    await Promise.resolve();

    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenNthCalledWith(
      2,
      'document-id',
      { status: 'second-submit' },
      { returningAll: false },
      undefined,
    );

    secondUpdate.resolve(success({ status: 'server-second' }));
    await secondSave;

    expect(model.name).toBe('server-first');
    expect(model.status).toBe('server-second');
    expect(model.isDirty()).toBe(false);
  });
});
