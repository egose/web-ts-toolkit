import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { setTimeout as sleep } from 'node:timers/promises';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { connection, createConnection, mongo, Schema, type Connection } from 'mongoose';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AttachmentRef } from '../../src';
import { createMongooseAttachmentStore } from '../../src/attachments/mongoose';
import { attachmentValidator } from '../../src/attachments/mongoose/records';
import { managedAttachmentKey, managedVersion } from '../../src/attachments/records';
import { createMongooseEmailStore } from '../../src/mongoose';
import { MANAGED_BINDING, managedInput, resolveContext } from '../conformance/managed-attachment-fixture';
import { registerManagedAttachmentConformance } from '../conformance/managed-attachment-suite';
import { capacity } from '../conformance/smtp-capacity-fixture';
import { latch } from '../smtp/loopback';
import {
  ACTIVITIES,
  checkScratch,
  commandTrace,
  connect,
  dbOf,
  DURABLE,
  intercept,
  JOBS,
  replicaSet,
  serverNow,
  standalone,
  TEST_PARAMETERS,
  uriFor,
  waitForTime,
  withFailPoint,
} from './fixture';

const NAME = 'email_attachments';
const MAX_BYTES = 2 * 1024 * 1024;
const HOLD = 86_400_000 + 121_000;
const OPTIONS = { readPreference: 'secondaryPreferred', w: 1, journal: false, promoteBuffers: true } as const;
const REOPEN = { ...OPTIONS, monitorCommands: true, maxAdaptiveRetries: 0, serverSelectionTimeoutMS: 4_000 };

let repl: MongoMemoryReplSet;
beforeAll(async () => {
  checkScratch();
  repl = await MongoMemoryReplSet.create({
    binary: { version: process.env.MONGOMS_VERSION ?? '8.2.6' },
    replSet: {
      count: 1,
      storageEngine: 'wiredTiger',
      args: [...TEST_PARAMETERS, '--setParameter', 'ttlMonitorSleepSecs=1'],
    },
  });
});
afterAll(async () => repl?.stop());

function rows(c: Connection, name = NAME) {
  return dbOf(c).collection<{ _id: string } & mongo.Document>(name);
}

function key(scope: string, ref: AttachmentRef): string {
  return managedAttachmentKey(MANAGED_BINDING.namespace, scope, ref);
}

async function openFixture() {
  const uri = uriFor(repl);
  const first = await connect(uri, OPTIONS);
  try {
    const second = await connect(uri);
    return {
      uri,
      first,
      second,
      writer: createMongooseAttachmentStore(first, MANAGED_BINDING),
      peer: createMongooseAttachmentStore(second, MANAGED_BINDING),
      async close() {
        try {
          await second.dropDatabase();
        } finally {
          await Promise.all([first.destroy(), second.destroy()]);
        }
      },
    };
  } catch (error) {
    await first.destroy();
    throw error;
  }
}

registerManagedAttachmentConformance('MongoDB replica set', async () => {
  const f = await openFixture();
  let lost: ReturnType<typeof intercept> | undefined;
  try {
    await f.writer.ready({ install: true });
    await f.peer.ready();
    return {
      writer: f.writer,
      peer: f.peer,
      now: Date.now,
      waitUntil: (time) => sleep(Math.max(0, time - Date.now() + 1)),
      async purgeAsOrphan(scope, ref) {
        expect((await rows(f.second).deleteOne({ _id: key(scope, ref) })).deletedCount).toBe(1);
      },
      loseAck(outcome) {
        let drop = true;
        let interrupt = false;
        lost = intercept(
          dbOf(f.first),
          (cmd) => (drop && cmd.insert === NAME) || (interrupt && cmd.find === NAME),
          async (send, cmd) => {
            if (cmd.insert === NAME) {
              const ack = await send();
              expect(ack).toMatchObject({ ok: 1, n: 1 });
              drop = false;
              interrupt = outcome === 'unavailable';
              throw new Error('Fixture discarded the successful insert reply');
            }
            interrupt = false;
            return withFailPoint(f.second.getClient().db('admin'), 'failCommand', send, {
              mode: { times: 1 },
              data: { failCommands: ['find'], errorCode: 187 }, // LinearizableReadConcernError
            });
          },
        );
      },
      async corrupt(scope, ref, damage) {
        const bytes = new mongo.Binary(new Uint8Array(ref.byteLength + (damage === 'length' ? 1 : 0)).fill(42));
        const result = await rows(f.second).updateOne(
          { _id: key(scope, ref) },
          { $set: { bytes } },
          { bypassDocumentValidation: true },
        );
        expect(result.modifiedCount).toBe(1);
      },
      async close() {
        lost?.mockRestore();
        await f.close();
      },
    };
  } catch (error) {
    await f.close();
    throw error;
  }
});

