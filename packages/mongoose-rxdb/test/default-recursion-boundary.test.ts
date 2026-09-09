import { describe, expect, it } from 'vitest';
import { Connection, Query, Schema } from '../src/index';
import { castDocumentToSchema, documentToStorage, storageToDocument } from '../src/converter';
import { createMemoryDatabase } from '../src/storage/index';
import { FakePersistenceAdapter } from './support/fake-adapter';

const literalDate = new Date('2024-02-29T12:00:00.000Z');

function makeNestedSchema() {
  const child = new Schema({
    nick: { type: String, default: 'anon' },
    level: { type: Number, default: 3 },
  });
  const item = new Schema({
    code: { type: String, default: 'x' },
    qty: { type: Number, default: 1 },
  });
  return new Schema({
    name: { type: String, required: true },
    born: { type: Date, default: literalDate },
    profile: { type: child, default: undefined } as any,
    tags: { type: [item], default: undefined } as any,
  } as any);
}

function makeFakeModel(schema: Schema<any, any, any, any>, adapter: FakePersistenceAdapter) {
  return {
    modelName: 'Bmrx13Harness',
    schema,
    collection: adapter,
    resolveCollection: () => Promise.resolve(adapter),
    mw: { exec: (_op: string, _t: unknown, next: () => unknown) => next() },
  };
}

describe('BMRX-13 default values and recursive default policy', () => {
  it('preserves literal Date defaults through clone and model compilation', () => {
    const schema = new Schema({ born: { type: Date, default: literalDate } });
    const cloned = schema.clone();
    const def = cloned.path('born')!.options.default as Date;
    expect(def).toBeInstanceOf(Date);
    expect(def.getTime()).toBe(literalDate.getTime());
    expect(def).not.toBe(literalDate);
    // Mutating the clone default must not affect the source.
    def.setFullYear(2000);
    expect((schema.path('born')!.options.default as Date).getTime()).toBe(literalDate.getTime());
  });

  it('round-trips literal Date defaults through real memory storage', async () => {
    const conn = new Connection();
    await conn.connect(() => createMemoryDatabase({ name: `bmrx13_date_${Date.now()}` }));
    try {
      const M = conn.model(
        'Bmrx13Date',
        new Schema({ name: String, born: { type: Date, default: literalDate } }),
        `bmrx13_date_${Date.now()}`,
      );
      const created = await M.create({ name: 'Ada' } as any);
      expect(created.toObject().born).toBeInstanceOf(Date);
      expect((created.toObject().born as Date).getTime()).toBe(literalDate.getTime());
      const reloaded = await M.findById(created._id);
      expect(reloaded!.toObject().born).toBeInstanceOf(Date);
      expect((reloaded!.toObject().born as Date).getTime()).toBe(literalDate.getTime());
    } finally {
      await conn.disconnect();
    }
  });

  it('does not reapply nested defaults when applyDefaults is false', () => {
    const schema = makeNestedSchema();
    const casted = castDocumentToSchema({ name: 'Ada', profile: { nick: 'a' } }, schema, { applyDefaults: false });
    expect(casted.profile).toEqual({ nick: 'a' });
    expect(casted.profile).not.toHaveProperty('level');
    const stored = documentToStorage({ name: 'Ada', profile: { nick: 'a' } }, schema, { applyDefaults: false });
    expect(stored.profile).toEqual({ nick: 'a' });
  });

  it('still applies nested defaults when applyDefaults is enabled', () => {
    const schema = makeNestedSchema();
    const casted = castDocumentToSchema({ name: 'Ada', profile: { nick: 'a' } }, schema, { applyDefaults: true });
    expect(casted.profile).toEqual({ nick: 'a', level: 3 });
    const stored = documentToStorage({ name: 'Ada', profile: { nick: 'a' } }, schema, { applyDefaults: true });
    expect(stored.profile).toEqual({ nick: 'a', level: 3 });
  });

  it('keeps default-disabled subdocument arrays without absent fields through hydration', async () => {
    const schema = makeNestedSchema();
    const raw = { _id: 'h1', name: 'Ada', tags: [{ code: 'a' }] };
    const hydrated = storageToDocument(raw, schema);
    const { Document } = await import('../src/document');
    const adapter = new FakePersistenceAdapter();
    const model = makeFakeModel(schema, adapter);
    const doc = new Document(hydrated, schema as any, model, { isNew: false, id: 'h1', applyDefaults: false });
    expect(doc.toObject().tags).toEqual([{ code: 'a' }]);
    expect(doc.toObject().tags[0]).not.toHaveProperty('qty');
    expect(doc.toObject().profile).toBeUndefined();
  });

  it('respects projection exclusion through hydration (no default resurrection)', async () => {
    const conn = new Connection();
    const suffix = Date.now();
    await conn.connect(() => createMemoryDatabase({ name: `bmrx13_proj_${suffix}` }));
    try {
      const M = conn.model('Bmrx13Proj', makeNestedSchema() as any, `bmrx13_proj_${suffix}`);
      const created = await M.create({ name: 'Ada', profile: { nick: 'a' }, tags: [{ code: 'a' }] } as any);
      // Stored record has nested defaults filled at insert.
      expect((created.toObject() as any).profile.level).toBe(3);
      const projected = await M.findOne({ _id: created._id } as any)
        .select({ name: 1 } as any)
        .exec();
      expect(projected!.toObject()).not.toHaveProperty('profile');
      expect(projected!.toObject()).not.toHaveProperty('tags');
    } finally {
      await conn.disconnect();
    }
  });

  it('respects setDefaultsOnInsert for nested defaults on upsert', async () => {
    const schema = new Schema({
      name: { type: String, required: true },
      role: { type: String, default: 'user' },
      profile: {
        type: new Schema({ nick: { type: String, default: 'anon' }, level: { type: Number, default: 3 } }),
      } as any,
    } as any);
    const withoutDefaults = new FakePersistenceAdapter();
    const modelOff = makeFakeModel(schema, withoutDefaults);
    await new Query(modelOff, schema as any, withoutDefaults as any)
      .setOperationDescriptor({
        op: 'findOneAndUpdate',
        filter: { name: 'Ada' } as any,
        update: { $set: { profile: { nick: 'a' } } },
        options: { upsert: true },
      })
      .exec();
    expect(withoutDefaults.calls.insert[0]).toMatchObject({ name: 'Ada', profile: { nick: 'a' } });
    expect(withoutDefaults.calls.insert[0]).not.toHaveProperty('role');
    expect(withoutDefaults.calls.insert[0].profile).not.toHaveProperty('level');

    const withDefaults = new FakePersistenceAdapter();
    const modelOn = makeFakeModel(schema, withDefaults);
    await new Query(modelOn, schema as any, withDefaults as any)
      .setOperationDescriptor({
        op: 'findOneAndUpdate',
        filter: { name: 'Ada' } as any,
        update: { $set: { profile: { nick: 'a' } } },
        options: { upsert: true, setDefaultsOnInsert: true },
      })
      .exec();
    expect(withDefaults.calls.insert[0]).toMatchObject({
      name: 'Ada',
      role: 'user',
      profile: { nick: 'a', level: 3 },
    });
  });
});
