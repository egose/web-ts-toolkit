/**
 * MONGO-01 MongoDB replay adapter (task sections 4.1/4.4).
 *
 * Admission contract (shared with memory/Redis; see `test/store-conformance.ts`):
 *
 * - `reserve({ replayKey, retainUntilMs })` returns
 *   `'reserved' | 'duplicate' | 'expired'`.
 * - The canonical deadline field is `retainUntilMs`
 *   (see `AttestationStoreReserveInput`). A `retainUntil` alias is accepted at
 *   runtime for callers written against the task-text shorthand; when both are
 *   present the canonical field wins.
 * - Validation order per admission: input shape, store clock, opaque key
 *   bounds (1-256 printable ASCII), deadline shape (nonnegative safe
 *   integer), input expiry (`retainUntilMs <= now` returns `'expired'` with
 *   no allocation and no clamping), global retention cap
 *   (`retainUntilMs - now > 240000` rejects without allocating instead of
 *   truncating), then duplicate check, then bounded expiry reclamation, then
 *   capacity, then atomic insert.
 * - Duplicate detection precedes capacity rejection: a live duplicate returns
 *   `'duplicate'` even when full. Duplicates never extend expiry and never
 *   rescore.
 * - Each admission reclaims the requested expired entry (when the same key
 *   holds one) plus at most 64 expired entries from the indexed accounting
 *   ledger. No live entry is ever evicted and there is no interval timer.
 * - An expired key is reservable again for a fresh proof whose deadline is
 *   valid; the old proof still fails the verifier's age rules (the store never
 *   sees signatures, only opaque already-derived replay keys).
 *
 * Storage design (follows the vault MongoDB store's DPoP replay
 * reservations module):
 *
 * - One proof collection with unique `_id`s (`{ _id: replayKey,
 *   retainUntilMs }`) plus a separate non-TTL capacity/accounting collection
 *   (`{ _id, kind, replayKey?, retainUntilMs? }`) with one shared capacity
 *   row (`{ _id: 'capacity' }` holding `entries`/`maxEntries`/`revision`).
 * - Multi-document snapshot transaction per admission: duplicate check,
 *   bounded expiry reclaim (64), capacity check, insert. Duplicates never
 *   extend expiry; no live eviction.
 * - Do not rely on a Mongo TTL index for correctness (coarse granularity);
 *   the indexed, non-TTL accounting ledger is the source of truth. Create a
 *   non-TTL index on `retainUntilMs` (for example
 *   `{ kind: 1, retainUntilMs: 1 }` on the capacity collection) for the
 *   bounded expiry queries; never add a TTL index to the accounting
 *   collection.
 * - App clock with a synchronized-clock requirement across instances (Mongo
 *   has no `TIME` equivalent): all verifiers/stores sharing one database must
 *   use synchronized clocks within the configured `clusterClockGuardMs`, and
 *   an invalid clock fails closed without allocating or touching the
 *   database.
 *
 * Wiring:
 *
 * - `createMongoAttestationStore({ db, proofsCollectionName?,
 *   capacityCollectionName?, maxEntries?, now? })`. The `Db`/collection
 *   handles are retained live without cloning, connecting, or closing; the
 *   caller owns the underlying `MongoClient` lifecycle (connect/close).
 *   Production deployments require a replica set (transactions).
 * - The `mongodb` driver is a dev dependency for tests only. The library
 *   uses narrow structural `Db`/collection/session types and never imports a
 *   driver at runtime, so browser-only `/signer` consumers never need it.
 * - Capacity throws the shared `AttestationCapacityError` (same class as
 *   memory/Redis). Wrong collection types, transaction failures, and
 *   malformed persisted rows throw the narrow `AttestationMongoStoreError`.
 *   Malformed inputs throw `AttestationProtocolError` without touching the
 *   database. The middleware already maps unknown store failures to fixed
 *   `ATTESTATION_REPLAY_UNAVAILABLE` without calling `next`; do not change
 *   middleware for this adapter.
 *
 * Sharing boundary: replay state is shared by all clients using the same
 * database/collections with identical `maxEntries`. Independent databases or
 * collection pairs intentionally do not coordinate. Mixed capacities break
 * the shared bound; configure identically everywhere.
 */

import { assertTimestampMs } from '../shared/canonical.js';
import { validateReplayKey } from '../shared/codec.js';
import { AttestationProtocolError, GLOBAL_MAX_RETENTION_MS } from '../shared/types.js';
import type { AttestationStore, AttestationStoreReserveInput, AttestationStoreReserveResult } from '../server-types.js';
import { AttestationCapacityError } from './memory.js';

