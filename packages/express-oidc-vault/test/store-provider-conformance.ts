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
  /**
   * Declared duplicate-`createSession` mode (SVH-06). There is no default: every
   * provider must declare `'create-only'` (live duplicates reject with
   * `OidcVaultStoreConflictError`, originals/indexes preserved) or `'upsert'`
   * (duplicates replace, scope ownership follows the replacement).
   */
  sessionCreateMode: 'create-only' | 'upsert';
  /**
   * Whether creating an ID that holds only a stale rotation alias (no live
   * session) clears that alias. Memory and Redis clear it; MongoDB retains the
   * stale alias row until its lineage is deleted (FU-SVH-05b). Must be declared
   * explicitly alongside `sessionCreateMode`.
   */
  reusedSessionIdClearsStaleAlias: boolean;
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
    for (const operation of ['create', 'rotate'] as const) {
      it(`${operation} snapshots invocation data and detaches nested results`, async () => {
        await withContext(options, `ownership-${operation}`, async ({ store }) => {
          const input = {
            ...createSessionInput('owned'),
            provider: { issuer: 'issuer', clientId: 'client', nested: [{ values: ['provider'] }] },
            user: { sub: 'user', nested: [{ values: ['user'] }] },
            metadata: { nested: [{ values: ['metadata'] }], nil: null, flag: false },
          };
          if (operation === 'rotate') await store.createSession({ ...createSessionInput('source') });
          const rotation = { sessionId: 'source', nextSession: input };
          const expected = structuredClone(input);
          const pending = operation === 'create' ? store.createSession(input) : store.rotateSession(rotation);
          input.sessionId = 'mutated';
          input.provider.issuer = 'mutated';
          input.provider.nested[0]!.values.push('mutated');
          input.user.nested[0]!.values[0] = 'mutated';
          input.metadata.nested[0]!.values.splice(0);
          rotation.sessionId = 'unrelated';
          rotation.nextSession = createSessionInput('unrelated') as typeof input;
          const result = await pending;
          expect(result).toEqual(expected);
          // Mutate through the result's actual nested objects, not replacements.
          const nested = result as typeof input;
          nested.provider.nested[0]!.values.push('returned');
          nested.user.nested[0]!.values.push('returned');
          nested.metadata.nested[0]!.values.push('returned');
          expect(input.provider.nested[0]!.values).toEqual(['provider', 'mutated']);
          expect(input.user.nested[0]!.values).toEqual(['mutated']);
          expect(input.metadata.nested[0]!.values).toEqual([]);
          const read = (await store.getSession('owned')) as typeof input;
          expect(read).toEqual(expected);
          read.metadata.nested[0]!.values.push('read');
          read.user.nested[0]!.values.push('read');
          read.provider.nested[0]!.values.push('read');
          expect(await store.getSession('owned')).toEqual(expected);
          expect(await store.getSession('mutated')).toBeNull();
          if (operation === 'rotate') expect(await store.getSession('source')).toBeNull();
        });
      });
    }

    it('snapshots one-time records and JTI reservations at invocation', async () => {
      await withContext(options, 'one-time-input-ownership', async ({ store, setNow }) => {
        setNow(100);
        const transaction = {
          state: 'state',
          nonce: 'nonce',
          pkceVerifier: 'verifier',
          codeChallenge: 'challenge',
          createdAt: 100,
          expiresAt: 300,
          metadata: { nested: [{ values: ['original'] }] },
        };
        const expected = structuredClone(transaction);
        const creating = store.createAuthorizationTransaction(transaction);
        transaction.state = 'changed';
        transaction.expiresAt = 1;
        transaction.metadata.nested[0]!.values.push('changed');
        await creating;
        expect(await store.consumeAuthorizationTransaction('state')).toEqual(expected);
        expect(await store.consumeAuthorizationTransaction('changed')).toBeNull();
        const exchange = { code: 'code', sessionId: 'session', createdAt: 100, expiresAt: 300, returnTo: '/original' };
        const exchanging = store.createExchangeCode(exchange);
        Object.assign(exchange, { code: 'changed', sessionId: 'changed', expiresAt: 1, returnTo: '/changed' });
        await exchanging;
        expect(await store.consumeExchangeCode('code')).toEqual({
          code: 'code',
          sessionId: 'session',
          createdAt: 100,
          expiresAt: 300,
          returnTo: '/original',
        });
        expect(await store.consumeExchangeCode('changed')).toBeNull();
        const jti = { jti: 'jti', expiresAt: 300 };
        const reserving = store.consumeBackchannelLogoutTokenJti(jti);
        Object.assign(jti, { jti: 'changed', expiresAt: 1 });
        expect(await reserving).toBe(true);
        expect(await store.consumeBackchannelLogoutTokenJti({ jti: 'jti', expiresAt: 300 })).toBe(false);
        expect(await store.consumeBackchannelLogoutTokenJti({ jti: 'changed', expiresAt: 300 })).toBe(true);
      });
    });

    for (const method of ['subject', 'provider-session', 'logical'] as const) {
      it(`${method} deletion snapshots its object scope at invocation`, async () => {
        await withContext(options, `scope-ownership-${method}`, async ({ store }) => {
          await store.createSession(createSessionInput('matched'));
          await store.createSession({
            ...createSessionInput('other'),
            logicalSessionId: 'other',
            provider: { issuer: 'other', clientId: 'other' },
          });
          const scope = {
            subject: 'user_1',
            providerSessionId: 'provider_session_1',
            logicalSessionId: 'logical_1',
            issuer: 'https://issuer.example.com',
            clientId: 'client_1',
          };
          // Use only the appropriate discriminant in each public input.
          const subject = { subject: scope.subject, issuer: scope.issuer, clientId: scope.clientId };
          const provider = {
            providerSessionId: scope.providerSessionId,
            issuer: scope.issuer,
            clientId: scope.clientId,
          };
          const logical = { logicalSessionId: scope.logicalSessionId };
          const pending =
            method === 'subject'
              ? store.deleteSessionsBySubject(subject)
              : method === 'provider-session'
                ? store.deleteSessionsByProviderSessionId(provider)
                : store.deleteSessionsByLogicalSessionId(logical);
          Object.assign(subject, { subject: 'changed', issuer: 'other', clientId: 'other' });
          Object.assign(provider, { providerSessionId: 'changed', issuer: 'other', clientId: 'other' });
          logical.logicalSessionId = 'other';
          expect(await pending).toBe(1);
          expect(await store.getSession('matched')).toBeNull();
          expect(await store.getSession('other')).not.toBeNull();
        });
      });
    }

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

    it('creates sessions while preserving JSON-compatible ownership boundaries', async () => {
      await withContext(options, 'session-upsert-ownership', async ({ store }) => {
        const first = createSessionInput('session_1');
        const second = {
          ...createSessionInput('session_1'),
          logicalSessionId: 'logical_2',
          subject: 'user_2',
          providerSessionId: 'provider_sid_2',
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

        if (options.sessionCreateMode === 'create-only') {
          await expect(store.createSession(second)).rejects.toBeInstanceOf(OidcVaultStoreConflictError);
          expect(await store.getSession('session_1')).toMatchObject({
            sessionId: 'session_1',
            logicalSessionId: 'logical_1',
            subject: 'user_1',
            providerSessionId: 'provider_session_1',
            refreshToken: 'refresh_session_1',
            metadata: { nested: { value: 'session_1' } },
          });
          expect(
            await store.deleteSessionsBySubject({
              subject: 'user_2',
              issuer: 'https://issuer.example.com',
              clientId: 'client_1',
            }),
          ).toBe(0);
          expect(
            await store.deleteSessionsByProviderSessionId({
              providerSessionId: 'provider_sid_2',
              issuer: 'https://issuer.example.com',
              clientId: 'client_1',
            }),
          ).toBe(0);
          expect(await store.deleteSessionsByLogicalSessionId('logical_2')).toBe(0);
          expect(await store.getSession('session_1')).not.toBeNull();
        } else {
          await store.createSession(second);
          expect(await store.getSession('session_1')).toMatchObject({
            sessionId: 'session_1',
            logicalSessionId: 'logical_2',
            subject: 'user_2',
            providerSessionId: 'provider_sid_2',
            refreshToken: 'refresh_second',
            metadata: { nested: { value: 'second' }, list: [3, true, null] },
          });
          expect(
            await store.deleteSessionsBySubject({
              subject: 'user_1',
              issuer: 'https://issuer.example.com',
              clientId: 'client_1',
            }),
          ).toBe(0);
          expect(
            await store.deleteSessionsBySubject({
              subject: 'user_2',
              issuer: 'https://issuer.example.com',
              clientId: 'client_1',
            }),
          ).toBe(1);
          expect(await store.getSession('session_1')).toBeNull();
        }
      });
    });

    it('documents same-ID reuse alias ownership per declared provider mode', async () => {
      await withContext(options, 'create-reuse-alias-ownership', async ({ store }) => {
        await store.createSession({
          ...createSessionInput('reuse_old'),
          logicalSessionId: 'lineage_reuse',
          subject: 'user_reuse',
        });
        await store.rotateSession({
          sessionId: 'reuse_old',
          nextSession: {
            ...createSessionInput('reuse_current'),
            logicalSessionId: undefined,
            subject: 'user_reuse',
            updatedAt: 101,
          },
        });

        const replacement = await store.createSession({
          ...createSessionInput('reuse_old'),
          logicalSessionId: 'lineage_replacement',
          subject: 'user_replacement',
          refreshToken: 'refresh_replacement',
        });
        expect(replacement).toMatchObject({
          sessionId: 'reuse_old',
          logicalSessionId: 'lineage_replacement',
          subject: 'user_replacement',
        });
        expect(await store.getSession('reuse_current')).not.toBeNull();

        await store.deleteSession('reuse_old');
        expect(await store.getSession('reuse_old')).toBeNull();
        expect(await store.getSession('reuse_current')).not.toBeNull();

        await store.deleteSession('reuse_old');
        if (options.reusedSessionIdClearsStaleAlias) {
          expect(await store.getSession('reuse_current')).not.toBeNull();
        } else {
          expect(await store.getSession('reuse_current')).toBeNull();
        }
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

    for (const laterExpiry of ['finite', 'none'] as const) {
      for (const offset of [-1, 0, 1]) {
        it(`finite alias keeps its immediate successor deadline with ${laterExpiry} later expiry at offset ${offset}`, async () => {
          await withContext(options, `alias-deadline-${laterExpiry}-${offset}`, async ({ store, setNow }) => {
            // Future wall time keeps MongoDB's real TTL monitor out of the
            // deterministic store-clock boundary test. Redis uses its clocked emulator.
            const start = Date.now() + 600_000;
            setNow(start);
            await store.createSession({ ...createSessionInput('first'), expiresAt: start + 100 });
            await store.rotateSession({
              sessionId: 'first',
              nextSession: { ...createSessionInput('second'), expiresAt: start + 200 },
            });
            await store.rotateSession({
              sessionId: 'second',
              nextSession: {
                ...createSessionInput('third'),
                expiresAt: laterExpiry === 'finite' ? start + 400 : undefined,
              },
            });
            setNow(start + 200 + offset);
            // Neither alias is an authentication/read handle. The original
            // source deadline has passed, but the immediate successor controls it.
            expect(await store.getSession('first')).toBeNull();
            expect(await store.getSession('second')).toBeNull();
            expect(await store.getSession('third')).not.toBeNull();
            await store.deleteSession('first');
            if (offset < 0) {
              expect(await store.getSession('third')).toBeNull();
            } else {
              expect(await store.getSession('third')).not.toBeNull();
              // Expiry of the earlier alias does not disable the newer one.
              await store.deleteSession('second');
              expect(await store.getSession('third')).toBeNull();
            }
          });
        });
      }
    }

    for (const survivor of [false, true]) {
      for (const handle of ['earlier', 'immediate'] as const) {
        it(`changed lineage scopes the ${handle} alias with old-lineage survivor ${survivor}`, async () => {
          await withContext(options, `alias-lineage-${survivor}-${handle}`, async ({ store, setNow }) => {
            const start = Date.now() + 600_000;
            setNow(start);
            const original = { ...createSessionInput('earlier'), expiresAt: start + 400 };
            await store.createSession(original);
            await store.rotateSession({
              sessionId: 'earlier',
              nextSession: { ...original, sessionId: 'immediate' },
            });
            if (survivor) {
              await store.createSession({
                ...original,
                sessionId: 'old_peer',
                provider: { issuer: 'other_issuer', clientId: 'other_client' },
              });
            }
            await store.rotateSession({
              sessionId: 'immediate',
              nextSession: {
                ...original,
                sessionId: 'current',
                logicalSessionId: 'new_lineage',
                expiresAt: start + 800,
              },
            });
            expect(await store.getSession('earlier')).toBeNull();
            expect(await store.getSession('immediate')).toBeNull();
            expect(await store.getSession('current')).toMatchObject({ logicalSessionId: 'new_lineage' });
            await store.deleteSession(handle);
            if (handle === 'earlier') {
              // Retired aliases and retained empty-lineage aliases are both
              // permitted; neither may be retargeted to the new lineage.
              expect(await store.getSession('current')).not.toBeNull();
              expect(await store.getSession('old_peer')).toBeNull();
              await store.deleteSession('immediate');
              expect(await store.getSession('current')).toBeNull();
            } else {
              expect(await store.getSession('current')).toBeNull();
              if (survivor) {
                expect(await store.getSession('old_peer')).not.toBeNull();
                await store.deleteSession('earlier');
              }
              expect(await store.getSession('old_peer')).toBeNull();
            }
          });
        });
      }
    }

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

    for (const method of ['subject', 'provider-session', 'direct'] as const) {
      for (const differentScope of ['issuer', 'clientId'] as const) {
        it(`${method} deletion preserves aliases of a surviving ${differentScope} scope`, async () => {
          for (const finite of [false, true]) {
            await withContext(options, `survivor-alias-${method}-${differentScope}-${finite}`, async ({ store }) => {
              const matched = {
                ...createSessionInput('matched'),
                expiresAt: finite ? Date.now() + 600_000 : undefined,
              };
              const survivor = {
                ...createSessionInput('survivor_old'),
                expiresAt: matched.expiresAt,
                provider: { ...matched.provider!, [differentScope]: 'other' },
              };
              await store.createSession(matched);
              await store.createSession(survivor);
              await store.rotateSession({
                sessionId: survivor.sessionId,
                nextSession: { ...survivor, sessionId: 'survivor_current' },
              });
              if (method === 'direct') {
                await store.deleteSession(matched.sessionId);
              } else if (method === 'subject') {
                expect(await store.deleteSessionsBySubject({ subject: matched.subject, ...matched.provider })).toBe(1);
              } else {
                expect(
                  await store.deleteSessionsByProviderSessionId({
                    providerSessionId: matched.providerSessionId!,
                    ...matched.provider,
                  }),
                ).toBe(1);
              }
              expect(await store.getSession(matched.sessionId)).toBeNull();
              expect(await store.getSession('survivor_current')).not.toBeNull();
              await store.deleteSession('survivor_old');
              expect(await store.getSession('survivor_current')).toBeNull();
              await store.createSession(createSessionInput('reused_lineage'));
              await store.deleteSession('survivor_old');
              expect(await store.getSession('reused_lineage')).not.toBeNull();
            });
          }
        });
      }
    }

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
