import { isIP } from 'node:net';

import { OidcVaultHttpError } from './errors';
import type { ResolvedOidcVaultFingerprintRecognitionOptions } from './fingerprint-recognition';
import type { ResolvedOidcVaultTransactionCookieOptions } from './transaction-cookie';
import type {
  OidcVaultDeviceBindingMode,
  OidcVaultDeviceBindingOptions,
  OidcVaultDeviceBindingStoreProvider,
  OidcVaultDpopAlgorithm,
  OidcVaultDpopBinding,
  OidcVaultOptions,
  OidcVaultStoreProvider,
  OidcVaultVerifiedDpopBinding,
} from './types';

export interface ResolvedOidcVaultDpopNonceOptions {
  /** Private owned bytes; never expose this array through hooks or issuer input. */
  readonly secret: Uint8Array;
  readonly lifetimeSeconds: number;
}

export interface ResolvedOidcVaultDeviceBindingOptions {
  readonly mode: OidcVaultDeviceBindingMode;
  readonly algorithms: readonly OidcVaultDpopAlgorithm[];
  readonly proofMaxAgeSeconds: number;
  readonly clockSkewSeconds: number;
  readonly nonce: false | ResolvedOidcVaultDpopNonceOptions;
}

export interface ResolvedOidcVaultOptions extends Omit<
  OidcVaultOptions,
  'deviceBinding' | 'fingerprintRecognition' | 'transactionCookie'
> {
  readonly deviceBinding?: ResolvedOidcVaultDeviceBindingOptions;
  readonly fingerprintRecognition?: ResolvedOidcVaultFingerprintRecognitionOptions;
  readonly transactionCookie?: ResolvedOidcVaultTransactionCookieOptions;
}

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

export const isDpopAlgorithm = (value: unknown): value is OidcVaultDpopAlgorithm =>
  value === 'ES256' || value === 'PS256' || value === 'RS256';

const resolveInteger = (value: unknown, fallback: number, min: number, max: number, name: string): number => {
  const resolved = value === undefined ? fallback : value;
  if (typeof resolved !== 'number' || !Number.isInteger(resolved) || resolved < min || resolved > max) {
    throw new Error(`${name} must be an integer from ${min} through ${max}.`);
  }
  return resolved;
};

/** Resolve only plain policy data; service references are owned by the enclosing options snapshot. */
export const resolveDeviceBindingOptions = (
  value: OidcVaultDeviceBindingOptions | undefined,
): ResolvedOidcVaultDeviceBindingOptions | undefined => {
  if (value === undefined) return undefined;
  if (!isPlainRecord(value)) throw new Error('deviceBinding must be a plain options object.');

  // Capture each declared field once. Do not keep caller-owned containers or
  // arbitrary extension properties, even when the caller freezes its input.
  const { mode, algorithms, proofMaxAgeSeconds, clockSkewSeconds, nonce } = value;
  if (mode !== undefined && mode !== 'optional' && mode !== 'required') {
    throw new Error('deviceBinding.mode must be optional or required.');
  }
  const configuredAlgorithms: unknown = algorithms === undefined ? ['ES256'] : algorithms;
  if (!Array.isArray(configuredAlgorithms) || configuredAlgorithms.length === 0) {
    throw new Error('deviceBinding.algorithms must be a nonempty allowlist of ES256, PS256, or RS256.');
  }
  const allowlist: unknown[] = Array.from(configuredAlgorithms);
  if (!allowlist.every(isDpopAlgorithm)) {
    throw new Error('deviceBinding.algorithms must be a nonempty allowlist of ES256, PS256, or RS256.');
  }

  let resolvedNonce: ResolvedOidcVaultDeviceBindingOptions['nonce'] = false;
  if (nonce !== undefined && nonce !== false) {
    if (!isPlainRecord(nonce)) throw new Error('deviceBinding.nonce must be false or a plain nonce options object.');
    const { secret, lifetimeSeconds } = nonce;
    if (!(secret instanceof Uint8Array) || secret.byteLength < 32) {
      throw new Error('deviceBinding.nonce.secret must be a Uint8Array of at least 32 bytes.');
    }
    resolvedNonce = Object.freeze({
      // Uint8Array.from also copies Buffer/subarray inputs instead of retaining
      // a shared view. Nonempty typed arrays cannot be Object.freeze'd; these
      // owned bytes stay private while the plain nonce container is frozen.
      secret: Uint8Array.from(secret),
      lifetimeSeconds: resolveInteger(lifetimeSeconds, 60, 1, 300, 'deviceBinding.nonce.lifetimeSeconds'),
    });
  }

  return Object.freeze({
    mode: mode ?? 'optional',
    algorithms: Object.freeze([...new Set(allowlist)]),
    proofMaxAgeSeconds: resolveInteger(proofMaxAgeSeconds, 60, 1, 300, 'deviceBinding.proofMaxAgeSeconds'),
    clockSkewSeconds: resolveInteger(clockSkewSeconds, 5, 0, 30, 'deviceBinding.clockSkewSeconds'),
    nonce: resolvedNonce,
  });
};

const DEVICE_BINDING_STORE_CAPABILITIES = [
  'getAuthorizationTransaction',
  'consumeAuthorizationTransactionIfMatches',
  'getExchangeCode',
  'consumeExchangeCodeIfMatches',
  'getSessionRevocationContext',
  'reserveDpopProof',
] as const;

export function assertDeviceBindingStoreCapabilities(
  store: OidcVaultStoreProvider,
  feature: 'deviceBinding' | 'fingerprintRecognition' = 'deviceBinding',
): asserts store is OidcVaultDeviceBindingStoreProvider {
  for (const name of DEVICE_BINDING_STORE_CAPABILITIES) {
    if (typeof store?.[name] !== 'function') {
      throw new Error(`${feature} requires storeProvider.${name}.`);
    }
  }
}

