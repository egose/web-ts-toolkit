import { createHash, randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { defineOidcVaultStoreProviderConformanceSuite } from '../../express-oidc-vault/test/store-provider-conformance';
import { createRedisOidcVaultStore, type OidcVaultRedisClient } from '../src/index';
import { DELETE_SESSION_SCRIPT, ROTATE_SESSION_SCRIPT, WRITE_SESSION_SCRIPT } from '../src/scripts.js';

class FakeRedisClient implements OidcVaultRedisClient {
  private readonly records = new Map<string, { value: string; expiresAt?: number }>();
  private readonly sortedIndexes = new Map<string, Map<string, number>>();
  private readonly scriptsByDigest = new Map<string, string>();
  private readonly zscanSnapshots = new Map<string, Array<[string, number]>>();
  private zscanSnapshotId = 0;
  readonly commands: string[] = [];
  maxZScanMembers = 0;
  now = 0;

  async set(key: string, value: string, options?: { PXAT?: number; NX?: true }): Promise<'OK' | null> {
    this.pruneExpired(key);

    if (options?.NX && this.records.has(key)) {
      return null;
    }

    this.records.set(key, {
      value,
      expiresAt: options?.PXAT,
    });

    return 'OK';
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

      if (this.sortedIndexes.delete(key)) {
        deleted += 1;
      }
    }

    return deleted;
  }

  async sendCommand(args: string[]): Promise<unknown> {
    const [command, ...rest] = args;

    if (command) {
      this.commands.push(command);
    }

    switch (command) {
      case 'GETDEL':
        return this.handleGetDel(rest);
      case 'ZREMRANGEBYSCORE':
        return this.handleZRemRangeByScore(rest);
      case 'ZRANGE':
        return this.handleZRange(rest);
      case 'ZREM':
        return this.handleZRem(rest);
      case 'ZSCAN':
        return this.handleZScan(rest);
      case 'MGET':
        return this.handleMGet(rest);
      case 'SCAN':
        return this.handleScan(rest);
      case 'TIME':
        return [String(Math.floor(this.now / 1000)), String((this.now % 1000) * 1000)];
      case 'TYPE':
        return this.handleType(rest);
      case 'EVAL':
        return this.handleEval(rest);
      case 'EVALSHA':
        return this.handleEvalSha(rest);
      case 'SCRIPT':
        return this.handleScript(rest);
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

  private async handleZScan(args: string[]): Promise<[string, string[]]> {
    const [key, cursorRaw, countKeyword, countRaw] = args;

    if (!key || cursorRaw === undefined || countKeyword !== 'COUNT' || !countRaw) {
      throw new Error('ZSCAN requires key, cursor, and COUNT count.');
    }

    const count = Number(countRaw);
    const [snapshotId, offsetRaw] =
      cursorRaw === '0' ? [String((this.zscanSnapshotId += 1)), '0'] : cursorRaw.split(':');
    const cursor = Number(offsetRaw);
    const members =
      cursorRaw === '0' ? this.getSortedIndexMembersWithScores(key) : (this.zscanSnapshots.get(snapshotId ?? '') ?? []);

    if (cursorRaw === '0') {
      this.zscanSnapshots.set(snapshotId, members);
    }

    const matched = members.slice(cursor, cursor + count);
    const nextCursor = cursor + count >= members.length ? '0' : `${snapshotId}:${cursor + count}`;
    const response = matched.flatMap(([member, score]) => [member, String(score)]);
    this.maxZScanMembers = Math.max(this.maxZScanMembers, matched.length);

    if (nextCursor === '0') {
      this.zscanSnapshots.delete(snapshotId);
    }

    return [nextCursor, response];
  }

  private async handleMGet(args: string[]): Promise<Array<string | null>> {
    return args.map((key) => {
      this.pruneExpired(key);
      return this.records.get(key)?.value ?? null;
    });
  }

  private async handleScan(args: string[]): Promise<[string, string[]]> {
    const [cursorRaw, matchKeyword, pattern, countKeyword, countRaw] = args;

    if (!cursorRaw || matchKeyword !== 'MATCH' || !pattern || countKeyword !== 'COUNT' || !countRaw) {
      throw new Error('SCAN requires cursor, MATCH pattern, and COUNT count.');
    }

    const cursor = Number(cursorRaw);
    const count = Number(countRaw);
    const prefix = pattern.endsWith('*') ? pattern.slice(0, -1) : pattern;
    const keys = [...new Set([...this.records.keys(), ...this.sortedIndexes.keys()])]
      .filter((key) => key.startsWith(prefix))
      .sort();
    const matched = keys.slice(cursor, cursor + count);
    const nextCursor = cursor + count >= keys.length ? '0' : String(cursor + count);

    return [nextCursor, matched];
  }

  private async handleType(args: string[]): Promise<string> {
    const [key] = args;

    if (!key) {
      throw new Error('TYPE requires a key.');
    }

    if (this.sortedIndexes.has(key)) {
      return 'zset';
    }

    if (this.records.has(key)) {
      return 'string';
    }

    return 'none';
  }

  private async handleEval(args: string[]): Promise<number> {
    const [script, keyCountRaw, ...rest] = args;

    if (!script || !keyCountRaw) {
      throw new Error('EVAL requires a script and key count.');
    }

    const keyCount = Number(keyCountRaw);
    const keys = rest.slice(0, keyCount);
    const scriptArgs = rest.slice(keyCount);

    if (script === ROTATE_SESSION_SCRIPT) {
      return this.evalRotateSession(keys, scriptArgs);
    }

    if (script === DELETE_SESSION_SCRIPT) {
      return this.evalDeleteSession(keys, scriptArgs);
    }

    if (script === WRITE_SESSION_SCRIPT) {
      return this.evalWriteSession(keys, scriptArgs);
    }

    throw new Error('Unsupported EVAL script.');
  }

  // The runner caches Lua bodies via `SCRIPT LOAD` and dispatches with
  // `EVALSHA`. Map the digest back to a script body so the fake behaves like a
  // real Redis script cache, including recovery after `SCRIPT FLUSH`.
  private async handleEvalSha(args: string[]): Promise<number> {
    const [digest, keyCountRaw, ...rest] = args;

    if (!digest || !keyCountRaw) {
      throw new Error('EVALSHA requires a digest and key count.');
    }

    if (digest === 'forced_noscript_for_test') {
      this.scriptsByDigest.delete('forced_noscript_for_test');
      throw new Error('NOSCRIPT No matching script. Please use EVAL.');
    }

    const script = this.scriptsByDigest.get(digest);

    if (!script) {
      throw new Error('NOSCRIPT No matching script. Please use EVAL.');
    }

    return this.handleEval([script, keyCountRaw, ...rest]);
  }

  private async handleScript(args: string[]): Promise<string> {
    const [subcommand, script] = args;

    if (subcommand !== 'LOAD' || !script) {
      throw new Error('SCRIPT requires a LOAD subcommand and a script body.');
    }

    const digest = createHash('sha1').update(script).digest('hex');
    this.scriptsByDigest.set(digest, script);

    return digest;
  }

  private evalWriteSession(keys: string[], args: string[]): number {
    const [sessionKey, subjectIndexKey, logicalIndexKey, aliasKey] = keys;
    const [value, expiresAtRaw, sessionId, scoreRaw, providerIndexKey, aliasIndexKeyPrefix] = args;

    if (!sessionKey || !subjectIndexKey || !logicalIndexKey || !aliasKey || !value || !sessionId || !scoreRaw) {
      throw new Error('Invalid session write script arguments.');
    }

    this.pruneExpired(sessionKey);

    if (this.records.has(sessionKey)) {
      return 0;
    }

    this.records.set(sessionKey, {
      value,
      expiresAt: expiresAtRaw ? Number(expiresAtRaw) : undefined,
    });

    this.addSortedIndexMember(subjectIndexKey, sessionId, Number(scoreRaw));
    this.addSortedIndexMember(logicalIndexKey, sessionId, Number(scoreRaw));

    if (providerIndexKey) {
      this.addSortedIndexMember(providerIndexKey, sessionId, Number(scoreRaw));
    }

    this.pruneExpired(aliasKey);
    const staleAliasValue = this.records.get(aliasKey)?.value;

    if (staleAliasValue) {
      this.records.delete(aliasKey);

      if (aliasIndexKeyPrefix) {
        try {
          const staleLogicalSessionId = JSON.parse(staleAliasValue) as unknown;

          if (typeof staleLogicalSessionId === 'string') {
            this.removeSortedIndexMember(`${aliasIndexKeyPrefix}${staleLogicalSessionId}`, sessionId);
          }
        } catch {
          // Corrupt aliases are deleted so they cannot influence a reused session ID.
        }
      }
    }

    return 1;
  }

  injectSortedIndexMember(key: string, member: string, score: number): void {
    this.addSortedIndexMember(key, member, score);
  }

  injectRecord(key: string, value: string, expiresAt?: number): void {
    this.records.set(key, { value, expiresAt });
  }

  countSortedIndexKeys(prefix: string): number {
    return [...this.sortedIndexes.keys()].filter((key) => key.startsWith(prefix)).length;
  }

  hasRecord(key: string): boolean {
    this.pruneExpired(key);
    return this.records.has(key);
  }

  hasSortedIndexMember(key: string, member: string): boolean {
    return this.sortedIndexes.get(key)?.has(member) ?? false;
  }

  private evalDeleteSession(keys: string[], args: string[]): number {
    const [sessionKey] = keys;
    const [
      expectedRaw,
      scopeKind,
      scopeValue,
      issuer,
      clientId,
      sessionKeyPrefix,
      subjectPrefix,
      logicalPrefix,
      providerPrefix,
      aliasIndexPrefix,
      aliasPrefix,
    ] = args;

    if (
      !sessionKey ||
      !expectedRaw ||
      !scopeKind ||
      !sessionKeyPrefix ||
      !subjectPrefix ||
      !logicalPrefix ||
      !providerPrefix
    ) {
      throw new Error('Invalid session delete script arguments.');
    }

    const expected = JSON.parse(expectedRaw) as {
      sessionId: string;
      logicalSessionId?: string;
      subject: string;
      providerSessionId?: string;
      provider?: { issuer?: string; clientId?: string };
    };
    const expectedLogicalSessionId = expected.logicalSessionId ?? expected.sessionId;
    const logicalSessionIdFor = (session: typeof expected) => session.logicalSessionId ?? session.sessionId;
    const matchesProviderScope = (session: typeof expected) => {
      if (issuer && session.provider?.issuer !== issuer) {
        return false;
      }

      if (clientId && session.provider?.clientId !== clientId) {
        return false;
      }

      return true;
    };
    const matchesScope = (session: typeof expected, allowLogicalSuccessor: boolean) => {
      if (allowLogicalSuccessor && logicalSessionIdFor(session) !== expectedLogicalSessionId) {
        return false;
      }

      if (scopeKind === 'single') {
        return allowLogicalSuccessor ? true : session.sessionId === expected.sessionId;
      }

      if (scopeKind === 'logical') {
        return logicalSessionIdFor(session) === scopeValue;
      }

      if (scopeKind === 'subject') {
        return session.subject === scopeValue && matchesProviderScope(session);
      }

      if (scopeKind === 'provider-session') {
        return session.providerSessionId === scopeValue && matchesProviderScope(session);
      }

      return false;
    };
    const deleteRecord = (key: string, session: typeof expected) => {
      if (!this.records.delete(key)) {
        return 0;
      }

      this.removeSortedIndexMember(`${subjectPrefix}${session.subject}`, session.sessionId);
      this.removeSortedIndexMember(`${logicalPrefix}${logicalSessionIdFor(session)}`, session.sessionId);

      if (session.providerSessionId) {
        this.removeSortedIndexMember(`${providerPrefix}${session.providerSessionId}`, session.sessionId);
      }

      const aliasIndexKey = `${aliasIndexPrefix}${logicalSessionIdFor(session)}`;

      for (const aliasSessionId of this.getSortedIndexMembers(aliasIndexKey)) {
        this.records.delete(`${aliasPrefix}${aliasSessionId}`);
      }

      this.sortedIndexes.delete(aliasIndexKey);

      return 1;
    };

    this.pruneExpired(sessionKey);
    const currentRaw = this.records.get(sessionKey)?.value;

    if (currentRaw) {
      const current = JSON.parse(currentRaw) as typeof expected;
      return matchesScope(current, false) ? deleteRecord(sessionKey, current) : 0;
    }

    let deleted = 0;
    const logicalIndexKey = `${logicalPrefix}${expectedLogicalSessionId}`;

    for (const sessionId of this.getSortedIndexMembers(logicalIndexKey)) {
      const key = `${sessionKeyPrefix}${sessionId}`;
      this.pruneExpired(key);
      const value = this.records.get(key)?.value;

      if (value) {
        const session = JSON.parse(value) as typeof expected;

        if (matchesScope(session, true)) {
          deleted += deleteRecord(key, session);
        }
      } else {
        this.removeSortedIndexMember(logicalIndexKey, sessionId);
      }
    }

    return deleted;
  }

  private evalRotateSession(keys: string[], args: string[]): number {
    const [oldSessionKey, newSessionKey, oldSubjectIndexKey, newSubjectIndexKey, oldAliasKey, newAliasKey] = keys;
    const [
      newValue,
      newExpiresAtRaw,
      oldSessionId,
      newSessionId,
      newScoreRaw,
      oldProviderIndexKey,
      newProviderIndexKey,
      oldLogicalIndexKey,
      newLogicalIndexKey,
      oldAliasValue,
      oldAliasExpiresAtRaw,
      aliasIndexKey,
      aliasIndexKeyPrefix,
    ] = args;

    if (
      !oldSessionKey ||
      !newSessionKey ||
      !oldSubjectIndexKey ||
      !newSubjectIndexKey ||
      !oldAliasKey ||
      !newAliasKey ||
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

    if (oldSessionId === newSessionId || this.records.has(newSessionKey)) {
      return 2;
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

    if (oldLogicalIndexKey) {
      this.removeSortedIndexMember(oldLogicalIndexKey, oldSessionId);
    }

    if (newLogicalIndexKey) {
      this.addSortedIndexMember(newLogicalIndexKey, newSessionId, Number(newScoreRaw));
    }

    this.pruneExpired(newAliasKey);
    const staleTargetAliasValue = this.records.get(newAliasKey)?.value;

    if (staleTargetAliasValue) {
      this.records.delete(newAliasKey);

      if (aliasIndexKeyPrefix) {
        try {
          const staleLogicalSessionId = JSON.parse(staleTargetAliasValue) as unknown;

          if (typeof staleLogicalSessionId === 'string') {
            this.removeSortedIndexMember(`${aliasIndexKeyPrefix}${staleLogicalSessionId}`, newSessionId);
          }
        } catch {
          // Corrupt aliases are deleted so they cannot influence a reused session ID.
        }
      }
    }

    if (oldAliasValue) {
      this.records.set(oldAliasKey, {
        value: oldAliasValue,
        expiresAt: oldAliasExpiresAtRaw ? Number(oldAliasExpiresAtRaw) : undefined,
      });

      if (aliasIndexKey) {
        this.addSortedIndexMember(aliasIndexKey, oldSessionId, Number(newScoreRaw));
      }
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
    return this.getSortedIndexMembersWithScores(key).map(([member]) => member);
  }

  private getSortedIndexMembersWithScores(key: string): Array<[string, number]> {
    const index = this.sortedIndexes.get(key);

    if (!index) {
      return [];
    }

    return [...index.entries()].sort((left, right) => left[1] - right[1] || left[0].localeCompare(right[0]));
  }

  private pruneExpired(key: string): void {
    const record = this.records.get(key);

    if (record && typeof record.expiresAt === 'number' && record.expiresAt <= this.now) {
      this.records.delete(key);
    }
  }
}

defineOidcVaultStoreProviderConformanceSuite('redis', {
  createContext: () => {
    const client = new FakeRedisClient();

    return {
      store: createRedisOidcVaultStore({ client, keyPrefix: `test:${randomUUID()}`, now: () => client.now }),
      setNow: (nextNow) => {
        client.now = nextNow;
      },
    };
  },
  sessionCreateMode: 'create-only',
});

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

  it('fails closed for malformed one-time records without exposing stored values', async () => {
    const client = new FakeRedisClient();
    const store = createRedisOidcVaultStore({ client, keyPrefix: 'test', now: () => client.now });

    client.injectRecord('test:txn:state_bad_json', '{"state":"state_bad_json","nonce":"secret_nonce"');
    client.injectRecord('test:exchange:code_bad_shape', JSON.stringify({ code: 'code_bad_shape', sessionId: 123 }));

    expect(await store.consumeAuthorizationTransaction('state_bad_json')).toBeNull();
    expect(await store.consumeAuthorizationTransaction('state_bad_json')).toBeNull();
    expect(await store.consumeExchangeCode('code_bad_shape')).toBeNull();
    expect(await store.consumeExchangeCode('code_bad_shape')).toBeNull();
  });

  it('deletes malformed session records and continues indexed revocation', async () => {
    const client = new FakeRedisClient();
    const store = createRedisOidcVaultStore({ client, keyPrefix: 'test', now: () => client.now });

    await store.createSession({
      sessionId: 'sess_valid',
      subject: 'user_1',
      refreshToken: 'refresh_valid',
      idToken: 'id_valid',
    });
    client.injectRecord('test:session:sess_corrupt', '{"sessionId":"sess_corrupt","refreshToken":"secret_refresh"');
    client.injectSortedIndexMember('test:subject:user_1', 'sess_corrupt', -1);

    expect(await store.deleteSessionsBySubject('user_1')).toBe(1);
    expect(await store.getSession('sess_corrupt')).toBeNull();
    expect(await store.getSession('sess_valid')).toBeNull();
  });

  it('enforces explicit session expiry', async () => {
    const client = new FakeRedisClient();
    const store = createRedisOidcVaultStore({ client, keyPrefix: 'test', now: () => client.now });

    await store.createSession({
      sessionId: 'sess_1',
      subject: 'user_1',
      refreshToken: 'refresh_1',
      idToken: 'id_1',
      expiresAt: 200,
    });

    expect(await store.getSession('sess_1')).toMatchObject({ sessionId: 'sess_1' });

    client.now = 250;

    expect(await store.getSession('sess_1')).toBeNull();
  });

  it('uses Redis time, not store time, when pruning revocation indexes', async () => {
    const client = new FakeRedisClient();
    const store = createRedisOidcVaultStore({ client, keyPrefix: 'test', now: () => 10_000 });

    await store.createSession({
      sessionId: 'sess_1',
      subject: 'user_1',
      refreshToken: 'refresh_1',
      idToken: 'id_1',
      expiresAt: 5_000,
    });

    expect(await store.deleteSessionsBySubject('user_1')).toBe(1);
    expect(await store.getSession('sess_1')).toBeNull();
  });

  it('incrementally removes expired stale index keys without a targeted logout', async () => {
    const client = new FakeRedisClient();
    const store = createRedisOidcVaultStore({ client, keyPrefix: 'test', now: () => client.now });

    for (let index = 0; index < 10; index += 1) {
      await store.createSession({
        sessionId: `sess_${index}`,
        logicalSessionId: `logical_${index}`,
        subject: `user_${index}`,
        providerSessionId: `provider_sid_${index}`,
        refreshToken: `refresh_${index}`,
        idToken: `id_${index}`,
        expiresAt: 100,
      });
    }

    client.now = 200;
    expect(await store.getSession('sess_0')).toBeNull();

    await store.createSession({
      sessionId: 'sess_active',
      logicalSessionId: 'logical_active',
      subject: 'user_active',
      providerSessionId: 'provider_sid_active',
      refreshToken: 'refresh_active',
      idToken: 'id_active',
      expiresAt: 1_000,
    });

    expect(client.countSortedIndexKeys('test:subject:')).toBe(1);
    expect(client.countSortedIndexKeys('test:provider-session:')).toBe(1);
    expect(client.countSortedIndexKeys('test:logical-session:')).toBe(1);
  });

  it('rejects duplicate session creation without changing the existing record or indexes', async () => {
    const client = new FakeRedisClient();
    const store = createRedisOidcVaultStore({ client, keyPrefix: 'test', now: () => client.now });

    await store.createSession({
      sessionId: 'sess_1',
      logicalSessionId: 'logical_1',
      subject: 'user_1',
      providerSessionId: 'provider_sid_1',
      refreshToken: 'refresh_1',
      idToken: 'id_1',
    });

    await expect(
      store.createSession({
        sessionId: 'sess_1',
        logicalSessionId: 'logical_2',
        subject: 'user_2',
        providerSessionId: 'provider_sid_2',
        refreshToken: 'refresh_2',
        idToken: 'id_2',
      }),
    ).rejects.toThrow('already exists');

    expect(await store.getSession('sess_1')).toMatchObject({
      sessionId: 'sess_1',
      logicalSessionId: 'logical_1',
      subject: 'user_1',
      providerSessionId: 'provider_sid_1',
      refreshToken: 'refresh_1',
    });
    expect(await store.deleteSessionsBySubject('user_2')).toBe(0);
    expect(await store.deleteSessionsByProviderSessionId('provider_sid_2')).toBe(0);
    expect(await store.getSession('sess_1')).not.toBeNull();
  });

  it('ignores stale subject and provider-session index memberships that the record does not own', async () => {
    const client = new FakeRedisClient();
    const store = createRedisOidcVaultStore({ client, keyPrefix: 'test', now: () => client.now });

    await store.createSession({
      sessionId: 'sess_1',
      subject: 'user_1',
      providerSessionId: 'provider_sid_1',
      refreshToken: 'refresh_1',
      idToken: 'id_1',
    });

    client.injectSortedIndexMember('test:subject:user_stale', 'sess_1', 100);
    client.injectSortedIndexMember('test:provider-session:provider_sid_stale', 'sess_1', 100);

    expect(await store.deleteSessionsBySubject('user_stale')).toBe(0);
    expect(await store.deleteSessionsByProviderSessionId('provider_sid_stale')).toBe(0);
    expect(await store.getSession('sess_1')).toMatchObject({ sessionId: 'sess_1' });

    expect(await store.deleteSessionsBySubject('user_1')).toBe(1);
    expect(await store.getSession('sess_1')).toBeNull();
  });

  it('rejects same-ID rotation and occupied target rotation without changing records', async () => {
    const client = new FakeRedisClient();
    const store = createRedisOidcVaultStore({ client, keyPrefix: 'test', now: () => client.now });

    const source = await store.createSession({
      sessionId: 'sess_1',
      subject: 'user_1',
      refreshToken: 'refresh_1',
      idToken: 'id_1',
    });
    const target = await store.createSession({
      sessionId: 'sess_2',
      subject: 'user_2',
      refreshToken: 'refresh_2',
      idToken: 'id_2',
    });

    await expect(
      store.rotateSession({
        sessionId: 'sess_1',
        nextSession: { ...source, refreshToken: 'refresh_same_id', updatedAt: source.updatedAt + 1 },
      }),
    ).rejects.toThrow('different session ID');
    expect(await store.getSession('sess_1')).toEqual(source);

    await expect(
      store.rotateSession({
        sessionId: 'sess_1',
        nextSession: {
          ...source,
          sessionId: 'sess_2',
          refreshToken: 'refresh_occupied',
          updatedAt: source.updatedAt + 1,
        },
      }),
    ).rejects.toThrow('already exists');
    expect(await store.getSession('sess_1')).toEqual(source);
    expect(await store.getSession('sess_2')).toEqual(target);
  });

  it('consumes backchannel logout token jti values once until expiration', async () => {
    const client = new FakeRedisClient();
    const store = createRedisOidcVaultStore({ client, keyPrefix: 'test', now: () => client.now });

    expect(await store.consumeBackchannelLogoutTokenJti({ jti: 'logout_1', expiresAt: 200 })).toBe(true);
    expect(await store.consumeBackchannelLogoutTokenJti({ jti: 'logout_1', expiresAt: 200 })).toBe(false);

    client.now = 250;

    expect(await store.consumeBackchannelLogoutTokenJti({ jti: 'logout_1', expiresAt: 350 })).toBe(true);
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

  it('deletes the current rotated session by logical session ID', async () => {
    const client = new FakeRedisClient();
    const store = createRedisOidcVaultStore({ client, keyPrefix: 'test', now: () => client.now });

    const created = await store.createSession({
      sessionId: 'sess_1',
      subject: 'user_1',
      refreshToken: 'refresh_1',
      idToken: 'id_1',
    });

    await store.rotateSession({
      sessionId: 'sess_1',
      nextSession: {
        ...created,
        sessionId: 'sess_2',
        refreshToken: 'refresh_2',
        updatedAt: created.updatedAt + 1,
      },
    });

    expect(await store.deleteSessionsByLogicalSessionId(created.logicalSessionId ?? created.sessionId)).toBe(1);
    expect(await store.getSession('sess_2')).toBeNull();
  });

  it('deletes all rotated aliases when revoking through an obsolete session ID', async () => {
    const client = new FakeRedisClient();
    const store = createRedisOidcVaultStore({ client, keyPrefix: 'test', now: () => client.now });

    const created = await store.createSession({
      sessionId: 'sess_1',
      logicalSessionId: 'logical_1',
      subject: 'user_1',
      refreshToken: 'refresh_1',
      idToken: 'id_1',
    });
    const rotated = await store.rotateSession({
      sessionId: 'sess_1',
      nextSession: { ...created, sessionId: 'sess_2', refreshToken: 'refresh_2', updatedAt: created.updatedAt + 1 },
    });

    await store.rotateSession({
      sessionId: 'sess_2',
      nextSession: { ...rotated, sessionId: 'sess_3', refreshToken: 'refresh_3', updatedAt: rotated.updatedAt + 1 },
    });

    expect(client.hasRecord('test:rotated-session-alias:sess_1')).toBe(true);
    expect(client.hasRecord('test:rotated-session-alias:sess_2')).toBe(true);

    await store.deleteSession('sess_1');

    expect(await store.getSession('sess_3')).toBeNull();
    expect(client.hasRecord('test:rotated-session-alias:sess_1')).toBe(false);
    expect(client.hasRecord('test:rotated-session-alias:sess_2')).toBe(false);
    expect(client.hasSortedIndexMember('test:rotated-session-alias-index:logical_1', 'sess_1')).toBe(false);
    expect(client.hasSortedIndexMember('test:rotated-session-alias-index:logical_1', 'sess_2')).toBe(false);
  });

  it('removes stale alias ownership when a rotated session ID is reused', async () => {
    const client = new FakeRedisClient();
    const store = createRedisOidcVaultStore({ client, keyPrefix: 'test', now: () => client.now });

    const created = await store.createSession({
      sessionId: 'sess_1',
      logicalSessionId: 'logical_old',
      subject: 'user_old',
      refreshToken: 'refresh_1',
      idToken: 'id_1',
    });

    await store.rotateSession({
      sessionId: 'sess_1',
      nextSession: { ...created, sessionId: 'sess_2', refreshToken: 'refresh_2', updatedAt: created.updatedAt + 1 },
    });

    await store.createSession({
      sessionId: 'sess_1',
      logicalSessionId: 'logical_new',
      subject: 'user_new',
      refreshToken: 'refresh_new',
      idToken: 'id_new',
    });

    expect(client.hasRecord('test:rotated-session-alias:sess_1')).toBe(false);
    expect(client.hasSortedIndexMember('test:rotated-session-alias-index:logical_old', 'sess_1')).toBe(false);

    await store.deleteSession('sess_1');

    expect(await store.getSession('sess_1')).toBeNull();
    expect(await store.getSession('sess_2')).toMatchObject({ logicalSessionId: 'logical_old' });
  });

  it('does not miss a rotated successor when indexed deletion resumes after a stale lookup', async () => {
    const client = new FakeRedisClient();
    const store = createRedisOidcVaultStore({ client, keyPrefix: 'test', now: () => client.now });

    const created = await store.createSession({
      sessionId: 'sess_1',
      logicalSessionId: 'logical_1',
      subject: 'user_1',
      providerSessionId: 'provider_sid_1',
      refreshToken: 'refresh_1',
      idToken: 'id_1',
    });
    const get = client.get.bind(client);
    let rotated = false;

    client.get = async (key) => {
      const value = await get(key);

      if (!rotated && key === 'test:session:sess_1' && value) {
        rotated = true;
        await store.rotateSession({
          sessionId: 'sess_1',
          nextSession: {
            ...created,
            sessionId: 'sess_2',
            refreshToken: 'refresh_2',
            updatedAt: created.updatedAt + 1,
          },
        });
      }

      return value;
    };

    expect(await store.deleteSessionsBySubject('user_1')).toBe(1);
    expect(await store.getSession('sess_1')).toBeNull();
    expect(await store.getSession('sess_2')).toBeNull();
  });

  it('counts only one actual revocation across concurrent indexed deletions', async () => {
    const client = new FakeRedisClient();
    const store = createRedisOidcVaultStore({ client, keyPrefix: 'test', now: () => client.now });

    await store.createSession({
      sessionId: 'sess_1',
      logicalSessionId: 'logical_1',
      subject: 'user_1',
      refreshToken: 'refresh_1',
      idToken: 'id_1',
    });

    const results = await Promise.all([
      store.deleteSessionsByLogicalSessionId('logical_1'),
      store.deleteSessionsBySubject('user_1'),
    ]);

    expect(results.reduce((total, count) => total + count, 0)).toBe(1);
    expect(await store.getSession('sess_1')).toBeNull();
  });

  it('revokes large subject indexes in bounded batches without full-index materialization', async () => {
    const client = new FakeRedisClient();
    const store = createRedisOidcVaultStore({ client, keyPrefix: 'test', now: () => client.now });

    for (let index = 0; index < 1_000; index += 1) {
      await store.createSession({
        sessionId: `sess_${index}`,
        subject: 'user_large',
        refreshToken: `refresh_${index}`,
        idToken: `id_${index}`,
      });
    }

    client.commands.length = 0;

    expect(await store.deleteSessionsBySubject('user_large')).toBe(1_000);
    expect(client.maxZScanMembers).toBeLessThanOrEqual(250);
    expect(client.commands).toContain('ZSCAN');
    expect(client.commands).toContain('MGET');
    expect(client.commands.filter((command) => command === 'GET')).toHaveLength(0);
    expect(client.commands.filter((command) => command === 'MGET').length).toBeLessThanOrEqual(4);
  });

  it('keeps bounded revocation command behavior for a 10,000-session index', async () => {
    const client = new FakeRedisClient();
    const store = createRedisOidcVaultStore({ client, keyPrefix: 'test', now: () => client.now });

    for (let index = 0; index < 10_000; index += 1) {
      await store.createSession({
        sessionId: `sess_${index}`,
        subject: 'user_benchmark',
        refreshToken: `refresh_${index}`,
        idToken: `id_${index}`,
      });
    }

    client.commands.length = 0;
    const startedAt = performance.now();

    expect(await store.deleteSessionsBySubject('user_benchmark')).toBe(10_000);

    const elapsedMs = performance.now() - startedAt;
    const mgetCount = client.commands.filter((command) => command === 'MGET').length;

    expect(client.maxZScanMembers).toBeLessThanOrEqual(250);
    expect(mgetCount).toBeLessThanOrEqual(40);
    expect(client.commands.filter((command) => command === 'GET')).toHaveLength(0);
    expect(elapsedMs).toBeLessThan(10_000);
  }, 20_000);

  it('applies concurrent indexed revocation to the scan view and leaves later additions for a later call', async () => {
    const client = new FakeRedisClient();
    const store = createRedisOidcVaultStore({ client, keyPrefix: 'test', now: () => client.now });

    await store.createSession({
      sessionId: 'sess_1',
      subject: 'user_concurrent',
      refreshToken: 'refresh_1',
      idToken: 'id_1',
    });

    const sendCommand = client.sendCommand.bind(client);
    let added = false;

    client.sendCommand = async (args) => {
      const result = await sendCommand(args);

      if (!added && args[0] === 'ZSCAN' && args[1] === 'test:subject:user_concurrent') {
        added = true;
        await store.createSession({
          sessionId: 'sess_2',
          subject: 'user_concurrent',
          refreshToken: 'refresh_2',
          idToken: 'id_2',
        });
      }

      return result;
    };

    expect(await store.deleteSessionsBySubject('user_concurrent')).toBe(1);
    expect(await store.getSession('sess_1')).toBeNull();
    expect(await store.getSession('sess_2')).toMatchObject({ sessionId: 'sess_2' });
    expect(await store.deleteSessionsBySubject('user_concurrent')).toBe(1);
    expect(await store.getSession('sess_2')).toBeNull();
  });
});
