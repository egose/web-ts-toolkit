import {
  OidcVaultStoreConflictError,
  type DeleteSessionsByLogicalSessionIdInput,
  type DeleteSessionsByProviderSessionIdInput,
  type DeleteSessionsBySubjectInput,
} from '@web-ts-toolkit/express-oidc-vault';
import type {
  AuthorizationTransaction,
  AuthorizationTransactionInput,
  ConsumeAuthorizationTransactionIfMatchesInput,
  ConsumeExchangeCodeIfMatchesInput,
  ExchangeCodeRecord,
  ExchangeCodeRecordInput,
  OidcVaultSession,
  OidcVaultSessionInput,
  OidcVaultDeviceBindingStoreProvider,
  OidcVaultRecordBindingMatch,
  OidcVaultSessionRevocationContext,
  ReserveDpopProofInput,
  ConsumeBackchannelLogoutTokenJtiInput,
  RotateSessionInput,
} from '@web-ts-toolkit/express-oidc-vault';

import {
  assertRecordBinding,
  assertSessionBinding,
  assertSameLineageAuthority,
  hasValidSessionRecord,
  hasValidRecordBinding,
  inheritSessionBinding,
  isBindingMatch,
  matchesRecordBinding,
  sessionRevocationContext,
} from './binding';
import { DpopReplayReservations } from './dpop-replay';

/** Construction options for the named package-root memory-store factory. */
export interface MemoryOidcVaultStoreOptions {
  /** Positive safe integer shared by this store object; default 100000. No live replay reservations are evicted. */
  dpopReplayMaxEntries?: number;
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

/**
 * Positional sweep state for one record map (SVH-04).
 *
 * Each opportunistic sweep inspects at most `EXPIRY_SWEEP_BATCH_SIZE`
 * snapshot slots starting at `position`, so a nominal sweep never walks a
 * prefix proportional to the cursor. When `position` reaches the end of the
 * snapshot, the next sweep rebuilds it once from the live map
 * (`O(map.size)`, amortized over the `ceil(size / batch)` sweeps of a full
 * pass) and restarts at 0. Snapshot staleness is harmless: deleted keys are
 * skipped via a live `map.get`, re-inserted keys are still checked, and keys
 * added after the snapshot was taken are picked up on the next pass, so
 * expired records are still eventually reclaimed without background timers.
 */
type MapSweepState = {
  keys: string[];
  position: number;
};

/**
 * Aggregate operation counters for sweep work (SVH-04).
 *
 * `inspectedKeys` / `staleSnapshotSlots` / `snapshotRebuilds` measure the
 * same-map batched traversal, while `aliasSessionVisits` /
 * `aliasEntryVisits` measure the nested alias/lineage cleanup separately.
 * The nested cleanup is intentionally NOT batch-bounded (see
 * `removeAliasesForInactiveLogicalSession`); these counters keep that cost
 * visible instead of letting a capped yield imply constant-time cleanup.
 */
type MemoryStoreSweepWork = {
  inspectedKeys: number;
  staleSnapshotSlots: number;
  snapshotRebuilds: number;
  aliasSessionVisits: number;
  aliasEntryVisits: number;
};

const createMapSweepState = (): MapSweepState => ({ keys: [], position: 0 });

const createMemoryStoreSweepWork = (): MemoryStoreSweepWork => ({
  inspectedKeys: 0,
  staleSnapshotSlots: 0,
  snapshotRebuilds: 0,
  aliasSessionVisits: 0,
  aliasEntryVisits: 0,
});

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

class MemoryOidcVaultStore implements OidcVaultDeviceBindingStoreProvider {
  private readonly authorizationTransactions = new Map<string, AuthorizationTransaction>();
  private readonly exchangeCodes = new Map<string, ExchangeCodeRecord>();
  private readonly sessions = new Map<string, OidcVaultSession>();
  private readonly rotatedSessionAliases = new Map<string, RotatedSessionAlias>();
  private readonly backchannelLogoutTokenJtis = new Map<string, ExpirableRecord>();
  private readonly now: () => number;
  private readonly authorizationTransactionSweep = createMapSweepState();
  private readonly exchangeCodeSweep = createMapSweepState();
  private readonly sessionSweep = createMapSweepState();
  private readonly rotatedSessionAliasSweep = createMapSweepState();
  private readonly backchannelLogoutTokenJtiSweep = createMapSweepState();
  private readonly sweepWork = createMemoryStoreSweepWork();
  private readonly dpopProofs: DpopReplayReservations;

