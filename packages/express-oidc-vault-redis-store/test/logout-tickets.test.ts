import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from 'redis';
import { OidcVaultStoreConflictError } from '@web-ts-toolkit/express-oidc-vault';
import {
  defineOidcVaultLogoutNavigationStoreConformanceSuite,
  logoutTicket,
} from '../../express-oidc-vault/test/store-provider-conformance';
import { createRedisOidcVaultStore, type OidcVaultRedisClient } from '../src';
import { LOGOUT_NAVIGATION_TICKET_SCRIPT } from '../src/logout-tickets';
import { ticketId } from '../src/logout-ticket-validation';
import { createRedisHarness, REDIS_TIMEOUT, type RedisHarness } from './redis-harness';

const digest = createHash('sha1').update(LOGOUT_NAVIGATION_TICKET_SCRIPT).digest('hex');
describe.each(['redis:6.2-alpine', 'redis:7.2-alpine'])('live logout tickets on %s', (image) => {
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
  const now = async () => {
    const value = (await peer.sendCommand(['TIME'])) as string[];
    return Number(value[0]) * 1000 + Math.floor(Number(value[1]) / 1000);
  };
  const advanceTo = async (deadline: number) => {
    const timeout = performance.now() + 10_000;
    while ((await now()) < deadline) {
      if (performance.now() > timeout) throw new Error('Disposable Redis did not reach expiry.');
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  };
  defineOidcVaultLogoutNavigationStoreConformanceSuite(`Redis ${image} independent clients`, {
    createContext: (name, options) => {
      const keyPrefix = harness.createKeyPrefix(name);
      return {
        store: createRedisOidcVaultStore({ client: harness.client, keyPrefix, ...options }),
        peerStore: createRedisOidcVaultStore({ client: peer, keyPrefix, ...options }),
        now,
        advanceTo,
        cleanup: () => harness.deleteKeysByPrefix(keyPrefix),
      };
    },
  });
  const run = async (name: string, test: (prefix: string) => Promise<void>) => {
    const prefix = harness.createKeyPrefix(name);
    try {
      await test(prefix);
    } finally {
      await harness.deleteKeysByPrefix(prefix);
    }
  };
  const keys = (prefix: string, id: ReturnType<typeof logoutTicket>) => ({
    payload: `${prefix}:logout-navigation-ticket:${ticketId(id)}`,
    ledger: `${prefix}:logout-navigation-expiries`,
    config: `${prefix}:logout-navigation-capacity`,
  });
  const wrapper = (sendCommand: OidcVaultRedisClient['sendCommand']): OidcVaultRedisClient => ({
    set: harness.client.set.bind(harness.client),
    get: harness.client.get.bind(harness.client),
    del: harness.client.del.bind(harness.client),
    sendCommand,
  });

  it.each([null, 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects capacity %s at construction',
    (max) => {
      expect(() => createRedisOidcVaultStore({ client: peer, logoutNavigationMaxEntries: max as number })).toThrow(
        'positive safe integer',
      );
    },
  );

  it('unknown consumes allocate no keys/config, default limit is shared, and mismatches fail without spending', async () => {
    await run('configuration', async (prefix) => {
      const store = createRedisOidcVaultStore({ client: harness.client, keyPrefix: prefix });
      const record = logoutTicket(await now());
      const k = keys(prefix, record);
      for (let i = 0; i < 10; i++)
        expect(await store.consumeLogoutNavigationTicket(logoutTicket(await now(), `unknown-${i}`))).toBeNull();
      expect(await peer.keys(`${prefix}:*`)).toEqual([]);
      await store.createLogoutNavigationTicket(record);
      expect(await peer.get(k.config)).toBe('10000');
      const other = createRedisOidcVaultStore({ client: peer, keyPrefix: prefix, logoutNavigationMaxEntries: 2 });
      await expect(other.consumeLogoutNavigationTicket(record)).rejects.toThrow('configuration/accounting');
      await expect(other.createLogoutNavigationTicket(logoutTicket(await now(), 'other'))).rejects.toThrow(
        'configuration/accounting',
      );
      expect(await peer.zCard(k.ledger)).toBe(1);
      expect(await store.consumeLogoutNavigationTicket(record)).toEqual(record);
      expect(await peer.exists(k.ledger)).toBe(0);
      expect(await peer.pTTL(k.config)).toBe(-1);
    });
  });

  it('uses server TIME even when injected clock throws, and payload PXAT is independent of ledger TTL', async () => {
    await run('server-time', async (prefix) => {
      const store = createRedisOidcVaultStore({
        client: peer,
        keyPrefix: prefix,
        now: () => {
          throw new Error('application clock must not run');
        },
      });
      const record = { ...logoutTicket(await now()), expiresAt: (await now()) + 1000 };
      await store.createLogoutNavigationTicket(record);
      const k = keys(prefix, record);
      expect(await peer.pTTL(k.payload)).toBeGreaterThan(0);
      expect(await peer.pTTL(k.ledger)).toBeGreaterThan(0);
      await advanceTo(record.expiresAt + 1);
      expect(await peer.get(k.payload)).toBeNull();
      expect(await peer.exists(k.ledger)).toBe(0);
      expect(await store.consumeLogoutNavigationTicket(record)).toBeNull();
      await expect(store.createLogoutNavigationTicket(record)).rejects.toBeInstanceOf(TypeError);
    });
  });

  it('cleans at most 64 unrelated expiries plus selected despite payload TTL lag, and frees early disappearance once', async () => {
    await run('bounded-cleanup', async (prefix) => {
      const store = createRedisOidcVaultStore({
        client: harness.client,
        keyPrefix: prefix,
        logoutNavigationMaxEntries: 256,
      });
      const start = await now();
      const live = logoutTicket(start, 'live');
      await store.createLogoutNavigationTicket(live);
      const k = keys(prefix, live);
      const expired = Array.from({ length: 200 }, (_, i) => ({
        ...logoutTicket(start - 2000, `${i}`),
        expiresAt: start - 1,
      }));
      for (const record of expired) {
        await peer.set(keys(prefix, record).payload, JSON.stringify(record), { PXAT: start + 60_000 });
        await peer.zAdd(k.ledger, { score: record.expiresAt, value: ticketId(record) });
      }
      expect(await store.consumeLogoutNavigationTicket(expired[199]!)).toBeNull();
      expect(await peer.zCard(k.ledger)).toBe(136);
      expect(await peer.keys(`${prefix}:logout-navigation-ticket:*`)).toHaveLength(136);
      const other = createRedisOidcVaultStore({ client: peer, keyPrefix: prefix, logoutNavigationMaxEntries: 256 });
      expect(
        await Promise.all([
          store.consumeLogoutNavigationTicket(logoutTicket(await now(), 'unknown-one')),
          other.consumeLogoutNavigationTicket(logoutTicket(await now(), 'unknown-two')),
        ]),
      ).toEqual([null, null]);
      expect(await peer.zCard(k.ledger)).toBe(8);
      expect(await store.consumeLogoutNavigationTicket(live)).toEqual(live);
      expect(await peer.zCard(k.ledger)).toBe(0);
      const gone = logoutTicket(await now(), 'gone');
      await store.createLogoutNavigationTicket(gone);
      await peer.del(keys(prefix, gone).payload);
      await expect(store.createLogoutNavigationTicket(gone)).rejects.toBeInstanceOf(OidcVaultStoreConflictError);
      expect(await store.consumeLogoutNavigationTicket(gone)).toBeNull();
      expect(await store.consumeLogoutNavigationTicket(gone)).toBeNull();
      expect(await peer.zCard(k.ledger)).toBe(0);
      await store.createLogoutNavigationTicket(logoutTicket(await now(), 'new'));
    });
  });

  it.each([
    { upstreamLogoutUrl: 'https://evil.example/#fragment' },
    { namespace: 'wrong' },
    { ticketHash: 'bad' },
    { createdAt: null },
    { expiresAt: 'invalid' },
    { extraToken: 'must-not-return' },
  ])('retires malformed selected payload atomically: %j', async (fields) => {
    await run('malformed', async (prefix) => {
      const store = createRedisOidcVaultStore({
        client: harness.client,
        keyPrefix: prefix,
        logoutNavigationMaxEntries: 1,
      });
      const record = logoutTicket(await now());
      await store.createLogoutNavigationTicket(record);
      const k = keys(prefix, record);
      await peer.set(k.payload, JSON.stringify({ ...record, ...fields }));
      expect(await store.consumeLogoutNavigationTicket(record)).toBeNull();
      expect(await peer.get(k.payload)).toBeNull();
      expect(await peer.zCard(k.ledger)).toBe(0);
      await store.createLogoutNavigationTicket(logoutTicket(await now(), 'new'));
    });
  });

  it('consuming the last live grant does not expire more than 64 remaining overdue ledger entries', async () => {
    await run('last-live-bounded', async (prefix) => {
      const store = createRedisOidcVaultStore({ client: harness.client, keyPrefix: prefix });
      const start = await now();
      const live = logoutTicket(start);
      await store.createLogoutNavigationTicket(live);
      const k = keys(prefix, live);
      await peer.zAdd(
        k.ledger,
        Array.from({ length: 130 }, (_, i) => ({
          score: start - 1,
          value: ticketId(logoutTicket(start, `expired-${i}`)),
        })),
      );
      expect(await store.consumeLogoutNavigationTicket(live)).toEqual(live);
      expect(await peer.zCard(k.ledger)).toBe(66);
      expect(await peer.pTTL(k.ledger)).toBe(-1);
      expect(await store.consumeLogoutNavigationTicket(logoutTicket(start, 'unknown'))).toBeNull();
      expect(await peer.zCard(k.ledger)).toBe(2);
    });
  });

  it.each(['payload', 'ledger', 'config'] as const)(
    'wrong-type %s errors before any ticket/accounting mutation',
    async (role) => {
      await run('wrong-type', async (prefix) => {
        const store = createRedisOidcVaultStore({ client: harness.client, keyPrefix: prefix });
        const record = logoutTicket(await now());
        await store.createLogoutNavigationTicket(record);
        const k = keys(prefix, record);
        const before = await peer.get(k.payload);
        await peer.del(k[role]);
        await peer.lPush(k[role], 'wrong-type');
        await expect(store.consumeLogoutNavigationTicket(record)).rejects.toThrow('unexpected type');
        await expect(store.createLogoutNavigationTicket(record)).rejects.toThrow('unexpected type');
        if (role !== 'payload') expect(await peer.get(k.payload)).toBe(before);
        if (role !== 'ledger') expect(await peer.zCard(k.ledger)).toBe(1);
      });
    },
  );

  it('preflights unrelated cleanup types before writes; malformed scores/members/configuration fail closed', async () => {
    for (const corruption of [
      'cleanup-type',
      'score',
      'member',
      'missing-config',
      'missing-ledger',
      'mismatched-expiry',
    ])
      await run(corruption, async (prefix) => {
        const store = createRedisOidcVaultStore({ client: harness.client, keyPrefix: prefix });
        const start = await now();
        const record = logoutTicket(start);
        await store.createLogoutNavigationTicket(record);
        const k = keys(prefix, record);
        if (corruption === 'cleanup-type') {
          const expired = logoutTicket(start, 'expired');
          await peer.zAdd(k.ledger, { score: start - 1, value: ticketId(expired) });
          await peer.lPush(keys(prefix, expired).payload, 'wrong');
        } else if (corruption === 'score') await peer.zAdd(k.ledger, { score: Infinity, value: ticketId(record) });
        else if (corruption === 'member') await peer.zAdd(k.ledger, { score: start - 1, value: 'unrelated-key' });
        else if (corruption === 'missing-config') await peer.del(k.config);
        else if (corruption === 'missing-ledger') await peer.zRem(k.ledger, ticketId(record));
        else await peer.zAdd(k.ledger, { score: record.expiresAt + 1, value: ticketId(record) });
        const before = await peer.get(k.payload);
        await expect(store.consumeLogoutNavigationTicket(record)).rejects.toThrow();
        expect(await peer.get(k.payload)).toBe(before);
      });
  });

  it('captures identity/URL before a held EVALSHA and reuses existing NOSCRIPT runner', async () => {
    await run('held-command', async (prefix) => {
      const base = createRedisOidcVaultStore({ client: peer, keyPrefix: prefix });
      const expected = logoutTicket(await now());
      let release!: () => void;
      let enter!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const entered = new Promise<void>((resolve) => {
        enter = resolve;
      });
      const store = createRedisOidcVaultStore({
        client: wrapper(async (args) => {
          if (args[0] === 'EVALSHA' && args[1] === digest) {
            enter();
            await held;
          }
          return harness.client.sendCommand(args);
        }),
        keyPrefix: prefix,
      });
      await peer.sendCommand(['SCRIPT', 'FLUSH']);
      const input = { ...expected };
      const creating = store.createLogoutNavigationTicket(input);
      await entered;
      Object.assign(input, logoutTicket(0, 'mutated', 'mutated'));
      release();
      await creating;
      expect(await base.consumeLogoutNavigationTicket(expected)).toEqual(expected);
    });
  });

  it.each(['create', 'consume'] as const)(
    '%s transport failures before and after commit never fabricate success or retry ambiguous writes',
    async (operation) => {
      for (const afterCommit of [false, true])
        await run(`failure-${operation}-${afterCommit}`, async (prefix) => {
          const base = createRedisOidcVaultStore({ client: peer, keyPrefix: prefix });
          const record = logoutTicket(await now());
          if (operation === 'consume') await base.createLogoutNavigationTicket(record);
          // Load before injection so no NOSCRIPT detour obscures the exact invocation count.
          await peer.sendCommand(['SCRIPT', 'LOAD', LOGOUT_NAVIGATION_TICKET_SCRIPT]);
          const error = new Error('private transport failure');
          let calls = 0;
          const store = createRedisOidcVaultStore({
            client: wrapper(async (args) => {
              if (args[0] === 'EVALSHA' && args[1] === digest) {
                calls++;
                if (afterCommit) await harness.client.sendCommand(args);
                throw error;
              }
              return harness.client.sendCommand(args);
            }),
            keyPrefix: prefix,
          });
          await expect(
            operation === 'create'
              ? store.createLogoutNavigationTicket(record)
              : store.consumeLogoutNavigationTicket(record),
          ).rejects.toBe(error);
          expect(calls).toBe(1);
          const committed = operation === 'create' ? afterCommit : !afterCommit;
          expect(await base.consumeLogoutNavigationTicket(record)).toEqual(committed ? record : null);
        });
    },
  );
});
