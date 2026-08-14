export const DEFAULT_KEY_PREFIX = 'oidc-vault';

const prefixKey = (keyPrefix: string, kind: string, id: string): string => `${keyPrefix}:${kind}:${id}`;

export class RedisOidcVaultStoreKeys {
  constructor(private readonly keyPrefix: string) {}

  authorizationTransaction(state: string): string {
    return prefixKey(this.keyPrefix, 'txn', state);
  }

  exchangeCode(code: string): string {
    return prefixKey(this.keyPrefix, 'exchange', code);
  }

  session(sessionId: string): string {
    return prefixKey(this.keyPrefix, 'session', sessionId);
  }

  sessionPrefix(): string {
    return `${this.keyPrefix}:session:`;
  }

  subjectIndex(subject: string): string {
    return prefixKey(this.keyPrefix, 'subject', subject);
  }

  subjectIndexPrefix(): string {
    return `${this.keyPrefix}:subject:`;
  }

  providerSessionIndex(providerSessionId: string): string {
    return prefixKey(this.keyPrefix, 'provider-session', providerSessionId);
  }

  providerSessionIndexPrefix(): string {
    return `${this.keyPrefix}:provider-session:`;
  }

  logicalSessionIndex(logicalSessionId: string): string {
    return prefixKey(this.keyPrefix, 'logical-session', logicalSessionId);
  }

  logicalSessionIndexPrefix(): string {
    return `${this.keyPrefix}:logical-session:`;
  }

  backchannelLogoutTokenJti(jti: string): string {
    return prefixKey(this.keyPrefix, 'backchannel-logout-jti', jti);
  }

  rotatedSessionAliasIndex(logicalSessionId: string): string {
    return prefixKey(this.keyPrefix, 'rotated-session-alias-index', logicalSessionId);
  }

  rotatedSessionAliasIndexPrefix(): string {
    return `${this.keyPrefix}:rotated-session-alias-index:`;
  }

  rotatedSessionAlias(sessionId: string): string {
    return prefixKey(this.keyPrefix, 'rotated-session-alias', sessionId);
  }

  rotatedSessionAliasPrefix(): string {
    return `${this.keyPrefix}:rotated-session-alias:`;
  }

  scanPattern(): string {
    return `${this.keyPrefix}:*`;
  }
}
