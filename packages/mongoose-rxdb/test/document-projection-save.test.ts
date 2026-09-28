import { describe, expect, it } from 'vitest';
import {
  Connection,
  Document,
  Query,
  Schema,
  ValidationError,
  WriteNormalizationError,
  type PersistenceRecord,
} from '../src/index';
import { createMemoryDatabase } from '../src/storage/index';
import { normalizeProjection } from '../src/query-compiler';
import { FakePersistenceAdapter } from './support/fake-adapter';

function schemaWithHidden(options: Record<string, any> = {}, validateBeforeSave = true) {
  const child = new Schema<any>({ name: String, secret: { type: String, ...options } });
  return new Schema<any>(
    { title: String, profile: child, members: [child], hidden: { type: String, ...options } },
    { validateBeforeSave },
  );
}

const seed = {
  _id: 'partial-1',
  title: 'before',
  profile: { name: 'Ada', secret: 'stored-profile' }, // pragma: allowlist secret
  members: [{ name: 'Ada', secret: 'stored-member' }], // pragma: allowlist secret
  hidden: 'stored-hidden',
};

function harness(schema = schemaWithHidden(), records: PersistenceRecord[] = [seed]) {
  const adapter = new FakePersistenceAdapter(records);
  const model = { modelName: 'PartialSave', schema, collection: adapter, resolveCollection: async () => adapter };
  const query = () => new Query<any, any>(model, schema, adapter).setOp('findOne');
  return { adapter, model, query };
}

const projections = ['title profile.name members.name', '-profile.secret -members.secret -hidden'];

