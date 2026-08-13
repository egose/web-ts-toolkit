---
sidebar_label: Express OIDC Vault
sidebar_position: 3
---

# `@web-ts-toolkit/express-oidc-vault`

OIDC session middleware for Express with body or cookie session transport and server-side storage of upstream refresh tokens and logout-capable `id_token`s.

## What It Handles

- OIDC login redirect with PKCE, `state`, and `nonce`
- callback token exchange and `id_token` validation
- server-side storage of upstream refresh tokens and `id_token`s
- one-time local exchange codes for the frontend callback handoff
- session refresh with session ID rotation
- server-driven upstream logout redirect using stored `id_token`
- OIDC backchannel logout handling via `logout_token`

## Installation

```bash npm2yarn
npm install @web-ts-toolkit/express-oidc-vault express
```

For local development and tests, also install the memory store:

```bash npm2yarn
npm install @web-ts-toolkit/express-oidc-vault-memory-store
```

## What It Exposes

Main exports:

- `createOidcVaultMiddleware(...)`
- `createOidcVaultAccessTokenMiddleware(...)`
- `createOidcVaultJwtAccessTokenValidator(...)`
- route-path and default-value constants such as `DEFAULT_OIDC_VAULT_BASE_PATH` and `OIDC_VAULT_ROUTE_PATHS`
- public types for sessions, hooks, token issuing, validators, config, and store-provider interfaces

## Frontend Storage Policy

Default browser-side transport:

- mirror `sessionId` into `sessionStorage`
- keep `accessToken` in memory only
- do not store either value in `localStorage`

Why:

- `sessionId` needs to survive page refresh so the frontend can call `POST /auth/oidc/refresh` during app bootstrap
- `accessToken` is the normal API credential and should remain non-persistent in the browser
- `sessionStorage` narrows persistence compared with `localStorage`, but it is still readable by JavaScript, so XSS prevention remains critical

Optional alternative:

- set `sessionTransport: 'cookie'`
- store `sessionId` in an `HttpOnly` browser cookie instead of `sessionStorage`
- keep `accessToken` in memory only

This mode simplifies the frontend and keeps the session pointer out of JavaScript-visible storage, but it reintroduces cookie deployment concerns such as `SameSite`, `Secure`, and cross-origin credential handling.

## Session Transport Modes

### `sessionTransport: 'body'`

This is the default mode.

- `exchange` and `refresh` responses include `sessionId`
- the frontend stores `sessionId`, typically in `sessionStorage`
- the frontend sends `sessionId` back in the JSON body for `refresh` and `logout`
- `refresh` and `logout` do not read session cookies in this mode

### `sessionTransport: 'cookie'`

This mode stores `sessionId` in a backend-managed cookie.

- `exchange` sets the session cookie and does not need to return `sessionId` in the JSON body
- `refresh` reads the cookie, rotates the session, and updates the cookie
- `logout` reads the cookie and clears it
- `refresh` and `logout` require the cookie and reject body-only `sessionId` values
- the frontend does not need to keep `sessionId` in `sessionStorage`

Backchannel logout is separate from both transport modes because it is a server-to-server request from the IdP and does not rely on browser storage at all.

Available cookie options:

- `cookie.name`
- `cookie.deploymentMode`: `'same-origin' | 'same-site' | 'cross-site'`
- `cookie.sameSite`: `'lax' | 'strict' | 'none'`
- `cookie.secure`
- `cookie.domain`
- `cookie.path`
- `trustedOrigins`: browser origins allowed to call cookie-authenticated `refresh` and `logout`; required when cross-site cookie transport is enabled

`cookie.httpOnly` is always enforced as `true`. Middleware creation rejects `httpOnly: false` and unsafe cookie names, domains, or paths so untrusted values cannot be serialized into `Set-Cookie` headers.

Cookie-authenticated `refresh` and `logout` requests use a fail-closed CSRF policy for every `SameSite` mode. The request must include an `Origin` header, or a valid `Referer` header, whose origin matches `backendOrigin` or one of the configured `trustedOrigins`. Requests with no source-origin header are rejected. Backchannel logout is not affected because it is authenticated with the signed OIDC logout token rather than the browser session cookie.

