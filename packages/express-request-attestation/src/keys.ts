/**
 * ATT-05 owned key rotation (task sections 4.1/4.6).
 *
 * - `generateAttestationKey(keyId, { acceptFrom, acceptUntil })` creates one
 *   random 32-byte entry for an explicit acceptance window.
 * - `createStaticKeyProvider(snapshot)` owns an immutable snapshot.
 * - `createRotatingKeyProvider(snapshot)` supports explicit atomic
 *   `replace(snapshot)`; external cron/KMS/config code owns provisioning and
 *   refresh. No default polling timer, no hardcoded grace policy.
 *
 * Snapshot rules (section 4.1):
 *
 * - Snapshots have `currentKeyId` plus a bounded list of 1-16 entries
 *   `{ keyId, key: Uint8Array(32), acceptFrom, acceptUntil }`.
 * - Key bytes are exactly 32 bytes; times are nonnegative safe-integer epoch
 *   milliseconds with `acceptFrom < acceptUntil`; identifiers match
 *   `[A-Za-z0-9_-]{1,64}`.
 * - `currentKeyId` must name a present entry. Snapshots are owned and
 *   copy-isolated: input bytes are copied on entry, output bytes are copied
 *   on every `getSnapshot()`, so later caller mutation (including in-place
 *   `Uint8Array` writes) cannot change provider state and provider state
 *   cannot be mutated through a returned snapshot.
 * - Key IDs are unique across the application's provisioning history.
 *   Providers reject remapping an ID that is present in their retained
 *   snapshot (same ID with different bytes or a different acceptance
 *   interval) without growing an unbounded historical ID ledger. Generate
 *   unique version/random identifiers and never reintroduce a retired ID with
 *   different material. Atomic replacement controls subsequent snapshots; it
 *   is not cancellation of requests already using an owned preflight
 *   snapshot.
 * - Rejected replacements leave the previous valid snapshot intact
 *   (atomic). Provider/read failure is operational `503` at the verifier,
 *   never a stale-key client error (see `verify.ts`).
 *
 * Runbook (finite acceptance, application-configured):
 *
 * - Prepare new material on **all** verifiers, publish current
 *   metadata/module, retain old material to its explicit deadline, retire
 *   only after overlap requirements. Do not make one instance the
 *   authoritative random-key generator for an uncoordinated cluster.
 * - Finite acceptance/grace is application-configured, not automatically
 *   `2 x rotation interval`.
 *
 * Public HMAC material delivered in JavaScript stays accessible to every
 * caller despite rotation; rotation limits how long old material is
 * accepted, it does not stop a caller from downloading the next version.
 *
 * No import-time network requests, timers, key generation, or storage
 * access. Construction performs no I/O (`sideEffects: false`).
 */

import { randomBytes } from 'node:crypto';

import { assertTimestampMs } from './shared/canonical.js';
import { validateKeyBytes, validateKeyId } from './shared/codec.js';
import { AttestationProtocolError } from './shared/types.js';
import type {
  AttestationKeyEntry,
  AttestationKeyProvider,
  AttestationKeySnapshot,
  AttestationKeySnapshotInput,
  AttestationRotatingKeyProvider,
} from './server-types.js';

/** Maximum retained keys per snapshot (section 4.1). */
export const MAX_RETAINED_ATTESTATION_KEYS = 16 as const;

const SNAPSHOT_OPTION_KEYS: ReadonlySet<string> = new Set(['currentKeyId', 'keys']);
const KEY_ENTRY_KEYS: ReadonlySet<string> = new Set(['keyId', 'key', 'acceptFrom', 'acceptUntil']);
const KEY_WINDOW_KEYS: ReadonlySet<string> = new Set(['acceptFrom', 'acceptUntil']);

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function copyKeyEntry(entry: AttestationKeyEntry): AttestationKeyEntry {
  const keyCopy = new Uint8Array(entry.key);
  return Object.freeze({
    keyId: entry.keyId,
    key: keyCopy,
    acceptFrom: entry.acceptFrom,
    acceptUntil: entry.acceptUntil,
  });
}

function copySnapshot(snapshot: AttestationKeySnapshot): AttestationKeySnapshot {
  const keys = snapshot.keys.map(copyKeyEntry);
  return Object.freeze({
    currentKeyId: snapshot.currentKeyId,
    keys: Object.freeze(keys),
  });
}

/**
 * Validate a snapshot input shape. Throws `AttestationProtocolError` on any
 * invalid, current-missing, duplicate-ID, or oversized snapshot. Does not
 * check remapping against a previous snapshot; rotating replacement adds
 * that check atomically after this shape check passes.
 */
