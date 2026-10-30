# OIDC vault DPoP proactive refresh and credential notifications

Created: 2026-10-29 17:05:04 PDT
Status: completed

## Objective and scope

Add reusable, framework-agnostic session maintenance to
`@web-ts-toolkit/oidc-vault-dpop-client`:

1. Distinguish a confirmed upstream refresh-token rejection from an outage.
2. Notify applications when committed client credentials change or are cleared,
   independently of whether proactive refresh is enabled.
3. Offer opt-in, expiry-driven refresh with an optional, explicit maximum refresh
   interval for applications that accept the associated keep-alive behavior.

The user requested this task file first. Creating it does not implement the
features or start the implementation tasks. All five tasks start pending.
ABCLS's reported token-mirroring integration motivates the notification surface,
but implementation and verification must not require that external repository.

The user subsequently authorized implementation. Work now follows the ordered
tasks below; the creation-time observations remain historical baseline evidence.

Primary scope: the browser client, narrowly scoped provider-error handling in
`packages/express-oidc-vault`, their tests and published documentation, and the
existing DPoP example's browser integration harness.

Non-goals: application idle detection, framework adapters, ABCLS migration,
automatic login/navigation or key replacement, new token persistence, changing
vault/provider absolute session limits, stateless JWT revocation, upstream IdP
DPoP, distributed refresh leases, or a guarantee of refresh during suspension.
Do not change store-provider contracts without a separately justified dependency.

## Inspected evidence and limitations

Source baseline: `c8b765e`, root version `0.61.0`. Unrelated access-router source,
tests, and task documents were already modified/untracked; preserve that work.
This task-creation change must add only this document.

| Observation                                                                                                                                                            | Inspected evidence                                                                                                                                                                      | Classification                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Session options have no scheduler or credential observer. Direct credentials and peer credentials have distinct publication paths.                                     | `packages/oidc-vault-dpop-client/src/auth-session.ts:24-50,408-438,478-529` (`OidcVaultDpopSessionOptions`, `publish`, `adoptPeer`)                                                     | Optional integration improvement                                  |
| Refresh is single-flight, ordered through the lifecycle FIFO, and cookie-lock coordinated. Its reuse tests are based on liveness/generation, not a proactive deadline. | `packages/oidc-vault-dpop-client/src/auth-session.ts:655-682,758-825`; `src/session-lifecycle.ts`                                                                                       | Existing mechanism to reuse, with new due-check semantics needed  |
| API requests already refresh absent/expired tokens, so application token mirrors can become stale even without scheduling.                                             | `packages/oidc-vault-dpop-client/src/auth-fetch.ts:222-225`; `test/auth-fetch.unit.test.ts`                                                                                             | Notification use case independent of scheduling                   |
| Zero-lifetime credentials are intentionally valid so rotated body handles survive. A naive immediate scheduler could repeatedly refresh.                               | `packages/oidc-vault-dpop-client/src/credentials.ts:93-119`; `README.md`, "Bound credential response"                                                                                   | Boundary requiring explicit scheduler policy                      |
| Every non-success token-endpoint response is drained and mapped to a sanitized 502. The client deliberately treats that code as non-terminal.                          | `packages/express-oidc-vault/src/provider-client.ts:694-752`; `packages/oidc-vault-dpop-client/src/errors.ts:32-89`                                                                     | Intentional current contract; proposed classification improvement |
| Existing tests require generic provider-failure behavior, and concurrent upstream refreshes can reject an old token while a winner survives.                           | `packages/express-oidc-vault/test/bov-06-provider-boundary.test.ts:111-186`; `test/bov-03-concurrent-refresh.test.ts:279-358`                                                           | Compatibility and stale-failure constraints                       |
| Refresh preserves vault absolute expiry. Cookie coordination currently stores only binding/generation/activity metadata, not a refresh timestamp.                      | `packages/express-oidc-vault/src/index.ts:1115-1129`; `packages/oidc-vault-dpop-client/src/key-database.ts:28-38,128-153`                                                               | Keep-alive deadline provenance needs design                       |
| Installed-consumer tests cover packed ESM/CJS, strict DOM-only declarations, and README examples; real-browser tests live in the example app.                          | `packages/oidc-vault-dpop-client/test/oidc-vault-dpop-client.packed-consumer.test.ts`; `test/oidc-vault-dpop-client.docs.compile.test.ts`; `apps/oidc-vault-dpop-example/test/browser/` | Existing verification infrastructure                              |

The table's shortened `src/`, `test/`, and `README.md` references belong to the
package named immediately before them. Symbols/test names remain authoritative
if line numbers move.

Coverage is source/test inspection, not a runtime reproduction or comprehensive
security review. No build, typecheck, test, browser run, packed install, fresh
declaration inspection, performance measurement, ABCLS inspection, or live
Keycloak experiment was run for task creation. Proposed verification below is not
a passing baseline. Browser sleep/device suspension cannot be certified by fake
timers or ordinary headless browser runs.

### Existing task boundaries

- [Core boundary review](20260908-070811-express-oidc-vault-boundary-review.md),
  **BOV-03 and its FU1/FU2 proposals**, owns distributed upstream refresh
  reservations and cross-frontend stale-cookie ordering. This work must not claim
  to solve them. BOV-06's generic provider-failure contract receives only the
  explicitly documented refresh-grant exception in OVAR-02.
- [Server/client health](20261012-163240-dpop-server-client-health.md),
  **DPH-02/03/09/10**, supplies lifecycle authority, uncertain-commit recovery,
  bounded HTTP, and peer-admission preservation references. Do not repeat its
  completed remediation or weaken its advisory-peer failure policy.
