/**
 * ATT-03 reusable attestation replay-store admission contract (task section 4.4).
 *
 * Backend-agnostic: covers reserved/duplicate/expired, malformed inputs, the
 * 240000 ms global retention cap, the minimal-future edge, expiry equality,
 * capacity with duplicate precedence, requested expired-key reuse, input
 * mutation isolation, simultaneous single-winner admission, bounded expiry
 * cleanup, and no interval timers. No HTTP, browser, or provider dependencies.
 *
 * The future ATT-04 Redis adapter runs this same suite against live Redis; its
 * factory context supplies isolated key prefixes per test. Memory supplies an
 * injectable clock plus an optional `debugSizes` hook for the exact 64-removal
 * bound; backends without that hook still verify behavioral recovery.
 */

import { describe, expect, it, vi } from 'vitest';

import { AttestationCapacityError, AttestationProtocolError, GLOBAL_MAX_RETENTION_MS } from '../src/index.js';
import type { AttestationStore } from '../src/index.js';

export interface AttestationStoreConformanceContext {
  readonly store: AttestationStore;
  getNow: () => number;
  setNow: (now: number) => void;
  /**
   * Optional test hook reporting live stored/indexed reservation counts.
   * Enables the exact at-most-64-removals assertion; backends without it
   * verify behavioral recovery instead.
   */
  debugSizes?: () => { readonly stored: number; readonly indexed: number };
}

export interface AttestationStoreConformanceOptions {
  readonly maxEntries?: number;
}

