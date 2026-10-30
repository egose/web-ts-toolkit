---
sidebar_label: OIDC Vault DPoP Client
sidebar_position: 6.1
---

# `@web-ts-toolkit/oidc-vault-dpop-client`

Framework-agnostic browser sessions and scoped API fetch for
[Express OIDC Vault](./express-oidc-vault.md). The installed package ships a
self-contained [README](https://github.com/egose/web-ts-toolkit/blob/main/packages/oidc-vault-dpop-client/README.md)
with body/cookie quickstarts, API types, recovery tables and upgrade notes.

**DPoP is enabled by default** (omitted `dpop` or `true`). Explicit `dpop: false`
selects immutable session-wide Bearer, never fallback/negotiation. Both modes use
**local application tokens, not IdP access/ID/refresh tokens**. Bearer theft permits
replay: opting out removes the sender constraint, not authentication requirements.

## Install and import

```sh
pnpm add @web-ts-toolkit/oidc-vault-dpop-client
```

`jose` and `idb` are included dependencies. Browser code needs neither Express
nor the backend package or Node ambient types. Strict DOM-only Bundler/NodeNext
consumers can use `types: []` and `skipLibCheck: false`; ESM/CJS declaration
conditions are separate. Use named root imports, with no default/deep imports.
Node tooling/import/require needs **>=22.12.0** for CJS `require(esm)` of `jose`.

DPoP requires secure-context Web Crypto, sessionStorage and IndexedDB CryptoKey
persistence. Body Bearer needs secure-context digest/UUID + sessionStorage, not
IndexedDB/CryptoKey. Cookie Bearer still needs IndexedDB metadata, Web Locks and
BroadcastChannel (also required by cookie DPoP).
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

## Explicit Bearer

Keep the existing factory/fetch names and package root imports. Pair with
**optional vault binding** and a local issuer (primary supported deployment).
Disabled binding **with recognition configured** can also provide guarded POST
login; disabled binding **without recognition is unsupported** (no POST route,
no legacy GET-login fallback). Required binding rejects Bearer. APIs must
independently accept/validate unbound tokens; required API binding still rejects.
Trusted-origin, transaction-cookie, Origin/Referer and credentialed CORS protections
remain required. No production example default changes to Bearer.

```ts
import {
  createOidcVaultDpopSession,
  fetchWithDpop,
  OidcVaultDpopClientError,
  type BearerAccessToken,
} from '@web-ts-toolkit/oidc-vault-dpop-client';

const backendOrigin = 'https://api.example.com';
let view: BearerAccessToken | undefined;
const session = createOidcVaultDpopSession({
  backendOrigin,
  basePath: '/auth/oidc/body',
  sessionTransport: 'body',
  dpop: false,
  autoRefresh: { refreshBeforeExpiryMs: 60_000 }, // Optional, off by default.
  onCredentialsChanged: (credentials) => {
    view = credentials;
  }, // Bearer, no jkt.
  onAutoRefreshError: () => {
    /* Show paused-refresh recovery; no implicit retry. */
  },
});
export const readView = () => view; // Memory-only; prefer session.getAccessToken().
export const signIn = () => session.login('/callback');
export const signOut = () => session.logout(); // Ordinary logout; no provider navigation.
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
  fetchWithDpop({ session, apis: [{ origin: backendOrigin, pathPrefix: '/api' }] }, `${backendOrigin}/api/profile`); // Bearer Authorization only, no DPoP/key/nonce work.
```

`OidcVaultBearerSessionOptions` annotates literal-false configuration. Existing
`OidcVaultDpopSessionOptions` remains DPoP-only. For runtime booleans use the union:

```ts
import {
  createOidcVaultDpopSession,
  type OidcVaultAccessToken,
  type OidcVaultSessionOptions,
  type OidcVaultFetchContext,
} from '@web-ts-toolkit/oidc-vault-dpop-client';

export function configure(dpopEnabled: boolean) {
  let view: OidcVaultAccessToken | undefined;
  const options: OidcVaultSessionOptions = {
    backendOrigin: 'https://api.example.com',
    dpop: dpopEnabled,
    autoRefresh: { refreshBeforeExpiryMs: 60_000 },
    onCredentialsChanged(credentials) {
      view = credentials;
      if (credentials?.tokenType === 'DPoP') credentials.jkt satisfies string;
    },
  };
  const session = createOidcVaultDpopSession(options);
  const context: OidcVaultFetchContext = {
    session,
    apis: [{ origin: options.backendOrigin, replayNamespace: 'app-api' }],
  };
  return { session, context, readView: () => view };
}
```

Only definitely-Bearer `BearerFetchContext`/`BearerApi` may omit replay namespaces;
supplied values are validated but unused. Narrow `session.dpop` before mode-only
operations. Bearer has no `getKey`, `resetKey` or `logoutAndNavigate` in its type;
runtime probes reject fixed nonterminal `DPOP_OPERATION_UNSUPPORTED` before any
side effect. Ordinary logout works after app-token expiry.

Direct Bearer responses accept exact `Bearer` or omitted/undefined `tokenType`
(normalized only in this mode); peers require exact Bearer. Header-safe opaque
tokens work, but exactly-three-segment tokens reserve the canonical compact signed
JWT profile: malformed encoding, unsigned alg, `b64: false` or **any present cnf**
reject. Optional safe JWT `exp` clamps expiry. Safe lifetime arithmetic and body/
cookie handle rules remain; zero lifetime retains rotated handles, not live tokens.
Invalid direct responses use terminal `INVALID_BEARER_CREDENTIAL_RESPONSE`; invalid
peers are ignored. Decoding is not API authentication.

Bearer permits at most **two API attempts, one shared refresh budget** (including
initial acquisition), only a valid active-scheme HTTP-401 `invalid_token` challenge
when retry policy allows. No nonce retry/learning. Other-scheme/malformed/generic
failures and unsafe mutations gain no retries. Default DPoP behavior is unchanged.

Changing mode requires **fresh login**, not refreshing/relabeling an old token.
Cookie metadata is a real mode/generation union (DPoP has jkt, Bearer does not),
using the **same historical lock**, database and keys. Historical missing-mode
records/messages mean DPoP-only; there is no key migration. Reload requires active
same-mode metadata. Peers check mode/generation/expiry/recognition and final metadata;
opposite modes cannot adopt tokens or clear successors. Unmodified older tabs cannot
honor this contract: **upgrade/close/reload before switching** a shared cookie
authority. Mixed old-client/mixed-mode coexistence is unsupported; independent modes
need distinct backend cookie authorities. No immediate stateless JWT revocation.

## Provider logout navigation

**DPoP only.** With server `logoutNavigation` enabled, call **`logoutAndNavigate(): Promise<void>`**
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
  Explicit Bearer adds the unbound profile above. `expiresIn: 0` retains
  rotation results but is not a live API/peer credential; API use stops with
  non-terminal `DPOP_ACCESS_TOKEN_EXPIRED`.
- **Lifecycle:** both transports use FIFO mutations; refresh sharing stops at
  intervening mutations. Cookie peers use same-origin locks and a 180 ms token
  wait. Superseded/disposed operations cannot restore old auth or clear newer
  login; `DPOP_OPERATION_SUPERSEDED` / `DPOP_SESSION_DISPOSED` are non-terminal.
- **Cleanup:** `clear` invalidates local auth/owned HTTP and keeps the key;
  `dispose` closes the context and preserves committed reload state; `resetKey`
  (DPoP only) deletes scoped key/metadata without backend work. Await clear/reset before
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
  enrolled recognition errors and confirmed current-session
  `OIDC_VAULT_REFRESH_REJECTED`, not every 401. The latter means refresh-grant
  rejection, not specifically expiry; stale generations are superseded rather
  than clearing newer auth. Older servers return generic provider failures and
  older clients treat the new unknown code as non-terminal. Proof/nonce/transient failures keep
  auth; unknown server codes become fixed `OIDC_REQUEST_FAILED`. Recognition is
  optional change detection, never proof of possession or an API sender constraint.

Same-origin browser coordination is not a distributed refresh lease. Recorded
Chromium/Firefox evidence uses same-site loopback; Safari/WebKit and arbitrary
cross-site HTTPS/third-party-cookie policy need deployment-specific checks.
See the shipped [upgrade notes](https://github.com/egose/web-ts-toolkit/blob/main/packages/oidc-vault-dpop-client/README.md#upgrade-notes)
and runnable [TypeScript SPA](https://github.com/egose/web-ts-toolkit/blob/main/apps/oidc-vault-dpop-example/README.md)
for full contracts and commands.

## Observing credentials

The optional top-level `onCredentialsChanged(credentials)` observes committed
the selected credential (`DpopAccessToken`, `BearerAccessToken`, or the runtime
`OidcVaultAccessToken` union) `| undefined` independently of scheduling: exchange, manual/API
refresh, admitted cookie peers, and clearing. Prefer `session.getAccessToken()`
as the single source; use observation for a reactive view or in-memory mirror,
never token persistence. Delivery is asynchronous, coalesced latest state (not an
event log), outside this instance's mutation/lock ownership. Throws/rejected
promises are contained and never awaited. Duplicate or stale peer delivery does
not notify. Disposal suppresses queued tokens and emits a final undefined only
if a token was previously observed, then stops notifications.

## Opt-in proactive refresh

`autoRefresh` is omitted/false by default. An object enables scheduling after
successful explicit exchange/refresh, not at construction. The root-exported
`OidcVaultDpopAutoRefreshOptions` contains `refreshBeforeExpiryMs` (enabled
default 60,000; integer 0..2,147,483,647) and optional `maxRefreshIntervalMs`
(no default; integer 1,000..2,147,483,647).

Expiry lead is not a periodic interval: a one-hour token/60-second lead refreshes
around minute 59. Known acquisition time caps the lead to half the initial remaining
lifetime, with a one-second minimum cadence; zero/nonlive results pause with
`DPOP_ACCESS_TOKEN_EXPIRED` / `BEARER_ACCESS_TOKEN_EXPIRED` while preserving handles. An explicit 20-minute maximum
can cover a 30-minute provider idle policy while the browser runs, but **either
scheduling policy can extend an idle session**. Neither tracks user activity,
extends absolute expiry, or guarantees execution during sleep/throttling.

```ts
import { createOidcVaultDpopSession, OidcVaultDpopClientError } from '@web-ts-toolkit/oidc-vault-dpop-client';

let recovery: 'sign-in' | 'refresh-paused' | undefined;
export const session = createOidcVaultDpopSession({
  backendOrigin: 'https://api.example.com',
  autoRefresh: {
    refreshBeforeExpiryMs: 60_000,
    // maxRefreshIntervalMs: 20 * 60_000, // Only after choosing keep-alive policy.
  },
  onAutoRefreshError: (error) => {
    recovery = error instanceof OidcVaultDpopClientError && error.requiresLogin ? 'sign-in' : 'refresh-paused';
  },
});
export const readRecovery = () => recovery;
```

The scheduler rechecks deadlines after the existing FIFO/cookie Web Lock and peer
adoption. Generation-bound non-credential `refreshedAt` metadata anchors maximum
intervals; peer receipt/rebroadcast never resets them, and old/malformed/future
hints make a maximum interval due. Body handles stay tab-local. Clear/reset,
terminal errors and disposal stop scheduling; logout/login/exchange intent withdraws
queued timer work without preventing an earlier started rotation from publishing
before ordered logout. `visibilitychange` when visible and `pageshow` recheck one
deadline, not missed ticks. Missing peer delivery can need a later serialized refresh.

Failures pause and notify once; there is no automatic retry/backoff for uncertain
rotations. Resume/online events and unsolicited peers cannot unpause failure;
successful explicit local acquisition rearms. Background observer throws/rejected
promises are contained and never awaited; manual methods retain their promise
errors. Keep **Sign in again** and application-owned idle/logout recovery. See the
installed README for the full timing, observer and mixed-version contracts.
Failed manual refresh silently pauses scheduling too, preventing an implicit
timer retry of an uncertain mutation. Superseded work without a newer admitted
winner pauses silently until the application follows its current explicit flow.
