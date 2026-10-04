import {
  OidcVaultStoreConflictError,
  type ConsumeBackchannelLogoutTokenJtiInput,
  type ConsumeAuthorizationTransactionIfMatchesInput,
  type ConsumeExchangeCodeIfMatchesInput,
  type DeleteSessionsByLogicalSessionIdInput,
  type DeleteSessionsByProviderSessionIdInput,
  type DeleteSessionsBySubjectInput,
  type ExchangeCodeRecord,
  type ExchangeCodeRecordInput,
  type AuthorizationTransaction,
  type AuthorizationTransactionInput,
  type OidcVaultSession,
  type OidcVaultSessionInput,
  type OidcVaultSessionRevocationContext,
  type ReserveDpopProofInput,
  type RotateSessionInput,
} from '@web-ts-toolkit/express-oidc-vault';
import type { ClientSession, Collection, Db, Filter } from 'mongodb';
import { isDeepStrictEqual } from 'node:util';
import {
  authorizationDocumentToRecord,
  authorizationTransactionToDocument,
  documentToSession,
  exchangeCodeToDocument,
  exchangeDocumentToRecord,
  isExpired,
  sessionToDocument,
  validAuthorizationDocument,
  validExchangeDocument,
  validSessionDocument,
  type DpopProofDocument,
  type DpopReplayCapacityDocument,
  type AuthorizationTransactionDocument,
  type BackchannelLogoutTokenJtiDocument,
  type ExchangeCodeDocument,
  type ExpirableDocument,
  type RotatedSessionAliasDocument,
  type SessionDocument,
} from './documents';
import {
  DEFAULT_ROTATED_SESSION_ALIAS_RETENTION_MS,
  resolveCollectionNames,
  type MongoOidcVaultStoreOptions,
  type OidcVaultMongoStoreProvider,
} from './options';
import { assertTransactionSupport, ensureStoreIndexes } from './topology';
import {
  assertRecordBinding,
  assertSessionBinding,
  assertSameLineageAuthority,
  bindingMatchFilter,
  inheritSessionBinding,
  isBindingMatch,
  toRevocationContext,
  type SessionAuthority,
} from './binding';
import { MongoDpopReplayReservations } from './dpop-replay';