## Endpoints

The middleware exposes these routes under a configurable base path such as `/auth/oidc`:

- `GET /auth/oidc/login`
- `GET /auth/oidc/callback`
- `POST /auth/oidc/exchange`
- `POST /auth/oidc/refresh`
- `POST /auth/oidc/logout`
- `POST /auth/oidc/backchannel-logout`

The OIDC router parses JSON and `application/x-www-form-urlencoded` request bodies with an explicit default limit of `16kb`. This is enough for the small `exchange`, `refresh`, `logout`, and backchannel logout payloads. If an IdP requires a larger form-encoded `logout_token`, set `requestBodyLimit` to a string or byte count accepted by Express body parsers.

Parser failures return JSON client errors before route handlers or store/provider hooks run:

- `OIDC_VAULT_REQUEST_BODY_TOO_LARGE`
- `OIDC_VAULT_REQUEST_BODY_PARAMETER_LIMIT_EXCEEDED`
- `OIDC_VAULT_UNSUPPORTED_REQUEST_BODY_ENCODING`
- `OIDC_VAULT_MALFORMED_REQUEST_BODY`
- `OIDC_VAULT_INVALID_REQUEST_BODY`

## Quick Start

```ts
import express from 'express';
import { createOidcVaultMiddleware } from '@web-ts-toolkit/express-oidc-vault';
import { createMemoryOidcVaultStore } from '@web-ts-toolkit/express-oidc-vault-memory-store';

const app = express();

app.use(
  createOidcVaultMiddleware({
    basePath: '/auth/oidc',
    backendOrigin: 'https://api.example.com',
    config: {
      issuer: process.env.OIDC_ISSUER,
      clientId: process.env.OIDC_CLIENT_ID,
      clientSecret: process.env.OIDC_CLIENT_SECRET,
    },
    frontendRedirectUri: 'https://frontend.example.com/callback',
    postLogoutRedirectUri: 'https://frontend.example.com/logged-out',
    storeProvider: createMemoryOidcVaultStore(),
  }),
);
```

Use the memory store for local development and tests. For production deployments, use the Redis or MongoDB store package.

`backendOrigin` must be the public backend origin registered with your OIDC provider, such as `https://api.example.com`. Callback `redirect_uri` values are built from this pinned origin and the configured `basePath`, so reverse proxies and untrusted `Host` headers cannot change the provider callback URL. Configure Express `trust proxy` only for other request metadata needs; it is not used to derive the OIDC callback origin.

`postLogoutRedirectUri` is optional. When configured, it must be an absolute HTTP(S) URL registered with the OIDC provider for post-logout redirects. It may be hosted on a different origin from `frontendRedirectUri` when that exact URL is provider-registered.

## Public Options And Defaults

| Option                          | Default                              | Contract                                                                                                                                            |
| ------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `basePath`                      | `/auth/oidc`                         | Mount path for the OIDC router.                                                                                                                     |
| `backendOrigin`                 | required                             | Public backend origin registered with the provider. Callback redirect URIs are derived from this pinned origin, not request host headers.           |
| `storeProvider`                 | required                             | Durable vault store provider. Use Redis or MongoDB for production and multi-instance deployments.                                                   |
| `config`                        | env-compatible helper input          | Provider config. `issuer` is required for discovery and manual modes so ID and logout tokens are issuer-bound.                                      |
| `frontendRedirectUri`           | unset                                | Default browser return target after backend callback completion. Required if login accepts custom `returnTo`.                                       |
| `postLogoutRedirectUri`         | unset                                | Optional provider-registered HTTP(S) URL used in the upstream end-session redirect.                                                                 |
| `fetchUserInfo`                 | implementation default               | When enabled, UserInfo claims are fetched and merged only after the `sub` matches the verified ID token subject.                                    |
| `authorizationTransactionTtlMs` | `600000`                             | TTL for one-time authorization transactions created during login.                                                                                   |
| `exchangeCodeTtlMs`             | `30000`                              | TTL for one-time local exchange codes returned to the frontend callback route.                                                                      |
| `sessionTransport`              | `body`                               | `body` returns and accepts JSON `sessionId`; `cookie` stores the session pointer in an `HttpOnly` cookie and rejects body-only refresh/logout IDs.  |
| `cookie`                        | default cookie settings              | Cookie transport options. `httpOnly` is always enforced as `true`; unsafe names, paths, and domains are rejected.                                   |
| `trustedOrigins`                | `[]` plus `backendOrigin` internally | Browser origins allowed to call cookie-authenticated `refresh` and `logout`. Required for cross-site cookie transport.                              |
| `requestBodyLimit`              | `16kb`                               | Express JSON and URL-encoded parser limit for OIDC route bodies. Increase only for known provider backchannel logout token size needs.              |
| `providerRequestTimeoutMs`      | `5000`                               | Timeout for discovery, token, UserInfo, and remote JWKS requests. Must be a positive finite integer.                                                |
| `hooks`                         | unset                                | Pre-commit hooks can veto operations by throwing; post-commit notification hook failures are reported to `onError` without undoing committed state. |
| `tokenIssuer`                   | unset                                | Issues app-local access tokens for `exchange` and `refresh`. This lifetime is separate from upstream token and vault-session lifetimes.             |

