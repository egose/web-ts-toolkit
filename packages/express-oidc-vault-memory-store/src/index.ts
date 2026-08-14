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

export interface MemoryOidcVaultStoreOptions {
  /**
   * Store clock in epoch milliseconds.
   *
   * Defaults to `Date.now`. Override this in deterministic tests only; the
   * returned value should move forward enough for the expiry scenarios being
   * tested.
   */
  now?: () => number;
}

type ExpirableRecord = {
  expiresAt?: number;
};

type RotatedSessionAlias = ExpirableRecord & {
  logicalSessionId: string;
};

const cloneRecord = <T>(value: T): T => structuredClone(value);

const isExpiredRecord = (value: ExpirableRecord, now: number): boolean =>
  typeof value.expiresAt === 'number' && value.expiresAt <= now;

const EXPIRY_SWEEP_BATCH_SIZE = 64;

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

const toLogicalSessionDeleteInput = (
  input: string | DeleteSessionsByLogicalSessionIdInput,
): DeleteSessionsByLogicalSessionIdInput => (typeof input === 'string' ? { logicalSessionId: input } : input);

class MemoryOidcVaultStore implements OidcVaultStoreProvider {
  private readonly authorizationTransactions = new Map<string, AuthorizationTransaction>();
  private readonly exchangeCodes = new Map<string, ExchangeCodeRecord>();
  private readonly sessions = new Map<string, OidcVaultSession>();
  private readonly rotatedSessionAliases = new Map<string, RotatedSessionAlias>();
  private readonly backchannelLogoutTokenJtis = new Map<string, ExpirableRecord>();
  private readonly now: () => number;
  private authorizationTransactionSweepCursor: string | undefined;
  private exchangeCodeSweepCursor: string | undefined;
  private sessionSweepCursor: string | undefined;
  private rotatedSessionAliasSweepCursor: string | undefined;
  private backchannelLogoutTokenJtiSweepCursor: string | undefined;

  constructor(options: MemoryOidcVaultStoreOptions = {}) {
    this.now = options.now ?? (() => Date.now());
  }

  async createAuthorizationTransaction(input: AuthorizationTransactionInput): Promise<void> {
    const now = this.now();

    this.authorizationTransactionSweepCursor = this.pruneMapBatch(
      this.authorizationTransactions,
      now,
      this.authorizationTransactionSweepCursor,
    );
    this.authorizationTransactions.set(input.state, cloneRecord(input));
  }

  async consumeAuthorizationTransaction(state: string): Promise<AuthorizationTransaction | null> {
    const now = this.now();
    this.authorizationTransactionSweepCursor = this.pruneMapBatch(
      this.authorizationTransactions,
      now,
      this.authorizationTransactionSweepCursor,
    );

    const record = this.authorizationTransactions.get(state);

    if (!record) {
      return null;
    }

    this.authorizationTransactions.delete(state);

    if (isExpiredRecord(record, now)) {
      return null;
    }

    return cloneRecord(record);
  }

  async createExchangeCode(input: ExchangeCodeRecordInput): Promise<void> {
    const now = this.now();

    this.exchangeCodeSweepCursor = this.pruneMapBatch(this.exchangeCodes, now, this.exchangeCodeSweepCursor);
    this.exchangeCodes.set(input.code, cloneRecord(input));
  }

  async consumeExchangeCode(code: string): Promise<ExchangeCodeRecord | null> {
    const now = this.now();

    this.exchangeCodeSweepCursor = this.pruneMapBatch(this.exchangeCodes, now, this.exchangeCodeSweepCursor);

    const record = this.exchangeCodes.get(code);

    if (!record) {
      return null;
    }

    this.exchangeCodes.delete(code);

    if (isExpiredRecord(record, now)) {
      return null;
    }

    return cloneRecord(record);
  }

  async createSession(input: OidcVaultSessionInput): Promise<OidcVaultSession> {
    const timestamp = this.now();
    this.pruneSessionsBatch(timestamp);
    this.rotatedSessionAliasSweepCursor = this.pruneMapBatch(
      this.rotatedSessionAliases,
      timestamp,
      this.rotatedSessionAliasSweepCursor,
    );
    const session: OidcVaultSession = {
      ...cloneRecord(input),
      logicalSessionId: input.logicalSessionId ?? input.sessionId,
      createdAt: input.createdAt ?? timestamp,
      updatedAt: input.updatedAt ?? timestamp,
    };

    this.sessions.set(session.sessionId, session);
    this.rotatedSessionAliases.delete(session.sessionId);
    return cloneRecord(session);
  }

  async getSession(sessionId: string): Promise<OidcVaultSession | null> {
    const now = this.now();

    const session = this.sessions.get(sessionId);

    if (session && isExpiredRecord(session, now)) {
      this.sessions.delete(sessionId);
      this.removeAliasesForInactiveLogicalSession(session.logicalSessionId ?? session.sessionId);
      return null;
    }

    return session ? cloneRecord(session) : null;
  }

