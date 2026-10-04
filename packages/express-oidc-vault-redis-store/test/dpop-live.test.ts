import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from 'redis';
import { OidcVaultDpopReplayCapacityError, OidcVaultStoreConflictError } from '@web-ts-toolkit/express-oidc-vault';
import type { OidcVaultDpopBinding, OidcVaultRecordBindingMatch } from '@web-ts-toolkit/express-oidc-vault';
import { createRedisOidcVaultStore, type OidcVaultRedisClient } from '../src';
import { CONSUME_GUARDED_RECORD_SCRIPT, RESERVE_DPOP_PROOF_SCRIPT, ROTATE_SESSION_SCRIPT } from '../src/scripts';
import { createRedisHarness, REDIS_TIMEOUT, type RedisHarness } from './redis-harness';

const binding: OidcVaultDpopBinding = { type: 'dpop', jkt: 'A'.repeat(43) };
const otherBinding: OidcVaultDpopBinding = { type: 'dpop', jkt: 'B'.repeat(42) + 'A' };
const hash = 'C'.repeat(42) + 'A';
const match: OidcVaultRecordBindingMatch = { deviceBinding: binding, browserBindingHash: hash };
const absent: OidcVaultRecordBindingMatch = { deviceBinding: null, browserBindingHash: null };
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const digest = (script: string) => createHash('sha1').update(script).digest('hex');

