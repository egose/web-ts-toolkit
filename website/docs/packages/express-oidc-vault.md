---
sidebar_label: Express OIDC Vault
sidebar_position: 6
---

# `@web-ts-toolkit/express-oidc-vault`

OIDC session middleware for Express with body or cookie session transport and server-side storage of upstream refresh tokens and logout-capable `id_token`s.

## What It Handles

- OIDC login redirect with PKCE, `state`, and `nonce`
- opt-in JSON POST login, HttpOnly browser transaction cookie, and original-key DPoP through callback/exchange/refresh/logout
- callback token exchange and `id_token` validation
- server-side storage of upstream refresh tokens and `id_token`s
- one-time local exchange codes for the frontend callback handoff
- session refresh with session ID rotation
- server-driven upstream logout redirect using stored `id_token`
- OIDC backchannel logout handling via `logout_token`
- request-aware local JWT API authentication with proof/nonce/shared replay enforcement
- separate opt-in generic fingerprint recognition at POST login and before exchange/refresh (change detection, not PoP)

## Installation

```bash npm2yarn
npm install @web-ts-toolkit/express-oidc-vault express
```

For local development and tests, also install the memory store:

```bash npm2yarn
npm install @web-ts-toolkit/express-oidc-vault-memory-store
```

## Requirements

- Express `>=5.0.0` is the runtime peer dependency. TypeScript applications need `@types/express` and `@types/node` as development dependencies.
- Node.js `>=22.12.0`. The published CJS entry (`index.js`) synchronously requires the ESM-only `jose` dependency, which needs Node's `require(esm)` support. That support is enabled by default starting with Node `22.12.0`; earlier Node 22 releases fail to load the CJS root with `ERR_REQUIRE_ESM` unless an experimental flag is passed. Both the CJS (`require`) and ESM (`import`) roots load without experimental flags on every verified runtime (`22.12.0`, `22.18.0`, `22.20.0`, `24.x`, `26.x`).
- TypeScript consumers typecheck with `skipLibCheck: false` under strict `NodeNext`/`Bundler` settings. ESM consumers resolve the `import` declaration condition (`index.d.mts`); CommonJS (`.cts`) consumers resolve the `require` condition (`index.d.ts`). Both include the public Express `req.auth` augmentation. Workspace builds place these files under `dist/`; release packaging moves them to the package root and rewrites metadata accordingly. Consumer imports always use the package name.

## What It Exposes

Main exports:

Use **named imports from the package root** for backend APIs; there is no default export. Browser DTO consumers can use the pure `/wire` type entry.

- `createOidcVaultMiddleware(...)`
- `createOidcVaultAccessTokenMiddleware(...)`
- `createOidcVaultAuthenticator(...)`, `type OidcVaultAuthenticator`
- `OidcVaultInvalidAccessTokenError`, `OidcVaultAuthDeniedError`
- `createOidcVaultJwtAccessTokenValidator(...)`
- route-path and default-value constants such as `DEFAULT_OIDC_VAULT_BASE_PATH`, `OIDC_VAULT_ROUTE_PATHS`, `DEFAULT_OIDC_VAULT_REQUEST_BODY_LIMIT`, and `OIDC_VAULT_URL_ENCODED_PARAMETER_LIMIT`
- public types for sessions, hooks, token issuing, validators, config, and store-provider interfaces (including `OidcVaultConfig`, `OidcVaultSessionInput`, `OidcVaultStoreConflictError`, `OidcVaultExchangeResult`, and `OidcVaultLogoutResult`; curated subset — see the package exports for the full list)
- `type OidcVaultFingerprintRecognitionOptions` for separate opt-in recognition
- `OidcVaultDeviceBindingOptions`, `OidcVaultApiDeviceBindingOptions`, `OidcVaultDpopBinding`, `OidcVaultVerifiedDpopBinding`, proof/nonce options, POST-login DTOs and `OidcVaultTransactionCookieOptions`
- `OidcVaultRequestAwareAccessTokenValidator`, mandatory verified `OidcVaultAccessTokenConfirmation`, `OidcVaultDeviceBindingStoreProvider`, exact/null match inputs, `OidcVaultDpopReplayStore`, revocation context and `OidcVaultDpopReplayCapacityError`

### Browser wire types

Use `import type` from `@web-ts-toolkit/express-oidc-vault/wire` for
`OidcVaultLoginInitiationInput`, `OidcVaultLoginInitiationResult`,
`OidcVaultExchangeResult`, `OidcVaultLogoutResult`, `OidcVaultSessionTransport`,
`OidcVaultTokenIssueResult`, and `OidcVaultUserProfile`. These seven DTOs stay
single-sourced and root-importable by backends. The pure entry has no Express
augmentation or Node types; strict DOM-only Bundler/NodeNext consumers work.
It has both `wire.d.mts` / `wire.d.ts` declaration conditions and empty
`wire.mjs` / `wire.js` runtime entries. The
[browser client](./oidc-vault-dpop-client.md) bundles its needed DTO declarations,
so its consumers need no backend package or Node/Express ambient types.

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
- `trustedOrigins`: browser sources for POST login/guarded exchange in both transports and cookie-authenticated refresh/logout; required when cross-site session cookie transport is enabled

`cookie.httpOnly` is always enforced as `true`. Middleware creation rejects `httpOnly: false` and unsafe cookie names, domains, or paths so untrusted values cannot be serialized into `Set-Cookie` headers. `__Secure-` names require an effectively `Secure` cookie; `__Host-` names additionally require no `cookie.domain` and `cookie.path: '/'`.

Default cookie behavior:

- `name`: `oidc_vault_session`, `path`: `/`, `httpOnly`: `true`, `deploymentMode`: `same-origin`
- `sameSite`: `lax` unless `deploymentMode` is `cross-site`
- `secure`: `true` for HTTPS `backendOrigin`, `sameSite: 'none'`, or `deploymentMode: 'cross-site'`; otherwise `false` as an intentional HTTP local-development policy (set `secure: true` explicitly when terminating TLS upstream of an `http` origin, or `secure: false` explicitly to opt out on HTTPS)
- `SameSite=None` is always serialized with `Secure` because browsers reject `SameSite=None` without it, even with explicit `secure: false`

Cookie-authenticated `refresh` and `logout` requests use a fail-closed CSRF policy for every `SameSite` mode. The request must include an `Origin` header, or a valid `Referer` header, whose origin matches `backendOrigin` or one of the configured `trustedOrigins`. Requests with no source-origin header are rejected. Backchannel logout is not affected because it is authenticated with the signed OIDC logout token rather than the browser session cookie.

Session transport and binding mode are independent. POST login and guarded exchange need the **temporary transaction cookie even in body transport**. The session cookie starts at successful exchange. Same-site subdomains can use Lax with credentialed cross-origin fetch; cross-origin does not itself mean cross-site. Cross-site SPAs need HTTPS `transactionCookie: { sameSite: 'none' }`, compatible session-cookie policy, credentialed CORS and browser cookie permission.

## Endpoints

The middleware exposes these routes under a configurable base path such as `/auth/oidc`:

- `GET /auth/oidc/login`
- `POST /auth/oidc/login` when `deviceBinding` or `fingerprintRecognition` is configured (JSON initiation)
- `GET /auth/oidc/callback`
- `POST /auth/oidc/exchange`
- `POST /auth/oidc/refresh`
- `POST /auth/oidc/logout`
- `POST /auth/oidc/logout/navigation` and `GET /auth/oidc/logout/navigation` when `logoutNavigation` is configured (JSON initiation, then one-time navigation)
- `POST /auth/oidc/backchannel-logout`

The OIDC router parses JSON and `application/x-www-form-urlencoded` request bodies with an explicit default limit of `16kb`. This is enough for the small `exchange`, `refresh`, `logout`, and backchannel logout payloads. Opt-in POST login accepts only `application/json`; other media types return `415 OIDC_VAULT_UNSUPPORTED_REQUEST_BODY_TYPE` before general parsing. If an IdP requires a larger form-encoded `logout_token`, set `requestBodyLimit` to a string or byte count accepted by Express body parsers.

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
    sessionTtlMs: 8 * 60 * 60 * 1000, // Opt in to an eight-hour absolute session lifetime.
  }),
);
```

Use the memory store for local development and tests. For production deployments, use the Redis or MongoDB store package.

`backendOrigin` must be the public backend origin registered with your OIDC provider, such as `https://api.example.com`. Callback `redirect_uri` values are built from this pinned origin and the configured `basePath`, so reverse proxies and untrusted `Host` headers cannot change the provider callback URL. Configure Express `trust proxy` only for other request metadata needs; it is not used to derive the OIDC callback origin.

`postLogoutRedirectUri` is optional and provider-registered; it may be on another origin. Redirected logout and opt-in logout navigation use it. Navigation additionally applies the stricter syntax and length rules below.

