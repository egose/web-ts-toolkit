/**
 * ATT-04 live Redis lane (requires Docker; absence blocks, never skip-passes).
 *
 * Disposable `redis:6.2-alpine` + `redis:7.2-alpine` via `test/redis-harness.ts`
 * (no production `REDIS_URL`), randomized isolated prefixes, two independent
 * clients per prefix, and per-test cleanup.
 *
 * - The shared `test/store-conformance.ts` suite runs against live Redis for
 *   memory/live parity. Live `setNow` advances real server time via blocking
 *   waits (10s/2s/5s) so duplicate-extension, expired-reuse, and bounded
 *   cleanup behave per server `TIME`; an invalid clock is rejected by a thin
 *   wrapper without touching Redis (server `TIME` is always valid).
 * - Live-specific tests verify single-ledger atomicity across independent
 *   clients (exactly-one winner), retention through the whole deadline,
 *   ledger `PEXPIREAT` reclaim, shared capacity with duplicate precedence,
 *   at-most-64 cleanup, cold `NOSCRIPT` reload, wrong-type failures, injected
 *   uncertainty (no retry, no fallback), and ATT-02 HTTP replay integration
 *   over two middleware instances sharing one prefix.
 */

import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from 'redis';
import express from 'express';
import type { AddressInfo } from 'node:net';

import {
  AttestationCapacityError,
  AttestationProtocolError,
  buildMacInputBytes,
  createAttestationBodyCapture,
  createRedisAttestationStore,
  createRequestAttestationMiddleware,
  encodeTransactionId,
  GLOBAL_MAX_RETENTION_MS,
} from '../src/index.js';
import { AttestationRedisStoreError } from '../src/stores/redis.js';
import { RESERVE_ATTESTATION_SCRIPT } from '../src/stores/redis-script.js';
import { defineAttestationStoreConformanceSuite } from './store-conformance.js';
import { createRedisHarness, REDIS_TIMEOUT, type RedisHarness } from './redis-harness.js';

