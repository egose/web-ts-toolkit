import { describe, expect, it } from 'vitest';
import { OidcVaultLogoutNavigationCapacityError } from '@web-ts-toolkit/express-oidc-vault';
import {
  defineOidcVaultLogoutNavigationStoreConformanceSuite,
  logoutTicket,
} from '../../express-oidc-vault/test/store-provider-conformance';
import { createMemoryOidcVaultStore } from '../src';

defineOidcVaultLogoutNavigationStoreConformanceSuite('memory', {
  createContext: (_name, options) => {
    let clock = 100;
    const store = createMemoryOidcVaultStore({ ...options, now: () => clock });
    return {
      store,
      peerStore: store,
      now: () => clock,
      advanceTo: (value) => {
        clock = value;
      },
    };
  },
});

describe('memory dedicated ticket bounds', () => {
  it.each([null, 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects capacity %s', (max) => {
    expect(() => createMemoryOidcVaultStore({ logoutNavigationMaxEntries: max as number })).toThrow(
      'positive safe integer',
    );
  });

  it('defaults to exactly 10000 physical entries independently of replay', async () => {
    const store = createMemoryOidcVaultStore({ now: () => 100 });
    for (let i = 0; i < 10_000; i++) await store.createLogoutNavigationTicket(logoutTicket(100, `${i}`));
    await expect(store.createLogoutNavigationTicket(logoutTicket(100, 'full'))).rejects.toBeInstanceOf(
      OidcVaultLogoutNavigationCapacityError,
    );
    expect(await store.consumeLogoutNavigationTicket(logoutTicket(100, '0'))).not.toBeNull();
    await store.createLogoutNavigationTicket(logoutTicket(100, 'replacement'));
  });

  it('bounded cleanup includes 64 unrelated expiries plus selected, with no heap tombstones on arbitrary removals', async () => {
    let now = 100;
    const store = createMemoryOidcVaultStore({ now: () => now, logoutNavigationMaxEntries: 256 });
    const internals = store as unknown as { logoutTickets: { tickets: Map<string, unknown>; expiryHeap: unknown[] } };
    for (let i = 0; i < 200; i++)
      await store.createLogoutNavigationTicket({ ...logoutTicket(now, `${i}`), expiresAt: 1100 });
    const live = logoutTicket(now, 'live');
    await store.createLogoutNavigationTicket(live);
    now = 1100;
    expect(await store.consumeLogoutNavigationTicket(logoutTicket(100, '199'))).toBeNull();
    expect(internals.logoutTickets.tickets.size).toBe(136);
    expect(internals.logoutTickets.expiryHeap).toHaveLength(136);
    expect(await store.consumeLogoutNavigationTicket(live)).toEqual(live);
    expect(internals.logoutTickets.expiryHeap).toHaveLength(71);
    for (let i = 0; i < 1000; i++) {
      const record = logoutTicket(now, `new-${i}`);
      await store.createLogoutNavigationTicket(record);
      expect(await store.consumeLogoutNavigationTicket(record)).toEqual(record);
      expect(internals.logoutTickets.expiryHeap).toHaveLength(internals.logoutTickets.tickets.size);
    }
    expect(internals.logoutTickets.expiryHeap).toHaveLength(0);
  });

  it.each([NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER, -8_640_000_000_000_001])(
    'clock failure %s throws and preserves capacity/authority',
    async (invalid) => {
      let now = 100;
      const store = createMemoryOidcVaultStore({ now: () => now, logoutNavigationMaxEntries: 1 });
      const record = logoutTicket(now);
      await store.createLogoutNavigationTicket(record);
      now = invalid;
      await expect(store.consumeLogoutNavigationTicket(record)).rejects.toThrow('clock');
      await expect(store.createLogoutNavigationTicket(record)).rejects.toThrow('clock');
      now = 100;
      expect(await store.consumeLogoutNavigationTicket(record)).toEqual(record);
    },
  );
});
