import { randomBytes } from 'node:crypto';

import express from 'express';
import { calculateJwkThumbprint, generateKeyPair, exportJWK, SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';

import { createServer } from 'node:http';
import { startExampleServer, EXAMPLE_BASE_PATH } from '../server/app';
import { createExampleCors } from '../server/cors';
import { closeServer, listen } from '../server/http';
import { LOCAL_CLIENT_ID, startLocalIdp } from '../server/local-idp';
import { resolveOidcVaultConfigFromEnv } from '@web-ts-toolkit/express-oidc-vault';

describe('DBJWT-10 fixture CORS and environment IdP contracts', () => {
  it.each([false, true])(
    'optional binding is available only in the test-owned fixture (fixture=%s)',
    async (fixture) => {
      const idp = await startLocalIdp();
      const backend = await startExampleServer({
        frontendOrigin: 'http://127.0.0.1:4317',
        config: { issuer: idp.issuer, clientId: LOCAL_CLIENT_ID },
        fixture,
        fixtureDeviceBindingMode: 'optional',
      });
      try {
        const response = await fetch(`${backend.backendOrigin}${EXAMPLE_BASE_PATH}/body/login`, {
          method: 'POST',
          headers: { Origin: 'http://127.0.0.1:4317', 'Content-Type': 'application/json' },
          body: '{}',
        });
        expect(response.status).toBe(fixture ? 200 : 401);
        if (fixture) {
          const { authorizationUrl } = (await response.json()) as { authorizationUrl: string };
          const transaction = await backend.store.getAuthorizationTransaction(
            new URL(authorizationUrl).searchParams.get('state')!,
          );
          expect(transaction).toBeTruthy();
          expect(transaction?.deviceBinding).toBeUndefined();
          expect(response.headers.get('Set-Cookie')).toContain('HttpOnly');
        } else {
          expect(await response.json()).toMatchObject({ code: 'OIDC_VAULT_DEVICE_BINDING_REQUIRED' });
          expect(response.headers.get('Set-Cookie')).toBeNull();
        }
      } finally {
        await backend.close();
        await idp.close();
      }
    },
  );

  it('allows only explicit origins/headers/credentials and exposes the exact challenge headers', async () => {
    const app = express();
    app.use(createExampleCors(['http://127.0.0.1:4317'], 'X-App-Recognition'));
    app.get('/test', (_req, res) => res.json({ ok: true }));
    const server = createServer(app);
    const port = await listen(server);
    try {
      const accepted = await fetch(`http://127.0.0.1:${port}/test`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://127.0.0.1:4317',
          'Access-Control-Request-Headers': 'content-type,authorization,dpop,x-app-recognition',
        },
      });
      expect(accepted.status).toBe(204);
      expect(accepted.headers.get('Access-Control-Allow-Origin')).toBe('http://127.0.0.1:4317');
      expect(accepted.headers.get('Access-Control-Allow-Credentials')).toBe('true');
      expect(accepted.headers.get('Access-Control-Expose-Headers')).toBe('DPoP-Nonce, WWW-Authenticate');
      expect(accepted.headers.get('Access-Control-Allow-Headers')).toBe(
        'Content-Type, Authorization, DPoP, X-App-Recognition',
      );
      for (const headers of [
        { Origin: 'https://attacker.example' },
        { Origin: 'null' },
        { Origin: 'http://127.0.0.1:4317', 'Access-Control-Request-Headers': 'cookie' },
      ] as Array<Record<string, string>>) {
        const denied = await fetch(`http://127.0.0.1:${port}/test`, { method: 'OPTIONS', headers });
        expect(denied.status).toBe(403);
      }
    } finally {
      await closeServer(server);
    }
  });
  it('accepts issuer-discovery and complete manual env config through the actual backend helper', () => {
    expect(
      resolveOidcVaultConfigFromEnv({ OIDC_ISSUER: 'https://idp.example/tenant', OIDC_CLIENT_ID: 'app' }),
    ).toMatchObject({
      issuer: 'https://idp.example/tenant',
      clientId: 'app',
      mode: 'issuer',
    });
    expect(
      resolveOidcVaultConfigFromEnv({
        OIDC_ISSUER: 'https://idp.example',
        OIDC_CLIENT_ID: 'app',
        OIDC_AUTHORIZATION_ENDPOINT: 'https://idp.example/authorize',
        OIDC_TOKEN_ENDPOINT: 'https://idp.example/token',
        OIDC_JWKS_URI: 'https://idp.example/jwks',
      }).mode,
    ).toBe('manual');
  });
  it('local fixture rejects wrong callback/PKCE and an initiation replay before upstream allocation', async () => {
    const idp = await startLocalIdp();
    const backend = await startExampleServer({
      frontendOrigin: 'http://127.0.0.1:4317',
      config: { issuer: idp.issuer, clientId: LOCAL_CLIENT_ID },
      nonceSecret: false,
      fixture: true,
      localJwtSecret: randomBytes(32),
    });
    try {
      const { privateKey, publicKey } = await generateKeyPair('ES256');
      const jwk = await exportJWK(publicKey);
      const jkt = await calculateJwkThumbprint(jwk);
      const proof = await new SignJWT({
        htm: 'POST',
        htu: `${backend.backendOrigin}${EXAMPLE_BASE_PATH}/body/login`,
        jti: crypto.randomUUID(),
        iat: Math.floor(Date.now() / 1000),
      })
        .setProtectedHeader({ typ: 'dpop+jwt', alg: 'ES256', jwk })
        .sign(privateKey);
      const request = () =>
        fetch(`${backend.backendOrigin}${EXAMPLE_BASE_PATH}/body/login`, {
          method: 'POST',
          headers: {
            Origin: 'http://127.0.0.1:4317',
            'Content-Type': 'application/json',
            DPoP: proof,
          },
          body: '{}',
        });
      const accepted = await request();
      expect(accepted.status).toBe(200);
      const value = (await accepted.json()) as { authorizationUrl: string };
      const cookie = accepted.headers.get('Set-Cookie')!;
      expect(cookie).toContain('HttpOnly');
      const rejected = await request();
      expect(rejected.status).toBe(401);
      expect(await rejected.json()).toEqual({
        code: 'OIDC_VAULT_INVALID_DPOP_PROOF',
        message: 'DPoP proof validation failed.',
      });
      expect(rejected.headers.get('Set-Cookie')).toBeNull();
      const transaction = await backend.store.getAuthorizationTransaction(
        new URL(value.authorizationUrl).searchParams.get('state')!,
      );
      expect(transaction?.deviceBinding?.jkt).toBe(jkt);
      const authorization = await fetch(value.authorizationUrl);
      expect(authorization.status).toBe(400); // callback must be explicitly registered with fixture IdP
      idp.allowCallback(`${backend.backendOrigin}${EXAMPLE_BASE_PATH}/body/callback`);
      const authorized = await fetch(value.authorizationUrl);
      expect(authorized.status).toBe(200);
      const href = (await authorized.text()).match(/id="continue" href="([^"]+)"/)![1].replace(/&amp;/g, '&');
      const callback = new URL(href);
      const form = {
        grant_type: 'authorization_code',
        client_id: LOCAL_CLIENT_ID,
        code: callback.searchParams.get('code')!,
        redirect_uri: `${backend.backendOrigin}${EXAMPLE_BASE_PATH}/body/callback`,
        code_verifier: 'wrong-verifier',
      };
      const deniedPkce = await fetch(`${idp.issuer}/token`, { method: 'POST', body: new URLSearchParams(form) });
      expect(deniedPkce.status).toBe(400);
      expect(idp.stats.callbacks).toBe(0);
      const honestPkce = await fetch(`${idp.issuer}/token`, {
        method: 'POST',
        body: new URLSearchParams({ ...form, code_verifier: transaction!.pkceVerifier }),
      });
      expect(honestPkce.status).toBe(200);
      const tokens = (await honestPkce.json()) as { id_token: string };
      const returnUri = 'http://127.0.0.1:4317/signed-out?transport=body';
      idp.allowPostLogout(returnUri);
      const logoutUrl = new URL(`${idp.issuer}/logout`);
      logoutUrl.searchParams.set('id_token_hint', tokens.id_token);
      logoutUrl.searchParams.set('post_logout_redirect_uri', returnUri);
      const loggedOut = await fetch(logoutUrl);
      expect(loggedOut.status).toBe(200);
      const document = await loggedOut.text();
      expect(document).toContain('id="provider-logged-out"');
      expect(document).toContain('id="logout-return"');
      expect(document).not.toContain(tokens.id_token);
      for (const [key, value] of [
        ['id_token_hint', 'forged.hint.signature'],
        ['id_token_hint', 'x'.repeat(16_385)],
        ['post_logout_redirect_uri', 'https://evil.example/return'],
        ['extra', 'unsupported'],
      ]) {
        const invalid = new URL(logoutUrl);
        invalid.searchParams.set(key, value);
        expect((await fetch(invalid)).status).toBe(400);
      }
      const duplicate = new URL(logoutUrl);
      duplicate.searchParams.append('id_token_hint', tokens.id_token);
      expect((await fetch(duplicate)).status).toBe(400);
      expect(idp.stats.logouts).toBe(1);
      expect(idp.stats.pkceChecks).toBe(1);
      expect(idp.stats.authorizations).toBe(1);
    } finally {
      await backend.close();
      await idp.close();
    }
  });
});
