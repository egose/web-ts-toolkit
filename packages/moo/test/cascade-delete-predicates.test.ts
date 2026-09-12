import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';

import { cascadeDeletePlugin } from '../dist/index.mjs';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();

// MOO-05: predicate fail-closed regressions. Every case asserts the actual
// deletion set in MongoDB, not just findDependents snapshots.

describe('cascadeDeletePlugin predicate fail-closed (MOO-05)', () => {
  it('missing scalar local keys delete nothing, including null/missing-key records', async () => {
    const childName = 'Moo05MissingChild';
    const parentName = 'Moo05MissingParent';
    const Child = mongoose.model(childName, new mongoose.Schema({ code: { type: String, required: false } }));
    const parentSchema = new mongoose.Schema({ name: String, code: { type: String, required: false } });
    parentSchema.plugin(cascadeDeletePlugin, { model: childName, localField: 'code', foreignField: 'code' });
    const Parent = mongoose.model(parentName, parentSchema);

    await Child.create([{ code: 'ABC' }, {}, { code: 'other' }]);
    // Explicit null foreign key record.
    await Child.collection.insertOne({ code: null });
    const parent = await Parent.create({ name: 'no-code' });

    expect(await parent.findDependents(childName)).toHaveLength(0);
    await parent.deleteOne();

    expect(await Child.countDocuments()).toBe(4);
    expect(await Child.countDocuments({ code: 'ABC' })).toBe(1);
  });

  it('null scalar local keys delete nothing', async () => {
    const childName = 'Moo05NullChild';
    const parentName = 'Moo05NullParent';
    const Child = mongoose.model(childName, new mongoose.Schema({ code: { type: String, required: false } }));
    const parentSchema = new mongoose.Schema({ name: String, code: { type: String, required: false } });
    parentSchema.plugin(cascadeDeletePlugin, { model: childName, localField: 'code', foreignField: 'code' });
    const Parent = mongoose.model(parentName, parentSchema);

    await Child.create([{ code: 'ABC' }, {}]);
    await Child.collection.insertOne({ code: null });
    const parent = await Parent.create({ name: 'null-code', code: null });

    expect(await parent.findDependents(childName)).toHaveLength(0);
    await parent.deleteOne();

    expect(await Child.countDocuments()).toBe(3);
  });

  it('empty reference arrays delete nothing', async () => {
    const childName = 'Moo05EmptyChild';
    const parentName = 'Moo05EmptyParent';
    const Child = mongoose.model(childName, new mongoose.Schema({ name: String }));
    const parentSchema = new mongoose.Schema({
      name: String,
      refs: [{ type: mongoose.Schema.Types.ObjectId, ref: childName, default: [] }],
    });
    parentSchema.plugin(cascadeDeletePlugin, { model: childName, localField: 'refs', foreignField: '_id' });
    const Parent = mongoose.model(parentName, parentSchema);

    const children = await Child.create([{ name: 'c1' }, { name: 'c2' }]);
    expect(children).toHaveLength(2);
    const parent = await Parent.create({ name: 'empty-refs', refs: [] });

    expect(await parent.findDependents(childName)).toHaveLength(0);
    await parent.deleteOne();

    expect(await Child.countDocuments()).toBe(2);
  });

  it('non-empty reference arrays still delete exactly the linked set', async () => {
    const childName = 'Moo05LinkedChild';
    const parentName = 'Moo05LinkedParent';
    const Child = mongoose.model(childName, new mongoose.Schema({ name: String }));
    const parentSchema = new mongoose.Schema({
      name: String,
      refs: [{ type: mongoose.Schema.Types.ObjectId, ref: childName, default: [] }],
    });
    parentSchema.plugin(cascadeDeletePlugin, { model: childName, localField: 'refs', foreignField: '_id' });
    const Parent = mongoose.model(parentName, parentSchema);

    const [linked, unlinked] = await Child.create([{ name: 'linked' }, { name: 'unlinked' }]);
    const parent = await Parent.create({ name: 'p', refs: [linked._id] });

    await parent.deleteOne();

    expect(await Child.countDocuments({ _id: linked._id })).toBe(0);
    expect(await Child.countDocuments({ _id: unlinked._id })).toBe(1);
  });

  it('an extra filter on the relationship field cannot widen the deletion set', async () => {
    const childName = 'Moo05WidenChild';
    const parentName = 'Moo05WidenParent';
    const Child = mongoose.model(
      childName,
      new mongoose.Schema({
        parent: { type: mongoose.Schema.Types.ObjectId, ref: parentName, required: false },
      }),
    );
    const parentSchema = new mongoose.Schema({ name: String });
    // Attempts to widen to every document with a parent; must stay conjunctive.
    parentSchema.plugin(cascadeDeletePlugin, {
      model: childName,
      localField: '_id',
      foreignField: 'parent',
      extraForeignFilter: { parent: { $exists: true } },
    });
    const Parent = mongoose.model(parentName, parentSchema);

    const parentA = await Parent.create({ name: 'a' });
    const parentB = await Parent.create({ name: 'b' });
    await Child.create([{ parent: parentA._id }, { parent: parentB._id }]);
    await Child.collection.insertOne({ parent: null });

    const liveA = await Parent.findById(parentA._id);
    expect(await liveA!.findDependents(childName)).toHaveLength(1);
    await liveA!.deleteOne();

    expect(await Child.countDocuments({ parent: parentA._id })).toBe(0);
    expect(await Child.countDocuments({ parent: parentB._id })).toBe(1);
    expect(await Child.countDocuments()).toBe(2);
  });

  it('an extra filter colliding on the relationship value intersects instead of replacing', async () => {
    const childName = 'Moo05CollideChild';
    const parentName = 'Moo05CollideParent';
    const Child = mongoose.model(
      childName,
      new mongoose.Schema({
        parent: { type: mongoose.Schema.Types.ObjectId, ref: parentName, required: false },
      }),
    );
    const parentSchema = new mongoose.Schema({ name: String, altParent: mongoose.Schema.Types.ObjectId });
    parentSchema.plugin(cascadeDeletePlugin, {
      model: childName,
      localField: '_id',
      foreignField: 'parent',
      extraForeignFilter: (document: unknown) => ({
        parent: { $in: [(document as { _id: unknown })._id, (document as { altParent: unknown }).altParent] },
      }),
    });
    const Parent = mongoose.model(parentName, parentSchema);

    const parentB = await Parent.create({ name: 'b' });
    const parentA = await Parent.create({ name: 'a', altParent: parentB._id });
    await Child.create([{ parent: parentA._id }, { parent: parentB._id }]);

    const liveA = await Parent.findById(parentA._id);
    await liveA!.deleteOne();

    // Old spread behavior would replace { parent: A } with { parent: { $in: [A, B] } }
    // and delete both children. Conjunctive composition deletes only A's child.
    expect(await Child.countDocuments({ parent: parentA._id })).toBe(0);
    expect(await Child.countDocuments({ parent: parentB._id })).toBe(1);
  });

  it('logical operators in the extra filter stay constrained by the relationship', async () => {
    const childName = 'Moo05LogicChild';
    const parentName = 'Moo05LogicParent';
    const Child = mongoose.model(
      childName,
      new mongoose.Schema({
        parent: { type: mongoose.Schema.Types.ObjectId, ref: parentName, required: false },
        status: String,
      }),
    );
    const parentSchema = new mongoose.Schema({ name: String });
    parentSchema.plugin(cascadeDeletePlugin, {
      model: childName,
      localField: '_id',
      foreignField: 'parent',
      extraForeignFilter: { $or: [{ status: 'active' }, { status: 'pending' }] },
    });
    const Parent = mongoose.model(parentName, parentSchema);

    const parent = await Parent.create({ name: 'p' });
    const other = await Parent.create({ name: 'other' });
    await Child.create([
      { parent: parent._id, status: 'active' },
      { parent: parent._id, status: 'archived' },
      { parent: other._id, status: 'active' },
    ]);

    const live = await Parent.findById(parent._id);
    expect(await live!.findDependents(childName)).toHaveLength(1);
    await live!.deleteOne();

    expect(await Child.countDocuments({ parent: parent._id, status: 'active' })).toBe(0);
    expect(await Child.countDocuments({ parent: parent._id, status: 'archived' })).toBe(1);
    expect(await Child.countDocuments({ parent: other._id })).toBe(1);
  });

  it('valid full-filter callbacks keep working; nullish resolver results delete nothing', async () => {
    const childName = 'Moo05FullChild';
    const parentName = 'Moo05FullParent';
    const Child = mongoose.model(childName, new mongoose.Schema({ content: String }));
    const parentSchema = new mongoose.Schema({ name: String });
    parentSchema.plugin(cascadeDeletePlugin, {
      model: childName,
      foreignFilter: () => ({ content: 'to-delete' }),
    });
    const Parent = mongoose.model(parentName, parentSchema);

    await Child.create([{ content: 'to-delete' }, { content: 'keep' }]);
    const parent = await Parent.create({ name: 'p' });
    expect(await parent.findDependents(childName)).toHaveLength(1);
    await parent.deleteOne();
    expect(await Child.countDocuments({ content: 'to-delete' })).toBe(0);
    expect(await Child.countDocuments({ content: 'keep' })).toBe(1);

    const nullChildName = 'Moo05NullResChild';
    const nullParentName = 'Moo05NullResParent';
    const NullChild = mongoose.model(nullChildName, new mongoose.Schema({ content: String }));
    const nullParentSchema = new mongoose.Schema({ name: String });
    nullParentSchema.plugin(cascadeDeletePlugin, {
      model: nullChildName,
      foreignFilter: () => null,
    });
    const NullParent = mongoose.model(nullParentName, nullParentSchema);
    await NullChild.create([{ content: 'to-delete' }]);
    const nullParent = await NullParent.create({ name: 'p' });
    expect(await nullParent.findDependents(nullChildName)).toHaveLength(0);
    await nullParent.deleteOne();
    expect(await NullChild.countDocuments()).toBe(1);
  });

  it('invalid plugin options throw at registration with no deletion possible', async () => {
    const schemaFor = () => new mongoose.Schema({ name: String });

    expect(() =>
      schemaFor().plugin(cascadeDeletePlugin, { model: '', localField: '_id', foreignField: 'parent' } as never),
    ).toThrow('non-empty `model`');

    expect(() => schemaFor().plugin(cascadeDeletePlugin, { model: 'Moo05NoFields' } as never)).toThrow(
      'either `foreignFilter` or both',
    );

    expect(() =>
      schemaFor().plugin(cascadeDeletePlugin, {
        model: 'Moo05EmptyFull',
        foreignFilter: {},
      } as never),
    ).toThrow('rejects empty foreignFilter');

    expect(() =>
      schemaFor().plugin(cascadeDeletePlugin, {
        model: 'Moo05BadFull',
        foreignFilter: 'content',
      } as never),
    ).toThrow('invalid `foreignFilter`');

    expect(() =>
      schemaFor().plugin(cascadeDeletePlugin, {
        model: 'Moo05BadExtra',
        localField: '_id',
        foreignField: 'parent',
        extraForeignFilter: 42,
      } as never),
    ).toThrow('invalid `extraForeignFilter`');
  });

  it('a resolver returning an empty full filter throws instead of deleting everything', async () => {
    const childName = 'Moo05EmptyResChild';
    const parentName = 'Moo05EmptyResParent';
    const Child = mongoose.model(childName, new mongoose.Schema({ content: String }));
    const parentSchema = new mongoose.Schema({ name: String });
    parentSchema.plugin(cascadeDeletePlugin, {
      model: childName,
      foreignFilter: () => ({}),
    });
    const Parent = mongoose.model(parentName, parentSchema);

    await Child.create([{ content: 'a' }, { content: 'b' }]);
    const parent = await Parent.create({ name: 'p' });

    await expect(parent.findDependents(childName)).rejects.toThrow('rejects empty foreignFilter');
    expect(await Child.countDocuments()).toBe(2);
  });

  it('omitted projections throw instead of silently reporting an empty relation', async () => {
    const childName = 'Moo05ProjChild';
    const parentName = 'Moo05ProjParent';
    const Child = mongoose.model(childName, new mongoose.Schema({ code: { type: String, required: false } }));
    const parentSchema = new mongoose.Schema({ name: String, code: { type: String, required: false } });
    parentSchema.plugin(cascadeDeletePlugin, { model: childName, localField: 'code', foreignField: 'code' });
    const Parent = mongoose.model(parentName, parentSchema);

    await Child.create([{ code: 'X' }]);
    const parent = await Parent.create({ name: 'p', code: 'X' });

    // Intentionally empty relation on a fully loaded document: zero dependents, no throw.
    const emptyParent = await Parent.create({ name: 'empty' });
    expect(await emptyParent.findDependents(childName)).toHaveLength(0);

    // Same document with the local field omitted by projection: must throw.
    const projected = await Parent.findById(parent._id).select('name');
    await expect(projected!.findDependents(childName)).rejects.toThrow('was not selected');
    expect(await Child.countDocuments({ code: 'X' })).toBe(1);
  });
});
