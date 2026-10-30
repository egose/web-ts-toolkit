# OIDC vault DPoP example

Workspace demo **`oidc-vault-dpop-example`**: a Vite/TypeScript SPA, Express vault/API server, and deterministic local OIDC provider. The browser consumes the published client `@web-ts-toolkit/oidc-vault-dpop-client` like any other consumer. The backend uses named imports from `@web-ts-toolkit/express-oidc-vault` and its memory store.

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

The JWT lasts **30 seconds**; the vault session has an **8-hour absolute lifetime**. Try API, refresh after JWT expiry, page reload, a second cookie-mode tab, **Log out locally**, or **Log out and visit provider**. The latter commits a provider logout document with a registered return link, even after local JWT expiry. The browser tests also exercise corrupt-key recovery with the public `resetKey()` API. Optional recognition is unchecked by default.

```sh
# Dependencies before this app; builds/typechecks are serialized.
pnpm --workspace-concurrency=1 --filter oidc-vault-dpop-example... build
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

`test/browser/bearer.browser.ts` extends this same lane with explicit Bearer in
both transports against **optional binding** on the owned local vault/API. The
harness alone swaps the entry for `test/browser/bearer-entry.ts` when `dpop=0` is
requested; that entry reuses `page-bridge.ts` and is not part of the production
build. `fixtureDeviceBindingMode: 'optional'` is effective only with `fixture: true`.
Normal server/SPA defaults remain **required DPoP**, not a public Bearer toggle.

The fixture checks real IdP/PKCE/callback navigation, Bearer-only API headers,
no vault Authorization/proof, no DPoP key creation/read/signing, body flow without
IndexedDB/CryptoKey, cookie metadata without keys, reload, expiry/API-challenge
refresh, expired-token ordinary logout, native tab winner/observer delivery and
bidirectional mode replacement under the **same historical lock**. Required-binding
rejection never falls back to GET login or DPoP. Existing DPoP/security/provider-
navigation suites remain enabled. Chromium/Firefox loopback checks do not certify
Safari/WebKit, arbitrary cross-site cookies or suspended-tab scheduling.

## Use the published browser client

Install the published browser client in your frontend — it brings `jose` and
`idb` as runtime dependencies — and use the named root exports. There is no
`src/auth/` copy anymore: this app consumes
`@web-ts-toolkit/oidc-vault-dpop-client` (workspace link here, registry
elsewhere) exactly as documented in
[its README](../../packages/oidc-vault-dpop-client/README.md). The DTOs stay
single-sourced from the pure `@web-ts-toolkit/express-oidc-vault/wire` entry at
build time. The client bundles its needed declarations; browser consumers need
no backend runtime, Express augmentation or Node ambient types.

```sh
pnpm add @web-ts-toolkit/oidc-vault-dpop-client
```

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
  sessionTransport: 'body', // Use /auth/oidc/cookie and 'cookie' together.
  requestTimeoutMs: 15_000,
  maxResponseBytes: 1_048_576,
});

// A login button calls this; login creates/persists the key BEFORE POST and navigation.
export async function signIn(): Promise<void> {
  await session.login('/callback?transport=body');
}

// On /callback or application bootstrap:
export async function bootstrap(): Promise<'ready' | 'sign-in'> {
  try {
    const url = new URL(location.href);
    const code = url.searchParams.get('code');
    if (code !== null) {
      url.searchParams.delete('code');
      history.replaceState(null, '', url.href);
      await session.exchange(code);
    } else {
      await session.refresh(); // Existing persistent key only; no Authorization/ath.
    }
    return 'ready';
  } catch (error) {
    if (error instanceof OidcVaultDpopClientError && error.requiresLogin) return 'sign-in';
    throw error; // Retain state on recoverable failures; no blanket retry.
  }
}

export async function getProfile(signal?: AbortSignal): Promise<unknown> {
  const response = await fetchWithDpop(
    { session, apis: [{ origin: backendOrigin, pathPrefix: '/api', replayNamespace: 'oidc-vault-dpop-example-api' }] },
    `${backendOrigin}/api/profile`,
    { signal },
  );
  if (!response.ok) throw new Error('Protected API request failed.');
  return response.json();
}

export async function signOut(): Promise<void> {
  await session.logout();
}

// Server logoutNavigation is enabled in this example; the client owns proof,
// nonce retry, confirmed cleanup, URL validation and top-level navigation.
export async function signOutThroughProvider(): Promise<void> {
  await session.logoutAndNavigate();
}

// An application's explicit recovery action when an existing key is unusable.
export async function recoverBrowserKey(): Promise<void> {
  await session.resetKey();
  await signIn();
}
```

