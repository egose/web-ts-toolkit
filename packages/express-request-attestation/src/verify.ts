/**
 * ATT-02 pure request verification (task sections 4.2-4.5).
 *
 * No replay allocation, no network, no timers, no Express response writing.
 * The middleware orchestrates the stage order:
 *
 * 1. bounded single-header extraction + codec envelope validation,
 * 2. owned key-snapshot validation/copy + active-key lookup,
 * 3. validated time/deadline + actual request-target/content-type/body digest,
 * 4. HMAC-SHA-256 comparison with `timingSafeEqual` on fixed-length bytes.
 *
 * Time is rechecked by the middleware after async provider work, immediately
 * before reservation, and before calling the handler after reservation
 * (section 4.4). This module exposes `checkProofTiming` for those repeats so
 * every check uses the same single formula.
 *
 * Error mapping uses only section 4.5 fixed `{ code, message }` values via
 * `AttestationError`. No raw key, nonce, signature, body, provider error, or
 * requested key identifier is echoed, and no `WWW-Authenticate` header is
 * produced here (the middleware sends responses).
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { assertTimestampMs, base64urlDecode } from './shared/canonical.js';
import {
  buildMacInputBytes,
  buildReplayKeyPreimageBytes,
  canonicalizeRequestTarget,
  decodeTransactionId,
  extractSingleHeaderValue,
  normalizeContentType,
  normalizeMethod,
  validateBodyHashHex,
  validateKeyBytes,
  validateKeyId,
} from './shared/codec.js';
import { evaluateProofTiming } from './shared/time-policy.js';
import { AttestationProtocolError, EMPTY_BODY_SHA256_HEX, REPLAY_KEY_PREFIX } from './shared/types.js';
import type { ProofTiming, ResolvedTimePolicy } from './shared/types.js';
import { AttestationError } from './errors.js';
import type { AttestationErrorCode, AttestationKeyEntry, AttestationKeySnapshot } from './server-types.js';

export { EMPTY_BODY_SHA256_HEX };

export interface AttestationVerifyInput {
  readonly headerValue: string | readonly string[] | undefined;
  readonly method: unknown;
  readonly originalUrl: unknown;
  readonly publicPathPrefix?: string;
  readonly contentTypeHeader: string | readonly string[] | undefined | null;
  readonly contentEncodingHeader: string | readonly string[] | undefined | null;
  readonly bodyDigestHex: unknown;
  readonly snapshot: AttestationKeySnapshot;
  readonly nowMs: number;
  readonly policy: ResolvedTimePolicy;
  readonly replayNamespace: string;
  readonly publicOrigin: string;
}

export interface AttestationVerifiedProof {
  readonly keyId: string;
  readonly timestampMs: number;
  readonly nonceHex: string;
  readonly keyEntry: AttestationKeyEntry;
  readonly timing: ProofTiming;
  readonly replayKey: string;
  readonly retainUntilMs: number;
  readonly method: string;
  readonly requestTarget: string;
  readonly contentType: string;
  readonly bodyHashHex: string;
}

function fail(code: AttestationErrorCode): never {
  throw new AttestationError(code);
}

/** Validate + copy-isolate a provider snapshot. Malformed => KEYS_UNAVAILABLE. */
export function copyAttestationSnapshot(snapshot: unknown): AttestationKeySnapshot {
  try {
    if (snapshot === null || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      throw new AttestationProtocolError('key snapshot must be an object');
    }
    const record = snapshot as { readonly currentKeyId?: unknown; readonly keys?: unknown };
    validateKeyId(record.currentKeyId);
    if (!Array.isArray(record.keys)) {
      throw new AttestationProtocolError('key snapshot keys must be an array');
    }
    if (record.keys.length === 0 || record.keys.length > 16) {
      throw new AttestationProtocolError('key snapshot must retain 1-16 keys');
    }
    const seen = new Set<string>();
    const copied = (record.keys as unknown[]).map((entry: unknown) => {
      if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new AttestationProtocolError('key snapshot entry must be an object');
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
      const key = new Uint8Array(row.key as Uint8Array);
      return Object.freeze({ keyId, key, acceptFrom, acceptUntil });
    });
    if (!seen.has(record.currentKeyId as string)) {
      throw new AttestationProtocolError('key snapshot currentKeyId must name a present entry');
    }
    const currentKeyId = record.currentKeyId as string;
    return Object.freeze({ currentKeyId, keys: Object.freeze(copied) });
  } catch (error) {
    if (error instanceof AttestationError) {
      throw error;
    }
    fail('ATTESTATION_KEYS_UNAVAILABLE');
  }
}

