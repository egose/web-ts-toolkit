/**
 * ATT-04 Redis unit lane (no Docker): command/error paths plus fake-Redis
 * parity via the shared conformance suite.
 *
 * - Fake `TIME`-based backend with a controllable clock runs
 *   `defineAttestationStoreConformanceSuite` for memory/Redis parity without
 *   Docker (fast, deterministic).
 * - Recording mocks verify steady-state `EVALSHA`, cold `NOSCRIPT` load +
 *   single retry, no retry on uncertain timeouts, typed operational errors,
 *   exact `retainUntil` passthrough (no hidden clamp), single same-slot
 *   ledger, no `GET`/`SET` counter, and client-owned lifecycle.
 * - An HTTP integration over two middleware instances sharing one fake
 *   prefix proves exactly-one winner without Docker; the live lane repeats it
 *   against real Redis 6.2/7.2.
 */

import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { describe, expect, it, vi } from 'vitest';

import {
  AttestationCapacityError,
  AttestationProtocolError,
  buildMacInputBytes,
  createAttestationBodyCapture,
  createMemoryAttestationStore,
  createRedisAttestationStore,
  createRequestAttestationMiddleware,
  encodeTransactionId,
  GLOBAL_MAX_RETENTION_MS,
} from '../src/index.js';
import { AttestationRedisStoreError } from '../src/stores/redis.js';
import {
  buildReserveAttestationCommand,
  RedisScriptRunner,
  RESERVE_ATTESTATION_SCRIPT,
} from '../src/stores/redis-script.js';
import {
  defineAttestationStoreConformanceSuite,
  type AttestationStoreConformanceContext,
} from './store-conformance.js';

const BASE_NOW = 1_700_000_000_000;
const testKey = (name: string): string => `att:v1:unit-${name}`;

function sha1(text: string): string {
  return createHash('sha1').update(text).digest('hex');
}

// ---------------------------------------------------------------------------
// Fake TIME-based backend faithfully emulating the Lua admission (JS mirror).
// ---------------------------------------------------------------------------

class FakeAttestationRedis {
  now = BASE_NOW;
  readonly ledgers = new Map<string, Map<string, number>>();
  private readonly scriptsByDigest = new Map<string, string>();
  readonly calls: string[][] = [];

  async sendCommand(args: string[]): Promise<unknown> {
    this.calls.push([...args]);
    const [command, ...rest] = args;
    switch (command) {
      case 'TIME':
        return [String(Math.floor(this.now / 1000)), String((this.now % 1000) * 1000)];
      case 'EVALSHA': {
        const [digest, keyCountRaw, ...tail] = rest;
        if (typeof digest !== 'string' || this.scriptsByDigest.get(digest) === undefined) {
          // Cold start: behave like real Redis with an empty script cache.
          // Pre-seed via SCRIPT LOAD in most conformance paths? No — let the
          // runner reload once, exactly like production cold start.
          throw new Error('NOSCRIPT No matching script. Please use EVAL.');
        }
        return this.executeReserve(keyCountRaw as string, tail);
      }
      case 'EVAL': {
        const [, keyCountRaw, ...tail] = rest;
        return this.executeReserve(keyCountRaw as string, tail);
      }
      case 'SCRIPT': {
        const [sub, script] = rest;
        if (sub !== 'LOAD' || typeof script !== 'string') {
          throw new Error('Unsupported SCRIPT subcommand.');
        }
        const digest = sha1(script);
        this.scriptsByDigest.set(digest, script);
        return digest;
      }
      default:
        throw new Error(`Unsupported command: ${args.join(' ')}`);
    }
  }

  /** Preload the admission script so EVALSHA succeeds without a NOSCRIPT round-trip. */
  preload(): void {
    this.scriptsByDigest.set(sha1(RESERVE_ATTESTATION_SCRIPT), RESERVE_ATTESTATION_SCRIPT);
  }