After original live/alias lineage identity and required proof/nonce/replay checks, local logout (`redirect` unset or `false`) never contacts the provider: it revokes the local lineage, clears the cookie under cookie transport, delivers `onLogout` for a live handle, and returns `200 { loggedOut: true }`. Redirected live logout commits that local result before best-effort upstream discovery/redirect; failure or a missing endpoint falls back to local success with private `onError`. Built-in alias-only logout authenticates the surviving lineage's key/provider using `getSessionRevocationContext`, then revokes without live-session hooks or upstream credentials. No currently live target is idempotent success without deletion/proof reservation/hooks; the selected transport's handle/cookie is still required. A proof/identity mismatch leaves the lineage/cookie untouched. Stateless JWTs are not revoked.

Every vault response carries `Cache-Control: no-store`, including parser errors. Legacy `Pragma`/`Expires` are unnecessary. The opt-in `/logout/navigation` route additionally carries `Referrer-Policy: no-referrer`; other routes retain their existing header policy. These headers do not clear history, disable proxy logging, strip callback `?code=` (use frontend `history.replaceState`), or hide protocol-required URL values from the navigation target. Assert both transports' response headers in integration tests.

## Public Options And Defaults

| Option                          | Default                                    | Contract                                                                                                                                                                                                                                           |
| ------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `basePath`                      | `/auth/oidc`                               | Mount path for the OIDC router.                                                                                                                                                                                                                    |
| `backendOrigin`                 | required                                   | Public backend origin registered with the provider. Callback redirect URIs are derived from this pinned origin, not request host headers.                                                                                                          |
| `storeProvider`                 | required                                   | Durable vault store provider. Use Redis or MongoDB for production and multi-instance deployments.                                                                                                                                                  |
| `config`                        | required provider values                   | Supply `issuer` and `clientId`, or use `resolveOidcVaultConfigFromEnv(process.env)`. Endpoint settings select manual mode; see Config Modes.                                                                                                       |
| `frontendRedirectUri`           | unset                                      | Default browser return target after backend callback completion. Required if login accepts custom `returnTo`. Validated before durable callback state; missing destination fails the callback with `500 OIDC_VAULT_MISSING_FRONTEND_REDIRECT_URI`. |
| `postLogoutRedirectUri`         | unset                                      | Provider-registered return URL for redirected logout and opt-in navigation. Navigation applies stricter syntax/2048-byte checks; upstream failures retain local logout.                                                                            |
| `fetchUserInfo`                 | enabled when usable                        | Fetches UserInfo if an endpoint exists and the response supplies an access token; false disables it. Claims merge only after matching subject.                                                                                                     |
| `authorizationTransactionTtlMs` | `600000`                                   | TTL for one-time authorization transactions created during login.                                                                                                                                                                                  |
| `exchangeCodeTtlMs`             | `30000`                                    | TTL for one-time local exchange codes returned to the frontend callback route.                                                                                                                                                                     |
| `sessionTtlMs`                  | unset                                      | Opt-in positive safe-integer lifetime in milliseconds from callback session creation. Hooks may shorten it; refresh never extends it.                                                                                                              |
| `sessionTransport`              | `body`                                     | `body` returns and accepts JSON `sessionId`; `cookie` stores the session pointer in an `HttpOnly` cookie and rejects body-only refresh/logout IDs.                                                                                                 |
| `cookie`                        | default cookie settings                    | Cookie transport options. `httpOnly` is always enforced as `true`; unsafe names, paths, domains, and `__Secure-`/`__Host-` prefix violations are rejected.                                                                                         |
| `deviceBinding`                 | disabled                                   | Vault DPoP policy; object defaults to optional. Selects the key at POST login and enforces it through callback/exchange/refresh/logout; API enforcement is separate.                                                                               |
| `logoutNavigation`              | disabled                                   | Proof-authorized JSON logout and headerless continuation. Required fallback, default `ticketTtlMs: 60000` (1000..120000), default namespace label `default`. Requires DPoP and ticket-store capabilities.                                          |
| `fingerprintRecognition`        | disabled                                   | Separate opt-in recognition; `headerName` defaults to `X-Device-Fingerprint`. POST-only enrollment, precommit exchange/refresh comparison, fresh login on change; never PoP or an API sender constraint.                                           |
| `transactionCookie`             | HTTPS `__Host-oidc_vault_transaction`, Lax | Temporary cookie independent of session transport. Only name and SameSite lax/none are configurable; HTTP default name is oidc_vault_transaction.                                                                                                  |
| `trustedOrigins`                | `[]` plus `backendOrigin` internally       | POST-login/guarded-exchange sources in both transports, plus cookie refresh/logout. Required for cross-site session cookies.                                                                                                                       |
| `requestBodyLimit`              | `16kb`                                     | Express JSON and URL-encoded parser limit for OIDC route bodies. Increase only for known provider backchannel logout token size needs.                                                                                                             |
| `providerRequestTimeoutMs`      | `5000`                                     | Deadline per provider HTTP exchange (headers plus complete body). Cancellation is attempted without awaiting cleanup. Positive finite integer; validated before cache lookup.                                                                      |
| `hooks`                         | unset                                      | Pre-commit hooks can veto operations by throwing; post-commit notification hook failures are reported to `onError` without undoing committed state.                                                                                                |
| `tokenIssuer`                   | unset                                      | Issues app-local access tokens for `exchange` and `refresh`. This lifetime is separate from upstream token and vault-session lifetimes.                                                                                                            |
| `now`                           | `Date.now`                                 | Epoch-millisecond clock for TTL and vault proof/nonce/replay checks; shared policy/store clocks must agree.                                                                                                                                        |

Construction takes an internal resolved snapshot without mutating caller options. Cookie/config/trusted-origin containers are copied; transaction-cookie, fingerprint and DPoP policies/allowlists are detached/frozen, and nonce bytes are privately copied. Store/hooks/issuer/clock services remain shared references. Frozen/reused inputs work. Config itself is optional in the type, but issuer/clientId or the complete manual set is required by construction. Vault and API deviceBinding must be configured independently.

## DPoP: complete local JWT and API configuration

Install the core, a store, Express, and your application's CORS dependency (`cors`; TypeScript also needs `@types/express`, `@types/node`, `@types/cors`). This development-memory example matches the shipped README. Set OIDC issuer/client values and a stable strong random APP_JWT_SECRET encoding at least 32 bytes; register **https://api.example.com/auth/oidc/callback**, serve HTTPS at that public origin and preserve the vault mount path.

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

The issuer helper captures verified `IssueTokenInput.deviceBinding.jkt`, never mutable profile/session fields, and automatically selects DPoP/Bearer. Local HS256 signing is independent of asymmetric ES256 proof signing. The JWT contains no vault handle/`sid`, preserving the HttpOnly boundary when using cookie mode. Keep authorization application-owned and use a shared Redis/Mongo provider in production. No tokenIssuer is also supported: binding is enforced, but no local token fields are emitted.

### Modes, defaults and migration

| Vault policy    | New login                                                            | Existing records                                                                     |
| --------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Omitted         | Legacy unbound GET; POST only if recognition configured              | Unbound compatible, bound fails closed                                               |
| `{}` / optional | GET unbound; JSON POST binds from valid proof, otherwise cookie-only | Legacy unbound permitted; later proof never enrolls                                  |
| required        | JSON POST with proof; GET rejects before discovery/allocation        | Unbound transaction/code/session rejects; original key required on bound credentials |

There is **no legacyPolicy/downgrade switch**. Configure proof-aware clients, issuer and all API acceptance points before selecting required. Disabling DPoP never converts bound sessions/JWTs into Bearer. The persisted binding is only `{ type: 'dpop', jkt }` (canonical RFC 7638 SHA-256 thumbprint), without JWK/algorithm/mode; hooks/mappers cannot strip/rebind it. Algorithms are checked against current policy on every request.

Defaults: ES256/P-256, proof age **60s** (integer 1–300), skew **5s** (integer 0–30), nonce **off**. Explicit PS256/RS256 use RSA 2048–4096 bits. Reject private/symmetric/remote keys and unsupported critical headers. Bounds: proof **8192 bytes**, decoded protected header/JWK **2048 bytes**, JTI **1–128 printable ASCII bytes**, nonce **512 bytes**. Signed iat is a nonnegative integer with `nowSeconds - age - skew < iat <= nowSeconds + skew`. Reject raw duplicate/comma-joined Authorization/DPoP; sign a new proof with at least 128 random JTI bits on every attempt.

### POST login, cookie-authenticated callback and original-key vault requests

JSON **POST &lt;basePath&gt;/login** takes `{ returnTo?: string }` and returns only `200 { authorizationUrl }`; navigate after persisting the key. Body/query JWK/jkt shortcuts cannot bind. Optional absent proof creates a cookie-only transaction; invalid supplied proof rejects. GET never selects a key. ReturnTo is body-only and remains on the configured frontend origin.

POST login/guarded exchange validate Origin (valid Referer fallback only when Origin is absent) in **both transports**, rejecting missing/null/duplicate/untrusted sources. After source/body checks, proof/nonce/replay precede discovery/hooks/allocation. Callback is headerless: state and the temporary cookie hash authenticate the original record, atomically matched before upstream exchange/session/code creation. PKCE/state/OIDC nonce remain unchanged. Missing/wrong cookies do not spend or clear; authenticated terminal provider-error callbacks consume/clear with fixed callback-error JSON.

