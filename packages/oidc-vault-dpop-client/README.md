# `@web-ts-toolkit/oidc-vault-dpop-client`

Browser-only DPoP client for [`@web-ts-toolkit/express-oidc-vault`](https://web-ts-toolkit.pages.dev/docs/packages/express-oidc-vault)
vault flows, with `body` and `cookie` session transports. Framework-agnostic
vanilla TypeScript: persistent non-extractable P-256 keys, per-attempt proofs,
bounded nonce/refresh retries, and tab coordination for cookie sessions.

The package ships at an `es2022` bundle target for modern evergreen browsers
(Chrome 94+, Edge 94+, Firefox 93+, Safari 16+, declared via `browserslist`).
It touches browser globals (`crypto.subtle`, `indexedDB`, `sessionStorage`,
and — cookie transport only — `navigator.locks` plus `BroadcastChannel`) lazily
behind runtime feature asserts, never at module import time. There is no
`express`, no `node:*`, and no default export.

**Guide:** [Quickstart](#quickstart-body-transport) ·
[Lifecycle/cleanup](#lifecycle-concurrency-and-cleanup) ·
[HTTP bounds](#http-bounds-and-cancellation) · [Recovery](#key-loss-and-errors) ·
[Gateway scopes](#multiple-services-behind-a-gateway) · [Upgrade notes](#upgrade-notes)

## Installation

```sh
pnpm add @web-ts-toolkit/oidc-vault-dpop-client
```

`jose` and `idb` are runtime `dependencies` of this package, not peers: the
single install above is enough. Do not install them separately unless your own
code imports them directly.

**Requirements:** secure-context Web Crypto, IndexedDB `CryptoKey` persistence,
and sessionStorage. Cookie transport also needs Web Locks + BroadcastChannel.
Feature checks run when creating/using a session, so importing the module is
safe before browser startup. Keep one lazy session per tab/vault mount.

Node tooling/runtime imports require **Node >=22.12.0**: the CJS entry
synchronously requires ESM-only `jose`, using Node's default `require(esm)`
support. Node 22.0–22.11 cannot load it without an experimental flag. Node
importability does not supply the browser storage needed to create a session.

Strict DOM-only TypeScript consumers can use `types: []` and
`skipLibCheck: false` with Bundler or NodeNext resolution. ESM resolves
`index.d.mts`, CJS resolves `index.d.ts`; both are self-contained, without Node
types, Express augmentation, or a backend package dependency. In workspace/npm
source-tree packs these files live under `dist/`; release packaging flattens
them and rewrites the export map. Always import by package name.

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
import {
  createOidcVaultDpopSession,
  fetchWithDpop,
  OidcVaultDpopClientError,
} from '@web-ts-toolkit/oidc-vault-dpop-client';

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
    throw error; // Keep recovery state on transient/proof/nonce failures.
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

On a new tab with no usable login, bootstrap returns `'sign-in'`; show the
sign-in action. On success it has accepted the response contract, including
valid zero-lifetime credentials ([bound profile](#bound-credential-response)).
Render a recoverable error for other failures rather than clearing auth or
automatically repeating mutations. A corrupt persisted key needs the explicit
[reset-then-login action](#explicit-recovery-from-a-corrupt-key).

## Quickstart: cookie transport

Same session shape, `sessionTransport: 'cookie'`, and the matching cookie
mount. Cookie mode additionally requires **Web Locks** and
**BroadcastChannel** at runtime; unsupported browsers fail explicitly via
`DPOP_TAB_COORDINATION_UNSUPPORTED`.

```ts
import { createOidcVaultDpopSession } from '@web-ts-toolkit/oidc-vault-dpop-client';

export const session = createOidcVaultDpopSession({
  backendOrigin: 'https://api.example.com',
  basePath: '/auth/oidc/cookie',
  sessionTransport: 'cookie',
});

export async function signIn(): Promise<void> {
  await session.login('/callback?transport=cookie');
}
```

Apply the callback/bootstrap, API and logout flow above to this session.
Cookie refresh uses one same-origin Web Lock per vault scope plus
`BroadcastChannel` winner-token delivery: a tab adopts a live peer token for up
to 180ms, otherwise it performs its own serialized refresh with the current
browser cookie. Peer adoption still validates payload, key binding, expiry,
generation, and current recognition. Each API call and retry signs its own
fresh proof. Web Locks coordinate tabs of one frontend origin, storage
partition, and vault scope — they are not a backend refresh lease, so other
frontends, devices, or processes can still race upstream refresh families.

## Provider logout navigation

With server `logoutNavigation` enabled, call **`logoutAndNavigate(): Promise<void>`**
from a user action. It confirms local logout, clears old frontend auth and invokes
the synchronous `navigate(url)` adapter (default `location.assign`) inside lifecycle
authority. `logout()` remains local-only. No return-URL/prepare API is needed.

```ts
import {
  createOidcVaultDpopSession,
  type OidcVaultLogoutNavigationInput,
  type OidcVaultLogoutNavigationResult,
} from '@web-ts-toolkit/oidc-vault-dpop-client';

const session = createOidcVaultDpopSession({
  backendOrigin: 'https://api.example.com',
  basePath: '/auth/oidc',
  sessionTransport: 'body', // Or the matching cookie mount and 'cookie'.
});
export const signOutThroughProvider = (): Promise<void> => session.logoutAndNavigate();
// Pure wire types are also bundled at the client root; no backend install needed.
export type NavigationRequest = OidcVaultLogoutNavigationInput;
export type NavigationResponse = OidcVaultLogoutNavigationResult;
```

The existing persistent key plus body handle or **active matching cookie metadata**
suffices after reload, with an absent or expired memory JWT. It does not refresh,
create a replacement key, send fingerprint/Authorization/`ath`, or put API tokens
in query strings. POST uses the same finite HTTP bounds and nonce cache, including
learned success nonces: at most one recognized challenge retry with a fresh proof/JTI.
Body credentials are `omit` with `{ sessionId }`; cookie credentials are `include`
with `{}` under the scope Web Lock. Strict server Origin/Referer checks apply in
both transports; allow the frontend via `trustedOrigins` and expose `DPoP-Nonce` in CORS.

The client accepts only the exact absolute pinned backend continuation path,
bare or followed by one literal `?ticket=lnt_<43 canonical base64url characters>`.
No upstream URL/hint enters initiation JSON. A confirmed `loggedOut: true` clears
token, handle, pending login, nonces and peer adoption, and invalidates cookie
metadata/notifies peers even if the URL is invalid; that case rejects with fixed
nonterminal **`INVALID_LOGOUT_NAVIGATION_RESPONSE`** and never navigates. Unconfirmed,
malformed, oversized, timed-out or lost responses leave the server commit uncertain,
retain the existing failure policy and never automatically retry or navigate.
Cleanup/adapter failure rejects after memory clear, without credential restoration.

Concurrent clicks share the **same pending Promise** through FIFO, nonce retry,
cleanup and one adapter invocation. An earlier refresh publishes rotation first;
a later refresh cannot resurrect credentials. Refresh does not split that click
batch. Later login/exchange/local logout/clear/resetKey/dispose immediately withdraws
navigation intent, including a login still queued for the FIFO/lock. A started
POST may finish old-state cleanup before that login, but rejects as superseded
instead of navigating. No completed ticket URL is cached; another click after
cleanup requires login. Cancellation cannot undo server commit or navigation
already handed to the browser.

The server revokes locally before optional provider work. Missing endpoints,
discovery/ticket failures and missing/spent/expired tickets select its fixed
configured fallback. Tickets default to 60 seconds (server range 1–120 seconds),
are single-use, and retain only the final upstream hint URL server-side until
consume/expiry/cleanup. Navigation/history/proxy logs and the IdP request still
expose their respective URLs; avoid logging them. After upstream handoff, provider
availability/termination/return is not guaranteed. Stateless JWTs remain valid
until expiry unless the application adds revocation.

## Lifecycle concurrency and cleanup

Use one session instance per tab and vault mount. In **both transports**,
`login`, `exchange`, `refresh`, `logout`, and `logoutAndNavigate` run in invocation order. A logout
queued behind refresh uses the rotated handle/cookie. Cookie operations also
hold the scope's Web Lock across their HTTP work and credential publication.
Body queues belong to the instance; they do not coordinate other instances or
copied tab handles.

Concurrent `refresh()` callers receive the **same Promise** until a call to
`login`, `exchange`, `logout`, `logoutAndNavigate`, `clear`, or `resetKey` starts a new batch. The first caller's
`rejectedToken` applies to that batch. A refresh invoked after a queued logout
waits behind it instead of joining the earlier refresh. Read-only `getKey()`
checks can run alongside the queue and one another; only their still-current
failure cleanup enters the mutation queue. They neither start refresh nor
erase a pending login merely because exchange has not finished.

Every asynchronous session operation keeps its entry-time authority. `clear`,
`resetKey`, a terminal auth failure, and `dispose` supersede older work, including queued
operations. Stale results cannot publish tokens/handles, change cookie
generation metadata, clear a newer login, or navigate. A stale call rejects
with **`DPOP_OPERATION_SUPERSEDED`**, or **`DPOP_SESSION_DISPOSED`** after
disposal; both have `requiresLogin: false`. Follow the current session flow
rather than clearing auth or starting another login in response to these
errors. Key reads and background peer callbacks also lose authority when a
newer auth state is published. A new `login()` intent additionally supersedes
older peer callbacks immediately, including while that login is waiting in the
lifecycle queue or for the cookie Web Lock.

| Method                | Effect                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `logout()`            | Ordered server logout, then frontend cleanup. Revokes vault refresh state.                                                                                                                                                                                                                                                                                              |
| `logoutAndNavigate()` | Ordered proof-authorized server logout, confirmed cleanup, then provider/fallback navigation; coalesced clicks and withdrawable navigation intent. Requires server opt-in.                                                                                                                                                                                              |
| `clear()`             | Immediately drops this context's memory token, vault nonces, body handle and pending-login marker, and aborts its in-flight vault HTTP. Keeps the persistent key. In cookie mode, its Promise waits for the Web Lock, inactive-generation write and peer notification. It does not call the backend or remove the HttpOnly cookie.                                      |
| `resetKey()`          | Explicit local key recovery. Immediately invalidates the same local work/auth as `clear`, then atomically deletes **this scope's key and cookie-session metadata**. Cookie mode uses the shared Web Lock and notifies affected peers. Repeating on absent records is harmless. Creates no key and makes no backend request; await it, then invoke `login()` explicitly. |
| `dispose()`           | Immediately closes this context, drops its memory token/vault nonces, aborts owned vault HTTP, settles peer waits, removes listeners/timers and closes its channel. Keeps the previously persisted key, handle, pending-login marker and committed cookie metadata so a replacement context can bootstrap normally. Later calls reject.                                 |

Clear/reset/dispose invalidate pending cookie-version and session-owned key
transactions as well as memory publication. After clear or reset, unsolicited peer messages cannot restore this
context; an explicit successful exchange/refresh must reestablish auth. Peer
waits end within 180ms, or immediately on local invalidation/disposal, and a
late peer lookup cannot publish after that wait has ended. Same-origin tabs
still reuse the current generation's live winner token; key-loss, expiry and
recognition checks remain mandatory. Reset notifications are advisory: peers
check that **both** scoped records are still absent and that their local
key/generation matches the deletion. A delayed notification or old-binding
failure cannot clear a replacement login, including a fresh key created before
cookie metadata is written. Concurrent resets share their pending removal until
another lifecycle mutation intervenes; repeating after completion also succeeds
when both records are already absent.

Clear/token/reset messages are advisory until their shared key/generation state
is checked. A failed peer recognition or coordination lookup leaves local auth
and pending login intact. An admitted token's key-validation failure still
invalidates a matching current local credential; explicit credential operations
continue to report genuine key/storage and terminal session errors.

**Limits:** already-started storage/crypto and noncooperative custom transport
work may still finish, but superseded results cannot publish. Vault HTTP waits
are bounded as described below; storage, recognition hooks, and time waiting
for other Web Lock owners are outside that HTTP deadline. Cleanup cannot undo
a server mutation or a browser-applied `Set-Cookie`. Await `clear()` or
`resetKey()` before disposing when its persistence work must finish. Lifecycle cleanup also
does not cancel caller-owned API requests or revoke already-issued stateless
JWTs. Coordination remains limited to one frontend origin/storage
partition/scope.

## HTTP bounds and cancellation

All vault `login`/`exchange`/`refresh`/`logout`/`logoutAndNavigate` attempts use these session options:

| Option             | Default                     | Valid values / scope                                                                                                                 |
| ------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `requestTimeoutMs` | **15,000 milliseconds**     | Integer from 1 through 2,147,483,647. One deadline from fetch invocation through response headers, full body read, and JSON parsing. |
| `maxResponseBytes` | **1,048,576 bytes (1 MiB)** | Positive safe integer. Counts bytes actually read from the fetch body stream on every HTTP status, after browser HTTP decompression. |

Invalid options throw `TypeError` at session construction; zero and infinity
do not disable the bounds. Content-Length is not trusted to measure the body:
missing, understated, overstated, or malformed values do not change the byte
count. UTF-8 characters count by their bytes, not JavaScript string length.
Custom fetch implementations must expose a standard streaming `Response.body`.

```ts
import { createOidcVaultDpopSession, fetchWithDpop } from '@web-ts-toolkit/oidc-vault-dpop-client';
import type { OidcVaultDpopSessionOptions } from '@web-ts-toolkit/oidc-vault-dpop-client';

const options: OidcVaultDpopSessionOptions = {
  backendOrigin: 'https://api.example.com',
  requestTimeoutMs: 15_000,
  maxResponseBytes: 1_048_576,
};
const session = createOidcVaultDpopSession(options);

// Supply the caller's AbortController.signal (for example, on page teardown).
export async function loadProfile(signal: AbortSignal): Promise<unknown> {
  const response = await fetchWithDpop(
    { session, apis: [{ origin: options.backendOrigin, replayNamespace: 'my-app-api' }] },
    `${options.backendOrigin}/api/profile`,
    { signal },
  );
  return response.json();
}
```

The HTTP deadline excludes the lifecycle queue, key/proof/recognition work and
credential publication. An allowed nonce retry gets its own deadline, with
the existing two-attempt vault budget. A trickling body cannot reset it.
Deadline or byte overflow rejects with fixed **`DPOP_REQUEST_TIMEOUT`** or
**`DPOP_RESPONSE_TOO_LARGE`**, both `requiresLogin: false`. These failures do
not themselves clear auth, and release refresh/FIFO/Web Lock ownership for a
later explicit operation. Malformed JSON still follows the existing route
response-contract error handling.

Clear/reset/invalidation/disposal abort the session-owned request and stop waiting
even if an injected fetch or stream ignores AbortSignal. Cancellation and
reader cleanup are best effort: their failure or noncompletion cannot delay
settlement or replace its primary outcome. Late responses are discarded and
late rejections are observed. Timers cannot run in suspended tabs or preempt
synchronous JavaScript; elapsed time is also checked after decoding/parsing
before accepting a result.

For `fetchWithDpop`, a pre-aborted signal starts no refresh, key lookup, proof
or network work. Later cancellation rejects with `signal.reason` promptly,
including while waiting for shared refresh/key work. It cancels only this
caller's wait; another waiter's shared refresh continues and may publish its
result. Proof work checks cancellation before signing, including after the
access-token digest; already-started Web Crypto may finish. Standalone
`createDpopProof` also accepts `DpopProofInput.signal`. API requests receive the
caller signal; the returned response/body belongs to the caller. The vault
timeout/byte options do not bound API bodies. Cleanup of a discarded API
challenge response cannot stall its permitted retry or replace its outcome.

**Uncertain commit / retry:** no timeout, cancellation, byte-limit, or network
failure automatically retries a mutation. The server may already have
consumed an exchange code, rotated a refresh handle, or completed logout, and
the browser may already have applied `Set-Cookie`. Aborting does not roll that
back. An explicit retry is not evidence that the first attempt failed; a lost
body-mode rotation can make the retained old handle unusable and require fresh
login. Use the operation's server-side recovery/idempotency contract when
deciding what to do next.

## Backend pairing

Configure the vault mount this client calls. `backendOrigin` must be the exact
public origin (scheme + host + port); `basePath` must match the public mount.
Unreserved path escapes, dot segments and trailing slashes normalize; the key
scope, proof `htu` and request URL all derive from that path. Use `127.0.0.1`
consistently in loopback development:
`localhost` is a different origin and a different key scope.

Backend options that must agree with this client (authoritative wire contract:
[`express-oidc-vault` README](https://github.com/egose/web-ts-toolkit/blob/main/packages/express-oidc-vault/README.md)):

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
- `logoutNavigation: { fallbackRedirectUri }` enables provider navigation logout;
  configure/register `postLogoutRedirectUri` for provider return. Built-in stores
  supply ticket capabilities; custom stores need both optional ticket methods.
- The API's `replayNamespace` must equal the `replayNamespace` configured in
  `fetchWithDpop` `apis` entries.

### Bound credential response

Exchange/refresh must return exact `tokenType: 'DPoP'` and a compact signed
JWT: three nonempty canonical unpadded base64url segments, a nonempty signing
`alg` other than `none`, and no `b64: false` payload. Its `cnf` must be exactly
`{ jkt }`, with the canonical RFC 7638 SHA-256 thumbprint of the persistent
browser key (43 base64url characters, including canonical final bits).
Additional confirmation fields/methods are rejected.

JWT `exp` is mandatory: a nonnegative safe integer in epoch **seconds**, with
safe `exp * 1000` milliseconds. Response `expiresIn` is nonnegative
safe-integer **seconds**; its millisecond conversion and addition to the
current nonnegative safe-integer epoch-millisecond clock must also be safe.
Invalid or overflowing values are rejected even when a shorter deadline could
otherwise hide them. The effective `DpopAccessToken.expiresAt` is the earlier
of the response deadline and JWT expiry. These are **response-contract decode
checks, not JWT authentication**: each API must independently verify the JWT
signature/expiry/issuer/audience and the original-key request proof.

`expiresIn: 0` remains valid so a rotated body handle can be retained. The
returned credential may already be expired; `getAccessToken()` is a snapshot,
not a guarantee of a live token. `fetchWithDpop` checks the deadline per attempt
and after asynchronous proof work. A nonlive refresh result stops with
`DPOP_ACCESS_TOKEN_EXPIRED` (`requiresLogin: false`), preserves session handles,
and starts no additional refresh loop; a later explicit refresh may recover.
Cookie peer adoption clamps the envelope deadline to JWT expiry and requires
the final result to be strictly in the future. Cookie responses and peer
tokens must contain no `sessionId` property.

Invalid direct responses produce `INVALID_BOUND_CREDENTIAL_RESPONSE`; invalid
or expired peer tokens are ignored. The paired server enforces the same bound
JWT profile before claim mapping in **both** validator methods after JOSE
verification. Generic unbound JWTs retain optional-expiry compatibility, and
unbound issuers can still return opaque tokens; this client expects bound JWTs.

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
at protected APIs**.

- Vault POSTs allow **one nonce retry** when that code arrives on HTTP 400 or
  401 with a valid `DPoP-Nonce`. A second nonce challenge throws
  **`DPOP_NONCE_RETRY_EXHAUSTED`**, `requiresLogin: false`, with its HTTP status.
  Existing auth/pending-login state is retained for explicit recovery; starting
  a new `login()` still performs its documented frontend reset. A first
  challenge with no usable nonce returns the fixed non-terminal
  `OIDC_VAULT_USE_DPOP_NONCE` error without a retry.
- API calls allow one nonce retry **only when their retry policy permits it**
  (see [Retry policy](#retry-policy-fetchwithdpop)). Only an HTTP-401 DPoP
  `error="invalid_token"` challenge allows `session.refresh()` and a further
  attempt, at most once per invocation. An initial refresh for absent/expired
  credentials uses that same refresh budget. There are at most three API HTTP
  attempts: the original plus one nonce retry and one refresh retry. The final
  API response, including a repeated challenge, is returned to the caller.

Each permitted attempt mints a fresh proof/`jti`/signature with the current
`iat` and API-only `ath`; vault proofs never carry `ath`. Replayed bodies keep
their original snapshot. Generic 401s, proof errors, 403s, 503s, and network
failures do not trigger API refresh or extra attempts.

**Learning is independent of retry permission.** Both helpers remember a
valid nonce from the selected trusted response, including success and final
error responses. An unsafe POST still makes exactly one attempt and returns
its challenge; the **next explicit invocation** can send the learned nonce.
Learning from a header never authorizes resubmission of the current mutation.

### Nonce cache and challenge parsing

`DpopNonceCache` holds at most **64 `(protection space, key thumbprint)`
tuples** per instance. A successful `remember` renews that tuple's write order;
insertion at capacity evicts the **oldest remembered** tuple. Reads do not
promote entries, and rejected values neither replace an entry nor change
eviction order. Vault mounts and API `(origin, replayNamespace)` spaces remain
separate. API calls share a default cache through their session, even when a
new context wrapper is passed each time; a supplied `nonces` cache uses the
same limits and isolation.

Accepted nonce headers contain **one opaque value of 1–512 visible ASCII
characters**, excluding whitespace, double quotes, backslashes, and commas.
The client never trims, splits, unquotes, or decodes the exposed header value.
Comma-containing values, including Fetch-coalesced duplicate fields (even
identical ones), are rejected without overwriting a usable nonce. This is the
OAuth nonce-character syntax restricted to an unambiguous single header value.
There is **no client-invented TTL**: nonce expiry is determined by the server's
next challenge, not by interpreting its private nonce format. Cache eviction
can likewise require a new challenge.

The API `WWW-Authenticate` parser accepts auth-parameters in any order, token
or quoted values, and other authentication schemes in the same field. Only
**one unambiguous DPoP challenge** can trigger recovery. Bearer errors and
quoted descriptions never supply a DPoP error. Duplicate parameter names
(case-insensitive), multiple DPoP challenges, malformed/empty list members,
or a field longer than **8,192 characters** cause no refresh/retry. A valid
nonce header can still be learned independently of that decision. Vault
status/nonce fields are captured before body reads, so an injected response
cannot change the recovery decision while its body is awaited.

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

The historical database name `oidc-vault-dpop-example-v1` and version-1 schema
are retained so installed keys survive upgrades. Use `resetKey()` for scoped
recovery rather than deleting the entire origin's database.

## Key loss and errors

Key loss or key change clears frontend auth and requires a fresh login —
`DPOP_KEY_LOST` (`requiresLogin: true`). Only fresh `login()` may create a
missing key; exchange/refresh/API/logout read the existing key and compare its
binding (`cnf.jkt` decode check plus key-equality check). There is no Bearer
fallback and no ephemeral-key fallback. Storage/crypto failures stop the
operation; error handling never silently deletes or creates a key.

### Explicit recovery from a corrupt key

An **existing but unusable** record (for example, a mismatched private/public
pair) also fails validation during `login()`. Retrying login or calling
`clear()` cannot repair it: clear deliberately keeps the key. Offer an explicit
recovery action that calls `resetKey()` and awaits it before starting login:

```ts
import { createOidcVaultDpopSession } from '@web-ts-toolkit/oidc-vault-dpop-client';

const session = createOidcVaultDpopSession({
  backendOrigin: 'https://api.example.com',
  basePath: '/auth/oidc/body',
  sessionTransport: 'body',
});

// A user-invoked recovery button when the persisted browser key is unusable.
export async function recoverBrowserKey(): Promise<void> {
  await session.resetKey();
  await session.login('/callback?transport=body');
  // The redirect callback calls session.exchange(code), as in the quickstart.
}
```

Reset bypasses key validation and removes both scoped IndexedDB records in one
guarded transaction. It leaves other vault mounts/backend origins and their
installed keys/metadata intact. The next explicit login persists a fresh
non-extractable key using the same atomic first-key-wins path across tabs.
IndexedDB still has to be available; reset does not repair denied/unavailable
browser storage. Recovery is never automatic on API, refresh, logout, proof,
nonce, timeout, or recognition errors.

**Reset is local-only recovery.** Other sessions using the removed key need a
fresh login; cookie peers are notified under the shared lock, and body tabs
detect the lost/changed key on their next credential operation. The HttpOnly
cookie is not removed, old server sessions remain until **explicit revocation
or expiry**, and issued stateless JWTs are not revoked. If the key is still
usable and server sign-out is wanted, call `logout()` before resetting it.
An already-started API request, browser-applied cookie, server mutation, or
previously obtained `CryptoKey` reference cannot be undone by local deletion.
API requests remain caller-owned; use their AbortSignal for local cancellation.

### Error classification

Package-generated `OidcVaultDpopClientError`s carry a stable `code`, a fixed message (never
keys, credentials, fingerprints, or URLs), `requiresLogin`, and an optional
HTTP `status`. Treat `requiresLogin === true` as "route to sign-in"; enrolled
recognition changes surface as `OIDC_VAULT_FINGERPRINT_REAUTH_REQUIRED` (clear
auth, start fresh POST login, no automatic re-enrollment).

Vault JSON errors use an explicit code allowlist rather than treating every
HTTP 401 as logout. These **terminal** server codes clear local auth and
pending login, invalidate cookie coordination metadata, and require sign-in:

| Code                                     | Meaning                                                               |
| ---------------------------------------- | --------------------------------------------------------------------- |
| `OIDC_VAULT_INVALID_SESSION`             | Session is missing, expired, or no longer usable.                     |
| `OIDC_VAULT_MISSING_SESSION_ID`          | The body handle or session cookie is missing (HTTP 400).              |
| `OIDC_VAULT_MALFORMED_SESSION_COOKIE`    | The session cookie is malformed (HTTP 400).                           |
| `OIDC_VAULT_INVALID_EXCHANGE_CODE`       | The exchange code is invalid/expired (HTTP 400); begin a fresh login. |
| `OIDC_VAULT_INVALID_BROWSER_BINDING`     | The login transaction's browser-cookie binding failed.                |
| `OIDC_VAULT_DEVICE_BINDING_REQUIRED`     | The session needs a device-bound login.                               |
| `OIDC_VAULT_FINGERPRINT_REAUTH_REQUIRED` | Enrolled recognition changed or is absent.                            |

Proof/nonce errors (`OIDC_VAULT_INVALID_DPOP_PROOF`,
`OIDC_VAULT_DPOP_REQUIRED`, `OIDC_VAULT_USE_DPOP_NONCE`) are **non-terminal**,
even on HTTP 401. Replay-store unavailability, upstream/provider failures, and
request/configuration failures also retain auth. An invalid recognition input
(`OIDC_VAULT_INVALID_FINGERPRINT`) is non-terminal; it differs from a confirmed
enrollment mismatch. Non-terminal does not promise that a retry will succeed
or authorize one automatically; use the operation's recovery contract.

Unknown codes, including object-prototype names, become fixed
**`OIDC_REQUEST_FAILED` / `The OIDC request failed.`**, `requiresLogin: false`;
server codes/messages are never copied into that fallback. The HTTP status is
retained. Local key loss, binding/token-type violations and invalid bound
credential responses remain terminal. API HTTP failures are still caller-owned
`Response`s, with automatic recovery limited to the challenge rules above.

Construction can also throw `TypeError` for invalid options; caller abort
rejects with `signal.reason`. Do not assume every thrown value is a package
error or automatically start login for a non-terminal failure.

## Credentials matrix

`credentials` is owned by the helpers; callers must not set it.

| Operation                | Body transport                           | Cookie transport                                                   |
| ------------------------ | ---------------------------------------- | ------------------------------------------------------------------ |
| `login` / `exchange`     | `include` (temporary transaction cookie) | `include` (temporary transaction cookie)                           |
| `refresh` / `logout`     | `omit` + `{ sessionId }` JSON body       | `include` + `{}` JSON body (no `sessionId`)                        |
| `logoutAndNavigate` POST | `omit` + `{ sessionId }` JSON body       | `include` + `{}` JSON body (no `sessionId`)                        |
| `fetchWithDpop` API      | `omit` default                           | `omit` default (`include` only for an explicitly cookie-using API) |

Cookie JSON always omits `sessionId`. Every request uses `redirect: 'error'`
and `cache: 'no-store'`. Vault POSTs present no access token; API calls send
`Authorization: DPoP <JWT>` plus a fresh same-key proof with `ath`.

## Multiple services behind a gateway

Use `DpopApi.pathPrefix` to select each service's credential policy and backend
`replayNamespace` on one public origin. Pass the **full public URL**, including
the service path; `pathPrefix` selects the scope without adding or stripping a
mount. Bootstrap the session with login/exchange or refresh as above.

```ts
import { createOidcVaultDpopSession, fetchWithDpop } from '@web-ts-toolkit/oidc-vault-dpop-client';
import type { DpopApi, DpopFetchContext } from '@web-ts-toolkit/oidc-vault-dpop-client';

const origin = 'https://gateway.example.com';
const session = createOidcVaultDpopSession({
  backendOrigin: origin,
  basePath: '/auth/oidc/body',
  sessionTransport: 'body',
});
const apis: readonly DpopApi[] = [
  { origin, pathPrefix: '/orders', replayNamespace: 'orders-api' },
  // This billing service also uses an application cookie.
  { origin, pathPrefix: '/billing', replayNamespace: 'billing-api', credentials: 'include' },
];
const gateway: DpopFetchContext = { session, apis };

export function loadOrders(): Promise<Response> {
  return fetchWithDpop(gateway, `${origin}/orders?limit=20`);
}

export function loadInvoices(): Promise<Response> {
  return fetchWithDpop(gateway, `${origin}/billing/invoices`);
}
```

Selection is **case-sensitive at normalized path-segment boundaries**:
`/orders` matches `/orders`, `/orders/`, and `/orders/42`, but neither
`/orders-evil` nor `/orders%2Fevil`. The longest matching prefix wins, regardless
of array order. For example, `/orders/admin` takes precedence over `/orders`;
`/orders/admin-evil` still uses `/orders`. Trailing prefix slashes are removed,
so `/orders/` and `/orders` define the same scope.

**Omission and root are origin-wide.** Leaving out `pathPrefix` preserves the
existing whole-origin behavior. Explicit `/`, or a prefix that normalizes to
`/`, also permits credentials on **every path** at that origin. A root entry is
a fallback for paths outside more-specific entries. Without such a fallback,
an unmatched path fails before access-token lookup, refresh, key lookup,
signing, or network work.

Matching, the outbound pathname, and proof `htu` use the same normalization:
unreserved percent escapes (`A–Z`, `a–z`, digits, `-._~`) decode, remaining
escape hex digits uppercase, and dot segments collapse. Thus `/ord%65rs` is
sent as `/orders`, and `/orders/%2e%2e/billing` can only use the billing scope
(or an origin-wide fallback). **Reserved escapes stay encoded**: `%2F`, `%5C`,
`%3F`, and `%23` never become separators, a new authority, query, or fragment.
Double-encoded escapes are not decoded again. Query order, duplicate query
parameters, escaping, and fragment data are retained in the URL passed to
fetch. HTTP omits the fragment; the proof omits both query and fragment. The
same uppercase method is used for the proof and every outbound attempt.

Every invocation validates **all** entries, including nonmatching ones, before
auth work. An origin must contain only scheme/host/port and an optional root
slash, with HTTPS except for loopback development. A prefix must be an absolute
path without a URL/`//` authority-like prefix, query, fragment, whitespace,
backslash, control character, or malformed escape. `replayNamespace` must be
1–128 printable ASCII characters; `credentials` accepts only `omit` (default)
or `include`. Duplicate normalized `(origin, pathPrefix)` scopes are rejected
even if their policies are identical: this includes omission versus `/`,
trailing slashes, equivalent unreserved escapes, and equivalent dot segments.
Targets must already be absolute HTTP(S) URLs; configuring a prefix never
makes a relative, userinfo-bearing, or malformed target usable.

The target and selected origin/path/namespace/**credentials** are snapshotted
before asynchronous auth work. All attempts and nonce learning for that
invocation keep that snapshot, including across refresh/key waits. Caller
configuration changes apply to later invocations. Nonces retain the existing
`['api', normalizedOrigin, replayNamespace]` + signing-key-thumbprint tuple:
the two services above use independent nonce spaces, while paths deliberately
using the same origin/namespace share a nonce space. Path selection leaves the
nonce/refresh retry budgets and single-attempt mutation policy below intact.

| Failure                                              | Fixed client code (`requiresLogin: false`) |
| ---------------------------------------------------- | ------------------------------------------ |
| No matching origin/path scope                        | `DPOP_API_OUT_OF_SCOPE`                    |
| Invalid policy fields or duplicate normalized scopes | `INVALID_DPOP_API_CONFIG`                  |
| Malformed URL, origin syntax, or prefix              | `INVALID_DPOP_TARGET`                      |
| Configured non-loopback HTTP origin                  | `INSECURE_DPOP_ORIGIN`                     |

## Retry policy (`fetchWithDpop`)

Scoped `fetch` for the configured API origin/path subtrees: it owns
`Authorization`/`DPoP` (caller-set auth headers throw
`DPOP_AUTH_HEADER_OVERRIDE`), mints a fresh proof per attempt, and accepts only
exact origin matches with a matching `pathPrefix` and valid `replayNamespace`.

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
  (`login`/`exchange`/`refresh`/`logout`/`logoutAndNavigate`/`getAccessToken`/`getKey`/`clear`/`resetKey`/`dispose`).
  Options: `backendOrigin`, `basePath` (default `/auth/oidc`),
  `sessionTransport` (`'body'` default | `'cookie'`), optional `fingerprint`,
  `requestTimeoutMs` (default 15,000 ms), `maxResponseBytes` (default 1 MiB),
  injectable `fetch`/`navigate`/`now` for tests.
- `fetchWithDpop({ session, apis, fetch?, nonces?, now? }, input, options?)` →
  `Promise<Response>`. `apis: DpopApi[]` pins `{ origin, replayNamespace,
pathPrefix?, credentials? }`; longest normalized segment-prefix match wins.
- `getOrCreateDpopKey(scope, { create? })`, `createDpopProof(key, input)`,
  `DpopNonceCache`, `createDeviceFingerprint(source, { headerName? })`,
  `fingerprintJsSignalSource(load)`, `OidcVaultDpopClientError`.
- Types: `DpopKey`, `DpopKeyScope`, `DpopProofInput`, `DpopAccessToken`,
  `DpopFetchContext`, `DpopFetchOptions`, `DpopApi`,
  `OidcVaultDpopSession`, `OidcVaultDpopSessionOptions`, `DeviceFingerprint`, `DeviceFingerprintOptions`,
  `DeviceFingerprintSignalSource`, `FingerprintJsAgent`. Wire DTOs stay
  single-sourced from the pure `@web-ts-toolkit/express-oidc-vault/wire` entry
  at build time; no backend import survives in client declarations/JavaScript.
- Pure root DTOs: `OidcVaultLogoutNavigationInput`, `OidcVaultLogoutNavigationResult`.

## Upgrade notes

Provider logout is additive: enable the paired server's `logoutNavigation` and
replace custom logout proof/fetch/redirect handling with `session.logoutAndNavigate()`.
Keep `logout()` for local-only behavior. Add `logoutAndNavigate` to typed session
mocks. `navigate` now handles both login and logout URLs synchronously; do not
defer its actual navigation beyond the call, where lifecycle authority no longer
protects it. Existing persistent keys and the database schema are retained.

| Area                         | Consumer action / delivered contract                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Node and types               | Use **Node >=22.12.0** for CJS `require(esm)`. Browser declarations now need only DOM/ES libs; remove compensating Express/Node ambient types if your app has no other use for them. Backend root type imports and `req.auth` remain available.                                                                                                                                                        |
| Bound JWT profile            | Issuers must return canonical compact signed JWTs, exact `{ cnf: { jkt } }`, mandatory safe-integer `exp` seconds and safe millisecond lifetimes. Extra confirmation fields, missing/unsafe expiry or overflowing arithmetic are rejected. The generic server unbound/opaque contracts remain compatible. `expiresIn: 0` preserves rotated handles but supplies no live reusable API/peer token.       |
| Lifecycle ordering           | Both transports now use FIFO mutations. Refresh sharing ends at intervening mutations. Failed advisory peer reads preserve auth; older peer callbacks yield to a newer login intent, even while queued. Handle `DPOP_OPERATION_SUPERSEDED` / `DPOP_SESSION_DISPOSED` as non-terminal; follow the newer flow. Await clear/reset before teardown when persistence must finish.                           |
| HTTP limits and cancellation | Vault attempts default to **15,000 ms / 1 MiB**, including injected fetches. Configure larger finite budgets when warranted. Injected responses need a byte stream, not only a custom `json()`. API/proof `signal` stops waits and later attempts; discarded-response cleanup cannot replace the outcome. Lost mutation responses remain uncertain commits.                                            |
| Nonces and retries           | Success/final/single-attempt responses now teach the bounded 64-tuple cache. Reordered unambiguous DPoP challenges work; repeated vault challenges give `DPOP_NONCE_RETRY_EXHAUSTED`. Learning a nonce never authorizes a blanket mutation retry.                                                                                                                                                      |
| Error handling               | Use known `code` / `requiresLogin`, not every 401. Proof/nonce/transient errors retain auth; terminal session/exchange errors include HTTP 400. Unknown server codes become fixed `OIDC_REQUEST_FAILED`.                                                                                                                                                                                               |
| Gateway scopes               | Existing origin-only entries remain origin-wide. Add `pathPrefix` to restrict forwarding; replace duplicate normalized scopes with distinct prefixes or one shared policy. Outbound pathname now follows proof normalization, including unreserved escapes; query data is preserved. Origin fields reject paths or query/fragment markers even when parsing would erase them (`/orders/..`, `?`, `#`). |
| Key recovery                 | `OidcVaultDpopSession` includes **`resetKey(): Promise<void>`**; add it to typed mocks. Use explicit reset-then-login for unusable records. No DB rename/migration or implicit replacement occurs. Reset is local recovery, with old sessions/JWTs remaining until revocation/expiry.                                                                                                                  |

Worked end-to-end example (Vite SPA + Express vault/API + local OIDC
provider, both transports, real-browser evidence):
[`apps/oidc-vault-dpop-example`](https://github.com/egose/web-ts-toolkit/blob/main/apps/oidc-vault-dpop-example/README.md).
Migrating from the pre-publish copy: replace `copy src/auth/` + `pnpm add
jose idb` with `pnpm add @web-ts-toolkit/oidc-vault-dpop-client`, rewrite
`from './auth…'` imports to the package root, and keep `basePath` on the exact
`/body` vs `/cookie` mount you call.