  async rotateSession(input: RotateSessionInput): Promise<OidcVaultSession> {
    const timestamp = this.now();

    const sourceSession = this.sessions.get(input.sessionId);

    if (sourceSession && isExpiredRecord(sourceSession, timestamp)) {
      this.sessions.delete(input.sessionId);
      this.removeAliasesForInactiveLogicalSession(sourceSession.logicalSessionId ?? sourceSession.sessionId);
    }

    const liveSourceSession = this.sessions.get(input.sessionId);

    if (!liveSourceSession) {
      throw new OidcVaultStoreConflictError('OIDC vault session no longer exists for rotation.');
    }

    if (input.nextSession.sessionId === input.sessionId) {
      throw new OidcVaultStoreConflictError('OIDC vault session rotation target must use a different session ID.');
    }

    const existingTargetSession = this.sessions.get(input.nextSession.sessionId);

    if (existingTargetSession && isExpiredRecord(existingTargetSession, timestamp)) {
      this.sessions.delete(input.nextSession.sessionId);
      this.removeAliasesForInactiveLogicalSession(
        existingTargetSession.logicalSessionId ?? existingTargetSession.sessionId,
      );
    } else if (existingTargetSession) {
      throw new OidcVaultStoreConflictError('OIDC vault session rotation target already exists.');
    }

    const nextSession = cloneRecord(input.nextSession);
    const session: OidcVaultSession = {
      ...nextSession,
      logicalSessionId:
        nextSession.logicalSessionId ?? liveSourceSession.logicalSessionId ?? liveSourceSession.sessionId,
      createdAt: nextSession.createdAt ?? timestamp,
      updatedAt: nextSession.updatedAt ?? timestamp,
    };

    this.sessions.delete(input.sessionId);
    this.sessions.set(session.sessionId, session);
    this.rotatedSessionAliases.set(input.sessionId, {
      logicalSessionId: session.logicalSessionId ?? session.sessionId,
      expiresAt: session.expiresAt,
    });
    return cloneRecord(session);
  }

  async deleteSession(sessionId: string): Promise<void> {
    const now = this.now();
    this.pruneSessionsBatch(now);
    this.rotatedSessionAliasSweepCursor = this.pruneMapBatch(
      this.rotatedSessionAliases,
      now,
      this.rotatedSessionAliasSweepCursor,
    );

    const session = this.sessions.get(sessionId);

    if (session) {
      const logicalSessionId = session.logicalSessionId ?? session.sessionId;
      this.sessions.delete(sessionId);
      this.rotatedSessionAliases.delete(sessionId);
      this.removeAliasesForInactiveLogicalSession(logicalSessionId);
      return;
    }

    const alias = this.rotatedSessionAliases.get(sessionId);

    if (alias) {
      if (isExpiredRecord(alias, now)) {
        this.rotatedSessionAliases.delete(sessionId);
        return;
      }

      await this.deleteSessionsByLogicalSessionId(alias.logicalSessionId);
      this.rotatedSessionAliases.delete(sessionId);
    }
  }

  async deleteSessionsByLogicalSessionId(input: string | DeleteSessionsByLogicalSessionIdInput): Promise<number> {
    const now = this.now();
    const resolved = toLogicalSessionDeleteInput(input);
    let deleted = 0;
    const expiredLogicalSessionIds = new Set<string>();

    for (const [sessionId, session] of this.sessions.entries()) {
      if (isExpiredRecord(session, now)) {
        expiredLogicalSessionIds.add(session.logicalSessionId ?? session.sessionId);
        this.sessions.delete(sessionId);
        continue;
      }

      if ((session.logicalSessionId ?? session.sessionId) === resolved.logicalSessionId) {
        this.sessions.delete(sessionId);
        deleted += 1;
      }
    }

    this.removeAliasesForInactiveLogicalSessions(expiredLogicalSessionIds);
    this.removeAliasesForLogicalSession(resolved.logicalSessionId);

    return deleted;
  }

  async consumeBackchannelLogoutTokenJti(input: ConsumeBackchannelLogoutTokenJtiInput): Promise<boolean> {
    const now = this.now();
    this.backchannelLogoutTokenJtiSweepCursor = this.pruneMapBatch(
      this.backchannelLogoutTokenJtis,
      now,
      this.backchannelLogoutTokenJtiSweepCursor,
    );

    if (!Number.isFinite(input.expiresAt) || input.expiresAt <= now) {
      return false;
    }

    const existingRecord = this.backchannelLogoutTokenJtis.get(input.jti);

    if (existingRecord && !isExpiredRecord(existingRecord, now)) {
      return false;
    }

    this.backchannelLogoutTokenJtis.set(input.jti, { expiresAt: input.expiresAt });
    return true;
  }