The fresh **32-byte** transaction secret is HttpOnly, host-only, Path=/, Secure on HTTPS, default Lax; HTTPS name `__Host-oidc_vault_transaction`, HTTP `oidc_vault_transaction`. Only name/lax-or-none are configurable; None requires HTTPS. No Domain/path/Strict/HttpOnly/Secure opt-out. Session/transaction names must differ; multiple mounts need distinct names. Duplicate/malformed/noncanonical selected cookies reject; unrelated malformed cookies are ignored. One pending flow per browser/mount: new initiation replaces the cookie. Its deadline rounds down to the transaction TTL (default 10m), then callback shortens it to the code TTL (30s). Successful exchange/authenticated terminal issuance failure clears it; mismatches/nonces do not. Abandoned records/cookies expire.

| POST route | Body/credentials/proof                                                                        | Result                                                                                                 |
| ---------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| exchange   | `{ code }`, temporary cookie/include in both modes, source check, original-key proof          | Credential/profile result; body includes sessionId, cookie sets its session cookie and omits sessionId |
| refresh    | Body `{ sessionId }` or cookie `{}`/include, original-key proof; cookie source check          | Rotated handle, same key/lineage/subject/absolute expiry                                               |
| logout     | Same handle/cookie and proof, no fingerprint requirement; redirect true only for live handles | Local success or best-effort upstream redirect after revocation                                        |

Vault proofs require **no access-token Authorization or ath**, so refresh/logout work after local JWT expiry. Optional supplied proofs validate/nonces/reserve without enrolling legacy records. Identity/cookie/recognition/key preflight precede atomic consumption/upstream use; atomic returned code/session authority is rechecked. Wrong/stale/replayed proofs preserve honest records/upstream refresh tokens. Browser proofs never go upstream: this milestone constrains local JWTs/vault sessions; IdP tokens/UserInfo remain Bearer/server-held.

## Optional Fingerprint Recognition (Not PoP)

`fingerprintRecognition?: OidcVaultFingerprintRecognitionOptions` is a separate opt-in browser recognition/change-detection policy. **Fingerprint matching is recognition/change detection, not theft prevention against deliberate copying.** FingerprintJS `visitorId` or another browser-computed identifier is copyable/spoofable, does not prove private-key possession or identify a physical device, and never satisfies `deviceBinding.mode: 'required'`. The backend has no FingerprintJS dependency.

Use named package-root imports and one of the built-in guarded stores:

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
  storeProvider: createMemoryOidcVaultStore(), // Development; shared Redis/Mongo in production.
  fingerprintRecognition, // Or { headerName: 'X-App-Browser' }.
  sessionTtlMs: 8 * 60 * 60 * 1000,
  // Add deviceBinding: { mode: 'required' } for cryptographic sender constraint.
});
```

- **Header:** default `X-Device-Fingerprint`; custom names must be valid HTTP field names without auth/cookie/origin/content/transport collisions, case-insensitively. Exactly one raw field, **nonempty printable ASCII, max 256 bytes**. The opaque server-observed value is not trimmed, case-folded, comma-split or normalized by core. Malformed/duplicate/oversized opted-in signals return **400 `OIDC_VAULT_INVALID_FINGERPRINT` / `Fingerprint signal is invalid.`** before credential work. Omitted configuration means no capture/check.
- **Login-only enrollment:** JSON POST login alone captures a supplied signal; absence intentionally leaves the session unenrolled. Legacy/GET login stays unenrolled even with a header, provider/profile claim or later exchange/refresh signal. Fingerprint-only POST is unbound and rejects a supplied DPoP header while DPoP is disabled; it still requires trusted Origin/Referer and the single temporary HttpOnly transaction cookie in both body/cookie session transports. All six guarded-store capabilities are checked at construction. The headerless callback authenticates the cookie and copies the original transaction evidence to the original new session.
- **Precommit matching:** enrolled exchange/refresh compare the original signal **before proof/nonce/replay, guarded consume, upstream refresh-token use or rotation**. Missing/mismatch returns **403 `OIDC_VAULT_FINGERPRINT_REAUTH_REQUIRED` / `Browser recognition changed; sign in again.`** without spending the code/provider token, rotating/revoking the session, or setting/clearing cookies. Clear frontend auth state and start fresh POST login. No tolerance, automatic re-enrollment or recognition rotation occurs at exchange/refresh. Fresh login creates a new session/value; an earlier session remains until explicit revocation or expiry.
- **Reserved private metadata:** SHA-256 canonical base64url is carried in `transaction.metadata.oidcVaultFingerprintRecognition`, then `session.metadata.oidcVaultFingerprintRecognition = { version: 1, hash }`. Hooks/profile claims cannot strip/rebind it or enroll an absent value. Core stores no raw signal, removes recognition evidence from public user/credential responses and token-issuer session input, and logs neither raw signals nor hashes. Use allowlisted token claims and exclude fingerprint headers/reserved metadata from hook/application/proxy logs.
- **Logout/API:** recognition checks apply only to exchange/refresh; live/alias logout and signed backchannel logout retain their existing rules. A changed fingerprint does not prevent revocation; bound logout still requires its original DPoP key. Aliases contain no recognition metadata and do not authenticate refresh. Fingerprint-only local tokens remain `Bearer`; API recognition/risk policy is application-owned. DPoP tokens still need request-aware proof enforcement at every API.

### Frontend adapter and wire flow

Collect in the frontend and inject a current signal source. Send its header on each POST login/exchange/refresh; an intentional `undefined` means unenrolled, while collection failures should stop the operation rather than silently omit an enrolled check. Login/exchange always use `credentials: 'include'` for the temporary cookie; cookie refresh does too. Bodies are `{ returnTo?: string }`, `{ code }`, and body `{ sessionId }` or cookie `{}` respectively. Navigate to login's validated `200 { authorizationUrl }`; the callback is headerless. Obtain the current signal each operation instead of persisting a login-time identifier that would hide changes. Recognition 403 requires fresh login, not a retry loop.

The published browser client [@web-ts-toolkit/oidc-vault-dpop-client](https://github.com/egose/web-ts-toolkit/blob/main/packages/oidc-vault-dpop-client/README.md) ships this generic adapter, not a backend export:

```ts
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
// Agent shape: { get(): Promise<{ visitorId: string }> }.
// Await recognition.headers() for each login/exchange/refresh.
```

Its generic `createDeviceFingerprint(source, { headerName? })` is vendor-independent. The optional FingerprintJS adapter lazily shares load but calls get() each operation, caches/persists no identifier, bounds signals, and emits fixed errors. [The shipped README](https://github.com/egose/web-ts-toolkit/blob/main/packages/express-oidc-vault/README.md#optional-fingerprint-recognition-not-pop) includes a self-contained generic snippet. The private app integrates recognition through real login/callback/exchange/refresh and current-recognition cookie-tab checks.

CORS must allow `Content-Type`, the configured fingerprint header, explicit trusted origins and credentials; with DPoP also allow `Authorization`/`DPoP` and expose `DPoP-Nonce`/`WWW-Authenticate`. Cross-site SPAs may require HTTPS `transactionCookie: { sameSite: 'none' }`; browser third-party-cookie restrictions still apply.

### Privacy and retention

Disclose collection, matching purpose, transaction/session retention and fresh-login behavior on change. Hashing is **not anonymization**: stable/low-entropy identifiers and deterministic hashes remain correlation data that can be copied or guessed. Keep raw headers out of application/proxy logs. The hash exists in the pending transaction (default 10-minute TTL), then lasts with the vault session through refresh, independent of local JWT/upstream access-token expiry. Configure `sessionTtlMs` or an application/store lifetime; unset assigns no default session expiry. Account for physical store cleanup and backup retention after logical expiry/deletion. Abandoned transactions expire; session logout/revocation follows store deletion/cleanup policy. The frontend utility stores no identifier.

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

### Persistent-key DPoP SPA example

Install the [published browser client](./oidc-vault-dpop-client.md) in your
frontend for body or cookie sessions. It includes persistent keys, POST
login/exchange/refresh/logout, bounded HTTP/nonce handling and scoped API fetch.
Use named root exports: `createOidcVaultDpopSession`, `fetchWithDpop`,
`getOrCreateDpopKey`, `createDpopProof`, `DpopNonceCache` and the recognition/error
APIs. The backend's shipped [quickstart](https://github.com/egose/web-ts-toolkit/blob/main/packages/express-oidc-vault/README.md#browser-dpop-client)
pairs with its complete server; this configuration pairs with the runnable app:

```ts
import {
  createOidcVaultDpopSession,
  fetchWithDpop,
  OidcVaultDpopClientError,
} from '@web-ts-toolkit/oidc-vault-dpop-client';

const backendOrigin = 'http://127.0.0.1:4318';
const session = createOidcVaultDpopSession({
  backendOrigin,
  basePath: '/auth/oidc/body',
  sessionTransport: 'body',
  requestTimeoutMs: 15_000,
  maxResponseBytes: 1_048_576,
}); // Cookie: basePath '/auth/oidc/cookie', sessionTransport 'cookie'.