/** Default capacity: at most this many live replay reservations per database. */
export const MONGO_ATTESTATION_STORE_DEFAULT_MAX_ENTRIES = 50000 as const;

/** Default proof collection name (unique `_id`s, no TTL). */
export const MONGO_ATTESTATION_STORE_DEFAULT_PROOFS_COLLECTION = 'attestation_proofs' as const;

/** Default capacity/accounting collection name (non-TTL ledger). */
export const MONGO_ATTESTATION_STORE_DEFAULT_CAPACITY_COLLECTION = 'attestation_replay_capacity' as const;

/** Maximum expired ledger rows reclaimed per admission (plus the requested key). */
const EXPIRY_SWEEP_BATCH_SIZE = 64 as const;

const CAPACITY_ID = 'capacity' as const;

const STORE_OPTION_KEYS: ReadonlySet<string> = new Set([
  'db',
  'proofsCollectionName',
  'capacityCollectionName',
  'maxEntries',
  'now',
]);

const reservationId = (replayKey: string): string => `proof:${replayKey}`;

/**
 * Typed operational failure for the Mongo replay adapter: transport,
 * topology, transaction, and persisted-row inconsistency failures. Capacity
 * uses the shared `AttestationCapacityError`; malformed inputs use
 * `AttestationProtocolError`. The middleware maps this error to fixed
 * `ATTESTATION_REPLAY_UNAVAILABLE` without calling `next`, falling back to
 * memory, or releasing a possibly committed reservation.
 */
export class AttestationMongoStoreError extends Error {
  override readonly name = 'AttestationMongoStoreError';

  constructor(message = 'Attestation MongoDB replay store is unavailable.') {
    super(message);
  }
}

/** Narrow structural session: only `withTransaction`/`endSession` are used. */
export interface MongoAttestationStoreSession {
  withTransaction<T>(fn: () => Promise<T>, options?: unknown): Promise<T | undefined>;
  endSession(): Promise<void>;
}

/** Narrow structural collection: only the replay-admission methods are used. */
export interface MongoAttestationStoreCollection {
  readonly collectionName: string;
  findOne(filter?: unknown, options?: unknown): Promise<unknown>;
  findOneAndUpdate(filter: unknown, update: unknown, options?: unknown): Promise<unknown>;
  insertOne(doc: unknown, options?: unknown): Promise<unknown>;
  deleteOne(filter?: unknown, options?: unknown): Promise<unknown>;
  deleteMany(filter?: unknown, options?: unknown): Promise<unknown>;
  replaceOne(filter: unknown, replacement: unknown, options?: unknown): Promise<unknown>;
  updateOne(filter: unknown, update: unknown, options?: unknown): Promise<unknown>;
  find(
    filter?: unknown,
    options?: unknown,
  ): {
    sort(spec: unknown): {
      limit(n: number): { toArray(): Promise<unknown[]> };
    };
  };
}

/** Narrow structural database handle: `collection` plus session creation. */
export interface MongoAttestationStoreDb {
  collection(name: string): MongoAttestationStoreCollection;
  readonly client: {
    startSession(): MongoAttestationStoreSession;
  };
}

/** Options for `createMongoAttestationStore` (MONGO-01). */
export interface CreateMongoAttestationStoreOptions {
  /** Database handle from an already-connected caller-owned client. */
  readonly db: MongoAttestationStoreDb;
  /** Proof collection name; default `attestation_proofs`. */
  readonly proofsCollectionName?: string;
  /** Capacity/accounting collection name; default `attestation_replay_capacity`. */
  readonly capacityCollectionName?: string;
  /** Positive safe-integer shared capacity; default 50000. */
  readonly maxEntries?: number;
  /** App clock; default `Date.now`. Must stay synchronized across instances. */
  readonly now?: () => number;
}

type ProofDocument = {
  readonly _id: string;
  readonly retainUntilMs: number;
};

type CapacityDocument = {
  readonly _id: string;
  readonly kind: 'capacity' | 'reservation';
  readonly entries?: number;
  readonly revision?: number;
  readonly maxEntries?: number;
  readonly proofsCollectionName?: string;
  readonly replayKey?: string;
  readonly retainUntilMs?: number;
};

