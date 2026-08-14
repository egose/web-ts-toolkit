import {
  OidcVaultStoreConflictError,
  type DeleteSessionsByLogicalSessionIdInput,
  type DeleteSessionsByProviderSessionIdInput,
  type DeleteSessionsBySubjectInput,
} from '@web-ts-toolkit/express-oidc-vault';
import type {
  AuthorizationTransaction,
  AuthorizationTransactionInput,
  ExchangeCodeRecord,
  ExchangeCodeRecordInput,
  OidcVaultSession,
  OidcVaultSessionInput,
  OidcVaultStoreProvider,
  ConsumeBackchannelLogoutTokenJtiInput,
  RotateSessionInput,
} from '@web-ts-toolkit/express-oidc-vault';
import type { ClientSession, Collection, Db, Filter } from 'mongodb';

export interface MongoOidcVaultStoreOptions {
  db: Db;
  authorizationTransactionsCollectionName?: string;
  exchangeCodesCollectionName?: string;
  sessionsCollectionName?: string;
  backchannelLogoutTokenJtisCollectionName?: string;
  rotatedSessionAliasesCollectionName?: string;
  now?: () => number;
}

type ExpirableDocument = {
  _id: string;
  expiresAt?: Date;
};

type AuthorizationTransactionDocument = Omit<AuthorizationTransaction, 'expiresAt'> & { _id: string; expiresAt: Date };
type ExchangeCodeDocument = Omit<ExchangeCodeRecord, 'expiresAt'> & { _id: string; expiresAt: Date };
type SessionDocument = Omit<OidcVaultSession, 'sessionId' | 'expiresAt'> & { _id: string; expiresAt?: Date };
type BackchannelLogoutTokenJtiDocument = { _id: string; expiresAt: Date };
type RotatedSessionAliasDocument = { _id: string; logicalSessionId: string; expiresAt?: Date };

const DEFAULT_COLLECTION_NAMES = {
  authorizationTransactions: 'oidc_vault_authorization_transactions',
  exchangeCodes: 'oidc_vault_exchange_codes',
  sessions: 'oidc_vault_sessions',
  backchannelLogoutTokenJtis: 'oidc_vault_backchannel_logout_token_jtis',
  rotatedSessionAliases: 'oidc_vault_rotated_session_aliases',
} as const;

const sessionToDocument = (session: OidcVaultSession): SessionDocument => ({
  _id: session.sessionId,
  logicalSessionId: session.logicalSessionId ?? session.sessionId,
  subject: session.subject,
  providerSessionId: session.providerSessionId,
  provider: session.provider,
  refreshToken: session.refreshToken,
  idToken: session.idToken,
  accessToken: session.accessToken,
  scope: session.scope,
  expiresAt: typeof session.expiresAt === 'number' ? new Date(session.expiresAt) : undefined,
  createdAt: session.createdAt,
  updatedAt: session.updatedAt,
  user: session.user,
  metadata: session.metadata,
});

const documentToSession = (session: SessionDocument): OidcVaultSession => ({
  sessionId: session._id,
  logicalSessionId: session.logicalSessionId ?? session._id,
  subject: session.subject,
  providerSessionId: session.providerSessionId,
  provider: session.provider,
  refreshToken: session.refreshToken,
  idToken: session.idToken,
  accessToken: session.accessToken,
  scope: session.scope,
  expiresAt: session.expiresAt?.getTime(),
  createdAt: session.createdAt,
  updatedAt: session.updatedAt,
  user: session.user,
  metadata: session.metadata,
});

const authorizationTransactionToDocument = (
  record: AuthorizationTransactionInput,
): AuthorizationTransactionDocument => ({
  _id: record.state,
  ...record,
  expiresAt: new Date(record.expiresAt),
});

const exchangeCodeToDocument = (record: ExchangeCodeRecordInput): ExchangeCodeDocument => ({
  _id: record.code,
  ...record,
  expiresAt: new Date(record.expiresAt),
});

const authorizationDocumentToRecord = (record: AuthorizationTransactionDocument): AuthorizationTransaction => ({
  state: record.state,
  nonce: record.nonce,
  pkceVerifier: record.pkceVerifier,
  codeChallenge: record.codeChallenge,
  returnTo: record.returnTo,
  createdAt: record.createdAt,
  expiresAt: record.expiresAt.getTime(),
  metadata: record.metadata,
});

const exchangeDocumentToRecord = (record: ExchangeCodeDocument): ExchangeCodeRecord => ({
  code: record.code,
  sessionId: record.sessionId,
  returnTo: record.returnTo,
  createdAt: record.createdAt,
  expiresAt: record.expiresAt.getTime(),
});

const isExpired = (record: ExpirableDocument, now: number): boolean =>
  record.expiresAt instanceof Date && record.expiresAt.getTime() <= now;

const toSubjectDeleteInput = (input: string | DeleteSessionsBySubjectInput): DeleteSessionsBySubjectInput =>
  typeof input === 'string' ? { subject: input } : input;

