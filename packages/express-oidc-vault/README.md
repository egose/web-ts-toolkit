# `@web-ts-toolkit/express-oidc-vault`

OIDC session middleware for Express with body or cookie session transport and server-side storage of upstream refresh tokens and logout-capable `id_token`s.

## Status

This package now implements the core OIDC flow with body or cookie session transport.

Current implementation includes:

- the core middleware factory
- OIDC login redirect with PKCE, `state`, and `nonce`
- opt-in JSON POST login with an HttpOnly transaction cookie and verified/reserved proof when DPoP is enabled
- callback token exchange, server-side session creation, and one-time local exchange codes
- session refresh with session ID rotation
- server-driven upstream logout redirect using stored `id_token`
- OIDC backchannel logout handling via `logout_token`
- public TypeScript interfaces for hooks, sessions, config helpers, and store providers
- request-aware local JWT API authentication with opt-in DPoP proof, nonce, and shared replay enforcement
- separate opt-in generic fingerprint recognition at POST login and before exchange/refresh (change detection, not PoP)

## Installation

```sh
pnpm add @web-ts-toolkit/express-oidc-vault express
```

For the quick start, also install `@web-ts-toolkit/express-oidc-vault-memory-store`. TypeScript applications need `@types/express` and `@types/node` as development dependencies. Express `>=5.0.0` is the runtime peer dependency.