export const signIn = (): Promise<void> => session.login('/callback?transport=body');

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
    throw error;
  }
}

export async function getBoundProfile(signal?: AbortSignal): Promise<unknown> {
  const response = await fetchWithDpop(
    { session, apis: [{ origin: backendOrigin, pathPrefix: '/api', replayNamespace: 'oidc-vault-dpop-example-api' }] },
    `${backendOrigin}/api/profile`,
    { signal },
  );
  if (!response.ok) throw new Error('Protected API request failed.');
  return response.json();
}
export const signOut = (): Promise<void> => session.logout();
// With server logoutNavigation enabled:
export const signOutThroughProvider = (): Promise<void> => session.logoutAndNavigate();

export async function recoverBrowserKey(): Promise<void> {
  await session.resetKey(); // Explicit recovery action for an unusable persisted key.
  await signIn();
}
```

Repository commands: pnpm --filter oidc-vault-dpop-example dev:server and, in another terminal, pnpm --filter oidc-vault-dpop-example dev; open **127.0.0.1:4317/?transport=body** or cookie. The local fixture IdP is 4319; backend 4318, two public mounts /auth/oidc/body and /auth/oidc/cookie. Your own core default mount is /auth/oidc. Match frontend/server mounts/origins and API replayNamespace exactly.

Login creates a non-extractable P-256 key in IndexedDB before navigation, scoped
by frontend/backend/basePath, with atomic first-key-wins. Key loss/change needs
fresh login; an existing corrupt key needs explicit reset-then-login. Tokens
remain memory-only; handles/pending login are tab-local sessionStorage or backend
HttpOnly cookies. Both transports use FIFO mutations and refresh coalescing until
an intervening mutation. Cookie mode adds Web Locks/BroadcastChannel and a 180 ms
peer wait. `clear` invalidates local auth/owned HTTP but keeps the key; `dispose`
closes a context while keeping committed reload state; `resetKey` removes only
the scoped key/metadata. Await clear/reset before teardown if persistence must
finish. `logout` and `logoutAndNavigate` request server revocation. Reset cannot revoke old
sessions/JWTs or remove HttpOnly cookies; other sessions sharing the key need login.

Each attempt signs a fresh proof/JTI, with API-only `ath`. API scopes use the
longest normalized segment `pathPrefix`; omission or `/` is origin-wide.
Unreserved path escapes/dots normalize in both outbound URL and proof, reserved
separators stay encoded, and query data is preserved. Independent gateway
services need distinct replay namespaces. Valid response nonces teach the
64-tuple oldest-remembered cache even on success/single-attempt requests. Vaults
retry a usable nonce once then throw non-terminal `DPOP_NONCE_RETRY_EXHAUSTED`;
retry-enabled APIs allow one nonce retry and one `invalid_token` refresh budget.
Mutations remain single-attempt unless the operation owns a server idempotency
contract. Final API responses are caller-owned. Terminal session/key/browser/
recognition errors require login; proof/nonce/transient failures retain auth,
and unknown vault codes become `OIDC_REQUEST_FAILED`, not a generic 401 logout.

Vault HTTP defaults to **15,000 ms** through headers/body/JSON and **1 MiB** of
streamed bytes. Queue/storage/crypto/recognition/other locks are outside that
deadline; timers cannot preempt synchronous work or suspended tabs. API/proof
signals stop the caller's wait without cancelling shared refresh or already-
started crypto. API bodies are caller-owned. Abort/timeout is not rollback of
server mutation/Set-Cookie; a lost body-handle rotation can require fresh login.
There is no automatic timeout/network mutation retry. A zero-lifetime refresh
keeps its handle but API use stops with non-terminal `DPOP_ACCESS_TOKEN_EXPIRED`.

CORS must allow explicit frontend origins/credentials and
Content-Type/Authorization/DPoP/configured fingerprint; expose
DPoP-Nonce/WWW-Authenticate. Vault Origin checks remain independent. Recorded
Chromium/Firefox checks use same-site loopback; Safari/WebKit and arbitrary
cross-site HTTPS/third-party-cookie deployments need their own verification.
Browser locks coordinate one frontend origin/partition/scope, not distributed
backend refresh leases. The [shipped guide](https://github.com/egose/web-ts-toolkit/blob/main/packages/oidc-vault-dpop-client/README.md)
contains full defaults, errors, recovery and upgrade notes.

### Default unbound bearer frontend

The intended frontend model is:

- `accessToken` stays in memory
- `sessionId` is mirrored into `sessionStorage`
- refresh calls are deduplicated so concurrent `401` responses do not race session rotation

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
```

For cross-origin cookie deployments, also remember:

- the frontend requests must use `credentials: 'include'`
- the backend CORS policy must allow credentials
- same-site subdomains can use Lax; truly cross-site requests need SameSite=None; Secure and browser cookie permission
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
redis.on('error', () => console.warn('OIDC vault Redis connection error.'));
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
const storeProvider = createMongoOidcVaultStore({ db: mongo.db('app-auth') });
await storeProvider.ready();

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
});
```

### Cookie Transport

```ts
import { createClient } from 'redis';
import { createRedisOidcVaultStore } from '@web-ts-toolkit/express-oidc-vault-redis-store';

const redis = createClient({ url: process.env.REDIS_URL });
redis.on('error', () => console.warn('OIDC vault Redis connection error.'));
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
});
```

Only set `cookie.domain` (for example `.example.com`) as an advanced expansion when sibling subdomains must share the credential. Sharing widens the credential trust boundary and is not required for normal cross-origin API requests.

## Config Modes

The package supports issuer discovery and manual endpoint configuration.

Use `resolveOidcVaultConfigFromEnv(process.env)` to read the documented environment variables, or supply `config` explicitly to `createOidcVaultMiddleware`. `clientId` / `OIDC_CLIENT_ID` is always required; `scopes` / `OIDC_SCOPES` defaults to `openid email profile`.

### Issuer mode

With `issuer` and `clientId` but no endpoint settings, discovery resolves the provider endpoints. The configured issuer identifier is preserved exactly after surrounding-whitespace trimming (no trailing slash is added; `/tenant`, `/tenant/`, and `/tenant//` are distinct) and the discovered issuer must exactly equal it without additional trimming. Issuers must be absolute http(s) URLs without userinfo, query, or fragment; `http` is accepted for local-test providers.

Discovery may omit `userinfo_endpoint` and `end_session_endpoint`. If present, each must be a nonempty absolute HTTP(S) URL string. Null, arrays, objects, numbers, booleans, blank strings, malformed URLs, and non-HTTP(S) URLs invalidate metadata with HTTP 502 / `OIDC_VAULT_DISCOVERY_INVALID`, identifying the field without echoing its value. Failed metadata is evicted so later requests can fetch corrected metadata; only validated successes are shared across timeout policies. During redirected logout, discovery errors instead reach `onError` while local revocation still succeeds; local-only logout does not discover metadata.

Provider discovery metadata and remote JWKS resolvers are cached in bounded process-wide maps. Discovery fetches are isolated by `(issuer, providerRequestTimeoutMs)` so differing instance policies never inherit each other's deadline, while settled successful metadata is additionally shared across timeouts for reuse. JWKS resolvers are isolated by `(jwks_uri, providerRequestTimeoutMs)` because JOSE fixes the fetch timeout at creation. These keys are intended to come from static middleware configuration, not request input. Successful discovery entries are reused for up to 10 minutes and both discovery and JWKS resolver maps retain at most 32 entries with oldest-entry eviction. Failed discovery requests evict only the owning policy entry so a later request can retry. Timeout options are validated before any cache lookup, so cached entries cannot bypass option validation.

Discovery, token, UserInfo, and remote JWKS HTTP requests use a 5 second default deadline covering response headers plus complete success/error body consumption; stalled or slow bodies fail with sanitized endpoint-specific timeout errors. Cancellation is attempted promptly without awaiting its promise, so an uncooperative custom stream cannot hold up error delivery through pending cleanup. Request completion does not guarantee completed resource cleanup; the hanging-cancellation evidence uses custom streams, with no native-undici remote exploit established. Upstream redirects are never followed. Set `providerRequestTimeoutMs` to a positive integer number of milliseconds to change the bound. JWKS documents additionally enforce 1 MiB and 100-key limits. Provider response parse errors return sanitized client messages; oversized or malformed bodies are not returned to callers.

Pre-header network rejection and mid-body transport reset return HTTP 502 with `OIDC_VAULT_DISCOVERY_FAILED`, `OIDC_VAULT_TOKEN_REQUEST_FAILED`, or `OIDC_VAULT_USERINFO_FAILED` and message `OIDC provider request failed.` JWKS transport failures use `OIDC_VAULT_JWKS_FAILED`; JOSE timeouts retain `ERR_JWKS_TIMEOUT`. Discovery success-body timeout/size/JSON failures retain `OIDC_VAULT_DISCOVERY_INVALID`. Original transport diagnostics are privately available as `hooks.onError` context `error.cause` (narrow the unknown error before reading it); they are not browser payload fields.

