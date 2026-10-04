import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

import express from 'express';
import { SignJWT } from 'jose';
import {
  createOidcVaultAccessTokenMiddleware,
  createOidcVaultJwtAccessTokenValidator,
  createOidcVaultMiddleware,
  normalizeOidcVaultBasePath,
  type OidcVaultConfig,
  type OidcVaultSessionTransport,
} from '@web-ts-toolkit/express-oidc-vault';
import { createMemoryOidcVaultStore } from '@web-ts-toolkit/express-oidc-vault-memory-store';

import { createExampleCors } from './cors';
import { closeServer, listen } from './http';

export const API_REPLAY_NAMESPACE = 'oidc-vault-dpop-example-api';
export const EXAMPLE_BASE_PATH = '/auth/oidc';

export interface ExampleServerOptions {
  frontendOrigin: string;
  config: OidcVaultConfig;
  port?: number;
  /** Public HTTPS origin when served behind a local reverse proxy. */
  backendOrigin?: string;
  /** Common vault prefix; the app mounts <basePath>/body and <basePath>/cookie. */
  basePath?: string;
  transports?: readonly OidcVaultSessionTransport[];
  tokenLifetimeSeconds?: number;
  nonceLifetimeSeconds?: number;
  nonceSecret?: Uint8Array | false;
  localJwtSecret?: Uint8Array;
  fingerprintHeader?: string;
  /** Enables deterministic retry/redirect test endpoints; local fixture only. */
  fixture?: boolean;
}

export interface ExampleRequestEvidence {
  method: string;
  path: string;
  status: number;
  proof?: string;
  authorization?: string;
  fingerprint?: string;
  body?: unknown;
}

