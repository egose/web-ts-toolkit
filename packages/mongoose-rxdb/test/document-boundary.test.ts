import { describe, expect, it } from 'vitest';
import { Document, Query, Schema } from '../src/index';
import { FakePersistenceAdapter } from './support/fake-adapter';

interface BoundaryDoc {
  name: string;
  _name: string;
  tags: string[];
  meta: Record<string, any>;
  born: Date;
  profile: { score: number };
}

function makeSchema() {
  return new Schema<BoundaryDoc>({
    name: String,
    _name: String,
    tags: [String],
    meta: { type: Object },
    born: Date,
    profile: new Schema({ score: Number }),
  });
}

function makeModel(adapter: FakePersistenceAdapter, schema = makeSchema()) {
  return {
    modelName: 'BoundaryHarness',
    schema,
    collection: adapter,
    resolveCollection: () => Promise.resolve(adapter),
    mw: { exec: (_op: string, _target: unknown, next: () => unknown) => next() },
  };
}

function seed() {
  return [
    {
      _id: 'doc-a',
      name: 'Ada',
      _name: 'underscore-a',
      tags: ['math'],
      meta: { nested: { count: 1 } },
      born: '2000-01-01T00:00:00.000Z',
      profile: { score: 1 },
    },
    {
      _id: 'doc-b',
      name: 'Victim',
      _name: 'underscore-b',
      tags: ['victim'],
      meta: { nested: { count: 100 } },
      born: '2001-01-01T00:00:00.000Z',
      profile: { score: 100 },
    },
  ];
}

async function loadDoc(adapter: FakePersistenceAdapter, id: string, schema = makeSchema()) {
  const model = makeModel(adapter, schema);
  const doc = (await new Query<any | null, BoundaryDoc>(model, model.schema, adapter)
    .where({ _id: id } as any)
    .setOp('findOne')
    .exec()) as Document<BoundaryDoc> & BoundaryDoc;
  return { model, doc };
}