### Manual mode

Any nonempty endpoint (`authorizationEndpoint`, `tokenEndpoint`, `jwksUri`, `userInfoEndpoint`, or `endSessionEndpoint`) selects manual mode with no discovery. Optional endpoints are not partial discovery overrides. This also applies to the environment variables:

- `OIDC_AUTHORIZATION_ENDPOINT`
- `OIDC_TOKEN_ENDPOINT`
- `OIDC_USERINFO_ENDPOINT`
- `OIDC_JWKS_URI`
- `OIDC_END_SESSION_ENDPOINT`

Undefined, empty, and whitespace-only config/env strings are absent after trimming. Manual mode requires the complete set listed below, even if only `OIDC_USERINFO_ENDPOINT` or `OIDC_END_SESSION_ENDPOINT` selected it. Complete manual configuration preserves valid optional endpoints. `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, and `OIDC_SCOPES` still apply; `issuer` binds ID and logout tokens to the exact expected issuer.

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
- Discovery, token, and UserInfo JSON bodies must be non-null, non-array objects; valid non-object JSON is a controlled 502 provider error.
- Non-success token/UserInfo responses normally surface sanitized 502s; rejected upstream redirects never become browser-facing 3xx. A complete bounded HTTP-400 JSON `error: 'invalid_grant'` specifically for a refresh-token grant returns **401 `OIDC_VAULT_REFRESH_REJECTED` / `OIDC refresh was rejected. Sign in again.`** when its local record is still current. This indicates rejection (expiry, revocation or reuse), not proven expiry. Replaced records, other grants/statuses, `invalid_client`, malformed bodies and outages retain generic non-terminal provider failures. This adds no cookie clearing or lineage deletion and is not a distributed lease.
- Updated browser clients recognize that new code as sign-in-required; old clients sanitize the unknown code as non-terminal, and old servers still return generic errors. Never infer logout from every provider failure or HTTP 401.
- Present `access_token`/`id_token`/`refresh_token` fields must be non-empty strings and a present `scope` must be a string; malformed present fields are rejected rather than treated as omissions. Callback responses additionally require `id_token` and `refresh_token`, and no session is persisted until all provider checks pass. The callback destination (transaction `returnTo` or `frontendRedirectUri`) is validated before any provider call or durable session/code creation and fails with `500 OIDC_VAULT_MISSING_FRONTEND_REDIRECT_URI` when neither is configured, so a missing destination cannot strand credentials.
- Upstream OAuth `expires_in` describes the upstream access token only. It does not set `OidcVaultSession.expiresAt` or shorten the refresh-token-backed vault session.
- `OidcVaultSession.expiresAt`, assigned by `sessionTtlMs`, application code, or store policy, is an explicit vault-session expiry in epoch milliseconds and remains enforced by store providers.
- ID tokens must include `sub`, `exp`, and `iat`.
- ID-token `azp` must equal `clientId` when present and is required for multi-audience ID tokens.
- UserInfo responses must be objects including a `sub` matching the verified ID-token subject before claims are merged; JSON `null` never bypasses the subject check.
- Refresh responses may omit `id_token`, `refresh_token`, `access_token`, and `scope`; omitted fields retain their current session values (an omitted `id_token` keeps the existing verified identity without revalidating the stored token). If refresh returns a new `id_token`, its `sub` must match the current session subject, and no rotation happens until all provider checks pass.
- Refresh profile precedence: fresh verified ID claims are the base when a new `id_token` is present, freshly fetched matching UserInfo overlays whichever base applies, and the retained profile is used only when no new `id_token` arrives (fresh UserInfo still overlays the retained base per key). Retained values are never merged over fresh claims and are never treated as fresh UserInfo. Claims absent from the fresh sources are dropped when fresh identity arrives, so removed provider claims disappear; keep application custom attributes in `session.metadata`, not in `user`, because application-added `user` keys are not carried forward across a fresh identity refresh.

## Local Access Token Example

Provide `tokenIssuer` if you want `exchange` and `refresh` to return an app-issued local access token.

This is the default unbound Bearer example. Bound JWTs use the complete DPoP configuration above. The helper omits vault handles from JWTs in both transports; application claims are explicitly allowlisted.

```ts
import { createOidcVaultMiddleware, createOidcVaultJwtAccessTokenIssuer } from '@web-ts-toolkit/express-oidc-vault';
import { createMemoryOidcVaultStore } from '@web-ts-toolkit/express-oidc-vault-memory-store';

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
});
```

That local access token is separate from the upstream IdP token. The upstream refresh token stays only in the server-side vault.

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

- `accessToken`: nonempty opaque string for unbound issuance, returned verbatim without trimming; bound issuance requires the profile below;
- `expiresIn`: finite nonnegative safe-integer seconds; bound issuance also requires a safe `expiresIn * 1000` conversion;
- `tokenType`: exact Bearer or DPoP. Unbound permits Bearer or omission (undefined stays absent in JSON); bound requires exact DPoP and compact signed JWT with matching cnf.jkt from the verified IssueTokenInput.deviceBinding. Null/lowercase/whitespace variants and bound Bearer output are invalid.

The **bound local-JWT profile** requires three nonempty canonical unpadded
base64url segments, a signing `alg` other than `none`, no `b64: false`, exactly
`cnf: { jkt }` matching the canonical RFC 7638 SHA-256 thumbprint, and mandatory
nonnegative safe-integer `exp` epoch seconds with safe `exp * 1000`. Unsupported
confirmation extensions and unsafe/missing expiry fail. Both JWT validator
methods enforce the profile after JOSE verification and before `mapClaims`;
generic unbound JWT optional-exp behavior and opaque issuance remain compatible.

`expiresIn: 0` remains valid and can deliver a rotated handle/cookie, but no live
reusable API/peer credential. Browser parsing validates clock/conversion/addition
before capping the response deadline by JWT expiry; expired peers are ignored.
These decode-only checks are response-contract validation, not JWT authentication.

Only these three fields are copied once into a fresh result. Extra fields (including upstream tokens, `metadata`, `sessionId`, `user`, and `toJSON`) are ignored without evaluating their getters. The vault supplies the response session ID/profile: body transport includes `sessionId`, cookie transport omits it, and `user` is the session profile. Omitting `tokenIssuer` is supported and returns no local token fields.

Malformed results return HTTP 500 with `{"code":"OIDC_VAULT_INTERNAL_ERROR","message":"Unexpected OIDC vault error."}` inside issuance rollback: the logical lineage is revoked and cookie transport clears its cookie instead of minting one. Exchange has already consumed its code; refresh has already contacted the provider and rotated the handle, and its success notification does not run. Correct the issuer and start a new login. Field-specific diagnostics are the original `hooks.onError` context `error` (narrow it before use); allowed-field getter exceptions also enter rollback.

Core decodes trusted issuer output only to check the bound-token contract; APIs independently verify JWT signature/issuer/audience/expiry. Local signing algorithms and proof algorithms are independent. Issuers receive owned session/plain containers with reserved recognition evidence omitted; original key/lineage rollback authority survives mutable hooks/issuer calls. This contains accidental extensions, while issuers/hooks remain trusted code with request/response access. Deliberate secrets in allowed fields are not redacted.

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
- Optional API authentication is additive: `authentication` defaults to `required` and `invalidCredentials` to `reject`, independently of binding mode. Mount one `createOidcVaultAuthenticator` instance for enrichment and guards, replacing response interception/repeated authentication. Empty/duplicate/comma-joined/non-ASCII Authorization credentials are rejected on the legacy path too. Custom adapters enabling anonymous fallback deliberately throw `OidcVaultInvalidAccessTokenError` for rejected credentials; unknown exceptions retain their existing strict failure response.
- Browser DTO type imports can use the pure `@web-ts-toolkit/express-oidc-vault/wire` entry. Backend root type imports and strict ESM/CJS `req.auth` augmentation are preserved. The companion client now ships DOM-only declarations and requires Node >=22.12.0 for CJS tooling.
- Bound JWTs now require exact canonical `cnf.jkt`, canonical compact encoding and safe mandatory `exp` seconds; bound `expiresIn` must convert safely to milliseconds. Invalid output fails with sanitized HTTP 500/original-lineage rollback. Both validator paths reject invalid bound profiles before mapping; generic unbound/opaque and zero-lifetime output compatibility remain.
- Use the published client in place of the former standalone browser implementation. See its [upgrade notes](https://github.com/egose/web-ts-toolkit/blob/main/packages/oidc-vault-dpop-client/README.md#upgrade-notes) for FIFO/cleanup, finite HTTP bounds, terminal/recoverable errors, nonce learning, gateway normalization and explicit key recovery. Installed keys retain the historical database name/schema.
- Optional-only endpoint settings previously ignored now select manual mode and fail without the complete manual set. Supply all required manual values or remove endpoint settings to use discovery. Correct malformed optional discovery capabilities at the provider, or omit unsupported fields.
- DPoP remains opt-in: an object defaults to optional; required rejects legacy unbound records and requires fresh proof-aware login. Later proofs never enroll/rebind legacy records, and disabled DPoP rejects existing bound credentials. Recognition is independent, POST-only enrollment and fresh login on enrolled change.
- Invalid transaction/code TTLs previously had store-dependent behavior; supply positive safe-integer milliseconds. `sessionTtlMs` is opt-in for new sessions and never renews on refresh. Custom clocks are now sampled during construction.
- Route each session to its owning issuer/client configuration. Known foreign live sessions now fail with 401. Correct inaccurate stored identity only from trusted provenance or require login again; do not remove identity fields to bypass the guard. Legacy omissions and shared code/alias limits remain as described below.
- Issuers must return the declared local credential shape; previously accepted malformed results now fail with rollback. Extra result properties no longer extend/override JSON responses.
- Provider network/reset failures now produce sanitized endpoint-specific 502s instead of generic internal errors. Cancellation no longer waits for an uncooperative cleanup promise. Alias-retention wording reflects existing SVH-05 behavior, with no store migration.

## Access Token Validation Middleware

Use a separate middleware for validating the app-issued local access token on normal API routes.

For JWTs prefer the built-in helper, which captures verified cnf before custom mapping and implements both validator methods. A custom signature-only adapter must faithfully preserve original confirmation to accept these tokens; the following legacy adapter is suitable only for credentials guaranteed unbound.

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

This middleware:

- reads `Authorization: Bearer ...`
- delegates token validation to your `validator`
- attaches `req.auth`
- rejects missing, malformed, invalid, or expired tokens with `401`

`onAuthContext` is a pre-`next()` veto hook, not a post-commit notification:
when it throws, downstream middleware never runs and `req.auth` is detached
before the error response is sent. A valid token plus a failing hook never
surfaces as an invalid-token `401`: a forwarded controlled package error keeps
its own status/code/client message (only a `401` veto carries the `Bearer`
challenge), while any other hook error becomes a sanitized `500
OIDC_VAULT_AUTH_CONTEXT_FAILED` without leaking the original message. Pass
`onError` to observe original extraction/token/proof/nonce/replay/hook errors for private server-side logs; it never affects the sanitized client response. Successful hooks cannot replace security-owned token/confirmation/binding; vetoes detach req.auth and keep replay reservations. API middleware responses carry no-store.

The package augments Express request typing so `req.auth` is available without casting in TypeScript route handlers.

### Optional authentication and request-scoped guards

`authentication: 'optional'` permits absent credentials. `deviceBinding.mode: 'optional'` separately permits verified unbound tokens and does not make authentication optional. Invalid credentials still reject by default; `invalidCredentials: 'anonymous'` requires explicit optional authentication. The options apply to both the existing middleware factory and the composable authenticator:

```ts
import express from 'express';
import { createMemoryOidcVaultStore } from '@web-ts-toolkit/express-oidc-vault-memory-store';
import {
  createOidcVaultAuthenticator,
  createOidcVaultJwtAccessTokenValidator,
  OidcVaultAuthDeniedError,
} from '@web-ts-toolkit/express-oidc-vault';

