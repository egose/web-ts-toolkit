import { describe, expect, it } from 'vitest';

import { createMemoryOidcVaultStore } from '../src/index';

describe('createMemoryOidcVaultStore', () => {
  it('creates, reads, rotates, and deletes sessions', async () => {
    const store = createMemoryOidcVaultStore({ now: () => 1000 });

    await store.createSession({
      sessionId: 'sess_1',
      subject: 'user_1',
      refreshToken: 'refresh_1',
      idToken: 'id_1',
      scope: 'openid email profile',
    });

    const originalSession = await store.getSession('sess_1');

    expect(originalSession).toMatchObject({
      sessionId: 'sess_1',
      subject: 'user_1',
      createdAt: 1000,
      updatedAt: 1000,
    });

    const rotatedSession = await store.rotateSession({
      sessionId: 'sess_1',
      nextSession: {
        sessionId: 'sess_2',
        subject: 'user_1',
        refreshToken: 'refresh_2',
        idToken: 'id_2',
        scope: 'openid email profile',
        createdAt: 1000,
        updatedAt: 1001,
      },
    });

    expect(await store.getSession('sess_1')).toBeNull();
    expect(rotatedSession).toMatchObject({
      sessionId: 'sess_2',
      refreshToken: 'refresh_2',
      idToken: 'id_2',
    });

    await store.deleteSession('sess_2');

    expect(await store.getSession('sess_2')).toBeNull();
  });

  it('consumes transaction records once and prunes expired records', async () => {
    let now = 100;
    const store = createMemoryOidcVaultStore({ now: () => now });

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

    expect(await store.consumeAuthorizationTransaction('state_1')).toMatchObject({
      state: 'state_1',
      nonce: 'nonce_1',
    });
    expect(await store.consumeAuthorizationTransaction('state_1')).toBeNull();

    now = 250;

    expect(await store.consumeExchangeCode('code_1')).toBeNull();
  });
});