describe('MongoDB attachment operations', () => {
  let f: Awaited<ReturnType<typeof openFixture>>;
  beforeEach(async () => {
    f = await openFixture();
  });
  afterEach(async () => f?.close());

  it('does no I/O or model registration at construction and defaults to validate-only readiness', async () => {
    const db = dbOf(f.second);
    const trace = commandTrace(f.first);
    const adminTrace = commandTrace(f.first, 'admin');
    try {
      const writer = createMongooseAttachmentStore(f.first, MANAGED_BINDING);
      await expect(writer.put(managedInput(Date.now()))).rejects.toMatchObject({ code: 'store_unavailable' });
      await expect(writer.ready({ install: 1 } as never)).rejects.toMatchObject({ code: 'invalid_config' });
      await expect(writer.ready({ other: true } as never)).rejects.toMatchObject({ code: 'invalid_config' });
      await expect(writer.ready({ signal: AbortSignal.abort() })).rejects.toMatchObject({ code: 'aborted' });
      expect(trace.commands).toHaveLength(0);
      expect(adminTrace.commands).toHaveLength(0);
      expect(f.first.models).toEqual({});
      expect(f.first.collections).toEqual({});
      await expect(writer.ready()).rejects.toMatchObject({ code: 'store_incompatible' });
      expect(trace.commands.map(({ commandName }) => commandName)).toEqual(['listCollections']);
      expect(await db.listCollections().toArray()).toEqual([]);

      // Provisioners may race, but must converge on the same exact catalog.
      await Promise.all([writer.ready({ install: true }), f.peer.ready({ install: true })]);
      const { ref } = await writer.put(managedInput(Date.now()));
      expect(await f.peer.resolve(ref, resolveContext('Tenant-A'))).toMatchObject({ status: 'found' });
      expect((await db.listCollections().toArray()).map(({ name }) => name)).toEqual([NAME]);
      expect(await rows(f.second).indexes()).toEqual([
        { v: 2, key: { _id: 1 }, name: '_id_' },
        { v: 2, key: { purgeAt: 1 }, name: 'ma1_purge', expireAfterSeconds: 0 },
      ]);
    } finally {
      trace.close();
      adminTrace.close();
    }
  });

  it('persists maximum-size subtype-0 BSON and confirms with a single primary linearizable read', async () => {
    await f.writer.ready({ install: true });
    await f.peer.ready();
    const trace = commandTrace(f.first);
    try {
      const slab = new Uint8Array(MAX_BYTES + 2).fill(31);
      const bytes = slab.subarray(1, -1).fill(71);
      const digest = createHash('sha256').update(bytes).digest('hex');
      const input = managedInput(Date.now(), { bytes });
      const writing = f.writer.put(input);
      slab.fill(99); // Mutation immediately after dispatch must not change the store-owned view.
      const receipt = await writing;
      const { ref } = receipt;
      const id = `ma1/${MANAGED_BINDING.namespace}/${input.scope}/${ref.id}/${ref.version}`;
      expect(ref).toMatchObject({ byteLength: MAX_BYTES, sha256: digest });
      const raw = await rows(f.second).findOne({ _id: id }, { promoteBuffers: false });
      expect(raw).toEqual({
        _id: id,
        format: 1,
        resolverKey: f.writer.resolverKey,
        revision: input.revision,
        deliverBy: new Date(input.deliverBy),
        purgeAt: new Date(input.deliverBy + HOLD),
        filename: input.filename,
        contentType: input.contentType,
        byteLength: MAX_BYTES,
        sha256: digest,
        bytes: expect.any(mongo.Binary),
      });
      expect(raw?.bytes.sub_type).toBe(0);
      expect(raw?.bytes.position).toBe(MAX_BYTES);
      expect(createHash('sha256').update(raw?.bytes.value()).digest('hex')).toBe(digest);

      expect(trace.commands.map(({ commandName }) => commandName)).toEqual(['insert']);
      expect(await f.writer.put({ ...input, bytes: new Uint8Array(MAX_BYTES).fill(71) })).toEqual(receipt);
      expect(trace.commands.map(({ commandName }) => commandName)).toEqual(['insert', 'insert', 'find']);
      const [insert, duplicate, read] = trace.commands.map(({ command }) => command);
      expect(insert).toMatchObject({
        insert: NAME,
        ordered: true,
        maxTimeMS: expect.any(Number),
        writeConcern: { w: 'majority', j: true, wtimeout: insert?.maxTimeMS },
        documents: [{ _id: id }],
        collectionUUID: expect.any(mongo.UUID),
      });
      expect(duplicate?.collectionUUID).toEqual(insert?.collectionUUID);
      expect(read).toMatchObject({
        find: NAME,
        filter: { _id: id },
        collectionUUID: insert?.collectionUUID,
        collation: { locale: 'simple' },
        hint: '_id_',
        readConcern: { level: 'linearizable' },
        limit: 1,
        batchSize: 1,
        singleBatch: true,
        maxTimeMS: expect.any(Number),
      });
      expect(read?.maxTimeMS).toBeLessThanOrEqual(duplicate?.maxTimeMS);
      expect(insert?.maxTimeMS).toBeLessThanOrEqual(5_000);
      const hello = await f.second.getClient().db('admin').command({ hello: 1 });
      expect(trace.commands.every(({ address }) => address === hello.primary)).toBe(true);
      for (const { command } of trace.commands) {
        expect(command).not.toHaveProperty('txnNumber');
        expect(command).not.toHaveProperty('autocommit');
      }
    } finally {
      trace.close();
    }
  });

  it('separates damaged lifetime proof from a valid worker body, and enforces strict BSON rows', async () => {
    await f.writer.ready({ install: true });
    const input = managedInput(Date.now());
    const { ref } = await f.writer.put(input);
    const data = rows(f.second);
    const filter = { _id: key(input.scope, ref) };
    const shortHold = new Date(input.deliverBy + HOLD - 1);
    for (const patch of [
      { format: 2 },
      { resolverKey: 'different' },
      { deliverBy: input.deliverBy },
      { purgeAt: [shortHold, new Date(input.deliverBy + HOLD)] },
      { purgeAt: shortHold },
      { filename: 'é'.repeat(65) },
      { contentType: 'text/plain; charset=utf-8' },
      { unrecognized: true },
      { byteLength: input.bytes.byteLength - 1 },
      { bytes: Buffer.from([0]) },
    ]) {
      await expect(data.updateOne(filter, { $set: patch })).rejects.toMatchObject({ code: 121 });
    }
    const current = await data.findOne(filter);
    const foreignKey = filter._id.replace(MANAGED_BINDING.namespace, randomUUID());
    await expect(data.insertOne({ ...current, _id: foreignKey })).rejects.toMatchObject({ code: 121 });

    await data.updateOne(filter, { $set: { purgeAt: shortHold } }, { bypassDocumentValidation: true });
    await expect(f.writer.put(input)).rejects.toMatchObject({ code: 'attachment_retention' });
    expect(await f.writer.resolve(ref, resolveContext(input.scope))).toEqual({ status: 'found', bytes: input.bytes });

    await data.updateOne(filter, {
      $set: { purgeAt: new Date(input.deliverBy + HOLD), bytes: new mongo.Binary(input.bytes, 128) },
    });
    await expect(f.writer.resolve(ref, resolveContext(input.scope))).rejects.toMatchObject({
      code: 'invalid_snapshot',
    });
    await expect(f.writer.put(input)).rejects.toMatchObject({ code: 'store_incompatible' });
  });

  it.each([false, true])(
    'omits an oversize Binary on the server (stored length also oversize: %s)',
    async (badLength) => {
      await f.writer.ready({ install: true });
      const input = managedInput(Date.now());
      const { ref } = await f.writer.put(input);
      const oversize = MAX_BYTES + 1;
      await rows(f.second).updateOne(
        { _id: key(input.scope, ref) },
        { $set: { bytes: new mongo.Binary(new Uint8Array(oversize)), ...(badLength && { byteLength: oversize }) } },
        { bypassDocumentValidation: true },
      );
      const hook = intercept(
        dbOf(f.first),
        (cmd) => cmd.find === NAME,
        async (send) => {
          const reply = await send();
          expect(reply.cursor).toMatchObject({ id: 0, firstBatch: [{ _id: key(input.scope, ref) }] });
          expect(reply.cursor.firstBatch[0]).not.toHaveProperty('bytes');
          return reply;
        },
      );
      try {
        await expect(f.writer.resolve(ref, resolveContext(input.scope))).rejects.toMatchObject({
          code: 'invalid_snapshot',
        });
        await expect(f.writer.put(input)).rejects.toMatchObject({ code: 'store_incompatible' });
        expect(hook.mock.calls.filter(([cmd]) => cmd.find === NAME)).toHaveLength(2);
      } finally {
        hook.mockRestore();
      }
    },
  );

  it('lets real TTL remove a due orphan and keeps a future hold reachable', async () => {
    await f.writer.ready({ install: true });
    await f.peer.ready();
    const current = managedInput(Date.now());
    const { ref: active } = await f.writer.put(current);
    const stored = await rows(f.second).findOne({ _id: key(current.scope, active) });
    if (!stored) throw new Error('Expected the installed attachment row');
    const purgeAt = (await serverNow(f.second)) + 2_000;
    const deliverBy = purgeAt - HOLD;
    const retired = { ...active, version: managedVersion(current.revision, deliverBy) };
    // Time-shift an otherwise valid orphan under the real validator. No wall clock changes and no direct delete.
    await rows(f.second).insertOne(
      { ...stored, _id: key(current.scope, retired), deliverBy: new Date(deliverBy), purgeAt: new Date(purgeAt) },
      { writeConcern: { w: 'majority', journal: true } },
    );
    expect(await f.peer.resolve(retired, resolveContext(current.scope))).toMatchObject({ status: 'found' });
    await expect(f.writer.put({ ...current, deliverBy })).rejects.toMatchObject({ code: 'expired' });
    await waitForTime(f.second, purgeAt);
    await expect
      .poll(() => f.peer.resolve(retired, resolveContext(current.scope)), { interval: 100, timeout: 6_000 })
      .toEqual({ status: 'unavailable' });
    await expect(f.writer.put({ ...current, deliverBy })).rejects.toMatchObject({ code: 'expired' });
    expect(await f.peer.resolve(active, resolveContext(current.scope))).toMatchObject({ status: 'found' });
    expect(await rows(f.second).countDocuments()).toBe(1);
  });

  it('confirms an actual Mongo write concern error in one read without making a second create', async () => {
    await f.writer.ready({ install: true });
    const trace = commandTrace(f.first);
    try {
      const input = managedInput(Date.now());
      const receipt = await withFailPoint(f.second.getClient().db('admin'), 'failCommand', () => f.writer.put(input), {
        mode: { times: 1 },
        data: {
          failCommands: ['insert'],
          writeConcernError: { code: 64, codeName: 'WriteConcernTimeout', errmsg: 'private fixture diagnostic' },
        },
      });
      expect(receipt.ref.id).toBe(input.id);
      expect(trace.commands.map(({ commandName }) => commandName)).toEqual(['insert', 'find']);
      expect(await rows(f.second).countDocuments()).toBe(1);
    } finally {
      trace.close();
    }
  });

  it('does not retry a server-rejected create when its single confirmation sees no winner', async () => {
    await f.writer.ready({ install: true });
    const trace = commandTrace(f.first);
    try {
      const input = managedInput(Date.now());
      await withFailPoint(
        f.second.getClient().db('admin'),
        'failCommand',
        () => expect(f.writer.put(input)).rejects.toMatchObject({ code: 'write_unconfirmed' }),
        {
          mode: { times: 1 },
          data: {
            failCommands: ['insert'],
            errorCode: 11601,
            errorLabels: ['SystemOverloadedError', 'RetryableError'],
          },
        },
      );
      expect(trace.commands.map(({ commandName }) => commandName)).toEqual(['insert', 'find']);
      expect(await rows(f.second).countDocuments()).toBe(0);
      expect((await f.writer.put(input)).ref.id).toBe(input.id);
    } finally {
      trace.close();
    }
  });

  it('aborts a real socket read, then still resolves using the caller-owned client', async () => {
    await f.writer.ready({ install: true });
    await f.peer.ready();
    const input = managedInput(Date.now());
    const { ref } = await f.writer.put(input);
    const controller = new AbortController();
    const client = f.first.getClient();
    const failed = once(client, 'commandFailed');
    const closed = once(client, 'connectionClosed');
    await withFailPoint(f.second.getClient().db('admin'), 'hangBeforeLinearizableReadConcern', async (entered) => {
      const read = f.writer.resolve(ref, resolveContext(input.scope, controller.signal));
      await entered();
      controller.abort(new Error('private fixture diagnostic'));
      expect(await read).toEqual({ status: 'unavailable' });
      expect(await failed).toMatchObject([{ commandName: 'find' }]);
      expect(await closed).toMatchObject([{ reason: 'error' }]);
    });
    expect(await f.writer.resolve(ref, resolveContext(input.scope))).toMatchObject({ status: 'found' });
  });

  it('keeps all eight slots until stopped driver calls settle and does not confirm after abort', async () => {
    await f.writer.ready({ install: true });
    await f.peer.ready();
    const count = 8;
    let seen = 0;
    const trace = commandTrace(f.first);
    const controller = new AbortController();
    const committed = latch<void>();
    const release = latch<void>();
    const cut = intercept(
      dbOf(f.first),
      (cmd) => cmd.insert === NAME,
      async (send) => {
        const ack = await send();
        expect(ack).toMatchObject({ ok: 1, n: 1 });
        if (++seen === count) committed.release();
        await release.reached;
        return ack;
      },
    );
    const inputs = Array.from({ length: count }, (_, i) => managedInput(Date.now(), { id: `stopped-${i}` }));
    const pending = Promise.allSettled(inputs.map((input) => f.writer.put(input, { signal: controller.signal })));
    try {
      await Promise.race([
        committed.reached,
        pending.then(() => {
          throw new Error('Fixture inserts did not reach the acknowledgement barrier');
        }),
      ]);
      controller.abort(new Error('private abort message'));
      expect(await pending).toEqual(
        inputs.map(() => ({ status: 'rejected', reason: expect.objectContaining({ code: 'write_unconfirmed' }) })),
      );
      await expect(f.writer.put(managedInput(Date.now()))).rejects.toMatchObject({ code: 'busy' });
      await expect(f.writer.ready()).rejects.toMatchObject({ code: 'busy' });
      expect(trace.commands.map(({ commandName }) => commandName)).toEqual(inputs.map(() => 'insert'));
      expect(await rows(f.second).countDocuments()).toBe(count);
    } finally {
      controller.abort();
      release.release();
      cut.mockRestore();
      trace.close();
      await pending;
    }
    await expect
      .poll(async () => {
        try {
          await f.writer.ready();
          return 'ready';
        } catch (error) {
          if (error instanceof Error && 'code' in error && error.code === 'busy') return 'busy';
          throw error;
        }
      })
      .toBe('ready');
    expect((await f.peer.put(inputs[0]!)).ref.id).toBe(inputs[0]!.id);
  });

  it('fences a real same-client reconnect and a stale in-flight ACK until re-ready', async () => {
    await f.writer.ready({ install: true });
    await f.peer.ready();
    const input = managedInput(Date.now());
    const { ref } = await f.writer.put(input);
    const client = f.first.getClient();
    const db = dbOf(f.first);
    const parked = latch<void>();
    const release = latch<void>();
    const hook = intercept(
      db,
      (cmd) => cmd.insert === NAME,
      async (send) => {
        const result = await send();
        parked.release();
        await release.reached;
        return result;
      },
    );
    const pending = f.writer.put({ ...input, id: 'across-reconnect' }, { timeoutMs: 12_000 });
    const unconfirmed = Promise.allSettled([pending]);
    try {
      await Promise.race([
        parked.reached,
        unconfirmed.then(() => {
          throw new Error('Fixture insert did not reach the acknowledgement barrier');
        }),
      ]);
      const signal = AbortSignal.timeout(8_000);
      const disconnected = once(f.first, 'disconnected', { signal });
      const reconnected = once(f.first, 'reconnected', { signal });
      const stepDown = f.second
        .getClient()
        .db('admin')
        .command({ replSetStepDown: 2, force: true, maxTimeMS: 3_000 })
        .catch((error: unknown) => {
          if (!(error instanceof mongo.MongoError)) throw error;
        });
      await Promise.all([stepDown, disconnected, reconnected]);
      expect(f.first.getClient()).toBe(client);
      expect(dbOf(f.first)).toBe(db);
      const trace = commandTrace(f.first);
      try {
        await expect(f.writer.ready()).rejects.toMatchObject({ code: 'busy' });
        expect(await f.writer.resolve(ref, resolveContext(input.scope))).toEqual({ status: 'unavailable' });
        await expect(f.writer.put({ ...input, id: 'still-fenced' })).rejects.toMatchObject({
          code: 'store_unavailable',
        });
        release.release();
        expect(await unconfirmed).toMatchObject([{ status: 'rejected', reason: { code: 'write_unconfirmed' } }]);
        expect(trace.commands).toHaveLength(0);
      } finally {
        trace.close();
      }
    } finally {
      release.release();
      hook.mockRestore();
      await unconfirmed;
    }
    await f.writer.ready();
    await f.peer.ready();
    expect(await f.writer.resolve(ref, resolveContext(input.scope))).toMatchObject({ status: 'found' });
    expect((await f.peer.put({ ...input, id: 'across-reconnect' })).ref.id).toBe('across-reconnect');
  });

  it('fences caller close/reopen, accepts the same backing and refuses a database repoint', async () => {
    await f.writer.ready({ install: true });
    await f.peer.ready();
    const input = managedInput(Date.now());
    const { ref } = await f.writer.put(input);
    await f.first.close();
    await f.first.openUri(f.uri, REOPEN);
    expect(await f.writer.resolve(ref, resolveContext(input.scope))).toEqual({ status: 'unavailable' });
    await f.writer.ready();
    expect(await f.writer.resolve(ref, resolveContext(input.scope))).toMatchObject({ status: 'found' });
    expect(await f.peer.resolve(ref, resolveContext(input.scope))).toMatchObject({ status: 'found' });
    await f.first.close();
    await f.first.openUri(uriFor(repl), REOPEN);
    await expect(f.writer.ready({ install: true })).rejects.toMatchObject({ code: 'store_incompatible' });
    expect(await dbOf(f.first).listCollections().toArray()).toEqual([]);
  });

  it('cannot adopt or write a dropped-and-recreated collection, even with the same names and schema', async () => {
    await f.writer.ready({ install: true });
    const input = managedInput(Date.now());
    const { ref } = await f.writer.put(input);
    await rows(f.second).drop();
    await expect(f.writer.resolve(ref, resolveContext(input.scope))).rejects.toMatchObject({
      code: 'store_incompatible',
    });
    await expect(f.writer.put(input)).rejects.toMatchObject({ code: 'store_incompatible' });
    expect(await dbOf(f.second).listCollections().toArray()).toEqual([]);

    await f.peer.ready({ install: true });
    await f.peer.put(input);
    await expect(f.writer.ready({ install: true })).rejects.toMatchObject({ code: 'store_incompatible' });
    expect(await f.writer.resolve(ref, resolveContext(input.scope))).toEqual({ status: 'unavailable' });
    expect(await f.peer.resolve(ref, resolveContext(input.scope))).toMatchObject({ status: 'found' });
    expect(await rows(f.second).countDocuments()).toBe(1);
  });

  it('leaves queue-only startup and both queue catalogs unchanged and rejects their name aliases', async () => {
    const db = dbOf(f.second);
    const smtpCapacity = capacity();
    const prefix = `email_smtp_v2.${smtpCapacity.namespace}`;
    await createMongooseEmailStore(f.first).ready();
    expect((await db.listCollections().toArray()).map(({ name }) => name).sort()).toEqual([ACTIVITIES, JOBS]);
    await createMongooseEmailStore(f.first, { smtpCapacity }).ready();
    const names = [ACTIVITIES, JOBS, `${prefix}.activities`, `${prefix}.jobs`].sort();
    const before = await db.listCollections({ name: { $in: names } }).toArray();
    expect(before.map(({ name }) => name).sort()).toEqual(names);
    const indexes = () => Promise.all(names.map((name) => rows(f.second, name).indexes()));
    const beforeIndexes = await indexes();
    for (const collection of names) {
      expect(() => createMongooseAttachmentStore(f.first, { ...MANAGED_BINDING, collection })).toThrowError(
        expect.objectContaining({ code: 'invalid_config' }),
      );
    }
    const custom = createMongooseAttachmentStore(f.first, { ...MANAGED_BINDING, collection: 'private_files' });
    await custom.ready({ install: true });
    await custom.put(managedInput(Date.now()));
    expect(await rows(f.second, 'private_files').countDocuments()).toBe(1);
    expect(await db.listCollections({ name: { $in: names } }).toArray()).toEqual(before);
    expect(await indexes()).toEqual(beforeIndexes);

    await createMongooseEmailStore(f.first, { jobsCollection: 'custom_jobs' }).ready();
    const alias = createMongooseAttachmentStore(f.second, { ...MANAGED_BINDING, collection: 'custom_jobs' });
    await expect(alias.ready({ install: true })).rejects.toMatchObject({ code: 'store_incompatible' });
  });
});

