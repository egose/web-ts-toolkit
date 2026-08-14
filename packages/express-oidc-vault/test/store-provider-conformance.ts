import { describe, expect, it } from 'vitest';

import { OidcVaultStoreConflictError } from '@web-ts-toolkit/express-oidc-vault';
import type { OidcVaultSession, OidcVaultStoreProvider } from '@web-ts-toolkit/express-oidc-vault';

export interface OidcVaultStoreConformanceContext {
  store: OidcVaultStoreProvider;
  setNow(now: number): void;
  cleanup?(): Promise<void> | void;
}

export interface OidcVaultStoreConformanceOptions {
  createContext(testName: string): Promise<OidcVaultStoreConformanceContext> | OidcVaultStoreConformanceContext;
}

const withContext = async (
  options: OidcVaultStoreConformanceOptions,
  testName: string,
  run: (context: OidcVaultStoreConformanceContext) => Promise<void>,
): Promise<void> => {
  const context = await options.createContext(testName);

  try {
    await run(context);
  } finally {
    await context.cleanup?.();
  }
};

const createSessionInput = (sessionId: string): OidcVaultSession => ({
  sessionId,
  logicalSessionId: 'logical_1',
  subject: 'user_1',
  providerSessionId: 'provider_session_1',
  provider: {
    issuer: 'https://issuer.example.com',
    clientId: 'client_1',
  },
  refreshToken: `refresh_${sessionId}`,
  idToken: `id_${sessionId}`,
  accessToken: `access_${sessionId}`,
  scope: 'openid email',
  createdAt: 100,
  updatedAt: 100,
  user: {
    sub: 'user_1',
    email: 'user@example.com',
  },
  metadata: {
    nested: { value: sessionId },
    list: [1, 'two', false, null],
  },
});

