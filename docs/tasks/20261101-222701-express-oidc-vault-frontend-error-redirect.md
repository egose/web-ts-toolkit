# Express OIDC Vault frontend callback error recovery

Created: 2026-11-01T22:27:01-0700
Status: completed
Completed: 2026-11-04
Kind: improvement
Priority: P2 — browser/application integration improvement
Package: `@web-ts-toolkit/express-oidc-vault`
Plan owner: package maintainer / coordinating agent

## Objective and scope

Add an optional `frontendErrorRedirectUri` middleware option for failed browser
callback navigations. Applications should be able to show their existing sign-in
error screen and an explicit retry button without intercepting Express responses.

Own this work as a package implementation: public types, construction-time
configuration, callback response policy, regression coverage, installed consumers,
and shipped/website documentation. The chosen option name deliberately parallels
the existing `frontendRedirectUri` successful-callback option.

Scope is `packages/express-oidc-vault`, its existing packed-consumer fixtures, and
`website/docs/packages/express-oidc-vault.md`. Reuse current callback/store/provider
fixtures. Store-provider interfaces and browser-client changes are not expected
dependencies; justify any newly necessary cross-package work before adding it.

Non-goals: diagnosing the original user's state failure, relaxing state/cookie/token
validation, changing default JSON errors, implementing application error pages,
automatic login retries, or migrating ABCLS in this package change.

Planning revision: the initial document framed this as a feature request. It is
now an executable package-maintenance plan following the task-as-you-go workflow.
The creation timestamp and FER-01 through FER-04 IDs are retained. FER-01 owns a
bounded contract investigation; FER-02 now includes implementation regressions;
FER-03 owns the shipped consumer/documentation contract; FER-04 owns integration
closure. Implementation progress is recorded below; the planning baseline is retained.

## Motivation and current behavior

An ABCLS user encountered this response after returning from Keycloak:

```json
{ "code": "OIDC_VAULT_INVALID_STATE", "message": "OIDC state is invalid or expired." }
```

The Keycloak return to `GET <basePath>/callback` is a full-page browser navigation,
not AJAX. When callback processing throws, the library currently returns a
4xx/5xx JSON document directly. The browser displays that document at the backend
callback URL; the frontend application and its retry button never load.

There are two normal incoming provider callback shapes:

- `?code=<provider-authorization-code>&state=<state>`: the backend must still
  validate the transaction, cookie, provider response, and session creation.
- `?error=<provider-error>&state=<state>`: the backend validates the transaction
  and cookie before handling the provider rejection.

Either callback can fail backend validation. Wrong-password/MFA errors displayed
entirely on Keycloak do not reach this endpoint and are outside this feature.

On success, the current destination is
`transaction.returnTo ?? options.frontendRedirectUri`; the library appends a
fresh local exchange `code` and redirects with HTTP 302. Failure currently uses
the same JSON error path as other lifecycle endpoints.

ABCLS has added an application adapter that redirects HTML callback failures to
its existing `/callback` screen with a fixed message. That workaround motivates
a supported library option; it does not establish that state rejection itself
is defective. The original user's precise state-failure cause is unconfirmed.

ABCLS is motivating consumer evidence. Package implementation and verification
must be reproducible from this repository without an application checkout.

## Proposed public API and behavior

Add `frontendErrorRedirectUri?: string` to `OidcVaultOptions`:

```ts
createOidcVaultMiddleware({
  // Existing provider, origin, store, and other configuration.
  frontendRedirectUri: 'https://app.example.com/callback',
  frontendErrorRedirectUri: 'https://app.example.com/callback',
});
```

Both options may point to the same frontend page, or the error option may point
to a dedicated application error page. The library must preserve the configured
error destination's pathname rather than hardcoding an application route.

- **Callback succeeds:** preserve the existing successful redirect and local exchange code.
- **Callback handler fails, HTML explicitly accepted/preferred, error URI configured:**
  HTTP 302 to the configured error URI with sanitized error parameters.
- **Callback fails, error URI omitted:** preserve the existing HTTP error status and sanitized JSON.
- **Callback fails, JSON expected, Accept missing, or wildcard-only Accept:**
  preserve the existing HTTP error status and sanitized JSON, even if the error URI is configured.
- **Another lifecycle/API endpoint fails:** preserve its existing response, irrespective of the new option.
- **Parser/router failure before the callback handler, or HEAD/non-GET request:**
  preserve existing behavior; this option does not introduce another global error handler.

There is **no implicit fallback** from an omitted `frontendErrorRedirectUri` to
`frontendRedirectUri`, the login endpoint, or a transaction's `returnTo`.
The error option also cannot satisfy the successful destination prerequisite:
`transaction.returnTo ?? options.frontendRedirectUri` remains authoritative for
success, including its existing missing-destination failure before provider work.

### Redirect parameters

Use the URL API to set/replace these parameters on the configured error URI:

- `error`: the stable public library error code, e.g. `OIDC_VAULT_INVALID_STATE`.
- `error_description`: the sanitized, public client-facing message, subject to
  the URL payload policy finalized in FER-01.

Illustrative destination, with URL encoding applied by the implementation:

```text
https://app.example.com/callback?error=OIDC_VAULT_INVALID_STATE&error_description=OIDC+state+is+invalid+or+expired.
```

Use the existing sanitized response projection, captured before mutable error
observers run. Unknown failures retain the generic internal-error code/message.
Never build these values directly from the original exception's `message`,
private provider diagnostics, or incoming `error_description`. Reserve `code`
for successful exchange credentials. Do not forward the request's authorization
code, state, session identifiers, tokens, or other callback query parameters.
URL-query transport additionally needs explicit size limits: existing public
messages can be application-defined and are not inherently bounded for a Location
header. FER-01 must settle byte bounds and oversized-payload handling; JSON safety
alone does not define a valid redirect payload.

The destination is deployment configuration, not request authority: it must work
when state is absent, expired, unknown, or already consumed. Never derive it from
the request's `returnTo`, Host/forwarded headers, or an untrusted transaction.

### Compatibility and lifecycle requirements

- Validate and snapshot a supplied absolute HTTP(S) error URI during middleware
  construction, following the package's existing URL-option conventions. Test
  malformed/non-HTTP(S) values and post-construction caller mutation. Define
  handling of conflicting configured credential parameters and callback-loop
  destinations before implementation is finalized.
- Apply the policy to terminal errors from the registered GET callback handler,
  using its route identity and normalized configured base path. Body-parser and
  router failures have separate handlers; leave their responses unchanged. Verify
  HEAD explicitly because Express can dispatch it through a GET route.
- Honor Accept quality/preference: JSON preference or `text/html;q=0` retains
  JSON; `*/*` alone must not implicitly opt into navigation recovery. FER-01 must
  settle equal-quality preferences, media wildcards, and HTML/XHTML recognition.
  Accept is a presentation signal, not evidence of authentication or browser identity.
- Capture redirect eligibility, fixed destination, and sanitized response data
  before awaiting mutable error observers. Changing request method/headers/query
  or error fields inside `onError` must not change that captured response plan.
- Preserve error observation through `hooks.onError`, including observer-error
  containment, and preserve `Cache-Control: no-store`. Redirect responses also
  carry `Referrer-Policy: no-referrer`. Reapply owned headers after observers;
  remove `WWW-Authenticate` and `DPoP-Nonce` on the 302 while preserving applicable
  `Set-Cookie` cleanup. JSON fallback retains its original protocol headers.
- Prepare the Location before committing redirect headers. If the presentation
  cannot be constructed within the selected URI/payload contract, return the
  original sanitized error response without another callback attempt, extra store
  work, or recursive `onError` notification. Once headers are sent, preserve the
  existing `next(error)` behavior rather than attempting a fallback response.