/** Re-evaluate timing for a known key entry. Throws fixed FUTURE/EXPIRED/STALE. */
export function checkProofTiming(input: {
  readonly timestampMs: number;
  readonly nowMs: number;
  readonly keyEntry: Pick<AttestationKeyEntry, 'acceptFrom' | 'acceptUntil'>;
  readonly policy: ResolvedTimePolicy;
}): ProofTiming {
  let timing: ProofTiming;
  try {
    timing = evaluateProofTiming({
      timestampMs: input.timestampMs,
      nowMs: input.nowMs,
      acceptFrom: input.keyEntry.acceptFrom,
      acceptUntil: input.keyEntry.acceptUntil,
      policy: input.policy,
    });
  } catch (error) {
    if (error instanceof AttestationError) {
      throw error;
    }
    fail('ATTESTATION_INTERNAL_ERROR');
  }
  const decision = timing.decision;
  if (decision === 'valid') {
    return timing;
  }
  if (decision === 'future') {
    fail('ATTESTATION_FUTURE');
  }
  if (decision === 'expired') {
    fail('ATTESTATION_EXPIRED');
  }
  fail('ATTESTATION_STALE_KEY');
}

/** Concatenate the trusted prefix with `originalUrl` and canonicalize. */
export function resolveRequestTarget(originalUrl: unknown, publicPathPrefix: string): string {
  try {
    if (typeof originalUrl !== 'string' || originalUrl.length === 0) {
      throw new AttestationProtocolError('request target must be a non-empty string');
    }
    const full = `${publicPathPrefix}${originalUrl}`;
    return canonicalizeRequestTarget(full);
  } catch (error) {
    if (error instanceof AttestationError) {
      throw error;
    }
    fail('ATTESTATION_MALFORMED');
  }
}

/** Single final Content-Type value. Duplicate/controls => MALFORMED. */
export function resolveContentType(header: string | readonly string[] | undefined | null): string {
  try {
    if (header === undefined || header === null) {
      return '';
    }
    if (Array.isArray(header)) {
      if (header.length === 0) {
        return '';
      }
      if (header.length > 1) {
        throw new AttestationProtocolError('duplicate content-type headers are not allowed');
      }
      return normalizeContentType(header[0]);
    }
    return normalizeContentType(header);
  } catch (error) {
    if (error instanceof AttestationError) {
      throw error;
    }
    fail('ATTESTATION_MALFORMED');
  }
}

/** V1 accepts identity / absent Content-Encoding only. */
export function assertAllowedContentEncoding(header: string | readonly string[] | undefined | null): void {
  if (header === undefined || header === null) {
    return;
  }
  const values: unknown[] = Array.isArray(header) ? [...header] : [header];
  const tokens: string[] = [];
  for (const value of values) {
    if (typeof value !== 'string') {
      fail('ATTESTATION_MALFORMED');
    }
    for (const token of (value as string).split(',')) {
      const trimmed = token.trim();
      if (trimmed === '') {
        continue;
      }
      tokens.push(trimmed.toLowerCase());
    }
  }
  for (const token of tokens) {
    if (token !== 'identity') {
      fail('ATTESTATION_UNSUPPORTED_ENCODING');
    }
  }
}

function resolveBodyDigest(digest: unknown): string {
  try {
    validateBodyHashHex(digest);
    return digest as string;
  } catch (error) {
    if (error instanceof AttestationError) {
      throw error;
    }
    fail('ATTESTATION_INTERNAL_ERROR');
  }
}

/** Opaque replay key `att:v1:` + SHA-256 of `[namespace, origin, nonceHex]`. */
export function deriveReplayKey(input: {
  readonly replayNamespace: string;
  readonly publicOrigin: string;
  readonly nonceHex: string;
}): string {
  const preimage = buildReplayKeyPreimageBytes(input);
  const digest = createHash('sha256').update(preimage).digest('hex');
  return `${REPLAY_KEY_PREFIX}${digest}`;
}

