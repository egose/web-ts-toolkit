import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

import express from 'express';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

import { closeServer, listen } from './http';

export const LOCAL_CLIENT_ID = 'oidc-vault-dpop-example';

export interface LocalIdpStats {
  authorizations: number;
  callbacks: number;
  refreshes: number;
  upstreamDpopHeaders: number;
  pkceChecks: number;
}

interface AuthorizationCode {
  nonce: string;
  challenge: string;
  redirectUri: string;
  expiresAt: number;
}

/** Local deterministic user + real OIDC navigation, PKCE, signed ID tokens and single-use refresh tokens. */
export const startLocalIdp = async (options: { port?: number; callbackUris?: readonly string[] } = {}) => {
  const { publicKey, privateKey } = await generateKeyPair('RS256', { modulusLength: 2048 });
  const jwk = { ...(await exportJWK(publicKey)), kid: 'local-fixture-rsa', alg: 'RS256', use: 'sig' };
  const app = express();
  const server = createServer(app);
  let issuer = '';
  let refreshDelayMs = 0;
  const codes = new Map<string, AuthorizationCode>();
  const refreshTokens = new Set<string>();
  const accessTokens = new Set<string>();
  const callbackUris = new Set(options.callbackUris ?? []);
  const stats: LocalIdpStats = { authorizations: 0, callbacks: 0, refreshes: 0, upstreamDpopHeaders: 0, pkceChecks: 0 };
  const user = { sub: 'fixture-user', email: 'fixture@example.test', name: 'Local fixture user' };
  app.use(express.urlencoded({ extended: false, limit: '8kb' }));
  app.use((req, res, next) => {
    if (req.get('DPoP')) stats.upstreamDpopHeaders++;
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.get('/issuer/.well-known/openid-configuration', (_req, res) =>
    res.json({
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      jwks_uri: `${issuer}/jwks`,
      userinfo_endpoint: `${issuer}/userinfo`,
      response_types_supported: ['code'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
    }),
  );
  app.get('/issuer/jwks', (_req, res) => res.json({ keys: [jwk] }));
  app.get('/issuer/authorize', (req, res) => {
    const { client_id, redirect_uri, state, nonce, code_challenge, code_challenge_method, response_type } = req.query;
    if (
      client_id !== LOCAL_CLIENT_ID ||
      response_type !== 'code' ||
      code_challenge_method !== 'S256' ||
      typeof redirect_uri !== 'string' ||
      !callbackUris.has(redirect_uri) ||
      typeof state !== 'string' ||
      typeof nonce !== 'string' ||
      typeof code_challenge !== 'string'
    ) {
      res.status(400).send('Invalid local authorization.');
      return;
    }
    const code = randomUUID();
    codes.set(code, { nonce, challenge: code_challenge, redirectUri: redirect_uri, expiresAt: Date.now() + 60_000 });
    stats.authorizations++;
    const callback = new URL(redirect_uri);
    callback.searchParams.set('state', state);
    callback.searchParams.set('code', code);
    // Commit a real IdP document so browser tests (and humans) actually leave
    // the SPA before navigating through the backend callback.
    const href = callback.href.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    res.type('html').send(`<!doctype html><html lang="en"><title>Local OIDC provider</title>
      <h1>Local deterministic OIDC provider</h1><p>Fixture user: fixture@example.test</p>
      <a id="continue" href="${href}">Continue as the fixture user</a></html>`);
  });
  app.post('/issuer/token', async (req, res) => {
    if (req.body.client_id !== LOCAL_CLIENT_ID) {
      res.status(400).json({ error: 'invalid_client' });
      return;
    }
    let nonce: string | undefined;
    if (req.body.grant_type === 'authorization_code') {
      const code = codes.get(String(req.body.code));
      const verifier = req.body.code_verifier;
      if (
        !code ||
        code.expiresAt <= Date.now() ||
        typeof verifier !== 'string' ||
        req.body.redirect_uri !== code.redirectUri ||
        createHash('sha256').update(verifier).digest('base64url') !== code.challenge
      ) {
        res.status(400).json({ error: 'invalid_grant' });
        return;
      }
      codes.delete(String(req.body.code));
      stats.callbacks++;
      stats.pkceChecks++;
      nonce = code.nonce;
    } else if (req.body.grant_type === 'refresh_token') {
      if (!refreshTokens.delete(String(req.body.refresh_token))) {
        res.status(400).json({ error: 'invalid_grant' });
        return;
      }
      stats.refreshes++;
      if (refreshDelayMs) await new Promise((resolve) => setTimeout(resolve, refreshDelayMs));
    } else {
      res.status(400).json({ error: 'unsupported_grant_type' });
      return;
    }
    const accessToken = randomBytes(24).toString('base64url');
    const refreshToken = randomBytes(32).toString('base64url');
    accessTokens.add(accessToken);
    refreshTokens.add(refreshToken);
    const idToken = await new SignJWT({ ...user, sid: 'fixture-provider-session', ...(nonce ? { nonce } : {}) })
      .setProtectedHeader({ alg: 'RS256', kid: jwk.kid })
      .setIssuer(issuer)
      .setAudience(LOCAL_CLIENT_ID)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);
    res.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      id_token: idToken,
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'openid email profile',
    });
  });
  app.get('/issuer/userinfo', (req, res) => {
    if (!accessTokens.has(req.get('Authorization')?.slice('Bearer '.length) ?? '')) {
      res.status(401).json({ error: 'invalid_token' });
      return;
    }
    res.json(user);
  });
  const port = await listen(server, options.port);
  issuer = `http://127.0.0.1:${port}/issuer`;
  return {
    issuer,
    stats,
    allowCallback(uri: string) {
      callbackUris.add(uri);
    },
    setRefreshDelay(milliseconds: number) {
      refreshDelayMs = milliseconds;
    },
    close: () => closeServer(server),
  };
};
