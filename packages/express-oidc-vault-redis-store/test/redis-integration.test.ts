import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createRedisOidcVaultStore, type OidcVaultRedisClient } from '../src/index';
import { createRedisHarness, REDIS_TIMEOUT, type RedisHarness } from './redis-harness';

const REDIS_IMAGES = ['redis:6.2-alpine', 'redis:7.2-alpine'] as const;

const createStore = (harness: RedisHarness, keyPrefix: string, now: () => number) =>
  createRedisOidcVaultStore({
    client: harness.client as unknown as OidcVaultRedisClient,
    keyPrefix,
    now,
  });

const sleep = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));

const scanKeys = async (client: RedisHarness['client'], pattern: string): Promise<string[]> => {
  let cursor = '0';
  const keys: string[] = [];

  do {
    const response = await client.sendCommand(['SCAN', cursor, 'MATCH', pattern, 'COUNT', '100']);

    if (!Array.isArray(response) || typeof response[0] !== 'string' || !Array.isArray(response[1])) {
      throw new Error('Unexpected Redis SCAN response.');
    }

    cursor = response[0];
    keys.push(...response[1].filter((key): key is string => typeof key === 'string'));
  } while (cursor !== '0');

  return keys;
};

describe.each(REDIS_IMAGES)('createRedisOidcVaultStore integration on %s', (image) => {
  let harness: RedisHarness | undefined;

  beforeAll(async () => {
    harness = await createRedisHarness(image);
  }, REDIS_TIMEOUT);

  afterAll(async () => {
    await harness?.stop();
  }, REDIS_TIMEOUT);

  it('creates, reads, rotates, and deletes sessions through real Redis scripts', async (context) => {
    expect(harness).toBeDefined();
    if (!harness) {
      throw new Error('Redis harness not initialized.');
    }
    const keyPrefix = harness.createKeyPrefix(context.task.name);
    let now = Date.now();
    const store = createStore(harness, keyPrefix, () => now);

    try {
      const created = await store.createSession({
        sessionId: 'sess_1',
        subject: 'user_1',
        providerSessionId: 'provider_sid_1',
        provider: {
          issuer: 'https://issuer.example.com',
          clientId: 'client_1',
        },
        refreshToken: 'refresh_1',
        idToken: 'id_1',
      });

      expect(await store.getSession('sess_1')).toMatchObject({ sessionId: 'sess_1', subject: 'user_1' });

      now += 1;
      const rotated = await store.rotateSession({
        sessionId: 'sess_1',
        nextSession: {
          ...created,
          sessionId: 'sess_2',
          refreshToken: 'refresh_2',
          idToken: 'id_2',
          updatedAt: now,
        },
      });

      expect(rotated).toMatchObject({ sessionId: 'sess_2', refreshToken: 'refresh_2' });
      expect(await store.getSession('sess_1')).toBeNull();
      expect(await store.getSession('sess_2')).toMatchObject({ sessionId: 'sess_2' });

      await store.deleteSession('sess_2');
      expect(await store.getSession('sess_2')).toBeNull();
    } finally {
      await harness.deleteKeysByPrefix(keyPrefix);
    }
  });

  it('deletes sessions by subject, provider-session, and logical-session indexes', async (context) => {
    expect(harness).toBeDefined();
    if (!harness) {
      throw new Error('Redis harness not initialized.');
    }
    const keyPrefix = harness.createKeyPrefix(context.task.name);
    const store = createStore(harness, keyPrefix, Date.now);

    try {
      await store.createSession({
        sessionId: 'sess_provider',
        subject: 'user_provider',
        providerSessionId: 'provider_sid_1',
        provider: {
          issuer: 'https://issuer.example.com',
          clientId: 'client_1',
        },
        refreshToken: 'refresh_provider',
        idToken: 'id_provider',
      });
      await store.createSession({
        sessionId: 'sess_subject',
        subject: 'user_subject',
        refreshToken: 'refresh_subject',
        idToken: 'id_subject',
      });
      await store.createSession({
        sessionId: 'sess_logical',
        logicalSessionId: 'logical_1',
        subject: 'user_logical',
        refreshToken: 'refresh_logical',
        idToken: 'id_logical',
      });

      expect(
        await store.deleteSessionsByProviderSessionId({
          providerSessionId: 'provider_sid_1',
          issuer: 'https://other-issuer.example.com',
        }),
      ).toBe(0);
      expect(await store.deleteSessionsByProviderSessionId('provider_sid_1')).toBe(1);
      expect(await store.getSession('sess_provider')).toBeNull();

      expect(await store.deleteSessionsBySubject('user_subject')).toBe(1);
      expect(await store.getSession('sess_subject')).toBeNull();

      expect(await store.deleteSessionsByLogicalSessionId('logical_1')).toBe(1);
      expect(await store.getSession('sess_logical')).toBeNull();
    } finally {
      await harness.deleteKeysByPrefix(keyPrefix);
    }
  });

  it('enforces session ID uniqueness and ignores stale subject/provider indexes', async (context) => {
    expect(harness).toBeDefined();
    if (!harness) {
      throw new Error('Redis harness not initialized.');
    }
    const keyPrefix = harness.createKeyPrefix(context.task.name);
    const store = createStore(harness, keyPrefix, Date.now);

    try {
      await store.createSession({
        sessionId: 'sess_1',
        logicalSessionId: 'logical_1',
        subject: 'user_1',
        providerSessionId: 'provider_sid_1',
        refreshToken: 'refresh_1',
        idToken: 'id_1',
      });

      await expect(
        store.createSession({
          sessionId: 'sess_1',
          logicalSessionId: 'logical_2',
          subject: 'user_2',
          providerSessionId: 'provider_sid_2',
          refreshToken: 'refresh_2',
          idToken: 'id_2',
        }),
      ).rejects.toThrow('already exists');

      expect(await store.getSession('sess_1')).toMatchObject({
        logicalSessionId: 'logical_1',
        subject: 'user_1',
        providerSessionId: 'provider_sid_1',
        refreshToken: 'refresh_1',
      });

      await harness.client.sendCommand(['ZADD', `${keyPrefix}:subject:user_stale`, '100', 'sess_1']);
      await harness.client.sendCommand(['ZADD', `${keyPrefix}:provider-session:provider_sid_stale`, '100', 'sess_1']);

      expect(await store.deleteSessionsBySubject('user_stale')).toBe(0);
      expect(await store.deleteSessionsByProviderSessionId('provider_sid_stale')).toBe(0);
      expect(await store.getSession('sess_1')).toMatchObject({ sessionId: 'sess_1' });
    } finally {
      await harness.deleteKeysByPrefix(keyPrefix);
    }
  });

  it('repairs corrupt indexed members and continues revocation without leaking tokens', async (context) => {
    expect(harness).toBeDefined();
    if (!harness) {
      throw new Error('Redis harness not initialized.');
    }
    const keyPrefix = harness.createKeyPrefix(context.task.name);
    const store = createStore(harness, keyPrefix, Date.now);

    try {
      await store.createSession({
        sessionId: 'sess_valid',
        subject: 'user_1',
        refreshToken: 'refresh_valid_secret',
        idToken: 'id_valid_secret',
      });
      await harness.client.set(
        `${keyPrefix}:session:sess_corrupt`,
        '{"sessionId":"sess_corrupt","refreshToken":"refresh_corrupt_secret"',
      );
      await harness.client.sendCommand(['ZADD', `${keyPrefix}:subject:user_1`, '-1', 'sess_corrupt']);

      await expect(store.deleteSessionsBySubject('user_1')).resolves.toBe(1);
      expect(await store.getSession('sess_valid')).toBeNull();
      expect(await store.getSession('sess_corrupt')).toBeNull();
    } finally {
      await harness.deleteKeysByPrefix(keyPrefix);
    }
  });

  it('preflights wrong-type keys before mutation scripts write', async (context) => {
    expect(harness).toBeDefined();
    if (!harness) {
      throw new Error('Redis harness not initialized.');
    }
    const keyPrefix = harness.createKeyPrefix(context.task.name);
    const store = createStore(harness, keyPrefix, Date.now);

    try {
      await harness.client.set(`${keyPrefix}:subject:user_wrong_write`, 'not-a-zset');
      await expect(
        store.createSession({
          sessionId: 'sess_write',
          subject: 'user_wrong_write',
          refreshToken: 'refresh_write_secret',
          idToken: 'id_write_secret',
        }),
      ).rejects.toThrow('unexpected type');
      expect(await store.getSession('sess_write')).toBeNull();

      const source = await store.createSession({
        sessionId: 'sess_delete',
        subject: 'user_delete',
        refreshToken: 'refresh_delete_secret',
        idToken: 'id_delete_secret',
      });
      await harness.client.del(`${keyPrefix}:subject:user_delete`);
      await harness.client.set(`${keyPrefix}:subject:user_delete`, 'not-a-zset');

      await expect(store.deleteSession('sess_delete')).rejects.toThrow('unexpected type');
      expect(await store.getSession('sess_delete')).toEqual(source);
    } finally {
      await harness.deleteKeysByPrefix(keyPrefix);
    }
  });

  it('bounds expired revocation index keys during session churn', async (context) => {
    expect(harness).toBeDefined();
    if (!harness) {
      throw new Error('Redis harness not initialized.');
    }
    const keyPrefix = harness.createKeyPrefix(context.task.name);
    const store = createStore(harness, keyPrefix, Date.now);

    try {
      const expiresAt = Date.now() + 100;

      for (let index = 0; index < 20; index += 1) {
        await store.createSession({
          sessionId: `sess_${index}`,
          logicalSessionId: `logical_${index}`,
          subject: `user_${index}`,
          providerSessionId: `provider_sid_${index}`,
          refreshToken: `refresh_${index}`,
          idToken: `id_${index}`,
          expiresAt,
        });
      }

      await sleep(250);
      expect(await store.getSession('sess_0')).toBeNull();

      await store.createSession({
        sessionId: 'sess_active',
        logicalSessionId: 'logical_active',
        subject: 'user_active',
        providerSessionId: 'provider_sid_active',
        refreshToken: 'refresh_active',
        idToken: 'id_active',
        expiresAt: Date.now() + 60_000,
      });

      expect(await scanKeys(harness.client, `${keyPrefix}:subject:*`)).toHaveLength(1);
      expect(await scanKeys(harness.client, `${keyPrefix}:provider-session:*`)).toHaveLength(1);
      expect(await scanKeys(harness.client, `${keyPrefix}:logical-session:*`)).toHaveLength(1);
    } finally {
      await harness.deleteKeysByPrefix(keyPrefix);
    }
  });

  it('cleans rotated alias records and reverse indexes through real Redis scripts', async (context) => {
    expect(harness).toBeDefined();
    if (!harness) {
      throw new Error('Redis harness not initialized.');
    }
    const keyPrefix = harness.createKeyPrefix(context.task.name);
    let now = Date.now();
    const store = createStore(harness, keyPrefix, () => now);

    try {
      const created = await store.createSession({
        sessionId: 'sess_1',
        logicalSessionId: 'logical_1',
        subject: 'user_1',
        refreshToken: 'refresh_1',
        idToken: 'id_1',
      });

      now += 1;
      const rotated = await store.rotateSession({
        sessionId: 'sess_1',
        nextSession: { ...created, sessionId: 'sess_2', refreshToken: 'refresh_2', updatedAt: now },
      });

      now += 1;
      await store.rotateSession({
        sessionId: 'sess_2',
        nextSession: { ...rotated, sessionId: 'sess_3', refreshToken: 'refresh_3', updatedAt: now },
      });

      expect(await harness.client.get(`${keyPrefix}:rotated-session-alias:sess_1`)).toBe(JSON.stringify('logical_1'));
      expect(await harness.client.get(`${keyPrefix}:rotated-session-alias:sess_2`)).toBe(JSON.stringify('logical_1'));

      await store.deleteSession('sess_1');

      expect(await store.getSession('sess_3')).toBeNull();
      expect(await scanKeys(harness.client, `${keyPrefix}:rotated-session-alias:*`)).toHaveLength(0);
      expect(await scanKeys(harness.client, `${keyPrefix}:rotated-session-alias-index:*`)).toHaveLength(0);
    } finally {
      await harness.deleteKeysByPrefix(keyPrefix);
    }
  });

  it('detaches stale alias ownership when a rotated session ID is reused in real Redis', async (context) => {
    expect(harness).toBeDefined();
    if (!harness) {
      throw new Error('Redis harness not initialized.');
    }
    const keyPrefix = harness.createKeyPrefix(context.task.name);
    let now = Date.now();
    const store = createStore(harness, keyPrefix, () => now);

    try {
      const created = await store.createSession({
        sessionId: 'sess_1',
        logicalSessionId: 'logical_old',
        subject: 'user_old',
        refreshToken: 'refresh_1',
        idToken: 'id_1',
      });

      now += 1;
      await store.rotateSession({
        sessionId: 'sess_1',
        nextSession: { ...created, sessionId: 'sess_2', refreshToken: 'refresh_2', updatedAt: now },
      });

      await store.createSession({
        sessionId: 'sess_1',
        logicalSessionId: 'logical_new',
        subject: 'user_new',
        refreshToken: 'refresh_new',
        idToken: 'id_new',
      });

      expect(await harness.client.get(`${keyPrefix}:rotated-session-alias:sess_1`)).toBeNull();
      expect(
        await harness.client.sendCommand(['ZRANGE', `${keyPrefix}:rotated-session-alias-index:logical_old`, '0', '-1']),
      ).toEqual([]);

      await store.deleteSession('sess_1');

      expect(await store.getSession('sess_1')).toBeNull();
      expect(await store.getSession('sess_2')).toMatchObject({ logicalSessionId: 'logical_old' });
    } finally {
      await harness.deleteKeysByPrefix(keyPrefix);
    }
  });

  it('rejects same-ID rotation and occupied target rotation without changing records', async (context) => {
    expect(harness).toBeDefined();
    if (!harness) {
      throw new Error('Redis harness not initialized.');
    }
    const keyPrefix = harness.createKeyPrefix(context.task.name);
    let now = Date.now();
    const store = createStore(harness, keyPrefix, () => now);

    try {
      const source = await store.createSession({
        sessionId: 'sess_1',
        subject: 'user_1',
        refreshToken: 'refresh_1',
        idToken: 'id_1',
      });
      const target = await store.createSession({
        sessionId: 'sess_2',
        subject: 'user_2',
        refreshToken: 'refresh_2',
        idToken: 'id_2',
      });

      now += 1;
      await expect(
        store.rotateSession({
          sessionId: 'sess_1',
          nextSession: { ...source, refreshToken: 'refresh_same_id', updatedAt: now },
        }),
      ).rejects.toThrow('different session ID');
      expect(await store.getSession('sess_1')).toEqual(source);

      await expect(
        store.rotateSession({
          sessionId: 'sess_1',
          nextSession: { ...source, sessionId: 'sess_2', refreshToken: 'refresh_occupied', updatedAt: now },
        }),
      ).rejects.toThrow('already exists');
      expect(await store.getSession('sess_1')).toEqual(source);
      expect(await store.getSession('sess_2')).toEqual(target);
    } finally {
      await harness.deleteKeysByPrefix(keyPrefix);
    }
  });

  it('consumes one-time records and logout JTIs exactly once under concurrent access', async (context) => {
    expect(harness).toBeDefined();
    if (!harness) {
      throw new Error('Redis harness not initialized.');
    }
    const keyPrefix = harness.createKeyPrefix(context.task.name);
    const store = createStore(harness, keyPrefix, Date.now);
    const expiresAt = Date.now() + 60_000;

    try {
      await store.createAuthorizationTransaction({
        state: 'state_1',
        nonce: 'nonce_1',
        pkceVerifier: 'verifier_1',
        codeChallenge: 'challenge_1',
        createdAt: Date.now(),
        expiresAt,
      });
      await store.createExchangeCode({
        code: 'code_1',
        sessionId: 'sess_1',
        createdAt: Date.now(),
        expiresAt,
      });

      const transactionResults = await Promise.all([
        store.consumeAuthorizationTransaction('state_1'),
        store.consumeAuthorizationTransaction('state_1'),
      ]);
      expect(transactionResults.filter(Boolean)).toHaveLength(1);

      const exchangeCodeResults = await Promise.all([
        store.consumeExchangeCode('code_1'),
        store.consumeExchangeCode('code_1'),
      ]);
      expect(exchangeCodeResults.filter(Boolean)).toHaveLength(1);

      const jtiResults = await Promise.all([
        store.consumeBackchannelLogoutTokenJti({ jti: 'logout_1', expiresAt }),
        store.consumeBackchannelLogoutTokenJti({ jti: 'logout_1', expiresAt }),
      ]);
      expect(jtiResults.filter((result) => result)).toHaveLength(1);
    } finally {
      await harness.deleteKeysByPrefix(keyPrefix);
    }
  });

  it('allows exactly one simultaneous rotation of a source session', async (context) => {
    expect(harness).toBeDefined();
    if (!harness) {
      throw new Error('Redis harness not initialized.');
    }
    const keyPrefix = harness.createKeyPrefix(context.task.name);
    let now = Date.now();
    const store = createStore(harness, keyPrefix, () => now);

    try {
      const created = await store.createSession({
        sessionId: 'sess_1',
        subject: 'user_1',
        refreshToken: 'refresh_1',
        idToken: 'id_1',
      });

      now += 1;
      const rotations = await Promise.allSettled([
        store.rotateSession({
          sessionId: 'sess_1',
          nextSession: {
            ...created,
            sessionId: 'sess_2',
            refreshToken: 'refresh_2',
            idToken: 'id_2',
            updatedAt: now,
          },
        }),
        store.rotateSession({
          sessionId: 'sess_1',
          nextSession: {
            ...created,
            sessionId: 'sess_3',
            refreshToken: 'refresh_3',
            idToken: 'id_3',
            updatedAt: now,
          },
        }),
      ]);

      const fulfilled = rotations.filter((result) => result.status === 'fulfilled');
      const rejected = rotations.filter((result) => result.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(await store.getSession('sess_1')).toBeNull();
      expect([await store.getSession('sess_2'), await store.getSession('sess_3')].filter(Boolean)).toHaveLength(1);
    } finally {
      await harness.deleteKeysByPrefix(keyPrefix);
    }
  });

  it('revokes a rotated successor when indexed deletion resumes after a stale lookup', async (context) => {
    expect(harness).toBeDefined();
    if (!harness) {
      throw new Error('Redis harness not initialized.');
    }
    const keyPrefix = harness.createKeyPrefix(context.task.name);
    let now = Date.now();
    let store = createStore(harness, keyPrefix, () => now);

    try {
      const created = await store.createSession({
        sessionId: 'sess_1',
        logicalSessionId: 'logical_1',
        subject: 'user_1',
        providerSessionId: 'provider_sid_1',
        refreshToken: 'refresh_1',
        idToken: 'id_1',
      });
      const client = harness.client as unknown as OidcVaultRedisClient;
      const get = client.get.bind(client);
      let rotated = false;
      const interleavingClient: OidcVaultRedisClient = {
        set: client.set.bind(client),
        del: client.del.bind(client),
        sendCommand: client.sendCommand.bind(client),
        get: async (key) => {
          const value = await get(key);

          if (!rotated && key === `${keyPrefix}:session:sess_1` && value) {
            rotated = true;
            now += 1;
            await store.rotateSession({
              sessionId: 'sess_1',
              nextSession: {
                ...created,
                sessionId: 'sess_2',
                refreshToken: 'refresh_2',
                updatedAt: now,
              },
            });
          }

          return value;
        },
      };
      store = createRedisOidcVaultStore({ client: interleavingClient, keyPrefix, now: () => now });

      expect(await store.deleteSessionsByProviderSessionId('provider_sid_1')).toBe(1);
      expect(await store.getSession('sess_1')).toBeNull();
      expect(await store.getSession('sess_2')).toBeNull();
    } finally {
      await harness.deleteKeysByPrefix(keyPrefix);
    }
  });

  it('caches Lua scripts with EVALSHA and recovers transparently after SCRIPT FLUSH', async (context) => {
    expect(harness).toBeDefined();
    if (!harness) {
      throw new Error('Redis harness not initialized.');
    }
    const keyPrefix = harness.createKeyPrefix(context.task.name);
    const underlyingClient = harness.client;
    const commandCounts: Record<string, number> = { EVALSHA: 0, SCRIPT: 0, EVAL: 0 };
    const recordingClient: OidcVaultRedisClient = {
      set: underlyingClient.set.bind(underlyingClient),
      get: underlyingClient.get.bind(underlyingClient),
      del: underlyingClient.del.bind(underlyingClient),
      sendCommand: async (args: string[]) => {
        const head = args[0];

        if (head === 'EVALSHA' || head === 'SCRIPT' || head === 'EVAL') {
          commandCounts[head] = (commandCounts[head] ?? 0) + 1;
        }

        return underlyingClient.sendCommand(args);
      },
    };
    const store = createRedisOidcVaultStore({ client: recordingClient, keyPrefix, now: Date.now });

    try {
      await store.createSession({
        sessionId: 'sess_1',
        subject: 'user_1',
        provider: { issuer: 'https://issuer.example.com', clientId: 'client_1' },
        refreshToken: 'refresh_1',
        idToken: 'id_1',
      });

      // The first mutation immediately uses EVALSHA. The runner computes the
      // digest locally; no SCRIPT LOAD is needed unless the node reports NOSCRIPT.
      expect(commandCounts.EVALSHA).toBeGreaterThanOrEqual(1);
      expect(commandCounts.EVAL).toBe(0);

      // A second mutation is steady-state: EVALSHA only, full Lua never sent.
      const scriptLoadsAfterSecond = commandCounts.SCRIPT;
      await store.createSession({
        sessionId: 'sess_2',
        subject: 'user_2',
        provider: { issuer: 'https://issuer.example.com', clientId: 'client_1' },
        refreshToken: 'refresh_2',
        idToken: 'id_2',
      });
      expect(commandCounts.EVALSHA).toBeGreaterThanOrEqual(2);
      expect(commandCounts.SCRIPT).toBe(scriptLoadsAfterSecond);

      // Flush the script cache on the live node, simulating failover/maintenance.
      await harness.client.sendCommand(['SCRIPT', 'FLUSH']);
      commandCounts.EVALSHA = 0;
      commandCounts.SCRIPT = 0;

      await store.createSession({
        sessionId: 'sess_3',
        subject: 'user_3',
        provider: { issuer: 'https://issuer.example.com', clientId: 'client_1' },
        refreshToken: 'refresh_3',
        idToken: 'id_3',
      });

      // The post-flush mutation hits NOSCRIPT, reloads exactly once, and retries
      // EVALSHA. The session is created successfully despite the cache miss.
      expect(commandCounts.SCRIPT).toBe(1);
      expect(commandCounts.EVALSHA).toBeGreaterThanOrEqual(1);
      expect(await store.getSession('sess_3')).toMatchObject({ sessionId: 'sess_3' });
    } finally {
      await harness.deleteKeysByPrefix(keyPrefix);
    }
  });
});