- Preserve existing transaction consumption, session/code rollback, and cookie
  cleanup rules. An invalid/mismatched callback must not gain permission to
  consume another attempt, clear its cookie, or revoke an existing session.
- A redirect is presentation only: it never authenticates the user, bypasses a
  validation failure, retries the callback, or starts another login automatically.
- Nonfatal post-commit notification errors must still leave a successful callback
  successful. Do not implement redirect navigation inside `hooks.onError`, which
  also observes such notifications.
- Preserve the existing headers-already-sent behavior; do not attempt a second
  response. Successful callback redirects and non-callback protocol/challenge
  responses retain their existing contracts.
- Support body and cookie session transports and existing device-binding modes
  without adding proof requirements to the headerless callback navigation.

## Analysis coverage, triage, and baseline

Task creation and planning-update baseline: revision `09bc03e`, root version
`0.65.0`. The worktree was clean before creation; at this revision of the plan,
only this untracked task file was present. Source inspection confirmed neither
`frontendErrorRedirectUri` nor `callbackErrorRedirectUri` currently exists.

Focused inspection covered option normalization/snapshotting, callback processing,
error serialization and observers, selected callback/configuration regressions,
packed-consumer fixtures, package scripts, website scripts, and CI commands.
The follow-up planning review also inspected parser registration, HEAD dispatch
implications, application-defined public errors, and existing bounded logout URLs.

Findings and classification:

- **F1 — Navigation recovery gap; improvement.** `handleRouteError` routes callback
  failures to `sendVaultRoutePolicyResponse`, whose response is always JSON.
  This is documented current behavior, not evidence of incorrect state rejection.
  Impact: browser navigation is stranded outside the application recovery UI.
- **F2 — Configuration contract gap; investigation then improvement.** Options
  expose `frontendRedirectUri` but no failure target. Existing URL validation and
  snapshotting are reusable, but conflicting parameters, loop destinations, and
  the error target's origin relationship need explicit decisions in FER-01.
- **F3 — Shared observer/cleanup boundary; preservation constraint.** `onError`
  also observes nonfatal post-commit hook failures. Redirecting from that hook
  would conflate notification failure with failed authentication. Terminal error
  presentation belongs at the route error boundary after existing cleanup. The
  existing JSON writer restores owned cache/challenge headers after observers;
  the new branch needs the equivalent ownership explicitly.
- **F4 — Redirect payload policy; investigation.** `toErrorPayload` preserves
  controlled public `code`/`clientMessage` fields without URL-size bounds, and
  `OidcVaultAuthDeniedError` permits an application-supplied public message.
  `resolveLogoutNavigationOptions` already has byte-bounded URL validation, but
  its policy is specific to logout. FER-01 must define the callback policy and
  fallback; this is not a claim of a demonstrated upstream vulnerability.
- **F5 — Error-entry scope; preservation constraint.** `createBodyParserErrorHandler`
  is registered before callback routes, while Express may route HEAD through GET.
  Implementing only in `handleRouteError` does not cover all failures at the same
  URL. The contract must name that boundary and test excluded entry paths.

No runtime test, package build, packed install, live Keycloak experiment, or
comprehensive package review has run for this plan. Existing source/tests establish
where to work; they are not a passing baseline for the proposed option.

Paths are relative to this repository. Function names are authoritative if line
numbers change:

- `packages/express-oidc-vault/src/types.ts`: `OidcVaultOptions`.
- `packages/express-oidc-vault/src/origins.ts`: frontend URL validation helpers.
- `packages/express-oidc-vault/src/index.ts`: `validateOidcVaultOptions`,
  `createCallbackHandler`, `resolveFrontendRedirectUri`, `handleRouteError`,
  `callPostCommitHook`.
- `packages/express-oidc-vault/src/authorization-transaction.ts`:
  `invalidAuthorizationState` and transaction validation.
- `packages/express-oidc-vault/src/vault-route-proof.ts`:
  `toVaultRouteErrorResponse`, `sendVaultRoutePolicyResponse`.
- `packages/express-oidc-vault/src/errors.ts`: `toErrorPayload` and parser errors.
- `packages/express-oidc-vault/src/access-token-errors.ts`: public-message policy
  on `OidcVaultAuthDeniedError`.
- `packages/express-oidc-vault/src/logout-navigation.ts`: existing bounded URL
  validation and normalized loop checks in `resolveLogoutNavigationOptions`.
- `packages/express-oidc-vault/test/index.test.ts`: legacy/unbound callback and
  general middleware fixtures, complementing DPoP-specific coverage.
- `packages/express-oidc-vault/test/dpop-login-callback.test.ts`: existing callback
  authority, provider-error, cleanup, and observer regressions.
- `packages/express-oidc-vault/test/bov-10-route-prerequisites.test.ts`: existing
  destination prerequisite contracts.
- `packages/express-oidc-vault/test/bov-15-options-snapshot.test.ts`: frozen/reused
  input and post-construction mutation contracts.
- `packages/express-oidc-vault/test/packed-consumer.test.ts`: installed-consumer
  ESM/CJS runtime, strict declarations, and installed README compilation harness.
- `packages/express-oidc-vault/test-packed-consumer/consumer/`: source fixtures
  consumed by that harness, including `consumer-types.ts` and `consumer-types.cts`.

Prefer an explicit callback-only policy in `handleRouteError` after existing
cleanup/observation and before the default JSON send. Avoid requiring consumers
to replace `res.json` or changing the shared JSON writer for every endpoint.

### Existing work and deduplication

Focused searches of `docs/tasks/` found no separate error-redirect task.
[Application integration features](20261022-200950-express-oidc-vault-app-integration.md)
owns existing authentication/hooks/navigation-logout work; this callback feature
is a distinct integration outcome.
[Device-bound JWT work](20261002-125749-express-oidc-vault-device-bound-jwt.md),
DBJWT-04, documents headerless callback authority and terminal cookie cleanup.
These are preservation references, not dependencies to reopen or reimplement.

### Original decision questions owned by FER-01

Resolved in the FER-01 decision record below; retained as investigation history.

1. For a configured URI containing credential-like/reserved parameters, decide
   construction-time rejection versus deterministic removal; define handling of
   unrelated query parameters, fragments, and URL userinfo without exposing
   credentials or losing the intended error page. The agreed overwrite behavior
   for `error`/`error_description` remains part of the contract.
2. Define rejection of a configured destination that loops to this backend callback,
   accounting for normalized origin, base path, trailing slash, and case policy.
3. Decide whether a fixed error target may have an origin different from
   `frontendRedirectUri` and whether it may be configured independently when the
   successful frontend default is omitted. Compare existing frontend/logout URL
   policies; record the selected invariant and its tests rather than guessing.
4. Specify byte bounds for configured/serialized destinations, public diagnostic
   fields, and the final encoded Location. Decide oversized-message treatment
   (e.g. bounded public replacement versus original JSON fallback), preserve useful
   stable error codes, and cover Unicode/encoding expansion and boundary sizes.
   Presentation construction failure must not replace or re-observe the original
   authentication failure. Reuse logout's approach only where its policy fits.
5. Define deterministic Accept negotiation: explicit `text/html` versus XHTML,
   `text/*`/`*/*`, equal quality with JSON in either header order, exclusions such as
   `text/html;q=0, */*;q=1`, and malformed/unsupported input. Ineligible requests
   keep JSON; do not introduce User-Agent-dependent behavior or an auth decision.

These questions block FER-02, not the FER-01 investigation. The package owner can
resolve them from existing contracts and focused experiments; record any genuine
external decision blocker with its owner if one is found.

## Execution and maintenance