  async deleteSessionsBySubject(input: string | DeleteSessionsBySubjectInput): Promise<number> {
    const now = this.now();
    const resolved = toSubjectDeleteInput(input);
    let deleted = 0;
    const logicalSessionIds = new Set<string>();
    const expiredLogicalSessionIds = new Set<string>();

    for (const [sessionId, session] of this.sessions.entries()) {
      if (isExpiredRecord(session, now)) {
        expiredLogicalSessionIds.add(session.logicalSessionId ?? session.sessionId);
        this.sessions.delete(sessionId);
        continue;
      }

      if (session.subject === resolved.subject && matchesProviderScope(session, resolved)) {
        logicalSessionIds.add(session.logicalSessionId ?? session.sessionId);
        this.sessions.delete(sessionId);
        deleted += 1;
      }
    }

    this.removeAliasesForInactiveLogicalSessions(expiredLogicalSessionIds);
    this.removeAliasesForInactiveLogicalSessions(logicalSessionIds);

    return deleted;
  }

  async deleteSessionsByProviderSessionId(input: string | DeleteSessionsByProviderSessionIdInput): Promise<number> {
    const now = this.now();
    const resolved = toProviderSessionDeleteInput(input);
    let deleted = 0;
    const logicalSessionIds = new Set<string>();
    const expiredLogicalSessionIds = new Set<string>();

    for (const [sessionId, session] of this.sessions.entries()) {
      if (isExpiredRecord(session, now)) {
        expiredLogicalSessionIds.add(session.logicalSessionId ?? session.sessionId);
        this.sessions.delete(sessionId);
        continue;
      }

      if (session.providerSessionId === resolved.providerSessionId && matchesProviderScope(session, resolved)) {
        logicalSessionIds.add(session.logicalSessionId ?? session.sessionId);
        this.sessions.delete(sessionId);
        deleted += 1;
      }
    }

    this.removeAliasesForInactiveLogicalSessions(expiredLogicalSessionIds);
    this.removeAliasesForInactiveLogicalSessions(logicalSessionIds);

    return deleted;
  }

  private pruneMapBatch<T extends ExpirableRecord>(
    map: Map<string, T>,
    now: number,
    cursor: string | undefined,
  ): string | undefined {
    let inspected = 0;
    let nextCursor: string | undefined;

    for (const [key, value] of this.entriesAfterCursor(map, cursor)) {
      if (isExpiredRecord(value, now)) {
        map.delete(key);
      }

      inspected += 1;
      nextCursor = key;

      if (inspected >= EXPIRY_SWEEP_BATCH_SIZE) {
        return nextCursor;
      }
    }

    return undefined;
  }

  private pruneSessionsBatch(now: number): void {
    const expiredLogicalSessionIds = new Set<string>();
    let inspected = 0;

    for (const [sessionId, session] of this.entriesAfterCursor(this.sessions, this.sessionSweepCursor)) {
      if (isExpiredRecord(session, now)) {
        expiredLogicalSessionIds.add(session.logicalSessionId ?? session.sessionId);
        this.sessions.delete(sessionId);
      }

      inspected += 1;
      this.sessionSweepCursor = sessionId;

      if (inspected >= EXPIRY_SWEEP_BATCH_SIZE) {
        this.removeAliasesForInactiveLogicalSessions(expiredLogicalSessionIds);
        return;
      }
    }

    this.sessionSweepCursor = undefined;
    this.removeAliasesForInactiveLogicalSessions(expiredLogicalSessionIds);
  }

  private *entriesAfterCursor<T>(map: Map<string, T>, cursor: string | undefined): IterableIterator<[string, T]> {
    if (!cursor || !map.has(cursor)) {
      yield* map.entries();
      return;
    }

    let foundCursor = false;

    for (const entry of map.entries()) {
      if (!foundCursor) {
        foundCursor = entry[0] === cursor;
        continue;
      }

      yield entry;
    }

    for (const entry of map.entries()) {
      if (entry[0] === cursor) {
        return;
      }

      yield entry;
    }
  }

  private removeAliasesForInactiveLogicalSessions(logicalSessionIds: Iterable<string>): void {
    for (const logicalSessionId of logicalSessionIds) {
      this.removeAliasesForInactiveLogicalSession(logicalSessionId);
    }
  }

  private removeAliasesForInactiveLogicalSession(logicalSessionId: string): void {
    if (!this.hasLiveSessionForLogicalSession(logicalSessionId)) {
      this.removeAliasesForLogicalSession(logicalSessionId);
    }
  }

  private hasLiveSessionForLogicalSession(logicalSessionId: string): boolean {
    for (const session of this.sessions.values()) {
      if ((session.logicalSessionId ?? session.sessionId) === logicalSessionId) {
        return true;
      }
    }

    return false;
  }

  private removeAliasesForLogicalSession(logicalSessionId: string): void {
    for (const [sessionId, alias] of this.rotatedSessionAliases.entries()) {
      if (alias.logicalSessionId === logicalSessionId) {
        this.rotatedSessionAliases.delete(sessionId);
      }
    }
  }
}

/**
 * Create a process-local OIDC vault store provider for local development and tests.
 *
 * Records are kept in memory, cloned on read/write, cleaned up opportunistically
 * during store operations, and lost when the Node.js process exits. Do not use
 * this provider when sessions must survive restarts or be shared by multiple
 * application instances.
 */
export function createMemoryOidcVaultStore(options: MemoryOidcVaultStoreOptions = {}): OidcVaultStoreProvider {
  return new MemoryOidcVaultStore(options);
}
