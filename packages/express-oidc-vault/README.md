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
- `POST /auth/oidc/login` when `deviceBinding` or `fingerprintRecognition` is configured (JSON initiation; see below)
- `GET /auth/oidc/callback`
- `POST /auth/oidc/exchange`
- `POST /auth/oidc/refresh`
- `POST /auth/oidc/logout`
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
| `postLogoutRedirectUri`         | unset                                      | Optional provider-registered HTTP(S) URL used in the upstream end-session redirect. Only consulted for redirected logout (`redirect: true`); upstream failures fall back to local `200 { loggedOut: true }` with `onError`.                          |
| `fetchUserInfo`                 | enabled when usable                        | Fetches UserInfo if an endpoint exists and the token response supplies an access token; false disables it. Claims merge only after matching the verified subject.                                                                                    |
| `authorizationTransactionTtlMs` | `600000`                                   | TTL for one-time authorization transactions created during login.                                                                                                                                                                                    |
| `exchangeCodeTtlMs`             | `30000`                                    | TTL for one-time local exchange codes returned to the frontend callback route.                                                                                                                                                                       |
| `sessionTtlMs`                  | unset                                      | Opt-in positive safe-integer lifetime in milliseconds from callback session creation. Hooks may shorten it; refresh never extends it.                                                                                                                |
| `sessionTransport`              | `body`                                     | `body` returns and accepts JSON `sessionId`; `cookie` stores the session pointer in an `HttpOnly` cookie and rejects body-only refresh/logout IDs.                                                                                                   |
| `cookie`                        | see cookie defaults above                  | Cookie transport options. `httpOnly` is always enforced as `true`; unsafe names, paths, domains, and `__Secure-`/`__Host-` prefix violations are rejected.                                                                                           |
| `deviceBinding`                 | disabled                                   | Vault DPoP policy; object defaults to `optional`. Selects the initiating key at POST login and enforces it through callback/exchange/refresh/logout. Configure API enforcement separately.                                                           |
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

DPoP binds a login to a browser-held private key. The complete server below issues a short-lived local JWT with `cnf.jkt` and protects the API with the same replay provider. It uses the development memory store; select a shared Redis/MongoDB provider for multiple processes. Direct imports of `jose` and `cors` are application dependencies:

```sh
pnpm add @web-ts-toolkit/express-oidc-vault @web-ts-toolkit/express-oidc-vault-memory-store express jose cors
pnpm add -D @types/express @types/node @types/cors typescript
```

### Complete DPoP server

Set `OIDC_ISSUER`, `OIDC_CLIENT_ID`, optional `OIDC_CLIENT_SECRET`, and a stable strong random `APP_JWT_SECRET` encoding at least 32 bytes. Register **`https://api.example.com/auth/oidc/callback`** with the IdP. Terminate HTTPS at the configured public backend origin and preserve the public vault mount path.