- [Client package](20261003-232446-oidc-vault-dpop-client-package.md) supplies the
  existing public-package/consumer harness, not a proactive-refresh task.
- [Application integration](20261022-200950-express-oidc-vault-app-integration.md)
  covers server hooks, JWT issuance, and navigation logout. A browser credential
  observer is distinct from its server post-commit hooks.

Focused searches found no existing dedicated scheduler/credential-observer task.
Related documents are preservation references, not implementation dependencies
that this plan silently completes or reopens.

## Product constraints and proposed API

The following is a proposal for OVAR-01 to finalize, not an existing API:

```ts
{
  autoRefresh: {
    refreshBeforeExpiryMs: 60_000,
    // Optional, explicit keep-alive choice; absent by default:
    // maxRefreshIntervalMs: 20 * 60_000,
  },
  onCredentialsChanged: (credentials) => {
    // DpopAccessToken | undefined; undefined means credentials were cleared.
  },
  onAutoRefreshError: (error) => {
    // Background failure; there is no awaiting application caller.
  },
}
```

Required product boundaries:

- Omitted/disabled auto-refresh preserves today's behavior. Session creation
  must not bootstrap, refresh a stored handle, create a key, or navigate on its
  own. Successful explicit credential acquisition enables scheduling.
- `refreshBeforeExpiryMs` is a lead time relative to the effective access-token
  `expiresAt`, not a periodic interval or provider-idle timeout. For a one-hour
  token, 60,000 means approximately minute 59, not every minute.
- Conceptually, choose the earlier of expiry-minus-lead and the optional maximum
  interval deadline. Anchor the latter to an observed successful exchange/refresh
  commit, not a peer message's receipt/rebroadcast or session construction.
  Provider activity time is not known exactly; this remains best-effort policy.
- Credential observation is separate from scheduling: cover exchange, manual,
  API-triggered and scheduled refresh, admitted cookie-peer changes, and actual
  credential clearing. Do not expose refresh tokens, body handles, private keys,
  recognition signals, or additional backend state through notifications.
- Both expiry-driven and maximum-interval refresh may extend upstream idle
  sessions, depending on provider policy. Neither is proof of user activity.
  Applications remain responsible for idle logout and must retain sign-in
  recovery. Auto-refresh never extends the vault's absolute session lifetime.
- Preserve the existing refresh FIFO/single-flight, DPoP/nonce rules, recognition
  checks, request bounds, and lifecycle authority. Do not replay protected API
  mutations as part of this feature.
- Default to no automatic retry after a failed scheduled refresh: report and
  pause scheduling, retaining the existing terminal/non-terminal cleanup policy.
  A later successful explicit exchange/refresh rearms it. In particular, a
  timeout/network failure is not evidence that rotation did not commit. Resume
  or online events must not silently undo this paused state.
- Use same-origin/storage-partition/vault-scope cookie coordination. Body handles
  remain tab-local; no copying, broadcasting, or pretending they share a lease.

## Priority, dependencies, and execution rules

All tasks are P2 integration improvements or bounded design work, not newly
demonstrated authentication vulnerabilities. P1 would require a demonstrated
security/integrity/availability defect; record any such discovery separately.

Execute **OVAR-01 -> OVAR-02 -> OVAR-03 -> OVAR-04 -> OVAR-05**. This sequencing
also avoids overlapping edits to `auth-session.ts`, error contracts, and docs.
There is no authorization or claim of delegated execution from saving this file.

- Mark a task in progress only after its dependencies complete. Record selected
  contracts, changed paths, exact checks/results, and limitations before marking
  it completed. Missing required verification leaves it blocked, not completed.
- Keep regressions with their behavior changes. Do not defer all tests to the
  final integration task or manually edit generated declarations.
- Run build/test/pack jobs serially. Per-package test scripts rebuild shared
  outputs, and `AGENTS.md` explicitly requires serialized workspace tests.
- Preserve unrelated work. Update shipped READMEs/JSDoc alongside externally
  visible changes and reconcile website documentation before final sign-off.
  Leave root `CHANGELOG.md` to the release workflow.

## Tasks

### Task OVAR-01: Finalize scheduler, observation, and rejection contracts

Status: completed

Kind: investigation

Priority: P2; resolve behavior that materially affects recovery and cross-tab
correctness before changing public options or terminal error handling.

Dependencies: none

Primary ownership: this document's decision record; focused inspection of the
client session/lifecycle/credentials/cookie metadata and server refresh boundary.
No production implementation belongs to this task.

Finding: the public sketch does not yet settle short-lifetime cadence, observer
delivery/reentrancy, refresh-time provenance across tabs/reloads, or ownership of
a rejection for an obsolete rotation. Existing liveness-based reuse cannot simply
be assumed to satisfy every new deadline policy.

References: the evidence table; client `publish`, `adoptPeer`, `refresh`,
`onFailure`, `clearLocal`, and `dispose`; server `requestToken` and
`createRefreshHandler`.

Requirements:

1. Record final public names/types, disabled/default behavior, option validation,
   and unit/range arithmetic. Prefer the small proposed surface; do not add
   boolean-enabled shorthand, subscriptions, activity trackers, or a public
   scheduler framework without a concrete requirement.
2. Specify due-time computation, safe timer-delay capping, clock movement,
   lead-time handling for short-lived tokens, and a bounded/no-progress policy
   for expired or zero-lifetime results. There must be no immediate refresh loop.
