import { createHash } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createRedisOidcVaultStore, type OidcVaultRedisClient } from '../src/index';

type MaintenanceCommand = 'SCAN' | 'TYPE' | 'TIME' | 'ZREMRANGEBYSCORE';

const MAINTENANCE_COMMANDS: MaintenanceCommand[] = ['SCAN', 'TYPE', 'TIME', 'ZREMRANGEBYSCORE'];

/**
 * Minimal fake that persists session records through the script-runner
 * EVALSHA/SCRIPT LOAD handshake ( distinguished by key count: write=4,
 * rotate=6) while letting each post-commit maintenance command be
 * individually fault-injected. Mutation paths never consult `failOn`.
 */
class MaintenanceFakeClient implements OidcVaultRedisClient {
  readonly records = new Map<string, string>();
  readonly indexes = new Map<string, Map<string, number>>();
  readonly commands: string[] = [];
  readonly failOn = new Set<string>();
  maintenanceFailure: unknown = new Error('injected maintenance failure');
  writeCount = 0;
  rotateCount = 0;
  zremRangeByScoreCalls = 0;
  private readonly scriptsByDigest = new Map<string, string>();

  async set(key: string, value: string): Promise<'OK'> {
    this.records.set(key, value);
    return 'OK';
  }

  async get(key: string): Promise<string | null> {
    return this.records.get(key) ?? null;
  }

  async del(keys: string | string[]): Promise<number> {
    const list = Array.isArray(keys) ? keys : [keys];
    let deleted = 0;
    for (const key of list) {
      if (this.records.delete(key)) deleted += 1;
      if (this.indexes.delete(key)) deleted += 1;
    }
    return deleted;
  }

  async sendCommand(args: string[]): Promise<unknown> {
    const [command, ...rest] = args;
    if (command) this.commands.push(command);

    if (command === 'EVALSHA') return this.handleEvalSha(rest);
    if (command === 'SCRIPT') return this.handleScript(rest);

    if (command && this.failOn.has(command)) {
      throw this.maintenanceFailure;
    }

    switch (command) {
      case 'SCAN':
        return ['0', ['test:subject:user_stale']];
      case 'TYPE':
        return 'zset';
      case 'TIME':
        return ['1000', '0'];
      case 'ZREMRANGEBYSCORE': {
        this.zremRangeByScoreCalls += 1;
        const [key] = rest;
        if (key) {
          const index = this.indexes.get(key);
          if (index) {
            for (const [member, score] of [...index.entries()]) {
              if (score <= 1000) index.delete(member);
            }
            if (index.size === 0) this.indexes.delete(key);
          }
        }
        return 1;
      }
      default:
        throw new Error(`Unsupported command: ${args.join(' ')}`);
    }
  }

  private async handleScript(args: string[]): Promise<string> {
    const [subcommand, script] = args;
    if (subcommand !== 'LOAD' || !script) throw new Error('SCRIPT requires LOAD + body.');
    const digest = createHash('sha1').update(script).digest('hex');
    this.scriptsByDigest.set(digest, script);
    return digest;
  }

  private async handleEvalSha(args: string[]): Promise<number> {
    const [digest, keyCountRaw, ...rest] = args;
    if (!digest || !keyCountRaw) throw new Error('EVALSHA requires digest + key count.');
    const script = this.scriptsByDigest.get(digest);
    if (!script) throw new Error('NOSCRIPT No matching script. Please use EVAL.');
    const keyCount = Number(keyCountRaw);
    const keys = rest.slice(0, keyCount);
    const scriptArgs = rest.slice(keyCount);
    if (keyCount === 4) return this.evalWrite(keys, scriptArgs);
    if (keyCount === 6) return this.evalRotate(keys, scriptArgs);
    if (keyCount === 1) return this.evalCompareAndDelete(keys, scriptArgs);
    throw new Error(`Unsupported script key count: ${keyCount}`);
  }

  private evalCompareAndDelete(keys: string[], args: string[]): number {
    const [key] = keys;
    const [expected] = args;
    if (!key || expected === undefined) throw new Error('Invalid compare-and-delete args.');
    if (this.records.get(key) === expected) {
      this.records.delete(key);
      return 1;
    }
    return 0;
  }

  private evalWrite(keys: string[], args: string[]): number {
    const [sessionKey, subjectIndexKey, logicalIndexKey] = keys;
    const [value, , sessionId, scoreRaw, providerIndexKey] = args;
    if (!sessionKey || !subjectIndexKey || !logicalIndexKey || !value || !sessionId || !scoreRaw) {
      throw new Error('Invalid write args.');
    }
    if (this.records.has(sessionKey)) return 0;
    this.writeCount += 1;
    this.records.set(sessionKey, value);
    this.addMember(subjectIndexKey, sessionId, Number(scoreRaw));
    this.addMember(logicalIndexKey, sessionId, Number(scoreRaw));
    if (providerIndexKey) this.addMember(providerIndexKey, sessionId, Number(scoreRaw));
    return 1;
  }