declare function findApplicationUser(subject: string): Promise<{ id: string; active: boolean } | null>;
const rawSecret = process.env.APP_JWT_SECRET;
if (!rawSecret || Buffer.byteLength(rawSecret, 'utf8') < 32) {
  throw new Error('APP_JWT_SECRET must encode at least 32 random bytes.');
}
const auth = createOidcVaultAuthenticator({
  authentication: 'optional',
  invalidCredentials: 'reject', // Default; anonymous credential fallback is a separate explicit choice.
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
    replayStore: createMemoryOidcVaultStore(), // Single process; share Redis/MongoDB across processes.
  },
  async onAuthContext({ auth, res }) {
    const user = await findApplicationUser(auth.subject);
    if (!user?.active) throw new OidcVaultAuthDeniedError('Account access denied.');
    res.locals.user = { id: user.id };
  },
});
const app = express();
app.use('/api', auth.authenticate);
app.get('/api/session', (req, res) => res.json({ authenticated: !!req.auth, user: res.locals.user ?? null }));
app.get('/api/private', auth.requireAuth, (_req, res) => res.json({ user: res.locals.user }));
app.get('/api/bound', auth.requireAuth, auth.requireDeviceBinding, (_req, res) => res.json({ user: res.locals.user }));
```

Mount `authenticate` exactly once **before** routes and guards. All guards must come from the same instance: they consume completed private evidence without rerunning token verification, replay reservation or enrichment. `requireAuth` needs authenticated identity; `requireDeviceBinding` additionally needs original bound-token confirmation and its accepted original-key proof. An unbound Bearer token with an optional proof never becomes bound. Application-user lookup/account policy remains callback-owned; route permissions remain application-owned after the guard.

The private evidence belongs to the original Request/Response and factory policy. Forged/copied/replaced `req.auth`, another request and another authenticator (even identically configured) cannot authorize a guard. Do not mutate top-level context fields between handlers: enrich in `onAuthContext` or `res.locals`. Missing/incompatible/changed evidence gives `401 OIDC_VAULT_AUTHENTICATION_REQUIRED`; the bound guard rejects authenticated unbound context with `401 OIDC_VAULT_DEVICE_BINDING_REQUIRED`. Repeated authentication or a guard entered while authentication is pending invalidates pending work and gives `500 OIDC_VAULT_AUTHENTICATION_REENTRY`, preventing its later context attachment/downstream continuation.

| Outcome                                                                                                                     | Optional authentication                                               | Explicit anonymous fallback                 |
| --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------- |
| Missing (no Authorization or DPoP header)                                                                                   | Anonymous continuation                                                | Same                                        |
| Invalid (including empty/duplicate/malformed headers, bound Bearer downgrade, missing/wrong/replayed proof, rejected token) | Existing rejection                                                    | Anonymous continuation; guards still reject |
| Authenticated                                                                                                               | Attach context after proof and hook acceptance                        | Same                                        |
| Nonce challenged                                                                                                            | Preserve original status/body/challenge/nonce; fresh-proof retry once | Same, never anonymous                       |
| Failed (replay outage/capacity, unknown adapter/contract error, hook veto/failure)                                          | Preserve failure                                                      | Same, never anonymous                       |

Custom validators explicitly reject credentials with root `OidcVaultInvalidAccessTokenError('Private diagnostic.')`, whose client response is fixed. The JWT helper also identifies malformed JWT/JWS, expiry, claims/issuer/audience, signature, disallowed-algorithm, verified confirmation/expiry-profile and default-subject rejections. Unknown exceptions, arbitrary HTTP statuses/codes, malformed adapter results, unsupported/configuration errors and custom `mapClaims` exceptions never authorize fallback; existing strict responses, including legacy validator 401s, remain. Optional proof-only input is invalid rather than missing.

Intentional hook denial uses root `OidcVaultAuthDeniedError(message?, status?: 401 | 403)`: fixed `OIDC_VAULT_AUTH_DENIED`, default 403 and public `Authentication denied.` message. Supply only a deliberately public message. A 401 uses the attempted scheme challenge; 403 has none. Unexpected hook failures remain sanitized `500 OIDC_VAULT_AUTH_CONTEXT_FAILED`. Vetoes keep proof reservations and never become anonymous. Original errors, including fallback rejections/guards, reach `onError`; observer failure cannot alter outcomes. Anonymous continuation detaches auth, removes challenge headers after observers and keeps no-store.

### JWT validator helper

If your local access token is a JWT, you can use a built-in helper instead of writing the same `jwtVerify(...)` adapter manually.

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

The JWT helper exposes validate(token) and `validateWithRequest({ token, scheme, req })`. Both verify the bound profile's safe mandatory expiry after JOSE verification and **before mapClaims**; generic unbound JWT expiry stays optional. It snapshots verified cnf before mapping, discarding mapper-supplied confirmation/deviceBinding. An unbound legacy result omits confirmation; request-aware unbound is explicit null. Bound confirmation survives mapper removal and is rejected when DPoP is disabled. Supported cnf is exactly `{ jkt: '<canonical SHA-256 thumbprint>' }`; malformed/null/unsupported cnf is an invalid token, never legacy. The helper verifies JWTs; the API middleware verifies possession.

### Request-aware API policy and public URL

Every API accepting bound JWTs needs createOidcVaultAccessTokenMiddleware with deviceBinding. Construction requires a callable **validateWithRequest** (called for both Bearer/DPoP); custom verified JWT/introspection adapters return mandatory `confirmation: { jkt } | null`. Adapters are trusted to report original binding independently of mapping. Omitted policy keeps the exact one-argument validate(token) legacy path, refusing any known bound confirmation. Optional accepts unbound Bearer but never upgrades it; required rejects unbound JWTs. Bound Bearer fails even with proof; DPoP presentation of an unbound JWT is invalid_token.

API wire: **Authorization: DPoP &lt;local-JWT&gt;** plus **DPoP: &lt;fresh-proof-JWT&gt;**. Protected header `{ typ: 'dpop+jwt', alg: 'ES256', jwk: publicP256Jwk }`; signed method/absolute htu/current integer iat/fresh jti and API `ath = base64url(SHA-256(ASCII(token)))`, plus nonce if challenged. Original verified cnf.jkt must match the proof's RFC 7638 thumbprint. Wrong key/signature/method/URL/hash/stale/replayed/duplicate proofs fail before req.auth/hooks/downstream. An optional unbound supplied proof also validates ath/nonce/replay without producing deviceBinding.

API target is pinned `publicOrigin` plus optional **publicPathPrefix** plus the pathname of Express's `req.originalUrl`. Prefix is only for a public prefix stripped by a proxy; default empty, no query/fragment. For example publicPathPrefix `/public` with app route `/api/me` verifies `https://api.example.com/public/api/me`. Do not add `/api` if Express already retains it. Vault proxies must preserve the configured public basePath. Host/Forwarded/X-Forwarded-\* and trust proxy never select origin. Static origins require HTTPS except loopback HTTP development; strip query/fragment, normalize scheme/host/default port/dot/unreserved escapes, uppercase other percent escapes and preserve reserved `%2F`. Origin-form `//host/path` remains a path on the pinned origin.

