import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoClient, type Db } from 'mongodb';
import { OidcVaultDpopReplayCapacityError, OidcVaultStoreConflictError } from '@web-ts-toolkit/express-oidc-vault';
import type { OidcVaultDpopBinding, OidcVaultRecordBindingMatch } from '@web-ts-toolkit/express-oidc-vault';
import { createMongoOidcVaultStore } from '../src';
import {
  createDbWithCollectionWriteFailure,
  createReplicaSetHarness,
  MONGO_TIMEOUT,
  withFailCommand,
  type MongoMemoryHarness,
} from './mongo-memory';

const binding: OidcVaultDpopBinding = { type: 'dpop', jkt: 'A'.repeat(43) };
const otherBinding: OidcVaultDpopBinding = { type: 'dpop', jkt: 'B'.repeat(42) + 'A' };
const hash = 'C'.repeat(42) + 'A';
const absent: OidcVaultRecordBindingMatch = { deviceBinding: null, browserBindingHash: null };
const match: OidcVaultRecordBindingMatch = { deviceBinding: binding, browserBindingHash: hash };
const waitUntil = async (predicate: () => Promise<boolean>, timeout = 15_000) => {
  const deadline = Date.now() + timeout;
  while (!(await predicate())) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for disposable MongoDB TTL cleanup.');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
};

