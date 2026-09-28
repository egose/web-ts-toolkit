# `@web-ts-toolkit/express-oidc-vault`

OIDC session middleware for Express with body or cookie session transport and server-side storage of upstream refresh tokens and logout-capable `id_token`s.

## Status

This package now implements the core OIDC flow with body or cookie session transport.

Current implementation includes:

- the core middleware factory
- OIDC login redirect with PKCE, `state`, and `nonce`
- callback token exchange, server-side session creation, and one-time local exchange codes
- session refresh with session ID rotation
- server-driven upstream logout redirect using stored `id_token`
- OIDC backchannel logout handling via `logout_token`
- public TypeScript interfaces for hooks, sessions, config helpers, and store providers

## Installation

```sh
pnpm add @web-ts-toolkit/express-oidc-vault express
```

For the quick start, also install `@web-ts-toolkit/express-oidc-vault-memory-store`. TypeScript applications need `@types/express` and `@types/node` as development dependencies. Express `>=5.0.0` is the runtime peer dependency.

Use **named imports from the package root**. There is no default export or public subpath API.

## Requirements

- Node.js `>=22.12.0`. The published CJS entry (`index.js`) synchronously requires the ESM-only `jose` dependency, which needs Node's `require(esm)` support. That support is enabled by default starting with Node `22.12.0`; earlier Node 22 releases fail to load the CJS root with `ERR_REQUIRE_ESM` unless an experimental flag is passed. Both the CJS (`require`) and ESM (`import`) roots load without experimental flags on every verified runtime (`22.12.0`, `22.18.0`, `22.20.0`, `24.x`, `26.x`).
- TypeScript consumers typecheck with `skipLibCheck: false` under strict `NodeNext`/`Bundler` settings. ESM consumers resolve the `import` declaration condition (`index.d.mts`); CommonJS (`.cts`) consumers resolve the `require` condition (`index.d.ts`). Both include the public Express `req.auth` augmentation. Workspace builds place these files under `dist/`; release packaging moves them to the package root and rewrites metadata accordingly. Consumer imports always use the package name.

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
- `refresh` and `logout` do not read session cookies in this mode

### `sessionTransport: 'cookie'`

This mode stores `sessionId` in a backend-managed cookie.

- `exchange` sets the session cookie and omits `sessionId` from the JSON body
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

`cookie.httpOnly` is always enforced as `true`. Middleware creation rejects `httpOnly: false` and unsafe cookie names, domains, or paths so untrusted values cannot be serialized into `Set-Cookie` headers. `__Secure-` names require an effectively `Secure` cookie; `__Host-` names additionally require no `cookie.domain` and `cookie.path: '/'`.

Default cookie behavior:

- `name`: `oidc_vault_session`
- `path`: `/`
- `httpOnly`: `true`
- `deploymentMode`: `same-origin`
- `sameSite`: `lax` unless `deploymentMode` is `cross-site`
- `secure`: `true` for HTTPS `backendOrigin`, `sameSite: 'none'`, or `deploymentMode: 'cross-site'`; otherwise `false` as an intentional HTTP local-development policy (set `secure: true` explicitly when terminating TLS upstream of an `http` origin, or `secure: false` explicitly to opt out on HTTPS)
- `SameSite=None` is always serialized with `Secure` because browsers reject `SameSite=None` without it, even with explicit `secure: false`

Cookie-authenticated `refresh` and `logout` requests use a fail-closed CSRF policy for every `SameSite` mode. The request must include an `Origin` header, or a valid `Referer` header, whose origin matches `backendOrigin` or one of the configured `trustedOrigins`. Requests with no source-origin header are rejected. Backchannel logout is not affected because it is authenticated with the signed OIDC logout token rather than the browser session cookie.

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
- `POST /auth/oidc/backchannel-logout`

The mounted OIDC router parses JSON and `application/x-www-form-urlencoded` request bodies with an explicit default limit of `16kb`. This covers the small route payloads used by `exchange`, `refresh`, `logout`, and form-encoded backchannel logout. If an IdP requires a larger `logout_token`, set `requestBodyLimit` to a string or byte count accepted by Express body parsers.

Parser failures return a JSON client error before route handlers or store/provider hooks run. The stable error codes are:

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
const storeProvider = createMemoryOidcVaultStore();

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
    storeProvider,
    sessionTtlMs: 8 * 60 * 60 * 1000, // Opt in to an eight-hour absolute session lifetime.
  }),
);
```

Use the memory store for local development and tests. For production deployments, prefer a Redis or MongoDB store provider.

`backendOrigin` must be the public backend origin registered with your OIDC provider, such as `https://api.example.com`. Callback `redirect_uri` values are built from this pinned origin and the configured `basePath`, so reverse proxies and untrusted `Host` headers cannot change the provider callback URL. Configure Express `trust proxy` only for other request metadata needs; it is not used to derive the OIDC callback origin.

## Public Options And Defaults

