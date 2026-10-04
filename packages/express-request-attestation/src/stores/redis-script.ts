/**
 * ATT-04 shared bounded Redis replay admission script (task sections 4.1/4.4).
 *
 * One same-slot sorted set per shared prefix holds opaque replay keys with
 * absolute `retainUntil` scores. The single atomic Lua admission uses Redis
 * `TIME` (server clock, never the caller's wall clock), validates bounded
 * safe live deadlines, returns reserved/duplicate/expired, reclaims at most
 * 64 expired entries plus the requested expired one, checks shared capacity
 * before inserting, never rescores duplicates, and `PEXPIREAT`s the ledger
 * through its latest retained score so idle state is reclaimed without
 * shortening any member's deadline.
 *
 * Return codes (integers, also accepted as decimal strings from some clients):
 *
 * - `1` reserved (committed via `ZADD`; only this path admits a proof).
 * - `0` duplicate (live reservation already holds the key; score untouched,
 *   even when full — duplicate-first, never rescores).
 * - `2` expired (requested `retainUntil` already elapsed per server `TIME`;
 *   nothing allocated, live state untouched).
 * - `3` capacity (shared `ZCARD` reached `maxEntries` after bounded reclaim;
 *   no live entry evicted, nothing inserted).
 * - `4` overlong/invalid (requested deadline not a safe live integer or its
 *   remaining `retainUntil - now` exceeds the 240000 ms global maximum
 *   including the store-behind-verifier guard; rejected instead of truncated,
 *   nothing allocated).
 *
 * Wrong Redis data type raises a Lua `error` (surfaced as a rejected
 * `sendCommand`); the store maps it to a typed operational error and never
 * accepts without a committed reservation. No `GET`/`SET`, no separate
 * capacity counter (no TTL drift), no `nowSkewToleranceMs` hidden clamp —
 * the caller passes section 4.4's exact `retainUntil` and server `TIME`
 * enforces the 240000 ms ceiling and expiry.
 */

import { createHash } from 'node:crypto';

/**
 * Atomic admission Lua. Uses only the single `KEYS[1]` ledger plus
 * `TIME`/`TYPE`/`ZSCORE`/`ZRANGEBYSCORE`/`ZREM`/`ZCARD`/`ZADD`/`ZREVRANGE`/
 * `PEXPIREAT` — no `GET`/`SET`/`SCAN`, no cross-slot keys. Compatible with
 * Redis 6.2 and 7.2 (`ZRANGEBYSCORE`/`ZREVRANGE`/`PEXPIREAT` all predate 6.2;
 * `unpack` is Lua 5.1 as shipped by Redis).
 */
export const RESERVE_ATTESTATION_SCRIPT = `
local function finiteNumber(value)
  return type(value) == 'number' and value == value and value > -math.huge and value < math.huge
end
local function serverNow()
  local time = redis.call('TIME')
  return tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
end
local retainUntil = tonumber(ARGV[2])
if not finiteNumber(retainUntil) or retainUntil ~= math.floor(retainUntil)
  or retainUntil < 0 or retainUntil > 9007199254740991 then
  return 4
end
local maxEntries = tonumber(ARGV[3])
if not finiteNumber(maxEntries) or maxEntries ~= math.floor(maxEntries)
  or maxEntries <= 0 or maxEntries > 9007199254740991 then
  return 4
end
local now = serverNow()
if retainUntil <= now then
  return 2
end
if retainUntil - now > 240000 then
  return 4
end
local keyType = redis.call('TYPE', KEYS[1])['ok']
if keyType ~= 'none' and keyType ~= 'zset' then
  error('Attestation Redis replay key has unexpected type')
end
local existing = redis.call('ZSCORE', KEYS[1], ARGV[1])
if existing ~= false and tonumber(existing) > now then
  return 0
end
local expired = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', now, 'LIMIT', 0, 64)
if #expired > 0 then
  redis.call('ZREM', KEYS[1], unpack(expired))
end
if existing ~= false then
  redis.call('ZREM', KEYS[1], ARGV[1])
end
if redis.call('ZCARD', KEYS[1]) >= maxEntries then
  return 3
end
redis.call('ZADD', KEYS[1], retainUntil, ARGV[1])
local last = redis.call('ZREVRANGE', KEYS[1], 0, 0, 'WITHSCORES')
redis.call('PEXPIREAT', KEYS[1], last[2])
return 1
`;

