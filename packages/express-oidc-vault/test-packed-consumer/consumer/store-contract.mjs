import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// Dedicated optional capability, constructed with a one-entry ticket cap.
export async function assertLogoutNavigationStore(store, errors, peer = store) {
  await store.ready?.();
  await peer.ready?.();
  const hash = (value) => createHash('sha256').update(value).digest('base64url');
  const now = Date.now();
  const record = {
    namespace: `logout-navigation:v1:${hash('installed-scope')}`,
    ticketHash: hash('installed-ticket'), upstreamLogoutUrl: 'https://provider.example/logout?id_token_hint=original',
    createdAt: now, expiresAt: now + 60000,
  };
  const input = { ...record, rawTicket: 'must-not-persist', session: { refreshToken: 'must-not-persist' } };
  const pending = store.createLogoutNavigationTicket(input);
  Object.assign(input, { namespace: 'mutated', ticketHash: 'mutated', upstreamLogoutUrl: 'https://mutated.example' });
  await pending;
  await assert.rejects(peer.createLogoutNavigationTicket({ ...record, expiresAt: now + 61000 }), errors.OidcVaultStoreConflictError);
  await assert.rejects(peer.createLogoutNavigationTicket({ ...record, ticketHash: hash('full'), namespace: `logout-navigation:v1:${hash('another-scope')}` }), errors.OidcVaultLogoutNavigationCapacityError);
  assert.equal(await peer.consumeLogoutNavigationTicket({ ...record, namespace: `logout-navigation:v1:${hash('wrong-scope')}` }), null);
  const winners = await Promise.all([store, peer].map((provider) => provider.consumeLogoutNavigationTicket(record)));
  assert.deepEqual(winners.filter(Boolean), [record]);
  await peer.createLogoutNavigationTicket({ ...record, ticketHash: hash('replacement') });
  assert.deepEqual(await store.consumeLogoutNavigationTicket({ ...record, ticketHash: hash('replacement') }), { ...record, ticketHash: hash('replacement') });
}

// Copied into disposable installed applications. All providers are constructed
// from their package roots with capacity=1; no workspace implementation imports.
export async function assertDeviceBindingStore(store, CapacityError, peer = store) {
  await store.ready?.();
  await peer.ready?.();
  const binding = { type: 'dpop', jkt: 'A'.repeat(43) };
  const browserBindingHash = 'C'.repeat(42) + 'A';
  const match = { deviceBinding: binding, browserBindingHash };
  const absent = { deviceBinding: null, browserBindingHash: null };
  const now = Date.now();
  const expiresAt = now + 60_000;
  await store.createAuthorizationTransaction({ state: 'packed-state', nonce: 'nonce', pkceVerifier: 'pkce',
    codeChallenge: 'challenge', createdAt: now, expiresAt, deviceBinding: binding, browserBindingHash });
  assert.deepEqual((await peer.getAuthorizationTransaction('packed-state')).deviceBinding, binding);
  assert.equal(await peer.consumeAuthorizationTransaction('packed-state'), null);
  assert.equal(await peer.consumeAuthorizationTransactionIfMatches({ state: 'packed-state', match: absent }), null);
  assert.ok(await store.getAuthorizationTransaction('packed-state'));
  const winners = await Promise.all([store, peer].map((provider) =>
    provider.consumeAuthorizationTransactionIfMatches({ state: 'packed-state', match })));
  assert.equal(winners.filter(Boolean).length, 1);
  await store.createExchangeCode({ code: 'packed-code', sessionId: 'packed-old', createdAt: now,
    expiresAt, deviceBinding: binding, browserBindingHash });
  assert.equal(await peer.consumeExchangeCode('packed-code'), null);
  assert.equal(await peer.consumeExchangeCodeIfMatches({ code: 'packed-code', expectedSessionId: 'wrong', match }), null);
  assert.ok(await store.getExchangeCode('packed-code'));
  assert.deepEqual((await peer.consumeExchangeCodeIfMatches({ code: 'packed-code', expectedSessionId: 'packed-old', match })).deviceBinding, binding);

  const original = await store.createSession({ sessionId: 'packed-old', subject: 'subject', expiresAt,
    refreshToken: 'test-refresh', idToken: 'test-id', deviceBinding: binding,
    provider: { issuer: 'https://issuer.example.test', clientId: 'packed-client' } });
  const next = { ...original };
  delete next.deviceBinding;
  const rotated = await peer.rotateSession({ sessionId: original.sessionId, nextSession: { ...next, sessionId: 'packed-current' } });
  assert.deepEqual(rotated.deviceBinding, binding);
  assert.equal(await store.getSession('packed-old'), null);
  assert.deepEqual(await store.getSessionRevocationContext('packed-old'), {
    logicalSessionId: 'packed-old', provider: original.provider, deviceBinding: binding,
  });
  assert.equal(await store.reserveDpopProof({ replayKey: 'dpop:v1:packed-one', expiresAt }), true);
  assert.equal(await peer.reserveDpopProof({ replayKey: 'dpop:v1:packed-one', expiresAt: expiresAt + 1000 }), false);
  await assert.rejects(peer.reserveDpopProof({ replayKey: 'dpop:v1:packed-two', expiresAt }), CapacityError);
  assert.equal(await store.deleteSessionsByLogicalSessionId({ logicalSessionId: 'packed-old' }), 1);
  assert.equal(await peer.getSessionRevocationContext('packed-old'), null);
}
