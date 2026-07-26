import {
  OidcVaultStoreConflictError,
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
  RotateSessionInput,
} from '@web-ts-toolkit/express-oidc-vault';

export interface MemoryOidcVaultStoreOptions {
  now?: () => number;
}

type ExpirableRecord = {
  expiresAt?: number;
};

const cloneRecord = <T>(value: T): T => structuredClone(value);

const isExpiredRecord = (value: ExpirableRecord, now: number): boolean =>
  typeof value.expiresAt === 'number' && value.expiresAt <= now;

const matchesProviderScope = (
  session: OidcVaultSession,
  input: DeleteSessionsBySubjectInput | DeleteSessionsByProviderSessionIdInput,
): boolean => {
  if (input.issuer !== undefined && session.provider?.issuer !== input.issuer) {
    return false;
  }

  if (input.clientId !== undefined && session.provider?.clientId !== input.clientId) {
    return false;
  }

  return true;
};

const toSubjectDeleteInput = (input: string | DeleteSessionsBySubjectInput): DeleteSessionsBySubjectInput =>
  typeof input === 'string' ? { subject: input } : input;

const toProviderSessionDeleteInput = (
  input: string | DeleteSessionsByProviderSessionIdInput,
): DeleteSessionsByProviderSessionIdInput => (typeof input === 'string' ? { providerSessionId: input } : input);

class MemoryOidcVaultStore implements OidcVaultStoreProvider {
  private readonly authorizationTransactions = new Map<string, AuthorizationTransaction>();
  private readonly exchangeCodes = new Map<string, ExchangeCodeRecord>();
  private readonly sessions = new Map<string, OidcVaultSession>();
  private readonly now: () => number;

  constructor(options: MemoryOidcVaultStoreOptions = {}) {
    this.now = options.now ?? (() => Date.now());
  }

  async createAuthorizationTransaction(input: AuthorizationTransactionInput): Promise<void> {
    this.pruneExpiredRecords();
    this.authorizationTransactions.set(input.state, cloneRecord(input));
  }

  async consumeAuthorizationTransaction(state: string): Promise<AuthorizationTransaction | null> {
    this.pruneExpiredRecords();

    const record = this.authorizationTransactions.get(state);

    if (!record) {
      return null;
    }

    this.authorizationTransactions.delete(state);
    return cloneRecord(record);
  }

  async createExchangeCode(input: ExchangeCodeRecordInput): Promise<void> {
    this.pruneExpiredRecords();
    this.exchangeCodes.set(input.code, cloneRecord(input));
  }

  async consumeExchangeCode(code: string): Promise<ExchangeCodeRecord | null> {
    this.pruneExpiredRecords();

    const record = this.exchangeCodes.get(code);

    if (!record) {
      return null;
    }

    this.exchangeCodes.delete(code);
    return cloneRecord(record);
  }

  async createSession(input: OidcVaultSessionInput): Promise<OidcVaultSession> {
    this.pruneExpiredRecords();

    const timestamp = this.now();
    const session: OidcVaultSession = {
      ...cloneRecord(input),
      createdAt: input.createdAt ?? timestamp,
      updatedAt: input.updatedAt ?? timestamp,
    };

    this.sessions.set(session.sessionId, session);
    return cloneRecord(session);
  }

  async getSession(sessionId: string): Promise<OidcVaultSession | null> {
    this.pruneExpiredRecords();

    const session = this.sessions.get(sessionId);

    return session ? cloneRecord(session) : null;
  }

  async rotateSession(input: RotateSessionInput): Promise<OidcVaultSession> {
    this.pruneExpiredRecords();

    if (!this.sessions.has(input.sessionId)) {
      throw new OidcVaultStoreConflictError('OIDC vault session no longer exists for rotation.');
    }

    this.sessions.delete(input.sessionId);

    const nextSession = cloneRecord(input.nextSession);
    const timestamp = this.now();
    const session: OidcVaultSession = {
      ...nextSession,
      createdAt: nextSession.createdAt ?? timestamp,
      updatedAt: nextSession.updatedAt ?? timestamp,
    };

    this.sessions.set(session.sessionId, session);
    return cloneRecord(session);
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async deleteSessionsBySubject(input: string | DeleteSessionsBySubjectInput): Promise<number> {
    this.pruneExpiredRecords();
    const resolved = toSubjectDeleteInput(input);
    let deleted = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.subject === resolved.subject && matchesProviderScope(session, resolved)) {
        this.sessions.delete(sessionId);
        deleted += 1;
      }
    }

    return deleted;
  }

  async deleteSessionsByProviderSessionId(input: string | DeleteSessionsByProviderSessionIdInput): Promise<number> {
    this.pruneExpiredRecords();
    const resolved = toProviderSessionDeleteInput(input);
    let deleted = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.providerSessionId === resolved.providerSessionId && matchesProviderScope(session, resolved)) {
        this.sessions.delete(sessionId);
        deleted += 1;
      }
    }

    return deleted;
  }

  private pruneExpiredRecords(): void {
    const now = this.now();

    this.pruneMap(this.authorizationTransactions, now);
    this.pruneMap(this.exchangeCodes, now);
    this.pruneMap(this.sessions, now);
  }

  private pruneMap<T extends ExpirableRecord>(map: Map<string, T>, now: number): void {
    for (const [key, value] of map.entries()) {
      if (isExpiredRecord(value, now)) {
        map.delete(key);
      }
    }
  }
}

/**
 * Create an in-memory store provider for local development and tests.
 */
export function createMemoryOidcVaultStore(options: MemoryOidcVaultStoreOptions = {}): OidcVaultStoreProvider {
  return new MemoryOidcVaultStore(options);
}