export const defineOidcVaultStoreProviderConformanceSuite = (
  providerName: string,
  options: OidcVaultStoreConformanceOptions,
): void => {
  describe(`${providerName} store provider conformance`, () => {
    it('upserts and consumes authorization transactions and exchange codes once', async () => {
      await withContext(options, 'one-time-record-upserts', async ({ store, setNow }) => {
        setNow(100);

        await store.createAuthorizationTransaction({
          state: 'state_1',
          nonce: 'nonce_1',
          pkceVerifier: 'verifier_1',
          codeChallenge: 'challenge_1',
          createdAt: 100,
          expiresAt: 300,
          metadata: { value: 'first' },
        });
        await store.createAuthorizationTransaction({
          state: 'state_1',
          nonce: 'nonce_2',
          pkceVerifier: 'verifier_2',
          codeChallenge: 'challenge_2',
          createdAt: 101,
          expiresAt: 300,
          metadata: { value: 'second' },
        });
        await store.createExchangeCode({
          code: 'code_1',
          sessionId: 'session_1',
          returnTo: '/first',
          createdAt: 100,
          expiresAt: 300,
        });
        await store.createExchangeCode({
          code: 'code_1',
          sessionId: 'session_2',
          returnTo: '/second',
          createdAt: 101,
          expiresAt: 300,
        });

        expect(await store.consumeAuthorizationTransaction('state_1')).toMatchObject({
          state: 'state_1',
          nonce: 'nonce_2',
          metadata: { value: 'second' },
        });
        expect(await store.consumeAuthorizationTransaction('state_1')).toBeNull();
        expect(await store.consumeExchangeCode('code_1')).toMatchObject({
          code: 'code_1',
          sessionId: 'session_2',
          returnTo: '/second',
        });
        expect(await store.consumeExchangeCode('code_1')).toBeNull();
      });
    });

    it('enforces exact-boundary expiry for one-time records and sessions', async () => {
      await withContext(options, 'expiry-boundaries', async ({ store, setNow }) => {
        setNow(200);

        await store.createAuthorizationTransaction({
          state: 'state_expired',
          nonce: 'nonce_1',
          pkceVerifier: 'verifier_1',
          codeChallenge: 'challenge_1',
          createdAt: 100,
          expiresAt: 200,
        });
        await store.createExchangeCode({
          code: 'code_expired',
          sessionId: 'session_1',
          createdAt: 100,
          expiresAt: 200,
        });
        await store.createSession({
          ...createSessionInput('session_expired'),
          expiresAt: 200,
        });

        expect(await store.consumeAuthorizationTransaction('state_expired')).toBeNull();
        expect(await store.consumeExchangeCode('code_expired')).toBeNull();
        expect(await store.getSession('session_expired')).toBeNull();
      });
    });

    it('upserts sessions while preserving JSON-compatible ownership boundaries', async () => {
      await withContext(options, 'session-upsert-ownership', async ({ store }) => {
        const first = createSessionInput('session_1');
        const second = {
          ...createSessionInput('session_1'),
          refreshToken: 'refresh_second',
          metadata: { nested: { value: 'second' }, list: [3, true, null] },
        };

        const created = await store.createSession(first);
        first.metadata = { nested: { value: 'mutated-input' } };
        created.metadata = { nested: { value: 'mutated-return' } };

        expect(await store.getSession('session_1')).toMatchObject({
          sessionId: 'session_1',
          refreshToken: 'refresh_session_1',
          metadata: { nested: { value: 'session_1' } },
        });

        const read = await store.getSession('session_1');
        expect(read).not.toBeNull();
        read!.metadata = { nested: { value: 'mutated-read' } };

        expect(await store.getSession('session_1')).toMatchObject({
          metadata: { nested: { value: 'session_1' } },
        });

        await store.createSession(second);
        expect(await store.getSession('session_1')).toMatchObject({
          sessionId: 'session_1',
          refreshToken: 'refresh_second',
          metadata: { nested: { value: 'second' }, list: [3, true, null] },
        });
      });
    });

    it('rotates sessions with stable logical lineage and conflict-safe target handling', async () => {
      await withContext(options, 'rotation-conflicts', async ({ store }) => {
        await store.createSession(createSessionInput('source'));
        await store.createSession({
          ...createSessionInput('target'),
          logicalSessionId: 'logical_target',
          subject: 'user_target',
          refreshToken: 'refresh_target_original',
        });

        const sourceBefore = await store.getSession('source');
        const targetBefore = await store.getSession('target');

        await expect(
          store.rotateSession({
            sessionId: 'source',
            nextSession: {
              ...createSessionInput('target'),
              refreshToken: 'refresh_rotated',
              updatedAt: 101,
            },
          }),
        ).rejects.toBeInstanceOf(OidcVaultStoreConflictError);

        expect(await store.getSession('source')).toEqual(sourceBefore);
        expect(await store.getSession('target')).toEqual(targetBefore);

        await expect(
          store.rotateSession({
            sessionId: 'source',
            nextSession: {
              ...createSessionInput('source'),
              refreshToken: 'refresh_same_id',
              updatedAt: 102,
            },
          }),
        ).rejects.toBeInstanceOf(OidcVaultStoreConflictError);

        expect(await store.getSession('source')).toEqual(sourceBefore);

        const rotated = await store.rotateSession({
          sessionId: 'source',
          nextSession: {
            ...createSessionInput('rotated'),
            logicalSessionId: undefined,
            refreshToken: 'refresh_rotated_valid',
            updatedAt: 103,
          },
        });

        expect(rotated).toMatchObject({
          sessionId: 'rotated',
          logicalSessionId: 'logical_1',
          refreshToken: 'refresh_rotated_valid',
        });
        expect(await store.getSession('source')).toBeNull();
        expect(await store.getSession('rotated')).toMatchObject({ logicalSessionId: 'logical_1' });
      });
    });

    it('deletes current sessions through rotated aliases, logical IDs, subject scopes, and provider-session scopes', async () => {
      await withContext(options, 'logical-and-scoped-delete', async ({ store }) => {
        await store.createSession(createSessionInput('old_public'));
        await store.rotateSession({
          sessionId: 'old_public',
          nextSession: {
            ...createSessionInput('current_public'),
            logicalSessionId: undefined,
            updatedAt: 101,
          },
        });
        await store.deleteSession('old_public');

        expect(await store.getSession('current_public')).toBeNull();

        await store.createSession(createSessionInput('logical_delete'));
        expect(await store.deleteSessionsByLogicalSessionId('logical_1')).toBe(1);
        expect(await store.getSession('logical_delete')).toBeNull();

        await store.createSession(createSessionInput('subject_match'));
        await store.createSession({
          ...createSessionInput('subject_other_client'),
          provider: { issuer: 'https://issuer.example.com', clientId: 'client_2' },
        });
        expect(
          await store.deleteSessionsBySubject({
            subject: 'user_1',
            issuer: 'https://issuer.example.com',
            clientId: 'client_1',
          }),
        ).toBe(1);
        expect(await store.getSession('subject_match')).toBeNull();
        expect(await store.getSession('subject_other_client')).not.toBeNull();

        await store.createSession({
          ...createSessionInput('provider_match'),
          providerSessionId: 'provider_delete',
        });
        await store.createSession({
          ...createSessionInput('provider_other_issuer'),
          providerSessionId: 'provider_delete',
          provider: { issuer: 'https://other.example.com', clientId: 'client_1' },
        });
        expect(
          await store.deleteSessionsByProviderSessionId({
            providerSessionId: 'provider_delete',
            issuer: 'https://issuer.example.com',
            clientId: 'client_1',
          }),
        ).toBe(1);
        expect(await store.getSession('provider_match')).toBeNull();
        expect(await store.getSession('provider_other_issuer')).not.toBeNull();
      });
    });

    it('removes rotated aliases when their logical lineage is deleted', async () => {
      await withContext(options, 'stale-alias-cleanup', async ({ store, setNow }) => {
        setNow(100);

        await store.createSession(createSessionInput('old_direct'));
        await store.rotateSession({
          sessionId: 'old_direct',
          nextSession: {
            ...createSessionInput('current_direct'),
            logicalSessionId: undefined,
            updatedAt: 101,
          },
        });
        await store.deleteSession('current_direct');
        await store.createSession(createSessionInput('reused_direct'));
        await store.deleteSession('old_direct');
        expect(await store.getSession('reused_direct')).not.toBeNull();

        await store.createSession(createSessionInput('old_logical'));
        await store.rotateSession({
          sessionId: 'old_logical',
          nextSession: {
            ...createSessionInput('current_logical'),
            logicalSessionId: undefined,
            updatedAt: 102,
          },
        });
        expect(await store.deleteSessionsByLogicalSessionId('logical_1')).toBeGreaterThanOrEqual(1);
        await store.createSession(createSessionInput('reused_logical'));
        await store.deleteSession('old_logical');
        expect(await store.getSession('reused_logical')).not.toBeNull();

        await store.createSession(createSessionInput('old_subject'));
        await store.rotateSession({
          sessionId: 'old_subject',
          nextSession: {
            ...createSessionInput('current_subject'),
            logicalSessionId: undefined,
            updatedAt: 103,
          },
        });
        expect(await store.deleteSessionsBySubject('user_1')).toBeGreaterThanOrEqual(1);
        await store.createSession(createSessionInput('reused_subject'));
        await store.deleteSession('old_subject');
        expect(await store.getSession('reused_subject')).not.toBeNull();

        await store.createSession(createSessionInput('old_provider'));
        await store.rotateSession({
          sessionId: 'old_provider',
          nextSession: {
            ...createSessionInput('current_provider'),
            logicalSessionId: undefined,
            updatedAt: 104,
          },
        });
        expect(await store.deleteSessionsByProviderSessionId('provider_session_1')).toBeGreaterThanOrEqual(1);
        await store.createSession(createSessionInput('reused_provider'));
        await store.deleteSession('old_provider');
        expect(await store.getSession('reused_provider')).not.toBeNull();

        await store.createSession({
          ...createSessionInput('old_expired'),
          expiresAt: 200,
        });
        await store.rotateSession({
          sessionId: 'old_expired',
          nextSession: {
            ...createSessionInput('current_expired'),
            logicalSessionId: undefined,
            expiresAt: 200,
            updatedAt: 105,
          },
        });
        setNow(201);
        expect(await store.getSession('current_expired')).toBeNull();
        setNow(202);
        await store.createSession(createSessionInput('reused_expired'));
        await store.deleteSession('old_expired');
        expect(await store.getSession('reused_expired')).not.toBeNull();
      });
    });

    it('enforces backchannel logout JTI replay and finite future expiry semantics', async () => {
      await withContext(options, 'backchannel-jti', async ({ store, setNow }) => {
        setNow(200);

        expect(await store.consumeBackchannelLogoutTokenJti({ jti: 'equal', expiresAt: 200 })).toBe(false);
        expect(await store.consumeBackchannelLogoutTokenJti({ jti: 'past', expiresAt: 199 })).toBe(false);
        expect(await store.consumeBackchannelLogoutTokenJti({ jti: 'nan', expiresAt: Number.NaN })).toBe(false);
        expect(
          await store.consumeBackchannelLogoutTokenJti({ jti: 'infinity', expiresAt: Number.POSITIVE_INFINITY }),
        ).toBe(false);
        expect(
          await store.consumeBackchannelLogoutTokenJti({
            jti: 'negative_infinity',
            expiresAt: Number.NEGATIVE_INFINITY,
          }),
        ).toBe(false);

        expect(await store.consumeBackchannelLogoutTokenJti({ jti: 'logout_1', expiresAt: 300 })).toBe(true);
        expect(await store.consumeBackchannelLogoutTokenJti({ jti: 'logout_1', expiresAt: 300 })).toBe(false);

        const results = await Promise.all([
          store.consumeBackchannelLogoutTokenJti({ jti: 'logout_2', expiresAt: 300 }),
          store.consumeBackchannelLogoutTokenJti({ jti: 'logout_2', expiresAt: 300 }),
        ]);

        expect(results.filter(Boolean)).toHaveLength(1);

        setNow(301);

        expect(await store.consumeBackchannelLogoutTokenJti({ jti: 'logout_1', expiresAt: 400 })).toBe(true);
        expect(await store.consumeBackchannelLogoutTokenJti({ jti: 'equal', expiresAt: 400 })).toBe(true);
        expect(await store.consumeBackchannelLogoutTokenJti({ jti: 'nan', expiresAt: 400 })).toBe(true);
      });
    });
  });
};