P2 denotes an additive integration/maintainability improvement; no new P1
authentication defect has been established. Execute **FER-01 -> FER-02 -> FER-03
-> FER-04** with one active task. `index.ts`, public types, generated outputs,
packed consumers, and docs are shared hotspots, so implementation/checks are
sequenced. The user authorized sequential sub-agent execution on 2026-11-04.
The coordinator owns this document and verifies each handoff before starting the
next task. Separate task-local agents own FER-01 investigation, FER-02 production
implementation/regressions, FER-03 consumers/docs, and FER-04 independent review.
Only one sub-agent is active at a time; no concurrent builds/tests are permitted.

Before starting a task, confirm dependencies and set it `in_progress`. Append
changed paths, exact commands/results, decisions, and remaining criteria as work
progresses. Mark `completed` only after its acceptance criteria and required checks
pass; use `blocked` for missing prerequisites/decisions and name the blocker.
Reopen the owning task if later integration invalidates its evidence. Keep task
IDs stable, preserve unrelated work, and record independent follow-ups separately.

## Implementation tasks

### Task FER-01: Finalize the configuration and redirect contract

Status: completed
Kind: investigation
Priority: P2 — settle materially different URL policies before implementing a public option.
Dependencies: none
Assigned agent: FER-01 contract investigator (separate sub-agent).

Primary ownership: this document's decision record; focused inspection of
`src/types.ts`, `src/origins.ts`, `src/logout-navigation.ts`, option normalization,
public error projection, Express Accept negotiation, and configuration/callback
tests within `packages/express-oidc-vault/`.

Finding: F2/F4. The option name, opt-in default, callback-handler scope, and public
error parameter names are agreed. The five policy questions above remain unresolved.

References: `OidcVaultOptions`, `resolveFrontendRedirectUri`,
`validateOidcVaultOptions`, `resolveLogoutNavigationOptions`, `toErrorPayload`,
`OidcVaultAuthDeniedError`, and
`test/bov-15-options-snapshot.test.ts` in the package.

Requirements:

1. Answer all five unresolved decisions using the existing URL and callback
   contracts; use a small focused experiment only if source evidence is insufficient.
2. Record validation, parameter projection/bounds, loop checks, origin relationship,
   failure fallback, and negotiation as a compact decision table with concrete
   valid/invalid URLs, Accept headers, and expected responses.
3. Confirm the implementation boundary and test cases for FER-02/FER-03. If evidence
   recommends deferral or a changed contract, explicitly revise downstream tasks.

Acceptance criteria:

- Every unresolved decision has an evidence-backed disposition and observable
  positive/negative cases; no implementation task silently chooses these policies.
- The selected API retains the agreed omission/JSON behavior and success-path
  precedence. Dependencies are actionable, or an exact blocker/owner is recorded.

Verification: V1 decision/evidence review. Runtime probes, if needed, are recorded
with exact commands and outcomes; an investigation can complete without code changes.

### Task FER-02: Implement the option and callback recovery with regressions

Status: completed
Kind: improvement
Priority: P2 — deliver usable browser recovery at the existing terminal error boundary.
Dependencies: FER-01
Assigned agent: FER-02 implementation/regressions (separate sub-agent).
Reopened for FER-04 R1 and remediated with new red/green regressions; see the R1
completion record below. Final installed/integration revalidation passed FER-03/04.

Primary ownership: `packages/express-oidc-vault/src/types.ts`, `src/origins.ts`,
`src/index.ts`, a narrowly scoped helper if needed, and their configuration/callback
tests. Generated declarations are build outputs, not hand-edited source.

Finding: F1/F2/F3/F4/F5. Terminal callback failures currently emit JSON, and no public
option selects a frontend error destination. The route error handler already
owns sanitized response authority and runs after applicable callback cleanup.

References: `handleRouteError`, `createCallbackHandler`, `callPostCommitHook`,
`toVaultRouteErrorResponse`, `sendVaultRoutePolicyResponse`,
`test/dpop-login-callback.test.ts`, and `test/bov-15-options-snapshot.test.ts`.

Requirements:

1. Add the optional public field/JSDoc, validate it using FER-01's decisions, and
   retain a construction-time snapshot without mutating the caller's options.
2. Implement explicit HTML preference and HTTP 302 recovery only for terminal
   `GET <basePath>/callback` errors, preserving the agreed response/payload contract.
3. Add meaningful regression tests with the implementation: invalid/expired/consumed
   state, missing inputs, cookie mismatch, authenticated provider rejection,
   provider validation failure, and unexpected hook/store failure. Verify original
   errors are observed once and that redirect fallback preserves the same failure.
4. Cover FER-01's Accept matrix, HEAD/non-GET and pre-route parser exclusions,
   custom base paths/route aliases, and unset-option JSON behavior. Verify unrelated
   routes, success/returnTo, missing successful destination, post-commit notifications,
   transaction/cookie cleanup, and caller-mutation behavior stay correct.
5. Exercise applicable body/cookie and device-binding variants using the existing
   fixtures, including the legacy unbound callback fixture rather than only DPoP
   initiation. Error URL authority is independent of callback queries/host headers.
6. Test mutation/throws in `onError` against the captured method/Accept/error/target
   plan and final owned headers. Add encoding/size boundary and safe fallback cases
   without real oversized network headers. Verify no extra store/provider calls,
   rollback, cookie clearing, or second response comes from presentation recovery.

Acceptance criteria:

- Opted-in HTML failures produce the configured frontend Location and safe error
  parameters; omission and non-HTML clients retain the existing error response.
- Regression evidence demonstrates corrected navigation behavior and preserved
  authority/cleanup across the listed boundaries, including no redirect on a
  nonfatal post-commit notification error. Unknown errors retain generic public
  diagnostics, and JSON fallback retains its original status/challenge policy.
- Headers-sent errors follow the existing forwarding path; an otherwise eligible
  failure whose redirect cannot be prepared safely falls back to the original
  sanitized response. Established sessions survive stale callback rejection.
- Focused tests fail on the old implementation where applicable and pass with
  the option; existing selected callback/configuration regressions also pass.

Verification: V2 focused build/tests. Record added test paths and update the focused
command if the implementation introduces a dedicated callback-recovery test file.

### Task FER-03: Ship the consumer contract and application guidance

Status: completed
Kind: improvement
Priority: P2 — ensure the additive API works from published artifacts and is documented accurately.
Dependencies: FER-02
Assigned agent: FER-03 installed consumers/documentation (separate sub-agent).
Revalidation: FER-02/R1's loop contract passed expanded installed ESM/CJS checks;
the revalidation record below restores the earlier completion evidence.

Primary ownership: `packages/express-oidc-vault/test-packed-consumer/consumer/`,
`test/packed-consumer.test.ts`, `README.md`, relevant documentation assertions,
and `website/docs/packages/express-oidc-vault.md`.

Finding: consumers use generated ESM/CJS declarations and release-style tarballs.
Source tests alone do not establish that the new option is usable through those
entry points or that examples describe the actual HTML/JSON policy.

References: `packed-consumer.test.ts` test "installs the staged tarball and runs
CJS, ESM, NodeNext, NodeNext-CJS, and Bundler consumers"; its
`compileInstalledReadme` helper; `test-packed-consumer/consumer/consumer-types.ts`
and `consumer-types.cts`; the README's public-options and error/hook contracts.

Requirements:

1. Extend existing installed-consumer fixtures to exercise the option through
   ESM/CJS runtime entry points and strict NodeNext/NodeNext-CJS/Bundler types.
   Preserve existing consumer assignments and the `/wire` entry's isolation.
2. Update public options/JSDoc examples, shipped README, and website docs together.
   Explain callback inputs, sanitized error parameters, explicit frontend retry,
   error-URI validation, payload limits/fallback, HTML negotiation, excluded error
   entry paths, and unchanged behavior when omitted.
