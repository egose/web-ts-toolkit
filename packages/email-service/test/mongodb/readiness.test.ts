import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createConnection, connection, Schema } from 'mongoose';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createMongooseEmailStore } from '../../src/mongoose';
import { ADMISSION_ID, jobSchema } from '../../src/stores/mongoose/schema';
import { A, admission, CALL, claim, fixtureId, insert } from '../conformance/store-fixtures';
import {
  ACTIVITIES,
  commandTrace,
  connect,
  dbOf,
  DURABLE,
  fixture,
  JOBS,
  replicaSet,
  standalone,
  uriFor,
} from './fixture';

let repl: MongoMemoryReplSet;
beforeAll(async () => {
  repl = await replicaSet(1);
});
afterAll(async () => repl?.stop());

describe('MongoDB readiness is fail-closed', () => {
  let f: Awaited<ReturnType<typeof fixture>>;
  beforeEach(async () => {
    f = await fixture(repl);
  });
  afterEach(async () => f?.close());

  it('rejects implicit/global or unopened connections and invalid reserved names without I/O', async () => {
    expect(() => createMongooseEmailStore(connection)).toThrow(expect.objectContaining({ code: 'invalid_config' }));
    const closed = createConnection();
    try {
      await expect(createMongooseEmailStore(closed).ready()).rejects.toMatchObject({ code: 'store_unavailable' });
      for (const options of [
        { jobsCollection: ACTIVITIES },
        { jobsModelName: 'EmailActivityV1' },
        { jobsCollection: '$unsafe' },
        { activitiesCollection: { $ne: null } },
        { jobsModelName: 'x'.repeat(65) },
      ]) {
        expect(() => createMongooseEmailStore(f.first, options as never)).toThrow(
          expect.objectContaining({ code: 'invalid_config' }),
        );
      }
    } finally {
      await closed.destroy();
    }
  });

  it('rejects a caller model using a reserved name or either private collection, without altering it', async () => {
    const schema = new Schema({ example: String }, { autoCreate: false, autoIndex: false, bufferCommands: false });
    const trace = commandTrace(f.first);
    try {
      const alias = f.first.model('OtherModel', schema, JOBS);
      await expect(f.primary.ready()).rejects.toMatchObject({ code: 'store_incompatible' });
      expect(f.first.models.OtherModel).toBe(alias);
      f.first.deleteModel('OtherModel');
      const name = f.first.model('EmailActivityV1', schema, 'unrelated');
      await expect(f.primary.ready()).rejects.toMatchObject({ code: 'store_incompatible' });
      expect(f.first.models.EmailActivityV1).toBe(name);
      expect(trace.commands).toHaveLength(0);
    } finally {
      trace.close();
    }
  });

  it.each([
    { collation: { locale: 'en', strength: 2 } },
    { validationLevel: 'moderate' },
    { validationAction: 'warn' },
    { validator: { $jsonSchema: { properties: { version: { enum: [2] } } } } },
    { capped: true, size: 8_192 },
  ])('rejects incompatible collection definitions without repair: %j', async (options) => {
    const db = dbOf(f.second);
    await db.command({ create: JOBS, validator: jobSchema(JOBS).validator, ...options, writeConcern: DURABLE });
    const info = await db.listCollections({ name: JOBS }).toArray();
    await expect(f.primary.ready()).rejects.toMatchObject({ code: 'store_incompatible' });
    await expect(f.primary.findJob(A, fixtureId(1), CALL)).rejects.toMatchObject({ code: 'store_unavailable' });
    expect(await db.listCollections({ name: JOBS }).toArray()).toEqual(info);
    expect(await db.listCollections({ name: ACTIVITIES }).toArray()).toEqual([]);
  });

  it.each([
    { name: ADMISSION_ID, key: { scope: 1, admissionKey: 1 } },
    { name: 'unexpected_ttl', key: { updatedAt: 1 }, expireAfterSeconds: 0 },
    { name: ADMISSION_ID, key: { scope: 1, admissionKey: 1 }, unique: true, collation: { locale: 'en' } },
  ])('rejects an incompatible or extra index instead of dropping it: %j', async (index) => {
    const db = dbOf(f.second);
    await db.command({ create: JOBS, validator: jobSchema(JOBS).validator, writeConcern: DURABLE });
    await db.command({ createIndexes: JOBS, indexes: [index], writeConcern: DURABLE });
    const indexes = await db.collection(JOBS).indexes();
    await expect(f.primary.ready()).rejects.toMatchObject({ code: 'store_incompatible' });
    expect(await db.collection(JOBS).indexes()).toEqual(indexes);
  });

  it('fails when a missing unique index cannot be built and preserves the rows and definitions', async () => {
    const db = dbOf(f.second);
    await f.primary.ready();
    const safe = await insert(f.primary, admission(A, await f.now()));
    await db.collection(JOBS).dropIndex(ADMISSION_ID);
    const old = await db.collection(JOBS).findOne({ scope: A, jobId: safe.jobId });
    await db
      .collection<{ _id: string } & Record<string, unknown>>(JOBS)
      .insertOne({ ...old, _id: `${A}:${fixtureId(1)}`, jobId: fixtureId(1) });
    await expect(f.peer.ready()).rejects.toMatchObject({ code: 'store_incompatible' });
    expect(await db.collection(JOBS).countDocuments()).toBe(2);
    expect((await db.collection(JOBS).indexes()).map((index) => index.name)).not.toContain(ADMISSION_ID);
  });

  it('rejects wrong versions and extra fields at the server, and logically corrupt rows when touched', async () => {
    await f.primary.ready();
    const row = await insert(f.primary, admission(A, await f.now()));
    const collection = dbOf(f.second).collection(JOBS);
    const key = { scope: A, jobId: row.jobId };
    for (const patch of [{ version: 2 }, { rawResponse: 'synthetic private data' }]) {
      await expect(collection.updateOne(key, { $set: patch })).rejects.toMatchObject({ code: 121 });
    }
    await collection.updateOne(key, { $set: { version: 2 } }, { bypassDocumentValidation: true });
    await expect(f.primary.findJob(A, row.jobId, CALL)).rejects.toMatchObject({ code: 'store_incompatible' });
    await collection.updateOne(key, { $set: { version: 1, nextAt: row.createdAt - 1 } });
    await expect(f.primary.findJob(A, row.jobId, CALL)).rejects.toMatchObject({ code: 'store_incompatible' });
    await expect(claim(f.primary, A)).rejects.toMatchObject({ code: 'store_incompatible' });
  });

  it('rejects driver modes that cannot safely execute the primary and abort policy', async () => {
    for (const options of [{ maxAdaptiveRetries: 2 }, { directConnection: true }, { compressors: ['zlib'] as const }]) {
      const client = await connect(uriFor(repl), { ...options } as Parameters<typeof connect>[1]);
      try {
        await expect(createMongooseEmailStore(client).ready()).rejects.toMatchObject({ code: 'store_incompatible' });
      } finally {
        await client.destroy();
      }
    }
  });

  it('rejects a real writable WiredTiger standalone', async () => {
    const mongo = await standalone();
    try {
      const client = await connect(mongo.getUri('email_standalone'));
      try {
        await expect(createMongooseEmailStore(client).ready()).rejects.toMatchObject({ code: 'store_incompatible' });
        expect(await dbOf(client).listCollections().toArray()).toEqual([]);
      } finally {
        await client.destroy();
      }
    } finally {
      await mongo.stop();
    }
  });

  it('rejects a replica set configured without journaled majority by default', async () => {
    const unjournaled = await replicaSet(1);
    try {
      const client = await connect(uriFor(unjournaled));
      try {
        const admin = client.getClient().db('admin');
        const { config } = await admin.command({ replSetGetConfig: 1 });
        await admin.command({
          replSetReconfig: { ...config, version: config.version + 1, writeConcernMajorityJournalDefault: false },
        });
        await expect(createMongooseEmailStore(client).ready()).rejects.toMatchObject({ code: 'store_incompatible' });
        expect(await dbOf(client).listCollections().toArray()).toEqual([]);
      } finally {
        await client.destroy();
      }
    } finally {
      await unjournaled.stop();
    }
  });
});
