# OIDC vault DPoP example

Private workspace **`oidc-vault-dpop-example`**: a Vite/TypeScript SPA, Express vault/API server, and deterministic local OIDC provider. The browser consumes the published client `@web-ts-toolkit/oidc-vault-dpop-client` like any other consumer. The backend uses named imports from `@web-ts-toolkit/express-oidc-vault` and its memory store.

## Run it

Requirements: Node **>=22.12.0**, pnpm from the repository, and a secure-context browser supporting Web Crypto and IndexedDB `CryptoKey` structured clone. Cookie mode also requires **Web Locks** and **BroadcastChannel**; unsupported features fail explicitly in the UI.

From the repository root:

```sh
pnpm install

# Terminal 1: builds the two backend dependencies, then watches the Express server.
pnpm --filter oidc-vault-dpop-example dev:server

# Terminal 2: Vite SPA.
pnpm --filter oidc-vault-dpop-example dev
```

Open **http://127.0.0.1:4317/?transport=body** or **http://127.0.0.1:4317/?transport=cookie**. Click **Sign in**, then **Continue as the fixture user** on the local IdP document. The fixed user is `fixture@example.test`; PKCE, state, nonce, real RSA-signed ID tokens, callback navigation and single-use upstream refresh tokens still run. The local IdP listens on port **4319**, backend **4318**, SPA **4317**. Use `127.0.0.1` consistently: `localhost` is a different origin/key scope.

The JWT lasts **30 seconds**; the vault session has an **8-hour absolute lifetime**. Try API, refresh after JWT expiry, page reload, a second cookie-mode tab, logout, or deleting the SPA's IndexedDB data and signing in again. Optional recognition is unchecked by default.

```sh
# Dependencies before this app; builds/typechecks are serialized.
pnpm --filter oidc-vault-dpop-example... build
pnpm --filter oidc-vault-dpop-example start:server
# Another terminal, built SPA:
pnpm --filter oidc-vault-dpop-example preview

pnpm --filter oidc-vault-dpop-example typecheck
pnpm --filter oidc-vault-dpop-example lint
pnpm --filter oidc-vault-dpop-example test
```

`build` emits `dist/client/` and `dist/server/index.mjs`. The server bundles local relative imports for plain Node ESM. `test` prebuilds this app and its dependencies, then runs Node unit/integration tests and real Chromium browser tests sequentially.

## Browser verification

```sh
pnpm --filter oidc-vault-dpop-example exec playwright install chromium firefox
pnpm --filter oidc-vault-dpop-example test:unit
pnpm --filter oidc-vault-dpop-example test:browser
DPOP_TEST_BROWSERS=chromium,firefox pnpm --filter oidc-vault-dpop-example test:browser
```

The Node/Vitest controller drives **actual Playwright pages**, with dynamic loopback ports, a real IdP document, backend redirects, browser cookie jars and cross-origin CORS. Tests inspect real IndexedDB keys, prove private-key export failure and persistence, and race first creation and refresh across tabs. There is no fake IndexedDB acceptance evidence. WebKit can be selected with `DPOP_TEST_BROWSERS=webkit` after installing that browser and its Linux dependencies; unavailable engines fail the run rather than silently skip certification.

## Use the published browser client

Install the published browser client in your frontend — it brings `jose` and
`idb` as runtime dependencies — and use the named root exports. There is no
`src/auth/` copy anymore: this app consumes
`@web-ts-toolkit/oidc-vault-dpop-client` (workspace link here, registry
elsewhere) exactly as documented in
[its README](../../packages/oidc-vault-dpop-client/README.md). The DTOs stay
single-sourced from `@web-ts-toolkit/express-oidc-vault` as types inside the
package; Express is absent from the browser runtime graph.

```sh
pnpm add @web-ts-toolkit/oidc-vault-dpop-client
```

```ts
import { createOidcVaultDpopSession, fetchWithDpop } from '@web-ts-toolkit/oidc-vault-dpop-client';

const backendOrigin = 'http://127.0.0.1:4318';
const session = createOidcVaultDpopSession({
  backendOrigin,
  basePath: '/auth/oidc/body',
  sessionTransport: 'body', // Use /auth/oidc/cookie and 'cookie' together.
});

// A login button calls this; login creates/persists the key BEFORE POST and navigation.
export async function signIn(): Promise<void> {
  await session.login('/callback?transport=body');
}

// On /callback or application bootstrap:
export async function bootstrap(): Promise<void> {
  const url = new URL(location.href);
  const code = url.searchParams.get('code');
  if (code) {
    url.searchParams.delete('code');
    history.replaceState(null, '', url.href);
    await session.exchange(code);
  } else {
    await session.refresh(); // Existing persistent key only; no Authorization/ath.
  }
}

export async function getProfile(): Promise<unknown> {
  const response = await fetchWithDpop(
    { session, apis: [{ origin: backendOrigin, replayNamespace: 'oidc-vault-dpop-example-api' }] },
    `${backendOrigin}/api/profile`,
  );
  if (!response.ok) throw new Error('Protected API request failed.');
  return response.json();
}

export async function signOut(): Promise<void> {
  await session.logout();
}
```