3. Decide hidden-tab execution policy and resume events, including visibility
   restoration and `pageshow`/BFCache. Specify whether a validated new-generation
   peer success may rearm a failure-paused context. State that scheduling is
   best effort and that a paused failure is not automatically retried on resume.
4. Specify observer ordering, duplicate suppression, clearing and disposal
   behavior, synchronous throws/returned rejected promises, and reentrant calls.
   Notifications cannot veto a committed rotation or hold a Web Lock/FIFO while
   awaiting application code; stale delivery cannot restore an old app mirror.
5. Specify generation-bound maximum-interval provenance across peer adoption and
   reload. If additive non-credential coordination metadata is needed, define
   validation and conservative behavior for missing/old/malformed hints. Preserve
   installed keys/database identity and never persist access tokens or handles.
6. Define the refresh-rejection exception: proposed stable
   `OIDC_VAULT_REFRESH_REJECTED`, selected browser-facing status/fixed message,
   and recognition only of a complete, bounded valid OAuth `invalid_grant`
   response to a refresh-token grant on an appropriate rejection status
   (normally HTTP 400). Do not infer expiry specifically, match descriptions,
   or classify arbitrary 4xx/5xx bodies as terminal.
7. Resolve cleanup authority for rejection of an obsolete request. A rejection
   must not newly clear a successor cookie or revoke a surviving lineage merely
   because an old submitted token failed. A demonstrably superseded rejection
   must not tell the application that newer current credentials require login.
   Do not expand into the deferred distributed-reservation protocol; identify a
   blocking dependency explicitly if the narrower contract cannot be met.

Acceptance criteria:

- Append a concrete decision record covering all seven items, with the test
  scenarios and implementation boundaries for subsequent tasks.
- Explain the one-hour-token/30-minute-idle example and why expiry lead time
  alone does not solve it. State both idle-extension and absolute-expiry limits.
- No material contract is silently left to implementation. If a maintainer
  decision is required, identify it and block dependent tasks until resolved.

Verification: evidence/design review against the inspected entry paths and
existing race/zero-lifetime tests; use a narrowly scoped experiment only if needed
to resolve an uncertainty, recording its exact command and result.

Decision record / completion evidence:

- Public options: `autoRefresh?: false | OidcVaultDpopAutoRefreshOptions`, with
  optional `refreshBeforeExpiryMs` (60,000 only when enabled) and optional
  `maxRefreshIntervalMs` (no default). Lead is an integer 0..2,147,483,647;
  maximum interval is an integer 1,000..2,147,483,647. Snapshot options at creation;
  invalid values/callback types throw `TypeError` before starting browser work.
- For a known commit time, cap the lead to half that credential's initial
  remaining lifetime, then choose the earlier expiry/maximum deadline. Enforce
  a one-second minimum scheduled cadence. Zero/nonlive results retain handles,
  pause, and report non-terminal `DPOP_ACCESS_TOKEN_EXPIRED`. Repeated live
  non-progressing results cannot spin faster than the cadence floor. Cap each
  timer delay to the browser limit and recheck the epoch clock on every wake;
  a future/invalid timing hint is treated as unknown, never fresh activity.
- Enabled timers run whenever the browser executes them, including hidden tabs.
  Visible `visibilitychange` and `pageshow` recheck a deadline, not missed ticks;
  they do not unpause failure. Only a successful explicit local acquisition
  rearms a failure-paused context; unsolicited peer adoption alone does not.
- `onCredentialsChanged?: (credentials: DpopAccessToken | undefined) => void`
  is asynchronous, coalesced latest-state observation, not an event log. Suppress
  duplicates and never deliver an obsolete token after clear. Deliver only when
  this instance is outside mutation/lock ownership; do not await observers and
  contain synchronous throws and returned rejected promises. Disposal suppresses
  pending token delivery and delivers a final undefined only if a token was
  previously observed. No further events follow that final clear.
- `onAutoRefreshError?: (error: unknown) => void` uses the same exception
  containment. A scheduled failure pauses and reports once; stale/superseded
  work is silent. Manual refresh keeps its normal promise error contract.
  Implementation review tightened the uncertain-commit boundary: failed manual
  refresh also pauses existing scheduling silently, preventing a subsequent
  timer from becoming an implicit retry. Proven newer peer publication is not
  paused by an old failure; superseded work without an admitted winner pauses
  silently rather than retrying an obsolete credential every cadence tick.
- Add optional, generation-bound `refreshedAt` to existing cookie coordination
  metadata, including sessions without an enabled scheduler. It is a bounded
  non-credential epoch hint, not provider testimony. Peer receipt never resets
  it. Missing/malformed/future hints make an enabled maximum interval due now;
  expiry-only scheduling uses the existing absolute expiry. No database-name,
  key, token DTO, body-handle, or store-provider contract change is needed.
- Recognize only complete bounded HTTP-400 JSON objects with exact own
  `error: 'invalid_grant'` for `grant_type: 'refresh_token'`. Emit HTTP 401,
  `OIDC_VAULT_REFRESH_REJECTED`, fixed `OIDC refresh was rejected. Sign in again.`
  This is rejection, not proof of expiry. Other statuses/grants/bodies retain
  the generic failure policy. No new server cookie clearing or lineage deletion.
