import { createHash } from 'node:crypto';

import type { Request } from 'express';
import { calculateJwkThumbprint, compactVerify, importJWK, type JWK } from 'jose';

import {
  isCanonicalDpopJkt,
  isDpopAlgorithm,
  type ResolvedOidcVaultDeviceBindingOptions,
} from './device-binding-policy';
import { DPOP_NONCE_MAX_BYTES } from './dpop-nonce';
import type { DpopProofVerificationResult } from './dpop-replay';
import { normalizeDpopProofTarget } from './dpop-target';
import { OidcVaultHttpError } from './errors';
import type { OidcVaultDpopAlgorithm } from './types';

export const DPOP_PROOF_MAX_BYTES = 8192;
export const DPOP_PROTECTED_HEADER_MAX_BYTES = 2048;

export interface DpopRawHeader {
  readonly count: number;
  readonly value?: string;
}

/** Capture raw multiplicity and the first value before any mutable async adapter. */
export const readDpopRawHeader = (req: Pick<Request, 'rawHeaders'>, name: string): DpopRawHeader => {
  const normalizedName = name.toLowerCase();
  let count = 0;
  let value: string | undefined;
  for (let index = 0; index < req.rawHeaders.length; index += 2) {
    if (req.rawHeaders[index].toLowerCase() !== normalizedName) continue;
    if (++count === 1) value = req.rawHeaders[index + 1];
    // Two is already ambiguous; never allocate an array of repeated values.
    if (count === 2) break;
  }
  return Object.freeze({ count, value });
};

const invalidProof = (diagnostic: string, cause?: unknown): OidcVaultHttpError => {
  const error = new OidcVaultHttpError(
    401,
    'OIDC_VAULT_INVALID_DPOP_PROOF',
    diagnostic,
    'DPoP proof validation failed.',
  );
  if (cause !== undefined) Object.defineProperty(error, 'cause', { value: cause, configurable: true });
  return error;
};

/** Raw duplicates/comma joins and wire size are rejected before any key import. */
export const extractDpopProof = (header: DpopRawHeader): string | undefined => {
  if (header.count === 0) return undefined;
  const { value } = header;
  if (
    header.count !== 1 ||
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > DPOP_PROOF_MAX_BYTES ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)
  ) {
    throw invalidProof('DPoP header must contain one bounded compact signed proof.');
  }
  return value;
};

const decodeBase64url = (value: string, maxBytes: number): Buffer => {
  if (!value || value.length > Math.ceil((maxBytes * 4) / 3) || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw invalidProof('DPoP base64url input exceeds its bound or has invalid encoding.');
  }
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.length > maxBytes || bytes.toString('base64url') !== value)
    throw invalidProof('DPoP base64url input is not canonical.');
  return bytes;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;

/** Iterative, byte-bounded duplicate-name scan; no request-controlled recursion. */
const parseObject = (bytes: Uint8Array): Record<string, unknown> => {
  try {
    const json = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const value: unknown = JSON.parse(json);
    if (!isPlainObject(value)) throw new TypeError('DPoP JSON must be an object.');
    const stack: Array<{ keys: Set<string> | null; expectsKey: boolean }> = [];
    for (let index = 0; index < json.length; index++) {
      const character = json[index];
      if (character === '{' || character === '[') {
        stack.push({ keys: character === '{' ? new Set() : null, expectsKey: character === '{' });
      } else if (character === '}' || character === ']') {
        stack.pop();
      } else if (character === ',') {
        const container = stack[stack.length - 1];
        if (container?.keys) container.expectsKey = true;
      } else if (character === '"') {
        const start = index++;
        for (; index < json.length; index++) {
          if (json[index] === '\\') index++;
          else if (json[index] === '"') break;
        }
        const container = stack[stack.length - 1];
        if (container?.keys && container.expectsKey) {
          const key: string = JSON.parse(json.slice(start, index + 1));
          if (container.keys.has(key)) throw new TypeError('DPoP JSON has duplicate member names.');
          container.keys.add(key);
          container.expectsKey = false;
        }
      }
    }
    return value;
  } catch (cause) {
    throw invalidProof('DPoP JSON encoding or object shape is invalid.', cause);
  }
};

const publicJwk = (value: unknown, alg: OidcVaultDpopAlgorithm): JWK => {
  if (!isPlainObject(value) || Buffer.byteLength(JSON.stringify(value), 'utf8') > DPOP_PROTECTED_HEADER_MAX_BYTES) {
    throw invalidProof('DPoP JWK must be a bounded public object.');
  }
  const allowed =
    alg === 'ES256'
      ? ['kty', 'crv', 'x', 'y', 'alg', 'use', 'key_ops', 'kid']
      : ['kty', 'n', 'e', 'alg', 'use', 'key_ops', 'kid'];
  if (
    Object.keys(value).some((key) => !allowed.includes(key)) ||
    (value.alg !== undefined && value.alg !== alg) ||
    (value.use !== undefined && value.use !== 'sig') ||
    (value.kid !== undefined && typeof value.kid !== 'string') ||
    (value.key_ops !== undefined &&
      (!Array.isArray(value.key_ops) || value.key_ops.length !== 1 || value.key_ops[0] !== 'verify'))
  ) {
    throw invalidProof('DPoP JWK contains private, remote, unsupported or incompatible key parameters.');
  }
  if (alg === 'ES256') {
    if (
      value.kty !== 'EC' ||
      value.crv !== 'P-256' ||
      typeof value.x !== 'string' ||
      typeof value.y !== 'string' ||
      decodeBase64url(value.x, 32).length !== 32 ||
      decodeBase64url(value.y, 32).length !== 32
    ) {
      throw invalidProof('DPoP ES256 requires a public P-256 key with canonical coordinates.');
    }
  } else {
    if (value.kty !== 'RSA' || typeof value.n !== 'string' || typeof value.e !== 'string') {
      throw invalidProof('DPoP RSA requires public modulus and exponent.');
    }
    // Bound BOTH unsigned integers before import. Exponents cannot exceed the
    // allowed modulus; no arbitrary-size bignum reaches the crypto provider.
    const modulus = decodeBase64url(value.n, 512);
    const exponent = decodeBase64url(value.e, 512);
    const bits = (modulus.length - 1) * 8 + 32 - Math.clz32(modulus[0]);
    if (
      modulus[0] === 0 ||
      bits < 2048 ||
      bits > 4096 ||
      exponent[0] === 0 ||
      (exponent[exponent.length - 1] & 1) === 0 ||
      (exponent.length === 1 && exponent[0] < 3) ||
      exponent.length > modulus.length ||
      (exponent.length === modulus.length && Buffer.compare(exponent, modulus) >= 0)
    ) {
      throw invalidProof(
        'DPoP RSA public parameters must use a 2048–4096-bit modulus and a valid bounded odd exponent.',
      );
    }
  }
  return value as JWK;
};

