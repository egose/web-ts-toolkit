import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';

import { cascadeDeletePlugin } from '../dist/index.mjs';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();

// MOO-06: hook-data + bounded-traversal regressions. Public findDependents()
// keeps its array API; deletion uses internal _id paging + bounded in-flight
// document deletes (never bulk writes).

describe('cascadeDeletePlugin traversal and bounds (MOO-06)', () => {
  it('deletes three levels over custom local fields with hooks reading required fields', async () => {
    const topName = 'Moo06Top';
    const midName = 'Moo06Mid';
    const leafName = 'Moo06Leaf';
    const seenMiddleParentCodes: unknown[] = [];
    const seenLeafCodes: unknown[] = [];
    const seenLeafSecrets: unknown[] = [];

    const leafSchema = new mongoose.Schema({ middleCode: String, secret: String });
    leafSchema.pre('deleteOne', { document: true, query: false }, async function hook() {
      const self = this as unknown as { get(p: string): unknown };
      seenLeafCodes.push(self.get('middleCode'));
      seenLeafSecrets.push(self.get('secret'));
    });
    const Leaf = mongoose.model(leafName, leafSchema);
    const midSchema = new mongoose.Schema({ code: String, parentCode: String });
    midSchema.plugin(cascadeDeletePlugin, {
      model: leafName,
      localField: 'code',
      foreignField: 'middleCode',
    });
    midSchema.pre('deleteOne', { document: true, query: false }, async function hook() {
      seenMiddleParentCodes.push((this as unknown as { get(p: string): unknown }).get('parentCode'));
    });
    const Mid = mongoose.model(midName, midSchema);

    const topSchema = new mongoose.Schema({ code: String });
    topSchema.plugin(cascadeDeletePlugin, {
      model: midName,
      localField: 'code',
      foreignField: 'parentCode',
    });
    const leafHookSchema = Leaf.schema;
    void leafHookSchema;
    const Top = mongoose.model(topName, topSchema);

    const top = await Top.create({ code: 'T1' });
    const otherTop = await Top.create({ code: 'T-OTHER' });
    await Mid.create([
      { code: 'M1', parentCode: 'T1' },
      { code: 'M-OTHER', parentCode: 'T-OTHER' },
    ]);
    await Leaf.create([
      { middleCode: 'M1', secret: 's1' }, // pragma: allowlist secret
      { middleCode: 'M1', secret: 's2' }, // pragma: allowlist secret
      { middleCode: 'M-OTHER', secret: 'keep' }, // pragma: allowlist secret
    ]);

    await top.deleteOne();

    expect(await Mid.countDocuments({ parentCode: 'T1' })).toBe(0);
    expect(await Leaf.countDocuments({ middleCode: 'M1' })).toBe(0);
    expect(await Top.countDocuments({ _id: otherTop._id })).toBe(1);
    expect(await Mid.countDocuments({ code: 'M-OTHER' })).toBe(1);
    expect(await Leaf.countDocuments({ secret: 'keep' })).toBe(1); // pragma: allowlist secret
    expect(seenMiddleParentCodes).toEqual(['T1']);
    expect(seenLeafCodes).toEqual(expect.arrayContaining(['M1', 'M1']));
    expect(seenLeafSecrets).toEqual(expect.arrayContaining(['s1', 's2']));
  });

  it('tolerates repeated references to the same dependent exactly once', async () => {
    const childName = 'Moo06RepeatChild';
    const parentName = 'Moo06RepeatParent';
    let hookCalls = 0;

    const childSchema = new mongoose.Schema({ name: String });
    childSchema.pre('deleteOne', { document: true, query: false }, async () => {
      hookCalls += 1;
    });
    const Child = mongoose.model(childName, childSchema);
    const parentSchema = new mongoose.Schema({
      name: String,
      refs: [{ type: mongoose.Schema.Types.ObjectId, ref: childName, default: [] }],
    });
    parentSchema.plugin(cascadeDeletePlugin, {
      model: childName,
      localField: 'refs',
      foreignField: '_id',
    });
    const Parent = mongoose.model(parentName, parentSchema);

    const child = await Child.create({ name: 'dup' });
    const other = await Child.create({ name: 'other' });
    const parent = await Parent.create({ name: 'p', refs: [child._id, child._id, child._id] });

    await parent.deleteOne();

    expect(await Child.countDocuments({ _id: child._id })).toBe(0);
    expect(await Child.countDocuments({ _id: other._id })).toBe(1);
    expect(hookCalls).toBe(1);
  });

  it('terminates on diamond fixtures with shared leaves and unrelated records surviving', async () => {
    const topName = 'Moo06DiamondTop';
    const midName = 'Moo06DiamondMid';
    const leafName = 'Moo06DiamondLeaf';
    let leafHookCalls = 0;

    const diamondLeafSchema = new mongoose.Schema({ midCode: String, tag: String });
    diamondLeafSchema.pre('deleteOne', { document: true, query: false }, async () => {
      leafHookCalls += 1;
    });
    const Leaf = mongoose.model(leafName, diamondLeafSchema);
    const midSchema = new mongoose.Schema({ code: String, parentCode: String });
    midSchema.plugin(cascadeDeletePlugin, {
      model: leafName,
      localField: 'code',
      foreignField: 'midCode',
    });
    const Mid = mongoose.model(midName, midSchema);
    const topSchema = new mongoose.Schema({ code: String });
    topSchema.plugin(cascadeDeletePlugin, {
      model: midName,
      localField: 'code',
      foreignField: 'parentCode',
    });
    const Top = mongoose.model(topName, topSchema);

    const top = await Top.create({ code: 'DT' });
    // Two middles share one leaf code: both cascade paths reach the same rows.
    await Mid.create([
      { code: 'SHARED', parentCode: 'DT' },
      { code: 'SHARED', parentCode: 'DT' },
    ]);
    await Leaf.create([
      { midCode: 'SHARED', tag: 'shared-1' },
      { midCode: 'SHARED', tag: 'shared-2' },
      { midCode: 'ELSEWHERE', tag: 'keep' },
    ]);

    await top.deleteOne();

    expect(await Mid.countDocuments({ parentCode: 'DT' })).toBe(0);
    expect(await Leaf.countDocuments({ midCode: 'SHARED' })).toBe(0);
    expect(await Leaf.countDocuments({ tag: 'keep' })).toBe(1);
    expect(leafHookCalls).toBeGreaterThanOrEqual(2);
  });

  it('terminates on cyclic A<->B references', async () => {
    const aName = 'Moo06CycleA';
    const bName = 'Moo06CycleB';

    const bSchema = new mongoose.Schema({
      name: String,
      aRef: { type: mongoose.Schema.Types.ObjectId, ref: aName, required: false },
    });
    bSchema.plugin(cascadeDeletePlugin, {
      model: aName,
      localField: '_id',
      foreignField: 'bRef',
    });
    const B = mongoose.model(bName, bSchema);

    const aSchema = new mongoose.Schema({
      name: String,
      bRef: { type: mongoose.Schema.Types.ObjectId, ref: bName, required: false },
    });
    aSchema.plugin(cascadeDeletePlugin, {
      model: bName,
      localField: '_id',
      foreignField: 'aRef',
    });
    const A = mongoose.model(aName, aSchema);

    const a1 = await A.create({ name: 'a1' });
    const b1 = await B.create({ name: 'b1', aRef: a1._id });
    a1.set('bRef', b1._id);
    await a1.save();
    await A.create({ name: 'a2' });
    await B.create({ name: 'b2' });

    const live = await A.findById(a1._id);
    await live!.deleteOne();

    expect(await A.countDocuments({ name: 'a1' })).toBe(0);
    expect(await B.countDocuments({ name: 'b1' })).toBe(0);
    expect(await A.countDocuments({ name: 'a2' })).toBe(1);
    expect(await B.countDocuments({ name: 'b2' })).toBe(1);
  });

  it('fails fast with partial results when a dependent hook throws (parent already deleted)', async () => {
    const childName = 'Moo06FailChild';
    const parentName = 'Moo06FailParent';

    const childSchema = new mongoose.Schema({
      name: String,
      parent: mongoose.Schema.Types.ObjectId,
    });
    childSchema.pre('deleteOne', { document: true, query: false }, async function hook() {
      if ((this as unknown as { get(p: string): unknown }).get('name') === 'boom') {
        throw new Error('moo-06 dependent hook failure');
      }
    });
    const Child = mongoose.model(childName, childSchema);
    const parentSchema = new mongoose.Schema({ name: String });
    parentSchema.plugin(cascadeDeletePlugin, {
      model: childName,
      localField: '_id',
      foreignField: 'parent',
      maxConcurrency: 1,
      batchSize: 2,
    });
    const Parent = mongoose.model(parentName, parentSchema);

    const parent = await Parent.create({ name: 'p' });
    await Child.create([
      { name: 'ok-1', parent: parent._id },
      { name: 'boom', parent: parent._id },
      { name: 'never-attempted', parent: parent._id },
    ]);

    await expect(parent.deleteOne()).rejects.toThrow('moo-06 dependent hook failure');

    // Documented partial-failure outcome: the parent row is already removed by
    // the post hook, the first dependent is gone, the failing row survives,
    // and later batches are never fetched.
    expect(await Parent.countDocuments({ _id: parent._id })).toBe(0);
    expect(await Child.countDocuments({ name: 'ok-1' })).toBe(0);
    expect(await Child.countDocuments({ name: 'boom' })).toBe(1);
    expect(await Child.countDocuments({ name: 'never-attempted' })).toBe(1);
  });

  it('rejects invalid traversal limits at registration', () => {
    const schemaFor = () => new mongoose.Schema({ name: String });
    expect(() =>
      schemaFor().plugin(cascadeDeletePlugin, {
        model: 'Moo06BadConcurrency',
        localField: '_id',
        foreignField: 'parent',
        maxConcurrency: 0,
      } as never),
    ).toThrow('`maxConcurrency`');
    expect(() =>
      schemaFor().plugin(cascadeDeletePlugin, {
        model: 'Moo06BadBatch',
        localField: '_id',
        foreignField: 'parent',
        batchSize: 1.5,
      } as never),
    ).toThrow('`batchSize`');
  });

  it('runs a reproducible bounded fan-out experiment and respects max in-flight', async () => {
    const childName = 'Moo06FanChild';
    const parentName = 'Moo06FanParent';
    const DATASET_SIZE = 40;
    const MAX_CONCURRENCY = 4;
    const BATCH_SIZE = 10;

    let current = 0;
    let peak = 0;
    let hookCalls = 0;
    const childSchema = new mongoose.Schema({
      name: String,
      parent: mongoose.Schema.Types.ObjectId,
    });
    childSchema.pre('deleteOne', { document: true, query: false }, async () => {
      current += 1;
      hookCalls += 1;
      if (current > peak) peak = current;
      await new Promise((resolve) => setTimeout(resolve, 15));
      current -= 1;
    });
    const Child = mongoose.model(childName, childSchema);
    const parentSchema = new mongoose.Schema({ name: String });
    parentSchema.plugin(cascadeDeletePlugin, {
      model: childName,
      localField: '_id',
      foreignField: 'parent',
      maxConcurrency: MAX_CONCURRENCY,
      batchSize: BATCH_SIZE,
    });
    const Parent = mongoose.model(parentName, parentSchema);

    const parent = await Parent.create({ name: 'fan' });
    const rows = Array.from({ length: DATASET_SIZE }, (_, i) => ({ name: `c-${i}`, parent: parent._id }));
    await Child.create(rows);

    let findCalls = 0;
    let findByIdCalls = 0;
    const originalFind = Child.find.bind(Child);
    const originalFindById = Child.findById.bind(Child);
    (Child as unknown as Record<string, unknown>).find = (...args: unknown[]) => {
      findCalls += 1;
      return (originalFind as (...a: unknown[]) => unknown)(...args) as never;
    };
    (Child as unknown as Record<string, unknown>).findById = (...args: unknown[]) => {
      findByIdCalls += 1;
      return (originalFindById as (...a: unknown[]) => unknown)(...args) as never;
    };

    const memBefore = process.memoryUsage().heapUsed;
    const startedAt = Date.now();
    try {
      await parent.deleteOne();
    } finally {
      (Child as unknown as Record<string, unknown>).find = originalFind;
      (Child as unknown as Record<string, unknown>).findById = originalFindById;
    }
    const elapsedMs = Date.now() - startedAt;
    const memAfter = process.memoryUsage().heapUsed;

    expect(await Child.countDocuments({ parent: parent._id })).toBe(0);
    expect(hookCalls).toBe(DATASET_SIZE);
    // Bounded: peak never exceeds the configured limit and never schedules
    // the whole fan-out at once (old Promise.all peaked at DATASET_SIZE).
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(MAX_CONCURRENCY);
    expect(peak).toBeLessThan(DATASET_SIZE);

    // Reproducible evidence recorded with the run (no comparative speed
    // claim: batching bounds memory/concurrency, it is not asserted faster).
    console.log(
      JSON.stringify({
        experiment: 'moo-06-fan-out',
        datasetSize: DATASET_SIZE,
        maxConcurrency: MAX_CONCURRENCY,
        batchSize: BATCH_SIZE,
        idPageFindCalls: findCalls,
        hydratedFindByIdCalls: findByIdCalls,
        hookCalls,
        peakInFlight: peak,
        elapsedMs,
        heapUsedBefore: memBefore,
        heapUsedAfter: memAfter,
      }),
    );
  });
});
