/**
 * ATT-03 memory replay-store tests: the shared conformance suite plus
 * memory-specific boundaries (independent objects do not coordinate, heap
 * garbage bounds, option/input snapshotting, construction validation, and no
 * timers of any kind).
 */

import { describe, expect, it, vi } from 'vitest';

import {
  AttestationCapacityError,
  AttestationProtocolError,
  createMemoryAttestationStore,
  GLOBAL_MAX_RETENTION_MS,
} from '../src/index.js';
import {
  defineAttestationStoreConformanceSuite,
  type AttestationStoreConformanceContext,
} from './store-conformance.js';

const BASE_NOW = 1_700_000_000_000;

type MemoryReservationRow = {
  readonly replayKey: string;
  readonly retainUntilMs: number;
  index: number;
};

type MemoryInternals = {
  readonly reservations: Map<string, MemoryReservationRow>;
  readonly expiryHeap: MemoryReservationRow[];
};

function internalsOf(store: unknown): MemoryInternals {
  return store as unknown as MemoryInternals;
}

defineAttestationStoreConformanceSuite('memory', (_testName, options) => {
  let now = BASE_NOW;
  const store = createMemoryAttestationStore({
    ...(options?.maxEntries === undefined ? {} : { maxEntries: options.maxEntries }),
    now: () => now,
  });
  const context: AttestationStoreConformanceContext = {
    store,
    getNow: () => now,
    setNow: (next: number) => {
      now = next;
    },
    debugSizes: () => {
      const internals = internalsOf(store);
      return { stored: internals.reservations.size, indexed: internals.expiryHeap.length };
    },
  };
  return context;
});