describe('BMRX-01 document data/runtime isolation', () => {
  it('rejects write-target redirection and leaves the document unchanged on rejected object-form assignment', async () => {
    const adapter = new FakePersistenceAdapter(seed());
    const { doc } = await loadDoc(adapter, 'doc-a');
    const originalSave = doc.save;

    expect(() => doc.set({ __idRaw: 'doc-b', name: 'changed' } as any)).toThrow();
    expect(doc.name).toBe('Ada');
    expect((doc as any)._id).toBe('doc-a');
    expect(doc.isModified()).toBe(false);

    expect(() => doc.set({ save: 'evil' } as any)).toThrow();
    expect(() => doc.set({ schema: {} } as any)).toThrow();
    expect(() => doc.set({ isNew: false } as any)).toThrow();
    expect(() => doc.set({ _id: 'doc-b' } as any)).toThrow();
    expect(() => doc.set('_id' as any, 'doc-b')).toThrow();
    expect(() => doc.set('__idRaw' as any, 'doc-b')).toThrow();
    expect(() => doc.set('schema.options.validateBeforeSave' as any, false)).toThrow();
    expect(doc.save).toBe(originalSave);
    expect(doc.schema.options.validateBeforeSave).not.toBe(false);

    doc.set({ name: 'legit' });
    await doc.save();

    const rows = adapter.snapshot();
    expect(rows.find((r) => r._id === 'doc-a')).toMatchObject({ name: 'legit' });
    expect(rows.find((r) => r._id === 'doc-b')).toMatchObject({ name: 'Victim' });
    expect(adapter.calls.incrementalModify.map((c) => c.id)).toEqual(['doc-a']);
  });

  it('rejects object-form assignment atomically when one key is dangerous', async () => {
    const adapter = new FakePersistenceAdapter(seed());
    const { doc } = await loadDoc(adapter, 'doc-a');

    expect(() => doc.set({ name: 'good', __idRaw: 'doc-b' } as any)).toThrow();
    expect(doc.name).toBe('Ada');
    expect((doc as any)._id).toBe('doc-a');
    expect(doc.isModified()).toBe(false);
    expect(adapter.calls.incrementalModify).toHaveLength(0);
  });

  it('keeps name and _name as independent fields', async () => {
    const adapter = new FakePersistenceAdapter(seed());
    const { doc } = await loadDoc(adapter, 'doc-a');

    expect(doc._name).toBe('underscore-a');
    doc.name = 'renamed' as any;
    expect(doc._name).toBe('underscore-a');
    (doc as any)._name = 'underscore-changed';
    expect(doc.name).toBe('renamed');
    expect(doc.modifiedPaths().sort()).toEqual(['_name', 'name']);

    await doc.save();
    const row = adapter.snapshot().find((r) => r._id === 'doc-a')!;
    expect(row.name).toBe('renamed');
    expect(row._name).toBe('underscore-changed');
  });

  it('rejects JSON dangerous keys without injecting inherited properties', () => {
    const adapter = new FakePersistenceAdapter();
    const model = makeModel(adapter);

    const evilTop = JSON.parse('{"name":"x","__proto__":{"pollutedTop":true}}');
    expect(() => new Document<BoundaryDoc>(evilTop, model.schema, model)).toThrow();
    expect(({} as any).pollutedTop).toBeUndefined();

    const doc = new Document<BoundaryDoc>(
      { name: 'Ada', _name: 'u', tags: [], meta: {}, born: new Date(), profile: { score: 1 } },
      model.schema,
      model,
    );
    expect(() => doc.set(JSON.parse('{"name":"evil","__proto__":{"pollutedSet":true}}') as any)).toThrow();
    expect(doc.name).toBe('Ada');
    expect(({} as any).pollutedSet).toBeUndefined();

    expect(() => doc.set('meta' as any, JSON.parse('{"__proto__":{"pollutedNested":true}}'))).toThrow();
    expect((doc.meta as any).pollutedNested).toBeUndefined();
    expect(({} as any).pollutedNested).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(doc.meta, '__proto__')).toBe(false);

    const plain = doc.toObject();
    expect(Object.prototype.hasOwnProperty.call(plain, '__proto__')).toBe(false);
    expect((plain as any).pollutedTop).toBeUndefined();
  });

  it('isolates caller inputs and virtual-containing toJSON results across arrays, mixed objects, and dates', async () => {
    const adapter = new FakePersistenceAdapter();
    const schema = makeSchema();
    schema.virtual('computed', {}).get(function (this: any) {
      return { label: this.name, tags: this.tags };
    });
    const model = makeModel(adapter, schema);

    const bornInput = new Date('2022-02-02T00:00:00.000Z');
    const input = {
      name: 'Ada',
      _name: 'u',
      tags: ['one'],
      meta: { nested: { count: 1 } },
      born: bornInput,
      profile: { score: 1 },
    };
    const doc = new Document<BoundaryDoc>(input, model.schema, model) as Document<BoundaryDoc> & BoundaryDoc;

    input.tags.push('external');
    input.meta.nested.count = 99;
    input.born.setUTCFullYear(2030);
    input.profile.score = 99;
    expect(doc.tags).toEqual(['one']);
    expect(doc.meta.nested.count).toBe(1);
    expect(doc.born.toISOString()).toBe('2022-02-02T00:00:00.000Z');
    expect(doc.profile.score).toBe(1);

    const external = { nested: { count: 5 } };
    doc.set('meta' as any, external);
    external.nested.count = 50;
    expect(doc.meta.nested.count).toBe(5);

    const externalDeep = { value: 7 };
    doc.set('meta.extra' as any, externalDeep);
    externalDeep.value = 70;
    expect((doc.meta as any).extra.value).toBe(7);

    const json = doc.toJSON();
    expect(json.computed.label).toBe('Ada');
    json.tags.push('evil');
    json.meta.nested.count = 500;
    json.born.setUTCFullYear(2040);
    json.computed.label = 'evil';
    json.computed.tags.push('evil');
    expect(doc.tags).toEqual(['one']);
    expect(doc.meta.nested.count).toBe(5);
    expect(doc.born.getUTCFullYear()).toBe(2022);
    expect(doc.toJSON().computed.label).toBe('Ada');
  });

  it('clones values passed through a virtual setter instead of retaining aliases', () => {
    const adapter = new FakePersistenceAdapter();
    const schema = makeSchema();
    schema.virtual('metaProxy', {}).set(function (this: any, value: any) {
      this.meta = value;
    });
    const model = makeModel(adapter, schema);
    const doc = new Document<BoundaryDoc>(
      { name: 'Ada', _name: 'u', tags: [], meta: {}, born: new Date(), profile: { score: 1 } },
      model.schema,
      model,
    ) as Document<BoundaryDoc> & BoundaryDoc & { metaProxy: any };

    const external = { nested: { count: 1 } };
    doc.set('metaProxy' as any, external);
    external.nested.count = 99;
    expect(doc.meta.nested.count).toBe(1);
  });

  it('rejects schema, virtual, and method name collisions at construction', () => {
    const adapter = new FakePersistenceAdapter();

    const reserved = new Schema({ save: String } as any);
    expect(() => new Document({}, reserved, makeModel(adapter, reserved as any))).toThrow(/reserved/);

    const dup = new Schema({ name: String });
    dup.virtual('name', {});
    expect(() => new Document({}, dup, makeModel(adapter, dup as any))).toThrow(/collides/);

    const methodClash = new Schema({ name: String });
    methodClash.method('save' as any, function (this: any) {
      return 'evil';
    });
    const clashDoc = () => new Document({}, methodClash, makeModel(adapter, methodClash as any));
    expect(clashDoc).toThrow(/collides/);
  });

  it('does not expose runtime state through get()', async () => {
    const adapter = new FakePersistenceAdapter(seed());
    const { doc } = await loadDoc(adapter, 'doc-a');
    expect(doc.get('name')).toBe('Ada');
    expect(doc.get('schema' as any)).toBeUndefined();
    expect(doc.get('__idRaw' as any)).toBeUndefined();
    expect(() => doc.get('meta.__proto__.x' as any)).toThrow();
  });
});