The client root exports the session/fetch factories, key/proof helpers,
`DpopNonceCache`, recognition helpers, errors and their public types. Session
methods include `login`, `exchange`, `refresh`, `logout`, `logoutAndNavigate`, `getAccessToken`,
`getKey`, `clear`, `resetKey` and `dispose`. For your own backend mount, use its
exact public `basePath` (default `/auth/oidc`). The example server uses separate
`/body` and `/cookie` suffixes and cookie names to exercise both transports.

### Key, token and tab lifecycle

The following key/proof sections describe the **default DPoP** demo. The client
also supports the explicit opt-out below; changing mode needs a fresh login.

- ES256/P-256 private `CryptoKey`, **non-extractable**, plus public-only JWK in IndexedDB. Storage is scoped to `[frontendOrigin, backendOrigin, normalizedBasePath]`. Crypto runs outside the readwrite transaction; an atomic read/add chooses one first key across tabs. Only fresh `login()` may create a missing key. Exchange/refresh/API/logout read the existing key and compare its binding. Key loss/change clears frontend auth and requires a fresh login; there is no Bearer or ephemeral-key fallback.
- Access JWTs live **only in memory**. Body transport stores only `{ sessionId, jkt }` in scoped `sessionStorage`; cookie handles remain backend HttpOnly cookies. A short-lived pending-login jkt marker survives navigation in `sessionStorage`. No tokens or handles enter `localStorage` or IndexedDB.
- Both transports use an invocation-order lifecycle FIFO, with refresh sharing until an intervening mutation. Cookie mode adds one same-origin Web Lock per vault scope for lifecycle mutations/cleanup. IndexedDB holds only non-credential `{ jkt, generation, active }` metadata. BroadcastChannel transiently delivers the live winner JWT to matching key/current-recognition contexts; late generations are rejected. A tab waits up to 180ms for a peer before its own serialized refresh. Each API attempt still signs its **own fresh proof**. Closing all tabs discards tokens; a reload refreshes with the persisted key/cookie.
- Body handles are tab-local. Do not copy a live handle between tabs or use opener-cloned `sessionStorage` as a shared-refresh strategy. Cookie coordination requires the same frontend origin, backend, basePath and browser partition. Web Locks are client coordination, **not a backend refresh lease**; other frontends/devices/processes can still race upstream refresh families. An uncertain network result or absent token-delivery peer can require another serialized refresh.

`clear()` immediately invalidates local auth/owned vault HTTP but preserves the
key; `dispose()` closes a context and preserves committed reload state;
`resetKey()` invalidates old work then atomically deletes only this scope's key
and cookie metadata. Await clear/reset before disposal if persistence must finish.
An existing corrupt key needs explicit reset-then-login; normal login alone
cannot repair it. Reset is local, makes no HTTP call, creates no key, leaves other
scopes intact, and preserves the historical `oidc-vault-dpop-example-v1` DB/schema.
Old sessions/JWTs need server revocation/expiry, and other contexts sharing the
removed key need fresh login. `logout()` and `logoutAndNavigate()` request server sign-out.

### Explicit Bearer in an application

Omitted/true `dpop` keeps DPoP. Literal `dpop: false` selects immutable keyless
Bearer, never automatic fallback; changing options/challenges cannot change it.
These remain **app-local credentials, not IdP access/ID/refresh tokens**. Theft
permits Bearer replay. Tokens stay memory-only; APIs independently validate and
authorize unbound tokens. Use optional vault binding (primary target), or disabled
binding with recognition's guarded POST-login route. Disabled binding **without**
recognition is unsupported (no legacy GET fallback); required vault/API binding
rejects Bearer. This is not a change to this demo's required-DPoP defaults.

