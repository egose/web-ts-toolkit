import { OidcVaultDpopReplayCapacityError } from '@web-ts-toolkit/express-oidc-vault';
import type { ReserveDpopProofInput } from '@web-ts-toolkit/express-oidc-vault';
import type { Collection, Db } from 'mongodb';
import type { DpopProofDocument, DpopReplayCapacityDocument } from './documents';

const CAPACITY_ID = 'capacity';
const reservationId = (replayKey: string): string => `proof:${replayKey}`;
const isDate = (value: unknown): value is Date => value instanceof Date && Number.isFinite(value.getTime());

/** Shared serialization row + one durable expiry-accounting row per reservation. TTL touches proofs only. */
export class MongoDpopReplayReservations {
  constructor(
    private readonly db: Db,
    private readonly proofs: Collection<DpopProofDocument>,
    private readonly capacity: Collection<DpopReplayCapacityDocument>,
    private readonly maxEntries: number,
    private readonly now: () => number,
  ) {}

  async initialize(): Promise<void> {
    const indexes = await this.capacity.listIndexes().toArray();
    if (indexes.some((index) => index.expireAfterSeconds !== undefined)) {
      throw new Error('OIDC vault MongoDB replay capacity accounting must not have TTL indexes.');
    }
    try {
      await this.capacity.updateOne(
        { _id: CAPACITY_ID },
        {
          $setOnInsert: {
            kind: 'capacity',
            entries: 0,
            revision: 0,
            maxEntries: this.maxEntries,
            proofsCollectionName: this.proofs.collectionName,
          },
        },
        { upsert: true },
      );
    } catch (error) {
      if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 11000)) throw error;
    }
    this.validateCapacity(await this.capacity.findOne({ _id: CAPACITY_ID }));
  }

  async reserve(input: ReserveDpopProofInput): Promise<boolean> {
    if (!this.validWindow(input, this.now())) return false;
    const session = this.db.client.startSession();
    try {
      const result = await session.withTransaction(
        async () => {
          const now = this.now();
          if (!this.validWindow(input, now)) return false;
          // An actual write, not a no-op lock: independent clients contend here
          // and the driver's transaction retry starts a fresh snapshot.
          const capacity = await this.capacity.findOneAndUpdate(
            { _id: CAPACITY_ID },
            { $inc: { revision: 1 } },
            { session, returnDocument: 'after' },
          );
          this.validateCapacity(capacity);
          const proof = await this.proofs.findOne({ _id: input.replayKey }, { session });
          if (proof && !isDate(proof.expiresAt))
            throw new Error('OIDC vault MongoDB replay proof has malformed expiry.');
          if (proof && proof.expiresAt.getTime() > now) return false;
          const id = reservationId(input.replayKey);
          const existing = await this.capacity.findOne({ _id: id }, { session });
          if (existing) {
            this.validateReservation(existing);
            // The ledger also protects a live key if a physical proof row was
            // removed externally. Missing replay state never grants a bypass.
            if (existing.expiresAt!.getTime() > now) return false;
          }

          let removed = 0;
          if (existing) removed += (await this.capacity.deleteOne({ _id: id }, { session })).deletedCount;
          const expired = await this.capacity
            .find({ kind: 'reservation', expiresAt: { $lte: new Date(now) } }, { session })
            .sort({ expiresAt: 1 })
            .limit(64)
            .toArray();
          for (const row of expired) this.validateReservation(row);
          if (expired.length > 0) {
            removed += (
              await this.capacity.deleteMany(
                { _id: { $in: expired.map((row) => row._id) }, kind: 'reservation' },
                { session },
              )
            ).deletedCount;
            await this.proofs.deleteMany(
              { _id: { $in: expired.map((row) => row.replayKey!) }, expiresAt: { $lte: new Date(now) } },
              { session },
            );
          }
          const entries = capacity!.entries! - removed;
          if (!Number.isSafeInteger(entries) || entries < 0)
            throw new Error('OIDC vault MongoDB replay capacity accounting is inconsistent.');
          if (entries >= this.maxEntries) throw new OidcVaultDpopReplayCapacityError();

          await this.proofs.replaceOne(
            { _id: input.replayKey },
            { expiresAt: new Date(input.expiresAt) },
            { upsert: true, session },
          );
          await this.capacity.insertOne(
            { _id: id, kind: 'reservation', replayKey: input.replayKey, expiresAt: new Date(input.expiresAt) },
            { session },
          );
          await this.capacity.updateOne({ _id: CAPACITY_ID }, { $set: { entries: entries + 1 } }, { session });
          return true;
        },
        { readConcern: { level: 'snapshot' } },
      );
      return result === true;
    } finally {
      await session.endSession();
    }
  }

  private validWindow(input: ReserveDpopProofInput, now: number): boolean {
    if (!Number.isFinite(now)) throw new Error('OIDC vault DPoP replay store clock is invalid.');
    return (
      typeof input.replayKey === 'string' &&
      Number.isSafeInteger(input.expiresAt) &&
      input.expiresAt > now &&
      input.expiresAt - now <= 360_000
    );
  }

  private validateCapacity(row: DpopReplayCapacityDocument | null): void {
    if (
      !row ||
      row.kind !== 'capacity' ||
      row.maxEntries !== this.maxEntries ||
      row.proofsCollectionName !== this.proofs.collectionName ||
      !Number.isSafeInteger(row.entries) ||
      row.entries! < 0 ||
      row.entries! > this.maxEntries ||
      !Number.isSafeInteger(row.revision)
    ) {
      throw new Error('OIDC vault MongoDB replay capacity configuration/accounting is inconsistent.');
    }
  }

  private validateReservation(row: DpopReplayCapacityDocument): void {
    if (
      row.kind !== 'reservation' ||
      typeof row.replayKey !== 'string' ||
      row._id !== reservationId(row.replayKey) ||
      !isDate(row.expiresAt)
    ) {
      throw new Error('OIDC vault MongoDB replay expiry accounting is malformed.');
    }
  }
}
