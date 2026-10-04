import { base64url, SignJWT } from 'jose';

import type { DpopKey } from './dpop-key-store';
import { OidcVaultDpopClientError } from './errors';
import { normalizeDpopTarget } from './scope';

export interface DpopProofInput {
  method: string;
  url: string | URL;
  /** API only. Vault login/exchange/refresh/logout present no access token. */
  accessToken?: string;
  nonce?: string;
  now?: () => number;
}

/** Every invocation signs a new proof, including every nonce/refresh retry. */
export const createDpopProof = async (key: DpopKey, input: DpopProofInput): Promise<string> => {
  const { method, url, accessToken, nonce, now = Date.now } = input;
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
      new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(accessToken))),
    );
  }
  // UUIDv4 has only 122 random bits; use all 128 bits from Web Crypto here.
  const jti = base64url.encode(crypto.getRandomValues(new Uint8Array(16)));
  return new SignJWT({
    htm: method,
    htu: normalizeDpopTarget(url),
    iat,
    jti,
    ...(ath === undefined ? {} : { ath }),
    ...(nonce === undefined ? {} : { nonce }),
  })
    .setProtectedHeader({ typ: 'dpop+jwt', alg: 'ES256', jwk: { ...key.publicJwk } })
    .sign(key.privateKey);
};