  private evalRotate(keys: string[], args: string[]): number {
    const [oldSessionKey, newSessionKey, oldSubjectIndexKey, newSubjectIndexKey] = keys;
    const [newValue, , oldSessionId, newSessionId, newScoreRaw] = args;
    if (!oldSessionKey || !newSessionKey || !newValue || !oldSessionId || !newSessionId || !newScoreRaw) {
      throw new Error('Invalid rotate args.');
    }
    if (!this.records.has(oldSessionKey)) return 0;
    if (this.records.has(newSessionKey)) return 2;
    this.rotateCount += 1;
    this.records.set(newSessionKey, newValue);
    this.records.delete(oldSessionKey);
    this.removeMember(oldSubjectIndexKey!, oldSessionId);
    this.addMember(newSubjectIndexKey!, newSessionId, Number(newScoreRaw));
    return 1;
  }

  private addMember(key: string, member: string, score: number): void {
    const index = this.indexes.get(key) ?? new Map<string, number>();
    index.set(member, score);
    this.indexes.set(key, index);
  }

  private removeMember(key: string, member: string): void {
    const index = this.indexes.get(key);
    if (!index) return;
    index.delete(member);
    if (index.size === 0) this.indexes.delete(key);
  }

  injectStaleIndexMember(key: string, member: string, score: number): void {
    this.addMember(key, member, score);
  }

