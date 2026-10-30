# OIDC vault client: explicit Bearer mode with DPoP enabled by default

Created: 2026-10-30T00:45:54-0700
Status: completed

Completion outcome: all six tasks are completed. Implementation proceeded
sequentially by subagents; independent OBEAR-99 review found no feature-scope
source issues and passed the package/browser/installed-consumer gates. The user
explicitly approved closing this package-specific work on those results, removing
the full-workspace test pass as a completion prerequisite. Root build and lint
passed; failed workspace test attempts remain recorded under OBEAR-99 and are
not represented as passing. No unrelated fixes are authorized by this closure.

## Objective and scope

Add an explicit session-wide DPoP opt-out to
`@web-ts-toolkit/oidc-vault-dpop-client`. Omission and `dpop: true` retain today's
DPoP behavior; `dpop: false` obtains an unbound **app-local** access token and
sends `Authorization: Bearer <accessToken>` to configured APIs without a DPoP
proof. This is a selectable authentication mode, never automatic downgrade.

Proposed usage, not an existing API:

```ts
import { createOidcVaultDpopSession, fetchWithDpop } from '@web-ts-toolkit/oidc-vault-dpop-client';

const backendOrigin = 'https://api.example.com';
const session = createOidcVaultDpopSession({
  backendOrigin,
  basePath: '/auth/oidc/body',
  sessionTransport: 'body',
  dpop: false, // Omit this option to keep DPoP enabled.
});

// After explicit login/exchange or refresh bootstrap:
export const loadProfile = () =>
  fetchWithDpop(
    { session, apis: [{ origin: backendOrigin, replayNamespace: 'app-api' }] },
    `${backendOrigin}/api/profile`,
  );
```

Retaining the existing factory/helper names avoids a package rename or migration
of existing applications. OBEAR-01 settles the additive public types and whether
Bearer-only API configuration still needs the irrelevant replay namespace.

Primary scope: the client session, credential validation/types, scoped fetch,
cookie coordination, existing refresh/observation integration, tests, and shipped
documentation. Both body and cookie transports are included. The existing example
may receive focused integration fixtures, not a new framework or application.

Non-goals: upstream IdP DPoP, exposing provider tokens, automatic downgrade or
mode negotiation, per-request security overrides, new token persistence, stateless
JWT revocation, distributed refresh leases, package renaming, framework adapters,
or enabling provider-navigation logout for unbound sessions. Backend production
changes require an explicit scope decision in OBEAR-01, not an incidental rewrite.

The user requested a task file only. Saving this document does not start or
authorize implementation or delegation; all six tasks remain pending.

Subsequent authorization: the user requested sequential implementation by
subagents. Execution now follows the dependency order below, with one assigned
subagent at a time and a separate final reviewer. The coordinator maintains this
document and reconciles each handoff before starting the next task.

## Analysis coverage and baseline

Source baseline: `46d85e8`, root package version `0.62.0`. At task creation,
`eslint.config.mjs` was already modified; preserve that unrelated work. This
task-creation change must add only this document.

| Observation                                                                                                                                                                                        | Inspected evidence                                                                                                                                                                                                            | Classification / implication                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Construction always asserts DPoP browser features; credentials, handles, login markers, and peer messages assume a key thumbprint.                                                                 | `packages/oidc-vault-dpop-client/src/auth-session.ts`, `OidcVaultDpopSessionOptions`, `OidcVaultDpopSession`, `Handle`, `PendingLogin`, `ChannelMessage`, factory initialization; `src/scope.ts`, `assertDpopBrowserFeatures` | Feature spans the session lifecycle, not just an API header.                                            |
| Direct and peer credentials require exact DPoP and a matching bound JWT; `DpopAccessToken` exposes literal `tokenType: 'DPoP'` and required `jkt`.                                                 | `packages/oidc-vault-dpop-client/src/credentials.ts`, `DpopAccessToken`, `parseDpopCredentials`, `readPeerToken`; `test/credentials.unit.test.ts`, exact-type, confirmation, safe-deadline, and zero-lifetime cases           | Add a separate Bearer contract; do not weaken existing bound-token checks/types.                        |
| Scoped fetch always reads a key, signs, sends DPoP authorization, and recognizes only DPoP recovery challenges. Existing tests deliberately ignore Bearer errors.                                  | `packages/oidc-vault-dpop-client/src/auth-fetch.ts`, `selectApi`, `fetchWithDpop`; `src/auth-challenge.ts`, `readDpopChallengeError`; `test/auth-fetch.unit.test.ts`, "ignores Bearer noise and does not refresh"             | Make header and recovery behavior mode-specific without changing default-mode recovery.                 |
| Cookie metadata stores `jkt`, generation, activity, and an optional acquisition clock; the database identity preserves installed keys.                                                             | `packages/oidc-vault-dpop-client/src/key-database.ts`, `DPOP_DATABASE_NAME`, `CookieSessionVersion`, `readDpopScopeState`; session cookie-lock and peer paths                                                                 | Bearer coordination needs a real mode/generation contract, not a fabricated key binding.                |
| Auto-refresh and credential observation already exist, but their types assume DPoP credentials. Tests cover uncertain rotations, stale rejection authority, peer admission, and observer delivery. | `packages/oidc-vault-dpop-client/src/auto-refresh.ts`, `createAutoRefreshScheduler`; `test/auth-session.unit.test.ts`, OVAR-02/03/04 groups                                                                                   | Reuse these mechanisms and preserve their failure/ordering policies in both modes.                      |
| The server can select an unbound session when optional device binding receives no proof. Unbound issuance permits Bearer or omitted token type, and permits opaque tokens.                         | `packages/express-oidc-vault/src/vault-route-proof.ts`, `createVaultRouteProofVerifier`; `src/token-issuance.ts`, `withIssuedToken`; `src/wire.ts`, `OidcVaultTokenIssueResult`                                               | Existing optional-binding deployment can support the feature without changing issuance semantics.       |
| POST login is registered only when device binding or fingerprint recognition is configured. Navigation logout rejects an existing unbound target.                                                  | `packages/express-oidc-vault/src/index.ts`, `registerRoutes`, `createLogoutHandler`; `src/logout-navigation.ts`, `resolveLogoutNavigationOptions`                                                                             | Fully disabled binding is a separate login-compatibility decision; navigation logout remains DPoP-only. |
| Strict declarations, packed installs, documentation compilation, and actual-browser integration already have harnesses.                                                                            | Client `test-decl-consumer/decl-consumer.strict.test.ts`, `test/oidc-vault-dpop-client.packed-consumer.test.ts`, `test/oidc-vault-dpop-client.docs.compile.test.ts`; `apps/oidc-vault-dpop-example/test/browser/harness.ts`   | Extend existing verification rather than inventing a second packaging/browser lane.                     |

Within each table row, shortened `src/` and `test/` references belong to the named
package. Symbols/test names are authoritative if line numbers move.

