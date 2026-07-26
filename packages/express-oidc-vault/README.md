# `@web-ts-toolkit/express-oidc-vault`

Cookie-free OIDC session middleware for Express with server-side storage of upstream refresh tokens and logout-capable `id_token`s.

## Status

This package now implements the core cookie-free OIDC flow.

Current implementation includes:

- the core middleware factory
- OIDC login redirect with PKCE, `state`, and `nonce`
- callback token exchange, server-side session creation, and one-time local exchange codes
- session refresh with session ID rotation
- upstream logout URL generation using stored `id_token`
- public TypeScript interfaces for hooks, sessions, config helpers, and store providers

## Installation

```sh
pnpm add @web-ts-toolkit/express-oidc-vault express
```

## Frontend Storage Policy

Default browser-side transport:

- mirror `sessionId` into `sessionStorage`
- keep `accessToken` in memory only
- do not store either value in `localStorage`

Why:

- `sessionId` needs to survive page refresh so the frontend can call `POST /auth/oidc/refresh` during app bootstrap
- `accessToken` is the credential used on normal API requests and should remain non-persistent in the browser
- `sessionStorage` is still readable by JavaScript, so it reduces persistence but does not remove XSS risk

Optional alternative:

- set `sessionTransport: 'cookie'`
- store `sessionId` in an `HttpOnly` browser cookie instead of `sessionStorage`
- keep `accessToken` in memory only

That mode simplifies the frontend and keeps the session pointer out of JavaScript-visible storage, but it reintroduces cookie deployment concerns such as `SameSite`, `Secure`, and cross-origin credential handling.

## Session Transport Modes

The package supports two ways to move the opaque `sessionId` between browser and backend.

### `sessionTransport: 'body'`

This is the default mode.

- `exchange` and `refresh` responses include `sessionId`
- the frontend stores `sessionId`, typically in `sessionStorage`
- the frontend sends `sessionId` back in the JSON body for `refresh` and `logout`

### `sessionTransport: 'cookie'`

This mode stores `sessionId` in a backend-managed cookie.

- `exchange` sets the session cookie and does not need to return `sessionId` in the JSON body
- `refresh` reads the cookie, rotates the session, and updates the cookie
- `logout` reads the cookie and clears it
- the frontend does not need to keep `sessionId` in `sessionStorage`

Available cookie options:

- `cookie.name`
- `cookie.deploymentMode`: `'same-origin' | 'same-site' | 'cross-site'`
- `cookie.sameSite`: `'lax' | 'strict' | 'none'`
- `cookie.secure`
- `cookie.domain`
- `cookie.path`
- `cookie.httpOnly`

Default cookie behavior:

- `name`: `oidc_vault_session`
- `path`: `/`
- `httpOnly`: `true`
- `deploymentMode`: `same-origin`
- `sameSite`: `lax` unless `deploymentMode` is `cross-site`
- `secure`: `true` when `sameSite` resolves to `none` or `deploymentMode` is `cross-site`

Recommended frontend boot flow:

1. Read `sessionId` from `sessionStorage`.
2. If present, call `POST /auth/oidc/refresh` immediately.
3. If refresh succeeds, replace the stored `sessionId` with the rotated value and keep the returned `accessToken` in memory only.
4. If refresh fails, clear `sessionStorage` and treat the user as logged out.

If you use `sessionTransport: 'cookie'`, the frontend boot flow becomes simpler:

1. Keep `accessToken` in memory only.
2. Call `POST /auth/oidc/refresh` on app startup.
3. Let the backend read and rotate the session cookie.
4. Clear in-memory auth state if refresh fails.

## Endpoints

The core middleware exposes these endpoints under a configurable base path:

- `GET /auth/oidc/login`
- `GET /auth/oidc/callback`
- `POST /auth/oidc/exchange`
- `POST /auth/oidc/refresh`
- `POST /auth/oidc/logout`

## Quick Start

