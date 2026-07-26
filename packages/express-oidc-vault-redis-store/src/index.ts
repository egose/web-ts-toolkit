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

export interface OidcVaultRedisClient {
  set(key: string, value: string, options?: { PXAT?: number }): Promise<unknown>;
  get(key: string): Promise<string | null>;
  del(keys: string | string[]): Promise<number>;
  sendCommand?(args: string[]): Promise<unknown>;
}

export interface RedisOidcVaultStoreOptions {
  client: OidcVaultRedisClient;
  keyPrefix?: string;
  now?: () => number;
}

const DEFAULT_KEY_PREFIX = 'oidc-vault';
const NON_EXPIRING_INDEX_SCORE = Number.MAX_SAFE_INTEGER;

const WRITE_SESSION_SCRIPT = `
local value = ARGV[1]
local expiresAt = ARGV[2]
local sessionId = ARGV[3]
local score = tonumber(ARGV[4])
local providerIndexKey = ARGV[5]

if expiresAt ~= '' then
  redis.call('SET', KEYS[1], value, 'PXAT', expiresAt)
else
  redis.call('SET', KEYS[1], value)
end

redis.call('ZADD', KEYS[2], score, sessionId)

if providerIndexKey ~= '' then
  redis.call('ZADD', providerIndexKey, score, sessionId)
end

return 1
`;

const DELETE_SESSION_SCRIPT = `
local sessionId = ARGV[1]
local providerIndexKey = ARGV[2]

redis.call('DEL', KEYS[1])
redis.call('ZREM', KEYS[2], sessionId)

if providerIndexKey ~= '' then
  redis.call('ZREM', providerIndexKey, sessionId)
end

return 1
`;

const ROTATE_SESSION_SCRIPT = `
local newValue = ARGV[1]
local newExpiresAt = ARGV[2]
local oldSessionId = ARGV[3]
local newSessionId = ARGV[4]
local newScore = tonumber(ARGV[5])
local oldProviderIndexKey = ARGV[6]
local newProviderIndexKey = ARGV[7]

if redis.call('EXISTS', KEYS[1]) == 0 then
  return 0
end

if newExpiresAt ~= '' then
  redis.call('SET', KEYS[2], newValue, 'PXAT', newExpiresAt)
else
  redis.call('SET', KEYS[2], newValue)
end

redis.call('DEL', KEYS[1])
redis.call('ZREM', KEYS[3], oldSessionId)
redis.call('ZADD', KEYS[4], newScore, newSessionId)

if oldProviderIndexKey ~= '' then
  redis.call('ZREM', oldProviderIndexKey, oldSessionId)
end

if newProviderIndexKey ~= '' then
  redis.call('ZADD', newProviderIndexKey, newScore, newSessionId)
end

return 1
`;

const serialize = (value: unknown): string => JSON.stringify(value);

const parseJson = <T>(value: string | null): T | null => (value ? (JSON.parse(value) as T) : null);

const prefixKey = (keyPrefix: string, kind: string, id: string): string => `${keyPrefix}:${kind}:${id}`;

const toSubjectDeleteInput = (input: string | DeleteSessionsBySubjectInput): DeleteSessionsBySubjectInput =>
  typeof input === 'string' ? { subject: input } : input;

const toProviderSessionDeleteInput = (
  input: string | DeleteSessionsByProviderSessionIdInput,
): DeleteSessionsByProviderSessionIdInput => (typeof input === 'string' ? { providerSessionId: input } : input);

