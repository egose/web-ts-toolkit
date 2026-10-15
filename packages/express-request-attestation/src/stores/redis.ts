/**
 * Shared bounded Redis replay admission.
 *
 * Admission contract shared with memory and MongoDB:
 *
 * - `reserve({ replayKey, retainUntilMs })` returns
 *   `'reserved' | 'duplicate' | 'expired'`.
 * - `retainUntilMs` is the absolute epoch-ms deadline from verified proof timing,
 *   including the cluster clock guard, never a relative TTL.
 * - Malformed inputs (non-object, bad opaque key bounds 1–256 printable
 *   ASCII, non-safe-integer deadlines) reject with `AttestationProtocolError`
 *   WITHOUT touching Redis (no allocation, `sendCommand` never called).
 * - Live/overlong enforcement uses Redis server `TIME` inside one atomic Lua
 *   admission: `retainUntilMs <= nowMs` returns
 *   `'expired'`; `retainUntilMs - nowMs > 240000` throws `AttestationProtocolError`
 *   instead of truncating; duplicates return `'duplicate'` even when full and
 *   never change their score; at most 64 expired entries plus the requested
 *   expired one are reclaimed per admission; shared `ZCARD` capacity is checked
 *   before `ZADD`; the ledger is `PEXPIREAT`ed through its latest retained
 *   score so idle state is reclaimed without shortening any member.
 * - Capacity throws the shared `AttestationCapacityError` (same class as
 *   memory, so callers handle one type across backends). Wrong Redis data
 *   type, invalid script replies, and transport/script failures throw the
 *   typed operational `AttestationRedisStoreError`. Never silently accept
 *   without a committed (`ZADD`) reservation.
 *
 * Wiring:
 *
 * - `createRedisAttestationStore({ client, keyPrefix = 'wtt-attestation',
 *   maxEntries = 50000 })`. The public client type is the narrow structural
 *   `sendCommand(args: string[]): Promise<unknown>` contract compatible with
 *   `node-redis`; the library never creates, connects, or closes clients and
 *   never imports a Redis driver. Callers own command/queue deadlines and retries.
 * - One same-slot sorted set per shared prefix
 *   (`<keyPrefix>:attestation-proofs`) holds opaque keys + absolute scores.
 *   All clients sharing a prefix MUST configure identical `maxEntries`;
 *   mixed capacities break the shared bound.
 * - Steady-state `EVALSHA`; on cold start / definite `NOSCRIPT`
 *   nonexecution the runner `SCRIPT LOAD`s and retries exactly once. Uncertain
 *   network timeouts are never retried as though nothing committed: a timeout
 *   may have committed server-side but never executes a handler or falls back
 *   to memory (the middleware maps it to `ATTESTATION_REPLAY_UNAVAILABLE`
 *   without calling `next`). The adapter preserves the verifier's exact
 *   `retainUntilMs` rather than clamping it.
 *
 * Capacity / failure / rate notes (no fabricated bytes-per-entry benchmark):
 *
 * - Size the ledger as unique accepted requests/second × maximum retention
 *   (default at most 50000 ms at the store including the behind-verifier
 *   guard, global cap 240000 ms) plus headroom; actual Redis memory and
 *   throughput require measurement on your deployment.
 * - Redis eviction, restore/state loss, or failover can erase replay
 *   reservations. When relying on window-wide admission history, use a
 *   suitably configured dedicated `noeviction` deployment with persistence /
 *   replication appropriate to your recovery objectives; after state loss old
 *   proofs may be admitted again while still valid under verifier age rules.
 * - Sharing is one ledger key per prefix: independent prefixes (and memory
 *   objects) intentionally do not coordinate. Restarts do not reset Redis
 *   state, but `SCRIPT FLUSH` only forces a reload, never a second admission.
 */

import { assertTimestampMs } from '../shared/canonical.js';
import { validateReplayKey } from '../shared/codec.js';
import { AttestationProtocolError } from '../shared/types.js';
import type {
  AttestationRedisClient,
  AttestationStore,
  AttestationStoreReserveInput,
  AttestationStoreReserveResult,
  CreateRedisAttestationStoreOptions,
} from '../server-types.js';
import { AttestationCapacityError } from './memory.js';
import { RedisScriptRunner, buildReserveAttestationCommand } from './redis-script.js';

/** Default namespace for the single same-slot ledger key. */
export const REDIS_ATTESTATION_STORE_DEFAULT_KEY_PREFIX = 'wtt-attestation' as const;

/** Default capacity: at most this many live reservations per shared prefix. */
export const REDIS_ATTESTATION_STORE_DEFAULT_MAX_ENTRIES = 50000 as const;

/** Suffix for the single ledger sorted set (same slot by construction). */
const LEDGER_KEY_SUFFIX = 'attestation-proofs' as const;

const STORE_OPTION_KEYS: ReadonlySet<string> = new Set(['client', 'keyPrefix', 'maxEntries']);

/**
 * Typed operational failure for the Redis replay adapter: wrong Redis data
 * type, invalid script replies, and transport/script failures. Capacity uses
 * the shared `AttestationCapacityError`; malformed inputs use
 * `AttestationProtocolError`. The middleware maps both operational failures
 * to fixed `ATTESTATION_REPLAY_UNAVAILABLE` without calling `next`, falling
 * back to memory, or releasing a possibly committed reservation.
 */
export class AttestationRedisStoreError extends Error {
  override readonly name = 'AttestationRedisStoreError';

  constructor(message = 'Attestation Redis replay store is unavailable.') {
    super(message);
  }
}