## Frontend Integration Example

The intended frontend model is:

- `accessToken` stays in memory
- `sessionId` is mirrored into `sessionStorage`
- refresh calls are deduplicated so concurrent `401` responses do not race session rotation

```ts
type AuthState = {
  accessToken: string | null;
  sessionId: string | null;
};

const authState: AuthState = {
  accessToken: null,
  sessionId: sessionStorage.getItem('sessionId'),
};

let refreshPromise: Promise<void> | null = null;

function persistSessionId(sessionId: string | null): void {
  authState.sessionId = sessionId;

  if (sessionId) {
    sessionStorage.setItem('sessionId', sessionId);
  } else {
    sessionStorage.removeItem('sessionId');
  }
}

function setAuthState(payload: { accessToken?: string; sessionId: string }): void {
  authState.accessToken = payload.accessToken ?? null;
  persistSessionId(payload.sessionId);
}

function clearAuthState(): void {
  authState.accessToken = null;
  persistSessionId(null);
}

async function refreshAuthState(): Promise<void> {
  if (!authState.sessionId) {
    clearAuthState();
    return;
  }

  const response = await fetch('/auth/oidc/refresh', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: authState.sessionId }),
  });

  if (!response.ok) {
    clearAuthState();
    throw new Error('OIDC refresh failed.');
  }

  setAuthState(await response.json());
}

async function ensureFreshAccessToken(): Promise<void> {
  if (!refreshPromise) {
    refreshPromise = refreshAuthState().finally(() => {
      refreshPromise = null;
    });
  }

  await refreshPromise;
}
```

### Cookie transport frontend example

When `sessionTransport` is `'cookie'`, the frontend no longer needs to store `sessionId`.

```ts
type AuthState = {
  accessToken: string | null;
};

const authState: AuthState = {
  accessToken: null,
};

let refreshPromise: Promise<void> | null = null;

function setAuthState(payload: { accessToken?: string }): void {
  authState.accessToken = payload.accessToken ?? null;
}

function clearAuthState(): void {
  authState.accessToken = null;
}

async function refreshAuthState(): Promise<void> {
  const response = await fetch('/auth/oidc/refresh', {
    method: 'POST',
    credentials: 'include',
  });

  if (!response.ok) {
    clearAuthState();
    throw new Error('OIDC refresh failed.');
  }

  setAuthState(await response.json());
}

async function ensureFreshAccessToken(): Promise<void> {
  if (!refreshPromise) {
    refreshPromise = refreshAuthState().finally(() => {
      refreshPromise = null;
    });
  }

  await refreshPromise;
}
```

For cross-origin cookie deployments, also remember:

- the frontend requests must use `credentials: 'include'`
- the backend CORS policy must allow credentials
- the cookie typically needs `SameSite=None` and `Secure`
- set `trustedOrigins` so refresh and logout only accept requests from your frontend origin

## Backchannel Logout

The package supports OIDC backchannel logout at:

- `POST /auth/oidc/backchannel-logout`

Expected request shape:

- `application/x-www-form-urlencoded`
- field: `logout_token=<provider-signed-jwt>`