  private executeReserve(keyCountRaw: string, tail: string[]): number {
    if (!Number.isSafeInteger(this.now) || this.now < 0) {
      throw new AttestationProtocolError('attestation store clock must return a non-negative safe integer');
    }
    const keyCount = Number(keyCountRaw);
    if (keyCount !== 1) {
      throw new Error('Fake expects exactly one ledger key.');
    }
    const [ledgerKey, replayKey, retainUntilRaw, maxEntriesRaw] = tail;
    const retainUntil = Number(retainUntilRaw);
    const maxEntries = Number(maxEntriesRaw);
    if (!Number.isSafeInteger(retainUntil) || retainUntil < 0 || retainUntil > Number.MAX_SAFE_INTEGER) {
      return 4;
    }
    if (!Number.isSafeInteger(maxEntries) || maxEntries <= 0) {
      return 4;
    }
    const now = this.now;
    if (retainUntil <= now) {
      return 2;
    }
    if (retainUntil - now > 240_000) {
      return 4;
    }
    let ledger = this.ledgers.get(ledgerKey as string);
    if (ledger === undefined) {
      ledger = new Map();
      this.ledgers.set(ledgerKey as string, ledger);
    }
    const existing = ledger.get(replayKey as string);
    if (existing !== undefined && existing > now) {
      return 0;
    }
    // Reclaim at most 64 expired plus the requested expired one (Lua order).
    const expired: string[] = [];
    for (const [member, score] of ledger) {
      if (score <= now) {
        expired.push(member);
        if (expired.length >= 64) {
          break;
        }
      }
    }
    for (const member of expired) {
      ledger.delete(member);
    }
    if (existing !== undefined) {
      ledger.delete(replayKey as string);
    }
    if (ledger.size >= maxEntries) {
      return 3;
    }
    ledger.set(replayKey as string, retainUntil);
    return 1;
  }
}

// Conformance parity against the fake (deterministic, no Docker).
defineAttestationStoreConformanceSuite('redis-fake', (testName, options) => {
  const fake = new FakeAttestationRedis();
  fake.now = BASE_NOW;
  // Preload so the suite measures admission, not cold-load handshakes
  // (cold NOSCRIPT is covered explicitly below).
  fake.preload();
  const keyPrefix = `wtt-unit-${testName}-${randomUUID()}`;
  const store = createRedisAttestationStore({
    client: fake,
    keyPrefix,
    ...(options?.maxEntries === undefined ? {} : { maxEntries: options.maxEntries }),
  });
  const ledgerKey = `${keyPrefix}:attestation-proofs`;
  const context: AttestationStoreConformanceContext = {
    store,
    getNow: () => fake.now,
    setNow: (next: number) => {
      fake.now = next;
    },
    debugSizes: () => {
      const size = fake.ledgers.get(ledgerKey)?.size ?? 0;
      return { stored: size, indexed: size };
    },
  };
  return context;
});

// ---------------------------------------------------------------------------
// Construction / option validation (no Redis calls).
// ---------------------------------------------------------------------------