function assertValidSnapshotShape(snapshot: unknown): asserts snapshot is AttestationKeySnapshotInput {
  if (snapshot === null || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new AttestationProtocolError('key snapshot must be an object');
  }
  for (const key of Object.keys(snapshot)) {
    if (!SNAPSHOT_OPTION_KEYS.has(key)) {
      throw new AttestationProtocolError(`unknown key snapshot option ${key}`);
    }
  }
  const record = snapshot as { readonly currentKeyId?: unknown; readonly keys?: unknown };
  validateKeyId(record.currentKeyId);
  if (!Array.isArray(record.keys)) {
    throw new AttestationProtocolError('key snapshot keys must be an array');
  }
  if (record.keys.length === 0 || record.keys.length > MAX_RETAINED_ATTESTATION_KEYS) {
    throw new AttestationProtocolError(`key snapshot must retain 1-${MAX_RETAINED_ATTESTATION_KEYS} keys`);
  }
  const seen = new Set<string>();
  for (const entry of record.keys) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new AttestationProtocolError('key snapshot entry must be an object');
    }
    for (const key of Object.keys(entry)) {
      if (!KEY_ENTRY_KEYS.has(key)) {
        throw new AttestationProtocolError(`unknown key snapshot entry option ${key}`);
      }
    }
    const row = entry as {
      readonly keyId?: unknown;
      readonly key?: unknown;
      readonly acceptFrom?: unknown;
      readonly acceptUntil?: unknown;
    };
    validateKeyId(row.keyId);
    validateKeyBytes(row.key);
    assertTimestampMs('acceptFrom', row.acceptFrom);
    assertTimestampMs('acceptUntil', row.acceptUntil);
    const acceptFrom = row.acceptFrom as number;
    const acceptUntil = row.acceptUntil as number;
    if (acceptFrom >= acceptUntil) {
      throw new AttestationProtocolError('key acceptance window must satisfy acceptFrom < acceptUntil');
    }
    const keyId = row.keyId as string;
    if (seen.has(keyId)) {
      throw new AttestationProtocolError('key snapshot keyIds must be unique');
    }
    seen.add(keyId);
  }
  if (!seen.has(record.currentKeyId as string)) {
    throw new AttestationProtocolError('key snapshot currentKeyId must name a present entry');
  }
}

/** Copy-isolate a validated input snapshot (deep byte copy, frozen). */
function ownSnapshot(input: AttestationKeySnapshotInput): AttestationKeySnapshot {
  assertValidSnapshotShape(input);
  const keys = (input.keys as readonly AttestationKeyEntry[]).map((entry) =>
    Object.freeze({
      keyId: entry.keyId,
      key: new Uint8Array(entry.key),
      acceptFrom: entry.acceptFrom,
      acceptUntil: entry.acceptUntil,
    }),
  );
  return Object.freeze({
    currentKeyId: input.currentKeyId,
    keys: Object.freeze(keys),
  });
}

/**
 * Create one random 32-byte key entry for an explicit acceptance window.
 * Uses `node:crypto` randomness; the returned entry owns its bytes (frozen).
 */
export function generateAttestationKey(
  keyId: string,
  window: { readonly acceptFrom: number; readonly acceptUntil: number },
): AttestationKeyEntry {
  validateKeyId(keyId);
  if (window === null || typeof window !== 'object' || Array.isArray(window)) {
    throw new AttestationProtocolError('key window must be an object');
  }
  for (const key of Object.keys(window)) {
    if (!KEY_WINDOW_KEYS.has(key)) {
      throw new AttestationProtocolError(`unknown key window option ${key}`);
    }
  }
  assertTimestampMs('acceptFrom', window.acceptFrom);
  assertTimestampMs('acceptUntil', window.acceptUntil);
  if (window.acceptFrom >= window.acceptUntil) {
    throw new AttestationProtocolError('key acceptance window must satisfy acceptFrom < acceptUntil');
  }
  const key = new Uint8Array(randomBytes(32));
  return Object.freeze({
    keyId,
    key,
    acceptFrom: window.acceptFrom,
    acceptUntil: window.acceptUntil,
  });
}

/**
 * Create an immutable static key provider. The input snapshot is copied on
 * entry; every `getSnapshot()` returns a fresh owned copy. No timers,
 * network, or storage work occurs at construction or on reads.
 */
export function createStaticKeyProvider(snapshot: AttestationKeySnapshotInput): AttestationKeyProvider {
  const owned = ownSnapshot(snapshot);
  const provider: AttestationKeyProvider = {
    getSnapshot(): AttestationKeySnapshot {
      return copySnapshot(owned);
    },
  };
  return Object.freeze(provider);
}

/**
 * Create an explicit-replacement rotating key provider. `replace(snapshot)`
 * validates the new snapshot shape first, then rejects atomically when any
 * ID retained in the current snapshot would be remapped to different bytes
 * or a different acceptance interval; the previous valid snapshot survives
 * rejected replacements. Retirement (dropping an ID) and introduction of
 * fresh IDs are allowed. No historical tombstone ledger is kept: an ID that
 * is no longer retained may be reintroduced, but provisioners must never
 * reintroduce a retired ID with different material (generate unique
 * version/random identifiers).
 */
export function createRotatingKeyProvider(snapshot: AttestationKeySnapshotInput): AttestationRotatingKeyProvider {
  let current = ownSnapshot(snapshot);

  function checkRemappingPreserved(previous: AttestationKeySnapshot, next: AttestationKeySnapshotInput): void {
    const previousById = new Map<string, AttestationKeyEntry>();
    for (const entry of previous.keys) {
      previousById.set(entry.keyId, entry);
    }
    for (const entry of next.keys) {
      const prior = previousById.get(entry.keyId);
      if (prior === undefined) {
        continue;
      }
      const nextKey = entry.key as Uint8Array;
      if (!bytesEqual(prior.key, nextKey)) {
        throw new AttestationProtocolError(
          `key snapshot must not remap retained keyId ${entry.keyId} to different key material`,
        );
      }
      if (prior.acceptFrom !== entry.acceptFrom || prior.acceptUntil !== entry.acceptUntil) {
        throw new AttestationProtocolError(
          `key snapshot must not remap retained keyId ${entry.keyId} to a different acceptance window`,
        );
      }
    }
  }

  const provider: AttestationRotatingKeyProvider = {
    getSnapshot(): AttestationKeySnapshot {
      return copySnapshot(current);
    },
    replace(next: AttestationKeySnapshotInput): void {
      assertValidSnapshotShape(next);
      checkRemappingPreserved(current, next);
      current = ownSnapshot(next);
    },
  };
  return Object.freeze(provider);
}
