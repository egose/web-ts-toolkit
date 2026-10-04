# `@web-ts-toolkit/oidc-vault-dpop-client`

Browser-only DPoP client for [`@web-ts-toolkit/express-oidc-vault`](../express-oidc-vault/README.md)
vault flows, with `body` and `cookie` session transports. Framework-agnostic
vanilla TypeScript: persistent non-extractable P-256 keys, per-attempt proofs,
bounded nonce/refresh retries, and tab coordination for cookie sessions.

The package ships at an `es2022` bundle target for modern evergreen browsers
(Chrome 94+, Edge 94+, Firefox 93+, Safari 16+, declared via `browserslist`).
It touches browser globals (`crypto.subtle`, `indexedDB`, `sessionStorage`,
and — cookie transport only — `navigator.locks` plus `BroadcastChannel`) lazily
behind runtime feature asserts, never at module import time. There is no
`express`, no `node:*`, and no default export.

## Installation

```sh
pnpm add @web-ts-toolkit/oidc-vault-dpop-client
```

`jose` and `idb` are runtime `dependencies` of this package, not peers: the
single install above is enough. Do not install them separately unless your own
code imports them directly.

## Canonical imports

Named root imports only; no default export, no deep `dist/*` or `src/*` imports.

```ts
import {
  createDeviceFingerprint,
  createDpopProof,
  createOidcVaultDpopSession,
  fetchWithDpop,
  fingerprintJsSignalSource,
  getOrCreateDpopKey,
  OidcVaultDpopClientError,
} from '@web-ts-toolkit/oidc-vault-dpop-client';
import type {
  DpopAccessToken,
  DpopApi,
  DpopFetchContext,
  DpopFetchOptions,
  DpopKey,
  OidcVaultDpopSession,
} from '@web-ts-toolkit/oidc-vault-dpop-client';

export const sessionApi = { createOidcVaultDpopSession, fetchWithDpop };
export type { DpopAccessToken, DpopKey, OidcVaultDpopSession };
```

`DpopNonceCache` and the `DeviceFingerprint` family are also exported from the
root for typed consumption. Non-public coordination helpers
(`withDpopDatabase`, `resolveDpopScope`, cookie-version bookkeeping) stay
internal on purpose: scope to one `backendOrigin` + `basePath` per session and
let the session own key/proof/nonce coordination.

## Quickstart: body transport

One vault mount, one session. `basePath` must equal the backend's exact public
mount (the core default is `/auth/oidc`; the example app mounts
`/auth/oidc/body` and `/auth/oidc/cookie` side by side — pick the one you call).

```ts
import { createOidcVaultDpopSession, fetchWithDpop } from '@web-ts-toolkit/oidc-vault-dpop-client';

const backendOrigin = 'https://api.example.com';
const session = createOidcVaultDpopSession({
  backendOrigin,
  basePath: '/auth/oidc/body',
  sessionTransport: 'body',
});

// A login button calls this; login creates/persists the key BEFORE POST and navigation.
export async function signIn(): Promise<void> {
  await session.login('/callback?transport=body');
}

// On /callback or application bootstrap:
export async function bootstrap(): Promise<void> {
  const url = new URL(location.href);
  const code = url.searchParams.get('code');
  if (code !== null) {
    url.searchParams.delete('code');
    history.replaceState(null, '', url.href);
    await session.exchange(code);
  } else {
    await session.refresh(); // Existing persistent key only; no Authorization/ath.
  }
}

export async function getProfile(): Promise<unknown> {
  const response = await fetchWithDpop(
    { session, apis: [{ origin: backendOrigin, replayNamespace: 'my-app-api' }] },
    `${backendOrigin}/api/profile`,
  );
  if (!response.ok) throw new Error('Protected API request failed.');
  return response.json();
}

export async function signOut(): Promise<void> {
  await session.logout();
}
```