| Option                          | Default                              | Contract                                                                                                                                                                                                                                             |
| ------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `basePath`                      | `/auth/oidc`                         | Mount path for the OIDC router. Route paths listed in this README are relative to this value.                                                                                                                                                        |
| `backendOrigin`                 | required                             | Public backend origin registered with the OIDC provider. Callback redirect URIs are derived from this pinned origin, not request host headers.                                                                                                       |
| `storeProvider`                 | required                             | Durable vault store provider. Use Redis or MongoDB for production and multi-instance deployments.                                                                                                                                                    |
| `config`                        | required provider values             | Supply `issuer` and `clientId`, or use `resolveOidcVaultConfigFromEnv(process.env)`. Endpoint settings select manual mode; see Config Helpers.                                                                                                       |
| `frontendRedirectUri`           | unset                                | Default browser return target after backend callback completion. Required if login accepts a custom `returnTo`. Validated before durable callback state; missing destination fails the callback with `500 OIDC_VAULT_MISSING_FRONTEND_REDIRECT_URI`. |
| `postLogoutRedirectUri`         | unset                                | Optional provider-registered HTTP(S) URL used in the upstream end-session redirect. Only consulted for redirected logout (`redirect: true`); upstream failures fall back to local `200 { loggedOut: true }` with `onError`.                          |
| `fetchUserInfo`                 | implementation default               | When enabled, UserInfo claims are fetched and merged only after the `sub` matches the verified ID token subject.                                                                                                                                     |
| `authorizationTransactionTtlMs` | `600000`                             | TTL for one-time authorization transactions created during login.                                                                                                                                                                                    |
| `exchangeCodeTtlMs`             | `30000`                              | TTL for one-time local exchange codes returned to the frontend callback route.                                                                                                                                                                       |
| `sessionTtlMs`                  | unset                                | Opt-in positive safe-integer lifetime in milliseconds from callback session creation. Hooks may shorten it; refresh never extends it.                                                                                                                |
| `sessionTransport`              | `body`                               | `body` returns and accepts JSON `sessionId`; `cookie` stores the session pointer in an `HttpOnly` cookie and rejects body-only refresh/logout IDs.                                                                                                   |
| `cookie`                        | see cookie defaults above            | Cookie transport options. `httpOnly` is always enforced as `true`; unsafe names, paths, domains, and `__Secure-`/`__Host-` prefix violations are rejected.                                                                                           |
| `trustedOrigins`                | `[]` plus `backendOrigin` internally | Browser origins allowed to call cookie-authenticated `refresh` and `logout`. Required for cross-site cookie transport.                                                                                                                               |
| `requestBodyLimit`              | `16kb`                               | Express JSON and URL-encoded parser limit for OIDC route bodies. Increase only for known provider backchannel logout token size needs.                                                                                                               |
| `providerRequestTimeoutMs`      | `5000`                               | Deadline per provider HTTP exchange (headers plus complete body). Cancellation is attempted without awaiting cleanup. Positive finite integer; validated before cache lookup.                                                                        |
| `hooks`                         | unset                                | Pre-commit hooks can veto operations by throwing; post-commit notification hook failures are reported to `onError` without undoing committed state.                                                                                                  |
| `tokenIssuer`                   | unset                                | Issues app-local access tokens for `exchange` and `refresh`. This lifetime is separate from upstream token and vault-session lifetimes.                                                                                                              |

Construction takes an internal resolved snapshot of the options object without mutating it: normalized values are stored on the snapshot, `cookie`/`trustedOrigins`/`config` containers are shallow-copied, and `storeProvider`/`hooks`/`tokenIssuer`/`now` service references are retained live (never deep-cloned). Frozen inputs work, reused inputs are not mutated, and mutating or replacing the caller object after creation has no effect on the created router.

## Absolute Session Lifetime

The quick start opts in with `sessionTtlMs: 8 * 60 * 60 * 1000`. New server-side sessions receive `expiresAt = now + sessionTtlMs` at **callback session creation**, not login start. Refresh preserves that timestamp. At `now >= expiresAt`, the store treats the session as expired, so exchange and refresh can no longer use it, even if an exchange code is still live.

Before `onBeforeSessionCreate`, the session already has its expiry. A hook may shorten it with a valid integer epoch-millisecond timestamp. Removing, extending, or assigning an invalid expiry restores the original cap after the hook; hook delay and changes to `createdAt` do not move that cap. For example, add this optional hook to the middleware options to shorten new sessions to one hour:

```ts
hooks: {
  onBeforeSessionCreate({ session }) {
    if (session?.expiresAt !== undefined) {
      session.expiresAt = Math.min(session.expiresAt, session.createdAt + 60 * 60 * 1000);
    }
  },
},
```

Omitting `sessionTtlMs` assigns no default session expiry and retains application/hook/store-owned policy. Enabling it affects new sessions; it does not retrofit existing sessions. Upstream OAuth `expires_in`, local access-token lifetime, and vault-session lifetime are independent.

`authorizationTransactionTtlMs` (default 10 minutes), `exchangeCodeTtlMs` (default 30 seconds), and optional `sessionTtlMs` must be positive safe-integer numbers of milliseconds. Construction rejects zero, negative, fractional, nonnumeric, null, NaN, infinite, and unsafe values. It samples `now` (default `Date.now`): the clock and computed expiry must be integer epoch milliseconds within JavaScript Date's inclusive ±8,640,000,000,000,000 ms range, with expiry after now. Record creation rechecks computed expiries; an unusable later clock/expiry returns sanitized HTTP 500 / `OIDC_VAULT_INTERNAL_ERROR` before new transaction/session/code persistence, with the original error available to `hooks.onError`.

## Frontend Integration Example

The backend flow is only half of the integration. In default body transport mode, keep `accessToken` in memory, mirror `sessionId` into `sessionStorage`, and deduplicate refresh calls.