3. Include same-page and dedicated-page examples; distinguish the provider
   callback URL from successful and failed frontend destinations. Document the
   additive contract in package migration/release guidance; root `CHANGELOG.md`
   remains release-workflow-owned.
4. Explain that query diagnostics are display-only, not proof of authentication
   or a reason for the library to revoke a session. URL parameters can appear in
   history/access logs; examples use public diagnostics, escaped display, and no
   automatic callback replay. Enabling recovery is presentation, not successful login.

Acceptance criteria:

- Installed consumers compile/run with the new option and old configurations;
  generated declarations expose it on the existing options interface.
- README examples compile in the installed-consumer harness; package/website
  guidance agrees with actual redirects and default JSON behavior.
- Required packed-consumer and website checks pass, with exact evidence recorded.

Verification: V3 installed-consumer/declaration/docs checks. Tests belong with
their new fixtures/examples; FER-02 already owns production behavior regressions.

### Task FER-04: Verify integration and close the package outcome

Status: completed
Kind: improvement
Priority: P2 — verify the shipped integration and preserve evidence before marking the objective complete.
Dependencies: FER-01, FER-02, FER-03
Assigned agent: FER-04 independent integration reviewer (separate sub-agent, not an implementer).
Independent review accepted FER-01/02/03, closed R1 after remediation/revalidation,
and obtained passing final-source integration gates. Intermediate root-test
failures and bounded diagnostic limitations are retained below, not claimed fixed.

Primary ownership: this document's acceptance/evidence record and final review of
the changed package/consumer/docs paths. Failures reopen their owning task rather
than authorizing unrelated cleanup.

Finding: an additive callback branch touches shared option/observer/error code;
focused success does not by itself establish that package, artifact, and workspace
contracts still agree. No implementation verification has run at planning time.

References: FER-01 decision record; FER-02/FER-03 completion evidence;
`packages/express-oidc-vault/package.json`; root scripts; `.github/workflows/test.yml`.

Requirements:

1. Reconcile each acceptance criterion with delivered changes and test results,
   including the unset-option path, redirect payloads, and preserved callback lifecycle.
2. Satisfy V4 integration gates with passing evidence for the delivered revision,
   running local commands serially where needed. Retain failures/skips and distinguish
   setup blockers from regressions; do not mark required unverified behavior completed.
3. Record final changed paths, exact commands/results, limitations, and any
   separately owned follow-ups. Treat this as package-owner integration review;
   claim independent review only if a separate reviewer actually performs it.

Acceptance criteria:

- FER-01 decisions and FER-02/FER-03 acceptance evidence match the implementation,
  published declarations, and documentation.
- Required package/artifact/workspace checks pass. Missing prerequisites leave
  this task blocked with an explicit owner and next action.
- The final worktree/diff is reviewed, unrelated work is preserved, and the
  definition of done below is satisfied with recorded evidence.

Verification: V4 integration commands and criterion-by-criterion diff/evidence review.

## Shared verification

All commands run from `<repo-root>`, the repository checkout. Replace placeholders
with actual paths before execution. Use the supported toolchain, installed workspace
dependencies, and package scripts. Packed installs need package-manager/network or
cache access. Workspace gates can additionally require MongoDB/Docker/browser
prerequisites used by unrelated packages; record missing prerequisites as blockers.

Build/test/pack processes share outputs: run them serially per `AGENTS.md`, including
focused Vitest commands that execute `packed-consumer.test.ts`. That harness builds
its documentation dependencies and installs tarballs; it is not a pure unit test.
Prepare a fresh ignored repo-local `_tmp-fer-<run>` directory, verify it with `git check-ignore`,
and point `TMPDIR` there for checks creating temporary installations.
For full workspace tests, use a short **real** repository-root `_tmp4-<suffix>`
directory instead: nested paths exceeded Unix-socket limits, while a symlink
caused installed-consumer dependency checks to fail. Confirm this directory is
ignored too; final execution used `_tmp4-EjbYj5`.

### V1 — Contract investigation

Review FER-01's decisions against the cited source/tests and concrete URL examples.
No production code or full test run is required to close an evidence-backed
investigation. Record any focused probe rather than assuming its outcome.

### V2 — Implementation-focused checks

```sh
pnpm --filter '@web-ts-toolkit/express-oidc-vault...' build
pnpm --dir packages/express-oidc-vault exec vitest run --config ../../vitest.config.ts test/index.test.ts test/dpop-login-callback.test.ts test/bov-15-options-snapshot.test.ts test/bov-10-route-prerequisites.test.ts test/frontend-error-redirect.test.ts test/callback-error-redirect-policy.test.ts
```

Include actual added/changed configuration and recovery test files in the focused
command when implementing; record that exact command in FER-02 evidence.

### V3 — Installed consumers and documentation

Run the affected build first if its outputs changed since V2, then:

```sh
TMPDIR='<repo-root>/_tmp-fer' pnpm --dir packages/express-oidc-vault exec vitest run --config ../../vitest.config.ts test/packed-consumer.test.ts
pnpm --dir website run build
```

The existing packed test performs strict consumer/declaration and installed README
checks. Extend that harness rather than inventing a separate unchecked export lane.

### V4 — Package and final workspace integration

Run the package test script after a coherent implementation. Once package and
consumer gates pass, satisfy the repository gates used by `.github/workflows/test.yml`.
Passing CI evidence for the same delivered source/docs revision can satisfy the
workspace gates; record its revision and results. Otherwise run the commands locally:

```sh
TMPDIR='<repo-root>/_tmp4-<suffix>' pnpm --filter @web-ts-toolkit/express-oidc-vault test
pnpm build
TMPDIR='<repo-root>/_tmp4-<suffix>' pnpm test
pnpm lint
git diff --check
```

Reuse V3 evidence when no later change invalidates it. Do not repeat package/packed
checks just for bookkeeping: package/workspace suites already include packed
consumers, so use an applicable passing broader run to satisfy narrower gates.
Changed source, fixtures, declarations, or examples invalidate affected earlier
evidence. Never hand-edit generated `dist/` declarations.

## Definition of done

Applications can configure `frontendErrorRedirectUri` and receive a usable
frontend error navigation for failed HTML callbacks with stable, safe diagnostics.
Omitting the option preserves current behavior. Existing protocol validation,
authority, rollback, observer, cookie, and successful-login contracts remain
covered by passing relevant checks; public documentation matches the implementation.

The objective is complete only when FER-01 through FER-04 are completed with their
required evidence. Pending, blocked, or deferred criteria keep the objective open;
record the remaining work and owner. Saving this plan does not complete any
implementation task.

## Execution record

- **Creation:** initial behavior brief and four pending tasks saved at revision
  `09bc03e`; formatting checked successfully. No feature build/runtime evidence.
- **Planning update:** inspected the task-as-you-go workflow, relevant package
  source/tests, task overlap, public-consumer fixtures, scripts, and CI. Converted
  the same file to a package-owned plan with complete per-task fields and a
  bounded contract investigation. Implementation checks V1-V4 remain not run:
  the current deliverable is the planning document.
- **Planning-document verification** (working directory: `<repo-root>`, revision
  `09bc03e`, this task file untracked):
  `pnpm exec prettier --check docs/tasks/20261101-222701-express-oidc-vault-frontend-error-redirect.md`
  passed. `git status --short` confirmed only this task file; `git diff --check`
  reported no tracked whitespace errors. Task fields, dependency order, existing
  source/test/doc references, and relative links were reviewed from file contents.
