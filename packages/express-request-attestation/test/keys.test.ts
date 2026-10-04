/**
 * ATT-05 key rotation tests (task sections 4.1/4.6).
 *
 * Covers owned snapshots, copy isolation, atomic replacement, remapping
 * rejection without an unbounded tombstone ledger, finite overlap, expired
 * current handling, and no timers/network at construction. Public HMAC
 * material stays accessible; rotation only bounds acceptance windows.
 */
import { describe, expect, it, vi } from 'vitest';

import { createRotatingKeyProvider, createStaticKeyProvider, generateAttestationKey } from '../src/keys.js';
import { AttestationProtocolError } from '../src/index.js';
import type { AttestationKeyEntry } from '../src/index.js';

const NOW = 1780000000000;

function keyBytes(fill: number): Uint8Array {
  const out = new Uint8Array(32);
  out.fill(fill);
  return out;
}

function entry(keyId: string, fill: number, acceptFrom: number, acceptUntil: number) {
  return { keyId, key: keyBytes(fill), acceptFrom, acceptUntil };
}

describe('generateAttestationKey', () => {
  it('creates a random 32-byte entry for an explicit window', () => {
    const first = generateAttestationKey('key-01', { acceptFrom: NOW - 1000, acceptUntil: NOW + 60000 });
    const second = generateAttestationKey('key-01', { acceptFrom: NOW - 1000, acceptUntil: NOW + 60000 });
    expect(first.keyId).toBe('key-01');
    expect(first.key).toBeInstanceOf(Uint8Array);
    expect(first.key.length).toBe(32);
    expect(first.acceptFrom).toBe(NOW - 1000);
    expect(first.acceptUntil).toBe(NOW + 60000);
    expect(Object.isFrozen(first)).toBe(true);
    // Random: two generations differ.
    expect(Array.from(first.key)).not.toEqual(Array.from(second.key));
  });

  it('rejects invalid identifiers and windows', () => {
    expect(() => generateAttestationKey('bad id!', { acceptFrom: 0, acceptUntil: 10 })).toThrow(
      AttestationProtocolError,
    );
    expect(() => generateAttestationKey('', { acceptFrom: 0, acceptUntil: 10 })).toThrow(AttestationProtocolError);
    expect(() => generateAttestationKey('key-01', { acceptFrom: 10, acceptUntil: 10 })).toThrow(
      AttestationProtocolError,
    );
    expect(() => generateAttestationKey('key-01', { acceptFrom: 20, acceptUntil: 10 })).toThrow(
      AttestationProtocolError,
    );
    expect(() => generateAttestationKey('key-01', { acceptFrom: -1, acceptUntil: 10 })).toThrow(
      AttestationProtocolError,
    );
    expect(() => generateAttestationKey('key-01', { acceptFrom: 0, acceptUntil: 10, extra: 1 } as never)).toThrow(
      AttestationProtocolError,
    );
    expect(() => generateAttestationKey(null as never, { acceptFrom: 0, acceptUntil: 10 })).toThrow(
      AttestationProtocolError,
    );
  });
});