The middleware validates the `logout_token` against the provider JWKS and then revokes matching local sessions by:

- upstream `sid` when present
- otherwise `sub`

The logout token must include `iat`, `exp`, `jti`, the standard backchannel logout event claim, and either `sid` or `sub`. If the protected header includes `typ`, it must be `logout+jwt`; tokens without `typ` remain accepted for provider compatibility. Each `jti` is consumed once and remembered until the token `exp`, so replaying the same valid token returns a successful no-op response without repeating revocation hooks.

Example request:

```ts
await fetch('/auth/oidc/backchannel-logout', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    logout_token: '<provider-signed-logout-token>',
  }),
});
```

Example response:

```json
{
  "loggedOut": true,
  "revokedSessions": 1
}
```

Notes:

- this route is intended for the IdP to call directly, not the browser
- cookie transport does not change how backchannel logout works
- after a successful backchannel logout, the next browser refresh will fail because the local session is gone; in cookie mode the package clears the stale session cookie on that failed refresh

## Backend Wiring

### Memory Store

```ts
import { createMemoryOidcVaultStore } from '@web-ts-toolkit/express-oidc-vault-memory-store';

createOidcVaultMiddleware({
  basePath: '/auth/oidc',
  backendOrigin: 'https://api.example.com',
  config: {
    issuer: process.env.OIDC_ISSUER,
    clientId: process.env.OIDC_CLIENT_ID,
    clientSecret: process.env.OIDC_CLIENT_SECRET,
  },
  frontendRedirectUri: 'https://frontend.example.com/callback',
  postLogoutRedirectUri: 'https://frontend.example.com/logged-out',
  storeProvider: createMemoryOidcVaultStore(),
});
```

### Redis Store

```ts
import { createClient } from 'redis';
import { createRedisOidcVaultStore } from '@web-ts-toolkit/express-oidc-vault-redis-store';

const redis = createClient({ url: process.env.REDIS_URL });
await redis.connect();

createOidcVaultMiddleware({
  basePath: '/auth/oidc',
  backendOrigin: 'https://api.example.com',
  config: {
    issuer: process.env.OIDC_ISSUER,
    clientId: process.env.OIDC_CLIENT_ID,
    clientSecret: process.env.OIDC_CLIENT_SECRET,
  },
  frontendRedirectUri: 'https://frontend.example.com/callback',
  postLogoutRedirectUri: 'https://frontend.example.com/logged-out',
  storeProvider: createRedisOidcVaultStore({
    client: redis,
    keyPrefix: 'oidc-vault',
  }),
});
```

### MongoDB Store

```ts
import { MongoClient } from 'mongodb';
import { createMongoOidcVaultStore } from '@web-ts-toolkit/express-oidc-vault-mongodb-store';

const mongo = new MongoClient(process.env.MONGODB_URI!);
await mongo.connect();

createOidcVaultMiddleware({
  basePath: '/auth/oidc',
  backendOrigin: 'https://api.example.com',
  config: {
    issuer: process.env.OIDC_ISSUER,
    clientId: process.env.OIDC_CLIENT_ID,
    clientSecret: process.env.OIDC_CLIENT_SECRET,
  },
  frontendRedirectUri: 'https://frontend.example.com/callback',
  postLogoutRedirectUri: 'https://frontend.example.com/logged-out',
  storeProvider: createMongoOidcVaultStore({
    db: mongo.db('app-auth'),
  }),
});
```

### Cookie Transport

```ts
import { createClient } from 'redis';
import { createRedisOidcVaultStore } from '@web-ts-toolkit/express-oidc-vault-redis-store';

const redis = createClient({ url: process.env.REDIS_URL });
await redis.connect();

createOidcVaultMiddleware({
  basePath: '/auth/oidc',
  backendOrigin: 'https://api.example.com',
  config: {
    issuer: process.env.OIDC_ISSUER,
    clientId: process.env.OIDC_CLIENT_ID,
    clientSecret: process.env.OIDC_CLIENT_SECRET,
  },
  frontendRedirectUri: 'https://frontend.example.com/callback',
  postLogoutRedirectUri: 'https://frontend.example.com/logged-out',
  sessionTransport: 'cookie',
  cookie: {
    deploymentMode: 'same-site',
    domain: '.example.com',
    secure: true,
  },
  trustedOrigins: ['https://frontend.example.com'],
  storeProvider: createRedisOidcVaultStore({
    client: redis,
    keyPrefix: 'oidc-vault',
  }),
});
```