- **Follow-up plan review:** inspected the route/parsing boundary, public error
  projection, bounded logout URL policy, mutable observer regression, and unbound
  callback prerequisites. Added F4/F5 and FER-01 decisions for redirect size/fallback
  and negotiation; expanded the existing implementation/consumer tasks rather than
  creating a separate testing task. Clarified same-revision CI evidence reuse.
  This review is source/test inspection, not implementation or independent runtime
  review. The recorded Prettier command was rerun successfully; task fields,
  dependencies, source references, and the untracked document's whitespace were
  checked. FER-01 through FER-04 remain pending.

- **Execution start (2026-11-04):** user authorized sequential sub-agents. Checkout
  baseline `64a30af`, root version `0.66.0`; `git status --short` was clean.
  Read repository/task/artifact conventions and the current package/CI scripts.
  FER-01 starts first; implementation and runtime checks remain not run at this point.

Append future decision records and task completion evidence here.

### FER-01 decision record (2026-11-04)

The contract investigator inspected the referenced source/tests, installed Express
router/Accept implementations, and packed-consumer harness. The coordinator reviewed
the recommendations against `origins.ts`, `logout-navigation.ts`, `errors.ts`,
`vault-route-proof.ts`, and option/route handling in `index.ts`. No external decision
blocker remains. These policies change only the new option.

| Area                 | Selected policy                                                                                                                                                                                                                                                                                                                                                                         | Concrete cases                                                                                                                                                                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| URL syntax           | Absolute HTTP(S); reject raw whitespace, backslashes, controls, userinfo (including empty `@`), and fragments (including bare `#`). Preserve pathname and unrelated query entries, including duplicates, semantically.                                                                                                                                                                  | Accept `https://app.example/sign-in-error?locale=en&view=compact`. Reject `/error`, `//app.example/error`, non-HTTP(S), `https://user:pass@app.example/error`, `https://@app.example/error`, and `https://app.example/error#`. Encoded `%23` is not a fragment. |
| Reserved query       | Reject decoded, case-insensitive names `code`, `state`, `sessionId`, `session_id`, `access_token`, `accessToken`, `refresh_token`, `refreshToken`, `id_token`, `idToken`, `id_token_hint`, even with empty values. Allow configured diagnostic placeholders; remove all decoded case-insensitive `error`/`error_description` variants, then set exactly one lowercase instance of each. | `?%63ode=old` is invalid. `?locale=en&ERROR=old&error_description=old` preserves `locale` and replaces both diagnostics. This finite set is not a general secret detector: unrelated configuration must not contain secrets.                                    |
| Callback loop        | Compare canonical target origin with resolved backend origin and target pathname (one trailing slash removed, case-insensitive) with normalized base path plus registered `/callback`. Ignore query. WHATWG normalization covers host/default port/dot segments; do not infer proxy aliases or recursively decode paths. Accepted target casing is preserved.                           | Backend `https://api.example.com`, base `///Vault/Auth///`: reject `https://API.EXAMPLE.COM:443/Vault/Auth/x/../CALLBACK/?view=error`; accept a different origin or `/Vault/Auth/callback-help`.                                                                |
| Origin/independence  | Permit a separately configured HTTP(S) origin, independently of `frontendRedirectUri` and `trustedOrigins`; do not add trust. Allow error-only configuration. Existing success prerequisite and `returnTo` precedence remain authoritative.                                                                                                                                             | Success at `https://app.example/callback`, error at `https://help.example.net/sign-in-error` is valid. Missing success destination still fails before provider/session/code work; eligible HTML may present that failure at the error target.                   |
| Byte bounds          | Inclusive UTF-8 limits: raw and canonical configured URI each 2,048 bytes; public code 128 bytes (nonempty string); public message 512 bytes (string); final serialized Location 4,096 bytes. Configuration over either URI limit throws at construction.                                                                                                                               | A 512-byte message qualifies; 513 bytes falls back. `😀` repeated 128 times is 512 bytes. Measure encoding expansion after replacing query parameters.                                                                                                          |
| Preparation fallback | No truncation, public-message substitution, or code replacement. Invalid/oversized public fields, URL-preparation exceptions, or oversized final Location select the original captured sanitized JSON/status/protocol headers. No recursive observation, callback replay, or additional provider/store work.                                                                            | Prepare the complete Location before observers and before committing headers. Once headers are sent, preserve `next(error)`.                                                                                                                                    |
| Negotiation          | Only explicit `text/html` or `application/xhtml+xml` can opt in. Their positive quality must strictly exceed effective `application/json` quality. JSON wins ties independent of order. Missing, empty, wildcard-only, malformed, or unsupported-only input stays JSON.                                                                                                                 | See matrix below. Accept is presentation, not authentication.                                                                                                                                                                                                   |

**Root-mount clarification (FER-04 R1):** "base path plus callback" means the
actual Express mount: omit the base prefix when normalization yields root `/`.
For configured base `///`, reject same-backend `/callback` and its case/trailing-
slash aliases, not merely `//callback`. This refines loop comparison only; existing
successful-callback/base-path behavior is outside the remediation scope.

Accept algorithm: parse captured input case-insensitively with quote-aware list and
parameter splitting; ignore empty list members. Any malformed nonempty member,
duplicate `q`, unmatched quote, or invalid quality makes the signal ineligible.
Unquoted qvalues must match `^(?:0(?:\.[0-9]{0,3})?|1(?:\.0{0,3})?)$`;
default quality is 1. Valid media parameters do not match bare supported candidates;
valid accept extensions after `q` do not affect matching. For each bare candidate,
select exact > type wildcard > `*/*`, preserving zero exclusions; equally specific
duplicates use the highest quality. HTML quality comes only from exact supported
ranges; JSON quality includes wildcards. Redirect only when HTML quality > 0 and
strictly greater than JSON quality. JSON fallback does not introduce a 406.

| Accept                                                        | Failed GET callback presentation with option configured |
| ------------------------------------------------------------- | ------------------------------------------------------- |
| Missing, empty, `*/*`, `text/*`, `application/*`, `image/png` | Original JSON                                           |
| `text/html` or `application/xhtml+xml`                        | 302                                                     |
| `TEXT/HTML;Q=0.8, application/json;q=0.2`                     | 302                                                     |
| `text/html, application/json` or reverse order                | JSON                                                    |
| `application/xhtml+xml, application/json` or reverse order    | JSON                                                    |
| `text/html;q=0.8, application/json;q=0.9`                     | JSON                                                    |
| `text/html;q=0, */*;q=1`                                      | JSON                                                    |
| `text/html;q=0.5, */*;q=1`                                    | JSON                                                    |
| `text/html, */*;q=0.8`                                        | 302                                                     |
| `text/html, application/*`                                    | JSON                                                    |
| `text/html, application/json;q=0, */*;q=1`                    | 302                                                     |
| `text/html;q=0, application/xhtml+xml, */*;q=0.8`             | 302 via XHTML                                           |
| `text/html;q=bogus`, `text/html;q=1.1`, `text/html, garbage`  | JSON                                                    |

Evidence/rationale: syntax/bounds/loop comparison follow the opt-in pattern in
`resolveLogoutNavigationOptions`/`destination`, without importing logout-specific
origin/HTTPS restrictions. Independent origins follow the existing fixed frontend
URL convention in `origins.ts`; error configuration cannot satisfy
`resolveFrontendRedirectUri`'s success prerequisite. `toErrorPayload` and
`toVaultRouteErrorResponse` own public diagnostics. Express/negotiator use header
order for ties and permissive quality parsing, so a small feature-local negotiation
helper is needed rather than using `req.accepts` as the complete policy.