The four intended client APIs are `getOrCreateDpopKey`, `createDpopProof`, `createOidcVaultDpopSession` (`login`, `exchange`, `refresh`, `logout`) and `fetchWithDpop`. They are exported by the package root. For your own backend mount, set `basePath` to its exact public path (the core default is `/auth/oidc`). The example server uses separate `/body` and `/cookie` suffixes and cookie names to exercise both transports.

### Key, token and tab lifecycle

- ES256/P-256 private `CryptoKey`, **non-extractable**, plus public-only JWK in IndexedDB. Storage is scoped to `[frontendOrigin, backendOrigin, normalizedBasePath]`. Crypto runs outside the readwrite transaction; an atomic read/add chooses one first key across tabs. Only fresh `login()` may create a missing key. Exchange/refresh/API/logout read the existing key and compare its binding. Key loss/change clears frontend auth and requires a fresh login; there is no Bearer or ephemeral-key fallback.
- Access JWTs live **only in memory**. Body transport stores only `{ sessionId, jkt }` in scoped `sessionStorage`; cookie handles remain backend HttpOnly cookies. A short-lived pending-login jkt marker survives navigation in `sessionStorage`. No tokens or handles enter `localStorage` or IndexedDB.
- Cookie mode uses one same-origin Web Lock per vault scope for exchange/refresh/logout/clear, and an in-context refresh promise. IndexedDB holds only non-credential `{ jkt, generation, active }` coordination metadata. BroadcastChannel transiently delivers the winner JWT to matching key/current-recognition contexts; late generations are rejected. A tab requests a live peer token for up to 180ms, then performs a serialized refresh with the current browser cookie if the peer is absent. Each API call/retry still signs its **own fresh proof**. Closing every tab discards all tokens; a reload refreshes with the persisted key/cookie.
- Body handles are tab-local. Do not copy a live handle between tabs or use opener-cloned `sessionStorage` as a shared-refresh strategy. Cookie coordination requires the same frontend origin, backend, basePath and browser partition. Web Locks are client coordination, **not a backend refresh lease**; other frontends/devices/processes can still race upstream refresh families. An uncertain network result or absent token-delivery peer can require another serialized refresh.

### Proofs and retry policy

Every attempt has fresh random `jti` (base64url of **128 Web Crypto random bits**), current integer `iat`, exact uppercase `htm`, canonical absolute `htu` without query/fragment, and `{ typ: 'dpop+jwt', alg: 'ES256', jwk: publicJwk }`. Target normalization matches the backend's case/default-port/dot-segment/unreserved-escape rules and preserves reserved escapes. API proofs alone have `ath = base64url(SHA-256(ASCII(token)))`.

`fetchWithDpop` accepts **exact configured API origins**, owns Authorization/DPoP, uses `redirect: 'error'`, and defaults API credentials to `'omit'` (explicit `'include'` only for a configured cookie-using API). It requires `tokenType: 'DPoP'` and matching `cnf.jkt`; response decoding checks the trusted server contract, while the backend API independently verifies JWT signatures/issuer/audience/expiry. Bound tokens never fall back to Bearer.

There is **one nonce retry total** and **at most one refresh/retry cycle**, with new proof/JTI/iat/signature/ath on each attempt. Only `DPoP error="invalid_token"` causes an API refresh, never generic 401/proof errors/403/503/network failures. Repeated challenges stop. Nonces are cached in memory per protection space/key; vault and API spaces are separate. Vault POSTs have no Authorization or ath, so local JWT expiry cannot block refresh.

GET/HEAD/OPTIONS are retryable. Mutating methods default to **one attempt**. Opt into `retry: 'idempotent'` only when the application's authorized operation has a server-enforced idempotency contract. `retry: 'never'` disables retries. Replayable strings, URLSearchParams, Blob, FormData and ArrayBuffer/views are snapshotted for retries; streams are rejected before a retry-enabled request. A nonce challenge on an unsafe mutation is returned to the caller without implicit resubmission. DPoP does not sign bodies/query strings or replace API authorization.

## Actual server wire

For `<mount> = /auth/oidc/body` or `/auth/oidc/cookie`:

| Request                 | Body / credentials / proof                                                                                          | Success                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `POST <mount>/login`    | JSON `{ returnTo? }`, **include** temporary cookie credentials in both transports, fresh DPoP, optional fingerprint | `200 { authorizationUrl }`; navigate                                                           |
| `GET <mount>/callback`  | IdP top-level navigation + temporary HttpOnly transaction cookie, **no proof header**                               | Redirect to frontend `?code=`                                                                  |
| `POST <mount>/exchange` | JSON `{ code }`, **include** credentials in both transports, original key DPoP, optional current fingerprint        | `200 { accessToken, tokenType: 'DPoP', expiresIn, user, sessionId? }`; clears temporary cookie |
| `POST <mount>/refresh`  | Body `{ sessionId }` + omit credentials, or cookie `{}` + **include**, original key DPoP, current fingerprint       | Same result; rotates handle/cookie                                                             |
| `POST <mount>/logout`   | Same handle/cookie transport, original key DPoP, **no fingerprint/ath/Authorization**                               | `200 { loggedOut: true }`                                                                      |
| `GET /api/profile`      | `Authorization: DPoP <JWT>` + fresh original-key proof/**ath**                                                      | `200 { subject, scope, binding }`                                                              |

Cookie JSON always omits `sessionId`. The local issuer also omits the vault handle from the browser-readable JWT payload (no vault `sid` claim), preserving the cookie's HttpOnly boundary. The example always configures a local issuer; the core also supports no issuer, but this SPA deliberately requires a DPoP JWT response. Browser proofs are never forwarded to the IdP; upstream tokens remain Bearer/server-held. All vault and protected API credential responses are `Cache-Control: no-store`.

CORS uses explicit frontend origins and credentials, allows **Content-Type, Authorization, DPoP, X-Device-Fingerprint**, and exposes **DPoP-Nonce / WWW-Authenticate**. Vault Origin/Referer checks run independently. Missing/expired nonce returns fixed `OIDC_VAULT_USE_DPOP_NONCE`, **400** at vault POSTs / **401** at APIs, before mutation; clients retry once. Same-site loopback origins use Lax HttpOnly cookies. HTTPS cross-site deployment needs explicit `transactionCookie: { sameSite: 'none' }`, session cookie deployment policy and compatible third-party-cookie settings. The example's Linux browser checks cover cross-origin **same-site** HTTP loopback, not third-party-cookie permission on arbitrary cross-site HTTPS deployments.

## Optional recognition and privacy

The package's `createDeviceFingerprint` is the preserved DBJWT-09 generic adapter (see the client README's recognition section). It rereads the current signal on POST login/exchange/refresh and persists/caches no identifier. The unchecked demo source in `src/recognition.ts` collects only `navigator.language` and `navigator.platform`; it is deliberately low-entropy/copyable, not a unique device ID, PoP or API sender constraint. The UI discloses purpose and retention before opting in.

```ts
import { createDeviceFingerprint } from '@web-ts-toolkit/oidc-vault-dpop-client';

// If YOUR frontend opts into installing @fingerprintjs/fingerprintjs:
// import FingerprintJS from '@fingerprintjs/fingerprintjs';
// import { fingerprintJsSignalSource } from '@web-ts-toolkit/oidc-vault-dpop-client';
// const fingerprint = createDeviceFingerprint(
//   fingerprintJsSignalSource(() => FingerprintJS.load()),
// );

const fingerprint = createDeviceFingerprint(async () => {
  // Obtain YOUR disclosed current signal; undefined deliberately means unenrolled.
  return undefined;
});
// Pass { fingerprint } to createOidcVaultDpopSession.
```

The server enrolls only a supplied login signal, stores SHA-256 in reserved metadata, and compares before exchange/refresh mutation. Enrolled omission/mismatch gives fixed **403 `OIDC_VAULT_FINGERPRINT_REAUTH_REQUIRED`**: clear frontend auth and start fresh POST login, without automatic tolerance or re-enrollment. Peer-token delivery also requires matching **current** recognition; missing/changed cookie-tab signals reach the backend and cannot skip the check by borrowing a winner token. A transient recognition marker is in memory/channel only, never persisted or emitted in JWT/user/error/log fields.

Hashing is not anonymization. Backend enrollment retention follows the transaction TTL, then the 8-hour session limit plus store cleanup/backups; raw signals and private credentials are not logged. Logout does not need recognition. Non-extractability prevents key export, not same-browser XSS signing. Logout revokes vault refresh state; stateless JWTs remain valid until expiry unless application revocation is added.

## Configure an external development IdP

`.env.example` lists server and Vite settings; `dev:server` / `start:server` load `.env` if present, and Vite loads its own `VITE_*` entries. Select `IDP_MODE=external`, then set `OIDC_ISSUER`, `OIDC_CLIENT_ID`, optional `OIDC_CLIENT_SECRET` and scopes. Issuer discovery is the default; manual mode requires all authorization/token/JWKS endpoints. Register these exact callback URLs with the IdP:

```text
http://127.0.0.1:4318/auth/oidc/body/callback
http://127.0.0.1:4318/auth/oidc/cookie/callback
```

Use `BACKEND_ORIGIN`, `FRONTEND_ORIGIN`, `VAULT_BASE_PATH` and matching `VITE_BACKEND_ORIGIN` / `VITE_VAULT_BASE_PATH` for a different deployment. Local nonce/JWT secrets are freshly random per server startup unless configured as canonical base64url of >=32 random bytes (`LOCAL_JWT_SECRET`, `DPOP_NONCE_SECRET`). Restarting this memory-store server requires fresh login. `DPOP_NONCES=off` restores the core's default nonce-off policy. External-IdP availability and cross-site deployment are application checks; automated tests use only their owned local fixture.

The core's shipped README also contains a complete bound server and a standalone body-transport browser recipe for installed consumers. This private app adds full cookie-tab coordination and executable browser evidence. The independent integration review is **DBJWT-12** in `docs/tasks/20261002-125749-express-oidc-vault-device-bound-jwt.md`.
