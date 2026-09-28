import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { createClient } from 'redis';
import type { OidcVaultStoreProvider } from '@web-ts-toolkit/express-oidc-vault';

import { createRedisOidcVaultStore, type OidcVaultRedisClient } from '../src/index';
import { DELETE_SESSION_SCRIPT, NON_EXPIRING_INDEX_SCORE } from '../src/scripts';
import { createRedisHarness, REDIS_TIMEOUT, type RedisHarness } from './redis-harness';

describe.each(['redis:6.2-alpine', 'redis:7.2-alpine'])('alias cleanup on %s', (image) => {
  let harness: RedisHarness;

  beforeAll(async () => {
    harness = await createRedisHarness(image);
  }, REDIS_TIMEOUT);

  afterAll(async () => {
    await harness?.stop();
  }, REDIS_TIMEOUT);

  const revoke = async (store: OidcVaultStoreProvider, method: 'subject' | 'provider-session' | 'direct') => {
    if (method === 'direct') await store.deleteSession('matched');
    else if (method === 'subject')
      expect(await store.deleteSessionsBySubject({ subject: 'subject', issuer: 'matched' })).toBe(1);
    else
      expect(await store.deleteSessionsByProviderSessionId({ providerSessionId: 'sid', clientId: 'matched' })).toBe(1);
  };

  for (const method of ['subject', 'provider-session', 'direct'] as const) {
    for (const phase of ['before-script', 'after-script'] as const) {
      it(`${method}: preserves survivor aliases with rotation ${phase}`, async () => {
        const keyPrefix = harness.createKeyPrefix(`${method}-${phase}`);
        const writerClient = createClient({ url: harness.url });
        await writerClient.connect();
        const writer = createRedisOidcVaultStore({ client: writerClient, keyPrefix });
        const raw = harness.client;
        const digest = createHash('sha1').update(DELETE_SESSION_SCRIPT).digest('hex');
        // Warm before hooking, so after-script means a committed deletion,
        // never a NOSCRIPT response.
        await raw.sendCommand(['SCRIPT', 'LOAD', DELETE_SESSION_SCRIPT]);
        let interleaved = false;
        const source = await writer.createSession({
          sessionId: 'old',
          logicalSessionId: 'lineage',
          subject: 'subject',
          providerSessionId: 'sid',
          provider: { issuer: 'other', clientId: 'other' },
          refreshToken: 'r',
          idToken: 'i',
          expiresAt: Date.now() + 600_000,
        });
        const survivor = await writer.rotateSession({
          sessionId: 'old',
          nextSession: { ...source, sessionId: 'survivor' },
        });
        await writer.createSession({
          ...source,
          sessionId: 'matched',
          provider: { issuer: 'matched', clientId: 'matched' },
        });
        const rotate = async () => {
          interleaved = true;
          await writer.rotateSession({ sessionId: 'survivor', nextSession: { ...survivor, sessionId: 'next' } });
        };
        const deleting = createRedisOidcVaultStore({
          keyPrefix,
          client: {
            get: raw.get.bind(raw),
            set: raw.set.bind(raw),
            del: raw.del.bind(raw),
            sendCommand: async (args) => {
              const intercept = !interleaved && args[0] === 'EVALSHA' && args[1] === digest;
              if (intercept && phase === 'before-script') await rotate();
              const result = await raw.sendCommand(args);
              if (intercept && phase === 'after-script') {
                expect(result).toBe(1);
                await rotate();
              }
              return result;
            },
          },
        });
        try {
          await revoke(deleting, method);
          expect(interleaved).toBe(true);
          expect(await writer.getSession('matched')).toBeNull();
          expect(await writer.getSession('next')).not.toBeNull();
          for (const id of ['old', 'survivor']) {
            expect(await raw.get(`${keyPrefix}:rotated-session-alias:${id}`)).toBe(JSON.stringify('lineage'));
          }
          await writer.deleteSession('old');
          expect(await writer.getSession('next')).toBeNull();
          expect(await raw.get(`${keyPrefix}:rotated-session-alias:survivor`)).toBeNull();
        } finally {
          await writerClient.quit();
          await harness.deleteKeysByPrefix(keyPrefix);
        }
      });
    }

    it(`${method}: revokes the matching successor after a real stale GET/MGET observation`, async () => {
      const keyPrefix = harness.createKeyPrefix(`${method}-target-rotation`);
      const writerClient = createClient({ url: harness.url });
      await writerClient.connect();
      const writer = createRedisOidcVaultStore({ client: writerClient, keyPrefix });
      const raw = harness.client;
      const source = await writer.createSession({
        sessionId: 'matched',
        logicalSessionId: 'lineage',
        subject: 'subject',
        providerSessionId: 'sid',
        provider: { issuer: 'matched', clientId: 'matched' },
        refreshToken: 'r',
        idToken: 'i',
      });
      let interleaved = false;
      const rotate = async () => {
        interleaved = true;
        await writer.rotateSession({ sessionId: 'matched', nextSession: { ...source, sessionId: 'next' } });
      };
      const deleting = createRedisOidcVaultStore({
        keyPrefix,
        client: {
          set: raw.set.bind(raw),
          del: raw.del.bind(raw),
          get: async (key) => {
            const result = await raw.get(key);
            if (!interleaved && key === `${keyPrefix}:session:matched`) {
              expect(result).not.toBeNull();
              await rotate();
            }
            return result;
          },
          sendCommand: async (args) => {
            const result = await raw.sendCommand(args);
            if (!interleaved && args[0] === 'MGET' && args.includes(`${keyPrefix}:session:matched`)) {
              expect(result).toEqual([JSON.stringify(source)]);
              await rotate();
            }
            return result;
          },
        },
      });
      try {
        await revoke(deleting, method);
        expect(interleaved).toBe(true);
        expect(await writer.getSession('next')).toBeNull();
        expect(await raw.get(`${keyPrefix}:rotated-session-alias:matched`)).toBeNull();
      } finally {
        await writerClient.quit();
        await harness.deleteKeysByPrefix(keyPrefix);
      }
    });
  }

  it('logout winning after the rotation read cannot resurrect the source or its alias', async () => {
    const keyPrefix = harness.createKeyPrefix('logout-wins');
    const raw = harness.client;
    const deleting = createRedisOidcVaultStore({ client: raw, keyPrefix });
    const source = await deleting.createSession({
      sessionId: 'source',
      subject: 'subject',
      refreshToken: 'r',
      idToken: 'i',
    });
    let interleaved = false;
    const rotating = createRedisOidcVaultStore({
      keyPrefix,
      client: {
        set: raw.set.bind(raw),
        del: raw.del.bind(raw),
        sendCommand: raw.sendCommand.bind(raw),
        get: async (key) => {
          const result = await raw.get(key);
          if (!interleaved && key === `${keyPrefix}:session:source`) {
            interleaved = true;
            expect(result).not.toBeNull();
            await deleting.deleteSession('source');
          }
          return result;
        },
      },
    });
    try {
      await expect(
        rotating.rotateSession({ sessionId: 'source', nextSession: { ...source, sessionId: 'next' } }),
      ).rejects.toThrow('no longer exists');
      expect(interleaved).toBe(true);
      expect(await deleting.getSession('next')).toBeNull();
      expect(await raw.get(`${keyPrefix}:rotated-session-alias:source`)).toBeNull();
    } finally {
      await harness.deleteKeysByPrefix(keyPrefix);
    }
  });

  it('reclaims terminated aliases despite missing, malformed, wrong-key and wrong-lineage memberships', async () => {
    const keyPrefix = harness.createKeyPrefix('stale-members');
    const raw = harness.client;
    const store = createRedisOidcVaultStore({ client: raw, keyPrefix });
    try {
      const source = await store.createSession({
        sessionId: 'old',
        logicalSessionId: 'lineage',
        subject: 's',
        refreshToken: 'r',
        idToken: 'i',
      });
      await store.rotateSession({ sessionId: 'old', nextSession: { ...source, sessionId: 'current' } });
      await raw.set(`${keyPrefix}:session:malformed`, '{');
      await raw.set(`${keyPrefix}:session:wrong-key`, JSON.stringify({ ...source, sessionId: 'victim' }));
      await store.createSession({ ...source, sessionId: 'other', logicalSessionId: 'other-lineage' });
      for (const id of ['missing', 'malformed', 'wrong-key', 'other']) {
        await raw.sendCommand(['ZADD', `${keyPrefix}:logical-session:lineage`, String(NON_EXPIRING_INDEX_SCORE), id]);
      }
      await store.deleteSession('current');
      expect(await raw.get(`${keyPrefix}:rotated-session-alias:old`)).toBeNull();
      expect(await store.getSession('other')).not.toBeNull();
    } finally {
      await harness.deleteKeysByPrefix(keyPrefix);
    }
  });

  it('alias-only logout cleans longer-lived aliases after the final primary expires', async () => {
    const keyPrefix = harness.createKeyPrefix('expired-primary');
    const raw = harness.client;
    const store = createRedisOidcVaultStore({ client: raw, keyPrefix });
    try {
      const source = await store.createSession({
        sessionId: 'old',
        logicalSessionId: 'lineage',
        subject: 's',
        refreshToken: 'r',
        idToken: 'i',
      });
      const middle = await store.rotateSession({
        sessionId: 'old',
        nextSession: { ...source, sessionId: 'middle', expiresAt: Date.now() + 600_000 },
      });
      await store.rotateSession({
        sessionId: 'middle',
        nextSession: { ...middle, sessionId: 'current', expiresAt: Date.now() - 1 },
      });
      expect(await raw.get(`${keyPrefix}:session:current`)).toBeNull();
      expect(await raw.get(`${keyPrefix}:rotated-session-alias:old`)).not.toBeNull();
      await store.deleteSession('old');
      expect(await raw.get(`${keyPrefix}:rotated-session-alias:old`)).toBeNull();
      expect(await raw.sendCommand(['EXISTS', `${keyPrefix}:rotated-session-alias-index:lineage`])).toBe(0);
    } finally {
      await harness.deleteKeysByPrefix(keyPrefix);
    }
  });

  it('measures commands for a fixed warmed 12-lineage scoped logout', async () => {
    const keyPrefix = harness.createKeyPrefix('command-count');
    const raw = harness.client;
    const commands: string[] = [];
    const client: OidcVaultRedisClient = {
      get: async (key) => {
        commands.push('GET');
        return raw.get(key);
      },
      set: async (...args) => {
        commands.push('SET');
        return raw.set(...args);
      },
      del: async (keys) => {
        commands.push('DEL');
        return raw.del(keys);
      },
      sendCommand: async (args) => {
        commands.push(args[0]!);
        return raw.sendCommand(args);
      },
    };
    const store = createRedisOidcVaultStore({ client, keyPrefix });
    try {
      // Warm the exact mutation script before counting; setup/verification and
      // SCRIPT LOAD misses are excluded from this steady-state workload.
      await store.createSession({ sessionId: 'warm', subject: 'warm', refreshToken: 'r', idToken: 'i' });
      await store.deleteSession('warm');
      for (let index = 0; index < 12; index += 1) {
        const source = await store.createSession({
          sessionId: `old_${index}`,
          logicalSessionId: `lineage_${index}`,
          subject: 'subject',
          providerSessionId: 'sid',
          refreshToken: 'r',
          idToken: 'i',
          expiresAt: Date.now() + 600_000,
        });
        await store.rotateSession({
          sessionId: source.sessionId,
          nextSession: { ...source, sessionId: `new_${index}` },
        });
      }
      commands.length = 0;
      expect(await store.deleteSessionsBySubject('subject')).toBe(12);
      const counts = Object.fromEntries(
        [...new Set(commands)].map((name) => [name, commands.filter((command) => command === name).length]),
      );
      console.info('STB-05 command measurement', image, JSON.stringify({ total: commands.length, counts }));
      expect({ total: commands.length, counts }).toEqual({
        total: 16,
        counts: { TIME: 1, ZREMRANGEBYSCORE: 1, ZSCAN: 1, MGET: 1, EVALSHA: 12 },
      });
      expect(commands.filter((name) => name === 'EVALSHA')).toHaveLength(12);
      expect(commands).not.toContain('SCRIPT');
      for (let index = 0; index < 12; index += 1) {
        expect(await raw.get(`${keyPrefix}:session:new_${index}`)).toBeNull();
        expect(await raw.get(`${keyPrefix}:rotated-session-alias:old_${index}`)).toBeNull();
      }
    } finally {
      await harness.deleteKeysByPrefix(keyPrefix);
    }
  });
});
