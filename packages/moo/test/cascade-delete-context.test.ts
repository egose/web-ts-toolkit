import type { ClientSession } from 'mongoose';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { cascadeDeletePlugin } from '../dist/index.mjs';

const HOOK_TIMEOUT = 120_000;

let replSet: MongoMemoryReplSet | null = null;
let connA: mongoose.Connection | null = null;
let connB: mongoose.Connection | null = null;

type Child = { name: string; parent?: mongoose.Types.ObjectId };
type Parent = { name: string };
type Middle = { name: string; parent?: mongoose.Types.ObjectId };
type Leaf = { name: string; middle?: mongoose.Types.ObjectId };

const parentModelName = 'Moo04Parent';
const childModelName = 'Moo04Child';
const middleModelName = 'Moo04Middle';
const leafModelName = 'Moo04Leaf';

const childSchemaFactory = () =>
  new mongoose.Schema<Child>({
    name: { type: String, required: true },
    parent: { type: mongoose.Schema.Types.ObjectId, ref: parentModelName },
  });

const parentSchemaFactory = () => {
  const schema = new mongoose.Schema<Parent>({ name: { type: String, required: true } });
  schema.plugin(cascadeDeletePlugin, {
    model: childModelName,
    localField: '_id',
    foreignField: 'parent',
  });
  return schema;
};

const buildNested = (connection: mongoose.Connection, hookFailure: { fail: boolean }) => {
  const leafSchema = new mongoose.Schema<Leaf>({
    name: { type: String, required: true },
    middle: { type: mongoose.Schema.Types.ObjectId, ref: middleModelName },
  });
  const LeafModel = connection.model<Leaf>(leafModelName, leafSchema);

  const middleSchema = new mongoose.Schema<Middle>({
    name: { type: String, required: true },
    parent: { type: mongoose.Schema.Types.ObjectId, ref: parentModelName },
  });
  middleSchema.plugin(cascadeDeletePlugin, {
    model: leafModelName,
    localField: '_id',
    foreignField: 'middle',
  });
  if (hookFailure.fail) {
    middleSchema.pre('deleteOne', { document: true, query: false }, async function preFail() {
      throw new Error('moo-04 dependent hook failure');
    });
  }
  const MiddleModel = connection.model<Middle>(middleModelName, middleSchema);

  const nestedParentSchema = new mongoose.Schema<Parent>({ name: { type: String, required: true } });
  nestedParentSchema.plugin(cascadeDeletePlugin, {
    model: middleModelName,
    localField: '_id',
    foreignField: 'parent',
  });
  const NestedParent = connection.model<Parent>(`${parentModelName}Nested`, nestedParentSchema);

  return { LeafModel, MiddleModel, NestedParent };
};

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = replSet.getUri();
  connA = mongoose.createConnection(uri, { dbName: 'moo04a' });
  connB = mongoose.createConnection(uri, { dbName: 'moo04b' });
  await connA.asPromise();
  await connB.asPromise();
  connA.model<Child>(childModelName, childSchemaFactory());
  connB.model<Child>(childModelName, childSchemaFactory());
  connA.model<Parent>(parentModelName, parentSchemaFactory());
  connB.model<Parent>(parentModelName, parentSchemaFactory());
}, HOOK_TIMEOUT);

afterEach(async () => {
  if (connA) {
    await Promise.all(Object.values(connA.collections).map((collection) => collection.deleteMany({})));
  }
  if (connB) {
    await Promise.all(Object.values(connB.collections).map((collection) => collection.deleteMany({})));
  }
});

afterAll(async () => {
  if (connA) await connA.close();
  if (connB) await connB.close();
  if (replSet) await replSet.stop();
}, HOOK_TIMEOUT);

const withSession = async <T>(
  connection: mongoose.Connection,
  fn: (session: ClientSession) => Promise<T>,
): Promise<T> => {
  const session = await connection.startSession();
  try {
    return await fn(session);
  } finally {
    await session.endSession();
  }
};

