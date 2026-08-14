import { randomUUID } from 'node:crypto';

import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { defineOidcVaultStoreProviderConformanceSuite } from '../../express-oidc-vault/test/store-provider-conformance';
import { createMongoOidcVaultStore } from '../src/index';

const MONGO_TIMEOUT = 120_000;

describe('createMongoOidcVaultStore', () => {
  let mongoServer: MongoMemoryServer;
  let client: MongoClient;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    client = new MongoClient(mongoServer.getUri());
    await client.connect();
  }, MONGO_TIMEOUT);

  afterAll(async () => {
    await client.close();
    await mongoServer.stop();
  }, MONGO_TIMEOUT);

  defineOidcVaultStoreProviderConformanceSuite('mongodb', {
    createContext: () => {
      let now = 100;
      const db = client.db(`conf-${randomUUID()}`);

      return {
        store: createMongoOidcVaultStore({ db, now: () => now }),
        setNow: (nextNow) => {
          now = nextNow;
        },
        cleanup: async () => {
          await db.dropDatabase();
        },
      };
    },
  });

  it('creates, reads, rotates, and deletes sessions', async () => {
    const db = client.db('mongo-store-session-test');
    const store = createMongoOidcVaultStore({ db, now: () => 1000 });

    const created = await store.createSession({
      sessionId: 'sess_1',
      subject: 'user_1',
      providerSessionId: 'provider_sid_1',
      refreshToken: 'refresh_1',
      idToken: 'id_1',
      scope: 'openid email profile',
    });

    expect(created).toMatchObject({ sessionId: 'sess_1', createdAt: 1000, updatedAt: 1000 });
    expect(await store.getSession('sess_1')).toMatchObject({ sessionId: 'sess_1' });

    const rotated = await store.rotateSession({
      sessionId: 'sess_1',
      nextSession: {
        ...created,
        sessionId: 'sess_2',
        providerSessionId: 'provider_sid_1',
        refreshToken: 'refresh_2',
        idToken: 'id_2',
        updatedAt: 1001,
      },
    });

    expect(rotated).toMatchObject({ sessionId: 'sess_2', refreshToken: 'refresh_2' });
    expect(await store.getSession('sess_1')).toBeNull();

    await store.deleteSession('sess_2');
    expect(await store.getSession('sess_2')).toBeNull();

    await store.createSession({
      sessionId: 'sess_3',
      subject: 'user_1',
      providerSessionId: 'provider_sid_1',
      refreshToken: 'refresh_3',
      idToken: 'id_3',
    });
    await store.createSession({
      sessionId: 'sess_4',
      subject: 'user_1',
      refreshToken: 'refresh_4',
      idToken: 'id_4',
    });

    expect(
      await store.deleteSessionsByProviderSessionId({
        providerSessionId: 'provider_sid_1',
        issuer: 'https://issuer-a.example.com',
      }),
    ).toBe(0);
    expect(await store.deleteSessionsByProviderSessionId('provider_sid_1')).toBe(1);
    expect(await store.getSession('sess_3')).toBeNull();
    expect(await store.getSession('sess_4')).not.toBeNull();
    expect(
      await store.deleteSessionsBySubject({
        subject: 'user_1',
        clientId: 'client-1',
      }),
    ).toBe(0);
    expect(await store.deleteSessionsBySubject('user_1')).toBe(1);
    expect(await store.getSession('sess_4')).toBeNull();
  });

  it('rejects rotating a session that was already rotated', async () => {
    const db = client.db('mongo-store-rotate-conflict-test');
    const store = createMongoOidcVaultStore({ db, now: () => 1000 });

    await store.createSession({
      sessionId: 'sess_1',
      subject: 'user_1',
      refreshToken: 'refresh_1',
      idToken: 'id_1',
    });

    await store.rotateSession({
      sessionId: 'sess_1',
      nextSession: {
        sessionId: 'sess_2',
        subject: 'user_1',
        refreshToken: 'refresh_2',
        idToken: 'id_2',
        createdAt: 1000,
        updatedAt: 1001,
      },
    });

    await expect(
      store.rotateSession({
        sessionId: 'sess_1',
        nextSession: {
          sessionId: 'sess_3',
          subject: 'user_1',
          refreshToken: 'refresh_3',
          idToken: 'id_3',
          createdAt: 1000,
          updatedAt: 1002,
        },
      }),
    ).rejects.toThrow('rotation');
  });

  it('allows only one concurrent rotation and deletes the current rotated session by logical session ID', async () => {
    const db = client.db('mongo-store-logical-session-delete-test');
    const store = createMongoOidcVaultStore({ db, now: () => 1000 });

    const created = await store.createSession({
      sessionId: 'sess_1',
      subject: 'user_1',
      refreshToken: 'refresh_1',
      idToken: 'id_1',
    });

    const attempts = await Promise.allSettled([
      store.rotateSession({
        sessionId: 'sess_1',
        nextSession: {
          ...created,
          sessionId: 'sess_2',
          refreshToken: 'refresh_2',
          updatedAt: 1001,
        },
      }),
      store.rotateSession({
        sessionId: 'sess_1',
        nextSession: {
          ...created,
          sessionId: 'sess_3',
          refreshToken: 'refresh_3',
          updatedAt: 1002,
        },
      }),
    ]);

    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1);

    const rotated = attempts.find(
      (attempt): attempt is PromiseFulfilledResult<typeof created> => attempt.status === 'fulfilled',
    )?.value;

    expect(rotated).toBeDefined();
    expect(await store.deleteSessionsByLogicalSessionId(created.logicalSessionId ?? created.sessionId)).toBe(1);
    expect(await store.getSession(rotated!.sessionId)).toBeNull();
  });

  it('consumes transaction records once and filters expired records without waiting for TTL cleanup', async () => {
    let now = 100;
    const db = client.db('mongo-store-transaction-test');
    const store = createMongoOidcVaultStore({ db, now: () => now });

    await store.createAuthorizationTransaction({
      state: 'state_1',
      nonce: 'nonce_1',
      pkceVerifier: 'verifier_1',
      codeChallenge: 'challenge_1',
      createdAt: 100,
      expiresAt: 200,
    });
    await store.createExchangeCode({
      code: 'code_1',
      sessionId: 'sess_1',
      createdAt: 100,
      expiresAt: 200,
    });

    expect(await store.consumeAuthorizationTransaction('state_1')).toMatchObject({ state: 'state_1' });
    expect(await store.consumeAuthorizationTransaction('state_1')).toBeNull();

    now = 250;

    expect(await store.consumeExchangeCode('code_1')).toBeNull();
  });

  it('enforces explicit session expiry before TTL cleanup runs', async () => {
    let now = 100;
    const db = client.db('mongo-store-session-expiry-test');
    const store = createMongoOidcVaultStore({ db, now: () => now });

    await store.createSession({
      sessionId: 'sess_1',
      subject: 'user_1',
      refreshToken: 'refresh_1',
      idToken: 'id_1',
      expiresAt: 200,
    });

    expect(await store.getSession('sess_1')).toMatchObject({ sessionId: 'sess_1' });

    now = 250;

    expect(await store.getSession('sess_1')).toBeNull();
  });

  it('consumes backchannel logout token jti values once', async () => {
    const db = client.db('mongo-store-backchannel-jti-test');
    const store = createMongoOidcVaultStore({ db, now: () => 100 });

    expect(await store.consumeBackchannelLogoutTokenJti({ jti: 'logout_1', expiresAt: 200 })).toBe(true);
    expect(await store.consumeBackchannelLogoutTokenJti({ jti: 'logout_1', expiresAt: 200 })).toBe(false);
  });
});