### Guarded store and per-request replay contracts

All built-ins return **OidcVaultDeviceBindingStoreProvider** (Mongo retains ready), requiring live getAuthorizationTransaction/getExchangeCode, atomic consumeAuthorizationTransactionIfMatches/consumeExchangeCodeIfMatches, getSessionRevocationContext and reserveDpopProof. They remain optional on the base custom bearer interface; either opt-in feature checks all six at construction. Getters are detached live snapshots, not locks. Match includes both `{ deviceBinding, browserBindingHash }`; **null requires absence/undefined, not a wildcard or stored null**. Valid shapes: legacy neither field, cookie-only hash, bound hash+key. Exchange also atomically matches expectedSessionId; mismatch leaves a live record available, matching races have one winner, and original consumes refuse guarded records. Rotation inherits omitted binding and rejects changing/removing it or enrolling an unbound lineage.

Revocation context resolves a live handle/unexpired alias to the currently live lineage's logical ID/provider/key, with no tokens/profile/metadata returned. Mixed/malformed lineage authority fails closed; aliases never authenticate refresh. Built-in logout uses it even with DPoP disabled, so bound aliases cannot downgrade.

Replay key is opaque `dpop:v1:` plus base64url SHA-256 of JSON([effectiveNamespace,jkt,jti]). Space is `['vault', normalizedBackendOrigin, normalizedBasePath, exactIssuer, exactClientId]` or `['api', normalizedPublicOrigin, replayNamespace]`; static API label is 1–128 printable ASCII bytes. Never partition by instance/route/token/code/session or release after downstream failure. Core expiry is **(iat + age + skew) × 1000**, remaining TTL ≤360000ms including future skew. Invalid/expired/unsafe/fractional/overlong windows return false without allocation; duplicates return false without renewal before capacity checks. Matching windows/namespaces/store limits/secrets and synchronized clocks are required across instances. No implicit fallback exists.

Every provider has dpopReplayMaxEntries (positive safe integer, default **100000**) shared per memory object/Redis prefix/paired Mongo replay collections. At capacity throw root OidcVaultDpopReplayCapacityError; never evict live state/fail open. Memory uses an indexed heap, Redis one cached EVALSHA/server TIME, Mongo transaction-serialized capacity plus a non-TTL expiry ledger (proof TTL cannot leak accounting). Admission reclaims at most **64** expired entries plus the requested expired key; expired data can conservatively consume capacity. DPoP writes per proof/API request; Mongo's common admission is seven data commands plus commit with a shared contention row. These are work bounds, not latency/throughput guarantees. Full provider READMEs describe lifecycle/topology/durability costs.

### Fixed errors, challenges and nonces

| HTTP                | Code                                     | Fixed message                                  |
| ------------------- | ---------------------------------------- | ---------------------------------------------- |
| 401                 | OIDC_VAULT_MISSING_ACCESS_TOKEN          | Missing access token. (enabled API only)       |
| 401                 | OIDC_VAULT_DEVICE_BINDING_REQUIRED       | A device-bound login is required.              |
| 401                 | OIDC_VAULT_DPOP_REQUIRED                 | DPoP authentication is required.               |
| 401                 | OIDC_VAULT_INVALID_DPOP_PROOF            | DPoP proof validation failed.                  |
| 400                 | OIDC_VAULT_INVALID_BROWSER_BINDING       | Login browser binding validation failed.       |
| 415                 | OIDC_VAULT_UNSUPPORTED_REQUEST_BODY_TYPE | Login initiation requires a JSON request body. |
| 400 vault / 401 API | OIDC_VAULT_USE_DPOP_NONCE                | A fresh DPoP nonce is required.                |
| 503                 | OIDC_VAULT_DPOP_REPLAY_UNAVAILABLE       | DPoP replay protection is unavailable.         |
| 400                 | OIDC_VAULT_INVALID_FINGERPRINT           | Fingerprint signal is invalid.                 |
| 403                 | OIDC_VAULT_FINGERPRINT_REAUTH_REQUIRED   | Browser recognition changed; sign in again.    |

Source failures keep 403 OIDC_VAULT_UNTRUSTED_ORIGIN and route-specific fixed Login/Exchange/Refresh/Logout request origin is not trusted. Authenticated provider-error callback uses 400 OIDC_VAULT_CALLBACK_ERROR / OIDC callback failed. Browser JSON is only code/message, never raw claims/URLs/keys/provider diagnostics; original errors go privately to core hooks.onError or API onError (replay cause retained).

For default ES256, API proof/downgrade errors use `DPoP error="invalid_dpop_proof", algs="ES256"`; invalid DPoP token/unbound DPoP use invalid_token, invalid Bearer/required-unbound Bearer use `Bearer error="invalid_token"`. Missing optional credentials advertise `Bearer, DPoP algs="ES256"`; required only DPoP. Nonce uses `DPoP error="use_dpop_nonce", algs="ES256"`. No error_description; non-401 failures have no auth challenge. Disabled legacy parser/errors remain compatible.

Nonce is **off by default**; enable with shared random Uint8Array of at least 32 bytes, lifetime default 60s/integer 1–300. Stateless versioned HMAC-SHA-256 challenges include 128 random bits, issue/expiry, namespace digest and jkt, max 512 bytes, no per-client nonce storage. Any authentic live issued nonce works for parallel fresh proofs; not single-use/latest-only, and normal iat/JTI replay still apply. After other valid target/key/token/cookie checks, missing/expired/wrong nonce challenges **before reservation/mutation/upstream**: one DPoP-Nonce, fixed 400 vault POST/401 API. Vault 400 has no auth challenge; API 401 has use_dpop_nonce. Headerless callback/no-proof unbound are excluded. Cache per space/key and retry once with new proof/JTI/iat/signature; repeated challenge stops. Secret rotation causes a new challenge, with no previous-secret list. All responses carry no-store.

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

Hooks let the app observe or extend the OIDC flow without forking the middleware.

```ts
import { createHmac } from 'node:crypto';

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
});

async function upsertLocalUser(input: { oidcSubject: string; email?: string; displayName?: string }): Promise<void> {
  console.log('upsertLocalUser', input);
}
```

Recommended hook usage:

- `onLoginStart`, `onAuthorizationUrl`, `onCallbackTokens`, `onUserInfo`, `onBeforeSessionCreate`, and `onBeforeLogout` are pre-commit hooks. Throwing from one of these hooks vetoes the operation before related durable session state is created, rotated, or deleted.
- `onSessionCreated`, `onSessionRefreshed`, and `onLogout` are post-commit notification hooks. Their failures are reported to `onError` but do not change a successful callback redirect, refresh response, logout response, or already-committed store mutation.
- client error responses keep a stable `{ code, message }` shape; original provider/store/hook/issuer diagnostics reach private hooks.onError, while separate API extraction/token/proof/nonce/replay/hook diagnostics reach API onError. Private observers are not automatic log redaction.

### Dedicated Logout Continuation Storage

All three built-in factories also satisfy `OidcVaultLogoutNavigationStoreProvider`. This independent capability adds `createLogoutNavigationTicket(input): Promise<void>` and `consumeLogoutNavigationTicket({ namespace, ticketHash }): Promise<OidcVaultLogoutNavigationTicket | null>`. Both methods remain **optional on `OidcVaultStoreProvider`** for existing custom stores. Enable core `logoutNavigation` separately to register the continuation routes; storage alone does not change ordinary logout.

The core root exports `OidcVaultLogoutNavigationTicket`, `CreateLogoutNavigationTicketInput`, `ConsumeLogoutNavigationTicketInput`, `OidcVaultLogoutNavigationStoreProvider`, and `OidcVaultLogoutNavigationCapacityError`. Exactly five scalar fields are captured before the first await and returned as detached plain records: **`namespace`, `ticketHash`, `upstreamLogoutUrl`, `createdAt`, `expiresAt`**. Extra input fields/serializers are ignored. No raw ticket, full session/profile, handle, subject, or separate upstream tokens are copied. The already-built upstream URL can contain `id_token_hint`: hashing lookup keys does not encrypt this credential-bearing destination. Exclude records/URLs and arbitrary backend errors from logs.