  constructor(options: MemoryOidcVaultStoreOptions = {}) {
    const maxEntries = options.dpopReplayMaxEntries === undefined ? 100_000 : options.dpopReplayMaxEntries;
    if (!Number.isSafeInteger(maxEntries) || maxEntries <= 0) {
      throw new TypeError('OIDC vault DPoP replay maximum entries must be a positive safe integer.');
    }
    this.dpopProofs = new DpopReplayReservations(maxEntries);
    this.now = options.now ?? (() => Date.now());
  }

  async createAuthorizationTransaction(input: AuthorizationTransactionInput): Promise<void> {
    input = cloneRecord(input);
    assertRecordBinding(input);
    const now = this.now();

    this.pruneMapBatch(this.authorizationTransactions, this.authorizationTransactionSweep, now);
    this.authorizationTransactions.set(input.state, input);
  }

  async consumeAuthorizationTransaction(state: string): Promise<AuthorizationTransaction | null> {
    return this.consumeAuthorizationTransactionIfMatches({
      state,
      match: { deviceBinding: null, browserBindingHash: null },
    });
  }

  async getAuthorizationTransaction(state: string): Promise<AuthorizationTransaction | null> {
    const record = this.readOneTimeRecord(this.authorizationTransactions, state, this.now());
    return record &&
      record.state === state &&
      typeof record.nonce === 'string' &&
      typeof record.pkceVerifier === 'string' &&
      typeof record.codeChallenge === 'string'
      ? cloneRecord(record)
      : null;
  }

  async consumeAuthorizationTransactionIfMatches(
    input: ConsumeAuthorizationTransactionIfMatchesInput,
  ): Promise<AuthorizationTransaction | null> {
    input = cloneRecord(input);
    if (!isBindingMatch(input.match)) return null;
    const now = this.now();
    this.pruneMapBatch(this.authorizationTransactions, this.authorizationTransactionSweep, now);
    const record = this.readOneTimeRecord(this.authorizationTransactions, input.state, now);
    if (
      !record ||
      record.state !== input.state ||
      typeof record.nonce !== 'string' ||
      typeof record.pkceVerifier !== 'string' ||
      typeof record.codeChallenge !== 'string' ||
      !matchesRecordBinding(record, input.match)
    )
      return null;
    // No asynchronous boundary between liveness/matching and deletion.
    this.authorizationTransactions.delete(input.state);
    return cloneRecord(record);
  }

  async createExchangeCode(input: ExchangeCodeRecordInput): Promise<void> {
    input = cloneRecord(input);
    assertRecordBinding(input);
    const now = this.now();

    this.pruneMapBatch(this.exchangeCodes, this.exchangeCodeSweep, now);
    this.exchangeCodes.set(input.code, input);
  }

  async consumeExchangeCode(code: string): Promise<ExchangeCodeRecord | null> {
    const now = this.now();
    this.pruneMapBatch(this.exchangeCodes, this.exchangeCodeSweep, now);
    return this.consumeExchangeRecord(code, { deviceBinding: null, browserBindingHash: null }, now);
  }

  async getExchangeCode(code: string): Promise<ExchangeCodeRecord | null> {
    const record = this.readOneTimeRecord(this.exchangeCodes, code, this.now());
    return record && record.code === code && typeof record.sessionId === 'string' ? cloneRecord(record) : null;
  }

  async consumeExchangeCodeIfMatches(input: ConsumeExchangeCodeIfMatchesInput): Promise<ExchangeCodeRecord | null> {
    input = cloneRecord(input);
    if (!isBindingMatch(input.match) || typeof input.expectedSessionId !== 'string') return null;
    const now = this.now();
    this.pruneMapBatch(this.exchangeCodes, this.exchangeCodeSweep, now);
    return this.consumeExchangeRecord(input.code, input.match, now, input.expectedSessionId);
  }

  private consumeExchangeRecord(
    code: string,
    match: OidcVaultRecordBindingMatch,
    now: number,
    expectedSessionId?: string,
  ): ExchangeCodeRecord | null {
    const record = this.readOneTimeRecord(this.exchangeCodes, code, now);
    if (
      !record ||
      record.code !== code ||
      typeof record.sessionId !== 'string' ||
      (expectedSessionId !== undefined && record.sessionId !== expectedSessionId) ||
      !matchesRecordBinding(record, match)
    )
      return null;
    this.exchangeCodes.delete(code);
    return cloneRecord(record);
  }