```ts
import express from 'express';
import cors from 'cors';
import { SignJWT } from 'jose';
import {
  createOidcVaultMiddleware,
  createOidcVaultAccessTokenMiddleware,
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
    tokenIssuer: {
      async issue({ session, deviceBinding }) {
        if (!deviceBinding) throw new Error('A verified DPoP binding is required.');
        const accessToken = await new SignJWT({ scope: session.scope, cnf: { jkt: deviceBinding.jkt } })
          .setSubject(session.subject)
          .setProtectedHeader({ alg: 'HS256' })
          .setIssuer(backendOrigin)
          .setAudience(audience)
          .setIssuedAt()
          .setExpirationTime('5m')
          .sign(signingKey);
        return { accessToken, tokenType: 'DPoP', expiresIn: 300 };
      },
    },
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

Local HS256 signing and ES256 proof signing are independent. Use the **verified `IssueTokenInput.deviceBinding`** for `cnf.jkt`; a mutable profile/session field is not proof authority. This JWT deliberately contains no vault `sessionId`/`sid`, so switching to cookie transport keeps that handle out of browser-readable tokens. APIs still independently verify JWT signature/issuer/audience/expiry and request proof. Authorization remains application-owned.

For cookie transport, change `sessionTransport` to `'cookie'` and configure the frontend for that same mount/transport. For multiple mounts, give each a distinct `transactionCookie.name` and session `cookie.name`. Nonces are optional: to enable them, supply `nonce: { secret: sharedRandomBytes, lifetimeSeconds: 60 }` in **each** vault/API proof policy; use at least 32 random bytes shared by instances of that protection space. A random secret created anew on each instance is unsuitable for shared challenge verification.

### Device-binding policy and issuance contracts

The package root exposes policy, record, local-issuer, guarded-store, POST-login DTO/cookie, and request-aware API contracts. **The backend lifecycle is implemented:** POST initiation, cookie-authenticated callback, original-key exchange/refresh/logout (including unexpired aliases), and API proof/nonce/shared replay enforcement. The [private persistent-key SPA example](https://github.com/egose/web-ts-toolkit/blob/main/apps/oidc-vault-dpop-example/README.md) includes both transports, an Express/local IdP fixture, and real-browser redirect/reload/IndexedDB/CORS/nonce/cross-tab checks. [Request-aware DPoP APIs](#request-aware-dpop-apis) describes API configuration.

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

A browser using a persistent key can initiate as follows; the [complete SPA helpers](#persistent-key-dpop-spa-example) generate/persist the key and bound retries:

```ts
import type { OidcVaultLoginInitiationInput, OidcVaultLoginInitiationResult } from '@web-ts-toolkit/express-oidc-vault';

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
import type { OidcVaultExchangeResult } from '@web-ts-toolkit/express-oidc-vault';

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

The copyable private example utility is `apps/oidc-vault-dpop-example/src/auth/device-fingerprint.ts` (not a backend package export). It provides `createDeviceFingerprint(source, { headerName? })` plus a structural optional-vendor adapter:

```ts
// In the private example frontend, after choosing to collect recognition:
import { createDeviceFingerprint, fingerprintJsSignalSource, type FingerprintJsAgent } from './auth/device-fingerprint';

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

### Standalone body-transport DPoP client

For the [complete server above](#complete-dpop-server), install `jose` + `idb` in a browser-bundled TypeScript app. This self-contained, **single-tab body-transport** recipe includes persistent key creation, POST login, callback exchange, API proof/nonce retry, refresh after JWT expiry, and logout. It uses only browser libraries and application code; nothing is imported from an Express package at browser runtime. Configure `backendOrigin`/`basePath` to the exact public mount and keep the same key throughout.

```sh
pnpm add jose idb
```

```ts
import { base64url, calculateJwkThumbprint, decodeJwt, SignJWT, type JWK } from 'jose';
import { openDB, type DBSchema } from 'idb';

const backendOrigin = 'https://api.example.com';
const basePath = '/auth/oidc';
const scope = JSON.stringify(['oidc-vault-dpop-v1', location.origin, backendOrigin, basePath]);
const handleName = `dpop:handle:${scope}`;
const pendingName = `dpop:pending:${scope}`;
interface Key {
  privateKey: CryptoKey;
  publicJwk: JWK;
  jkt: string;
}
interface Database extends DBSchema {
  keys: { key: string; value: Key };
}
interface Handle {
  sessionId: string;
  jkt: string;
}
interface Token {
  accessToken: string;
  expiresAt: number;
  jkt: string;
}
let token: Token | undefined; // Never persist the access token.
let refreshPromise: Promise<Token> | undefined;
const nonces = new Map<string, string>();
const database = () =>
  openDB<Database>('my-app-dpop', 1, {
    upgrade(db) {
      db.createObjectStore('keys');
    },
  });
