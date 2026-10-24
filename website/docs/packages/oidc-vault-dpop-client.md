---
sidebar_label: OIDC Vault DPoP Client
sidebar_position: 6.1
---

# `@web-ts-toolkit/oidc-vault-dpop-client`

Framework-agnostic browser sessions and scoped API fetch for
[Express OIDC Vault](./express-oidc-vault.md). The installed package ships a
self-contained [README](https://github.com/egose/web-ts-toolkit/blob/main/packages/oidc-vault-dpop-client/README.md)
with body/cookie quickstarts, API types, recovery tables and upgrade notes.

## Install and import

```sh
pnpm add @web-ts-toolkit/oidc-vault-dpop-client
```

`jose` and `idb` are included dependencies. Browser code needs neither Express
nor the backend package or Node ambient types. Strict DOM-only Bundler/NodeNext
consumers can use `types: []` and `skipLibCheck: false`; ESM/CJS declaration
conditions are separate. Use named root imports, with no default/deep imports.
Node tooling/import/require needs **>=22.12.0** for CJS `require(esm)` of `jose`.

Sessions require a secure context, Web Crypto, sessionStorage and IndexedDB
CryptoKey persistence. Cookie transport also needs Web Locks + BroadcastChannel.
Importing is safe before browser startup; construct one session per tab/mount
when browser features are available. Match the vault's public origin/basePath
and the APIs' replay namespaces; configure credentialed CORS exposing
`DPoP-Nonce` and `WWW-Authenticate`.

## Session and gateway example

```ts
import {
  createOidcVaultDpopSession,
  fetchWithDpop,
  OidcVaultDpopClientError,
  type DpopApi,
} from '@web-ts-toolkit/oidc-vault-dpop-client';

const origin = 'https://gateway.example.com';
const session = createOidcVaultDpopSession({
  backendOrigin: origin,
  basePath: '/auth/oidc',
  sessionTransport: 'body',
  requestTimeoutMs: 15_000,
  maxResponseBytes: 1_048_576,
});
const apis: readonly DpopApi[] = [
  { origin, pathPrefix: '/orders', replayNamespace: 'orders-api' },
  { origin, pathPrefix: '/billing', replayNamespace: 'billing-api' },
];

export const signIn = (): Promise<void> => session.login('/callback');
export const signOut = (): Promise<void> => session.logout();

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
    throw error; // Retain recovery state; no automatic mutation retry.
  }
}

export function loadOrders(signal: AbortSignal): Promise<Response> {
  return fetchWithDpop({ session, apis }, `${origin}/orders?limit=20`, { signal });
}

// Explicit recovery action for an unusable persisted key, followed by fresh login.
export async function recoverBrowserKey(): Promise<void> {
  await session.resetKey();
  await signIn();
}
```

Select `cookie` and the matching mount on both sides for cookie transport.
Login/exchange always include credentials for the temporary transaction cookie;
refresh/logout need no access JWT or `ath`. Access JWTs stay memory-only, body
handles/pending login are tab-local sessionStorage, and cookie handles remain
backend HttpOnly cookies. Keys are scoped by frontend/backend/normalized mount.

`pathPrefix` selects the longest normalized segment match: `/orders` excludes
`/orders-evil`. Omission or `/` permits the entire origin. Duplicate normalized
scopes reject before auth work. Outbound paths and proofs normalize unreserved
escapes/dot segments, retain reserved separators, and preserve query data in
the request. Distinct namespaces isolate gateway services' nonces.

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

## Recovery and limits

- **Credentials:** exact `DPoP`, canonical compact signed JWT, exact `cnf: { jkt }`,
  safe mandatory `exp` seconds and safe lifetime arithmetic. Browser decoding
  checks the response contract; APIs authenticate JWTs and same-key proofs.
  Generic server unbound/opaque compatibility remains. `expiresIn: 0` retains
  rotation results but is not a live API/peer credential; API use stops with
  non-terminal `DPOP_ACCESS_TOKEN_EXPIRED`.
- **Lifecycle:** both transports use FIFO mutations; refresh sharing stops at
  intervening mutations. Cookie peers use same-origin locks and a 180 ms token
  wait. Superseded/disposed operations cannot restore old auth or clear newer
  login; `DPOP_OPERATION_SUPERSEDED` / `DPOP_SESSION_DISPOSED` are non-terminal.
- **Cleanup:** `clear` invalidates local auth/owned HTTP and keeps the key;
  `dispose` closes the context and preserves committed reload state; `resetKey`
  deletes only scoped key/metadata without backend work. Await clear/reset before
  teardown when persistence must finish. `logout` requests server revocation.
  A corrupt key needs explicit reset-then-login; no implicit replacement occurs.
  Old sessions/JWTs remain until revocation/expiry and other users of that key
  need fresh login. The historical `oidc-vault-dpop-example-v1` DB is retained.
- **HTTP:** vault attempts default to 15,000 ms through headers/body/JSON and
  1 MiB of streamed bytes. Queue/storage/crypto/recognition/other locks are outside
  that deadline; timers cannot preempt synchronous work or suspended tabs.
  API/proof signals stop waits, not already-started crypto or shared refresh.
  API bodies remain caller-owned. Abort is not rollback of server mutation or
  Set-Cookie; a lost rotation response can require login. No network/timeout retry.
- **Nonces:** learn valid success/final/single-attempt headers into a 64-tuple
  oldest-remembered cache, with no inferred TTL. A later explicit mutation may
  use that nonce. Vaults retry once then throw `DPOP_NONCE_RETRY_EXHAUSTED`;
  retry-enabled APIs allow one nonce retry and one `invalid_token` refresh budget.
  Every attempt needs a fresh proof/JTI; mutations remain single-attempt unless
  the server operation has an explicit idempotency contract. Final API responses
  belong to the caller.
- **Errors:** `requiresLogin` identifies terminal session/key/browser-binding/
  enrolled recognition errors, not every 401. Proof/nonce/transient failures keep
  auth; unknown server codes become fixed `OIDC_REQUEST_FAILED`. Recognition is
  optional change detection, never proof of possession or an API sender constraint.

Same-origin browser coordination is not a distributed refresh lease. Recorded
Chromium/Firefox evidence uses same-site loopback; Safari/WebKit and arbitrary
cross-site HTTPS/third-party-cookie policy need deployment-specific checks.
See the shipped [upgrade notes](https://github.com/egose/web-ts-toolkit/blob/main/packages/oidc-vault-dpop-client/README.md#upgrade-notes)
and runnable [TypeScript SPA](https://github.com/egose/web-ts-toolkit/blob/main/apps/oidc-vault-dpop-example/README.md)
for full contracts and commands.