  private readOneTimeRecord<T extends AuthorizationTransaction | ExchangeCodeRecord>(
    map: Map<string, T>,
    id: string,
    now: number,
  ): T | null {
    const record = map.get(id);
    if (!record) return null;
    if (
      !Number.isFinite(record.createdAt) ||
      !Number.isFinite(record.expiresAt) ||
      isExpiredRecord(record, now) ||
      !hasValidRecordBinding(record)
    ) {
      map.delete(id);
      return null;
    }
    return record;
  }

  async createSession(input: OidcVaultSessionInput): Promise<OidcVaultSession> {
    input = cloneRecord(input);
    assertSessionBinding(input);
    const timestamp = this.now();
    this.pruneSessionsBatch(timestamp);
    this.pruneMapBatch(this.rotatedSessionAliases, this.rotatedSessionAliasSweep, timestamp);
    const session: OidcVaultSession = {
      ...input,
      logicalSessionId: input.logicalSessionId ?? input.sessionId,
      createdAt: input.createdAt ?? timestamp,
      updatedAt: input.updatedAt ?? timestamp,
    };

    const previousSession = this.sessions.get(session.sessionId);
    const previousLogicalSessionId = previousSession?.logicalSessionId ?? previousSession?.sessionId;
    this.sessions.set(session.sessionId, session);
    this.rotatedSessionAliases.delete(session.sessionId);
    if (previousLogicalSessionId !== undefined && previousLogicalSessionId !== session.logicalSessionId) {
      this.removeAliasesForInactiveLogicalSession(previousLogicalSessionId, timestamp);
    }
    return cloneRecord(session);
  }

  async getSession(sessionId: string): Promise<OidcVaultSession | null> {
    const now = this.now();

    const session = this.sessions.get(sessionId);

    if (session && isExpiredRecord(session, now)) {
      this.sessions.delete(sessionId);
      this.removeAliasesForInactiveLogicalSession(session.logicalSessionId ?? session.sessionId, now);
      return null;
    }

    return session && hasValidSessionRecord(session, sessionId) ? cloneRecord(session) : null;
  }

  async getSessionRevocationContext(sessionId: string): Promise<OidcVaultSessionRevocationContext | null> {
    const now = this.now();
    const live = this.sessions.get(sessionId);
    const alias = this.rotatedSessionAliases.get(sessionId);
    if (live && !isExpiredRecord(live, now)) {
      if (live.sessionId !== sessionId) throw new Error('OIDC vault store has malformed revocation authority.');
      sessionRevocationContext(live);
    }
    if (
      (!live || isExpiredRecord(live, now)) &&
      alias &&
      (typeof alias.logicalSessionId !== 'string' ||
        (alias.expiresAt !== undefined && !Number.isFinite(alias.expiresAt)))
    ) {
      throw new Error('OIDC vault store has malformed revocation alias.');
    }
    const logicalSessionId =
      live && !isExpiredRecord(live, now)
        ? (live.logicalSessionId ?? live.sessionId)
        : alias && !isExpiredRecord(alias, now)
          ? alias.logicalSessionId
          : undefined;
    if (logicalSessionId === undefined) return null;
    if (typeof logicalSessionId !== 'string') throw new Error('OIDC vault store has malformed revocation authority.');
    let source: OidcVaultSession | undefined;
    for (const member of this.sessions.values()) {
      if ((member.logicalSessionId ?? member.sessionId) !== logicalSessionId || isExpiredRecord(member, now)) continue;
      if (
        member.sessionId === undefined ||
        typeof member.subject !== 'string' ||
        (member.expiresAt !== undefined && !Number.isFinite(member.expiresAt))
      ) {
        throw new Error('OIDC vault store lineage has malformed session authority.');
      }
      sessionRevocationContext(member);
      if (source) assertSameLineageAuthority(source, member);
      else source = member;
    }
    return source ? sessionRevocationContext(source) : null;
  }

  async reserveDpopProof(input: ReserveDpopProofInput): Promise<boolean> {
    input = { replayKey: input.replayKey, expiresAt: input.expiresAt };
    return this.dpopProofs.reserve(input, this.now());
  }