describe('createStaticKeyProvider', () => {
  it('owns an immutable snapshot with copy isolation', async () => {
    const inputKey = keyBytes(7);
    const input = {
      currentKeyId: 'static-01',
      keys: [{ keyId: 'static-01', key: inputKey, acceptFrom: NOW - 60000, acceptUntil: NOW + 60000 }],
    };
    const provider = createStaticKeyProvider(input);
    // Mutate input bytes/array after construction: provider unaffected.
    inputKey.fill(0);
    (input.keys as unknown[]).push({ keyId: 'evil', key: keyBytes(9), acceptFrom: 0, acceptUntil: 10 });
    const first = await provider.getSnapshot();
    expect(first.currentKeyId).toBe('static-01');
    expect(first.keys).toHaveLength(1);
    expect(Array.from(first.keys[0]?.key as Uint8Array)).toEqual(Array.from(keyBytes(7)));

    // Mutate returned snapshot bytes: next read unaffected (byte aliasing).
    const returnedKey = first.keys[0]?.key as Uint8Array;
    returnedKey.fill(0);
    const second = await provider.getSnapshot();
    expect(Array.from(second.keys[0]?.key as Uint8Array)).toEqual(Array.from(keyBytes(7)));
    expect(second).not.toBe(first);
    expect(second.keys).not.toBe(first.keys);
    expect(second.keys[0]?.key as Uint8Array).not.toBe(first.keys[0]?.key);
  });

  it('rejects invalid, current-missing, duplicate, and oversized snapshots', () => {
    const good = entry('good-01', 1, NOW - 1000, NOW + 1000);
    expect(() => createStaticKeyProvider({ currentKeyId: 'good-01', keys: [] })).toThrow(AttestationProtocolError);
    expect(() =>
      createStaticKeyProvider({
        currentKeyId: 'good-01',
        keys: Array.from({ length: 17 }, (_, index) =>
          entry(`key-${String(index).padStart(2, '0')}`, index, NOW - 1000, NOW + 1000),
        ),
      }),
    ).toThrow(AttestationProtocolError);
    expect(() =>
      createStaticKeyProvider({
        currentKeyId: 'good-01',
        keys: [good, { ...good }],
      }),
    ).toThrow(AttestationProtocolError);
    expect(() =>
      createStaticKeyProvider({
        currentKeyId: 'missing-99',
        keys: [good],
      }),
    ).toThrow(AttestationProtocolError);
    expect(() =>
      createStaticKeyProvider({
        currentKeyId: 'good-01',
        keys: [{ keyId: 'good-01', key: new Uint8Array(31), acceptFrom: 0, acceptUntil: 10 }],
      }),
    ).toThrow(AttestationProtocolError);
    expect(() =>
      createStaticKeyProvider({
        currentKeyId: 'good-01',
        keys: [{ keyId: 'good-01', key: keyBytes(1), acceptFrom: 10, acceptUntil: 10 }],
      }),
    ).toThrow(AttestationProtocolError);
    expect(() => createStaticKeyProvider({ currentKeyId: 'good-01', keys: [good], extra: 1 } as never)).toThrow(
      AttestationProtocolError,
    );
    expect(() =>
      createStaticKeyProvider({
        currentKeyId: 'good-01',
        keys: [{ ...good, extra: 1 } as never],
      }),
    ).toThrow(AttestationProtocolError);
  });

  it('allows an expired current key at provider level (router enforces activity)', async () => {
    const provider = createStaticKeyProvider({
      currentKeyId: 'expired-01',
      keys: [entry('expired-01', 3, NOW - 120000, NOW - 60000)],
    });
    const snapshot = await provider.getSnapshot();
    expect(snapshot.currentKeyId).toBe('expired-01');
    expect(snapshot.keys).toHaveLength(1);
  });

  it('starts no timers or network work at construction', () => {
    const timeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const fetchSpy = typeof globalThis.fetch === 'function' ? vi.spyOn(globalThis, 'fetch') : null;
    try {
      createStaticKeyProvider({
        currentKeyId: 'timer-01',
        keys: [entry('timer-01', 4, NOW - 1000, NOW + 1000)],
      });
      expect(timeoutSpy).not.toHaveBeenCalled();
      expect(fetchSpy?.mock.calls ?? []).toHaveLength(0);
    } finally {
      timeoutSpy.mockRestore();
      fetchSpy?.mockRestore();
    }
  });
});