This is focused source/test/metadata inspection, not a comprehensive security
audit. No build, typecheck, runtime test, browser run, packed install, or live IdP
experiment was run for task creation. None of the proposed checks below is a
passing baseline. The current tests establish DPoP behavior; new Bearer coverage
must be written, not inferred from those tests.

### Related work and deduplication

- [Original client package](20261003-232446-oidc-vault-dpop-client-package.md)
  intentionally scoped the initial client to DPoP. This document adds a new
  explicit mode; it does not overturn that plan's ban on automatic Bearer fallback.
- [Device-bound JWT work](20261002-125749-express-oidc-vault-device-bound-jwt.md)
  supplies the optional/required server policy and original-binding enforcement.
  Existing bound sessions must never become unbound through this feature.
- [Server/client health](20261012-163240-dpop-server-client-health.md) supplies
  lifecycle authority, bounded HTTP, challenge parsing, and advisory-peer
  preservation constraints; do not redo or weaken that remediation.
- [Proactive refresh and observation](20261029-170504-oidc-vault-dpop-proactive-refresh.md)
  supplies the scheduler, acquisition-clock, observer, and refresh-rejection
  contracts. Extend them to Bearer credentials without changing their policies.
- [Application integration](20261022-200950-express-oidc-vault-app-integration.md)
  owns the existing proof-authorized provider-navigation logout; unbound
  navigation is explicitly outside this objective.

Focused task searches found no dedicated explicit-Bearer-client task. These are
preservation references, not new implementation dependencies or reopened tasks.

## Required boundaries and execution rules

1. Snapshot and validate `dpop` at construction. Only omission/`true` selects
   DPoP; explicit `false` selects Bearer. Reject other runtime values. A mode is
   immutable for that session instance, not chosen from a response or challenge.
2. DPoP remains fail-closed on missing keys, proof/nonce/storage failures, and
   wrong token type. Bearer mode never relabels a DPoP token or enrolls/downgrades
   an existing bound vault session. Changing authentication mode requires fresh
   login, with shared-cookie limitations made explicit.
3. Bearer mode creates/reads no DPoP signing key and sends no DPoP proof or nonce.
   It uses only the backend's local application credential, never IdP access,
   ID, or refresh tokens. APIs still authenticate tokens independently.
4. Retain HTTPS/loopback restrictions, exact origin/path credential pinning,
   owned auth headers, `redirect: 'error'`, `cache: 'no-store'`, and the existing
   body/cookie Fetch credentials matrix. Cookie Origin/Referer checks and login
   transaction-cookie protection are not optional when DPoP is disabled.
5. Keep access tokens memory-only, body handles tab-local, and cookie handles
   backend-only. No token/handle persistence in IndexedDB or localStorage and no
   body-handle broadcast. Coordination metadata must not masquerade as a key.
6. Preserve FIFO/single-flight, cancellation, HTTP timeout/byte bounds, terminal
   error authority, observer containment, and default-off proactive refresh.
   Failed/uncertain mutations do not gain automatic retries or login/navigation.
7. Add tests with each behavior change and JSDoc with each public surface change.
   Generate declarations through the build; never hand-edit `dist/`. Keep names,
   package root imports, and existing default-mode consumer assignments working.
8. Execute tasks in order: **OBEAR-01 -> OBEAR-02 -> OBEAR-03 -> OBEAR-04 ->
   OBEAR-05 -> OBEAR-99**. Shared session/types/tests are deliberate sequential
   editing points. Do not launch subagents merely because tasks exist.
9. All tasks are P2: a requested integration improvement and its design/verification
   gates, not a newly demonstrated vulnerability. Record any discovered security
   defect separately with evidence rather than silently broadening this plan.
10. Run build/test/pack jobs serially. Package tests rebuild shared dependencies;
    preserve `AGENTS.md` and root `pnpm test` serialization.

## Tasks

### Task OBEAR-01: Resolve the public and backend compatibility contracts

Status: completed

Assigned: OBEAR-01 design subagent (separate execution session).

Kind: investigation

Priority: P2; settle recovery, typing, and cookie-authority decisions before
adding a security-mode option.

Dependencies: none

Primary ownership: this document's decision record; focused inspection of client
session/types/storage and server login/issuance/API contracts. No production edits.

Finding: the requested boolean is small, but the current public types and cookie
authority assume a persistent key. Fully disabled backend binding also lacks the
POST-login route used by the client. A header-only switch cannot implement a
consistent or safely typed Bearer session.

References: analysis table; client `OidcVaultDpopSessionOptions`, `DpopAccessToken`,
`authenticatedKey`, `publish`, `adoptPeer`, `refreshOperation`; server
`registerRoutes`, `createVaultRouteProofVerifier`, and `withIssuedToken`.

Requirements:

1. Finalize `dpop?: boolean`, a readable mode discriminator where needed, and
   additive session/options/credential types. Cover literal true/false, omitted
   options, annotated existing options, nonliteral booleans, observer inference,
   and structural/custom session adapters. Preserve default DPoP typings rather
   than widening `DpopAccessToken.tokenType` or making its `jkt` optional.
2. Record a backend/API support matrix: required binding, optional binding,
   disabled binding with recognition, and disabled binding without recognition.
   The minimum implementation target is the existing guarded POST-login flow
   with `deviceBinding: { mode: 'optional' }`. Decide explicitly whether the fully
   disabled backend is deferred or requires separately approved server work.
   Never discover support by retrying a failed POST as legacy GET login.
3. Define the Bearer credential profile: exact token-type handling, whether the
   server's allowed omitted `tokenType` normalizes to Bearer, opaque-token versus
   JWT support, safe expiry arithmetic, handling of an available JWT `exp`/`cnf`,
   and direct/peer error classification. Never accept an explicitly DPoP-typed
   credential in Bearer mode or weaken the DPoP profile to admit unbound tokens.
4. Define body login/handle markers and mode-specific feature checks. Body
   Bearer flows should not depend on IndexedDB signing-key persistence. State any
   remaining Web Crypto, sessionStorage, or cookie-metadata storage requirements
   accurately; do not claim that all IndexedDB use disappears if metadata needs it.
5. Specify cookie generation/recognition/peer admission and old-record handling
   without fake `jkt` values. Preserve installed DPoP key/database identities.
   Prevent cross-mode credential adoption and stale clear/reset/failure cleanup.
   Modes targeting the same backend cookie must not create independent locks
   that allow concurrent refresh of that cookie. Account for already-installed
   DPoP-only tabs and explain mixed-mode login/cookie replacement limitations.
6. Define `getKey()`, `resetKey()`, and `logoutAndNavigate()` behavior in Bearer
   mode: absent in the Bearer interface or explicit unsupported-operation failure,
   never implicit key creation, deletion of another mode's key, or weaker logout
   navigation. Ordinary local/server logout remains supported.
7. Finalize fetch-context typing and `replayNamespace` requirements for Bearer
   APIs. Select refresh recovery only from the active mode's valid challenge;
   retain retry budgets and header-parser bounds. Prefer reusing existing helper
   names over adding aliases or a public authentication framework.

Acceptance criteria:

