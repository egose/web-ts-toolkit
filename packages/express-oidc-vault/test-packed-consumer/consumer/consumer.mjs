import assert from 'node:assert';
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import http from 'node:http';

import express from 'express';
import { calculateJwkThumbprint, decodeJwt, exportJWK, SignJWT } from 'jose';

import {
  DEFAULT_AUTHORIZATION_TRANSACTION_TTL_MS,
  DEFAULT_EXCHANGE_CODE_TTL_MS,
  DEFAULT_OIDC_SCOPES,
  DEFAULT_OIDC_VAULT_BASE_PATH,
  DEFAULT_OIDC_VAULT_REQUEST_BODY_LIMIT,
  OIDC_VAULT_ROUTE_PATHS,
  OIDC_VAULT_URL_ENCODED_PARAMETER_LIMIT,
  OidcVaultStoreConflictError,
  OidcVaultDpopReplayCapacityError,
  createOidcVaultAccessTokenMiddleware,
  createOidcVaultJwtAccessTokenValidator,
  createOidcVaultMiddleware,
  normalizeOidcVaultBasePath,
  resolveOidcVaultConfig,
  resolveOidcVaultConfigFromEnv,
} from '@web-ts-toolkit/express-oidc-vault';

const expected = [
  'DEFAULT_AUTHORIZATION_TRANSACTION_TTL_MS',
  'DEFAULT_EXCHANGE_CODE_TTL_MS',
  'DEFAULT_OIDC_SCOPES',
  'DEFAULT_OIDC_VAULT_BASE_PATH',
  'DEFAULT_OIDC_VAULT_REQUEST_BODY_LIMIT',
  'OIDC_VAULT_ROUTE_PATHS',
  'OIDC_VAULT_URL_ENCODED_PARAMETER_LIMIT',
  'OidcVaultStoreConflictError',
  'OidcVaultDpopReplayCapacityError',
  'createOidcVaultAccessTokenMiddleware',
  'createOidcVaultJwtAccessTokenValidator',
  'createOidcVaultMiddleware',
  'normalizeOidcVaultBasePath',
  'resolveOidcVaultConfig',
  'resolveOidcVaultConfigFromEnv',
].sort();

const actual = Object.keys(await import('@web-ts-toolkit/express-oidc-vault')).sort();
assert.deepStrictEqual(actual, expected);
assert.strictEqual(DEFAULT_OIDC_SCOPES, 'openid email profile');
assert.strictEqual(DEFAULT_OIDC_VAULT_BASE_PATH, '/auth/oidc');
assert.strictEqual(DEFAULT_OIDC_VAULT_REQUEST_BODY_LIMIT, '16kb');
assert.strictEqual(DEFAULT_AUTHORIZATION_TRANSACTION_TTL_MS, 600_000);
assert.strictEqual(DEFAULT_EXCHANGE_CODE_TTL_MS, 30_000);
assert.strictEqual(OIDC_VAULT_URL_ENCODED_PARAMETER_LIMIT, 16);
assert.strictEqual(OIDC_VAULT_ROUTE_PATHS.login, '/login');
assert.strictEqual(typeof createOidcVaultAccessTokenMiddleware, 'function');
assert.strictEqual(typeof createOidcVaultJwtAccessTokenValidator, 'function');
assert.strictEqual(typeof createOidcVaultMiddleware, 'function');
assert.strictEqual(normalizeOidcVaultBasePath('custom'), '/custom');
assert.strictEqual(typeof resolveOidcVaultConfig, 'function');
assert.strictEqual(typeof resolveOidcVaultConfigFromEnv, 'function');
assert.ok(new OidcVaultStoreConflictError() instanceof Error);
assert.ok(new OidcVaultDpopReplayCapacityError() instanceof Error);
assert.strictEqual(new OidcVaultDpopReplayCapacityError().name, 'OidcVaultDpopReplayCapacityError');