const toIndexScore = (expiresAt?: number): number => expiresAt ?? NON_EXPIRING_INDEX_SCORE;

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
  private readonly keyPrefix: string;
  private readonly now: () => number;

  constructor(options: RedisOidcVaultStoreOptions) {
    if (!options.client.sendCommand) {
      throw new Error('Redis store client must implement sendCommand for atomic vault operations.');
    }

    this.client = options.client;
    this.keyPrefix = options.keyPrefix ?? DEFAULT_KEY_PREFIX;
    this.now = options.now ?? Date.now;
  }

  async createAuthorizationTransaction(input: AuthorizationTransactionInput): Promise<void> {
    await this.setJson(this.authorizationTransactionKey(input.state), input, input.expiresAt);
  }

  async consumeAuthorizationTransaction(state: string): Promise<AuthorizationTransaction | null> {
    return this.consumeJson(this.authorizationTransactionKey(state));
  }

  async createExchangeCode(input: ExchangeCodeRecordInput): Promise<void> {
    await this.setJson(this.exchangeCodeKey(input.code), input, input.expiresAt);
  }

  async consumeExchangeCode(code: string): Promise<ExchangeCodeRecord | null> {
    return this.consumeJson(this.exchangeCodeKey(code));
  }

  async createSession(input: OidcVaultSessionInput): Promise<OidcVaultSession> {
    const timestamp = this.now();
    const session: OidcVaultSession = {
      ...input,
      createdAt: input.createdAt ?? timestamp,
      updatedAt: input.updatedAt ?? timestamp,
    };

    await this.writeSessionRecord(session);
    return session;
  }

  async getSession(sessionId: string): Promise<OidcVaultSession | null> {
    return this.getJson(this.sessionKey(sessionId));
  }

  async rotateSession(input: RotateSessionInput): Promise<OidcVaultSession> {
    const previousSession = await this.getSession(input.sessionId);

    if (!previousSession) {
      throw new OidcVaultStoreConflictError('OIDC vault session no longer exists for rotation.');
    }

    const rotated = await this.rotateSessionRecord(previousSession, input.nextSession);

    if (!rotated) {
      throw new OidcVaultStoreConflictError('OIDC vault session no longer exists for rotation.');
    }

    return input.nextSession;
  }

  async deleteSession(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);

    if (!session) {
      await this.client.del(this.sessionKey(sessionId));
      return;
    }

    await this.deleteSessionRecord(session);
  }

  async deleteSessionsBySubject(input: string | DeleteSessionsBySubjectInput): Promise<number> {
    const resolved = toSubjectDeleteInput(input);
    return this.deleteSessionsFromIndex(this.subjectIndexKey(resolved.subject), resolved);
  }

  async deleteSessionsByProviderSessionId(input: string | DeleteSessionsByProviderSessionIdInput): Promise<number> {
    const resolved = toProviderSessionDeleteInput(input);
    return this.deleteSessionsFromIndex(this.providerSessionIndexKey(resolved.providerSessionId), resolved);
  }

  private async setJson(key: string, value: unknown, expiresAt?: number): Promise<void> {
    const options = typeof expiresAt === 'number' ? { PXAT: expiresAt } : undefined;
    await this.client.set(key, serialize(value), options);
  }

  private async getJson<T>(key: string): Promise<T | null> {
    return parseJson<T>(await this.client.get(key));
  }

  private async consumeJson<T>(key: string): Promise<T | null> {
    const value = await this.sendCommand(['GETDEL', key]);
    return typeof value === 'string' ? parseJson<T>(value) : null;
  }

  private authorizationTransactionKey(state: string): string {
    return prefixKey(this.keyPrefix, 'txn', state);
  }

  private exchangeCodeKey(code: string): string {
    return prefixKey(this.keyPrefix, 'exchange', code);
  }

  private sessionKey(sessionId: string): string {
    return prefixKey(this.keyPrefix, 'session', sessionId);
  }

  private subjectIndexKey(subject: string): string {
    return prefixKey(this.keyPrefix, 'subject', subject);
  }

  private providerSessionIndexKey(providerSessionId: string): string {
    return prefixKey(this.keyPrefix, 'provider-session', providerSessionId);
  }

  private async writeSessionRecord(session: OidcVaultSession): Promise<void> {
    await this.sendCommand([
      'EVAL',
      WRITE_SESSION_SCRIPT,
      '2',
      this.sessionKey(session.sessionId),
      this.subjectIndexKey(session.subject),
      serialize(session),
      this.serializeExpiresAt(session.expiresAt),
      session.sessionId,
      String(toIndexScore(session.expiresAt)),
      session.providerSessionId ? this.providerSessionIndexKey(session.providerSessionId) : '',
    ]);
  }

  private async deleteSessionRecord(session: OidcVaultSession): Promise<void> {
    await this.sendCommand([
      'EVAL',
      DELETE_SESSION_SCRIPT,
      '2',
      this.sessionKey(session.sessionId),
      this.subjectIndexKey(session.subject),
      session.sessionId,
      session.providerSessionId ? this.providerSessionIndexKey(session.providerSessionId) : '',
    ]);
  }

  private async rotateSessionRecord(
    previousSession: OidcVaultSession,
    nextSession: OidcVaultSession,
  ): Promise<boolean> {
    const result = await this.sendCommand([
      'EVAL',
      ROTATE_SESSION_SCRIPT,
      '4',
      this.sessionKey(previousSession.sessionId),
      this.sessionKey(nextSession.sessionId),
      this.subjectIndexKey(previousSession.subject),
      this.subjectIndexKey(nextSession.subject),
      serialize(nextSession),
      this.serializeExpiresAt(nextSession.expiresAt),
      previousSession.sessionId,
      nextSession.sessionId,
      String(toIndexScore(nextSession.expiresAt)),
      previousSession.providerSessionId ? this.providerSessionIndexKey(previousSession.providerSessionId) : '',
      nextSession.providerSessionId ? this.providerSessionIndexKey(nextSession.providerSessionId) : '',
    ]);

    return result === 1 || result === '1';
  }

  private async cleanupExpiredIndexMembers(indexKey: string): Promise<void> {
    await this.sendCommand(['ZREMRANGEBYSCORE', indexKey, '-inf', String(this.now())]);
  }

  private async getSessionIdsFromIndex(indexKey: string): Promise<string[]> {
    const response = await this.sendCommand(['ZRANGE', indexKey, '0', '-1']);
    return Array.isArray(response) ? response.filter((value): value is string => typeof value === 'string') : [];
  }

  private async removeSessionIdFromIndex(indexKey: string, sessionId: string): Promise<void> {
    await this.sendCommand(['ZREM', indexKey, sessionId]);
  }

  private async deleteSessionsFromIndex(
    indexKey: string,
    scope: DeleteSessionsBySubjectInput | DeleteSessionsByProviderSessionIdInput,
  ): Promise<number> {
    await this.cleanupExpiredIndexMembers(indexKey);
    const sessionIds = await this.getSessionIdsFromIndex(indexKey);

    if (sessionIds.length === 0) {
      return 0;
    }

    let deleted = 0;

    for (const sessionId of sessionIds) {
      const session = await this.getSession(sessionId);

      if (!session) {
        await this.removeSessionIdFromIndex(indexKey, sessionId);
        continue;
      }

      if (!matchesProviderScope(session, scope)) {
        continue;
      }

      await this.deleteSessionRecord(session);
      deleted += 1;
    }

    return deleted;
  }

  private serializeExpiresAt(expiresAt?: number): string {
    return typeof expiresAt === 'number' ? String(expiresAt) : '';
  }

  private async sendCommand(args: string[]): Promise<unknown> {
    return this.client.sendCommand!(args);
  }
}

export function createRedisOidcVaultStore(options: RedisOidcVaultStoreOptions): OidcVaultStoreProvider {
  return new RedisOidcVaultStore(options);
}