describe('cascadeDeletePlugin connection and session context (MOO-04)', () => {
  it('keeps identical model names on two connections isolated', async () => {
    const ParentA = connA!.model<Parent>(parentModelName);
    const ChildA = connA!.model<Child>(childModelName);
    const ParentB = connB!.model<Parent>(parentModelName);
    const ChildB = connB!.model<Child>(childModelName);

    const parentA = await ParentA.create({ name: 'a' });
    await ChildA.create({ name: 'child-a', parent: parentA._id });
    const parentB = await ParentB.create({ name: 'b' });
    await ChildB.create({ name: 'child-b', parent: parentB._id });

    await parentA.deleteOne();

    expect(await ChildA.countDocuments()).toBe(0);
    expect(await ParentA.countDocuments()).toBe(0);
    expect(await ChildB.countDocuments()).toBe(1);
    expect(await ParentB.countDocuments()).toBe(1);

    const dependents = await parentB.findDependents(childModelName);
    expect(dependents).toHaveLength(1);
  });

  it('commits parent and dependents with an operation-option session', async () => {
    const ParentA = connA!.model<Parent>(parentModelName);
    const ChildA = connA!.model<Child>(childModelName);

    const parent = await ParentA.create({ name: 'commit-op' });
    await ChildA.create([
      { name: 'c1', parent: parent._id },
      { name: 'c2', parent: parent._id },
    ]);

    await withSession(connA!, async (session) => {
      session.startTransaction();
      const live = await ParentA.findById(parent._id, null, { session });
      await live!.deleteOne({ session });
      await session.commitTransaction();
    });

    expect(await ParentA.countDocuments()).toBe(0);
    expect(await ChildA.countDocuments()).toBe(0);
  });

  it('restores parent and dependents when an operation-option transaction aborts', async () => {
    const ParentA = connA!.model<Parent>(parentModelName);
    const ChildA = connA!.model<Child>(childModelName);

    const parent = await ParentA.create({ name: 'abort-op' });
    await ChildA.create([
      { name: 'c1', parent: parent._id },
      { name: 'c2', parent: parent._id },
    ]);

    await withSession(connA!, async (session) => {
      session.startTransaction();
      const live = await ParentA.findById(parent._id, null, { session });
      await live!.deleteOne({ session });
      // Parent is gone inside the transaction but children must share the session too.
      expect(await ParentA.countDocuments({}, { session } as never)).toBe(0);
      await session.abortTransaction();
    });

    expect(await ParentA.countDocuments()).toBe(1);
    expect(await ChildA.countDocuments()).toBe(2);
  });

  it('commits and aborts with a document-bound session', async () => {
    const ParentA = connA!.model<Parent>(parentModelName);
    const ChildA = connA!.model<Child>(childModelName);

    const parentCommit = await ParentA.create({ name: 'commit-bound' });
    await ChildA.create({ name: 'cc', parent: parentCommit._id });
    await withSession(connA!, async (session) => {
      session.startTransaction();
      await parentCommit.$session(session);
      await parentCommit.deleteOne();
      await session.commitTransaction();
    });
    expect(await ParentA.countDocuments({ name: 'commit-bound' })).toBe(0);
    expect(await ChildA.countDocuments({ name: 'cc' })).toBe(0);

    const parentAbort = await ParentA.create({ name: 'abort-bound' });
    await ChildA.create({ name: 'ca', parent: parentAbort._id });
    await withSession(connA!, async (session) => {
      session.startTransaction();
      await parentAbort.$session(session);
      await parentAbort.deleteOne();
      await session.abortTransaction();
    });
    expect(await ParentA.countDocuments({ name: 'abort-bound' })).toBe(1);
    expect(await ChildA.countDocuments({ name: 'ca' })).toBe(1);
  });

  it('cascades nested levels inside one transaction', async () => {
    const { LeafModel, MiddleModel, NestedParent } = buildNested(connA!, { fail: false });

    const parent = await NestedParent.create({ name: 'nested' });
    const middle = await MiddleModel.create({ name: 'mid', parent: parent._id });
    await LeafModel.create({ name: 'leaf', middle: middle._id });

    await withSession(connA!, async (session) => {
      session.startTransaction();
      const live = await NestedParent.findById(parent._id, null, { session });
      await live!.deleteOne({ session });
      await session.abortTransaction();
    });
    expect(await NestedParent.countDocuments()).toBe(1);
    expect(await MiddleModel.countDocuments()).toBe(1);
    expect(await LeafModel.countDocuments()).toBe(1);

    await withSession(connA!, async (session) => {
      session.startTransaction();
      const live = await NestedParent.findById(parent._id, null, { session });
      await live!.deleteOne({ session });
      await session.commitTransaction();
    });
    expect(await NestedParent.countDocuments()).toBe(0);
    expect(await MiddleModel.countDocuments()).toBe(0);
    expect(await LeafModel.countDocuments()).toBe(0);
  });

  it('restores everything when a dependent hook fails inside a transaction', async () => {
    const fresh = mongoose.createConnection(replSet!.getUri(), { dbName: `moo04fail-${Date.now()}` });
    await fresh.asPromise();
    try {
      const { LeafModel, MiddleModel, NestedParent } = buildNested(fresh, { fail: true });
      const parent = await NestedParent.create({ name: 'hook-fail' });
      const middle = await MiddleModel.create({ name: 'mid', parent: parent._id });
      await LeafModel.create({ name: 'leaf', middle: middle._id });

      const session = await fresh.startSession();
      try {
        session.startTransaction();
        const live = await NestedParent.findById(parent._id, null, { session });
        await expect(live!.deleteOne({ session })).rejects.toThrow('moo-04 dependent hook failure');
        await session.abortTransaction();
      } finally {
        await session.endSession();
      }

      expect(await NestedParent.countDocuments()).toBe(1);
      expect(await MiddleModel.countDocuments()).toBe(1);
      expect(await LeafModel.countDocuments()).toBe(1);
    } finally {
      await fresh.close();
    }
  });

  it('rejects a cross-client session before deleting the parent', async () => {
    const ParentA = connA!.model<Parent>(parentModelName);
    const ChildA = connA!.model<Child>(childModelName);

    const parent = await ParentA.create({ name: 'cross-client' });
    await ChildA.create({ name: 'child', parent: parent._id });

    await withSession(connB!, async (foreignSession) => {
      await expect(parent.deleteOne({ session: foreignSession })).rejects.toThrow('different connection/client');
    });

    expect(await ParentA.countDocuments({ name: 'cross-client' })).toBe(1);
    expect(await ChildA.countDocuments({ name: 'child' })).toBe(1);
  });
});