- Append a concrete decision record covering all seven items and their test
  scenarios. Distinguish accepted minimum scope from deferred backend expansion.
- Identify any required maintainer decision and block affected implementation
  tasks until resolved; do not silently choose a weaker login or cookie policy.
- No public option or backend behavior is claimed as implemented by this task.

Verification: evidence/design review against the inspected symbols and strict
consumer/race fixtures. Run a bounded experiment only if a material uncertainty
cannot be resolved by inspection; record its command, result, and limitations.

Decision record / completion evidence:

- OBEAR-01 design subagent completed in its own session; no production or task
  files were edited by that subagent. Coordinator reviewed the handoff before
  starting OBEAR-02. Inspected source revision: `46d85e8`.
- Preserve `DpopAccessToken` and the existing DPoP session/options meanings.
  Add `dpop?: true` to existing options and optional `readonly dpop?: true` to
  existing session adapters. Factory DPoP results expose required `dpop: true`;
  legacy structural adapters without the property still mean DPoP.
- Add `BearerAccessToken` (Bearer literal, no jkt), `OidcVaultAccessToken` union,
  `OidcVaultBearerSessionOptions` (`dpop: false`, Bearer observer),
  `OidcVaultSessionOptions` (runtime boolean, union observer), and
  `OidcVaultBearerSession`. `OidcVaultSession` is the discriminated union of
  factory DPoP and Bearer sessions. Use overloads for omitted/true, false, and
  runtime-boolean configuration; existing annotated options retain DPoP inference.
  Validate/snapshot mode before browser work; reject nonboolean runtime values.
- Bearer interfaces omit `getKey`, `resetKey`, and `logoutAndNavigate`; runtime
  stubs reject fixed nonterminal `DPOP_OPERATION_UNSUPPORTED` before state,
  scheduling, key/storage, network, or navigation side effects.
- Supported server pairings: optional binding (primary target), or disabled
  binding with configured recognition and its existing guarded POST-login route.
  Required binding rejects Bearer. Disabled binding without recognition is
  explicitly unsupported/deferred. No backend production changes, GET fallback,
  or unbound navigation logout. APIs independently accept/verify unbound tokens.
- Bearer direct responses accept exact `Bearer` or omitted/undefined token type,
  normalized to `Bearer`; peers require the exact normalized type. Require a
  nonempty visible-ASCII token without whitespace/control/comma, safe nonnegative
  lifetime/clock arithmetic, existing user-copy rules, body handle, and no cookie
  `sessionId` property. Zero lifetime retains rotated handles without reuse/loops.
- Support opaque tokens, reserving exactly-three-segment tokens for canonical
  compact signed JWT validation. Reject malformed candidates rather than treating
  them as opaque. JWTs require nonempty signed alg, no `b64: false`, no present
  `cnf` claim, and optional safe `exp` that clamps expiry when present. Decoding
  is not authentication. Invalid direct responses use terminal fixed
  `INVALID_BEARER_CREDENTIAL_RESPONSE`; invalid peers are advisory and ignored.
  Bearer peer envelopes forbid `jkt` and `sessionId` and match live generation.
- Keep DPoP storage/scope identities unchanged. Bearer body keys are
  `oidc-vault-bearer:handle:${scope.id}` and
  `oidc-vault-bearer:pending:${scope.id}`, with explicit `mode: 'bearer'` markers.
  Never migrate another mode's handle or erase its keys/markers. Body Bearer
  needs secure context, Web Crypto digest/UUID support, and sessionStorage, but
  not IndexedDB/CryptoKey. Cookie Bearer additionally needs IndexedDB metadata,
  Web Locks, and BroadcastChannel; it is keyless, not IndexedDB-free.
- Preserve the historical cookie lock/channel name, database/version, key store,
  and one metadata row per scope. Metadata becomes a mode union: legacy or
  `mode: 'dpop'` records retain real `jkt`; `mode: 'bearer'` records have no jkt.
  Legacy messages/records mean DPoP only; unknown/corrupt modes are unusable.
  Bearer metadata work never reads the key store or `readDpopScopeState`.
- Fresh login may select another mode under the same lock; exchange publishes
  its active generation. Cookie reload requires active same-mode metadata,
  rather than blind refresh to discover cookie binding. Peer admission requires
  same mode/generation/recognition, payload/expiry validation, and final metadata
  recheck; only DPoP checks the key. Opposite-mode notifications may trigger
  checked local invalidation, never token adoption or clearing successor metadata.
- Updated DPoP key/auth paths must detect cookie replacement even with a live
  memory token. Cleanup compares captured mode/generation and real DPoP binding
  where applicable; stale clear/reset/terminal failure cannot delete another mode
  or newer generation. Reset must recheck before atomic scoped deletion. Preserve
  queued logout's use of a preceding FIFO refresh's committed handle.
- The unchanged lock serializes old tabs but cannot teach unmodified clients
  mode semantics: old clear/reset/logout can damage a replacement session.
  Concurrent mixed-version/mixed-mode use of one cookie authority is unsupported.
  Upgrade/close/reload old tabs before changing mode and log in afresh; independent
  concurrent modes require genuinely distinct backend cookie authorities. Access
  tokens already issued are not instantly revoked by cookie replacement.
- Add `BearerApi` with optional validated-but-unused `replayNamespace`,
  `BearerFetchContext`, and `OidcVaultFetchContext`; definitely Bearer contexts may
  omit namespaces, runtime-mode contexts require DPoP-compatible API configuration.
  Keep current DPoP types/helper names. Snapshot adapter mode at fetch entry and
  never infer it from credentials. Bearer ignores nonce caches entirely.
- Extend bounded whole-field parsing to choose the active scheme. Only a valid
  selected HTTP-401 `invalid_token` permits response-driven refresh, subject to
  existing retry policy. Initial acquisition uses the same one-refresh budget;
  Bearer allows at most two API attempts and no nonce retry. Other-scheme errors,
  generic failures, malformed challenges, and unsafe mutations gain no retries.
- Required regressions: strict inference/legacy adapters; direct/peer profiles;
  both-transport lifecycle/keylessness; same-lock mode isolation; legacy metadata;
  delayed clear/reset/failure authority; observer/scheduler recovery; scheme-bound
  fetch, scope/cancellation/retry budgets; installed and real-browser consumers.
- Verification actually run by design subagent: read-only, in-memory TypeScript
  6.0.3 representative overload/observer/adapter/narrowing/context experiment via
  `node` (working directory: client package), zero diagnostics and emitted files.
  Source/test/contract review supplied the other evidence; no runtime suites,
  builds, packed installs, or browsers were run for this investigation.
- Remaining design blockers: none for the supported minimum. Broader disabled
  login and safe coexistence with unmodified old clients remain explicit limits.

### Task OBEAR-02: Add mode-safe public types and Bearer credential validation

Status: completed

Assigned: OBEAR-02 types/credentials subagent (separate execution session).

Kind: improvement

Priority: P2; make the opt-out usable without breaking default-mode TypeScript
consumers or loosening bound-token validation.

Dependencies: OBEAR-01