export function defineAttestationStoreConformanceSuite(
  providerName: string,
  createContext: (
    testName: string,
    options?: AttestationStoreConformanceOptions,
  ) => AttestationStoreConformanceContext | Promise<AttestationStoreConformanceContext>,
): void {
  const BASE_NOW = 1_700_000_000_000;
  const testKey = (name: string): string => `att:v1:conformance-${name}`;

  describe(`${providerName} attestation store conformance`, () => {
    it('reserves a fresh key once and reports duplicates without extending state', async () => {
      const context = await createContext('reserved-duplicate');
      const now = context.getNow();
      const replayKey = testKey('fresh');
      expect(await context.store.reserve({ replayKey, retainUntilMs: now + 10_000 })).toBe('reserved');
      expect(await context.store.reserve({ replayKey, retainUntilMs: now + 20_000 })).toBe('duplicate');
      expect(await context.store.reserve({ replayKey, retainUntilMs: now + 10_000 })).toBe('duplicate');
      expect(await context.store.reserve({ replayKey: testKey('fresh-other'), retainUntilMs: now + 10_000 })).toBe(
        'reserved',
      );
    });

    it('returns expired for no-longer-live deadlines without allocating', async () => {
      const context = await createContext('expired-no-alloc');
      const now = context.getNow();
      const replayKey = testKey('expired');
      expect(await context.store.reserve({ replayKey, retainUntilMs: now })).toBe('expired');
      expect(await context.store.reserve({ replayKey, retainUntilMs: now - 1 })).toBe('expired');
      // No allocation happened: the same key with a valid deadline is fresh.
      expect(await context.store.reserve({ replayKey, retainUntilMs: now + 10_000 })).toBe('reserved');
    });

    it('returns expired for an expired input even when the key is live', async () => {
      const context = await createContext('expired-input-live-key');
      const now = context.getNow();
      const replayKey = testKey('live-then-expired-input');
      expect(await context.store.reserve({ replayKey, retainUntilMs: now + 10_000 })).toBe('reserved');
      expect(await context.store.reserve({ replayKey, retainUntilMs: now })).toBe('expired');
      // The live reservation is untouched: a valid re-reserve is still a duplicate.
      expect(await context.store.reserve({ replayKey, retainUntilMs: now + 10_000 })).toBe('duplicate');
    });

    it('a duplicate does not extend expiry', async () => {
      const context = await createContext('duplicate-no-extension');
      const start = context.getNow();
      const replayKey = testKey('no-extension');
      expect(await context.store.reserve({ replayKey, retainUntilMs: start + 10_000 })).toBe('reserved');
      expect(await context.store.reserve({ replayKey, retainUntilMs: start + 20_000 })).toBe('duplicate');
      // Past the original deadline the reservation is gone; the duplicate's
      // later deadline never took effect, so this is fresh. The +2s margin
      // keeps this deterministic against live server TIME (exact-ms equality
      // is covered by the memory-only exact-boundary test); expiry equality
      // itself is asserted in the expired-input cases below.
      context.setNow(start + 12_000);
      expect(await context.store.reserve({ replayKey, retainUntilMs: start + 20_000 })).toBe('reserved');
    });

    it('rejects malformed replay keys without allocating', async () => {
      const context = await createContext('malformed-keys');
      const now = context.getNow();
      const badKeys: unknown[] = [
        '',
        'a'.repeat(257),
        'has\nnewline',
        'has\ttab',
        'has\x7fdel',
        'has\x00control',
        'non-ascii-é',
        null,
        undefined,
        42,
        {},
        [],
      ];
      for (const replayKey of badKeys) {
        await expect(
          context.store.reserve({ replayKey: replayKey as string, retainUntilMs: now + 10_000 }),
          `replayKey ${String(replayKey)}`,
        ).rejects.toBeInstanceOf(AttestationProtocolError);
      }
      for (const badInput of [null, undefined, 'key', 42, []] as unknown[]) {
        await expect(context.store.reserve(badInput as never), `input ${String(badInput)}`).rejects.toBeInstanceOf(
          AttestationProtocolError,
        );
      }
      // Nothing was allocated: a valid reservation still works afterwards.
      expect(await context.store.reserve({ replayKey: testKey('after-malformed'), retainUntilMs: now + 10_000 })).toBe(
        'reserved',
      );
    });

    it('rejects malformed deadlines without allocating or clamping', async () => {
      const context = await createContext('malformed-deadlines');
      const now = context.getNow();
      const badDeadlines: unknown[] = [
        undefined,
        null,
        'soon',
        Number.NaN,
        Number.POSITIVE_INFINITY,
        -1,
        10.5,
        Number.MAX_SAFE_INTEGER + 1,
      ];
      for (const retainUntilMs of badDeadlines) {
        await expect(
          context.store.reserve({
            replayKey: testKey(`bad-deadline-${String(retainUntilMs)}`),
            retainUntilMs: retainUntilMs as number,
          }),
          `retainUntilMs ${String(retainUntilMs)}`,
        ).rejects.toBeInstanceOf(AttestationProtocolError);
      }
      // Overlong deadlines reject instead of clamping, with no allocation: the
      // same key is immediately reservable with a valid deadline. The +10s
      // margin keeps this robust against live server TIME drift between the
      // `getNow()` reading and Lua admission (exact CAP+1 is covered by the
      // memory-only exact-boundary test).
      const replayKey = testKey('overlong-then-valid');
      await expect(
        context.store.reserve({ replayKey, retainUntilMs: now + GLOBAL_MAX_RETENTION_MS + 10_000 }),
      ).rejects.toBeInstanceOf(AttestationProtocolError);
      expect(await context.store.reserve({ replayKey, retainUntilMs: now + 10_000 })).toBe('reserved');
    });

    it('enforces the global retention cap exactly, without truncating', async () => {
      const context = await createContext('retention-cap');
      const now = context.getNow();
      // Margins keep admission deterministic against live server TIME (the
      // exact CAP / CAP+1 boundary is covered by the memory-only
      // exact-boundary test with a deterministic clock).
      expect(
        await context.store.reserve({
          replayKey: testKey('cap-exact'),
          retainUntilMs: now + GLOBAL_MAX_RETENTION_MS - 10_000,
        }),
      ).toBe('reserved');
      await expect(
        context.store.reserve({
          replayKey: testKey('cap-over'),
          retainUntilMs: now + GLOBAL_MAX_RETENTION_MS + 10_000,
        }),
      ).rejects.toBeInstanceOf(AttestationProtocolError);
      await expect(
        context.store.reserve({
          replayKey: testKey('cap-far'),
          retainUntilMs: now + 10_000_000,
        }),
      ).rejects.toBeInstanceOf(AttestationProtocolError);
      expect(GLOBAL_MAX_RETENTION_MS).toBe(240_000);
    });

    it('accepts the minimal future edge and treats expiry equality as expired', async () => {
      const context = await createContext('future-edge-equality');
      const now = context.getNow();
      // +2s stays safely live across reserve latency against live server TIME
      // (the exact now+1 edge is covered by the memory-only exact-boundary
      // test). Equality is safe in both directions: time only moves forward.
      expect(await context.store.reserve({ replayKey: testKey('min-future'), retainUntilMs: now + 2_000 })).toBe(
        'reserved',
      );
      expect(await context.store.reserve({ replayKey: testKey('equality'), retainUntilMs: now })).toBe('expired');
    });

    it('at capacity, duplicates still win and no live entry is evicted', async () => {
      const context = await createContext('capacity-duplicate-wins', { maxEntries: 2 });
      const now = context.getNow();
      expect(await context.store.reserve({ replayKey: testKey('cap-a'), retainUntilMs: now + 10_000 })).toBe(
        'reserved',
      );
      expect(await context.store.reserve({ replayKey: testKey('cap-b'), retainUntilMs: now + 10_000 })).toBe(
        'reserved',
      );
      await expect(
        context.store.reserve({ replayKey: testKey('cap-c'), retainUntilMs: now + 10_000 }),
      ).rejects.toBeInstanceOf(AttestationCapacityError);
      // Duplicate-first: live duplicates beat capacity exhaustion.
      expect(await context.store.reserve({ replayKey: testKey('cap-a'), retainUntilMs: now + 10_000 })).toBe(
        'duplicate',
      );
      expect(await context.store.reserve({ replayKey: testKey('cap-b'), retainUntilMs: now + 10_000 })).toBe(
        'duplicate',
      );
      // The rejected admission evicted nothing and allocated nothing.
      await expect(
        context.store.reserve({ replayKey: testKey('cap-c'), retainUntilMs: now + 10_000 }),
      ).rejects.toBeInstanceOf(AttestationCapacityError);
    });

    it('reuses expired keys for fresh proofs and recovers capacity', async () => {
      const context = await createContext('expired-reuse-recovery', { maxEntries: 2 });
      const start = context.getNow();
      const replayKey = testKey('reusable');
      expect(await context.store.reserve({ replayKey, retainUntilMs: start + 1_000 })).toBe('reserved');
      expect(await context.store.reserve({ replayKey: testKey('other'), retainUntilMs: start + 2_000 })).toBe(
        'reserved',
      );
      // +2s past the latest deadline: both reservations have elapsed and
      // fresh proofs for the same keys are admitted again. The margin keeps
      // this deterministic against live server TIME.
      context.setNow(start + 4_000);
      expect(await context.store.reserve({ replayKey, retainUntilMs: start + 12_000 })).toBe('reserved');
      expect(
        await context.store.reserve({
          replayKey: testKey('other'),
          retainUntilMs: start + 12_000,
        }),
      ).toBe('reserved');
      expect(await context.store.reserve({ replayKey, retainUntilMs: start + 12_000 })).toBe('duplicate');
    });

    it('admits exactly one winner for simultaneous identical reservations', async () => {
      const context = await createContext('simultaneous-winner');
      const now = context.getNow();
      const replayKey = testKey('race');
      const retainUntilMs = now + 10_000;
      const results = await Promise.all(
        Array.from({ length: 8 }, () => context.store.reserve({ replayKey, retainUntilMs })),
      );
      expect(results.filter((result) => result === 'reserved')).toHaveLength(1);
      expect(results.filter((result) => result === 'duplicate')).toHaveLength(7);
    });

    it('isolates reserve inputs from later caller mutation', async () => {
      const context = await createContext('input-isolation');
      const now = context.getNow();
      const input: { replayKey: string; retainUntilMs: number } = {
        replayKey: testKey('isolated'),
        retainUntilMs: now + 10_000,
      };
      const pending = context.store.reserve(input);
      input.replayKey = testKey('mutated-away');
      input.retainUntilMs = 0;
      await expect(pending).resolves.toBe('reserved');
      // The admission used the pre-mutation values.
      expect(await context.store.reserve({ replayKey: testKey('isolated'), retainUntilMs: now + 10_000 })).toBe(
        'duplicate',
      );
      expect(
        await context.store.reserve({
          replayKey: testKey('mutated-away'),
          retainUntilMs: now + 10_000,
        }),
      ).toBe('reserved');
    });

    it('reclaims at most 64 expired entries per admission', async () => {
      const context = await createContext('bounded-cleanup', { maxEntries: 200 });
      const start = context.getNow();
      const deadline = start + 5_000;
      for (let index = 0; index < 200; index += 1) {
        expect(await context.store.reserve({ replayKey: testKey(`bulk-${index}`), retainUntilMs: deadline })).toBe(
          'reserved',
        );
      }
      // +2s past the bulk deadline so every bulk entry is observably expired
      // against live server TIME (exact-ms equality is covered by memory-only
      // tests with a deterministic clock).
      context.setNow(deadline + 2_000);
      expect(
        await context.store.reserve({ replayKey: testKey('live-after-sweep'), retainUntilMs: deadline + 5_000 }),
      ).toBe('reserved');
      if (context.debugSizes !== undefined) {
        // One admission reclaims at most 64 expired entries plus the requested
        // key (fresh here, so exactly 64): 200 - 64 + 1 remain stored/indexed.
        const sizes = context.debugSizes();
        expect(sizes.stored).toBe(200 - 64 + 1);
        expect(sizes.indexed).toBe(sizes.stored);
      } else {
        // Without internals: recovery still works and the live key is held.
        expect(
          await context.store.reserve({
            replayKey: testKey('live-after-sweep'),
            retainUntilMs: deadline + 5_000,
          }),
        ).toBe('duplicate');
        expect(
          await context.store.reserve({
            replayKey: testKey('recovery'),
            retainUntilMs: deadline + 5_000,
          }),
        ).toBe('reserved');
      }
    });

    it('creates no interval timers', async () => {
      const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
      try {
        const context = await createContext('no-timers');
        const now = context.getNow();
        const replayKey = testKey('untimed');
        expect(await context.store.reserve({ replayKey, retainUntilMs: now + 10_000 })).toBe('reserved');
        expect(await context.store.reserve({ replayKey, retainUntilMs: now + 10_000 })).toBe('duplicate');
        expect(setIntervalSpy).not.toHaveBeenCalled();
      } finally {
        setIntervalSpy.mockRestore();
      }
    });

    it('rejects an invalid store clock without allocating', async () => {
      const context = await createContext('invalid-clock');
      context.setNow(Number.NaN);
      await expect(
        context.store.reserve({ replayKey: testKey('bad-clock'), retainUntilMs: BASE_NOW + 10_000 }),
      ).rejects.toBeInstanceOf(AttestationProtocolError);
    });
  });
}
