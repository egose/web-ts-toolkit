import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomUUID } from 'node:crypto';
import http from 'node:http';
import { createRequire } from 'node:module';

import express from 'express';
import { calculateJwkThumbprint, exportJWK, SignJWT } from 'jose';

const require = createRequire(import.meta.url);
const core =
  process.argv[2] === 'cjs'
    ? require('@web-ts-toolkit/express-oidc-vault')
    : await import('@web-ts-toolkit/express-oidc-vault');
const {
  createOidcVaultAuthenticator,
  createOidcVaultJwtAccessTokenValidator,
  OidcVaultInvalidAccessTokenError,
  OidcVaultAuthDeniedError,
} = core;
const { createMemoryOidcVaultStore } =
  process.argv[2] === 'cjs'
    ? require('@web-ts-toolkit/express-oidc-vault-memory-store')
    : await import('@web-ts-toolkit/express-oidc-vault-memory-store');

const key = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const jwk = await exportJWK(key.publicKey);
const jkt = await calculateJwkThumbprint(jwk);
const secret = new Uint8Array(32).fill(61);
const origin = 'https://api.example.com';
const tokenFor = (subject, bound) =>
  new SignJWT({ sub: subject, ...(bound ? { cnf: { jkt } } : {}) })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(origin)
    .setAudience('packed-optional')
    .setExpirationTime('15m')
    .sign(secret);
const proofFor = (token, path) =>
  new SignJWT({
    htm: 'GET',
    htu: `${origin}${path}`,
    iat: Math.floor(Date.now() / 1000),
    jti: randomUUID(),
    ath: createHash('sha256').update(token, 'ascii').digest('base64url'),
  })
    .setProtectedHeader({ typ: 'dpop+jwt', alg: 'ES256', jwk })
    .sign(key.privateKey);
const validator = createOidcVaultJwtAccessTokenValidator({
  key: secret,
  issuer: origin,
  audience: 'packed-optional',
  algorithms: ['HS256'],
});
const store = createMemoryOidcVaultStore();
let validations = 0;
let reservations = 0;
let enrichments = 0;
const diagnostics = [];
const auth = createOidcVaultAuthenticator({
  onDpopDiagnostic(event) {
    diagnostics.push(event);
    return Promise.reject(new Error('private-diagnostic-observer'));
  },
  authentication: 'optional',
  invalidCredentials: 'anonymous',
  validator: {
    validate: validator.validate,
    async validateWithRequest(input) {
      validations++;
      if (input.token === 'rejected') throw new OidcVaultInvalidAccessTokenError('private adapter rejection');
      if (input.token === 'outage') throw new Error('private adapter outage');
      return validator.validateWithRequest(input);
    },
  },
  deviceBinding: {
    publicOrigin: origin,
    replayNamespace: 'packed-optional',
    replayStore: {
      async reserveDpopProof(input) {
        reservations++;
        return store.reserveDpopProof(input);
      },
    },
  },
  onAuthContext({ auth, res }) {
    enrichments++;
    if (auth.subject === 'denied') throw new OidcVaultAuthDeniedError('Account access denied.');
    if (auth.subject === 'broken') throw new Error('private enrichment failure');
    res.locals.user = { id: auth.subject };
  },
});
assert.ok(Object.isFrozen(auth));
assert.ok(new OidcVaultInvalidAccessTokenError() instanceof Error);
assert.ok(new OidcVaultAuthDeniedError() instanceof Error);
const app = express();
app.use(auth.authenticate);
const session = (req, res) =>
  res.json({ authenticated: !!req.auth, user: res.locals.user ?? null, binding: req.auth?.deviceBinding ?? null });
app.get('/session', session);
app.get('/private', auth.requireAuth, session);
app.get('/bound', auth.requireAuth, auth.requireDeviceBinding, auth.requireAuth, auth.requireDeviceBinding, session);
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const call = (path, headers = {}) =>
  new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port: server.address().port, path, headers, agent: false },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('error', reject);
        res.on('end', () => {
          try {
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: JSON.parse(Buffer.concat(chunks).toString()),
            });
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
try {
  assert.deepEqual((await call('/session')).body, { authenticated: false, user: null, binding: null });
  assert.equal((await call('/private')).status, 401);
  const token = await tokenFor('packed-user', true);
  const proof = await proofFor(token, '/bound');
  const accepted = await call('/bound', { Authorization: `DPoP ${token}`, DPoP: proof });
  assert.equal(accepted.status, 200);
  assert.deepEqual(accepted.body, {
    authenticated: true,
    user: { id: 'packed-user' },
    binding: { type: 'dpop', jkt, alg: 'ES256' },
  });
  assert.deepEqual([validations, reservations, enrichments], [1, 1, 1]);
  assert.equal(diagnostics.at(-1).reason, 'proof-accepted');
  assert.equal(diagnostics.at(-1).correlation.association, 'authenticated');
  assert.equal(diagnostics.at(-1).verification.replay, 'reserved');
  assert.equal(diagnostics.filter((event) => event.stage === 'proof').length, 1);
  assert.ok(!JSON.stringify(diagnostics).includes(token));
  assert.ok(!JSON.stringify(diagnostics).includes(proof));
  assert.ok(!JSON.stringify(diagnostics).includes('packed-user'));
  assert.equal((await call('/bound', { Authorization: `DPoP ${token}`, DPoP: proof })).status, 401);
  assert.equal(diagnostics.at(-1).reason, 'replay-detected');
  assert.equal(diagnostics.at(-1).correlation.association, 'verified-token');
  const downgrade = await call('/session', { Authorization: `Bearer ${token}` });
  assert.equal(downgrade.status, 200);
  assert.equal(downgrade.body.authenticated, false);
  assert.equal(downgrade.headers['www-authenticate'], undefined);
  assert.equal(downgrade.headers['dpop-nonce'], undefined);
  assert.equal(downgrade.headers['cache-control'], 'no-store');
  assert.equal((await call('/session', { Authorization: 'Bearer rejected' })).body.authenticated, false);
  assert.equal((await call('/session', { Authorization: 'Bearer outage' })).status, 401);
  const bearer = await tokenFor('bearer-user', false);
  assert.equal((await call('/private', { Authorization: `Bearer ${bearer}` })).body.authenticated, true);
  assert.equal(
    (await call('/bound', { Authorization: `Bearer ${bearer}` })).body.code,
    'OIDC_VAULT_DEVICE_BINDING_REQUIRED',
  );
  const denied = await call('/session', { Authorization: `Bearer ${await tokenFor('denied', false)}` });
  assert.equal(denied.status, 403);
  assert.equal(denied.body.code, 'OIDC_VAULT_AUTH_DENIED');
  const failed = await call('/session', { Authorization: `Bearer ${await tokenFor('broken', false)}` });
  assert.equal(failed.status, 500);
  assert.equal(failed.body.code, 'OIDC_VAULT_AUTH_CONTEXT_FAILED');
  assert.ok(!JSON.stringify(failed.body).includes('private'));
} finally {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}