Primary ownership:

- `packages/oidc-vault-dpop-client/src/credentials.ts`, `src/index.ts`, public
  types in `src/auth-session.ts`, and shared scheduler types only as needed.
- Client credential/peer tests and
  `packages/oidc-vault-dpop-client/test-decl-consumer/decl-consumer.strict.test.ts`.

Finding: all credentials and session callbacks currently expose `DpopAccessToken`.
Direct/peer parsers reject Bearer by design. Broadening that interface alone would
break consumers that rely on exact DPoP type and key-binding availability.

References: `DpopAccessToken`, `parseDpopCredentials`, `readPeerToken`,
`OidcVaultDpopSession`, `onCredentialsChanged`, and the inspected strict-consumer
and credential test files.

Requirements:

1. Implement OBEAR-01's additive Bearer credential and session/options typing,
   with a useful discriminated union for callers using a runtime boolean.
   Existing default-mode assignments, callbacks, and exported type names retain
   their meaning. Export required new types at the package root with JSDoc.
2. Validate Bearer responses separately: nonempty header-safe token, selected
   token type/profile, safe nonnegative lifetime/clock/deadline arithmetic, user
   copying, body handle requirement, and no cookie `sessionId` property.
   Zero-lifetime results retain rotated handles but provide no live API token.
3. Apply the recorded opaque/JWT/confirmation policy without confusing decoding
   with token authentication. Keep all existing DPoP signed-JWT, canonical `jkt`,
   exact `cnf`, and expiry-clamping checks unchanged.
4. Implement the selected mode-specific peer payload validation, if peer adoption
   is retained, without accepting another mode's token or inventing a binding.
   Reuse only genuinely shared validation; avoid a blanket "skip validation" flag.

Acceptance criteria:

- Tests cover valid Bearer credentials, wrong/unknown token types, malformed and
  unsafe deadlines, zero lifetime, body/cookie differences, and confirmation-policy
  boundaries. Existing DPoP rejection tests retain their purpose and pass.
- Strict NodeNext and Bundler declarations prove inference for omitted/true/false
  and runtime-boolean options, observer callbacks, and existing annotated options.
  Bearer credentials cannot satisfy `DpopAccessToken` by structural accident.
- Generated declarations expose the selected public contract without backend or
  Node type requirements in DOM-only consumers.

Verification: V1 and V2 below; regenerate declarations before strict-consumer
checks. This task is not independently releasable before lifecycle/fetch support.

Completion evidence:

- OBEAR-02 types/credentials subagent ran after OBEAR-01 in a separate session;
  coordinator inspected the delivered source diff and strict-consumer cases
  before advancing. Worktree remains based on `46d85e8`, uncommitted.
- Changed client `src/credentials.ts`, `src/auth-session.ts`, `src/index.ts`,
  `test/credentials.unit.test.ts`, `test/read-peer-token.unit.test.ts`,
  `test-decl-consumer/decl-consumer.strict.test.ts`, and
  `test/oidc-vault-dpop-client.packed-consumer.test.ts`.
- Delivered additive Bearer/session union types and overloads, exact default
  DPoP/legacy-adapter preservation, separate direct/peer Bearer validators, safe
  JWT/opaque/deadline profiles, and fixed terminal response-contract errors.
- Internal handoff: `parseBearerCredentials(value, transport, now)` returns
  `{ token: BearerAccessToken; sessionId?: string }`;
  `readBearerPeerToken(value, generation, now)` returns an admitted-shaped token
  or undefined. Lifecycle still owns metadata/recognition/final-authority checks.
- Actual serial checks from repo root: client dependency build, client
  `typecheck`, client `test`, and client `test:browser-smoke` using the V1/V2
  package commands all passed. Targeted credential/peer run: 283 tests in two
  files. Full client test: 1,175 tests in 19 files, including packed/docs
  consumers. Browser smoke: five tests. All strict declaration lanes passed.
- Changed-file ESLint, Prettier, and `git diff --check` passed after correcting
  initial formatting/type-fixture lint issues. Node 26.12.1, pnpm 11.18.0;
  pack/install tests used verified-ignored `_tmp-oidc-bearer` via checkout-local
  TMPDIR. Unrelated ESLint configuration and other work were preserved.
- Deliberate intermediate state: false construction rejects nonterminal
  `DPOP_OPERATION_UNSUPPORTED` before side effects until OBEAR-03 replaces that
  guard and its test expectation. Runtime Bearer fetch belongs to OBEAR-04.
  Actual-browser and repository-wide checks were not run in this task.

### Task OBEAR-03: Implement keyless Bearer session lifecycle in both transports

Status: completed

Assigned: OBEAR-03 lifecycle subagent (separate execution session).

Kind: improvement

Priority: P2; make the mode apply consistently to login, exchange, rotation,
cleanup, observers, and scheduled work rather than only API requests.

Dependencies: OBEAR-02

Primary ownership:

- `packages/oidc-vault-dpop-client/src/auth-session.ts`, `src/scope.ts`, and
  `src/key-database.ts` only for approved coordination metadata changes.
- `packages/oidc-vault-dpop-client/src/auto-refresh.ts`, `src/errors.ts`, and
  focused session/scheduler/metadata tests.

Finding: POST attempts, credential publication, reload bootstrap, refresh,
logout, and cookie peer authority currently require a persistent key. Merely
skipping one proof leaves these paths unusable or cross-mode state ambiguous.

References: client factory initialization, `post`, `existingKey`,
`authenticatedKey`, `acceptResponse`, `publish`, `adoptPeer`, `refreshOperation`,
`invalidateCookie`, `clear`, `resetKey`, `dispose`; existing OVAR and DPH session
test groups; `CookieSessionVersion`.

Requirements:

1. Snapshot/validate the option and implement the agreed Bearer login/exchange/
   refresh/logout flow with no key creation/read/signing/nonce work. Vault calls
   still send no access-token Authorization header and retain transaction-cookie,
   fingerprint-recognition, Fetch credentials, request bounds, and server-error
   contracts. Required-binding rejection must never trigger automatic downgrade.
2. Implement mode-safe pending-login and body-handle persistence and reload
   bootstrap. Do not consume another mode's marker/handle or erase installed DPoP
   keys as a side effect of using Bearer mode.
3. Implement the recorded cookie coordination and migration policy. Serialize
   operations sharing one cookie authority; admit only current, same-mode,
   live, recognition-compatible peer credentials. Keep peer lookup failures
   advisory and prevent delayed peer/reset/terminal failures clearing newer auth.
4. Preserve single-flight refresh batches, FIFO mutation order, entry-time
   authority, cancellation/disposal, uncertain-commit behavior, and cleanup.
   Enforce the selected unsupported-method behavior before destructive work.
5. Integrate Bearer credentials with observers and proactive refresh: same
   default-off scheduling, safe cadence, acquisition clocks, failure pause,
   explicit rearm, coalesced delivery, and contained callbacks. Missing/zero-live
   results must not create refresh loops or discard a committed rotated handle.

Acceptance criteria:

- Body and cookie tests exercise explicit login, callback exchange, refresh,
  ordinary logout, reload, clear, and disposal in Bearer mode; inspect outbound
  headers/bodies and spy on key/proof helpers to prove they are unused.
- Default/explicit-true DPoP tests still prove original-key enforcement and no
  Bearer fallback. Invalid runtime option values fail before auth/network work.
- Race tests cover rotated-handle ordering, shared refresh, late publication,
  mixed-mode peer rejection/cookie replacement, and stale cleanup authority.
- Bearer observer/scheduler tests cover committed changes, clear, peer behavior,
  expiry, zero lifetime, and uncertain refresh failure without retry loops.
- Unsupported DPoP-only methods neither create/delete a key nor make a backend
  mutation; normal Bearer logout remains usable after app-token expiry.

Verification: V1 and V2; V3 during final integration. Include focused regressions
with this task instead of deferring lifecycle correctness to the browser lane.

Completion evidence:

- OBEAR-03 lifecycle subagent completed after OBEAR-02 in a separate session.
  Coordinator inspected mode selection, POST/publication, cookie replacement,
  cleanup/reset code, metadata changes, and focused race-test cases before the
  next task. Work remains uncommitted on `46d85e8`.
- Changed client `src/auth-session.ts`, `src/auto-refresh.ts`, `src/errors.ts`,
  `src/key-database.ts`, `src/scope.ts`, `src/vault-http.ts`, and
  `test/auth-session.unit.test.ts`, `test/credentials.unit.test.ts`,
  `test/key-database.unit.test.ts`. Added `src/cookie-session.ts` and
  `test/bearer-session.unit.test.ts`.
- Implemented keyless Bearer lifecycle, isolated body markers, immutable mode,
  actual cookie-mode/generation metadata, same historical lock/channel/database,
  guarded peer admission and cleanup, plus observer/scheduler integration.
  DPoP-only runtime stubs reject before side effects. Bearer scheduler expiry
  reports nonterminal `BEARER_ACCESS_TOKEN_EXPIRED`.
- Narrow internal scope extension: `requestVaultJson` accepts default-true
  `readDpopNonce`; Bearer attempts skip nonce-header reads entirely. HTTP
  timeout/body bounds and default DPoP behavior are preserved.
- Final serial commands (working directory: repo root): dependency build,
  client `typecheck`, V1 focused Vitest for bearer-session/auth-session/
  key-database/auto-refresh/credentials/read-peer-token/scope/errors/vault-http,
  `TMPDIR="$PWD/_tmp-oidc-bearer" pnpm --filter @web-ts-toolkit/oidc-vault-dpop-client test`,
  and client `test:browser-smoke` all passed. Focused run: 988 tests in nine
  files; full client: 1,285 tests in 20 files including packed/docs consumers;
  browser smoke: five tests. TMPDIR was verified ignored.
- Changed-file ESLint, Prettier, and `git diff --check` passed. Iteration fixes
  covered exact-optional-property inference, legacy marker expectations,
  same-mode logout idempotence, ES2022 test compatibility, and harness timing.
  Node 26.12.1, pnpm 11.18.0. Actual browsers remain for OBEAR-05.
- Handoff: use immutable `session.dpop`; Bearer has no `jkt`. Cookie refresh
  requires active same-mode metadata. Fresh login alone selects another mode;
  missing-mode records/messages remain DPoP-only. Stale resets preserve successor
  records as safe no-ops, while current corrupt-key reset remains usable.
  API headers/recovery are still the intentionally pending OBEAR-04 work.

Reopened during OBEAR-04 verification: the new test "ignores opposite-mode
payloads, generation mismatch, expiry and final metadata replacement" failed
once, then passed unchanged in repeated focused/full runs. Its event-loop drain
does not establish completion of native Web Crypto work. OBEAR-03 lifecycle
subagent is assigned a sequential follow-up to establish deterministic test
synchronization and rerun affected checks before OBEAR-04 sign-off. This is not
claimed as a demonstrated production defect or a pre-existing failure.

Follow-up resolution:

- The same OBEAR-03 subagent changed only the new bearer-session unit fixture.
  Real SHA-256 is now computed synchronously in the test double and delivered
  via microtasks; explicit digest/metadata and observer barriers establish the
  intended interleaving. Candidate completion is checked before installing
  subsequent once-mocks. No production code, sleeps, retries, or weakened
  assertions were introduced; the expiry case now has matching metadata.
- Working directory: repo root. Ten sequential V1 bearer-session-file runs
  passed, 94 tests each. Client `typecheck` passed; the TMPDIR-scoped full client
  `test` passed with 1,505 tests in 21 files. Changed-file ESLint, Prettier, and
  whitespace checks passed. Coordinator inspected barriers/digest fixture before
  restoring completed status and signing off OBEAR-04.

### Task OBEAR-04: Send scoped Bearer API requests with mode-specific recovery

Status: completed

Assigned: OBEAR-04 scoped-fetch subagent (separate execution session).

Kind: improvement

Priority: P2; deliver the requested Authorization header without widening where
credentials can be sent or which failures authorize a replay.

Dependencies: OBEAR-03

Primary ownership:

- `packages/oidc-vault-dpop-client/src/auth-fetch.ts`, `src/auth-challenge.ts`.
- Client auth-fetch, scope, abort, and challenge-parser tests.

Finding: `fetchWithDpop` always enforces DPoP credentials, reads a key, signs, and
recognizes only DPoP challenges. Reusing that path by relabeling a bound token
would violate both the client and server authentication contracts.

References: `selectApi`, `fetchWithDpop`, `readDpopChallengeError`;
`packages/oidc-vault-dpop-client/test/auth-fetch.unit.test.ts`,
`test/auth-fetch-scope.unit.test.ts`, `test/auth-fetch-abort.unit.test.ts`,
`test/auth-challenge.unit.test.ts`.

Requirements:

1. Select behavior from the immutable session mode. Bearer mode requires its
   matching credential and sets only `Authorization: Bearer <accessToken>`;
   it performs no key/proof/nonce work. No request-level mode override or
   response-driven switch, including after refresh.
2. Preserve all-origin/path configuration validation before auth work, longest
   matching path scope, URL/method normalization, header ownership, selected
   credentials, cancellation, body snapshots, redirect/cache policy, and response
   ownership. Apply OBEAR-01's replay-namespace typing decision without relaxing
   DPoP configuration validation.
3. Recover only from a valid HTTP-401 `invalid_token` challenge for the active
   scheme, at most once and only if the existing retry policy permits another
   API attempt. Initial refresh of absent/expired credentials consumes the same
   refresh budget. Bearer mode has no nonce retry, so at most two API attempts.
4. Reuse bounded structural challenge parsing with scheme-specific selection.
   Preserve malformed/ambiguous/duplicate/header-length rejection and existing
   DPoP behavior. Generic 401, the other scheme's errors, insufficient scope,
   proof failures, 403/5xx, and network failures do not authorize extra attempts.

Acceptance criteria:

- Header-level tests prove Bearer-only requests and no signing/key/nonce calls;
  default mode still sends DPoP authorization and a fresh proof on each attempt.
- Tests prove challenge-scheme isolation, bounded malformed/mixed challenge
  handling, refresh-budget exhaustion, expired refresh results, safe-body replay,
  unsafe mutations' single-attempt default, and `retry: 'never'` behavior.
- Cross-origin/path rejection occurs before credential lookup, refresh, or
  network work in both modes. Pre-aborted calls do no auth work, and later
  caller cancellation does not cancel another caller's shared refresh.

Verification: V1 and V2, including existing default-mode parser/fetch regressions.

Completion evidence:

- OBEAR-04 scoped-fetch subagent ran in a separate session after the lifecycle
  handoff. Coordinator reviewed fetch/parser diffs, context typing, mode/error
  isolation, and the reported race-test follow-up before advancing.
- Changed client `src/auth-fetch.ts`, `src/auth-challenge.ts`, `src/index.ts`,
  `test/auth-fetch.unit.test.ts`, `test/auth-fetch-scope.unit.test.ts`,
  `test/auth-fetch-abort.unit.test.ts`, `test/auth-challenge.unit.test.ts`, strict
  declaration and packed-consumer fixtures; added
  `test/auth-fetch-bearer.unit.test.ts`. No lifecycle/server production edits.
- Delivered Bearer-only Authorization, no key/proof/nonce work, mode-specific
  bounded whole-field challenge selection, shared one-refresh budget, scoped
  configuration/abort/body/retry protection, and additive context overloads.
  Wrong-mode failures are fixed terminal `BEARER_TOKEN_TYPE_REQUIRED` or
  `DPOP_TOKEN_TYPE_REQUIRED`; cleanup does not clear a newer credential snapshot.
  Nonlive Bearer results use nonterminal `BEARER_ACCESS_TOKEN_EXPIRED`.
- Working directory: repo root. Dependency build, client `typecheck`, focused
  V1 fetch/parser/scope/abort/bearer-session tests, TMPDIR-scoped full client
  `test`, and browser smoke all passed. Focused: 538 tests in six files; full:
  1,505 tests in 21 files; smoke: five tests. Generated declarations inspected
  for overloads/types/JSDoc; changed-file ESLint, Prettier, whitespace checks pass.
- Corrected iteration errors: refresh-union generic inference, body fixture
  typing, two expectations, unused arguments, and formatting. One lifecycle
  harness flake was reported honestly and resolved by the OBEAR-03 follow-up
  above; that follow-up reran the integrated full client gate successfully.
- Handoff: `BearerApi` may omit validated-but-unused namespaces;
  `BearerFetchContext` supports those entries. `OidcVaultFetchContext` accepts a
  runtime-mode session with DPoP-compatible APIs. Mode comes only from snapshotted
  session configuration, never credentials/challenges. Actual-browser/docs work
  remains OBEAR-05. Toolchain: Node 26.12.1, pnpm 11.18.0.

### Task OBEAR-05: Document and exercise the installed dual-mode client

Status: completed

Assigned: OBEAR-05 docs/browser integration subagent (separate execution session).

Kind: improvement

Priority: P2; ensure installed consumers can discover the opt-out and deploy it
against a supported backend without assuming equivalent DPoP protection.

Dependencies: OBEAR-04

Primary ownership:

- `packages/oidc-vault-dpop-client/README.md`, `llms.txt`, package description,
  public JSDoc, packed-consumer/docs tests, and strict declaration fixtures.
- `website/docs/packages/oidc-vault-dpop-client.md`.
- Focused fixture/bridge/browser tests and README in
  `apps/oidc-vault-dpop-example`; server docs only to clarify pairing if needed.

Finding: the shipped documentation currently describes a DPoP-only client and
hard browser/key requirements. Its "no Bearer fallback" guarantee must remain
true while an explicitly configured Bearer mode becomes discoverable.

References: client README, "Backend pairing", "Bound credential response",
"Storage", "Key loss and errors", and "Credentials matrix";
`test/oidc-vault-dpop-client.packed-consumer.test.ts`;
`test/oidc-vault-dpop-client.docs.compile.test.ts`;
`apps/oidc-vault-dpop-example/test/browser/harness.ts` and existing browser suites.

Requirements:

1. Ship a minimal `dpop: false` example with explicit bootstrap, API fetch,
   refresh/observer typing, and ordinary logout. Explain default-on DPoP, fresh
   login for mode changes, no automatic fallback, app-local versus provider
   tokens, and Bearer token theft/replay risk. Keep tokens memory-only.
2. Document the exact backend/API support matrix, login route prerequisites,
   cookie/recognition/storage capabilities, cross-mode limitations, token profile,
   retry budgets, and unsupported DPoP-only methods. Do not imply a fully disabled
   backend or navigation logout works unless separately implemented and tested.
3. Update shipped README/JSDoc first, then reconcile website/example docs and
   `llms.txt`. Include upgrade/release guidance for externally visible contracts;
   leave root `CHANGELOG.md` generation to the release workflow.
4. Extend packed CJS/ESM and strict DOM-only NodeNext/Bundler consumers with both
   modes, callback narrowing, and negative type cases. Inspect built declarations
   and pack contents. Keep backend imports type-only and avoid new deep imports,
   Node/Express runtime dependencies, or manual `dist/` edits.
5. Add a real-browser Bearer lifecycle fixture against a supported local vault
   and local IdP in both transports. Verify headers, reload, app-token refresh,
   logout, cookie tab coordination, and no DPoP key creation. Retain all existing
   DPoP/browser-security assertions; do not make production example defaults Bearer.

Acceptance criteria:

- README snippets compile against the installed tarball, both strict declaration
  lanes pass, and existing default-mode consumers remain valid.
- Packed ESM/CJS imports and export/type targets resolve; published declarations
  and README teach the same mode selection and credential contract as runtime.
- Browser tests pass in Chromium and Firefox for Bearer body/cookie flows and
  default DPoP regressions, including mode isolation. Record tested versions and
  do not claim Safari, cross-site-cookie, or suspension certification.

Verification: V2, V3, and V4 below. Missing browser/install prerequisites must be
recorded as blockers, not silently skipped evidence.

Completion evidence:

- OBEAR-05 docs/browser integration ran after OBEAR-04 in a separate session.
  A usage-limit interruption left partial work; after the user requested
  continuation, the same subagent inspected its changes and reran final checks
  from the resumed worktree. Coordinator reviewed fixture gating, default-mode
  assertions, new browser coverage, and shipped support/upgrade documentation.
- Changed client README/llms/package description, JSDoc in
  `src/auth-session.ts` and `src/credentials.ts`, strict declaration fixtures,
  docs-compile and packed-consumer tests; website client guide; server README
  pairing notes; example README/server fixture/type annotation/unit test, browser
  harness/bridge/tab/navigation tests. Added test-only
  `apps/oidc-vault-dpop-example/test/browser/bearer-entry.ts` and
  `apps/oidc-vault-dpop-example/test/browser/bearer.browser.ts`.
