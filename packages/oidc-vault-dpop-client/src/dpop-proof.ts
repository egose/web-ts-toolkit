import { base64url, SignJWT } from 'jose';

import { abortable, assertNotAborted } from './abort';
import type { DpopKey } from './dpop-key-store';
import { OidcVaultDpopClientError } from './errors';
import { normalizeDpopTarget } from './scope';

/** Inputs for one fresh ES256 request proof; the caller owns the HTTP request and retry policy. */
export interface DpopProofInput {
  /** Exact uppercase HTTP method. */
  method: string;
  /** Absolute HTTP(S) target. Proof normalization omits query/fragment and preserves reserved path escapes. */
  url: string | URL;
  /** API only. Vault login/exchange/refresh/logout present no access token. */
  accessToken?: string;
  /** Optional server-issued value; reuse only within the trusted protection space and signing key. */
  nonce?: string;
  /** Epoch-millisecond clock; default Date.now. Proof iat is integer epoch seconds. */
  now?: () => number;
  /** Reject with signal.reason before/after hashing and while signing; already-started Web Crypto may still finish. */
  signal?: AbortSignal;
}

/**
 * Mint a fresh DPoP proof for exactly one request attempt with the scoped key.
 *
 * Every invocation signs a new proof: exact uppercase `htm`, canonical absolute
 * `htu` without query/fragment, current integer
 * `iat`, fresh 128-bit random `jti`, API-only `ath`, and the optional server
 * `nonce`. The protected header is `{ typ: 'dpop+jwt', alg: 'ES256', jwk:
 * <public P-256 JWK> }`. Call again — with a new `jti`/`iat`/signature — for
 * every nonce or refresh retry; never reuse a proof across attempts.
 * Unreserved path escapes and dot segments normalize; reserved escapes stay
 * encoded. This helper signs only: it does not send HTTP or enforce API scopes.
 *
 * Canonical import: `import { createDpopProof } from
 * '@web-ts-toolkit/oidc-vault-dpop-client'` (named root import).
 */
export const createDpopProof = async (key: DpopKey, input: DpopProofInput): Promise<string> => {
  const { method, url, accessToken, nonce, now = Date.now, signal } = input;
  assertNotAborted(signal);
  if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(method) || method !== method.toUpperCase()) {
    throw new OidcVaultDpopClientError('INVALID_DPOP_METHOD', 'Use the exact uppercase request method.');
  }
  const iat = Math.floor(now() / 1000);
  if (!Number.isSafeInteger(iat) || iat < 0)
    throw new OidcVaultDpopClientError('INVALID_DPOP_TIME', 'The proof clock is invalid.');
  if (nonce !== undefined && (nonce.length === 0 || nonce.length > 512 || !/^[\x20-\x7e]+$/.test(nonce))) {
    throw new OidcVaultDpopClientError('INVALID_DPOP_NONCE', 'The DPoP nonce is invalid.');
  }
  let ath: string | undefined;
  if (accessToken !== undefined) {
    if (!/^[\x21-\x7e]+$/.test(accessToken))
      throw new OidcVaultDpopClientError('INVALID_DPOP_TOKEN', 'The access token is invalid.');
    ath = base64url.encode(
      new Uint8Array(
        await abortable(signal, () => crypto.subtle.digest('SHA-256', new TextEncoder().encode(accessToken))),
      ),
    );
  }
  assertNotAborted(signal);
  // UUIDv4 has only 122 random bits; use all 128 bits from Web Crypto here.
  const jti = base64url.encode(crypto.getRandomValues(new Uint8Array(16)));
  return abortable(signal, () =>
    new SignJWT({
      htm: method,
      htu: normalizeDpopTarget(url),
      iat,
      jti,
      ...(ath === undefined ? {} : { ath }),
      ...(nonce === undefined ? {} : { nonce }),
    })
      .setProtectedHeader({ typ: 'dpop+jwt', alg: 'ES256', jwk: { ...key.publicJwk } })
      .sign(key.privateKey),
  );
};