Namespace is `logout-navigation:v1:` followed by a canonical 43-character SHA-256 base64url digest; `ticketHash` is also a canonical 43-character digest. The continuation protocol uses `lnt_` plus **32 cryptographically random bytes** encoded as unpadded canonical base64url (47 characters total); hash the **entire prefixed ticket** with SHA-256. Scope hashing uses UTF-8 `JSON.stringify(['oidc-vault-logout-navigation', 1, backendOrigin, normalizedBasePath, exactConfiguredIssuer, configuredClientId, namespaceLabel, normalizedFallbackUri, normalizedPostLogoutUriOrNull])`. Scope labels are static printable ASCII, default `default`, 1..128 bytes. Hash formats cannot establish entropy: callers must never intentionally reuse secrets/hashes. Origin/mount/provider/return-policy changes isolate continuations, not legacy sessions.

Create is **create-only**: live exact-pair collision throws `OidcVaultStoreConflictError` before capacity rejection without changing the first destination/deadline. Invalid/expired create throws `TypeError` without ticket allocation. Epochs and clock must be safe integers within ECMAScript Date range; original lifetime **1000..120000 ms**, remaining lifetime **>0 and ≤120000 ms** (protocol default 60000 ms). Destinations must be absolute HTTP(S), without userinfo, fragment, raw whitespace/control characters or backslashes, and at most **16384 serialized UTF-8 bytes**. Discovered endpoints may use another host. Core/provider clocks must agree; Redis uses server `TIME`, ignoring its application clock for tickets.

Consume atomically checks the exact pair and `expiresAt > now`, removes the record and returns it once. Invalid input/unknown/spent/expired/malformed selected records return `null`; selected malformed/expired records are retired. Backend, clock and accounting errors **throw**, never successful grants. No read followed by unconditional delete or process-local lock implements shared consumption. An uncertain create/consume can have committed: never retry an arbitrary backend error or restore a consumed record.

Every built-in accepts `logoutNavigationMaxEntries?: number`, positive safe integer, default **10000**, independent of DPoP replay. Capacity spans effective ticket namespaces in one memory object, MongoDB collection pair or Redis keyPrefix; it is not tenant availability isolation. No live eviction; exhaustion throws `OidcVaultLogoutNavigationCapacityError`. Successful consume frees its own capacity immediately. Each operation reclaims at most **64 unrelated expiries plus its selected record**. Unknown consumes allocate no per-request state; expired accounting awaiting cleanup can conservatively occupy capacity. Session/lineage/backchannel deletion does not cascade to already-authorized continuations. See provider READMEs for physical retention/configuration details.

Migration: custom stores need this capability only when opting into a continuation flow; device binding's six methods remain separate. Built-in inferred return types expose both capabilities without casts or optional chaining.

## Session Identity And Store Namespaces

Exchange, refresh and logout compare every stored provider.issuer/clientId that is defined against resolved config; built-in logout also checks surviving lineage authority through unexpired aliases. Each field matches independently/verbatim, without URL normalization; issuer trailing-slash variants are distinct. Config strings still trim at construction.

A known mismatch returns HTTP 401 with `{"code":"OIDC_VAULT_INVALID_SESSION","message":"Session is missing or expired."}` before discovery, upstream token use, local issuance, lifecycle hooks, rotation, or lineage deletion. It neither sets nor clears a cookie and produces no provider logout redirect. The normal `onError` observer runs without the foreign session in its context.

Legacy sessions with absent `provider`, an empty provider object, or omitted/undefined identity fields remain supported. Only known fields are checked: an omitted issuer permits cross-issuer use, an omitted client ID permits cross-client use, and entirely absent identity permits both. Refresh does not backfill identity.

For complete identity isolation use separate session/alias, exchange-code and transaction namespaces. Opt-in/guarded exchange preflights identity before code consumption; built-in live/alias logout checks identity before deletion. Disabled genuinely legacy bearer exchange retains consume-before-identity ordering, so a rejected foreign legacy code can still be spent. Old custom bearer stores without revocation context retain historical alias deletion; they cannot opt into DPoP. Absent identity remains compatibility, not isolation.

### Rotation alias retention

Session rotation preserves the logical session ID when the next session omits one. Rotation aliases are a finite bridge for in-flight requests: each old ID revokes its lineage only until its immediate successor's `expiresAt`; later rotations do not extend earlier aliases. After that window, use the live ID or a scoped `deleteSessionsByLogicalSessionId` / `deleteSessionsBySubject` / `deleteSessionsByProviderSessionId` call. An explicitly changed logical ID moves the new alias to that lineage; earlier aliases keep their previous lineage.

Without successor `expiresAt`, memory and Redis impose no alias time limit and can accumulate arbitrarily many aliases; MongoDB uses `rotatedSessionAliasRetentionMs` (default 5 minutes). Memory eagerly retires inactive old-lineage aliases on rotation/upsert; MongoDB/Redis can retain them until expiry or explicit cleanup. Use distinct logical IDs for unrelated login families. Core refresh uses the live ID and preserves expiry. This retains the [SVH-05 decision](https://github.com/egose/web-ts-toolkit/blob/main/docs/tasks/20260908-130120-oidc-vault-stores-health-follow-up.md#task-svh-05-decide-a-portable-rotation-alias-lifetime-contract).

Scoped/direct deletion preserves unexpired aliases while a live member survives, including another provider scope. Bulk counts exclude alias cleanup; memory excludes expired sessions, MongoDB can count expired rows awaiting TTL cleanup, and Redis counts actual primary deletions during one cursor traversal. MongoDB scoped deletion repeats until an empty query. Later arrivals can survive and errors can follow committed deletion; counts do not prove an empty scope. Portable plain-object/array inputs are snapshotted at invocation; opaque native objects retain backend-specific serialization without portable mutation isolation. See the shipped store READMEs for client lifecycle, safe diagnostics, and actual resource bounds (SCAN COUNT is a hint, not a cap).

## Known Browser And Concurrency Limits

- **Legacy browser binding:** unbound GET flows retain the transferred-callback/session-swap and stolen-unused-code risks in both transports. Legacy exchange accepts forms with no source check. Opt-in POST callback/guarded exchange authenticate the temporary cookie; bound exchange/refresh/logout/API additionally require the original key. CORS/cookie refresh source checks do not supply legacy browser binding.
- **Refresh families:** local atomic rotation allows one winner, but overlapping requests can send the same upstream refresh token multiple times, including across backend instances. A single-use provider with reuse detection can revoke the entire upstream refresh family, leaving the local winner unable to refresh. Deduplicate frontend refreshes, including bootstrap and retry paths; a per-context promise is not a distributed guarantee.
- **Cookie ordering:** a loser reaching a local rotation conflict (or a stale missing-session retry) clears the cookie. A late clear can erase the winner's cookie even while its server session remains live. Upstream-failure losers do not set a cookie. Response ordering is not enforced.
- **Logout and stateless tokens:** local/provider/backchannel logout revoke vault refresh sessions, not outstanding stateless application access tokens. Those remain valid until their own expiry unless your validator checks application revocation state. A refresh racing logout can still return 200 and an access token after its lineage is deleted. Keep local tokens short-lived; immediate API revocation requires application-owned validation state. Vault-session expiry likewise does not revoke an already-issued stateless token.

Browser-bound proofs (BOV-02-FU1) are implemented for opt-in POST lifecycle and bound refresh/logout/API; the private app implements persistent keys and real-browser coordination. Cross-instance refresh lease (BOV-03-FU1) and stale-cookie ordering (BOV-03-FU2) remain separate [boundary-review follow-ups](https://github.com/egose/web-ts-toolkit/blob/main/docs/tasks/20260908-070811-express-oidc-vault-boundary-review.md). Different honest fresh proofs outside one frontend partition can still race a single-use upstream family. DPoP/replay and browser locks do not establish a distributed lease or response ordering.

## Security Checklist

- keep `sessionId` in `sessionStorage` and keep `accessToken` in memory only
- in cookie mode keep the vault handle backend-only, including omitting it from JWT/profile claims
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
- POST login/exchange need temporary cookie credentials and trusted source in both transports, independent of CORS/DPoP
- configure a stable expected issuer in both discovery and manual endpoint modes
- require matching UserInfo subjects before merging provider claims into the local session user
- treat upstream OAuth `expires_in`, local access-token lifetime, and vault-session expiry as separate policies
- keep any local app-issued access token short-lived, such as 5 to 15 minutes
- every accepting API must enforce request-aware original-key DPoP, pinned public origin/prefix and shared replay; never reuse proofs/fall back to Bearer
- non-extractable IndexedDB keys bind a browser profile, not hardware; XSS can still invoke same-browser signing, and proofs do not sign bodies/query strings
- logout revokes refresh lineage, not stateless JWTs; immediate API revocation requires validator-owned state
- disclose fingerprint recognition/retention; it is copyable non-PoP and hashing is not anonymization
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