Implementation boundary: validate/snapshot at `validateOidcVaultOptions`; capture
route identity, GET method, Accept, sanitized response and fully prepared Location
in `handleRouteError` before awaiting `onError`. Leave callback cleanup and
`callPostCommitHook` unchanged. Send an empty 302 using `status`/`setHeader`/`end`
rather than `res.redirect` (which rereads mutable request state). Restore no-store
and no-referrer and remove challenges after observers; preserve Set-Cookie. Other
paths use the existing JSON writer. Add helper-level boundary tests to avoid real
oversized network headers. FER-03 extends existing installed ESM/CJS/type/README
lanes without changing `/wire` or adding exports.

Completion evidence:

- FER-01 ran as a separate investigation sub-agent; the coordinator reviewed its
  handoff before starting FER-02. No production/test/doc implementation was made.
- V1: evidence/decision review completed; all five questions have concrete outcomes
  above. `git diff --check` passed; checkout `64a30af` plus coordinator task edits.
- No runtime probe, build, or test was needed/run for this investigation. V2-V4
  remain required. No scratch evidence was created or needs preservation.

### FER-02 completion evidence (2026-11-04)

The implementation sub-agent ran after the FER-01 handoff, without concurrent
agents/builds. The coordinator reviewed all production changes, both new test
files, lifecycle test additions and the final machine-readable focused result
before starting FER-03. Checkout remains `64a30af` plus task/feature edits.

- Changed `packages/express-oidc-vault/src/types.ts`, `src/index.ts`, and new private
  `src/callback-error-redirect.ts`. Added the optional public field/JSDoc,
  single-read construction snapshot, FER-01 validation/negotiation/bounds and
  pre-observer error presentation. Empty 302 restores owned headers, preserves
  cookies and drops challenges; fallback and headers-sent forwarding stay intact.
  No callback/store/provider/cleanup/success logic changed; no public helper exports.
- Added `test/frontend-error-redirect.test.ts` (98 cases) and
  `test/callback-error-redirect-policy.test.ts` (92); extended `test/index.test.ts`
  with 10 legacy unbound body/cookie cases and `test/dpop-login-callback.test.ts`
  with 32 guarded cases. Coverage includes the decision matrices, exact byte
  boundaries, query/host independence, mutation/throwing observers, parser/HEAD/
  route exclusions, cleanup/rollback, missing successful destination, nonfatal
  post-commit notification, and established-session survival on stale callbacks.
- Red evidence: before production edits, running the new
  `test/frontend-error-redirect.test.ts` with the V2 Vitest invocation failed all
  three initial cases: relative URL accepted, normalized loop accepted, and HTML
  failure returned 400 rather than 302. The final implementation passes all three.
- V2 commands, working directory `<repo-root>`, run serially:

  ```sh
  TMPDIR='<repo-root>/_tmp-fer-20261104-112824' pnpm --filter '@web-ts-toolkit/express-oidc-vault...' build
  TMPDIR='<repo-root>/_tmp-fer-20261104-112824' pnpm --dir packages/express-oidc-vault exec vitest run --config ../../vitest.config.ts test/index.test.ts test/dpop-login-callback.test.ts test/bov-15-options-snapshot.test.ts test/bov-10-route-prerequisites.test.ts test/frontend-error-redirect.test.ts test/callback-error-redirect-policy.test.ts --reporter=default --reporter=json --outputFile=../../_tmp-fer-20261104-112824/fer02-v2-final-494-results.json
  ```

  Build passed; **494/494 tests passed in six files** (54 legacy/general, 237
  guarded callback, 8 snapshot, 5 prerequisite, 98 navigation, 92 policy). Scoped
  ESLint/Prettier checks for the seven changed package files and `git diff --check`
  also passed. Generated `.d.ts`/`.d.mts` contain the field/JSDoc, not helper exports.

- Intermediate verification: an expanded run had 491 pass/1 fail because a new
  established-session fixture omitted required `idToken`; the fixture was corrected
  and given a validity assertion before the final passing run. Initial scoped lint
  findings were corrected. No unresolved V2 failure or external blocker remains.
- Scratch directory was created fresh and confirmed ignored with
  `git check-ignore _tmp-fer-20261104-112824`. Its machine-local JSON reports/cache
  are disposable, not durable dependencies; the reviewed evidence is summarized
  here. No scratch design/handoff needs preservation. V3/V4 remain not run.

### FER-03 completion evidence (2026-11-04)

The separate consumer/documentation sub-agent started only after FER-02 completion
and coordinator review. The coordinator inspected the docs, new installed runtime
helper, consumer/declaration/README harness changes and documentation assertions
before assigning FER-04 to an independent reviewer. Production sources and earlier
implementation/tests remained unchanged.

- Updated `packages/express-oidc-vault/README.md` and
  `website/docs/packages/express-oidc-vault.md` together: public option, same-page
  and dedicated-page examples, precise negotiation/configuration/payload limits,
  exclusions/fallback, sanitized display-only diagnostics, URL history/log caveats,
  text-only display and explicit fresh-login retry, and additive migration guidance.
  Root `CHANGELOG.md` remains untouched.
- Extended `test-packed-consumer/consumer/consumer.mjs`, `consumer.cjs`,
  `consumer-types.ts`, `consumer-types.cts`, `docs-runtime.mjs`; added
  `frontend-error-redirect-runtime.mjs`. Actual installed ESM/CJS entrypoints run
  60 failed HTTP callbacks across body/cookie transports: HTML/XHTML recovery,
  JSON/ties/wildcards/defaults, authenticated provider rejection/cleanup and replay.
  Existing strict type assignments and `/wire` isolation remain covered.
- Updated `test/packed-consumer.test.ts` and `test/bov-11-doc-examples.test.ts`.
  Packed `.d.ts`/`.d.mts` expose the field/JSDoc without internal helper exports;
  the exact 11-file publish surface and `npm pack --dry-run` pass. Both new backend
  examples compile from the installed README through ESM/CJS declarations. The
  frontend snippet compiles DOM-only and executes with minimal DOM doubles to
  verify text-only display, URL cleanup, click-only retry and failed retry handling.
- V3 commands, working directory `<repo-root>`, run serially:

  ```sh
  TMPDIR='<repo-root>/_tmp-fer-20261104-112824/fer03-Z4o5BT' pnpm --dir packages/express-oidc-vault exec vitest run --config ../../vitest.config.ts test/bov-11-doc-examples.test.ts
  TMPDIR='<repo-root>/_tmp-fer-20261104-112824/fer03-Z4o5BT' pnpm --dir packages/express-oidc-vault exec vitest run --config ../../vitest.config.ts test/packed-consumer.test.ts
  TMPDIR='<repo-root>/_tmp-fer-20261104-112824/fer03-Z4o5BT' pnpm --dir website run build
  ```

  **10/10 documentation tests and 3/3 packed-consumer tests passed; website build
  passed.** No affected rebuild was needed because production/type sources and V2
  outputs were unchanged. Scoped ESLint on all eight changed tests/fixtures,
  scoped Prettier on the docs/tests/new helper/type fixture and `git diff --check`
  passed. V4 package/workspace gates remain to be run.

- First packed run: 2/3 passed; a formatted URL-object negative type assignment
  had its `@ts-expect-error` on the wrong line. Moved it to the offending property;
  the final packed run passes. No remaining V3 failures or prerequisites.
- Ignored scratch was reviewed; generated installations were cleaned by the
  harness, only disposable compiler caches remain. Maintained tests and this
  record contain the useful evidence; no separate artifact bundle is needed.

### FER-04 first independent review (2026-11-04; R1 open)

A fourth, separate sub-agent (not an implementer) reviewed the actual tracked diff
and all four new files, reconciled acceptance criteria, inspected declarations/docs
and ran the integration gates serially. No feature files were changed by review.