```ts
import {
  createOidcVaultDpopSession,
  fetchWithDpop,
  OidcVaultDpopClientError,
  type BearerAccessToken,
  type OidcVaultBearerSessionOptions,
} from '@web-ts-toolkit/oidc-vault-dpop-client';

const backendOrigin = 'https://api.example.com'; // Your optional-binding vault/API.
let view: BearerAccessToken | undefined;
const options: OidcVaultBearerSessionOptions = {
  backendOrigin,
  basePath: '/auth/oidc/body',
  sessionTransport: 'body',
  dpop: false,
  autoRefresh: { refreshBeforeExpiryMs: 60_000 }, // Optional, default off.
  onCredentialsChanged: (credentials) => {
    view = credentials;
  },
  onAutoRefreshError: () => {
    /* Show paused-refresh recovery, never auto-login. */
  },
};
const session = createOidcVaultDpopSession(options);
export const readView = () => view;
export const signIn = () => session.login('/callback');
export const signOut = () => session.logout();
export const refresh = (): Promise<BearerAccessToken> => session.refresh();
export async function bootstrap(): Promise<'ready' | 'sign-in'> {
  try {
    const url = new URL(location.href);
    const code = url.searchParams.get('code');
    if (code !== null) {
      url.searchParams.delete('code');
      history.replaceState(null, '', url.href);
      await session.exchange(code);
    } else await session.refresh();
    return 'ready';
  } catch (error) {
    if (error instanceof OidcVaultDpopClientError && error.requiresLogin) return 'sign-in';
    throw error;
  }
}
export const loadProfile = () =>
  fetchWithDpop({ session, apis: [{ origin: backendOrigin, pathPrefix: '/api' }] }, `${backendOrigin}/api/profile`);
```

The inline false literal infers the same Bearer observer/session; no `jkt` exists.
For a runtime boolean use `OidcVaultSessionOptions`, observe
`OidcVaultAccessToken | undefined`, narrow `tokenType` for jkt and `session.dpop`
for mode-only methods. Only definitely-Bearer API contexts may omit namespaces;
supplied ones are validated but unused. The shipped README includes the runtime-
boolean + observer/autoRefresh example, compiled against the installed tarball.

Bearer has no `getKey`, `resetKey` or `logoutAndNavigate` in its interface; runtime
probes reject fixed nonterminal `DPOP_OPERATION_UNSUPPORTED` before side effects.
Ordinary logout works after app-token expiry. Body needs secure-context digest/UUID
and sessionStorage, not IndexedDB/CryptoKey; cookie still needs IndexedDB metadata,
Web Locks and BroadcastChannel. Transaction cookies, trusted-origin/Origin/Referer
checks, credentialed CORS, scoped headers, HTTP bounds and unsafe-mutation retry
rules remain. Bearer has no nonce processing: at most two API attempts and one
shared refresh budget (including initial acquisition), only for valid active-scheme
HTTP-401 `invalid_token` when retry policy permits.

Direct token type may be exact Bearer or omitted/undefined (normalized only here).
Header-safe opaque tokens work; exactly-three-segment tokens reserve canonical
signed JWT validation, reject malformed/unsigned/`b64: false`/present `cnf`, and
clamp by optional safe `exp`. Zero lifetime retains handles, not live API tokens.
Decoding is not authentication. Cookie metadata records actual mode/generation,
not a fake jkt; missing-mode historical data remains DPoP-only. Same-mode peer
admission rechecks expiry/recognition/current metadata; opposite modes cannot adopt
tokens or clear successors. No key/database migration or split cookie lock.

**Upgrade/close/reload unmodified older tabs before switching** a shared cookie
authority, then fresh login. Mixed old-client/mixed-mode coexistence is unsupported;
independent concurrent modes need distinct backend cookie authorities. Coordination
remains frontend-origin/storage-partition scoped, not a distributed refresh lease.
Neither mode replacement nor logout immediately revokes issued stateless JWTs.

### Provider logout navigation

**DPoP only.** The server opts into `logoutNavigation` with a fixed per-transport fallback
`/signed-out?transport=<body|cookie>&fallback=1` and registered provider return
`/signed-out?transport=<body|cookie>` on the frontend origin. The local IdP advertises
an end-session endpoint, validates the bounded signed original ID-token hint and
exact registered return, and commits a logout document before the user returns.
The server uses public `createOidcVaultJwtAccessTokenIssuer` for local JWTs;
application claims remain in its small mapper, with no vault `sid` in cookie mode.

`logoutAndNavigate()` uses the existing persistent key and current handle/cookie,
without refreshing or requiring a memory JWT. Active matching cookie metadata is
required. POST goes through existing finite HTTP/proof/nonce machinery (one fresh
nonce retry); the only returned URL is the exact pinned backend continuation,
bare or with one canonical opaque ticket. No API token in a query or upstream URL
in JSON. The default synchronous navigation adapter stays under FIFO/cookie-lock
authority. Double-clicks share one Promise/adapter call; later login/exchange/local
logout/clear/reset/dispose withdraws the old navigation intent, including queued login.