- The server rechecks the submitted record on rejection; an already-replaced
  record falls back to the generic non-terminal provider failure. The client
  independently checks captured publication/binding/generation before admitting
  this new terminal error; proven stale rejection becomes non-terminal
  `DPOP_OPERATION_SUPERSEDED`, and failed advisory lookup is non-terminal. These
  reads are not a distributed lease and cannot order other frontend cookie
  responses; that existing limitation remains explicit.
- Reviewed these decisions against the existing FIFO, peer-authority,
  zero-lifetime, bounded provider-reader and concurrent-family fixtures. No
  runtime experiment was needed for this design-only task. A one-hour token
  refreshes around minute 59 with a 60-second lead; an explicit 20-minute maximum
  can cover a 30-minute idle policy while the browser runs. Either scheduler
  policy may extend upstream idle sessions and neither extends absolute expiry.

### Task OVAR-02: Classify confirmed refresh rejection without clearing newer auth

Status: completed

Kind: improvement

Priority: P2; let applications distinguish sign-in recovery from provider failure
without turning outages or stale requests into logout.

Dependencies: OVAR-01

Primary ownership:

- `packages/express-oidc-vault/src/provider-client.ts` and refresh-route integration
  in `src/index.ts` only as needed.
- `packages/oidc-vault-dpop-client/src/errors.ts` and narrowly scoped failure
  authority in `src/auth-session.ts`.
- Existing provider-boundary/concurrency/transport tests, client error/session
  regressions, and both packages' error/migration documentation.

Finding: the server currently discards OAuth error fields and returns generic
502; the client's deliberate allowlist consequently cannot mark confirmed
refresh rejection as requiring sign-in. Existing tests codify this behavior.

References: `provider-client.ts:734-747` (`requestToken`);
`express-oidc-vault/test/bov-06-provider-boundary.test.ts`, "upstream failure status
policy"; `test/bov-03-concurrent-refresh.test.ts`, "without reuse detection the
winner family survives"; client `src/errors.ts:34-89` and `onFailure`.

Requirements:

1. Implement only OVAR-01's narrow rejection exception under existing provider
   body/deadline limits and best-effort cleanup. Return a fixed sanitized code
   and message; never forward OAuth descriptions, tokens, or provider URLs.
2. Keep authorization-code rejection, `invalid_client`, unknown errors, redirects,
   rate limits, outages, malformed/non-object/oversized/truncated bodies, and
   timeouts under their existing non-terminal provider-failure policy.
3. Add the new client terminal code and current-request cleanup semantics. Retain
   stale-generation protection, advisory peer behavior, unrelated-session
   isolation, and existing nonce/proof classifications. Introduce no automatic
   retry, whole-lineage revocation, or cookie clearing based solely on an old
   provider rejection.
4. Update affected assertions intentionally, retaining independent evidence of
   upstream request count and winner survival rather than merely changing an
   expected status. Document mixed-version behavior: old servers still return
   generic failures; old clients sanitize the unknown new code as non-terminal.

Acceptance criteria:

- Both transports expose a stable sign-in-required error for the current
  session's confirmed refresh rejection, without additional upstream attempts.
- Negative status/body/grant cases retain auth and expose no upstream text.
- Deterministic overlap/late-failure tests prove a surviving newer rotation is
  not cleared or reported as requiring login by this new exception.
- Existing HTTP bounds, provider transport, proof/nonce and error-allowlist
  regressions pass; documentation describes rejection, not proven expiry.

Verification: V1 provider/client error and lifecycle regressions, then V2 for
both affected packages. Record any new focused test filename in completion evidence.

Completion evidence:

- Changed provider parsing and the server's post-rejection record recheck,
  client allowlist and publication/login-intent/cookie-generation admission,
  `test/refresh-rejection.test.ts`, existing family/error/session regressions,
  both READMEs and matching website error guidance. No new cookie clearing,
  server revocation, mutation retry, or store interface was introduced.
- Root `pnpm --filter @web-ts-toolkit/express-oidc-vault... build`: passed.
- V1 core command with added `test/refresh-rejection.test.ts`: 5 files / 185
  tests passed. V1 client command: 5 files / 539 tests passed.
- With `TMPDIR` set to the ignored repo-local `_tmp-oidc-refresh`, root
  `pnpm --filter @web-ts-toolkit/express-oidc-vault test`: 41 files / 2,449 tests
  passed. Then `pnpm --filter @web-ts-toolkit/oidc-vault-dpop-client test`:
  all four typecheck lanes and 18 files / 862 tests passed, including packed and
  README consumer lanes. Node v26.12.1. Commands ran serially.
- Focused ESLint over the eight changed source/test files: passed. Vite emitted
  its existing native-config-loader advisory; no runtime failure. Browser/final
  workspace checks remain assigned to later tasks, not claimed by this result.

### Task OVAR-03: Publish committed credential changes independently of scheduling

Status: completed

Kind: improvement

Priority: P2; remove duplicate token-source polling/mirroring logic for any app,
including apps that keep refresh entirely on demand.

Dependencies: OVAR-02

Primary ownership: client `src/auth-session.ts`, `src/index.ts`, exported options
and JSDoc; `test/auth-session.unit.test.ts`, relevant fetch/peer regressions,
`test-decl-consumer/`, packed-consumer fixtures, and shipped README.

Finding: `publish` and `adoptPeer` update memory without notifying the application;
`clearLocal` and disposal drop it through separate paths. Applications cannot
reliably synchronize an external token mirror with all internal operations.

References: client `src/auth-session.ts:236-252,408-438,478-529,963-975`;
`src/auth-fetch.ts:222-225`; `test/oidc-vault-dpop-client.packed-consumer.test.ts`.

Requirements:

