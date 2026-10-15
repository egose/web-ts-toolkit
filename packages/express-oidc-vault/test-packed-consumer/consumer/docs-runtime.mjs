import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import http from 'node:http';
import express from 'express';
import { calculateJwkThumbprint, decodeJwt, SignJWT } from 'jose';

const load = process.argv[2] === 'cjs' ? createRequire(import.meta.url) : (name) => import(name);
const core = await load('@web-ts-toolkit/express-oidc-vault');
const memory = await load('@web-ts-toolkit/express-oidc-vault-memory-store');
const client = await load('@web-ts-toolkit/oidc-vault-dpop-client');
const { getWithProof } = await import('./compiled-readme/readme-proof.js');
const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
await assert.rejects(crypto.subtle.exportKey('jwk', pair.privateKey));
const exported = await crypto.subtle.exportKey('jwk', pair.publicKey);
const publicJwk = { kty: 'EC', crv: 'P-256', x: exported.x, y: exported.y };
const key = { privateKey: pair.privateKey, publicJwk, jkt: await calculateJwkThumbprint(publicJwk), scopeId: 'docs' };
const secret = crypto.getRandomValues(new Uint8Array(32));
const jwt = await new SignJWT({ sub: 'docs-user', cnf: { jkt: key.jkt } }).setProtectedHeader({ alg: 'HS256' })
  .setIssuer('https://api.example.com').setAudience('app-api-v1').setExpirationTime('5m').sign(secret);
const app = express();
app.get('/api/profile', core.createOidcVaultAccessTokenMiddleware({
  validator: core.createOidcVaultJwtAccessTokenValidator({ key: secret, issuer: 'https://api.example.com',
    audience: 'app-api-v1', algorithms: ['HS256'], mapClaims: () => ({ subject: 'mapped-docs-user' }) }),
  deviceBinding: { mode: 'required', publicOrigin: 'https://api.example.com', replayNamespace: 'app-api-v1',
    replayStore: memory.createMemoryOidcVaultStore() },
}), (req, res) => res.json({ subject: req.auth.subject, binding: req.auth.deviceBinding.jkt }));
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const nativeFetch = globalThis.fetch;
const proofs = [];
// Model a pinned public origin terminating at loopback; only HTTP transport is
// redirected. The compiled README creates the proof and request headers itself.
globalThis.fetch = (url, init) => {
  assert.equal(url, 'https://api.example.com/api/profile?view=summary');
  assert.equal(init.credentials, 'omit');
  assert.equal(init.redirect, 'error');
  assert.equal(init.cache, 'no-store');
  const headers = new Headers(init.headers);
  proofs.push(headers.get('DPoP'));
  assert.equal(headers.get('Authorization'), `DPoP ${jwt}`);
  return nativeFetch(`http://127.0.0.1:${server.address().port}/api/profile?view=summary`, init);
};
const call = (proof, scheme = 'DPoP') => new Promise((resolve, reject) => {
  const req = http.request({ hostname: '127.0.0.1', port: server.address().port, path: '/api/profile',
    headers: { Authorization: `${scheme} ${jwt}`, DPoP: proof }, agent: false }, (res) => {
    const chunks = [];
    res.on('data', (chunk) => chunks.push(chunk));
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(Buffer.concat(chunks).toString()) }));
  });
  req.on('error', reject); req.end();
});
try {
  const accepted = await getWithProof(key, jwt);
  assert.equal(accepted.status, 200);
  assert.deepEqual(await accepted.json(), { subject: 'mapped-docs-user', binding: key.jkt });
  assert.equal(accepted.headers.get('cache-control'), 'no-store');
  const second = await getWithProof(key, jwt);
  assert.equal(second.status, 200);
  await second.json();
  assert.equal(proofs.length, 2);
  assert.equal(decodeJwt(proofs[0]).htu, 'https://api.example.com/api/profile');
  assert.notEqual(decodeJwt(proofs[1]).jti, decodeJwt(proofs[0]).jti);
  assert.equal(decodeJwt(proofs[0]).jti.length, 22); // 128 random bits.
  assert.equal((await call(proofs[0])).body.code, 'OIDC_VAULT_INVALID_DPOP_PROOF');
  const fresh = await client.createDpopProof(key, { method: 'GET', url: 'https://api.example.com/api/profile', accessToken: jwt });
  assert.equal((await call(fresh, 'Bearer')).body.code, 'OIDC_VAULT_DPOP_REQUIRED');
  assert.equal((await call(fresh)).status, 200); // Failed Bearer use did not reserve the proof.
  const postProof = await client.createDpopProof(key, { method: 'POST', url: 'https://api.example.com/auth/oidc/refresh' });
  assert.equal(Object.hasOwn(decodeJwt(postProof), 'ath'), false);
} finally {
  globalThis.fetch = nativeFetch;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
