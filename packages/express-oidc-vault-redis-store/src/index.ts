import {
  OidcVaultStoreConflictError,
  OidcVaultDpopReplayCapacityError,
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
  OidcVaultSessionRevocationContext,
  ReserveDpopProofInput,
  ConsumeBackchannelLogoutTokenJtiInput,
  RotateSessionInput,
} from '@web-ts-toolkit/express-oidc-vault';

import { DEFAULT_KEY_PREFIX, RedisOidcVaultStoreKeys } from './keys.js';
import {
  OidcVaultRedisStoreRecordError,
  assertRecordBinding,
  assertSessionBinding,
  type StoredRecordKind,
  isPlainRecord,
  isString,
  parseStoredJson,
  serialize,
  validateAuthorizationTransaction,
  validateExchangeCodeRecord,
  validateSession,
  validateBindingMatch,
} from './records.js';
import {
  type DeleteSessionScriptScope,
  type RedisScriptRunnerClient,
  RedisScriptRunner,
  buildCleanupInactiveAliasesCommand,
  buildCompareAndDeleteCommand,
  buildConsumeGuardedRecordCommand,
  buildDeleteSessionCommand,
  buildRepairSessionIndexCommand,
  buildRotateSessionCommand,
  buildReserveDpopProofCommand,
  buildSessionRevocationContextCommand,
  buildWriteSessionCommand,
} from './scripts.js';

/**
 * Minimal structural shape of the Redis client or adapter this package
 * consumes. The package does not import the official `redis` driver at runtime;
 * it accepts any client that implements this interface. An official
 * `redis.createClient(...)` standalone client (`RedisClientType`) satisfies
 * this shape directly. Redis Cluster clients are intentionally excluded until
 * the package ships a hash-slot routing adapter.
 *
 * Redis Sentinel: the `redis.createSentinel(...)` root client does NOT satisfy
 * this contract directly because its `sendCommand(isReadonly, args, options?)`
 * requires an `isReadonly` first argument. To use Sentinel, acquire the
 * underlying master client (for example through `sentinel.use(c => c)` or
 * `await sentinel.acquire()`) and pass a client connection that exposes the
 * standalone `sendCommand(args, options?)` signature, or wrap the Sentinel
 * root with an adapter conforming to this interface.
 *
 * A constructed client must be connected before use; the package never calls
 * `connect()` and never reads or suppresses client error/quit listeners. The
 * caller owns the client lifecycle (connect, error handling, and shutdown).
 *
 * `sendCommand` is required because atomic session writes, rotations,
 * deletions, and one-time record consumption transit Redis
 * cached Lua/`TYPE`/`TIME`/`ZRANGE`/`ZSCAN`/`MGET` commands through it.
 * It was previously optional in this type but always enforced at runtime.
 */
export interface OidcVaultRedisClient {
  set(key: string, value: string, options?: { PXAT?: number; NX?: true }): Promise<unknown>;
  get(key: string): Promise<string | null>;
  del(keys: string | string[]): Promise<number>;
  sendCommand(args: string[]): Promise<unknown>;
  /** Sentinel members that mark an official Redis Cluster client. Reject at construction. */
  getSlotMaster?: never;
  masters?: never;
  nodeClient?: never;
  slots?: never;
}

/**
 * Options for {@link createRedisOidcVaultStore}.
 *
 * The caller is responsible for connecting the `client` before constructing the
 * store and for owning `error` listeners, reconnects, and shutdown (`quit()` /
 * `disconnect()`). The package never calls `connect`, `quit`, or `disconnect`.
 */