- Production client source edits in this task were JSDoc only; optional server
  binding is fixture-gated in the example. Production example remains required
  DPoP. No backend-library production changes. New unrelated access-router docs,
  tests, task files, and benchmark work appeared during execution and were
  preserved alongside the original ESLint configuration change.
- Fresh serial checks from repo root, with verified-ignored checkout-local
  TMPDIR: client `test` passed (1,505 tests, 21 files, strict and installed
  consumers); `test:browser-smoke` passed (five tests); `test:browser` passed
  (150 tests, nine files, Chromium and Firefox, example build/typechecks).
  `pnpm --filter oidc-vault-dpop-example exec vitest run --config vitest.config.ts`
  passed (55 tests, five files). Packed docs compile 21 TypeScript blocks.
- V4 `npm pack --dry-run` in the client package listed seven expected files.
  Both JS entries, export-map targets, and generated declaration files were
  inspected: named types/JSDoc resolve with no backend/Node runtime leak.
  Changed-file ESLint/Prettier and `git diff --check` passed.
- Tested versions: Node 26.12.1, pnpm 11.18.0, TypeScript 6.0.3,
  Playwright 1.62.1, Chromium 151.0.7922.34, Firefox 153.0.
- Corrections: example `ReturnType<typeof createOidcVaultDpopSession>` now
  resolves to the mode union; the DPoP-only example uses explicit
  `OidcVaultDpopSession` and upgrade notes explain the extracted-type caveat.
  Fixture expectations now compare rotation generation rather than assuming
  same-second JWT inequality. Navigation tests await ready-or-failed gates;
  browser diagnostics use the client-parsed error, not Chromium-only CDP body
  access. Security assertions were retained. One earlier isolated native fetch
  failure remains unexplained; diagnostics remain and fresh full lanes passed,
  without production retries or a claimed baseline classification.
- Scope limits remain explicit: no fully-disabled/no-recognition login, unbound
  navigation logout, old mixed-version cookie-tab coexistence, Safari or
  arbitrary cross-site-cookie/suspension certification. V5 and independent
  acceptance review remain OBEAR-99.

### Task OBEAR-99: Verify the dual-mode security and compatibility boundary

Status: completed

Assigned: OBEAR-99 independent review subagent (new execution session; not a
production implementer for OBEAR-01 through OBEAR-05).

Kind: improvement

Priority: P2; final integration gate for an authentication-mode feature spanning
runtime, lifecycle state, types, and published consumer documentation.

Dependencies: OBEAR-05

Primary ownership: this task's integration evidence and final review of the
delivered diff, acceptance matrix, generated package, and relevant test results.
If delegation is later authorized, use a reviewer other than the main implementer;
do not claim independent review when it did not occur.

Finding: passing a Bearer happy path alone cannot prove that default-mode key
enforcement, mixed-mode state, mutation retry safety, or installed typings survived.

References: all OBEAR acceptance criteria, OBEAR-01's decision record, related
preservation tasks, and the final production/test/documentation diff.

Requirements:

1. Reconcile each acceptance criterion against delivered code and actual evidence.
   Probe omitted/true/false options, both transports, default and wrong-mode
   credentials, backend policy mismatch, peer/state isolation, and fresh login.
2. Confirm DPoP errors never downgrade; Bearer requests never attach proof or
   provider tokens; scope/header/CSRF protections and no-persistence rules remain
   effective; unsafe API mutations and uncertain vault mutations gain no retries.
3. Check existing keys/database identity, old-client cookie coordination limits,
   observer/scheduler behavior, cleanup authority, navigation-logout exclusion,
   and public type compatibility. Verify bounded challenge parsing and HTTP work.
4. Run final verification serially on the integrated revision, distinguish proven
   baseline failures from regressions, and record any deferred scope and risk.
   Required verification that cannot run leaves the relevant task blocked.

Acceptance criteria:

- V1-V4 and the repository integration checks in V5 have recorded outcomes;
  no failed/unrun required check is represented as passing.
- All feature acceptance criteria pass or the plan remains explicitly blocked;
  any deferred backend expansion has a clear support limitation in shipped docs.
- Final evidence lists changed paths, commands, revision/worktree state, and
  remaining limitations without local absolute paths or private session IDs.

Verification: V1-V4, acceptance-by-acceptance review, final diff inspection, and
recorded V5 outcomes. The user-approved acceptance revision below removes a
passing full-workspace test run as a prerequisite for closing this package task;
it does not waive the feature/package/browser checks or reclassify failed runs.

Independent review, first integration pass:

- A new OBEAR-99 review subagent (not an implementer) inspected all 39 delivered
  paths and reconciled every OBEAR-01 through OBEAR-05 acceptance criterion.
  No source-code review findings within that inspected scope; supported minimum
  and explicit deployment/type/old-client limits match code and documentation.
- Fresh serial V1 focused gate passed (1,432 tests, 14 files); V2 full client
  passed (1,505 tests, 21 files, strict/installed/docs lanes), smoke passed
  (five tests); V3 passed (150 tests, nine files, both Chromium and Firefox);
  V4 pack/import/export/declaration inspection passed (seven packed files).
  Ten additional sequential bearer-session unit runs passed (94 tests each).
- V5 `TMPDIR="$PWD/_tmp-oidc-bearer" pnpm build` passed (31-workspace scope),
  and root `pnpm lint` passed. Root
  `TMPDIR="$PWD/_tmp-oidc-bearer" pnpm test` failed in
  `packages/express-oidc-vault/test/logout-navigation.test.ts`, test "rejects
  application/x-www-form-urlencoded before form parsing", with
  `Error: read ECONNRESET` (one failed, 2,448 passed; one failed file, 40 passed
  in that package). Root execution stopped before remaining workspace tests.
- The exact isolated test passed (one passed, 198 filtered), and an ignored
  independent early-415 HTTP probe passed 100/100 requests without reproducing
  the reset. The failing backend production/test files have no delivered diff;
  this does not establish a pre-existing failure or its cause. No test retry,
  security relaxation, unrelated fix, or baseline-pass claim was introduced.
- Reviewer also passed independent HTTP boundary probes and NodeNext/Bundler
  type probes from ignored checkout-local `_tmp-oidc-bearer/obear99/`. Toolchain:
  Node 26.12.1, pnpm 11.18.0, TypeScript 6.0.3, Vitest 4.1.11,
  Playwright 1.62.1, Chromium 151.0.7922.34, Firefox 153.0. Source/diff hashes
  remained unchanged throughout that review; unrelated work was preserved.
- Final acceptance is not yet complete: the independent reviewer is assigned
  one bounded full serialized root-test rerun to verify the unexecuted workspace
  and determine whether the transport reset recurs. Preserve this failed run's
  evidence even if the fresh integrated gate passes.

Bounded full-test follow-up / initial completion blocker:

- The same independent reviewer ran exactly one further full serialized
  `TMPDIR="$PWD/_tmp-oidc-bearer" pnpm test` from repo root, with no source edits,
  internal test retries, overlapping builds, or further reruns. Exit status: 1.
