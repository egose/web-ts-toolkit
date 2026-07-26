import { describe, expect, it } from 'vitest';

import { createRedisOidcVaultStore, type OidcVaultRedisClient } from '../src/index';

class FakeRedisClient implements OidcVaultRedisClient {
  private readonly records = new Map<string, { value: string; expiresAt?: number }>();
  private readonly sortedIndexes = new Map<string, Map<string, number>>();
  now = 0;

  async set(key: string, value: string, options?: { PXAT?: number }): Promise<void> {
    this.records.set(key, {
      value,
      expiresAt: options?.PXAT,
    });
  }

  async get(key: string): Promise<string | null> {
    this.pruneExpired(key);
    return this.records.get(key)?.value ?? null;
  }

  async del(keys: string | string[]): Promise<number> {
    const keyList = Array.isArray(keys) ? keys : [keys];
    let deleted = 0;

    for (const key of keyList) {
      if (this.records.delete(key)) {
        deleted += 1;
      }
    }

    return deleted;
  }

  async sendCommand(args: string[]): Promise<unknown> {
    const [command, ...rest] = args;

    switch (command) {
      case 'GETDEL':
        return this.handleGetDel(rest);
      case 'ZREMRANGEBYSCORE':
        return this.handleZRemRangeByScore(rest);
      case 'ZRANGE':
        return this.handleZRange(rest);
      case 'ZREM':
        return this.handleZRem(rest);
      case 'EVAL':
        return this.handleEval(rest);
      default:
        throw new Error(`Unsupported command: ${args.join(' ')}`);
    }
  }

  private async handleGetDel(args: string[]): Promise<string | null> {
    const [key] = args;

    if (!key) {
      throw new Error('GETDEL requires a key.');
    }

    this.pruneExpired(key);
    const value = this.records.get(key)?.value ?? null;

    if (value !== null) {
      this.records.delete(key);
    }

    return value;
  }

  private async handleZRemRangeByScore(args: string[]): Promise<number> {
    const [key, minRaw, maxRaw] = args;

    if (!key || !minRaw || !maxRaw) {
      throw new Error('ZREMRANGEBYSCORE requires key, min, and max.');
    }

    const index = this.sortedIndexes.get(key);

    if (!index) {
      return 0;
    }

    const min = minRaw === '-inf' ? Number.NEGATIVE_INFINITY : Number(minRaw);
    const max = Number(maxRaw);
    let removed = 0;

    for (const [member, score] of index.entries()) {
      if (score >= min && score <= max) {
        index.delete(member);
        removed += 1;
      }
    }

    if (index.size === 0) {
      this.sortedIndexes.delete(key);
    }

    return removed;
  }

  private async handleZRange(args: string[]): Promise<string[]> {
    const [key] = args;

    if (!key) {
      throw new Error('ZRANGE requires a key.');
    }

    return this.getSortedIndexMembers(key);
  }

  private async handleZRem(args: string[]): Promise<number> {
    const [key, member] = args;

    if (!key || !member) {
      throw new Error('ZREM requires a key and member.');
    }

    return this.removeSortedIndexMember(key, member) ? 1 : 0;
  }

  private async handleEval(args: string[]): Promise<number> {
    const [script, keyCountRaw, ...rest] = args;

    if (!script || !keyCountRaw) {
      throw new Error('EVAL requires a script and key count.');
    }

    const keyCount = Number(keyCountRaw);
    const keys = rest.slice(0, keyCount);
    const scriptArgs = rest.slice(keyCount);

    if (script.includes('local oldSessionId = ARGV[3]')) {
      return this.evalRotateSession(keys, scriptArgs);
    }

    if (script.includes('local sessionId = ARGV[1]')) {
      return this.evalDeleteSession(keys, scriptArgs);
    }

    if (script.includes('local value = ARGV[1]')) {
      return this.evalWriteSession(keys, scriptArgs);
    }

    throw new Error('Unsupported EVAL script.');
  }