1. Implement the top-level observer contract from OVAR-01 with auto-refresh
   absent. Cover direct exchange, manual/API refresh, peer adoption, local and
   peer clearing/reset, terminal invalidation, navigation logout, and the selected
   disposal semantics. Suppress duplicate/no-change peer delivery.
2. Observe only committed, still-authoritative state. Do not emit for malformed
   responses, rejected peer candidates, failed pre-commit work, or superseded
   publication. An old queued notification cannot repopulate a cleared app mirror.
3. Isolate observer throws and rejected promises from protocol results and
   cleanup. Never await application observers while owning mutation/lock work;
   reentrant clear/logout/refresh must not deadlock or reverse event order.
4. Keep the snapshot limited to existing public credential fields or undefined;
   do not add persistence or couple the observer to an application storage API.
   Export any named public types from the root and document callback behavior in
   declarations and the installed README.

Acceptance criteria:

- A small app-owned mirror follows all committed token replacements/clears
  without polling, including a `fetchWithDpop` refresh and cookie-peer adoption.
- Duplicate peers, stale results, disposal, and failed operations obey the
  selected event contract; no credential notification leaks private state.
- Throwing/rejecting/reentrant observers do not alter refresh success, rotated
  handle retention, lock release, or terminal cleanup; no unhandled rejection.
- Strict DOM-only NodeNext/Bundler consumers typecheck the option through the
  package root with auto-refresh disabled or omitted.

Verification: V1 client lifecycle/fetch/error tests and observer regressions;
V2/V4 client checks, plus V3 where native peer/lock ordering is relevant.

Current evidence / temporary blocker:

- Implemented top-level asynchronous latest-state observation and native browser
  mirror fixture; added lifecycle/reentrancy/error/duplicate-peer/disposal tests,
  strict/packed declaration fixtures and README/website guidance.
- V1 observer/error/fetch tests: 3 files / 492 tests passed. Full client test:
  four typecheck lanes and 18 files / 884 tests passed. Focused ESLint passed.
  An initial peer-observer test needed an explicit event barrier rather than a
  single event-loop turn; the corrected test awaits the admitted notification.
- Serial example dependency build/typecheck/bundles passed. Native maintenance
  test could not launch either engine because the current Playwright binaries
  were missing. Installing Chromium/Firefox into the ignored repo-local test
  workspace; rerun native verification before completing this dependency.

Completion evidence:

- Resolved missing engine/system-library prerequisites without system changes:
  Playwright Chromium/Firefox and rootlessly extracted Ubuntu ALSA/NSS/NSPR
  packages live under ignored `_tmp-oidc-refresh`. Subsequent browser commands
  set `PLAYWRIGHT_BROWSERS_PATH` and `LD_LIBRARY_PATH` to those repo-local paths.
- Root command `pnpm --filter oidc-vault-dpop-example exec vitest run --config
vitest.browser.config.ts test/browser/maintenance.browser.ts` with both engines
  selected: 1 file / 2 tests passed. Real Chromium 151.0.7922.34 and Firefox
  153.0 exercised peer publication and clear, real locks/IDB/crypto/HTTP. Same-site
  loopback only; no live Keycloak, suspended-device or Safari certification.
- Together with the V1/V2/V4 results above, observer acceptance criteria pass.

### Task OVAR-04: Add bounded opt-in scheduling with cookie deadline coordination

Status: completed

Kind: improvement

Priority: P2; provide shared proactive-refresh behavior without compromising
rotation recovery, lifecycle authority, or cookie-tab coordination.

Dependencies: OVAR-03

Primary ownership: client `src/auth-session.ts` and a private scheduler helper if
justified; generation-bound non-credential metadata in `src/key-database.ts` and
internal channel envelopes only as designed; client unit tests and narrow
extensions to `apps/oidc-vault-dpop-example/test/browser/`/`page-bridge.ts`.

Finding: no scheduler exists. Reusing the current refresh operation is necessary
but insufficient unless due work rechecks deadlines after FIFO/lock admission
and peer adoption. Maximum-interval policy also needs refresh-time provenance.

References: client `refresh` (`src/auth-session.ts:758-825`), `publish`,
`adoptPeer`, `login`, `logout`, `logoutAndNavigate`, `invalidateLocal`, and
`dispose`; `src/key-database.ts:28-38`; `src/credentials.ts:93-119`;
`README.md`, "Uncertain commit / retry"; example `test/browser/tabs.browser.ts`
and `lifecycle.browser.ts`.

Requirements:

1. Validate/snapshot configuration, arm one scheduler timeout from committed
   credentials, and reschedule after replacement/adoption consistently with the
   failure-pause/rearming contract. Use effective `expiresAt` and the optional
   maximum-interval deadline with OVAR-01's bounded short-life/zero-life policy
   and safe clock/timer arithmetic.
2. Route scheduled work through the existing refresh lifecycle. Recheck whether
   refresh is still due after serialization/lock admission; a peer winner should
   be reused/rescheduled, not cause redundant rotation. Do not label a still-live
   token as API-rejected merely to force a proactive refresh.
3. Keep maximum-interval provenance bound to the admitted generation across
   peer delivery/reload. Validate additive hints; duplicate or delayed messages
   cannot extend deadlines. Support older/missing hints conservatively without
   clearing valid auth, replacing keys, or persisting credentials.
4. Cancel pending scheduled intent on login/exchange/logout/navigation-logout
   transitions, clear/reset/terminal invalidation, and disposal as specified.
   An earlier started refresh may still publish its rotated handle before an
   ordered logout, but must not rearm work behind that logout. Stale timer/resume
   callbacks cannot refresh, publish, notify, navigate, or resurrect auth.
