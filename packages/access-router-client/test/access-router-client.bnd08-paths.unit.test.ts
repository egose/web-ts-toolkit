import { describe, expect, it, vi } from 'vitest';

import { Model, type ModelResponse, type ModelService } from '../src';

interface Item {
  label: string;
  flag?: string;
}

interface Doc {
  _id?: string;
  items: Item[];
  meta?: Record<string, unknown>;
  name?: string;
}

const success = (raw: Partial<Doc>) =>
  ({ success: true, raw, data: null, message: '', status: 200, headers: {} }) as unknown as ModelResponse<
    Doc,
    Partial<Doc>
  >;

const createService = (update: ReturnType<typeof vi.fn>) =>
  ({ update, create: vi.fn() }) as unknown as ModelService<Doc>;

const existing = (update: ReturnType<typeof vi.fn>, data: Partial<Doc>) =>
  Model.create<Doc, Partial<Doc>>(data, createService(update), undefined, true);

describe('BND-08 path mutation and dirty normalization', () => {
  it('repro: bracket set tracks the top-level root (currently fails)', () => {
    const update = vi.fn();
    const m = existing(update, { _id: 'id', items: [{ label: 'a' }, { label: 'b' }] });
    m.set('items[0].label', 'changed');
    expect(m.get('items[0].label')).toBe('changed');
    expect(m.isDirty('items')).toBe(true);
    expect(m.isDirty()).toBe(true);
  });

  it('dot and bracket index forms share the dirty root and persisted payload', async () => {
    for (const path of ['items.0.label', 'items[0].label'] as const) {
      const update = vi.fn().mockResolvedValue(success({ items: [{ label: 'x' }, { label: 'b' }] }));
      const m = existing(update, { _id: 'id', items: [{ label: 'a' }, { label: 'b' }] });
      m.set(path, 'x');
      expect(m.isDirty('items')).toBe(true);
      expect(m.isDirty('items[0].label')).toBe(true);
      expect(m.isDirty('items.0.label')).toBe(true);
      await m.save();
      expect(update).toHaveBeenCalledWith(
        'id',
        { items: [{ label: 'x' }, { label: 'b' }] },
        { returningAll: false },
        undefined,
      );
    }
  });

  it('quoted-key paths share the dirty root with dot notation', () => {
    const update = vi.fn();
    const m = existing(update, { _id: 'id', items: [{ label: 'a' }], meta: { 'weird.key': 1 } });
    m.set('meta["weird.key"]', 2);
    expect(m.isDirty('meta')).toBe(true);
    expect(m.isDirty('meta["weird.key"]')).toBe(true);
    expect(m.get('meta["weird.key"]')).toBe(2);
  });

  it('markModified/isDirty align across dot and bracket forms', () => {
    const update = vi.fn();
    const m = existing(update, { _id: 'id', items: [{ label: 'a' }] });
    m.markModified('items[0].label');
    expect(m.isDirty('items')).toBe(true);
    expect(m.isDirty('items.0.label')).toBe(true);
    expect(m.isDirty('items[0].label')).toBe(true);
  });

  it('reverting via bracket syntax cleans the top-level root', () => {
    const update = vi.fn();
    const m = existing(update, { _id: 'id', items: [{ label: 'a' }] });
    m.set('items[0].label', 'changed');
    expect(m.isDirty('items')).toBe(true);
    m.set('items[0].label', 'a');
    expect(m.isDirty('items')).toBe(false);
    expect(m.isDirty()).toBe(false);
  });

  it('unsupported paths reject before mutation with no dirty state', () => {
    const update = vi.fn();
    const m = existing(update, { _id: 'id', items: [{ label: 'a' }] });
    const before = m.toObject();
    for (const bad of ['', '__proto__.x', 'items.__proto__.label', 'constructor.prototype.x'] as const) {
      expect(() => m.set(bad, 'evil')).toThrow();
      expect(() => m.markModified(bad)).toThrow();
    }
    expect(m.toObject()).toEqual(before);
    expect(m.isDirty()).toBe(false);
  });
});