describe('memory attestation store boundaries', () => {
  it.each([null, 0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, '3'])(
    'rejects invalid capacity %s at construction',
    (maxEntries) => {
      expect(() => createMemoryAttestationStore({ maxEntries: maxEntries as number })).toThrow(
        AttestationProtocolError,
      );
    },
  );

  it.each(['clock', 123, null])('rejects invalid clock %s at construction', (now) => {
    expect(() => createMemoryAttestationStore({ now: now as unknown as () => number })).toThrow(
      AttestationProtocolError,
    );
  });

  it('rejects unknown options and non-object options at construction', () => {
    expect(() => createMemoryAttestationStore({ unknownOption: 1 } as never)).toThrow(AttestationProtocolError);
    expect(() => createMemoryAttestationStore(null as never)).toThrow(AttestationProtocolError);
    expect(() => createMemoryAttestationStore([] as never)).toThrow(AttestationProtocolError);
    expect(() => createMemoryAttestationStore()).not.toThrow();
    expect(() => createMemoryAttestationStore(undefined)).not.toThrow();
  });

  it.each([Number.NaN, -1, 1.5, Number.POSITIVE_INFINITY])(
    'rejects invalid clock value %s at reserve time',
    async (badNow) => {
      const store = createMemoryAttestationStore({ now: () => badNow });
      await expect(
        store.reserve({ replayKey: 'att:v1:bad-clock-value', retainUntilMs: BASE_NOW + 10_000 }),
      ).rejects.toBeInstanceOf(AttestationProtocolError);
    },
  );

  it('snapshots construction options; later caller mutation has no effect', async () => {
    const now = BASE_NOW;
    const options: { maxEntries?: number; now?: () => number } = {
      maxEntries: 1,
      now: () => now,
    };
    const store = createMemoryAttestationStore(options);
    options.maxEntries = 100_000;
    options.now = () => 0;
    expect(await store.reserve({ replayKey: 'att:v1:snapshot-one', retainUntilMs: now + 10_000 })).toBe('reserved');
    // Still capacity 1 and still the original clock, despite the mutation.
    await expect(
      store.reserve({ replayKey: 'att:v1:snapshot-two', retainUntilMs: now + 10_000 }),
    ).rejects.toBeInstanceOf(AttestationCapacityError);
    // A deadline in the past for the original clock (but the future for the
    // replaced `() => 0`) still reports expired: the replacement never took.
    expect(await store.reserve({ replayKey: 'att:v1:snapshot-clock', retainUntilMs: 5_000 })).toBe('expired');
  });

  it('independent memory objects intentionally do not coordinate', async () => {
    const first = createMemoryAttestationStore({ now: () => BASE_NOW });
    const second = createMemoryAttestationStore({ now: () => BASE_NOW });
    const input = { replayKey: 'att:v1:unshared', retainUntilMs: BASE_NOW + 10_000 };
    expect(await first.reserve(input)).toBe('reserved');
    // Documented boundary: sharing is one store object in one process.
    expect(await second.reserve(input)).toBe('reserved');
    expect(await first.reserve(input)).toBe('duplicate');
  });

  it('duplicates never grow heap garbage, including at capacity', async () => {
    const store = createMemoryAttestationStore({ maxEntries: 2, now: () => BASE_NOW });
    const internals = internalsOf(store);
    expect(await store.reserve({ replayKey: 'att:v1:heap-a', retainUntilMs: BASE_NOW + 10_000 })).toBe('reserved');
    for (let round = 0; round < 200; round += 1) {
      expect(await store.reserve({ replayKey: 'att:v1:heap-a', retainUntilMs: BASE_NOW + 20_000 })).toBe('duplicate');
    }
    expect(internals.reservations.size).toBe(1);
    expect(internals.expiryHeap).toHaveLength(1);
    expect(await store.reserve({ replayKey: 'att:v1:heap-b', retainUntilMs: BASE_NOW + 10_000 })).toBe('reserved');
    await expect(
      store.reserve({ replayKey: 'att:v1:heap-c', retainUntilMs: BASE_NOW + 10_000 }),
    ).rejects.toBeInstanceOf(AttestationCapacityError);
    for (let round = 0; round < 100; round += 1) {
      expect(await store.reserve({ replayKey: 'att:v1:heap-a', retainUntilMs: BASE_NOW + 10_000 })).toBe('duplicate');
      expect(await store.reserve({ replayKey: 'att:v1:heap-b', retainUntilMs: BASE_NOW + 10_000 })).toBe('duplicate');
    }
    expect(internals.reservations.size).toBe(2);
    expect(internals.expiryHeap).toHaveLength(2);
  });

  it('keeps one heap entry per key during churn with targeted expired-key removal', async () => {
    let now = BASE_NOW;
    const store = createMemoryAttestationStore({ maxEntries: 4, now: () => now });
    const internals = internalsOf(store);
    const assertHeapInvariant = (): void => {
      expect(internals.expiryHeap).toHaveLength(internals.reservations.size);
      internals.expiryHeap.forEach((row, index) => {
        expect(row.index).toBe(index);
        expect(internals.reservations.get(row.replayKey)).toBe(row);
        if (index > 0) {
          expect(
            (internals.expiryHeap[Math.floor((index - 1) / 2)] as MemoryReservationRow).retainUntilMs,
          ).toBeLessThanOrEqual(row.retainUntilMs);
        }
      });
    };
    for (let round = 0; round < 50; round += 1) {
      for (let index = 0; index < 4; index += 1) {
        expect(
          await store.reserve({
            replayKey: `att:v1:churn-${index}`,
            retainUntilMs: now + 1 + index,
          }),
        ).toBe('reserved');
      }
      // Duplicates extend nothing and allocate no heap nodes.
      for (let index = 0; index < 4; index += 1) {
        expect(
          await store.reserve({
            replayKey: `att:v1:churn-${index}`,
            retainUntilMs: now + 1_000,
          }),
        ).toBe('duplicate');
      }
      await expect(store.reserve({ replayKey: 'att:v1:churn-extra', retainUntilMs: now + 100 })).rejects.toBeInstanceOf(
        AttestationCapacityError,
      );
      expect(internals.expiryHeap).toHaveLength(4);
      assertHeapInvariant();
      now += 5;
    }
  });

  it('accepts the task-text retainUntil alias with canonical precedence', async () => {
    const store = createMemoryAttestationStore({ now: () => BASE_NOW });
    expect(
      await store.reserve({
        replayKey: 'att:v1:alias',
        retainUntil: BASE_NOW + 10_000,
      } as never),
    ).toBe('reserved');
    expect(
      await store.reserve({
        replayKey: 'att:v1:alias-both',
        retainUntilMs: BASE_NOW + 10_000,
        retainUntil: BASE_NOW,
      } as never),
    ).toBe('reserved');
  });

  it('enforces exact millisecond boundaries with a deterministic clock', async () => {
    // Exact CAP / CAP+1, now+1, and expiry-equality edges. The shared suite
    // uses margins here to stay robust against live server TIME; this
    // deterministic-clock test pins the exact contract (section 4.4).
    expect(GLOBAL_MAX_RETENTION_MS).toBe(240_000);
    let now = BASE_NOW;
    const store = createMemoryAttestationStore({ now: () => now });
    expect(await store.reserve({ replayKey: 'att:v1:exact-cap', retainUntilMs: now + GLOBAL_MAX_RETENTION_MS })).toBe(
      'reserved',
    );
    await expect(
      store.reserve({ replayKey: 'att:v1:exact-cap-over', retainUntilMs: now + GLOBAL_MAX_RETENTION_MS + 1 }),
    ).rejects.toBeInstanceOf(AttestationProtocolError);
    expect(await store.reserve({ replayKey: 'att:v1:min-future', retainUntilMs: now + 1 })).toBe('reserved');
    expect(await store.reserve({ replayKey: 'att:v1:equality', retainUntilMs: now })).toBe('expired');
    // Duplicate at the exact original deadline does not extend it: advancing
    // to exactly the first deadline expires the reservation.
    const replayKey = 'att:v1:exact-no-extend';
    expect(await store.reserve({ replayKey, retainUntilMs: now + 10_000 })).toBe('reserved');
    expect(await store.reserve({ replayKey, retainUntilMs: now + 20_000 })).toBe('duplicate');
    now += 10_000;
    expect(await store.reserve({ replayKey, retainUntilMs: now + 10_000 })).toBe('reserved');
  });

  it('uses no timers of any kind', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    try {
      const store = createMemoryAttestationStore({ now: () => BASE_NOW });
      expect(await store.reserve({ replayKey: 'att:v1:no-timers', retainUntilMs: BASE_NOW + 10_000 })).toBe('reserved');
      expect(setIntervalSpy).not.toHaveBeenCalled();
      expect(setTimeoutSpy).not.toHaveBeenCalled();
    } finally {
      setIntervalSpy.mockRestore();
      setTimeoutSpy.mockRestore();
    }
  });
});