5. Recheck on the selected resume events with at most one due refresh, not a
   catch-up loop. Remove scheduler listeners/timeouts on disposal. Preserve
   replacement-session bootstrap state and existing peer-wait cleanup.
6. Surface scheduled failures through the background error callback, isolate
   callback failures, and pause according to the selected policy. Successful
   explicit acquisition rearms; visibility/online events do not retry uncertain
   mutations. Never initiate login, reset a key, or replay an API mutation.
7. Necessary verification follow-up: make the browser fixture's ephemeral SPA
   listener bind atomically. A full V3 rerun exposed Vite 8.3.5's probe/rebind
   port-0 race with other listeners. Keep real Vite middleware, browser protocol
   behavior and source imports; do not retry auth mutations or relax assertions
   to hide listener failures.

Acceptance criteria:

- Disabled/omitted configuration produces no scheduler work. Fake-clock cases
  prove one-hour/60-second-lead refresh around minute 59, and explicit
  20-minute maximum interval refresh before a 30-minute idle boundary in the
  controllable provider fixture. This is not a live-Keycloak guarantee.
- Boundary cases include invalid/overflowing durations, short and zero lifetime,
  non-progressing refresh results, clock jumps, long timer delays, resume after
  deadline, timeout/network failure, explicit recovery, and callback failure.
- Barrier-driven tests cover scheduled/manual/API refresh overlap; lifecycle
  intent during queued/in-flight work; no post-clear/dispose resurrection; and
  no publication rearming behind a queued logout.
- Native cookie-tab tests count upstream refreshes: simultaneous due tabs share
  one winner under normal delivery; stale timers recheck adopted credentials;
  duplicate/delayed/missing peer messages and reload do not silently postpone
  the maximum-interval deadline. Lost winner delivery may require a later
  serialized refresh; do not claim distributed/exactly-once guarantees.
- Body sessions retain tab-local handles. Existing proof/nonce/recognition,
  key-loss, FIFO, request-bound and cancellation regressions continue to pass.

Verification: V1 deterministic client tests, V2 affected packages/example unit
tests, and V3 Chromium/Firefox coverage. Record exact browser versions and the
limits of any simulated visibility/resume behavior.

Current implementation / verification evidence:

- Added private `src/auto-refresh.ts`, root-exported options, lifecycle-integrated
  due refresh, generation-bound optional cookie `refreshedAt`, and scheduler
  cancellation/pause/rearming. Observer and manual promise contracts remain
  independent; no new runtime export, dependency, backend lease or token storage.
- Added deterministic clock/cadence/hint/overflow/resume/config tests and session
  barriers for shared API/manual scheduling, ordered logout, clear/reset/disposal,
  timeouts, manual failure pause and callback errors. A virtual provider-idle
  fixture demonstrates one-hour local expiry vs 30-minute idle, with an explicit
  20-minute maximum maintaining activity; no live Keycloak guarantee is claimed.
- Source/test and strict NodeNext/Bundler checks pass. Latest full client test:
  19 files / 973 tests passed, including installed packed/README compile lanes.
  Example `test:unit`: dependency build/typechecks and 5 files / 53 tests passed.
  Client `test:browser-smoke`: built jsdom import, 1 file / 5 tests passed.
- Native maintenance coverage passed 10 tests across Chromium 151.0.7922.34 /
  Firefox 153.0: actual shared-cookie scheduled rotation, controlled native
  IDB/channel generation while lock admission waits, old metadata on reload,
  and confirmed provider rejection/mirror clearing. Timing waits were adjusted
  from Vitest's default one second to cover the selected 2-3-second real timers.
- First full V3 run: 137/138 passed; one existing Firefox navigation test failed
  during initial callback with repeated nonce challenge before its tested action.
  No baseline attribution is claimed. Its exact focused rerun passed. A full
  V3 rerun is in progress against the latest bundle before task completion.
- That rerun passed 136/138; two fixtures failed before auth work because Vite's
  ephemeral-port probe raced another listener. Inspection confirmed the selected
  port is closed before Vite rebinds it. The harness now uses real Vite middleware
  behind Node's atomic `listen(0)` and disables unnecessary HMR. This narrow
  test-only follow-up is necessary for the required integration gate; a fresh
  full run must verify it.
- Review additionally ensured the private scheduler drops its credential on
  disposal and suppresses queued error delivery after newer acquisition/clear.
  Focused ESLint and whitespace checks pass; final full-workspace checks remain
  assigned to OVAR-05.

Completion evidence:

- Latest full V3 root `pnpm --filter @web-ts-toolkit/oidc-vault-dpop-client
test:browser` (repo-local browser/libraries/TMPDIR environment): **8 files /
  138 tests passed** across real Chromium 151.0.7922.34 and Firefox 153.0, with
  the atomic SPA listener. Both earlier full-run failures remain documented
  above; no nonce retry relaxation or auth-test deletion was introduced.
- All V1/V2/V3 acceptance checks pass, including timing/admission/old-hint/recovery,
  installed consumer and existing lifecycle/proof/nonce suites. Framework/demo
  defaults remain off. Actual sleep/BFCache suspension, live Keycloak, Safari,
  cross-site cookie policies and distributed leases remain unverified/non-goals.

### Task OVAR-05: Verify and document the installed application contract

Status: completed

Kind: improvement

