import { calculateJwkThumbprint } from 'jose';

import { keyLost, OidcVaultDpopClientError } from './errors';
import {
  guardDpopTransaction,
  withDpopDatabase,
  type DpopKey,
  type PublicDpopJwk,
  type StoredDpopKey,
} from './key-database';
import { assertDpopBrowserFeatures, resolveDpopScope, type DpopKeyScope } from './scope';
import type { SessionAuthority } from './session-lifecycle';

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

const readOrCreateKey = async (
  input: DpopKeyScope,
  create: boolean,
  authority?: SessionAuthority,
): Promise<DpopKey> => {
  authority?.assertCurrent();
  assertDpopBrowserFeatures();
  const { id } = resolveDpopScope(input);
  try {
    const existing = await withDpopDatabase((db) => {
      authority?.assertCurrent();
      return db.get('keys', id);
    });
    authority?.assertCurrent();
    if (existing) {
      const key = await validateKey(existing, id);
      authority?.assertCurrent();
      return key;
    }
    if (!create) throw keyLost();
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
    authority?.assertCurrent();
    // Web Crypto keeps asymmetric public keys exportable; private stays false.
    const exported = await crypto.subtle.exportKey('jwk', pair.publicKey);
    authority?.assertCurrent();
    if (!exported.x || !exported.y) throw keyLost();
    const publicJwk: PublicDpopJwk = { kty: 'EC', crv: 'P-256', x: exported.x, y: exported.y };
    const candidate: StoredDpopKey = {
      version: 1,
      scopeId: id,
      privateKey: pair.privateKey,
      publicJwk,
      jkt: await calculateJwkThumbprint(publicJwk),
    };
    authority?.assertCurrent();
    const winner = await withDpopDatabase(async (db) => {
      authority?.assertCurrent();
      const transaction = db.transaction('keys', 'readwrite');
      return guardDpopTransaction(transaction, authority, async () => {
        const stored = await transaction.store.get(id);
        authority?.assertCurrent();
        if (!stored) await transaction.store.add(candidate, id);
        return stored ?? candidate;
      });
    });
    const key = await validateKey(winner, id);
    authority?.assertCurrent();
    return key;
  } catch (error) {
    authority?.assertCurrent();
    if (error instanceof OidcVaultDpopClientError) throw error;
    throw new OidcVaultDpopClientError(
      'DPOP_KEY_STORAGE_UNAVAILABLE',
      'Non-extractable IndexedDB key persistence is unavailable.',
      true,
    );
  }
};

/** Internal login path: invalidation also guards candidate persistence. */
export const getOrCreateLoginDpopKey = (input: DpopKeyScope, authority: SessionAuthority): Promise<DpopKey> =>
  readOrCreateKey(input, true, authority);

/**
 * Read (or, at fresh login, atomically create) the non-extractable ES256/P-256
 * browser key scoped to `[frontendOrigin, backendOrigin, basePath]`.
 *
 * Call with the default `create=true` ONLY at fresh login (`session.login()`
 * does this for you). All credential-bearing operations use `create=false`,
 * so losing IndexedDB cannot silently rebind a login: a missing or changed
 * key throws `DPOP_KEY_LOST` and the caller must start a fresh login. An
 * unusable existing record needs explicit `session.resetKey()` before login;
 * this helper never deletes or replaces it. No ephemeral-key or Bearer fallback.
 *
 * Candidate crypto work happens outside the readwrite transaction. IndexedDB
 * serializes the final read/add across tabs, making exactly one candidate win.
 *
 * Canonical import: `import { getOrCreateDpopKey } from
 * '@web-ts-toolkit/oidc-vault-dpop-client'` (named root import).
 */
export const getOrCreateDpopKey = (input: DpopKeyScope, options: { create?: boolean } = {}): Promise<DpopKey> =>
  readOrCreateKey(input, options.create !== false);
