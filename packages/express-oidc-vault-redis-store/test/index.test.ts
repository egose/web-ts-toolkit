import { describe, expect, it } from 'vitest';

import { createRedisOidcVaultStore, type OidcVaultRedisClient } from '../src/index';

class FakeRedisClient implements OidcVaultRedisClient {
  private readonly records = new Map<string, { value: string; expiresAt?: number }>();
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
    const [command, key] = args;

    if (command !== 'GETDEL' || !key) {
      throw new Error(`Unsupported command: ${args.join(' ')}`);
    }

    this.pruneExpired(key);
    const value = this.records.get(key)?.value ?? null;

    if (value !== null) {
      this.records.delete(key);
    }

    return value;
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
    const store = createRedisOidcVaultStore({ client, keyPrefix: 'test' });

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

    expect(await store.deleteSessionsByProviderSessionId('provider_sid_1')).toBe(1);
    expect(await store.getSession('sess_3')).toBeNull();
    expect(await store.getSession('sess_4')).not.toBeNull();
    expect(await store.deleteSessionsBySubject('user_1')).toBe(1);
    expect(await store.getSession('sess_4')).toBeNull();
  });

  it('consumes transaction records once and respects expiration', async () => {
    const client = new FakeRedisClient();
    const store = createRedisOidcVaultStore({ client, keyPrefix: 'test' });

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
});
