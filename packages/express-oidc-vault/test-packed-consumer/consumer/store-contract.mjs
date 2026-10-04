import assert from 'node:assert/strict';

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
