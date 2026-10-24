import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';

import express from 'express';
import { calculateJwkThumbprint, decodeJwt, exportJWK, generateKeyPair } from 'jose';

const load = process.argv[2] === 'cjs' ? createRequire(import.meta.url) : (name) => import(name);
const core = await load('@web-ts-toolkit/express-oidc-vault');
const { createMemoryOidcVaultStore } = await load('@web-ts-toolkit/express-oidc-vault-memory-store');
const { createDpopProof } = await load('@web-ts-toolkit/oidc-vault-dpop-client');
const pair = await generateKeyPair('ES256');
const publicJwk = await exportJWK(pair.publicKey);
const jkt = await calculateJwkThumbprint(publicJwk);
const deviceKey = { privateKey: pair.privateKey, publicJwk, jkt, scopeId: 'issuer-runtime' };
const origin = 'https://api.example.com';
const provider = 'https://provider.example.com';
const signingKey = randomBytes(32);
const now = Date.now();
const validator = core.createOidcVaultJwtAccessTokenValidator({
  key: signingKey,
  algorithms: ['HS256'],
  issuer: origin,
  audience: 'packed-api',
});
const nativeFetch = globalThis.fetch;
globalThis.fetch = async () => Response.json({ token_type: 'Bearer', refresh_token: 'private-rotated-refresh' });
try {
  for (const sessionTransport of ['body', 'cookie'])
    for (const bound of [false, true])
      for (const lifetimeSeconds of [300, 0]) {
        const store = createMemoryOidcVaultStore();
        const session = await store.createSession({
          sessionId: 'private-handle',
          logicalSessionId: 'private-lineage',
          subject: 'packed-user',
          provider: { issuer: provider, clientId: 'client' },
          refreshToken: 'private-refresh',
          idToken: 'private-id',
          metadata: { secret: 'private-metadata' },
          user: { sub: 'packed-user', cnf: { jkt } },
          ...(bound ? { deviceBinding: { type: 'dpop', jkt } } : {}),
        });
        const transactionSecret = randomBytes(32).toString('base64url');
        await store.createExchangeCode({
          code: 'private-code',
          sessionId: session.sessionId,
          createdAt: now,
          expiresAt: now + 30_000,
          ...(bound
            ? {
                deviceBinding: session.deviceBinding,
                browserBindingHash: createHash('sha256').update(transactionSecret, 'ascii').digest('base64url'),
              }
            : {}),
        });
        const outcomes = [];
        const operations = [];
        const app = express();
        app.use(
          core.createOidcVaultMiddleware({
            basePath: '/vault',
            backendOrigin: origin,
            sessionTransport,
            storeProvider: store,
            deviceBinding: {},
            now: () => now,
            config: {
              issuer: provider,
              clientId: 'client',
              authorizationEndpoint: `${provider}/authorize`,
              tokenEndpoint: `${provider}/token`,
              jwksUri: `${provider}/jwks`,
            },
            onTokenOutcome: (event) => {
              outcomes.push(event);
            },
            tokenIssuer: core.createOidcVaultJwtAccessTokenIssuer({
              key: signingKey,
              algorithm: 'HS256',
              issuer: origin,
              audience: 'packed-api',
              lifetimeSeconds,
              now: () => now,
              async mapClaims(input) {
                operations.push(input.operation);
                // Even trusted mapper mutation must not supply/rebind the authority snapshot.
                input.session.deviceBinding = { type: 'dpop', jkt: 'A'.repeat(43) };
                input.deviceBinding = undefined;
                if (input.operation === 'refresh') return { cnf: { jkt } }; // Must enter existing rotation rollback.
                return { role: 'reader' };
              },
            }),
          }),
        );
        app.get(
          '/api/me',
          core.createOidcVaultAccessTokenMiddleware({
            validator,
            deviceBinding: {
              publicOrigin: origin,
              replayNamespace: 'packed-issuer',
              replayStore: store,
              now: () => now,
            },
          }),
          (req, res) => res.json({ subject: req.auth.subject, bound: !!req.auth.deviceBinding }),
        );
        const server = app.listen(0, '127.0.0.1');
        await new Promise((resolve) => server.once('listening', resolve));
        const call = async (path, init = {}) => {
          const response = await nativeFetch(`http://127.0.0.1:${server.address().port}${path}`, init);
          return { status: response.status, headers: response.headers, body: await response.json() };
        };
        const post = async (operation) =>
          call(`/vault/${operation}`, {
            method: 'POST',
            headers: {
              Origin: origin,
              'Content-Type': 'application/json',
              Cookie: [
                sessionTransport === 'cookie' ? 'oidc_vault_session=private-handle' : '',
                bound ? `__Host-oidc_vault_transaction=${transactionSecret}` : '',
              ]
                .filter(Boolean)
                .join('; '),
              ...(bound
                ? {
                    DPoP: await createDpopProof(deviceKey, {
                      method: 'POST',
                      url: `${origin}/vault/${operation}`,
                      now: () => now,
                    }),
                  }
                : {}),
            },
            body: JSON.stringify(
              operation === 'exchange'
                ? { code: 'private-code' }
                : sessionTransport === 'body'
                  ? { sessionId: session.sessionId }
                  : {},
            ),
          });
        try {
          const exchanged = await post('exchange');
          assert.equal(exchanged.status, 200);
          assert.equal(exchanged.body.expiresIn, lifetimeSeconds);
          assert.equal(exchanged.body.tokenType, bound ? 'DPoP' : 'Bearer');
          assert.equal(exchanged.body.sessionId, sessionTransport === 'body' ? session.sessionId : undefined);
          const claims = decodeJwt(exchanged.body.accessToken);
          assert.deepEqual(claims.cnf, bound ? { jkt } : undefined);
          assert.equal(claims.exp - claims.iat, lifetimeSeconds);
          assert.equal(claims.role, 'reader');
          assert.equal(claims.sid, undefined);
          assert.ok(!JSON.stringify(claims).includes('private-'));
          if (lifetimeSeconds)
            assert.equal((await validator.validate(exchanged.body.accessToken)).subject, 'packed-user');
          else await assert.rejects(validator.validate(exchanged.body.accessToken), { code: 'ERR_JWT_EXPIRED' });
          const headers = {
            Authorization: `${bound ? 'DPoP' : 'Bearer'} ${exchanged.body.accessToken}`,
            ...(bound
              ? {
                  DPoP: await createDpopProof(deviceKey, {
                    method: 'GET',
                    url: `${origin}/api/me`,
                    accessToken: exchanged.body.accessToken,
                    now: () => now,
                  }),
                }
              : {}),
          };
          const api = await call('/api/me', { headers });
          assert.equal(api.status, lifetimeSeconds ? 200 : 401);
          if (lifetimeSeconds) assert.deepEqual(api.body, { subject: 'packed-user', bound });
          if (bound && lifetimeSeconds) {
            const downgrade = await call('/api/me', {
              headers: { ...headers, Authorization: `Bearer ${exchanged.body.accessToken}` },
            });
            assert.equal(downgrade.body.code, 'OIDC_VAULT_DPOP_REQUIRED');
          }
          const failed = await post('refresh');
          assert.equal(failed.status, 500);
          assert.deepEqual(failed.body, { code: 'OIDC_VAULT_INTERNAL_ERROR', message: 'Unexpected OIDC vault error.' });
          assert.equal(await store.getSession(session.sessionId), null);
          assert.equal(await store.getSessionRevocationContext(session.sessionId), null);
          if (sessionTransport === 'cookie')
            assert.match(failed.headers.get('set-cookie'), /oidc_vault_session=;.*Max-Age=0/);
          assert.deepEqual(operations, ['exchange', 'refresh']);
          assert.equal(outcomes.length, 2);
          assert.deepEqual(
            outcomes.map((event) => event.kind),
            ['token-issued', 'exchange-succeeded'],
          );
        } finally {
          await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
        }
      }
} finally {
  globalThis.fetch = nativeFetch;
}