/**
 * Pure pre-reservation verification. Performs header/codec, snapshot lookup,
 * time, target, content-type/encoding, body digest, and HMAC stages in order
 * and returns the owned timing + replay key for the middleware to reserve.
 */
export function verifyAttestationProof(input: AttestationVerifyInput): AttestationVerifiedProof {
  let headerValue: string | null;
  try {
    headerValue = extractSingleHeaderValue(input.headerValue);
  } catch {
    fail('ATTESTATION_MALFORMED');
  }
  if (headerValue === null) {
    fail('ATTESTATION_MISSING');
  }

  let envelope: {
    readonly keyId: string;
    readonly timestampMs: number;
    readonly nonceHex: string;
    readonly mac: string;
  };
  try {
    envelope = decodeTransactionId(headerValue);
  } catch {
    fail('ATTESTATION_MALFORMED');
  }

  const snapshot = copyAttestationSnapshot(input.snapshot);
  const keyEntry = snapshot.keys.find((entry) => entry.keyId === envelope.keyId);
  if (keyEntry === undefined) {
    fail('ATTESTATION_STALE_KEY');
  }

  try {
    assertTimestampMs('nowMs', input.nowMs);
  } catch {
    fail('ATTESTATION_INTERNAL_ERROR');
  }
  const timing = checkProofTiming({
    timestampMs: envelope.timestampMs,
    nowMs: input.nowMs,
    keyEntry: keyEntry as AttestationKeyEntry,
    policy: input.policy,
  });

  const requestTarget = resolveRequestTarget(input.originalUrl, input.publicPathPrefix ?? '');

  let method: string;
  try {
    method = normalizeMethod(input.method);
  } catch {
    fail('ATTESTATION_MALFORMED');
  }

  assertAllowedContentEncoding(input.contentEncodingHeader);
  const contentType = resolveContentType(input.contentTypeHeader);
  const bodyHashHex = resolveBodyDigest(input.bodyDigestHex);

  let macInput: Uint8Array;
  try {
    macInput = buildMacInputBytes({
      replayNamespace: input.replayNamespace,
      publicOrigin: input.publicOrigin,
      keyId: envelope.keyId,
      timestampMs: envelope.timestampMs,
      nonceHex: envelope.nonceHex,
      method,
      requestTarget,
      contentType,
      bodyHashHex,
    });
  } catch (error) {
    if (error instanceof AttestationError) {
      throw error;
    }
    fail('ATTESTATION_INTERNAL_ERROR');
  }

  let presented: Uint8Array;
  try {
    presented = base64urlDecode(envelope.mac);
  } catch {
    fail('ATTESTATION_MALFORMED');
  }
  if (presented.length !== 32) {
    fail('ATTESTATION_INVALID_SIGNATURE');
  }
  const expected = createHmac('sha256', Buffer.from((keyEntry as AttestationKeyEntry).key))
    .update(macInput as Uint8Array)
    .digest();
  const presentedBuf = Buffer.from(presented);
  if (presentedBuf.length !== expected.length || !timingSafeEqual(presentedBuf, expected)) {
    fail('ATTESTATION_INVALID_SIGNATURE');
  }

  let replayKey: string;
  try {
    replayKey = deriveReplayKey({
      replayNamespace: input.replayNamespace,
      publicOrigin: input.publicOrigin,
      nonceHex: envelope.nonceHex,
    });
  } catch (error) {
    if (error instanceof AttestationError) {
      throw error;
    }
    fail('ATTESTATION_INTERNAL_ERROR');
  }

  const retainUntilMs = timing.retainUntilMs;
  if (retainUntilMs === null || !Number.isSafeInteger(retainUntilMs)) {
    fail('ATTESTATION_EXPIRED');
  }

  return Object.freeze({
    keyId: envelope.keyId,
    timestampMs: envelope.timestampMs,
    nonceHex: envelope.nonceHex,
    keyEntry: keyEntry as AttestationKeyEntry,
    timing,
    replayKey: replayKey as string,
    retainUntilMs: retainUntilMs as number,
    method: method as string,
    requestTarget,
    contentType,
    bodyHashHex,
  });
}