The shared promise below coordinates callers in this JavaScript context only. It does not coordinate tabs, backend instances, or response arrival order; see [Known Browser And Concurrency Limits](#known-browser-and-concurrency-limits).

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

  await fetch('/auth/oidc/logout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });
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

The logout token must include `iat`, `exp`, `jti`, the standard backchannel logout event claim, and either `sid` or `sub`. If the protected header includes `typ`, it must be `logout+jwt`; tokens without `typ` remain accepted for provider compatibility. Each `jti` is reserved once per issuer/client ID (replay keys namespace the raw `jti`, so independent issuers sharing a store and reusing a `jti` do not suppress each other) and remembered until the token `exp`. The first presentation performs the idempotent session deletion and emits `onLogout`; a duplicate presentation repeats the same idempotent deletion without emitting `onLogout` unless the catch-up actually removed sessions (retry after a deletion failure still revokes and still delivers the hook). A sequential replay after completed revocation returns `revokedSessions: 0` without a hook. Hooks are therefore at-least-once under failure/concurrency, except a crash between durable deletion and hook delivery can lose that delivery. Pre-upgrade raw-`jti` replay records expire naturally with their token `exp` and are never matched by namespaced keys.

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
      // Host-only (no `domain`): the browser scopes the cookie to
      // `api.example.com` and still sends it on credentialed cross-origin
      // requests from `https://frontend.example.com`.
      deploymentMode: 'same-site',
      secure: true,
    },
    trustedOrigins: ['https://frontend.example.com'],
    storeProvider: createRedisOidcVaultStore({
      client: redis,
      keyPrefix: 'oidc-vault',
    }),
  }),
);
```

Only set `cookie.domain` (for example `.example.com`) as an advanced expansion when sibling subdomains must share the credential. Sharing widens the credential trust boundary and is not required for normal cross-origin API requests.

## Main Exports

- `createOidcVaultAccessTokenMiddleware(...)`
- `createOidcVaultJwtAccessTokenValidator(...)`
- `createOidcVaultMiddleware(...)`
- `DEFAULT_OIDC_VAULT_BASE_PATH`
- `DEFAULT_AUTHORIZATION_TRANSACTION_TTL_MS`
- `DEFAULT_EXCHANGE_CODE_TTL_MS`
- `DEFAULT_OIDC_SCOPES`
- `DEFAULT_OIDC_VAULT_REQUEST_BODY_LIMIT`
- `OIDC_VAULT_ROUTE_PATHS`
- `OIDC_VAULT_URL_ENCODED_PARAMETER_LIMIT`
- `normalizeOidcVaultBasePath(...)`
- `resolveOidcVaultConfig(...)`
- `resolveOidcVaultConfigFromEnv(...)`
- `type OidcVaultOptions`
- `type OidcVaultHooks`
- `type OidcVaultStoreProvider`
- `type OidcVaultSession`
- `type OidcVaultConfig`
- `type OidcVaultSessionInput`
- `OidcVaultStoreConflictError`
- `type OidcVaultExchangeResult`
- `type OidcVaultLogoutResult`
- `type OidcVaultAccessTokenValidator`
- `type OidcVaultAuthenticatedRequest`
- `type OidcVaultJwtAccessTokenValidatorOptions`
- `type OidcVaultTokenIssuer`
- `type OidcVaultTokenIssueResult`
- `type OidcVaultProviderMetadata`

## Store Provider Contract

The built-in memory, Redis, and MongoDB store packages share a portable subset with the lifetime, ID-reuse, serialization and deletion-accounting variations below. Their shipped READMEs describe backend startup/shutdown and resource bounds.

- `createAuthorizationTransaction` and `createExchangeCode` are deliberate upserts keyed by `state` and `code`.
- `createSession` duplicate-ID behavior is provider-specific: the memory and MongoDB providers replace the existing session (upsert), while the Redis provider rejects a live duplicate with `OidcVaultStoreConflictError` without changing the existing record or indexes (create-only, preserving index ownership). Portable callers must always create sessions with a fresh unused `sessionId` and handle `OidcVaultStoreConflictError`; reusing a live ID is non-portable. See `OidcVaultStoreProvider.createSession` for the full contract.
- Store metadata is portable when it is JSON-compatible: strings, finite numbers, booleans, null, arrays, and plain objects. Do not rely on functions, symbols, Dates, Maps, Sets, custom prototypes, undefined object properties, or object identity surviving a store round-trip.
- For that portable domain, inputs are captured at invocation before asynchronous work, including nested provider/user/metadata fields and object deletion scopes. Mutating inputs immediately after calling, or mutating returned values, cannot change the committed value or eventual result. Memory uses `structuredClone`; MongoDB/Redis copy plain containers while preserving native backend serialization outside the portable subset. Opaque native objects/custom serializers have no portable mutation-isolation guarantee.
- Expiry timestamps are epoch milliseconds. Memory/MongoDB check `expiresAt <= now`; Redis uses server-owned key TTLs and server time for index cleanup, not the optional application clock. Preserve matching Redis TTLs/index scores on restore: reads do not independently audit payload expiry after externally altered TTLs. Backchannel logout JTI expiry must be finite and in the future relative to the store clock or the consume call returns `false` without storing the JTI.
- Backchannel logout replay keys passed to `consumeBackchannelLogoutTokenJti` are opaque namespaced strings (issuer/client ID/`jti`); providers store them verbatim and need no schema change.
- `rotateSession` requires an existing source session and a distinct unused target `sessionId`. Equivalent missing-source, same-ID, and existing-target rotation conflicts throw `OidcVaultStoreConflictError` without deleting or overwriting source or target data.
- Session rotation preserves the logical session ID when the next session omits one. With finite expiry, each old ID revokes its lineage only before its immediate successor's `expiresAt`; later rotations do not extend earlier aliases. `A -> B (T1) -> C (T2)` leaves A expiring at T1 even if T2 is later or absent. `getSession(A)` returns `null`. After that window use the live ID or logical/subject/provider-session deletion. With `A/L1 -> B/L1 -> C/L2`, the new B alias targets L2; retained A targets L1 with its original deadline. Memory eagerly retires inactive old-lineage aliases on rotation/upsert; MongoDB/Redis can retain them until expiry or explicit cleanup. Use distinct logical IDs for unrelated login families.
- Without successor `expiresAt`, retention is provider-specific: memory and Redis impose no alias time limit and can accumulate arbitrarily many aliases; MongoDB uses `rotatedSessionAliasRetentionMs` (default 5 minutes). Core refresh uses the live ID and preserves expiry. This retains the [SVH-05 decision](https://github.com/egose/web-ts-toolkit/blob/main/docs/tasks/20260908-130120-oidc-vault-stores-health-follow-up.md#task-svh-05-decide-a-portable-rotation-alias-lifetime-contract).
- Deleting a live public ID removes that record; an unexpired alias revokes its logical lineage. Subject/provider-session object inputs match each supplied issuer/client field; string inputs omit those filters. Logical deletion and aliases have no issuer/client filter. Scoped/direct deletion preserves unexpired aliases while a live member survives, including another provider scope. MongoDB retains alias rows under reused create IDs until expiry/lineage cleanup; memory/Redis clear target aliases on reuse.
- Bulk counts cover primary records deleted, never alias cleanup: memory excludes expired sessions, MongoDB can count expired documents awaiting TTL cleanup, and Redis counts actual primary deletions including matching rotation successors. MongoDB scoped deletes repeat until an empty query (continuous arrivals can prolong them); Redis makes one cursor traversal. Later arrivals can survive and errors can follow committed deletions. Counts are not proof of an empty scope or a portable live-user census. Neither backend provides a global logout snapshot.
- Operational bounds are local, not total-work guarantees: memory's 64-slot sweeps still rebuild full key snapshots and scan maps for lineage cleanup; MongoDB materializes affected IDs/survivors with potentially large `$in` sets; Redis SCAN/ZSCAN COUNT values are hints and Lua can materialize whole lineages/alias sets. Maintenance progress depends on operations/backend availability.
- Compatibility: surviving aliases and invocation-time portable input ownership now remain intact across scoped deletion and caller mutation. Redis repairs keyed-record/index corruption conservatively and emits only fixed operation text for post-commit maintenance warnings. Arbitrary backend errors may still carry secrets: log allowlisted categories rather than records, raw errors, credential URLs or token-valued labels. Alias lifetime and duplicate-create variations remain intentional.

## Session Identity And Store Namespaces

Exchange, refresh, and logout of a **live session** compare every stored `provider.issuer` and `provider.clientId` that is not undefined against the resolved middleware configuration. Each known field must match independently. Stored identifiers are compared verbatim, without trimming or URL canonicalization; issuer trailing-slash variants are distinct. Configuration strings still receive construction-time trimming.

A known mismatch returns HTTP 401 with `{"code":"OIDC_VAULT_INVALID_SESSION","message":"Session is missing or expired."}` before discovery, upstream token use, local issuance, lifecycle hooks, rotation, or lineage deletion. It neither sets nor clears a cookie and produces no provider logout redirect. The normal `onError` observer runs without the foreign session in its context.

Legacy sessions with absent `provider`, an empty provider object, or omitted/undefined identity fields remain supported. Only known fields are checked: an omitted issuer permits cross-issuer use, an omitted client ID permits cross-client use, and entirely absent identity permits both. Refresh does not backfill identity.

For complete identity isolation, use separate store namespaces for **session/alias, exchange-code, and authorization-transaction records**. Live-session checks alone do not isolate shared namespaces: exchange consumes the one-time code before checking identity, so a rejected foreign exchange still spends the owner's code. When logout finds no live session, it still calls `deleteSession` through the stale-alias path without an identity check, which can revoke a foreign lineage in shared storage.

## Known Browser And Concurrency Limits

- **Browser binding:** `state`, nonce, PKCE, and one-time codes do not bind login/callback/exchange completion to the initiating browser. A transferred callback/frontend URL can cause login/session swapping; a stolen unused exchange code can be redeemed by another browser in either transport. `exchange` has no source-origin check and accepts URL-encoded forms. CORS, `SameSite`, and `trustedOrigins` on cookie refresh/logout do not establish this missing binding.
- **Refresh families:** local atomic rotation allows one winner, but overlapping requests can send the same upstream refresh token multiple times, including across backend instances. A single-use provider with reuse detection can revoke the entire upstream refresh family, leaving the local winner unable to refresh. Deduplicate frontend refreshes, including bootstrap and retry paths; a per-context promise is not a distributed guarantee.
- **Cookie ordering:** a loser reaching a local rotation conflict (or a stale missing-session retry) clears the cookie. A late clear can erase the winner's cookie even while its server session remains live. Upstream-failure losers do not set a cookie. Response ordering is not enforced.
- **Logout and stateless tokens:** local/provider/backchannel logout revoke vault refresh sessions, not outstanding stateless application access tokens. Those remain valid until their own expiry unless your validator checks application revocation state. A refresh racing logout can still return 200 and an access token after its lineage is deleted. Keep local tokens short-lived; immediate API revocation requires application-owned validation state. Vault-session expiry likewise does not revoke an already-issued stateless token.

Browser-bound proofs (BOV-02-FU1), cross-instance refresh reservation (BOV-03-FU1), and stale-cookie ordering (BOV-03-FU2) remain proposed in the [boundary review](https://github.com/egose/web-ts-toolkit/blob/main/docs/tasks/20260908-070811-express-oidc-vault-boundary-review.md). The lifetime, identity, and response changes documented here do not implement those protocols.

## Key Integration Notes

- The browser should never receive the upstream refresh token.
- The backend should store the latest upstream `id_token` so logout can call the upstream end-session endpoint with `id_token_hint`.
- `sessionId` should rotate on refresh.
- The frontend should deduplicate concurrent refresh calls so only one refresh is in-flight at a time.
- Upstream OAuth `expires_in` describes the upstream access token only. It does not set `OidcVaultSession.expiresAt` or shorten the refresh-token-backed vault session.
- `OidcVaultSession.expiresAt`, assigned by `sessionTtlMs`, application code, or store policy, is an explicit vault-session expiry in epoch milliseconds and remains enforced by store providers.
- With `issuer` and `clientId` but no endpoint settings, discovery is used and the discovered issuer must exactly equal the configured issuer (only configured surrounding whitespace is trimmed; `/tenant`, `/tenant/`, and `/tenant//` are distinct identifiers).
- Provider discovery metadata and remote JWKS resolvers are cached in bounded process-wide maps; these keys are intended to come from static middleware configuration, not request input. Discovery fetches are isolated by `(issuer, providerRequestTimeoutMs)` so differing instance policies never inherit each other's deadline, while settled successful metadata is additionally shared across timeouts for reuse. JWKS resolvers are isolated by `(jwks_uri, providerRequestTimeoutMs)` because JOSE fixes the fetch timeout at creation.
- Successful discovery entries are reused for up to 10 minutes and both discovery and JWKS resolver maps retain at most 32 entries with oldest-entry eviction. Failed discovery requests evict only the owning policy entry so a later request can retry. Timeout options are validated before any cache lookup, so cached entries cannot bypass option validation.
- Discovery, token, UserInfo, and remote JWKS HTTP requests use a 5 second default deadline covering response headers plus complete success/error body consumption; stalled or slow bodies fail with sanitized endpoint-specific timeout errors. Cancellation is attempted promptly without awaiting its promise, so an uncooperative custom stream cannot hold up error delivery through pending cleanup. Request completion does not guarantee completed resource cleanup; the hanging-cancellation evidence uses custom streams, with no native-undici remote exploit established. Upstream redirects are never followed. Set `providerRequestTimeoutMs` to a positive integer number of milliseconds to change the bound. JWKS documents additionally enforce 1 MiB and 100-key limits.
- Pre-header network rejection and mid-body transport reset return HTTP 502 with `OIDC_VAULT_DISCOVERY_FAILED`, `OIDC_VAULT_TOKEN_REQUEST_FAILED`, or `OIDC_VAULT_USERINFO_FAILED` and message `OIDC provider request failed.` JWKS transport failures use `OIDC_VAULT_JWKS_FAILED`; JOSE timeouts retain `ERR_JWKS_TIMEOUT`. Discovery success-body timeout/size/JSON failures retain `OIDC_VAULT_DISCOVERY_INVALID`. Original transport diagnostics are privately available as `hooks.onError` context `error.cause` (narrow the unknown error before reading it); they are not browser payload fields.
- Provider response parse errors return sanitized client messages; oversized or malformed provider bodies are not returned to callers. Discovery, token, and UserInfo JSON bodies must be non-null, non-array objects; valid non-object JSON (`null`, arrays, strings, booleans, numbers) is a controlled 502 provider error.
- Non-success token/UserInfo responses always surface 502 with a stable code/message (`OIDC_VAULT_TOKEN_REQUEST_FAILED` / `OIDC_VAULT_USERINFO_FAILED`) regardless of JSON versus HTML bodies and without leaking body content or the upstream status. Upstream redirects are never followed, so a rejected 302 never becomes a browser-facing 3xx.
- If manual endpoints are configured, manual endpoints are used and discovery is not performed; `issuer` is still required so ID and logout tokens are issuer-bound against the exact configured identifier.
- Token responses must include `token_type: Bearer`; `expires_in`, when present, must be a finite non-negative integer. Present `access_token`/`id_token`/`refresh_token` fields must be non-empty strings and a present `scope` must be a string; malformed present fields are rejected rather than treated as omissions.
- Callback (authorization-code) responses additionally require `id_token` and `refresh_token`; no session or exchange code is persisted until all provider checks pass. The callback destination (transaction `returnTo` or `frontendRedirectUri`) is validated before any provider call or durable session/code creation and fails with `500 OIDC_VAULT_MISSING_FRONTEND_REDIRECT_URI` when neither is configured, so a missing destination cannot strand credentials.
- ID tokens must include `sub`, `exp`, and `iat`; `azp` must match `clientId` when present and is required for multi-audience ID tokens.
- UserInfo responses must be objects including a `sub` matching the verified ID-token subject before claims are merged into the session user; JSON `null` never bypasses the subject check.
- Refresh responses may omit `id_token`, `refresh_token`, `access_token`, and `scope`; omitted fields retain their current session values (omitted `id_token` keeps the existing verified identity without requiring the original ID token to still be current). If refresh returns a new `id_token`, its `sub` must match the current session subject; no rotation happens until all provider checks pass.
- Refresh profile precedence: fresh verified ID claims are the base when a new `id_token` is present, freshly fetched matching UserInfo overlays whichever base applies, and the retained profile is used only when no new `id_token` arrives (fresh UserInfo still overlays the retained base per key). Retained values are never merged over fresh claims and are never treated as fresh UserInfo. Claims absent from the fresh sources are dropped when fresh identity arrives, so removed provider claims disappear; keep application custom attributes in `session.metadata`, not in `user`, because application-added `user` keys are not carried forward across a fresh identity refresh.
- `backendOrigin` is the public origin registered with your OIDC provider for the backend callback URI. The middleware normalizes it to an origin and uses it for `/callback` redirect URIs instead of trusting request `Host` headers.
- `frontendRedirectUri` is the default browser return target after the backend completes the upstream callback. It stays optional at middleware creation because non-callback routes do not need it, but the callback fails fast before durable state when neither the transaction `returnTo` nor this value is configured.
- `postLogoutRedirectUri` is optional. When configured, it must be an absolute HTTP(S) URL registered with the OIDC provider for post-logout redirects. It may be hosted on a different origin from `frontendRedirectUri` when that exact URL is provider-registered. It is only consulted for redirected logout (`redirect: true`).
- After live-session identity checks, local logout (`redirect` unset or `false`) never contacts the provider: it revokes the local session lineage, clears the cookie under cookie transport, delivers `onLogout` for a live session, and returns `200 { loggedOut: true }`. Redirected logout (`redirect: true`) commits the same local outcome before attempting an upstream end-session redirect. Discovery errors are reported through `onError`; errors or an absent `endSessionEndpoint` fall back to local `200 { loggedOut: true }`. With no live session, logout attempts stale-alias deletion and returns local success without `onLogout`; an expired alias may no longer identify a live lineage.
- backchannel logout revokes local sessions by upstream `sid` when available, otherwise by `sub`
- Every vault route response carries `Cache-Control: no-store` (login/callback/logout redirects, exchange/refresh/logout/backchannel JSON, and error JSON including body-parser errors) so caches do not retain session/access credentials, one-time exchange codes, or authorization redirects. Only `no-store` is emitted: legacy `Pragma`/`Expires` add no protection once `no-store` is present, and no `Referrer-Policy` is set because redirect targets intentionally expose protocol-required values (provider authorization URL, frontend `?code=`, upstream `id_token_hint`) to the navigation target. This does not clear browser history, disable reverse-proxy request logging, strip `?code=` from frontend URLs/history (the frontend must still clean up the callback URL, e.g. `history.replaceState`), or hide intentional provider redirect exposure. Verify with `curl -i` (expect `Cache-Control: no-store` on `GET /auth/oidc/login`, `POST /auth/oidc/exchange`, `POST /auth/oidc/refresh`, and `POST /auth/oidc/logout`) or assert `response.headers['cache-control'] === 'no-store'` in integration tests under both transports.

