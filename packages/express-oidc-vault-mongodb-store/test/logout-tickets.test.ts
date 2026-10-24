import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoClient, type CollectionOptions, type CommandStartedEvent, type Db } from 'mongodb';
import { OidcVaultStoreConflictError } from '@web-ts-toolkit/express-oidc-vault';
import {
  defineOidcVaultLogoutNavigationStoreConformanceSuite,
  logoutTicket,
} from '../../express-oidc-vault/test/store-provider-conformance';
import { createMongoOidcVaultStore } from '../src';
import { ticketId } from '../src/logout-ticket-validation';
import { createReplicaSetHarness, MONGO_TIMEOUT, type MongoMemoryHarness } from './mongo-memory';

const PAYLOAD = 'oidc_vault_logout_navigation_tickets';
const LEDGER = 'oidc_vault_logout_navigation_capacity';
const intercept = (db: Db, name: string, method: string, hook: () => Promise<void>, after = false): Db =>
  new Proxy(db, {
    get(target, key) {
      if (key === 'collection')
        return (collectionName: string, options?: CollectionOptions) => {
          const collection = target.collection(collectionName, options);
          if (name !== collectionName) return collection;
          return new Proxy(collection, {
            get(target, key) {
              const value = Reflect.get(target, key);
              if (key === method)
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
      const value = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });

describe('real MongoDB logout ticket storage', () => {
  let harness: MongoMemoryHarness;
  let peer: MongoClient;
  let primary: string;
  const events: CommandStartedEvent[] = [];
  beforeAll(async () => {
    harness = await createReplicaSetHarness({ replicaSetMembers: 2 });
    primary = (await harness.client.db('admin').command({ hello: 1 })).primary as string;
    peer = new MongoClient(harness.uri, {
      readPreference: 'secondaryPreferred',
      monitorCommands: true,
      serverSelectionTimeoutMS: 5000,
    });
    peer.on('commandStarted', (event) => events.push(event));
    await peer.connect();
  }, MONGO_TIMEOUT);
  afterAll(async () => {
    await peer?.close();
    await harness?.stop();
  }, MONGO_TIMEOUT);

  defineOidcVaultLogoutNavigationStoreConformanceSuite('MongoDB independent clients', {
    createContext: async (name, options) => {
      const db = harness.createDb(`ticket-${name.replace(/[^a-z0-9-]/gi, '-')}`);
      let clock = Date.now() + 120_000;
      const store = createMongoOidcVaultStore({ db, ...options, now: () => clock });
      const peerStore = createMongoOidcVaultStore({
        db: peer.db(db.databaseName, { readPreference: 'secondary' }),
        ...options,
        now: () => clock,
      });
      await Promise.all([store.ready(), peerStore.ready()]);
      return {
        store,
        peerStore,
        now: () => clock,
        advanceTo: (value) => {
          clock = value;
        },
        cleanup: async () => {
          await db.dropDatabase();
        },
      };
    },
  });

  const run = async (name: string, test: (db: Db) => Promise<void>) => {
    const db = harness.createDb(name);
    try {
      await test(db);
    } finally {
      await db.dropDatabase();
    }
  };

  it.each([null, 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects capacity %s at construction',
    (max) => {
      expect(() =>
        createMongoOidcVaultStore({ db: harness.client.db('unused'), logoutNavigationMaxEntries: max as number }),
      ).toThrow('positive safe integer');
    },
  );

  it('defaults to 10000 and rejects both-direction collection pairing, capacity mismatch and TTL ledger', async () => {
    await run('ticket-config', async (db) => {
      const store = createMongoOidcVaultStore({ db });
      await store.ready();
      expect(await db.collection(LEDGER).findOne({ _id: 'capacity' } as never)).toMatchObject({
        maxEntries: 10_000,
        entries: 0,
        ticketsCollectionName: PAYLOAD,
      });
      expect(await db.collection(PAYLOAD).findOne({ _id: 'configuration' } as never)).toMatchObject({
        capacityCollectionName: LEDGER,
        maxEntries: 10_000,
      });
      for (const options of [
        { logoutNavigationMaxEntries: 9 },
        { logoutNavigationTicketsCollectionName: 'different-payload' },
        { logoutNavigationCapacityCollectionName: 'different-ledger' },
      ])
        await expect(createMongoOidcVaultStore({ db: peer.db(db.databaseName), ...options }).ready()).rejects.toThrow(
          'configuration/accounting',
        );
    });
    await run('ticket-ttl-ledger', async (db) => {
      await db.collection(LEDGER).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
      const store = createMongoOidcVaultStore({ db });
      await expect(store.ready()).rejects.toThrow('must not have TTL');
      await expect(store.consumeLogoutNavigationTicket(logoutTicket(Date.now()))).rejects.toThrow('must not have TTL');
    });
    for (const name of [
      PAYLOAD,
      LEDGER,
      'oidc_vault_sessions',
      'oidc_vault_dpop_proofs',
      'oidc_vault_dpop_replay_capacity',
    ]) {
      expect(() =>
        createMongoOidcVaultStore({
          db: harness.client.db('unused'),
          logoutNavigationTicketsCollectionName: name,
          logoutNavigationCapacityCollectionName: name,
        }),
      ).toThrow('distinct');
    }
  });

  it('keeps new readiness/collections/create/consume/cleanup on primary with caller secondary defaults and custom names', async () => {
    await run('ticket-primary', async (setup) => {
      const db = peer.db(setup.databaseName, { readPreference: 'secondary' });
      let clock = Date.now() + 120_000;
      const start = events.length;
      const store = createMongoOidcVaultStore({
        db,
        now: () => clock,
        logoutNavigationTicketsCollectionName: 'custom-ticket',
        logoutNavigationCapacityCollectionName: 'custom-ledger',
      });
      await store.ready();
      const record = { ...logoutTicket(clock), expiresAt: clock + 1000 };
      await store.createLogoutNavigationTicket(record);
      clock += 1000;
      expect(await store.consumeLogoutNavigationTicket(record)).toBeNull();
      const live = logoutTicket(clock, 'live');
      await store.createLogoutNavigationTicket(live);
      expect(await store.consumeLogoutNavigationTicket(live)).toEqual(live);
      const trace = events.slice(start).filter((event) => event.databaseName === db.databaseName);
      expect(trace.filter((event) => event.commandName === 'listIndexes').length).toBeGreaterThanOrEqual(2);
      expect(trace.filter((event) => event.command.startTransaction).length).toBe(4);
      expect(trace.every((event) => event.address === primary)).toBe(true);
      expect(db.readPreference.mode).toBe('secondary');
      expect(peer.readPreference.mode).toBe('secondaryPreferred');
      expect(db.collection('unrelated').readPreference?.mode).toBe('secondary');
      expect(await setup.collection('custom-ticket').countDocuments()).toBe(1); // fixed pairing row only
    });
  });

  it('payload TTL is eventual reclamation: logical expiry with lag, bounded cleanup, and early disappearance keep counts coherent', async () => {
    await run('ticket-expiry-ledger', async (db) => {
      let clock = Date.now() + 120_000;
      const store = createMongoOidcVaultStore({ db, now: () => clock, logoutNavigationMaxEntries: 256 });
      await store.ready();
      const records = Array.from({ length: 200 }, (_, i) => ({
        ...logoutTicket(clock, `${i}`),
        expiresAt: clock + 1000,
      }));
      await db.collection(PAYLOAD).insertMany(
        records.map((record) => ({
          _id: ticketId(record),
          ...record,
          expiresAt: new Date(record.expiresAt),
        })) as never,
      );
      await db.collection(LEDGER).insertMany(
        records.map((record) => ({
          _id: `ticket:${ticketId(record)}`,
          kind: 'ticket',
          namespace: record.namespace,
          ticketHash: record.ticketHash,
          expiresAt: new Date(record.expiresAt),
        })) as never,
      );
      await db.collection(LEDGER).updateOne({ _id: 'capacity' } as never, { $set: { entries: 200 } });
      const live = logoutTicket(clock, 'live');
      await store.createLogoutNavigationTicket(live);
      clock += 1000;
      expect(await store.consumeLogoutNavigationTicket(records[199]!)).toBeNull();
      expect(await db.collection(LEDGER).findOne({ _id: 'capacity' } as never)).toMatchObject({ entries: 136 });
      expect(await db.collection(PAYLOAD).countDocuments({ _id: { $ne: 'configuration' } } as never)).toBe(136);
      const other = createMongoOidcVaultStore({
        db: peer.db(db.databaseName),
        now: () => clock,
        logoutNavigationMaxEntries: 256,
      });
      await other.ready();
      expect(
        await Promise.all([
          store.consumeLogoutNavigationTicket(logoutTicket(clock, 'unknown-one')),
          other.consumeLogoutNavigationTicket(logoutTicket(clock, 'unknown-two')),
        ]),
      ).toEqual([null, null]);
      expect(await db.collection(LEDGER).findOne({ _id: 'capacity' } as never)).toMatchObject({ entries: 8 });
      expect(await store.consumeLogoutNavigationTicket(live)).toEqual(live);
      expect(await db.collection(LEDGER).findOne({ _id: 'capacity' } as never)).toMatchObject({ entries: 0 });
      const gone = logoutTicket(clock, 'early-gone');
      await store.createLogoutNavigationTicket(gone);
      await db.collection(PAYLOAD).deleteOne({ _id: ticketId(gone) } as never);
      await expect(store.createLogoutNavigationTicket(gone)).rejects.toBeInstanceOf(OidcVaultStoreConflictError);
      expect(await store.consumeLogoutNavigationTicket(gone)).toBeNull();
      const accounting = await db.collection(LEDGER).findOne({ _id: 'capacity' } as never);
      expect(accounting!.entries).toBe(await db.collection(LEDGER).countDocuments({ kind: 'ticket' }));
      expect(
        (await db.collection(PAYLOAD).listIndexes().toArray()).some((index) => index.expireAfterSeconds === 0),
      ).toBe(true);
      expect(
        (await db.collection(LEDGER).listIndexes().toArray()).every((index) => index.expireAfterSeconds === undefined),
      ).toBe(true);
    });
  });

  it.each([
    { upstreamLogoutUrl: 'https://evil.example/#fragment' },
    { namespace: 'wrong' },
    { ticketHash: 'bad' },
    { createdAt: NaN },
    { expiresAt: 'not-date' },
    { extraToken: 'must-not-return' },
  ])('retires selected malformed payload without a grant: %j', async (fields) => {
    await run('ticket-malformed', async (db) => {
      const now = Date.now() + 120_000;
      const store = createMongoOidcVaultStore({ db, now: () => now, logoutNavigationMaxEntries: 1 });
      const record = logoutTicket(now);
      await store.createLogoutNavigationTicket(record);
      await db.collection(PAYLOAD).updateOne({ _id: ticketId(record) } as never, { $set: fields });
      expect(await store.consumeLogoutNavigationTicket(record)).toBeNull();
      expect(await db.collection(PAYLOAD).findOne({ _id: ticketId(record) } as never)).toBeNull();
      expect(await db.collection(LEDGER).findOne({ _id: 'capacity' } as never)).toMatchObject({ entries: 0 });
      await store.createLogoutNavigationTicket(logoutTicket(now, 'replacement'));
    });
  });

  it.each([{ entries: 0 }, { entries: -1 }, { entries: 2 }, { revision: NaN }, { maxEntries: 99 }])(
    'corrupt accounting fails closed and cannot spend a grant: %j',
    async (fields) => {
      await run('ticket-corrupt', async (db) => {
        const now = Date.now() + 120_000;
        const store = createMongoOidcVaultStore({ db, now: () => now });
        const record = logoutTicket(now);
        await store.createLogoutNavigationTicket(record);
        await db.collection(LEDGER).updateOne({ _id: 'capacity' } as never, { $set: fields });
        await expect(store.consumeLogoutNavigationTicket(record)).rejects.toThrow('accounting');
        expect(await db.collection(PAYLOAD).findOne({ _id: ticketId(record) } as never)).not.toBeNull();
      });
    },
  );

  it('missing/malformed ledger and expiry mismatch fail closed rather than deriving authority from payload', async () => {
    for (const mode of ['missing', 'expiry', 'identity'])
      await run(`ticket-ledger-${mode}`, async (db) => {
        const now = Date.now() + 120_000;
        const store = createMongoOidcVaultStore({ db, now: () => now });
        const record = logoutTicket(now);
        await store.createLogoutNavigationTicket(record);
        if (mode === 'missing') await db.collection(LEDGER).deleteOne({ _id: `ticket:${ticketId(record)}` } as never);
        else
          await db.collection(LEDGER).updateOne({ _id: `ticket:${ticketId(record)}` } as never, {
            $set: mode === 'expiry' ? { expiresAt: new Date(record.expiresAt + 1) } : { ticketHash: 'bad' },
          });
        await expect(store.consumeLogoutNavigationTicket(record)).rejects.toThrow('accounting');
        expect(await db.collection(PAYLOAD).findOne({ _id: ticketId(record) } as never)).not.toBeNull();
      });
  });

  it.each(['create', 'consume'] as const)(
    '%s write failure rolls back payload, ledger and count together',
    async (operation) => {
      await run(`ticket-failure-${operation}`, async (db) => {
        let armed = false;
        const error = new Error('injected after ticket write');
        const wrapped = intercept(
          db,
          operation === 'create' ? LEDGER : PAYLOAD,
          operation === 'create' ? 'insertOne' : 'deleteMany',
          async () => {
            if (armed) throw error;
          },
          true,
        );
        const now = Date.now() + 120_000;
        const store = createMongoOidcVaultStore({ db: wrapped, now: () => now });
        await store.ready();
        const record = logoutTicket(now);
        if (operation === 'consume') await store.createLogoutNavigationTicket(record);
        armed = true;
        await expect(
          operation === 'create'
            ? store.createLogoutNavigationTicket(record)
            : store.consumeLogoutNavigationTicket(record),
        ).rejects.toBe(error);
        const entries = operation === 'create' ? 0 : 1;
        expect(await db.collection(LEDGER).findOne({ _id: 'capacity' } as never)).toMatchObject({ entries });
        expect(await db.collection(LEDGER).countDocuments({ kind: 'ticket' })).toBe(entries);
        expect(await db.collection(PAYLOAD).countDocuments({ _id: { $ne: 'configuration' } } as never)).toBe(entries);
        armed = false;
        if (operation === 'create') await store.createLogoutNavigationTicket(record);
        expect(await store.consumeLogoutNavigationTicket(record)).toEqual(record);
      });
    },
  );

  it('captures invocation fields while readiness is held and rolls back clock failure after transactional writes', async () => {
    await run('ticket-readiness-mutation', async (db) => {
      let release!: () => void;
      let entered!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const started = new Promise<void>((resolve) => {
        entered = resolve;
      });
      let clock = Date.now() + 120_000;
      const store = createMongoOidcVaultStore({
        db: intercept(db, PAYLOAD, 'findOne', async () => {
          entered();
          await held;
        }),
        now: () => clock,
      });
      const record = logoutTicket(clock);
      const expected = { ...record };
      const pending = store.createLogoutNavigationTicket(record);
      await started;
      Object.assign(record, logoutTicket(0, 'changed'));
      release();
      await pending;
      const failing = createMongoOidcVaultStore({
        db: intercept(
          db,
          PAYLOAD,
          'deleteMany',
          async () => {
            clock = NaN;
          },
          true,
        ),
        now: () => clock,
      });
      await failing.ready();
      await expect(failing.consumeLogoutNavigationTicket(expected)).rejects.toThrow('clock');
      clock = expected.createdAt;
      expect(await store.consumeLogoutNavigationTicket(expected)).toEqual(expected);
    });
  });
});
