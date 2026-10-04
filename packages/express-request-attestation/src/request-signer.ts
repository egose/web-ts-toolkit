/**
 * ATT-06 browser WebCrypto request signer (task sections 4.1/4.2/4.6).
 *
 * Browser-safe ONLY: this module and everything it imports (`src/shared/*`,
 * `./client-errors.js`) must never import Express, Redis, `Buffer`, `NodeJS`,
 * or `node:*` values or types. Typechecked by
 * `tsconfig.signer-browser.json` with `types: []`.
 *
 * `createRequestSigner({ keyId, key, publicOrigin, replayNamespace })`
 * copies and validates 32-byte material, then returns the typed
 * `RequestSigner` (`version: 1` plus immutable protection-space binding plus
 * `sign(input)`). `sign(input)` frames the exact shared MAC input
 * (`buildMacInputBytes`) and returns the transaction ID
 * (`encodeTransactionId`). With explicit timestamp/nonce/body hash the
 * operation is deterministic; automatic nonce/timestamp selection belongs to
 * ATT-07's request wrapper, never to this low-level API.
 *
 * Key handling:
 *
 * - Input bytes are copied on entry; later caller mutation cannot change the
 *   signer, and the signer never exposes key bytes.
 * - Exactly one non-extractable HMAC-SHA-256 `CryptoKey` is imported lazily
 *   on first `sign` via `crypto.subtle.importKey('raw', copy,
 *   { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])`. Non-extractable
 *   wrapping does NOT make publicly delivered material confidential: any
 *   caller that can fetch the module can sign fresh proofs.
 * - Required capabilities (`TextEncoder`, `crypto.subtle`,
 *   `crypto.getRandomValues`, secure context) are feature-detected ON USE,
 *   never at import. Importing this module performs no network requests,
 *   timers, key generation, or storage access (`sideEffects: false`).
 * - Body-hash (`hashBodySha256Hex`) and nonce (`generateNonceHex`) helpers
 *   stay browser-safe with no `Math.random` or predictable fallback.
 */

import { AttestationProtocolError } from './shared/types.js';
import type { RequestSigner, RequestSignerOptions, SignInput } from './shared/types.js';
import {
  buildMacInputBytes,
  encodeTransactionId,
  validateKeyBytes,
  validateKeyId,
  validatePublicOrigin,
  validateReplayNamespace,
} from './shared/codec.js';
import { assertTimestampMs, base64urlEncode } from './shared/canonical.js';
import { validateBodyHashHex, validateNonceHex } from './shared/codec.js';
import { normalizeContentType, normalizeMethod } from './shared/codec.js';
import { canonicalizeRequestTarget } from './shared/codec.js';
import { SignerClientError } from './client-errors.js';

const REQUEST_SIGNER_OPTION_KEYS: ReadonlySet<string> = new Set(['keyId', 'key', 'publicOrigin', 'replayNamespace']);

const SIGN_INPUT_KEYS: ReadonlySet<string> = new Set([
  'method',
  'requestTarget',
  'contentType',
  'bodyHashHex',
  'timestampMs',
  'nonceHex',
]);

function requireTextEncoder(): void {
  const encoder = (globalThis as unknown as { readonly TextEncoder?: unknown }).TextEncoder;
  if (typeof encoder !== 'function') {
    throw new SignerClientError(
      'SIGNER_PREPARATION_FAILED',
      'TextEncoder is unavailable. Signing requires a browser secure context with TextEncoder support.',
    );
  }
}

function requireSecureContext(): void {
  const flag = (globalThis as unknown as { readonly isSecureContext?: unknown }).isSecureContext;
  if (flag === false) {
    throw new SignerClientError(
      'SIGNER_PREPARATION_FAILED',
      'Signing requires a secure context (https or loopback http). crypto.subtle is unavailable in insecure contexts.',
    );
  }
}

function requireSubtle(): SubtleCrypto {
  requireSecureContext();
  requireTextEncoder();
  const cryptoRef = (globalThis as unknown as { readonly crypto?: unknown }).crypto as
    | { readonly subtle?: unknown }
    | undefined;
  const subtle = cryptoRef?.subtle as SubtleCrypto | undefined;
  if (
    subtle === undefined ||
    typeof subtle.importKey !== 'function' ||
    typeof subtle.sign !== 'function' ||
    typeof subtle.digest !== 'function'
  ) {
    throw new SignerClientError(
      'SIGNER_PREPARATION_FAILED',
      'WebCrypto subtle is unavailable. Signing requires a secure context with crypto.subtle (HMAC-SHA-256) support.',
    );
  }
  return subtle;
}

function requireGetRandomValues(): (array: Uint8Array) => void {
  const cryptoRef = (globalThis as unknown as { readonly crypto?: unknown }).crypto as
    | { readonly getRandomValues?: unknown }
    | undefined;
  const getRandomValues = cryptoRef?.getRandomValues as ((array: Uint8Array) => Uint8Array) | undefined;
  if (typeof getRandomValues !== 'function') {
    throw new SignerClientError(
      'SIGNER_PREPARATION_FAILED',
      'crypto.getRandomValues is unavailable. Nonce generation requires a secure context with getRandomValues support; no Math.random fallback is used.',
    );
  }
  return getRandomValues.bind(cryptoRef);
}

