import { createHash } from 'node:crypto';

import { DEFAULT_OIDC_VAULT_BASE_PATH } from './constants';
import {
  isCanonicalDpopJkt,
  isDpopAlgorithm,
  resolveDeviceBindingOptions,
  resolveDeviceBindingOrigin,
  type ResolvedOidcVaultDeviceBindingOptions,
} from './device-binding-policy';
import { createDpopNoncePolicy, DPOP_NONCE_MAX_BYTES } from './dpop-nonce';
import { OidcVaultHttpError, toErrorPayload } from './errors';
import type { OidcVaultDpopAlgorithm, OidcVaultDpopReplayStore, OidcVaultVerifiedDpopBinding } from './types';

export type DpopProtectionSpace =
  | {
      readonly type: 'vault';
      readonly backendOrigin: string;
      readonly basePath?: string;
      readonly issuer: string;
      readonly clientId: string;
    }
  | { readonly type: 'api'; readonly publicOrigin: string; readonly replayNamespace: string };

export type DpopEffectiveNamespace =
  | readonly ['vault', string, string, string, string]
  | readonly ['api', string, string];

/**
 * Trusted callback output, NOT an authentication constructor for raw claims.
 * DBJWT-06's verifier must verify the signature/public JWK/current algorithm,
 * method/public URL, expected key and API ath/token confirmation before returning.
 * Vault callers additionally authenticate the existing target/identity/cookie
 * authority before returning. Keep this callback read-only: consume, upstream
 * calls and mutation/hooks belong after an accepted replay result. This layer
 * checks signed claim shapes, time, nonce and replay only; it cannot establish
 * those earlier prerequisites.
 */
export interface DpopProofVerificationResult {
  readonly binding: Readonly<OidcVaultVerifiedDpopBinding>;
  readonly jti: unknown;
  readonly iat: unknown;
  readonly nonce?: unknown;
}

export type VerifyDpopProofBeforeReplay = () => DpopProofVerificationResult | Promise<DpopProofVerificationResult>;

export interface DpopNonceChallenge {
  readonly type: 'nonce-challenge';
  readonly nonce: string;
}

export type DpopReplayResult =
  | { readonly type: 'accepted'; readonly binding: Readonly<OidcVaultVerifiedDpopBinding>; readonly expiresAt: number }
  | DpopNonceChallenge;

export interface DpopReplayPolicy {
  readonly effectiveNamespace: DpopEffectiveNamespace;
  /** Invoke the trusted preflight first, then enforce window/nonce and reserve exactly once. */
  verifyAndReserve(verifyBeforeReplay: VerifyDpopProofBeforeReplay): Promise<DpopReplayResult>;
}

export interface DpopPolicyResponse {
  readonly status: number;
  readonly body: Readonly<{ code: string; message: string }>;
  readonly headers: Readonly<Record<string, string>>;
}

const isPrintableIdentifier = (value: unknown): value is string =>
  typeof value === 'string' && /^[\x20-\x7e]{1,128}$/.test(value);

