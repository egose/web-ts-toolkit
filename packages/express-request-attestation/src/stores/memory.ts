/**
 * ATT-03 bounded atomic memory replay store (task section 4.4).
 *
 * Admission contract (shared with the future ATT-04 Redis adapter):
 *
 * - `reserve({ replayKey, retainUntilMs })` returns `'reserved' | 'duplicate' | 'expired'`.
 * - The canonical deadline field is `retainUntilMs` (see `AttestationStoreReserveInput`).
 *   A `retainUntil` alias is accepted at runtime for callers written against the
 *   task-text shorthand; when both are present the canonical field wins.
 * - Validation order per admission: input shape, store clock, opaque key bounds
 *   (1-256 printable ASCII), deadline shape (nonnegative safe integer), input
 *   expiry (`retainUntilMs <= now` returns `'expired'` with no allocation and no
 *   clamping), global retention cap (`retainUntilMs - now > 240000` rejects
 *   without allocating instead of truncating), then duplicate check, then bounded
 *   expiry reclamation, then capacity, then atomic insert.
 * - Duplicate detection precedes capacity rejection: a live duplicate returns
 *   `'duplicate'` even when full. Duplicates never extend expiry and never
 *   allocate a new heap node.
 * - Each admission reclaims the requested expired entry (when the same key holds
 *   one) plus at most 64 expired entries from the indexed expiry heap. No live
 *   entry is ever evicted, there is no interval timer, and there is no full-map
 *   rebuild or linear key scan.
 * - An expired key is reservable again for a fresh proof whose deadline is
 *   valid; the old proof still fails the verifier's age rules (the store never
 *   sees signatures, only opaque already-derived replay keys).
 *
 * Sharing boundary: replay state is shared only by callers reusing this same
 * store object in one process. Restart or state loss resets this replay memory.
 * There is no multi-process coordination, durable exactly-once delivery, or
 * cross-object sharing (independent store objects intentionally do not
 * coordinate).
 */

import { assertTimestampMs } from '../shared/canonical.js';
import { validateReplayKey } from '../shared/codec.js';
import { AttestationProtocolError, GLOBAL_MAX_RETENTION_MS } from '../shared/types.js';
import type {
  AttestationStore,
  AttestationStoreReserveInput,
  AttestationStoreReserveResult,
  CreateMemoryAttestationStoreOptions,
} from '../server-types.js';

/** Default capacity: at most this many live replay reservations per store object. */
export const MEMORY_ATTESTATION_STORE_DEFAULT_MAX_ENTRIES = 50000 as const;

/** Maximum expired heap nodes reclaimed per admission (plus the requested key). */
const EXPIRY_SWEEP_BATCH_SIZE = 64 as const;

const STORE_OPTION_KEYS: ReadonlySet<string> = new Set(['maxEntries', 'now']);

/**
 * Shared capacity exhaustion: no live reservation is evicted and no proof is
 * admitted without replay state. Handle like any replay-store failure: fail
 * closed. Also thrown by the future Redis adapter so callers handle one error
 * type across backends.
 */
export class AttestationCapacityError extends Error {
  override readonly name = 'AttestationCapacityError';

  constructor(message = 'Attestation replay store capacity is exhausted.') {
    super(message);
  }
}

type Reservation = {
  readonly replayKey: string;
  readonly retainUntilMs: number;
  index: number;
};

/**
 * Single-object atomic reservations: one `Map` plus an indexed min-heap with
 * exactly one live heap node per retained key. `reserve` performs no awaits
 * before inserting, so concurrent reservations against one shared object in one
 * process serialize in call order with exactly one winner.
 */
class MemoryAttestationStore implements AttestationStore {
  private readonly reservations = new Map<string, Reservation>();
  private readonly expiryHeap: Reservation[] = [];
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(options: CreateMemoryAttestationStoreOptions = {}) {
    if (options === null || typeof options !== 'object' || Array.isArray(options)) {
      throw new AttestationProtocolError('memory attestation store options must be an object');
    }
    for (const key of Object.keys(options)) {
      if (!STORE_OPTION_KEYS.has(key)) {
        throw new AttestationProtocolError(`unknown memory attestation store option ${key}`);
      }
    }
    // Explicit `null` is invalid input, not "absent": only `undefined`
    // selects the default.
    const maxEntries =
      options.maxEntries === undefined ? MEMORY_ATTESTATION_STORE_DEFAULT_MAX_ENTRIES : options.maxEntries;
    if (!Number.isSafeInteger(maxEntries) || (maxEntries as number) <= 0) {
      throw new AttestationProtocolError('memory attestation store maxEntries must be a positive safe integer');
    }
    const now = options.now === undefined ? () => Date.now() : options.now;
    if (typeof now !== 'function') {
      throw new AttestationProtocolError('memory attestation store now must be a function');
    }
    // Snapshot: the options object itself is never retained, so later caller
    // mutation cannot change capacity or the clock.
    this.maxEntries = maxEntries;
    this.now = now;
  }