export interface RedisOidcVaultStoreOptions {
  /** Positive safe integer per shared keyPrefix; default 100000. Configure identically on all clients. */
  dpopReplayMaxEntries?: number;
  /** Connected Redis client or compatible adapter implementing {@link OidcVaultRedisClient}. */
  client: OidcVaultRedisClient;
  /**
   * Optional namespace for vault keys, written as `<keyPrefix>:<kind>:<id>`.
   * Defaults to `oidc-vault`. Changing it after records exist starts an
   * independent namespace; existing sessions remain discoverable only under
   * the previous prefix and will not be revoked or cleaned up by the new store.
   */
  keyPrefix?: string;
  /**
   * Optional clock used only for store-domain timestamps (e.g. JTI
   * expiration). Redis server time remains the authority for key expiry
   * (`PXAT`) and revocation-index pruning, so a skewed application clock
   * cannot remove a still-live Redis session from any index.
   */
  now?: () => number;
}

const INDEX_CLEANUP_SCAN_COUNT = 100;
const INDEX_REVOCATION_SCAN_COUNT = 250;

// Copy portable containers, not a JSON round-trip: native values and custom
// toJSON hooks must still reach the existing serializer unchanged. Ownership of
// opaque, non-plain values is outside the documented portable value domain.
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

const isRecord = (value: unknown): value is Record<PropertyKey, unknown> => typeof value === 'object' && value !== null;

const isUnsupportedClusterClient = (client: OidcVaultRedisClient): boolean =>
  isRecord(client) &&
  typeof client.getSlotMaster === 'function' &&
  typeof client.nodeClient === 'function' &&
  Array.isArray(client.masters) &&
  Array.isArray(client.slots);

const toSubjectDeleteInput = (input: string | DeleteSessionsBySubjectInput): DeleteSessionsBySubjectInput =>
  typeof input === 'string' ? { subject: input } : { ...input };

const toProviderSessionDeleteInput = (
  input: string | DeleteSessionsByProviderSessionIdInput,
): DeleteSessionsByProviderSessionIdInput => (typeof input === 'string' ? { providerSessionId: input } : { ...input });

const toLogicalSessionDeleteInput = (
  input: string | DeleteSessionsByLogicalSessionIdInput,
): DeleteSessionsByLogicalSessionIdInput => (typeof input === 'string' ? { logicalSessionId: input } : { ...input });

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

class RedisOidcVaultStore implements OidcVaultDeviceBindingStoreProvider {
  private readonly client: OidcVaultRedisClient;
  private readonly keys: RedisOidcVaultStoreKeys;
  private readonly now: () => number;
  private readonly scriptRunner: RedisScriptRunner;
  private indexCleanupCursor = '0';
  private readonly dpopReplayMaxEntries: number;

  constructor(options: RedisOidcVaultStoreOptions) {
    this.dpopReplayMaxEntries = options.dpopReplayMaxEntries === undefined ? 100_000 : options.dpopReplayMaxEntries;
    if (!Number.isSafeInteger(this.dpopReplayMaxEntries) || this.dpopReplayMaxEntries <= 0) {
      throw new TypeError('OIDC vault DPoP replay maximum entries must be a positive safe integer.');
    }
    if (typeof options.client.sendCommand !== 'function') {
      throw new Error('Redis store client must implement sendCommand(args) for atomic vault operations.');
    }

    if (isUnsupportedClusterClient(options.client)) {
      throw new Error(
        'Redis store supports standalone Redis and Redis Sentinel clients only. Redis Cluster is not supported because vault scripts touch multiple keys without a cluster hash-slot adapter.',
      );
    }

    this.client = options.client;
    this.keys = new RedisOidcVaultStoreKeys(options.keyPrefix ?? DEFAULT_KEY_PREFIX);
    this.now = options.now ?? Date.now;
    this.scriptRunner = new RedisScriptRunner(options.client as RedisScriptRunnerClient);
  }

  async createAuthorizationTransaction(input: AuthorizationTransactionInput): Promise<void> {
    input = snapshotInput({ ...input });
    assertRecordBinding(input);
    await this.setJson(this.keys.authorizationTransaction(input.state), input, input.expiresAt);
  }