/**
 * Build the `EVAL`-form command for one admission. Layout is
 * `['EVAL', script, '1', ledgerKey, replayKey, retainUntil, maxEntries]`;
 * {@link RedisScriptRunner} rewrites the head to steady-state `EVALSHA`.
 */
export function buildReserveAttestationCommand(
  ledgerKey: string,
  replayKey: string,
  retainUntilMs: number,
  maxEntries: number,
): string[] {
  return ['EVAL', RESERVE_ATTESTATION_SCRIPT, '1', ledgerKey, replayKey, String(retainUntilMs), String(maxEntries)];
}

/** SHA1 digest Redis uses for script-cache keys (same algorithm as Redis). */
function scriptSha1(script: string): string {
  return createHash('sha1').update(script).digest('hex');
}

const NOSCRIPT_ERROR_PREFIX = 'NOSCRIPT';

function isNoScriptError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.startsWith(NOSCRIPT_ERROR_PREFIX);
  }
  if (typeof error === 'string') {
    return error.startsWith(NOSCRIPT_ERROR_PREFIX);
  }
  return false;
}

/**
 * Minimal client shape the runner relies on — the `sendCommand(args)` half
 * of `AttestationRedisClient`, so the runner never depends on a full driver.
 */
export interface RedisScriptRunnerClient {
  sendCommand(args: string[]): Promise<unknown>;
}

/**
 * Cached Lua execution via steady-state `EVALSHA`.
 *
 * State is held per instance (per store, per client) so caches never leak
 * across clients and tests cannot become order-dependent through shared
 * global state. On cold start / `SCRIPT FLUSH` / failover to a node that has
 * not seen the load (definite `NOSCRIPT` nonexecution), the runner loads via
 * `SCRIPT LOAD` and retries the `EVALSHA` exactly once. Any other failure —
 * including uncertain network timeouts that may have committed — is never
 * retried as though nothing committed; it propagates immediately.
 */
export class RedisScriptRunner {
  private readonly client: RedisScriptRunnerClient;
  private readonly digests = new Map<string, string>();

  constructor(client: RedisScriptRunnerClient) {
    this.client = client;
  }

  /** Drop cached digests (e.g. after a deliberate reconnect known to flush). */
  reset(): void {
    this.digests.clear();
  }

  /**
   * Execute an `EVAL`-form command via cached `EVALSHA`. The leading `EVAL`
   * and script body are replaced with `EVALSHA` + digest; the remaining
   * positional layout (key count, keys, args) is preserved exactly.
   */
  async run(command: string[]): Promise<unknown> {
    if (command[0] !== 'EVAL' || typeof command[1] !== 'string' || typeof command[2] !== 'string') {
      throw new Error('RedisScriptRunner.run expects an EVAL-form command.');
    }
    const script = command[1] as string;
    const tail = command.slice(2);
    return this.runDigest(script, tail);
  }

  private async runDigest(script: string, tail: string[]): Promise<unknown> {
    let digest = this.digests.get(script);
    if (!digest) {
      digest = scriptSha1(script);
      this.digests.set(script, digest);
    }
    try {
      return await this.client.sendCommand(['EVALSHA', digest, ...tail]);
    } catch (error) {
      if (!isNoScriptError(error)) {
        throw error;
      }
      const loaded = await this.client.sendCommand(['SCRIPT', 'LOAD', script]);
      if (typeof loaded === 'string' && loaded.length > 0) {
        digest = loaded;
        this.digests.set(script, digest);
      }
      return this.client.sendCommand(['EVALSHA', digest, ...tail]);
    }
  }

  /** Exposed for tests: the digest the runner would currently send. */
  digestFor(script: string): string | undefined {
    return this.digests.get(script) ?? scriptSha1(script);
  }
}