Confirmed local logout clears old state even when the URL is invalid, then rejects
with nonterminal `INVALID_LOGOUT_NAVIGATION_RESPONSE`. Lost/unconfirmed responses
retain transport uncertainty with no automatic mutation retry or navigation.
Provider discovery/missing endpoint/ticket failures select the static fallback;
replaying a ticket also falls back. Local revocation precedes all provider work.
Tickets default to 60 seconds (server range 1–120 seconds), store only a bounded
final upstream hint URL server-side until consume/expiry/cleanup, and authorize one
continuation. Navigation URLs remain history/proxy-log/IdP exposures. After handoff
to an unavailable/rejecting IdP, termination/return cannot be guaranteed. Stateless
JWTs remain valid until expiry unless the application adds revocation.

Chromium and Firefox tests cover both transports, actual main-frame provider/return
documents, expired and missing memory JWTs, nonce/coalescing/FIFO, held native
response/IDB/Web Lock boundaries, discovery/missing-endpoint/consume fallback,
malicious URLs, response loss and replay. Browser evidence is same-site loopback
HTTP; external IdPs, arbitrary cross-site cookies and Safari/WebKit need separate checks.

### Composed application integration

[`test/application-integration.test.ts`](test/application-integration.test.ts)
is a small public-package consumer combining the JWT issuer's subject/claim
mappers, an application-user approval callback, optional `/api/session`, and
required authentication/device-binding guards. Both body and cookie cases perform
exchange, API enrichment and one-time navigation logout over HTTP. Three chained
compatible guards use one replay reservation and one enrichment. A disabled
application account is explicitly denied; a wrong-target proof never reaches
application-user approval. Only the test HTTP driver supplies proofs/cookies; the
SPA uses `session.logoutAndNavigate()` and the real-browser lane above proves its
top-level navigation.

The fixture also shows application-owned telemetry correlation: generate a request
ID with `AsyncLocalStorage`, capture it synchronously beside redacted library
events, then join it with the allowlisted user ID from successful application
mapping. Its IdP subject deliberately differs from its local JWT subject. Opaque
subject/session hashes alone cannot perform that database-user mapping, and early
or rejected proof observations are not authenticated-user audit records. No proof
decoding, error-message regex, response interception, provider discovery or cookie
parsing is part of the application observer. The fixture's in-memory sink is
test-only; production retention, bounded persistence and account linking belong to
the host application.

### Proofs and retry policy

Every attempt has fresh random `jti` (base64url of **128 Web Crypto random bits**), current integer `iat`, exact uppercase `htm`, canonical absolute `htu` without query/fragment, and `{ typ: 'dpop+jwt', alg: 'ES256', jwk: publicJwk }`. Target normalization matches the backend's case/default-port/dot-segment/unreserved-escape rules and preserves reserved escapes. API proofs alone have `ath = base64url(SHA-256(ASCII(token)))`.

`fetchWithDpop` accepts exact configured API origins and longest normalized
segment `pathPrefix` matches; omission or `/` is origin-wide, while `/api`
excludes `/api-evil`. Duplicate normalized scopes reject before auth work.
Outbound paths/proofs normalize unreserved escapes/dot segments and retain
reserved separators; query data is preserved. Independent gateway services need
distinct replay namespaces. The helper owns Authorization/DPoP, rejects redirects
and defaults API credentials to `omit` (`include` only for a cookie-using API).

Responses need exact `DPoP`, canonical compact signed JWTs, exact matching
`cnf: { jkt }`, safe mandatory `exp` epoch seconds and safe lifetime arithmetic.
Decoding checks the response contract; APIs independently authenticate JWT/proof.
The generic server unbound/opaque contracts remain compatible. `expiresIn: 0`
can retain a rotated handle but is not a live API/peer token; API use stops with
non-terminal `DPOP_ACCESS_TOKEN_EXPIRED` without another refresh loop.

Retry-enabled APIs allow **one nonce retry** and **one refresh budget**, with a
fresh proof/JTI/iat/signature/ath per attempt. Only an unambiguous HTTP-401 DPoP
`invalid_token` challenge allows refresh; final responses belong to the caller.
Vaults retry a usable nonce once, then throw non-terminal
`DPOP_NONCE_RETRY_EXHAUSTED`. The 64-tuple cache is isolated by protection
space/key, evicts the oldest remembered and invents no TTL. Valid success/final
nonces are learned even for single-attempt mutations: a later explicit call can
send the nonce. Vault POSTs have no Authorization/ath, even after JWT expiry.