describe('MongoDB attachment readiness is fail-closed', () => {
  let f: Awaited<ReturnType<typeof openFixture>>;
  beforeEach(async () => {
    f = await openFixture();
  });
  afterEach(async () => f?.close());

  it('rejects invalid bindings and refuses a caller Mongoose model on the private collection', async () => {
    expect(() => createMongooseAttachmentStore(connection, MANAGED_BINDING)).toThrowError(
      expect.objectContaining({ code: 'invalid_config' }),
    );
    const closed = createConnection();
    try {
      await expect(createMongooseAttachmentStore(closed, MANAGED_BINDING).ready()).rejects.toMatchObject({
        code: 'store_unavailable',
      });
    } finally {
      await closed.destroy();
    }
    for (const config of [
      { ...MANAGED_BINDING, namespace: MANAGED_BINDING.namespace.toUpperCase() },
      { ...MANAGED_BINDING, resolverKey: 'bad/id' },
      { ...MANAGED_BINDING, collection: 'a'.repeat(65) },
      { ...MANAGED_BINDING, collection: 'unsafe.name' },
      { ...MANAGED_BINDING, unexpected: true },
    ]) {
      expect(() => createMongooseAttachmentStore(f.first, config)).toThrowError(
        expect.objectContaining({ code: 'invalid_config' }),
      );
    }
    const model = f.first.model(
      'HostModel',
      new Schema({ s: String }, { autoCreate: false, autoIndex: false, bufferCommands: false }),
      NAME,
    );
    const trace = commandTrace(f.first);
    try {
      await expect(f.writer.ready({ install: true })).rejects.toMatchObject({ code: 'store_incompatible' });
      expect(trace.commands).toHaveLength(0);
      expect(f.first.models.HostModel).toBe(model);
    } finally {
      trace.close();
    }
  });

  it('rejects other bindings and creates a missing TTL only for explicit matching provisioning', async () => {
    const db = dbOf(f.second);
    await db.command({ create: NAME, validator: attachmentValidator(MANAGED_BINDING), writeConcern: DURABLE });
    await expect(f.writer.ready()).rejects.toMatchObject({ code: 'store_incompatible' });
    for (const other of [{ namespace: randomUUID() }, { resolverKey: 'other' }]) {
      const store = createMongooseAttachmentStore(f.second, { ...MANAGED_BINDING, ...other });
      await expect(store.ready({ install: true })).rejects.toMatchObject({ code: 'store_incompatible' });
      expect((await rows(f.second).indexes()).map(({ name }) => name)).toEqual(['_id_']);
    }
    await f.writer.ready({ install: true });
    await f.peer.ready();
  });

  it.each([
    { capped: true, size: 8_192 },
    { collation: { locale: 'en', strength: 2 } },
    { validationAction: 'warn' },
    { validationLevel: 'moderate' },
    { validator: { format: 1 } },
  ])('refuses an incompatible collection policy without changing it: %j', async (policy) => {
    const db = dbOf(f.second);
    await db.command({
      create: NAME,
      validator: attachmentValidator(MANAGED_BINDING),
      ...policy,
      writeConcern: DURABLE,
    });
    const before = await db.listCollections({ name: NAME }).toArray();
    await expect(f.writer.ready({ install: true })).rejects.toMatchObject({ code: 'store_incompatible' });
    expect(await db.listCollections({ name: NAME }).toArray()).toEqual(before);
    expect((await rows(f.second).indexes()).map(({ name }) => name)).toEqual(['_id_']);
  });

  it.each([
    { name: 'ma1_purge', key: { purgeAt: 1 }, expireAfterSeconds: 1 },
    { name: 'ma1_purge', key: { purgeAt: 1 }, expireAfterSeconds: 0, hidden: true },
    { name: 'ma1_purge', key: { purgeAt: 1 }, expireAfterSeconds: 0, partialFilterExpression: { format: 1 } },
    { name: 'early_ttl', key: { deliverBy: 1 }, expireAfterSeconds: 0 },
  ])('refuses a modified or extra TTL rather than repairing it: %j', async (index) => {
    const db = dbOf(f.second);
    await db.command({ create: NAME, validator: attachmentValidator(MANAGED_BINDING), writeConcern: DURABLE });
    await db.command({ createIndexes: NAME, indexes: [index], writeConcern: DURABLE });
    const before = await rows(f.second).indexes();
    await expect(f.writer.ready({ install: true })).rejects.toMatchObject({ code: 'store_incompatible' });
    expect(await rows(f.second).indexes()).toEqual(before);
  });

  it('rejects direct, compressed and adaptively retrying client modes', async () => {
    for (const options of [{ directConnection: true }, { compressors: ['zlib'] as const }, { maxAdaptiveRetries: 2 }]) {
      const client = await connect(f.uri, options as Parameters<typeof connect>[1]);
      try {
        const store = createMongooseAttachmentStore(client, MANAGED_BINDING);
        await expect(store.ready({ install: true })).rejects.toMatchObject({ code: 'store_incompatible' });
      } finally {
        await client.destroy();
      }
    }
    expect(await dbOf(f.second).listCollections().toArray()).toEqual([]);
  });
});