/** Lowercase hex encode without Node `Buffer`. */
function hexEncode(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, '0');
  }
  return out;
}

/**
 * Browser-safe SHA-256 hex digest of the exact body bytes. An actually empty
 * request hashes zero bytes. Uses `crypto.subtle.digest`; no Node imports.
 */
export async function hashBodySha256Hex(body: Uint8Array): Promise<string> {
  if (!(body instanceof Uint8Array)) {
    throw new AttestationProtocolError('body must be a Uint8Array');
  }
  const subtle = requireSubtle();
  let digest: ArrayBuffer;
  try {
    digest = await subtle.digest('SHA-256', body as BufferSource);
  } catch (error) {
    throw new SignerClientError('SIGNER_PREPARATION_FAILED', 'Body hashing failed: WebCrypto digest is unavailable.', {
      cause: error,
    });
  }
  return hexEncode(new Uint8Array(digest));
}

/**
 * Browser-safe 128-bit nonce as 32 lowercase hex chars via
 * `crypto.getRandomValues`. No `Math.random` fallback: missing capability
 * throws an actionable local error.
 */
export function generateNonceHex(): string {
  const getRandomValues = requireGetRandomValues();
  const bytes = new Uint8Array(16);
  try {
    getRandomValues(bytes);
  } catch (error) {
    throw new SignerClientError(
      'SIGNER_PREPARATION_FAILED',
      'Nonce generation failed: crypto.getRandomValues is unavailable.',
      { cause: error },
    );
  }
  return hexEncode(bytes);
}

/**
 * Create the low-level WebCrypto HMAC signer. Copies/validates 32-byte
 * material and returns immutable protection-space binding plus
 * `sign(input)`. The HMAC key is imported lazily (non-extractable) on first
 * `sign`; the factory itself performs no crypto, network, timer, or storage
 * work.
 */
export function createRequestSigner(options: RequestSignerOptions): RequestSigner {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new AttestationProtocolError('request signer options must be an object');
  }
  for (const key of Object.keys(options)) {
    if (!REQUEST_SIGNER_OPTION_KEYS.has(key)) {
      throw new AttestationProtocolError(`unknown request signer option ${key}`);
    }
  }
  validateKeyId(options.keyId);
  validatePublicOrigin(options.publicOrigin);
  validateReplayNamespace(options.replayNamespace);
  validateKeyBytes(options.key);

  const keyId = options.keyId;
  const publicOrigin = options.publicOrigin;
  const replayNamespace = options.replayNamespace;
  const keyCopy = new Uint8Array(options.key);

  let cachedKey: Promise<CryptoKey> | null = null;

  async function getCryptoKey(): Promise<CryptoKey> {
    if (cachedKey !== null) {
      return cachedKey;
    }
    const subtle = requireSubtle();
    const pending = (async (): Promise<CryptoKey> => {
      try {
        return await subtle.importKey('raw', keyCopy as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, [
          'sign',
        ]);
      } catch (error) {
        throw new SignerClientError(
          'SIGNER_PREPARATION_FAILED',
          'WebCrypto key import failed: HMAC-SHA-256 with a non-extractable key is required.',
          { cause: error },
        );
      }
    })();
    cachedKey = pending;
    try {
      await pending;
    } catch {
      cachedKey = null;
      throw pending;
    }
    return pending;
  }

  async function sign(input: SignInput): Promise<string> {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
      throw new AttestationProtocolError('sign input must be an object');
    }
    for (const key of Object.keys(input)) {
      if (!SIGN_INPUT_KEYS.has(key)) {
        throw new AttestationProtocolError(`unknown sign input field ${key}`);
      }
    }
    const record = input as Partial<SignInput>;
    // Field validators throw AttestationProtocolError on malformed input.
    // Normalizers (method/target/content-type) apply the exact verifier rules.
    const method = normalizeMethod(record.method);
    const requestTarget = canonicalizeRequestTarget(record.requestTarget);
    const contentType = normalizeContentType(record.contentType);
    validateBodyHashHex(record.bodyHashHex);
    assertTimestampMs('timestampMs', record.timestampMs);
    validateNonceHex(record.nonceHex);
    const timestampMs = record.timestampMs as number;
    const nonceHex = record.nonceHex as string;
    const bodyHashHex = record.bodyHashHex as string;

    const macInput = buildMacInputBytes({
      replayNamespace,
      publicOrigin,
      keyId,
      timestampMs,
      nonceHex,
      method,
      requestTarget,
      contentType,
      bodyHashHex,
    });

    const subtle = requireSubtle();
    const cryptoKey = await getCryptoKey();
    let signature: ArrayBuffer;
    try {
      signature = await subtle.sign('HMAC', cryptoKey, macInput as BufferSource);
    } catch (error) {
      throw new SignerClientError('SIGNER_PREPARATION_FAILED', 'WebCrypto signing failed.', {
        cause: error,
      });
    }
    const mac = base64urlEncode(new Uint8Array(signature));
    return encodeTransactionId({ keyId, timestampMs, nonceHex, mac });
  }

  const signer: RequestSigner = {
    version: 1,
    keyId,
    publicOrigin,
    replayNamespace,
    sign,
  };
  return Object.freeze(signer);
}