  async consumeAuthorizationTransaction(state: string): Promise<AuthorizationTransaction | null> {
    const value = await this.runScript(
      buildConsumeGuardedRecordCommand(this.keys.authorizationTransaction(state), 'transaction', state),
    );
    return this.parseOneTimeRecord(value, 'authorization transaction', (value) =>
      validateAuthorizationTransaction(value, state),
    );
  }

  async getAuthorizationTransaction(state: string): Promise<AuthorizationTransaction | null> {
    return this.getJson(
      this.keys.authorizationTransaction(state),
      'authorization transaction',
      (value) => validateAuthorizationTransaction(value, state),
      { deleteMalformed: true, checkExpiry: true },
    );
  }

  async consumeAuthorizationTransactionIfMatches(
    input: ConsumeAuthorizationTransactionIfMatchesInput,
  ): Promise<AuthorizationTransaction | null> {
    input = snapshotInput({ ...input });
    if (!validateBindingMatch(input.match)) return null;
    const value = await this.runScript(
      buildConsumeGuardedRecordCommand(
        this.keys.authorizationTransaction(input.state),
        'transaction',
        input.state,
        input.match,
      ),
    );
    return this.parseOneTimeRecord(value, 'authorization transaction', (value) =>
      validateAuthorizationTransaction(value, input.state),
    );
  }

  async createExchangeCode(input: ExchangeCodeRecordInput): Promise<void> {
    input = snapshotInput({ ...input });
    assertRecordBinding(input);
    await this.setJson(this.keys.exchangeCode(input.code), input, input.expiresAt);
  }

  async consumeExchangeCode(code: string): Promise<ExchangeCodeRecord | null> {
    const value = await this.runScript(
      buildConsumeGuardedRecordCommand(this.keys.exchangeCode(code), 'exchange', code),
    );
    return this.parseOneTimeRecord(value, 'exchange code', (value) => validateExchangeCodeRecord(value, code));
  }

  async getExchangeCode(code: string): Promise<ExchangeCodeRecord | null> {
    return this.getJson(
      this.keys.exchangeCode(code),
      'exchange code',
      (value) => validateExchangeCodeRecord(value, code),
      { deleteMalformed: true, checkExpiry: true },
    );
  }

  async consumeExchangeCodeIfMatches(input: ConsumeExchangeCodeIfMatchesInput): Promise<ExchangeCodeRecord | null> {
    input = snapshotInput({ ...input });
    if (!validateBindingMatch(input.match) || typeof input.expectedSessionId !== 'string') return null;
    const value = await this.runScript(
      buildConsumeGuardedRecordCommand(
        this.keys.exchangeCode(input.code),
        'exchange',
        input.code,
        input.match,
        input.expectedSessionId,
      ),
    );
    return this.parseOneTimeRecord(value, 'exchange code', (value) => validateExchangeCodeRecord(value, input.code));
  }

  async getSessionRevocationContext(sessionId: string): Promise<OidcVaultSessionRevocationContext | null> {
    const raw = await this.runScript(buildSessionRevocationContextCommand(this.keys, sessionId));
    if (typeof raw !== 'string') return null;
    const context = JSON.parse(raw) as OidcVaultSessionRevocationContext;
    // Redis cjson encodes an empty Lua table as [], while the contract's
    // provider object is an allowlist with absent optional fields.
    if (Array.isArray(context.provider) && context.provider.length === 0) context.provider = {};
    return context;
  }

  async reserveDpopProof(input: ReserveDpopProofInput): Promise<boolean> {
    input = { replayKey: input.replayKey, expiresAt: input.expiresAt };
    // Validate numeric representation locally too; server time owns the window.
    if (typeof input.replayKey !== 'string' || !Number.isSafeInteger(input.expiresAt)) return false;
    const result = await this.runScript(buildReserveDpopProofCommand(this.keys, input, this.dpopReplayMaxEntries));
    if (result === 2 || result === '2') throw new OidcVaultDpopReplayCapacityError();
    return result === 1 || result === '1';
  }