describe('RMRX-01 projection-aware document saves', () => {
  for (const projection of projections) {
    for (const [kind, options] of Object.entries({
      optional: {},
      required: { required: true },
      immutable: { immutable: true },
      defaulted: { default: 'default-secret' },
    })) {
      it(`${projection}: preserves ${kind} hidden fields on unchanged and safe leaf saves`, async () => {
        const { adapter, query } = harness(schemaWithHidden(options));
        const doc = await query().select(projection);
        await doc.save();
        expect(adapter.calls.incrementalModify).toHaveLength(0);
        doc.title = 'after';
        doc.profile.name = 'Grace';
        await doc.save();
        expect(adapter.snapshot()).toEqual([{ ...seed, title: 'after', profile: { ...seed.profile, name: 'Grace' } }]);
        expect(doc.toObject()).toEqual({
          _id: seed._id,
          title: 'after',
          profile: { name: 'Grace' },
          members: [{ name: 'Ada' }],
        });
        expect(JSON.stringify(doc)).not.toContain('stored-');
        expect(doc.isModified()).toBe(false);
        await doc.save();
        expect(adapter.calls.incrementalModify).toHaveLength(1);
      });

      it(`${projection}: rejects incomplete ${kind} array edits before any mutation`, async () => {
        const { adapter, query } = harness(schemaWithHidden(options));
        const doc = await query().select(projection);
        doc.members[0].name = 'Grace';
        doc.title = 'must-not-commit';
        await expect(doc.save()).rejects.toThrow(WriteNormalizationError);
        expect(adapter.calls.incrementalModify).toHaveLength(0);
        expect(adapter.snapshot()).toEqual([seed]);
        expect(doc.isModified()).toBe(true);
        expect(doc.members[0]).not.toHaveProperty('secret');
      });

      it(`${projection}: rejects explicit replacement over ${kind} hidden object descendants`, async () => {
        const { adapter, query } = harness(schemaWithHidden(options));
        const doc = await query().select(projection);
        doc.set('profile', { name: 'Grace' });
        expect(doc.profile).toEqual({ name: 'Grace' });
        await expect(doc.save()).rejects.toThrow(WriteNormalizationError);
        expect(adapter.calls.incrementalModify).toHaveLength(0);
        expect(adapter.snapshot()).toEqual([seed]);
      });
    }

    for (const edit of ['assign', 'set', 'mark', 'unset', 'null'] as const) {
      it(`${projection}: rejects incomplete object replacement via ${edit}`, async () => {
        const { adapter, query } = harness();
        const doc = await query().select(projection);
        if (edit === 'assign') doc.profile = { name: 'Grace' };
        if (edit === 'set') doc.set('profile', { name: 'Grace' });
        if (edit === 'mark') {
          doc.profile.name = 'Grace';
          doc.markModified('profile');
        }
        if (edit === 'unset') doc.profile = undefined;
        if (edit === 'null') doc.profile = null;
        await expect(doc.save()).rejects.toThrow(WriteNormalizationError);
        expect(adapter.calls.incrementalModify).toHaveLength(0);
        expect(adapter.snapshot()).toEqual([seed]);
      });
    }
  }

  it('keeps defaults absent after a default-disabled upsert and subsequent edits/unsets', async () => {
    const child = new Schema({ name: String, level: { type: Number, default: 3 } });
    const schema = new Schema<any>({
      title: String,
      role: { type: String, default: 'user' },
      profile: child,
      members: [child],
    });
    const { adapter, query } = harness(schema, []);
    const doc = await query().setOperationDescriptor({
      op: 'findOneAndUpdate',
      filter: { _id: seed._id },
      update: { $set: { title: 'before', profile: { name: 'Ada' }, members: [{ name: 'Ada' }] } },
      options: { upsert: true, new: true, setDefaultsOnInsert: false },
    });
    await doc.save();
    expect(adapter.calls.incrementalModify).toHaveLength(0);
    doc.title = 'after';
    doc.profile.name = 'Grace';
    doc.members[0].name = 'Grace';
    await doc.save();
    expect(adapter.snapshot()).toEqual([
      { _id: seed._id, title: 'after', profile: { name: 'Grace' }, members: [{ name: 'Grace' }] },
    ]);
    doc.role = 'admin';
    await doc.save();
    doc.role = undefined;
    await doc.save();
    expect(adapter.snapshot()[0]).not.toHaveProperty('role');
    await doc.save();
    expect(doc.toObject()).not.toHaveProperty('role');
  });

  it.each(['-_id', 'title -_id', { _id: 0 }, { title: 1, _id: 0 }])(
    'rejects missing identity even for unchanged saves: %j',
    async (projection) => {
      const { adapter, query } = harness();
      const doc = await query().select(projection as string | Record<string, 0 | 1>);
      expect(doc._id).toBeUndefined();
      await expect(doc.save()).rejects.toThrow(/save.*_id/i);
      doc.title = 'after';
      await expect(doc.save()).rejects.toThrow(WriteNormalizationError);
      expect(adapter.calls.incrementalModify).toHaveLength(0);
      expect(adapter.snapshot()).toEqual([seed]);
    },
  );

  it('rejects identity omitted by an adapter even without a projection', async () => {
    const { adapter, model } = harness();
    const doc = new Document({ title: 'before' }, model.schema, model, { isNew: false, applyDefaults: false });
    await expect(doc.save()).rejects.toThrow(WriteNormalizationError);
    expect(adapter.calls.incrementalModify).toHaveLength(0);
  });

  it('retains _id by default, supports _id-only no-ops, and forbids editing unselected fields', async () => {
    const { adapter, query } = harness();
    const doc = await query().select('_id');
    expect(doc.toObject()).toEqual({ _id: seed._id });
    await doc.save();
    doc.title = 'after';
    await expect(doc.save()).rejects.toThrow(WriteNormalizationError);
    expect(adapter.calls.incrementalModify).toHaveLength(0);
  });

  it('permits complete subtree replacements and selected dotted scalar unsets', async () => {
    const { adapter, query } = harness();
    const doc = await query().select('profile members');
    doc.profile = { name: 'Grace' };
    doc.members.push({ name: 'Lin' });
    await doc.save();
    expect(adapter.snapshot()[0]).toMatchObject({
      hidden: seed.hidden,
      title: seed.title,
      profile: { name: 'Grace' },
      members: [...seed.members, { name: 'Lin' }],
    });
    const partial = await query().select('profile.name');
    partial.set('profile.name', undefined);
    await partial.save();
    expect(adapter.snapshot()[0].profile).toEqual({});
  });

  it.each(['members.0.name', '-members.0.secret', '-members.9.secret'])(
    'rejects numeric/absent projection array replacements without guessing completeness: %s',
    async (projection) => {
      const { adapter, query } = harness();
      const doc = await query().select(projection);
      doc.members[0].name = 'Grace';
      await expect(doc.save()).rejects.toThrow(WriteNormalizationError);
      expect(adapter.calls.incrementalModify).toHaveLength(0);
      expect(adapter.snapshot()).toEqual([seed]);
    },
  );

  it('keeps safety enabled with validation disabled and suppresses hidden defaults in replacement setters', async () => {
    const { adapter, query } = harness(schemaWithHidden({ default: 'default-secret' }, false));
    const doc = await query().select('profile.name');
    doc.profile = { name: 'Grace' };
    expect(doc.profile).toEqual({ name: 'Grace' });
    await expect(doc.save()).rejects.toThrow(WriteNormalizationError);
    doc.set('profile', { name: 'Lin' });
    expect(doc.profile).toEqual({ name: 'Lin' });
    await expect(doc.save()).rejects.toThrow(WriteNormalizationError);
    expect(adapter.calls.incrementalModify).toHaveLength(0);
  });

  it('does not let query/options or public lookalike metadata change save completeness', async () => {
    const { adapter, query } = harness();
    const projection = { 'profile.secret': 0 as const };
    const q = query().select(projection);
    const doc = await q;
    delete (projection as any)['profile.secret'];
    q.getOptions().projection = {};
    Object.assign(doc, { projection: undefined, selection: undefined, completeness: true });
    doc.profile = { name: 'Grace' };
    await expect(doc.save()).rejects.toThrow(WriteNormalizationError);
    expect(adapter.calls.incrementalModify).toHaveLength(0);
    expect(doc.toObject()).not.toHaveProperty('projection');
  });

  it('owns projection metadata independently of constructor options', async () => {
    const { adapter, model } = harness(schemaWithHidden({ default: 'default-secret' }));
    const projection = normalizeProjection('profile.name')!;
    const doc = new Document<any>({ _id: seed._id, profile: { name: 'Ada' } }, model.schema, model, {
      isNew: false,
      projection,
    });
    projection.mode = 'exclude';
    projection.fields = {};
    expect(doc.toObject()).toEqual({ _id: seed._id, profile: { name: 'Ada' } });
    doc.set('profile', { name: 'Grace' });
    await expect(doc.save()).rejects.toThrow(WriteNormalizationError);
    expect(adapter.calls.incrementalModify).toHaveLength(0);
  });

  it.each(['profile.name members.name', '-profile.secret -members.secret'])(
    'also protects unstructured object/array subtrees: %s',
    async (projection) => {
      const schema = new Schema<any>({ title: String, profile: Object, members: Array, hidden: String });
      const { adapter, query } = harness(schema);
      const doc = await query().select(projection);
      doc.profile.name = 'Grace';
      await doc.save();
      expect(adapter.snapshot()[0].profile.secret).toBe(seed.profile.secret);
      doc.members.push({ name: 'Lin' });
      await expect(doc.save()).rejects.toThrow(WriteNormalizationError);
      expect(adapter.snapshot()[0].members).toEqual(seed.members);
    },
  );

  it('protects nested explicit parents while allowing selected sibling subtrees to be replaced', async () => {
    const child = new Schema({ name: String, secret: String });
    const schema = new Schema<any>({ profile: new Schema({ contact: child, public: child }) });
    const record = { _id: seed._id, profile: { contact: seed.profile, public: { name: 'public' } } };
    const { adapter, query } = harness(schema, [record]);
    const doc = await query().select('profile.contact.name profile.public');
    doc.set('profile.public', { name: 'after' });
    await doc.save();
    doc.set('profile.contact', { name: 'Grace' });
    await expect(doc.save()).rejects.toThrow(WriteNormalizationError);
    expect(adapter.snapshot()[0].profile).toEqual({ contact: seed.profile, public: { name: 'after' } });
  });

  it('validates hidden dynamic requirements against the final record without inserting defaults', async () => {
    const schema = new Schema<any>({
      enabled: Boolean,
      hidden: {
        type: String,
        default: 'default-secret',
        required(this: any) {
          return this.enabled;
        },
      },
    });
    const { adapter, query } = harness(schema, [{ _id: seed._id, enabled: false }]);
    const doc = await query().select('enabled');
    doc.enabled = true;
    await expect(doc.save()).rejects.toMatchObject({
      name: 'ValidationError',
      errors: { hidden: { kind: 'required' } },
    });
    expect(adapter.snapshot()).toEqual([{ _id: seed._id, enabled: false }]);
    expect(doc.toObject()).not.toHaveProperty('hidden');
  });

  it('validates full merged candidates with hidden required and cross-field rules, without leaking data to hooks', async () => {
    const events: string[] = [];
    const schema = new Schema<any>({
      used: {
        type: Number,
        validate(this: any, value: number) {
          return value <= this.limit;
        },
      },
      limit: { type: Number, required: true },
    });
    for (const hook of ['validate', 'save'] as const) {
      schema.pre(hook, function (this: any) {
        expect(this.limit).toBeUndefined();
        events.push(hook);
      });
    }
    const { adapter, query } = harness(schema, [{ _id: seed._id, used: 2, limit: 5 }]);
    const doc = await query().select('used');
    doc.used = 4;
    await doc.save();
    expect(adapter.snapshot()[0]).toEqual({ _id: seed._id, used: 4, limit: 5 });
    expect(events).toEqual(['validate', 'save']);
    expect(doc.toObject()).toEqual({ _id: seed._id, used: 4 });
    doc.used = 6;
    await expect(doc.save()).rejects.toThrow(ValidationError);
    expect(adapter.snapshot()[0].used).toBe(4);
    expect(doc.isModified()).toBe(true);
  });

  it('reports standalone partial validation as incomplete rather than validating missing context', async () => {
    const { adapter, query } = harness(schemaWithHidden({ required: true }));
    const doc = await query().select('title');
    expect(doc.validateSync()).toMatchObject({ name: 'ValidationError', kind: 'projection' });
    await expect(doc.validate()).rejects.toMatchObject({ name: 'ValidationError', kind: 'projection' });
    expect(adapter.calls.incrementalModify).toHaveLength(0);
  });

  it('preserves hidden data and rejects incomplete arrays on real memory storage through find and findOne', async () => {
    const conn = new Connection();
    await conn.connect(() => createMemoryDatabase({ name: `rmrx01_${Date.now()}` }));
    try {
      const Model = conn.model('PartialSave', schemaWithHidden({ required: true }));
      const created = await Model.create(seed);
      const [doc] = await Model.find({ _id: created._id }).select('title profile.name members.name');
      (doc as any).profile.name = 'Grace';
      await doc.save();
      expect(doc.toObject().profile).toEqual({ name: 'Grace' });
      const partial = await Model.findOne({ _id: created._id }).select('-members.secret');
      (partial as any).members[0].name = 'Lin';
      await expect(partial!.save()).rejects.toThrow(WriteNormalizationError);
      const full = await Model.findById(created._id);
      expect(full!.toObject()).toEqual({ ...seed, profile: { ...seed.profile, name: 'Grace' } });
    } finally {
      await conn.disconnect();
    }
  });
});