## Config Modes

The package supports issuer discovery and manual endpoint configuration.

### Issuer mode

If only `OIDC_ISSUER` is set, discovery mode resolves the provider endpoints. The discovered issuer must match the configured issuer, after normal trailing-slash normalization.

Provider discovery metadata and remote JWKS resolvers are cached in bounded process-wide maps keyed by configured issuer URL and `jwks_uri`. These keys are intended to come from static middleware configuration, not request input. Successful discovery entries are reused for up to 10 minutes and both discovery and JWKS resolver maps retain at most 32 entries with oldest-entry eviction. Failed discovery requests are removed from the cache so a later request can retry.

Discovery, token, UserInfo, and remote JWKS HTTP requests use a 5 second default timeout and manual redirect handling. Set `providerRequestTimeoutMs` on `createOidcVaultMiddleware(...)` to a positive integer number of milliseconds if your provider needs a different bound. Provider response parse errors return sanitized client messages; oversized or malformed provider bodies are not returned to callers.

- `OIDC_AUTHORIZATION_ENDPOINT`
- `OIDC_TOKEN_ENDPOINT`
- `OIDC_USERINFO_ENDPOINT`
- `OIDC_JWKS_URI`
- `OIDC_END_SESSION_ENDPOINT`

`OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, and `OIDC_SCOPES` still apply.

### Manual mode

If your provider metadata is not discoverable, configure the endpoints directly. `issuer` is still required so ID and logout tokens are verified against the expected issuer.

```ts
createOidcVaultMiddleware({
  basePath: '/auth/oidc',
  backendOrigin: 'https://api.example.com',
  config: {
    issuer: process.env.OIDC_ISSUER,
    authorizationEndpoint: process.env.OIDC_AUTHORIZATION_ENDPOINT,
    tokenEndpoint: process.env.OIDC_TOKEN_ENDPOINT,
    userInfoEndpoint: process.env.OIDC_USERINFO_ENDPOINT,
    jwksUri: process.env.OIDC_JWKS_URI,
    endSessionEndpoint: process.env.OIDC_END_SESSION_ENDPOINT,
    clientId: process.env.OIDC_CLIENT_ID,
    clientSecret: process.env.OIDC_CLIENT_SECRET,
    scopes: process.env.OIDC_SCOPES,
  },
  frontendRedirectUri: 'https://frontend.example.com/callback',
  storeProvider: createMemoryOidcVaultStore(),
});
```

Minimum required manual config:

- `authorizationEndpoint`
- `tokenEndpoint`
- `jwksUri`
- `clientId`
- `issuer`

## Provider Token Validation

- Token responses must include `token_type: Bearer`.
- `expires_in`, when present, must be a finite non-negative integer.
- Upstream OAuth `expires_in` describes the upstream access token only. It does not set `OidcVaultSession.expiresAt` or shorten the refresh-token-backed vault session.
- `OidcVaultSession.expiresAt`, when set by application code or store policy, is an explicit vault-session expiry in epoch milliseconds and remains enforced by store providers.
- ID tokens must include `sub`, `exp`, and `iat`.
- ID-token `azp` must equal `clientId` when present and is required for multi-audience ID tokens.
- UserInfo responses must include a `sub` matching the verified ID-token subject before claims are merged.
- Refresh responses may omit `id_token`; in that case, the existing verified identity claims are retained. If refresh returns a new `id_token`, its `sub` must match the current session subject.

## Local Access Token Example

Provide `tokenIssuer` if you want `exchange` and `refresh` to return an app-issued local access token.

```ts
import { SignJWT } from 'jose';

const jwtSecret = new TextEncoder().encode(process.env.APP_JWT_SECRET ?? 'dev-secret-change-me');