describe('redis attestation store construction', () => {
  it.each([null, 0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, '3'])(
    'rejects invalid capacity %s at construction',
    (maxEntries) => {
      const fake = new FakeAttestationRedis();
      expect(() => createRedisAttestationStore({ client: fake, maxEntries: maxEntries as number })).toThrow(
        AttestationProtocolError,
      );
    },
  );

  it.each([null, undefined, 42, {}, [], ''])('rejects invalid client %s', (client) => {
    expect(() => createRedisAttestationStore({ client: client as never })).toThrow(AttestationProtocolError);
  });

  it('rejects clients without sendCommand', () => {
    expect(() => createRedisAttestationStore({ client: {} as never })).toThrow(AttestationProtocolError);
    expect(() => createRedisAttestationStore({ client: { sendCommand: 'x' } as never })).toThrow(
      AttestationProtocolError,
    );
  });

  it.each(['', 42, null, 'a'.repeat(257)])('rejects invalid keyPrefix %s', (keyPrefix) => {
    const fake = new FakeAttestationRedis();
    expect(() => createRedisAttestationStore({ client: fake, keyPrefix: keyPrefix as string })).toThrow(
      AttestationProtocolError,
    );
  });

  it('rejects unknown and non-object options', () => {
    const fake = new FakeAttestationRedis();
    expect(() => createRedisAttestationStore({ client: fake, unknownOption: 1 } as never)).toThrow(
      AttestationProtocolError,
    );
    expect(() => createRedisAttestationStore({ client: fake, nowSkewToleranceMs: 100 } as never)).toThrow(
      AttestationProtocolError,
    );
    expect(() => createRedisAttestationStore(null as never)).toThrow(AttestationProtocolError);
    expect(() => createRedisAttestationStore([] as never)).toThrow(AttestationProtocolError);
    expect(() => createRedisAttestationStore(undefined as never)).toThrow(AttestationProtocolError);
  });

  it('applies defaults (wtt-attestation / 50000)', async () => {
    const fake = new FakeAttestationRedis();
    fake.preload();
    const store = createRedisAttestationStore({ client: fake });
    expect(await store.reserve({ replayKey: testKey('defaults'), retainUntilMs: BASE_NOW + 10_000 })).toBe('reserved');
    // Default ledger key uses the default prefix.
    expect(fake.ledgers.has('wtt-attestation:attestation-proofs')).toBe(true);
    expect(GLOBAL_MAX_RETENTION_MS).toBe(240_000);
  });

  it('snapshots construction options; later caller mutation has no effect', async () => {
    const fake = new FakeAttestationRedis();
    fake.preload();
    fake.now = BASE_NOW;
    const options: { client: FakeAttestationRedis; keyPrefix: string; maxEntries: number } = {
      client: fake,
      keyPrefix: 'wtt-snapshot',
      maxEntries: 1,
    };
    const store = createRedisAttestationStore(options);
    options.keyPrefix = 'wtt-mutated';
    options.maxEntries = 100_000;
    expect(await store.reserve({ replayKey: testKey('snap-one'), retainUntilMs: BASE_NOW + 10_000 })).toBe('reserved');
    await expect(
      store.reserve({ replayKey: testKey('snap-two'), retainUntilMs: BASE_NOW + 10_000 }),
    ).rejects.toBeInstanceOf(AttestationCapacityError);
    // Still the original ledger, not the mutated prefix.
    expect(fake.ledgers.has('wtt-snapshot:attestation-proofs')).toBe(true);
    expect(fake.ledgers.has('wtt-mutated:attestation-proofs')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Input validation without allocation.
// ---------------------------------------------------------------------------

describe('redis attestation store input validation', () => {
  function recordingClient(handler: (args: string[]) => unknown) {
    const calls: string[][] = [];
    const client = {
      sendCommand: async (args: string[]): Promise<unknown> => {
        calls.push([...args]);
        return handler(args);
      },
    };
    return { calls, client };
  }

  it('rejects malformed replay keys without calling Redis', async () => {
    const { calls, client } = recordingClient(async () => 1);
    const store = createRedisAttestationStore({ client, keyPrefix: 'wtt-unit' });
    const badKeys: unknown[] = ['', 'a'.repeat(257), 'has\nnewline', 'non-ascii-é', null, undefined, 42, {}, []];
    for (const replayKey of badKeys) {
      await expect(
        store.reserve({ replayKey: replayKey as string, retainUntilMs: BASE_NOW + 10_000 }),
      ).rejects.toBeInstanceOf(AttestationProtocolError);
    }
    for (const badInput of [null, undefined, 'key', 42, []] as unknown[]) {
      await expect(store.reserve(badInput as never)).rejects.toBeInstanceOf(AttestationProtocolError);
    }
    expect(calls).toHaveLength(0);
  });

  it('rejects malformed deadlines without calling Redis or clamping', async () => {
    const { calls, client } = recordingClient(async () => 1);
    const store = createRedisAttestationStore({ client, keyPrefix: 'wtt-unit' });
    const badDeadlines: unknown[] = [
      undefined,
      null,
      'soon',
      Number.NaN,
      Number.POSITIVE_INFINITY,
      -1,
      10.5,
      Number.MAX_SAFE_INTEGER + 1,
    ];
    for (const retainUntilMs of badDeadlines) {
      await expect(
        store.reserve({ replayKey: testKey('bad-deadline'), retainUntilMs: retainUntilMs as number }),
      ).rejects.toBeInstanceOf(AttestationProtocolError);
    }
    expect(calls).toHaveLength(0);
  });

  it('accepts the task-text retainUntil alias with canonical precedence and no clamp', async () => {
    const { calls, client } = recordingClient(async () => 1);
    const store = createRedisAttestationStore({ client, keyPrefix: 'wtt-alias' });
    expect(await store.reserve({ replayKey: testKey('alias-only'), retainUntil: BASE_NOW + 10_000 } as never)).toBe(
      'reserved',
    );
    expect(calls[0]?.slice(-2)).toEqual([String(BASE_NOW + 10_000), '50000']);
    expect(
      await store.reserve({
        replayKey: testKey('alias-both'),
        retainUntilMs: BASE_NOW + 10_000,
        retainUntil: BASE_NOW,
      } as never),
    ).toBe('reserved');
    expect(calls[1]?.slice(-2)).toEqual([String(BASE_NOW + 10_000), '50000']);
  });

  it('isolates reserve inputs from later caller mutation', async () => {
    const { calls, client } = recordingClient(async () => 1);
    const store = createRedisAttestationStore({ client, keyPrefix: 'wtt-unit' });
    const input: { replayKey: string; retainUntilMs: number } = {
      replayKey: testKey('isolated'),
      retainUntilMs: BASE_NOW + 10_000,
    };
    const pending = store.reserve(input);
    input.replayKey = testKey('mutated-away');
    input.retainUntilMs = 0;
    await expect(pending).resolves.toBe('reserved');
    expect(calls[0]).toContain(testKey('isolated'));
    expect(calls[0]).toContain(String(BASE_NOW + 10_000));
  });
});

// ---------------------------------------------------------------------------
// Command shape: single same-slot ledger, exact passthrough, no GET/SET.
// ---------------------------------------------------------------------------

describe('redis attestation store command contract', () => {
  it('sends steady-state EVALSHA with one ledger key and exact args', async () => {
    const calls: string[][] = [];
    const client = {
      sendCommand: async (args: string[]): Promise<unknown> => {
        calls.push([...args]);
        return 1;
      },
    };
    const store = createRedisAttestationStore({ client, keyPrefix: 'wtt-unit', maxEntries: 7 });
    const retainUntilMs = BASE_NOW + 12_345;
    expect(await store.reserve({ replayKey: testKey('shape'), retainUntilMs })).toBe('reserved');
    expect(calls).toHaveLength(1);
    const [head, digest, keyCount, ledgerKey, replayKey, retainArg, maxArg] = calls[0] as string[];
    expect(head).toBe('EVALSHA');
    expect(digest).toBe(sha1(RESERVE_ATTESTATION_SCRIPT));
    expect(keyCount).toBe('1');
    expect(ledgerKey).toBe('wtt-unit:attestation-proofs');
    expect(replayKey).toBe(testKey('shape'));
    // Exact passthrough: no hidden clamp or skew adjustment.
    expect(retainArg).toBe(String(retainUntilMs));
    expect(maxArg).toBe('7');
  });

  it('builds the EVAL-form command from one typed source', () => {
    const command = buildReserveAttestationCommand('wtt-unit:attestation-proofs', 'att:v1:k', 123, 7);
    expect(command.slice(0, 3)).toEqual(['EVAL', RESERVE_ATTESTATION_SCRIPT, '1']);
    expect(command.slice(3)).toEqual(['wtt-unit:attestation-proofs', 'att:v1:k', '123', '7']);
  });

  it('uses no GET/SET/SCAN separate counter in script or commands', () => {
    expect(RESERVE_ATTESTATION_SCRIPT).toContain("redis.call('TIME')");
    expect(RESERVE_ATTESTATION_SCRIPT).toContain("redis.call('TYPE'");
    expect(RESERVE_ATTESTATION_SCRIPT).toContain("redis.call('ZSCORE'");
    expect(RESERVE_ATTESTATION_SCRIPT).toContain("redis.call('ZRANGEBYSCORE'");
    expect(RESERVE_ATTESTATION_SCRIPT).toContain("'LIMIT', 0, 64");
    expect(RESERVE_ATTESTATION_SCRIPT).toContain("redis.call('ZREM'");
    expect(RESERVE_ATTESTATION_SCRIPT).toContain("redis.call('ZCARD'");
    expect(RESERVE_ATTESTATION_SCRIPT).toContain("redis.call('ZADD'");
    expect(RESERVE_ATTESTATION_SCRIPT).toContain("redis.call('ZREVRANGE'");
    expect(RESERVE_ATTESTATION_SCRIPT).toContain("redis.call('PEXPIREAT'");
    expect(RESERVE_ATTESTATION_SCRIPT).not.toContain("redis.call('GET'");
    expect(RESERVE_ATTESTATION_SCRIPT).not.toContain("redis.call('SET'");
    expect(RESERVE_ATTESTATION_SCRIPT).not.toContain("redis.call('SCAN'");
    expect(RESERVE_ATTESTATION_SCRIPT).not.toContain('nowSkewToleranceMs');
    expect(RESERVE_ATTESTATION_SCRIPT).not.toContain('GETDEL');
    expect(RESERVE_ATTESTATION_SCRIPT).toContain('240000');
  });

  it('owns no timers', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    try {
      const fake = new FakeAttestationRedis();
      fake.preload();
      const store = createRedisAttestationStore({ client: fake, keyPrefix: 'wtt-unit' });
      expect(await store.reserve({ replayKey: testKey('untimed'), retainUntilMs: BASE_NOW + 10_000 })).toBe('reserved');
      expect(setIntervalSpy).not.toHaveBeenCalled();
    } finally {
      setIntervalSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// EVALSHA / NOSCRIPT / uncertainty.
// ---------------------------------------------------------------------------

describe('redis attestation store script loading and uncertainty', () => {
  it('cold NOSCRIPT loads once then retries EVALSHA (steady-state thereafter)', async () => {
    const calls: string[][] = [];
    let evalshaCount = 0;
    const client = {
      sendCommand: async (args: string[]): Promise<unknown> => {
        calls.push([...args]);
        if (args[0] === 'EVALSHA') {
          evalshaCount += 1;
          if (evalshaCount === 1) {
            throw new Error('NOSCRIPT No matching script. Please use EVAL.');
          }
          return 1;
        }
        if (args[0] === 'SCRIPT') {
          expect(args[1]).toBe('LOAD');
          expect(args[2]).toBe(RESERVE_ATTESTATION_SCRIPT);
          return sha1(RESERVE_ATTESTATION_SCRIPT);
        }
        throw new Error(`unexpected ${args[0]}`);
      },
    };
    const store = createRedisAttestationStore({ client, keyPrefix: 'wtt-cold' });
    expect(await store.reserve({ replayKey: testKey('cold'), retainUntilMs: BASE_NOW + 10_000 })).toBe('reserved');
    expect(calls.map((call) => call[0])).toEqual(['EVALSHA', 'SCRIPT', 'EVALSHA']);
    // Steady-state: second admission needs no reload.
    expect(await store.reserve({ replayKey: testKey('cold-2'), retainUntilMs: BASE_NOW + 10_000 })).toBe('reserved');
    expect(calls.map((call) => call[0])).toEqual(['EVALSHA', 'SCRIPT', 'EVALSHA', 'EVALSHA']);
  });

  it('retries NOSCRIPT exactly once; a second definite nonexecution throws typed error', async () => {
    const calls: string[][] = [];
    const client = {
      sendCommand: async (args: string[]): Promise<unknown> => {
        calls.push([...args]);
        if (args[0] === 'EVALSHA') {
          throw new Error('NOSCRIPT No matching script. Please use EVAL.');
        }
        if (args[0] === 'SCRIPT') {
          return sha1(RESERVE_ATTESTATION_SCRIPT);
        }
        throw new Error('unexpected');
      },
    };
    const store = createRedisAttestationStore({ client, keyPrefix: 'wtt-unit' });
    await expect(
      store.reserve({ replayKey: testKey('noscript-twice'), retainUntilMs: BASE_NOW + 10_000 }),
    ).rejects.toBeInstanceOf(AttestationRedisStoreError);
    expect(calls.map((call) => call[0])).toEqual(['EVALSHA', 'SCRIPT', 'EVALSHA']);
  });

  it('never retries uncertain timeouts as though nothing committed', async () => {
    const calls: string[][] = [];
    const timeout = new Error('Connection timeout after 1000 ms');
    const client = {
      sendCommand: async (args: string[]): Promise<unknown> => {
        calls.push([...args]);
        throw timeout;
      },
    };
    const store = createRedisAttestationStore({ client, keyPrefix: 'wtt-unit' });
    await expect(
      store.reserve({ replayKey: testKey('uncertain'), retainUntilMs: BASE_NOW + 10_000 }),
    ).rejects.toBeInstanceOf(AttestationRedisStoreError);
    // Exactly one attempt, no SCRIPT LOAD, no retry: a timeout may have
    // committed server-side and must never be replayed blindly.
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe('EVALSHA');
  });

  it('maps string-form integer replies like node-redis variants', async () => {
    const cases: Array<[unknown, string]> = [
      [1, 'reserved'],
      ['1', 'reserved'],
      [0, 'duplicate'],
      ['0', 'duplicate'],
      [2, 'expired'],
      ['2', 'expired'],
    ];
    for (const [reply, expected] of cases) {
      const client = { sendCommand: async (): Promise<unknown> => reply };
      const store = createRedisAttestationStore({ client, keyPrefix: 'wtt-unit' });
      expect(
        await store.reserve({ replayKey: testKey(`map-${String(reply)}`), retainUntilMs: BASE_NOW + 10_000 }),
      ).toBe(expected);
    }
  });

  it('RedisScriptRunner rewrites EVAL to EVALSHA and validates input', async () => {
    const client = { sendCommand: async (): Promise<unknown> => 1 };
    const runner = new RedisScriptRunner(client);
    await expect(runner.run(['GET', 'k'])).rejects.toThrow('EVAL-form');
    expect(runner.digestFor(RESERVE_ATTESTATION_SCRIPT)).toBe(sha1(RESERVE_ATTESTATION_SCRIPT));
  });
});

// ---------------------------------------------------------------------------
// Result / error mapping.
// ---------------------------------------------------------------------------

describe('redis attestation store result mapping', () => {
  it('returns reserved/duplicate/expired and throws capacity/overlong/operational', async () => {
    const reserveWith = async (reply: unknown) => {
      const client = { sendCommand: async (): Promise<unknown> => reply };
      const store = createRedisAttestationStore({ client, keyPrefix: 'wtt-unit' });
      return store.reserve({ replayKey: testKey('x'), retainUntilMs: BASE_NOW + 10_000 });
    };
    await expect(reserveWith(1)).resolves.toBe('reserved');
    await expect(reserveWith(0)).resolves.toBe('duplicate');
    await expect(reserveWith(2)).resolves.toBe('expired');
    await expect(reserveWith(3)).rejects.toBeInstanceOf(AttestationCapacityError);
    await expect(reserveWith(4)).rejects.toBeInstanceOf(AttestationProtocolError);
  });

  it('wrong Redis data type throws typed operational error (never accepts)', async () => {
    const client = {
      sendCommand: async (): Promise<unknown> => {
        throw new Error('Attestation Redis replay key has unexpected type');
      },
    };
    const store = createRedisAttestationStore({ client, keyPrefix: 'wtt-unit' });
    await expect(
      store.reserve({ replayKey: testKey('wrong-type'), retainUntilMs: BASE_NOW + 10_000 }),
    ).rejects.toBeInstanceOf(AttestationRedisStoreError);
  });

  it.each([null, undefined, 'weird', [], {}, 1.5, 5, -1, true])(
    'invalid script reply %s throws typed operational error',
    async (reply) => {
      const client = { sendCommand: async (): Promise<unknown> => reply };
      const store = createRedisAttestationStore({ client, keyPrefix: 'wtt-unit' });
      await expect(
        store.reserve({ replayKey: testKey('bad-reply'), retainUntilMs: BASE_NOW + 10_000 }),
      ).rejects.toBeInstanceOf(AttestationRedisStoreError);
    },
  );

  it('transport failure throws typed operational error without retry', async () => {
    const calls: string[][] = [];
    const failure = new Error('private transport diagnostic');
    const client = {
      sendCommand: async (args: string[]): Promise<unknown> => {
        calls.push([...args]);
        throw failure;
      },
    };
    const store = createRedisAttestationStore({ client, keyPrefix: 'wtt-unit' });
    await expect(
      store.reserve({ replayKey: testKey('failure'), retainUntilMs: BASE_NOW + 10_000 }),
    ).rejects.toBeInstanceOf(AttestationRedisStoreError);
    expect(calls).toHaveLength(1);
  });

  it('client-owned lifecycle: only sendCommand is used', async () => {
    const calls: string[][] = [];
    const minimal = {
      sendCommand: async (args: string[]): Promise<unknown> => {
        calls.push([...args]);
        return 1;
      },
    };
    const store = createRedisAttestationStore({ client: minimal, keyPrefix: 'wtt-unit' });
    expect(await store.reserve({ replayKey: testKey('lifecycle'), retainUntilMs: BASE_NOW + 10_000 })).toBe('reserved');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe('EVALSHA');
    expect(minimal as object).not.toHaveProperty('connect');
    expect(minimal as object).not.toHaveProperty('quit');
  });

  it('at capacity duplicates win and recovery follows bounded reclaim (fake)', async () => {
    const fake = new FakeAttestationRedis();
    fake.preload();
    fake.now = BASE_NOW;
    const store = createRedisAttestationStore({ client: fake, keyPrefix: 'wtt-cap', maxEntries: 2 });
    expect(await store.reserve({ replayKey: testKey('a'), retainUntilMs: BASE_NOW + 10_000 })).toBe('reserved');
    expect(await store.reserve({ replayKey: testKey('b'), retainUntilMs: BASE_NOW + 10_000 })).toBe('reserved');
    await expect(store.reserve({ replayKey: testKey('c'), retainUntilMs: BASE_NOW + 10_000 })).rejects.toBeInstanceOf(
      AttestationCapacityError,
    );
    expect(await store.reserve({ replayKey: testKey('a'), retainUntilMs: BASE_NOW + 10_000 })).toBe('duplicate');
    // Repeated duplicates never inflate counts.
    for (let round = 0; round < 20; round += 1) {
      expect(await store.reserve({ replayKey: testKey('a'), retainUntilMs: BASE_NOW + 20_000 })).toBe('duplicate');
    }
    expect(fake.ledgers.get('wtt-cap:attestation-proofs')?.size).toBe(2);
  });

  it('duplicate never extends expiry (fake behavioral)', async () => {
    const fake = new FakeAttestationRedis();
    fake.preload();
    fake.now = BASE_NOW;
    const store = createRedisAttestationStore({ client: fake, keyPrefix: 'wtt-unit' });
    const key = testKey('no-extend');
    expect(await store.reserve({ replayKey: key, retainUntilMs: BASE_NOW + 10_000 })).toBe('reserved');
    expect(await store.reserve({ replayKey: key, retainUntilMs: BASE_NOW + 20_000 })).toBe('duplicate');
    fake.now = BASE_NOW + 10_000;
    expect(await store.reserve({ replayKey: key, retainUntilMs: BASE_NOW + 20_000 })).toBe('reserved');
  });

  it('simultaneous identical reservations have exactly one winner (fake shared ledger)', async () => {
    const fake = new FakeAttestationRedis();
    fake.preload();
    fake.now = BASE_NOW;
    const prefix = `wtt-race-${randomUUID()}`;
    const first = createRedisAttestationStore({ client: fake, keyPrefix: prefix });
    const second = createRedisAttestationStore({ client: fake, keyPrefix: prefix });
    const key = testKey('race');
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        (index % 2 === 0 ? first : second).reserve({ replayKey: key, retainUntilMs: BASE_NOW + 10_000 }),
      ),
    );
    expect(results.filter((result) => result === 'reserved')).toHaveLength(1);
    expect(results.filter((result) => result === 'duplicate')).toHaveLength(7);
  });
});

// ---------------------------------------------------------------------------
// HTTP replay integration over two middleware instances sharing one prefix.
// ---------------------------------------------------------------------------

describe('redis attestation HTTP replay integration (fake shared prefix)', () => {
  const PUBLIC_ORIGIN = 'https://attestation.example.com';
  const NAMESPACE = 'att-redis-fake-http';
  const KEY_ID = 'redis-fake-key-01';
  const KEY_BYTES = Uint8Array.from(
    Buffer.from('d973c35da623a2329dd08a32153635042a7fe90b730035c90508ae7ec50c0d24', 'hex'), // pragma: allowlist secret
  );
  const NOW = 1780000000000;

  function snapshot() {
    return {
      currentKeyId: KEY_ID,
      keys: [{ keyId: KEY_ID, key: KEY_BYTES, acceptFrom: NOW - 60_000, acceptUntil: NOW + 60_000 }],
    };
  }

  function signProof(input: {
    timestampMs: number;
    nonceHex: string;
    method: string;
    requestTarget: string;
    contentType: string;
    bodyBytes: Uint8Array;
  }): string {
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
    return encodeTransactionId({ keyId: KEY_ID, timestampMs: input.timestampMs, nonceHex: input.nonceHex, mac });
  }

  async function startApp(app: express.Express): Promise<{ baseUrl: string; close: () => Promise<void> }> {
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.on('listening', () => resolve()));
    const address = server.address() as AddressInfo;
    return {
      baseUrl: `http://127.0.0.1:${address.port}`,
      close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
    };
  }

  it('two independent middleware instances sharing one prefix admit exactly one winner', async () => {
    // Shared fake Redis backend; two store objects (distinct clients in live)
    // share one ledger prefix, like two server instances.
    const fake = new FakeAttestationRedis();
    fake.preload();
    // Fake server TIME must track the middleware verifier clock for this
    // short-lived HTTP test; the stores themselves use fake TIME.
    fake.now = NOW;
    const prefix = `wtt-http-${randomUUID()}`;
    const firstStore = createRedisAttestationStore({ client: fake, keyPrefix: prefix });
    const secondStore = createRedisAttestationStore({ client: fake, keyPrefix: prefix });
    // Distinct capacities would break the shared bound; both use the default.
    const provider = { getSnapshot: () => snapshot() };

    async function guardedApp(store: ReturnType<typeof createRedisAttestationStore>) {
      const capture = createAttestationBodyCapture({ maxBodyBytes: 1024 * 1024 });
      const guard = createRequestAttestationMiddleware({
        publicOrigin: PUBLIC_ORIGIN,
        replayNamespace: NAMESPACE,
        keyProvider: provider,
        store,
        now: () => NOW,
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
      const { baseUrl, close } = await startApp(app);
      return { baseUrl, close, handlerCalls: () => handlerCalls };
    }

    const first = await guardedApp(firstStore);
    const second = await guardedApp(secondStore);
    try {
      const raw = JSON.stringify({ n: 1 });
      const header = signProof({
        timestampMs: NOW - 5_000,
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
      const statuses = [a.status, b.status].sort();
      expect(statuses).toEqual([200, 403]);
      const bodies = await Promise.all([a.json() as Promise<unknown>, b.json() as Promise<unknown>]);
      const codes = bodies.map((body) => (body as { code?: string }).code ?? 'ok').sort();
      expect(codes).toContain('ATTESTATION_REPLAY');
      expect(first.handlerCalls() + second.handlerCalls()).toBe(1);
      // Memory-store parity note: two independent memory objects would admit
      // twice (documented non-coordination); the shared Redis ledger admits once.
      const left = createMemoryAttestationStore({ now: () => NOW });
      const right = createMemoryAttestationStore({ now: () => NOW });
      const replayKey = 'att:v1:http-memory-parity';
      const retainUntilMs = NOW + 10_000;
      expect(await left.reserve({ replayKey, retainUntilMs })).toBe('reserved');
      expect(await right.reserve({ replayKey, retainUntilMs })).toBe('reserved');
    } finally {
      await first.close();
      await second.close();
    }
  });
});
