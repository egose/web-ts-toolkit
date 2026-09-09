import { createHash, randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createRedisOidcVaultStore, type OidcVaultRedisClient } from '../src/index';
import {
  COMPARE_AND_DELETE_SCRIPT,
  DELETE_SESSION_SCRIPT,
  ROTATE_SESSION_SCRIPT,
  WRITE_SESSION_SCRIPT,
} from '../src/scripts.js';
import { createRedisHarness, REDIS_TIMEOUT, type RedisHarness } from './redis-harness';

/**
 * SVH-03 barrier-controlled race coverage. Each race test pauses inside the
 * stale-read window (after the corrupt/missing read, before the repair
 * delete), lets a second client clean the corruption and recreate the same ID
 * (ID reuse is supported), then resumes: the fresh replacement must survive
 * while an unchanged malformed record is still removed and later valid members
 * are still revoked. This distinguishes a stale repair (must preserve) from a
 * genuine concurrent logout of a live session (must delete).
 */
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

    if (script === COMPARE_AND_DELETE_SCRIPT) {
      return this.evalCompareAndDelete(keys, scriptArgs);
    }

    throw new Error('Unsupported EVAL script.');
  }

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

  private evalCompareAndDelete(keys: string[], args: string[]): number {
    const [key] = keys;
    const [expected] = args;

    if (!key || expected === undefined) {
      throw new Error('Invalid compare-and-delete script arguments.');
    }

    this.pruneExpired(key);

    if (this.records.get(key)?.value === expected) {
      this.records.delete(key);
      return 1;
    }

    return 0;
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

  hasRecord(key: string): boolean {
    this.pruneExpired(key);
    return this.records.has(key);
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

describe('redis corruption repair compare-and-delete (emulator)', () => {
  it('removes an unchanged malformed session and never returns it', async () => {
    const client = new FakeRedisClient();
    const store = createRedisOidcVaultStore({ client, keyPrefix: 'test', now: () => client.now });

    client.injectRecord('test:session:sess_corrupt', '{"sessionId":"sess_corrupt","refreshToken":"secret_refresh"');

    expect(await store.getSession('sess_corrupt')).toBeNull();
    expect(client.hasRecord('test:session:sess_corrupt')).toBe(false);
    expect(await store.getSession('sess_corrupt')).toBeNull();
  });

  it('preserves a fresh same-ID replacement created after a stale corrupt read (single-key)', async () => {
    const client = new FakeRedisClient();
    const store = createRedisOidcVaultStore({ client, keyPrefix: 'test', now: () => client.now });
    const cleaner = createRedisOidcVaultStore({ client, keyPrefix: 'test', now: () => client.now });
    const sessionKey = 'test:session:sess_race';

    client.injectRecord(sessionKey, '{"sessionId":"sess_race","refreshToken":"secret_refresh"');

    let interleaved = false;
    const rawGet = client.get.bind(client);
    client.get = async (key) => {
      const value = await rawGet(key);

      if (!interleaved && key === sessionKey && value !== null) {
        interleaved = true;
        // A second client repairs the corruption and reuses the ID before the
        // stale repair delete runs.
        expect(await cleaner.getSession('sess_race')).toBeNull();
        await cleaner.createSession({
          sessionId: 'sess_race',
          subject: 'user_new',
          refreshToken: 'refresh_new',
          idToken: 'id_new',
        });
      }

      return value;
    };

    // Fail-closed: the stale read never returns malformed credentials.
    expect(await store.getSession('sess_race')).toBeNull();
    expect(interleaved).toBe(true);
    // The stale compare-and-delete observed the old payload, so the fresh
    // replacement survives.
    expect(await cleaner.getSession('sess_race')).toMatchObject({
      sessionId: 'sess_race',
      subject: 'user_new',
      refreshToken: 'refresh_new',
    });
  });

  it('preserves a fresh replacement during batched MGET repair while revoking later valid members', async () => {
    const client = new FakeRedisClient();
    const store = createRedisOidcVaultStore({ client, keyPrefix: 'test', now: () => client.now });
    const cleaner = createRedisOidcVaultStore({ client, keyPrefix: 'test', now: () => client.now });

    await store.createSession({
      sessionId: 'sess_valid',
      subject: 'user_1',
      refreshToken: 'refresh_valid',
      idToken: 'id_valid',
    });
    client.injectRecord('test:session:sess_corrupt', '{"sessionId":"sess_corrupt","refreshToken":"secret_refresh"');
    client.injectSortedIndexMember('test:subject:user_1', 'sess_corrupt', -1);

    let interleaved = false;
    const rawSendCommand = client.sendCommand.bind(client);
    client.sendCommand = async (args) => {
      if (args[0] === 'MGET' && !interleaved) {
        const response = await rawSendCommand(args);
        interleaved = true;
        // Another client repairs and reuses the corrupt ID after the MGET
        // snapshot but before the stale repair delete.
        expect(await cleaner.getSession('sess_corrupt')).toBeNull();
        await cleaner.createSession({
          sessionId: 'sess_corrupt',
          subject: 'user_1',
          refreshToken: 'refresh_fresh',
          idToken: 'id_fresh',
        });
        return response;
      }

      return rawSendCommand(args);
    };

    expect(await store.deleteSessionsBySubject('user_1')).toBe(1);
    expect(interleaved).toBe(true);
    // Later valid member revoked; fresh replacement created after the MGET
    // snapshot survives this call and is revoked by a later call (genuine
    // logout semantics still apply to live records).
    expect(await cleaner.getSession('sess_valid')).toBeNull();
    expect(await cleaner.getSession('sess_corrupt')).toMatchObject({ refreshToken: 'refresh_fresh' });
    expect(await store.deleteSessionsBySubject('user_1')).toBe(1);
    expect(await cleaner.getSession('sess_corrupt')).toBeNull();
  });

  it('preserves a reused session ID through the missing-session logout branch while revoking the old lineage', async () => {
    const client = new FakeRedisClient();
    const store = createRedisOidcVaultStore({ client, keyPrefix: 'test', now: () => client.now });
    const other = createRedisOidcVaultStore({ client, keyPrefix: 'test', now: () => client.now });

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

    let interleaved = false;
    const rawGet = client.get.bind(client);
    client.get = async (key) => {
      const value = await rawGet(key);

      if (!interleaved && key === 'test:rotated-session-alias:sess_1' && value !== null) {
        interleaved = true;
        // Another client reuses the rotated-away ID after the alias read but
        // before the stale logout cleanup finishes.
        await other.createSession({
          sessionId: 'sess_1',
          logicalSessionId: 'logical_new',
          subject: 'user_new',
          refreshToken: 'refresh_new',
          idToken: 'id_new',
        });
      }

      return value;
    };

    // Stale logout for the old lineage: revokes the old successor but must not
    // destroy the reused ID, which belongs to a new lineage.
    await store.deleteSession('sess_1');
    expect(interleaved).toBe(true);
    expect(await other.getSession('sess_2')).toBeNull();
    expect(await other.getSession('sess_1')).toMatchObject({ logicalSessionId: 'logical_new' });
  });

  it('still deletes live sessions on genuine logout', async () => {
    const client = new FakeRedisClient();
    const store = createRedisOidcVaultStore({ client, keyPrefix: 'test', now: () => client.now });

    await store.createSession({
      sessionId: 'sess_live',
      subject: 'user_live',
      refreshToken: 'refresh_live',
      idToken: 'id_live',
    });

    await store.deleteSession('sess_live');
    expect(await store.getSession('sess_live')).toBeNull();
  });
});

const hasDocker = (() => {
  try {
    execSync('docker --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const REDIS_IMAGES = ['redis:6.2-alpine', 'redis:7.2-alpine'] as const;

const asStoreClient = (harness: RedisHarness): OidcVaultRedisClient =>
  harness.client as unknown as OidcVaultRedisClient;

if (!hasDocker) {
  describe.skip('redis corruption repair compare-and-delete (real Redis, docker not available)', () => {
    it.skip('skipped - docker not available', () => {});
  });
} else {
  describe.each(REDIS_IMAGES)('redis corruption repair compare-and-delete on %s', (image) => {
    let harness: RedisHarness | undefined;

    beforeAll(async () => {
      harness = await createRedisHarness(image);
    }, REDIS_TIMEOUT);

    afterAll(async () => {
      await harness?.stop();
    }, REDIS_TIMEOUT);

    it('preserves a fresh same-ID replacement created after a stale corrupt read (single-key)', async (context) => {
      if (!harness) throw new Error('Redis harness not initialized.');
      const active: RedisHarness = harness;
      const keyPrefix = active.createKeyPrefix(`${context.task.name}-${randomUUID()}`);
      const raw = asStoreClient(active);
      const cleaner = createRedisOidcVaultStore({ client: raw, keyPrefix, now: Date.now });
      const sessionKey = `${keyPrefix}:session:sess_race`;

      try {
        await active.client.set(sessionKey, '{"sessionId":"sess_race","refreshToken":"secret_refresh"');

        let interleaved = false;
        const rawGet = raw.get.bind(raw);
        const racingClient: OidcVaultRedisClient = {
          set: raw.set.bind(raw),
          del: raw.del.bind(raw),
          sendCommand: raw.sendCommand.bind(raw),
          get: async (key) => {
            const value = await rawGet(key);

            if (!interleaved && key === sessionKey && value !== null) {
              interleaved = true;
              expect(await cleaner.getSession('sess_race')).toBeNull();
              await cleaner.createSession({
                sessionId: 'sess_race',
                subject: 'user_new',
                refreshToken: 'refresh_new',
                idToken: 'id_new',
              });
            }

            return value;
          },
        };
        const store = createRedisOidcVaultStore({ client: racingClient, keyPrefix, now: Date.now });

        expect(await store.getSession('sess_race')).toBeNull();
        expect(interleaved).toBe(true);
        expect(await cleaner.getSession('sess_race')).toMatchObject({ subject: 'user_new' });
      } finally {
        await active.deleteKeysByPrefix(keyPrefix);
      }
    });

    it('preserves a fresh replacement during batched MGET repair while revoking later valid members', async (context) => {
      if (!harness) throw new Error('Redis harness not initialized.');
      const active: RedisHarness = harness;
      const keyPrefix = active.createKeyPrefix(`${context.task.name}-${randomUUID()}`);
      const raw = asStoreClient(active);
      const seeder = createRedisOidcVaultStore({ client: raw, keyPrefix, now: Date.now });
      const cleaner = createRedisOidcVaultStore({ client: raw, keyPrefix, now: Date.now });

      try {
        await seeder.createSession({
          sessionId: 'sess_valid',
          subject: 'user_1',
          refreshToken: 'refresh_valid',
          idToken: 'id_valid',
        });
        await active.client.set(
          `${keyPrefix}:session:sess_corrupt`,
          '{"sessionId":"sess_corrupt","refreshToken":"secret_refresh"',
        );
        await active.client.sendCommand(['ZADD', `${keyPrefix}:subject:user_1`, '-1', 'sess_corrupt']);

        let interleaved = false;
        const rawSendCommand = raw.sendCommand.bind(raw);
        const racingClient: OidcVaultRedisClient = {
          set: raw.set.bind(raw),
          get: raw.get.bind(raw),
          del: raw.del.bind(raw),
          sendCommand: async (args) => {
            if (args[0] === 'MGET' && !interleaved) {
              const response = await rawSendCommand(args);
              interleaved = true;
              expect(await cleaner.getSession('sess_corrupt')).toBeNull();
              await cleaner.createSession({
                sessionId: 'sess_corrupt',
                subject: 'user_1',
                refreshToken: 'refresh_fresh',
                idToken: 'id_fresh',
              });
              return response;
            }

            return rawSendCommand(args);
          },
        };
        const store = createRedisOidcVaultStore({ client: racingClient, keyPrefix, now: Date.now });

        expect(await store.deleteSessionsBySubject('user_1')).toBe(1);
        expect(interleaved).toBe(true);
        expect(await cleaner.getSession('sess_valid')).toBeNull();
        expect(await cleaner.getSession('sess_corrupt')).toMatchObject({ refreshToken: 'refresh_fresh' });
        expect(await seeder.deleteSessionsBySubject('user_1')).toBe(1);
        expect(await cleaner.getSession('sess_corrupt')).toBeNull();
      } finally {
        await active.deleteKeysByPrefix(keyPrefix);
      }
    });

    it('preserves a reused session ID through the missing-session logout branch', async (context) => {
      if (!harness) throw new Error('Redis harness not initialized.');
      const active: RedisHarness = harness;
      const keyPrefix = active.createKeyPrefix(`${context.task.name}-${randomUUID()}`);
      let now = Date.now();
      const raw = asStoreClient(active);
      const seeder = createRedisOidcVaultStore({ client: raw, keyPrefix, now: () => now });
      const other = createRedisOidcVaultStore({ client: raw, keyPrefix, now: () => now });

      try {
        const created = await seeder.createSession({
          sessionId: 'sess_1',
          logicalSessionId: 'logical_old',
          subject: 'user_old',
          refreshToken: 'refresh_1',
          idToken: 'id_1',
        });
        now += 1;
        await seeder.rotateSession({
          sessionId: 'sess_1',
          nextSession: { ...created, sessionId: 'sess_2', refreshToken: 'refresh_2', updatedAt: now },
        });

        let interleaved = false;
        const rawGet = raw.get.bind(raw);
        const racingClient: OidcVaultRedisClient = {
          set: raw.set.bind(raw),
          del: raw.del.bind(raw),
          sendCommand: raw.sendCommand.bind(raw),
          get: async (key) => {
            const value = await rawGet(key);

            if (!interleaved && key === `${keyPrefix}:rotated-session-alias:sess_1` && value !== null) {
              interleaved = true;
              now += 1;
              await other.createSession({
                sessionId: 'sess_1',
                logicalSessionId: 'logical_new',
                subject: 'user_new',
                refreshToken: 'refresh_new',
                idToken: 'id_new',
              });
            }

            return value;
          },
        };
        const store = createRedisOidcVaultStore({ client: racingClient, keyPrefix, now: () => now });

        await store.deleteSession('sess_1');
        expect(interleaved).toBe(true);
        expect(await other.getSession('sess_2')).toBeNull();
        expect(await other.getSession('sess_1')).toMatchObject({ logicalSessionId: 'logical_new' });
      } finally {
        await active.deleteKeysByPrefix(keyPrefix);
      }
    });
  });
}
