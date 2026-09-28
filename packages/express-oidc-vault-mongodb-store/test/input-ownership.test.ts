import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Binary, Decimal128, Long, ObjectId, type Db } from 'mongodb';
import { createMongoOidcVaultStore } from '../src/index';
import { createReplicaSetHarness, MONGO_TIMEOUT, withFailCommand, type MongoMemoryHarness } from './mongo-memory';

const gate = () => {
  let enter!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    entered,
    release,
    pause: async () => {
      enter();
      await held;
    },
  };
};

const intercept = (db: Db, collectionName: string, method: string, hook: () => Promise<void>, after = false): Db =>
  new Proxy(db, {
    get(target, property) {
      if (property === 'collection')
        return (name: string) => {
          const collection = target.collection(name);
          if (name !== collectionName) return collection;
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

const sessionInput = (sessionId: string) => ({
  sessionId,
  subject: 'subject',
  refreshToken: 'refresh',
  idToken: 'id',
  createdAt: 100,
  updatedAt: 100,
  providerSessionId: 'sid',
  accessToken: 'access',
  scope: 'openid',
  provider: { issuer: 'issuer', clientId: 'client', nested: [{ list: ['provider'] }] },
  user: { sub: 'subject', nested: [{ list: ['user'] }] },
  metadata: { nested: [{ list: ['metadata'] }] },
});
const mutate = (input: ReturnType<typeof sessionInput>) => {
  input.sessionId = 'changed';
  input.provider.issuer = 'changed';
  input.provider.nested[0]!.list.push('changed');
  input.user.nested[0]!.list.push('changed');
  input.metadata.nested[0]!.list.push('changed');
};

describe('MongoDB input ownership at asynchronous boundaries', () => {
  let harness: MongoMemoryHarness;
  beforeAll(async () => {
    harness = await createReplicaSetHarness();
  }, MONGO_TIMEOUT);
  afterAll(async () => {
    await harness?.stop();
  }, MONGO_TIMEOUT);

  it('owns nested create data while the persistence call is held before serialization', async () => {
    const db = harness.createDb('ownership-create');
    const barrier = gate();
    const store = createMongoOidcVaultStore({ db: intercept(db, 'oidc_vault_sessions', 'replaceOne', barrier.pause) });
    const input = sessionInput('original');
    const expected = structuredClone(input);
    const pending = store.createSession(input);
    try {
      await barrier.entered;
      mutate(input);
    } finally {
      barrier.release();
    }
    const result = await pending;
    expect(result).toEqual({ ...expected, logicalSessionId: 'original' });
    expect(await store.getSession('original')).toEqual(result);
    expect(await store.getSession('changed')).toBeNull();
  });

  for (const phase of ['source', 'persistence', 'retry'] as const) {
    it(`retains one rotation snapshot through a held ${phase} boundary`, async () => {
      const db = harness.createDb(`ownership-${phase}`);
      const base = createMongoOidcVaultStore({ db });
      await base.createSession(sessionInput('source'));
      const barrier = gate();
      let calls = 0;
      const wrapped = intercept(
        db,
        'oidc_vault_sessions',
        phase === 'source' ? 'findOne' : 'insertOne',
        async () => {
          calls += 1;
          if (calls === 1) await barrier.pause();
        },
        phase === 'source',
      );
      const store = createMongoOidcVaultStore({ db: wrapped });
      await store.ready();
      const next = sessionInput('next');
      const expected = { ...structuredClone(next), logicalSessionId: 'source' };
      const input = { sessionId: 'source', nextSession: next };
      const run = async () => {
        const pending = store.rotateSession(input);
        try {
          await barrier.entered;
          mutate(next);
          input.sessionId = 'unrelated';
          input.nextSession = sessionInput('unrelated');
        } finally {
          barrier.release();
        }
        return pending;
      };
      const result =
        phase === 'retry'
          ? await withFailCommand(db, { failCommands: ['insert'], times: 1, errorCode: 112 }, run)
          : await run();
      expect(result).toEqual(expected);
      expect(await base.getSession('next')).toEqual(expected);
      expect(await base.getSession('source')).toBeNull();
      expect(await base.getSession('changed')).toBeNull();
      if (phase === 'retry') expect(calls).toBe(2);
      expect(
        await db.collection('oidc_vault_rotated_session_aliases').findOne({ _id: 'source' } as never),
      ).toMatchObject({ logicalSessionId: 'source', revision: 1 });
    });
  }

  it('owns authorization metadata while its replacement write is held', async () => {
    const db = harness.createDb('ownership-txn');
    const barrier = gate();
    const store = createMongoOidcVaultStore({
      db: intercept(db, 'oidc_vault_authorization_transactions', 'replaceOne', barrier.pause),
    });
    const input = {
      state: 'state',
      nonce: 'nonce',
      pkceVerifier: 'p',
      codeChallenge: 'c',
      createdAt: 100,
      expiresAt: Date.now() + 600_000,
      metadata: { list: [{ values: ['original'] }] },
    };
    const expected = structuredClone(input);
    const pending = store.createAuthorizationTransaction(input);
    try {
      await barrier.entered;
      input.state = 'changed';
      input.metadata.list[0]!.values.push('changed');
    } finally {
      barrier.release();
    }
    await pending;
    expect(await store.consumeAuthorizationTransaction('state')).toEqual(expected);
  });

  it('retains JTI identity and expiry between the expired-row probe and insert', async () => {
    const db = harness.createDb('ownership-jti');
    const barrier = gate();
    let calls = 0;
    const store = createMongoOidcVaultStore({
      db: intercept(
        db,
        'oidc_vault_backchannel_logout_token_jtis',
        'findOneAndUpdate',
        async () => {
          if (++calls === 1) await barrier.pause();
        },
        true,
      ),
    });
    const expiresAt = Date.now() + 600_000;
    const input = { jti: 'original', expiresAt };
    const pending = store.consumeBackchannelLogoutTokenJti(input);
    try {
      await barrier.entered;
      Object.assign(input, { jti: 'changed', expiresAt: 1 });
    } finally {
      barrier.release();
    }
    expect(await pending).toBe(true);
    expect(await store.consumeBackchannelLogoutTokenJti({ jti: 'original', expiresAt })).toBe(false);
    expect(await store.consumeBackchannelLogoutTokenJti({ jti: 'changed', expiresAt })).toBe(true);
  });

  it('keeps logical alias cleanup bound to the committed deletion despite a held response', async () => {
    const db = harness.createDb('ownership-delete');
    const base = createMongoOidcVaultStore({ db });
    for (const id of ['original', 'other']) {
      const source = await base.createSession(sessionInput(id));
      await base.rotateSession({ sessionId: id, nextSession: { ...source, sessionId: `${id}-next` } });
    }
    const barrier = gate();
    const store = createMongoOidcVaultStore({
      db: intercept(db, 'oidc_vault_sessions', 'deleteMany', barrier.pause, true),
    });
    const input = { logicalSessionId: 'original' };
    const pending = store.deleteSessionsByLogicalSessionId(input);
    try {
      await barrier.entered;
      input.logicalSessionId = 'other';
    } finally {
      barrier.release();
    }
    expect(await pending).toBe(1);
    expect(
      await db.collection('oidc_vault_rotated_session_aliases').countDocuments({ logicalSessionId: 'original' }),
    ).toBe(0);
    expect(await base.getSession('other-next')).not.toBeNull();
    await base.deleteSession('other');
    expect(await base.getSession('other-next')).toBeNull();
  });

  it('preserves Mongo native serialization and returned BSON wrappers on create and rotation', async () => {
    const db = harness.createDb('ownership-bson');
    const store = createMongoOidcVaultStore({ db });
    class CustomBson {
      toBSON() {
        return { serialized: 'custom' };
      }
    }
    const metadata = {
      date: new Date(1234),
      oid: new ObjectId(),
      decimal: Decimal128.fromString('1.25'),
      long: Long.fromString('9007199254740993'),
      binary: new Binary(Buffer.from([1, 2])),
      buffer: Buffer.from([3, 4]),
      regexp: /native/i,
      custom: new CustomBson(),
      missing: undefined,
      nan: NaN,
    };
    // Compare to the driver's own serialization, not a hand-written clone oracle.
    await db.collection('native_reference').insertOne({ metadata });
    const reference = await db.collection('native_reference').findOne({});
    const created = await store.createSession({ ...sessionInput('native'), metadata });
    const rotated = await store.rotateSession({ sessionId: 'native', nextSession: { ...created, sessionId: 'next' } });
    for (const result of [created, rotated]) {
      expect(result.metadata!.oid).toBeInstanceOf(ObjectId);
      expect(result.metadata!.decimal).toBeInstanceOf(Decimal128);
      expect(result.metadata!.long).toBeInstanceOf(Long);
      expect(result.metadata!.binary).toBeInstanceOf(Binary);
      expect(result.metadata!.buffer).toBeInstanceOf(Buffer);
      expect(result.metadata!.custom).toBeInstanceOf(CustomBson);
      expect(Object.hasOwn(result.metadata!, 'missing')).toBe(true);
    }
    expect((await store.getSession('next'))!.metadata).toEqual(reference!.metadata);
  });
});
