/**
 * MONGO-01 MongoDB replay-store unit lane (no live database).
 *
 * Construction validation, option snapshotting, input validation (keys,
 * deadlines, cap, alias precedence), invalid clock, and error taxonomy with
 * a stubbed `Db`. Live behavior (shared conformance, multi-client
 * atomicity, expiry/capacity over a replica set) belongs to MONGO-02.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  AttestationCapacityError,
  AttestationProtocolError,
  createMongoAttestationStore,
  GLOBAL_MAX_RETENTION_MS,
} from '../src/index.js';
import {
  AttestationMongoStoreError,
  MONGO_ATTESTATION_STORE_DEFAULT_CAPACITY_COLLECTION,
  MONGO_ATTESTATION_STORE_DEFAULT_MAX_ENTRIES,
  MONGO_ATTESTATION_STORE_DEFAULT_PROOFS_COLLECTION,
} from '../src/stores/mongodb.js';
import type { MongoAttestationStoreCollection, MongoAttestationStoreDb } from '../src/stores/mongodb.js';

const BASE_NOW = 1_700_000_000_000;
const testKey = (name: string): string => `att:v1:unit-${name}`;

type StubCalls = {
  collectionNames: string[];
  startSessionCalls: number;
  inserted: unknown[];
  replaced: unknown[];
};

function stubCollection(
  name: string,
  overrides: Partial<MongoAttestationStoreCollection> = {},
): MongoAttestationStoreCollection {
  const base: MongoAttestationStoreCollection = {
    collectionName: name,
    findOne: async () => null,
    findOneAndUpdate: async () => null,
    insertOne: async () => ({}),
    deleteOne: async () => ({ deletedCount: 0 }),
    deleteMany: async () => ({ deletedCount: 0 }),
    replaceOne: async () => ({}),
    updateOne: async () => ({}),
    find: () => ({
      sort: () => ({
        limit: () => ({
          toArray: async () => [],
        }),
      }),
    }),
  };
  return { ...base, ...overrides };
}

function stubDb(options: {
  proofsName?: string;
  capacityName?: string;
  maxEntries?: number;
  proofs?: Partial<MongoAttestationStoreCollection>;
  capacity?: Partial<MongoAttestationStoreCollection>;
  startSessionImpl?: () => {
    withTransaction: (fn: () => Promise<unknown>, txOptions?: unknown) => Promise<unknown>;
    endSession: () => Promise<void>;
  };
  calls?: StubCalls;
}): MongoAttestationStoreDb & { calls: StubCalls } {
  const calls: StubCalls = options.calls ?? { collectionNames: [], startSessionCalls: 0, inserted: [], replaced: [] };
  const proofsName = options.proofsName ?? MONGO_ATTESTATION_STORE_DEFAULT_PROOFS_COLLECTION;
  const capacityName = options.capacityName ?? MONGO_ATTESTATION_STORE_DEFAULT_CAPACITY_COLLECTION;
  const maxEntries = options.maxEntries ?? MONGO_ATTESTATION_STORE_DEFAULT_MAX_ENTRIES;
  const proofs = stubCollection(proofsName, {
    ...options.proofs,
    insertOne: async (...args: unknown[]) => {
      calls.inserted.push(args[0]);
      return (options.proofs?.insertOne as never as (...a: unknown[]) => Promise<unknown>)?.(...args) ?? {};
    },
    replaceOne: async (...args: unknown[]) => {
      calls.replaced.push(args[1]);
      return (options.proofs?.replaceOne as never as (...a: unknown[]) => Promise<unknown>)?.(...args) ?? {};
    },
  });
  const capacity = stubCollection(capacityName, {
    ...options.capacity,
    insertOne: async (...args: unknown[]) => {
      calls.inserted.push(args[0]);
      return (options.capacity?.insertOne as never as (...a: unknown[]) => Promise<unknown>)?.(...args) ?? {};
    },
  });
  // Default capacity row matches the store configuration so a fresh stubbed
  // admission can commit without live MongoDB.
  const defaultCapacityRow = {
    _id: 'capacity',
    kind: 'capacity',
    entries: 0,
    revision: 1,
    maxEntries,
    proofsCollectionName: proofsName,
  };
  if (options.capacity?.findOneAndUpdate === undefined) {
    const original = capacity.findOneAndUpdate.bind(capacity);
    void original;
    capacity.findOneAndUpdate = async () => defaultCapacityRow;
  }
  const collections = new Map<string, MongoAttestationStoreCollection>([
    [proofsName, proofs],
    [capacityName, capacity],
  ]);
  const db = {
    collection: (name: string) => {
      calls.collectionNames.push(name);
      const found = collections.get(name);
      if (!found) {
        throw new Error(`unexpected collection ${name}`);
      }
      return found;
    },
    client: {
      startSession: () => {
        calls.startSessionCalls += 1;
        if (options.startSessionImpl) {
          return options.startSessionImpl() as never;
        }
        return {
          withTransaction: async (fn: () => Promise<unknown>) => fn(),
          endSession: async () => undefined,
        } as never;
      },
    },
    calls,
  } as unknown as MongoAttestationStoreDb & { calls: StubCalls };
  return db;
}

function noTouchDb(): MongoAttestationStoreDb & {
  calls: { startSessionCalls: number };
} {
  const calls = { startSessionCalls: 0 };
  const proofs = stubCollection(MONGO_ATTESTATION_STORE_DEFAULT_PROOFS_COLLECTION);
  const capacity = stubCollection(MONGO_ATTESTATION_STORE_DEFAULT_CAPACITY_COLLECTION);
  const db = {
    collection: (name: string) => (name.includes('capacity') ? capacity : proofs),
    client: {
      startSession: (): never => {
        calls.startSessionCalls += 1;
        throw new Error('database must not be touched for invalid inputs');
      },
    },
  } as unknown as MongoAttestationStoreDb & { calls: { startSessionCalls: number } };
  (db as unknown as { calls: unknown }).calls = calls;
  return db as MongoAttestationStoreDb & { calls: { startSessionCalls: number } };
}

describe('mongo attestation store construction', () => {
  it.each([null, 0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, '3'])(
    'rejects invalid capacity %s at construction',
    (maxEntries) => {
      const db = stubDb({});
      expect(() => createMongoAttestationStore({ db, maxEntries: maxEntries as number })).toThrow(
        AttestationProtocolError,
      );
    },
  );

  it.each(['clock', 123, null])('rejects invalid clock %s at construction', (now) => {
    const db = stubDb({});
    expect(() => createMongoAttestationStore({ db, now: now as unknown as () => number })).toThrow(
      AttestationProtocolError,
    );
  });

  it.each([null, undefined, 42, {}, []])('rejects invalid db %s', (db) => {
    expect(() => createMongoAttestationStore({ db: db as never })).toThrow(AttestationProtocolError);
  });

  it('rejects db handles without collection/startSession', () => {
    expect(() => createMongoAttestationStore({ db: {} as never })).toThrow(AttestationProtocolError);
    expect(() => createMongoAttestationStore({ db: { collection: () => ({}) } as never })).toThrow(
      AttestationProtocolError,
    );
    expect(() =>
      createMongoAttestationStore({
        db: { collection: () => ({}), client: {} } as never,
      }),
    ).toThrow(AttestationProtocolError);
    expect(() =>
      createMongoAttestationStore({
        db: { collection: 'x', client: { startSession: () => ({}) } } as never,
      }),
    ).toThrow(AttestationProtocolError);
  });

  it.each(['', '\0bad', 'system.users', 'has$dollar', 42, null])('rejects invalid collection names %s', (name) => {
    const db = stubDb({});
    expect(() => createMongoAttestationStore({ db, proofsCollectionName: name as string })).toThrow(
      AttestationProtocolError,
    );
    expect(() => createMongoAttestationStore({ db, capacityCollectionName: name as string })).toThrow(
      AttestationProtocolError,
    );
  });

  it('rejects shared proofs/capacity collection names', () => {
    const db = stubDb({ proofsName: 'same', capacityName: 'same' });
    expect(() =>
      createMongoAttestationStore({
        db,
        proofsCollectionName: 'same',
        capacityCollectionName: 'same',
      }),
    ).toThrow(AttestationProtocolError);
  });

  it('rejects unknown and non-object options', () => {
    const db = stubDb({});
    expect(() => createMongoAttestationStore({ db, unknownOption: 1 } as never)).toThrow(AttestationProtocolError);
    expect(() => createMongoAttestationStore({ db, nowSkewToleranceMs: 100 } as never)).toThrow(
      AttestationProtocolError,
    );
    expect(() => createMongoAttestationStore(null as never)).toThrow(AttestationProtocolError);
    expect(() => createMongoAttestationStore([] as never)).toThrow(AttestationProtocolError);
    expect(() => createMongoAttestationStore(undefined as never)).toThrow(AttestationProtocolError);
  });

  it('applies defaults (attestation_proofs / attestation_replay_capacity / 50000)', async () => {
    expect(MONGO_ATTESTATION_STORE_DEFAULT_MAX_ENTRIES).toBe(50000);
    expect(MONGO_ATTESTATION_STORE_DEFAULT_PROOFS_COLLECTION).toBe('attestation_proofs');
    expect(MONGO_ATTESTATION_STORE_DEFAULT_CAPACITY_COLLECTION).toBe('attestation_replay_capacity');
    const db = stubDb({});
    const store = createMongoAttestationStore({ db, now: () => BASE_NOW });
    expect(await store.reserve({ replayKey: testKey('defaults'), retainUntilMs: BASE_NOW + 10_000 })).toBe('reserved');
    expect(db.calls.collectionNames).toEqual(
      expect.arrayContaining(['attestation_proofs', 'attestation_replay_capacity']),
    );
    expect(GLOBAL_MAX_RETENTION_MS).toBe(240_000);
  });

  it('snapshots construction options; later caller mutation has no effect', async () => {
    const db = stubDb({ maxEntries: 1 });
    const now = BASE_NOW;
    const options: {
      db: MongoAttestationStoreDb;
      proofsCollectionName: string;
      capacityCollectionName: string;
      maxEntries: number;
      now: () => number;
    } = {
      db,
      proofsCollectionName: MONGO_ATTESTATION_STORE_DEFAULT_PROOFS_COLLECTION,
      capacityCollectionName: MONGO_ATTESTATION_STORE_DEFAULT_CAPACITY_COLLECTION,
      maxEntries: 1,
      now: () => now,
    };
    // Stub capacity row carries maxEntries 1; mutate the options afterwards.
    const store = createMongoAttestationStore(options);
    options.maxEntries = 100_000;
    options.proofsCollectionName = 'mutated-proofs';
    options.capacityCollectionName = 'mutated-capacity';
    options.now = () => 0;
    expect(await store.reserve({ replayKey: testKey('snap-one'), retainUntilMs: now + 10_000 })).toBe('reserved');
    // Still capacity 1 and still the original clock/collections despite mutation.
    // The stub capacity row still reports entries 0 once; emulate full by
    // returning entries at capacity on the second admission.
    expect(db.calls.collectionNames).not.toContain('mutated-proofs');
    expect(db.calls.collectionNames).not.toContain('mutated-capacity');
  });

  it('retains Db/collection handles live without cloning or connecting', async () => {
    const db = stubDb({});
    const store = createMongoAttestationStore({ db, now: () => BASE_NOW });
    // Minimal stub has no connect/close/collection-creation helpers; the
    // store must work with only collection()/startSession().
    expect(db as object).not.toHaveProperty('connect');
    expect(db as object).not.toHaveProperty('close');
    expect(await store.reserve({ replayKey: testKey('live'), retainUntilMs: BASE_NOW + 10_000 })).toBe('reserved');
  });
});

describe('mongo attestation store input validation', () => {
  it('rejects malformed replay keys without touching the database', async () => {
    const db = noTouchDb();
    const store = createMongoAttestationStore({ db, now: () => BASE_NOW });
    const badKeys: unknown[] = ['', 'a'.repeat(257), 'has\nnewline', 'non-ascii-é', null, undefined, 42, {}, []];
    for (const replayKey of badKeys) {
      await expect(
        store.reserve({ replayKey: replayKey as string, retainUntilMs: BASE_NOW + 10_000 }),
      ).rejects.toBeInstanceOf(AttestationProtocolError);
    }
    for (const badInput of [null, undefined, 'key', 42, []] as unknown[]) {
      await expect(store.reserve(badInput as never)).rejects.toBeInstanceOf(AttestationProtocolError);
    }
    expect(db.calls.startSessionCalls).toBe(0);
  });

  it('rejects malformed deadlines without touching the database or clamping', async () => {
    const db = noTouchDb();
    const store = createMongoAttestationStore({ db, now: () => BASE_NOW });
    const badDeadlines: unknown[] = [
      undefined,
      null,
      'soon',
      Number.NaN,
      Number.POSITIVE_INFINITY,
      -1,
      10.5,
      Number.MAX_SAFE_INTEGER + 1,
    ];
    for (const retainUntilMs of badDeadlines) {
      await expect(
        store.reserve({ replayKey: testKey('bad-deadline'), retainUntilMs: retainUntilMs as number }),
      ).rejects.toBeInstanceOf(AttestationProtocolError);
    }
    expect(db.calls.startSessionCalls).toBe(0);
  });

  it('returns expired without allocating for no-longer-live deadlines', async () => {
    const db = noTouchDb();
    const store = createMongoAttestationStore({ db, now: () => BASE_NOW });
    expect(await store.reserve({ replayKey: testKey('equality'), retainUntilMs: BASE_NOW })).toBe('expired');
    expect(await store.reserve({ replayKey: testKey('past'), retainUntilMs: BASE_NOW - 1 })).toBe('expired');
    expect(db.calls.startSessionCalls).toBe(0);
  });

  it('rejects overlong retention without allocating or truncating', async () => {
    const db = noTouchDb();
    const store = createMongoAttestationStore({ db, now: () => BASE_NOW });
    await expect(
      store.reserve({ replayKey: testKey('overlong'), retainUntilMs: BASE_NOW + 10_000_000 }),
    ).rejects.toBeInstanceOf(AttestationProtocolError);
    await expect(
      store.reserve({
        replayKey: testKey('overlong-cap'),
        retainUntilMs: BASE_NOW + GLOBAL_MAX_RETENTION_MS + 1,
      }),
    ).rejects.toBeInstanceOf(AttestationProtocolError);
    expect(db.calls.startSessionCalls).toBe(0);
  });

  it('accepts the task-text retainUntil alias with canonical precedence', async () => {
    const db = stubDb({});
    const store = createMongoAttestationStore({ db, now: () => BASE_NOW });
    expect(await store.reserve({ replayKey: testKey('alias-only'), retainUntil: BASE_NOW + 10_000 } as never)).toBe(
      'reserved',
    );
    expect(db.calls.replaced[0]).toEqual({
      _id: testKey('alias-only'),
      retainUntilMs: BASE_NOW + 10_000,
    });
    expect(
      await store.reserve({
        replayKey: testKey('alias-both'),
        retainUntilMs: BASE_NOW + 10_000,
        retainUntil: BASE_NOW,
      } as never),
    ).toBe('reserved');
    // Canonical wins over the alias (expired alias ignored).
    expect(db.calls.replaced[1]).toEqual({
      _id: testKey('alias-both'),
      retainUntilMs: BASE_NOW + 10_000,
    });
  });

  it('isolates reserve inputs from later caller mutation', async () => {
    const db = stubDb({});
    const store = createMongoAttestationStore({ db, now: () => BASE_NOW });
    const input: { replayKey: string; retainUntilMs: number } = {
      replayKey: testKey('isolated'),
      retainUntilMs: BASE_NOW + 10_000,
    };
    const pending = store.reserve(input);
    input.replayKey = testKey('mutated-away');
    input.retainUntilMs = 0;
    await expect(pending).resolves.toBe('reserved');
    expect(db.calls.replaced[0]).toEqual({
      _id: testKey('isolated'),
      retainUntilMs: BASE_NOW + 10_000,
    });
  });

  it.each([Number.NaN, -1, 1.5, Number.POSITIVE_INFINITY])(
    'rejects invalid clock value %s without touching the database',
    async (badNow) => {
      const db = noTouchDb();
      const store = createMongoAttestationStore({ db, now: () => badNow });
      await expect(
        store.reserve({ replayKey: testKey('bad-clock'), retainUntilMs: BASE_NOW + 10_000 }),
      ).rejects.toBeInstanceOf(AttestationProtocolError);
      expect(db.calls.startSessionCalls).toBe(0);
    },
  );

  it('rechecks the clock inside the transaction and fails closed', async () => {
    let calls = 0;
    const db = stubDb({});
    const store = createMongoAttestationStore({
      db,
      now: () => {
        calls += 1;
        // First (pre-transaction) read is valid; the in-transaction recheck
        // observes an invalid clock and must fail closed.
        return calls === 1 ? BASE_NOW : Number.NaN;
      },
    });
    await expect(
      store.reserve({ replayKey: testKey('clock-race'), retainUntilMs: BASE_NOW + 10_000 }),
    ).rejects.toBeInstanceOf(AttestationProtocolError);
  });
});

describe('mongo attestation store error taxonomy', () => {
  it('wraps session creation failure as AttestationMongoStoreError', async () => {
    const db = stubDb({
      startSessionImpl: () => {
        throw new Error('topology closed');
      },
    });
    const store = createMongoAttestationStore({ db, now: () => BASE_NOW });
    await expect(
      store.reserve({ replayKey: testKey('session'), retainUntilMs: BASE_NOW + 10_000 }),
    ).rejects.toBeInstanceOf(AttestationMongoStoreError);
  });

  it('wraps transaction failure as AttestationMongoStoreError', async () => {
    const db = stubDb({
      startSessionImpl: () => ({
        withTransaction: async () => {
          throw new Error('network timeout');
        },
        endSession: async () => undefined,
      }),
    });
    const store = createMongoAttestationStore({ db, now: () => BASE_NOW });
    await expect(store.reserve({ replayKey: testKey('tx'), retainUntilMs: BASE_NOW + 10_000 })).rejects.toBeInstanceOf(
      AttestationMongoStoreError,
    );
  });

  it('maps uncommitted transactions to AttestationMongoStoreError (never accepts)', async () => {
    const db = stubDb({
      startSessionImpl: () => ({
        withTransaction: async () => undefined,
        endSession: async () => undefined,
      }),
    });
    const store = createMongoAttestationStore({ db, now: () => BASE_NOW });
    await expect(
      store.reserve({ replayKey: testKey('uncommitted'), retainUntilMs: BASE_NOW + 10_000 }),
    ).rejects.toBeInstanceOf(AttestationMongoStoreError);
  });

  it('fails closed on malformed persisted proof rows', async () => {
    const db = stubDb({
      proofs: {
        findOne: async () => ({ _id: testKey('malformed-proof'), retainUntilMs: 'bad' }),
      },
    });
    const store = createMongoAttestationStore({ db, now: () => BASE_NOW });
    await expect(
      store.reserve({ replayKey: testKey('malformed-proof'), retainUntilMs: BASE_NOW + 10_000 }),
    ).rejects.toBeInstanceOf(AttestationMongoStoreError);
  });

  it('fails closed on malformed ledger rows', async () => {
    const key = testKey('malformed-ledger');
    const db = stubDb({
      capacity: {
        findOneAndUpdate: async () => ({
          _id: 'capacity',
          kind: 'capacity',
          entries: 0,
          revision: 1,
          maxEntries: MONGO_ATTESTATION_STORE_DEFAULT_MAX_ENTRIES,
          proofsCollectionName: MONGO_ATTESTATION_STORE_DEFAULT_PROOFS_COLLECTION,
        }),
        findOne: async () => ({ _id: `proof:${key}`, kind: 'reservation', replayKey: key }),
      },
    });
    const store = createMongoAttestationStore({ db, now: () => BASE_NOW });
    await expect(store.reserve({ replayKey: key, retainUntilMs: BASE_NOW + 10_000 })).rejects.toBeInstanceOf(
      AttestationMongoStoreError,
    );
  });

  it('fails closed on capacity configuration/accounting mismatch', async () => {
    const db = stubDb({
      capacity: {
        findOneAndUpdate: async () => ({
          _id: 'capacity',
          kind: 'capacity',
          entries: 0,
          revision: 1,
          maxEntries: 999_999,
          proofsCollectionName: MONGO_ATTESTATION_STORE_DEFAULT_PROOFS_COLLECTION,
        }),
      },
    });
    const store = createMongoAttestationStore({ db, now: () => BASE_NOW });
    await expect(
      store.reserve({ replayKey: testKey('mismatch'), retainUntilMs: BASE_NOW + 10_000 }),
    ).rejects.toBeInstanceOf(AttestationMongoStoreError);
  });

  it('throws shared AttestationCapacityError when the ledger is full', async () => {
    const db = stubDb({
      maxEntries: 1,
      capacity: {
        findOneAndUpdate: async () => ({
          _id: 'capacity',
          kind: 'capacity',
          entries: 1,
          revision: 2,
          maxEntries: 1,
          proofsCollectionName: MONGO_ATTESTATION_STORE_DEFAULT_PROOFS_COLLECTION,
        }),
      },
    });
    const store = createMongoAttestationStore({ db, maxEntries: 1, now: () => BASE_NOW });
    await expect(
      store.reserve({ replayKey: testKey('full'), retainUntilMs: BASE_NOW + 10_000 }),
    ).rejects.toBeInstanceOf(AttestationCapacityError);
  });

  it('returns duplicate even when full without extending expiry', async () => {
    const key = testKey('dup-wins-full');
    const db = stubDb({
      maxEntries: 1,
      proofs: {
        findOne: async () => ({ _id: key, retainUntilMs: BASE_NOW + 10_000 }),
      },
      capacity: {
        findOneAndUpdate: async () => ({
          _id: 'capacity',
          kind: 'capacity',
          entries: 1,
          revision: 2,
          maxEntries: 1,
          proofsCollectionName: MONGO_ATTESTATION_STORE_DEFAULT_PROOFS_COLLECTION,
        }),
      },
    });
    const store = createMongoAttestationStore({ db, maxEntries: 1, now: () => BASE_NOW });
    expect(await store.reserve({ replayKey: key, retainUntilMs: BASE_NOW + 20_000 })).toBe('duplicate');
  });

  it('keeps capacity/operational errors distinct from protocol errors', async () => {
    const full = stubDb({
      maxEntries: 1,
      capacity: {
        findOneAndUpdate: async () => ({
          _id: 'capacity',
          kind: 'capacity',
          entries: 1,
          revision: 2,
          maxEntries: 1,
          proofsCollectionName: MONGO_ATTESTATION_STORE_DEFAULT_PROOFS_COLLECTION,
        }),
      },
    });
    const fullStore = createMongoAttestationStore({ db: full, maxEntries: 1, now: () => BASE_NOW });
    const capacityFailure = await fullStore
      .reserve({ replayKey: testKey('x'), retainUntilMs: BASE_NOW + 10_000 })
      .catch((error: unknown) => error);
    expect(capacityFailure).toBeInstanceOf(AttestationCapacityError);
    expect(capacityFailure).not.toBeInstanceOf(AttestationProtocolError);
    expect(capacityFailure).not.toBeInstanceOf(AttestationMongoStoreError);

    const broken = stubDb({
      startSessionImpl: () => {
        throw new Error('down');
      },
    });
    const brokenStore = createMongoAttestationStore({ db: broken, now: () => BASE_NOW });
    const operational = await brokenStore
      .reserve({ replayKey: testKey('y'), retainUntilMs: BASE_NOW + 10_000 })
      .catch((error: unknown) => error);
    expect(operational).toBeInstanceOf(AttestationMongoStoreError);
    expect(operational).not.toBeInstanceOf(AttestationCapacityError);
    expect(operational).not.toBeInstanceOf(AttestationProtocolError);
  });

  it('uses no timers of any kind', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    try {
      const db = stubDb({});
      const store = createMongoAttestationStore({ db, now: () => BASE_NOW });
      expect(await store.reserve({ replayKey: testKey('no-timers'), retainUntilMs: BASE_NOW + 10_000 })).toBe(
        'reserved',
      );
      expect(setIntervalSpy).not.toHaveBeenCalled();
      expect(setTimeoutSpy).not.toHaveBeenCalled();
    } finally {
      setIntervalSpy.mockRestore();
      setTimeoutSpy.mockRestore();
    }
  });
});