describe.each(['redis:6.2-alpine', 'redis:7.2-alpine'])('DBJWT-08 live DPoP on %s', (image) => {
  let harness: RedisHarness;
  let peer: ReturnType<typeof createClient>;
  beforeAll(async () => {
    harness = await createRedisHarness(image);
    peer = createClient({ url: harness.url });
    await peer.connect();
  }, REDIS_TIMEOUT);
  afterAll(async () => {
    if (peer?.isOpen) await peer.quit();
    await harness?.stop();
  }, REDIS_TIMEOUT);

  const serverNow = async () => {
    const time = (await harness.client.sendCommand(['TIME'])) as string[];
    return Number(time[0]) * 1000 + Math.floor(Number(time[1]) / 1000);
  };
  const waitForServerExpiry = async (expiresAt: number) => {
    const deadline = performance.now() + 10_000;
    while ((await serverNow()) <= expiresAt) {
      if (performance.now() > deadline) throw new Error('Timed out waiting for disposable Redis server expiry.');
      await sleep(25);
    }
  };
  const run = async (name: string, test: (prefix: string) => Promise<void>) => {
    const prefix = harness.createKeyPrefix(name);
    try {
      await test(prefix);
    } finally {
      await harness.deleteKeysByPrefix(prefix);
    }
  };
  const stores = (keyPrefix: string, dpopReplayMaxEntries = 4) =>
    [
      createRedisOidcVaultStore({ client: harness.client, keyPrefix, dpopReplayMaxEntries }),
      createRedisOidcVaultStore({ client: peer, keyPrefix, dpopReplayMaxEntries }),
    ] as const;

  it.each([null, 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid capacity %s at construction',
    (max) => {
      expect(() => createRedisOidcVaultStore({ client: harness.client, dpopReplayMaxEntries: max as number })).toThrow(
        'positive safe integer',
      );
    },
  );

  it('owns supplied store limits despite mutation of the caller options object', async () => {
    await run('options-snapshot', async (prefix) => {
      const options = { client: harness.client, keyPrefix: prefix, dpopReplayMaxEntries: 1 };
      const store = createRedisOidcVaultStore(options);
      options.dpopReplayMaxEntries = 100_000;
      const expiry = (await serverNow()) + 60_000;
      expect(await store.reserveDpopProof({ replayKey: 'one', expiresAt: expiry })).toBe(true);
      await expect(store.reserveDpopProof({ replayKey: 'two', expiresAt: expiry })).rejects.toBeInstanceOf(
        OidcVaultDpopReplayCapacityError,
      );
    });
  });

  for (const kind of ['transaction', 'exchange'] as const) {
    it(`${kind}: legacy absence and cookie-only null-key matches round-trip through real Lua`, async () => {
      await run(`${kind}-absent`, async (prefix) => {
        const [store, other] = stores(prefix);
        const start = await serverNow();
        for (const cookieOnly of [false, true]) {
          const fields = {
            createdAt: start,
            expiresAt: start + 60_000,
            ...(cookieOnly ? { browserBindingHash: hash } : {}),
          };
          if (kind === 'transaction')
            await store.createAuthorizationTransaction({
              state: 'id',
              nonce: 'n',
              pkceVerifier: 'v',
              codeChallenge: 'c',
              ...fields,
            });
          else await store.createExchangeCode({ code: 'id', sessionId: 'session', ...fields });
          if (cookieOnly) {
            expect(
              await (kind === 'transaction'
                ? other.consumeAuthorizationTransaction('id')
                : other.consumeExchangeCode('id')),
            ).toBeNull();
            expect(
              await (kind === 'transaction'
                ? other.consumeAuthorizationTransactionIfMatches({ state: 'id', match: absent })
                : other.consumeExchangeCodeIfMatches({ code: 'id', expectedSessionId: 'session', match: absent })),
            ).toBeNull();
          }
          const candidate = { deviceBinding: null, browserBindingHash: cookieOnly ? hash : null };
          const result =
            kind === 'transaction'
              ? await other.consumeAuthorizationTransactionIfMatches({ state: 'id', match: candidate })
              : await other.consumeExchangeCodeIfMatches({
                  code: 'id',
                  expectedSessionId: 'session',
                  match: candidate,
                });
          expect(result).toMatchObject(fields);
          expect(result!.deviceBinding).toBeUndefined();
        }
      });
    });

    it(`${kind}: live Lua has exactly one guarded winner across independent clients and refuses legacy/mismatched callers`, async () => {
      await run(`${kind}-race`, async (prefix) => {
        const [store, other] = stores(prefix);
        const start = await serverNow();
        if (kind === 'transaction')
          await store.createAuthorizationTransaction({
            state: 'id',
            nonce: 'n',
            pkceVerifier: 'v',
            codeChallenge: 'c',
            createdAt: start,
            expiresAt: start + 60_000,
            deviceBinding: binding,
            browserBindingHash: hash,
          });
        else
          await store.createExchangeCode({
            code: 'id',
            sessionId: 'session',
            createdAt: start,
            expiresAt: start + 60_000,
            deviceBinding: binding,
            browserBindingHash: hash,
          });
        const read =
          kind === 'transaction' ? await other.getAuthorizationTransaction('id') : await other.getExchangeCode('id');
        expect(read).toMatchObject({ deviceBinding: binding, browserBindingHash: hash });
        read!.deviceBinding!.jkt = otherBinding.jkt;
        const results = await Promise.all(
          Array.from({ length: 16 }, (_, index) => {
            const client = index % 2 ? store : other;
            if (index < 4)
              return kind === 'transaction'
                ? client.consumeAuthorizationTransaction('id')
                : client.consumeExchangeCode('id');
            const candidate = index < 8 ? absent : index < 12 ? { ...match, deviceBinding: otherBinding } : match;
            return kind === 'transaction'
              ? client.consumeAuthorizationTransactionIfMatches({ state: 'id', match: candidate })
              : client.consumeExchangeCodeIfMatches({ code: 'id', expectedSessionId: 'session', match: candidate });
          }),
        );
        expect(results.slice(0, 12)).toEqual(Array(12).fill(null));
        expect(results.filter(Boolean)).toHaveLength(1);
        expect(results.find(Boolean)).toMatchObject({ deviceBinding: binding, browserBindingHash: hash });
      });
    });

    it(`${kind}: null/malformed persisted binding fails closed on reads and both consumes`, async () => {
      await run(`${kind}-corruption`, async (prefix) => {
        const [store] = stores(prefix);
        const start = await serverNow();
        const base =
          kind === 'transaction'
            ? {
                state: 'id',
                nonce: 'n',
                pkceVerifier: 'v',
                codeChallenge: 'c',
                createdAt: start,
                expiresAt: start + 60_000,
              }
            : { code: 'id', sessionId: 'session', createdAt: start, expiresAt: start + 60_000 };
        const key = `${prefix}:${kind === 'transaction' ? 'txn' : 'exchange'}:id`;
        for (const fields of [
          { deviceBinding: null },
          { browserBindingHash: null },
          { deviceBinding: binding },
          { deviceBinding: { ...binding, jkt: 'B'.repeat(43) }, browserBindingHash: hash },
          { deviceBinding: { ...binding, jwk: { k: 'private' } }, browserBindingHash: hash },
          { deviceBinding: binding, browserBindingHash: 'invalid' },
        ]) {
          for (const operation of ['read', 'legacy', 'guarded'] as const) {
            await peer.set(key, JSON.stringify({ ...base, ...fields }));
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
  }

  it('exchange session/key/hash preflight is rechecked atomically; stale reads cannot delete a replacement', async () => {
    await run('stale-match', async (prefix) => {
      const [store, other] = stores(prefix);
      const start = await serverNow();
      const record = {
        code: 'code',
        sessionId: 'original',
        createdAt: start,
        expiresAt: start + 60_000,
        deviceBinding: binding,
        browserBindingHash: hash,
      };
      await store.createExchangeCode(record);
      const snapshot = await store.getExchangeCode('code');
      await other.createExchangeCode({ ...record, sessionId: 'replacement' });
      expect(
        await store.consumeExchangeCodeIfMatches({ code: 'code', expectedSessionId: snapshot!.sessionId, match }),
      ).toBeNull();
      const raw = harness.client;
      let interleaved = false;
      const wrapped = createRedisOidcVaultStore({
        keyPrefix: prefix,
        client: {
          set: raw.set.bind(raw),
          get: raw.get.bind(raw),
          del: raw.del.bind(raw),
          sendCommand: async (args) => {
            if (!interleaved && args[0] === 'EVALSHA' && args[1] === digest(CONSUME_GUARDED_RECORD_SCRIPT)) {
              interleaved = true;
              await other.createExchangeCode({ ...record, sessionId: 'replacement', deviceBinding: otherBinding });
            }
            return raw.sendCommand(args);
          },
        },
      });
      expect(
        await wrapped.consumeExchangeCodeIfMatches({ code: 'code', expectedSessionId: 'replacement', match }),
      ).toBeNull();
      expect(interleaved).toBe(true);
      expect(
        await other.consumeExchangeCodeIfMatches({
          code: 'code',
          expectedSessionId: 'replacement',
          match: { ...match, deviceBinding: otherBinding },
        }),
      ).toMatchObject({ deviceBinding: otherBinding });
    });
  });

  it('guarded reads/consumes check server payload expiry even after an external TTL extension, while legacy expiry policy is preserved', async () => {
    await run('payload-expiry', async (prefix) => {
      const [store] = stores(prefix);
      const start = await serverNow();
      for (const kind of ['transaction', 'exchange'] as const) {
        const key = `${prefix}:${kind === 'transaction' ? 'txn' : 'exchange'}:id`;
        const base =
          kind === 'transaction'
            ? { state: 'id', nonce: 'n', pkceVerifier: 'v', codeChallenge: 'c' }
            : { code: 'id', sessionId: 'session' };
        await peer.set(
          key,
          JSON.stringify({
            ...base,
            createdAt: start,
            expiresAt: start - 1,
            deviceBinding: binding,
            browserBindingHash: hash,
          }),
          { PXAT: start + 60_000 },
        );
        expect(
          await (kind === 'transaction' ? store.getAuthorizationTransaction('id') : store.getExchangeCode('id')),
        ).toBeNull();
        expect(
          await (kind === 'transaction'
            ? store.consumeAuthorizationTransactionIfMatches({ state: 'id', match })
            : store.consumeExchangeCodeIfMatches({ code: 'id', expectedSessionId: 'session', match })),
        ).toBeNull();
      }
    });
  });

  it('live/alias contexts resolve current binding and allowlisted provider after rotation; expired aliases cannot downgrade', async () => {
    await run('alias-context', async (prefix) => {
      const [store, other] = stores(prefix);
      const start = await serverNow();
      const providerWithExtraFields = { issuer: 'issuer', clientId: 'client', refreshToken: 'must-not-leak' };
      const original = await store.createSession({
        sessionId: 'old',
        subject: 'subject',
        refreshToken: 'secret-refresh',
        idToken: 'secret-id',
        provider: providerWithExtraFields,
        deviceBinding: binding,
      });
      const unboundInput = { ...original };
      delete unboundInput.deviceBinding;
      const middle = await other.rotateSession({
        sessionId: 'old',
        nextSession: { ...unboundInput, sessionId: 'middle', expiresAt: start + 800 },
      });
      const current = await store.rotateSession({
        sessionId: 'middle',
        nextSession: { ...middle, sessionId: 'current', expiresAt: start + 60_000 },
      });
      expect(await peer.get(`${prefix}:rotated-session-alias:old`)).toBe(JSON.stringify('old'));
      const expected = {
        logicalSessionId: 'old',
        deviceBinding: binding,
        provider: { issuer: 'issuer', clientId: 'client' },
      };
      expect(await other.getSessionRevocationContext('old')).toEqual(expected);
      const context = await store.getSessionRevocationContext('middle');
      context!.deviceBinding!.jkt = otherBinding.jkt;
      expect(await other.getSessionRevocationContext('middle')).toEqual(expected);
      await waitForServerExpiry(start + 800);
      expect(await store.getSessionRevocationContext('old')).toBeNull();
      expect(await store.getSessionRevocationContext('middle')).toEqual(expected);
      await other.createSession({ ...current, sessionId: 'peer', deviceBinding: undefined });
      await expect(store.getSessionRevocationContext('middle')).rejects.toThrow('inconsistent');
      expect(await store.getSession('current')).not.toBeNull();
    });
  });

  it('malformed current lineage binding throws a fixed diagnostic instead of treating an alias as unbound', async () => {
    await run('malformed-lineage', async (prefix) => {
      const [store] = stores(prefix);
      const source = await store.createSession({
        sessionId: 'old',
        subject: 's',
        refreshToken: 'r',
        idToken: 'i',
        deviceBinding: binding,
      });
      const next = await store.rotateSession({ sessionId: 'old', nextSession: { ...source, sessionId: 'current' } });
      for (const deviceBinding of [null, { ...binding, alg: 'ES256' }, { type: 'dpop', jkt: 'bad' }]) {
        await peer.set(`${prefix}:session:current`, JSON.stringify({ ...next, deviceBinding }));
        await expect(store.getSessionRevocationContext('old')).rejects.toThrow('malformed session authority');
        expect(await peer.get(`${prefix}:session:current`)).not.toBeNull();
      }
    });
  });

  it('a directly observed bound handle remains binding authority when its reverse-index membership is missing', async () => {
    await run('live-context-index-integrity', async (prefix) => {
      const [store, other] = stores(prefix);
      const source = await store.createSession({
        sessionId: 'source',
        logicalSessionId: 'lineage',
        subject: 's',
        refreshToken: 'r',
        idToken: 'i',
        deviceBinding: binding,
      });
      await peer.zRem(`${prefix}:logical-session:lineage`, 'source');
      expect(await store.getSessionRevocationContext('source')).toEqual({
        logicalSessionId: 'lineage',
        deviceBinding: binding,
      });
      await other.createSession({ ...source, sessionId: 'unbound-peer', deviceBinding: undefined });
      await expect(store.getSessionRevocationContext('source')).rejects.toThrow('inconsistent');
      expect((await store.getSession('source'))!.deviceBinding).toEqual(binding);
    });
  });

  it('provider object validation distinguishes empty objects from empty arrays, escaped keys and nested lookalikes', async () => {
    await run('provider-json-shape', async (prefix) => {
      const [store] = stores(prefix);
      const source = await store.createSession({
        sessionId: 'session',
        subject: 's',
        refreshToken: 'r',
        idToken: 'i',
        deviceBinding: binding,
        provider: {},
        metadata: { nested: { provider: [] }, text: 'escaped "provider":[]' },
      });
      expect(await store.getSessionRevocationContext('session')).toEqual({
        logicalSessionId: 'session',
        provider: {},
        deviceBinding: binding,
      });
      const raw = JSON.stringify(source);
      const key = `${prefix}:session:session`;
      for (const malformed of [
        raw.replace('"provider":{}', '"provider":[]'),
        raw.replace('"provider":{}', '"prov\\u0069der":[]'),
        raw.replace('"provider":{}', '"provider":{},"provider":[]'),
      ]) {
        await peer.set(key, malformed);
        await expect(store.getSessionRevocationContext('session')).rejects.toThrow('malformed provider');
      }
      await peer.set(key, raw.replace('"provider":{}', '"provider":[],"provider":{}'));
      expect(await store.getSessionRevocationContext('session')).toMatchObject({ provider: {} });
    });
  });

  it('rotation source authority is rechecked in Lua after same-ID replacement, preserving the new key and indexes', async () => {
    await run('rotation-cas', async (prefix) => {
      const [base, other] = stores(prefix);
      const source = await base.createSession({
        sessionId: 'source',
        subject: 's',
        logicalSessionId: 'lineage',
        refreshToken: 'r',
        idToken: 'i',
        deviceBinding: binding,
      });
      const raw = harness.client;
      let interleaved = false;
      const store = createRedisOidcVaultStore({
        keyPrefix: prefix,
        client: {
          set: raw.set.bind(raw),
          get: raw.get.bind(raw),
          del: raw.del.bind(raw),
          sendCommand: async (args) => {
            if (!interleaved && args[0] === 'EVALSHA' && args[1] === digest(ROTATE_SESSION_SCRIPT)) {
              interleaved = true;
              await other.deleteSession('source');
              await other.createSession({ ...source, deviceBinding: otherBinding });
            }
            return raw.sendCommand(args);
          },
        },
      });
      await expect(
        store.rotateSession({ sessionId: 'source', nextSession: { ...source, sessionId: 'target' } }),
      ).rejects.toBeInstanceOf(OidcVaultStoreConflictError);
      expect(interleaved).toBe(true);
      expect((await other.getSession('source'))!.deviceBinding).toEqual(otherBinding);
      expect(await other.getSession('target')).toBeNull();
      expect(await other.getSessionRevocationContext('source')).toMatchObject({ deviceBinding: otherBinding });
    });
  });

  it('shared replay capacity admits exactly four unique keys, duplicates win over capacity, and expiry reclaims capacity', async () => {
    await run('replay-capacity', async (prefix) => {
      const clients = stores(prefix);
      const start = await serverNow();
      const results = await Promise.allSettled(
        Array.from({ length: 16 }, (_, index) =>
          clients[index % 2]!.reserveDpopProof({ replayKey: `key-${index}`, expiresAt: start + 800 }),
        ),
      );
      const winners = results.flatMap((result, index) =>
        result.status === 'fulfilled' && result.value ? [`key-${index}`] : [],
      );
      expect(winners).toHaveLength(4);
      for (const result of results)
        if (result.status === 'rejected') expect(result.reason).toBeInstanceOf(OidcVaultDpopReplayCapacityError);
      for (const replayKey of winners)
        expect(await clients[1].reserveDpopProof({ replayKey, expiresAt: start + 60_000 })).toBe(false);
      await expect(
        clients[0].reserveDpopProof({ replayKey: 'full', expiresAt: start + 60_000 }),
      ).rejects.toBeInstanceOf(OidcVaultDpopReplayCapacityError);
      await waitForServerExpiry(start + 800);
      for (const replayKey of winners)
        expect(await clients[1].reserveDpopProof({ replayKey, expiresAt: (await serverNow()) + 60_000 })).toBe(true);
      expect(await harness.client.zCard(`${prefix}:dpop-proofs`)).toBe(4);
    });
  });

  it('replay duplicates have one winner across independent clients with no target/session-based key partition', async () => {
    await run('replay-race', async (prefix) => {
      const clients = stores(prefix);
      const start = await serverNow();
      const results = await Promise.all(
        Array.from({ length: 24 }, (_, index) =>
          clients[index % 2]!.reserveDpopProof({ replayKey: 'opaque-shared-key', expiresAt: start + 60_000 }),
        ),
      );
      expect(results.filter(Boolean)).toHaveLength(1);
      expect(await peer.zCard(`${prefix}:dpop-proofs`)).toBe(1);
    });
  });

  it('server time controls replay admission even with a skewed application clock; invalid windows allocate nothing', async () => {
    await run('replay-time', async (prefix) => {
      const store = createRedisOidcVaultStore({
        client: peer,
        keyPrefix: prefix,
        dpopReplayMaxEntries: 1,
        now: () => 1,
      });
      const start = await serverNow();
      for (const expiresAt of [start - 1, NaN, Infinity, start + 0.5, Number.MAX_SAFE_INTEGER + 1, start + 400_000]) {
        expect(await store.reserveDpopProof({ replayKey: 'invalid', expiresAt })).toBe(false);
      }
      expect(await peer.exists(`${prefix}:dpop-proofs`)).toBe(0);
      expect(await store.reserveDpopProof({ replayKey: 'valid', expiresAt: start + 60_000 })).toBe(true);
    });
  });

  it('one Lua admission does at most 64 expired-row cleanup and never evicts live entries', async () => {
    await run('replay-bounded-cleanup', async (prefix) => {
      const [store] = stores(prefix, 256);
      const start = await serverNow();
      const key = `${prefix}:dpop-proofs`;
      await peer.zAdd(
        key,
        Array.from({ length: 255 }, (_, index) => ({ score: start - 1, value: `expired-${index}` })),
      );
      await peer.zAdd(key, { score: start + 60_000, value: 'retained-live' });
      expect(await store.reserveDpopProof({ replayKey: 'new-live', expiresAt: start + 60_000 })).toBe(true);
      expect(await peer.zCard(key)).toBe(193);
      expect(await peer.zScore(key, 'retained-live')).toBe(start + 60_000);
      expect(await peer.pTTL(key)).toBeGreaterThan(0);
      expect(await store.reserveDpopProof({ replayKey: 'retained-live', expiresAt: start + 120_000 })).toBe(false);
      expect(await peer.zCard(key)).toBe(193);
    });
  });

  it('replay failures and NOSCRIPT retries never admit without shared state or duplicate a committed admission', async () => {
    await run('replay-errors', async (prefix) => {
      const [store] = stores(prefix);
      const start = await serverNow();
      await peer.set(`${prefix}:dpop-proofs`, 'wrong-type');
      await expect(store.reserveDpopProof({ replayKey: 'key', expiresAt: start + 60_000 })).rejects.toThrow(
        'unexpected type',
      );
      await peer.del(`${prefix}:dpop-proofs`);
      // Cache flush is confined to this disposable harness.
      await peer.sendCommand(['SCRIPT', 'FLUSH']);
      expect(await store.reserveDpopProof({ replayKey: 'key', expiresAt: start + 60_000 })).toBe(true);
      expect(await store.reserveDpopProof({ replayKey: 'key', expiresAt: start + 60_000 })).toBe(false);
      expect(await peer.zCard(`${prefix}:dpop-proofs`)).toBe(1);
      const raw = harness.client;
      const error = new Error('private transport diagnostic');
      const failing = createRedisOidcVaultStore({
        keyPrefix: prefix,
        client: {
          set: raw.set.bind(raw),
          get: raw.get.bind(raw),
          del: raw.del.bind(raw),
          sendCommand: async (args) => {
            if (args[0] === 'EVALSHA' && args[1] === digest(RESERVE_DPOP_PROOF_SCRIPT)) throw error;
            return raw.sendCommand(args);
          },
        } as OidcVaultRedisClient,
      });
      await expect(failing.reserveDpopProof({ replayKey: 'failure', expiresAt: start + 60_000 })).rejects.toBe(error);
      expect(await peer.zScore(`${prefix}:dpop-proofs`, 'failure')).toBeNull();
    });
  });
});