```ts
import express from 'express';
import { createOidcVaultMiddleware } from '@web-ts-toolkit/express-oidc-vault';
import { createMemoryOidcVaultStore } from '@web-ts-toolkit/express-oidc-vault-memory-store';

const app = express();
const storeProvider = createMemoryOidcVaultStore();

app.use(
  createOidcVaultMiddleware({
    basePath: '/auth/oidc',
    frontendRedirectUri: 'https://frontend.example.com/callback',
    storeProvider,
  }),
);
```

Use the memory store for local development and tests. For production deployments, prefer a Redis or MongoDB store provider.

## Frontend Integration Example

The backend flow is only half of the integration. In default body transport mode, keep `accessToken` in memory, mirror `sessionId` into `sessionStorage`, and deduplicate refresh calls.

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

async function exchangeCallbackCode(code: string): Promise<void> {
  const response = await fetch('/auth/oidc/exchange', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  });

  if (!response.ok) {
    clearAuthState();
    throw new Error('OIDC code exchange failed.');
  }

  setAuthState(await response.json());
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

async function fetchWithAuth(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);

  if (authState.accessToken) {
    headers.set('authorization', `Bearer ${authState.accessToken}`);
  }

  let response = await fetch(input, { ...init, headers });

  if (response.status !== 401 || !authState.sessionId) {
    return response;
  }

  await ensureFreshAccessToken();

  const retryHeaders = new Headers(init.headers);

  if (authState.accessToken) {
    retryHeaders.set('authorization', `Bearer ${authState.accessToken}`);
  }

  response = await fetch(input, { ...init, headers: retryHeaders });
  return response;
}

async function bootstrapAuth(): Promise<void> {
  if (!authState.sessionId) {
    return;
  }

  try {
    await refreshAuthState();
  } catch {
    clearAuthState();
  }
}

