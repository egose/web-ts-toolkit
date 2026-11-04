# Express OIDC Vault frontend callback error recovery

Created: 2026-11-01T22:27:01-0700
Status: pending
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
closure. All implementation work remains pending.

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

### Unresolved decisions owned by FER-01

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
sequenced. This plan records package-owner-led work, not delegated execution.

Before starting a task, confirm dependencies and set it `in_progress`. Append
changed paths, exact commands/results, decisions, and remaining criteria as work
progresses. Mark `completed` only after its acceptance criteria and required checks
pass; use `blocked` for missing prerequisites/decisions and name the blocker.
Reopen the owning task if later integration invalidates its evidence. Keep task
IDs stable, preserve unrelated work, and record independent follow-ups separately.

## Implementation tasks

### Task FER-01: Finalize the configuration and redirect contract

Status: pending
Kind: investigation
Priority: P2 — settle materially different URL policies before implementing a public option.
Dependencies: none

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

Status: pending
Kind: improvement
Priority: P2 — deliver usable browser recovery at the existing terminal error boundary.
Dependencies: FER-01

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

Status: pending
Kind: improvement
Priority: P2 — ensure the additive API works from published artifacts and is documented accurately.
Dependencies: FER-02

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

Status: pending
Kind: improvement
Priority: P2 — verify the shipped integration and preserve evidence before marking the objective complete.
Dependencies: FER-01, FER-02, FER-03

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
Prepare an ignored repo-local `_tmp-fer` directory, verify it with `git check-ignore`,
and point `TMPDIR` there for checks creating temporary installations.

### V1 — Contract investigation

Review FER-01's decisions against the cited source/tests and concrete URL examples.
No production code or full test run is required to close an evidence-backed
investigation. Record any focused probe rather than assuming its outcome.

### V2 — Implementation-focused checks

```sh
pnpm --filter '@web-ts-toolkit/express-oidc-vault...' build
pnpm --dir packages/express-oidc-vault exec vitest run --config ../../vitest.config.ts test/index.test.ts test/dpop-login-callback.test.ts test/bov-15-options-snapshot.test.ts test/bov-10-route-prerequisites.test.ts
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
TMPDIR='<repo-root>/_tmp-fer' pnpm --filter @web-ts-toolkit/express-oidc-vault test
pnpm build
TMPDIR='<repo-root>/_tmp-fer' pnpm test
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

Append future decision records and task completion evidence here.