// Real installed ESM authentication, exercising bundled internal verifier and
// request-aware declarations' runtime contract without any source deep import.
const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const jwk = await exportJWK(pair.publicKey);
const jkt = await calculateJwkThumbprint(jwk);
const secret = new Uint8Array(32).fill(19);
const token = await new SignJWT({ sub: 'packed-user', cnf: { jkt } }).setProtectedHeader({ alg: 'HS256' })
  .setIssuer('https://api.example.com').setAudience('packed-api').setExpirationTime('15m').sign(secret);
const validator = createOidcVaultJwtAccessTokenValidator({ key: secret, issuer: 'https://api.example.com', audience: 'packed-api', algorithms: ['HS256'], mapClaims: () => ({ subject: 'packed-mapped-user' }) });
assert.strictEqual(typeof validator.validateWithRequest, 'function');
assert.deepStrictEqual((await validator.validate(token)).confirmation, { jkt });
const now = Date.now();
const input = [
  { typ: 'dpop+jwt', alg: 'ES256', jwk },
  { htm: 'GET', htu: 'https://api.example.com/me', iat: Math.floor(now / 1000), jti: 'packed-proof-1', ath: createHash('sha256').update(token, 'ascii').digest('base64url') },
].map((value) => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
const proof = `${input}.${sign('sha256', Buffer.from(input), { key: pair.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
let reservation;
let routeCalls = 0;
const app = express();
app.use(createOidcVaultAccessTokenMiddleware({ validator, deviceBinding: {
  publicOrigin: 'https://api.example.com', replayNamespace: 'packed-api', now: () => now,
  replayStore: { async reserveDpopProof(value) { if (reservation) return false; reservation = value; return true; } },
} }), (req, res) => { routeCalls++; res.json(req.auth?.deviceBinding); });
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const call = (scheme = 'DPoP') => new Promise((resolve, reject) => {
  const req = http.request({ hostname: '127.0.0.1', port: server.address().port, path: '/me', headers: { Authorization: `${scheme} ${token}`, DPoP: proof }, agent: false }, (res) => {
    const chunks = [];
    res.on('data', (chunk) => chunks.push(chunk));
    res.on('end', () => { try { resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(Buffer.concat(chunks).toString()) }); } catch (error) { reject(error); } });
  });
  req.on('error', reject); req.end();
});
try {
  const accepted = await call();
  assert.strictEqual(accepted.status, 200);
  assert.deepStrictEqual(accepted.body, { type: 'dpop', jkt, alg: 'ES256' });
  assert.strictEqual(accepted.headers['cache-control'], 'no-store');
  assert.match(reservation.replayKey, /^dpop:v1:[A-Za-z0-9_-]{43}$/);
  const replay = await call();
  assert.strictEqual(replay.status, 401);
  assert.strictEqual(replay.body.code, 'OIDC_VAULT_INVALID_DPOP_PROOF');
  assert.strictEqual(replay.headers['www-authenticate'], 'DPoP error="invalid_dpop_proof", algs="ES256"');
  const downgrade = await call('Bearer');
  assert.strictEqual(downgrade.status, 401);
  assert.strictEqual(downgrade.body.code, 'OIDC_VAULT_DPOP_REQUIRED');
  assert.strictEqual(routeCalls, 1);
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

// DBJWT-04 real installed JSON POST initiation and headerless provider-error
// callback, using a small explicit portable adapter rather than workspace code.
// The same explicit adapter below is also used for installed guarded vault
// exchange/refresh/logout verification, with no workspace source deep imports.
const transactions = new Map();
const codes = new Map();
const sessions = new Map();
const aliases = new Map();
const reservedProofs = new Set();
let createdSessions = 0;
let createdCodes = 0;
let callbackConsumes = 0;
const portableStore = {
  async createAuthorizationTransaction(value) { transactions.set(value.state, structuredClone(value)); },
  async getAuthorizationTransaction(state) { return structuredClone(transactions.get(state) ?? null); },
  async consumeAuthorizationTransaction() { throw new Error('Legacy transaction consume must not run.'); },
  async consumeAuthorizationTransactionIfMatches({ state, match }) {
    const value = transactions.get(state);
    if (!value || value.expiresAt <= now || value.browserBindingHash !== match.browserBindingHash ||
      (value.deviceBinding ?? null)?.jkt !== match.deviceBinding?.jkt) return null;
    transactions.delete(state); callbackConsumes++; return structuredClone(value);
  },
  async createExchangeCode(value) { createdCodes++; codes.set(value.code, structuredClone(value)); },
  async getExchangeCode(code) { return structuredClone(codes.get(code) ?? null); },
  async consumeExchangeCode() { throw new Error('Legacy code consume must not run.'); },
  async consumeExchangeCodeIfMatches({ code, expectedSessionId, match }) {
    const value = codes.get(code);
    if (!value || value.expiresAt <= now || value.sessionId !== expectedSessionId ||
      value.browserBindingHash !== match.browserBindingHash || value.deviceBinding?.jkt !== match.deviceBinding?.jkt) return null;
    codes.delete(code); return structuredClone(value);
  },
  async createSession() { createdSessions++; throw new Error('No session on error callback.'); },
  async getSession(id) { return structuredClone(sessions.get(id) ?? null); },
  async getSessionRevocationContext(id) {
    const logicalId = sessions.get(id)?.logicalSessionId ?? aliases.get(id);
    const value = [...sessions.values()].find((item) => item.logicalSessionId === logicalId);
    return value ? structuredClone({ logicalSessionId: value.logicalSessionId, provider: value.provider, deviceBinding: value.deviceBinding }) : null;
  },
  async rotateSession({ sessionId, nextSession }) {
    const previous = sessions.get(sessionId);
    assert.ok(previous); assert.strictEqual(previous.deviceBinding?.jkt, nextSession.deviceBinding?.jkt);
    sessions.delete(sessionId); aliases.set(sessionId, previous.logicalSessionId);
    sessions.set(nextSession.sessionId, structuredClone(nextSession)); return structuredClone(nextSession);
  },
  async deleteSession() { throw new Error('Unconditional stale-alias deletion must not run.'); },
  async deleteSessionsByLogicalSessionId({ logicalSessionId }) {
    let removed = 0;
    for (const [id, value] of sessions) if (value.logicalSessionId === logicalSessionId) { sessions.delete(id); removed++; }
    for (const [id, value] of aliases) if (value === logicalSessionId) aliases.delete(id);
    return removed;
  },
  async deleteSessionsBySubject() { return 0; },
  async deleteSessionsByProviderSessionId() { return 0; },
  async consumeBackchannelLogoutTokenJti() { return false; },
  async reserveDpopProof({ replayKey }) { if (reservedProofs.has(replayKey)) return false; reservedProofs.add(replayKey); return true; },
};
const loginApp = express();
loginApp.use(createOidcVaultMiddleware({
  backendOrigin: 'https://api.example.com', frontendRedirectUri: 'https://app.example.com/callback',
  trustedOrigins: ['https://app.example.com'], deviceBinding: { mode: 'required' },
  transactionCookie: { name: '__Host-packed_transaction', sameSite: 'lax' }, now: () => now, storeProvider: portableStore,
  config: { issuer: 'https://issuer.example.com', clientId: 'packed-client',
    authorizationEndpoint: 'https://issuer.example.com/authorize', tokenEndpoint: 'https://issuer.example.com/token',
    jwksUri: 'https://issuer.example.com/jwks' },
}));
const loginProofInput = [
  { typ: 'dpop+jwt', alg: 'ES256', jwk },
  { htm: 'POST', htu: 'https://api.example.com/auth/oidc/login', iat: Math.floor(now / 1000), jti: 'packed-login-proof' },
].map((value) => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
const loginProof = `${loginProofInput}.${sign('sha256', Buffer.from(loginProofInput), { key: pair.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
const loginServer = loginApp.listen(0, '127.0.0.1');
await new Promise((resolve) => loginServer.once('listening', resolve));
const loginCall = (method, path, headers = {}, body) => new Promise((resolve, reject) => {
  const req = http.request({ hostname: '127.0.0.1', port: loginServer.address().port, method, path, headers, agent: false }, (res) => {
    const chunks = [];
    res.on('data', (chunk) => chunks.push(chunk));
    res.on('end', () => { try { resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(Buffer.concat(chunks).toString()) }); } catch (error) { reject(error); } });
  });
  req.on('error', reject); req.end(body);
});
try {
  const requiredGet = await loginCall('GET', '/auth/oidc/login');
  assert.strictEqual(requiredGet.status, 401);
  assert.strictEqual(requiredGet.body.code, 'OIDC_VAULT_DEVICE_BINDING_REQUIRED');
  const postHeaders = { Origin: 'https://app.example.com', 'Content-Type': 'application/json', DPoP: loginProof };
  const started = await loginCall('POST', '/auth/oidc/login', postHeaders, JSON.stringify({ returnTo: '/done' }));
  assert.strictEqual(started.status, 200);
  assert.deepStrictEqual(Object.keys(started.body), ['authorizationUrl']);
  const state = new URL(started.body.authorizationUrl).searchParams.get('state');
  const line = started.headers['set-cookie'][0];
  assert.match(line, /^__Host-packed_transaction=[A-Za-z0-9_-]{43}; Path=\/; SameSite=Lax; HttpOnly; Secure; Max-Age=600;/);
  const cookie = line.split(';', 1)[0];
  const transaction = transactions.get(state);
  assert.deepStrictEqual(transaction.deviceBinding, { type: 'dpop', jkt });
  assert.strictEqual(transaction.browserBindingHash, createHash('sha256').update(cookie.split('=')[1], 'ascii').digest('base64url'));
  assert.strictEqual(transaction.returnTo, 'https://app.example.com/done');
  const transferred = await loginCall('GET', `/auth/oidc/callback?state=${state}&error=private-provider-error`);
  assert.strictEqual(transferred.body.code, 'OIDC_VAULT_INVALID_BROWSER_BINDING');
  assert.strictEqual(transferred.headers['set-cookie'], undefined);
  assert.strictEqual(transactions.size, 1);
  const completedError = await loginCall('GET', `/auth/oidc/callback?state=${state}&error=private-provider-error`, { Cookie: cookie });
  assert.strictEqual(completedError.status, 400);
  assert.deepStrictEqual(completedError.body, { code: 'OIDC_VAULT_CALLBACK_ERROR', message: 'OIDC callback failed.' });
  assert.match(completedError.headers['set-cookie'][0], /Max-Age=0;/);
  assert.strictEqual(transactions.size, 0);
  assert.strictEqual(callbackConsumes, 1);
  assert.strictEqual(createdSessions, 0);
  assert.strictEqual(createdCodes, 0);
  const repeated = await loginCall('POST', '/auth/oidc/login', postHeaders, '{}');
  assert.strictEqual(repeated.body.code, 'OIDC_VAULT_INVALID_DPOP_PROOF');
  assert.strictEqual(repeated.headers['set-cookie'], undefined);
} finally {
  await new Promise((resolve, reject) => loginServer.close((error) => error ? reject(error) : resolve()));
}

// DBJWT-09: installed fingerprint-only POST enables the cookie flow, captures
// just a hash, and rejects ambiguous signal/proof input before allocation.
const recognitionSignal = 'packed-browser-recognition';
const recognitionHash = createHash('sha256').update(recognitionSignal, 'ascii').digest('base64url');
const recognitionApp = express();
recognitionApp.use(createOidcVaultMiddleware({
  backendOrigin: 'https://api.example.com', frontendRedirectUri: 'https://app.example.com/callback',
  trustedOrigins: ['https://app.example.com'], fingerprintRecognition: {}, now: () => now, storeProvider: portableStore,
  config: { issuer: 'https://issuer.example.com', clientId: 'packed-client', authorizationEndpoint: 'https://issuer.example.com/authorize',
    tokenEndpoint: 'https://issuer.example.com/token', jwksUri: 'https://issuer.example.com/jwks' },
}));
const recognitionServer = recognitionApp.listen(0, '127.0.0.1');
await new Promise((resolve) => recognitionServer.once('listening', resolve));
const recognitionCall = (headers) => new Promise((resolve, reject) => {
  const req = http.request({ hostname: '127.0.0.1', port: recognitionServer.address().port, method: 'POST', path: '/auth/oidc/login', agent: false,
    headers: ['Host', `127.0.0.1:${recognitionServer.address().port}`, 'Connection', 'close', 'Origin', 'https://app.example.com',
      'Content-Type', 'application/json', 'Content-Length', '2', ...headers] }, (res) => {
    const chunks = []; res.on('data', (chunk) => chunks.push(chunk)); res.on('error', reject);
    res.on('end', () => { try { resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(Buffer.concat(chunks).toString()) }); } catch (error) { reject(error); } });
  });
  req.on('error', reject); req.end('{}');
});
try {
  const duplicate = await recognitionCall(['X-Device-Fingerprint', recognitionSignal, 'x-device-fingerprint', recognitionSignal]);
  assert.strictEqual(duplicate.status, 400); assert.strictEqual(duplicate.body.code, 'OIDC_VAULT_INVALID_FINGERPRINT');
  assert.strictEqual(transactions.size, 0);
  const unsupportedProof = await recognitionCall(['X-Device-Fingerprint', recognitionSignal, 'DPoP', loginProof]);
  assert.strictEqual(unsupportedProof.status, 401); assert.strictEqual(unsupportedProof.body.code, 'OIDC_VAULT_INVALID_DPOP_PROOF');
  assert.strictEqual(transactions.size, 0);
  const recognized = await recognitionCall(['X-Device-Fingerprint', recognitionSignal]);
  assert.strictEqual(recognized.status, 200);
  const state = new URL(recognized.body.authorizationUrl).searchParams.get('state');
  assert.deepStrictEqual(transactions.get(state).metadata.oidcVaultFingerprintRecognition, { version: 1, hash: recognitionHash });
  assert.strictEqual(transactions.get(state).deviceBinding, undefined);
  assert.match(recognized.headers['set-cookie'][0], /^__Host-oidc_vault_transaction=/);
  assert.ok(!JSON.stringify(transactions.get(state)).includes(recognitionSignal));
  assert.ok(!JSON.stringify(recognized.body).includes(recognitionHash));
  const unenrolled = await recognitionCall([]);
  assert.strictEqual(unenrolled.status, 200);
  const unenrolledState = new URL(unenrolled.body.authorizationUrl).searchParams.get('state');
  assert.strictEqual(transactions.get(unenrolledState).metadata.oidcVaultFingerprintRecognition, undefined);
} finally {
  await new Promise((resolve, reject) => recognitionServer.close((error) => error ? reject(error) : resolve()));
}