  async reserve(input: AttestationStoreReserveInput): Promise<AttestationStoreReserveResult> {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
      throw new AttestationProtocolError('attestation store reserve input must be an object');
    }
    // Snapshot primitives up front; later caller mutation of the input object
    // cannot change this admission.
    const record = input as AttestationStoreReserveInput & { readonly retainUntil?: unknown };
    const replayKey = record.replayKey;
    const retainUntilMs = record.retainUntilMs ?? record.retainUntil;
    const nowMs = this.now();
    if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
      throw new AttestationProtocolError('attestation store clock must return a non-negative safe integer');
    }
    validateReplayKey(replayKey);
    if (retainUntilMs === undefined) {
      throw new AttestationProtocolError('retainUntilMs must be a non-negative safe integer');
    }
    assertTimestampMs('retainUntilMs', retainUntilMs);
    if (retainUntilMs <= nowMs) {
      return 'expired';
    }
    const remainingMs = retainUntilMs - nowMs;
    if (remainingMs > GLOBAL_MAX_RETENTION_MS) {
      throw new AttestationProtocolError(
        `retainUntilMs exceeds the ${GLOBAL_MAX_RETENTION_MS} ms global retention cap`,
      );
    }
    const existing = this.reservations.get(replayKey);
    if (existing !== undefined && existing.retainUntilMs > nowMs) {
      return 'duplicate';
    }
    if (existing !== undefined) {
      this.remove(existing.index);
    }
    for (
      let cleaned = 0;
      cleaned < EXPIRY_SWEEP_BATCH_SIZE &&
      this.expiryHeap[0] !== undefined &&
      this.expiryHeap[0].retainUntilMs <= nowMs;
      cleaned += 1
    ) {
      this.remove(0);
    }
    if (this.reservations.size >= this.maxEntries) {
      throw new AttestationCapacityError();
    }
    const reservation: Reservation = {
      replayKey,
      retainUntilMs,
      index: this.expiryHeap.length,
    };
    this.reservations.set(replayKey, reservation);
    this.expiryHeap.push(reservation);
    this.moveUp(reservation.index);
    return 'reserved';
  }

  private remove(index: number): void {
    const removed = this.expiryHeap[index] as Reservation;
    const last = this.expiryHeap.pop() as Reservation;
    this.reservations.delete(removed.replayKey);
    if (index === this.expiryHeap.length) {
      return;
    }
    this.expiryHeap[index] = last;
    last.index = index;
    this.moveUp(index);
    this.moveDown(last.index);
  }

  private swap(left: number, right: number): void {
    const leftRow = this.expiryHeap[left] as Reservation;
    const rightRow = this.expiryHeap[right] as Reservation;
    this.expiryHeap[left] = rightRow;
    this.expiryHeap[right] = leftRow;
    rightRow.index = left;
    leftRow.index = right;
  }

  private moveUp(index: number): void {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (
        (this.expiryHeap[parent] as Reservation).retainUntilMs <= (this.expiryHeap[index] as Reservation).retainUntilMs
      ) {
        break;
      }
      this.swap(parent, index);
      index = parent;
    }
  }

  private moveDown(index: number): void {
    for (;;) {
      const left = index * 2 + 1;
      if (left >= this.expiryHeap.length) {
        return;
      }
      const right = left + 1;
      const child =
        right < this.expiryHeap.length &&
        (this.expiryHeap[right] as Reservation).retainUntilMs < (this.expiryHeap[left] as Reservation).retainUntilMs
          ? right
          : left;
      if (
        (this.expiryHeap[index] as Reservation).retainUntilMs <= (this.expiryHeap[child] as Reservation).retainUntilMs
      ) {
        return;
      }
      this.swap(index, child);
      index = child;
    }
  }
}

/**
 * Create a process-local bounded attestation replay store for local
 * development and tests.
 *
 * Reservations are kept in memory, cleaned up opportunistically during
 * `reserve` calls, and lost when the Node.js process exits. Do not use this
 * store when replay state must survive restarts or be shared by multiple
 * application instances. Replay is shared only by callers reusing this same
 * object; the store does not verify request signatures. Capacity defaults to
 * 50000 entries and never evicts live entries.
 */
export function createMemoryAttestationStore(options: CreateMemoryAttestationStoreOptions = {}): AttestationStore {
  return new MemoryAttestationStore(options);
}