function clearAuth(): void {
  token = undefined;
  nonces.clear();
  sessionStorage.removeItem(handleName);
  sessionStorage.removeItem(pendingName);
}
function requireLogin(): never {
  clearAuth();
  throw new Error('Sign in again.');
}
function readHandle(): Handle {
  const value: unknown = JSON.parse(sessionStorage.getItem(handleName) ?? 'null');
  if (
    !value ||
    typeof value !== 'object' ||
    !('sessionId' in value) ||
    typeof value.sessionId !== 'string' ||
    !value.sessionId ||
    !('jkt' in value) ||
    typeof value.jkt !== 'string'
  )
    return requireLogin();
  return { sessionId: value.sessionId, jkt: value.jkt };
}
async function readKey(create = false, expectedJkt?: string): Promise<Key> {
  if (!isSecureContext || !crypto.subtle || !globalThis.indexedDB) return requireLogin();
  const db = await database();
  try {
    let key = await db.get('keys', scope);
    if (!key) {
      if (!create) return requireLogin(); // Only a fresh login may create a key.
      const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
      const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
      const publicJwk: JWK = { kty: 'EC', crv: 'P-256', x: jwk.x!, y: jwk.y! };
      const candidate: Key = { privateKey: pair.privateKey, publicJwk, jkt: await calculateJwkThumbprint(publicJwk) };
      // Crypto outside the transaction; one atomic first-key winner across tabs.
      const tx = db.transaction('keys', 'readwrite');
      key = await tx.store.get(scope);
      if (!key) {
        await tx.store.add(candidate, scope);
        key = candidate;
      }
      await tx.done;
    }
    const algorithm = key.privateKey?.algorithm as EcKeyAlgorithm | undefined;
    if (
      !(key.privateKey instanceof CryptoKey) ||
      key.privateKey.type !== 'private' ||
      key.privateKey.extractable ||
      algorithm?.name !== 'ECDSA' ||
      algorithm.namedCurve !== 'P-256' ||
      key.publicJwk?.kty !== 'EC' ||
      key.publicJwk.crv !== 'P-256' ||
      Object.keys(key.publicJwk).length !== 4 ||
      (await calculateJwkThumbprint(key.publicJwk)) !== key.jkt ||
      (expectedJkt !== undefined && expectedJkt !== key.jkt)
    )
      return requireLogin();
    const publicKey = await crypto.subtle.importKey(
      'jwk',
      key.publicJwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['verify'],
    );
    const data = new TextEncoder().encode('dpop-key-pair-check');
    const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key.privateKey, data);
    if (!(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, signature, data)))
      return requireLogin();
    return key;
  } finally {
    db.close();
  }
}
function target(url: URL): string {
  // URL already normalizes host/default port/dot segments. Normalize unreserved
  // escapes before final dot removal; preserve reserved escapes such as %2F.
  const path = url.pathname.replace(/%([0-9a-f]{2})/gi, (_, hex: string) => {
    const c = String.fromCharCode(parseInt(hex, 16));
    return /^[A-Za-z0-9._~-]$/.test(c) ? c : `%${hex.toUpperCase()}`;
  });
  return new URL(`${url.origin}${path}`).href; // No query or fragment.
}
export async function signRequestProof(
  key: Key,
  method: string,
  url: URL,
  accessToken?: string,
  nonce?: string,
): Promise<string> {
  const ath =
    accessToken === undefined
      ? undefined
      : base64url.encode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(accessToken))));
  return new SignJWT({
    htm: method,
    htu: target(url),
    iat: Math.floor(Date.now() / 1000),
    jti: base64url.encode(crypto.getRandomValues(new Uint8Array(16))),
    ...(ath === undefined ? {} : { ath }),
    ...(nonce === undefined ? {} : { nonce }),
  })
    .setProtectedHeader({ typ: 'dpop+jwt', alg: 'ES256', jwk: key.publicJwk })
    .sign(key.privateKey);
}
function rememberNonce(space: string, response: Response): boolean {
  const nonce = response.headers.get('DPoP-Nonce');
  if (!nonce || nonce.length > 512 || !/^[\x20-\x7e]+$/.test(nonce)) return false;
  nonces.set(space, nonce);
  return true;
}
async function post(route: 'login' | 'exchange' | 'refresh' | 'logout', body: object, key: Key): Promise<unknown> {
  const url = new URL(`${backendOrigin}${basePath}/${route}`);
  const space = JSON.stringify(['vault', scope, key.jkt]);
  for (let attempt = 0; attempt < 2; attempt++) {
    key = await readKey(false, key.jkt);
    const proof = await signRequestProof(key, 'POST', url, undefined, nonces.get(space));
    const response = await fetch(url, {
      method: 'POST',
      redirect: 'error',
      cache: 'no-store',
      credentials: route === 'login' || route === 'exchange' ? 'include' : 'omit',
      headers: { 'Content-Type': 'application/json', DPoP: proof },
      body: JSON.stringify(body),
    });
    const value: unknown = await response.json();
    if (response.ok) return value;
    const code = value && typeof value === 'object' && 'code' in value ? value.code : undefined;
    if (
      response.status === 400 &&
      code === 'OIDC_VAULT_USE_DPOP_NONCE' &&
      attempt === 0 &&
      rememberNonce(space, response)
    )
      continue;
    if (code === 'OIDC_VAULT_INVALID_SESSION' || code === 'OIDC_VAULT_FINGERPRINT_REAUTH_REQUIRED')
      return requireLogin();
    throw new Error('Vault request failed.'); // Do not silently retry proof/503/network failures.
  }
  throw new Error('Repeated nonce challenge.');
}
function accept(value: unknown, key: Key): Token {
  if (
    !value ||
    typeof value !== 'object' ||
    !('accessToken' in value) ||
    typeof value.accessToken !== 'string' ||
    !('tokenType' in value) ||
    value.tokenType !== 'DPoP' ||
    !('expiresIn' in value) ||
    typeof value.expiresIn !== 'number' ||
    !Number.isSafeInteger(value.expiresIn) ||
    value.expiresIn < 0 ||
    !('sessionId' in value) ||
    typeof value.sessionId !== 'string'
  )
    return requireLogin();
  // Check the trusted server's response contract; this decoding is NOT JWT authentication.
  const cnf = decodeJwt(value.accessToken).cnf as { jkt?: unknown } | undefined;
  if (cnf?.jkt !== key.jkt) return requireLogin();
  sessionStorage.setItem(handleName, JSON.stringify({ sessionId: value.sessionId, jkt: key.jkt }));
  token = { accessToken: value.accessToken, expiresAt: Date.now() + value.expiresIn * 1000, jkt: key.jkt };
  return token;
}
export async function signIn(): Promise<void> {
  clearAuth();
  const key = await readKey(true);
  sessionStorage.setItem(pendingName, key.jkt);
  const value = await post('login', { returnTo: '/callback' }, key);
  if (
    !value ||
    typeof value !== 'object' ||
    !('authorizationUrl' in value) ||
    typeof value.authorizationUrl !== 'string'
  )
    return requireLogin();
  const url = new URL(value.authorizationUrl);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return requireLogin();
  location.assign(url.href);
}
export function refresh(): Promise<Token> {
  if (!refreshPromise)
    refreshPromise = (async () => {
      const handle = readHandle();
      const key = await readKey(false, handle.jkt);
      return accept(await post('refresh', { sessionId: handle.sessionId }, key), key);
    })().finally(() => {
      refreshPromise = undefined;
    });
  return refreshPromise; // No access token/Authorization/ath needed, even after expiry.
}
export async function bootstrap(): Promise<void> {
  const url = new URL(location.href);
  const code = url.searchParams.get('code');
  if (code) {
    url.searchParams.delete('code');
    history.replaceState(null, '', url.href);
    const pending = sessionStorage.getItem(pendingName);
    if (!pending) return requireLogin();
    const key = await readKey(false, pending);
    accept(await post('exchange', { code }, key), key);
    sessionStorage.removeItem(pendingName);
  } else if (sessionStorage.getItem(handleName)) {
    await refresh();
  }
}
export async function getProfile(): Promise<unknown> {
  const url = new URL(`${backendOrigin}/api/profile`); // Fixed API scope; no arbitrary credential target.
  let credential = token;
  let refreshed = false;
  if (!credential || credential.expiresAt <= Date.now()) {
    credential = await refresh();
    refreshed = true;
  }
  const space = JSON.stringify(['api', url.origin, 'app-api-v1', credential.jkt]);
  let nonceRetried = false;
  for (;;) {
    const key = await readKey(false, credential.jkt);
    const proof = await signRequestProof(key, 'GET', url, credential.accessToken, nonces.get(space));
    const response = await fetch(url, {
      redirect: 'error',
      credentials: 'omit',
      cache: 'no-store',
      headers: { Authorization: `DPoP ${credential.accessToken}`, DPoP: proof },
    });
    const error = /(?:^|,\s*)DPoP\s+error="([a-z_]+)"(?:,|$)/i.exec(
      response.headers.get('WWW-Authenticate') ?? '',
    )?.[1];
    if (response.status === 401 && error === 'use_dpop_nonce' && !nonceRetried && rememberNonce(space, response)) {
      nonceRetried = true;
      await response.body?.cancel();
      continue;
    }
    if (response.status === 401 && error === 'invalid_token' && !refreshed) {
      refreshed = true;
      await response.body?.cancel();
      credential = await refresh();
      continue;
    }
    if (!response.ok) throw new Error('Protected API request failed.');
    return response.json();
  }
}
export async function signOut(): Promise<void> {
  const handle = readHandle();
  const key = await readKey(false, handle.jkt);
  try {
    await post('logout', { sessionId: handle.sessionId }, key);
  } finally {
    clearAuth();
  }
}
```

Wire it to a sign-in button (`signIn()`), callback/app startup (`bootstrap()`), a profile action (`getProfile()`), and logout (`signOut()`). Keep these operations sequential around login/logout. Storage/crypto failures stop the operation; clear frontend auth and request fresh login, without an ephemeral-key or Bearer fallback. This recipe's body handle is **tab-local**: atomic key creation does not coordinate shared refresh authority. Do not copy handles or rely on opener-cloned sessionStorage. The example helpers below add cookie-mode Web Locks/BroadcastChannel, richer scoped fetch/body retry rules, current recognition and error handling.

### Persistent-key DPoP SPA example

For a bound flow, copy `src/auth/` from [`apps/oidc-vault-dpop-example`](https://github.com/egose/web-ts-toolkit/blob/main/apps/oidc-vault-dpop-example/README.md) into your frontend and install `jose` + `idb`. These are **private example exports**, separate from the Express package. The complete app's server uses required DPoP, a local issuer, and API request-aware validation; its default mounts are `/auth/oidc/body` and `/auth/oidc/cookie`. Your own core mount can use the default `/auth/oidc`.

```sh
# Repository root, two terminals:
pnpm --filter oidc-vault-dpop-example dev:server
pnpm --filter oidc-vault-dpop-example dev
# Open http://127.0.0.1:4317/?transport=body (or cookie).
```

After copying the helper directory, this frontend code matches the example's actual endpoints:

```ts
import { createOidcVaultDpopSession, fetchWithDpop } from './auth';