Priority: P2; make the completed behavior discoverable and usable in unrelated
TypeScript apps, with integration evidence rather than source-only success.

Dependencies: OVAR-04

Primary ownership:

- Both package READMEs, public JSDoc, client `llms.txt` if its index needs updating,
  and `website/docs/packages/oidc-vault-dpop-client.md` /
  `website/docs/packages/express-oidc-vault.md`.
- Client declaration/packed/docs-consumer fixtures; existing example integration
  tests and at most a small opt-in demonstration, without changing demo defaults
  to keep sessions alive silently.
- This document's final evidence and definition-of-done reconciliation.

Finding: README API reference/error tables, shipped declarations, packed consumer
fixtures, and website docs currently describe manual/on-demand refresh only.
New options must be understandable from the installed package alone.

References: both package `package.json` / `tsup.config.ts` and client
`src/index.ts`; client `README.md`, "Error classification", "Lifecycle concurrency
and cleanup", and "API reference"; `test/oidc-vault-dpop-client.docs.compile.test.ts`
and `test/oidc-vault-dpop-client.packed-consumer.test.ts`.

Requirements:

1. Ship copy-pasteable named-root-import examples for opt-in expiry refresh,
   separately enabled maximum interval, and credential observation without a
   scheduler. Show handling undefined/terminal errors and keeping sign-in
   recovery; never log token values or introduce a second refresh loop.
2. Explain default-off behavior, effective expiry versus upstream idle/absolute
   lifetimes, potential idle extension from either scheduling policy, body/cookie
   limits, short-life behavior, observer semantics, suspended-tab limits, paused
   failure/rearming, uncertain commits, and mixed-version error compatibility.
3. Inspect freshly emitted `.d.ts`/`.d.mts` and installed ESM/CJS contents. New
   public types must be root-reachable, DOM-only, and retain useful JSDoc; no
   backend/Node type leak, deep imports, or unrelated export-map changes.
4. Extend packed and README compile fixtures to exercise accepted options,
   callback parameter types, and invalid configuration types. Reconcile website
   examples and error tables with the shipped README and runtime behavior.
5. Recheck every task's acceptance criteria against delivered changes and final
   results. Record remaining distributed/provider/browser limitations explicitly;
   do not claim independent review or live-provider certification that did not run.

Acceptance criteria:

- A clean installed consumer can discover and typecheck both workflows without
  repo source, a framework, ABCLS, or a backend package installation.
- All feature-specific focused, package, packed, and browser checks pass, and
  repository checks are executed with their actual outcomes recorded. Per the
  user's explicit completion decision below, the unrelated Mongo fixture port
  collision and local `.wip` lint failures are accepted exceptions to this task's
  repository-wide passing requirement, not passing checks or feature defects.
- Final evidence records actual commands/results, affected revision/worktree,
  browser scope, compatibility notes, and preserved non-goals; no pending task
  is marked complete merely because its code or this document exists.

Verification: V2-V5, plus a final evidence/documentation/contract review.

Preflight evidence / known final gate:

- README, website, option/factory JSDoc, root type exports, and `llms.txt` now
  describe default-off expiry scheduling, explicit keep-alive, independent
  observation, failure/manual-pause/rearming, and mixed-version rejection.
  Fresh ESM/CJS declarations expose the root options and observer argument types
  without Node/backend imports; strict packed README consumers passed in V2.
- Root `pnpm lint` failed with 19 errors only in unrelated ignored
  `.wip/benchmarks/snapshot-phase2-20261028-121550/` artifacts. No files there or
  lint configuration were changed. Supplemental root
  `pnpm exec eslint . --ignore-pattern '.wip/**'` passed; this is not a claim that
  the required unmodified root lint command passed. That gate needs maintainer
  cleanup/exclusion of unrelated local artifacts before final completion.

Delivered evidence / remaining blocker:

- Root `pnpm build` passed for the active workspace, including package
  declarations, examples and website. The new options/observer JSDoc and
  strict installed-consumer examples agree with implementation; no manifest,
  runtime export-map, dependency or artifact-layout change was needed.
- Root `pnpm test` finished with exit 1, using the repo-local TMPDIR/browser/runtime
  environment and both browser engines. Before the unrelated failure, it passed
  the core vault (2,449 tests), browser client (973), example unit suite (53),
  full Chromium/Firefox suite (138), and memory/MongoDB/Redis vault-store suites
  (179/246/462 respectively), including their build/type/packed-consumer lanes.
- The full workspace gate stopped in
  `packages/access-router-deco/test/documentation-examples.test.ts`: its
  MongoMemoryServer fixture reported a selected port already in use before the
  suite ran (21 other files / 675 tests passed, 16 fixture tests skipped). This
  is outside the delivered feature scope; no baseline attribution or passing
  whole-workspace result is claimed, and remaining packages were not confirmed.
- Maintainer-owned blocker: unmodified root `pnpm lint` still fails on the 19
  unrelated ignored benchmark-artifact errors above. Source lint with only that
  local artifact directory excluded passes, as do focused changed-file checks.
  Do not delete other work or silently count the supplemental check as root
  lint success. OVAR-05 remains blocked until the root lint and full test gates
  both pass; the maintainer must resolve/avoid the unrelated Mongo fixture port
  collision and clean/exclude their local benchmark artifacts before rerunning.
- Implementation/docs are delivered; OVAR-01..04 are complete. No commit, push,
  release, application migration, or independent-agent review was performed.
  Unrelated access-router/benchmark/changelog edits remain untouched.

Completion decision / evidence:

- After reviewing the updated documentation and the two unrelated repository
  verification blockers, the user explicitly requested marking this item
  complete. OVAR-05's acceptance criterion is revised above to accept those
  specific exceptions; the historical blocked-state evidence is preserved.
- Documentation, public declarations, installed-consumer examples, feature
  package/store tests, native browser coverage and workspace build are delivered
  and verified as recorded. All five OVAR tasks are complete under that accepted
  scope. This is not an assertion of a clean root test/lint run or release approval.
- Residual repository hygiene: the Mongo fixture port collision and 19 local
  `.wip` lint errors remain unresolved outside this feature's scope. No files
  were deleted, checks disabled, or unrelated implementation changed to close it.

## Shared verification

Commands below are proposed execution checks, not checks already run. Unless
stated otherwise, run from `<repo-root>`; replace placeholders before execution.
Use supported Node >=22.12.0 and the repository's pnpm/toolchain. Packed consumers
need local package-manager/cache or registry access; browser tests need Playwright
Chromium/Firefox and system libraries. Full workspace tests may additionally need
MongoDB binaries, Docker/Redis, and other packages' existing prerequisites.

For harnesses using the system temp directory, prefer an ignored repo-local
`_tmp*` directory, verify it is ignored, and set `TMPDIR` at runtime. Do not save
machine-local absolute paths or private AI session identifiers in evidence.

### V1: Focused regression checks

Build required outputs first and keep commands serial:

- Root: `pnpm --filter @web-ts-toolkit/express-oidc-vault... build`.
- From `packages/express-oidc-vault`:
  `pnpm exec vitest run --config ../../vitest.config.ts test/bov-06-provider-boundary.test.ts test/bov-03-concurrent-refresh.test.ts test/ovh-01-provider-transport.test.ts test/index.test.ts`.
- Root: `pnpm --filter @web-ts-toolkit/oidc-vault-dpop-client... build`.
- From `packages/oidc-vault-dpop-client`:
  `pnpm exec vitest run --config ../../vitest.config.ts test/errors.unit.test.ts test/auth-session.unit.test.ts test/auth-fetch.unit.test.ts test/credentials.unit.test.ts test/key-database.unit.test.ts`.
- Include newly added focused files in the recorded command; a new test file
  that is never executed does not satisfy its task's regression requirement.

### V2: Affected package and example checks

Run separately from the root:

```sh
pnpm --filter @web-ts-toolkit/express-oidc-vault test
pnpm --filter @web-ts-toolkit/oidc-vault-dpop-client test
pnpm --filter oidc-vault-dpop-example test:unit
pnpm --filter @web-ts-toolkit/oidc-vault-dpop-client test:browser-smoke
```

The client test script includes source/test/declaration typechecks. The jsdom
smoke check is not a native browser coordination or suspension test.

### V3: Native browser integration

Root: `pnpm --filter @web-ts-toolkit/oidc-vault-dpop-client test:browser`.
The existing script selects Chromium and Firefox through the example harness.
Exercise real Web Crypto, IndexedDB, Web Locks, BroadcastChannel, login/bootstrap,
credential observation, and scheduled cookie rotation. Record limitations for
WebKit/Safari, cross-site cookies, BFCache/suspension simulation, and live IdPs.

### V4: Installed package and documentation surface

V2 must execute the client packed-consumer and docs-compile tests and the core's
`test/packed-consumer.test.ts`; inspect their actual results, not only a generic
test exit summary. Verify new options/callbacks in strict NodeNext and Bundler
fixtures (`types: []`, `skipLibCheck: false`) and inspect generated declaration
comments. Existing source-tree/release-style packed lanes cover the package
surface; no new release-artifact configuration is planned.

### V5: Final workspace integration

Run serially from the root:

```sh
pnpm build
pnpm test
pnpm lint
```

Record unrelated failures honestly and establish baseline evidence before
labeling them pre-existing. Do not revert other work to obtain a passing result.
Run the repository artifact build/verify commands additionally if implementation
changes artifact configuration or layout; that expansion needs explicit evidence
and a concrete release version, not an invented placeholder result.

## Definition of done and execution evidence

- Completion scope: the user accepted the two recorded unrelated root-check
  exceptions in OVAR-05 and requested completion. They remain visible below that
  task; no passing full-repository test/lint result is claimed.
- OVAR-01 through OVAR-05 completed in dependency order, with final contracts and
  per-task changed paths/checks/results recorded here.
- Defaults remain unchanged; observer works without scheduling; scheduled work
  preserves lifecycle, coordination, and uncertain-commit boundaries.
- Confirmed current-session refresh rejection is distinguishable from outage or
  obsolete-request failure without exposing provider details or clearing newer auth.
- Native browser and installed-consumer evidence covers the advertised contract;
  remaining distributed/suspension/IdP limitations are visible in shipped docs.
- No application-specific code, credential persistence, implicit idle extension
  policy, automatic reauthentication, or unrelated changes were introduced.

Task-creation evidence: inspected source, existing task boundaries, manifests and
test harnesses; ran repository status, revision and local-clock reads. No runtime
verification or implementation has run. Populate completion evidence under each
task during authorized implementation; do not replace this baseline with an
unqualified claim that the feature was already verified.

Document-only verification: a read-only Python validation passed for five unique
pending task IDs, required fields, ordered/resolvable dependencies, local Markdown
links, balanced code fences, whitespace, and absence of machine-local paths or
private session identifiers. `git diff --check` also passed. These checks do not
constitute package, browser, or feature verification.