  async rotateSession(input: RotateSessionInput): Promise<OidcVaultSession> {
    const timestamp = this.now();

    const sourceSession = this.sessions.get(input.sessionId);

    if (sourceSession && isExpiredRecord(sourceSession, timestamp)) {
      this.sessions.delete(input.sessionId);
      this.removeAliasesForInactiveLogicalSession(sourceSession.logicalSessionId ?? sourceSession.sessionId, timestamp);
    }

    const liveSourceSession = this.sessions.get(input.sessionId);

    if (!liveSourceSession || !hasValidSessionRecord(liveSourceSession, input.sessionId)) {
      throw new OidcVaultStoreConflictError('OIDC vault session no longer exists for rotation.');
    }

    if (input.nextSession.sessionId === input.sessionId) {
      throw new OidcVaultStoreConflictError('OIDC vault session rotation target must use a different session ID.');
    }

    const existingTargetSession = this.sessions.get(input.nextSession.sessionId);

    if (existingTargetSession && !isExpiredRecord(existingTargetSession, timestamp)) {
      throw new OidcVaultStoreConflictError('OIDC vault session rotation target already exists.');
    }

    const nextSession = cloneRecord(input.nextSession);
    inheritSessionBinding(liveSourceSession, nextSession);
    const session: OidcVaultSession = {
      ...nextSession,
      logicalSessionId:
        nextSession.logicalSessionId ?? liveSourceSession.logicalSessionId ?? liveSourceSession.sessionId,
      createdAt: nextSession.createdAt ?? timestamp,
      updatedAt: nextSession.updatedAt ?? timestamp,
    };

    // Clone before retiring any target ownership so a rejected replacement
    // leaves the source and target lineages' revocation handles intact.
    if (existingTargetSession) {
      this.sessions.delete(session.sessionId);
      this.removeAliasesForInactiveLogicalSession(
        existingTargetSession.logicalSessionId ?? existingTargetSession.sessionId,
        timestamp,
      );
    }

    const previousLogicalSessionId = liveSourceSession.logicalSessionId ?? liveSourceSession.sessionId;
    this.sessions.delete(input.sessionId);
    this.sessions.set(session.sessionId, session);
    this.rotatedSessionAliases.delete(session.sessionId);
    this.rotatedSessionAliases.set(input.sessionId, {
      logicalSessionId: session.logicalSessionId ?? session.sessionId,
      expiresAt: session.expiresAt,
    });
    if (previousLogicalSessionId !== session.logicalSessionId) {
      this.removeAliasesForInactiveLogicalSession(previousLogicalSessionId, timestamp);
    }
    return cloneRecord(session);
  }

