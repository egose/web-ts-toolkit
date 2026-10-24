import {
  OidcVaultLogoutNavigationCapacityError,
  OidcVaultStoreConflictError,
} from '@web-ts-toolkit/express-oidc-vault';
import type {
  ConsumeLogoutNavigationTicketInput,
  OidcVaultLogoutNavigationTicket,
} from '@web-ts-toolkit/express-oidc-vault';
import type { Collection, Db } from 'mongodb';
import {
  assertTicket,
  ticketId,
  ticketNow,
  usableEpoch,
  validTicket,
  validTicketIdentity,
} from './logout-ticket-validation';

export type LogoutTicketDocument = Omit<OidcVaultLogoutNavigationTicket, 'expiresAt'> & {
  _id: string;
  expiresAt: Date;
};
export type LogoutTicketConfig = { _id: string; capacityCollectionName: string; maxEntries: number };
export type LogoutCapacityDocument = {
  _id: string;
  kind: 'capacity' | 'ticket';
  ticketsCollectionName?: string;
  maxEntries?: number;
  entries?: number;
  revision?: number;
  namespace?: string;
  ticketHash?: string;
  expiresAt?: Date;
};
const CONFIG = 'configuration';
const CAPACITY = 'capacity';
const ledgerId = (id: string): string => `ticket:${id}`;
const accountingError = (): Error =>
  new Error('OIDC vault MongoDB logout navigation configuration/accounting is inconsistent.');
const isDate = (date: unknown): date is Date => date instanceof Date && usableEpoch(date.getTime());

/** Transactions serialize through one actual capacity-row write; TTL never touches the ledger. */
export class MongoLogoutNavigationTickets {
  constructor(
    private readonly db: Db,
    private readonly tickets: Collection<LogoutTicketDocument | LogoutTicketConfig>,
    private readonly capacity: Collection<LogoutCapacityDocument>,
    private readonly maxEntries: number,
    private readonly now: () => number,
  ) {}