function validateCollectionName(role: string, name: unknown): asserts name is string {
  if (typeof name !== 'string' || name.length === 0) {
    throw new AttestationProtocolError(`mongo attestation store ${role} collection name must be a non-empty string`);
  }
  if (name.includes('\0')) {
    throw new AttestationProtocolError(`mongo attestation store ${role} collection name must not contain null bytes`);
  }
  if (name.startsWith('system.')) {
    throw new AttestationProtocolError(
      `mongo attestation store ${role} collection name must not use the reserved system namespace`,
    );
  }
  if (name.includes('$')) {
    throw new AttestationProtocolError(`mongo attestation store ${role} collection name must not contain '$'`);
  }
}

function unwrapFindOneAndUpdate(reply: unknown): unknown {
  if (reply !== null && typeof reply === 'object' && 'value' in reply && 'ok' in reply) {
    return (reply as { readonly value: unknown }).value;
  }
  return reply;
}

function deletedCountOf(reply: unknown): number {
  if (reply !== null && typeof reply === 'object' && 'deletedCount' in reply) {
    const count = (reply as { readonly deletedCount: unknown }).deletedCount;
    if (typeof count === 'number' && Number.isSafeInteger(count) && count >= 0) {
      return count;
    }
  }
  return 0;
}

class MongoAttestationStore implements AttestationStore {
  private readonly db: MongoAttestationStoreDb;
  private readonly proofs: MongoAttestationStoreCollection;
  private readonly capacity: MongoAttestationStoreCollection;
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(options: CreateMongoAttestationStoreOptions) {
    if (options === null || typeof options !== 'object' || Array.isArray(options)) {
      throw new AttestationProtocolError('mongo attestation store options must be an object');
    }
    for (const key of Object.keys(options)) {
      if (!STORE_OPTION_KEYS.has(key)) {
        throw new AttestationProtocolError(`unknown mongo attestation store option ${key}`);
      }
    }
    const db = (options as { readonly db?: unknown }).db;
    if (
      db === null ||
      typeof db !== 'object' ||
      typeof (db as { collection?: unknown }).collection !== 'function' ||
      (db as { client?: unknown }).client === null ||
      typeof (db as { client?: unknown }).client !== 'object' ||
      typeof (db as { client: { startSession?: unknown } }).client.startSession !== 'function'
    ) {
      throw new AttestationProtocolError(
        'mongo attestation store db must expose collection() and client.startSession()',
      );
    }
    const proofsCollectionName =
      (options as { readonly proofsCollectionName?: unknown }).proofsCollectionName === undefined
        ? MONGO_ATTESTATION_STORE_DEFAULT_PROOFS_COLLECTION
        : (options as { readonly proofsCollectionName?: unknown }).proofsCollectionName;
    const capacityCollectionName =
      (options as { readonly capacityCollectionName?: unknown }).capacityCollectionName === undefined
        ? MONGO_ATTESTATION_STORE_DEFAULT_CAPACITY_COLLECTION
        : (options as { readonly capacityCollectionName?: unknown }).capacityCollectionName;
    validateCollectionName('proofs', proofsCollectionName);
    validateCollectionName('capacity', capacityCollectionName);
    if (proofsCollectionName === capacityCollectionName) {
      throw new AttestationProtocolError('mongo attestation store proofs and capacity collections must be distinct');
    }
    const maxEntries =
      (options as { readonly maxEntries?: unknown }).maxEntries === undefined
        ? MONGO_ATTESTATION_STORE_DEFAULT_MAX_ENTRIES
        : (options as { readonly maxEntries?: unknown }).maxEntries;
    if (!Number.isSafeInteger(maxEntries) || (maxEntries as number) <= 0) {
      throw new AttestationProtocolError('mongo attestation store maxEntries must be a positive safe integer');
    }
    const now =
      (options as { readonly now?: unknown }).now === undefined
        ? () => Date.now()
        : (options as { readonly now?: unknown }).now;
    if (typeof now !== 'function') {
      throw new AttestationProtocolError('mongo attestation store now must be a function');
    }
    // Snapshot primitives; the options object itself is never retained, while
    // the injected `Db`/collection handles stay live (caller owns lifecycle).
    const liveDb = db as MongoAttestationStoreDb;
    let proofs: MongoAttestationStoreCollection;
    let capacity: MongoAttestationStoreCollection;
    try {
      proofs = liveDb.collection(proofsCollectionName as string);
      capacity = liveDb.collection(capacityCollectionName as string);
    } catch {
      throw new AttestationProtocolError('mongo attestation store db.collection() failed');
    }
    if (proofs === null || typeof proofs !== 'object' || capacity === null || typeof capacity !== 'object') {
      throw new AttestationProtocolError('mongo attestation store db.collection() failed');
    }
    this.db = liveDb;
    this.proofs = proofs;
    this.capacity = capacity;
    this.maxEntries = maxEntries as number;
    this.now = now as () => number;
  }

