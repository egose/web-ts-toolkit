import { describe, expect, it, vi } from 'vitest';
import { Connection, Document, Query, Schema, WriteNormalizationError } from '../src/index';
import { applyProjection, normalizeProjection } from '../src/query-compiler';
import { createMemoryDatabase } from '../src/storage/index';
import { FakePersistenceAdapter } from './support/fake-adapter';

const members = [0, 1, 2].map((index) => ({ name: `name-${index}`, secret: `hidden-${index}` })); // pragma: allowlist secret
const cases = [
  ...[0, 1, 2].map((index) => ({
    label: `numeric ${index}`,
    projection: `members.${index}.name`,
    members,
    expected: members.map((member, i) => (i === index ? { name: member.name } : null)),
  })),
  ...[0, 1, 2].map((index) => ({
    label: `missing ${index}`,
    projection: 'members.name',
    members: members.map((member, i) => (i === index ? { secret: member.secret } : member)),
    expected: members.map((member, i) => (i === index ? null : { name: member.name })),
  })),
  { label: 'all missing', projection: 'members.absent', members, expected: undefined },
  { label: 'out of bounds', projection: 'members.9.name', members, expected: undefined },
  {
    label: 'union',
    projection: 'members.0.name members.2.name',
    members,
    expected: [{ name: 'name-0' }, null, { name: 'name-2' }],
  },
];

function makeSchema(structured: boolean, validateBeforeSave: boolean, fallback = () => 'must-not-appear') {
  const child = new Schema({
    name: String,
    secret: { type: String, required: true, immutable: true },
    absent: { type: String, default: fallback },
  });
  return new Schema<any>(
    { title: String, members: structured ? [child] : Array, hidden: { type: String, default: fallback } },
    { validateBeforeSave },
  );
}