const normalizeNamespaceBasePath = (origin: string, value: string | undefined): string => {
  if (value !== undefined && typeof value !== 'string')
    throw new TypeError('DPoP vault basePath must be a static path.');
  const mounted = !value || value === '/' ? DEFAULT_OIDC_VAULT_BASE_PATH : `/${value.replace(/^\/+|\/+$/g, '')}`;
  if (/[\s\\?#]/.test(mounted) || /%(?![0-9a-f]{2})/i.test(mounted)) {
    throw new TypeError('DPoP vault basePath must be a static path without query, fragment or malformed escapes.');
  }
  const path = mounted.replace(/%([0-9a-f]{2})/gi, (_, hex: string) => {
    const character = String.fromCharCode(Number.parseInt(hex, 16));
    return /^[A-Za-z0-9._~-]$/.test(character) ? character : `%${hex.toUpperCase()}`;
  });
  // Concatenate with the pinned origin, never resolve a path as an authority.
  const normalized = new URL(`${origin}${path}`).pathname;
  return normalized.replace(/\/+$/g, '') || '/';
};

/**
 * D5 static protection space. Pass resolved issuer/clientId verbatim: issuer
 * slash/case variants remain distinct. All routes/instances in a space share
 * this tuple; no instance, request target, session/code, token or API path
 * prefix belongs in it. API namespace strings are exact printable ASCII.
 */
export const resolveDpopEffectiveNamespace = (space: DpopProtectionSpace): DpopEffectiveNamespace => {
  if (space?.type === 'vault') {
    const { backendOrigin, basePath, issuer, clientId } = space;
    const origin = resolveDeviceBindingOrigin(backendOrigin);
    if (typeof issuer !== 'string' || issuer.length === 0 || typeof clientId !== 'string' || clientId.length === 0) {
      throw new TypeError('DPoP vault namespace requires resolved issuer and clientId.');
    }
    return Object.freeze(['vault', origin, normalizeNamespaceBasePath(origin, basePath), issuer, clientId] as const);
  }
  if (space?.type === 'api') {
    const { publicOrigin, replayNamespace } = space;
    if (!isPrintableIdentifier(replayNamespace)) {
      throw new TypeError('DPoP replayNamespace must contain 1 through 128 printable ASCII bytes.');
    }
    return Object.freeze(['api', resolveDeviceBindingOrigin(publicOrigin, 'publicOrigin'), replayNamespace] as const);
  }
  throw new TypeError('DPoP replay policy requires a vault or API protection space.');
};

/** Pure opaque key derivation/shape checks; this does NOT authenticate jkt or jti. */
export const createDpopReplayKey = (effectiveNamespace: DpopEffectiveNamespace, jkt: string, jti: string): string => {
  if (!isCanonicalDpopJkt(jkt) || !isPrintableIdentifier(jti)) {
    throw new TypeError('DPoP replay key requires a canonical thumbprint and a bounded printable JTI.');
  }
  return `dpop:v1:${createHash('sha256')
    .update(JSON.stringify([effectiveNamespace, jkt, jti]), 'utf8')
    .digest('base64url')}`;
};

/**
 * Strict D1/D5 signed-iat window, with no clamping or sliding renewal. Returns
 * null for an invalid policy/epoch, a stale/future proof, exact expiry or TTL
 * above 360000 ms. The upper bound includes future iat skew (age + twice skew).
 * This pure calculation is not proof authentication and allocates no replay state.
 */
export const getDpopReplayExpiresAt = (input: {
  readonly iat: unknown;
  readonly now: number;
  readonly proofMaxAgeSeconds: number;
  readonly clockSkewSeconds: number;
}): number | null => {
  const { iat, now, proofMaxAgeSeconds: age, clockSkewSeconds: skew } = input;
  if (
    typeof iat !== 'number' ||
    !Number.isSafeInteger(iat) ||
    iat < 0 ||
    !Number.isSafeInteger(now) ||
    now < 0 ||
    !Number.isInteger(age) ||
    age < 1 ||
    age > 300 ||
    !Number.isInteger(skew) ||
    skew < 0 ||
    skew > 30
  )
    return null;
  // Use integer milliseconds, including at the safe-epoch edge: dividing a
  // large now by 1000 can round a proof issued 1ms in the future into the
  // allowed second. expiresAt > now is the strict lower iat inequality.
  const issuedAt = iat * 1000;
  const expiresAt = (iat + age + skew) * 1000;
  if (
    !Number.isSafeInteger(issuedAt) ||
    !Number.isSafeInteger(expiresAt) ||
    issuedAt - now > skew * 1000 ||
    expiresAt <= now ||
    expiresAt - now > 360_000
  )
    return null;
  return expiresAt;
};

const invalidProof = (diagnostic: string): OidcVaultHttpError =>
  new OidcVaultHttpError(401, 'OIDC_VAULT_INVALID_DPOP_PROOF', diagnostic, 'DPoP proof validation failed.');

const replayUnavailable = (cause: unknown): OidcVaultHttpError => {
  const error = new OidcVaultHttpError(
    503,
    'OIDC_VAULT_DPOP_REPLAY_UNAVAILABLE',
    'DPoP replay admission failed.',
    'DPoP replay protection is unavailable.',
  );
  // Keep the original diagnostic available to private onError observers, not
  // enumerable error/response fields. An uncertain committed reservation is
  // never released or retried with the same proof.
  Object.defineProperty(error, 'cause', { value: cause, configurable: true });
  return error;
};

/**
 * Internal shared orchestration, not an API proof verifier or HTTP handler.
 * Construction snapshots policy/namespace/secret; the injected store remains
 * the shared atomic service (no fallback). The verifier callback is the trust
 * boundary: merely supplying jkt/jti strings is not proof authentication.
 *
 * The detached result binding describes this proof, not enrollment of an
 * existing record: use resolveVerifiedDeviceBinding with its original stored
 * binding before issuance; an optional legacy record must remain unbound.
 * A later consume/provider/hook/issuer failure NEVER
 * releases replay state; retry with a freshly signed proof. Each accepted
 * request costs shared replay admission, unlike low-volume backchannel JTI
 * use. Memory sharing is one store object only. Redis admission is normally
 * one EVALSHA; Mongo uses serialized transactional capacity accounting and is
 * a contention point (seven normal data commands + commit, more on retries).
 * Shared deployments require identical namespaces/windows and synchronized clocks.
 */
export const createDpopReplayPolicy = (options: {
  readonly protectionSpace: DpopProtectionSpace;
  readonly proofOptions: ResolvedOidcVaultDeviceBindingOptions;
  readonly replayStore: OidcVaultDpopReplayStore;
  readonly now?: () => number;
}): DpopReplayPolicy => {
  const { protectionSpace, proofOptions, replayStore, now: configuredNow } = options;
  const policy = resolveDeviceBindingOptions(proofOptions);
  if (!policy) throw new TypeError('DPoP replay policy requires enabled proof options.');
  if (typeof replayStore?.reserveDpopProof !== 'function')
    throw new TypeError('DPoP replay policy requires a replay store.');
  if (configuredNow !== undefined && typeof configuredNow !== 'function')
    throw new TypeError('DPoP replay clock must be callable.');
  const now = configuredNow ?? Date.now;
  const effectiveNamespace = resolveDpopEffectiveNamespace(protectionSpace);
  const noncePolicy =
    policy.nonce === false
      ? undefined
      : createDpopNoncePolicy({
          ...policy.nonce,
          namespace: JSON.stringify(effectiveNamespace),
        });

  return Object.freeze({
    effectiveNamespace,
    async verifyAndReserve(verifyBeforeReplay: VerifyDpopProofBeforeReplay): Promise<DpopReplayResult> {
      // No nonce challenge or replay admission until all external preconditions
      // succeed. Do not catch/relabel verifier/target failures as store errors.
      const verified = await verifyBeforeReplay();
      if (typeof verified !== 'object' || verified === null || Array.isArray(verified)) {
        throw invalidProof('DPoP verifier did not return a proof verification result.');
      }
      const { binding: verifiedBinding, iat, jti, nonce } = verified;
      if (typeof verifiedBinding !== 'object' || verifiedBinding === null || Array.isArray(verifiedBinding)) {
        throw invalidProof('DPoP verifier did not return a verified key binding.');
      }
      const { type, jkt, alg } = verifiedBinding;
      if (
        type !== 'dpop' ||
        !isCanonicalDpopJkt(jkt) ||
        !isDpopAlgorithm(alg) ||
        !policy.algorithms.includes(alg) ||
        !isPrintableIdentifier(jti)
      ) {
        throw invalidProof('DPoP verified key/algorithm or signed JTI shape is invalid.');
      }
      const binding = Object.freeze({ type, jkt, alg });
      let checkedNow: number;
      try {
        checkedNow = now();
        if (!Number.isSafeInteger(checkedNow) || checkedNow < 0) throw new TypeError('DPoP replay clock is invalid.');
      } catch (error) {
        throw replayUnavailable(error);
      }
      const expiresAt = getDpopReplayExpiresAt({ ...policy, iat, now: checkedNow });
      if (expiresAt === null) throw invalidProof('DPoP signed iat is outside the bounded replay window.');

      if (noncePolicy) {
        if (!noncePolicy.verify(nonce, jkt, checkedNow)) {
          return Object.freeze({ type: 'nonce-challenge', nonce: noncePolicy.issue(jkt, checkedNow) });
        }
      } else if (
        nonce !== undefined &&
        (typeof nonce !== 'string' ||
          nonce.length > DPOP_NONCE_MAX_BYTES ||
          Buffer.byteLength(nonce, 'utf8') > DPOP_NONCE_MAX_BYTES)
      ) {
        throw invalidProof('DPoP signed nonce claim exceeds its string/byte bound.');
      }

      let reserved: boolean;
      try {
        reserved = await replayStore.reserveDpopProof({
          replayKey: createDpopReplayKey(effectiveNamespace, jkt, jti),
          expiresAt,
        });
        if (typeof reserved !== 'boolean')
          throw new TypeError('DPoP replay store returned a non-boolean admission result.');
      } catch (error) {
        throw replayUnavailable(error);
      }
      if (!reserved) throw invalidProof('DPoP replay reservation was duplicate or no longer live.');
      return Object.freeze({ type: 'accepted', binding, expiresAt });
    },
  });
};

const challenge = (
  error: 'invalid_dpop_proof' | 'use_dpop_nonce',
  algorithms: readonly OidcVaultDpopAlgorithm[],
): string => {
  if (algorithms.length === 0 || !algorithms.every(isDpopAlgorithm))
    throw new TypeError('DPoP challenge requires a resolved algorithm allowlist.');
  return `DPoP error="${error}", algs="${[...new Set(algorithms)].join(' ')}"`;
};

/** Sanitized data only; later API/vault handlers own observers and actual HTTP writing. */
export const toDpopReplayErrorResponse = (
  error: unknown,
  algorithms: readonly OidcVaultDpopAlgorithm[],
): DpopPolicyResponse => {
  const { status, code, message } = toErrorPayload(error);
  return Object.freeze({
    status,
    body: Object.freeze({ code, message }),
    headers: Object.freeze({
      'Cache-Control': 'no-store',
      ...(status === 401 && (code === 'OIDC_VAULT_INVALID_DPOP_PROOF' || code === 'OIDC_VAULT_DPOP_REQUIRED')
        ? { 'WWW-Authenticate': challenge('invalid_dpop_proof', algorithms) }
        : {}),
    }),
  });
};

/**
 * Map only a server-issued, otherwise-valid nonce challenge. Request nonce
 * claims never belong here. Return no diagnostics or non-401 auth challenge.
 */
export const toDpopNonceChallengeResponse = (
  result: DpopNonceChallenge,
  endpoint: 'vault-post' | 'api',
  algorithms: readonly OidcVaultDpopAlgorithm[],
): DpopPolicyResponse => {
  const nonce = result?.nonce;
  if (
    result?.type !== 'nonce-challenge' ||
    typeof nonce !== 'string' ||
    nonce.length > DPOP_NONCE_MAX_BYTES ||
    !/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(nonce)
  )
    throw new TypeError('DPoP nonce response requires a bounded server-issued challenge.');
  if (endpoint !== 'vault-post' && endpoint !== 'api')
    throw new TypeError('DPoP nonce response requires an API or vault POST endpoint.');
  return Object.freeze({
    status: endpoint === 'api' ? 401 : 400,
    body: Object.freeze({ code: 'OIDC_VAULT_USE_DPOP_NONCE', message: 'A fresh DPoP nonce is required.' }),
    headers: Object.freeze({
      'Cache-Control': 'no-store',
      'DPoP-Nonce': nonce,
      ...(endpoint === 'api' ? { 'WWW-Authenticate': challenge('use_dpop_nonce', algorithms) } : {}),
    }),
  });
};
