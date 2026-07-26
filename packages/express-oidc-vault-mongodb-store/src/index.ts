import type {
  AuthorizationTransaction,
  AuthorizationTransactionInput,
  ExchangeCodeRecord,
  ExchangeCodeRecordInput,
  OidcVaultSession,
  OidcVaultSessionInput,
  OidcVaultStoreProvider,
  RotateSessionInput,
} from '@web-ts-toolkit/express-oidc-vault';
import type { Collection, Db, Filter } from 'mongodb';

export interface MongoOidcVaultStoreOptions {
  db: Db;
  authorizationTransactionsCollectionName?: string;
  exchangeCodesCollectionName?: string;
  sessionsCollectionName?: string;
  now?: () => number;
}

type ExpirableDocument = {
  _id: string;
  expiresAt?: Date;
};

type AuthorizationTransactionDocument = Omit<AuthorizationTransaction, 'expiresAt'> & { _id: string; expiresAt: Date };
type ExchangeCodeDocument = Omit<ExchangeCodeRecord, 'expiresAt'> & { _id: string; expiresAt: Date };
type SessionDocument = Omit<OidcVaultSession, 'sessionId' | 'expiresAt'> & { _id: string; expiresAt?: Date };

const DEFAULT_COLLECTION_NAMES = {
  authorizationTransactions: 'oidc_vault_authorization_transactions',
  exchangeCodes: 'oidc_vault_exchange_codes',
  sessions: 'oidc_vault_sessions',
} as const;

const sessionToDocument = (session: OidcVaultSession): SessionDocument => ({
  _id: session.sessionId,
  subject: session.subject,
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
  subject: session.subject,
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

class MongoOidcVaultStore implements OidcVaultStoreProvider {
  private readonly authorizationTransactions: Collection<AuthorizationTransactionDocument>;
  private readonly exchangeCodes: Collection<ExchangeCodeDocument>;
  private readonly sessions: Collection<SessionDocument>;
  private readonly now: () => number;
  private readonly ready: Promise<void>;

  constructor(options: MongoOidcVaultStoreOptions) {
    this.authorizationTransactions = options.db.collection<AuthorizationTransactionDocument>(
      options.authorizationTransactionsCollectionName ?? DEFAULT_COLLECTION_NAMES.authorizationTransactions,
    );
    this.exchangeCodes = options.db.collection<ExchangeCodeDocument>(
      options.exchangeCodesCollectionName ?? DEFAULT_COLLECTION_NAMES.exchangeCodes,
    );
    this.sessions = options.db.collection<SessionDocument>(
      options.sessionsCollectionName ?? DEFAULT_COLLECTION_NAMES.sessions,
    );
    this.now = options.now ?? (() => Date.now());
    this.ready = this.ensureIndexes();
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
    await this.sessions.replaceOne({ _id: input.nextSession.sessionId }, sessionToDocument(input.nextSession), {
      upsert: true,
    });
    await this.sessions.deleteOne({ _id: input.sessionId });
    return input.nextSession;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.ready;
    await this.sessions.deleteOne({ _id: sessionId });
  }

  private async ensureIndexes(): Promise<void> {
    await Promise.all([
      this.createTtlIndex(this.authorizationTransactions),
      this.createTtlIndex(this.exchangeCodes),
      this.createTtlIndex(this.sessions),
    ]);
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