describe('createRotatingKeyProvider', () => {
  function initial() {
    return {
      currentKeyId: 'rot-01',
      keys: [entry('rot-01', 1, NOW - 60000, NOW + 60000)],
    };
  }

  it('supports explicit atomic replacement with overlap', async () => {
    const provider = createRotatingKeyProvider(initial());
    const oldKey = entry('rot-01', 1, NOW - 60000, NOW + 60000);
    const newKey = entry('rot-02', 2, NOW - 1000, NOW + 120000);
    provider.replace({
      currentKeyId: 'rot-02',
      keys: [oldKey, newKey],
    });
    const snapshot = await provider.getSnapshot();
    expect(snapshot.currentKeyId).toBe('rot-02');
    expect(snapshot.keys.map((k: AttestationKeyEntry) => k.keyId).sort()).toEqual(['rot-01', 'rot-02']);
    // Finite overlap: old entry preserves its explicit window (not extended).
    const retainedOld = snapshot.keys.find((k: AttestationKeyEntry) => k.keyId === 'rot-01');
    expect(retainedOld?.acceptFrom).toBe(NOW - 60000);
    expect(retainedOld?.acceptUntil).toBe(NOW + 60000);
  });

  it('rejects remapping retained IDs without changing the previous snapshot', async () => {
    const provider = createRotatingKeyProvider(initial());
    const before = await provider.getSnapshot();

    // Same ID, different bytes.
    expect(() =>
      provider.replace({
        currentKeyId: 'rot-01',
        keys: [entry('rot-01', 99, NOW - 60000, NOW + 60000)],
      }),
    ).toThrow(AttestationProtocolError);

    // Same ID, same bytes, different window (deadline extension resurrects proofs).
    expect(() =>
      provider.replace({
        currentKeyId: 'rot-01',
        keys: [entry('rot-01', 1, NOW - 60000, NOW + 999999)],
      }),
    ).toThrow(AttestationProtocolError);

    // Previous valid snapshot survives both rejections.
    const after = await provider.getSnapshot();
    expect(after.currentKeyId).toBe(before.currentKeyId);
    expect(after.keys).toHaveLength(before.keys.length);
    expect(Array.from(after.keys[0]?.key as Uint8Array)).toEqual(Array.from(before.keys[0]?.key as Uint8Array));
  });

  it('allows retirement and fresh IDs; rejects duplicate and oversized replacements', async () => {
    const provider = createRotatingKeyProvider({
      currentKeyId: 'rot-01',
      keys: [entry('rot-01', 1, NOW - 60000, NOW + 60000)],
    });
    // Retire rot-01, introduce rot-02: allowed.
    provider.replace({
      currentKeyId: 'rot-02',
      keys: [entry('rot-02', 2, NOW - 1000, NOW + 60000)],
    });
    expect((await provider.getSnapshot()).currentKeyId).toBe('rot-02');

    // No unbounded tombstone: reintroducing the retired ID is not rejected
    // by history (provisioners must still never reuse IDs with new material).
    provider.replace({
      currentKeyId: 'rot-01',
      keys: [entry('rot-01', 9, NOW - 1000, NOW + 60000)],
    });
    expect((await provider.getSnapshot()).currentKeyId).toBe('rot-01');

    // Duplicate IDs within the replacement.
    expect(() =>
      provider.replace({
        currentKeyId: 'rot-01',
        keys: [entry('rot-01', 9, NOW - 1000, NOW + 60000), entry('rot-01', 9, NOW - 1000, NOW + 60000)],
      }),
    ).toThrow(AttestationProtocolError);

    // Oversized replacement.
    expect(() =>
      provider.replace({
        currentKeyId: 'key-00',
        keys: Array.from({ length: 17 }, (_, index) =>
          entry(`key-${String(index).padStart(2, '0')}`, index, NOW - 1000, NOW + 1000),
        ),
      }),
    ).toThrow(AttestationProtocolError);

    // Current-missing replacement.
    expect(() =>
      provider.replace({
        currentKeyId: 'missing-99',
        keys: [entry('rot-01', 9, NOW - 1000, NOW + 60000)],
      }),
    ).toThrow(AttestationProtocolError);

    // Failed replacements leave the last valid snapshot intact.
    expect((await provider.getSnapshot()).currentKeyId).toBe('rot-01');
  });

  it('copies bytes on replace input and snapshot output', async () => {
    const provider = createRotatingKeyProvider(initial());
    const nextKey = keyBytes(5);
    provider.replace({
      currentKeyId: 'rot-02',
      keys: [
        entry('rot-01', 1, NOW - 60000, NOW + 60000),
        { keyId: 'rot-02', key: nextKey, acceptFrom: NOW - 1000, acceptUntil: NOW + 60000 },
      ],
    });
    nextKey.fill(0);
    const snapshot = await provider.getSnapshot();
    const stored = snapshot.keys.find((k: AttestationKeyEntry) => k.keyId === 'rot-02')?.key as Uint8Array;
    expect(Array.from(stored)).toEqual(Array.from(keyBytes(5)));
    stored.fill(0);
    const reread = (await provider.getSnapshot()).keys.find((k: AttestationKeyEntry) => k.keyId === 'rot-02')
      ?.key as Uint8Array;
    expect(Array.from(reread)).toEqual(Array.from(keyBytes(5)));
  });

  it('starts no timers or network work at construction or replace', () => {
    const timeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    try {
      const provider = createRotatingKeyProvider(initial());
      provider.replace({
        currentKeyId: 'rot-02',
        keys: [entry('rot-01', 1, NOW - 60000, NOW + 60000), entry('rot-02', 2, NOW - 1000, NOW + 60000)],
      });
      expect(timeoutSpy).not.toHaveBeenCalled();
    } finally {
      timeoutSpy.mockRestore();
    }
  });
});