Use **named imports from the package root** for backend APIs; there is no default export. The pure [`/wire` type entry](#browser-wire-types) is available for browser DTO consumers.

## Requirements

- Node.js `>=22.12.0`. The published CJS entry (`index.js`) synchronously requires the ESM-only `jose` dependency, which needs Node's `require(esm)` support. That support is enabled by default starting with Node `22.12.0`; earlier Node 22 releases fail to load the CJS root with `ERR_REQUIRE_ESM` unless an experimental flag is passed. Both the CJS (`require`) and ESM (`import`) roots load without experimental flags on every verified runtime (`22.12.0`, `22.18.0`, `22.20.0`, `24.x`, `26.x`).
- TypeScript consumers typecheck with `skipLibCheck: false` under strict `NodeNext`/`Bundler` settings. ESM consumers resolve the `import` declaration condition (`index.d.mts`); CommonJS (`.cts`) consumers resolve the `require` condition (`index.d.ts`). Both include the public Express `req.auth` augmentation. Workspace builds place these files under `dist/`; release packaging moves them to the package root and rewrites metadata accordingly. Consumer imports always use the package name.

### Browser wire types

`@web-ts-toolkit/express-oidc-vault/wire` exports **types only**:
`OidcVaultLoginInitiationInput`, `OidcVaultLoginInitiationResult`,
`OidcVaultExchangeResult`, `OidcVaultLogoutResult`, `OidcVaultSessionTransport`,
`OidcVaultTokenIssueResult`, and `OidcVaultUserProfile`. These are the same
single-sourced DTOs available at the backend root. Use `import type` from
`/wire` in browser code; it has no Express augmentation or Node type dependency.
Its ESM/CJS declarations are `wire.d.mts` / `wire.d.ts`, with empty
`wire.mjs` / `wire.js` runtime entries and no runtime imports. Both layouts
follow the workspace/release path rules above.

The companion browser client bundles the DTO declarations it needs, so installing
`@web-ts-toolkit/oidc-vault-dpop-client` needs neither this backend package nor
Express/Node ambient types. See [Browser DPoP client](#browser-dpop-client).

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
- `trustedOrigins`: browser sources for POST login/guarded exchange in **both** transports and cookie-authenticated `refresh`/`logout`; required when cross-site session cookie transport is enabled

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

**Session transport and device-binding mode are independent options.** Opt-in POST login and guarded exchange always need the temporary transaction cookie, including with `sessionTransport: 'body'`. The session cookie is separate and starts at successful exchange. Same-site subdomains can use Lax cookies with credentialed cross-origin requests; cross-origin does not itself mean cross-site. Cross-site SPAs need an explicit HTTPS `transactionCookie: { sameSite: 'none' }` as well as suitable session-cookie settings, credentialed CORS, and a browser policy that permits those cookies.

Recommended frontend boot flow (default unbound transport):

1. Read `sessionId` from `sessionStorage`.
2. If present, call `POST /auth/oidc/refresh` immediately.
3. If refresh succeeds, replace the stored `sessionId` with the rotated value and keep the returned `accessToken` in memory only.
4. On a terminal session error, clear the handle and route to sign-in. A transient/proof/nonce failure is not evidence that the session was revoked; retain recovery state and apply the operation's retry contract.

If you use `sessionTransport: 'cookie'`, the frontend boot flow becomes simpler:

1. Keep `accessToken` in memory only.
2. Call `POST /auth/oidc/refresh` on app startup.
3. Let the backend read and rotate the session cookie.
4. On a terminal session error, clear local auth and route to sign-in. The DPoP client classifies these using `OidcVaultDpopClientError.requiresLogin`, not HTTP status alone.

## Endpoints

The core middleware exposes these endpoints under a configurable base path:

- `GET /auth/oidc/login`
- `POST /auth/oidc/login` when `deviceBinding` or `fingerprintRecognition` is configured (JSON initiation; see below)
- `GET /auth/oidc/callback`
- `POST /auth/oidc/exchange`
- `POST /auth/oidc/refresh`
- `POST /auth/oidc/logout`
- `POST /auth/oidc/logout/navigation` and `GET /auth/oidc/logout/navigation` when `logoutNavigation` is configured (JSON initiation, then one-time navigation)
- `POST /auth/oidc/backchannel-logout`

The mounted OIDC router parses JSON and `application/x-www-form-urlencoded` request bodies with an explicit default limit of `16kb`. This covers the small route payloads used by `exchange`, `refresh`, `logout`, and form-encoded backchannel logout. POST login accepts only `application/json`; other media types return `415 OIDC_VAULT_UNSUPPORTED_REQUEST_BODY_TYPE` before the general parsers run. If an IdP requires a larger `logout_token`, set `requestBodyLimit` to a string or byte count accepted by Express body parsers.

Parser failures return a JSON client error before route handlers or store/provider hooks run. The stable error codes are:

- `OIDC_VAULT_REQUEST_BODY_TOO_LARGE`
- `OIDC_VAULT_REQUEST_BODY_PARAMETER_LIMIT_EXCEEDED`
- `OIDC_VAULT_UNSUPPORTED_REQUEST_BODY_ENCODING`
- `OIDC_VAULT_MALFORMED_REQUEST_BODY`
- `OIDC_VAULT_INVALID_REQUEST_BODY`

## Quick Start (default unbound lifecycle)

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

| Option                          | Default                                    | Contract                                                                                                                                                                                                                                             |
| ------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `basePath`                      | `/auth/oidc`                               | Mount path for the OIDC router. Route paths listed in this README are relative to this value.                                                                                                                                                        |
| `backendOrigin`                 | required                                   | Public backend origin registered with the OIDC provider. Callback redirect URIs are derived from this pinned origin, not request host headers.                                                                                                       |
| `storeProvider`                 | required                                   | Durable vault store provider. Use Redis or MongoDB for production and multi-instance deployments.                                                                                                                                                    |
| `config`                        | required provider values                   | Supply `issuer` and `clientId`, or use `resolveOidcVaultConfigFromEnv(process.env)`. Endpoint settings select manual mode; see Config Helpers.                                                                                                       |
| `frontendRedirectUri`           | unset                                      | Default browser return target after backend callback completion. Required if login accepts a custom `returnTo`. Validated before durable callback state; missing destination fails the callback with `500 OIDC_VAULT_MISSING_FRONTEND_REDIRECT_URI`. |
| `postLogoutRedirectUri`         | unset                                      | Provider-registered return URL for redirected logout and opt-in navigation. Navigation applies stricter syntax/2048-byte checks; upstream failures retain local logout.                                                                              |
| `fetchUserInfo`                 | enabled when usable                        | Fetches UserInfo if an endpoint exists and the token response supplies an access token; false disables it. Claims merge only after matching the verified subject.                                                                                    |
| `authorizationTransactionTtlMs` | `600000`                                   | TTL for one-time authorization transactions created during login.                                                                                                                                                                                    |
| `exchangeCodeTtlMs`             | `30000`                                    | TTL for one-time local exchange codes returned to the frontend callback route.                                                                                                                                                                       |
| `sessionTtlMs`                  | unset                                      | Opt-in positive safe-integer lifetime in milliseconds from callback session creation. Hooks may shorten it; refresh never extends it.                                                                                                                |
| `sessionTransport`              | `body`                                     | `body` returns and accepts JSON `sessionId`; `cookie` stores the session pointer in an `HttpOnly` cookie and rejects body-only refresh/logout IDs.                                                                                                   |
| `cookie`                        | see cookie defaults above                  | Cookie transport options. `httpOnly` is always enforced as `true`; unsafe names, paths, domains, and `__Secure-`/`__Host-` prefix violations are rejected.                                                                                           |
| `deviceBinding`                 | disabled                                   | Vault DPoP policy; object defaults to `optional`. Selects the initiating key at POST login and enforces it through callback/exchange/refresh/logout. Configure API enforcement separately.                                                           |
| `logoutNavigation`              | disabled                                   | Proof-authorized JSON logout and headerless continuation. Required fallback, default `ticketTtlMs: 60000` (1000..120000), default namespace label `default`. Requires DPoP and ticket-store capabilities.                                            |
| `fingerprintRecognition`        | disabled                                   | Separate opt-in recognition; `headerName` defaults to `X-Device-Fingerprint`. POST-only enrollment, precommit exchange/refresh comparison, fresh login on change; never PoP or an API sender constraint.                                             |
| `transactionCookie`             | HTTPS `__Host-oidc_vault_transaction`, Lax | Temporary POST-login browser cookie, independent of session transport; only `name` and `sameSite: 'lax' \| 'none'` are configurable.                                                                                                                 |
| `trustedOrigins`                | `[]` plus `backendOrigin` internally       | POST-login/guarded-exchange source origins in both transports, plus cookie-authenticated `refresh` and `logout`. Required for cross-site session cookie transport.                                                                                   |
| `requestBodyLimit`              | `16kb`                                     | Express JSON and URL-encoded parser limit for OIDC route bodies. Increase only for known provider backchannel logout token size needs.                                                                                                               |
| `providerRequestTimeoutMs`      | `5000`                                     | Deadline per provider HTTP exchange (headers plus complete body). Cancellation is attempted without awaiting cleanup. Positive finite integer; validated before cache lookup.                                                                        |
| `hooks`                         | unset                                      | Pre-commit hooks can veto operations by throwing; post-commit notification hook failures are reported to `onError` without undoing committed state.                                                                                                  |
| `tokenIssuer`                   | unset                                      | Issues app-local access tokens for `exchange` and `refresh`. This lifetime is separate from upstream token and vault-session lifetimes.                                                                                                              |
| `now`                           | `Date.now`                                 | Epoch-millisecond clock; sampled at construction and creation for TTL checks and used by vault proof/nonce/replay policy. Shared instances and store clocks must agree.                                                                              |

Construction takes an internal resolved snapshot of the options object without mutating it: normalized values are stored on the snapshot, `cookie`/`trustedOrigins`/`config` containers are shallow-copied, `transactionCookie` and `fingerprintRecognition` are resolved into detached frozen configurations, and `storeProvider`/`hooks`/`tokenIssuer`/`now` service references are retained live (never deep-cloned). Frozen inputs work, reused inputs are not mutated, and mutating or replacing the caller object after creation has no effect on the created router.

`fetchUserInfo` defaults to enabled **when a UserInfo endpoint exists and the token response supplies an access token**; `false` disables it. `config` itself is optional in the declaration, but valid provider values (`issuer`/`clientId` or the complete manual set) are required by construction. Vault `deviceBinding` configures the lifecycle router; API `deviceBinding` must be configured separately on each accepting API middleware.

## DPoP Quick Start (local JWT + protected API)

DPoP binds a login to a browser-held private key. The complete server below issues a short-lived local JWT with `cnf.jkt` and protects the API with the same replay provider. It uses the development memory store; select a shared Redis/MongoDB provider for multiple processes. CORS is an application dependency:

```sh
pnpm add @web-ts-toolkit/express-oidc-vault @web-ts-toolkit/express-oidc-vault-memory-store express cors
pnpm add -D @types/express @types/node @types/cors typescript
```

### Complete DPoP server

Set `OIDC_ISSUER`, `OIDC_CLIENT_ID`, optional `OIDC_CLIENT_SECRET`, and a stable strong random `APP_JWT_SECRET` encoding at least 32 bytes. Register **`https://api.example.com/auth/oidc/callback`** with the IdP. Terminate HTTPS at the configured public backend origin and preserve the public vault mount path.

```ts
import express from 'express';
import cors from 'cors';
import {
  createOidcVaultMiddleware,
  createOidcVaultAccessTokenMiddleware,
  createOidcVaultJwtAccessTokenIssuer,
  createOidcVaultJwtAccessTokenValidator,
} from '@web-ts-toolkit/express-oidc-vault';
import { createMemoryOidcVaultStore } from '@web-ts-toolkit/express-oidc-vault-memory-store';

const backendOrigin = 'https://api.example.com';
const frontendOrigin = 'https://frontend.example.com';
const audience = 'app-api-v1';
const rawSecret = process.env.APP_JWT_SECRET;
if (!rawSecret || Buffer.byteLength(rawSecret, 'utf8') < 32) {
  throw new Error('APP_JWT_SECRET must encode at least 32 strong random bytes.');
}
const signingKey = new TextEncoder().encode(rawSecret);
const store = createMemoryOidcVaultStore({ dpopReplayMaxEntries: 100_000 });
const app = express();
app.use(
  cors({
    origin: frontendOrigin,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'DPoP', 'X-Device-Fingerprint'],
    exposedHeaders: ['DPoP-Nonce', 'WWW-Authenticate'],
  }),
);
app.use(
  createOidcVaultMiddleware({
    backendOrigin,
    basePath: '/auth/oidc',
    config: {
      issuer: process.env.OIDC_ISSUER,
      clientId: process.env.OIDC_CLIENT_ID,
      clientSecret: process.env.OIDC_CLIENT_SECRET,
    },
    frontendRedirectUri: `${frontendOrigin}/callback`,
    trustedOrigins: [frontendOrigin],
    storeProvider: store,
    sessionTransport: 'body',
    sessionTtlMs: 8 * 60 * 60 * 1000,
    deviceBinding: { mode: 'required' }, // ES256, age 60s, skew 5s, nonces off.
    tokenIssuer: createOidcVaultJwtAccessTokenIssuer({
      key: signingKey,
      algorithm: 'HS256',
      issuer: backendOrigin,
      audience,
      lifetimeSeconds: 300,
      mapClaims({ session }) {
        // Application-owned allowlist; account/permission decisions belong here.
        return { email: typeof session.user?.email === 'string' ? session.user.email : undefined };
      },
    }),
  }),
);
app.use(
  '/api',
  createOidcVaultAccessTokenMiddleware({
    validator: createOidcVaultJwtAccessTokenValidator({
      key: signingKey,
      issuer: backendOrigin,
      audience,
      algorithms: ['HS256'],
    }),
    deviceBinding: { mode: 'required', publicOrigin: backendOrigin, replayNamespace: 'app-api-v1', replayStore: store },
  }),
);
app.get('/api/profile', (req, res) => {
  res.json({ subject: req.auth?.subject, scope: req.auth?.scope, binding: req.auth?.deviceBinding?.jkt });
});
app.listen(3000);
```

Local HS256 signing and ES256 proof signing are independent. The issuer helper captures **verified `IssueTokenInput.deviceBinding`** for `cnf.jkt` and automatically selects DPoP/Bearer; mutable profile/session fields are not proof authority. This JWT contains no vault `sessionId`/`sid`, so switching to cookie transport keeps that handle out of browser-readable tokens. APIs still independently verify JWT signature/issuer/audience/expiry and request proof. Authorization remains application-owned.

For cookie transport, change `sessionTransport` to `'cookie'` and configure the frontend for that same mount/transport. For multiple mounts, give each a distinct `transactionCookie.name` and session `cookie.name`. Nonces are optional: to enable them, supply `nonce: { secret: sharedRandomBytes, lifetimeSeconds: 60 }` in **each** vault/API proof policy; use at least 32 random bytes shared by instances of that protection space. A random secret created anew on each instance is unsuitable for shared challenge verification.

### Device-binding policy and issuance contracts

The package root exposes policy, record, local-issuer, guarded-store, POST-login DTO/cookie, and request-aware API contracts. **The backend lifecycle is implemented:** POST initiation, cookie-authenticated callback, original-key exchange/refresh/logout (including unexpired aliases), and API proof/nonce/shared replay enforcement. The [persistent-key SPA example](https://github.com/egose/web-ts-toolkit/blob/main/apps/oidc-vault-dpop-example/README.md) includes both transports, an Express/local IdP fixture, and real-browser redirect/reload/IndexedDB/CORS/nonce/cross-tab checks. [Request-aware DPoP APIs](#request-aware-dpop-apis) describes API configuration.

`OidcVaultOptions.deviceBinding?: OidcVaultDeviceBindingOptions` is opt-in. Omitting it preserves bearer behavior. An object defaults to `mode: 'optional'`; `required` rejects unbound context. Legacy records are never enrolled by a later proof, and stored bound credentials never become bearer credentials by omission. Construction requires all six `OidcVaultDeviceBindingStoreProvider` capabilities and a static HTTPS `backendOrigin`, except loopback HTTP development.

| Vault policy      | New login                                                                               | Existing records                                                                            |
| ----------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Omitted           | Legacy unbound GET; POST exists only if recognition is configured                       | Unbound compatible; bound credentials fail closed                                           |
| `{}` / `optional` | GET unbound; JSON POST binds only when a valid proof is supplied, otherwise cookie-only | Legacy unbound allowed; supplied later proof validates but never enrolls                    |
| `required`        | JSON POST with proof; GET rejected before discovery/allocation                          | Unbound transaction/code/session use rejected; bound credentials require their original key |

There is **no `legacyPolicy` or downgrade switch**. Migrate clients to proof-aware POST login and configure every API before selecting `required`; old unbound sessions then need fresh login. Disabling the feature does not make existing bound sessions/JWTs usable as Bearer.

The proof profile is separate from local JWT signing: `algorithms` defaults to `['ES256']` and permits explicit `PS256`/`RS256`; `proofMaxAgeSeconds` defaults to 60 (integer 1–300), `clockSkewSeconds` to 5 (integer 0–30). `nonce` is off/`false` by default; an enabled `{ secret: Uint8Array, lifetimeSeconds?: number }` requires at least 32 shared random bytes and defaults to 60 seconds (integer 1–300). Policy and algorithm containers are detached/frozen, and nonce bytes are copied at construction.

The shared nonce policy signs versioned, random HMAC-SHA-256 challenges bound to the key and protection space, with no per-client nonce storage. It accepts any authentic live issued nonce for parallel fresh proofs; proof age and single-use JTI reservation still apply. Challenges are at most 512 bytes and issued only after other verification prerequisites, before replay allocation. Configured APIs write fixed `OIDC_VAULT_USE_DPOP_NONCE` JSON, one `DPoP-Nonce` header, and `no-store` with HTTP 401 and the DPoP nonce challenge. DPoP-bearing vault POSTs use the same fixed JSON/header with HTTP 400 before transaction/code/session mutation, upstream calls or hooks. Clients retry once with a fresh proof/JTI/iat/signature. Headerless callback and no-proof unbound requests do not require a nonce.

Sessions, authorization transactions, and exchange codes carry optional `deviceBinding: { type: 'dpop', jkt: string }`; transactions/codes also carry optional `browserBindingHash`. Only the canonical RFC 7638 SHA-256 thumbprint is persisted, without a JWK, private key, proof algorithm, or historical mode. Core retains security-owned binding independently of mutable precreate hooks and issuer inputs. All three built-ins implement live preflight reads, atomic exact/null match-and-consume, lineage revocation context, immutable rotation, and shared bounded replay admission; see the provider contracts below. These store primitives do not themselves verify HTTP proofs.

#### Per-check DPoP failure overrides

Steps 6–8 have independent log-and-continue settings. Each check still runs; an enabled setting writes every failure to the server's `console.warn` and continues to the next check. Both vault POSTs and API middleware read these defaults from `process.env` when constructed:

| Step | Check                                                                               | Environment variable                       | `deviceBinding` option   |
| ---- | ----------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------ |
| 6    | HTTP method and normalized pinned URL (`htm`/`htu`), including target normalization | `OIDC_VAULT_DPOP_IGNORE_TARGET_FAILURE`    | `ignoreTargetFailure`    |
| 7    | Signed proof freshness (`iat` age and clock skew)                                   | `OIDC_VAULT_DPOP_IGNORE_FRESHNESS_FAILURE` | `ignoreFreshnessFailure` |
| 8    | Atomic JTI replay admission, including duplicates, capacity, and provider failures  | `OIDC_VAULT_DPOP_IGNORE_REPLAY_FAILURE`    | `ignoreReplayFailure`    |

Only the exact environment value `true` enables an override; unset, `false`, or any other value retains enforcement. Set whichever flags you need before constructing middleware, for example:

```dotenv
OIDC_VAULT_DPOP_IGNORE_TARGET_FAILURE=true
OIDC_VAULT_DPOP_IGNORE_FRESHNESS_FAILURE=false
OIDC_VAULT_DPOP_IGNORE_REPLAY_FAILURE=true
```

Explicit booleans on `OidcVaultDeviceBindingOptions` / `OidcVaultApiDeviceBindingOptions` take precedence over the environment for that policy:

```ts
import type { OidcVaultDeviceBindingOptions } from '@web-ts-toolkit/express-oidc-vault';

const deviceBinding: OidcVaultDeviceBindingOptions = {
  mode: 'required',
  ignoreTargetFailure: true,
  ignoreFreshnessFailure: false,
  ignoreReplayFailure: false,
};
```

An ignored freshness failure still reaches nonce verification and replay admission. To give replay admission a live bounded expiry independently of the rejected `iat`, core uses `now + (proofMaxAgeSeconds + clockSkewSeconds) * 1000` (65 seconds with defaults). A failed configured proof clock is logged and falls back to `Date.now`. Successful replay reservations retain their expiry; duplicates never renew them, even when their failure is ignored. Signature, header/JWK, claim-shape, original-key, API `ath`, and nonce checks retain their normal enforcement.

Console output identifies the step, option/environment variable, and original error (including replay provider causes), for example:

```text
[express-oidc-vault] DPoP step 8 (replay) failed; continuing (ignoreReplayFailure=true; OIDC_VAULT_DPOP_IGNORE_REPLAY_FAILURE).
```

Environment changes take effect on newly constructed middleware. Ignored failures go directly to the console; `onError` handles failures that stop the request.

### POST login and browser-authenticated callback

Configure the vault with the existing stronger store and an opt-in policy:

```ts
import express from 'express';
import { createOidcVaultMiddleware, type OidcVaultTransactionCookieOptions } from '@web-ts-toolkit/express-oidc-vault';
import { createMemoryOidcVaultStore } from '@web-ts-toolkit/express-oidc-vault-memory-store';

const transactionCookie: OidcVaultTransactionCookieOptions = { sameSite: 'lax' };
const app = express();
app.use(
  createOidcVaultMiddleware({
    backendOrigin: 'https://api.example.com',
    frontendRedirectUri: 'https://frontend.example.com/callback',
    trustedOrigins: ['https://frontend.example.com'],
    config: { issuer: process.env.OIDC_ISSUER, clientId: process.env.OIDC_CLIENT_ID },
    storeProvider: createMemoryOidcVaultStore(), // Local development; shared durable provider in production.
    deviceBinding: { mode: 'required' },
    transactionCookie,
  }),
);
```

The initiation wire contract is **`POST <basePath>/login`**, `Content-Type: application/json`, body **`{ returnTo?: string }`**, response **`200 { authorizationUrl: string }`** (`OidcVaultLoginInitiationInput` / `OidcVaultLoginInitiationResult`). The key is selected only by a verified DPoP header. `returnTo` is read only from JSON and uses the existing same-frontend-origin policy; query-string/body JWK/thumbprint shortcuts do not select binding. In optional mode, no proof creates an unbound cookie-guarded POST transaction; any supplied invalid proof fails. Required mode needs a proof and rejects legacy GET login before discovery or state allocation. GET in disabled/optional mode remains the unbound redirect and ignores proof/key shortcuts.

A browser using a persistent key can initiate as follows; the [published browser client](#browser-dpop-client) generates/persists the key and bounds retries:

```ts
import type {
  OidcVaultLoginInitiationInput,
  OidcVaultLoginInitiationResult,
} from '@web-ts-toolkit/express-oidc-vault/wire';

async function initiateLogin(freshDpopProof: string): Promise<OidcVaultLoginInitiationResult> {
  // Proof: typ=dpop+jwt, allowed public JWK, POST, pinned absolute login htu,
  // fresh iat/JTI/signature, nonce if challenged. No access-token ath is needed.
  const body: OidcVaultLoginInitiationInput = { returnTo: '/signed-in' };
  const response = await fetch('https://api.example.com/auth/oidc/login', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', DPoP: freshDpopProof },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error('Login initiation failed.');
  const value: unknown = await response.json();
  if (
    typeof value !== 'object' ||
    value === null ||
    !('authorizationUrl' in value) ||
    typeof value.authorizationUrl !== 'string'
  ) {
    throw new Error('Invalid login initiation response.');
  }
  const result: OidcVaultLoginInitiationResult = { authorizationUrl: value.authorizationUrl };
  return result; // Navigate to result.authorizationUrl using the same browser/profile.
}
```

- **Admission order:** source Origin (valid Referer fallback only when Origin is absent), JSON/returnTo, shared proof/nonce/replay admission, then discovery/hooks/transaction persistence. POST source checks apply to **both body and cookie session transports**, and missing/null/duplicate/untrusted sources fail closed. Proof target uses pinned `backendOrigin` + externally visible `req.originalUrl` path; Host/forwarded headers cannot change it. Browser proofs are never sent upstream. Replay reservations survive later discovery/store/hook failures; retry needs a fresh proof.
- **Temporary cookie:** every successful POST creates a fresh **32-byte random base64url** secret and stores only its SHA-256 hash. Defaults are HTTPS `__Host-oidc_vault_transaction` or HTTP `oidc_vault_transaction`, host-only, `Path=/`, HttpOnly, Secure on HTTPS, `SameSite=Lax`. Only `name` and `sameSite` are public overrides; `none` requires HTTPS and an explicit cross-site SPA choice. Strict/Domain/path/HttpOnly/Secure opt-outs fail construction. Session/transaction names must differ; multiple vault mounts need distinct transaction names.
- **Navigation authentication:** `GET /callback` reads state and the selected cookie, preflights live identity/policy/hash, then atomically consumes the exact stored key/hash match before any upstream token request, session, or code. It does not treat a navigation as a DPoP-bearing request. Missing/wrong/noncanonical/duplicate selected cookies do not spend or clear the transaction; unrelated malformed cookies are ignored. Required-mode legacy records and disabled-mode bound records fail closed. POST transaction metadata reserves `oidcVaultTransactionProvider` for the exact resolved issuer/client ID; returned atomic authority is rechecked before upstream use.
- **Propagation/cleanup:** successful callback copies the original jkt into the session and key/hash into the code independently of mutable hooks; the transaction cookie is retained and its deadline shortened to the code's expiry. Max-Age and Expires round down to the record deadline, including hook/store delays. An authenticated provider-error callback consumes state and clears the temporary cookie with fixed `400 OIDC_VAULT_CALLBACK_ERROR` / `OIDC callback failed.` Other authenticated terminal callback failures also clear it; mismatches leave cookies untouched. Abandoned records/cookies expire. A fresh initiation replaces the single cookie, so one browser/vault mount supports one pending flow; earlier flows can require restart.
- **Exchange:** the retained cookie and a fresh proof from the original initiating key authenticate bound codes before atomic consumption; success or authenticated terminal issuance failure clears the temporary cookie. Origin/Referer checks apply to guarded JSON **and URL-encoded** exchange in both session transports. Missing/wrong cookie, wrong/missing/stale/replayed proof, identity/binding mismatch and nonce challenge do not spend an honest code or clear its cookie. Browser CORS must allow explicit trusted origins, credentials, Content-Type/DPoP and expose DPoP-Nonce/WWW-Authenticate; third-party cookie blocking can require same-site deployment.

### Sender-constrained exchange, refresh and logout

Use **the same persistent private key selected at POST login** for every request. Exchange cannot claim a new key from the first presenter, JSON/JWK/thumbprint fields, hooks or a later optional proof.

| POST route            | Authority and proof                                                                                                                                    | Successful result                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `<basePath>/exchange` | `{ code }`, temporary transaction cookie in **both** transports, trusted Origin/Referer for guarded codes, fresh original-key `DPoP` header when bound | `OidcVaultExchangeResult`; clears transaction cookie, sets session cookie only in cookie transport |
| `<basePath>/refresh`  | Body `{ sessionId }` or session cookie, fresh original-key `DPoP` header when bound; cookie transport also checks Origin/Referer                       | Same result with a rotated session handle and unchanged binding/lineage/absolute expiry            |
| `<basePath>/logout`   | Same handle/cookie and original-key proof; optional `{ redirect: true }` on live handles                                                               | `200 { loggedOut: true }` or best-effort upstream redirect after local revocation                  |

Vault POST proofs use the exact method and pinned `backendOrigin` plus externally visible path, fresh `iat`/`jti`, and nonce if challenged. They **do not require an Authorization access token or `ath`**, so refresh/logout work after local JWT expiry. Browser proofs are never forwarded to the upstream IdP. API requests separately require `Authorization: DPoP <accessToken>`, a fresh proof with `ath`, and request-aware validation.

For example, with a configured local issuer, the exchange response can be checked without backend deep imports (the caller supplies a fresh proof from its persistent original key):

```ts
import type { OidcVaultExchangeResult } from '@web-ts-toolkit/express-oidc-vault/wire';

async function exchangeBoundCode(code: string, freshDpopProof: string): Promise<OidcVaultExchangeResult> {
  const response = await fetch('https://api.example.com/auth/oidc/exchange', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', DPoP: freshDpopProof },
    body: JSON.stringify({ code }),
  });
  if (!response.ok) throw new Error('Code exchange failed.');
  const value: unknown = await response.json();
  if (
    typeof value !== 'object' ||
    value === null ||
    !('accessToken' in value) ||
    typeof value.accessToken !== 'string' ||
    !('tokenType' in value) ||
    value.tokenType !== 'DPoP' ||
    !('expiresIn' in value) ||
    typeof value.expiresIn !== 'number' ||
    !Number.isSafeInteger(value.expiresIn) ||
    value.expiresIn < 0 ||
    ('sessionId' in value && typeof value.sessionId !== 'string')
  ) {
    throw new Error('Invalid bound credential response.');
  }
  // Project validated credentials. Keep the access token in memory; in body
  // transport persist sessionId in sessionStorage. Cookie JSON omits the ID.
  return {
    accessToken: value.accessToken,
    tokenType: value.tokenType,
    expiresIn: value.expiresIn,
    ...('sessionId' in value ? { sessionId: value.sessionId as string } : {}),
  };
}
```

Refresh sends a fresh proof to `/refresh` with `{ sessionId }` in body transport or `{}` plus `credentials: 'include'` in cookie transport. Logout does likewise at `/logout`. Login/exchange always need `credentials: 'include'` for the temporary cookie. When `tokenIssuer` is omitted, the backend still enforces binding but returns no local `accessToken`/`expiresIn`/`tokenType`; the example above deliberately expects a configured issuer.

- **Precommit order:** capture request/record/provider authority; authenticate mode, code/session agreement, Origin/cookie and any enrolled recognition; verify signature/key/target/time/nonce and reserve shared replay; then consume/issue or use the upstream refresh token/rotate, or invoke logout hooks/revoke. Exchange atomically matches `expectedSessionId` and both exact/null binding fields and rechecks the returned code/session authority before issuance. Invalid proofs cannot burn upstream refresh tokens. Reservations survive downstream failure; a retry needs a fresh proof.
- **Legacy migration:** `required` rejects unbound records before state/upstream work. `optional` permits legacy unbound sessions/codes, explicitly matching omitted fields. Any supplied proof still validates/nonces/reserves but **never enrolls or rebinds** the legacy record. Cookie-only POSTs still need their temporary cookie and guarded-exchange Origin. Disabled binding rejects bound sessions/codes and built-in live/alias logout contexts.
- **Immutable refresh/issuance:** rotation uses the original key, provider, subject, logical ID and absolute expiry; fresh ID/UserInfo profile precedence is preserved. Issuers and refresh/logout hooks receive owned plain session containers. Hook/issuer mutations cannot redirect lineage revocation or replace response/profile/binding authority. Invalid issuer output retains original-lineage rollback and sanitized/no-store errors.
- **Logout aliases:** built-ins resolve `getSessionRevocationContext(handle)` for live handles and unexpired aliases, checking the surviving lineage's provider/key rather than an alias's missing historical binding. A mismatch leaves the lineage/cookie intact. No live target is idempotent success without deletion/replay/hooks (the selected transport's handle/cookie is still required). Aliases grant revocation only, not refresh or upstream redirect credentials; alias-only logout retains no live-session hook notification. Signed backchannel logout is unchanged. Stateless local JWTs remain valid until expiry unless the API validator checks application revocation state.

## Optional Fingerprint Recognition (Not PoP)

`fingerprintRecognition?: OidcVaultFingerprintRecognitionOptions` is a **separate opt-in browser recognition/change-detection policy**. Fingerprint matching is recognition/change detection, not theft prevention against deliberate copying. A FingerprintJS `visitorId` or another browser-computed identifier is copyable/spoofable; matching it does not prove possession of a private key, identify a physical device, or constrain API access. Recognition never satisfies `deviceBinding.mode: 'required'`.

Enable it independently or alongside DPoP, using named package-root imports:

```ts
import {
  createOidcVaultMiddleware,
  type OidcVaultFingerprintRecognitionOptions,
} from '@web-ts-toolkit/express-oidc-vault';
import { createMemoryOidcVaultStore } from '@web-ts-toolkit/express-oidc-vault-memory-store';

const fingerprintRecognition: OidcVaultFingerprintRecognitionOptions = {};
const vault = createOidcVaultMiddleware({
  backendOrigin: 'https://api.example.com',
  frontendRedirectUri: 'https://frontend.example.com/callback',
  trustedOrigins: ['https://frontend.example.com'],
  config: { issuer: process.env.OIDC_ISSUER, clientId: process.env.OIDC_CLIENT_ID },
  storeProvider: createMemoryOidcVaultStore(), // Development; shared Redis/Mongo provider in production.
  fingerprintRecognition, // Or { headerName: 'X-App-Browser' }.
  sessionTtlMs: 8 * 60 * 60 * 1000,
  // Add deviceBinding: { mode: 'required' } for cryptographic sender constraint.
});
```

- **Wire signal:** default `X-Device-Fingerprint`; a custom `headerName` must be a valid HTTP field name without authentication, cookie, origin, content, or transport-header collisions (case-insensitive). Supply exactly **one raw field**, with a **nonempty printable ASCII value, at most 256 bytes**. Core does not trim, case-fold, split commas, or normalize the opaque server-observed value. Duplicate fields (even identical/case-varied), invalid characters, empty or oversized opted-in signals return **400 `OIDC_VAULT_INVALID_FINGERPRINT` / `Fingerprint signal is invalid.`** before credential work. Omitting the option means no capture/check.
- **Enrollment:** only a supplied signal on **JSON POST login** enrolls recognition. An absent signal intentionally creates an unenrolled session; legacy/GET login stays unenrolled even if a header, profile claim, or later exchange/refresh signal is supplied. Fingerprint-only POST login is unbound and rejects a supplied DPoP header while DPoP is disabled. It still uses the single temporary HttpOnly transaction cookie and trusted Origin/Referer in **both session transports**. Construction requires all six guarded-store capabilities, just like the other opt-in flow; all built-ins implement them. The headerless callback authenticates the cookie and copies the original transaction evidence into the original new session.
- **Precommit comparison:** enrolled exchange/refresh require the original signal **before proof/nonce/replay admission, guarded code consumption, upstream refresh-token use, or rotation**. Missing/mismatch returns **403 `OIDC_VAULT_FINGERPRINT_REAUTH_REQUIRED` / `Browser recognition changed; sign in again.`** without consuming codes, burning upstream refresh tokens, rotating/revoking sessions, or setting/clearing cookies. Handle it by clearing frontend auth state and starting a fresh POST login. There is no automatic tolerance, re-enrollment, or value rotation at exchange/refresh. A fresh login establishes a new value/new session; an earlier session remains until explicit revocation or expiry.
- **Private metadata:** SHA-256 is stored as canonical base64url in `transaction.metadata.oidcVaultFingerprintRecognition`, then **`session.metadata.oidcVaultFingerprintRecognition = { version: 1, hash }`**. This key is reserved. Core preserves its original value/unenrolled absence through mutable precreate hooks, refresh, and portable metadata copies; profile claims cannot enroll/rebind it. Core stores no raw signal, emits no recognition evidence in user/credential responses, omits it from token-issuer session input, and logs neither raw signals nor hashes. Issuers should use allowlisted claims; hooks and request/proxy logging must also avoid fingerprint headers and reserved metadata.
- **Logout and APIs:** recognition checks apply only to exchange/refresh. Live/alias logout and signed backchannel logout retain their existing rules, so a changed fingerprint does not prevent revocation; bound logout still needs its original DPoP key. Rotation aliases contain no recognition metadata and do not authenticate refresh. Fingerprint-only local tokens remain `Bearer`; API recognition/risk policy is application-owned. DPoP JWTs still need request-aware proof enforcement at every API.

### Frontend signal adapter

Keep collection in the frontend; the backend has **no FingerprintJS dependency**. Inject a current signal source and obtain headers for each POST login/exchange/refresh. For an intentionally unenrolled choice return `undefined`; collection failures should stop the operation rather than silently disabling an enrolled check. A minimal generic adapter (no backend runtime imports) is:

```ts
async function recognitionHeaders(getSignal: () => Promise<string | undefined>): Promise<Record<string, string>> {
  let signal: string | undefined;
  try {
    signal = await getSignal();
  } catch {
    throw new Error('Browser recognition is unavailable.');
  }
  if (signal === undefined) return {};
  if (
    signal.length === 0 ||
    signal.length > 256 ||
    Array.from(signal).some((character) => character.charCodeAt(0) < 0x20 || character.charCodeAt(0) > 0x7e)
  ) {
    throw new Error('Fingerprint signal is invalid.');
  }
  return { 'X-Device-Fingerprint': signal };
}

async function initiateRecognizedLogin(getSignal: () => Promise<string | undefined>): Promise<string> {
  const response = await fetch('https://api.example.com/auth/oidc/login', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(await recognitionHeaders(getSignal)) },
    body: JSON.stringify({}), // Add a fresh DPoP header separately when binding is enabled.
  });
  if (!response.ok) throw new Error('Login initiation failed.');
  const value: unknown = await response.json();
  if (
    typeof value !== 'object' ||
    value === null ||
    !('authorizationUrl' in value) ||
    typeof value.authorizationUrl !== 'string'
  ) {
    throw new Error('Invalid login initiation response.');
  }
  return value.authorizationUrl; // Navigate after initiation.
}
```

Obtain the same current signal through the source at `/exchange` (body `{ code }`) and `/refresh` (body `{ sessionId }` or cookie `{}`). Login/exchange always use `credentials: 'include'` for the temporary cookie; cookie refresh does too. On a recognition 403, start fresh login rather than a refresh retry loop. CORS must allow the configured fingerprint header and `Content-Type`, explicit trusted origins and credentials; also allow `Authorization`/`DPoP` and expose `DPoP-Nonce`/`WWW-Authenticate` when using DPoP. Cross-site SPAs may need explicit HTTPS `transactionCookie: { sameSite: 'none' }`; browser third-party-cookie policy still applies.

### Published recognition adapter

The published browser client [`@web-ts-toolkit/oidc-vault-dpop-client`](https://github.com/egose/web-ts-toolkit/blob/main/packages/oidc-vault-dpop-client/README.md) ships this generic adapter as `createDeviceFingerprint(source, { headerName? })` plus a structural optional-vendor adapter:

```ts
// In your frontend, after choosing to collect recognition:
import {
  createDeviceFingerprint,
  fingerprintJsSignalSource,
  type FingerprintJsAgent,
} from '@web-ts-toolkit/oidc-vault-dpop-client';

function recognitionWithOptionalFingerprintJs(load: () => Promise<FingerprintJsAgent>) {
  return createDeviceFingerprint(fingerprintJsSignalSource(load));
}
// If YOUR frontend installs @fingerprintjs/fingerprintjs, inject:
// recognitionWithOptionalFingerprintJs(() => FingerprintJS.load());
// The agent is structurally { get(): Promise<{ visitorId: string }> }.
// const headers = await recognition.headers(); // Current get() on each operation.
```

The utility lazily shares agent load, **does not cache/persist the identifier**, bounds signals, and emits fixed collection errors without vendor diagnostics. The [full example app](https://github.com/egose/web-ts-toolkit/blob/main/apps/oidc-vault-dpop-example/README.md) integrates it through real login/callback/exchange/refresh and cookie-tab recognition checks, independently of fresh DPoP proofs.

### Privacy and retention

Disclose what is collected, why matching is used, the session/transaction retention, and how users restart login after a change. Hashing is **not anonymization**: a stable/low-entropy identifier and its deterministic hash remain correlation data and can be copied or guessed. The raw header is transient and must be excluded from application/proxy logs. The enrollment hash exists in a pending authorization transaction (default 10-minute TTL), then lasts with the vault session through refresh; it is **not** limited by local JWT or upstream access-token expiry. Set an explicit `sessionTtlMs` or an application/store lifetime: unset assigns no default session expiry. Account for physical store cleanup and backups after logical expiry/deletion; abandoned transaction records expire under their store policy. Logout/revocation deletes session records under that policy. The frontend utility stores no identifier.

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

### Browser DPoP client

For a bound flow, install the published browser client
[`@web-ts-toolkit/oidc-vault-dpop-client`](https://github.com/egose/web-ts-toolkit/blob/main/packages/oidc-vault-dpop-client/README.md)
in your frontend (it brings `jose` + `idb` as runtime dependencies) and use its
named root exports. These are **versioned package exports**, separate from the
Express package. This complete browser module pairs with the
[DPoP server above](#complete-dpop-server) at `/auth/oidc`:

```sh
pnpm add @web-ts-toolkit/oidc-vault-dpop-client
```

```ts
import {
  createOidcVaultDpopSession,
  fetchWithDpop,
  OidcVaultDpopClientError,
} from '@web-ts-toolkit/oidc-vault-dpop-client';

const backendOrigin = 'https://api.example.com';
const session = createOidcVaultDpopSession({
  backendOrigin,
  basePath: '/auth/oidc',
  sessionTransport: 'body',
  requestTimeoutMs: 15_000,
  maxResponseBytes: 1_048_576,
});

export const signIn = (): Promise<void> => session.login('/callback');

export async function bootstrapBoundAuth(): Promise<'ready' | 'sign-in'> {
  try {
    const url = new URL(location.href);
    const code = url.searchParams.get('code');
    if (code !== null) {
      url.searchParams.delete('code');
      history.replaceState(null, '', url.href);
      await session.exchange(code);
    } else {
      await session.refresh(); // Persisted key; no access-token Authorization/ath.
    }
    return 'ready';
  } catch (error) {
    if (error instanceof OidcVaultDpopClientError && error.requiresLogin) return 'sign-in';
    throw error; // Retain state on transient/proof/nonce errors; no blanket retry.
  }
}

export async function getBoundProfile(signal?: AbortSignal): Promise<unknown> {
  const response = await fetchWithDpop(
    { session, apis: [{ origin: backendOrigin, pathPrefix: '/api', replayNamespace: 'app-api-v1' }] },
    `${backendOrigin}/api/profile`,
    { signal },
  );
  if (!response.ok) throw new Error('Protected API request failed.');
  return response.json();
}
export const signOut = (): Promise<void> => session.logout();
// With server logoutNavigation enabled:
export const signOutThroughProvider = (): Promise<void> => session.logoutAndNavigate();

// Explicit user action for an existing corrupt key; ordinary sign-in needs no reset.
export async function recoverBrowserKey(): Promise<void> {
  await session.resetKey();
  await signIn();
}
```

For cookie transport, select `sessionTransport: 'cookie'` on both sides and the
matching public mount. The runnable [SPA + vault/API + local IdP example](https://github.com/egose/web-ts-toolkit/blob/main/apps/oidc-vault-dpop-example/README.md)
uses separate `/auth/oidc/body` and `/auth/oidc/cookie` mounts and cookie names.

`login()` atomically persists a non-extractable P-256 key before POST/navigation.
Exchange/refresh/API/logout use that existing key; loss/change requires fresh
login, while an existing unusable key needs explicit `resetKey()` then login.
Tokens stay in memory, body handles/pending login in tab-local sessionStorage,
and cookie handles in backend HttpOnly cookies. All flows require secure-context
Web Crypto and IndexedDB CryptoKey persistence; cookie mode additionally needs
Web Locks/BroadcastChannel. There is no implicit replacement-key/Bearer fallback.

Both transports use a lifecycle FIFO, with refresh sharing until an intervening
mutation. Cookie mode adds same-origin/scope locks and a bounded 180 ms live-peer
token wait. `clear()` immediately invalidates local auth/owned HTTP and preserves
the key; `dispose()` closes the context while preserving committed reload state;
`resetKey()` atomically deletes only this scope's key/coordination records.
Await clear/reset before disposing if their persistence must finish. Only
`logout()` and `logoutAndNavigate()` request server revocation. Reset cannot remove HttpOnly cookies,
revoke old sessions/JWTs, or undo already-started API work; other sessions sharing
the deleted key need fresh login.

Vault attempts default to **15,000 ms** through headers/body/JSON parsing and
**1 MiB** of streamed response bytes. These limits exclude queue/storage/crypto/
recognition/other lock owners and cannot preempt synchronous JavaScript or a
suspended tab. Clear/reset/dispose abort owned HTTP waits; `fetchWithDpop` and
`createDpopProof` accept a caller `signal`. Aborting one API waiter does not
cancel shared refresh. API response bodies remain caller-owned and outside the
vault limits. A lost mutation response leaves server commit/Set-Cookie uncertain:
no automatic timeout/network retry; a lost body-handle rotation may need login.

`fetchWithDpop` owns auth headers and rejects redirects. API `pathPrefix`
uses longest normalized segment matching; omission or `/` is origin-wide.
Outbound paths share proof normalization (unreserved escapes/dots normalize,
reserved separators stay encoded); query data stays intact. Use separate
`replayNamespace`s for independent gateway services. Valid response nonces are
learned even from success or a single-attempt mutation for the next explicit
call. Each cache holds 64 space/key tuples, evicting the oldest remembered; it
does not infer nonce TTLs. Vaults retry a usable nonce once, then report
non-terminal `DPOP_NONCE_RETRY_EXHAUSTED`; retry-enabled APIs allow one nonce
retry and one `invalid_token` refresh budget. Final API responses belong to the
caller. Mutations stay single-attempt unless `retry: 'idempotent'` is justified
by the server operation. Fresh proofs/JTIs are mandatory on every attempt.

Use `requiresLogin`, not every HTTP 401, for session recovery: terminal session,
browser/key-binding and enrolled recognition errors clear auth; recoverable
proof/nonce/transient errors retain it. Unknown vault codes become fixed
`OIDC_REQUEST_FAILED`; API HTTP failures are returned as `Response`s. A valid
zero-lifetime refresh retains its rotated handle but `fetchWithDpop` stops with
non-terminal `DPOP_ACCESS_TOKEN_EXPIRED` instead of sending an expired token or
looping. Full tables and upgrade guidance ship in the
[client README](https://github.com/egose/web-ts-toolkit/blob/main/packages/oidc-vault-dpop-client/README.md).

The example has real redirect/reload/cookie/CORS/key/expiry/retry/tab coverage on **Chromium 151 and Firefox 153**. Its tests use cross-origin **same-site loopback** HTTP. WebKit/Safari is not certified in the recorded environment because required Linux libraries were unavailable; arbitrary HTTPS cross-site/third-party-cookie policies and external IdPs need deployment-specific checks. Browser locks coordinate only the same frontend origin/storage partition/vault scope; they do not supply a distributed backend refresh lease.

### Low-level proof signing for an owned request

Prefer `fetchWithDpop` for session-backed APIs. When your application already
owns key/session validation and the HTTP/retry policy, the root proof helper
can sign one attempt. Supply a live same-key JWT and obtain the key via
`session.getKey()` immediately before use; recreate the proof for every retry.
This example intentionally returns one response for the caller to handle:

```ts
import { createDpopProof, type DpopKey } from '@web-ts-toolkit/oidc-vault-dpop-client';

export async function getWithProof(
  key: DpopKey,
  accessToken: string,
  nonce?: string,
  signal?: AbortSignal,
): Promise<Response> {
  const url = 'https://api.example.com/api/profile?view=summary';
  const proof = await createDpopProof(key, { method: 'GET', url, accessToken, nonce, signal });
  return fetch(url, {
    method: 'GET',
    credentials: 'omit',
    redirect: 'error',
    cache: 'no-store',
    signal,
    headers: { Authorization: `DPoP ${accessToken}`, DPoP: proof },
  });
}
```

### Default unbound bearer frontend

The following default **unbound** flow keeps `accessToken` in memory, mirrors `sessionId` into `sessionStorage`, and deduplicates refresh calls. Use the bound helpers above when enabling DPoP.

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

function readBodyCredentials(value: unknown): { accessToken?: string; sessionId: string } {
  if (
    !value ||
    typeof value !== 'object' ||
    !('sessionId' in value) ||
    typeof value.sessionId !== 'string' ||
    ('accessToken' in value && typeof value.accessToken !== 'string')
  )
    throw new Error('Invalid credential response.');
  return {
    sessionId: value.sessionId,
    ...('accessToken' in value ? { accessToken: value.accessToken as string } : {}),
  };
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

  setAuthState(readBodyCredentials(await response.json()));
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

  setAuthState(readBodyCredentials(await response.json()));
}

async function ensureFreshAccessToken(): Promise<void> {
  if (!refreshPromise) {
    refreshPromise = refreshAuthState().finally(() => {
      refreshPromise = null;
    });
  }

  await refreshPromise;
}

async function fetchWithAuth(input: string | URL, init: RequestInit = {}): Promise<Response> {
  // Minimal same-origin GET helper. Do not implicitly resubmit mutations/streams
  // or send this app's credentials to arbitrary origins or redirects.
  const url = new URL(input, location.href);
  if (url.origin !== location.origin || (init.method ?? 'GET').toUpperCase() !== 'GET' || init.body != null) {
    throw new Error('This helper accepts same-origin GET requests only.');
  }
  const headers = new Headers(init.headers);

  if (authState.accessToken) {
    headers.set('authorization', `Bearer ${authState.accessToken}`);
  }

  let response = await fetch(url, { ...init, headers, redirect: 'error', cache: 'no-store' });

  if (response.status !== 401 || !authState.sessionId) {
    return response;
  }

  await ensureFreshAccessToken();

  const retryHeaders = new Headers(init.headers);

  if (authState.accessToken) {
    retryHeaders.set('authorization', `Bearer ${authState.accessToken}`);
  }

  response = await fetch(url, { ...init, headers: retryHeaders, redirect: 'error', cache: 'no-store' });
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
3. Remove the `code` query parameter with `history.replaceState` before asynchronous exchange to reduce URL/history exposure.
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

function readCookieCredentials(value: unknown): { accessToken?: string } {
  if (
    !value ||
    typeof value !== 'object' ||
    'sessionId' in value ||
    ('accessToken' in value && typeof value.accessToken !== 'string')
  )
    throw new Error('Invalid cookie credential response.');
  return 'accessToken' in value ? { accessToken: value.accessToken as string } : {};
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

  setAuthState(readCookieCredentials(await response.json()));
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

  setAuthState(readCookieCredentials(await response.json()));
}
```

For cross-origin cookie deployments, also remember:

- the frontend requests must use `credentials: 'include'`
- the backend CORS policy must allow credentials
- same-site subdomains can use Lax; truly cross-site requests need `SameSite=None; Secure` and browser cookie permission
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
redis.on('error', () => console.warn('OIDC vault Redis connection error.'));

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
const storeProvider = createMongoOidcVaultStore({ db: mongo.db('app-auth') });
await storeProvider.ready();

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
    storeProvider,
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
redis.on('error', () => console.warn('OIDC vault Redis connection error.'));

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
- `createOidcVaultAuthenticator(...)`, `type OidcVaultAuthenticator`
- `OidcVaultInvalidAccessTokenError`, `OidcVaultAuthDeniedError`
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
- `type OidcVaultDeviceBindingMode`, `OidcVaultDeviceBindingOptions`
- `type OidcVaultDpopAlgorithm`, `OidcVaultDpopBinding`, `OidcVaultVerifiedDpopBinding`
- `type OidcVaultDpopProofOptions`, `OidcVaultDpopNonceOptions`
- `type OidcVaultTransactionCookieOptions`, `OidcVaultLoginInitiationInput`, `OidcVaultLoginInitiationResult`
- `type OidcVaultFingerprintRecognitionOptions`
- `type OidcVaultHooks`
- `type OidcVaultStoreProvider`
- `type OidcVaultSession`
- `type OidcVaultConfig`
- `type OidcVaultSessionInput`
- `OidcVaultStoreConflictError`
- `OidcVaultDpopReplayCapacityError`
- `type OidcVaultDeviceBindingStoreProvider`
- `type OidcVaultDpopReplayStore`
- `type OidcVaultRecordBindingMatch`
- `type OidcVaultSessionRevocationContext`
- `type OidcVaultExchangeResult`
- `type OidcVaultLogoutResult`
- `type OidcVaultAccessTokenValidator`
- `type OidcVaultRequestAwareAccessTokenValidator`
- `type OidcVaultAccessTokenRequestInput`
- `type OidcVaultAccessTokenConfirmation`
- `type OidcVaultRequestAwareAccessTokenValidationResult`
- `type OidcVaultApiDeviceBindingOptions`
- `type OidcVaultAccessTokenMiddlewareOptions`
- `type OidcVaultAuthContext`
- `type OidcVaultAuthenticatedRequest`
- `type OidcVaultJwtAccessTokenValidatorOptions`
- `type OidcVaultTokenIssuer`
- `type OidcVaultTokenIssueResult`
- `type OidcVaultProviderMetadata`

Other root-exported data contracts are `AuthorizationTransaction`/`AuthorizationTransactionInput`, `ExchangeCodeRecord`/`ExchangeCodeRecordInput`, `ConsumeAuthorizationTransactionIfMatchesInput`, `ConsumeExchangeCodeIfMatchesInput`, `ReserveDpopProofInput`, `RotateSessionInput`, `DeleteSessionsBySubjectInput`, `DeleteSessionsByProviderSessionIdInput`, `DeleteSessionsByLogicalSessionIdInput`, `ConsumeBackchannelLogoutTokenJtiInput`, `IssueTokenInput`, `OidcVaultAccessTokenValidationResult`, `OidcVaultAccessTokenMiddlewareErrorContext`, `OidcVaultHookContext`, `OidcVaultErrorContext`, `OidcVaultBackchannelLogoutResult`, `OidcVaultUserProfile`, `OidcVaultRouteName`, `OidcVaultSessionTransport`, `OidcVaultCookieOptions`, `OidcVaultCookieSameSite`, `OidcVaultCookieDeploymentMode`, `OidcVaultConfigMode`, `OidcVaultResolvedConfig`, and `OidcVaultEnv`. Import all of them with `import type { … } from '@web-ts-toolkit/express-oidc-vault'`; internal proof helpers and browser example functions are not backend exports.

## Store Provider Contract

The built-in memory, Redis, and MongoDB store packages share a portable subset with the lifetime, ID-reuse, serialization and deletion-accounting variations below. Their shipped READMEs describe backend startup/shutdown and resource bounds.

- `createAuthorizationTransaction` and `createExchangeCode` are deliberate upserts keyed by `state` and `code`.
- `createSession` duplicate-ID behavior is provider-specific: the memory and MongoDB providers replace the existing session (upsert), while the Redis provider rejects a live duplicate with `OidcVaultStoreConflictError` without changing the existing record or indexes (create-only, preserving index ownership). Portable callers must always create sessions with a fresh unused `sessionId` and handle `OidcVaultStoreConflictError`; reusing a live ID is non-portable. See `OidcVaultStoreProvider.createSession` for the full contract.
- Store metadata is portable when it is JSON-compatible: strings, finite numbers, booleans, null, arrays, and plain objects. Do not rely on functions, symbols, Dates, Maps, Sets, custom prototypes, undefined object properties, or object identity surviving a store round-trip.
- For that portable domain, inputs are captured at invocation before asynchronous work, including nested provider/user/metadata fields and object deletion scopes. Mutating inputs immediately after calling, or mutating returned values, cannot change the committed value or eventual result. Memory uses `structuredClone`; MongoDB/Redis copy plain containers while preserving native backend serialization outside the portable subset. Opaque native objects/custom serializers have no portable mutation-isolation guarantee.
- Expiry timestamps are epoch milliseconds. Memory/MongoDB check `expiresAt <= now`; Redis uses server-owned key TTLs and server time, not the optional application clock. Redis transaction/code **preflight getters and guarded consumes** additionally check payload expiry against `TIME`; legacy consumes and `getSession` retain key-TTL authority. Preserve matching TTLs/index scores on restore; guarded checks are not an external-data repair/migration service. Backchannel JTI expiry must be finite and in the future relative to the store clock or the consume returns `false` without storage.
- Backchannel logout replay keys passed to `consumeBackchannelLogoutTokenJti` are opaque namespaced strings (issuer/client ID/`jti`); providers store them verbatim and need no schema change.
- `rotateSession` requires an existing source session and a distinct unused target `sessionId`. Equivalent missing-source, same-ID, and existing-target rotation conflicts throw `OidcVaultStoreConflictError` without deleting or overwriting source or target data.
- Session rotation preserves the logical session ID when the next session omits one. With finite expiry, each old ID revokes its lineage only before its immediate successor's `expiresAt`; later rotations do not extend earlier aliases. `A -> B (T1) -> C (T2)` leaves A expiring at T1 even if T2 is later or absent. `getSession(A)` returns `null`. After that window use the live ID or logical/subject/provider-session deletion. With `A/L1 -> B/L1 -> C/L2`, the new B alias targets L2; retained A targets L1 with its original deadline. Memory eagerly retires inactive old-lineage aliases on rotation/upsert; MongoDB/Redis can retain them until expiry or explicit cleanup. Use distinct logical IDs for unrelated login families.
- Without successor `expiresAt`, retention is provider-specific: memory and Redis impose no alias time limit and can accumulate arbitrarily many aliases; MongoDB uses `rotatedSessionAliasRetentionMs` (default 5 minutes). Core refresh uses the live ID and preserves expiry. This retains the [SVH-05 decision](https://github.com/egose/web-ts-toolkit/blob/main/docs/tasks/20260908-130120-oidc-vault-stores-health-follow-up.md#task-svh-05-decide-a-portable-rotation-alias-lifetime-contract).
- Deleting a live public ID removes that record; an unexpired alias revokes its logical lineage. Subject/provider-session object inputs match each supplied issuer/client field; string inputs omit those filters. Logical deletion and aliases have no issuer/client filter. Scoped/direct deletion preserves unexpired aliases while a live member survives, including another provider scope. MongoDB retains alias rows under reused create IDs until expiry/lineage cleanup; memory/Redis clear target aliases on reuse.
- Bulk counts cover primary records deleted, never alias cleanup: memory excludes expired sessions, MongoDB can count expired documents awaiting TTL cleanup, and Redis counts actual primary deletions including matching rotation successors. MongoDB scoped deletes repeat until an empty query (continuous arrivals can prolong them); Redis makes one cursor traversal. Later arrivals can survive and errors can follow committed deletions. Counts are not proof of an empty scope or a portable live-user census. Neither backend provides a global logout snapshot.
- Operational bounds are local, not total-work guarantees: memory's 64-slot sweeps still rebuild full key snapshots and scan maps for lineage cleanup; MongoDB materializes affected IDs/survivors with potentially large `$in` sets; Redis SCAN/ZSCAN COUNT values are hints and Lua can materialize whole lineages/alias sets. Maintenance progress depends on operations/backend availability.
- Compatibility: surviving aliases and invocation-time portable input ownership now remain intact across scoped deletion and caller mutation. Redis repairs keyed-record/index corruption conservatively and emits only fixed operation text for post-commit maintenance warnings. Arbitrary backend errors may still carry secrets: log allowlisted categories rather than records, raw errors, credential URLs or token-valued labels. Alias lifetime and duplicate-create variations remain intentional.

### Guarded Records And Revocation Context

The factories in all three provider packages return `OidcVaultDeviceBindingStoreProvider` (MongoDB also exposes `ready()`). Its six required methods remain optional on the base `OidcVaultStoreProvider` for existing bearer-only custom stores:

| Method                                                             | Contract                                                                                                                                    |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `getAuthorizationTransaction(state)`                               | Detached live preflight record, without consumption.                                                                                        |
| `consumeAuthorizationTransactionIfMatches({ state, match })`       | Atomic expiry + complete binding/hash match + deletion.                                                                                     |
| `getExchangeCode(code)`                                            | Detached live preflight record, without consumption.                                                                                        |
| `consumeExchangeCodeIfMatches({ code, expectedSessionId, match })` | Also atomically matches the session ID observed at preflight.                                                                               |
| `getSessionRevocationContext(sessionId)`                           | Live handle or unexpired alias resolves a currently live lineage; returns only logical ID, issuer/client identity and original key binding. |
| `reserveDpopProof({ replayKey, expiresAt })`                       | Atomic shared replay admission through expiry, with capacity enforced.                                                                      |

`match` always includes both fields: `{ deviceBinding: OidcVaultDpopBinding | null, browserBindingHash: string | null }`. **Null means the stored field must be absent/undefined.** It is never a wildcard. Valid transaction/code records are legacy (neither field), guarded unbound POST (cookie hash only), or bound POST (hash and key). Stored null, malformed/noncanonical hashes, extra binding fields, and a key without a browser hash are invalid, never legacy. Both hashes are canonical 43-character SHA-256 base64url values. Invalid binding/hash writes reject; invalid persisted data never yields credentials.

Reads are preflight snapshots, not locks. Matching consumers compare and delete atomically; a mismatch returns `null`, leaves a live record unchanged, and permits an honest retry. Concurrent matching calls have one winner. The original `consumeAuthorizationTransaction`/`consumeExchangeCode` methods refuse guarded records without spending them, including cookie-only records. Application-side get followed by unconditional deletion is not a supported guarded consume.

Rotation inherits the original binding if `nextSession.deviceBinding` is omitted/undefined. Supplying the same key is accepted; changing a bound key, explicitly removing it with null, or enrolling an unbound source is rejected before mutation. Use fresh IDs; the existing upsert/create-only differences above still apply.

Revocation context is detached authority, not alias authentication: `getSession(alias)` still returns `null`. Alias records do not need a stored binding; their **current live lineage** supplies it. Empty/expired lineages return `null`; malformed authority or inconsistent binding/provider identity across surviving members throws a fixed private diagnostic. No refresh/ID/access tokens, profile, metadata, or arbitrary provider fields are returned. Existing alias deadlines, lineage transitions and deletion counts are preserved. Logout authenticates this original context before lineage deletion, including when binding is disabled.

### Per-Request DPoP Replay Cost And Capacity

DPoP replay is a reservation per accepted proof, including API traffic; it is substantially higher-volume than backchannel logout JTI traffic. The store accepts an opaque namespaced key (the shared orchestration derives `dpop:v1:` plus SHA-256 of the protection-space/key/JTI tuple). Never partition by instance, token, code or session, release a reservation after a route failure, or extend a duplicate's expiry. Retries need a new proof.

`expiresAt` is a future safe-integer epoch in milliseconds, with at most **360000 ms** remaining. Invalid, fractional, unsafe, nonfinite, expired (`<= now`), or overlong windows return `false` without allocation. Valid expired keys may be reserved again. All instances must use identical namespaces/proof windows and synchronized clocks. The approved proof defaults retain at most 70 seconds of validity; provision capacity for unique proofs/second × retained window plus headroom.

Core derives `replayKey = 'dpop:v1:' + base64url(SHA-256(JSON([effectiveNamespace, jkt, jti])))` and expiry **`(iat + proofMaxAgeSeconds + clockSkewSeconds) * 1000`**. An explicitly ignored freshness failure instead uses the bounded current-time expiry described under [per-check overrides](#per-check-dpop-failure-overrides). Vault space is `['vault', normalizedBackendOrigin, normalizedBasePath, exactIssuer, exactClientId]`; API space is `['api', normalizedPublicOrigin, replayNamespace]`. API path prefix is a target correction, not replay partitioning. The 360000ms ceiling includes future iat skew (maximum age 300 + twice skew 30); no duplicate extends its reservation.

Every provider accepts `dpopReplayMaxEntries?: number`, default **100000**, positive safe integer. Capacity is per memory object, Redis prefix, or paired Mongo replay collections, shared across backend clients. Configure the same limit on every shared client. Duplicates return `false` even when full; new reservations throw root-exported `OidcVaultDpopReplayCapacityError` at capacity. Live reservations are never evicted. By default, API middleware and all DPoP-bearing vault POSTs map failures/capacity to sanitized `503 OIDC_VAULT_DPOP_REPLAY_UNAVAILABLE`; `ignoreReplayFailure` logs these failures and continues after attempting admission.

| Provider | Admission/expiry work                                                                                                                                                                                                                                                                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Memory   | Map + indexed min-heap; one node per retained key, at most 64 expired nodes plus the requested expired key removed per admission. Heap operations are O(log N); replay never scans session/alias maps. Only callers sharing the same store object share replay state.                                                                                               |
| Redis    | One steady-state cached `EVALSHA`; Redis `TIME` inside Lua controls admission. One sorted set holds key/expiry/capacity state; hard `LIMIT 64` expiry cleanup, duplicate-first admission, no live eviction. Cold/NOSCRIPT calls additionally load/retry the script.                                                                                                 |
| MongoDB  | A snapshot transaction writes one shared capacity/serialization row, checks duplicate IDs, reclaims at most 64 indexed expiry-accounting rows plus the requested expired key, then commits proof/accounting/capacity writes together. Physical proof TTL deletion cannot lose accounting: the separate indexed, non-TTL ledger retains reclaimable expiry evidence. |

Expired entries awaiting bounded cleanup can conservatively occupy capacity. Memory/Redis state is bounded by the configured limit; MongoDB has up to that many proof rows and accounting rows plus one capacity row. Mongo's shared admission row serializes traffic and can contend under load; an ordinary no-cleanup success uses seven data commands plus transaction commit, and a live duplicate uses the capacity write, proof lookup and commit. Cleanup and driver retries add commands. Read/consume and revocation costs are documented in each shipped provider README; these bounds are not latency or throughput guarantees.

### Dedicated Logout Continuation Storage

All three built-in factories also satisfy `OidcVaultLogoutNavigationStoreProvider`. This independent capability adds `createLogoutNavigationTicket(input): Promise<void>` and `consumeLogoutNavigationTicket({ namespace, ticketHash }): Promise<OidcVaultLogoutNavigationTicket | null>`. Both methods remain **optional on `OidcVaultStoreProvider`** for existing custom stores. Enable core `logoutNavigation` separately to register the continuation routes; storage alone does not change ordinary logout.

The core root exports `OidcVaultLogoutNavigationTicket`, `CreateLogoutNavigationTicketInput`, `ConsumeLogoutNavigationTicketInput`, `OidcVaultLogoutNavigationStoreProvider`, and `OidcVaultLogoutNavigationCapacityError`. Exactly five scalar fields are captured before the first await and returned as detached plain records: **`namespace`, `ticketHash`, `upstreamLogoutUrl`, `createdAt`, `expiresAt`**. Extra input fields/serializers are ignored. No raw ticket, full session/profile, handle, subject, or separate upstream tokens are copied. The already-built upstream URL can contain `id_token_hint`: hashing lookup keys does not encrypt this credential-bearing destination. Exclude records/URLs and arbitrary backend errors from logs.

Namespace is `logout-navigation:v1:` followed by a canonical 43-character SHA-256 base64url digest; `ticketHash` is also a canonical 43-character digest. The continuation protocol uses `lnt_` plus **32 cryptographically random bytes** encoded as unpadded canonical base64url (47 characters total); hash the **entire prefixed ticket** with SHA-256. Scope hashing uses UTF-8 `JSON.stringify(['oidc-vault-logout-navigation', 1, backendOrigin, normalizedBasePath, exactConfiguredIssuer, configuredClientId, namespaceLabel, normalizedFallbackUri, normalizedPostLogoutUriOrNull])`. Scope labels are static printable ASCII, default `default`, 1..128 bytes. Hash formats cannot establish entropy: callers must never intentionally reuse secrets/hashes. Origin/mount/provider/return-policy changes isolate continuations, not legacy sessions.

Create is **create-only**: live exact-pair collision throws `OidcVaultStoreConflictError` before capacity rejection without changing the first destination/deadline. Invalid/expired create throws `TypeError` without ticket allocation. Epochs and clock must be safe integers within ECMAScript Date range; original lifetime **1000..120000 ms**, remaining lifetime **>0 and <=120000 ms** (protocol default 60000 ms). Destinations must be absolute HTTP(S), without userinfo, fragment, raw whitespace/control characters or backslashes, and at most **16384 serialized UTF-8 bytes**. Discovered endpoints may use another host. Core/provider clocks must agree; Redis uses server `TIME`, ignoring its application clock for tickets.

Consume atomically checks the exact pair and `expiresAt > now`, removes the record and returns it once. Invalid input/unknown/spent/expired/malformed selected records return `null`; selected malformed/expired records are retired. Backend, clock and accounting errors **throw**, never successful grants. No read followed by unconditional delete or process-local lock implements shared consumption. An uncertain create/consume can have committed: never retry an arbitrary backend error or restore a consumed record.

Every built-in accepts `logoutNavigationMaxEntries?: number`, positive safe integer, default **10000**, independent of DPoP replay. Capacity spans effective ticket namespaces in one memory object, MongoDB collection pair or Redis keyPrefix; it is not tenant availability isolation. No live eviction; exhaustion throws `OidcVaultLogoutNavigationCapacityError`. Successful consume frees its own capacity immediately. Each operation reclaims at most **64 unrelated expiries plus its selected record**. Unknown consumes allocate no per-request state; expired accounting awaiting cleanup can conservatively occupy capacity. Session/lineage/backchannel deletion does not cascade to already-authorized continuations. See provider READMEs for physical retention/configuration details.

Migration: custom stores need this capability only when opting into a continuation flow; device binding's six methods remain separate. Built-in inferred return types expose both capabilities without casts or optional chaining.

## Session Identity And Store Namespaces

Exchange, refresh and logout compare every stored `provider.issuer` and `provider.clientId` that is not undefined against the resolved middleware configuration. Built-in logout also checks the currently live lineage through unexpired aliases. Each known field must match independently. Stored identifiers are compared verbatim, without trimming or URL canonicalization; issuer trailing-slash variants are distinct. Configuration strings still receive construction-time trimming.

A known mismatch returns HTTP 401 with `{"code":"OIDC_VAULT_INVALID_SESSION","message":"Session is missing or expired."}` before discovery, upstream token use, local issuance, lifecycle hooks, rotation, or lineage deletion. It neither sets nor clears a cookie and produces no provider logout redirect. The normal `onError` observer runs without the foreign session in its context.

Legacy sessions with absent `provider`, an empty provider object, or omitted/undefined identity fields remain supported. Only known fields are checked: an omitted issuer permits cross-issuer use, an omitted client ID permits cross-client use, and entirely absent identity permits both. Refresh does not backfill identity.

For complete identity isolation, use separate store namespaces for **session/alias, exchange-code, and authorization-transaction records**. Opt-in/guarded exchange preflights identity before code consumption, and built-in logout preflights live/alias lineage identity before deletion. Disabled genuinely legacy bearer exchange preserves its historical consume-before-identity ordering, so a rejected foreign exchange can still spend that legacy code. Old custom bearer stores without `getSessionRevocationContext` retain legacy alias deletion behavior; they cannot enable device binding. Absent provider fields remain compatibility omissions, not isolation guarantees.

## Known Browser And Concurrency Limits

- **Legacy browser binding:** unbound GET flows preserve their existing behavior: `state`, nonce, PKCE, and one-time codes alone do not bind completion to the initiating browser. A transferred legacy callback/frontend URL can cause session swapping; an unused legacy code is redeemable by another browser in either transport. Legacy `exchange` has no source-origin check and accepts URL-encoded forms. Opt-in POST callbacks and guarded exchange authenticate the temporary browser cookie; bound exchange/refresh/logout additionally require the original key. CORS and cookie refresh/logout Origin checks do not establish the legacy flow's missing binding.
- **Refresh families:** local atomic rotation allows one winner, but overlapping requests can send the same upstream refresh token multiple times, including across backend instances. A single-use provider with reuse detection can revoke the entire upstream refresh family, leaving the local winner unable to refresh. Deduplicate frontend refreshes, including bootstrap and retry paths; a per-context promise is not a distributed guarantee.
- **Cookie ordering:** a loser reaching a local rotation conflict (or a stale missing-session retry) clears the cookie. A late clear can erase the winner's cookie even while its server session remains live. Upstream-failure losers do not set a cookie. Response ordering is not enforced.
- **Logout and stateless tokens:** local/provider/backchannel logout revoke vault refresh sessions, not outstanding stateless application access tokens. Those remain valid until their own expiry unless your validator checks application revocation state. A refresh racing logout can still return 200 and an access token after its lineage is deleted. Keep local tokens short-lived; immediate API revocation requires application-owned validation state. Vault-session expiry likewise does not revoke an already-issued stateless token.

Browser-bound backend proofs (BOV-02-FU1) are implemented for opt-in POST login/callback/exchange and bound refresh/logout/API. [Persistent browser keys and real-browser integration](https://github.com/egose/web-ts-toolkit/blob/main/apps/oidc-vault-dpop-example/README.md) are implemented by the private example. Cross-instance refresh reservation (BOV-03-FU1) and stale-cookie ordering (BOV-03-FU2) remain proposed in the [boundary review](https://github.com/egose/web-ts-toolkit/blob/main/docs/tasks/20260908-070811-express-oidc-vault-boundary-review.md). DPoP replay admission and browser Web Locks do not implement a distributed refresh lease or response-ordering guarantee; different honest fresh proofs outside one coordinating frontend partition can still race a single-use upstream refresh family.

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
- `postLogoutRedirectUri` is optional and provider-registered; it may be on another origin. Redirected logout and opt-in logout navigation use it. Navigation additionally applies the stricter syntax and length rules below.
- After original identity and any required proof/nonce/replay checks, local logout (`redirect` unset or `false`) never contacts the provider: it revokes the local session lineage, clears the cookie under cookie transport, delivers `onLogout` for a live session, and returns `200 { loggedOut: true }`. Redirected live logout (`redirect: true`) commits the same local outcome before attempting an upstream end-session redirect. Discovery errors are reported through `onError`; errors or an absent `endSessionEndpoint` fall back to local `200 { loggedOut: true }`. Alias-only logout authenticates built-in revocation context and deletes the target lineage without live-session hooks/upstream work. No live target returns idempotent local success without deletion.
- backchannel logout revokes local sessions by upstream `sid` when available, otherwise by `sub`
- Every vault response carries `Cache-Control: no-store`, including parser errors. Legacy `Pragma`/`Expires` are unnecessary. The opt-in `/logout/navigation` route additionally carries `Referrer-Policy: no-referrer`; other routes retain their existing header policy. These headers do not clear history, disable proxy logging, strip callback `?code=` (use frontend `history.replaceState`), or hide protocol-required URL values from the navigation target. Assert both transports' response headers in integration tests.

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

## Local Access Token Example (unbound Bearer)

The middleware can return a local backend access token during `exchange` and `refresh` by providing a `tokenIssuer`.

This is the default **unbound** example. For bound JWTs use the [complete DPoP server](#complete-dpop-server). The helper omits vault handles from JWTs in both transports; application claims are explicitly allowlisted.

```ts
import express from 'express';
import { createOidcVaultMiddleware, createOidcVaultJwtAccessTokenIssuer } from '@web-ts-toolkit/express-oidc-vault';
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
    tokenIssuer: createOidcVaultJwtAccessTokenIssuer({
      key: jwtSecret,
      algorithm: 'HS256',
      issuer: localTokenIssuer,
      audience: localTokenAudience,
      lifetimeSeconds: 900,
      mapClaims({ session }) {
        return { email: typeof session.user?.email === 'string' ? session.user.email : undefined };
      },
    }),
  }),
);
```

That local token is separate from the upstream IdP access token:

- the upstream refresh token stays in the server-side vault
- the frontend receives local token fields and the session's `user` profile; body transport also includes the opaque `sessionId`, while cookie transport omits it
- the app-issued access token can contain only the claims your backend APIs actually need

### JWT issuer helper

`createOidcVaultJwtAccessTokenIssuer(options): OidcVaultTokenIssuer` is the signing counterpart of `createOidcVaultJwtAccessTokenValidator`. Configure the signing key/algorithm, exact nonblank issuer and nonempty audience (string or string array). The defaults are `lifetimeSeconds: 300`, `now: Date.now`, `sub: session.subject` and `scope: session.scope`. No key or algorithm is inferred. The protected header is `{ alg: algorithm, typ: 'JWT' }`.

```ts
import {
  createOidcVaultJwtAccessTokenIssuer,
  type OidcVaultJwtAccessTokenIssuerOptions,
  type OidcVaultTokenIssuer,
} from '@web-ts-toolkit/express-oidc-vault';

declare const signingKey: Uint8Array; // Your configured random secret, never a public fallback.
declare function loadPermissions(subject: string): Promise<string[]>;

const options: OidcVaultJwtAccessTokenIssuerOptions = {
  key: signingKey,
  algorithm: 'HS256',
  issuer: 'https://api.example.com',
  audience: ['app-api-v1'],
  lifetimeSeconds: 300,
  // Optional application subject namespace; runs before mapClaims.
  mapSubject: ({ session }) => `app:${session.subject}`,
  async mapClaims({ session, operation }) {
    const permissions = await loadPermissions(session.subject);
    return { permissions, scope: 'api:read', issuanceOperation: operation };
  },
};
const tokenIssuer: OidcVaultTokenIssuer = createOidcVaultJwtAccessTokenIssuer(options);
void tokenIssuer; // Pass as createOidcVaultMiddleware({ ..., tokenIssuer }).
```

Supported `OidcVaultJwtSigningAlgorithm` values: **HS256/384/512**, **RS256/384/512**, **PS256/384/512**, **ES256/384/512**, and **EdDSA (Ed25519)**. Accepts JOSE secret `Uint8Array`, secret/private Node `KeyObject`, signing `CryptoKey`, or secret/private `JWK`. Construction rejects incompatible type/curve/hash/usage, HMAC keys shorter than the hash size (32/48/64 bytes), RSA below 2048 bits, public-only keys, and contradictory JWK `alg`/`use`/`key_ops`. Use a generic RSA private key for RS/PS; restricted `rsa-pss` KeyObjects are unsupported. Import PEM material yourself with JOSE/Node; key rotation and JWKS serving remain application-owned.

The factory captures options/callback/clock references and copies audience arrays and mutable secret/JWK material; immutable native keys remain referenced. Later caller mutations do not reconfigure it. Lifetime must be nonnegative safe-integer seconds. Clock values must be nonnegative safe-integer epoch milliseconds, and lifetime conversion, response-deadline addition and JWT expiry milliseconds must remain safe. Validation runs at construction and again after mapping immediately before signing. JWT `iat = floor(now() / 1000)`, `exp = iat + lifetimeSeconds`, and returned `expiresIn = lifetimeSeconds`: subsecond rounding can shorten effective validity by less than a second. Zero lifetime signs an already-expired token with `exp === iat`, returns `expiresIn: 0`, and still permits delivery of a rotated vault handle/cookie; APIs reject its expiry and the browser retains no reusable credential.

Both optional mappers may be async and receive `IssueTokenInput` with `operation: 'exchange' | 'refresh'`. `mapSubject` must return a nonblank subject. `mapClaims` returns `OidcVaultJwtAccessTokenClaims`, an explicit application allowlist. It can override default scope, or omit it with `scope: undefined`; it must not supply **`iss`, `aud`, `iat`, `exp`, `sub`, or `cnf`**, even with undefined. Attempts reject with TypeError, including fields produced by JSON serializers. Claims are JSON-materialized before security-owned fields are attached. Non-object results and serialization failures reject. Subject/scope defaults and binding are captured before callbacks; only the authoritative input `deviceBinding` selects exact `cnf: { jkt }`/`DPoP`, and its absence selects no cnf/`Bearer`. Mutable session/profile/metadata binding never enrolls or rebinds a token.

No vault `sid`, session metadata, entire profile, or upstream tokens are copied automatically. Deliberate application claims remain trusted; keep business-user lookup, account/archived checks, roles/permissions and provisioning in callbacks. Mapper/serialization/clock/signing failures reach existing exchange/refresh rollback and private `hooks.onError`; committed outcomes still come from `onTokenOutcome`. Custom JWT/opaque unbound issuers and their existing output checks remain supported.

### Local issuer result contract

`tokenIssuer.issue` must resolve to a non-null, non-array object with:

- `accessToken`: nonempty opaque string for unbound issuance, returned verbatim without trimming; bound issuance requires the JWT profile below;
- `expiresIn`: finite nonnegative safe-integer seconds, from 0 through `Number.MAX_SAFE_INTEGER` for unbound issuance. Bound issuance additionally requires `expiresIn * 1000` to be safe;
- `tokenType`: exact `'Bearer'` or `'DPoP'`. **Unbound issuance** permits only `'Bearer'` or omission; omitted/undefined stays absent in JSON. **Bound issuance** requires exact `'DPoP'`. Null, lowercase, whitespace variants, and a bound Bearer result are invalid.

The **bound local-JWT profile** is a compact signed JWT with three nonempty canonical unpadded base64url segments, a nonempty signing `alg` other than `none` (no `b64: false` payload), exactly `cnf: { jkt }`, and a mandatory `exp`. The `jkt` must be the matching canonical RFC 7638 SHA-256 thumbprint (43 base64url characters with canonical final bits); additional confirmation fields/methods are unsupported. `exp` is a nonnegative safe integer in epoch **seconds**, and `exp * 1000` must also be a safe integer (so `exp <= Math.floor(Number.MAX_SAFE_INTEGER / 1000)`). Both the issuer boundary and built-in JWT validator enforce this profile.

`expiresIn: 0` remains valid output: the response can still deliver a rotated body handle or set a rotated cookie. It supplies no live reusable API/peer credential. The companion browser client caps its deadline by both `now + expiresIn * 1000` and JWT `exp * 1000`, checking the clock, conversions, and addition for safe nonnegative integers before clamping. It retains zero-lifetime response handles and rejects expired effective peer credentials. Browser decoding and trusted issuer output checks are **not JWT authentication**; JOSE/API expiry enforcement remains authoritative.

Only these three fields are copied once into a fresh result. Extra fields (including upstream tokens, `metadata`, `sessionId`, `user`, and `toJSON`) are ignored without evaluating their getters. The vault supplies the response session ID/profile. Omitting `tokenIssuer` is supported and returns no local token fields.

For a bound request, `IssueTokenInput.deviceBinding?: Readonly<OidcVaultVerifiedDpopBinding>` supplies the authoritative frozen `{ type: 'dpop', jkt, alg }` context. Use its `jkt` for the local JWT's `cnf.jkt`; do not infer binding from mutable user/profile data. Core checks this trusted issuer's payload contract by decoding its result, while APIs independently verify the token's signature, issuer, audience, and expiry. Local signing may still use HS256; DPoP proofs use the separately configured asymmetric profile.

Malformed results return HTTP 500 with `{"code":"OIDC_VAULT_INTERNAL_ERROR","message":"Unexpected OIDC vault error."}` inside issuance rollback: the logical lineage is revoked and cookie transport clears its cookie instead of minting one. Exchange has already consumed its code; refresh has already contacted the provider and rotated the handle, and its success notification does not run. Correct the issuer and start a new login. Field-specific diagnostics are the original `hooks.onError` context `error` (narrow it before use); allowed-field getter exceptions also enter rollback.

This projection contains accidental result extensions. Issuers/hooks remain trusted code with request/response access; the issuer receives a detached session and plain profile/provider/metadata containers, while core retains its binding and original rollback lineage. Application profiles and deliberate secrets placed in allowed fields are not redacted.

## Proof-Authorized Logout Navigation

Enable `logoutNavigation` to revoke locally using the original browser key, then navigate the document through an opaque backend ticket. An HTTP fetch following a provider 302 does not navigate the page, and browser manual redirects do not expose a usable Location. The provider's `id_token_hint` URL is never returned in JSON.

### Logout navigation server

```ts
import express from 'express';
import { createOidcVaultMiddleware, type OidcVaultLogoutNavigationOptions } from '@web-ts-toolkit/express-oidc-vault';
import { createMemoryOidcVaultStore } from '@web-ts-toolkit/express-oidc-vault-memory-store';

const logoutNavigation: OidcVaultLogoutNavigationOptions = {
  fallbackRedirectUri: 'https://app.example.com/signed-out',
  ticketTtlMs: 60_000,
  namespace: 'app-v1',
};
const app = express();
app.use(
  createOidcVaultMiddleware({
    backendOrigin: 'https://api.example.com',
    frontendRedirectUri: 'https://app.example.com/callback',
    trustedOrigins: ['https://app.example.com'],
    config: { issuer: 'https://provider.example.com', clientId: 'app' },
    deviceBinding: {},
    storeProvider: createMemoryOidcVaultStore(), // Shared Redis/MongoDB for multiple processes.
    postLogoutRedirectUri: 'https://app.example.com/provider-return',
    logoutNavigation,
  }),
);
```

Construction requires a plain options object, configured `deviceBinding`, its six store capabilities and both `createLogoutNavigationTicket`/`consumeLogoutNavigationTicket`. Missing capabilities fail synchronously with a feature/method-specific error. Options, normalized return destinations, TTL and derived namespace are detached/frozen; service references stay live. Feature-disabled custom stores need neither new method and register neither route.

`fallbackRedirectUri` is required, static, at most **2048 serialized UTF-8 bytes**, HTTPS (loopback HTTP development allowed), without userinfo, fragment, raw whitespace/backslashes/controls. It must stay on the pinned backend or configured frontend origin and cannot be the backend continuation path, even with a query. Static query parameters are allowed. `trustedOrigins` grants source authority only. When navigation is enabled, `postLogoutRedirectUri` receives the same syntax/length checks, with no fallback-origin restriction; register it with the provider. Both are operator configuration, never request destinations.

### Browser navigation logout

Use the companion client's public method after enabling the server above. It
owns bounded HTTP, original-key proof, nonce retry, cleanup and navigation:

```ts
import { createOidcVaultDpopSession } from '@web-ts-toolkit/oidc-vault-dpop-client';

const session = createOidcVaultDpopSession({
  backendOrigin: 'https://api.example.com',
  basePath: '/auth/oidc',
  sessionTransport: 'body',
});
export const signOutThroughProvider = (): Promise<void> => session.logoutAndNavigate();
```

An expired/absent local JWT needs no preliminary refresh: retain the original
persistent key and body handle or active matching cookie metadata. The client
accepts only the exact pinned backend bare/canonical-ticket URL. Confirmed logout
clears old state even on an invalid URL (`INVALID_LOGOUT_NAVIGATION_RESPONSE`);
unconfirmed/transport failures never automatically retry or navigate. Concurrent
clicks share one Promise through cleanup and one synchronous `navigate` adapter
call under lifecycle authority. Later login/exchange/local logout/clear/resetKey/
dispose withdraws old navigation intent immediately, even with login queued.
Earlier refresh rotation is published first; later refresh cannot restore auth.
The client root re-exports both pure navigation DTOs without Node/Express types.
Keep `logout()` for local-only behavior, add the new method to typed mocks, and
make custom navigation adapters hand off synchronously. See the client's
[navigation contract](https://github.com/egose/web-ts-toolkit/blob/main/packages/oidc-vault-dpop-client/README.md#provider-logout-navigation)
and real Chromium/Firefox reference example for both transports.

### Navigation wire protocol

Root and `/wire` export pure `OidcVaultLogoutNavigationInput { sessionId? }` and `OidcVaultLogoutNavigationResult { loggedOut: true, navigationUrl }`. This single-attempt example shows the HTTP boundary; a browser integration must also serialize lifecycle operations, retry a recognized nonce challenge once with a fresh proof/JTI, clean up confirmed local state and suppress stale navigation intents.

```ts
import type {
  OidcVaultLogoutNavigationInput,
  OidcVaultLogoutNavigationResult,
  OidcVaultSessionTransport,
} from '@web-ts-toolkit/express-oidc-vault/wire';

async function initiateLogoutNavigation(
  input: OidcVaultLogoutNavigationInput,
  freshOriginalKeyProof: string,
  transport: OidcVaultSessionTransport,
): Promise<OidcVaultLogoutNavigationResult> {
  const response = await fetch('https://api.example.com/auth/oidc/logout/navigation', {
    method: 'POST',
    credentials: transport === 'cookie' ? 'include' : 'omit',
    redirect: 'error',
    headers: { 'Content-Type': 'application/json', DPoP: freshOriginalKeyProof },
    body: JSON.stringify(transport === 'cookie' ? {} : input),
  });
  if (!response.ok) throw new Error('Logout initiation failed.');
  return response.json() as Promise<OidcVaultLogoutNavigationResult>;
}
```

POST accepts only a JSON object with optional string `sessionId`: body transport needs its nonempty handle; cookie transport selects only the configured cookie and ignores the body handle. Arrays/other fields are `400 OIDC_VAULT_INVALID_REQUEST_BODY`; unsupported media is `415 OIDC_VAULT_UNSUPPORTED_REQUEST_BODY_TYPE`. Query destinations are ignored. Strict raw Origin/Referer checks apply in **both transports** before store/proof work: absent/null/foreign/ambiguous sources reject; Referer is used only without Origin. Live/alias targets must have an original stored DPoP binding even under optional mode. An optional-unbound target gets `401 OIDC_VAULT_DEVICE_BINDING_REQUIRED` and can still use ordinary `/logout`. No local access JWT, Authorization, preliminary refresh, fingerprint or `ath` is needed. Proof/nonce/shared replay policies, explicit overrides and `logout` diagnostics are preserved.

Successful POST returns exactly `200 { loggedOut: true, navigationUrl }`. With an acknowledged ticket it is `https://api.example.com/auth/oidc/logout/navigation?ticket=lnt_<43 canonical base64url characters>`; otherwise it is that **bare absolute backend path**, whose GET selects fallback. Validate the exact pinned origin/path and either no query or one literal canonical ticket before top-level navigation; reject relative URLs, userinfo, fragments, alternate encodings, duplicate/extra parameters or other origins/paths. On confirmed `loggedOut: true`, clear local credentials even if its navigation URL is invalid, then reject without navigating. A transport/malformed-response failure leaves the server commit uncertain; do not automatically repeat the mutation or navigate. Repeated clicks should coalesce through cleanup/navigation, not cache a completed URL.

The order is original identity/key/proof -> context recheck -> live `onBeforeLogout` -> **await lineage deletion** -> configured cookie clear -> existing provider discovery/build -> ticket persistence -> live `onLogout` -> JSON. Ticket time is sampled after discovery: default **60000 ms**, integer **1000..120000 ms** inclusive, with Date-range epoch arithmetic checked at construction and issuance. Definite create conflicts get at most three independent random attempts sharing one deadline; other storage failures are not retried. Only the final provider URL, bounded to **16384 serialized UTF-8 bytes** and HTTP(S) without userinfo/fragment/raw unsafe characters, survives in the five-field server ticket. The ticket is 32 random bytes with `lnt_` prefix; storage sees only SHA-256 of the entire secret and an exact origin/mount/issuer/client/label/return-policy scope. See dedicated storage below for capacity, cleanup and provider retention.

Aliases authorize revocation only: no successor credential lookup, discovery, ticket or logout hooks. Missing/expired targets are idempotent bare-path success with no reservation/deletion/hooks. Missing original hint/endpoint also yields the bare path. Provider/build/ticket errors after deletion retain confirmed local logout, report privately through `onError` and still notify the live post-hook once. A deletion rejection, including partial deletion/alias-cleanup failure, is **uncertain**: sanitized error, no success DTO/navigation URL, cookie-clear signal or post-hook. Cookie preparation failure after deletion retains revocation, emits the live post-hook, errors and mints no ticket. Hooks retain route `logout` and owned original snapshots; no new credential metadata or token-outcome event is emitted. Hook notification is per admitted live request, not globally exactly-once; concurrent live initiations can each issue a grant. Crashes or response loss can lose notifications or leave an undelivered grant until expiry; credentials are never recreated.

GET needs no cookie, handle, API token or proof. It accepts only one canonical raw `ticket` parameter, hashes it in its pinned namespace, atomically consumes it **before** writing an empty-body 302 Location and validates returned identity/window/URL. It does no discovery/session work/hooks/diagnostics and cannot clear a newer login cookie. Missing/malformed/duplicate/extra/unknown/expired/spent/foreign tickets select the fixed fallback; malformed queries never call storage. Consume errors/invalid adapter records report privately and also select fallback, without restore or ambiguous retry. Cross-instance simultaneous GETs have one upstream winner. Response loss after consume burns the grant. Explicit HEAD is **405, Allow: GET, POST**, before GET/body parsing, and never consumes; other methods cannot spend tickets, and CORS OPTIONS remains caller-owned.

All new-route success/error/redirect responses carry **Cache-Control: no-store** and **Referrer-Policy: no-referrer**. JSON contains no upstream URL/token, session handle, subject or provider fields. The short-lived ticket is a bearer continuation, independent of cleared cookies/IP/user agent; possession can spend only that continuation. URLs/history/proxy logging and the IdP-visible hint remain navigation exposures, and lookup hashing does not encrypt the stored destination. After upstream handoff, IdP availability/termination/return is not guaranteed. Local logout does not revoke stateless JWTs; existing local/302 POST logout, signed backchannel logout and override contracts remain supported.

## Migration And Behavior Changes

- Logout navigation is additive and opt-in. Use JSON POST plus top-level navigation through the backend continuation when integrating proof-authorized upstream logout. Replace duplicated discovery/cookie/alias logic with this protocol. Keep ordinary `/logout` for local-only/legacy unbound sessions. Built-in stores support tickets; custom stores need both optional methods only when enabling `logoutNavigation`. Enabled flows tighten configured return-URI validation as described above. There is no store schema migration for disabled custom stores.

- The local JWT issuer helper is additive. Replace manual signing/`cnf.jkt`/tokenType/expiry construction with `createOidcVaultJwtAccessTokenIssuer`, preserving business claims in its mapper. Set an explicit strong key, algorithm, issuer and audience; use `mapSubject` for subject remapping and remove reserved fields from `mapClaims`. It omits vault sid by default, including in cookie transport. Existing custom issuers retain output validation and rollback behavior.
- Structured telemetry is additive: opt into `onDpopDiagnostic` and `onTokenOutcome` on vault options, and `onDpopDiagnostic` on API options. `IssueTokenInput` now includes required `operation: 'exchange' | 'refresh'`; update hand-built typed issuer inputs. Existing issuer callbacks may ignore the new field. Move successful-exchange/issuance logging out of signing callbacks into committed outcomes; signing alone is not success. Existing `onError`, enforcement/overrides, rollback, and browser errors/challenges are preserved.
- Optional API authentication is additive: `authentication` defaults to `required`, and `invalidCredentials` defaults to `reject`. Binding mode is independent. Use one `createOidcVaultAuthenticator` instance for public enrichment and protected guards; replace response interception and repeated authentication mounts with its handlers. Empty/duplicate/comma-joined/non-ASCII Authorization credentials are rejected, including on the legacy path. Custom validators opting into anonymous fallback must deliberately throw `OidcVaultInvalidAccessTokenError` for credential rejection; arbitrary exceptions keep their existing strict rejection response.
- Declaration upgrade: browser DTO consumers can use type-only imports from `@web-ts-toolkit/express-oidc-vault/wire`, including the new navigation input/result. Existing DTO root imports and backend `req.auth` augmentation remain supported in strict ESM/CJS consumers. The companion client ships DOM-only declarations and requires Node **>=22.12.0** for CJS tooling.
- Browser-client upgrade: use the [published client quickstart](#browser-dpop-client) in place of the old standalone implementation. Its shipped [upgrade notes](https://github.com/egose/web-ts-toolkit/blob/main/packages/oidc-vault-dpop-client/README.md#upgrade-notes) cover finite HTTP budgets/cancellation, FIFO/cleanup, terminal versus recoverable errors, single-attempt nonce learning, gateway path normalization and explicit scoped key recovery. Existing browser keys keep their database name/schema.
- Optional-only endpoint settings previously ignored now select manual mode and fail without the complete manual set. Supply all required manual values or remove endpoint settings to use discovery. Correct malformed optional discovery capabilities at the provider, or omit unsupported fields.
- DPoP remains opt-in: omitted policy preserves unbound behavior; an object defaults to optional, required rejects legacy unbound use. New binding is selected only by proof-aware POST login. Disabling DPoP or omitting later proofs never downgrades existing bound records/JWTs. Recognition remains a separate opt-in with POST-only enrollment; a changed enrolled signal requires fresh login.
- Invalid transaction/code TTLs previously had store-dependent behavior; supply positive safe-integer milliseconds. `sessionTtlMs` is opt-in for new sessions and never renews on refresh. Custom clocks are now sampled during construction.
- Route each session to its owning issuer/client configuration. Known foreign live sessions now fail with 401. Correct inaccurate stored identity only from trusted provenance or require login again; do not remove identity fields to bypass the guard. Legacy omissions and shared code/alias limits remain as described above.
- Issuers must return the declared local credential shape; previously accepted malformed results now fail with rollback. Extra result properties no longer extend/override JSON responses.
- Bound JWT upgrade: emit exactly `cnf: { jkt }`, canonical compact encoding, and a safe integer `exp` with safe milliseconds; bound `expiresIn` must also convert safely to milliseconds. Unsupported confirmation extensions and missing/unsafe expiry now fail issuance with the same sanitized HTTP 500/original-lineage rollback. Already-issued invalid bound JWTs fail both built-in validator methods **before `mapClaims`**. Generic unbound JWT optional-exp behavior and opaque unbound issuance remain compatible; zero-lifetime responses still carry session-rotation results.
- Provider network/reset failures now produce sanitized endpoint-specific 502s instead of generic internal errors. Cancellation no longer waits for an uncooperative cleanup promise. Alias-retention wording reflects existing SVH-05 behavior, with no store migration.

## Access Token Validation Middleware

The OIDC route/session middleware and API access-token authentication are separate concerns.

Use `createOidcVaultMiddleware(...)` for:

- login
- callback
- exchange
- refresh
- logout

Use `createOidcVaultAccessTokenMiddleware(...)` for:

- validating the app-issued local access token on protected API routes
- attaching authenticated auth context to `req.auth`
- rejecting missing, malformed, invalid, or expired access tokens with `401`
- enforcing opt-in DPoP sender constraints before authenticated context or downstream work

`onAuthContext` is a pre-`next()` veto hook, not a post-commit notification:
when it throws, downstream middleware never runs and `req.auth` is detached
before the error response is sent. A valid token plus a failing hook never
surfaces as an invalid-token `401`: a forwarded controlled package error keeps
its own status/code/client message (only a `401` veto carries an authentication
challenge; the default legacy path uses `Bearer`), while any other hook error becomes a sanitized `500
OIDC_VAULT_AUTH_CONTEXT_FAILED` without leaking the original message. Pass
`onError` to observe the original error object (extraction, token/proof validator,
nonce/replay, or hook failure) for private server-side logs; it never affects the
sanitized client response. The middleware snapshots error response data before
the observer runs, detaches `req.auth` on failure, and restores security-owned
token/confirmation/binding after mutable successful hooks. API responses carry
`Cache-Control: no-store`; admitted replay reservations remain consumed after a veto.

```ts
import express from 'express';
import {
  createOidcVaultAccessTokenMiddleware,
  createOidcVaultJwtAccessTokenValidator,
} from '@web-ts-toolkit/express-oidc-vault';

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
    validator: createOidcVaultJwtAccessTokenValidator({
      key: jwtSecret,
      issuer: localTokenIssuer,
      audience: localTokenAudience,
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

Returned auth context shape:

- `req.auth.token`
- `req.auth.subject`
- `req.auth.sessionId`
- `req.auth.scope`
- `req.auth.claims`
- `req.auth.confirmation` (mandatory object/null in request-aware mode; absent for a legacy unbound JWT)
- `req.auth.deviceBinding` (frozen `{ type: 'dpop', jkt, alg }` after bound proof/nonce/replay acceptance)

The package augments Express request typing so `req.auth` is available without casting in TypeScript route handlers.

### Optional authentication and request-scoped guards

`authentication: 'optional'` allows **absent credentials** on public endpoints. It is separate from `deviceBinding.mode: 'optional'`, which permits verified unbound tokens while authentication still defaults to required. `invalidCredentials: 'anonymous'` additionally allows known credential rejections to continue anonymously; it must be explicitly combined with optional authentication. Both options work with `createOidcVaultAccessTokenMiddleware` and `createOidcVaultAuthenticator`.

```ts
import express from 'express';
import { createMemoryOidcVaultStore } from '@web-ts-toolkit/express-oidc-vault-memory-store';
import {
  createOidcVaultAuthenticator,
  createOidcVaultJwtAccessTokenValidator,
  OidcVaultAuthDeniedError,
} from '@web-ts-toolkit/express-oidc-vault';

// The application owns user lookup, account state and permissions.
declare function findApplicationUser(subject: string): Promise<{ id: string; active: boolean } | null>;
const rawSecret = process.env.APP_JWT_SECRET;
if (!rawSecret || Buffer.byteLength(rawSecret, 'utf8') < 32) {
  throw new Error('APP_JWT_SECRET must encode at least 32 random bytes.');
}
const auth = createOidcVaultAuthenticator({
  authentication: 'optional',
  invalidCredentials: 'reject', // Default. Choose 'anonymous' explicitly if this public API permits it.
  validator: createOidcVaultJwtAccessTokenValidator({
    key: new TextEncoder().encode(rawSecret),
    issuer: 'https://api.example.com',
    audience: 'app-api',
    algorithms: ['HS256'],
  }),
  deviceBinding: {
    mode: 'optional',
    publicOrigin: 'https://api.example.com',
    replayNamespace: 'app-api',
    replayStore: createMemoryOidcVaultStore(), // One process; use a shared Redis/MongoDB store across processes.
  },
  async onAuthContext({ auth, res }) {
    const user = await findApplicationUser(auth.subject);
    if (!user?.active) throw new OidcVaultAuthDeniedError('Account access denied.');
    res.locals.user = { id: user.id };
  },
});
const app = express();
app.use('/api', auth.authenticate); // Mount once, before all routes that consume this authenticator.
app.get('/api/session', (req, res) => {
  res.json({ authenticated: !!req.auth, user: res.locals.user ?? null });
});
app.get('/api/private', auth.requireAuth, (_req, res) => res.json({ user: res.locals.user }));
app.get('/api/bound', auth.requireAuth, auth.requireDeviceBinding, (_req, res) => res.json({ user: res.locals.user }));
```

Guards must come **after `authenticate` from the same factory instance**. They do not run validation, proof reservation or enrichment again, even when several compatible guards are chained. `requireAuth` needs completed authentication; `requireDeviceBinding` also needs the token's original confirmation plus accepted original-key proof. An unbound Bearer token with a valid optional proof remains unbound. Permission checks stay application-owned after the authentication guard.

Evidence is private and scoped to the original Request/Response pair and captured policy. Plain/forged/copied `req.auth`, another request, and another authenticator (even with identical options) cannot authorize a guard. Do not replace or mutate top-level `req.auth` fields between these handlers; guards reject changed context. Enrich in `onAuthContext` or application-owned `res.locals`. Mounting authentication twice, or entering a guard before authentication has finished, invalidates pending work and returns `500 OIDC_VAULT_AUTHENTICATION_REENTRY`; the original operation cannot later attach context or continue downstream. Missing/incompatible/changed evidence returns `401 OIDC_VAULT_AUTHENTICATION_REQUIRED`; an authenticated unbound request fails the bound guard with `401 OIDC_VAULT_DEVICE_BINDING_REQUIRED`.

| Outcome                                                                                                     | Optional/default handling                                                                 | With explicit `invalidCredentials: 'anonymous'`     |
| ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Missing: neither Authorization nor DPoP header                                                              | Continue without `req.auth`; required guards reject                                       | Same                                                |
| Invalid: empty/malformed/duplicate headers, rejected token, missing/wrong/replayed proof or bound-as-Bearer | Reject with the existing credential/proof response                                        | Continue without `req.auth`; required guards reject |
| Authenticated: token, applicable proof checks and enrichment succeed                                        | Attach context and continue                                                               | Same                                                |
| Challenged: otherwise-valid proof needs a nonce                                                             | Preserve status, body, `WWW-Authenticate` and `DPoP-Nonce`; retry once with a fresh proof | Same; never anonymous                               |
| Failed: replay service outage/capacity, adapter contract/unknown exception, hook denial/failure             | Terminate with the existing failure contract                                              | Same; never anonymous                               |

Known validator rejection means `OidcVaultInvalidAccessTokenError` from a custom validator, or the built-in JWT helper's malformed JWT/JWS, expiry, claims/issuer/audience, signature, disallowed-algorithm, verified confirmation/expiry-profile or default-subject rejection. A custom adapter can `throw new OidcVaultInvalidAccessTokenError('Private diagnostic.')` after determining that the credential is invalid; its client message stays fixed. Malformed adapter results, unsupported/configuration errors and exceptions from custom `mapClaims` do **not** authorize fallback. Neither an arbitrary 401/status/code nor an unknown adapter exception proves credential rejection; these retain their existing sanitized strict responses (including legacy validator 401s).

Intentional enrichment vetoes use the root-exported `OidcVaultAuthDeniedError(message?, status?: 401 | 403)`: default `403`, fixed code `OIDC_VAULT_AUTH_DENIED`, and an explicitly public message (default `Authentication denied.`). A 401 denial uses the attempted scheme's challenge; a 403 has none. Any unexpected hook exception remains `500 OIDC_VAULT_AUTH_CONTEXT_FAILED`. Denials/failures never become anonymous and do not release an admitted proof. `onError` still observes original rejection errors, including explicit anonymous fallback and guard failures; observer exceptions cannot change outcomes. Anonymous continuation clears library auth and challenge headers after observers and retains `Cache-Control: no-store`.

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

If you need a custom mapping, pass `mapClaims(...)` to `createOidcVaultJwtAccessTokenValidator(...)`. The helper verifies the JWT first, snapshots its original `cnf` **before** mapping, and discards mapper-supplied `confirmation` and `deviceBinding`. Deleting/mutating `claims.cnf` or returning only a subject cannot remove the proof requirement. Supported `cnf` is exactly `{ jkt: '<canonical SHA-256 thumbprint>' }`; null, malformed values, and other confirmation methods are invalid tokens, never legacy unbound tokens. Construction copies secret/JWK/allowlist/audience containers and captures the mapper.

The helper implements both `validate(token)` and `validateWithRequest({ token, scheme, req })`. Its legacy result omits confirmation only for an originally unbound JWT, and reports a bound confirmation so even binding-disabled vault API middleware refuses a known bound-token downgrade. The helper itself authenticates JWT data; proof enforcement is performed by the middleware below.

In **both methods**, a cryptographically verified bound JWT must also satisfy the [bound local-JWT profile](#local-issuer-result-contract), including mandatory safe `exp`, before `mapClaims` runs. A mapper cannot repair missing expiry or unsupported confirmation. JOSE still verifies signature, expiration, and configured issuer/audience/algorithms first. Genuinely unbound JWTs retain JOSE's generic optional-exp contract; this bound profile does not impose a new token-purpose or mandatory-exp policy on them.

### Request-aware DPoP APIs

**Every API accepting a bound JWT must enforce the request proof.** A signature-only JWT verifier remains bearer-equivalent. Configure the API middleware with `OidcVaultApiDeviceBindingOptions` and a request-aware validator. This API path works with local JWTs whose verified `cnf.jkt` binds the client key. Vault POST login/callback persist the initiating key; exchange/refresh pass its verified request context to the local issuer, and bound logout requires that same key.

```ts
import express from 'express';
import { createClient } from 'redis';
import { createRedisOidcVaultStore } from '@web-ts-toolkit/express-oidc-vault-redis-store';
import {
  createOidcVaultAccessTokenMiddleware,
  createOidcVaultJwtAccessTokenValidator,
  type OidcVaultApiDeviceBindingOptions,
} from '@web-ts-toolkit/express-oidc-vault';

const redis = createClient({ url: process.env.REDIS_URL });
redis.on('error', () => console.warn('OIDC vault Redis connection error.'));
await redis.connect();
const replayStore = createRedisOidcVaultStore({ client: redis, keyPrefix: 'app-auth' });
const rawSecret = process.env.APP_JWT_SECRET;
if (!rawSecret || Buffer.byteLength(rawSecret, 'utf8') < 32) {
  throw new Error('APP_JWT_SECRET must encode at least 32 random bytes.');
}
const validator = createOidcVaultJwtAccessTokenValidator({
  key: new TextEncoder().encode(rawSecret),
  issuer: 'https://api.example.com',
  audience: 'api-audience',
  algorithms: ['HS256'], // Local JWT signing; DPoP proofs remain asymmetric.
  mapClaims: (claims) => ({ subject: String(claims.sub), claims }),
});
const deviceBinding: OidcVaultApiDeviceBindingOptions = {
  mode: 'optional', // 'required' rejects genuinely unbound JWTs.
  publicOrigin: 'https://api.example.com',
  publicPathPrefix: '/public', // Only if a proxy stripped this external prefix.
  replayNamespace: 'app-api-v1', // Same static value on every instance/route in this space.
  replayStore,
  algorithms: ['ES256'], // Default. Explicit PS256/RS256 require RSA 2048–4096 bits.
  proofMaxAgeSeconds: 60, // Default; integer 1–300.
  clockSkewSeconds: 5, // Default; integer 0–30.
  // nonce: { secret: sharedRandomNonceBytes, lifetimeSeconds: 60 },
};
const app = express();
app.get('/api/me', createOidcVaultAccessTokenMiddleware({ validator, deviceBinding }), (req, res) => {
  res.json({ subject: req.auth?.subject, deviceBinding: req.auth?.deviceBinding });
});
```

Here the proof target is `https://api.example.com/public/api/me`. With no stripped prefix, omit `publicPathPrefix`. Origins are static HTTPS origins (loopback HTTP is allowed for development), without userinfo/path/query/fragment. The target comes from that pinned origin plus the configured prefix and `req.originalUrl` pathname: Host, Forwarded, X-Forwarded-\* and Express `trust proxy` never choose it. Comparison strips query/fragment, normalizes scheme/host/default port/dot segments/unreserved escapes, uppercases remaining percent escapes, and preserves reserved escapes such as `%2F`. Origin-form `//host/path` stays a path on the pinned origin. Keep proxy mount paths consistent with this configuration.

| API binding configuration | Verified token | Presentation                                                                                        |
| ------------------------- | -------------- | --------------------------------------------------------------------------------------------------- |
| Omitted                   | Unbound        | Existing Bearer path; exactly `validate(token)` with one argument.                                  |
| Omitted                   | Known bound    | Refused with `OIDC_VAULT_DPOP_REQUIRED`.                                                            |
| Optional                  | Unbound        | Bearer accepted; a later proof never upgrades it. DPoP scheme is invalid.                           |
| Required                  | Unbound        | Refused with `OIDC_VAULT_DEVICE_BINDING_REQUIRED`.                                                  |
| Optional/required         | Bound          | Exact DPoP presentation plus one valid proof from the original key. Bearer fails even with a proof. |

Binding-enabled construction requires `validator.validateWithRequest`, invoked for both schemes with `{ token, scheme: 'Bearer' | 'DPoP', req: Request }`. Custom JWT/introspection adapters return `OidcVaultRequestAwareAccessTokenValidationResult` with **mandatory** `confirmation: { jkt } | null`, derived from verified original data. Null means genuinely unbound; omission/malformed confirmation fails closed. Adapters are trusted to report binding faithfully. Middleware captures credential, raw proof count/value, method and path before an asynchronous adapter can mutate the request, and never accepts adapter-supplied `token`/`deviceBinding` as proof authority.

The wire request is:

```http
Authorization: DPoP <local-access-token>
DPoP: <fresh-signed-proof-jwt>
```

The proof has protected `{ typ: 'dpop+jwt', alg: 'ES256', jwk: <public-P-256-JWK> }` and signed `htm`, absolute `htu` without query/fragment, integer `iat`, fresh `jti`, and API `ath = base64url(SHA-256(ASCII(accessToken)))`. A configured nonce also supplies the signed `nonce`. Signature verification precedes payload/target/key/hash checks. By default, private/symmetric/remote-key JWKs, critical headers, wrong key/signature/method/URL/hash, and duplicate/stale/replayed proofs fail. The independent [per-check overrides](#per-check-dpop-failure-overrides) apply to method/URL, freshness, and replay failures. Bounds: compact proof 8192 bytes, decoded protected header/JWK 2048 bytes, printable ASCII JTI 1–128 bytes, nonce at most 512 bytes. Raw duplicate Authorization/DPoP fields and comma-joined credentials/proofs are rejected. Generate at least 128 random bits for every JTI and a new proof for every request/retry.

For optional unbound Bearer requests, an omitted proof stays on the unbound path. If a proof is supplied, it must still pass signature/target/API `ath`/nonce/shared replay and never creates `auth.deviceBinding`.

API replay uses the shared `['api', normalizedPublicOrigin, replayNamespace]` protection space; paths, tokens and instance IDs do not partition it. Use one shared memory-store object only for local single-process testing, or the shared Redis/MongoDB service for multiple processes. Every accepted proof costs an atomic write; configure matching windows/namespaces/capacity/nonce secrets and synchronized clocks on all instances. No implicit replay fallback exists and later hook/route failures never release reservations.

#### API errors and nonce retry

With default failure enforcement and the ES256 policy (`algs` lists the configured allowlist in order):

| Condition                                                  | HTTP / code                                                                  | `WWW-Authenticate`                              |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------- |
| No credentials, optional                                   | 401 `OIDC_VAULT_MISSING_ACCESS_TOKEN`                                        | `Bearer, DPoP algs="ES256"`                     |
| No credentials, required                                   | 401 `OIDC_VAULT_MISSING_ACCESS_TOKEN`                                        | `DPoP algs="ES256"`                             |
| Invalid Bearer token / required unbound Bearer             | 401 `OIDC_VAULT_INVALID_ACCESS_TOKEN` / `OIDC_VAULT_DEVICE_BINDING_REQUIRED` | `Bearer error="invalid_token"`                  |
| Invalid DPoP token / DPoP presentation of an unbound token | 401 `OIDC_VAULT_INVALID_ACCESS_TOKEN`                                        | `DPoP error="invalid_token", algs="ES256"`      |
| Bound downgrade / missing proof                            | 401 `OIDC_VAULT_DPOP_REQUIRED`                                               | `DPoP error="invalid_dpop_proof", algs="ES256"` |
| Invalid/duplicate/oversized/stale/wrong-key/replayed proof | 401 `OIDC_VAULT_INVALID_DPOP_PROOF`                                          | `DPoP error="invalid_dpop_proof", algs="ES256"` |
| Otherwise-valid proof needs a nonce                        | 401 `OIDC_VAULT_USE_DPOP_NONCE`                                              | `DPoP error="use_dpop_nonce", algs="ES256"`     |
| Replay service error/capacity                              | 503 `OIDC_VAULT_DPOP_REPLAY_UNAVAILABLE`                                     | Absent                                          |

JSON stays `{ code, message }` with fixed messages: `Missing access token.`, `A device-bound login is required.`, `DPoP authentication is required.`, `Access token validation failed.`, `DPoP proof validation failed.`, `A fresh DPoP nonce is required.`, or `DPoP replay protection is unavailable.` No `error_description`, raw claim/key/URL or provider diagnostic is emitted. Non-401 failures have no authentication challenge. The omitted-binding legacy parser/errors/Bearer challenge remain compatible.

Nonce is off by default. Enable it with a shared random `Uint8Array` secret of at least 32 bytes and optional lifetime 1–300 seconds (default 60), copied at construction. An otherwise-valid proof with a missing/expired/wrong nonce receives exactly one bounded `DPoP-Nonce` header before replay reservation. Cache it per protection space/key and retry **once** with fresh JTI/iat/signature and the nonce; stop after a repeated challenge. Any authentic live issued nonce is valid, including older parallel challenges. A nonce does not excuse stale proof time or replay. Cross-origin browser CORS must allow `Authorization` and `DPoP`, and expose `DPoP-Nonce` and `WWW-Authenticate` when read by the client. The [private browser example](https://github.com/egose/web-ts-toolkit/blob/main/apps/oidc-vault-dpop-example/README.md) implements persistent keys and bounded fetch/refresh retries.

### Fixed DPoP and recognition errors

Vault routes and API middleware return sanitized `{ code, message }`. Invalid proof details are deliberately combined, including wrong key/target/ath and replay. For client handling, use the code/status/challenge rather than private diagnostics:

| HTTP                | Code                                       | Fixed message                                      |
| ------------------- | ------------------------------------------ | -------------------------------------------------- |
| 401                 | `OIDC_VAULT_MISSING_ACCESS_TOKEN`          | `Missing access token.` (binding-enabled API only) |
| 401                 | `OIDC_VAULT_DEVICE_BINDING_REQUIRED`       | `A device-bound login is required.`                |
| 401                 | `OIDC_VAULT_DPOP_REQUIRED`                 | `DPoP authentication is required.`                 |
| 401                 | `OIDC_VAULT_INVALID_DPOP_PROOF`            | `DPoP proof validation failed.`                    |
| 400                 | `OIDC_VAULT_INVALID_BROWSER_BINDING`       | `Login browser binding validation failed.`         |
| 415                 | `OIDC_VAULT_UNSUPPORTED_REQUEST_BODY_TYPE` | `Login initiation requires a JSON request body.`   |
| 400 vault / 401 API | `OIDC_VAULT_USE_DPOP_NONCE`                | `A fresh DPoP nonce is required.`                  |
| 503                 | `OIDC_VAULT_DPOP_REPLAY_UNAVAILABLE`       | `DPoP replay protection is unavailable.`           |
| 400                 | `OIDC_VAULT_INVALID_FINGERPRINT`           | `Fingerprint signal is invalid.`                   |
| 403                 | `OIDC_VAULT_FINGERPRINT_REAUTH_REQUIRED`   | `Browser recognition changed; sign in again.`      |

Source failures retain `403 OIDC_VAULT_UNTRUSTED_ORIGIN` with `Login request origin is not trusted.` / `Exchange request origin is not trusted.` / `Refresh request origin is not trusted.` / `Logout request origin is not trusted.`. An authenticated provider-error callback returns fixed `400 OIDC_VAULT_CALLBACK_ERROR` / `OIDC callback failed.`. With default enforcement, replay storage failure/capacity is a fail-closed 503 with no auth challenge; invalid/missing proof 401s use `invalid_dpop_proof`, and API nonce 401s use `use_dpop_nonce`. Vault nonce 400s carry the one `DPoP-Nonce` header without `WWW-Authenticate`. Every response retains `no-store`; failures that stop the request reach `hooks.onError` or the separate API `onError`, with replay provider diagnostics in `error.cause`. Independently ignored failures are logged to `console.warn` as described under [per-check overrides](#per-check-dpop-failure-overrides).

Recommended separation:

- keep login/session lifecycle in `createOidcVaultMiddleware(...)`
- keep normal API Bearer/DPoP validation in `createOidcVaultAccessTokenMiddleware(...)`
- keep authorization decisions outside the validator middleware

## Structured DPoP Diagnostics And Token Outcomes

Use root-exported `OidcVaultDpopDiagnosticObserver` and
`OidcVaultTokenOutcomeObserver` for server telemetry. Configure each vault/API
instance explicitly; diagnostics do not use the browser wire entry.

```ts
import type {
  OidcVaultAccessTokenMiddlewareOptions,
  OidcVaultDpopDiagnosticObserver,
  OidcVaultOptions,
  OidcVaultTokenOutcomeObserver,
} from '@web-ts-toolkit/express-oidc-vault';

const onDpopDiagnostic: OidcVaultDpopDiagnosticObserver = (event) => {
  if (event.stage === 'freshness' && event.outcome !== 'accepted') {
    console.info('dpop-time-check', {
      operation: event.operation,
      outcome: event.outcome,
      reason: event.reason,
      timing: event.timing,
      correlation: event.correlation,
    });
  }
  if (event.stage === 'replay' || event.outcome === 'challenged') {
    console.info('dpop-admission', event);
  }
};
const onTokenOutcome: OidcVaultTokenOutcomeObserver = (event) => {
  // Persistence, retention and deduplication remain application-owned.
  console.info('vault-committed-outcome', event);
};

export function instrumentVault(vault: OidcVaultOptions, api: OidcVaultAccessTokenMiddlewareOptions) {
  return {
    vault: { ...vault, onDpopDiagnostic, onTokenOutcome },
    api: { ...api, onDpopDiagnostic },
  };
}
```

### Check events and verification provenance

`OidcVaultDpopDiagnosticEvent` has explicit `operation` (`login`, `exchange`,
`refresh`, `logout`, `api`), `stage`, `outcome` (`accepted`, `rejected`,
`challenged`, `ignored`) and stable literal `reason`. No message matching or JWT
decoding is needed. Typical classifications:

| Stage                                  | Reasons/outcomes                                                                                                                                                                                                                                                                                               |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `presentation`, `preflight`            | `malformed-proof`, `proof-required`, `binding-required`, `credential-rejected`, `session-unavailable`, `session-mismatch`, `origin-rejected`, `browser-binding-rejected`, `recognition-rejected`, generic `preflight-failed`; ignored `policy-disabled`/`proof-absent`/`target-absent` (no live logout target) |
| `header`, `key`, `signature`, `claims` | `unsupported-header`/`malformed-proof`, `invalid-key`, `invalid-signature`, `invalid-claims`                                                                                                                                                                                                                   |
| `target`, `token-hash`, `binding`      | `target-mismatch`, `token-hash-mismatch`, `key-mismatch`                                                                                                                                                                                                                                                       |
| `freshness`                            | `proof-too-old`, `proof-in-future`, `invalid-time`, `clock-unavailable`                                                                                                                                                                                                                                        |
| `nonce`                                | challenged `nonce-required`/`nonce-invalid`, rejected `invalid-nonce`/`nonce-unavailable` (challenge issuance failed), ignored `nonce-disabled`                                                                                                                                                                |
| `replay`                               | `replay-detected` (duplicate/not-live admission), `replay-unavailable` (including capacity, invalid adapter result, and uncertain store failure)                                                                                                                                                               |
| `proof`                                | accepted `proof-accepted` after admission                                                                                                                                                                                                                                                                      |

Successful individual checks use `check-passed`. Events are produced in check
order and stop at rejection/challenge/omitted proof or final proof admission.
There are at most 16 events per proof attempt. Headerless callback and guards
reusing OVAPP-01 private request evidence perform no proof checks and emit none.
A proof accepted before a later hook/provider/issuer failure remains an accepted
proof, not a completed login/exchange/API authorization.

Each frozen `verification` snapshot independently reports signature,
target, access-token hash (`tokenHash`), original credential binding,
freshness, nonce, and replay. `unchecked` means not reached; `failed` means
checked and failed; passed/matched/reserved, disabled/not-applicable,
challenged, and explicitly ignored checks are distinct. An override still runs
its check and preserves the existing warning/enforcement behavior. Final
`proof-accepted` can contain ignored checks; it does not assert strict success.

`timing` appears only after signature verification and valid signed iat/JTI
shape. `provenance: 'signature-verified'` describes the **claim**, not identity or
physical-clock accuracy. Freshness enforcement samples the actual check clock,
with `checkedAtMs`, `iatSeconds`, and safe `observedAgeMs = checkedAtMs -
iatSeconds * 1000` (positive means older, negative means future). Clock source
is `configured` or `system`; clock failure reports no fabricated check time.
An enabled freshness override separately labels the `fallback` system clock.
Unsafe millisecond arithmetic is omitted rather than clamped. Persisting or
deduplicating observed differences belongs to the application.

Correlation reuses already-captured records/validator results and adds **no store
reads or replay reservations**. It contains only SHA-256 base64url `subjectRef`
and `sessionRef`, computed from UTF-8 `subject + NUL + subjectIdentifier` and
`session + NUL + logicalSessionIdentifier` respectively (API uses its validated
session claim; record-only exchange preflight uses the code's session handle
until a logical-session snapshot is available). Empty/non-string/over-1024-UTF-16-code-unit identifiers are
omitted. These are pseudonymous correlation references, not anonymity or
authorization credentials. Vault failures are labeled `candidate-session`,
never proof that the caller owns the session. API intermediate/failure events
are `verified-token`, which alone does not prove bound-token possession. Final
original-bound proof admission uses `authenticated` only when every applicable
check passes without overrides; this is before application authorization. An
optional unbound proof or any ignored check does not promote either association.
Login has no session association; logout aliases
can carry only a session reference without a subject.

Application telemetry can join these events with its own request context. For
example, establish a generated request ID in Node `AsyncLocalStorage` before
mounting the vault/authenticator, and capture that ID synchronously in each
observer. Record an allowlisted application user ID separately from the issuer's
subject mapper or successful `onAuthContext` user lookup. A request ID joins the
records without decoding a proof or performing diagnostic-only session reads.
Early proof events precede application lookup/approval; a failed request's
candidate association must never be labeled as the authenticated application user.
The hashed references alone are not a database-user lookup API: an application's
mapped JWT subject can differ from its IdP subject, and session references may be
absent or refer to different handle/lineage claims. Account linking, retention and
bounded persistence remain application-owned. Copy only an explicit log allowlist,
never the Request, auth context, session, profile or entire async-local container.
The [composed application fixture](https://github.com/egose/web-ts-toolkit/blob/main/apps/oidc-vault-dpop-example/test/application-integration.test.ts)
exercises this join together with the issuer, user enrichment, optional session
route, compatible required guards and navigation logout in both transports. Real
top-level browser navigation is covered by the reference app's Chromium/Firefox lane.

### Committed outcomes and observer delivery

`IssueTokenInput.operation` is `exchange` or `refresh`, independent of mutable
request URLs. `OidcVaultTokenOutcomeEvent` generates `token-issued` once for a
validated local issuer result, then `exchange-succeeded` once for exchange.
Issuer-less exchange generates only `exchange-succeeded` with `tokenIssued:
false`; issuer-less refresh generates neither. The commit point is after code
consumption/checked rotation, issuer-output validation, response DTO
materialization, existing refresh post-commit notification, and cookie
preparation, immediately before HTTP writing. It is not a network-delivery
receipt. Issuer/output/rotation validation or rollback failure generates no
success. Correlation is `authenticated` for unbound capability use or fully
checked original-bound proof; bound override acceptance stays `candidate-session`.
Fields are only kind, operation,
correlation, deviceBound, and validated expiresIn/tokenType or tokenIssued.

All new events and nested objects are frozen allowlisted snapshots: **no raw
tokens/proofs, keys/thumbprints/JTIs/nonces, credential-bearing sessions, raw
identifiers, requests/responses, URLs/query strings, profiles/metadata or
arbitrary provider/store/Error text**. Existing private `onError` remains a
separate, richer diagnostic contract with its existing ordering and behavior.

Callbacks are captured at construction and invoked synchronously in production
order; returned promises are **not awaited** and their settlement order is
unspecified. Delivery is best-effort: each dispatcher (per API instance or vault
route/observer) permits at most 32 pending promises and drops excess or synchronous
reentrant calls, without queue, retry or timer. A stalled observer cannot stall
authentication. Throws/rejections are swallowed, never recursively sent to
`onError`, and never undo state or produce unhandled rejections. Use lifecycle
veto hooks for application policy, not these observers; durable audit delivery
requires application-owned bounded persistence.

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

Client error responses keep a stable `{ code, message }` shape and intentionally avoid returning raw provider, store, hook, token issuer, or access-token validator details. Use the core `hooks.onError` to observe the original error object for private server-side logs; the separate API middleware reports its original extraction/validator/proof/nonce/replay/hook errors through its own `onAuthContext`-sibling `onError` option.

## Security Checklist

Use these defaults when deploying the package:

- keep `sessionId` in `sessionStorage` and keep `accessToken` in memory only
- in cookie mode keep the vault handle backend-only, including omitting it from browser-readable JWT/profile claims
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
- include the temporary HttpOnly cookie on POST login/exchange in both transports; their Origin/Referer policy is independent of CORS and DPoP
- protect any app-issued local access token with a short lifetime, such as 5 to 15 minutes
- enforce request-aware DPoP validation at every API accepting bound tokens, with a pinned public origin/path and shared replay service; never retry with the same proof or fall back to Bearer for a bound JWT
- remember DPoP binds a browser profile/key, not a physical device; same-browser XSS can invoke the key, and method/URI proofs do not sign request bodies or query strings
- persist only a non-extractable private CryptoKey/public JWK in IndexedDB and require fresh login on key loss; non-extractability is not XSS protection
- keep logout/revocation and API revocation distinct: bound proof-authenticated logout revokes refresh lineage, while already-issued stateless JWTs survive until expiry unless your validator checks revocation
- disclose opted-in fingerprint collection/retention; recognition is copyable, never PoP, and deterministic hashing is not anonymization
- treat upstream OAuth `expires_in`, local access-token lifetime, and vault-session expiry as separate policies
- use Redis or MongoDB, not the memory store, for production or multi-instance deployments
- monitor `onError` and other hooks so failed callback, refresh, and logout flows are visible in private server logs without returning raw provider, token, store, or hook errors to clients

## Store Packages

- `@web-ts-toolkit/express-oidc-vault-memory-store`
- `@web-ts-toolkit/express-oidc-vault-redis-store`
- `@web-ts-toolkit/express-oidc-vault-mongodb-store`