export const startExampleServer = async (options: ExampleServerOptions) => {
  const app = express();
  const server = createServer(app);
  const port = await listen(server, options.port);
  try {
    const backendOrigin = new URL(options.backendOrigin ?? `http://127.0.0.1:${port}`).origin;
    const frontendOrigin = new URL(options.frontendOrigin).origin;
    const secret = options.localJwtSecret ?? randomBytes(32);
    const tokenLifetime = options.tokenLifetimeSeconds ?? 30;
    const fingerprintHeader = options.fingerprintHeader ?? 'X-Device-Fingerprint';
    const nonceSecret = options.nonceSecret === false ? undefined : (options.nonceSecret ?? randomBytes(32));
    const proofPolicy = {
      mode: 'required' as const,
      ...(nonceSecret ? { nonce: { secret: nonceSecret, lifetimeSeconds: options.nonceLifetimeSeconds ?? 60 } } : {}),
    };
    const store = createMemoryOidcVaultStore();
    const requests: ExampleRequestEvidence[] = [];
    const stats = { apiCalls: 0, mutations: 0, refreshes: 0, resourceAssignments: 0 };
    let resource = '';
    let rejectedOnce = false;
    let denyAllTokens = false;
    if (secret.byteLength < 32 || !Number.isSafeInteger(tokenLifetime) || tokenLifetime < 1 || tokenLifetime > 900) {
      throw new Error('Use a >=32-byte local JWT key and an integer token lifetime of 1–900 seconds.');
    }
    app.use(createExampleCors([frontendOrigin], fingerprintHeader));
    // Credential evidence is in-memory and enabled only for test-owned fixtures;
    // normal dev/server mode never collects or logs request credentials/signals.
    if (options.fixture)
      app.use((req, res, next) => {
        const evidence: ExampleRequestEvidence = {
          method: req.method,
          path: req.originalUrl,
          status: 0,
          proof: req.get('DPoP'),
          authorization: req.get('Authorization'),
          fingerprint: req.get(fingerprintHeader),
        };
        res.once('finish', () => {
          evidence.status = res.statusCode;
          evidence.body = req.body as unknown;
          requests.push(evidence);
        });
        next();
      });
    const transports = options.transports ?? ['body', 'cookie'];
    for (const transport of transports) {
      const prefix = normalizeOidcVaultBasePath(options.basePath ?? EXAMPLE_BASE_PATH).replace(/\/+$/g, '');
      const basePath = `${prefix}/${transport}`;
      app.use(
        createOidcVaultMiddleware({
          backendOrigin,
          basePath,
          config: options.config,
          frontendRedirectUri: `${frontendOrigin}/callback`,
          trustedOrigins: [frontendOrigin],
          storeProvider: store,
          sessionTransport: transport,
          transactionCookie: { name: `oidc_vault_transaction_${transport}` },
          cookie: { name: `oidc_vault_session_${transport}`, deploymentMode: 'same-site' },
          deviceBinding: proofPolicy,
          fingerprintRecognition: { headerName: fingerprintHeader },
          sessionTtlMs: 8 * 60 * 60 * 1000,
          hooks: {
            onSessionRefreshed() {
              stats.refreshes++;
            },
          },
          tokenIssuer: {
            async issue({ session, deviceBinding }) {
              if (!deviceBinding) throw new Error('A verified DPoP binding is required.');
              // The JWT is browser-readable: do not embed the opaque vault handle,
              // especially when cookie transport keeps that credential HttpOnly.
              const accessToken = await new SignJWT({ scope: 'read:profile', cnf: { jkt: deviceBinding.jkt } })
                .setProtectedHeader({ alg: 'HS256' })
                .setIssuer(backendOrigin)
                .setAudience(API_REPLAY_NAMESPACE)
                .setSubject(session.subject)
                .setJti(randomUUID())
                .setIssuedAt()
                .setExpirationTime(`${tokenLifetime}s`)
                .sign(secret);
              return { accessToken, expiresIn: tokenLifetime, tokenType: 'DPoP' };
            },
          },
        }),
      );
    }
    if (options.fixture)
      app.use('/api', (req, res, next) => {
        const reject = denyAllTokens || (['/reject-once', '/resource'].includes(req.path) && !rejectedOnce);
        if (!reject) {
          next();
          return;
        }
        rejectedOnce = true;
        res.setHeader('WWW-Authenticate', 'DPoP error="invalid_token", algs="ES256"');
        res.setHeader('Cache-Control', 'no-store');
        res.status(401).json({ code: 'OIDC_VAULT_INVALID_ACCESS_TOKEN', message: 'Access token validation failed.' });
      });
    app.use(
      '/api',
      createOidcVaultAccessTokenMiddleware({
        validator: createOidcVaultJwtAccessTokenValidator({
          key: secret,
          issuer: backendOrigin,
          audience: API_REPLAY_NAMESPACE,
          algorithms: ['HS256'],
          // Deliberately omit cnf from the mapper: verified confirmation still wins.
          mapClaims: (claims) => ({ subject: String(claims.sub), scope: String(claims.scope) }),
        }),
        // Express keeps the mount in req.originalUrl. No stripped proxy prefix.
        deviceBinding: {
          ...proofPolicy,
          publicOrigin: backendOrigin,
          replayNamespace: API_REPLAY_NAMESPACE,
          replayStore: store,
        },
      }),
    );
    app.get('/api/profile', (req, res) => {
      stats.apiCalls++;
      res.setHeader('Cache-Control', 'no-store');
      res.json({ subject: req.auth?.subject, scope: req.auth?.scope, binding: req.auth?.deviceBinding?.jkt });
    });
    if (options.fixture) {
      app.get('/api/reject-once', (_req, res) => res.json({ ok: true }));
      app.get('/api/redirect', (_req, res) => res.redirect(`${frontendOrigin}/unexpected-redirect`));
      app.post('/api/mutate', express.text({ type: '*/*' }), (req, res) => {
        stats.mutations++;
        res.json({ mutations: stats.mutations, body: req.body as unknown });
      });
      app.put('/api/resource', express.text({ type: '*/*' }), (req, res) => {
        if (req.auth?.subject !== 'fixture-user') {
          res.status(403).end();
          return;
        }
        // Application-owned authorization and idempotent assignment contract.
        resource = String(req.body);
        stats.resourceAssignments++;
        res.json({ resource });
      });
    }
    app.get('/health', (_req, res) => res.json({ ok: true }));
    return {
      app,
      backendOrigin,
      stats,
      requests,
      store,
      denyApiTokens(value: boolean) {
        denyAllTokens = value;
      },
      close: () => closeServer(server),
    };
  } catch (error) {
    await closeServer(server);
    throw error;
  }
};
