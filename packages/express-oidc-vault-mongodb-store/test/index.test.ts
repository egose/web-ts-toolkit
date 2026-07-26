import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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

    expect(await store.deleteSessionsByProviderSessionId('provider_sid_1')).toBe(1);
    expect(await store.getSession('sess_3')).toBeNull();
    expect(await store.getSession('sess_4')).not.toBeNull();
    expect(await store.deleteSessionsBySubject('user_1')).toBe(1);
    expect(await store.getSession('sess_4')).toBeNull();
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
});