const intercept = (db: Db, name: string, method: string, hook: () => Promise<void>, after = false): Db =>
  new Proxy(db, {
    get(target, property) {
      if (property === 'collection')
        return (collectionName: string) => {
          const collection = target.collection(collectionName);
          if (collectionName !== name) return collection;
          return new Proxy(collection, {
            get(target, property) {
              const value = Reflect.get(target, property);
              if (property === method)
                return async (...args: unknown[]) => {
                  if (!after) await hook();
                  const result: unknown = await value.apply(target, args);
                  if (after) await hook();
                  return result;
                };
              return typeof value === 'function' ? value.bind(target) : value;
            },
          });
        };
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });

describe('DBJWT-08 live MongoDB DPoP storage', () => {
  let harness: MongoMemoryHarness;
  let peer: MongoClient;
  beforeAll(async () => {
    harness = await createReplicaSetHarness({ monitorCommands: true });
    peer = new MongoClient(harness.uri, { monitorCommands: true });
    await peer.connect();
    // This server is created/owned by the disposable harness, never a user service.
    await harness.client.db('admin').command({ setParameter: 1, ttlMonitorSleepSecs: 1 });
  }, MONGO_TIMEOUT);
  afterAll(async () => {
    await peer?.close();
    await harness?.stop();
  }, MONGO_TIMEOUT);

  const run = async (name: string, test: (db: Db) => Promise<void>) => {
    const db = harness.createDb(name);
    try {
      await test(db);
    } finally {
      await db.dropDatabase();
    }
  };
  const stores = (db: Db, now: () => number = Date.now, dpopReplayMaxEntries = 4) =>
    [
      createMongoOidcVaultStore({ db, now, dpopReplayMaxEntries }),
      createMongoOidcVaultStore({ db: peer.db(db.databaseName), now, dpopReplayMaxEntries }),
    ] as const;

  it.each([null, 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid replay capacity %s synchronously',
    (max) => {
      expect(() =>
        createMongoOidcVaultStore({ db: harness.createDb('invalid'), dpopReplayMaxEntries: max as number }),
      ).toThrow('positive safe integer');
    },
  );

  it('validates both replay collection names against all roles and rejects inconsistent shared-client capacities at readiness', async () => {
    await run('dpop-config', async (db) => {
      for (const names of [
        { dpopProofsCollectionName: '' },
        { dpopReplayCapacityCollectionName: 'oidc_vault_sessions' },
        { dpopProofsCollectionName: 'same', dpopReplayCapacityCollectionName: 'same' },
      ]) {
        expect(() => createMongoOidcVaultStore({ db, ...names })).toThrow();
      }
      const [first] = stores(db);
      await first.ready();
      const mismatched = createMongoOidcVaultStore({ db: peer.db(db.databaseName), dpopReplayMaxEntries: 8 });
      await expect(mismatched.ready()).rejects.toThrow('configuration/accounting');
      await expect(mismatched.reserveDpopProof({ replayKey: 'key', expiresAt: Date.now() + 60_000 })).rejects.toThrow(
        'configuration/accounting',
      );
      const pairedWrong = createMongoOidcVaultStore({
        db,
        dpopReplayMaxEntries: 4,
        dpopProofsCollectionName: 'different_proofs',
      });
      await expect(pairedWrong.ready()).rejects.toThrow('configuration/accounting');
    });
  });

  it('refuses a TTL index on the capacity ledger before allocating replay reservations', async () => {
    await run('dpop-ledger-ttl', async (db) => {
      await db.collection('oidc_vault_dpop_replay_capacity').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
      const store = createMongoOidcVaultStore({ db });
      await expect(store.ready()).rejects.toThrow('must not have TTL');
      await expect(store.reserveDpopProof({ replayKey: 'key', expiresAt: Date.now() + 60_000 })).rejects.toThrow(
        'must not have TTL',
      );
      expect(await db.collection('oidc_vault_dpop_proofs').countDocuments({})).toBe(0);
    });
  });

  it('reads/rotates old unbound mapper BSON null provider/expiry without treating null binding as legacy', async () => {
    await run('dpop-legacy-mapper', async (db) => {
      const [store] = stores(db);
      await store.ready();
      const sessions = db.collection<{ _id: string; [key: string]: unknown }>('oidc_vault_sessions');
      const legacy = {
        _id: 'legacy',
        logicalSessionId: 'legacy',
        subject: 's',
        provider: null,
        expiresAt: null,
        refreshToken: 'r',
        idToken: 'i',
        createdAt: 100,
        updatedAt: 100,
      };
      await sessions.insertOne(legacy);
      const read = await store.getSession('legacy');
      expect(read).toMatchObject({ sessionId: 'legacy', refreshToken: 'r', idToken: 'i' });
      expect(read!.deviceBinding).toBeUndefined();
      expect(read!.expiresAt).toBeUndefined();
      expect(read!.provider).toBeUndefined();
      expect(await store.getSessionRevocationContext('legacy')).toEqual({ logicalSessionId: 'legacy' });
      await store.rotateSession({ sessionId: 'legacy', nextSession: { ...read!, sessionId: 'current' } });
      expect(await store.getSessionRevocationContext('legacy')).toEqual({ logicalSessionId: 'legacy' });
      expect(await store.getSession('current')).not.toBeNull();
      await sessions.insertOne({ ...legacy, _id: 'malformed', deviceBinding: null });
      expect(await store.getSession('malformed')).toBeNull();
      await expect(store.getSessionRevocationContext('malformed')).rejects.toThrow();
      await sessions.insertOne({ ...legacy, _id: 'bound-malformed', deviceBinding: binding });
      await expect(store.getSessionRevocationContext('bound-malformed')).rejects.toThrow();
    });
  });

  it('preserves native BSON provider serialization while omitting only undefined plain identity fields', async () => {
    await run('dpop-provider-bson', async (db) => {
      const [store] = stores(db);
      class NativeProvider {
        issuer = 'issuer';
        clientId = 'client';
        toBSON() {
          return { issuer: this.issuer, clientId: this.clientId, serialized: 'native' };
        }
      }
      const provider = new NativeProvider();
      const source = await store.createSession({
        sessionId: 'source',
        subject: 's',
        refreshToken: 'r',
        idToken: 'i',
        provider,
        deviceBinding: binding,
      });
      expect(source.provider).toBeInstanceOf(NativeProvider);
      expect((await store.getSession('source'))!.provider).toEqual({
        issuer: 'issuer',
        clientId: 'client',
        serialized: 'native',
      });
      await store.rotateSession({ sessionId: 'source', nextSession: { ...source, sessionId: 'next' } });
      expect(await store.getSessionRevocationContext('source')).toEqual({
        logicalSessionId: 'source',
        provider: { issuer: 'issuer', clientId: 'client' },
        deviceBinding: binding,
      });
    });
  });

  for (const kind of ['transaction', 'exchange'] as const) {
    it(`${kind}: a record expiring during the filtered-deletion response never yields credentials`, async () => {
      await run(`dpop-${kind}-response-expiry`, async (db) => {
        let now = Date.now() + 60_000;
        const start = now;
        const [base] = stores(db, () => now);
        if (kind === 'transaction')
          await base.createAuthorizationTransaction({
            state: 'id',
            nonce: 'n',
            pkceVerifier: 'v',
            codeChallenge: 'c',
            createdAt: start,
            expiresAt: start + 1000,
            deviceBinding: binding,
            browserBindingHash: hash,
          });
        else
          await base.createExchangeCode({
            code: 'id',
            sessionId: 'session',
            createdAt: start,
            expiresAt: start + 1000,
            deviceBinding: binding,
            browserBindingHash: hash,
          });
        const store = createMongoOidcVaultStore({
          db: intercept(
            db,
            kind === 'transaction' ? 'oidc_vault_authorization_transactions' : 'oidc_vault_exchange_codes',
            'findOneAndDelete',
            async () => {
              now = start + 1000;
            },
            true,
          ),
          now: () => now,
          dpopReplayMaxEntries: 4,
        });
        expect(
          await (kind === 'transaction'
            ? store.consumeAuthorizationTransactionIfMatches({ state: 'id', match })
            : store.consumeExchangeCodeIfMatches({ code: 'id', expectedSessionId: 'session', match })),
        ).toBeNull();
      });
    });

    it(`${kind}: malformed/null BSON fields cannot match absent binding through any reader/consumer`, async () => {
      await run(`dpop-${kind}-corrupt`, async (db) => {
        const [store] = stores(db);
        await store.ready();
        const expiry = new Date(Date.now() + 60_000);
        const collection = db.collection<{ _id: string; [key: string]: unknown }>(
          kind === 'transaction' ? 'oidc_vault_authorization_transactions' : 'oidc_vault_exchange_codes',
        );
        const base =
          kind === 'transaction'
            ? {
                _id: 'id',
                state: 'id',
                nonce: 'n',
                pkceVerifier: 'v',
                codeChallenge: 'c',
                createdAt: 100,
                expiresAt: expiry,
              }
            : { _id: 'id', code: 'id', sessionId: 'session', createdAt: 100, expiresAt: expiry };
        for (const fields of [
          { deviceBinding: null },
          { browserBindingHash: null },
          { deviceBinding: binding },
          { deviceBinding: { ...binding, jkt: 'B'.repeat(43) }, browserBindingHash: hash },
          { deviceBinding: { ...binding, alg: 'ES256' }, browserBindingHash: hash },
          { deviceBinding: binding, browserBindingHash: 'invalid' },
          { expiresAt: 'not-a-date' },
        ]) {
          for (const operation of ['read', 'legacy', 'guarded'] as const) {
            await collection.replaceOne({ _id: 'id' }, { ...base, ...fields }, { upsert: true });
            const result =
              kind === 'transaction'
                ? operation === 'read'
                  ? await store.getAuthorizationTransaction('id')
                  : operation === 'legacy'
                    ? await store.consumeAuthorizationTransaction('id')
                    : await store.consumeAuthorizationTransactionIfMatches({ state: 'id', match: absent })
                : operation === 'read'
                  ? await store.getExchangeCode('id')
                  : operation === 'legacy'
                    ? await store.consumeExchangeCode('id')
                    : await store.consumeExchangeCodeIfMatches({
                        code: 'id',
                        expectedSessionId: 'session',
                        match: absent,
                      });
            expect(result).toBeNull();
          }
        }
      });
    });

    it(`${kind}: filtered consume keeps a concurrent changed record and owns its exact match at invocation`, async () => {
      await run(`dpop-${kind}-cas`, async (db) => {
        const [base, writer] = stores(db);
        const start = Date.now();
        const fields = {
          deviceBinding: binding,
          browserBindingHash: hash,
          createdAt: start,
          expiresAt: start + 60_000,
        };
        if (kind === 'transaction')
          await base.createAuthorizationTransaction({
            state: 'id',
            nonce: 'n',
            pkceVerifier: 'v',
            codeChallenge: 'c',
            ...fields,
          });
        else await base.createExchangeCode({ code: 'id', sessionId: 'session', ...fields });
        let replaced = false;
        const store = createMongoOidcVaultStore({
          db: intercept(
            db,
            kind === 'transaction' ? 'oidc_vault_authorization_transactions' : 'oidc_vault_exchange_codes',
            'findOneAndDelete',
            async () => {
              if (replaced) return;
              replaced = true;
              if (kind === 'transaction')
                await writer.createAuthorizationTransaction({
                  state: 'id',
                  nonce: 'n',
                  pkceVerifier: 'v',
                  codeChallenge: 'c',
                  ...fields,
                  deviceBinding: otherBinding,
                });
              else await writer.createExchangeCode({ code: 'id', sessionId: 'replacement', ...fields });
            },
          ),
          dpopReplayMaxEntries: 4,
        });
        const result =
          kind === 'transaction'
            ? await store.consumeAuthorizationTransactionIfMatches({ state: 'id', match })
            : await store.consumeExchangeCodeIfMatches({ code: 'id', expectedSessionId: 'session', match });
        expect(result).toBeNull();
        expect(replaced).toBe(true);
        const current =
          kind === 'transaction' ? await writer.getAuthorizationTransaction('id') : await writer.getExchangeCode('id');
        expect(current).not.toBeNull();
        const inputMatch = structuredClone(kind === 'transaction' ? { ...match, deviceBinding: otherBinding } : match);
        const pending =
          kind === 'transaction'
            ? base.consumeAuthorizationTransactionIfMatches({ state: 'id', match: inputMatch })
            : base.consumeExchangeCodeIfMatches({ code: 'id', expectedSessionId: 'replacement', match: inputMatch });
        inputMatch.deviceBinding = binding;
        inputMatch.browserBindingHash = 'bad';
        expect(await pending).toEqual(current);
      });
    });
  }

  it('guarded filtered deletion matches binding independent of BSON field order and refuses added binding fields', async () => {
    await run('dpop-bson-order', async (db) => {
      const [store] = stores(db);
      await store.ready();
      const codes = db.collection<{ _id: string; [key: string]: unknown }>('oidc_vault_exchange_codes');
      const base = {
        _id: 'code',
        code: 'code',
        sessionId: 'session',
        createdAt: Date.now(),
        expiresAt: new Date(Date.now() + 60_000),
        browserBindingHash: hash,
      };
      await codes.insertOne({ ...base, deviceBinding: { jkt: binding.jkt, type: 'dpop' } });
      expect(
        await store.consumeExchangeCodeIfMatches({ code: 'code', expectedSessionId: 'session', match }),
      ).toMatchObject({ deviceBinding: binding });
      await codes.insertOne({ ...base, deviceBinding: { ...binding, jwk: {} } });
      expect(
        await store.consumeExchangeCodeIfMatches({ code: 'code', expectedSessionId: 'session', match }),
      ).toBeNull();
      expect(await codes.findOne({ _id: 'code' })).not.toBeNull();
    });
  });

  it('revocation context uses one coherent snapshot across concurrent rotation and retrieves no credential fields', async () => {
    await run('dpop-alias-snapshot', async (db) => {
      const [base, writer] = stores(db);
      const source = await base.createSession({
        sessionId: 'old',
        subject: 's',
        refreshToken: 'must-not-fetch-r',
        idToken: 'must-not-fetch-i',
        accessToken: 'must-not-fetch-a',
        deviceBinding: binding,
        provider: { issuer: 'issuer', clientId: 'client' },
      });
      const current = await writer.rotateSession({
        sessionId: 'old',
        nextSession: { ...source, sessionId: 'current' },
      });
      let rotated = false;
      const store = createMongoOidcVaultStore({
        db: intercept(
          db,
          'oidc_vault_sessions',
          'findOne',
          async () => {
            if (rotated) return;
            rotated = true;
            await writer.rotateSession({ sessionId: 'current', nextSession: { ...current, sessionId: 'next' } });
          },
          true,
        ),
        dpopReplayMaxEntries: 4,
      });
      const firstEvent = harness.commandStartedEvents.length;
      expect(await store.getSessionRevocationContext('old')).toEqual({
        logicalSessionId: 'old',
        provider: { issuer: 'issuer', clientId: 'client' },
        deviceBinding: binding,
      });
      expect(rotated).toBe(true);
      const queries = harness.commandStartedEvents
        .slice(firstEvent)
        .filter((event) => event.commandName === 'find' && event.command.find === 'oidc_vault_sessions');
      expect(queries).toHaveLength(2);
      for (const query of queries) {
        expect(query.command.projection).toEqual({
          _id: 1,
          logicalSessionId: 1,
          subject: 1,
          provider: 1,
          deviceBinding: 1,
          expiresAt: 1,
        });
        expect(query.command.lsid).toBeDefined();
        expect(query.command.autocommit).toBe(false);
      }
      expect(await base.getSession('next')).not.toBeNull();
    });
  });

  it('malformed current binding/provider cannot turn a token-free historical alias into unbound authority', async () => {
    await run('dpop-alias-corrupt', async (db) => {
      const [store] = stores(db);
      const source = await store.createSession({
        sessionId: 'old',
        subject: 's',
        refreshToken: 'r',
        idToken: 'i',
        deviceBinding: binding,
      });
      await store.rotateSession({ sessionId: 'old', nextSession: { ...source, sessionId: 'current' } });
      const sessions = db.collection<{ _id: string; [key: string]: unknown }>('oidc_vault_sessions');
      const original = await sessions.findOne({ _id: 'current' });
      for (const fields of [
        { deviceBinding: null },
        { deviceBinding: { type: 'dpop', jkt: 'bad' } },
        { deviceBinding: { ...binding, privateKey: 'private' } }, // pragma: allowlist secret
        { provider: null },
        { provider: { issuer: 1 } },
      ]) {
        await sessions.replaceOne({ _id: 'current' }, { ...original!, ...fields });
        await expect(store.getSessionRevocationContext('old')).rejects.toThrow();
        await expect(store.getSessionRevocationContext('current')).rejects.toThrow();
        expect(await sessions.findOne({ _id: 'current' })).not.toBeNull();
      }
    });
  });

  it('binding is part of rotation source-generation matching through a retried transaction', async () => {
    await run('dpop-rotation-generation', async (db) => {
      const [base, writer] = stores(db);
      const source = await base.createSession({
        sessionId: 'source',
        subject: 's',
        refreshToken: 'r',
        idToken: 'i',
        deviceBinding: binding,
      });
      let changed = false;
      const store = createMongoOidcVaultStore({
        db: intercept(db, 'oidc_vault_sessions', 'insertOne', async () => {
          if (changed) return;
          changed = true;
          await writer.createSession({ ...source, deviceBinding: otherBinding });
        }),
        dpopReplayMaxEntries: 4,
      });
      await expect(
        withFailCommand(db, { failCommands: ['insert'], errorCode: 112 }, () =>
          store.rotateSession({ sessionId: 'source', nextSession: { ...source, sessionId: 'target' } }),
        ),
      ).rejects.toBeInstanceOf(OidcVaultStoreConflictError);
      expect(changed).toBe(true);
      expect((await base.getSession('source'))!.deviceBinding).toEqual(otherBinding);
      expect(await base.getSession('target')).toBeNull();
    });
  });

  it('independent-client duplicate replay races have exactly one winner and one accounted row', async () => {
    await run('dpop-replay-race', async (db) => {
      const clients = stores(db);
      await Promise.all(clients.map((store) => store.ready()));
      const expiry = Date.now() + 60_000;
      const results = await Promise.all(
        Array.from({ length: 16 }, (_, index) =>
          clients[index % 2]!.reserveDpopProof({ replayKey: 'opaque-shared-key', expiresAt: expiry }),
        ),
      );
      expect(results.filter(Boolean)).toHaveLength(1);
      expect(await db.collection('oidc_vault_dpop_proofs').countDocuments({})).toBe(1);
      expect(await db.collection('oidc_vault_dpop_replay_capacity').countDocuments({ kind: 'reservation' })).toBe(1);
      expect(await db.collection('oidc_vault_dpop_replay_capacity').findOne({ kind: 'capacity' })).toMatchObject({
        entries: 1,
      });
    });
  });

  it('shared capacity serializes unique-key admissions and duplicates beat capacity without live eviction', async () => {
    await run('dpop-replay-capacity', async (db) => {
      const clients = stores(db);
      await Promise.all(clients.map((store) => store.ready()));
      const expiry = Date.now() + 60_000;
      const results = await Promise.allSettled(
        Array.from({ length: 12 }, (_, index) =>
          clients[index % 2]!.reserveDpopProof({ replayKey: `key-${index}`, expiresAt: expiry }),
        ),
      );
      const winners = results.flatMap((result, index) =>
        result.status === 'fulfilled' && result.value ? [`key-${index}`] : [],
      );
      expect(winners).toHaveLength(4);
      for (const result of results)
        if (result.status === 'rejected') expect(result.reason).toBeInstanceOf(OidcVaultDpopReplayCapacityError);
      for (const replayKey of winners)
        expect(await clients[1].reserveDpopProof({ replayKey, expiresAt: expiry + 10_000 })).toBe(false);
      expect(await db.collection('oidc_vault_dpop_proofs').countDocuments({})).toBe(4);
      expect(await db.collection('oidc_vault_dpop_replay_capacity').findOne({ kind: 'capacity' })).toMatchObject({
        entries: 4,
      });
    });
  });

  it('real TTL deletion does not leak the shared capacity counter; expiry-accounting cleanup admits again', async () => {
    await run('dpop-real-ttl', async (db) => {
      const clients = stores(db, Date.now, 2);
      await Promise.all(clients.map((store) => store.ready()));
      const expiresAt = Date.now() + 300;
      expect(await clients[0].reserveDpopProof({ replayKey: 'first', expiresAt })).toBe(true);
      expect(await clients[1].reserveDpopProof({ replayKey: 'second', expiresAt })).toBe(true);
      const proofs = db.collection('oidc_vault_dpop_proofs');
      const capacity = db.collection('oidc_vault_dpop_replay_capacity');
      await waitUntil(async () => (await proofs.countDocuments({})) === 0);
      // Only the physical proof rows were TTL-deleted; ledger is reclaimable
      // authority, not an inflated counter with no remaining expiry evidence.
      expect(await capacity.countDocuments({ kind: 'reservation' })).toBe(2);
      expect(await capacity.findOne({ kind: 'capacity' })).toMatchObject({ entries: 2 });
      expect(await clients[1].reserveDpopProof({ replayKey: 'fresh', expiresAt: Date.now() + 60_000 })).toBe(true);
      expect(await capacity.countDocuments({ kind: 'reservation' })).toBe(1);
      expect(await capacity.findOne({ kind: 'capacity' })).toMatchObject({ entries: 1 });
      expect(await clients[0].reserveDpopProof({ replayKey: 'first', expiresAt: Date.now() + 60_000 })).toBe(true);
      expect(await capacity.findOne({ kind: 'capacity' })).toMatchObject({ entries: 2 });
      const indexes = await capacity.listIndexes().toArray();
      expect(indexes.some((index) => index.expireAfterSeconds !== undefined)).toBe(false);
      expect(indexes.some((index) => index.name === 'dpop_expiry_accounting_idx')).toBe(true);
    });
  });

  it('per-admission indexed expiry cleanup is bounded to 64 rows and preserves live reservations', async () => {
    await run('dpop-bounded-expiry', async (db) => {
      let now = Date.now() + 60_000;
      const clients = stores(db, () => now, 256);
      await Promise.all(clients.map((store) => store.ready()));
      const expired = Array.from({ length: 255 }, (_, index) => ({
        _id: `expired-${index}`,
        expiresAt: new Date(now + 1000),
      }));
      const live = { _id: 'retained-live', expiresAt: new Date(now + 60_000) };
      await db.collection<{ _id: string; expiresAt: Date }>('oidc_vault_dpop_proofs').insertMany([...expired, live]);
      await db.collection<{ _id: string; [key: string]: unknown }>('oidc_vault_dpop_replay_capacity').insertMany(
        [...expired, live].map((row) => ({
          _id: `proof:${row._id}`,
          kind: 'reservation',
          replayKey: row._id,
          expiresAt: row.expiresAt,
        })),
      );
      await db
        .collection('oidc_vault_dpop_replay_capacity')
        .updateOne({ kind: 'capacity' }, { $set: { entries: 256 } });
      now += 1000;
      expect(await clients[0].reserveDpopProof({ replayKey: 'fresh', expiresAt: now + 60_000 })).toBe(true);
      expect(await db.collection('oidc_vault_dpop_replay_capacity').countDocuments({ kind: 'reservation' })).toBe(193);
      expect(await db.collection('oidc_vault_dpop_replay_capacity').findOne({ kind: 'capacity' })).toMatchObject({
        entries: 193,
      });
      expect(
        await db.collection<{ _id: string }>('oidc_vault_dpop_proofs').findOne({ _id: 'retained-live' }),
      ).not.toBeNull();
      expect(await clients[1].reserveDpopProof({ replayKey: 'retained-live', expiresAt: now + 120_000 })).toBe(false);
    });
  });

  it('missing physical replay row cannot grant a bypass while live accounting still reserves the key', async () => {
    await run('dpop-missing-row', async (db) => {
      const [store, other] = stores(db);
      const expiry = Date.now() + 60_000;
      expect(await store.reserveDpopProof({ replayKey: 'key', expiresAt: expiry })).toBe(true);
      await db.collection<{ _id: string }>('oidc_vault_dpop_proofs').deleteOne({ _id: 'key' });
      expect(await other.reserveDpopProof({ replayKey: 'key', expiresAt: expiry + 10_000 })).toBe(false);
    });
  });

  it('rollback/retry leaves proof, accounting and capacity coherent, with no half-reservation on provider failure', async () => {
    await run('dpop-replay-failure', async (db) => {
      const store = createMongoOidcVaultStore({
        db: createDbWithCollectionWriteFailure(db, {
          collectionName: 'oidc_vault_dpop_replay_capacity',
          methodName: 'insertOne',
        }),
        dpopReplayMaxEntries: 4,
      });
      await store.ready();
      const expiresAt = Date.now() + 60_000;
      await expect(store.reserveDpopProof({ replayKey: 'failed', expiresAt })).rejects.toThrow('Injected');
      expect(await db.collection('oidc_vault_dpop_proofs').countDocuments({})).toBe(0);
      expect(await db.collection('oidc_vault_dpop_replay_capacity').findOne({ kind: 'capacity' })).toMatchObject({
        entries: 0,
      });
      expect(
        await withFailCommand(db, { failCommands: ['update'], errorCode: 112 }, () =>
          store.reserveDpopProof({ replayKey: 'retry', expiresAt }),
        ),
      ).toBe(true);
      expect(await db.collection('oidc_vault_dpop_proofs').countDocuments({})).toBe(1);
      expect(await db.collection('oidc_vault_dpop_replay_capacity').findOne({ kind: 'capacity' })).toMatchObject({
        entries: 1,
      });
      expect(await store.reserveDpopProof({ replayKey: 'retry', expiresAt })).toBe(false);
    });
  });

  it('invalid epochs leave no reservation and malformed accounting fails closed with no allocation', async () => {
    await run('dpop-invalid-expiry', async (db) => {
      let now = Date.now() + 60_000;
      const [store] = stores(db, () => now);
      await store.ready();
      for (const expiresAt of [now - 1, now, NaN, Infinity, now + 0.5, now + 360_001, Number.MAX_SAFE_INTEGER + 1]) {
        expect(await store.reserveDpopProof({ replayKey: 'invalid', expiresAt })).toBe(false);
      }
      expect(await db.collection('oidc_vault_dpop_proofs').countDocuments({})).toBe(0);
      expect(await store.reserveDpopProof({ replayKey: 'key', expiresAt: now + 1000 })).toBe(true);
      await db
        .collection<{ _id: string }>('oidc_vault_dpop_replay_capacity')
        .updateOne({ _id: 'proof:key' }, { $set: { expiresAt: 'bad' } });
      now += 1000;
      await expect(store.reserveDpopProof({ replayKey: 'key', expiresAt: now + 1000 })).rejects.toThrow('malformed');
      expect(await db.collection('oidc_vault_dpop_replay_capacity').findOne({ kind: 'capacity' })).toMatchObject({
        entries: 1,
      });
    });
  });
});