const toProviderSessionDeleteInput = (
  input: string | DeleteSessionsByProviderSessionIdInput,
): DeleteSessionsByProviderSessionIdInput => (typeof input === 'string' ? { providerSessionId: input } : input);

const toLogicalSessionDeleteInput = (
  input: string | DeleteSessionsByLogicalSessionIdInput,
): DeleteSessionsByLogicalSessionIdInput => (typeof input === 'string' ? { logicalSessionId: input } : input);

const isTransactionCapableHelloResponse = (value: Record<string, unknown>): boolean =>
  typeof value.setName === 'string' || value.msg === 'isdbgrid';

const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;

class MongoOidcVaultStore implements OidcVaultStoreProvider {
  private readonly db: Db;
  private readonly authorizationTransactions: Collection<AuthorizationTransactionDocument>;
  private readonly exchangeCodes: Collection<ExchangeCodeDocument>;
  private readonly sessions: Collection<SessionDocument>;
  private readonly backchannelLogoutTokenJtis: Collection<BackchannelLogoutTokenJtiDocument>;
  private readonly rotatedSessionAliases: Collection<RotatedSessionAliasDocument>;
  private readonly now: () => number;
  private readonly ready: Promise<void>;
  private readonly supportsTransactions: Promise<boolean>;

  constructor(options: MongoOidcVaultStoreOptions) {
    this.db = options.db;
    this.authorizationTransactions = options.db.collection<AuthorizationTransactionDocument>(
      options.authorizationTransactionsCollectionName ?? DEFAULT_COLLECTION_NAMES.authorizationTransactions,
    );
    this.exchangeCodes = options.db.collection<ExchangeCodeDocument>(
      options.exchangeCodesCollectionName ?? DEFAULT_COLLECTION_NAMES.exchangeCodes,
    );
    this.sessions = options.db.collection<SessionDocument>(
      options.sessionsCollectionName ?? DEFAULT_COLLECTION_NAMES.sessions,
    );
    this.backchannelLogoutTokenJtis = options.db.collection<BackchannelLogoutTokenJtiDocument>(
      options.backchannelLogoutTokenJtisCollectionName ?? DEFAULT_COLLECTION_NAMES.backchannelLogoutTokenJtis,
    );
    this.rotatedSessionAliases = options.db.collection<RotatedSessionAliasDocument>(
      options.rotatedSessionAliasesCollectionName ?? DEFAULT_COLLECTION_NAMES.rotatedSessionAliases,
    );
    this.now = options.now ?? (() => Date.now());
    this.ready = this.ensureIndexes();
    this.supportsTransactions = this.detectTransactionSupport();
  }

  async createAuthorizationTransaction(input: AuthorizationTransactionInput): Promise<void> {
    await this.ready;
    await this.authorizationTransactions.replaceOne({ _id: input.state }, authorizationTransactionToDocument(input), {
      upsert: true,
    });
  }

  async consumeAuthorizationTransaction(state: string): Promise<AuthorizationTransaction | null> {
    await this.ready;
    const record = await this.authorizationTransactions.findOneAndDelete({ _id: state });

    if (!record || (await this.isExpiredAndCleanup(this.authorizationTransactions, record))) {
      return null;
    }

    return authorizationDocumentToRecord(record);
  }

  async createExchangeCode(input: ExchangeCodeRecordInput): Promise<void> {
    await this.ready;
    await this.exchangeCodes.replaceOne({ _id: input.code }, exchangeCodeToDocument(input), { upsert: true });
  }

  async consumeExchangeCode(code: string): Promise<ExchangeCodeRecord | null> {
    await this.ready;
    const record = await this.exchangeCodes.findOneAndDelete({ _id: code });

    if (!record || (await this.isExpiredAndCleanup(this.exchangeCodes, record))) {
      return null;
    }

    return exchangeDocumentToRecord(record);
  }

  async createSession(input: OidcVaultSessionInput): Promise<OidcVaultSession> {
    await this.ready;
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
    await this.ready;
    const session = await this.sessions.findOne({ _id: sessionId });

    if (!session || (await this.isExpiredAndCleanup(this.sessions, session))) {
      return null;
    }

    return documentToSession(session);
  }