## Config Helpers

```ts
import { resolveOidcVaultConfigFromEnv } from '@web-ts-toolkit/express-oidc-vault';

const config = resolveOidcVaultConfigFromEnv(process.env);
```

Resolution behavior:

- the issuer identifier is syntax-validated (absolute http/https URL without userinfo, query, or fragment; `http` is accepted for local-test providers) but otherwise preserved exactly after surrounding-whitespace trimming: no trailing slash is added and `/tenant`, `/tenant/`, and `/tenant//` remain distinct
- `OIDC_CLIENT_ID` is always required; with `OIDC_ISSUER` and no endpoint settings, discovery resolves endpoints and requires exact discovered-issuer equality
- any nonempty endpoint (`authorizationEndpoint`, `tokenEndpoint`, `jwksUri`, `userInfoEndpoint`, or `endSessionEndpoint`) selects manual mode with no discovery; this includes `OIDC_USERINFO_ENDPOINT` and `OIDC_END_SESSION_ENDPOINT`. Manual mode requires `issuer`, `authorizationEndpoint`, `tokenEndpoint`, and `jwksUri`, plus `clientId`. Optional endpoints are not partial discovery overrides
- undefined, empty, and whitespace-only config/env strings are absent after trimming; complete manual configuration preserves valid optional endpoints
- `OIDC_SCOPES` defaults to `openid email profile`