// Own portable containers before yielding, without coercing native BSON values
// or custom serialization hooks. Opaque, non-plain values retain backend semantics;
// the ownership guarantee applies to the documented JSON-portable value domain.
const snapshotInput = <T>(input: T, seen = new WeakMap<object, unknown>()): T => {
  if (input === null || typeof input !== 'object') return input;
  const prototype = Object.getPrototypeOf(input);
  if (!Array.isArray(input) && prototype !== Object.prototype && prototype !== null) return input;
  if (seen.has(input)) return seen.get(input) as T;
  const copy = (Array.isArray(input) ? new Array(input.length) : Object.create(prototype)) as T;
  seen.set(input, copy);
  for (const key of Reflect.ownKeys(input)) {
    if (Object.prototype.propertyIsEnumerable.call(input, key)) {
      Object.defineProperty(copy, key, {
        value: snapshotInput(Reflect.get(input, key), seen),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
  }
  return copy;
};

const toSubjectDeleteInput = (input: string | DeleteSessionsBySubjectInput): DeleteSessionsBySubjectInput =>
  typeof input === 'string' ? { subject: input } : { ...input };

const toProviderSessionDeleteInput = (
  input: string | DeleteSessionsByProviderSessionIdInput,
): DeleteSessionsByProviderSessionIdInput => (typeof input === 'string' ? { providerSessionId: input } : { ...input });

const toLogicalSessionDeleteInput = (
  input: string | DeleteSessionsByLogicalSessionIdInput,
): DeleteSessionsByLogicalSessionIdInput => (typeof input === 'string' ? { logicalSessionId: input } : { ...input });

const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;

const isSameSessionDocumentGeneration = (current: SessionDocument, expected: SessionDocument): boolean =>
  current._id === expected._id &&
  (current.logicalSessionId ?? current._id) === (expected.logicalSessionId ?? expected._id) &&
  current.subject === expected.subject &&
  current.providerSessionId === expected.providerSessionId &&
  isDeepStrictEqual(
    current.deviceBinding === undefined && current.provider === null ? undefined : current.provider,
    expected.provider,
  ) &&
  isDeepStrictEqual(current.deviceBinding, expected.deviceBinding) &&
  current.refreshToken === expected.refreshToken &&
  current.idToken === expected.idToken &&
  current.accessToken === expected.accessToken &&
  current.scope === expected.scope &&
  (current.expiresAt?.getTime() ?? null) === (expected.expiresAt?.getTime() ?? null) &&
  current.createdAt === expected.createdAt &&
  current.updatedAt === expected.updatedAt &&
  isDeepStrictEqual(current.user, expected.user) &&
  isDeepStrictEqual(current.metadata, expected.metadata);

export class MongoOidcVaultStore implements OidcVaultMongoStoreProvider {
  private readonly db: Db;
  private readonly authorizationTransactions: Collection<AuthorizationTransactionDocument>;
  private readonly exchangeCodes: Collection<ExchangeCodeDocument>;
  private readonly sessions: Collection<SessionDocument>;
  private readonly backchannelLogoutTokenJtis: Collection<BackchannelLogoutTokenJtiDocument>;
  private readonly rotatedSessionAliases: Collection<RotatedSessionAliasDocument>;
  private readonly dpopProofs: Collection<DpopProofDocument>;
  private readonly dpopReplayCapacity: Collection<DpopReplayCapacityDocument>;
  private readonly dpopReplay: MongoDpopReplayReservations;
  private readonly now: () => number;
  private readonly rotatedSessionAliasRetentionMs: number;
  private readonly initialization: Promise<void>;
  private initializationError: unknown;

  constructor(options: MongoOidcVaultStoreOptions) {
    const collectionNames = resolveCollectionNames(options);
    const maxEntries = options.dpopReplayMaxEntries === undefined ? 100_000 : options.dpopReplayMaxEntries;
    if (!Number.isSafeInteger(maxEntries) || maxEntries <= 0) {
      throw new TypeError('OIDC vault DPoP replay maximum entries must be a positive safe integer.');
    }

    this.db = options.db;
    this.authorizationTransactions = options.db.collection<AuthorizationTransactionDocument>(
      collectionNames.authorizationTransactions,
    );
    this.exchangeCodes = options.db.collection<ExchangeCodeDocument>(collectionNames.exchangeCodes);
    this.sessions = options.db.collection<SessionDocument>(collectionNames.sessions);
    this.backchannelLogoutTokenJtis = options.db.collection<BackchannelLogoutTokenJtiDocument>(
      collectionNames.backchannelLogoutTokenJtis,
    );
    this.rotatedSessionAliases = options.db.collection<RotatedSessionAliasDocument>(
      collectionNames.rotatedSessionAliases,
    );
    this.dpopProofs = options.db.collection<DpopProofDocument>(collectionNames.dpopProofs);
    this.dpopReplayCapacity = options.db.collection<DpopReplayCapacityDocument>(collectionNames.dpopReplayCapacity);
    this.rotatedSessionAliasRetentionMs =
      options.rotatedSessionAliasRetentionMs ?? DEFAULT_ROTATED_SESSION_ALIAS_RETENTION_MS;

    if (!Number.isFinite(this.rotatedSessionAliasRetentionMs) || this.rotatedSessionAliasRetentionMs <= 0) {
      throw new TypeError('OIDC vault rotated session alias retention must be a finite positive duration.');
    }

    this.now = options.now ?? (() => Date.now());
    this.dpopReplay = new MongoDpopReplayReservations(
      this.db,
      this.dpopProofs,
      this.dpopReplayCapacity,
      maxEntries,
      this.now,
    );
    this.initialization = this.initialize().then(undefined, (error: unknown) => {
      this.initializationError = error;
    });
  }

  async ready(): Promise<void> {
    await this.waitUntilReady();
  }

  async createAuthorizationTransaction(input: AuthorizationTransactionInput): Promise<void> {
    input = snapshotInput({ ...input });
    assertRecordBinding(input);
    await this.waitUntilReady();
    await this.authorizationTransactions.replaceOne({ _id: input.state }, authorizationTransactionToDocument(input), {
      upsert: true,
    });
  }

  async consumeAuthorizationTransaction(state: string): Promise<AuthorizationTransaction | null> {
    await this.waitUntilReady();
    const record = await this.authorizationTransactions.findOneAndDelete({
      _id: state,
      deviceBinding: { $exists: false },
      browserBindingHash: { $exists: false },
    });

    if (!record || !validAuthorizationDocument(record, state) || isExpired(record, this.now())) {
      return null;
    }

    return authorizationDocumentToRecord(record);
  }

  async getAuthorizationTransaction(state: string): Promise<AuthorizationTransaction | null> {
    await this.waitUntilReady();
    const record = await this.authorizationTransactions.findOne({ _id: state });
    return record && validAuthorizationDocument(record, state) && !isExpired(record, this.now())
      ? authorizationDocumentToRecord(record)
      : null;
  }

  async consumeAuthorizationTransactionIfMatches(
    input: ConsumeAuthorizationTransactionIfMatchesInput,
  ): Promise<AuthorizationTransaction | null> {
    input = snapshotInput({ ...input });
    if (!isBindingMatch(input.match)) return null;
    await this.waitUntilReady();
    const record = await this.authorizationTransactions.findOneAndDelete({
      _id: input.state,
      expiresAt: { $gt: new Date(this.now()) },
      ...bindingMatchFilter(input.match),
    });
    return record && validAuthorizationDocument(record, input.state) && !isExpired(record, this.now())
      ? authorizationDocumentToRecord(record)
      : null;
  }

  async createExchangeCode(input: ExchangeCodeRecordInput): Promise<void> {
    input = snapshotInput({ ...input });
    assertRecordBinding(input);
    await this.waitUntilReady();
    await this.exchangeCodes.replaceOne({ _id: input.code }, exchangeCodeToDocument(input), { upsert: true });
  }

  async consumeExchangeCode(code: string): Promise<ExchangeCodeRecord | null> {
    await this.waitUntilReady();
    const record = await this.exchangeCodes.findOneAndDelete({
      _id: code,
      deviceBinding: { $exists: false },
      browserBindingHash: { $exists: false },
    });

    if (!record || !validExchangeDocument(record, code) || isExpired(record, this.now())) {
      return null;
    }

    return exchangeDocumentToRecord(record);
  }

  async getExchangeCode(code: string): Promise<ExchangeCodeRecord | null> {
    await this.waitUntilReady();
    const record = await this.exchangeCodes.findOne({ _id: code });
    return record && validExchangeDocument(record, code) && !isExpired(record, this.now())
      ? exchangeDocumentToRecord(record)
      : null;
  }

  async consumeExchangeCodeIfMatches(input: ConsumeExchangeCodeIfMatchesInput): Promise<ExchangeCodeRecord | null> {
    input = snapshotInput({ ...input });
    if (!isBindingMatch(input.match) || typeof input.expectedSessionId !== 'string') return null;
    await this.waitUntilReady();
    const record = await this.exchangeCodes.findOneAndDelete({
      _id: input.code,
      sessionId: input.expectedSessionId,
      expiresAt: { $gt: new Date(this.now()) },
      ...bindingMatchFilter(input.match),
    });
    return record && validExchangeDocument(record, input.code) && !isExpired(record, this.now())
      ? exchangeDocumentToRecord(record)
      : null;
  }

  async createSession(input: OidcVaultSessionInput): Promise<OidcVaultSession> {
    input = snapshotInput({ ...input });
    assertSessionBinding(input);
    await this.waitUntilReady();
    const timestamp = this.now();
    const session: OidcVaultSession = {
      ...input,
      logicalSessionId: input.logicalSessionId ?? input.sessionId,
      createdAt: input.createdAt ?? timestamp,
      updatedAt: input.updatedAt ?? timestamp,
    };

    await this.sessions.replaceOne({ _id: session.sessionId }, sessionToDocument(session), { upsert: true });
    return session;
  }

  async getSession(sessionId: string): Promise<OidcVaultSession | null> {
    await this.waitUntilReady();
    const session = await this.sessions.findOne({ _id: sessionId });

    if (
      !session ||
      !validSessionDocument(session, sessionId) ||
      (await this.isExpiredAndCleanup(this.sessions, session))
    ) {
      return null;
    }

    return documentToSession(session);
  }

  async getSessionRevocationContext(sessionId: string): Promise<OidcVaultSessionRevocationContext | null> {
    await this.waitUntilReady();
    const transaction = this.db.client.startSession();
    const projection = { _id: 1, logicalSessionId: 1, subject: 1, provider: 1, deviceBinding: 1, expiresAt: 1 };
    try {
      return (
        (await transaction.withTransaction(
          async () => {
            const now = this.now();
            const live = await this.sessions.findOne({ _id: sessionId }, { session: transaction, projection });
            let logicalSessionId: string | undefined;
            if (live) {
              toRevocationContext(live);
              if (!isExpired(live, now)) logicalSessionId = live.logicalSessionId ?? live._id;
            }
            if (logicalSessionId === undefined) {
              const alias = await this.rotatedSessionAliases.findOne({ _id: sessionId }, { session: transaction });
              if (!alias || isExpired(alias, now)) return null;
              if (
                typeof alias.logicalSessionId !== 'string' ||
                !(alias.expiresAt instanceof Date) ||
                !Number.isFinite(alias.expiresAt.getTime())
              ) {
                throw new Error('OIDC vault MongoDB store has malformed revocation alias.');
              }
              logicalSessionId = alias.logicalSessionId;
            }
            const members = await this.sessions
              .find(
                { $or: [{ logicalSessionId }, { logicalSessionId: { $exists: false }, _id: logicalSessionId }] },
                { session: transaction, projection },
              )
              .toArray();
            let source: SessionAuthority | undefined;
            for (const member of members) {
              toRevocationContext(member);
              if (isExpired(member, now)) continue;
              if (source) assertSameLineageAuthority(source, member);
              else source = member;
            }
            return source ? toRevocationContext(source) : null;
          },
          { readConcern: { level: 'snapshot' } },
        )) ?? null
      );
    } finally {
      await transaction.endSession();
    }
  }

  async reserveDpopProof(input: ReserveDpopProofInput): Promise<boolean> {
    input = { replayKey: input.replayKey, expiresAt: input.expiresAt };
    await this.waitUntilReady();
    return this.dpopReplay.reserve(input);
  }

  async rotateSession(input: RotateSessionInput): Promise<OidcVaultSession> {
    input = { sessionId: input.sessionId, nextSession: snapshotInput({ ...input.nextSession }) };
    assertSessionBinding(input.nextSession);
    await this.waitUntilReady();

    if (input.nextSession.sessionId === input.sessionId) {
      throw new OidcVaultStoreConflictError('OIDC vault session rotation target must use a different session ID.');
    }

    try {
      return await this.rotateSessionWithTransaction(input);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new OidcVaultStoreConflictError('OIDC vault session rotation target already exists.');
      }

      throw error;
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.waitUntilReady();
    const session = await this.sessions.findOne({ _id: sessionId });

    if (session) {
      const logicalSessionId = session.logicalSessionId ?? session._id;
      const result = await this.sessions.deleteOne({ _id: sessionId });

      if (result.deletedCount === 1) {
        await this.deleteAliasesForInactiveLogicalSessions([logicalSessionId]);
        return;
      }

      const alias = await this.rotatedSessionAliases.findOne({ _id: sessionId });

      if (alias && !isExpired(alias, this.now())) {
        await this.deleteSessionsByLogicalSessionId(alias.logicalSessionId);
      }

      return;
    }

    const alias = await this.rotatedSessionAliases.findOne({ _id: sessionId });

    if (alias && !isExpired(alias, this.now())) {
      await this.deleteSessionsByLogicalSessionId(alias.logicalSessionId);
    }
  }

  async deleteSessionsByLogicalSessionId(input: string | DeleteSessionsByLogicalSessionIdInput): Promise<number> {
    const resolved = toLogicalSessionDeleteInput(input);
    await this.waitUntilReady();
    const result = await this.sessions.deleteMany({ logicalSessionId: resolved.logicalSessionId });
    await this.deleteAliasesForInactiveLogicalSessions([resolved.logicalSessionId]);
    return result.deletedCount;
  }

  async consumeBackchannelLogoutTokenJti(input: ConsumeBackchannelLogoutTokenJtiInput): Promise<boolean> {
    input = { ...input };
    await this.waitUntilReady();
    const now = this.now();

    if (!Number.isFinite(input.expiresAt) || input.expiresAt <= now) {
      return false;
    }

    const replacedExpired = await this.backchannelLogoutTokenJtis.findOneAndUpdate(
      {
        _id: input.jti,
        expiresAt: { $lte: new Date(now) },
      },
      {
        $set: { expiresAt: new Date(input.expiresAt) },
      },
      { returnDocument: 'after' },
    );

    if (replacedExpired) {
      return true;
    }

    try {
      await this.backchannelLogoutTokenJtis.insertOne({
        _id: input.jti,
        expiresAt: new Date(input.expiresAt),
      });
      return true;
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return false;
      }

      throw error;
    }
  }

  async deleteSessionsBySubject(input: string | DeleteSessionsBySubjectInput): Promise<number> {
    const resolved = toSubjectDeleteInput(input);
    await this.waitUntilReady();
    const filter: Filter<SessionDocument> = { subject: resolved.subject };

    if (resolved.issuer !== undefined) {
      filter['provider.issuer'] = resolved.issuer;
    }

    if (resolved.clientId !== undefined) {
      filter['provider.clientId'] = resolved.clientId;
    }

    const result = await this.deleteSessionsAndAliasesByFilter(filter);
    return result.deletedCount;
  }

  async deleteSessionsByProviderSessionId(input: string | DeleteSessionsByProviderSessionIdInput): Promise<number> {
    const resolved = toProviderSessionDeleteInput(input);
    await this.waitUntilReady();
    const filter: Filter<SessionDocument> = { providerSessionId: resolved.providerSessionId };

    if (resolved.issuer !== undefined) {
      filter['provider.issuer'] = resolved.issuer;
    }

    if (resolved.clientId !== undefined) {
      filter['provider.clientId'] = resolved.clientId;
    }

    const result = await this.deleteSessionsAndAliasesByFilter(filter);
    return result.deletedCount;
  }

  private async initialize(): Promise<void> {
    await Promise.all([
      ensureStoreIndexes({
        authorizationTransactions: this.authorizationTransactions,
        exchangeCodes: this.exchangeCodes,
        sessions: this.sessions,
        backchannelLogoutTokenJtis: this.backchannelLogoutTokenJtis,
        rotatedSessionAliases: this.rotatedSessionAliases,
        dpopProofs: this.dpopProofs,
        dpopReplayCapacity: this.dpopReplayCapacity,
      }),
      assertTransactionSupport(this.db),
    ]);
    await this.dpopReplay.initialize();
  }

  private async waitUntilReady(): Promise<void> {
    await this.initialization;

    if (this.initializationError !== undefined) {
      throw this.initializationError;
    }
  }

  private async rotateSessionWithTransaction(input: RotateSessionInput): Promise<OidcVaultSession> {
    const { previous, nextSession } = await this.normalizeRotatedSession(input);
    const expectedSource = sessionToDocument(previous);
    const session = this.db.client.startSession();

    try {
      await session.withTransaction(async () => {
        const current = await this.sessions.findOne({ _id: input.sessionId }, { session });

        if (!current || isExpired(current, this.now())) {
          throw new OidcVaultStoreConflictError('OIDC vault session no longer exists for rotation.');
        }

        if (!isSameSessionDocumentGeneration(current, expectedSource)) {
          throw new OidcVaultStoreConflictError('OIDC vault session changed before rotation could commit.');
        }

        await this.sessions.insertOne(sessionToDocument(nextSession), { session });

        const deleteResult = await this.sessions.deleteOne({ _id: input.sessionId }, { session });

        if (deleteResult.deletedCount !== 1) {
          throw new OidcVaultStoreConflictError('OIDC vault session no longer exists for rotation.');
        }

        await this.createRotatedSessionAlias(input.sessionId, nextSession, session);
      });

      return nextSession;
    } finally {
      await session.endSession();
    }
  }

  private async createRotatedSessionAlias(
    previousSessionId: string,
    nextSession: OidcVaultSession,
    session?: ClientSession,
  ): Promise<void> {
    const logicalSessionId = nextSession.logicalSessionId ?? nextSession.sessionId;
    const now = this.now();

    await this.rotatedSessionAliases.deleteMany({ logicalSessionId, expiresAt: { $lte: new Date(now) } }, { session });

    await this.rotatedSessionAliases.updateOne(
      { _id: previousSessionId },
      {
        $set: {
          logicalSessionId,
          expiresAt: this.getRotatedSessionAliasExpiresAt(nextSession, now),
        },
        // A no-op alias update would not conflict with an older cleanup
        // snapshot. Every rotation must write, even with identical values.
        $inc: { revision: 1 },
      },
      { upsert: true, session },
    );
  }

  private async normalizeRotatedSession(
    input: RotateSessionInput,
  ): Promise<{ previous: OidcVaultSession; nextSession: OidcVaultSession }> {
    const previous = await this.getSession(input.sessionId);

    if (!previous) {
      throw new OidcVaultStoreConflictError('OIDC vault session no longer exists for rotation.');
    }

    inheritSessionBinding(previous, input.nextSession);
    return {
      previous,
      nextSession: {
        ...input.nextSession,
        logicalSessionId: input.nextSession.logicalSessionId ?? previous.logicalSessionId ?? input.sessionId,
      },
    };
  }

  private async deleteSessionsAndAliasesByFilter(filter: Filter<SessionDocument>): Promise<{ deletedCount: number }> {
    let deletedCount = 0;

    for (;;) {
      const sessions = await this.sessions
        .find(filter)
        .project<Pick<SessionDocument, 'logicalSessionId' | '_id'>>({
          _id: 1,
          logicalSessionId: 1,
        })
        .toArray();
      const logicalSessionIds = [...new Set(sessions.map((session) => session.logicalSessionId ?? session._id))];

      if (logicalSessionIds.length === 0) {
        return { deletedCount };
      }

      const result = await this.sessions.deleteMany(filter);
      deletedCount += result.deletedCount;
      await this.deleteAliasesForInactiveLogicalSessions(logicalSessionIds);
    }
  }

  private getRotatedSessionAliasExpiresAt(nextSession: OidcVaultSession, now: number): Date {
    return new Date(
      typeof nextSession.expiresAt === 'number' ? nextSession.expiresAt : now + this.rotatedSessionAliasRetentionMs,
    );
  }

  private async deleteAliasesForInactiveLogicalSessions(logicalSessionIds: string[]): Promise<void> {
    // Session deletion has already committed. Keep only the liveness check and
    // alias removal in a snapshot transaction: an alias inserted by a later
    // rotation is invisible to this delete, and changing an observed alias
    // causes a write conflict/retry. A plain check followed by deleteMany could
    // erase that new rotation's revocation handle. Do not put session deletion
    // in this snapshot: concurrent scoped deletes could each see the other's
    // soon-to-be-deleted member and both preserve an inactive lineage's aliases.
    const session = this.db.client.startSession();

    try {
      await session.withTransaction(
        async () => {
          const live = await this.sessions
            .find(
              {
                $and: [
                  {
                    $or: [
                      { logicalSessionId: { $in: logicalSessionIds } },
                      { logicalSessionId: { $exists: false }, _id: { $in: logicalSessionIds } },
                    ],
                  },
                  { $nor: [{ expiresAt: { $lte: new Date(this.now()) } }] },
                ],
              },
              { session, projection: { _id: 1, logicalSessionId: 1 } },
            )
            .toArray();
          const survivingIds = new Set(live.map((record) => record.logicalSessionId ?? record._id));
          const inactiveIds = logicalSessionIds.filter((id) => !survivingIds.has(id));

          if (inactiveIds.length > 0) {
            await this.rotatedSessionAliases.deleteMany({ logicalSessionId: { $in: inactiveIds } }, { session });
          }
        },
        { readConcern: { level: 'snapshot' } },
      );
    } finally {
      await session.endSession();
    }
  }

  private async isExpiredAndCleanup<T extends ExpirableDocument>(
    collection: Collection<T>,
    record: T,
  ): Promise<boolean> {
    if (!isExpired(record, this.now())) {
      return false;
    }

    await collection.deleteOne({ _id: record._id, expiresAt: record.expiresAt } as Filter<T>);
    return true;
  }
}
