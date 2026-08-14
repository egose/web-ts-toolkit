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

import { DEFAULT_KEY_PREFIX, RedisOidcVaultStoreKeys } from './keys.js';
import {
  OidcVaultRedisStoreRecordError,
  type StoredRecordKind,
  isPlainRecord,
  isString,
  parseStoredJson,
  serialize,
  validateAuthorizationTransaction,
  validateExchangeCodeRecord,
  validateSession,
} from './records.js';
import {
  type DeleteSessionScriptScope,
  type RedisScriptRunnerClient,
  RedisScriptRunner,
  buildDeleteSessionCommand,
  buildRotateSessionCommand,
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
 * `EVAL`/`GETDEL`/`TYPE`/`TIME`/`ZRANGE`/`ZSCAN`/`MGET` commands through it.
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

const isRecord = (value: unknown): value is Record<PropertyKey, unknown> => typeof value === 'object' && value !== null;

const isUnsupportedClusterClient = (client: OidcVaultRedisClient): boolean =>
  isRecord(client) &&
  typeof client.getSlotMaster === 'function' &&
  typeof client.nodeClient === 'function' &&
  Array.isArray(client.masters) &&
  Array.isArray(client.slots);

const toSubjectDeleteInput = (input: string | DeleteSessionsBySubjectInput): DeleteSessionsBySubjectInput =>
  typeof input === 'string' ? { subject: input } : input;

const toProviderSessionDeleteInput = (
  input: string | DeleteSessionsByProviderSessionIdInput,
): DeleteSessionsByProviderSessionIdInput => (typeof input === 'string' ? { providerSessionId: input } : input);

const toLogicalSessionDeleteInput = (
  input: string | DeleteSessionsByLogicalSessionIdInput,
): DeleteSessionsByLogicalSessionIdInput => (typeof input === 'string' ? { logicalSessionId: input } : input);

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

class RedisOidcVaultStore implements OidcVaultStoreProvider {
  private readonly client: OidcVaultRedisClient;
  private readonly keys: RedisOidcVaultStoreKeys;
  private readonly now: () => number;
  private readonly scriptRunner: RedisScriptRunner;
  private indexCleanupCursor = '0';

  constructor(options: RedisOidcVaultStoreOptions) {
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
    await this.setJson(this.keys.authorizationTransaction(input.state), input, input.expiresAt);
  }

  async consumeAuthorizationTransaction(state: string): Promise<AuthorizationTransaction | null> {
    return this.consumeJson(
      this.keys.authorizationTransaction(state),
      'authorization transaction',
      validateAuthorizationTransaction,
    );
  }

  async createExchangeCode(input: ExchangeCodeRecordInput): Promise<void> {
    await this.setJson(this.keys.exchangeCode(input.code), input, input.expiresAt);
  }

  async consumeExchangeCode(code: string): Promise<ExchangeCodeRecord | null> {
    return this.consumeJson(this.keys.exchangeCode(code), 'exchange code', validateExchangeCodeRecord);
  }

  async createSession(input: OidcVaultSessionInput): Promise<OidcVaultSession> {
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

    await this.cleanupStaleIndexKeys();

    return session;
  }

  async getSession(sessionId: string): Promise<OidcVaultSession | null> {
    return this.getJson(this.keys.session(sessionId), 'session', validateSession, { deleteMalformed: true });
  }

  async rotateSession(input: RotateSessionInput): Promise<OidcVaultSession> {
    const previousSession = await this.getSession(input.sessionId);

    if (!previousSession) {
      throw new OidcVaultStoreConflictError('OIDC vault session no longer exists for rotation.');
    }

    if (input.nextSession.sessionId === input.sessionId) {
      throw new OidcVaultStoreConflictError('OIDC vault session rotation target must use a different session ID.');
    }

    const nextSession: OidcVaultSession = {
      ...input.nextSession,
      logicalSessionId:
        input.nextSession.logicalSessionId ?? previousSession.logicalSessionId ?? previousSession.sessionId,
    };
    const rotated = await this.rotateSessionRecord(previousSession, nextSession);

    if (!rotated) {
      throw new OidcVaultStoreConflictError('OIDC vault session no longer exists for rotation.');
    }

    await this.cleanupStaleIndexKeys();

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
        await this.deleteRotatedSessionAliasesByLogicalSessionId(logicalSessionId);
      }

      await this.client.del(this.keys.session(sessionId));
      return;
    }

    await this.deleteSessionRecord(session, { kind: 'single' });
    await this.deleteRotatedSessionAliasesByLogicalSessionId(session.logicalSessionId ?? session.sessionId);
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
    options?: { deleteMalformed?: boolean },
  ): Promise<T | null> {
    try {
      return parseStoredJson(await this.client.get(key), recordKind, validate);
    } catch (error) {
      if (options?.deleteMalformed && error instanceof OidcVaultRedisStoreRecordError) {
        await this.client.del(key);
        return null;
      }

      throw error;
    }
  }

  private async consumeJson<T>(
    key: string,
    recordKind: StoredRecordKind,
    validate: (parsed: unknown) => parsed is T,
  ): Promise<T | null> {
    const value = await this.sendCommand(['GETDEL', key]);

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

  private async rotateSessionRecord(
    previousSession: OidcVaultSession,
    nextSession: OidcVaultSession,
  ): Promise<boolean> {
    const result = await this.runScript(buildRotateSessionCommand(this.keys, previousSession, nextSession));

    if (result === 2 || result === '2') {
      throw new OidcVaultStoreConflictError('OIDC vault session rotation target already exists.');
    }

    return result === 1 || result === '1';
  }

  private async runScript(command: string[]): Promise<unknown> {
    return this.scriptRunner.run(command);
  }

  private async cleanupExpiredIndexMembers(indexKey: string): Promise<void> {
    await this.sendCommand(['ZREMRANGEBYSCORE', indexKey, '-inf', String(await this.redisServerTime())]);
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

  private async getSessionIdsFromIndex(indexKey: string): Promise<string[]> {
    const response = await this.sendCommand(['ZRANGE', indexKey, '0', '-1']);
    return Array.isArray(response) ? response.filter((value): value is string => typeof value === 'string') : [];
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

  private async getSessionRecords(sessionIds: string[]): Promise<Array<OidcVaultSession | null>> {
    if (sessionIds.length === 0) {
      return [];
    }

    const response = await this.sendCommand(['MGET', ...sessionIds.map((sessionId) => this.keys.session(sessionId))]);

    if (!Array.isArray(response)) {
      throw new Error('OIDC vault Redis store received an unexpected MGET response.');
    }

    return Promise.all(
      response.map(async (value, index) => {
        try {
          return typeof value === 'string' ? parseStoredJson(value, 'session', validateSession) : null;
        } catch (error) {
          if (error instanceof OidcVaultRedisStoreRecordError) {
            await this.client.del(this.keys.session(sessionIds[index]!));
            return null;
          }

          throw error;
        }
      }),
    );
  }

  private async removeSessionIdFromIndex(indexKey: string, sessionId: string): Promise<void> {
    await this.sendCommand(['ZREM', indexKey, sessionId]);
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
        const session = sessions[index];

        if (!session) {
          await this.removeSessionIdFromIndex(indexKey, sessionId);
          continue;
        }

        if ('logicalSessionId' in scope && (session.logicalSessionId ?? session.sessionId) !== scope.logicalSessionId) {
          await this.removeSessionIdFromIndex(indexKey, sessionId);
          continue;
        }

        if ('subject' in scope && session.subject !== scope.subject) {
          await this.removeSessionIdFromIndex(indexKey, sessionId);
          continue;
        }

        if ('providerSessionId' in scope && session.providerSessionId !== scope.providerSessionId) {
          await this.removeSessionIdFromIndex(indexKey, sessionId);
          continue;
        }

        if (!('logicalSessionId' in scope) && !matchesProviderScope(session, scope)) {
          continue;
        }

        const revoked = await this.deleteSessionRecord(session, this.toDeleteScriptScope(scope));

        if (revoked > 0) {
          await this.deleteRotatedSessionAliasesByLogicalSessionId(session.logicalSessionId ?? session.sessionId);
          deleted += revoked;
        }
      }
    } while (cursor !== '0');

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

  private async deleteRotatedSessionAliasesByLogicalSessionId(logicalSessionId: string): Promise<void> {
    const aliasIndexKey = this.keys.rotatedSessionAliasIndex(logicalSessionId);
    await this.cleanupExpiredIndexMembers(aliasIndexKey);
    const aliasSessionIds = await this.getSessionIdsFromIndex(aliasIndexKey);

    if (aliasSessionIds.length === 0) {
      return;
    }

    await this.client.del(aliasSessionIds.map((sessionId) => this.keys.rotatedSessionAlias(sessionId)));
    await this.client.del(aliasIndexKey);
  }

  private async sendCommand(args: string[]): Promise<unknown> {
    return this.client.sendCommand(args);
  }
}

/**
 * Create an `OidcVaultStoreProvider` backed by a connected Redis client.
 *
 * Pass an already-connected official `redis` standalone client (or any adapter
 * implementing {@link OidcVaultRedisClient}). For Redis Sentinel deployments,
 * acquire or wrap the underlying master client as described on
 * {@link OidcVaultRedisClient}; the bare `createSentinel(...)` client does not
 * satisfy the structural contract. The store does not connect, disconnect, or
 * attach `error` listeners; it only issues commands.
 *
 * The package requires Redis 6.2 or later (it uses `GETDEL`). Redis Cluster is
 * not supported and is rejected here.
 *
 * @param options construction options; see {@link RedisOidcVaultStoreOptions}.
 * @returns a provider satisfying the core `OidcVaultStoreProvider` contract.
 */
export function createRedisOidcVaultStore(options: RedisOidcVaultStoreOptions): OidcVaultStoreProvider {
  return new RedisOidcVaultStore(options);
}

export { OidcVaultRedisStoreRecordError } from './records.js';