/**
 * Internal RFC 9449 verifier shared by API and later vault POST handlers.
 * Header/JWK/wire bounds run before key import; payload parsing and every claim
 * check follow cryptographic signature verification. accessToken is API-only
 * (requires ath); omit it for vault login/exchange/refresh/logout. expectedJkt
 * comes from VERIFIED token/record authority; omission permits login selection
 * or an optional unbound vault proof, never enrollment of an existing record.
 * This is read-only: compose inside replayPolicy.verifyAndReserve and perform
 * target/cookie/identity preflight before that callback returns. The shared
 * replay policy owns the final age window, nonce challenge and reservation.
 */
export const verifyDpopProof = async (input: {
  readonly proof: string;
  readonly method: string;
  readonly targetUrl: string;
  readonly proofOptions: ResolvedOidcVaultDeviceBindingOptions;
  readonly expectedJkt?: string;
  readonly accessToken?: string;
}): Promise<DpopProofVerificationResult> => {
  // Capture scalar authority/allowlist before asynchronous import/verification.
  const { proof, method, targetUrl, proofOptions, expectedJkt, accessToken } = input;
  const algorithms = [...proofOptions.algorithms];
  extractDpopProof({ count: 1, value: proof });
  const [encodedHeader, encodedPayload, encodedSignature] = proof.split('.');
  const header = parseObject(decodeBase64url(encodedHeader, DPOP_PROTECTED_HEADER_MAX_BYTES));
  // Canonical bounded segments only; do not parse/trust payload before signature.
  decodeBase64url(encodedPayload, DPOP_PROOF_MAX_BYTES);
  const signature = decodeBase64url(encodedSignature, 512);
  const { alg } = header;
  if (
    header.typ !== 'dpop+jwt' ||
    !isDpopAlgorithm(alg) ||
    !algorithms.includes(alg) ||
    ['crit', 'b64', 'jku', 'x5u', 'x5c', 'x5t', 'x5t#S256'].some((key) => Object.hasOwn(header, key))
  ) {
    throw invalidProof('DPoP protected header has an unsupported type, algorithm or key/critical extension.');
  }
  const jwk = publicJwk(header.jwk, alg);
  const signatureBytes = alg === 'ES256' ? 64 : decodeBase64url(jwk.n!, 512).length;
  if (signature.length !== signatureBytes)
    throw invalidProof('DPoP signature length does not match the allowed key profile.');
  let payload: Uint8Array;
  try {
    const key = await importJWK(jwk, alg);
    ({ payload } = await compactVerify(proof, key, { algorithms }));
  } catch (cause) {
    throw invalidProof('DPoP public-key import or signature verification failed.', cause);
  }
  const claims = parseObject(payload);
  const { htm, htu, iat, jti, nonce, ath } = claims;
  if (
    typeof iat !== 'number' ||
    !Number.isSafeInteger(iat) ||
    iat < 0 ||
    typeof jti !== 'string' ||
    jti.length < 1 ||
    jti.length > 128 ||
    /[^\x20-\x7e]/.test(jti)
  ) {
    throw invalidProof('DPoP signed iat/JTI must be nonnegative integer time and bounded printable ASCII.');
  }
  if (
    htm !== method ||
    typeof method !== 'string' ||
    method.length === 0 ||
    normalizeDpopProofTarget(htu) !== targetUrl
  ) {
    throw invalidProof('DPoP signed method or normalized public target does not match this request.');
  }
  if (
    typeof nonce === 'string' &&
    (nonce.length > DPOP_NONCE_MAX_BYTES || Buffer.byteLength(nonce, 'utf8') > DPOP_NONCE_MAX_BYTES)
  ) {
    throw invalidProof('DPoP signed nonce exceeds its byte bound.');
  }
  if (
    accessToken !== undefined &&
    (typeof accessToken !== 'string' ||
      !/^[\x21-\x7e]+$/.test(accessToken) ||
      !isCanonicalDpopJkt(ath) ||
      ath !== createHash('sha256').update(accessToken, 'ascii').digest('base64url'))
  ) {
    throw invalidProof('DPoP signed access-token hash does not match the presented API token.');
  }
  const jkt = await calculateJwkThumbprint(jwk, 'sha256');
  if (expectedJkt !== undefined && (!isCanonicalDpopJkt(expectedJkt) || jkt !== expectedJkt)) {
    throw invalidProof('DPoP verified public key does not match the original credential confirmation.');
  }
  return Object.freeze({
    binding: Object.freeze({ type: 'dpop', jkt, alg }),
    iat,
    jti,
    ...(nonce === undefined ? {} : { nonce }),
  });
};
