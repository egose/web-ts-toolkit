import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

import express from 'express';
import { calculateJwkThumbprint, exportJWK, generateKeyPair } from 'jose';
import { describe, expect, it, vi } from 'vitest';
import {
  createOidcVaultAuthenticator,
  createOidcVaultJwtAccessTokenIssuer,
  createOidcVaultJwtAccessTokenValidator,
  createOidcVaultMiddleware,
  OidcVaultAuthDeniedError,
  type OidcVaultDpopDiagnosticEvent,
  type OidcVaultExchangeResult,
  type OidcVaultLogoutNavigationResult,
  type OidcVaultTokenOutcomeEvent,
} from '@web-ts-toolkit/express-oidc-vault';
import { createMemoryOidcVaultStore } from '@web-ts-toolkit/express-oidc-vault-memory-store';
import { createDpopProof, type DpopKey } from '@web-ts-toolkit/oidc-vault-dpop-client';

import { closeServer, listen } from '../server/http';

/** Application code uses root APIs; the HTTP driver alone supplies fixture proofs/cookies. */
describe.each(['body', 'cookie'] as const)('OVAPP-08 composed application (%s)', (sessionTransport) => {
  it('maps users/claims, joins redacted telemetry, enriches once, guards and spends logout once', async () => {
    const app = express();
    const server = createServer(app);
    const backendOrigin = `http://127.0.0.1:${await listen(server)}`;
    try {
      const store = createMemoryOidcVaultStore();
      const reserve = vi.spyOn(store, 'reserveDpopProof');
      const readSession = vi.spyOn(store, 'getSession');
      const secret = randomBytes(32);
      const pair = await generateKeyPair('ES256');
      const jwk = await exportJWK(pair.publicKey);
      const key: DpopKey = {
        scopeId: 'integration-driver',
        privateKey: pair.privateKey,
        publicJwk: { kty: 'EC', crv: 'P-256', x: jwk.x!, y: jwk.y! },
        jkt: await calculateJwkThumbprint(jwk),
      };
      const user = { id: 'application-user', providerSubject: 'provider-user', active: true, role: 'reader' };
      const trace = new AsyncLocalStorage<{ requestId: string; userId?: string }>();
      type Observation = {
        requestId: string;
        userId?: string;
        event: OidcVaultDpopDiagnosticEvent | OidcVaultTokenOutcomeEvent | 'application-user-mapped';
      };
      const observations: Observation[] = [];
      const observe = (event: Observation['event']) => {
        // A real app can send this allowlist to its own bounded telemetry sink.
        // No request, proof, token, raw session or database-user object is logged.
        const { requestId, userId } = trace.getStore()!;
        observations.push({ requestId, ...(userId === undefined ? {} : { userId }), event });
      };
      app.use((_req, _res, next) => trace.run({ requestId: randomUUID() }, next));
      const issuer = createOidcVaultJwtAccessTokenIssuer({
        key: secret,
        algorithm: 'HS256',
        issuer: backendOrigin,
        audience: 'integration-api',
        async mapSubject({ session }) {
          // Substitute an application database lookup here. IdP sub and app ID differ.
          if (session.subject !== user.providerSubject || !user.active) throw new Error('Account unavailable.');
          trace.getStore()!.userId = user.id;
          return user.id;
        },
        mapClaims: ({ operation }) => ({ role: user.role, scope: 'profile:read', issuedVia: operation }),
      });
      const idToken = 'private-upstream-id-token';
      const session = await store.createSession({
        sessionId: 'private-vault-handle',
        logicalSessionId: 'private-vault-lineage',
        subject: user.providerSubject,
        provider: { issuer: 'https://idp.example', clientId: 'integration-app' },
        deviceBinding: { type: 'dpop', jkt: key.jkt },
        idToken,
        refreshToken: 'private-upstream-refresh-token',
      });
      const transactionSecret = randomBytes(32).toString('base64url');
      await store.createExchangeCode({
        code: 'private-exchange-code',
        sessionId: session.sessionId,
        deviceBinding: session.deviceBinding,
        browserBindingHash: createHash('sha256').update(transactionSecret, 'ascii').digest('base64url'),
        createdAt: Date.now(),
        expiresAt: Date.now() + 30_000,
      });
      app.use(
        createOidcVaultMiddleware({
          backendOrigin,
          basePath: '/vault',
          storeProvider: store,
          sessionTransport,
          transactionCookie: { name: 'integration_transaction' },
          cookie: { name: 'integration_session', path: '/vault' },
          deviceBinding: { mode: 'required' },
          tokenIssuer: issuer,
          onDpopDiagnostic: observe,
          onTokenOutcome: observe,
          postLogoutRedirectUri: `${backendOrigin}/signed-out`,
          logoutNavigation: { fallbackRedirectUri: `${backendOrigin}/signed-out?fallback=1` },
          config: {
            issuer: 'https://idp.example',
            clientId: 'integration-app',
            authorizationEndpoint: 'https://idp.example/authorize',
            tokenEndpoint: 'https://idp.example/token',
            jwksUri: 'https://idp.example/jwks',
            endSessionEndpoint: 'https://idp.example/logout',
          },
        }),
      );
      let enrichments = 0;
      const auth = createOidcVaultAuthenticator({
        authentication: 'optional',
        validator: createOidcVaultJwtAccessTokenValidator({
          key: secret,
          issuer: backendOrigin,
          audience: 'integration-api',
          algorithms: ['HS256'],
        }),
        deviceBinding: {
          mode: 'required',
          publicOrigin: backendOrigin,
          replayNamespace: 'integration-api',
          replayStore: store,
        },
        onDpopDiagnostic: observe,
        async onAuthContext({ auth, res }) {
          enrichments++;
          // App-owned lookup/approval; candidate-session diagnostic hashes never grant it.
          if (auth.subject !== user.id || !user.active) throw new OidcVaultAuthDeniedError('Account unavailable.');
          res.locals.user = { id: user.id, role: user.role };
          trace.getStore()!.userId = user.id;
          observe('application-user-mapped');
        },
      });
      app.use('/api', auth.authenticate);
      app.get('/api/session', (req, res) => {
        res.json({ authenticated: !!req.auth, user: res.locals.user ?? null, requestId: trace.getStore()!.requestId });
      });
      app.get('/api/private', auth.requireAuth, auth.requireDeviceBinding, auth.requireAuth, (_req, res) => {
        res.json({ user: res.locals.user, requestId: trace.getStore()!.requestId });
      });
      const proof = (path: string, method: string, accessToken?: string) =>
        createDpopProof(key, { url: `${backendOrigin}${path}`, method, accessToken });
      const post = async (path: string, body: object, cookie?: string) =>
        fetch(`${backendOrigin}${path}`, {
          method: 'POST',
          headers: {
            Origin: backendOrigin,
            'Content-Type': 'application/json',
            DPoP: await proof(path, 'POST'),
            ...(cookie ? { Cookie: cookie } : {}),
          },
          body: JSON.stringify(body),
          redirect: 'error',
        });
      const anonymous = await fetch(`${backendOrigin}/api/session`);
      expect(anonymous.status).toBe(200);
      expect(await anonymous.json()).toMatchObject({ authenticated: false, user: null });
      expect((await fetch(`${backendOrigin}/api/private`)).status).toBe(401);

      const exchanged = await post(
        '/vault/exchange',
        { code: 'private-exchange-code' },
        `integration_transaction=${transactionSecret}`,
      );
      expect(exchanged.status).toBe(200);
      const credentials = (await exchanged.json()) as OidcVaultExchangeResult;
      expect(credentials).toMatchObject({ tokenType: 'DPoP', expiresIn: 300 });
      expect(credentials.sessionId).toBe(sessionTransport === 'body' ? session.sessionId : undefined);
      const accessToken = credentials.accessToken!;
      const verified = await createOidcVaultJwtAccessTokenValidator({ key: secret }).validate(accessToken);
      expect(verified).toMatchObject({
        subject: user.id,
        scope: 'profile:read',
        claims: { role: 'reader', issuedVia: 'exchange' },
      });
      expect(verified.claims).not.toHaveProperty('sid');

      for (const path of ['/api/session', '/api/private']) {
        const before = reserve.mock.calls.length;
        const reads = readSession.mock.calls.length;
        const response = await fetch(`${backendOrigin}${path}`, {
          headers: { Authorization: `DPoP ${accessToken}`, DPoP: await proof(path, 'GET', accessToken) },
        });
        expect(response.status).toBe(200);
        const result = (await response.json()) as { requestId: string; user: { id: string; role: string } };
        expect(result.user).toEqual({ id: user.id, role: 'reader' });
        expect(reserve.mock.calls.length - before).toBe(1);
        expect(readSession.mock.calls.length).toBe(reads); // No telemetry-only session reads.
        const joined = observations.filter((event) => event.requestId === result.requestId);
        const admitted = joined.find(
          ({ event }) => typeof event === 'object' && 'stage' in event && event.stage === 'proof',
        );
        expect(admitted).toMatchObject({ event: { correlation: { association: 'authenticated' } } });
        expect(admitted).not.toHaveProperty('userId'); // Proof events precede application lookup.
        expect(joined.at(-1)).toMatchObject({ userId: user.id, event: 'application-user-mapped' });
      }
      expect(enrichments).toBe(2); // The three compatible required guards never re-enrich.
      const rejected = await fetch(`${backendOrigin}/api/private`, {
        headers: { Authorization: `DPoP ${accessToken}`, DPoP: await proof('/api/wrong-target', 'GET', accessToken) },
      });
      expect(rejected.status).toBe(401);
      expect(observations.at(-1)).toMatchObject({
        event: { reason: 'target-mismatch', correlation: { association: 'verified-token' } },
      });
      expect(observations.at(-1)).not.toHaveProperty('userId');
      user.active = false;
      const denied = await fetch(`${backendOrigin}/api/session`, {
        headers: { Authorization: `DPoP ${accessToken}`, DPoP: await proof('/api/session', 'GET', accessToken) },
      });
      expect(denied.status).toBe(403);
      expect(await denied.json()).toMatchObject({ code: 'OIDC_VAULT_AUTH_DENIED' });

      const logout = await post(
        '/vault/logout/navigation',
        sessionTransport === 'body' ? { sessionId: session.sessionId } : {},
        sessionTransport === 'cookie' ? `integration_session=${session.sessionId}` : undefined,
      );
      expect(logout.status).toBe(200);
      const navigation = (await logout.json()) as OidcVaultLogoutNavigationResult;
      expect(Object.keys(navigation).sort()).toEqual(['loggedOut', 'navigationUrl']);
      expect(navigation.loggedOut).toBe(true);
      expect(new URL(navigation.navigationUrl).origin).toBe(backendOrigin);
      expect(await store.getSession(session.sessionId)).toBeNull();
      if (sessionTransport === 'cookie') expect(logout.headers.get('Set-Cookie')).toContain('Max-Age=0');
      const continuation = await fetch(navigation.navigationUrl, { redirect: 'manual' });
      expect(continuation.status).toBe(302);
      expect(await continuation.text()).toBe('');
      const upstream = new URL(continuation.headers.get('Location')!);
      expect(upstream.searchParams.get('id_token_hint')).toBe(idToken);
      expect(upstream.searchParams.get('post_logout_redirect_uri')).toBe(`${backendOrigin}/signed-out`);
      const spent = await fetch(navigation.navigationUrl, { redirect: 'manual' });
      expect(spent.headers.get('Location')).toBe(`${backendOrigin}/signed-out?fallback=1`);
      const outcomes = observations.filter(({ event }) => typeof event === 'object' && 'kind' in event);
      expect(outcomes).toMatchObject([
        { userId: user.id, event: { kind: 'token-issued', operation: 'exchange' } },
        { userId: user.id, event: { kind: 'exchange-succeeded', operation: 'exchange' } },
      ]);
      const logged = JSON.stringify({ observations, navigation });
      for (const privateValue of [
        idToken,
        session.refreshToken,
        session.sessionId,
        session.logicalSessionId!,
        accessToken,
        key.jkt,
      ])
        expect(logged).not.toContain(privateValue);
    } finally {
      await closeServer(server);
    }
  });
});