GET/HEAD/OPTIONS are retryable. Mutating methods default to **one attempt**. Opt into `retry: 'idempotent'` only when the application's authorized operation has a server-enforced idempotency contract. `retry: 'never'` disables retries. Replayable strings, URLSearchParams, Blob, FormData and ArrayBuffer/views are snapshotted for retries; streams are rejected before a retry-enabled request. A nonce challenge on an unsafe mutation is returned to the caller without implicit resubmission. DPoP does not sign bodies/query strings or replace API authorization.

### HTTP bounds and recovery

Vault attempts default to **15,000 ms** through headers/body/JSON and **1 MiB**
of streamed bytes. Queue/storage/key/proof/recognition/other lock owners are
outside that deadline; timers cannot preempt synchronous work/suspended tabs.
Clear/reset/dispose abort owned HTTP waits. API/proof `signal` stops the caller's
wait without cancelling shared refresh or already-started crypto; API response
bodies remain caller-owned. Abort/timeout cannot undo server mutation or
Set-Cookie; a lost body-handle rotation can need login. No automatic network retry.

Use `OidcVaultDpopClientError.requiresLogin` for terminal session/key/browser/
recognition failures. Proof/nonce/transient errors retain auth; unknown vault
codes become fixed `OIDC_REQUEST_FAILED`. Stale/disposed work rejects with
non-terminal `DPOP_OPERATION_SUPERSEDED` / `DPOP_SESSION_DISPOSED` and cannot
restore old auth or clear a newer login. See the shipped client's
[upgrade notes](../../packages/oidc-vault-dpop-client/README.md#upgrade-notes).

## Actual server wire

For `<mount> = /auth/oidc/body` or `/auth/oidc/cookie`:

| Request                                    | Body / credentials / proof                                                                                          | Success                                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `POST <mount>/login`                       | JSON `{ returnTo? }`, **include** temporary cookie credentials in both transports, fresh DPoP, optional fingerprint | `200 { authorizationUrl }`; navigate                                                           |
| `GET <mount>/callback`                     | IdP top-level navigation + temporary HttpOnly transaction cookie, **no proof header**                               | Redirect to frontend `?code=`                                                                  |
| `POST <mount>/exchange`                    | JSON `{ code }`, **include** credentials in both transports, original key DPoP, optional current fingerprint        | `200 { accessToken, tokenType: 'DPoP', expiresIn, user, sessionId? }`; clears temporary cookie |
| `POST <mount>/refresh`                     | Body `{ sessionId }` + omit credentials, or cookie `{}` + **include**, original key DPoP, current fingerprint       | Same result; rotates handle/cookie                                                             |
| `POST <mount>/logout`                      | Same handle/cookie transport, original key DPoP, **no fingerprint/ath/Authorization**                               | `200 { loggedOut: true }`                                                                      |
| `POST <mount>/logout/navigation`           | Same original-key transport/proof; strict trusted Origin in both modes                                              | `200 { loggedOut: true, navigationUrl }`; client validates/cleans/navigates                    |
| `GET <mount>/logout/navigation?ticket=...` | Real top-level navigation, no API token/cookie/proof required                                                       | One-time provider redirect; bare/missing/spent/failed ticket goes to fixed fallback            |
| `GET /api/profile`                         | `Authorization: DPoP <JWT>` + fresh original-key proof/**ath**                                                      | `200 { subject, scope, binding }`                                                              |

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

For provider logout, also register these exact post-logout returns (change them
with `FRONTEND_ORIGIN` in your deployment):

```text
http://127.0.0.1:4317/signed-out?transport=body
http://127.0.0.1:4317/signed-out?transport=cookie
```

Use `BACKEND_ORIGIN`, `FRONTEND_ORIGIN`, `VAULT_BASE_PATH` and matching `VITE_BACKEND_ORIGIN` / `VITE_VAULT_BASE_PATH` for a different deployment. Local nonce/JWT secrets are freshly random per server startup unless configured as canonical base64url of >=32 random bytes (`LOCAL_JWT_SECRET`, `DPOP_NONCE_SECRET`). Restarting this memory-store server requires fresh login. `DPOP_NONCES=off` restores the core's default nonce-off policy. External-IdP availability and cross-site deployment are application checks; automated tests use only their owned local fixture.

The core's shipped README contains a complete bound server and a published-client
quickstart for installed consumers. This app provides executable body/cookie
browser evidence. Earlier integration evidence is **DBJWT-12** in
`docs/tasks/20261002-125749-express-oidc-vault-device-bound-jwt.md`; the current
health work is `docs/tasks/20261012-163240-dpop-server-client-health.md`.