it('refuses a real standalone and a replica set without journaled majority enabled', async () => {
  const alone = await standalone();
  try {
    const c = await connect(alone.getUri('attachments_standalone'));
    try {
      await expect(createMongooseAttachmentStore(c, MANAGED_BINDING).ready({ install: true })).rejects.toMatchObject({
        code: 'store_incompatible',
      });
      expect(await dbOf(c).listCollections().toArray()).toEqual([]);
    } finally {
      await c.destroy();
    }
  } finally {
    await alone.stop();
  }
  const unjournaled = await replicaSet(1);
  try {
    const c = await connect(uriFor(unjournaled));
    try {
      const admin = c.getClient().db('admin');
      const { config } = await admin.command({ replSetGetConfig: 1 });
      await admin.command({
        replSetReconfig: { ...config, version: config.version + 1, writeConcernMajorityJournalDefault: false },
      });
      await expect(createMongooseAttachmentStore(c, MANAGED_BINDING).ready({ install: true })).rejects.toMatchObject({
        code: 'store_incompatible',
      });
      expect(await dbOf(c).listCollections().toArray()).toEqual([]);
    } finally {
      await c.destroy();
    }
  } finally {
    await unjournaled.stop();
  }
});

it('supports separate find/insert and read-only users with only read readiness privileges', async () => {
  const auth = {
    enable: true,
    customRootName: randomUUID(),
    customRootPwd: randomUUID(),
    keyfileContent: randomBytes(32).toString('base64'),
  };
  const secured = await MongoMemoryReplSet.create({
    binary: { version: process.env.MONGOMS_VERSION ?? '8.2.6' },
    replSet: { count: 1, storageEngine: 'wiredTiger', auth },
  });
  const clients: Connection[] = [];
  try {
    const uri = uriFor(secured);
    const root = await connect(uri, {
      auth: { username: auth.customRootName, password: auth.customRootPwd },
      authSource: 'admin',
    });
    clients.push(root);
    const admin = root.getClient().db('admin');
    const db = dbOf(root).databaseName;
    await createMongooseAttachmentStore(root, MANAGED_BINDING).ready({ install: true });
    async function user(role: string, actions: string[]) {
      const username = randomUUID();
      const password = randomUUID();
      await admin.command({
        createRole: role,
        roles: [],
        privileges: [
          { resource: { cluster: true }, actions: ['serverStatus', 'replSetGetConfig', 'getCmdLineOpts'] },
          { resource: { db, collection: '' }, actions: ['listCollections'] },
          { resource: { db, collection: NAME }, actions: ['listIndexes', ...actions] },
        ],
      });
      await admin.command({ createUser: username, pwd: password, roles: [role] });
      const client = await connect(uri, { auth: { username, password }, authSource: 'admin' });
      clients.push(client);
      return client;
    }
    const reader = await user('attachmentReader', ['find']);
    const producer = await user('attachmentProducer', ['find', 'insert']);
    const cannotReadBody = await user('noRead', ['insert']);
    const writer = createMongooseAttachmentStore(producer, MANAGED_BINDING);
    const worker = createMongooseAttachmentStore(reader, MANAGED_BINDING);
    await expect(createMongooseAttachmentStore(cannotReadBody, MANAGED_BINDING).ready()).rejects.toMatchObject({
      code: 'store_incompatible',
    });
    await expect(
      createMongooseAttachmentStore(producer, { ...MANAGED_BINDING, collection: 'missing' }).ready({ install: true }),
    ).rejects.toMatchObject({ code: 'store_incompatible' });
    const trace = commandTrace(reader);
    try {
      await writer.ready();
      await worker.ready();
      expect(trace.commands.map(({ commandName }) => commandName)).toEqual(['listCollections', 'listIndexes', 'find']);
      const input = managedInput(Date.now());
      const { ref } = await writer.put(input);
      expect(await worker.resolve(ref, resolveContext(input.scope))).toEqual({ status: 'found', bytes: input.bytes });
      await expect(worker.put(input)).rejects.toMatchObject({ code: 'store_incompatible' });
      expect(trace.commands.map(({ commandName }) => commandName)).toEqual([
        'listCollections',
        'listIndexes',
        'find',
        'find',
        'insert',
      ]);
      for (const client of [producer, reader]) {
        await expect(rows(client).deleteOne({ _id: key(input.scope, ref) })).rejects.toMatchObject({ code: 13 });
      }
      await expect(rows(reader, JOBS).findOne()).rejects.toMatchObject({ code: 13 });
    } finally {
      trace.close();
    }
  } finally {
    try {
      await Promise.all(clients.map((c) => c.destroy()));
    } finally {
      await secured.stop();
    }
  }
});