describe('RMRX-11 dense redacted array representation', () => {
  for (const structured of [true, false]) {
    for (const validateBeforeSave of [true, false]) {
      for (const operation of ['find', 'findOne'] as const) {
        it(`real memory: structured=${structured}, validation=${validateBeforeSave}, ${operation}`, async () => {
          const connection = new Connection();
          await connection.connect(() => createMemoryDatabase({ name: `rmrx11_${Date.now()}` }));
          try {
            const fallback = vi.fn(() => 'must-not-appear');
            const M = connection.model('ArrayProjection', makeSchema(structured, validateBeforeSave, fallback));
            const adapter = await M.resolveCollection();
            const modify = vi.spyOn(adapter, 'incrementalModify');
            const insert = vi.spyOn(adapter, 'insert');
            for (const [index, testCase] of cases.entries()) {
              const record = { _id: `case-${index}`, title: 'before', members: testCase.members };
              // Deliberately omit defaults in storage, including the selected missing field.
              await M.updateOne(
                { _id: record._id },
                { $set: { title: record.title, members: record.members } },
                { upsert: true, setDefaultsOnInsert: false },
              );
              modify.mockClear();
              insert.mockClear();
              const base = M[operation]({ _id: record._id }).select(`title ${testCase.projection}`);
              const leanQuery = base.clone().lean();
              const hydratedQuery = base.clone();
              // Mutating the original after cloning must not change either read's selection.
              base.select('hidden');
              const leanResult = await leanQuery;
              const result = await hydratedQuery;
              const lean = operation === 'find' ? (leanResult as any[])[0] : leanResult;
              const doc = operation === 'find' ? (result as any[])[0] : (result as any);
              const expected = {
                _id: record._id,
                title: 'before',
                ...(testCase.expected === undefined ? {} : { members: testCase.expected }),
              };
              expect(lean, testCase.label).toEqual(expected);
              expect(doc.toObject(), testCase.label).toEqual(expected);
              expect(doc.toJSON()).toEqual(expected);
              expect(JSON.parse(JSON.stringify(doc))).toEqual(expected);
              if (doc.members) expect(Object.keys(doc.members)).toEqual(['0', '1', '2']);
              expect(doc.validateSync()).toMatchObject({ kind: 'projection' });
              await expect(doc.validate()).rejects.toMatchObject({ kind: 'projection' });
              expect(doc.modifiedPaths()).toEqual([]);
              await doc.save();
              expect(modify).not.toHaveBeenCalled();
              doc.title = 'after';
              await doc.save();
              expect(modify).toHaveBeenCalledTimes(1);
              expect(doc.toObject()).toEqual({ ...expected, title: 'after' });
              expect(await M.findOne({ _id: record._id }).lean()).toEqual({ ...record, title: 'after' });
              expect(doc.isModified()).toBe(false);
              await doc.save();
              expect(modify).toHaveBeenCalledTimes(1);

              // Changed incomplete arrays must never reach the adapter, even alongside a safe edit.
              modify.mockClear();
              if (doc.members) {
                const visible = doc.members.find((member: any) => member !== null);
                visible.name = 'unsafe';
              } else doc.members = [{ name: 'unsafe' }];
              doc.title = 'must-not-commit';
              await expect(doc.save()).rejects.toThrow(/incomplete projected path/);
              expect(modify).not.toHaveBeenCalled();
              expect(insert).not.toHaveBeenCalled();
              expect(await M.findOne({ _id: record._id }).lean()).toEqual({ ...record, title: 'after' });
              expect(JSON.stringify(doc)).not.toContain('hidden-');
            }
            expect(fallback).not.toHaveBeenCalled();
          } finally {
            await connection.disconnect();
          }
        });
      }
    }
  }

  it.each([0, 1, 2])('numeric exclusion preserves positions when removing index %s', async (index) => {
    const schema = makeSchema(true, true);
    const record = { _id: 'exclude', title: 'before', members };
    const adapter = new FakePersistenceAdapter([record]);
    const model = { schema, collection: adapter };
    const query = () => new Query<any, any>(model, schema, adapter).setOp('findOne').select(`-members.${index}`);
    const doc = await query();
    const expected = members.map((member, i) => (i === index ? null : member));
    expect((await query().lean()).members).toEqual(expected);
    expect(doc.toObject().members).toEqual(expected);
    await doc.save();
    expect(adapter.calls.incrementalModify).toHaveLength(0);
    doc.title = 'after';
    await doc.save();
    expect(adapter.snapshot()).toEqual([{ ...record, title: 'after' }]);
    doc.members.splice(index, 1);
    await expect(doc.save()).rejects.toThrow(WriteNormalizationError);
    expect(adapter.calls.incrementalModify).toHaveLength(1);
  });

  it('merges nested array selections without exposing siblings or compacting inner/outer indexes', async () => {
    const record = {
      _id: 'nested',
      title: 'before',
      groups: [
        [{ name: 'a', secret: 'hidden-a' }, { secret: 'hidden-b' }], // pragma: allowlist secret
        [{ secret: 'hidden-c' }, { name: 'd', secret: 'hidden-d' }], // pragma: allowlist secret
        [{ secret: 'hidden-e' }], // pragma: allowlist secret
      ],
    };
    const schema = new Schema<any>({ title: String, groups: Array });
    const adapter = new FakePersistenceAdapter([record]);
    const query = () =>
      new Query<any, any>({ schema, collection: adapter }, schema, adapter)
        .setOp('findOne')
        .select('title groups.0.name groups.1.1.name');
    const expected = [[{ name: 'a' }, null], [null, { name: 'd' }], null];
    expect((await query().lean()).groups).toEqual(expected);
    const doc = await query();
    expect(doc.toObject().groups).toEqual(expected);
    doc.title = 'after';
    await doc.save();
    expect(adapter.snapshot()).toEqual([{ ...record, title: 'after' }]);
    doc.groups[1][1].name = 'unsafe';
    await expect(doc.save()).rejects.toThrow(WriteNormalizationError);
    expect(adapter.calls.incrementalModify).toHaveLength(1);
  });

  it('retains selected null and false/zero primitive values and unions fields in either order', () => {
    for (const selection of ['members.0.name members.1.name', 'members.1.name members.0.name']) {
      expect(applyProjection({ members }, normalizeProjection(selection)).members).toEqual([
        { name: 'name-0' },
        { name: 'name-1' },
        null,
      ]);
    }
    for (const value of [null, false, 0]) {
      expect(applyProjection({ values: [1, value, 3] }, normalizeProjection('values.1'))).toEqual({
        values: [null, value, null],
      });
    }
    const record = {
      members: [
        { name: 'Ada', age: 3, secret: 'hidden' }, // pragma: allowlist secret
        { name: 'Lin', age: 4, secret: 'hidden' }, // pragma: allowlist secret
      ],
    };
    for (const selection of [
      'members.name members.age',
      'members.age members.name',
      'members.0.name members.0.age members.1.name members.1.age',
    ]) {
      expect(applyProjection(record, normalizeProjection(selection)).members).toEqual([
        { name: 'Ada', age: 3 },
        { name: 'Lin', age: 4 },
      ]);
    }
  });

  it.each([true, false])(
    'real memory: nested structured and primitive arrays, validation=%s',
    async (validateBeforeSave) => {
      const connection = new Connection();
      await connection.connect(() => createMemoryDatabase({ name: `rmrx11_nested_${Date.now()}` }));
      try {
        const schema = new Schema<any>(
          {
            profile: new Schema({ count: Number, at: Date, members: [new Schema({ name: String, secret: String })] }),
            numbers: [Number],
            flags: [Boolean],
            mixed: Array,
          },
          { validateBeforeSave },
        );
        const M = connection.model('NestedProjection', schema);
        const at = new Date('2024-01-01T00:00:00.000Z');
        const record = {
          _id: 'nested',
          profile: { count: 1, at, members },
          numbers: [1, 0, 3],
          flags: [true, false, true],
          mixed: [null, { name: 'Ada', secret: 'hidden' }, 7], // pragma: allowlist secret
        };
        await M.create(record);
        const modify = vi.spyOn(await M.resolveCollection(), 'incrementalModify');
        const base = M.findOne().select('profile.count profile.at profile.members.2.name numbers.1 flags.1 mixed.name');
        const lean = await base.clone().lean();
        const doc = await base;
        expect(doc!.toObject()).toEqual(lean);
        expect(doc!.toObject()).toEqual({
          _id: record._id,
          profile: { count: 1, at, members: [null, null, { name: 'name-2' }] },
          numbers: [null, 0, null],
          flags: [null, false, null],
          mixed: [null, { name: 'Ada' }, null],
        });
        await doc!.save();
        expect(modify).not.toHaveBeenCalled();
        doc!.set('profile.count', '2');
        doc!.set('profile.at', '2025-01-01');
        await doc!.save();
        const after = { ...record, profile: { ...record.profile, count: 2, at: new Date('2025-01-01') } };
        expect((await M.findById(record._id))!.toObject()).toEqual(after);
        await doc!.save();
        expect(modify).toHaveBeenCalledTimes(1);
        // Serialization is an owned copy; mutating it cannot edit the live record.
        doc!.toObject().profile.members[2].name = 'copy-only';
        expect(doc!.get('profile.members.2.name')).toBe('name-2');
        doc!.set('numbers.1', 9);
        await expect(doc!.save()).rejects.toThrow(/incomplete projected path/);
        expect(modify).toHaveBeenCalledTimes(1);
        expect((await M.findById(record._id))!.toObject()).toEqual(after);
      } finally {
        await connection.disconnect();
      }
    },
  );

  it.each(['replace', 'push', 'splice', 'unset', 'null', 'fill slot', 'mark parent'])(
    'rejects changed incomplete arrays through %s before any writes',
    async (edit) => {
      const schema = makeSchema(true, false);
      const record = { _id: 'edits', title: 'before', members };
      const adapter = new FakePersistenceAdapter([record]);
      const doc = await new Query<any, any>({ schema, collection: adapter }, schema, adapter)
        .setOp('findOne')
        .select('title members.1.name');
      if (edit === 'replace') doc.members = [{ name: 'replacement' }];
      if (edit === 'push') doc.members.push({ name: 'new' });
      if (edit === 'splice') doc.members.splice(0, 1);
      if (edit === 'unset') doc.members = undefined;
      if (edit === 'null') doc.members = null;
      if (edit === 'fill slot') doc.set('members.0', { name: 'new' });
      if (edit === 'mark parent') {
        doc.members[1].name = 'new';
        doc.markModified('members');
      }
      doc.title = 'unsafe';
      Object.assign(doc, { projection: undefined, selection: undefined, completeness: true });
      await expect(doc.save()).rejects.toThrow(/incomplete projected path/);
      expect(adapter.calls.incrementalModify).toHaveLength(0);
      expect(adapter.snapshot()).toEqual([record]);
    },
  );

  for (const structured of [true, false]) {
    for (const validateBeforeSave of [true, false]) {
      it(`rejects forged sparse ingress and live holes: structured=${structured}, validation=${validateBeforeSave}`, async () => {
        const schema = makeSchema(structured, validateBeforeSave);
        const record = { _id: 'boundary', title: 'before', members };
        const adapter = new FakePersistenceAdapter([record]);
        const model = { schema, collection: adapter };
        const projection = normalizeProjection('title members.1.name')!;
        const sparse = new Array(3);
        sparse[1] = { name: 'selected' };
        expect(
          () =>
            new Document({ ...record, members: sparse }, schema, model, {
              isNew: false,
              projection,
              applyDefaults: false,
            }),
        ).toThrow(/sparse arrays/);
        const query = () => new Query<any, any>(model, schema, adapter).setOp('findOne').select('title members.1.name');
        const doc = await query();
        const before = doc.toObject();
        for (const set of [
          () => doc.set('members', sparse),
          () => doc.set({ title: 'unsafe', members: sparse }),
          () => {
            doc.members = sparse;
          },
        ]) {
          expect(set).toThrow(/sparse arrays/);
          expect(doc.toObject()).toEqual(before);
        }
        delete doc.members[0];
        for (const read of [
          () => doc.toObject(),
          () => doc.toJSON(),
          () => doc.isModified(),
          () => doc.set('title', 'unsafe'),
        ])
          expect(read).toThrow(/sparse arrays/);
        await expect(doc.save()).rejects.toThrow(/sparse arrays/);
        expect(adapter.calls.incrementalModify).toHaveLength(0);
        expect(adapter.snapshot()).toEqual([record]);
        // Projection options do not exempt caller data from cycles/work/depth checks.
        const cycle: any[] = [];
        cycle.push(cycle);
        let deep: any = {};
        for (let i = 0; i < 60; i++) deep = { next: deep };
        for (const invalid of [cycle, Array(2100).fill(null), [deep]]) {
          expect(() => new Document({ members: invalid }, schema, model, { projection })).toThrow(
            WriteNormalizationError,
          );
        }
      });
    }
  }
});