  hasIndexMember(key: string, member: string): boolean {
    return this.indexes.get(key)?.has(member) ?? false;
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

const sessionInput = (id: string) => ({
  sessionId: id,
  subject: 'user_1',
  refreshToken: `refresh-secret-for-${id}`,
  idToken: `id-token-for-${id}`,
});

const SECRET = 'redis://synthetic-user:synthetic-password@example.invalid/?token=synthetic-token'; // pragma: allowlist secret
const POST_COMMIT_OPERATIONS = ['createSession', 'rotateSession'] as const;
const maintenanceFailures: Array<{ label: string; create: () => unknown }> = [
  { label: 'error name', create: () => Object.assign(new Error('maintenance failed'), { name: SECRET }) },
  { label: 'error message', create: () => new Error(SECRET) },
  { label: 'string', create: () => SECRET },
  { label: 'object fields', create: () => ({ name: SECRET, message: SECRET, code: SECRET, cause: SECRET }) },
  { label: 'array', create: () => [SECRET] },
  { label: 'symbol', create: () => Symbol(SECRET) },
  { label: 'null', create: () => null },
  { label: 'undefined', create: () => undefined },
  {
    label: 'throwing error accessors',
    create: () =>
      Object.defineProperties(new Error(), {
        name: {
          get: () => {
            throw new Error(SECRET);
          },
        },
        message: {
          get: () => {
            throw new Error(SECRET);
          },
        },
      }),
  },
  {
    label: 'hostile proxy',
    create: () =>
      new Proxy(
        { secret: SECRET },
        {
          get: () => {
            throw new Error(SECRET);
          },
          getPrototypeOf: () => {
            throw new Error(SECRET);
          },
        },
      ),
  },
];

describe('SVH-02 post-commit maintenance isolation', () => {
  it.each(MAINTENANCE_COMMANDS)('createSession commits despite %s maintenance failure', async (command) => {
    const client = new MaintenanceFakeClient();
    client.failOn.add(command);
    const store = createRedisOidcVaultStore({ client, keyPrefix: 'test' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const created = await store.createSession(sessionInput('sess_1'));

    expect(created.sessionId).toBe('sess_1');
    expect(await store.getSession('sess_1')).toMatchObject({ sessionId: 'sess_1' });
    expect(client.writeCount).toBe(1);
    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0]?.[0] ?? '');
    expect(message).toContain('createSession');
    expect(message).not.toContain('refresh-secret-for-sess_1');
    expect(message).not.toContain('id-token-for-sess_1');
    expect(message).not.toContain('sess_1');
  });

  it.each(MAINTENANCE_COMMANDS)(
    'rotateSession commits despite %s maintenance failure without retry',
    async (command) => {
      const client = new MaintenanceFakeClient();
      const store = createRedisOidcVaultStore({ client, keyPrefix: 'test' });
      const created = await store.createSession(sessionInput('sess_1'));

      client.failOn.add(command);
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const rotated = await store.rotateSession({
        sessionId: 'sess_1',
        nextSession: { ...created, sessionId: 'sess_2', refreshToken: 'refresh-secret-for-sess_2' },
      });

      expect(rotated.sessionId).toBe('sess_2');
      expect(client.rotateCount).toBe(1);
      expect(await store.getSession('sess_2')).toMatchObject({ sessionId: 'sess_2' });
      expect(await store.getSession('sess_1')).toBeNull();
      expect(warn).toHaveBeenCalledTimes(1);
      const message = String(warn.mock.calls[0]?.[0] ?? '');
      expect(message).toContain('rotateSession');
      expect(message).not.toContain('refresh-secret-for-sess_2');
      expect(message).not.toContain('sess_2');
    },
  );

  describe.each(POST_COMMIT_OPERATIONS)('%s secret-independent diagnostics', (operation) => {
    it.each(maintenanceFailures)('omits $label and preserves the committed result', async ({ create }) => {
      const client = new MaintenanceFakeClient();
      const store = createRedisOidcVaultStore({ client, keyPrefix: 'test' });
      const source = await store.createSession(sessionInput('source-secret-id'));
      client.maintenanceFailure = create();
      client.failOn.add('SCAN');
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const nextSession = { ...source, ...sessionInput('target-secret-id') };

      const committed = await (operation === 'createSession'
        ? store.createSession(nextSession)
        : store.rotateSession({ sessionId: source.sessionId, nextSession }));

      expect(committed).toEqual(nextSession);
      expect(await store.getSession(nextSession.sessionId)).toEqual(committed);
      expect(await store.getSession(source.sessionId)).toEqual(operation === 'rotateSession' ? null : source);
      expect(client.writeCount).toBe(operation === 'createSession' ? 2 : 1);
      expect(client.rotateCount).toBe(operation === 'rotateSession' ? 1 : 0);
      // Assert every warning argument, so an attached raw cause cannot leak either.
      expect(warn.mock.calls).toEqual([
        [`OIDC vault Redis index maintenance failed after ${operation} and will retry on a later write.`],
      ]);
    });

    it('still rejects mutation-command failures without a maintenance warning', async () => {
      const client = new MaintenanceFakeClient();
      const store = createRedisOidcVaultStore({ client, keyPrefix: 'test' });
      const source = await store.createSession(sessionInput('sess_1'));
      const failure = new Error('injected mutation failure');
      const sendCommand = vi.spyOn(client, 'sendCommand').mockRejectedValueOnce(failure);
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const nextSession = { ...source, ...sessionInput('sess_2') };

      await expect(
        operation === 'createSession'
          ? store.createSession(nextSession)
          : store.rotateSession({ sessionId: source.sessionId, nextSession }),
      ).rejects.toBe(failure);

      expect(sendCommand).toHaveBeenCalledTimes(1);
      expect(sendCommand.mock.calls[0]?.[0][0]).toBe('EVALSHA');
      expect(warn).not.toHaveBeenCalled();
      expect(await store.getSession(source.sessionId)).toEqual(source);
      expect(await store.getSession(nextSession.sessionId)).toBeNull();
      expect(client.writeCount).toBe(1);
      expect(client.rotateCount).toBe(0);
    });
  });

  it('later maintenance recovers and prunes entries missed during a failed cleanup', async () => {
    const client = new MaintenanceFakeClient();
    client.injectStaleIndexMember('test:subject:user_stale', 'sess_stale', 500);
    const store = createRedisOidcVaultStore({ client, keyPrefix: 'test' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    client.failOn.add('TIME');
    await store.createSession(sessionInput('sess_1'));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(client.hasIndexMember('test:subject:user_stale', 'sess_stale')).toBe(true);

    client.failOn.clear();
    warn.mockClear();
    await store.createSession(sessionInput('sess_2'));

    expect(warn).not.toHaveBeenCalled();
    expect(client.hasIndexMember('test:subject:user_stale', 'sess_stale')).toBe(false);
    expect(client.zremRangeByScoreCalls).toBeGreaterThan(0);
    expect(await store.getSession('sess_1')).not.toBeNull();
    expect(await store.getSession('sess_2')).not.toBeNull();
  });

  it('mutation failures still reject and are not confused with maintenance warnings', async () => {
    const client = new MaintenanceFakeClient();
    const store = createRedisOidcVaultStore({ client, keyPrefix: 'test' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await store.createSession(sessionInput('sess_1'));
    await expect(store.createSession(sessionInput('sess_1'))).rejects.toThrow('already exists');
    await expect(store.rotateSession({ sessionId: 'missing', nextSession: sessionInput('sess_2') })).rejects.toThrow(
      'rotation',
    );
    expect(client.writeCount).toBe(1);
    expect(client.rotateCount).toBe(0);
    expect(warn).not.toHaveBeenCalled();
  });
});
