/**
 * MONGO-02 live MongoDB lane (requires replica-set binary; absence blocks, never skip-passes).
 *
 * Disposable single-node replica set via `test/mongo-harness.ts`
 * (`MongoMemoryReplSet`, count 1; no production connection string),
 * randomized isolated databases, two independent `MongoClient`s per shared
 * database, and per-test `dropDatabase` cleanup.
 *
 * - The shared `test/store-conformance.ts` suite runs against live Mongo for
 *   memory/live parity. The Mongo adapter uses an app-provided clock (default
 *   `Date.now`; synchronized-clock requirement across instances), so live
 *   `setNow` instantly advances the injected clock (no server-TIME blocking).
 *   The suite's Redis-parity margins already apply (cap ±10s, future +2s,
 *   `setNow` overshoot); exact-ms boundaries stay covered by deterministic
 *   memory-only tests and are never asserted against the live clock here.
 * - Live-specific tests verify single-ledger atomicity across independent
 *   clients (exactly-one winner), retention through the whole deadline,
 *   non-TTL ledger reclaim, shared capacity with duplicate precedence,
 *   at-most-64 cleanup, malformed-row fail-closed behavior, and MONGO-02 HTTP
 *   replay integration over two middleware instances sharing one database.
 *
 * Prerequisites: `mongodb-memory-server` replica-set binary download
 * (registry/network) for the live lane. Production deployments require a
 * replica set (transactions); the single-node set here is test-only.
 */

import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoClient, type Db } from 'mongodb';
import express from 'express';

import {
  AttestationCapacityError,
  AttestationProtocolError,
  buildMacInputBytes,
  createAttestationBodyCapture,
  createMongoAttestationStore,
  createRequestAttestationMiddleware,
  encodeTransactionId,
  GLOBAL_MAX_RETENTION_MS,
} from '../src/index.js';
import { AttestationMongoStoreError } from '../src/stores/mongodb.js';
import type { MongoAttestationStoreDb } from '../src/stores/mongodb.js';
import { defineAttestationStoreConformanceSuite } from './store-conformance.js';
import { createMongoHarness, MONGO_TIMEOUT, type MongoHarness } from './mongo-harness.js';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const waitForExpiry = async (expiresAt: number): Promise<void> => {
  const deadline = Date.now() + 15_000;
  while (Date.now() <= expiresAt) {
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for disposable MongoDB app-clock expiry.');
    }
    await sleep(25);
  }
};

const asStoreDb = (db: Db): MongoAttestationStoreDb => db as unknown as MongoAttestationStoreDb;

