import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import http from 'node:http';
import { createRequire } from 'node:module';

import express from 'express';
import { calculateJwkThumbprint, exportJWK, SignJWT } from 'jose';

const require = createRequire(import.meta.url);
const cjs = process.argv[2] === 'cjs';
const { createOidcVaultMiddleware } = cjs
  ? require('@web-ts-toolkit/express-oidc-vault')
  : await import('@web-ts-toolkit/express-oidc-vault');
const { createMemoryOidcVaultStore } = cjs
  ? require('@web-ts-toolkit/express-oidc-vault-memory-store')
  : await import('@web-ts-toolkit/express-oidc-vault-memory-store');
const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const jwk = await exportJWK(pair.publicKey);
const jkt = await calculateJwkThumbprint(jwk);
const key = new Uint8Array(32).fill(73);
const now = Date.now();
const origin = 'https://api.example.com';
const issuer = 'https://issuer.example.com';
const proofFor = (route) =>
  new SignJWT({
    htm: 'POST',
    htu: `${origin}/vault/${route}`,
    iat: Math.floor(now / 1000),
    jti: randomUUID(),
  })
    .setProtectedHeader({ typ: 'dpop+jwt', alg: 'ES256', jwk })
    .sign(pair.privateKey);
const nativeFetch = globalThis.fetch;
globalThis.fetch = async () => Response.json({ token_type: 'Bearer', refresh_token: 'private-rotated-refresh' });
try {
  for (const sessionTransport of ['body', 'cookie']) {
    const transactionSecret = randomBytes(32).toString('base64url');
    const store = createMemoryOidcVaultStore({ now: () => now });
    const session = await store.createSession({
      sessionId: 'private-session',
      logicalSessionId: 'private-lineage',
      subject: 'private-subject',
      provider: { issuer, clientId: 'packed-client' },
      deviceBinding: { type: 'dpop', jkt },
      refreshToken: 'private-refresh',
      idToken: 'private-id',
      metadata: { secret: 'private-metadata' },
    });
    await store.createExchangeCode({
      code: 'private-code',
      sessionId: session.sessionId,
      browserBindingHash: createHash('sha256').update(transactionSecret, 'ascii').digest('base64url'),
      deviceBinding: session.deviceBinding,
      createdAt: now,
      expiresAt: now + 30_000,
    });
    const diagnostics = [];
    const outcomes = [];
    const operations = [];
    let errors = 0;
    let invalidOutput = false;
    const app = express();
    app.use(
      createOidcVaultMiddleware({
        basePath: '/vault',
        backendOrigin: origin,
        sessionTransport,
        storeProvider: store,
        now: () => now,
        deviceBinding: { mode: 'required' },
        config: {
          issuer,
          clientId: 'packed-client',
          authorizationEndpoint: `${issuer}/authorize`,
          tokenEndpoint: `${issuer}/token`,
          jwksUri: `${issuer}/jwks`,
        },
        onDpopDiagnostic(event) {
          diagnostics.push(event);
        },
        onTokenOutcome(event) {
          outcomes.push(event);
          if (event.kind === 'token-issued') throw new Error('private-outcome-observer');
          return Promise.reject(new Error('private-outcome-observer'));
        },
        hooks: {
          onError() {
            errors++;
          },
          onSessionRefreshed() {
            throw new Error('private-postcommit-observer');
          },
        },
        tokenIssuer: {
          async issue({ operation, session, deviceBinding }) {
            operations.push(operation);
            assert.equal(deviceBinding.jkt, jkt);
            const accessToken = await new SignJWT({
              sub: session.subject,
              cnf: { jkt: deviceBinding.jkt },
              exp: Math.floor(now / 1000) + 60,
            })
              .setProtectedHeader({ alg: 'HS256' })
              .sign(key);
            return { accessToken, expiresIn: invalidOutput ? -1 : 60, tokenType: 'DPoP' };
          },
        },
      }),
    );
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const post = async (route, sessionId = session.sessionId) => {
      const cookies = [
        ...(sessionTransport === 'cookie' ? [`oidc_vault_session=${sessionId}`] : []),
        ...(route === 'exchange' ? [`__Host-oidc_vault_transaction=${transactionSecret}`] : []),
      ].join('; ');
      const body = JSON.stringify(route === 'exchange' ? { code: 'private-code' } : { sessionId });
      const proof = await proofFor(route);
      return new Promise((resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: server.address().port,
            path: `/vault/${route}?secret=private-query`,
            method: 'POST',
            agent: false,
            headers: {
              Origin: origin,
              DPoP: proof,
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(body),
              ...(cookies ? { Cookie: cookies } : {}),
            },
          },
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
        req.end(body);
      });
    };
    try {
      const exchanged = await post('exchange');
      assert.equal(exchanged.status, 200);
      assert.deepEqual(
        outcomes.map((event) => [event.kind, event.operation]),
        [
          ['token-issued', 'exchange'],
          ['exchange-succeeded', 'exchange'],
        ],
      );
      assert.equal(diagnostics.at(-1).correlation.association, 'authenticated');
      assert.equal(diagnostics.at(-1).verification.replay, 'reserved');
      const refreshed = await post('refresh');
      assert.equal(refreshed.status, 200);
      assert.equal(errors, 1); // Existing postcommit failure only; new observers never recurse into onError.
      assert.deepEqual(operations, ['exchange', 'refresh']);
      assert.equal(outcomes.length, 3);
      assert.equal(outcomes[2].operation, 'refresh');
      for (const event of outcomes) {
        assert.ok(Object.isFrozen(event));
        assert.ok(Object.isFrozen(event.correlation));
      }
      assert.equal(outcomes[0].correlation.sessionRef, outcomes[2].correlation.sessionRef);
      const nextId =
        sessionTransport === 'body'
          ? refreshed.body.sessionId
          : refreshed.headers['set-cookie'][0].split(';')[0].split('=')[1];
      invalidOutput = true;
      const failed = await post('refresh', nextId);
      assert.equal(failed.status, 500);
      assert.equal(outcomes.length, 3);
      assert.equal(await store.getSession(nextId), null);
      assert.equal(errors, 2);
      if (sessionTransport === 'cookie') assert.match(failed.headers['set-cookie'][0], /Max-Age=0/);
      const serialized = JSON.stringify({ diagnostics, outcomes });
      assert.ok(!serialized.includes('private-'));
      assert.ok(!serialized.includes(exchanged.body.accessToken));
      assert.ok(!serialized.includes(jkt));
    } finally {
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  }
} finally {
  globalThis.fetch = nativeFetch;
}
