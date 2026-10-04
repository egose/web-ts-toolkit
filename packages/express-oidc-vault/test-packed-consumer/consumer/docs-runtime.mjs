import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import http from 'node:http';
import express from 'express';
import { calculateJwkThumbprint, decodeJwt, SignJWT } from 'jose';

const load = process.argv[2] === 'cjs' ? createRequire(import.meta.url) : (name) => import(name);
const core = await load('@web-ts-toolkit/express-oidc-vault');
const memory = await load('@web-ts-toolkit/express-oidc-vault-memory-store');
globalThis.location = { origin: 'https://frontend.example.com' };
const { signRequestProof } = await import('./compiled-readme/readme-browser.js');
const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
await assert.rejects(crypto.subtle.exportKey('jwk', pair.privateKey));
const exported = await crypto.subtle.exportKey('jwk', pair.publicKey);
const publicJwk = { kty: 'EC', crv: 'P-256', x: exported.x, y: exported.y };
const key = { privateKey: pair.privateKey, publicJwk, jkt: await calculateJwkThumbprint(publicJwk) };
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
const target = new URL('https://api.example.com/api/profile?ignored=query');
const proof = await signRequestProof(key, 'GET', target, jwt);
assert.equal(decodeJwt(proof).htu, 'https://api.example.com/api/profile');
const fresh = await signRequestProof(key, 'GET', target, jwt);
assert.notEqual(decodeJwt(fresh).jti, decodeJwt(proof).jti);
assert.equal(decodeJwt(proof).jti.length, 22); // 128 random bits.
const postProof = decodeJwt(await signRequestProof(key, 'POST', new URL('https://api.example.com/auth/oidc/refresh')));
assert.equal(Object.hasOwn(postProof, 'ath'), false);
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
  const accepted = await call(proof);
  assert.equal(accepted.status, 200);
  assert.deepEqual(accepted.body, { subject: 'mapped-docs-user', binding: key.jkt });
  assert.equal(accepted.headers['cache-control'], 'no-store');
  assert.equal((await call(proof)).body.code, 'OIDC_VAULT_INVALID_DPOP_PROOF');
  assert.equal((await call(fresh, 'Bearer')).body.code, 'OIDC_VAULT_DPOP_REQUIRED');
  assert.equal((await call(fresh)).status, 200);
} finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
