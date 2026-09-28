import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRedisOidcVaultStore, type OidcVaultRedisClient } from '../src/index';
import { createRedisHarness, REDIS_TIMEOUT, type RedisHarness } from './redis-harness';

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
const sessionInput = (sessionId: string) => ({
  sessionId,
  subject: 'subject',
  providerSessionId: 'sid',
  refreshToken: 'refresh',
  idToken: 'id',
  createdAt: 100,
  updatedAt: 100,
  provider: { issuer: 'issuer', clientId: 'client', nested: [{ list: ['provider'] }] },
  user: { sub: 'subject', nested: [{ list: ['user'] }] },
  metadata: { nested: [{ list: ['metadata'] }] },
});

describe.each(['redis:6.2-alpine', 'redis:7.2-alpine'])('Redis input ownership on %s', (image) => {
  let harness: RedisHarness;
  beforeAll(async () => {
    harness = await createRedisHarness(image);
  }, REDIS_TIMEOUT);
  afterAll(async () => {
    await harness?.stop();
  }, REDIS_TIMEOUT);

  for (const operation of ['create', 'rotate'] as const) {
    for (const phase of ['source', 'persistence', 'script-retry', 'post-commit'] as const) {
      if (operation === 'create' && phase === 'source') continue;
      it(`${operation} owns nested data across a held ${phase} barrier`, async () => {
        const keyPrefix = harness.createKeyPrefix(`${operation}-${phase}`);
        const raw = harness.client;
        const base = createRedisOidcVaultStore({ client: raw, keyPrefix });
        if (operation === 'rotate') await base.createSession(sessionInput('source'));
        if (phase === 'script-retry') await raw.sendCommand(['SCRIPT', 'FLUSH']);
        const barrier = gate();
        let held = false;
        let fallback = false;
        const client: OidcVaultRedisClient = {
          set: raw.set.bind(raw),
          del: raw.del.bind(raw),
          get: async (key) => {
            const result = await raw.get(key);
            if (!held && phase === 'source') {
              held = true;
              expect(result).not.toBeNull();
              await barrier.pause();
            }
            return result;
          },
          sendCommand: async (args) => {
            if (args[0] === 'SCRIPT' && args[1] === 'LOAD') fallback = true;
            const matches =
              phase === 'persistence'
                ? args[0] === 'EVALSHA'
                : phase === 'script-retry'
                  ? args[0] === 'SCRIPT' && args[1] === 'LOAD'
                  : phase === 'post-commit' && args[0] === 'SCAN';
            if (!held && matches) {
              held = true;
              await barrier.pause();
            }
            return raw.sendCommand(args);
          },
        };
        const store = createRedisOidcVaultStore({ client, keyPrefix });
        const next = sessionInput('next');
        const expected = { ...structuredClone(next), logicalSessionId: operation === 'create' ? 'next' : 'source' };
        const input = { sessionId: 'source', nextSession: next };
        const pending = operation === 'create' ? store.createSession(next) : store.rotateSession(input);
        try {
          await barrier.entered;
          next.sessionId = 'changed';
          next.provider.issuer = 'changed';
          next.provider.nested[0]!.list.push('changed');
          next.user.nested[0]!.list.push('changed');
          next.metadata.nested[0]!.list.push('changed');
          input.sessionId = 'unrelated';
          input.nextSession = sessionInput('unrelated');
        } finally {
          barrier.release();
        }
        try {
          const result = await pending;
          expect(result).toEqual(expected);
          expect(await base.getSession('next')).toEqual(expected);
          expect(await base.getSession('changed')).toBeNull();
          if (phase === 'script-retry') expect(fallback).toBe(true);
          if (operation === 'rotate') expect(await base.getSession('source')).toBeNull();
        } finally {
          await harness.deleteKeysByPrefix(keyPrefix);
        }
      });
    }
  }

  for (const method of ['subject', 'provider-session', 'logical'] as const) {
    for (const phase of ['TIME', 'MGET'] as const) {
      it(`${method} retains its scope while ${phase} is held`, async () => {
        const keyPrefix = harness.createKeyPrefix(`${method}-${phase}`);
        const raw = harness.client;
        const base = createRedisOidcVaultStore({ client: raw, keyPrefix });
        await base.createSession({ ...sessionInput('matched'), logicalSessionId: 'lineage' });
        await base.createSession({
          ...sessionInput('other'),
          logicalSessionId: 'other',
          provider: { issuer: 'other', clientId: 'other' },
        });
        const barrier = gate();
        let held = false;
        const store = createRedisOidcVaultStore({
          keyPrefix,
          client: {
            get: raw.get.bind(raw),
            set: raw.set.bind(raw),
            del: raw.del.bind(raw),
            sendCommand: async (args) => {
              const result = await raw.sendCommand(args);
              if (!held && args[0] === phase) {
                held = true;
                await barrier.pause();
              }
              return result;
            },
          },
        });
        const subject = { subject: 'subject', issuer: 'issuer', clientId: 'client' };
        const provider = { providerSessionId: 'sid', issuer: 'issuer', clientId: 'client' };
        const logical = { logicalSessionId: 'lineage' };
        const pending =
          method === 'subject'
            ? store.deleteSessionsBySubject(subject)
            : method === 'provider-session'
              ? store.deleteSessionsByProviderSessionId(provider)
              : store.deleteSessionsByLogicalSessionId(logical);
        try {
          await barrier.entered;
          subject.issuer = provider.issuer = 'other';
          subject.clientId = provider.clientId = 'other';
          logical.logicalSessionId = 'other';
        } finally {
          barrier.release();
        }
        try {
          expect(await pending).toBe(1);
          expect(await base.getSession('matched')).toBeNull();
          expect(await base.getSession('other')).not.toBeNull();
          expect(await base.deleteSessionsBySubject({ subject: 'subject', issuer: 'other' })).toBe(1);
        } finally {
          await harness.deleteKeysByPrefix(keyPrefix);
        }
      });
    }
  }

  it('preserves native JSON serialization and native returned values without a JSON clone', async () => {
    const keyPrefix = harness.createKeyPrefix('native');
    const store = createRedisOidcVaultStore({ client: harness.client, keyPrefix });
    class CustomJson {
      toJSON() {
        return { serialized: 'custom' };
      }
    }
    const metadata = {
      date: new Date(1234),
      buffer: Buffer.from([1, 2]),
      custom: new CustomJson(),
      missing: undefined,
      nan: NaN,
      regexp: /native/i,
      map: new Map([['key', 'value']]),
    };
    try {
      const created = await store.createSession({ ...sessionInput('native'), metadata });
      const rotated = await store.rotateSession({
        sessionId: 'native',
        nextSession: { ...created, sessionId: 'next' },
      });
      for (const result of [created, rotated]) {
        expect(result.metadata!.date).toBeInstanceOf(Date);
        expect(result.metadata!.buffer).toBeInstanceOf(Buffer);
        expect(result.metadata!.custom).toBeInstanceOf(CustomJson);
        expect(result.metadata!.map).toBeInstanceOf(Map);
        expect(Object.hasOwn(result.metadata!, 'missing')).toBe(true);
      }
      expect((await store.getSession('next'))!.metadata).toEqual(JSON.parse(JSON.stringify(metadata)));
    } finally {
      await harness.deleteKeysByPrefix(keyPrefix);
    }
  });

  it('preserves serialization failures without consuming a rotation source', async () => {
    const keyPrefix = harness.createKeyPrefix('failure');
    const store = createRedisOidcVaultStore({ client: harness.client, keyPrefix });
    const source = await store.createSession(sessionInput('source'));
    try {
      for (const metadata of [
        { value: 1n },
        {
          toJSON() {
            throw new Error('serialization failed');
          },
        },
      ]) {
        await expect(
          store.rotateSession({ sessionId: 'source', nextSession: { ...source, sessionId: 'next', metadata } }),
        ).rejects.toThrow();
        expect(await store.getSession('source')).toEqual(source);
        expect(await store.getSession('next')).toBeNull();
      }
      const cycle: Record<string, unknown> = {};
      cycle.self = cycle;
      await expect(store.createSession({ ...sessionInput('cycle'), metadata: cycle })).rejects.toThrow();
      expect(await store.getSession('cycle')).toBeNull();
    } finally {
      await harness.deleteKeysByPrefix(keyPrefix);
    }
  });
});
