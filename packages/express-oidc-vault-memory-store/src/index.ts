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

class MemoryOidcVaultStore implements OidcVaultStoreProvider {
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

  constructor(options: MemoryOidcVaultStoreOptions = {}) {
    this.now = options.now ?? (() => Date.now());
  }

  async createAuthorizationTransaction(input: AuthorizationTransactionInput): Promise<void> {
    const now = this.now();

    this.pruneMapBatch(this.authorizationTransactions, this.authorizationTransactionSweep, now);
    this.authorizationTransactions.set(input.state, cloneRecord(input));
  }

  async consumeAuthorizationTransaction(state: string): Promise<AuthorizationTransaction | null> {
    const now = this.now();
    this.pruneMapBatch(this.authorizationTransactions, this.authorizationTransactionSweep, now);

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

    this.pruneMapBatch(this.exchangeCodes, this.exchangeCodeSweep, now);
    this.exchangeCodes.set(input.code, cloneRecord(input));
  }

  async consumeExchangeCode(code: string): Promise<ExchangeCodeRecord | null> {
    const now = this.now();

    this.pruneMapBatch(this.exchangeCodes, this.exchangeCodeSweep, now);

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
    this.pruneMapBatch(this.rotatedSessionAliases, this.rotatedSessionAliasSweep, timestamp);
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
    this.pruneMapBatch(this.rotatedSessionAliases, this.rotatedSessionAliasSweep, now);

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

    this.removeAliasesForInactiveLogicalSessions(expiredLogicalSessionIds);
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

  /**
   * Residual cost note (SVH-04): liveness is a full scan of `sessions`
   * (early-out on the first live member), so per expired logical lineage the
   * cleanup work is proportional to live sessions, not to the 64-entry sweep
   * batch. Visits are counted in `sweepWork.aliasSessionVisits` so this
   * nested cost stays measurable and is never implied to be constant-time.
   */
  private hasLiveSessionForLogicalSession(logicalSessionId: string): boolean {
    for (const session of this.sessions.values()) {
      this.sweepWork.aliasSessionVisits += 1;

      if ((session.logicalSessionId ?? session.sessionId) === logicalSessionId) {
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
 * application instances.
 */
export function createMemoryOidcVaultStore(options: MemoryOidcVaultStoreOptions = {}): OidcVaultStoreProvider {
  return new MemoryOidcVaultStore(options);
}
