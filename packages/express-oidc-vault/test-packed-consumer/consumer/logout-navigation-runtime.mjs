import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

import express from 'express';
import { calculateJwkThumbprint, exportJWK, generateKeyPair } from 'jose';

const load = process.argv[2] === 'cjs' ? createRequire(import.meta.url) : (name) => import(name);
const core = await load('@web-ts-toolkit/express-oidc-vault');
const { createMemoryOidcVaultStore } = await load('@web-ts-toolkit/express-oidc-vault-memory-store');
const { createDpopProof } = await load('@web-ts-toolkit/oidc-vault-dpop-client');
const pair = await generateKeyPair('ES256');
const publicJwk = await exportJWK(pair.publicKey);
const jkt = await calculateJwkThumbprint(publicJwk);
const deviceKey = { privateKey: pair.privateKey, publicJwk, jkt, scopeId: 'navigation-runtime' };
const origin = 'https://api.example.com';
const provider = 'https://provider.example.com';
const fallback = 'https://app.example.com/signed-out';
const now = Date.now();
assert.equal(core.OIDC_VAULT_ROUTE_PATHS['logout-navigation'], '/logout/navigation');

for (const sessionTransport of ['body', 'cookie']) {
  const store = createMemoryOidcVaultStore({ now: () => now });
  await store.createSession({ sessionId: 'private-handle', logicalSessionId: 'private-lineage', subject: 'private-subject',
    deviceBinding: { type: 'dpop', jkt }, provider: { issuer: provider, clientId: 'client' }, refreshToken: 'private-refresh', idToken: 'private-id' });
  let saved;
  let hooks = 0;
  const create = store.createLogoutNavigationTicket.bind(store);
  store.createLogoutNavigationTicket = async (record) => {
    assert.equal(await store.getSession('private-handle'), null);
    saved = { ...record };
    await create(record);
  };
  const options = { backendOrigin: origin, basePath: '/vault', frontendRedirectUri: 'https://app.example.com/callback',
    storeProvider: store, deviceBinding: {}, sessionTransport, now: () => now,
    cookie: { name: 'custom_session', path: '/vault' },
    logoutNavigation: { fallbackRedirectUri: fallback }, postLogoutRedirectUri: `${provider}/registered-return`,
    hooks: { onLogout: () => { hooks++; } },
    config: { issuer: provider, clientId: 'client', authorizationEndpoint: `${provider}/authorize`,
      tokenEndpoint: `${provider}/token`, jwksUri: `${provider}/jwks`, endSessionEndpoint: `${provider}/end-session` } };
  const app = express();
  app.use(core.createOidcVaultMiddleware(options));
  const server = app.listen(0, '127.0.0.1');
  const other = express(); other.use(core.createOidcVaultMiddleware(options));
  const otherServer = other.listen(0, '127.0.0.1');
  await Promise.all([server, otherServer].map((entry) => new Promise((resolve) => entry.once('listening', resolve))));
  const call = (entry, path, init) => fetch(`http://127.0.0.1:${entry.address().port}${path}`, { redirect: 'manual', ...init });
  try {
    const response = await call(server, '/vault/logout/navigation', { method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin,
        DPoP: await createDpopProof(deviceKey, { method: 'POST', url: `${origin}/vault/logout/navigation`, now: () => now }),
        ...(sessionTransport === 'cookie' ? { Cookie: 'custom_session=private-handle; oidc_vault_session=decoy' } : {}) },
      body: JSON.stringify(sessionTransport === 'cookie' ? {} : { sessionId: 'private-handle' }) });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    if (sessionTransport === 'cookie') assert.match(response.headers.get('set-cookie'), /custom_session=;.*Path=\/vault.*Max-Age=0/);
    const result = await response.json();
    assert.deepEqual(Object.keys(result).sort(), ['loggedOut', 'navigationUrl']);
    assert.equal(result.loggedOut, true);
    const url = new URL(result.navigationUrl);
    assert.equal(url.origin, origin); assert.equal(url.pathname, '/vault/logout/navigation');
    const ticket = url.searchParams.get('ticket');
    assert.match(ticket, /^lnt_[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/);
    assert.equal(saved.ticketHash, createHash('sha256').update(ticket, 'utf8').digest('base64url'));
    assert.equal(saved.expiresAt - saved.createdAt, 60_000);
    assert.equal(hooks, 1); assert.doesNotMatch(JSON.stringify(result), /private-|id_token_hint|provider/);
    const path = url.pathname + url.search;
    assert.equal((await call(otherServer, path, { method: 'HEAD' })).status, 405);
    const results = await Promise.all([call(otherServer, path), call(server, path)]);
    const upstream = results.filter((entry) => entry.headers.get('location') !== fallback);
    assert.equal(upstream.length, 1);
    assert.equal(new URL(upstream[0].headers.get('location')).searchParams.get('id_token_hint'), 'private-id');
    for (const entry of results) {
      assert.equal(entry.status, 302); assert.equal(await entry.text(), '');
      assert.equal(entry.headers.get('set-cookie'), null); assert.equal(entry.headers.get('referrer-policy'), 'no-referrer');
    }
    assert.equal((await call(otherServer, path)).headers.get('location'), fallback);
    assert.equal(hooks, 1);
  } finally {
    await Promise.all([server, otherServer].map((entry) => new Promise((resolve, reject) => entry.close((error) => error ? reject(error) : resolve()))));
  }
}
