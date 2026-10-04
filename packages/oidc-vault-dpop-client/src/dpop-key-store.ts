/**
 * Browser-only DPoP client (CLIENT-02 port of apps/oidc-vault-dpop-example/src/auth/*).
 * No `node:*` or `express` imports. Browser globals (crypto.subtle, indexedDB,
 * sessionStorage, navigator.locks, BroadcastChannel) only behind
 * assertDpopBrowserFeatures / lazy factory calls, never at module top-level.
 */
import { calculateJwkThumbprint } from 'jose';

import { keyLost, OidcVaultDpopClientError } from './errors';
import { withDpopDatabase, type DpopKey, type PublicDpopJwk, type StoredDpopKey } from './key-database';
import { assertDpopBrowserFeatures, resolveDpopScope, type DpopKeyScope } from './scope';

export type { DpopKey, PublicDpopJwk } from './key-database';
export type { DpopKeyScope } from './scope';

const validateKey = async (value: StoredDpopKey, scopeId: string): Promise<DpopKey> => {
  const algorithm = value?.privateKey?.algorithm as EcKeyAlgorithm | undefined;
  const jwk = value?.publicJwk;
  if (
    value?.version !== 1 ||
    value.scopeId !== scopeId ||
    !(value.privateKey instanceof CryptoKey) ||
    value.privateKey.type !== 'private' ||
    value.privateKey.extractable ||
    value.privateKey.usages.length !== 1 ||
    value.privateKey.usages[0] !== 'sign' ||
    algorithm?.name !== 'ECDSA' ||
    algorithm.namedCurve !== 'P-256' ||
    jwk?.kty !== 'EC' ||
    jwk.crv !== 'P-256' ||
    Object.keys(jwk).length !== 4 ||
    !/^[A-Za-z0-9_-]{43}$/.test(jwk.x) ||
    !/^[A-Za-z0-9_-]{43}$/.test(jwk.y) ||
    (await calculateJwkThumbprint(jwk)) !== value.jkt
  )
    throw keyLost();
  // Reject a corrupted mismatched public/private pair before presenting proofs.
  const challenge = new TextEncoder().encode('oidc-vault-dpop-key-pair-v1');
  const publicKey = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']);
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, value.privateKey, challenge);
  if (!(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, signature, challenge)))
    throw keyLost();
  return Object.freeze({ privateKey: value.privateKey, publicJwk: Object.freeze({ ...jwk }), jkt: value.jkt, scopeId });
};

/**
 * Read (or, at fresh login, atomically create) the non-extractable ES256/P-256
 * browser key scoped to `[frontendOrigin, backendOrigin, basePath]`.
 *
 * Call with the default `create=true` ONLY at fresh login (`session.login()`
 * does this for you). All credential-bearing operations use `create=false`,
 * so losing IndexedDB cannot silently rebind a login: a missing or changed
 * key throws `DPOP_KEY_LOST` and the caller must start a fresh login. There is
 * no ephemeral-key or Bearer fallback.
 *
 * Candidate crypto work happens outside the readwrite transaction. IndexedDB
 * serializes the final read/add across tabs, making exactly one candidate win.
 *
 * Canonical import: `import { getOrCreateDpopKey } from
 * '@web-ts-toolkit/oidc-vault-dpop-client'` (named root import).
 */
export const getOrCreateDpopKey = async (input: DpopKeyScope, options: { create?: boolean } = {}): Promise<DpopKey> => {
  assertDpopBrowserFeatures();
  const { id } = resolveDpopScope(input);
  try {
    const existing = await withDpopDatabase((db) => db.get('keys', id));
    if (existing) return await validateKey(existing, id);
    if (options.create === false) throw keyLost();
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
    // Web Crypto keeps asymmetric public keys exportable; private stays false.
    const exported = await crypto.subtle.exportKey('jwk', pair.publicKey);
    if (!exported.x || !exported.y) throw keyLost();
    const publicJwk: PublicDpopJwk = { kty: 'EC', crv: 'P-256', x: exported.x, y: exported.y };
    const candidate: StoredDpopKey = {
      version: 1,
      scopeId: id,
      privateKey: pair.privateKey,
      publicJwk,
      jkt: await calculateJwkThumbprint(publicJwk),
    };
    const winner = await withDpopDatabase(async (db) => {
      const transaction = db.transaction('keys', 'readwrite');
      const stored = await transaction.store.get(id);
      if (!stored) await transaction.store.add(candidate, id);
      await transaction.done;
      return stored ?? candidate;
    });
    return await validateKey(winner, id);
  } catch (error) {
    if (error instanceof OidcVaultDpopClientError) throw error;
    throw new OidcVaultDpopClientError(
      'DPOP_KEY_STORAGE_UNAVAILABLE',
      'Non-extractable IndexedDB key persistence is unavailable.',
      true,
    );
  }
};