Discovery may omit `userinfo_endpoint` and `end_session_endpoint`. If present, each must be a nonempty absolute HTTP(S) URL string. Null, arrays, objects, numbers, booleans, blank strings, malformed URLs, and non-HTTP(S) URLs invalidate metadata with HTTP 502 / `OIDC_VAULT_DISCOVERY_INVALID`, identifying the field without echoing its value. Failed metadata is evicted so later requests can fetch corrected metadata; only validated successes are shared across timeout policies. During redirected logout, discovery errors instead reach `onError` while local revocation still succeeds; local-only logout does not discover metadata.

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
- `issuer`

`userInfoEndpoint` and `endSessionEndpoint` are optional but recommended when your provider supports them.

## Local Access Token Example

The middleware can return a local backend access token during `exchange` and `refresh` by providing a `tokenIssuer`.

```ts
import express from 'express';
import { SignJWT } from 'jose';
import { createOidcVaultMiddleware } from '@web-ts-toolkit/express-oidc-vault';
import { createMemoryOidcVaultStore } from '@web-ts-toolkit/express-oidc-vault-memory-store';

const app = express();

// Fail startup when no suitably strong signing key is configured. There is no
// public fallback: `APP_JWT_SECRET` must be a strong random value that encodes
// to at least 32 bytes for HS256.
const requireSigningKey = (raw: string | undefined): Uint8Array => {
  if (!raw) {
    throw new Error('APP_JWT_SECRET must be set to a strong random value at least 32 bytes long.');
  }

  const key = new TextEncoder().encode(raw);

  if (key.length < 32) {
    throw new Error('APP_JWT_SECRET must decode to at least 32 bytes for HS256 local access tokens.');
  }

  return key;
};

const jwtSecret = requireSigningKey(process.env.APP_JWT_SECRET);
const localTokenIssuer = 'https://api.example.com';
const localTokenAudience = 'api-audience';

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
    tokenIssuer: {
      async issue({ session }) {
        const accessToken = await new SignJWT({
          sub: session.subject,
          sid: session.sessionId,
          scope: session.scope,
        })
          .setProtectedHeader({ alg: 'HS256' })
          .setIssuer(localTokenIssuer)
          .setAudience(localTokenAudience)
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
- the frontend receives local token fields and the session's `user` profile; body transport also includes the opaque `sessionId`, while cookie transport omits it
- the app-issued access token can contain only the claims your backend APIs actually need

### Local issuer result contract

`tokenIssuer.issue` must resolve to a non-null, non-array object with:

- `accessToken`: nonempty opaque string, returned verbatim without trimming or a new whitespace policy;
- `expiresIn`: finite nonnegative safe-integer seconds, from 0 through `Number.MAX_SAFE_INTEGER`;
- `tokenType`: optional exact literal `'Bearer'`. Omitted/undefined stays absent in JSON; null, lowercase `'bearer'`, and other values are invalid.

Only these three fields are copied once into a fresh result. Extra fields (including upstream tokens, `metadata`, `sessionId`, `user`, and `toJSON`) are ignored without evaluating their getters. The vault supplies the response session ID/profile. Omitting `tokenIssuer` is supported and returns no local token fields.

Malformed results return HTTP 500 with `{"code":"OIDC_VAULT_INTERNAL_ERROR","message":"Unexpected OIDC vault error."}` inside issuance rollback: the logical lineage is revoked and cookie transport clears its cookie instead of minting one. Exchange has already consumed its code; refresh has already contacted the provider and rotated the handle, and its success notification does not run. Correct the issuer and start a new login. Field-specific diagnostics are the original `hooks.onError` context `error` (narrow it before use); allowed-field getter exceptions also enter rollback.

This projection contains accidental result extensions. Issuers/hooks remain trusted code with mutable session/request/response access; application profiles and deliberate secrets placed in allowed fields are not redacted.

## Migration And Behavior Changes

- Optional-only endpoint settings previously ignored now select manual mode and fail without the complete manual set. Supply all required manual values or remove endpoint settings to use discovery. Correct malformed optional discovery capabilities at the provider, or omit unsupported fields.
- Invalid transaction/code TTLs previously had store-dependent behavior; supply positive safe-integer milliseconds. `sessionTtlMs` is opt-in for new sessions and never renews on refresh. Custom clocks are now sampled during construction.
- Route each session to its owning issuer/client configuration. Known foreign live sessions now fail with 401. Correct inaccurate stored identity only from trusted provenance or require login again; do not remove identity fields to bypass the guard. Legacy omissions and shared code/alias limits remain as described above.
- Issuers must return the declared local credential shape; previously accepted malformed results now fail with rollback. Extra result properties no longer extend/override JSON responses.
- Provider network/reset failures now produce sanitized endpoint-specific 502s instead of generic internal errors. Cancellation no longer waits for an uncooperative cleanup promise. Alias-retention wording reflects existing SVH-05 behavior, with no store migration.

## Access Token Validation Middleware

The OIDC route/session middleware and the normal API bearer-token middleware are separate concerns.

Use `createOidcVaultMiddleware(...)` for:

- login
- callback
- exchange
- refresh
- logout

Use `createOidcVaultAccessTokenMiddleware(...)` for:

- validating the app-issued local access token on protected API routes
- attaching authenticated auth context to `req.auth`
- rejecting missing, malformed, invalid, or expired bearer tokens with `401`

`onAuthContext` is a pre-`next()` veto hook, not a post-commit notification:
when it throws, downstream middleware never runs and `req.auth` is detached
before the error response is sent. A valid token plus a failing hook never
surfaces as an invalid-token `401`: an `OidcVaultHttpError` from the hook keeps
its own status/code/client message (only a `401` veto carries the `Bearer`
challenge), while any other hook error becomes a sanitized `500
OIDC_VAULT_AUTH_CONTEXT_FAILED` without leaking the original message. Pass
`onError` to observe the original bearer error object (extraction, validator,
or hook failure) for private server-side logs; it never affects the sanitized
client response.

```ts
import express from 'express';
import { createOidcVaultAccessTokenMiddleware } from '@web-ts-toolkit/express-oidc-vault';
import { jwtVerify } from 'jose';