  /**
   * Creates a session record atomically, then runs best-effort index
   * maintenance.
   *
   * Result policy (SVH-02): once `writeSessionRecord` reports success the
   * session is committed and this method resolves with the session even if
   * post-commit index maintenance (`SCAN`/`TYPE`/`TIME`/`ZREMRANGEBYSCORE`)
   * fails. A maintenance failure is reported once via a fixed-text
   * `console.warn` identifying only the operation (no adapter error details,
   * session IDs, keys, or token material) and is retried opportunistically by
   * a later `createSession`/`rotateSession` call. Mutation-command failures (the
   * atomic write script) still reject, and this method never retries a
   * committed mutation.
   */
  async createSession(input: OidcVaultSessionInput): Promise<OidcVaultSession> {
    input = snapshotInput({ ...input });
    assertSessionBinding(input);
    const timestamp = this.now();
    const session: OidcVaultSession = {
      ...input,
      logicalSessionId: input.logicalSessionId ?? input.sessionId,
      createdAt: input.createdAt ?? timestamp,
      updatedAt: input.updatedAt ?? timestamp,
    };

    const written = await this.writeSessionRecord(session);

    if (!written) {
      throw new OidcVaultStoreConflictError('OIDC vault session already exists.');
    }

    await this.runPostCommitIndexMaintenance('createSession');

    return session;
  }

  async getSession(sessionId: string): Promise<OidcVaultSession | null> {
    return this.getJson(this.keys.session(sessionId), 'session', (value) => validateSession(value, sessionId), {
      deleteMalformed: true,
    });
  }

  async rotateSession(input: RotateSessionInput): Promise<OidcVaultSession> {
    input = { sessionId: input.sessionId, nextSession: snapshotInput({ ...input.nextSession }) };
    assertSessionBinding(input.nextSession);
    const previousSession = await this.getSession(input.sessionId);

    if (!previousSession) {
      throw new OidcVaultStoreConflictError('OIDC vault session no longer exists for rotation.');
    }

    if (input.nextSession.sessionId === input.sessionId) {
      throw new OidcVaultStoreConflictError('OIDC vault session rotation target must use a different session ID.');
    }

    if (
      input.nextSession.deviceBinding !== undefined &&
      input.nextSession.deviceBinding.jkt !== previousSession.deviceBinding?.jkt
    ) {
      throw new OidcVaultStoreConflictError('OIDC vault session rotation cannot change or add device binding.');
    }

    const nextSession: OidcVaultSession = {
      ...input.nextSession,
      ...(previousSession.deviceBinding === undefined ? {} : { deviceBinding: { ...previousSession.deviceBinding } }),
      logicalSessionId:
        input.nextSession.logicalSessionId ?? previousSession.logicalSessionId ?? previousSession.sessionId,
    };
    const rotated = await this.rotateSessionRecord(previousSession, nextSession);

    if (!rotated) {
      throw new OidcVaultStoreConflictError('OIDC vault session no longer exists for rotation.');
    }

    // Same post-commit policy as createSession: the atomic source/target
    // transition is already committed here, so index-maintenance failure must
    // not reject a successful rotation (the original credential is already
    // consumed) and must not trigger a retry of this non-idempotent rotation.
    await this.runPostCommitIndexMaintenance('rotateSession');

    return nextSession;
  }

  async deleteSession(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);

    if (!session) {
      const logicalSessionId = await this.getJson(
        this.keys.rotatedSessionAlias(sessionId),
        'rotated session alias',
        isString,
        { deleteMalformed: true },
      );

      if (logicalSessionId) {
        await this.deleteSessionsByLogicalSessionId(logicalSessionId);
      }

      // SVH-03: the session key was observed missing or malformed above. A
      // fresh same-ID session may have been created since that read (ID reuse
      // is supported), so never delete unconditionally here. Remove the key
      // only when it still holds malformed data; a valid replacement belongs
      // to a new generation (genuine logout of a live ID goes through the
      // branch below or a scoped logical revocation, never this cleanup).
      await this.deleteSessionKeyIfMalformed(sessionId);
      return;
    }

