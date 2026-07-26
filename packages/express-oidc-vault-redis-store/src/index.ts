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
}

const DEFAULT_KEY_PREFIX = 'oidc-vault';

const serialize = (value: unknown): string => JSON.stringify(value);

const parseJson = <T>(value: string | null): T | null => (value ? (JSON.parse(value) as T) : null);

const prefixKey = (keyPrefix: string, kind: string, id: string): string => `${keyPrefix}:${kind}:${id}`;

class RedisOidcVaultStore implements OidcVaultStoreProvider {
  private readonly client: OidcVaultRedisClient;
  private readonly keyPrefix: string;

  constructor(options: RedisOidcVaultStoreOptions) {
    this.client = options.client;
    this.keyPrefix = options.keyPrefix ?? DEFAULT_KEY_PREFIX;
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
    const timestamp = Date.now();
    const session: OidcVaultSession = {
      ...input,
      createdAt: input.createdAt ?? timestamp,
      updatedAt: input.updatedAt ?? timestamp,
    };

    await this.setJson(this.sessionKey(session.sessionId), session, session.expiresAt);
    return session;
  }

  async getSession(sessionId: string): Promise<OidcVaultSession | null> {
    return this.getJson(this.sessionKey(sessionId));
  }

  async rotateSession(input: RotateSessionInput): Promise<OidcVaultSession> {
    await this.setJson(this.sessionKey(input.nextSession.sessionId), input.nextSession, input.nextSession.expiresAt);
    await this.client.del(this.sessionKey(input.sessionId));
    return input.nextSession;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.client.del(this.sessionKey(sessionId));
  }

  private async setJson(key: string, value: unknown, expiresAt?: number): Promise<void> {
    const options = typeof expiresAt === 'number' ? { PXAT: expiresAt } : undefined;
    await this.client.set(key, serialize(value), options);
  }

  private async getJson<T>(key: string): Promise<T | null> {
    return parseJson<T>(await this.client.get(key));
  }

  private async consumeJson<T>(key: string): Promise<T | null> {
    if (this.client.sendCommand) {
      const value = await this.client.sendCommand(['GETDEL', key]);
      return typeof value === 'string' ? parseJson<T>(value) : null;
    }

    const value = await this.client.get(key);

    if (value === null) {
      return null;
    }

    await this.client.del(key);
    return parseJson<T>(value);
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
}

export function createRedisOidcVaultStore(options: RedisOidcVaultStoreOptions): OidcVaultStoreProvider {
  return new RedisOidcVaultStore(options);
}