/** Pinned public origin validation used only when proof policy is enabled. */
export const resolveDeviceBindingOrigin = (value: string, name = 'backendOrigin'): string => {
  if (typeof value !== 'string') throw new Error(`${name} must be a static HTTP(S) origin for deviceBinding.`);
  const raw = value.trim();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${name} must be a static HTTP(S) origin for deviceBinding.`);
  }
  if (
    !/^https?:\/\/[^/\\?#]+\/?$/i.test(raw) ||
    /\s/.test(raw) ||
    raw.includes('@') ||
    url.username !== '' ||
    url.password !== '' ||
    url.pathname !== '/' ||
    url.origin === 'null'
  ) {
    throw new Error(
      `${name} must be a static HTTP(S) origin without userinfo, path, query, or fragment for deviceBinding.`,
    );
  }
  const loopback =
    url.hostname === 'localhost' ||
    url.hostname === '[::1]' ||
    (isIP(url.hostname) === 4 && url.hostname.startsWith('127.'));
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error(`${name} must use HTTPS except for loopback HTTP development when deviceBinding is enabled.`);
  }
  return url.origin;
};

/** RFC 7638 SHA-256 base64url, including the canonical final two padding bits. */
export const isCanonicalDpopJkt = (value: unknown): value is string =>
  typeof value === 'string' && value.length === 43 && /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(value);

const invalidBinding = (diagnostic: string): OidcVaultHttpError =>
  new OidcVaultHttpError(401, 'OIDC_VAULT_INVALID_DPOP_PROOF', diagnostic, 'DPoP proof validation failed.');

/** Undefined alone is legacy unbound; malformed/null binding must never become legacy. */
export const snapshotDpopBinding = (value: unknown): Readonly<OidcVaultDpopBinding> | undefined => {
  if (value === undefined) return undefined;
  if (!isPlainRecord(value)) throw invalidBinding('Stored device binding must be a plain dpop binding object.');
  const { type, jkt } = value;
  if (type !== 'dpop' || !isCanonicalDpopJkt(jkt)) {
    throw invalidBinding('Stored device binding must contain type dpop and a canonical SHA-256 JWK thumbprint.');
  }
  return Object.freeze({ type, jkt });
};

/** Policy preflight; callers must run it before consume/provider/hook/mutation work. */
export const assertDeviceBindingPolicy = (
  policy: ResolvedOidcVaultDeviceBindingOptions | undefined,
  binding: Readonly<OidcVaultDpopBinding> | undefined,
): void => {
  // Validate even when the feature is disabled; null/malformed is never an
  // omission. Keep a detached snapshot rather than trusting a mutable record.
  const stored = snapshotDpopBinding(binding);
  if (stored !== undefined && policy === undefined) {
    throw new OidcVaultHttpError(401, 'OIDC_VAULT_DPOP_REQUIRED', 'DPoP authentication is required.');
  }
  if (stored === undefined && policy?.mode === 'required') {
    throw new OidcVaultHttpError(401, 'OIDC_VAULT_DEVICE_BINDING_REQUIRED', 'A device-bound login is required.');
  }
};

/**
 * Match an already-verified proof to the original stored binding. This does
 * not verify a proof, nonce, or replay reservation. The verifier/handler owns
 * those prerequisites. Optional unbound contexts stay unbound even with a
 * valid supplied proof; missing proof or disabled policy never accepts a bound
 * context. The returned context is private, detached, and frozen.
 */
export const resolveVerifiedDeviceBinding = (
  policy: ResolvedOidcVaultDeviceBindingOptions | undefined,
  binding: Readonly<OidcVaultDpopBinding> | undefined,
  verified: Readonly<OidcVaultVerifiedDpopBinding> | undefined,
): Readonly<OidcVaultVerifiedDpopBinding> | undefined => {
  const stored = snapshotDpopBinding(binding);
  assertDeviceBindingPolicy(policy, stored);
  if (verified === undefined) {
    if (stored !== undefined) {
      throw new OidcVaultHttpError(401, 'OIDC_VAULT_DPOP_REQUIRED', 'DPoP authentication is required.');
    }
    return undefined;
  }
  const proofBinding = snapshotDpopBinding(verified);
  const alg: unknown = verified.alg;
  if (proofBinding === undefined || !isDpopAlgorithm(alg) || !policy?.algorithms.includes(alg)) {
    throw invalidBinding('Verified DPoP context must use a currently allowed asymmetric proof algorithm.');
  }
  if (stored === undefined) return undefined;
  if (stored.jkt !== proofBinding.jkt) throw invalidBinding('Verified DPoP key does not match the original binding.');
  return Object.freeze({ type: 'dpop', jkt: stored.jkt, alg });
};

/** Restore security-owned binding after a mutable hook; never enroll an unbound record. */
export const withSessionDeviceBinding = <T extends object>(
  session: T,
  binding: Readonly<OidcVaultDpopBinding> | undefined,
): T & { deviceBinding?: OidcVaultDpopBinding } => {
  // Do not evaluate a hook's replacement security getter while restoring the
  // private original. Mapping/application fields retain ordinary copy behavior.
  const restored = {} as T & { deviceBinding?: OidcVaultDpopBinding };
  for (const key of Reflect.ownKeys(session)) {
    if (key !== 'deviceBinding' && Object.prototype.propertyIsEnumerable.call(session, key))
      Object.defineProperty(restored, key, {
        value: Reflect.get(session, key),
        enumerable: true,
        configurable: true,
        writable: true,
      });
  }
  const stored = snapshotDpopBinding(binding);
  if (stored !== undefined) restored.deviceBinding = stored;
  return restored;
};