function ledgerKeyFor(keyPrefix: string): string {
  return `${keyPrefix}:${LEDGER_KEY_SUFFIX}`;
}

class RedisAttestationStore implements AttestationStore {
  private readonly client: AttestationRedisClient;
  private readonly ledgerKey: string;
  private readonly maxEntries: number;
  private readonly runner: RedisScriptRunner;

  constructor(options: CreateRedisAttestationStoreOptions) {
    if (options === null || typeof options !== 'object' || Array.isArray(options)) {
      throw new AttestationProtocolError('redis attestation store options must be an object');
    }
    for (const key of Object.keys(options)) {
      if (!STORE_OPTION_KEYS.has(key)) {
        throw new AttestationProtocolError(`unknown redis attestation store option ${key}`);
      }
    }
    const client = (options as { readonly client?: unknown }).client;
    if (
      client === null ||
      typeof client !== 'object' ||
      typeof (client as { sendCommand?: unknown }).sendCommand !== 'function'
    ) {
      throw new AttestationProtocolError('redis attestation store client must expose sendCommand()');
    }
    const keyPrefix =
      (options as { readonly keyPrefix?: unknown }).keyPrefix === undefined
        ? REDIS_ATTESTATION_STORE_DEFAULT_KEY_PREFIX
        : (options as { readonly keyPrefix?: unknown }).keyPrefix;
    if (typeof keyPrefix !== 'string' || keyPrefix.length === 0 || keyPrefix.length > 256) {
      throw new AttestationProtocolError('redis attestation store keyPrefix must be a 1-256 character string');
    }
    const maxEntries =
      (options as { readonly maxEntries?: unknown }).maxEntries === undefined
        ? REDIS_ATTESTATION_STORE_DEFAULT_MAX_ENTRIES
        : (options as { readonly maxEntries?: unknown }).maxEntries;
    if (!Number.isSafeInteger(maxEntries) || (maxEntries as number) <= 0) {
      throw new AttestationProtocolError('redis attestation store maxEntries must be a positive safe integer');
    }
    // Snapshot primitives; the options object itself is never retained, while
    // the injected client reference stays live (caller owns lifecycle).
    this.client = client as AttestationRedisClient;
    this.ledgerKey = ledgerKeyFor(keyPrefix as string);
    this.maxEntries = maxEntries as number;
    this.runner = new RedisScriptRunner(this.client);
  }

  async reserve(input: AttestationStoreReserveInput): Promise<AttestationStoreReserveResult> {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
      throw new AttestationProtocolError('attestation store reserve input must be an object');
    }
    // Snapshot primitives up front; later caller mutation cannot change this
    // admission, and malformed inputs reject before any Redis call.
    const record = input as AttestationStoreReserveInput & { readonly retainUntil?: unknown };
    const replayKey = record.replayKey;
    const retainUntilMs = record.retainUntilMs ?? record.retainUntil;
    validateReplayKey(replayKey);
    if (retainUntilMs === undefined) {
      throw new AttestationProtocolError('retainUntilMs must be a non-negative safe integer');
    }
    assertTimestampMs('retainUntilMs', retainUntilMs);
    const replayKeySnapshot = replayKey as string;
    const retainUntilSnapshot = retainUntilMs as number;
    const ledgerKey = this.ledgerKey;
    const maxEntries = this.maxEntries;

    let reply: unknown;
    try {
      reply = await this.runner.run(
        buildReserveAttestationCommand(ledgerKey, replayKeySnapshot, retainUntilSnapshot, maxEntries),
      );
    } catch (error) {
      if (error instanceof AttestationCapacityError || error instanceof AttestationProtocolError) {
        throw error;
      }
      if (error instanceof AttestationRedisStoreError) {
        throw error;
      }
      throw new AttestationRedisStoreError(
        error instanceof Error
          ? `Attestation Redis reservation failed: ${error.message}`
          : 'Attestation Redis reservation failed.',
      );
    }
    if (reply === 1 || reply === '1') {
      return 'reserved';
    }
    if (reply === 0 || reply === '0') {
      return 'duplicate';
    }
    if (reply === 2 || reply === '2') {
      return 'expired';
    }
    if (reply === 3 || reply === '3') {
      throw new AttestationCapacityError();
    }
    if (reply === 4 || reply === '4') {
      throw new AttestationProtocolError(
        'retainUntilMs exceeds the 240000 ms global retention cap or is not a safe live deadline',
      );
    }
    throw new AttestationRedisStoreError('Attestation Redis store received an unexpected script reply.');
  }
}

/**
 * Create a shared bounded attestation replay store over one same-slot Redis
 * sorted-set ledger.
 *
 * Pass an already-connected client (or compatible `sendCommand` adapter); the
 * caller owns connection, listeners, command deadlines, and shutdown. Defaults:
 * `keyPrefix: 'wtt-attestation'`, `maxEntries: 50000`. All clients sharing the
 * prefix need identical capacity; verifiers in a protection space also need
 * identical time policy/key windows and clocks within `clusterClockGuardMs`
 * of Redis `TIME`.
 *
 * Absolute `retainUntilMs` scores never slide on duplicates; live entries are
 * never evicted by this adapter. Capacity throws `AttestationCapacityError`,
 * malformed inputs throw `AttestationProtocolError`, and dependency failures
 * throw `AttestationRedisStoreError`. There is no direct-call wait timeout or
 * retry after uncertain command execution. Eviction/state loss/failover can
 * erase replay history; configure Redis persistence and noeviction accordingly.
 */
export function createRedisAttestationStore(options: CreateRedisAttestationStoreOptions): AttestationStore {
  return new RedisAttestationStore(options);
}

export { AttestationCapacityError };