Lifecycle is `login → exchange(code) → getAccessToken()/fetchWithDpop →
refresh → logout`. Vault POSTs carry no `Authorization` and no `ath`, so local
JWT expiry never blocks `refresh`. All vault and API credential responses are
`Cache-Control: no-store`; body handles are tab-local (see
[Storage](#storage)).

## Quickstart: cookie transport

Same session shape, `sessionTransport: 'cookie'`, and the matching cookie
mount. Cookie mode additionally requires **Web Locks** and
**BroadcastChannel** at runtime; unsupported browsers fail explicitly via
`DPOP_TAB_COORDINATION_UNSUPPORTED`.

```ts
import { createOidcVaultDpopSession, fetchWithDpop } from '@web-ts-toolkit/oidc-vault-dpop-client';

const backendOrigin = 'https://api.example.com';
const session = createOidcVaultDpopSession({
  backendOrigin,
  basePath: '/auth/oidc/cookie',
  sessionTransport: 'cookie',
});

export async function signIn(): Promise<void> {
  await session.login('/callback?transport=cookie');
}

export async function bootstrap(): Promise<void> {
  const url = new URL(location.href);
  const code = url.searchParams.get('code');
  if (code !== null) {
    url.searchParams.delete('code');
    history.replaceState(null, '', url.href);
    await session.exchange(code);
  } else {
    await session.refresh(); // Single-flight; winner token shared over BroadcastChannel.
  }
}

export async function getProfile(): Promise<unknown> {
  const response = await fetchWithDpop(
    { session, apis: [{ origin: backendOrigin, replayNamespace: 'my-app-api' }] },
    `${backendOrigin}/api/profile`,
  );
  if (!response.ok) throw new Error('Protected API request failed.');
  return response.json();
}

export async function saveResource(value: string): Promise<unknown> {
  // Mutations are single-attempt unless YOUR operation owns a server-enforced
  // idempotency contract (see Retry policy).
  const response = await fetchWithDpop(
    { session, apis: [{ origin: backendOrigin, replayNamespace: 'my-app-api' }] },
    `${backendOrigin}/api/resource`,
    { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: value, retry: 'idempotent' },
  );
  if (!response.ok) throw new Error('Protected API request failed.');
  return response.json();
}

export async function signOut(): Promise<void> {
  await session.logout();
}
```

Cookie refresh uses one same-origin Web Lock per vault scope plus
`BroadcastChannel` winner-token delivery: a tab adopts a live peer token for up
to 180ms, otherwise it performs its own serialized refresh with the current
browser cookie. Peer adoption still validates payload, key binding, expiry,
generation, and current recognition. Each API call and retry signs its own
fresh proof. Web Locks coordinate tabs of one frontend origin, storage
partition, and vault scope — they are not a backend refresh lease, so other
frontends, devices, or processes can still race upstream refresh families.

## Backend pairing

Configure the vault mount this client calls. `backendOrigin` must be the exact
public origin (scheme + host + port); `basePath` must be the exact public
mount path — trailing slashes are normalized, anything else must match
character-for-character, because the key scope, proof `htu`, and request URL
all derive from it. `use 127.0.0.1` consistently in loopback development:
`localhost` is a different origin and a different key scope.

Backend options that must agree with this client (authoritative wire contract:
[`express-oidc-vault` README](../express-oidc-vault/README.md)):

- `basePath`: the same mount (e.g. `/auth/oidc/body` with `sessionTransport:
'body'`, `/auth/oidc/cookie` with `'cookie'`).
- `trustedOrigins`: list every browser source origin allowed to POST
  login/guarded exchange (both transports) and cookie-authenticated
  refresh/logout. Required for cross-site session cookie transport.
- `transactionCookie.sameSite`: keep the default `lax` for same-site
  deployments. HTTPS cross-site SPAs need explicit `transactionCookie:
{ sameSite: 'none' }`, plus matching session-cookie deployment policy,
  credentialed CORS, and a browser policy that permits third-party cookies.
- `deviceBinding.mode: 'required'` for bound flows, with a shared nonce secret
  when nonces are enabled (`nonce: { secret, lifetimeSeconds }`, ≥32 random
  bytes shared by instances of that protection space).
- The API's `replayNamespace` must equal the `replayNamespace` configured in
  `fetchWithDpop` `apis` entries.

### CORS

The backend must answer credentialed cross-origin browser calls:

| Setting         | Value                                                                           |
| --------------- | ------------------------------------------------------------------------------- |
| Origin          | Echo the exact trusted frontend origin (never `*`)                              |
| `credentials`   | `true`                                                                          |
| Allowed headers | `Content-Type`, `Authorization`, `DPoP`, and the configured fingerprint header  |
| Exposed headers | `DPoP-Nonce`, `WWW-Authenticate` (the client reads nonce challenges from these) |

Vault Origin/Referer checks run independently of CORS. Cookie-authenticated
`refresh`/`logout` require an `Origin` (or valid `Referer`) matching
`backendOrigin` or `trustedOrigins` in every `SameSite` mode.

## Nonce retry rule

When nonces are enabled, a missing/expired nonce returns fixed
`OIDC_VAULT_USE_DPOP_NONCE`: **HTTP 400 at vault POSTs**
(login/exchange/refresh/logout), **HTTP 401 with `DPoP error="use_dpop_nonce"`
at protected APIs**. Both helpers retry **once** with a fresh
proof/`jti`/`iat`/signature/`ath`, then stop: repeated challenges throw
(`DPOP_NONCE_RETRY_EXHAUSTED` on vault POSTs; the API response is returned to
the caller). Nonces are cached in memory per protection space and key; vault
and API spaces are separate. Only `DPoP error="invalid_token"` triggers an API
refresh (at most one refresh/retry cycle); generic 401s, proof errors, 403s,
503s, and network failures never do.

## Storage

| What                                                    | Where                                                     | Lifetime / scope                                                                               |
| ------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Access JWT                                              | Memory only (`getAccessToken()`), never persisted         | Until `expiresAt`; closing every tab discards all tokens                                       |
| Body handle `{ sessionId, jkt }`                        | `sessionStorage`, tab-local                               | Scoped key `oidc-vault-dpop:handle:<scope>`; do not copy across tabs                           |
| Pending-login `jkt` marker                              | `sessionStorage`, survives the IdP navigation             | Cleared at `exchange`; missing marker means fresh login required                               |
| Cookie handle                                           | Backend `HttpOnly` session cookie, never browser-readable | Backend session TTL (example: 8h absolute); no vault `sid` in the JWT payload                  |
| DPoP private `CryptoKey` (non-extractable) + public JWK | IndexedDB object stores                                   | Scope `[frontendOrigin, backendOrigin, normalizedBasePath]`; atomic first-key-wins across tabs |
| Cookie coordination `{ jkt, generation, active }`       | IndexedDB, non-credential metadata only                   | Per scope; BroadcastChannel delivery is transient (≤180ms peer wait)                           |

`sessionStorage` tab-local body handles must not be shared between tabs, and
opener-cloned `sessionStorage` is not a shared-refresh strategy. No tokens or
handles enter `localStorage` or IndexedDB. Crypto runs outside the readwrite
transaction; export of the private key always fails by construction.

## Key loss and errors

Key loss or key change clears frontend auth and requires a fresh login —
`DPOP_KEY_LOST` (`requiresLogin: true`). Only fresh `login()` may create a
missing key; exchange/refresh/API/logout read the existing key and compare its
binding (`cnf.jkt` decode check plus key-equality check). There is no Bearer
fallback and no ephemeral-key fallback. Storage/crypto failures stop the
operation; clear frontend auth and request fresh login.

`OidcVaultDpopClientError` carries a stable `code`, a fixed message (never
keys, credentials, fingerprints, or URLs), `requiresLogin`, and an optional
HTTP `status`. Treat `requiresLogin === true` as "route to sign-in"; enrolled
recognition changes surface as `OIDC_VAULT_FINGERPRINT_REAUTH_REQUIRED` (clear
auth, start fresh POST login, no automatic re-enrollment).

## Credentials matrix

`credentials` is owned by the helpers; callers must not set it.

| Operation            | Body transport                           | Cookie transport                                                   |
| -------------------- | ---------------------------------------- | ------------------------------------------------------------------ |
| `login` / `exchange` | `include` (temporary transaction cookie) | `include` (temporary transaction cookie)                           |
| `refresh` / `logout` | `omit` + `{ sessionId }` JSON body       | `include` + `{}` JSON body (no `sessionId`)                        |
| `fetchWithDpop` API  | `omit` default                           | `omit` default (`include` only for an explicitly cookie-using API) |

Cookie JSON always omits `sessionId`. Every request uses `redirect: 'error'`
and `cache: 'no-store'`. Vault POSTs present no access token; API calls send
`Authorization: DPoP <JWT>` plus a fresh same-key proof with `ath`.

## Retry policy (`fetchWithDpop`)

Scoped `fetch` for exactly the configured API origins: it owns
`Authorization`/`DPoP` (caller-set auth headers throw
`DPOP_AUTH_HEADER_OVERRIDE`), mints a fresh proof per attempt, and accepts only
exact origin matches with a valid `replayNamespace`.

| Method                                    | Default attempts                                                                                                    | Opt-in                                                                                               |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `GET` / `HEAD` / `OPTIONS`                | Retry once on nonce challenge, refresh once on `invalid_token`                                                      | `retry: 'never'` disables retries                                                                    |
| Mutations (`POST` / `PUT` / `DELETE` / …) | **Single attempt**; a nonce challenge on an unsafe mutation is returned to the caller without implicit resubmission | `retry: 'idempotent'` only when the authorized operation owns a server-enforced idempotency contract |

Retry-enabled bodies must be replayable: strings, `URLSearchParams`, `Blob`,
`FormData`, `ArrayBuffer`, and views are snapshotted; streams throw
`DPOP_BODY_NOT_REPLAYABLE` before a retry-enabled request. A custom
`DpopNonceCache` can be shared via `fetchWithDpop({ session, apis, nonces },
…)`. DPoP does not sign bodies/query strings and does not replace API
authorization.

## Optional recognition (opt-in)

Recognition is change detection, not proof of possession and not an API sender
constraint. The helper rereads the current signal on POST login/exchange/refresh
only, persists and caches nothing; `undefined` deliberately means unenrolled.
Pass it to session options only after your application's own collection and
disclosure choice, and scope its header to the configured vault origin.

```ts
import {
  createDeviceFingerprint,
  createOidcVaultDpopSession,
  fingerprintJsSignalSource,
} from '@web-ts-toolkit/oidc-vault-dpop-client';

// Disclosed, low-entropy demo signal. Replace with YOUR current-signal source;
// undefined deliberately means unenrolled.
const fingerprint = createDeviceFingerprint(async () => undefined);

export function createSessionWithRecognition(backendOrigin: string) {
  return createOidcVaultDpopSession({ backendOrigin, basePath: '/auth/oidc', fingerprint });
}

// If YOUR frontend opts into installing @fingerprintjs/fingerprintjs:
// import FingerprintJS from '@fingerprintjs/fingerprintjs';
// const vendorSource = fingerprintJsSignalSource(() => FingerprintJS.load());
// const vendorFingerprint = createDeviceFingerprint(vendorSource);
```

The server enrolls only a supplied login signal and compares before
exchange/refresh mutation. Enrolled omission/mismatch gives fixed **403
`OIDC_VAULT_FINGERPRINT_REAUTH_REQUIRED`**: clear frontend auth and start a
fresh POST login. Logout and API calls send no signal. Hashing is not
anonymization; raw signals are never logged.

## Safari and cross-site limits

- Cookie transport needs Web Locks + `BroadcastChannel`; Safari 16+ declares
  support, but third-party-cookie blocking still applies to cross-site HTTPS
  deployments — verify your deployment's browser policy instead of assuming
  portability. The recorded browser evidence is **Chromium 151 + Firefox 153**
  on same-site loopback HTTP; **WebKit/Safari is uncertified** in the Linux
  test environment.
- Same-site subdomains can use Lax cookies with credentialed cross-origin
  requests; cross-origin does not itself mean cross-site. Cross-site SPAs need
  HTTPS, `transactionCookie: { sameSite: 'none' }`, compatible session-cookie
  settings, and `trustedOrigins` covering the frontend.
- Stateless JWTs remain valid until expiry unless the application adds
  revocation; `logout` revokes vault refresh state. Non-extractability prevents
  key export, not same-browser XSS signing.

## Framework examples (TypeScript)

Minimal runnable demos live in `apps/`; each runs its own backend + IdP
fixture on dedicated ports so all three can run simultaneously:

| Demo                           | App                                    | SPA                     | Backend                 | IdP                     |
| ------------------------------ | -------------------------------------- | ----------------------- | ----------------------- | ----------------------- |
| React 19                       | `apps/oidc-vault-dpop-react-example`   | `http://127.0.0.1:4320` | `http://127.0.0.1:4330` | `http://127.0.0.1:4331` |
| Vue 3 (SFC, `vue-tsc`)         | `apps/oidc-vault-dpop-vue-example`     | `http://127.0.0.1:4321` | `http://127.0.0.1:4340` | `http://127.0.0.1:4341` |
| Angular 22 (standalone, `ngc`) | `apps/oidc-vault-dpop-angular-example` | `http://127.0.0.1:4322` | `http://127.0.0.1:4350` | `http://127.0.0.1:4351` |

```sh
pnpm --filter oidc-vault-dpop-react-example dev:server # + dev
pnpm --filter oidc-vault-dpop-vue-example dev:server # + dev
pnpm --filter oidc-vault-dpop-angular-example dev:server # + dev
```

Each `dev:server` reuses `apps/oidc-vault-dpop-example/server` with
`FRONTEND_ORIGIN`/`PORT`/`IDP_PORT`/`BACKEND_ORIGIN` overrides (explicit env
wins over `--env-file`). All demos use body transport, a lazy session
singleton, and no client router — the callback is the same page reading
`?code=` once on boot.

## API reference

- `createOidcVaultDpopSession(options)` → `OidcVaultDpopSession`
  (`login`/`exchange`/`refresh`/`logout`/`getAccessToken`/`getKey`/`clear`/`dispose`).
  Options: `backendOrigin`, `basePath` (default `/auth/oidc`),
  `sessionTransport` (`'body'` default | `'cookie'`), optional `fingerprint`,
  injectable `fetch`/`navigate`/`now` for tests.
- `fetchWithDpop({ session, apis, fetch?, nonces?, now? }, input, options?)` →
  `Promise<Response>`. `apis: DpopApi[]` pins `{ origin, replayNamespace,
credentials? }`.
- `getOrCreateDpopKey(scope, { create? })`, `createDpopProof(key, input)`,
  `DpopNonceCache`, `createDeviceFingerprint(source, { headerName? })`,
  `fingerprintJsSignalSource(load)`, `OidcVaultDpopClientError`.
- Types: `DpopKey`, `DpopKeyScope`, `DpopProofInput`, `DpopAccessToken`,
  `DpopFetchContext`, `DpopFetchOptions`, `DpopApi`,
  `OidcVaultDpopSession(Options)`, `DeviceFingerprint(Options)`,
  `DeviceFingerprintSignalSource`, `FingerprintJsAgent`. Wire DTOs stay
  single-sourced from `@web-ts-toolkit/express-oidc-vault` as types.

Worked end-to-end example (Vite SPA + Express vault/API + local OIDC
provider, both transports, real-browser evidence):
[`apps/oidc-vault-dpop-example`](../../apps/oidc-vault-dpop-example/README.md).
Migrating from the pre-publish copy: replace `copy src/auth/` + `pnpm add
jose idb` with `pnpm add @web-ts-toolkit/oidc-vault-dpop-client`, rewrite
`from './auth…'` imports to the package root, and keep `basePath` on the exact
`/body` vs `/cookie` mount you call.