const app = express();

// Fail startup when no suitably strong signing key is configured. There is no
// public fallback: `APP_JWT_SECRET` must be a strong random value that encodes
// to at least 32 bytes for HS256.
const requireSigningKey = (raw: string | undefined): Uint8Array => {
  if (!raw) {
    throw new Error('APP_JWT_SECRET must be set to a strong random value at least 32 bytes long.');
  }

  const key = new TextEncoder().encode(raw);

  if (key.length < 32) {
    throw new Error('APP_JWT_SECRET must decode to at least 32 bytes for HS256 local access tokens.');
  }

  return key;
};

const jwtSecret = requireSigningKey(process.env.APP_JWT_SECRET);
const localTokenIssuer = 'https://api.example.com';
const localTokenAudience = 'api-audience';

app.get(
  '/api/me',
  createOidcVaultAccessTokenMiddleware({
    validator: {
      async validate(token) {
        const result = await jwtVerify(token, jwtSecret, {
          issuer: localTokenIssuer,
          audience: localTokenAudience,
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

Returned auth context shape:

- `req.auth.token`
- `req.auth.subject`
- `req.auth.sessionId`
- `req.auth.scope`
- `req.auth.claims`

The package augments Express request typing so `req.auth` is available without casting in TypeScript route handlers.

### JWT validator helper

If your local access token is a JWT, you can avoid rewriting the same `jwtVerify(...)` adapter each time.

```ts
import {
  createOidcVaultAccessTokenMiddleware,
  createOidcVaultJwtAccessTokenValidator,
} from '@web-ts-toolkit/express-oidc-vault';

const requireSigningKey = (raw: string | undefined): Uint8Array => {
  if (!raw) {
    throw new Error('APP_JWT_SECRET must be set to a strong random value at least 32 bytes long.');
  }

  const key = new TextEncoder().encode(raw);

  if (key.length < 32) {
    throw new Error('APP_JWT_SECRET must decode to at least 32 bytes for HS256 local access tokens.');
  }

  return key;
};

const jwtSecret = requireSigningKey(process.env.APP_JWT_SECRET);

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

If you need a custom mapping, pass `mapClaims(...)` to `createOidcVaultJwtAccessTokenValidator(...)`.

Recommended separation:

- keep login/session lifecycle in `createOidcVaultMiddleware(...)`
- keep normal API bearer validation in `createOidcVaultAccessTokenMiddleware(...)`
- keep authorization decisions outside the validator middleware

## Hook Examples

Hooks let the app observe or extend the core OIDC flow without forking the middleware.

### Audit and user provisioning hooks

```ts
import { createHmac } from 'node:crypto';
import express from 'express';
import { createOidcVaultMiddleware } from '@web-ts-toolkit/express-oidc-vault';
import { createMemoryOidcVaultStore } from '@web-ts-toolkit/express-oidc-vault-memory-store';

const app = express();
const auditKey = new TextEncoder().encode(process.env.APP_AUDIT_KEY ?? '');

// Purpose-specific keyed fingerprint for audit logs. Never log the raw
// refresh-session ID: it is a credential that redeems a new session.
const fingerprintSessionId = (sessionId: string | undefined): string | undefined => {
  if (!sessionId || auditKey.length === 0) {
    return undefined;
  }

  return createHmac('sha256', auditKey).update(sessionId, 'utf8').digest('hex').slice(0, 16);
};

// Query-free route label. Never log `req.originalUrl`: callback and frontend
// URLs can carry `code`, `state`, or tokens in the query string.
const queryFreeRoute = (req: { method?: string; path?: string }): string =>
  `${req.method ?? 'UNKNOWN'} ${req.path ?? 'unknown'}`;

// Selected sanitized error fields. Never log the arbitrary error object or its
// message: provider, store, and hook errors may carry secrets or token bodies.
const sanitizeErrorForLog = (error: unknown): { code: string; status?: number } => {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const { code, status } = error as { code?: unknown; status?: unknown };

    return {
      code: typeof code === 'string' ? code : 'UNKNOWN',
      ...(typeof status === 'number' ? { status } : {}),
    };
  }

  return { code: 'UNKNOWN' };
};

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
          previousSession: fingerprintSessionId(
            typeof metadata?.previousSessionId === 'string' ? metadata.previousSessionId : undefined,
          ),
          nextSession: fingerprintSessionId(session?.sessionId),
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
          path: queryFreeRoute(req),
          ...sanitizeErrorForLog(error),
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

- `onLoginStart`, `onAuthorizationUrl`, `onCallbackTokens`, `onUserInfo`, `onBeforeSessionCreate`, and `onBeforeLogout` are pre-commit hooks. Throwing from one of these hooks vetoes the operation before the related durable session state is created, rotated, or deleted.
- `onSessionCreated`, `onSessionRefreshed`, and `onLogout` are post-commit notification hooks. Their failures are reported to `onError` but do not change a successful callback redirect, refresh response, logout response, or already-committed store mutation.
- use `onSessionCreated` for local user provisioning or last-login updates
- use `onSessionRefreshed` for audit logs and session rotation tracing
- use `onLogout` to revoke local app state that depends on the session
- use `onError` for structured logging and alerting

Client error responses keep a stable `{ code, message }` shape and intentionally avoid returning raw provider, store, hook, token issuer, or access-token validator details. Use the core `hooks.onError` to observe the original error object for private server-side logs; the separate bearer middleware reports its original extraction/validator/hook errors through its own `onAuthContext`-sibling `onError` option.

## Security Checklist

Use these defaults when deploying the package:

- keep `sessionId` in `sessionStorage` and keep `accessToken` in memory only
- never store the upstream refresh token in the browser
- use HTTPS end-to-end for frontend, backend, and IdP communication
- set `backendOrigin` to the public backend origin registered with the provider; do not rely on request host or proxy headers for callback URL construction
- keep the default `requestBodyLimit` of `16kb` unless a provider requires a larger form-encoded backchannel `logout_token`
- treat XSS prevention as critical because `sessionStorage` is still readable by JavaScript
- enable a strict Content Security Policy and avoid unsafe inline scripts
- rotate `sessionId` on refresh and overwrite the mirrored `sessionStorage` value immediately
- clear in-memory auth state and `sessionStorage` on logout, even if upstream logout fails
- set `postLogoutRedirectUri` explicitly so logout destinations stay predictable
- when using cookie transport, rely on cookie credentials only for `refresh` and `logout`; do not send fallback body `sessionId` values
- when using cross-site cookie transport, send frontend requests with `credentials: 'include'`, enable credentialed CORS, use `SameSite=None; Secure`, and allow only known frontend origins via `trustedOrigins`
- keep cookie-authenticated CSRF protection fail-closed for every `SameSite` mode by requiring an `Origin` or valid `Referer` matching `backendOrigin` or `trustedOrigins`
- protect any app-issued local access token with a short lifetime, such as 5 to 15 minutes
- treat upstream OAuth `expires_in`, local access-token lifetime, and vault-session expiry as separate policies
- use Redis or MongoDB, not the memory store, for production or multi-instance deployments
- monitor `onError` and other hooks so failed callback, refresh, and logout flows are visible in private server logs without returning raw provider, token, store, or hook errors to clients

## Store Packages

- `@web-ts-toolkit/express-oidc-vault-memory-store`
- `@web-ts-toolkit/express-oidc-vault-redis-store`
- `@web-ts-toolkit/express-oidc-vault-mongodb-store`
