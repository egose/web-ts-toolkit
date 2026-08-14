import {
  OidcVaultStoreConflictError,
  type ConsumeBackchannelLogoutTokenJtiInput,
  type DeleteSessionsByLogicalSessionIdInput,
  type DeleteSessionsByProviderSessionIdInput,
  type DeleteSessionsBySubjectInput,
  type ExchangeCodeRecord,
  type ExchangeCodeRecordInput,
  type AuthorizationTransaction,
  type AuthorizationTransactionInput,
  type OidcVaultSession,
  type OidcVaultSessionInput,
  type RotateSessionInput,
} from '@web-ts-toolkit/express-oidc-vault';
import type { ClientSession, Collection, Db, Filter } from 'mongodb';
import {
  authorizationDocumentToRecord,
  authorizationTransactionToDocument,
  documentToSession,
  exchangeCodeToDocument,
  exchangeDocumentToRecord,
  isExpired,
  sessionToDocument,
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

const toSubjectDeleteInput = (input: string | DeleteSessionsBySubjectInput): DeleteSessionsBySubjectInput =>
  typeof input === 'string' ? { subject: input } : input;

const toProviderSessionDeleteInput = (
  input: string | DeleteSessionsByProviderSessionIdInput,
): DeleteSessionsByProviderSessionIdInput => (typeof input === 'string' ? { providerSessionId: input } : input);

const toLogicalSessionDeleteInput = (
  input: string | DeleteSessionsByLogicalSessionIdInput,
): DeleteSessionsByLogicalSessionIdInput => (typeof input === 'string' ? { logicalSessionId: input } : input);

const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;

export class MongoOidcVaultStore implements OidcVaultMongoStoreProvider {
  private readonly db: Db;
  private readonly authorizationTransactions: Collection<AuthorizationTransactionDocument>;
  private readonly exchangeCodes: Collection<ExchangeCodeDocument>;
  private readonly sessions: Collection<SessionDocument>;
  private readonly backchannelLogoutTokenJtis: Collection<BackchannelLogoutTokenJtiDocument>;
  private readonly rotatedSessionAliases: Collection<RotatedSessionAliasDocument>;
  private readonly now: () => number;
  private readonly rotatedSessionAliasRetentionMs: number;
  private readonly initialization: Promise<void>;
  private initializationError: unknown;

  constructor(options: MongoOidcVaultStoreOptions) {
    const collectionNames = resolveCollectionNames(options);

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
    this.rotatedSessionAliasRetentionMs =
      options.rotatedSessionAliasRetentionMs ?? DEFAULT_ROTATED_SESSION_ALIAS_RETENTION_MS;

    if (!Number.isFinite(this.rotatedSessionAliasRetentionMs) || this.rotatedSessionAliasRetentionMs <= 0) {
      throw new TypeError('OIDC vault rotated session alias retention must be a finite positive duration.');
    }

    this.now = options.now ?? (() => Date.now());
    this.initialization = this.initialize().then(undefined, (error: unknown) => {
      this.initializationError = error;
    });
  }

  async ready(): Promise<void> {
    await this.waitUntilReady();
  }

  async createAuthorizationTransaction(input: AuthorizationTransactionInput): Promise<void> {
    await this.waitUntilReady();
    await this.authorizationTransactions.replaceOne({ _id: input.state }, authorizationTransactionToDocument(input), {
      upsert: true,
    });
  }

  async consumeAuthorizationTransaction(state: string): Promise<AuthorizationTransaction | null> {
    await this.waitUntilReady();
    const record = await this.authorizationTransactions.findOneAndDelete({ _id: state });

    if (!record || isExpired(record, this.now())) {
      return null;
    }

    return authorizationDocumentToRecord(record);
  }

  async createExchangeCode(input: ExchangeCodeRecordInput): Promise<void> {
    await this.waitUntilReady();
    await this.exchangeCodes.replaceOne({ _id: input.code }, exchangeCodeToDocument(input), { upsert: true });
  }

  async consumeExchangeCode(code: string): Promise<ExchangeCodeRecord | null> {
    await this.waitUntilReady();
    const record = await this.exchangeCodes.findOneAndDelete({ _id: code });

    if (!record || isExpired(record, this.now())) {
      return null;
    }

    return exchangeDocumentToRecord(record);
  }

  async createSession(input: OidcVaultSessionInput): Promise<OidcVaultSession> {
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

    if (!session || (await this.isExpiredAndCleanup(this.sessions, session))) {
      return null;
    }

    return documentToSession(session);
  }

  async rotateSession(input: RotateSessionInput): Promise<OidcVaultSession> {
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
        await this.deleteRotatedSessionAliasesByLogicalSessionId(logicalSessionId);
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
    await this.waitUntilReady();
    const resolved = toLogicalSessionDeleteInput(input);
    const result = await this.sessions.deleteMany({ logicalSessionId: resolved.logicalSessionId });
    await this.deleteRotatedSessionAliasesByLogicalSessionId(resolved.logicalSessionId);
    return result.deletedCount;
  }

  async consumeBackchannelLogoutTokenJti(input: ConsumeBackchannelLogoutTokenJtiInput): Promise<boolean> {
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
    await this.waitUntilReady();
    const resolved = toSubjectDeleteInput(input);
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
    await this.waitUntilReady();
    const resolved = toProviderSessionDeleteInput(input);
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
      }),
      assertTransactionSupport(this.db),
    ]);
  }

  private async waitUntilReady(): Promise<void> {
    await this.initialization;

    if (this.initializationError !== undefined) {
      throw this.initializationError;
    }
  }

  private async rotateSessionWithTransaction(input: RotateSessionInput): Promise<OidcVaultSession> {
    const session = this.db.client.startSession();
    const nextSession = await this.normalizeRotatedSession(input);

    try {
      await session.withTransaction(async () => {
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
      },
      { upsert: true, session },
    );
  }

  private async normalizeRotatedSession(input: RotateSessionInput): Promise<OidcVaultSession> {
    const previous = await this.getSession(input.sessionId);

    if (!previous) {
      throw new OidcVaultStoreConflictError('OIDC vault session no longer exists for rotation.');
    }

    return {
      ...input.nextSession,
      logicalSessionId: input.nextSession.logicalSessionId ?? previous.logicalSessionId ?? input.sessionId,
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
      await this.rotatedSessionAliases.deleteMany({ logicalSessionId: { $in: logicalSessionIds } });
    }
  }

  private getRotatedSessionAliasExpiresAt(nextSession: OidcVaultSession, now: number): Date {
    return new Date(
      typeof nextSession.expiresAt === 'number' ? nextSession.expiresAt : now + this.rotatedSessionAliasRetentionMs,
    );
  }

  private async deleteRotatedSessionAliasesByLogicalSessionId(logicalSessionId: string): Promise<void> {
    await this.rotatedSessionAliases.deleteMany({ logicalSessionId });
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
