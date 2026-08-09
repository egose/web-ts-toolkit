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
});