  private evalWriteSession(keys: string[], args: string[]): number {
    const [sessionKey, subjectIndexKey] = keys;
    const [value, expiresAtRaw, sessionId, scoreRaw, providerIndexKey] = args;

    if (!sessionKey || !subjectIndexKey || !value || !sessionId || !scoreRaw) {
      throw new Error('Invalid session write script arguments.');
    }

    this.records.set(sessionKey, {
      value,
      expiresAt: expiresAtRaw ? Number(expiresAtRaw) : undefined,
    });

    this.addSortedIndexMember(subjectIndexKey, sessionId, Number(scoreRaw));

    if (providerIndexKey) {
      this.addSortedIndexMember(providerIndexKey, sessionId, Number(scoreRaw));
    }

    return 1;
  }

  private evalDeleteSession(keys: string[], args: string[]): number {
    const [sessionKey, subjectIndexKey] = keys;
    const [sessionId, providerIndexKey] = args;

    if (!sessionKey || !subjectIndexKey || !sessionId) {
      throw new Error('Invalid session delete script arguments.');
    }

    this.records.delete(sessionKey);
    this.removeSortedIndexMember(subjectIndexKey, sessionId);

    if (providerIndexKey) {
      this.removeSortedIndexMember(providerIndexKey, sessionId);
    }

    return 1;
  }

  private evalRotateSession(keys: string[], args: string[]): number {
    const [oldSessionKey, newSessionKey, oldSubjectIndexKey, newSubjectIndexKey] = keys;
    const [
      newValue,
      newExpiresAtRaw,
      oldSessionId,
      newSessionId,
      newScoreRaw,
      oldProviderIndexKey,
      newProviderIndexKey,
    ] = args;

    if (
      !oldSessionKey ||
      !newSessionKey ||
      !oldSubjectIndexKey ||
      !newSubjectIndexKey ||
      !newValue ||
      !oldSessionId ||
      !newSessionId ||
      !newScoreRaw
    ) {
      throw new Error('Invalid session rotate script arguments.');
    }

    this.pruneExpired(oldSessionKey);

    if (!this.records.has(oldSessionKey)) {
      return 0;
    }

    this.records.set(newSessionKey, {
      value: newValue,
      expiresAt: newExpiresAtRaw ? Number(newExpiresAtRaw) : undefined,
    });
    this.records.delete(oldSessionKey);
    this.removeSortedIndexMember(oldSubjectIndexKey, oldSessionId);
    this.addSortedIndexMember(newSubjectIndexKey, newSessionId, Number(newScoreRaw));

    if (oldProviderIndexKey) {
      this.removeSortedIndexMember(oldProviderIndexKey, oldSessionId);
    }

    if (newProviderIndexKey) {
      this.addSortedIndexMember(newProviderIndexKey, newSessionId, Number(newScoreRaw));
    }

    return 1;
  }

  private addSortedIndexMember(key: string, member: string, score: number): void {
    const index = this.sortedIndexes.get(key) ?? new Map<string, number>();
    index.set(member, score);
    this.sortedIndexes.set(key, index);
  }

  private removeSortedIndexMember(key: string, member: string): boolean {
    const index = this.sortedIndexes.get(key);

    if (!index) {
      return false;
    }

    const removed = index.delete(member);

    if (index.size === 0) {
      this.sortedIndexes.delete(key);
    }

    return removed;
  }

  private getSortedIndexMembers(key: string): string[] {
    const index = this.sortedIndexes.get(key);

    if (!index) {
      return [];
    }

    return [...index.entries()].sort((left, right) => left[1] - right[1]).map(([member]) => member);
  }

  private pruneExpired(key: string): void {
    const record = this.records.get(key);

    if (record && typeof record.expiresAt === 'number' && record.expiresAt <= this.now) {
      this.records.delete(key);
    }
  }
}

