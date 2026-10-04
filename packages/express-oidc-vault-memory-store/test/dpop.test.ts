import { describe, expect, it, vi } from 'vitest';
import { createOidcVaultMiddleware, OidcVaultDpopReplayCapacityError } from '@web-ts-toolkit/express-oidc-vault';
import type { OidcVaultDeviceBindingStoreProvider, OidcVaultDpopBinding } from '@web-ts-toolkit/express-oidc-vault';
import { createMemoryOidcVaultStore } from '../src';

const binding: OidcVaultDpopBinding = { type: 'dpop', jkt: 'A'.repeat(43) };
const hash = 'C'.repeat(42) + 'A';
const transaction = {
  state: 'state',
  nonce: 'nonce',
  pkceVerifier: 'v',
  codeChallenge: 'c',
  createdAt: 100,
  expiresAt: 200,
};
type Internals = {
  sessions: Map<string, unknown>;
  authorizationTransactions: Map<string, unknown>;
  exchangeCodes: Map<string, unknown>;
  rotatedSessionAliases: Map<string, unknown>;
  dpopProofs: {
    reservations: Map<string, { replayKey: string; expiresAt: number; index: number }>;
    expiryHeap: Array<{ replayKey: string; expiresAt: number; index: number }>;
  };
};

describe('memory DPoP corruption and bounded expiry', () => {
  it.each([null, 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid capacity %s at construction',
    (max) => {
      expect(() => createMemoryOidcVaultStore({ dpopReplayMaxEntries: max as number })).toThrow(
        'positive safe integer',
      );
    },
  );

  it('uses all six real capabilities when constructing an opt-in vault', async () => {
    const store: OidcVaultDeviceBindingStoreProvider = createMemoryOidcVaultStore();
    for (const method of [
      'getAuthorizationTransaction',
      'consumeAuthorizationTransactionIfMatches',
      'getExchangeCode',
      'consumeExchangeCodeIfMatches',
      'getSessionRevocationContext',
      'reserveDpopProof',
    ] as const) {
      expect(typeof store[method]).toBe('function');
    }
    expect(() =>
      createOidcVaultMiddleware({
        storeProvider: store,
        backendOrigin: 'https://api.example.com',
        deviceBinding: { mode: 'optional' },
        config: { issuer: 'https://issuer.example.com', clientId: 'client' },
      }),
    ).not.toThrow();
  });

  for (const kind of ['transaction', 'exchange'] as const) {
    it(`${kind} never exposes malformed/null security data as legacy credentials`, async () => {
      const store = createMemoryOidcVaultStore({ now: () => 100 });
      const internals = store as unknown as Internals;
      const map = kind === 'transaction' ? internals.authorizationTransactions : internals.exchangeCodes;
      const base =
        kind === 'transaction' ? transaction : { code: 'state', sessionId: 'session', createdAt: 100, expiresAt: 200 };
      for (const fields of [
        { deviceBinding: null },
        { browserBindingHash: null },
        { deviceBinding: binding },
        { deviceBinding: { ...binding, jkt: 'B'.repeat(43) }, browserBindingHash: hash },
        { deviceBinding: { ...binding, alg: 'ES256' }, browserBindingHash: hash },
        { deviceBinding: binding, browserBindingHash: 'invalid' },
      ]) {
        for (const method of ['read', 'legacy', 'guarded'] as const) {
          map.set('state', { ...base, ...fields });
          const result =
            kind === 'transaction'
              ? method === 'read'
                ? await store.getAuthorizationTransaction('state')
                : method === 'legacy'
                  ? await store.consumeAuthorizationTransaction('state')
                  : await store.consumeAuthorizationTransactionIfMatches({
                      state: 'state',
                      match: { deviceBinding: null, browserBindingHash: null },
                    })
              : method === 'read'
                ? await store.getExchangeCode('state')
                : method === 'legacy'
                  ? await store.consumeExchangeCode('state')
                  : await store.consumeExchangeCodeIfMatches({
                      code: 'state',
                      expectedSessionId: 'session',
                      match: { deviceBinding: null, browserBindingHash: null },
                    });
          expect(result).toBeNull();
        }
      }
    });
  }

  it('malformed current binding cannot make a historical alias unbound or rotate its source', async () => {
    const store = createMemoryOidcVaultStore({ now: () => 100 });
    const source = await store.createSession({
      sessionId: 'old',
      subject: 'user',
      refreshToken: 'r',
      idToken: 'i',
      deviceBinding: binding,
    });
    const current = await store.rotateSession({ sessionId: 'old', nextSession: { ...source, sessionId: 'current' } });
    const internals = store as unknown as Internals;
    for (const deviceBinding of [
      null,
      { type: 'dpop', jkt: 'bad' },
      {
        ...binding,
        privateKey: 'secret', // pragma: allowlist secret
      },
    ]) {
      internals.sessions.set('current', { ...current, deviceBinding });
      expect(await store.getSession('current')).toBeNull();
      await expect(store.getSessionRevocationContext('old')).rejects.toThrow();
      await expect(store.getSessionRevocationContext('current')).rejects.toThrow();
      await expect(
        store.rotateSession({ sessionId: 'current', nextSession: { ...current, sessionId: 'next' } }),
      ).rejects.toThrow();
      expect(internals.sessions.has('current')).toBe(true);
      expect(internals.sessions.has('next')).toBe(false);
    }
  });

  it('bounds cleanup to 64 expiry nodes and never visits unrelated session/alias maps per proof', async () => {
    let now = 100;
    const store = createMemoryOidcVaultStore({ now: () => now, dpopReplayMaxEntries: 256 });
    const internals = store as unknown as Internals;
    const visits = [
      vi.spyOn(internals.sessions, 'values'),
      vi.spyOn(internals.sessions, 'entries'),
      vi.spyOn(internals.rotatedSessionAliases, 'values'),
      vi.spyOn(internals.rotatedSessionAliases, 'entries'),
    ];
    for (let index = 0; index < 256; index += 1) {
      expect(await store.reserveDpopProof({ replayKey: `expired-${index}`, expiresAt: 200 })).toBe(true);
    }
    now = 200;
    expect(await store.reserveDpopProof({ replayKey: 'live', expiresAt: 300 })).toBe(true);
    expect(internals.dpopProofs.reservations.size).toBe(193);
    expect(internals.dpopProofs.expiryHeap).toHaveLength(193);
    for (const visit of visits) expect(visit).not.toHaveBeenCalled();
  });

  it('keeps one heap entry per key during churn, including targeted expired-key removal and capacity recovery', async () => {
    let now = 100;
    const store = createMemoryOidcVaultStore({ now: () => now, dpopReplayMaxEntries: 4 });
    const internals = store as unknown as Internals;
    for (let round = 0; round < 100; round += 1) {
      for (let index = 0; index < 4; index += 1)
        expect(await store.reserveDpopProof({ replayKey: `key-${index}`, expiresAt: now + 1 + index })).toBe(true);
      await expect(store.reserveDpopProof({ replayKey: 'extra', expiresAt: now + 100 })).rejects.toBeInstanceOf(
        OidcVaultDpopReplayCapacityError,
      );
      expect(internals.dpopProofs.expiryHeap).toHaveLength(4);
      for (const [index, row] of internals.dpopProofs.expiryHeap.entries()) {
        expect(row.index).toBe(index);
        expect(internals.dpopProofs.reservations.get(row.replayKey)).toBe(row);
        if (index > 0)
          expect(internals.dpopProofs.expiryHeap[Math.floor((index - 1) / 2)]!.expiresAt).toBeLessThanOrEqual(
            row.expiresAt,
          );
      }
      now += 5;
    }
    // Independent memory objects intentionally do not share replay state.
    const other = createMemoryOidcVaultStore({ now: () => now, dpopReplayMaxEntries: 1 });
    expect(await other.reserveDpopProof({ replayKey: 'key-0', expiresAt: now + 100 })).toBe(true);
  });

  it('maintains expiry ordering under deterministic randomized admission and expiry churn', async () => {
    let now = 100;
    let seed = 7;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed;
    };
    const store = createMemoryOidcVaultStore({ now: () => now, dpopReplayMaxEntries: 16 });
    const expected = new Map<string, number>();
    const internals = store as unknown as Internals;
    for (let operation = 0; operation < 1000; operation += 1) {
      now += random() % 4;
      for (const [key, expiry] of expected) if (expiry <= now) expected.delete(key);
      const replayKey = `key-${random() % 24}`;
      const expiresAt = now + 1 + (random() % 30);
      if (expected.has(replayKey)) expect(await store.reserveDpopProof({ replayKey, expiresAt })).toBe(false);
      else if (expected.size === 16)
        await expect(store.reserveDpopProof({ replayKey, expiresAt })).rejects.toBeInstanceOf(
          OidcVaultDpopReplayCapacityError,
        );
      else {
        expect(await store.reserveDpopProof({ replayKey, expiresAt })).toBe(true);
        expected.set(replayKey, expiresAt);
      }
      const { reservations, expiryHeap } = internals.dpopProofs;
      expect(expiryHeap.length).toBe(reservations.size);
      expect(reservations.size).toBeLessThanOrEqual(16);
      for (const [index, row] of expiryHeap.entries()) {
        expect(row.index).toBe(index);
        expect(reservations.get(row.replayKey)).toBe(row);
        if (index > 0) expect(expiryHeap[Math.floor((index - 1) / 2)]!.expiresAt).toBeLessThanOrEqual(row.expiresAt);
      }
      for (const [key, expiry] of expected) expect(reservations.get(key)?.expiresAt).toBe(expiry);
    }
  });
});