  async reserve(input: AttestationStoreReserveInput): Promise<AttestationStoreReserveResult> {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
      throw new AttestationProtocolError('attestation store reserve input must be an object');
    }
    // Snapshot primitives up front; later caller mutation cannot change this
    // admission, and malformed inputs reject before any database call.
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
    if (retainUntilMs - nowMs > GLOBAL_MAX_RETENTION_MS) {
      throw new AttestationProtocolError(
        `retainUntilMs exceeds the ${GLOBAL_MAX_RETENTION_MS} ms global retention cap`,
      );
    }
    const replayKeySnapshot = replayKey as string;
    const retainUntilSnapshot = retainUntilMs as number;

    let session: MongoAttestationStoreSession;
    try {
      session = this.db.client.startSession();
    } catch (error) {
      throw new AttestationMongoStoreError(
        error instanceof Error
          ? `Attestation MongoDB session failed: ${error.message}`
          : 'Attestation MongoDB session failed.',
      );
    }
    try {
      const result = await session.withTransaction(
        async () => {
          const nowTx = this.now();
          if (!Number.isSafeInteger(nowTx) || nowTx < 0) {
            throw new AttestationProtocolError('attestation store clock must return a non-negative safe integer');
          }
          if (retainUntilSnapshot <= nowTx) {
            return 'expired' as const;
          }
          if (retainUntilSnapshot - nowTx > GLOBAL_MAX_RETENTION_MS) {
            throw new AttestationProtocolError(
              `retainUntilMs exceeds the ${GLOBAL_MAX_RETENTION_MS} ms global retention cap`,
            );
          }
          // Serialize writers: an actual write, not a no-op lock, so
          // independent clients contend here and the driver's transaction retry
          // starts a fresh snapshot. Upsert ensures the first admission on a
          // fresh database creates the shared capacity row atomically.
          const capacityRaw = unwrapFindOneAndUpdate(
            await this.capacity.findOneAndUpdate(
              { _id: CAPACITY_ID },
              {
                // Note: `$inc` must not share `revision` with `$setOnInsert`
                // (MongoDB rejects the conflicting path on insert); `$inc`
                // creates `revision: 1` for a fresh capacity row.
                $inc: { revision: 1 },
                $setOnInsert: {
                  kind: 'capacity',
                  entries: 0,
                  maxEntries: this.maxEntries,
                  proofsCollectionName: this.proofs.collectionName,
                },
              },
              { session, returnDocument: 'after', upsert: true },
            ),
          );
          this.validateCapacity(capacityRaw);
          const capacityDoc = capacityRaw as CapacityDocument;

          const proofRaw = (await this.proofs.findOne({ _id: replayKeySnapshot }, { session })) as ProofDocument | null;
          if (proofRaw !== null) {
            this.validateProof(proofRaw, replayKeySnapshot);
            if (proofRaw.retainUntilMs > nowTx) {
              return 'duplicate' as const;
            }
          }
          const ledgerId = reservationId(replayKeySnapshot);
          const existingRaw = (await this.capacity.findOne({ _id: ledgerId }, { session })) as CapacityDocument | null;
          if (existingRaw !== null) {
            this.validateReservation(existingRaw);
            // The ledger also protects a live key if a physical proof row was
            // removed externally. Missing replay state never grants a bypass.
            if ((existingRaw.retainUntilMs as number) > nowTx) {
              return 'duplicate' as const;
            }
          }

          let removed = 0;
          if (existingRaw !== null) {
            removed += deletedCountOf(await this.capacity.deleteOne({ _id: ledgerId }, { session }));
          }
          const expiredRows = (await this.capacity
            .find({ kind: 'reservation', retainUntilMs: { $lte: nowTx } }, { session })
            .sort({ retainUntilMs: 1 })
            .limit(EXPIRY_SWEEP_BATCH_SIZE)
            .toArray()) as CapacityDocument[];
          if (!Array.isArray(expiredRows)) {
            throw new AttestationMongoStoreError('Attestation MongoDB expiry accounting is malformed.');
          }
          for (const row of expiredRows) {
            this.validateReservation(row);
          }
          if (expiredRows.length > 0) {
            const ids = expiredRows.map((row) => row._id);
            const replayKeys = expiredRows.map((row) => row.replayKey as string);
            removed += deletedCountOf(
              await this.capacity.deleteMany({ _id: { $in: ids }, kind: 'reservation' }, { session }),
            );
            await this.proofs.deleteMany({ _id: { $in: replayKeys }, retainUntilMs: { $lte: nowTx } }, { session });
          }
          const entries = (capacityDoc.entries as number) - removed;
          if (!Number.isSafeInteger(entries) || entries < 0) {
            throw new AttestationMongoStoreError('Attestation MongoDB replay capacity accounting is inconsistent.');
          }
          if (entries >= this.maxEntries) {
            throw new AttestationCapacityError();
          }

          await this.proofs.replaceOne(
            { _id: replayKeySnapshot },
            { _id: replayKeySnapshot, retainUntilMs: retainUntilSnapshot },
            { upsert: true, session },
          );
          await this.capacity.insertOne(
            {
              _id: ledgerId,
              kind: 'reservation',
              replayKey: replayKeySnapshot,
              retainUntilMs: retainUntilSnapshot,
            },
            { session },
          );
          await this.capacity.updateOne({ _id: CAPACITY_ID }, { $set: { entries: entries + 1 } }, { session });
          return 'reserved' as const;
        },
        { readConcern: { level: 'snapshot' } },
      );
      if (result === 'reserved' || result === 'duplicate' || result === 'expired') {
        return result;
      }
      throw new AttestationMongoStoreError('Attestation MongoDB reservation did not commit.');
    } catch (error) {
      if (
        error instanceof AttestationCapacityError ||
        error instanceof AttestationProtocolError ||
        error instanceof AttestationMongoStoreError
      ) {
        throw error;
      }
      throw new AttestationMongoStoreError(
        error instanceof Error
          ? `Attestation MongoDB reservation failed: ${error.message}`
          : 'Attestation MongoDB reservation failed.',
      );
    } finally {
      await session.endSession();
    }
  }

  private validateCapacity(row: unknown): void {
    if (
      row === null ||
      typeof row !== 'object' ||
      (row as CapacityDocument)._id !== CAPACITY_ID ||
      (row as CapacityDocument).kind !== 'capacity' ||
      (row as CapacityDocument).maxEntries !== this.maxEntries ||
      (row as CapacityDocument).proofsCollectionName !== this.proofs.collectionName ||
      !Number.isSafeInteger((row as CapacityDocument).entries) ||
      ((row as CapacityDocument).entries as number) < 0 ||
      ((row as CapacityDocument).entries as number) > this.maxEntries ||
      !Number.isSafeInteger((row as CapacityDocument).revision)
    ) {
      throw new AttestationMongoStoreError(
        'Attestation MongoDB replay capacity configuration/accounting is inconsistent.',
      );
    }
  }

  private validateReservation(row: CapacityDocument): void {
    if (
      row.kind !== 'reservation' ||
      typeof row.replayKey !== 'string' ||
      row._id !== reservationId(row.replayKey) ||
      !Number.isSafeInteger(row.retainUntilMs) ||
      (row.retainUntilMs as number) < 0
    ) {
      throw new AttestationMongoStoreError('Attestation MongoDB replay expiry accounting is malformed.');
    }
  }

  private validateProof(row: ProofDocument, replayKey: string): void {
    if (row._id !== replayKey || !Number.isSafeInteger(row.retainUntilMs) || row.retainUntilMs < 0) {
      throw new AttestationMongoStoreError('Attestation MongoDB replay proof is malformed.');
    }
  }
}

/**
 * Create a shared bounded attestation replay store over two MongoDB
 * collections.
 *
 * Pass a `Db` from an already-connected caller-owned `MongoClient`; the
 * store never connects, disconnects, or attaches listeners. All clients
 * sharing one database/collections must configure identical `maxEntries`
 * and synchronized clocks. Production deployments require a replica set
 * (transactions). Create a non-TTL index on `retainUntilMs` for the bounded
 * expiry queries; never add a TTL index to the accounting collection.
 */
export function createMongoAttestationStore(options: CreateMongoAttestationStoreOptions): AttestationStore {
  return new MongoAttestationStore(options);
}

export { AttestationCapacityError };