describe('createRedisOidcVaultStore', () => {
  it('creates, reads, rotates, and deletes sessions', async () => {
    const client = new FakeRedisClient();
    const store = createRedisOidcVaultStore({ client, keyPrefix: 'test', now: () => client.now });

    const created = await store.createSession({
      sessionId: 'sess_1',
      subject: 'user_1',
      providerSessionId: 'provider_sid_1',
      refreshToken: 'refresh_1',
      idToken: 'id_1',
      scope: 'openid email profile',
    });

    expect(created).toMatchObject({ sessionId: 'sess_1', subject: 'user_1' });
    expect(await store.getSession('sess_1')).toMatchObject({ sessionId: 'sess_1' });

    const rotated = await store.rotateSession({
      sessionId: 'sess_1',
      nextSession: {
        ...created,
        sessionId: 'sess_2',
        providerSessionId: 'provider_sid_1',
        refreshToken: 'refresh_2',
        idToken: 'id_2',
        updatedAt: created.updatedAt + 1,
      },
    });

    expect(rotated).toMatchObject({ sessionId: 'sess_2', refreshToken: 'refresh_2' });
    expect(await store.getSession('sess_1')).toBeNull();
    expect(await store.getSession('sess_2')).toMatchObject({ sessionId: 'sess_2' });

    await store.deleteSession('sess_2');
    expect(await store.getSession('sess_2')).toBeNull();

    await store.createSession({
      sessionId: 'sess_3',
      subject: 'user_1',
      providerSessionId: 'provider_sid_1',
      refreshToken: 'refresh_3',
      idToken: 'id_3',
    });
    await store.createSession({
      sessionId: 'sess_4',
      subject: 'user_1',
      refreshToken: 'refresh_4',
      idToken: 'id_4',
    });

    expect(
      await store.deleteSessionsByProviderSessionId({
        providerSessionId: 'provider_sid_1',
        issuer: 'https://issuer-a.example.com',
      }),
    ).toBe(0);
    expect(await store.deleteSessionsByProviderSessionId('provider_sid_1')).toBe(1);
    expect(await store.getSession('sess_3')).toBeNull();
    expect(await store.getSession('sess_4')).not.toBeNull();
    expect(
      await store.deleteSessionsBySubject({
        subject: 'user_1',
        clientId: 'client-1',
      }),
    ).toBe(0);
    expect(await store.deleteSessionsBySubject('user_1')).toBe(1);
    expect(await store.getSession('sess_4')).toBeNull();
  });

  it('consumes transaction records once and respects expiration', async () => {
    const client = new FakeRedisClient();
    const store = createRedisOidcVaultStore({ client, keyPrefix: 'test', now: () => client.now });

    await store.createAuthorizationTransaction({
      state: 'state_1',
      nonce: 'nonce_1',
      pkceVerifier: 'verifier_1',
      codeChallenge: 'challenge_1',
      createdAt: 100,
      expiresAt: 200,
    });

    await store.createExchangeCode({
      code: 'code_1',
      sessionId: 'sess_1',
      createdAt: 100,
      expiresAt: 200,
    });

    expect(await store.consumeAuthorizationTransaction('state_1')).toMatchObject({ state: 'state_1' });
    expect(await store.consumeAuthorizationTransaction('state_1')).toBeNull();

    client.now = 250;

    expect(await store.consumeExchangeCode('code_1')).toBeNull();
  });

  it('rejects rotating a session that was already rotated', async () => {
    const client = new FakeRedisClient();
    const store = createRedisOidcVaultStore({ client, keyPrefix: 'test', now: () => client.now });

    await store.createSession({
      sessionId: 'sess_1',
      subject: 'user_1',
      refreshToken: 'refresh_1',
      idToken: 'id_1',
    });

    await store.rotateSession({
      sessionId: 'sess_1',
      nextSession: {
        sessionId: 'sess_2',
        subject: 'user_1',
        refreshToken: 'refresh_2',
        idToken: 'id_2',
        createdAt: 0,
        updatedAt: 1,
      },
    });

    await expect(
      store.rotateSession({
        sessionId: 'sess_1',
        nextSession: {
          sessionId: 'sess_3',
          subject: 'user_1',
          refreshToken: 'refresh_3',
          idToken: 'id_3',
          createdAt: 0,
          updatedAt: 2,
        },
      }),
    ).rejects.toThrow('rotation');
  });
});