  async initialize(): Promise<void> {
    if ((await this.capacity.listIndexes().toArray()).some((index) => index.expireAfterSeconds !== undefined))
      throw new Error('OIDC vault MongoDB logout navigation capacity accounting must not have TTL indexes.');
    // Bind in both directions: sharing either collection with a differently
    // paired store must fail readiness rather than split capacity accounting.
    for (const initialize of [
      () =>
        this.tickets.updateOne(
          { _id: CONFIG },
          { $setOnInsert: { capacityCollectionName: this.capacity.collectionName, maxEntries: this.maxEntries } },
          { upsert: true },
        ),
      () =>
        this.capacity.updateOne(
          { _id: CAPACITY },
          {
            $setOnInsert: {
              kind: 'capacity',
              ticketsCollectionName: this.tickets.collectionName,
              maxEntries: this.maxEntries,
              entries: 0,
              revision: 0,
            },
          },
          { upsert: true },
        ),
    ]) {
      try {
        await initialize();
      } catch (error) {
        if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 11000)) throw error;
      }
    }
    this.validateConfig(await this.tickets.findOne({ _id: CONFIG }));
    this.validateCapacity(await this.capacity.findOne({ _id: CAPACITY }));
  }

  create(record: OidcVaultLogoutNavigationTicket): Promise<void> {
    assertTicket(record, ticketNow(this.now()));
    return this.perform(record, record).then(() => undefined);
  }

  consume(identity: ConsumeLogoutNavigationTicketInput): Promise<OidcVaultLogoutNavigationTicket | null> {
    return this.perform(identity);
  }

  private async perform(
    identity: ConsumeLogoutNavigationTicketInput,
    creating?: OidcVaultLogoutNavigationTicket,
  ): Promise<OidcVaultLogoutNavigationTicket | null> {
    const id = ticketId(identity);
    const session = this.db.client.startSession();
    try {
      const result = await session.withTransaction(
        async () => {
          const capacity = await this.capacity.findOneAndUpdate(
            { _id: CAPACITY },
            { $inc: { revision: 1 } },
            { session, returnDocument: 'after' },
          );
          this.validateCapacity(capacity);
          this.validateConfig(await this.tickets.findOne({ _id: CONFIG }, { session }));
          // Counts are independent of payload TTL. Check corruption before any
          // successful consume; a forged/underflowed counter cannot grant authority.
          if ((await this.capacity.countDocuments({ _id: { $ne: CAPACITY } }, { session })) !== capacity!.entries)
            throw accountingError();
          const now = ticketNow(this.now());
          if (creating) assertTicket(creating, now);
          const payload = await this.tickets.findOne({ _id: id }, { session });
          const selected = await this.capacity.findOne({ _id: ledgerId(id) }, { session });
          if (selected) this.validateLedger(selected);
          if (payload && !selected) throw accountingError();
          const record =
            payload && 'expiresAt' in payload && isDate(payload.expiresAt) && Object.keys(payload).length === 6
              ? {
                  namespace: payload.namespace,
                  ticketHash: payload.ticketHash,
                  upstreamLogoutUrl: payload.upstreamLogoutUrl,
                  createdAt: payload.createdAt,
                  expiresAt: payload.expiresAt.getTime(),
                }
              : null;
          const valid = record && validTicket(record, now) && ticketId(record) === id;
          if (valid && selected!.expiresAt!.getTime() !== record.expiresAt) throw accountingError();
          // A live ledger protects an identity even after early payload loss.
          if (creating && selected && selected.expiresAt!.getTime() > now && (!payload || valid))
            throw new OidcVaultStoreConflictError();
          const expired = await this.capacity
            .find({ kind: 'ticket', _id: { $ne: ledgerId(id) }, expiresAt: { $lte: new Date(now) } }, { session })
            .sort({ expiresAt: 1 })
            .limit(64)
            .toArray();
          for (const row of expired) this.validateLedger(row);
          if (expired.length) {
            const payloads = await this.tickets
              .find(
                {
                  _id: {
                    $in: expired.map((row) => ticketId({ namespace: row.namespace!, ticketHash: row.ticketHash! })),
                  },
                },
                { session },
              )
              .toArray();
            // A corrupt overdue ledger must not evict a still-live payload.
            for (const payload of payloads)
              if ('expiresAt' in payload && isDate(payload.expiresAt) && payload.expiresAt.getTime() > now)
                throw accountingError();
          }
          const retired = [...expired, ...(selected ? [selected] : [])];
          if (retired.length) {
            const removed = await this.capacity.deleteMany(
              { _id: { $in: retired.map((row) => row._id) } },
              { session },
            );
            if (removed.deletedCount !== retired.length) throw accountingError();
            await this.tickets.deleteMany(
              {
                _id: {
                  $in: retired.map((row) => ticketId({ namespace: row.namespace!, ticketHash: row.ticketHash! })),
                },
              },
              { session },
            );
          }
          const entries = capacity!.entries! - retired.length;
          if (entries < 0) throw accountingError();
          if (creating) {
            if (entries >= this.maxEntries) throw new OidcVaultLogoutNavigationCapacityError();
            await this.tickets.insertOne(
              { _id: id, ...creating, expiresAt: new Date(creating.expiresAt) },
              { session },
            );
            await this.capacity.insertOne(
              {
                _id: ledgerId(id),
                kind: 'ticket',
                namespace: identity.namespace,
                ticketHash: identity.ticketHash,
                expiresAt: new Date(creating.expiresAt),
              },
              { session },
            );
          }
          await this.capacity.updateOne(
            { _id: CAPACITY },
            { $set: { entries: entries + (creating ? 1 : 0) } },
            { session },
          );
          // Recheck after all asynchronous work, immediately before commit. The
          // returned record cannot outlive a clock advanced during the transaction.
          const finalNow = ticketNow(this.now());
          if (creating) assertTicket(creating, finalNow);
          return !creating && valid && validTicket(record, finalNow) ? record : null;
        },
        { readPreference: 'primary', readConcern: { level: 'snapshot' } },
      );
      return result ?? null;
    } finally {
      await session.endSession();
    }
  }

  private validateConfig(row: LogoutTicketDocument | LogoutTicketConfig | null): void {
    if (
      !row ||
      !('capacityCollectionName' in row) ||
      row.capacityCollectionName !== this.capacity.collectionName ||
      row.maxEntries !== this.maxEntries
    )
      throw accountingError();
  }

  private validateCapacity(row: LogoutCapacityDocument | null): void {
    if (
      !row ||
      row.kind !== 'capacity' ||
      row.maxEntries !== this.maxEntries ||
      row.ticketsCollectionName !== this.tickets.collectionName ||
      !Number.isSafeInteger(row.entries) ||
      row.entries! < 0 ||
      row.entries! > this.maxEntries ||
      !Number.isSafeInteger(row.revision) ||
      row.revision! < 0
    )
      throw accountingError();
  }

  private validateLedger(row: LogoutCapacityDocument): void {
    const identity = { namespace: row.namespace!, ticketHash: row.ticketHash! };
    if (
      row.kind !== 'ticket' ||
      !validTicketIdentity(identity) ||
      row._id !== ledgerId(ticketId(identity)) ||
      !isDate(row.expiresAt)
    )
      throw accountingError();
  }
}