- `express-oidc-vault` passed on this run (2,449 tests, 41 files). This does not
  explain or erase the first run's ECONNRESET failure.
- The second run failed in unchanged
  `packages/express-request-attestation/test/fetch-ownership.cases.ts:793`,
  exercised by `test/fetch-client.test.ts`: "aborts waiting for replacement load
  without disposing the shared client or sending late work". It expected
  `{ status: 'rejected', reason: Error('caller stops waiting') }` but received
  undefined. The attestation Node lane had 617 passed and one failed test,
  17 passed and one failed file. Cause/baseline status/relationship to OBEAR
  are not established; that package has no delivered changes.
- Before that failure, asset-inliner passed 772 tests (one todo, 38 files),
  create-access-router-mongo-starter passed 339 tests (18 files), and the backend
  passed as above. In the 31-workspace scope, 25 packages have test scripts:
  three completed, one failed partway, and 21 did not execute in this root run.
  Attestation Redis/Mongo/browser/packed lanes also did not run.
- Remaining root-run packages: both example/react-vite apps; access-router,
  access-router-client/deco/react/runtime; express-json-router; the three
  oidc-vault store packages; express-response-handler/runtime; http-errors;
  json-frame; message-service; mongoose-rxdb; moo; oidc-vault-dpop-client;
  pdf-reader; utils. Prior focused OBEAR package/browser evidence remains valid;
  it is not a claim that the full workspace gate completed.
- Revision remains `46d85e8`, uncommitted. Hash comparison found only the
  coordinator-owned task document changed among the original 50 tracked review
  paths; delivered and unrelated code was unchanged. `git diff --check` passed.
  Earlier V1-V4/root-build/root-lint evidence remains applicable.
- Initial blocker determination: repository maintainers must investigate the failing root-test
  transport/timing boundaries and obtain a passing full serialized test run,
  or explicitly revise the final verification requirement. Do not alter those
  unrelated packages or silently waive V5 as part of this client feature. No
  additional feature-scope source findings were reported. OBEAR-99 remained
  blocked at that point, pending verification or explicit acceptance revision.

User-approved acceptance revision / completion evidence:

- After reviewing the passing package tests and distinction from failing
  workspace tests, the user explicitly requested marking the final task complete
  and calling this package work done. This authorizes revising the acceptance
  boundary: a passing full-workspace `pnpm test` is no longer a prerequisite for
  this package-specific task. V5 outcomes still must remain honestly recorded.
- OBEAR-99 is completed on its independent review and passing V1-V4 evidence:
  1,505 client tests with strict declarations/installed consumers/docs, five
  browser-smoke tests, 150 Chromium/Firefox tests, and package-output inspection.
  Root build/lint also passed. No feature-scope review finding remains open.
- The two failed workspace attempts and unexecuted packages above remain
  limitations, not passing or proven pre-existing results. Their investigation
  is outside this closed client feature; no unrelated code/test change or new
  workspace-test rerun was requested or performed for this status update.
- All six OBEAR tasks are now completed. This closure changes only the task
  record; implementation and previously verified feature code remain unchanged.

## Shared verification

All commands run from the repository root unless a different working directory is
stated. These are proposed checks, **not executed baseline results**. Prerequisites
are installed workspace dependencies, Node >=22.12.0 for these packages, the
repository's pnpm version, local browser-fixture ports, and installed Playwright
Chromium/Firefox binaries plus required system libraries. Packed consumer tests
install dependencies; provide registry access/cache as required by the harness.

For consumer fixtures, use an ignored repository-local temporary directory per
`docs/tasks/README.md`. For example, create `_tmp-oidc-bearer`, verify it is ignored,
and set `TMPDIR="$PWD/_tmp-oidc-bearer"` for commands that pack/install consumers;
here `$PWD` is the checkout root. Never record expanded machine-specific paths.

- **V1 — targeted iteration:** build dependencies serially with
  `pnpm --filter @web-ts-toolkit/oidc-vault-dpop-client... build`, then use the
  existing package-local Vitest lane, e.g.
  `pnpm --filter @web-ts-toolkit/oidc-vault-dpop-client exec vitest run --config ../../vitest.config.ts test/credentials.unit.test.ts`.
  Select the corresponding session, scheduler, scope, abort, fetch, and challenge
  files for the active task; include any newly added regression files.
- **V2 — package/installed consumer gate:**
  `pnpm --filter @web-ts-toolkit/oidc-vault-dpop-client test` includes build,
  source/test/strict declaration typechecks, unit tests, packed-consumer tests,
  and README/website/example compilation. Also run
  `pnpm --filter @web-ts-toolkit/oidc-vault-dpop-client test:browser-smoke`.
- **V3 — actual browsers:**
  `pnpm --filter @web-ts-toolkit/oidc-vault-dpop-client test:browser` selects the
  existing example harness's Chromium and Firefox lane. Extend that lane rather
  than claiming the jsdom smoke test covers browser storage/cookies/navigation.
- **V4 — package output inspection:** after a fresh build, run
  `npm pack --dry-run` with working directory
  `packages/oidc-vault-dpop-client`; inspect `dist/index.d.ts`,
  `dist/index.d.mts`, both JS entries, export-map targets, and included docs.
  The packed-consumer tests, not dry-run alone, prove installed consumption.
- **V5 — final repository integration:** run `pnpm build`, `pnpm test`, and
  `pnpm lint` serially. Root tests already serialize package rebuilds. Preserve
  unrelated work and report its effect on results without reverting it or
  calling a failure pre-existing without actual baseline evidence. These checks
  were attempted as recorded above. At closure, the user explicitly accepted
  their recorded outcomes without requiring the full-workspace tests to pass
  for this package-specific objective; V1-V4 remain required and passed.

Record exact commands, relevant revision/worktree state, results/counts, and
limitations in each task's completion evidence. If the source changes after a
check, rerun the affected checks before using them for final completion.

## Open decisions and definition of done

OBEAR-01 gates implementation on final public type compatibility, the Bearer
opaque/JWT/token-type profile, cookie/old-client coordination, unsupported-method
behavior, and the fully disabled backend's login scope. Recommended minimum:
reuse guarded POST login on an optional-binding backend and defer new unbound
navigation logout; do not broaden server production behavior without approval.

Resolution: OBEAR-01 finalized these contracts above and the supported minimum
is implemented. No design or feature-scope review blocker remains. The user
explicitly removed the V5 full-workspace test pass as a closure prerequisite;
those failed attempts and their limitations remain documented under OBEAR-99.

Done means explicit Bearer mode works end-to-end in both transports, DPoP remains
enabled by default with its existing fail-closed behavior/types, no automatic
downgrade or weaker credential scope/retry/storage policy is introduced, installed
consumers and documentation agree, and all required checks and acceptance criteria
have passing recorded evidence under the user-approved package-specific acceptance
boundary. This is not a claim of a fully passing workspace test suite. Saving or
changing task status alone satisfies none of the implementation criteria; closure
rests on the delivered implementation, independent review, and checks above.