**R1 — P2, root-mounted callback loop:** `normalizeOidcVaultBasePath('///')`
produces `/`, so Express serves the registered callback at `/callback`. The new
validator compared `${basePath}/callback` (`//callback`) and accepted a configured
same-backend `/callback`. A built-CJS HTTP probe followed three self-directed 302s
(invalid state, then repeated missing state). This contradicts FER-01's intended
loop policy and FER-03's documentation. FER-01's policy is clarified above;
FER-02 and dependent FER-03/04 evidence are reopened. Remediation must be local to
error-target comparison, with construction/runtime regressions, not an unrelated
successful callback/base-path refactor.

Other criteria reviewed positively: opt-in/default JSON, strict Accept and byte
policy, origin/query authority, sanitized response capture before observers,
header/cookie ownership, fallback/original challenges, headers-sent forwarding,
success prerequisites/returnTo, rollback/cleanup, post-commit notifications,
transport/device variants, stale-session survival, installed ESM/CJS/types/README
and `/wire` isolation. Historical red-run evidence was inspected against baseline
source, not replayed. Website evidence was reused without edits.

Commands (working directory `<repo-root>`, Node 26.12.1, pnpm 11.18.0):

```sh
TMPDIR='<repo-root>/_tmp-fer-20261104-112824/fer04-review-DQqeWC' pnpm --filter @web-ts-toolkit/express-oidc-vault test
TMPDIR='<repo-root>/_tmp-fer-20261104-112824/fer04-review-DQqeWC' pnpm build
TMPDIR='<repo-root>/_tmp-fer-20261104-112824/fer04-review-DQqeWC' pnpm test
TMPDIR='<repo-root>/_tmp-fer-20261104-112824/fer04-review-DQqeWC' pnpm lint
git diff --check
TMPDIR='<repo-root>/_tmp4-605440' pnpm test
TMPDIR='<repo-root>/_tmp4-8WYcEy' pnpm test
```

- Package: **2,684 tests/43 files passed**, including packed consumers.
- Workspace build: passed (31 top-level build scripts).
- First workspace test: failed, 6,142 passed/21 failed/one todo, 179 passing and
  9 failing files, 323 unhandled errors. `mongoose-rxdb` Unix-socket `listen EINVAL`
  failures came from measured 128-byte socket paths under the nested TMPDIR.
- Short symlink TMPDIR retry: failed `asset-inliner` installed-consumer `npm ls
--all` with an invalid file dependency; 761 passed/11 skipped/one todo before the
  early exit. No source/config changes were made for either environment issue.
- Short **real directory** TMPDIR retry: **19,778 passing test executions, 658
  passing file executions over 34 Vitest runs; one todo, zero failures/skips**.
  Counts include repeated React-version lanes. `mongoose-rxdb` passed 632/632;
  Docker/Redis, MongoDB and Chromium lanes ran successfully. Final reruns must use
  a short, real, ignored repository-local TMPDIR, not a nested path or symlink.
- Lint and diff check passed, including reruns after the successful suite.
  No baseline-checkout failure is claimed. These results precede the R1 fix and
  must be rerun where affected before closure; they do not override the finding.
- Final feature content hashes were unchanged (14 modified tracked files/four
  new files). Ignored scratch was verified; essential findings and failure/results
  are preserved here, with maintained regressions to replace the disposable probe.

### FER-02 R1 remediation evidence (2026-11-04)

The original implementation sub-agent resumed after review, with no concurrent
agent. It changed only `src/callback-error-redirect.ts` and
`test/frontend-error-redirect.test.ts` within `packages/express-oidc-vault`.
The comparison now omits root `/` before the registered callback path, matching
Express's actual mounted route without changing base-path normalization, success
URL generation or routes. The coordinator inspected this fix and the 12 new cases.

Added nine construction rejections (three repeated-slash root mounts times three
canonical/case/trailing-slash/host/default-port/dot/query target variants) and three
positive root HTTP cases. A fixed non-loop `/callback-help` destination reaches
HTTP 200; wrong/missing state and JSON 400 diagnostics stay unchanged. Tests verify
no cookie clearing, consume/provider/session/code/revocation work and preserve a
live unrelated transaction.

Commands (working directory `<repo-root>`, serial):

```sh
TMPDIR='<repo-root>/_tmp-fer-20261104-112824' pnpm --dir packages/express-oidc-vault exec vitest run --config ../../vitest.config.ts test/frontend-error-redirect.test.ts -t 'FER-02 R1' --reporter=default --reporter=json --outputFile=../../_tmp-fer-20261104-112824/fer02-r1-red-results.json
TMPDIR='<repo-root>/_tmp-fer-20261104-112824' pnpm --filter '@web-ts-toolkit/express-oidc-vault...' build
TMPDIR='<repo-root>/_tmp-fer-20261104-112824' pnpm --dir packages/express-oidc-vault exec vitest run --config ../../vitest.config.ts test/index.test.ts test/dpop-login-callback.test.ts test/bov-15-options-snapshot.test.ts test/bov-10-route-prerequisites.test.ts test/frontend-error-redirect.test.ts test/callback-error-redirect-policy.test.ts --reporter=default --reporter=json --outputFile=../../_tmp-fer-20261104-112824/fer02-r1-v2-green-results.json
pnpm exec eslint packages/express-oidc-vault/src/callback-error-redirect.ts packages/express-oidc-vault/test/frontend-error-redirect.test.ts
pnpm exec prettier --check packages/express-oidc-vault/src/callback-error-redirect.ts packages/express-oidc-vault/test/frontend-error-redirect.test.ts
git diff --check
```

Before the helper fix, the first command reported **9 failed, 3 passed, 98 filtered
out**. After the fix, the build and full V2 command passed: **506/506 tests in six
files** (54/237/8/5/110/92), zero failures/skips; all 12 R1 cases pass. Scoped lint,
format and whitespace checks passed. The coordinator checked both JSON result
summaries. Scratch reports remain disposable; maintained regressions and this
record preserve the useful evidence. FER-03/04 verification remains required.

### FER-03 R1 installed revalidation (2026-11-04)

The original consumer agent resumed only after R1 remediation. Changed solely
`packages/express-oidc-vault/test-packed-consumer/consumer/frontend-error-redirect-runtime.mjs`:
36 installed ESM/CJS root-loop construction rejections (both transports, three
repeated-slash mounts, three normalized target variants), plus 12 root HTTP checks
(eight HTML/JSON callback failures and four HTTP-200 error-page navigations).
All prior 60 callback probes remain intact. No production/docs/task files changed.

Commands (working directory `<repo-root>`, serial):

```sh
TMPDIR='<repo-root>/_tmp-fer-20261104-112824/fer03-r1-uc5CxA' pnpm --dir packages/express-oidc-vault exec vitest run --config ../../vitest.config.ts test/packed-consumer.test.ts
TMPDIR='<repo-root>/_tmp-fer-20261104-112824/fer03-r1-uc5CxA' pnpm --dir packages/express-oidc-vault exec vitest run --config ../../vitest.config.ts test/bov-11-doc-examples.test.ts
pnpm exec eslint packages/express-oidc-vault/test-packed-consumer/consumer/frontend-error-redirect-runtime.mjs
pnpm exec prettier --check packages/express-oidc-vault/test-packed-consumer/consumer/frontend-error-redirect-runtime.mjs
git diff --check
```

**3/3 packed tests and 10/10 documentation tests passed**; scoped lint/format/diff
checks passed without intermediate failures. Strict type/declaration/README and
`/wire` lanes remain intact. Both built runtime entries contain R1's fix, using
the remediation V2 build. Website docs/source are unchanged, so the prior passing
website build remains applicable. Ignored scratch was reviewed; only disposable
compiler cache remains. FER-03 criteria are restored; FER-04 remains in progress.

### FER-04 R1 acceptance and remaining root gate (continuation)

