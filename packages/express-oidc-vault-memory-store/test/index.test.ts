import { describe, expect, it } from 'vitest';

import { OidcVaultStoreConflictError } from '@web-ts-toolkit/express-oidc-vault';
import { defineOidcVaultStoreProviderConformanceSuite } from '../../express-oidc-vault/test/store-provider-conformance';
import { createMemoryOidcVaultStore } from '../src/index';

type MemoryStoreInternals = {
  authorizationTransactions: Map<string, unknown>;
  exchangeCodes: Map<string, unknown>;
  sessions: Map<string, unknown>;
  backchannelLogoutTokenJtis: Map<string, unknown>;
};

defineOidcVaultStoreProviderConformanceSuite('memory', {
  createContext: () => {
    let now = 100;

    return {
      store: createMemoryOidcVaultStore({ now: () => now }),
      setNow: (nextNow) => {
        now = nextNow;
      },
    };
  },
});

describe('createMemoryOidcVaultStore', () => {
  it('creates, reads, rotates, and deletes sessions', async () => {
    const store = createMemoryOidcVaultStore({ now: () => 1000 });

    await store.createSession({
      sessionId: 'sess_1',
      subject: 'user_1',
      providerSessionId: 'provider_sid_1',
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
        providerSessionId: 'provider_sid_1',
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
    const store = createMemoryOidcVaultStore({ now: () => 1000 });

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

  it('rejects rotation onto an existing target without changing source, target, or aliases', async () => {
    const store = createMemoryOidcVaultStore({ now: () => 1000 });

    await store.createSession({
      sessionId: 'source',
      subject: 'user_source',
      logicalSessionId: 'logical_source',
      refreshToken: 'refresh_source',
      idToken: 'id_source',
      metadata: { nested: { value: 'source' } },
    });
    await store.createSession({
      sessionId: 'target',
      subject: 'user_target',
      logicalSessionId: 'logical_target',
      refreshToken: 'refresh_target',
      idToken: 'id_target',
      metadata: { nested: { value: 'target' } },
    });

    const sourceBefore = await store.getSession('source');
    const targetBefore = await store.getSession('target');

    await expect(
      store.rotateSession({
        sessionId: 'source',
        nextSession: {
          sessionId: 'target',
          subject: 'user_source',
          logicalSessionId: 'logical_source',
          refreshToken: 'refresh_rotated',
          idToken: 'id_rotated',
          createdAt: 1000,
          updatedAt: 1001,
        },
      }),
    ).rejects.toBeInstanceOf(OidcVaultStoreConflictError);

    expect(await store.getSession('source')).toEqual(sourceBefore);
    expect(await store.getSession('target')).toEqual(targetBefore);

    await store.deleteSession('source');

    expect(await store.getSession('source')).toBeNull();
    expect(await store.getSession('target')).toEqual(targetBefore);
  });

  it('preserves the source when target cloning fails during rotation', async () => {
    const store = createMemoryOidcVaultStore({ now: () => 1000 });

    await store.createSession({
      sessionId: 'source',
      subject: 'user_1',
      refreshToken: 'refresh_1',
      idToken: 'id_1',
    });

    const sourceBefore = await store.getSession('source');

    await expect(
      store.rotateSession({
        sessionId: 'source',
        nextSession: {
          sessionId: 'target',
          subject: 'user_1',
          refreshToken: 'refresh_2',
          idToken: 'id_2',
          createdAt: 1000,
          updatedAt: 1001,
          metadata: { invalid: () => undefined },
        },
      }),
    ).rejects.toThrow();

    expect(await store.getSession('source')).toEqual(sourceBefore);
    expect(await store.getSession('target')).toBeNull();
  });

  it('preserves the source when the rotation timestamp provider fails', async () => {
    let nowCalls = 0;
    let allowReads = false;
    const store = createMemoryOidcVaultStore({
      now: () => {
        nowCalls += 1;

        if (!allowReads && nowCalls === 3) {
          throw new Error('clock unavailable');
        }

        return 1000;
      },
    });

    await store.createSession({
      sessionId: 'source',
      subject: 'user_1',
      refreshToken: 'refresh_1',
      idToken: 'id_1',
    });

    const sourceBefore = await store.getSession('source');

    await expect(
      store.rotateSession({
        sessionId: 'source',
        nextSession: {
          sessionId: 'target',
          subject: 'user_1',
          refreshToken: 'refresh_2',
          idToken: 'id_2',
        },
      }),
    ).rejects.toThrow('clock unavailable');

    allowReads = true;

    expect(await store.getSession('source')).toEqual(sourceBefore);
    expect(await store.getSession('target')).toBeNull();
  });

  it('rejects same-ID rotation without deleting the source', async () => {
    const store = createMemoryOidcVaultStore({ now: () => 1000 });

    await store.createSession({
      sessionId: 'source',
      subject: 'user_1',
      refreshToken: 'refresh_1',
      idToken: 'id_1',
    });

    const sourceBefore = await store.getSession('source');

    await expect(
      store.rotateSession({
        sessionId: 'source',
        nextSession: {
          sessionId: 'source',
          subject: 'user_1',
          refreshToken: 'refresh_2',
          idToken: 'id_2',
          createdAt: 1000,
          updatedAt: 1001,
        },
      }),
    ).rejects.toBeInstanceOf(OidcVaultStoreConflictError);

    expect(await store.getSession('source')).toEqual(sourceBefore);
  });

  it('preserves the existing logical session ID when rotating without one', async () => {
    const store = createMemoryOidcVaultStore({ now: () => 1000 });

    await store.createSession({
      sessionId: 'source',
      subject: 'user_1',
      logicalSessionId: 'logical_1',
      refreshToken: 'refresh_1',
      idToken: 'id_1',
    });

    const rotated = await store.rotateSession({
      sessionId: 'source',
      nextSession: {
        sessionId: 'target',
        subject: 'user_1',
        refreshToken: 'refresh_2',
        idToken: 'id_2',
        createdAt: 1000,
        updatedAt: 1001,
      },
    });

    expect(rotated.logicalSessionId).toBe('logical_1');
    expect(await store.deleteSessionsByLogicalSessionId('logical_1')).toBe(1);
    expect(await store.getSession('target')).toBeNull();
  });

  it('allows only one concurrent rotation and deletes the current rotated session by logical session ID', async () => {
    const store = createMemoryOidcVaultStore({ now: () => 1000 });

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

  it('keeps chained rotated aliases revocation-capable while the lineage is live', async () => {
    const store = createMemoryOidcVaultStore({ now: () => 1000 });

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
      },
    });
    await store.rotateSession({
      sessionId: 'sess_2',
      nextSession: {
        sessionId: 'sess_3',
        subject: 'user_1',
        refreshToken: 'refresh_3',
        idToken: 'id_3',
      },
    });

    await store.deleteSession('sess_1');

    expect(await store.getSession('sess_3')).toBeNull();
  });

  it('removes stale rotated aliases after logical and direct deletion', async () => {
    const store = createMemoryOidcVaultStore({ now: () => 1000 });

    await store.createSession({
      sessionId: 'old_public',
      logicalSessionId: 'logical_1',
      subject: 'user_1',
      refreshToken: 'refresh_1',
      idToken: 'id_1',
    });
    await store.rotateSession({
      sessionId: 'old_public',
      nextSession: {
        sessionId: 'current_public',
        subject: 'user_1',
        refreshToken: 'refresh_2',
        idToken: 'id_2',
      },
    });
    expect(await store.deleteSessionsByLogicalSessionId('logical_1')).toBe(1);

    await store.createSession({
      sessionId: 'new_public',
      logicalSessionId: 'logical_1',
      subject: 'user_1',
      refreshToken: 'refresh_3',
      idToken: 'id_3',
    });
    await store.deleteSession('old_public');

    expect(await store.getSession('new_public')).toMatchObject({ sessionId: 'new_public' });

    await store.rotateSession({
      sessionId: 'new_public',
      nextSession: {
        sessionId: 'new_current',
        subject: 'user_1',
        refreshToken: 'refresh_4',
        idToken: 'id_4',
      },
    });
    await store.deleteSession('new_current');
    await store.createSession({
      sessionId: 'final_public',
      logicalSessionId: 'logical_1',
      subject: 'user_1',
      refreshToken: 'refresh_5',
      idToken: 'id_5',
    });
    await store.deleteSession('new_public');

    expect(await store.getSession('final_public')).toMatchObject({ sessionId: 'final_public' });
  });

  it('removes stale rotated aliases after subject and provider-session deletion', async () => {
    const store = createMemoryOidcVaultStore({ now: () => 1000 });

    await store.createSession({
      sessionId: 'subject_old',
      logicalSessionId: 'subject_logical',
      subject: 'user_1',
      refreshToken: 'refresh_1',
      idToken: 'id_1',
    });
    await store.rotateSession({
      sessionId: 'subject_old',
      nextSession: {
        sessionId: 'subject_current',
        subject: 'user_1',
        refreshToken: 'refresh_2',
        idToken: 'id_2',
      },
    });
    expect(await store.deleteSessionsBySubject('user_1')).toBe(1);

    await store.createSession({
      sessionId: 'subject_reused',
      logicalSessionId: 'subject_logical',
      subject: 'user_1',
      refreshToken: 'refresh_3',
      idToken: 'id_3',
    });
    await store.deleteSession('subject_old');

    expect(await store.getSession('subject_reused')).toMatchObject({ sessionId: 'subject_reused' });

    await store.createSession({
      sessionId: 'provider_old',
      logicalSessionId: 'provider_logical',
      subject: 'user_2',
      providerSessionId: 'provider_1',
      refreshToken: 'refresh_4',
      idToken: 'id_4',
    });
    await store.rotateSession({
      sessionId: 'provider_old',
      nextSession: {
        sessionId: 'provider_current',
        subject: 'user_2',
        providerSessionId: 'provider_1',
        refreshToken: 'refresh_5',
        idToken: 'id_5',
      },
    });
    expect(await store.deleteSessionsByProviderSessionId('provider_1')).toBe(1);

    await store.createSession({
      sessionId: 'provider_reused',
      logicalSessionId: 'provider_logical',
      subject: 'user_2',
      providerSessionId: 'provider_1',
      refreshToken: 'refresh_6',
      idToken: 'id_6',
    });
    await store.deleteSession('provider_old');

    expect(await store.getSession('provider_reused')).toMatchObject({ sessionId: 'provider_reused' });
  });

  it('expires rotated aliases with the target session and avoids retained alias growth across cycles', async () => {
    let now = 100;
    const store = createMemoryOidcVaultStore({ now: () => now });

    for (let i = 0; i < 3; i += 1) {
      await store.createSession({
        sessionId: `source_${i}`,
        logicalSessionId: 'logical_1',
        subject: 'user_1',
        refreshToken: `refresh_${i}_1`,
        idToken: `id_${i}_1`,
      });
      await store.rotateSession({
        sessionId: `source_${i}`,
        nextSession: {
          sessionId: `target_${i}`,
          subject: 'user_1',
          refreshToken: `refresh_${i}_2`,
          idToken: `id_${i}_2`,
          expiresAt: 200,
        },
      });

      now = 250;

      expect(await store.getSession(`target_${i}`)).toBeNull();

      await store.createSession({
        sessionId: `reused_${i}`,
        logicalSessionId: 'logical_1',
        subject: 'user_1',
        refreshToken: `refresh_${i}_3`,
        idToken: `id_${i}_3`,
      });
      await store.deleteSession(`source_${i}`);

      expect(await store.getSession(`reused_${i}`)).toMatchObject({ sessionId: `reused_${i}` });

      await store.deleteSession(`reused_${i}`);
      now = 100;
    }
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

  it('enforces explicit session expiry', async () => {
    let now = 100;
    const store = createMemoryOidcVaultStore({ now: () => now });

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

  it('checks session expiry without pruning unrelated record maps', async () => {
    let now = 100;
    const store = createMemoryOidcVaultStore({ now: () => now });
    const internals = store as unknown as MemoryStoreInternals;

    await store.createAuthorizationTransaction({
      state: 'expired_state',
      nonce: 'nonce_1',
      pkceVerifier: 'verifier_1',
      codeChallenge: 'challenge_1',
      createdAt: 100,
      expiresAt: 200,
    });
    await store.createExchangeCode({
      code: 'expired_code',
      sessionId: 'sess_1',
      createdAt: 100,
      expiresAt: 200,
    });
    expect(await store.consumeBackchannelLogoutTokenJti({ jti: 'expired_jti', expiresAt: 200 })).toBe(true);
    await store.createSession({
      sessionId: 'live_session',
      subject: 'user_1',
      refreshToken: 'refresh_1',
      idToken: 'id_1',
    });

    now = 250;

    expect(await store.getSession('live_session')).toMatchObject({ sessionId: 'live_session' });
    expect(internals.authorizationTransactions.has('expired_state')).toBe(true);
    expect(internals.exchangeCodes.has('expired_code')).toBe(true);
    expect(internals.backchannelLogoutTokenJtis.has('expired_jti')).toBe(true);
  });

  it('consumes one-time records without pruning unrelated record maps', async () => {
    let now = 100;
    const store = createMemoryOidcVaultStore({ now: () => now });
    const internals = store as unknown as MemoryStoreInternals;

    await store.createAuthorizationTransaction({
      state: 'live_state',
      nonce: 'nonce_1',
      pkceVerifier: 'verifier_1',
      codeChallenge: 'challenge_1',
      createdAt: 100,
      expiresAt: 300,
    });
    await store.createExchangeCode({
      code: 'expired_code',
      sessionId: 'sess_1',
      createdAt: 100,
      expiresAt: 200,
    });
    await store.createSession({
      sessionId: 'expired_session',
      subject: 'user_1',
      refreshToken: 'refresh_1',
      idToken: 'id_1',
      expiresAt: 200,
    });
    expect(await store.consumeBackchannelLogoutTokenJti({ jti: 'expired_jti', expiresAt: 200 })).toBe(true);

    now = 250;

    expect(await store.consumeAuthorizationTransaction('live_state')).toMatchObject({ state: 'live_state' });
    expect(internals.exchangeCodes.has('expired_code')).toBe(true);
    expect(internals.sessions.has('expired_session')).toBe(true);
    expect(internals.backchannelLogoutTokenJtis.has('expired_jti')).toBe(true);
  });

  it('reclaims expired records with bounded sweeps during later lifecycle operations', async () => {
    let now = 100;
    const store = createMemoryOidcVaultStore({ now: () => now });
    const internals = store as unknown as MemoryStoreInternals;

    for (let i = 0; i < 70; i += 1) {
      await store.createAuthorizationTransaction({
        state: `state_${i}`,
        nonce: `nonce_${i}`,
        pkceVerifier: `verifier_${i}`,
        codeChallenge: `challenge_${i}`,
        createdAt: 100,
        expiresAt: 200,
      });
      await store.createSession({
        sessionId: `session_${i}`,
        subject: 'user_1',
        refreshToken: `refresh_${i}`,
        idToken: `id_${i}`,
        expiresAt: 200,
      });
    }

    now = 250;

    await store.createAuthorizationTransaction({
      state: 'live_state_1',
      nonce: 'nonce_live_1',
      pkceVerifier: 'verifier_live_1',
      codeChallenge: 'challenge_live_1',
      createdAt: 250,
      expiresAt: 350,
    });
    await store.createAuthorizationTransaction({
      state: 'live_state_2',
      nonce: 'nonce_live_2',
      pkceVerifier: 'verifier_live_2',
      codeChallenge: 'challenge_live_2',
      createdAt: 250,
      expiresAt: 350,
    });
    await store.deleteSession('missing_1');
    await store.deleteSession('missing_2');

    expect([...internals.authorizationTransactions.keys()].filter((key) => key.startsWith('state_'))).toHaveLength(0);
    expect([...internals.sessions.keys()].filter((key) => key.startsWith('session_'))).toHaveLength(0);
  });

  it('consumes backchannel logout token jti values once until expiry', async () => {
    let now = 100;
    const store = createMemoryOidcVaultStore({ now: () => now });

    expect(await store.consumeBackchannelLogoutTokenJti({ jti: 'logout_1', expiresAt: 200 })).toBe(true);
    expect(await store.consumeBackchannelLogoutTokenJti({ jti: 'logout_1', expiresAt: 200 })).toBe(false);

    now = 250;

    expect(await store.consumeBackchannelLogoutTokenJti({ jti: 'logout_1', expiresAt: 350 })).toBe(true);
  });

  it('rejects expired and invalid backchannel logout token jti expiries without storing them', async () => {
    const store = createMemoryOidcVaultStore({ now: () => 200 });

    expect(await store.consumeBackchannelLogoutTokenJti({ jti: 'equal', expiresAt: 200 })).toBe(false);
    expect(await store.consumeBackchannelLogoutTokenJti({ jti: 'equal', expiresAt: 200 })).toBe(false);
    expect(await store.consumeBackchannelLogoutTokenJti({ jti: 'past', expiresAt: 199 })).toBe(false);
    expect(await store.consumeBackchannelLogoutTokenJti({ jti: 'nan', expiresAt: Number.NaN })).toBe(false);
    expect(await store.consumeBackchannelLogoutTokenJti({ jti: 'infinity', expiresAt: Number.POSITIVE_INFINITY })).toBe(
      false,
    );
    expect(
      await store.consumeBackchannelLogoutTokenJti({ jti: 'negative_infinity', expiresAt: Number.NEGATIVE_INFINITY }),
    ).toBe(false);

    expect(await store.consumeBackchannelLogoutTokenJti({ jti: 'equal', expiresAt: 201 })).toBe(true);
    expect(await store.consumeBackchannelLogoutTokenJti({ jti: 'past', expiresAt: 201 })).toBe(true);
    expect(await store.consumeBackchannelLogoutTokenJti({ jti: 'nan', expiresAt: 201 })).toBe(true);
    expect(await store.consumeBackchannelLogoutTokenJti({ jti: 'infinity', expiresAt: 201 })).toBe(true);
    expect(await store.consumeBackchannelLogoutTokenJti({ jti: 'negative_infinity', expiresAt: 201 })).toBe(true);
  });

  it('allows exactly one concurrent valid backchannel logout token jti consume', async () => {
    const store = createMemoryOidcVaultStore({ now: () => 100 });

    const results = await Promise.all([
      store.consumeBackchannelLogoutTokenJti({ jti: 'logout_1', expiresAt: 200 }),
      store.consumeBackchannelLogoutTokenJti({ jti: 'logout_1', expiresAt: 200 }),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
  });
});