// DBJWT-05: actual installed ESM bundle in both transports, using explicit
// guarded session/code fixtures and a counted upstream refresh transport.
let proofSequence = 0;
const vaultProof = (route, proofPair = pair, publicJwk = jwk) => {
  const input = [{ typ: 'dpop+jwt', alg: 'ES256', jwk: publicJwk },
    { htm: 'POST', htu: `https://api.example.com/auth/oidc/${route}`, iat: Math.floor(now / 1000), jti: `packed-vault-${++proofSequence}` }]
    .map((value) => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
  return `${input}.${sign('sha256', Buffer.from(input), { key: proofPair.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
};
const wrongPair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const wrongJwk = await exportJWK(wrongPair.publicKey);
const nativeFetch = globalThis.fetch;
let refreshCalls = 0;
globalThis.fetch = async (url, init) => {
  assert.strictEqual(String(url), 'https://issuer.example.com/token');
  const params = new URLSearchParams(String(init.body));
  assert.strictEqual(params.get('grant_type'), 'refresh_token');
  assert.match(params.get('refresh_token'), /^packed-refresh:/);
  refreshCalls++;
  return Response.json({ token_type: 'Bearer', refresh_token: `packed-refresh:rotated-${refreshCalls}` });
};
try {
  for (const [sessionTransport, bound] of [['body', true], ['cookie', true], ['body', false], ['cookie', false]]) {
    const initialId = `sess_packed_${sessionTransport}_${bound}`;
    const logicalSessionId = `lineage_packed_${sessionTransport}_${bound}`;
    const transactionSecret = randomBytes(32).toString('base64url');
    const code = `packed-code-${sessionTransport}-${bound}`;
    const initial = { sessionId: initialId, logicalSessionId, subject: 'packed-user', provider: { issuer: 'https://issuer.example.com', clientId: 'packed-client' },
      ...(bound ? { deviceBinding: { type: 'dpop', jkt } } : {}), refreshToken: `packed-refresh:${sessionTransport}`, idToken: 'previously-verified-id',
      user: { sub: 'packed-user' }, metadata: { oidcVaultFingerprintRecognition: { version: 1, hash: recognitionHash } },
      expiresAt: now + 120_000, createdAt: now, updatedAt: now };
    sessions.set(initialId, structuredClone(initial));
    codes.set(code, { code, sessionId: initialId, ...(bound ? { deviceBinding: { type: 'dpop', jkt } } : {}),
      browserBindingHash: createHash('sha256').update(transactionSecret, 'ascii').digest('base64url'), createdAt: now, expiresAt: now + 30_000 });
    const sessionApp = express();
    sessionApp.use(createOidcVaultMiddleware({
      backendOrigin: 'https://api.example.com', trustedOrigins: ['https://app.example.com'], sessionTransport,
      transactionCookie: { name: '__Host-packed_transaction' }, now: () => now, storeProvider: portableStore, fingerprintRecognition: {},
      ...(bound ? { deviceBinding: { mode: 'required' } } : {}),
      config: { issuer: 'https://issuer.example.com', clientId: 'packed-client', authorizationEndpoint: 'https://issuer.example.com/authorize',
        tokenEndpoint: 'https://issuer.example.com/token', jwksUri: 'https://issuer.example.com/jwks' },
      tokenIssuer: { async issue({ session, deviceBinding }) {
        assert.deepStrictEqual(deviceBinding, bound ? { type: 'dpop', jkt, alg: 'ES256' } : undefined);
        if (bound) assert.ok(Object.isFrozen(deviceBinding));
        assert.strictEqual(session.metadata.oidcVaultFingerprintRecognition, undefined);
        return { accessToken: await new SignJWT({ sub: session.subject, sid: session.sessionId, ...(bound ? { cnf: { jkt: deviceBinding.jkt } } : {}) })
          .setProtectedHeader({ alg: 'HS256' }).setIssuer('https://api.example.com').setAudience('packed-api').setExpirationTime('15m').sign(secret),
          expiresIn: 900, tokenType: bound ? 'DPoP' : 'Bearer' };
      } },
    }));
    const sessionServer = sessionApp.listen(0, '127.0.0.1');
    await new Promise((resolve) => sessionServer.once('listening', resolve));
    const post = (route, body, cookie, proof, fingerprint = recognitionSignal) => new Promise((resolve, reject) => {
      const encodedBody = JSON.stringify(body);
      const req = http.request({ hostname: '127.0.0.1', port: sessionServer.address().port, path: `/auth/oidc/${route}`, method: 'POST', agent: false,
        headers: { Origin: 'https://app.example.com', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(encodedBody),
          ...(cookie ? { Cookie: cookie } : {}), ...(proof ? { DPoP: proof } : {}),
          ...(fingerprint === null ? {} : { 'X-Device-Fingerprint': fingerprint }) } }, (res) => {
        const chunks = []; res.on('data', (chunk) => chunks.push(chunk)); res.on('error', reject);
        res.on('end', () => { try { resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(Buffer.concat(chunks).toString()) }); } catch (error) { reject(error); } });
      });
      req.on('error', reject); req.end(encodedBody);
    });
    try {
      const transactionCookie = `__Host-packed_transaction=${transactionSecret}`;
      const missingRecognition = await post('exchange', { code }, transactionCookie, bound ? vaultProof('exchange') : undefined, null);
      assert.strictEqual(missingRecognition.status, 403); assert.strictEqual(missingRecognition.body.code, 'OIDC_VAULT_FINGERPRINT_REAUTH_REQUIRED'); assert.ok(codes.has(code));
      if (bound) {
        const missing = await post('exchange', { code }, transactionCookie);
        assert.strictEqual(missing.body.code, 'OIDC_VAULT_DPOP_REQUIRED'); assert.ok(codes.has(code));
      }
      const stolen = await post('exchange', { code }, undefined, bound ? vaultProof('exchange') : undefined);
      assert.strictEqual(stolen.body.code, 'OIDC_VAULT_INVALID_BROWSER_BINDING'); assert.ok(codes.has(code));
      if (bound) {
        const wrong = await post('exchange', { code }, transactionCookie, vaultProof('exchange', wrongPair, wrongJwk));
        assert.strictEqual(wrong.body.code, 'OIDC_VAULT_INVALID_DPOP_PROOF'); assert.ok(codes.has(code));
      }
      const exchanged = await post('exchange', { code }, transactionCookie, bound ? vaultProof('exchange') : undefined);
      assert.strictEqual(exchanged.status, 200); assert.strictEqual(exchanged.body.tokenType, bound ? 'DPoP' : 'Bearer'); assert.ok(!codes.has(code));
      assert.deepStrictEqual(decodeJwt(exchanged.body.accessToken).cnf, bound ? { jkt } : undefined);
      assert.ok(!JSON.stringify(exchanged.body).includes(recognitionHash));
      assert.match(exchanged.headers['set-cookie'].find((line) => line.startsWith('__Host-packed_transaction=')), /Max-Age=0;/);
      assert.strictEqual(exchanged.body.sessionId, sessionTransport === 'body' ? initialId : undefined);
      const cookie = sessionTransport === 'cookie' ? `oidc_vault_session=${initialId}` : undefined;
      const beforeCalls = refreshCalls;
      const changedRefresh = await post('refresh', sessionTransport === 'body' ? { sessionId: initialId } : {}, cookie, bound ? vaultProof('refresh') : undefined, 'different-recognition');
      assert.strictEqual(changedRefresh.status, 403); assert.strictEqual(changedRefresh.body.code, 'OIDC_VAULT_FINGERPRINT_REAUTH_REQUIRED'); assert.strictEqual(refreshCalls, beforeCalls);
      if (bound) {
        const missingRefresh = await post('refresh', sessionTransport === 'body' ? { sessionId: initialId } : {}, cookie);
        assert.strictEqual(missingRefresh.body.code, 'OIDC_VAULT_DPOP_REQUIRED'); assert.strictEqual(refreshCalls, beforeCalls);
      }
      const refreshed = await post('refresh', sessionTransport === 'body' ? { sessionId: initialId } : {}, cookie, bound ? vaultProof('refresh') : undefined);
      assert.strictEqual(refreshed.status, 200); assert.strictEqual(refreshCalls, beforeCalls + 1);
      const nextId = sessionTransport === 'body' ? refreshed.body.sessionId : refreshed.headers['set-cookie'][0].split(';')[0].split('=')[1];
      assert.notStrictEqual(nextId, initialId); assert.strictEqual(sessions.get(nextId).logicalSessionId, logicalSessionId);
      assert.strictEqual(sessions.get(nextId).expiresAt, initial.expiresAt); assert.deepStrictEqual(sessions.get(nextId).deviceBinding, bound ? { type: 'dpop', jkt } : undefined);
      assert.deepStrictEqual(sessions.get(nextId).metadata.oidcVaultFingerprintRecognition, { version: 1, hash: recognitionHash });
      if (bound) {
        const missingAlias = await post('logout', sessionTransport === 'body' ? { sessionId: initialId } : {}, cookie, undefined, null);
        assert.strictEqual(missingAlias.body.code, 'OIDC_VAULT_DPOP_REQUIRED'); assert.ok(sessions.has(nextId));
      }
      const loggedOut = await post('logout', sessionTransport === 'body' ? { sessionId: initialId } : {}, cookie, bound ? vaultProof('logout') : undefined, null);
      assert.strictEqual(loggedOut.status, 200); assert.deepStrictEqual(loggedOut.body, { loggedOut: true }); assert.ok(!sessions.has(nextId));
    } finally {
      await new Promise((resolve, reject) => sessionServer.close((error) => error ? reject(error) : resolve()));
    }
  }
} finally {
  globalThis.fetch = nativeFetch;
}