describe('MONGO-02 live attestation replay on a replica set', () => {
  let harness: MongoHarness;
  let peer: MongoClient;
  const conformanceDbs: Db[] = [];

  beforeAll(async () => {
    harness = await createMongoHarness();
    peer = new MongoClient(harness.uri);
    await peer.connect();
  }, MONGO_TIMEOUT);

  afterAll(async () => {
    for (const db of conformanceDbs) {
      try {
        await db.dropDatabase();
      } catch {
        // Best-effort cleanup of disposable databases.
      }
    }
    if (peer !== undefined) {
      await peer.close().catch(() => undefined);
    }
    await harness?.stop();
  }, MONGO_TIMEOUT);

  const run = async (name: string, test: (db: Db) => Promise<void>): Promise<void> => {
    const db = harness.createDb(name);
    try {
      await test(db);
    } finally {
      await db.dropDatabase();
    }
  };

  const stores = (db: Db, now: () => number = Date.now, maxEntries = 4) =>
    [
      createMongoAttestationStore({ db: asStoreDb(db), now, maxEntries }),
      createMongoAttestationStore({ db: asStoreDb(peer.db(db.databaseName)), now, maxEntries }),
    ] as const;

  // -- Shared conformance against live Mongo (memory/live parity). -----------
  // App-clock time travel is instant (the store never reads server TIME); the
  // suite's ±10s / +2s margins keep admission deterministic against the live
  // replica set, exactly like the Redis lane.
  defineAttestationStoreConformanceSuite('mongo-live', async (testName, options) => {
    const db = harness.createDb(`conformance-${testName}`);
    conformanceDbs.push(db);
    let now = Date.now();
    const store = createMongoAttestationStore({
      db: asStoreDb(db),
      now: () => now,
      ...(options?.maxEntries === undefined ? {} : { maxEntries: options.maxEntries }),
    });
    return {
      store,
      getNow: () => now,
      setNow: (next: number) => {
        now = next;
      },
    };
  });

  it.each([null, 0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid capacity %s at construction',
    (max) => {
      const db = harness.createDb('invalid-capacity');
      conformanceDbs.push(db);
      expect(() => createMongoAttestationStore({ db: asStoreDb(db), maxEntries: max as number })).toThrow(
        AttestationProtocolError,
      );
    },
  );

  it('owns supplied store limits despite mutation of the caller options object', async () => {
    await run('options-snapshot', async (db) => {
      const options: { db: MongoAttestationStoreDb; maxEntries: number } = {
        db: asStoreDb(db),
        maxEntries: 1,
      };
      const store = createMongoAttestationStore(options);
      options.maxEntries = 100_000;
      const expiry = Date.now() + 60_000;
      expect(await store.reserve({ replayKey: 'att:v1:one', retainUntilMs: expiry })).toBe('reserved');
      await expect(store.reserve({ replayKey: 'att:v1:two', retainUntilMs: expiry })).rejects.toBeInstanceOf(
        AttestationCapacityError,
      );
    });
  });

  it('independent clients sharing one database have exactly one winner (simultaneous identical)', async () => {
    await run('race', async (db) => {
      const clients = stores(db, Date.now, 50_000);
      const start = Date.now();
      const results = await Promise.all(
        Array.from({ length: 24 }, (_, index) =>
          clients[index % 2]!.reserve({ replayKey: 'att:v1:opaque-shared', retainUntilMs: start + 60_000 }),
        ),
      );
      expect(results.filter((result) => result === 'reserved')).toHaveLength(1);
      expect(results.filter((result) => result === 'duplicate')).toHaveLength(23);
      expect(
        await db.collection<{ _id: string; [key: string]: unknown }>('attestation_proofs').countDocuments({}),
      ).toBe(1);
      expect(
        await db
          .collection<{ _id: string; [key: string]: unknown }>('attestation_replay_capacity')
          .countDocuments({ kind: 'reservation' }),
      ).toBe(1);
      expect(
        await db
          .collection<{ _id: string; [key: string]: unknown }>('attestation_replay_capacity')
          .findOne({ _id: 'capacity' }),
      ).toMatchObject({ entries: 1 });
    });
  });

  it('shared capacity admits exactly N unique keys, duplicates win, expiry reclaims', async () => {
    await run('capacity', async (db) => {
      const clients = stores(db, Date.now, 4);
      const start = Date.now();
      // 5s deadlines: the 16 serialized multi-document transactions take
      // ~1s on a single-node memory replica set, so sub-second deadlines
      // would elapse mid-batch and turn duplicates into fresh admissions.
      const results = await Promise.allSettled(
        Array.from({ length: 16 }, (_, index) =>
          clients[index % 2]!.reserve({ replayKey: `att:v1:key-${index}`, retainUntilMs: start + 5_000 }),
        ),
      );
      const winners = results.flatMap((result, index) =>
        result.status === 'fulfilled' && result.value === 'reserved' ? [`att:v1:key-${index}`] : [],
      );
      expect(winners).toHaveLength(4);
      for (const result of results) {
        if (result.status === 'rejected') {
          expect(result.reason).toBeInstanceOf(AttestationCapacityError);
        }
      }
      for (const replayKey of winners) {
        expect(await clients[1]!.reserve({ replayKey, retainUntilMs: start + 60_000 })).toBe('duplicate');
      }
      await expect(
        clients[0]!.reserve({ replayKey: 'att:v1:full', retainUntilMs: start + 60_000 }),
      ).rejects.toBeInstanceOf(AttestationCapacityError);
      // No live entry evicted and nothing allocated by the rejected admission.
      expect(
        await db.collection<{ _id: string; [key: string]: unknown }>('attestation_proofs').countDocuments({}),
      ).toBe(4);
      await waitForExpiry(start + 5_000);
      for (const replayKey of winners) {
        expect(await clients[1]!.reserve({ replayKey, retainUntilMs: Date.now() + 60_000 })).toBe('reserved');
      }
      expect(
        await db.collection<{ _id: string; [key: string]: unknown }>('attestation_proofs').countDocuments({}),
      ).toBe(4);
    });
  });

  it('app clock controls admission; invalid windows allocate nothing', async () => {
    await run('time', async (db) => {
      const [store] = stores(db, Date.now, 4);
      const start = Date.now();
      // Expired and overlong deadlines never allocate: the ledger stays absent.
      expect(await store.reserve({ replayKey: 'att:v1:invalid', retainUntilMs: start - 1 })).toBe('expired');
      await expect(
        store.reserve({ replayKey: 'att:v1:overlong', retainUntilMs: start + 400_000 }),
      ).rejects.toBeInstanceOf(AttestationProtocolError);
      // +10s margin keeps the overlong case robust against clock drift
      // between the `Date.now()` reading and transactional admission (exact
      // CAP+1 is covered deterministically by the memory exact-boundary test).
      await expect(
        store.reserve({ replayKey: 'att:v1:overlong-cap', retainUntilMs: start + GLOBAL_MAX_RETENTION_MS + 10_000 }),
      ).rejects.toBeInstanceOf(AttestationProtocolError);
      expect(
        await db.collection<{ _id: string; [key: string]: unknown }>('attestation_proofs').countDocuments({}),
      ).toBe(0);
      expect(await store.reserve({ replayKey: 'att:v1:valid', retainUntilMs: start + 60_000 })).toBe('reserved');
      expect(GLOBAL_MAX_RETENTION_MS).toBe(240_000);
    });
  });

  it('replays near the end of validity remain rejected; expired inputs never allocate', async () => {
    await run('near-expiry', async (db) => {
      const [store, other] = stores(db, Date.now, 50_000);
      const start = Date.now();
      const replayKey = 'att:v1:near-end';
      expect(await store.reserve({ replayKey, retainUntilMs: start + 2_000 })).toBe('reserved');
      // Near the end of validity (1.5s into a 2s window) the replay is still
      // a duplicate, not a fresh admission.
      await sleep(1_500);
      expect(await other.reserve({ replayKey, retainUntilMs: start + 2_000 })).toBe('duplicate');
      // An expired-input replay against the live key reports expired and
      // leaves the live reservation untouched (still duplicate afterwards).
      const mid = Date.now();
      expect(await other.reserve({ replayKey, retainUntilMs: mid })).toBe('expired');
      expect(await store.reserve({ replayKey, retainUntilMs: start + 2_000 })).toBe('duplicate');
      await waitForExpiry(start + 2_000);
      expect(await other.reserve({ replayKey, retainUntilMs: Date.now() + 5_000 })).toBe('reserved');
    });
  });

  it('idle ledger is reclaimed through expiry without a TTL index', async () => {
    await run('ledger-reclaim', async (db) => {
      const clients = stores(db, Date.now, 2);
      const expiresAt = Date.now() + 800;
      expect(await clients[0].reserve({ replayKey: 'att:v1:first', retainUntilMs: expiresAt })).toBe('reserved');
      expect(await clients[1].reserve({ replayKey: 'att:v1:second', retainUntilMs: expiresAt })).toBe('reserved');
      const proofs = db.collection<{ _id: string; [key: string]: unknown }>('attestation_proofs');
      const capacity = db.collection<{ _id: string; [key: string]: unknown }>('attestation_replay_capacity');
      // No TTL reliance: rows stay until the next admission reclaims them.
      expect(await proofs.countDocuments({})).toBe(2);
      expect(await capacity.countDocuments({ kind: 'reservation' })).toBe(2);
      expect(await capacity.findOne({ _id: 'capacity' })).toMatchObject({ entries: 2 });
      const indexes = await capacity.listIndexes().toArray();
      expect(indexes.some((index) => index.expireAfterSeconds !== undefined)).toBe(false);
      await waitForExpiry(expiresAt);
      // Idle rows are still present (no TTL) until reclaimed by admission.
      expect(await capacity.countDocuments({ kind: 'reservation' })).toBe(2);
      expect(await clients[1].reserve({ replayKey: 'att:v1:fresh', retainUntilMs: Date.now() + 60_000 })).toBe(
        'reserved',
      );
      expect(await capacity.countDocuments({ kind: 'reservation' })).toBe(1);
      expect(await capacity.findOne({ _id: 'capacity' })).toMatchObject({ entries: 1 });
      expect(await clients[0].reserve({ replayKey: 'att:v1:first', retainUntilMs: Date.now() + 60_000 })).toBe(
        'reserved',
      );
      expect(await capacity.findOne({ _id: 'capacity' })).toMatchObject({ entries: 2 });
    });
  });

  it('one admission does at most 64 expired-row cleanup and never evicts live', async () => {
    await run('bounded-cleanup', async (db) => {
      const maxEntries = 256;
      const [store] = stores(db, Date.now, maxEntries);
      const start = Date.now();
      const proofs = db.collection<{ _id: string; retainUntilMs: number }>('attestation_proofs');
      const capacity = db.collection<{ _id: string; [key: string]: unknown }>('attestation_replay_capacity');
      const expiredProofs = Array.from({ length: 255 }, (_, index) => ({
        _id: `att:v1:expired-${index}`,
        retainUntilMs: start - 1_000,
      }));
      const liveProof = { _id: 'att:v1:retained-live', retainUntilMs: start + 60_000 };
      await proofs.insertMany([...expiredProofs, liveProof]);
      await capacity.insertMany([
        ...[...expiredProofs, liveProof].map((row) => ({
          _id: `proof:${row._id}`,
          kind: 'reservation',
          replayKey: row._id,
          retainUntilMs: row.retainUntilMs,
        })),
        {
          _id: 'capacity',
          kind: 'capacity',
          entries: 256,
          revision: 0,
          maxEntries,
          proofsCollectionName: 'attestation_proofs',
        },
      ]);
      expect(await store.reserve({ replayKey: 'att:v1:new-live', retainUntilMs: start + 60_000 })).toBe('reserved');
      expect(await capacity.countDocuments({ kind: 'reservation' })).toBe(193);
      expect(await capacity.findOne({ _id: 'capacity' })).toMatchObject({ entries: 193 });
      expect(await proofs.findOne({ _id: 'att:v1:retained-live' })).toMatchObject({
        retainUntilMs: start + 60_000,
      });
      expect(await store.reserve({ replayKey: 'att:v1:retained-live', retainUntilMs: start + 120_000 })).toBe(
        'duplicate',
      );
      expect(await capacity.countDocuments({ kind: 'reservation' })).toBe(193);
      // Duplicates never rescore: the live deadline is unchanged.
      expect(await proofs.findOne({ _id: 'att:v1:retained-live' })).toMatchObject({
        retainUntilMs: start + 60_000,
      });
    });
  });

  it('malformed persisted rows fail closed with typed errors and no allocation', async () => {
    await run('malformed-rows', async (db) => {
      const [store] = stores(db, Date.now, 50_000);
      const start = Date.now();
      const proofs = db.collection<{ _id: string; [key: string]: unknown }>('attestation_proofs');
      const capacity = db.collection<{ _id: string; [key: string]: unknown }>('attestation_replay_capacity');

      const proofKey = 'att:v1:malformed-proof';
      expect(await store.reserve({ replayKey: proofKey, retainUntilMs: start + 60_000 })).toBe('reserved');
      await proofs.updateOne({ _id: proofKey }, { $set: { retainUntilMs: 'bad' } });
      await expect(store.reserve({ replayKey: proofKey, retainUntilMs: start + 60_000 })).rejects.toBeInstanceOf(
        AttestationMongoStoreError,
      );
      await proofs.updateOne({ _id: proofKey }, { $set: { retainUntilMs: start + 60_000 } });

      const ledgerKey = 'att:v1:malformed-ledger';
      expect(await store.reserve({ replayKey: ledgerKey, retainUntilMs: start + 60_000 })).toBe('reserved');
      await capacity.updateOne({ _id: `proof:${ledgerKey}` }, { $set: { retainUntilMs: 'bad' } });
      // A live proof short-circuits to 'duplicate' before the ledger is read
      // (still a rejection, no bypass). Remove the proof so the malformed
      // ledger row is actually consulted: the ledger is the backstop when a
      // physical proof row disappears externally.
      await proofs.deleteOne({ _id: ledgerKey });
      await expect(store.reserve({ replayKey: ledgerKey, retainUntilMs: start + 60_000 })).rejects.toBeInstanceOf(
        AttestationMongoStoreError,
      );

      const mismatched = createMongoAttestationStore({
        db: asStoreDb(peer.db(db.databaseName)),
        maxEntries: 999_999,
      });
      await expect(
        mismatched.reserve({ replayKey: 'att:v1:mismatch', retainUntilMs: Date.now() + 60_000 }),
      ).rejects.toBeInstanceOf(AttestationMongoStoreError);
    });
  });

  it('MONGO-02 HTTP replay integration: two instances sharing one database admit exactly one winner', async () => {
    const db = harness.createDb('http-integration');
    try {
      const PUBLIC_ORIGIN = 'https://attestation.example.com';
      const NAMESPACE = 'att-mongo-live-http';
      const KEY_ID = 'live-key-01';
      const KEY_BYTES = Uint8Array.from(
        Buffer.from('d973c35da623a2329dd08a32153635042a7fe90b730035c90508ae7ec50c0d24', 'hex'), // pragma: allowlist secret
      );
      const NOW = Date.now();
      const snapshot = {
        currentKeyId: KEY_ID,
        keys: [{ keyId: KEY_ID, key: KEY_BYTES, acceptFrom: NOW - 60_000, acceptUntil: NOW + 120_000 }],
      };
      const provider = { getSnapshot: () => snapshot };
      const firstStore = createMongoAttestationStore({ db: asStoreDb(db) });
      const secondStore = createMongoAttestationStore({ db: asStoreDb(peer.db(db.databaseName)) });

      const signProof = (input: {
        timestampMs: number;
        nonceHex: string;
        method: string;
        requestTarget: string;
        contentType: string;
        bodyBytes: Uint8Array;
      }): string => {
        const bodyHashHex = createHash('sha256').update(input.bodyBytes).digest('hex');
        const macInput = buildMacInputBytes({
          replayNamespace: NAMESPACE,
          publicOrigin: PUBLIC_ORIGIN,
          keyId: KEY_ID,
          timestampMs: input.timestampMs,
          nonceHex: input.nonceHex,
          method: input.method,
          requestTarget: input.requestTarget,
          contentType: input.contentType,
          bodyHashHex,
        });
        const mac = createHmac('sha256', Buffer.from(KEY_BYTES)).update(macInput).digest('base64url');
        return encodeTransactionId({
          keyId: KEY_ID,
          timestampMs: input.timestampMs,
          nonceHex: input.nonceHex,
          mac,
        });
      };

      const startApp = async (
        store: ReturnType<typeof createMongoAttestationStore>,
      ): Promise<{ baseUrl: string; close: () => Promise<void>; handlerCalls: () => number }> => {
        const capture = createAttestationBodyCapture({ maxBodyBytes: 1024 * 1024 });
        const guard = createRequestAttestationMiddleware({
          publicOrigin: PUBLIC_ORIGIN,
          replayNamespace: NAMESPACE,
          keyProvider: provider,
          store,
          now: () => Date.now(),
        });
        let handlerCalls = 0;
        const app = express();
        app.use(express.json({ limit: 1024 * 1024, verify: capture.verify as never, inflate: false }));
        app.use(capture.errorHandler as never);
        app.use('/api', guard as never);
        app.post('/api/submit', (_req, res) => {
          handlerCalls += 1;
          res.json({ ok: true });
        });
        const server = app.listen(0, '127.0.0.1');
        await new Promise<void>((resolve) => server.on('listening', () => resolve()));
        const address = server.address() as AddressInfo;
        return {
          baseUrl: `http://127.0.0.1:${address.port}`,
          close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
          handlerCalls: () => handlerCalls,
        };
      };

      const first = await startApp(firstStore);
      const second = await startApp(secondStore);
      try {
        const raw = JSON.stringify({ live: 1 });
        const header = signProof({
          timestampMs: Date.now() - 2_000,
          nonceHex: randomBytes(16).toString('hex'),
          method: 'POST',
          requestTarget: '/api/submit',
          contentType: 'application/json',
          bodyBytes: Buffer.from(raw, 'utf8'),
        });
        const send = (baseUrl: string) =>
          fetch(`${baseUrl}/api/submit`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-client-transaction-id': header },
            body: raw,
          });
        const [a, b] = await Promise.all([send(first.baseUrl), send(second.baseUrl)]);
        expect([a.status, b.status].sort()).toEqual([200, 403]);
        expect(first.handlerCalls() + second.handlerCalls()).toBe(1);
        const bodies = await Promise.all([a.json() as Promise<unknown>, b.json() as Promise<unknown>]);
        const codes = bodies.map((body) => (body as { code?: string }).code ?? 'ok').sort();
        expect(codes).toContain('ATTESTATION_REPLAY');
        expect(randomUUID().length).toBeGreaterThan(0);
      } finally {
        await first.close();
        await second.close();
      }
    } finally {
      await db.dropDatabase();
    }
  });
});