  async deleteSession(sessionId: string): Promise<void> {
    const now = this.now();
    this.pruneSessionsBatch(now);
    this.pruneMapBatch(this.rotatedSessionAliases, this.rotatedSessionAliasSweep, now);

    const session = this.sessions.get(sessionId);

    if (session) {
      const logicalSessionId = session.logicalSessionId ?? session.sessionId;
      this.sessions.delete(sessionId);
      this.rotatedSessionAliases.delete(sessionId);
      this.removeAliasesForInactiveLogicalSession(logicalSessionId, now);
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

    this.removeAliasesForInactiveLogicalSessions(expiredLogicalSessionIds, now);
    this.removeAliasesForLogicalSession(resolved.logicalSessionId);

    return deleted;
  }

  async consumeBackchannelLogoutTokenJti(input: ConsumeBackchannelLogoutTokenJtiInput): Promise<boolean> {
    const now = this.now();
    this.pruneMapBatch(this.backchannelLogoutTokenJtis, this.backchannelLogoutTokenJtiSweep, now);

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

    this.removeAliasesForInactiveLogicalSessions(expiredLogicalSessionIds, now);
    this.removeAliasesForInactiveLogicalSessions(logicalSessionIds, now);

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

    this.removeAliasesForInactiveLogicalSessions(expiredLogicalSessionIds, now);
    this.removeAliasesForInactiveLogicalSessions(logicalSessionIds, now);

    return deleted;
  }

  private pruneMapBatch<T extends ExpirableRecord>(map: Map<string, T>, sweep: MapSweepState, now: number): void {
    if (map.size === 0) {
      sweep.keys = [];
      sweep.position = 0;
      return;
    }

    if (sweep.position >= sweep.keys.length) {
      this.rebuildSweepSnapshot(map, sweep);
    }

    let visited = 0;

    while (visited < EXPIRY_SWEEP_BATCH_SIZE) {
      if (sweep.position >= sweep.keys.length) {
        // The snapshot is exhausted but the map grew while it was being
        // consumed, so unseen keys exist. Rebuild once and keep consuming
        // within the same batch; otherwise stop until the next operation.
        // The `visited` cap still bounds this sweep, and revisits after a
        // rebuild are harmless live `map.get` checks.
        if (map.size <= sweep.keys.length) {
          break;
        }

        this.rebuildSweepSnapshot(map, sweep);
      }

      const key = sweep.keys[sweep.position] as string;
      sweep.position += 1;
      visited += 1;

      const value = map.get(key);

      if (value === undefined) {
        this.sweepWork.staleSnapshotSlots += 1;
        continue;
      }

      this.sweepWork.inspectedKeys += 1;

      if (isExpiredRecord(value, now)) {
        map.delete(key);
      }
    }
  }

  private rebuildSweepSnapshot<T>(map: Map<string, T>, sweep: MapSweepState): void {
    sweep.keys = Array.from(map.keys());
    sweep.position = 0;
    this.sweepWork.snapshotRebuilds += 1;
  }

  private pruneSessionsBatch(now: number): void {
    const sweep = this.sessionSweep;

    if (this.sessions.size === 0) {
      sweep.keys = [];
      sweep.position = 0;
      return;
    }

    if (sweep.position >= sweep.keys.length) {
      this.rebuildSweepSnapshot(this.sessions, sweep);
    }

    const expiredLogicalSessionIds = new Set<string>();
    let visited = 0;

    while (visited < EXPIRY_SWEEP_BATCH_SIZE) {
      if (sweep.position >= sweep.keys.length) {
        if (this.sessions.size <= sweep.keys.length) {
          break;
        }

        this.rebuildSweepSnapshot(this.sessions, sweep);
      }

      const sessionId = sweep.keys[sweep.position] as string;
      sweep.position += 1;
      visited += 1;

      const session = this.sessions.get(sessionId);

      if (session === undefined) {
        this.sweepWork.staleSnapshotSlots += 1;
        continue;
      }

      this.sweepWork.inspectedKeys += 1;

      if (isExpiredRecord(session, now)) {
        expiredLogicalSessionIds.add(session.logicalSessionId ?? session.sessionId);
        this.sessions.delete(sessionId);
      }
    }

    this.removeAliasesForInactiveLogicalSessions(expiredLogicalSessionIds, now);
  }

  private removeAliasesForInactiveLogicalSessions(logicalSessionIds: Iterable<string>, now: number): void {
    for (const logicalSessionId of logicalSessionIds) {
      this.removeAliasesForInactiveLogicalSession(logicalSessionId, now);
    }
  }

  private removeAliasesForInactiveLogicalSession(logicalSessionId: string, now: number): void {
    if (!this.hasLiveSessionForLogicalSession(logicalSessionId, now)) {
      this.removeAliasesForLogicalSession(logicalSessionId);
    }
  }

  /**
   * Residual cost note (SVH-04): liveness is a full scan of `sessions`
   * (early-out on the first live member), so per retired logical lineage the
   * cleanup work is proportional to retained sessions, not to the 64-entry sweep
   * batch. Visits are counted in `sweepWork.aliasSessionVisits` so this
   * nested cost stays measurable and is never implied to be constant-time.
   */
  private hasLiveSessionForLogicalSession(logicalSessionId: string, now: number): boolean {
    for (const session of this.sessions.values()) {
      this.sweepWork.aliasSessionVisits += 1;

      if ((session.logicalSessionId ?? session.sessionId) === logicalSessionId && !isExpiredRecord(session, now)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Residual cost note (SVH-04): alias removal scans every
   * `rotatedSessionAliases` entry for the lineage, so per expired lineage the
   * work is proportional to live aliases. Visits are counted in
   * `sweepWork.aliasEntryVisits`. Bounding this further would need a
   * lineage-to-alias index; that was deferred as unjustified complexity for
   * the measured workloads (see README sweep-bounds note).
   */
  private removeAliasesForLogicalSession(logicalSessionId: string): void {
    for (const [sessionId, alias] of this.rotatedSessionAliases.entries()) {
      this.sweepWork.aliasEntryVisits += 1;

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
 * application instances. The returned stronger provider includes guarded
 * exact/null consumes, token-free revocation context, and bounded DPoP replay.
 * Replay is shared only by callers reusing this same object; the store does not
 * verify HTTP proofs. Capacity defaults to 100000 and never evicts live entries.
 */
export function createMemoryOidcVaultStore(
  options: MemoryOidcVaultStoreOptions = {},
): OidcVaultDeviceBindingStoreProvider {
  return new MemoryOidcVaultStore(options);
}