async function logout(): Promise<void> {
  const sessionId = authState.sessionId;

  clearAuthState();

  if (!sessionId) {
    return;
  }

  const response = await fetch('/auth/oidc/logout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });

  if (!response.ok) {
    return;
  }

  const payload = (await response.json()) as { upstreamLogoutUrl?: string };

  if (payload.upstreamLogoutUrl) {
    window.location.assign(payload.upstreamLogoutUrl);
  }
}
```

Recommended browser flow:

1. Redirect the user to `GET /auth/oidc/login` when they click login.
2. On the frontend callback route, read `code` from the query string and call `exchangeCallbackCode(code)`.
3. Remove the `code` query parameter from the address bar after a successful exchange.
4. Call `bootstrapAuth()` once during app startup so a reloaded tab can recover from `sessionStorage`.
5. Use `fetchWithAuth(...)` or equivalent interceptor logic for normal API requests.

### Cookie transport frontend example

When `sessionTransport` is set to `'cookie'`, the frontend no longer needs to store `sessionId`.

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

async function exchangeCallbackCode(code: string): Promise<void> {
  const response = await fetch('/auth/oidc/exchange', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ code }),
  });

  if (!response.ok) {
    clearAuthState();
    throw new Error('OIDC code exchange failed.');
  }

  setAuthState(await response.json());
}
```

For cross-origin cookie deployments, also remember:

- the frontend requests must use `credentials: 'include'`
- the backend CORS policy must allow credentials
- the cookie typically needs `SameSite=None` and `Secure`

## Backend Wiring Examples

Use one of the store packages depending on your deployment model.

### Memory store

```ts
import express from 'express';
import { createOidcVaultMiddleware } from '@web-ts-toolkit/express-oidc-vault';
import { createMemoryOidcVaultStore } from '@web-ts-toolkit/express-oidc-vault-memory-store';

const app = express();

app.use(
  createOidcVaultMiddleware({
    basePath: '/auth/oidc',
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

### Redis store

```ts
import express from 'express';
import { createClient } from 'redis';
import { createOidcVaultMiddleware } from '@web-ts-toolkit/express-oidc-vault';
import { createRedisOidcVaultStore } from '@web-ts-toolkit/express-oidc-vault-redis-store';

const app = express();
const redis = createClient({ url: process.env.REDIS_URL });

await redis.connect();

app.use(
  createOidcVaultMiddleware({
    basePath: '/auth/oidc',
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
  }),
);
```

### MongoDB store

```ts
import express from 'express';
import { MongoClient } from 'mongodb';
import { createOidcVaultMiddleware } from '@web-ts-toolkit/express-oidc-vault';
import { createMongoOidcVaultStore } from '@web-ts-toolkit/express-oidc-vault-mongodb-store';

const app = express();
const mongo = new MongoClient(process.env.MONGODB_URI!);

await mongo.connect();

app.use(
  createOidcVaultMiddleware({
    basePath: '/auth/oidc',
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
  }),
);
```

### Cookie transport

```ts
import express from 'express';
import { createOidcVaultMiddleware } from '@web-ts-toolkit/express-oidc-vault';
import { createRedisOidcVaultStore } from '@web-ts-toolkit/express-oidc-vault-redis-store';
import { createClient } from 'redis';

const app = express();
const redis = createClient({ url: process.env.REDIS_URL });

await redis.connect();

app.use(
  createOidcVaultMiddleware({
    basePath: '/auth/oidc',
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
    storeProvider: createRedisOidcVaultStore({
      client: redis,
      keyPrefix: 'oidc-vault',
    }),
  }),
);
```

## Main Exports

- `createOidcVaultMiddleware(...)`
- `DEFAULT_OIDC_VAULT_BASE_PATH`
- `DEFAULT_AUTHORIZATION_TRANSACTION_TTL_MS`
- `DEFAULT_EXCHANGE_CODE_TTL_MS`
- `DEFAULT_OIDC_SCOPES`
- `OIDC_VAULT_ROUTE_PATHS`
- `normalizeOidcVaultBasePath(...)`
- `resolveOidcVaultConfig(...)`
- `resolveOidcVaultConfigFromEnv(...)`
- `type OidcVaultOptions`
- `type OidcVaultHooks`
- `type OidcVaultStoreProvider`
- `type OidcVaultSession`
- `type OidcVaultTokenIssuer`

## Key Integration Notes

- The browser should never receive the upstream refresh token.
- The backend should store the latest upstream `id_token` so logout can call the upstream end-session endpoint with `id_token_hint`.
- `sessionId` should rotate on refresh.
- The frontend should deduplicate concurrent refresh calls so only one refresh is in-flight at a time.
- If `OIDC_ISSUER` is configured, issuer discovery should override explicit endpoint URLs.
- `frontendRedirectUri` is the default browser return target after the backend completes the upstream callback.
- `postLogoutRedirectUri` is added to the upstream logout URL when configured.

## Config Helpers

```ts
import { resolveOidcVaultConfigFromEnv } from '@web-ts-toolkit/express-oidc-vault';

const config = resolveOidcVaultConfigFromEnv(process.env);
```

Resolution behavior:

- if `OIDC_ISSUER` is set, discovery mode wins and endpoint-specific env vars are ignored
- if `OIDC_ISSUER` is not set, manual mode requires `OIDC_AUTHORIZATION_ENDPOINT`, `OIDC_TOKEN_ENDPOINT`, and `OIDC_JWKS_URI`
- `OIDC_SCOPES` defaults to `openid email profile`

### Manual endpoint mode

If your provider metadata is not discoverable from `OIDC_ISSUER`, configure the endpoints directly.

```ts
import express from 'express';
import { createOidcVaultMiddleware } from '@web-ts-toolkit/express-oidc-vault';
import { createRedisOidcVaultStore } from '@web-ts-toolkit/express-oidc-vault-redis-store';
import { createClient } from 'redis';

const app = express();
const redis = createClient({ url: process.env.REDIS_URL });

await redis.connect();

app.use(
  createOidcVaultMiddleware({
    basePath: '/auth/oidc',
    config: {
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
    postLogoutRedirectUri: 'https://frontend.example.com/logged-out',
    storeProvider: createRedisOidcVaultStore({
      client: redis,
      keyPrefix: 'oidc-vault',
    }),
  }),
);
```

In manual mode, the minimum required config is:

- `authorizationEndpoint`
- `tokenEndpoint`
- `jwksUri`
- `clientId`

`userInfoEndpoint` and `endSessionEndpoint` are optional but recommended when your provider supports them.

## Local Access Token Example

The middleware can return a local backend access token during `exchange` and `refresh` by providing a `tokenIssuer`.

```ts
import express from 'express';
import { SignJWT } from 'jose';
import { createOidcVaultMiddleware } from '@web-ts-toolkit/express-oidc-vault';
import { createMemoryOidcVaultStore } from '@web-ts-toolkit/express-oidc-vault-memory-store';

const app = express();
const jwtSecret = new TextEncoder().encode(process.env.APP_JWT_SECRET ?? 'dev-secret-change-me');

app.use(
  createOidcVaultMiddleware({
    basePath: '/auth/oidc',
    config: {
      issuer: process.env.OIDC_ISSUER,
      clientId: process.env.OIDC_CLIENT_ID,
      clientSecret: process.env.OIDC_CLIENT_SECRET,
    },
    frontendRedirectUri: 'https://frontend.example.com/callback',
    postLogoutRedirectUri: 'https://frontend.example.com/logged-out',
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
  }),
);
```

That local token is separate from the upstream IdP access token:

- the upstream refresh token stays in the server-side vault
- the frontend receives only the app-issued access token and the opaque `sessionId`
- the app-issued access token can contain only the claims your backend APIs actually need

## Hook Examples

Hooks let the app observe or extend the core OIDC flow without forking the middleware.

### Audit and user provisioning hooks

```ts
import express from 'express';
import { createOidcVaultMiddleware } from '@web-ts-toolkit/express-oidc-vault';
import { createMemoryOidcVaultStore } from '@web-ts-toolkit/express-oidc-vault-memory-store';

const app = express();

app.use(
  createOidcVaultMiddleware({
    basePath: '/auth/oidc',
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
          upstreamLogoutUrl: metadata?.upstreamLogoutUrl,
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
  }),
);

async function upsertLocalUser(input: { oidcSubject: string; email?: string; displayName?: string }): Promise<void> {
  // replace with application-specific persistence logic
  console.log('upsertLocalUser', input);
}
```

Recommended hook usage:

- use `onSessionCreated` for local user provisioning or last-login updates
- use `onSessionRefreshed` for audit logs and session rotation tracing
- use `onLogout` to revoke local app state that depends on the session
- use `onError` for structured logging and alerting

## Security Checklist

Use these defaults when deploying the package:

- keep `sessionId` in `sessionStorage` and keep `accessToken` in memory only
- never store the upstream refresh token in the browser
- use HTTPS end-to-end for frontend, backend, and IdP communication
- treat XSS prevention as critical because `sessionStorage` is still readable by JavaScript
- enable a strict Content Security Policy and avoid unsafe inline scripts
- rotate `sessionId` on refresh and overwrite the mirrored `sessionStorage` value immediately
- clear in-memory auth state and `sessionStorage` on logout, even if upstream logout fails
- set `postLogoutRedirectUri` explicitly so logout destinations stay predictable
- protect any app-issued local access token with a short lifetime, such as 5 to 15 minutes
- use Redis or MongoDB, not the memory store, for production or multi-instance deployments
- monitor `onError` and other hooks so failed callback, refresh, and logout flows are visible in logs

## Store Packages

- `@web-ts-toolkit/express-oidc-vault-memory-store`
- `@web-ts-toolkit/express-oidc-vault-redis-store`
- `@web-ts-toolkit/express-oidc-vault-mongodb-store`