const digest = (script: string): string => createHash('sha1').update(script).digest('hex');
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe.each(['redis:6.2-alpine', 'redis:7.2-alpine'])('ATT-04 live attestation replay on %s', (image) => {
  let harness: RedisHarness;
  let peer: ReturnType<typeof createClient>;
  const conformancePrefixes = new Set<string>();

  beforeAll(async () => {
    harness = await createRedisHarness(image);
    peer = createClient({ url: harness.url });
    await peer.connect();
  }, REDIS_TIMEOUT);

  afterAll(async () => {
    for (const prefix of conformancePrefixes) {
      try {
        await harness.deleteKeysByPrefix(prefix);
      } catch {
        // Best-effort cleanup of disposable containers.
      }
    }
    if (peer?.isOpen) {
      await peer.quit();
    }
    await harness?.stop();
  }, REDIS_TIMEOUT);

  const serverNow = async (): Promise<number> => {
    const time = (await harness.client.sendCommand(['TIME'])) as unknown as [string, string];
    return Number(time[0]) * 1000 + Math.floor(Number(time[1]) / 1000);
  };

  const waitForServerExpiry = async (expiresAt: number): Promise<void> => {
    const deadline = performance.now() + 15_000;
    while ((await serverNow()) <= expiresAt) {
      if (performance.now() > deadline) {
        throw new Error('Timed out waiting for disposable Redis server expiry.');
      }
      await sleep(25);
    }
  };

  const run = async (name: string, test: (prefix: string) => Promise<void>): Promise<void> => {
    const prefix = harness.createKeyPrefix(name);
    try {
      await test(prefix);
    } finally {
      await harness.deleteKeysByPrefix(prefix);
    }
  };

  const stores = (keyPrefix: string, maxEntries = 4) =>
    [
      createRedisAttestationStore({ client: harness.client, keyPrefix, maxEntries }),
      createRedisAttestationStore({ client: peer, keyPrefix, maxEntries }),
    ] as const;

  // -- Shared conformance against live Redis (memory/live parity). ---------
  // Live time travel blocks real server time; invalid clocks are rejected by
  // the wrapper without allocation (server TIME itself never degrades).
  defineAttestationStoreConformanceSuite('redis-live', async (testName, options) => {
    const prefix = harness.createKeyPrefix(`conformance-${testName}`);
    conformancePrefixes.add(prefix);
    const raw = createRedisAttestationStore({
      client: harness.client,
      keyPrefix: prefix,
      ...(options?.maxEntries === undefined ? {} : { maxEntries: options.maxEntries }),
    });
    const serverStart = await serverNow();
    const clientStart = Date.now();
    const offset = serverStart - clientStart;
    let invalid = false;
    const store = {
      reserve: async (input: { replayKey: string; retainUntilMs: number }) => {
        if (invalid) {
          throw new AttestationProtocolError('attestation store clock must return a non-negative safe integer');
        }
        return raw.reserve(input);
      },
    };
    return {
      store,
      getNow: () => (invalid ? Number.NaN : Date.now() + offset),
      setNow: (next: number) => {
        if (typeof next !== 'number' || !Number.isSafeInteger(next) || next < 0) {
          invalid = true;
          return;
        }
        invalid = false;
        const delay = next - (Date.now() + offset);
        if (delay > 0 && Number.isFinite(delay)) {
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delay);
        }
      },
    };
  });

  it.each([null, 0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid capacity %s at construction',
    (max) => {
      expect(() => createRedisAttestationStore({ client: harness.client, maxEntries: max as number })).toThrow(
        'positive safe integer',
      );
    },
  );

  it('owns supplied store limits despite mutation of the caller options object', async () => {
    await run('options-snapshot', async (prefix) => {
      const options = { client: harness.client, keyPrefix: prefix, maxEntries: 1 };
      const store = createRedisAttestationStore(options);
      options.maxEntries = 100_000;
      const expiry = (await serverNow()) + 60_000;
      expect(await store.reserve({ replayKey: 'att:v1:one', retainUntilMs: expiry })).toBe('reserved');
      await expect(store.reserve({ replayKey: 'att:v1:two', retainUntilMs: expiry })).rejects.toBeInstanceOf(
        AttestationCapacityError,
      );
    });
  });

  it('independent clients sharing one prefix have exactly one winner (simultaneous identical)', async () => {
    await run('race', async (prefix) => {
      const clients = stores(prefix, 50_000);
      const start = await serverNow();
      const results = await Promise.all(
        Array.from({ length: 24 }, (_, index) =>
          clients[index % 2]!.reserve({ replayKey: 'att:v1:opaque-shared', retainUntilMs: start + 60_000 }),
        ),
      );
      expect(results.filter((result) => result === 'reserved')).toHaveLength(1);
      expect(results.filter((result) => result === 'duplicate')).toHaveLength(23);
      expect(await peer.zCard(`${prefix}:attestation-proofs`)).toBe(1);
    });
  });

  it('shared capacity admits exactly N unique keys, duplicates win, expiry reclaims', async () => {
    await run('capacity', async (prefix) => {
      const clients = stores(prefix, 4);
      const start = await serverNow();
      const results = await Promise.allSettled(
        Array.from({ length: 16 }, (_, index) =>
          clients[index % 2]!.reserve({ replayKey: `att:v1:key-${index}`, retainUntilMs: start + 800 }),
        ),
      );
      const winners = results.flatMap((result, index) =>
        result.status === 'fulfilled' && result.value === 'reserved' ? [`att:v1:key-${index}`] : [],
      );
      expect(winners).toHaveLength(4);
      for (const result of results) {
        if (result.status === 'rejected') {
          expect(result.reason).toBeInstanceOf(AttestationCapacityError);
        }
      }
      for (const replayKey of winners) {
        expect(await clients[1]!.reserve({ replayKey, retainUntilMs: start + 60_000 })).toBe('duplicate');
      }
      await expect(
        clients[0]!.reserve({ replayKey: 'att:v1:full', retainUntilMs: start + 60_000 }),
      ).rejects.toBeInstanceOf(AttestationCapacityError);
      await waitForServerExpiry(start + 800);
      for (const replayKey of winners) {
        expect(await clients[1]!.reserve({ replayKey, retainUntilMs: (await serverNow()) + 60_000 })).toBe('reserved');
      }
      expect(await harness.client.zCard(`${prefix}:attestation-proofs`)).toBe(4);
    });
  });

  it('server time controls admission; invalid windows allocate nothing', async () => {
    await run('time', async (prefix) => {
      const [store] = stores(prefix, 4);
      const start = await serverNow();
      // Expired, malformed-shape (via live overlong/invalid returns), and
      // overlong deadlines never allocate: the ledger stays absent.
      expect(await store.reserve({ replayKey: 'att:v1:invalid', retainUntilMs: start - 1 })).toBe('expired');
      await expect(
        store.reserve({ replayKey: 'att:v1:overlong', retainUntilMs: start + 400_000 }),
      ).rejects.toBeInstanceOf(AttestationProtocolError);
      // +10s margin keeps the overlong case robust against server-TIME drift
      // between the `serverNow()` reading and Lua admission (exact CAP+1 is
      // covered deterministically by the memory exact-boundary test).
      await expect(
        store.reserve({ replayKey: 'att:v1:overlong-cap', retainUntilMs: start + GLOBAL_MAX_RETENTION_MS + 10_000 }),
      ).rejects.toBeInstanceOf(AttestationProtocolError);
      expect(await peer.exists(`${prefix}:attestation-proofs`)).toBe(0);
      expect(await store.reserve({ replayKey: 'att:v1:valid', retainUntilMs: start + 60_000 })).toBe('reserved');
      expect(GLOBAL_MAX_RETENTION_MS).toBe(240_000);
    });
  });

  it('replays near the end of validity remain rejected; expired inputs never allocate', async () => {
    await run('near-expiry', async (prefix) => {
      const [store, other] = stores(prefix, 50_000);
      const start = await serverNow();
      const replayKey = 'att:v1:near-end';
      expect(await store.reserve({ replayKey, retainUntilMs: start + 2_000 })).toBe('reserved');
      // Near the end of validity (1.5s into a 2s window) the replay is still
      // a duplicate, not a fresh admission.
      await sleep(1_500);
      expect(await other.reserve({ replayKey, retainUntilMs: start + 2_000 })).toBe('duplicate');
      // An expired-input replay against the live key reports expired and
      // leaves the live reservation untouched (still duplicate afterwards).
      const mid = await serverNow();
      expect(await other.reserve({ replayKey, retainUntilMs: mid })).toBe('expired');
      expect(await store.reserve({ replayKey, retainUntilMs: start + 2_000 })).toBe('duplicate');
      await waitForServerExpiry(start + 2_000);
      expect(await other.reserve({ replayKey, retainUntilMs: (await serverNow()) + 5_000 })).toBe('reserved');
    });
  });

  it('ledger expires after its latest score (idle state reclaimed)', async () => {
    await run('ledger-expiry', async (prefix) => {
      const [store] = stores(prefix, 50_000);
      const start = await serverNow();
      expect(await store.reserve({ replayKey: 'att:v1:ledger', retainUntilMs: start + 800 })).toBe('reserved');
      expect(await peer.pTTL(`${prefix}:attestation-proofs`)).toBeGreaterThan(0);
      await waitForServerExpiry(start + 800);
      // Idle ledger is reclaimed through its latest score; a fresh proof
      // starts from an absent key.
      expect(await peer.exists(`${prefix}:attestation-proofs`)).toBe(0);
    });
  });

  it('one Lua admission does at most 64 expired-row cleanup and never evicts live', async () => {
    await run('bounded-cleanup', async (prefix) => {
      const [store] = stores(prefix, 256);
      const start = await serverNow();
      const key = `${prefix}:attestation-proofs`;
      await peer.zAdd(
        key,
        Array.from({ length: 255 }, (_, index) => ({ score: start - 1, value: `att:v1:expired-${index}` })),
      );
      await peer.zAdd(key, { score: start + 60_000, value: 'att:v1:retained-live' });
      expect(await store.reserve({ replayKey: 'att:v1:new-live', retainUntilMs: start + 60_000 })).toBe('reserved');
      expect(await peer.zCard(key)).toBe(193);
      expect(await peer.zScore(key, 'att:v1:retained-live')).toBe(start + 60_000);
      expect(await peer.pTTL(key)).toBeGreaterThan(0);
      expect(await store.reserve({ replayKey: 'att:v1:retained-live', retainUntilMs: start + 120_000 })).toBe(
        'duplicate',
      );
      expect(await peer.zCard(key)).toBe(193);
      // Duplicates never rescore: the live score is unchanged.
      expect(await peer.zScore(key, 'att:v1:retained-live')).toBe(start + 60_000);
    });
  });

  it('failures and NOSCRIPT retries never admit without shared state', async () => {
    await run('errors', async (prefix) => {
      const [store] = stores(prefix, 50_000);
      const start = await serverNow();
      await peer.set(`${prefix}:attestation-proofs`, 'wrong-type');
      await expect(store.reserve({ replayKey: 'att:v1:key', retainUntilMs: start + 60_000 })).rejects.toBeInstanceOf(
        AttestationRedisStoreError,
      );
      await peer.del(`${prefix}:attestation-proofs`);
      await peer.sendCommand(['SCRIPT', 'FLUSH']);
      expect(await store.reserve({ replayKey: 'att:v1:key', retainUntilMs: start + 60_000 })).toBe('reserved');
      expect(await store.reserve({ replayKey: 'att:v1:key', retainUntilMs: start + 60_000 })).toBe('duplicate');
      expect(await peer.zCard(`${prefix}:attestation-proofs`)).toBe(1);
      const raw = harness.client;
      const failure = new Error('private transport diagnostic');
      const failing = createRedisAttestationStore({
        keyPrefix: prefix,
        client: {
          sendCommand: async (args: string[]) => {
            if (args[0] === 'EVALSHA' && args[1] === digest(RESERVE_ATTESTATION_SCRIPT)) {
              throw failure;
            }
            return raw.sendCommand(args);
          },
        },
      });
      await expect(
        failing.reserve({ replayKey: 'att:v1:failure', retainUntilMs: start + 60_000 }),
      ).rejects.toBeInstanceOf(AttestationRedisStoreError);
      expect(await peer.zScore(`${prefix}:attestation-proofs`, 'att:v1:failure')).toBeNull();
    });
  });

  it('ATT-02 HTTP replay integration: two instances sharing one prefix admit exactly one winner', async () => {
    const prefix = harness.createKeyPrefix('http-integration');
    try {
      const PUBLIC_ORIGIN = 'https://attestation.example.com';
      const NAMESPACE = 'att-redis-live-http';
      const KEY_ID = 'live-key-01';
      const KEY_BYTES = Uint8Array.from(
        Buffer.from('d973c35da623a2329dd08a32153635042a7fe90b730035c90508ae7ec50c0d24', 'hex'), // pragma: allowlist secret
      );
      const NOW = Date.now();
      const snapshot = {
        currentKeyId: KEY_ID,
        keys: [{ keyId: KEY_ID, key: KEY_BYTES, acceptFrom: NOW - 60_000, acceptUntil: NOW + 120_000 }],
      };
      const provider = { getSnapshot: () => snapshot };
      const firstStore = createRedisAttestationStore({ client: harness.client, keyPrefix: prefix });
      const secondStore = createRedisAttestationStore({ client: peer, keyPrefix: prefix });

      const signProof = (input: {
        timestampMs: number;
        nonceHex: string;
        method: string;
        requestTarget: string;
        contentType: string;
        bodyBytes: Uint8Array;
      }): string => {
        const bodyHashHex = createHash('sha256').update(input.bodyBytes).digest('hex');
        const macInput = buildMacInputBytes({
          replayNamespace: NAMESPACE,
          publicOrigin: PUBLIC_ORIGIN,
          keyId: KEY_ID,
          timestampMs: input.timestampMs,
          nonceHex: input.nonceHex,
          method: input.method,
          requestTarget: input.requestTarget,
          contentType: input.contentType,
          bodyHashHex,
        });
        const mac = createHmac('sha256', Buffer.from(KEY_BYTES)).update(macInput).digest('base64url');
        return encodeTransactionId({
          keyId: KEY_ID,
          timestampMs: input.timestampMs,
          nonceHex: input.nonceHex,
          mac,
        });
      };

      const startApp = async (
        store: ReturnType<typeof createRedisAttestationStore>,
      ): Promise<{ baseUrl: string; close: () => Promise<void>; handlerCalls: () => number }> => {
        const capture = createAttestationBodyCapture({ maxBodyBytes: 1024 * 1024 });
        const guard = createRequestAttestationMiddleware({
          publicOrigin: PUBLIC_ORIGIN,
          replayNamespace: NAMESPACE,
          keyProvider: provider,
          store,
          now: () => Date.now(),
        });
        let handlerCalls = 0;
        const app = express();
        app.use(express.json({ limit: 1024 * 1024, verify: capture.verify as never, inflate: false }));
        app.use(capture.errorHandler as never);
        app.use('/api', guard as never);
        app.post('/api/submit', (_req, res) => {
          handlerCalls += 1;
          res.json({ ok: true });
        });
        const server = app.listen(0, '127.0.0.1');
        await new Promise<void>((resolve) => server.on('listening', () => resolve()));
        const address = server.address() as AddressInfo;
        return {
          baseUrl: `http://127.0.0.1:${address.port}`,
          close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
          handlerCalls: () => handlerCalls,
        };
      };

      const first = await startApp(firstStore);
      const second = await startApp(secondStore);
      try {
        const raw = JSON.stringify({ live: 1 });
        const header = signProof({
          timestampMs: Date.now() - 2_000,
          nonceHex: randomBytes(16).toString('hex'),
          method: 'POST',
          requestTarget: '/api/submit',
          contentType: 'application/json',
          bodyBytes: Buffer.from(raw, 'utf8'),
        });
        const send = (baseUrl: string) =>
          fetch(`${baseUrl}/api/submit`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-client-transaction-id': header },
            body: raw,
          });
        const [a, b] = await Promise.all([send(first.baseUrl), send(second.baseUrl)]);
        expect([a.status, b.status].sort()).toEqual([200, 403]);
        expect(first.handlerCalls() + second.handlerCalls()).toBe(1);
        expect(randomUUID().length).toBeGreaterThan(0);
      } finally {
        await first.close();
        await second.close();
      }
    } finally {
      await harness.deleteKeysByPrefix(prefix);
    }
  });
});