const backendOrigin = 'http://127.0.0.1:4318';
const session = createOidcVaultDpopSession({ backendOrigin, basePath: '/auth/oidc/body', sessionTransport: 'body' }); // Cookie: basePath '/auth/oidc/cookie', sessionTransport 'cookie'.

export const signIn = (): Promise<void> => session.login('/callback?transport=body');

export async function bootstrapBoundAuth(): Promise<void> {
  const url = new URL(location.href);
  const code = url.searchParams.get('code');
  if (code) {
    url.searchParams.delete('code');
    history.replaceState(null, '', url.href);
    await session.exchange(code);
  } else {
    await session.refresh(); // Persisted key; no access-token Authorization/ath.
  }
}

export async function getBoundProfile(): Promise<unknown> {
  const response = await fetchWithDpop(
    { session, apis: [{ origin: backendOrigin, replayNamespace: 'oidc-vault-dpop-example-api' }] },
    `${backendOrigin}/api/profile`,
  );
  if (!response.ok) throw new Error('Protected API request failed.');
  return response.json();
}
export const signOut = (): Promise<void> => session.logout();
```

`login()` atomically creates a non-extractable ES256/P-256 private CryptoKey in IndexedDB **before** POST initiation/navigation; callback, exchange, refresh and API use that same origin/backend/basePath-scoped key. Key loss requires fresh login. Tokens stay in memory; body handles use sessionStorage, cookie handles stay backend-only. Login/exchange always include credentials for the temporary cookie. Cookie-mode refresh uses a per-context promise plus Web Locks/BroadcastChannel winner-token delivery, with current-recognition matching and fresh independent API proofs. All flows require a secure context, Web Crypto, sessionStorage and IndexedDB CryptoKey structured clone; **cookie mode additionally requires Web Locks/BroadcastChannel**. Unsupported capabilities fail explicitly, with no ephemeral-key/Bearer fallback.

`fetchWithDpop` uses mandatory `Authorization: DPoP`, a fresh proof/ath each attempt, exact configured API origins and `redirect: 'error'`. It allows one nonce retry total and at most one refresh/retry for `DPoP error="invalid_token"`; refresh itself has no ath and works after JWT expiry. Mutating methods are single-attempt unless an authorized server-idempotent contract is explicitly selected with `retry: 'idempotent'`; retry-enabled bodies must be replayable. CORS allows explicit origins/credentials and Content-Type/Authorization/DPoP/configured fingerprint, exposing DPoP-Nonce/WWW-Authenticate. See the [example README](https://github.com/egose/web-ts-toolkit/blob/main/apps/oidc-vault-dpop-example/README.md) for exact wire DTOs, external-IdP environment settings, commands and deployment limits.

The example has real redirect/reload/cookie/CORS/key/expiry/retry/tab coverage on **Chromium 151 and Firefox 153**. Its tests use cross-origin **same-site loopback** HTTP. WebKit/Safari is not certified in the recorded environment because required Linux libraries were unavailable; arbitrary HTTPS cross-site/third-party-cookie policies and external IdPs need deployment-specific checks. Browser locks coordinate only the same frontend origin/storage partition/vault scope; they do not supply a distributed backend refresh lease.

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

Core derives `replayKey = 'dpop:v1:' + base64url(SHA-256(JSON([effectiveNamespace, jkt, jti])))` and expiry **`(iat + proofMaxAgeSeconds + clockSkewSeconds) * 1000`**. Vault space is `['vault', normalizedBackendOrigin, normalizedBasePath, exactIssuer, exactClientId]`; API space is `['api', normalizedPublicOrigin, replayNamespace]`. API path prefix is a target correction, not replay partitioning. The 360000ms ceiling includes future iat skew (maximum age 300 + twice skew 30); no duplicate extends its reservation.

Every provider accepts `dpopReplayMaxEntries?: number`, default **100000**, positive safe integer. Capacity is per memory object, Redis prefix, or paired Mongo replay collections, shared across backend clients. Configure the same limit on every shared client. Duplicates return `false` even when full; new reservations throw root-exported `OidcVaultDpopReplayCapacityError` at capacity. Live reservations are never evicted and store failure never permits acceptance. API middleware and all DPoP-bearing vault POSTs map failures/capacity to sanitized `503 OIDC_VAULT_DPOP_REPLAY_UNAVAILABLE`.

| Provider | Admission/expiry work                                                                                                                                                                                                                                                                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Memory   | Map + indexed min-heap; one node per retained key, at most 64 expired nodes plus the requested expired key removed per admission. Heap operations are O(log N); replay never scans session/alias maps. Only callers sharing the same store object share replay state.                                                                                               |
| Redis    | One steady-state cached `EVALSHA`; Redis `TIME` inside Lua controls admission. One sorted set holds key/expiry/capacity state; hard `LIMIT 64` expiry cleanup, duplicate-first admission, no live eviction. Cold/NOSCRIPT calls additionally load/retry the script.                                                                                                 |
| MongoDB  | A snapshot transaction writes one shared capacity/serialization row, checks duplicate IDs, reclaims at most 64 indexed expiry-accounting rows plus the requested expired key, then commits proof/accounting/capacity writes together. Physical proof TTL deletion cannot lose accounting: the separate indexed, non-TTL ledger retains reclaimable expiry evidence. |

Expired entries awaiting bounded cleanup can conservatively occupy capacity. Memory/Redis state is bounded by the configured limit; MongoDB has up to that many proof rows and accounting rows plus one capacity row. Mongo's shared admission row serializes traffic and can contend under load; an ordinary no-cleanup success uses seven data commands plus transaction commit, and a live duplicate uses the capacity write, proof lookup and commit. Cleanup and driver retries add commands. Read/consume and revocation costs are documented in each shipped provider README; these bounds are not latency or throughput guarantees.

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
- `postLogoutRedirectUri` is optional. When configured, it must be an absolute HTTP(S) URL registered with the OIDC provider for post-logout redirects. It may be hosted on a different origin from `frontendRedirectUri` when that exact URL is provider-registered. It is only consulted for redirected logout (`redirect: true`).
- After original identity and any required proof/nonce/replay checks, local logout (`redirect` unset or `false`) never contacts the provider: it revokes the local session lineage, clears the cookie under cookie transport, delivers `onLogout` for a live session, and returns `200 { loggedOut: true }`. Redirected live logout (`redirect: true`) commits the same local outcome before attempting an upstream end-session redirect. Discovery errors are reported through `onError`; errors or an absent `endSessionEndpoint` fall back to local `200 { loggedOut: true }`. Alias-only logout authenticates built-in revocation context and deletes the target lineage without live-session hooks/upstream work. No live target returns idempotent local success without deletion.
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

## Local Access Token Example (unbound Bearer)

The middleware can return a local backend access token during `exchange` and `refresh` by providing a `tokenIssuer`.

This is the default **unbound** example. For bound JWTs use the [complete DPoP server](#complete-dpop-server). Do not put an opaque vault handle into JWT claims if cookie mode is intended to keep it HttpOnly; `sid` below is suitable only when you deliberately expose that handle in body transport.

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
- `tokenType`: exact `'Bearer'` or `'DPoP'`. **Unbound issuance** permits only `'Bearer'` or omission; omitted/undefined stays absent in JSON. **Bound issuance** requires exact `'DPoP'` and a compact signed JWT carrying matching `cnf.jkt`. Null, lowercase, whitespace variants, and a bound Bearer result are invalid.

Only these three fields are copied once into a fresh result. Extra fields (including upstream tokens, `metadata`, `sessionId`, `user`, and `toJSON`) are ignored without evaluating their getters. The vault supplies the response session ID/profile. Omitting `tokenIssuer` is supported and returns no local token fields.

For a bound request, `IssueTokenInput.deviceBinding?: Readonly<OidcVaultVerifiedDpopBinding>` supplies the authoritative frozen `{ type: 'dpop', jkt, alg }` context. Use its `jkt` for the local JWT's `cnf.jkt`; do not infer binding from mutable user/profile data. Core checks this trusted issuer's payload contract by decoding its result, while APIs independently verify the token's signature, issuer, audience, and expiry. Local signing may still use HS256; DPoP proofs use the separately configured asymmetric profile.

Malformed results return HTTP 500 with `{"code":"OIDC_VAULT_INTERNAL_ERROR","message":"Unexpected OIDC vault error."}` inside issuance rollback: the logical lineage is revoked and cookie transport clears its cookie instead of minting one. Exchange has already consumed its code; refresh has already contacted the provider and rotated the handle, and its success notification does not run. Correct the issuer and start a new login. Field-specific diagnostics are the original `hooks.onError` context `error` (narrow it before use); allowed-field getter exceptions also enter rollback.

This projection contains accidental result extensions. Issuers/hooks remain trusted code with request/response access; the issuer receives a detached session and plain profile/provider/metadata containers, while core retains its binding and original rollback lineage. Application profiles and deliberate secrets placed in allowed fields are not redacted.

## Migration And Behavior Changes

- Optional-only endpoint settings previously ignored now select manual mode and fail without the complete manual set. Supply all required manual values or remove endpoint settings to use discovery. Correct malformed optional discovery capabilities at the provider, or omit unsupported fields.
- DPoP remains opt-in: omitted policy preserves unbound behavior; an object defaults to optional, required rejects legacy unbound use. New binding is selected only by proof-aware POST login. Disabling DPoP or omitting later proofs never downgrades existing bound records/JWTs. Recognition remains a separate opt-in with POST-only enrollment; a changed enrolled signal requires fresh login.
- Invalid transaction/code TTLs previously had store-dependent behavior; supply positive safe-integer milliseconds. `sessionTtlMs` is opt-in for new sessions and never renews on refresh. Custom clocks are now sampled during construction.
- Route each session to its owning issuer/client configuration. Known foreign live sessions now fail with 401. Correct inaccurate stored identity only from trusted provenance or require login again; do not remove identity fields to bypass the guard. Legacy omissions and shared code/alias limits remain as described above.
- Issuers must return the declared local credential shape; previously accepted malformed results now fail with rollback. Extra result properties no longer extend/override JSON responses.
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

The proof has protected `{ typ: 'dpop+jwt', alg: 'ES256', jwk: <public-P-256-JWK> }` and signed `htm`, absolute `htu` without query/fragment, integer `iat`, fresh `jti`, and API `ath = base64url(SHA-256(ASCII(accessToken)))`. A configured nonce also supplies the signed `nonce`. Signature verification precedes payload/target/key/hash checks. Private/symmetric/remote-key JWKs, critical headers, wrong key/signature/method/URL/hash, and duplicate/stale/replayed proofs fail. Bounds: compact proof 8192 bytes, decoded protected header/JWK 2048 bytes, printable ASCII JTI 1–128 bytes, nonce at most 512 bytes. Raw duplicate Authorization/DPoP fields and comma-joined credentials/proofs are rejected. Generate at least 128 random bits for every JTI and a new proof for every request/retry.

For optional unbound Bearer requests, an omitted proof stays on the unbound path. If a proof is supplied, it must still pass signature/target/API `ath`/nonce/shared replay and never creates `auth.deviceBinding`.

API replay uses the shared `['api', normalizedPublicOrigin, replayNamespace]` protection space; paths, tokens and instance IDs do not partition it. Use one shared memory-store object only for local single-process testing, or the shared Redis/MongoDB service for multiple processes. Every accepted proof costs an atomic write; configure matching windows/namespaces/capacity/nonce secrets and synchronized clocks on all instances. No implicit replay fallback exists and later hook/route failures never release reservations.

#### API errors and nonce retry

For the default ES256 policy (`algs` lists the configured allowlist in order):

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

Source failures retain `403 OIDC_VAULT_UNTRUSTED_ORIGIN` with `Login request origin is not trusted.` / `Exchange request origin is not trusted.` / `Refresh request origin is not trusted.` / `Logout request origin is not trusted.`. An authenticated provider-error callback returns fixed `400 OIDC_VAULT_CALLBACK_ERROR` / `OIDC callback failed.`. Replay storage failure/capacity is a fail-closed 503 with no auth challenge; invalid/missing proof 401s use `invalid_dpop_proof`, and API nonce 401s use `use_dpop_nonce`. Vault nonce 400s carry the one `DPoP-Nonce` header without `WWW-Authenticate`. Every response retains `no-store`; original errors reach `hooks.onError` or the separate API `onError`, with replay provider diagnostics in `error.cause`.

Recommended separation:

- keep login/session lifecycle in `createOidcVaultMiddleware(...)`
- keep normal API Bearer/DPoP validation in `createOidcVaultAccessTokenMiddleware(...)`
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