The same independent reviewer resumed after a usage-limit interruption, inspected
the actual incremental fix/consumer changes and verified R1 is closed. Its separate
built ESM/CJS probe passed 36 root-loop construction rejections, 16 controls and 72
HTTP checks across transports. The original reproducer is rejected; valid pages
reach 200. References: `src/callback-error-redirect.ts` root comparison;
`test/frontend-error-redirect.test.ts` R1 block; installed
`test-packed-consumer/consumer/frontend-error-redirect-runtime.mjs` root assertions.
Previously partial FER-01/02/03 acceptance is restored, with no new feature finding.
Success routing/base-path normalization are unchanged. All 18 task paths remained
byte-for-byte unchanged by review.

Current-source V4 commands (working directory `<repo-root>`, Node 26.12.1,
pnpm 11.18.0; serial, fresh short real ignored TMPDIR):

```sh
TMPDIR='<repo-root>/_tmp4-FJ2Gro' pnpm --filter @web-ts-toolkit/express-oidc-vault test
TMPDIR='<repo-root>/_tmp4-FJ2Gro' pnpm build
TMPDIR='<repo-root>/_tmp4-FJ2Gro' pnpm test
TMPDIR='<repo-root>/_tmp4-FJ2Gro' pnpm lint
git diff --check
```

- Package passed **2,696 tests/43 files**, including current packed consumers.
- Build passed (31 top-level scripts); lint and diff check passed.
- Root gate failed: **4,424 passed, one failed, one declared todo**, 116 passing/
  one failing file, no reported skips. In `express-request-attestation`,
  `test/fetch-ownership.cases.ts` "aborts waiting for replacement load" received
  `undefined` from its 500 ms `within()` fuse rather than the expected abort
  rejection. Its Node lane reported 617 passed/one failed; later Redis/Mongo/
  browser/workspace stages did not run in this attempt.
- An earlier post-remediation attempt used the same V4 sequence with fresh real
  `_tmp4-xNIpzi`: package/build/lint/diff passed, root stopped at the unchanged
  `test-packed-consumer/consumer/jwt-issuer-runtime.mjs` zero-lifetime
  `ERR_JWT_EXPIRED` assertion (3,806 passed/one failed/one todo, 98 passing/one
  failing file). Subsequent unchanged-source executions passed that fixture.
- Neither failure is claimed to be a baseline failure or proven regression.
  Coordinator inspection confirms the failing JWT fixture and attestation
  source/tests have no task diff. Causes are unestablished; the coordinator will
  conduct bounded serial diagnosis with the independent reviewer and retry the
  required root gate. Do not modify unrelated code or weaken assertions merely
  to close this task. FER-04/overall completion remains unverified until that gate
  passes or a concrete external blocker is recorded.
- Unchanged website evidence remains applicable. Reviewed scratch observations
  are summarized here; generated installs/caches/raw machine-local logs are
  disposable and not required durable evidence.

### FER-04 final acceptance and coordinator closure (2026-11-04)

The independent reviewer performed bounded diagnosis without editing any feature,
attestation, test, documentation or configuration files, then ran one additional
full root gate. All final checks apply to `64a30af` plus the delivered feature
diff; later coordinator edits affect only this task record.

Diagnostic commands (working directory `<repo-root>`, serial; scratch directories
were fresh, short, real and confirmed ignored):

```sh
TMPDIR='<repo-root>/_tmp4-rRru0J' pnpm --dir packages/express-request-attestation exec vitest run --config vitest.node.config.mts
TMPDIR='<repo-root>/_tmp4-rRru0J' pnpm --dir packages/express-request-attestation exec vitest run --config vitest.node.config.mts test/fetch-client.test.ts
TMPDIR='<repo-root>/_tmp4-rRru0J' node _tmp4-rRru0J/jwt-clock-diagnostic.mjs
TMPDIR='<repo-root>/_tmp4-EjbYj5' pnpm test
git diff --check
```

- Attestation full Node diagnostic: **617 passed/one failed**, 17 passing/one
  failing file. A different existing assertion in `fetch-ownership.cases.ts`
  reported forwarded signals missing the abort reason. Three subsequent serial
  executions of the exact `fetch-client.test.ts` command each passed **107/107**.
  Listener ordering and native Request signal propagation were inspected; no
  repeatable cause or feature regression was established, and no fuse/assertion
  was weakened.
- JWT scratch diagnostic: **16/16 zero-lifetime tokens rejected as expired** across
  built ESM/CJS and bound/unbound issuance; zero acceptances or sampled clock
  regressions. The existing fixture captures `Date.now()` once, while JOSE uses
  its current clock. Rollback is a hypothesis only: the failed run had no clock
  telemetry. The command is historical scratch execution, not a durable runnable
  artifact; its sample result does not prove a cause or justify runtime changes.
- Final root gate: **passed — 19,790 test executions, 658 file executions over
  34 Vitest runs, one declared todo, zero failures/skips**. Counts include repeated
  React-version lanes. Attestation passed all 618 Node, 62 Redis, 31 MongoDB,
  141 Chromium and 12 packed tests; all later workspace suites also ran.
- Current-input package **2,696 tests/43 files**, workspace **31-script build**,
  lint and packed/declaration/docs results from the preceding review remain
  applicable because no feature inputs changed. Unchanged website-build evidence
  is reused. `git diff --check` passed after the final root run.
- Coordinator reviewed the final root log/counts, JWT diagnostic source/result,
  final worktree, public source/docs/test changes and independent handoffs. The
  reviewer confirmed all 18 task paths unchanged; no unrelated tracked changes,
  commits, release-version or root changelog edits were introduced.

| Final criterion group                            | Acceptance                                                                                                     |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| FER-01 configuration/URL/Accept/bounds decisions | Complete, including root-loop clarification; no unresolved decision.                                           |
| FER-02 recovery/lifecycle/regressions            | Complete; R1 independently verified closed; omission/JSON, success, cleanup, authority and sessions preserved. |
| FER-03 installed consumer/public documentation   | Complete; ESM/CJS/type/README lanes, publish surface, website and `/wire` isolation verified.                  |
| FER-04 independent integration/preservation      | Complete; final-source package, artifact/consumer, workspace build/tests, lint and diff gates passed.          |

**Nonblocking observations, not feature fixes:** the JWT-fixture maintainer owns
any future captured/live-clock diagnosis; the attestation maintainer owns native
dependent-signal investigation if it recurs (related completed history:
[attestation health review](20261012-164617-express-request-attestation-health-review.md),
RATT-05). Causes remain unestablished; no baseline-failure claim, security finding,
or unrelated remediation is asserted. Final passing evidence closes this feature,
not those intermittent behaviors. No separate implementation task is promoted
without a bounded reproducible finding or maintainer decision.

Scratch preservation review: maintained regressions, installed fixtures and this
decision/acceptance record contain the necessary continuation evidence. Ignored
diagnostics, raw logs, caches, databases and generated consumers were reviewed but
not copied into shared artifacts; they are disposable, not prerequisites. The
scratch JWT probe is omitted, so its exact sample is not independently replayable
from this document alone. No useful design/handoff exists only in scratch.

**Coordinator sign-off:** FER-01 through FER-04 and the definition of done are
satisfied. Four separate task-local sub-agents worked sequentially; the final
reviewer was not an implementer. No outstanding feature blocker remains.

Closure-document checks (working directory `<repo-root>`): `pnpm lint`,
`pnpm exec prettier --check docs/tasks/20261101-222701-express-oidc-vault-frontend-error-redirect.md`
and `git diff --check` passed. Local-link/status/privacy review found all three
relative links resolving, all five statuses completed, and no machine-local paths
or private session identifiers. Final status contains only the 18 scoped task
paths; changes remain uncommitted.