createOidcVaultMiddleware({
  basePath: '/auth/oidc',
  backendOrigin: 'https://api.example.com',
  config: {
    issuer: process.env.OIDC_ISSUER,
    clientId: process.env.OIDC_CLIENT_ID,
    clientSecret: process.env.OIDC_CLIENT_SECRET,
  },
  frontendRedirectUri: 'https://frontend.example.com/callback',
  storeProvider: createMemoryOidcVaultStore(),
  tokenIssuer: {
    async issue({ session }) {
      const accessToken = await new SignJWT({
        sub: session.subject,
        sid: session.sessionId,
        scope: session.scope,
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('15m')
        .sign(jwtSecret);

      return {
        accessToken,
        expiresIn: 900,
        tokenType: 'Bearer',
      };
    },
  },
});
```

That local access token is separate from the upstream IdP token. The upstream refresh token stays only in the server-side vault.

## Access Token Validation Middleware

Use a separate middleware for validating the app-issued local access token on normal API routes.

```ts
import express from 'express';
import { createOidcVaultAccessTokenMiddleware } from '@web-ts-toolkit/express-oidc-vault';
import { jwtVerify } from 'jose';

const app = express();
const jwtSecret = new TextEncoder().encode(process.env.APP_JWT_SECRET ?? 'dev-secret-change-me');

app.get(
  '/api/me',
  createOidcVaultAccessTokenMiddleware({
    validator: {
      async validate(token) {
        const result = await jwtVerify(token, jwtSecret, {
          algorithms: ['HS256'],
        });

        return {
          subject: String(result.payload.sub),
          sessionId: typeof result.payload.sid === 'string' ? result.payload.sid : undefined,
          scope: typeof result.payload.scope === 'string' ? result.payload.scope : undefined,
          claims: result.payload as Record<string, unknown>,
        };
      },
    },
  }),
  (req, res) => {
    res.json({
      subject: req.auth?.subject,
      sessionId: req.auth?.sessionId,
      scope: req.auth?.scope,
    });
  },
);
```

This middleware:

- reads `Authorization: Bearer ...`
- delegates token validation to your `validator`
- attaches `req.auth`
- rejects missing, malformed, invalid, or expired tokens with `401`

The package augments Express request typing so `req.auth` is available without casting in TypeScript route handlers.

### JWT validator helper

If your local access token is a JWT, you can use a built-in helper instead of writing the same `jwtVerify(...)` adapter manually.

```ts
import {
  createOidcVaultAccessTokenMiddleware,
  createOidcVaultJwtAccessTokenValidator,
} from '@web-ts-toolkit/express-oidc-vault';

const jwtSecret = new TextEncoder().encode(process.env.APP_JWT_SECRET ?? 'dev-secret-change-me');

app.get(
  '/api/me',
  createOidcVaultAccessTokenMiddleware({
    validator: createOidcVaultJwtAccessTokenValidator({
      key: jwtSecret,
      issuer: 'https://api.example.com',
      audience: 'api-audience',
      algorithms: ['HS256'],
    }),
  }),
  (req, res) => {
    res.json({
      subject: req.auth?.subject,
      sessionId: req.auth?.sessionId,
      scope: req.auth?.scope,
    });
  },
);
```

Default JWT claim mapping:

- `sub` -> `auth.subject`
- `sid` -> `auth.sessionId`
- `scope` -> `auth.scope`
- full verified payload -> `auth.claims`

## Hook Examples

Hooks let the app observe or extend the OIDC flow without forking the middleware.

```ts
createOidcVaultMiddleware({
  basePath: '/auth/oidc',
  backendOrigin: 'https://api.example.com',
  config: {
    issuer: process.env.OIDC_ISSUER,
    clientId: process.env.OIDC_CLIENT_ID,
    clientSecret: process.env.OIDC_CLIENT_SECRET,
  },
  frontendRedirectUri: 'https://frontend.example.com/callback',
  storeProvider: createMemoryOidcVaultStore(),
  hooks: {
    async onLoginStart({ req }) {
      console.log('OIDC login started', {
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });
    },
    async onSessionCreated({ session }) {
      if (!session?.user) {
        return;
      }

      await upsertLocalUser({
        oidcSubject: session.subject,
        email: typeof session.user.email === 'string' ? session.user.email : undefined,
        displayName: typeof session.user.name === 'string' ? session.user.name : undefined,
      });
    },
    async onSessionRefreshed({ session, metadata }) {
      console.log('OIDC session rotated', {
        previousSessionId: metadata?.previousSessionId,
        nextSessionId: session?.sessionId,
      });
    },
    async onLogout({ session, metadata }) {
      console.log('OIDC logout completed', {
        subject: session?.subject,
        revokedSessions: metadata?.revokedSessions,
      });
    },
    async onError({ error, route, req }) {
      console.error('OIDC vault error', {
        route,
        path: req.originalUrl,
        error,
      });
    },
  },
});

async function upsertLocalUser(input: { oidcSubject: string; email?: string; displayName?: string }): Promise<void> {
  console.log('upsertLocalUser', input);
}
```

Recommended hook usage:

- `onLoginStart`, `onAuthorizationUrl`, `onCallbackTokens`, `onUserInfo`, `onBeforeSessionCreate`, and `onBeforeLogout` are pre-commit hooks. Throwing from one of these hooks vetoes the operation before related durable session state is created, rotated, or deleted.
- `onSessionCreated`, `onSessionRefreshed`, and `onLogout` are post-commit notification hooks. Their failures are reported to `onError` but do not change a successful callback redirect, refresh response, logout response, or already-committed store mutation.
- client error responses keep a stable `{ code, message }` shape and intentionally avoid returning raw provider, store, hook, token issuer, or access-token validator details. Use `onError` to observe the original error object for private server-side logs.

## Security Checklist

- keep `sessionId` in `sessionStorage` and keep `accessToken` in memory only
- never store the upstream refresh token in the browser
- use HTTPS end-to-end for frontend, backend, and IdP communication
- set `backendOrigin` to the public backend origin registered with the provider; do not rely on request host or proxy headers for callback URL construction
- keep the default `requestBodyLimit` of `16kb` unless a provider requires a larger form-encoded backchannel `logout_token`
- treat XSS prevention as critical because `sessionStorage` is still readable by JavaScript
- enable a strict Content Security Policy and avoid unsafe inline scripts
- rotate `sessionId` on refresh and overwrite the mirrored `sessionStorage` value immediately
- clear in-memory auth state and `sessionStorage` on logout, even if upstream logout fails
- set `postLogoutRedirectUri` explicitly to an HTTP(S) URL registered with the OIDC provider so logout destinations stay predictable
- when using cookie transport, rely on cookie credentials only for `refresh` and `logout`; do not send fallback body `sessionId` values
- when using cross-site cookie transport, send frontend requests with `credentials: 'include'`, enable credentialed CORS, use `SameSite=None; Secure`, and allow only known frontend origins via `trustedOrigins`
- keep cookie-authenticated CSRF protection fail-closed for every `SameSite` mode by requiring an `Origin` or valid `Referer` matching `backendOrigin` or `trustedOrigins`
- configure a stable expected issuer in both discovery and manual endpoint modes
- require matching UserInfo subjects before merging provider claims into the local session user
- treat upstream OAuth `expires_in`, local access-token lifetime, and vault-session expiry as separate policies
- keep any local app-issued access token short-lived, such as 5 to 15 minutes
- use Redis or MongoDB, not the memory store, for production or multi-instance deployments
- monitor `onError` and other hooks so failed callback, refresh, and logout flows are visible in private server logs without returning raw provider, token, store, or hook errors to clients

## Store Packages

- [`@web-ts-toolkit/express-oidc-vault-memory-store`](./express-oidc-vault-memory-store)
- [`@web-ts-toolkit/express-oidc-vault-redis-store`](./express-oidc-vault-redis-store)
- [`@web-ts-toolkit/express-oidc-vault-mongodb-store`](./express-oidc-vault-mongodb-store)

## Related Packages

- [`@web-ts-toolkit/express-oidc-vault-memory-store`](./express-oidc-vault-memory-store)
- [`@web-ts-toolkit/express-oidc-vault-redis-store`](./express-oidc-vault-redis-store)
- [`@web-ts-toolkit/express-oidc-vault-mongodb-store`](./express-oidc-vault-mongodb-store)