    await this.deleteSessionRecord(session, { kind: 'single' });
  }

  async deleteSessionsByLogicalSessionId(input: string | DeleteSessionsByLogicalSessionIdInput): Promise<number> {
    const resolved = toLogicalSessionDeleteInput(input);
    return this.deleteSessionsFromIndex(this.keys.logicalSessionIndex(resolved.logicalSessionId), resolved);
  }

  async consumeBackchannelLogoutTokenJti(input: ConsumeBackchannelLogoutTokenJtiInput): Promise<boolean> {
    const now = this.now();

    if (!Number.isFinite(input.expiresAt) || input.expiresAt <= now) {
      return false;
    }

    const result = await this.client.set(this.keys.backchannelLogoutTokenJti(input.jti), '1', {
      PXAT: input.expiresAt,
      NX: true,
    });

    return result === 'OK' || result === true;
  }

  async deleteSessionsBySubject(input: string | DeleteSessionsBySubjectInput): Promise<number> {
    const resolved = toSubjectDeleteInput(input);
    return this.deleteSessionsFromIndex(this.keys.subjectIndex(resolved.subject), resolved);
  }

  async deleteSessionsByProviderSessionId(input: string | DeleteSessionsByProviderSessionIdInput): Promise<number> {
    const resolved = toProviderSessionDeleteInput(input);
    return this.deleteSessionsFromIndex(this.keys.providerSessionIndex(resolved.providerSessionId), resolved);
  }

  private async setJson(key: string, value: unknown, expiresAt?: number): Promise<void> {
    const options = typeof expiresAt === 'number' ? { PXAT: expiresAt } : undefined;
    await this.client.set(key, serialize(value), options);
  }

  private async getJson<T>(
    key: string,
    recordKind: StoredRecordKind,
    validate: (parsed: unknown) => parsed is T,
    options?: { deleteMalformed?: boolean; checkExpiry?: boolean },
  ): Promise<T | null> {
    const raw = await this.client.get(key);

    try {
      const record = parseStoredJson(raw, recordKind, validate);
      if (
        record !== null &&
        options?.checkExpiry &&
        isPlainRecord(record) &&
        typeof record.expiresAt === 'number' &&
        record.expiresAt <= (await this.redisServerTime())
      )
        return null;
      return record;
    } catch (error) {
      if (options?.deleteMalformed && error instanceof OidcVaultRedisStoreRecordError && raw !== null) {
        // SVH-03: delete only the observed malformed payload. The Lua script
        // compares server-side, so a fresh same-ID value written after this
        // read is left untouched. Reads still fail closed to `null`.
        await this.deleteMalformedValueIfUnchanged(key, raw);
        return null;
      }

      throw error;
    }
  }

  private parseOneTimeRecord<T>(
    value: unknown,
    recordKind: StoredRecordKind,
    validate: (parsed: unknown) => parsed is T,
  ): T | null {
    try {
      return typeof value === 'string' ? parseStoredJson(value, recordKind, validate) : null;
    } catch (error) {
      if (error instanceof OidcVaultRedisStoreRecordError) {
        return null;
      }

      throw error;
    }
  }

  private async writeSessionRecord(session: OidcVaultSession): Promise<boolean> {
    const result = await this.runScript(buildWriteSessionCommand(this.keys, session));

    return result === 1 || result === '1';
  }

  private async deleteSessionRecord(session: OidcVaultSession, scope: DeleteSessionScriptScope): Promise<number> {
    const result = await this.runScript(buildDeleteSessionCommand(this.keys, session, scope));

    return typeof result === 'number' ? result : Number(result);
  }

  /**
   * Removes a stored value only when it still equals the malformed payload
   * observed by a prior read (SVH-03). The equality check runs inside the Lua
   * script, so a concurrent `createSession` reusing the same ID is never
   * destroyed by a stale repair.
   */
  private async deleteMalformedValueIfUnchanged(key: string, observedRaw: string): Promise<void> {
    await this.runScript(buildCompareAndDeleteCommand(key, observedRaw));
  }

  /**
   * Best-effort cleanup for the missing-session branch of `deleteSession`.
   * Re-reads the session key and removes it only when it still holds malformed
   * data. A missing key needs no cleanup and a freshly created valid session
   * (same-ID reuse after the earlier read) is preserved; genuine logout of a
   * live session never reaches this branch.
   */
  private async deleteSessionKeyIfMalformed(sessionId: string): Promise<void> {
    const sessionKey = this.keys.session(sessionId);
    let raw: string | null;

    try {
      raw = await this.client.get(sessionKey);
    } catch {
      return;
    }

    if (raw === null) {
      return;
    }

    try {
      parseStoredJson(raw, 'session', (value) => validateSession(value, sessionId));
    } catch (error) {
      if (error instanceof OidcVaultRedisStoreRecordError) {
        await this.deleteMalformedValueIfUnchanged(sessionKey, raw);
        return;
      }

      throw error;
    }
  }

  private async rotateSessionRecord(
    previousSession: OidcVaultSession,
    nextSession: OidcVaultSession,
  ): Promise<boolean> {
    const result = await this.runScript(buildRotateSessionCommand(this.keys, previousSession, nextSession));

    if (result === 2 || result === '2') {
      throw new OidcVaultStoreConflictError('OIDC vault session rotation target already exists.');
    }

    if (result === 3 || result === '3') {
      throw new OidcVaultStoreConflictError('OIDC vault session changed before rotation could commit.');
    }

    return result === 1 || result === '1';
  }

  private async runScript(command: string[]): Promise<unknown> {
    return this.scriptRunner.run(command);
  }

  private async cleanupExpiredIndexMembers(indexKey: string): Promise<void> {
    await this.sendCommand(['ZREMRANGEBYSCORE', indexKey, '-inf', String(await this.redisServerTime())]);
  }

  /**
   * Runs optional post-commit index maintenance without letting it masquerade
   * as a failed mutation. Any failure is reported once via a fixed-text
   * warning and swallowed so the already-committed session result stands; the
   * next successful create/rotate retries the incremental scan from the
   * retained cursor. Never retries the committed mutation itself.
   */
  private async runPostCommitIndexMaintenance(operation: 'createSession' | 'rotateSession'): Promise<void> {
    try {
      await this.cleanupStaleIndexKeys();
    } catch {
      // Adapter errors may contain credentials or hostile accessors/proxies.
      // Never inspect or format the thrown value, even to classify the cause.
      console.warn(`OIDC vault Redis index maintenance failed after ${operation} and will retry on a later write.`);
    }
  }

  private async cleanupStaleIndexKeys(): Promise<void> {
    const response = await this.sendCommand([
      'SCAN',
      this.indexCleanupCursor,
      'MATCH',
      this.keys.scanPattern(),
      'COUNT',
      String(INDEX_CLEANUP_SCAN_COUNT),
    ]);

    if (!Array.isArray(response) || typeof response[0] !== 'string' || !Array.isArray(response[1])) {
      throw new Error('OIDC vault Redis store received an unexpected SCAN response.');
    }

    this.indexCleanupCursor = response[0];

    const indexKeyPrefixes = [
      this.keys.subjectIndexPrefix(),
      this.keys.providerSessionIndexPrefix(),
      this.keys.logicalSessionIndexPrefix(),
      this.keys.rotatedSessionAliasIndexPrefix(),
    ];
    const indexKeys = response[1].filter(
      (key): key is string => typeof key === 'string' && indexKeyPrefixes.some((prefix) => key.startsWith(prefix)),
    );

    for (const indexKey of indexKeys) {
      if ((await this.redisKeyType(indexKey)) === 'zset') {
        await this.cleanupExpiredIndexMembers(indexKey);
      }
    }
  }

  private async redisKeyType(key: string): Promise<string> {
    const response = await this.sendCommand(['TYPE', key]);

    if (typeof response === 'string') {
      return response;
    }

    if (isPlainRecord(response) && typeof response.ok === 'string') {
      return response.ok;
    }

    throw new Error('OIDC vault Redis store received an unexpected TYPE response.');
  }

  private async redisServerTime(): Promise<number> {
    const response = await this.sendCommand(['TIME']);

    if (!Array.isArray(response) || response.length < 2) {
      throw new Error('OIDC vault Redis store received an unexpected TIME response.');
    }

    const seconds = Number(response[0]);
    const microseconds = Number(response[1]);

    if (!Number.isFinite(seconds) || !Number.isFinite(microseconds)) {
      throw new Error('OIDC vault Redis store received an unexpected TIME response.');
    }

    return seconds * 1000 + Math.floor(microseconds / 1000);
  }

  private async scanSessionIdsFromIndex(
    indexKey: string,
    cursor: string,
  ): Promise<{ cursor: string; sessionIds: string[] }> {
    const response = await this.sendCommand(['ZSCAN', indexKey, cursor, 'COUNT', String(INDEX_REVOCATION_SCAN_COUNT)]);

    if (!Array.isArray(response) || typeof response[0] !== 'string' || !Array.isArray(response[1])) {
      throw new Error('OIDC vault Redis store received an unexpected ZSCAN response.');
    }

    const rawEntries = response[1];
    const sessionIds: string[] = [];

    for (let index = 0; index < rawEntries.length; index += 2) {
      const sessionId = rawEntries[index];

      if (typeof sessionId === 'string') {
        sessionIds.push(sessionId);
      }
    }

    return { cursor: response[0], sessionIds };
  }

  private async getSessionRecords(
    sessionIds: string[],
  ): Promise<Array<{ session: OidcVaultSession | null; raw: string | null }>> {
    if (sessionIds.length === 0) {
      return [];
    }

    const response = await this.sendCommand(['MGET', ...sessionIds.map((sessionId) => this.keys.session(sessionId))]);

    if (!Array.isArray(response)) {
      throw new Error('OIDC vault Redis store received an unexpected MGET response.');
    }

    return Promise.all(
      sessionIds.map(async (sessionId, index) => {
        const value: unknown = response[index];
        const raw = typeof value === 'string' ? value : null;

        try {
          return { session: parseStoredJson(raw, 'session', (parsed) => validateSession(parsed, sessionId)), raw };
        } catch (error) {
          if (error instanceof OidcVaultRedisStoreRecordError && typeof value === 'string') {
            // SVH-03: batched repair removes only the observed malformed
            // payload; a fresh same-ID record created after the MGET survives.
            // The caller also guards membership repair against a replacement.
            await this.deleteMalformedValueIfUnchanged(this.keys.session(sessionId), value);
            return { session: null, raw };
          }

          throw error;
        }
      }),
    );
  }

  private async removeSessionIdFromIndex(
    indexKey: string,
    sessionId: string,
    observedRaw: string | null,
  ): Promise<void> {
    await this.runScript(
      buildRepairSessionIndexCommand(this.keys.session(sessionId), indexKey, sessionId, observedRaw),
    );
  }

  private async deleteSessionsFromIndex(
    indexKey: string,
    scope:
      | DeleteSessionsBySubjectInput
      | DeleteSessionsByProviderSessionIdInput
      | DeleteSessionsByLogicalSessionIdInput,
  ): Promise<number> {
    await this.cleanupExpiredIndexMembers(indexKey);
    let deleted = 0;
    let cursor = '0';

    do {
      const batch = await this.scanSessionIdsFromIndex(indexKey, cursor);
      cursor = batch.cursor;

      if (batch.sessionIds.length === 0) {
        continue;
      }

      const sessions = await this.getSessionRecords(batch.sessionIds);

      for (const [index, sessionId] of batch.sessionIds.entries()) {
        const { session, raw } = sessions[index] ?? { session: null, raw: null };

        if (!session) {
          await this.removeSessionIdFromIndex(indexKey, sessionId, raw);
          continue;
        }

        if ('logicalSessionId' in scope && (session.logicalSessionId ?? session.sessionId) !== scope.logicalSessionId) {
          await this.removeSessionIdFromIndex(indexKey, sessionId, raw);
          continue;
        }

        if ('subject' in scope && session.subject !== scope.subject) {
          await this.removeSessionIdFromIndex(indexKey, sessionId, raw);
          continue;
        }

        if ('providerSessionId' in scope && session.providerSessionId !== scope.providerSessionId) {
          await this.removeSessionIdFromIndex(indexKey, sessionId, raw);
          continue;
        }

        if (!('logicalSessionId' in scope) && !matchesProviderScope(session, scope)) {
          continue;
        }

        const revoked = await this.deleteSessionRecord(session, this.toDeleteScriptScope(scope));

        if (revoked > 0) {
          deleted += revoked;
        }
      }
    } while (cursor !== '0');

    // Successful delete scripts already own cleanup. The empty logical path
    // still needs to retire aliases when the last primary expired before logout.
    if (deleted === 0 && 'logicalSessionId' in scope) {
      await this.runScript(buildCleanupInactiveAliasesCommand(this.keys, scope.logicalSessionId));
    }

    return deleted;
  }

  private toDeleteScriptScope(
    scope:
      | DeleteSessionsBySubjectInput
      | DeleteSessionsByProviderSessionIdInput
      | DeleteSessionsByLogicalSessionIdInput,
  ): Exclude<DeleteSessionScriptScope, { kind: 'single' }> {
    if ('logicalSessionId' in scope) {
      return { kind: 'logical', value: scope.logicalSessionId };
    }

    if ('subject' in scope) {
      return { kind: 'subject', value: scope.subject, issuer: scope.issuer, clientId: scope.clientId };
    }

    return {
      kind: 'provider-session',
      value: scope.providerSessionId,
      issuer: scope.issuer,
      clientId: scope.clientId,
    };
  }

  private async sendCommand(args: string[]): Promise<unknown> {
    return this.client.sendCommand(args);
  }
}

/**
 * Create an `OidcVaultDeviceBindingStoreProvider` backed by a connected Redis client.
 *
 * Pass an already-connected official `redis` standalone client (or any adapter
 * implementing {@link OidcVaultRedisClient}). For Redis Sentinel deployments,
 * acquire or wrap the underlying master client as described on
 * {@link OidcVaultRedisClient}; the bare `createSentinel(...)` client does not
 * satisfy the structural contract. The store does not connect, disconnect, or
 * attach `error` listeners; it only issues commands.
 *
 * The package supports Redis 6.2 or later. Redis Cluster is
 * not supported and is rejected here. Guarded consumes and per-proof replay use
 * cached atomic Lua; replay is shared per keyPrefix, uses server TIME, and never
 * evicts live entries. All clients must use the same dpopReplayMaxEntries.
 *
 * @param options construction options; see {@link RedisOidcVaultStoreOptions}.
 * @returns a provider satisfying the stronger `OidcVaultDeviceBindingStoreProvider` contract.
 */
export function createRedisOidcVaultStore(options: RedisOidcVaultStoreOptions): OidcVaultDeviceBindingStoreProvider {
  return new RedisOidcVaultStore(options);
}

export { OidcVaultRedisStoreRecordError } from './records.js';