  async rotateSession(input: RotateSessionInput): Promise<OidcVaultSession> {
    await this.ready;

    if (input.nextSession.sessionId === input.sessionId) {
      throw new OidcVaultStoreConflictError('OIDC vault session rotation target must use a different session ID.');
    }

    try {
      if (await this.supportsTransactions) {
        return await this.rotateSessionWithTransaction(input);
      }

      return await this.rotateSessionWithoutTransaction(input);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new OidcVaultStoreConflictError('OIDC vault session rotation target already exists.');
      }

      throw error;
    }
  }

  private async rotateSessionWithoutTransaction(input: RotateSessionInput): Promise<OidcVaultSession> {
    const nextSession = await this.normalizeRotatedSession(input);
    let insertedTarget = false;

    try {
      await this.sessions.insertOne(sessionToDocument(nextSession));
      insertedTarget = true;
      await this.createRotatedSessionAlias(input.sessionId, nextSession);

      const deleteResult = await this.sessions.deleteOne({ _id: input.sessionId });

      if (deleteResult.deletedCount !== 1) {
        await this.sessions.deleteOne({ _id: nextSession.sessionId });
        await this.rotatedSessionAliases.deleteOne({ _id: input.sessionId });
        throw new OidcVaultStoreConflictError('OIDC vault session no longer exists for rotation.');
      }
    } catch (error) {
      if (insertedTarget) {
        await this.sessions.deleteOne({ _id: nextSession.sessionId });
      }

      throw error;
    }

    return nextSession;
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

  async deleteSession(sessionId: string): Promise<void> {
    await this.ready;
    const session = await this.sessions.findOne({ _id: sessionId });

    if (session) {
      const logicalSessionId = session.logicalSessionId ?? session._id;
      await this.sessions.deleteOne({ _id: sessionId });
      await this.deleteRotatedSessionAliasesByLogicalSessionId(logicalSessionId);
      return;
    }

    const alias = await this.rotatedSessionAliases.findOneAndDelete({ _id: sessionId });

    if (alias && !(await this.isExpiredAndCleanup(this.rotatedSessionAliases, alias))) {
      await this.deleteSessionsByLogicalSessionId(alias.logicalSessionId);
    }
  }

  async deleteSessionsByLogicalSessionId(input: string | DeleteSessionsByLogicalSessionIdInput): Promise<number> {
    await this.ready;
    const resolved = toLogicalSessionDeleteInput(input);
    const result = await this.sessions.deleteMany({ logicalSessionId: resolved.logicalSessionId });
    await this.deleteRotatedSessionAliasesByLogicalSessionId(resolved.logicalSessionId);
    return result.deletedCount;
  }

  async consumeBackchannelLogoutTokenJti(input: ConsumeBackchannelLogoutTokenJtiInput): Promise<boolean> {
    await this.ready;
    const now = this.now();

    if (!Number.isFinite(input.expiresAt) || input.expiresAt <= now) {
      return false;
    }

    await this.backchannelLogoutTokenJtis.deleteOne({
      _id: input.jti,
      expiresAt: { $lte: new Date(now) },
    });

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
    await this.ready;
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
    await this.ready;
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

  private async ensureIndexes(): Promise<void> {
    await Promise.all([
      this.createTtlIndex(this.authorizationTransactions),
      this.createTtlIndex(this.exchangeCodes),
      this.createTtlIndex(this.sessions),
      this.createTtlIndex(this.backchannelLogoutTokenJtis),
      this.createTtlIndex(this.rotatedSessionAliases),
      this.sessions.createIndex({ subject: 1 }, { name: 'subject_idx' }),
      this.sessions.createIndex({ providerSessionId: 1 }, { name: 'provider_session_idx' }),
      this.sessions.createIndex({ logicalSessionId: 1 }, { name: 'logical_session_idx' }),
    ]);
  }

  private async detectTransactionSupport(): Promise<boolean> {
    try {
      const hello = (await this.db.admin().command({ hello: 1 })) as Record<string, unknown>;
      return isTransactionCapableHelloResponse(hello);
    } catch {
      return false;
    }
  }

  private async createRotatedSessionAlias(
    previousSessionId: string,
    nextSession: OidcVaultSession,
    session?: ClientSession,
  ): Promise<void> {
    await this.rotatedSessionAliases.updateOne(
      { _id: previousSessionId },
      {
        $set: {
          logicalSessionId: nextSession.logicalSessionId ?? nextSession.sessionId,
          expiresAt: typeof nextSession.expiresAt === 'number' ? new Date(nextSession.expiresAt) : undefined,
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
    const sessions = await this.sessions
      .find(filter)
      .project<Pick<SessionDocument, 'logicalSessionId' | '_id'>>({
        _id: 1,
        logicalSessionId: 1,
      })
      .toArray();
    const result = await this.sessions.deleteMany(filter);
    const logicalSessionIds = [...new Set(sessions.map((session) => session.logicalSessionId ?? session._id))];

    if (logicalSessionIds.length > 0) {
      await this.rotatedSessionAliases.deleteMany({ logicalSessionId: { $in: logicalSessionIds } });
    }

    return { deletedCount: result.deletedCount };
  }

  private async deleteRotatedSessionAliasesByLogicalSessionId(logicalSessionId: string): Promise<void> {
    await this.rotatedSessionAliases.deleteMany({ logicalSessionId });
  }

  private async createTtlIndex<T extends { _id: string }>(collection: Collection<T>): Promise<string> {
    return collection.createIndex(
      { expiresAt: 1 },
      {
        expireAfterSeconds: 0,
        name: 'expiresAt_ttl',
      },
    );
  }

  private async isExpiredAndCleanup<T extends ExpirableDocument>(
    collection: Collection<T>,
    record: T,
  ): Promise<boolean> {
    if (!isExpired(record, this.now())) {
      return false;
    }

    await collection.deleteOne({ _id: record._id } as Filter<T>);
    return true;
  }
}

export function createMongoOidcVaultStore(options: MongoOidcVaultStoreOptions): OidcVaultStoreProvider {
  return new MongoOidcVaultStore(options);
}
