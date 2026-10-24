# Express OIDC Vault Application Integration Features

Created: 2026-10-22 20:09:50 local (generated with `date +%Y%m%d-%H%M%S`).

## Objective and scope

Reduce the protocol-level integration code required by independent applications
using `@web-ts-toolkit/express-oidc-vault`. Deliver four feature requests:

1. Optional API authentication and composable request-authentication guards.
2. Structured DPoP diagnostics and exchange/token-issuance outcome hooks.
3. A local JWT access-token issuer helper.
4. Proof-authorized upstream logout using an opaque browser-navigation ticket.

The eight tasks below include the logout contract investigation, provider storage,
server routes, companion browser client, and final integration review. All tasks
start **pending**; saving this document does not implement the features.

The separate fifth request, MongoDB primary-read policy, is tracked in
[MongoDB primary-read policy](20261022-200950-express-oidc-vault-mongodb-primary-read-policy.md).
Its implementation is sequenced before this plan's MongoDB ticket-storage edits.

Primary scope is the core package. Logout also requires narrowly scoped changes
to the memory/MongoDB/Redis providers, `packages/oidc-vault-dpop-client`, and
`apps/oidc-vault-dpop-example`. Include public types, shipped READMEs, website
documentation, focused regressions, and installed-consumer coverage with each
behavioral change.

Application-owned behavior remains in callbacks: database-user lookup and account
linking, archived-user decisions, roles/permissions, payment provisioning, audit
persistence, IP hashing, and clock-drift retention/deduplication. The library owns
verification, protocol outcomes, credential lifecycle, and reusable integration
mechanics.

Non-goals: migrating the external application in this change, changing default
strict-authentication behavior, automatic enrollment of legacy unbound sessions,
stateless JWT revocation, upstream IdP DPoP, general-purpose signed download URLs,
or a new dependency-injection/configuration framework. Document/media navigation
grants are a separate deferred proposal: media/range requests need a different
consumption contract from one-time logout tickets.

## Analysis coverage, evidence, and existing work

Reviewed upstream revision: `33e434d`, root version `0.53.0`. The worktree was
clean before task creation. The motivating external consumer, ABCLS, uses
`0.51.0`; the feature gaps were checked against current upstream source, not
inferred only from the installed version.

Inspected core exports/types, API middleware, proof/nonce/replay code, issuance,
provider configuration, lifecycle/logout handlers, MongoDB store operations,
browser-client logout, selected regressions, package scripts, and CI conventions.
No build, runtime test, browser run, or live-provider experiment was performed for
this task-creation baseline. In particular, the MongoDB inheritance scenario is
assigned to OVMONGO-01 rather than recorded as a reproduced production failure.
Third-party IdPs, production throughput, and the whole repository were not
comprehensively reviewed.

### Consumer evidence and upstream boundaries

The following paths are relative to the **external ABCLS repository**, are
informational evidence only, and are not required implementation inputs. Recreate
the integration patterns in this repository's tests/examples.

- `api-ts/auth/oidc-vault.ts`, `runAccessMiddlewareAnonymousFallback` (600-647):
  replaces `res.status`/`res.json`, captures authentication responses, forwards
  nonce challenges, and otherwise decorates anonymously. It can also absorb
  non-401 failures. `requireBrowserDpop` (983-986) skips duplicate proof admission;
  its v2 mount is currently commented out in `api-ts/app.ts`.
- The same adapter's `parseDpopClock`, `isDpopTimeFailure`,
  `logDpopProofDiagnostics`, issuer callback, and `onError` (312-341, 398-426,
  457-483, 887-956) decode proof claims, classify message text, infer operation
  from a URL, and reread exchange/session records for diagnostics.
- `createAppTokenIssuer` (377-430) signs standard local JWT claims and copies
  verified binding into `cnf.jkt`, alongside application-specific claims.
- `resolveUpstreamLogoutUrl` and `oidcLogoutNavigate` (665-787) duplicate discovery,
  cookie parsing, lineage deletion, and redirects. The consumer also attempted
  fetch-based redirected logout in `client/src/app/_services/dpop.service.ts`
  (`logoutUpstream`), while its active UI navigates to a custom GET endpoint.
  These are evidence of an integration need, not a protocol to copy verbatim.

Existing upstream capabilities already cover config validation, JWT verification,
pre/post-commit lifecycle hooks, provider discovery, and MongoDB readiness. Reuse
them. `deviceBinding.mode: 'optional'` permits unbound credentials; it does not
mean that API authentication itself is optional.

Related task histories inspected for overlap:

- [Original core remediation](20260813-125834-express-oidc-vault-review-remediation.md),
  OIDC-14: upstream ID-token-bearing logout URLs were removed from JSON. The
  opaque one-time endpoint was an identified extension; this plan delivers that
  browser integration while preserving the existing response boundary.
- [Core boundary review](20260908-070811-express-oidc-vault-boundary-review.md),
  BOV-10/BOV-14: local logout precedes optional provider work, and auth-context
  hook failures have intentional failure semantics.
- [Residual core health](20260919-214440-express-oidc-vault-residual-health.md),
  OVH-04/OVH-05: provider identity, issuer-output projection, and rollback.
- [Device-bound JWT implementation](20261002-125749-express-oidc-vault-device-bound-jwt.md),
  DBJWT-05/06/07/08: lifecycle/API enforcement and shared replay/store contracts.
- [Server/client health](20261012-163240-dpop-server-client-health.md),
  DPH-01/02/03/08: bound-token interoperability, client lifecycle isolation,
  bounded HTTP work, and browser-only declarations.
- [Store business boundaries](20260927-103019-oidc-vault-store-business-boundaries.md):
  provider atomicity, ownership, and revocation contracts.

These are preservation references, not tasks to reimplement. No dedicated task
for optional auth, structured telemetry, the issuer helper, or the complete
navigation-ticket flow was found in the inspected plans.

## Priority, sequencing, and maintenance

- P1 means a demonstrated authentication/integrity/availability defect. P2 means
  an actionable application-integration or maintainability improvement. The four
  requests are classified as P2 improvements; optional auth has first execution
  priority because it removes response interception and duplicated enforcement.
- Sequence shared writers: **OVAPP-01 -> OVAPP-02 -> OVAPP-03 -> OVAPP-05 ->
  OVAPP-06 -> OVAPP-07 -> OVAPP-08**. OVAPP-04 is an independently startable
  investigation. Complete its contract before OVAPP-05. Complete OVMONGO-02
  before OVAPP-05 edits the MongoDB store. These ordering dependencies are
  coordination constraints, not claims that all features are semantically coupled.
- Shared hotspots are core `types.ts`, `index.ts`, middleware/issuance code,
  provider contracts, MongoDB `store.ts`, browser `auth-session.ts`, and READMEs.
  Build/test processes also share generated outputs and must run serially.
- API identifiers used in the earlier review are proposals, not existing exports.
  Record the selected public names, defaults, and compatibility behavior in the
  owning task before implementing them. Use a bounded investigation when a
  material contract remains unresolved; do not silently choose a weaker policy.
- Mark tasks `in_progress` only after dependencies complete. Use `blocked` for
  missing decisions or required verification prerequisites. Append changed paths,
  exact commands/results, decisions, and limitations before `completed`.
- If an investigation recommends deferral/no action, explicitly revise dependent
  tasks; a deferred or cancelled prerequisite does not authorize implementation.
- If work is delegated later, hand off the exact task IDs, ownership, dependencies,
  checks, and evidence requirements. OVAPP-08's reviewer must be independent of
  the main implementer; no implementation or independent review has run yet.
- Preserve unrelated work. Do not edit generated declarations manually. Public
  changes require migration/release notes in shipped READMEs and matching website
  documentation; leave root `CHANGELOG.md` to the release workflow.

## Shared verification

Commands run from `<repo-root>` unless another working directory is specified.
Replace placeholders before execution. Prerequisites include installed workspace
dependencies and the supported Node/pnpm toolchain, downloadable/cached MongoDB
binaries, Docker with the existing Redis test images, browser binaries/system
dependencies for the Chromium/Firefox lane, and package installation access for
packed consumers. Missing prerequisites block the corresponding required checks.

For tests using `os.tmpdir()`, provision an ignored repository-local `_tmp*`
directory, confirm it with `git check-ignore`, and set `TMPDIR` to that directory
at runtime. Record only the repo-scoped placeholder in evidence and clean fixtures
afterward. Keep build/test/packing commands serialized per `AGENTS.md`.

- **V1 - Focused regressions.** Build an affected package and its dependencies
  with `pnpm --filter '<actual-package-name>...' build` as needed. From that
  package directory run
  `pnpm exec vitest run --config ../../vitest.config.ts test/<actual-file>.test.ts`.
  Substitute real package/test names and record the exact command. Extend existing
  HTTP, provider-conformance, and concurrency fixtures rather than testing only
  internal helper calls.
- **V2 - Affected package integration.** Run each affected command separately:
  `pnpm --filter @web-ts-toolkit/express-oidc-vault test`,
  `pnpm --filter @web-ts-toolkit/express-oidc-vault-memory-store test`,
  `pnpm --filter @web-ts-toolkit/express-oidc-vault-mongodb-store test`,
  `pnpm --filter @web-ts-toolkit/express-oidc-vault-redis-store test`, and
  `pnpm --filter @web-ts-toolkit/oidc-vault-dpop-client test`.
  Run affected packages after a coherent feature batch and all five at final
  integration. The client script also performs source/test/strict-consumer
  typechecks. Inspect live-provider skips; skipped Redis/MongoDB cases are not
  evidence of correct provider behavior.
- **V3 - Browser/reference integration.**
  `pnpm --filter oidc-vault-dpop-example test:unit` and
  `pnpm --filter @web-ts-toolkit/oidc-vault-dpop-client test:browser`.
  The latter selects the existing Chromium/Firefox example lane. During OVAPP-07,
  focused specs may run from `apps/oidc-vault-dpop-example` with
  `DPOP_TEST_BROWSERS=chromium,firefox pnpm exec vitest run --config vitest.browser.config.ts test/browser/<actual-file>.browser.ts`
  after the example's dependency build; run the full lane for final integration.
- **V4 - Installed public surface.** Extend existing packed-consumer and README
  compile tests, exercised through V2, for new exports/options and browser DTOs.
  Verify release-transformed ESM/CJS and strict NodeNext/Bundler declarations;
  browser consumers must remain free of Express/Node ambient dependencies.
  Run `npm pack --dry-run --json` in each changed publishable package after
  builds. Source imports and a packing file list alone do not prove installed
  API compatibility. The release assembly is unchanged by this plan; use the
  existing release-transformed consumer harnesses rather than adding a new
  artifact pipeline.
- **V5 - Integration hygiene.** Run targeted ESLint on changed TypeScript files
  during implementation. At final integration run `pnpm build`, `pnpm lint`,
  `pnpm test`, and `git diff --check`, serially. Record failures with exact
  evidence; do not claim an unrelated baseline failure without establishing it.
  Required unresolved checks keep OVAPP-08 blocked.
- **V6 - Investigation/document review.** Review source references, contract
  matrices, dependency links, decisions, and limitations. For these task files,
  run `pnpm exec prettier --check <actual-task-file-paths>` and whitespace/link
  review. Runtime tests are implementation requirements, not a prerequisite for
  saving this documentation-only plan.

## Tasks

### Task OVAPP-01: Add optional authentication and request-scoped guards

Status: completed

Kind: improvement

Priority: P2 - first priority; eliminates response interception and duplicate proof admission in consumers.

Dependencies: none.

Primary ownership:

- `packages/express-oidc-vault/src/access-token-middleware.ts`
- Core public options/types/exports and a narrowly extracted request-authentication helper if useful.
- Focused optional-auth/guard HTTP regressions, packed consumers, and documentation.

Finding:

The API factory always authenticates or writes a rejection. Consumers needing
public endpoints plus authenticated enrichment must intercept responses or
duplicate verification. Re-running the middleware deletes existing `req.auth`
and admits the same DPoP JTI again. A plain caller-assigned `req.auth` field is
not sufficient evidence for trusted verification reuse.

References:

- `packages/express-oidc-vault/src/access-token-middleware.ts:83-310` (`createOidcVaultAccessTokenMiddleware`).
- `packages/express-oidc-vault/src/types.ts:650-676` (`OidcVaultAccessTokenMiddlewareOptions`).
- `packages/express-oidc-vault/test/bov-14-bearer-auth-context.test.ts` (hook veto, 500, and validator failure contracts).
- `packages/express-oidc-vault/README.md` (Access Token Validation Middleware; Request-aware DPoP APIs).

Requirements:

1. Add supported optional authentication, separate from binding policy, while
   retaining the existing strict behavior when the new option is absent. Define
   missing, invalid, authenticated, challenged, and failed outcomes explicitly.
2. Default optional handling permits missing credentials; invalid-credential
   anonymous fallback requires explicit configuration. Define which validator
   results/errors count as credential rejection. Do not use arbitrary status
   codes or unknown adapter exceptions as sufficient anonymous-fallback authority.
3. Nonce challenges retain their status/body/headers and retry semantics. Replay
   outages/capacity, intentional hook vetoes, and unexpected hook/server failures
   retain their failure contract. Fallback clears library auth without leaking
   challenge headers into a successful anonymous response.
4. Provide route guards using private, request-scoped verification evidence from
   the same authenticator/policy. The successful proof reservation and enrichment
   hook run once. Do not trust externally populated `req.auth`, reuse evidence
   across requests or incompatible validators/policies, or treat an unbound
   optional proof as bound authentication. Document guard mounting/order.
5. Keep application user/permission decisions callback-owned and provide a
   supported intentional denial contract where needed; unexpected callback
   failure must not become anonymous success. Public examples must avoid response
   monkey-patching and deep imports of internal error classes.

Acceptance criteria:

- An anonymous public endpoint succeeds; the corresponding required guard rejects.
- Valid Bearer and bound DPoP requests populate context. Bound-as-Bearer,
  missing/wrong proof, expired token, malformed/duplicate headers, and configured
  invalid-credential fallback have explicit, tested outcomes.
- A nonce challenge followed by a fresh proof succeeds; replay-store failure and
  a failing enrichment hook never become anonymous success.
- Optional enrichment followed by one or more compatible guards performs one
  replay reservation and one enrichment call. A forged context, incompatible
  guard, concurrent re-entry, or a different request cannot reuse that authority.
- An upstream fixture reproduces a public session endpoint plus a protected route
  without intercepting `Response` methods; existing strict-mode tests still pass.

Verification: V1 HTTP/guard regressions and existing DPoP/hook tests; core V2 and V4.

Execution notes (OVAPP-01 implementation):

- Dependencies: none; sole assigned implementation owner, executing sequentially.
  Initial worktree contains only the two preexisting untracked task documents;
  preserve both. Required package builds/tests will run serially.
- Environment established: Linux; Node `v26.10.0`, pnpm `11.18.0`, npm `11.19.1`.
  Node resolves successfully; pnpm matches root `packageManager` (the asdf file
  requests pnpm `11.24.0`). Repository-wide integration belongs to OVAPP-08.
- Inspecting current strict API, proof/replay/hook failures and packed-consumer
  harness before recording the selected API and implementing it.

Design selected before coding:

- Add `authentication?: 'required' | 'optional'` (default `required`) and
  `invalidCredentials?: 'reject' | 'anonymous'` (default `reject`, anonymous
  requires optional authentication) to the existing middleware options.
  `deviceBinding.mode` remains an independent bound/unbound-token policy.
- Add root `createOidcVaultAuthenticator(options)` returning typed, frozen
  `OidcVaultAuthenticator` handlers: `authenticate`, `requireAuth`, and
  `requireDeviceBinding`. Mount `authenticate` once before public/protected
  routes; guards only consume that instance's completed private evidence.
  Another instance, even configured identically, is intentionally incompatible.
  Keep the existing middleware factory as the same pipeline's handler API.
- Keep verification evidence in a closure-owned WeakMap keyed by the original
  Request and associated Response. No public context/symbol can grant authority.
  Guards reject absent/copied/replaced/mutated top-level context and never
  revalidate/reserve/enrich. Pending re-entry invalidates the operation and fails
  closed; the original async operation cannot subsequently attach auth or next.
  An optional proof for an unbound token never passes `requireDeviceBinding`.
- Explicit anonymous fallback covers library credential/header/proof rejections,
  including bound-as-Bearer, and deliberately identified validator rejections.
  Add root `OidcVaultInvalidAccessTokenError` for custom validators. The built-in
  JWT helper privately marks known JOSE credential errors and raw verified JWT
  profile/default-subject failures, preserving original diagnostics. Custom
  mapper errors, malformed adapter results, arbitrary HTTP statuses, and unknown
  adapter exceptions never authorize fallback; their existing strict responses
  remain compatible. Missing credentials are optional only when truly absent;
  empty/duplicate/malformed headers are invalid.
- Add root `OidcVaultAuthDeniedError(message?, status?: 401 | 403)` (default 403,
  fixed `OIDC_VAULT_AUTH_DENIED`) for intentional enrichment-hook vetoes. Preserve
  internal controlled veto behavior; unexpected hooks stay sanitized 500.
- Outcomes: missing/explicitly rejected credentials may continue anonymously
  under the selected policy; authenticated requests attach context after proof
  and hook success; nonce-challenged requests retain their original challenge;
  replay unavailable/capacity and server/hook failures terminate. Anonymous
  continuation clears auth and challenge headers after observers. Guards reject
  anonymous requests rather than retrying rejected credentials.
- Extend real HTTP fixtures plus release-transformed installed ESM/CJS and
  strict NodeNext/Bundler/README consumers; document mounting, callback ownership,
  denial, fallback classification, and additive migration behavior in README and
  website. No business-user logic is implemented in the library.

Implementation progress:

- Initial core dependency build passed. First V1 run: 391 passed, two new raw HTTP
  duplicate-header fixtures timed out because the raw request array omitted the
  HTTP Host header; JSON parsing of the resulting empty response also escaped
  the fixture Promise. Correcting the fixture with explicit Host/Connection and
  caught parse failures before rerunning (no runtime prerequisite blocker).
- Evidence refinement: use a module-private Request WeakMap plus a per-factory
  owner identity, rather than isolated per-factory maps, so an incompatible
  guard/re-entry also invalidates any already-pending operation on that request.
  The associated Response and top-level context snapshot remain private.
- Final implementation includes 49 optional-auth HTTP cases, including actual
  duplicate headers, public session/protected routes, one-reservation/enrichment
  guard chains, nonce fresh retry, replay outage/capacity 503, hook 500/public
  denial, copied/changed context, another Response, incompatible policies and
  same/foreign-factory pending re-entry. Custom mapper exceptions explicitly
  cannot gain fallback authority, even if they throw the public rejection class.
- Core V2 passed 37 files / 2066 tests, including release-transformed installed
  consumers. A subsequent formatting check flagged four changed files; applying
  the formatter's whitespace-only diff with apply_patch resolved all four.
  Final package verification and completion evidence follow below.

Completion evidence:

- Base revision: `33e434d`; implementation worktree, no commits created.
  Actual environment: Linux x64, Node `v26.10.0`, pnpm `11.18.0`, npm `11.19.1`,
  TypeScript `6.0.3`, tsup `8.5.1`, Vitest `4.1.11`. Commands
  `node --version && pnpm --version && npm --version`, `pnpm exec tsc --version`,
  `node -p 'JSON.stringify({node:process.version,platform:process.platform,arch:process.arch})'`
  and `git rev-parse --short HEAD` established these values. The configured Node
  was available and supported; no runtime fallback was needed.
- Temporary work: `mkdir -p "_tmp-ovapp01" && git check-ignore "_tmp-ovapp01"`
  confirmed the ignored repository-local directory. Every test used the absolute
  checkout expansion recorded below as `<repo-root>/_tmp-ovapp01`. Packed harness
  cleanup removed its staged packages/installed consumers;
  `rm -rf -- "_tmp-ovapp01"` removed the remaining Node compile cache and scratch
  directory after verification.
- Changed core: `packages/express-oidc-vault/src/access-token-errors.ts` (new),
  `packages/express-oidc-vault/src/access-token-middleware.ts`,
  `packages/express-oidc-vault/src/index.ts`,
  `packages/express-oidc-vault/src/token-validation.ts`,
  `packages/express-oidc-vault/src/types.ts`.
- Changed tests: `packages/express-oidc-vault/test/optional-auth.test.ts` (new),
  `packages/express-oidc-vault/test/packed-consumer.test.ts`,
  `packages/express-oidc-vault/test-packed-consumer/consumer/consumer-types.ts`,
  `packages/express-oidc-vault/test-packed-consumer/consumer/consumer-types.cts`,
  `packages/express-oidc-vault/test-packed-consumer/consumer/consumer.cjs`,
  `packages/express-oidc-vault/test-packed-consumer/consumer/consumer.mjs`,
  `packages/express-oidc-vault/test-packed-consumer/consumer/optional-auth-runtime.mjs`
  (new).
- Changed documentation: `packages/express-oidc-vault/README.md`,
  `website/docs/packages/express-oidc-vault.md`, and this task document. Both
  preexisting task documents are retained; the MongoDB task document is unchanged.
- V1 build, working directory `<repo-root>` (two standalone runs passed;
  V2 also performs its own serialized rebuild):

  ```sh
  TMPDIR='<repo-root>/_tmp-ovapp01' pnpm --filter '@web-ts-toolkit/express-oidc-vault...' build
  ```

- V1 focused HTTP/DPoP/hook regressions, working directory
  `packages/express-oidc-vault`:

  ```sh
  TMPDIR='<repo-root>/_tmp-ovapp01' pnpm exec vitest run --config ../../vitest.config.ts test/optional-auth.test.ts test/dpop-api.test.ts test/bov-14-bearer-auth-context.test.ts test/dpop-jwt-confirmation.test.ts test/dpop-replay.test.ts
  ```

  First run: 391 passed / two failed, fixture issue described above. Corrected
  run: 393 passed. Expanded coverage and final post-format run: **five files /
  398 tests passed**, including all 49 new optional-auth regressions. No skips.

- Core V2 / installed V4, working directory `<repo-root>`:

  ```sh
  TMPDIR='<repo-root>/_tmp-ovapp01' pnpm --filter @web-ts-toolkit/express-oidc-vault test
  ```

  Both runs passed **37 files / 2066 tests**, including the final post-format
  run. No skipped tests. The packed harness applies the existing release manifest
  transformation, installs tarballs, runs actual ESM/CJS optional session and
  guarded HTTP requests, checks exact root exports, and compiles strict
  NodeNext-ESM/NodeNext-CJS/Bundler declarations plus installed README and matching
  website examples. Existing DOM-only wire/browser compile lanes also passed.
  Consumer runtime coverage was Node `v26.10.0` only;
  `node -p 'JSON.stringify({extraConsumerRuntimeConfigured:!!process.env.DPOP_TEST_NODE})'`
  returned `false`.

- V4 package file check, working directory `packages/express-oidc-vault`:

  ```sh
  npm pack --dry-run --json
  ```

  Passed twice after builds: ten intended workspace-package files (README,
  manifest, eight built JS/declaration entries), no bundled dependencies.
  The release-transformed staged file-list/installed checks passed inside V2.

- Targeted ESLint, working directory `<repo-root>` (both runs passed):

  ```sh
  pnpm exec eslint packages/express-oidc-vault/src/access-token-errors.ts packages/express-oidc-vault/src/access-token-middleware.ts packages/express-oidc-vault/src/index.ts packages/express-oidc-vault/src/token-validation.ts packages/express-oidc-vault/src/types.ts packages/express-oidc-vault/test/optional-auth.test.ts packages/express-oidc-vault/test/packed-consumer.test.ts packages/express-oidc-vault/test-packed-consumer/consumer/consumer-types.ts packages/express-oidc-vault/test-packed-consumer/consumer/consumer-types.cts packages/express-oidc-vault/test-packed-consumer/consumer/consumer.mjs packages/express-oidc-vault/test-packed-consumer/consumer/consumer.cjs packages/express-oidc-vault/test-packed-consumer/consumer/optional-auth-runtime.mjs
  ```

- Formatting/whitespace, working directory `<repo-root>`:

  ```sh
  pnpm exec prettier --check packages/express-oidc-vault/src/access-token-errors.ts packages/express-oidc-vault/src/access-token-middleware.ts packages/express-oidc-vault/src/token-validation.ts packages/express-oidc-vault/test/optional-auth.test.ts packages/express-oidc-vault/test/packed-consumer.test.ts packages/express-oidc-vault/test-packed-consumer/consumer/optional-auth-runtime.mjs docs/tasks/20261022-200950-express-oidc-vault-app-integration.md
  git diff --check
  ```

  Passed after correcting the four formatting findings (the initial formatter
  command checked the same six code files, without the task document). The
  task-only `pnpm exec prettier --check docs/tasks/20261022-200950-express-oidc-vault-app-integration.md`
  also passed. Source, documentation parity, task links and whitespace reviewed.

- Limits/follow-up: no unresolved OVAPP-01 required checks. The Vite configuration
  printed a future-native-loader advisory; it did not affect results. This task
  does not claim live MongoDB/Redis, real-browser, multi-Node-version or full
  workspace verification; final integration/independent review remains OVAPP-08.
  Selected public APIs/defaults and malformed-credential tightening are documented
  in shipped migration notes and the website. OVAPP-02 can proceed sequentially.

### Task OVAPP-02: Expose structured proof diagnostics and issuance outcomes

Status: completed

Kind: improvement

Priority: P2 - replaces message matching, duplicate decoding, and diagnostic-only store reads.

Dependencies: OVAPP-01 (shared middleware/types sequencing).

Primary ownership:

- Core `src/dpop-proof.ts`, `dpop-replay.ts`, `vault-route-proof.ts`, and diagnostic types.
- Core `src/access-token-middleware.ts`, `index.ts`, and `token-issuance.ts` integration points.
- Focused event/hook tests, public declarations, and diagnostic examples.

Finding:

Proof verification already knows signed `iat`, target checks, and replay outcomes,
but public observers receive Error objects rather than stable structured proof
events. Ordinary route error handling supplies no session snapshot. Issuer input
has no operation discriminator, and there is no exchange-success notification,
so consumer telemetry lives inside token-signing code and inspects request URLs.

References:

- `packages/express-oidc-vault/src/dpop-proof.ts:189-279` (`verifyDpopProof`).
- `packages/express-oidc-vault/src/dpop-replay.ts:228-301` (`verifyAndReserve`).
- `packages/express-oidc-vault/src/index.ts:472-497,867-949` (`handleRouteError`, `createExchangeHandler`).
- `packages/express-oidc-vault/src/types.ts:513-588` (hooks, error context, `IssueTokenInput`).

Requirements:

1. Define typed operation/stage/outcome/reason fields shared by vault and API
   diagnostics. Cover accepted, rejected, nonce-challenged, and explicitly ignored
   checks without changing the current enforcement/override settings or public
   error payloads. Keep existing `onError` behavior compatible.
2. Sample verification time at the actual check. Expose bounded proof timing and
   observed difference only with explicit provenance; a signed timestamp is not
   proof of an accurate physical clock. Never label unchecked or partially
   verified values as authenticated. Malformed proofs need a reason, not decoded
   arbitrary payloads.
3. Reuse captured verified/store context instead of adding telemetry lookups.
   Distinguish candidate-session association from authenticated identity on
   failures. Expose only the context needed for an application correlation
   callback; do not include entire credential-bearing sessions in new events.
4. Add an explicit exchange/refresh operation to token-issuer input and a defined
   exchange/issuance success notification. Define the notification's commit point
   and cardinality; signing success followed by output-validation failure is not
   successful exchange. Preserve rollback and post-commit hook semantics.
5. Bound/redact event fields: exclude raw tokens, proofs, private keys, upstream
   credentials, query strings, and arbitrary provider/store error text. Specify
   observer ordering and async behavior. Throwing/rejecting observers cannot
   change authentication or produce unhandled rejections; avoid recursive error
   notification or implicit unbounded buffering.

Acceptance criteria:

- Consumers classify freshness, target/key/signature failures, replay, replay
  unavailability, and nonce challenges without regexes or JWT decoding.
- Accepted/rejected/ignored events report truthful verification stages. Timing
  cases use the injected clock, including freshness boundaries and clock failure.
- Exchange and refresh are distinguishable without URL inspection. Successful
  exchange emits its defined notification once; issuance/rollback failures do
  not emit success, and observer failure does not undo committed state.
- Failure correlation does not mark an unverified caller as the session owner;
  telemetry adds no exchange/session reads or replay reservations.
- Synthetic token/query/provider secrets are absent from diagnostic payloads,
  and browser error bodies/headers retain their existing contract.

Verification: V1 proof/replay/API/lifecycle event regressions; core V2 and V4.

Execution notes (OVAPP-02 implementation):

- Sole assigned implementation owner, sequential execution; OVAPP-01 is completed.
  Preserve its worktree changes and both existing task documents. No nested agents
  or commits; builds/tests remain serialized. Environment reconfirmed with
  `node --version && pnpm --version && npm --version`: Node `v26.10.0`, pnpm
  `11.18.0`, npm `11.19.1`.

Design selected before coding:

- Add optional `onDpopDiagnostic(event)` to vault and API options. Root-export
  readonly `OidcVaultDpopDiagnosticEvent` and its operation/stage/outcome/reason,
  verification-provenance, timing, correlation, and observer types. Operations
  are explicit `login | exchange | refresh | logout | api`; bounded per-check
  events cover presentation/preflight, header/key/signature/claims, target,
  token hash/original binding, freshness, nonce, replay, and final proof admission.
  Stable reasons are library literals, never classifications of error messages.
- Verification snapshots distinguish unchecked, passed/matched, disabled or
  inapplicable, and deliberately ignored checks. A verified signature alone does
  not authenticate a subject. Signed integer `iat` is labeled signature-verified;
  checked time and observed age (`checkedAtMs - iatSeconds * 1000`) are sampled at
  freshness enforcement with the injected clock. Invalid/unsafe values are
  omitted, never clamped or labeled accurate physical-clock drift. Clock failure
  is explicit; an enabled override labels the separate system-clock fallback.
- Reuse the existing snapshots, without diagnostic-only store reads/reservations.
  Correlation contains only bounded SHA-256 base64url references to subject and
  logical session (API session claim), with `candidate-session`, `verified-token`,
  or `authenticated` association. Hash inputs use purpose prefixes (`subject\0`
  and `session\0`) and omit strings over 1024 UTF-16 code units. Intermediate
  vault association is candidate-only; original-bound proof admission establishes
  authenticated association under the recorded policy, not application approval.
  No request/response, raw identifiers, JWK/JKT/JTI, credentials, URL/query,
  session/profile/metadata object, or arbitrary diagnostic text enters new events.
- Add required `operation: 'exchange' | 'refresh'` to `IssueTokenInput`. Add vault
  `onTokenOutcome(event)` with `token-issued` (exchange or refresh, only with an
  issuer) and `exchange-succeeded` (exchange, including issuer-less exchange).
  Materialize/validate issuer output and response DTO, finish required committed
  store work and cookie preparation first. Generate token-issued then exchange
  success once at this commit point, before HTTP writing; network delivery is not
  guaranteed. No success follows issuer/output/rotation validation or rollback
  failure. Existing refresh post-commit hook/onError ordering is retained before
  these notifications; existing rollback and onError payloads stay compatible.
- Observers receive deeply frozen allowlisted snapshots. Invoke synchronously in
  production order, without awaiting asynchronous work; promise settlement order
  is unspecified. Each observer dispatcher allows at most 32 pending promises,
  drops additional/reentrant calls, and has no queue/retry/timer. Synchronous
  throws and asynchronous rejection are swallowed without recursive onError or
  unhandled rejection. Delivery is explicitly best-effort; successful operations
  generate each defined outcome once, with delivery subject to that bound.
- Extend HTTP proof/lifecycle fixtures, release-transformed installed ESM/CJS,
  strict NodeNext/Bundler declarations, and compiled README/website examples.
  Later task APIs and the root changelog remain outside OVAPP-02 ownership.

Implementation progress:

- Initial dependency build passed. First V1 run passed eight files / 1027 tests
  across API/vault proof diagnostics, issuance/output rollback, optional-auth
  evidence, proof/replay and existing per-check override enforcement.
- Provenance refinement: failed checks explicitly report `failed`, distinct from
  `unchecked`. Only complete original-bound proof admission with no ignored check
  promotes correlation to `authenticated`; bound override acceptance remains
  `candidate-session` (vault/outcomes) or `verified-token` (API). This keeps
  partially checked values from acquiring an authenticated telemetry label while
  preserving existing override enforcement.
- First core V2 run: 36 files passed / two files failed; 2122 tests passed / two
  new fixture cases failed. The disabled-policy login case omitted the separate
  fingerprint opt-in needed to register POST login (404); the installed bound
  exchange fixture omitted the mandatory browser-binding hash/cookie (store
  rejection). Correcting those fixture prerequisites before rerunning. Initial
  targeted ESLint found six unused property-access expressions in the new
  negative declaration fixtures; explicit `void` accesses resolve those findings.

Completion evidence:

- Base revision: `33e434d`; sequential implementation worktree, no commits.
  OVAPP-01 changes and both preexisting task documents are preserved; only
  OVAPP-02's status was advanced in this execution. Later tasks remain pending.
- Delivered the selected root-typed `onDpopDiagnostic` and `onTokenOutcome`
  APIs plus required issuer `operation`. Proof diagnostics include stable
  check-specific failures, actual-check signed-iat age, clock failure/fallback,
  nonce/replay/ignored outcomes, strict verification provenance and hashed
  association-only correlation. Diagnostics add no store reads/reservations.
  At most 16 events are generated per proof attempt; each observer dispatcher
  bounds pending promises at 32, drops excess/reentrant calls without buffering,
  and absorbs throws/rejections without recursive onError or auth effects.
- Commit semantics: token-issued precedes exchange-succeeded after checked
  consume/rotation, issuer-output validation, original post-commit hook ordering,
  response DTO materialization and cookie preparation, before HTTP writing.
  Issuer-less exchange reports only exchange-succeeded; issuer-less refresh has
  neither outcome. Issuer/output/rotation/rollback failures report no success.
  Existing hook/onError, private request evidence and sanitized wire behavior
  remain covered. Final provenance review moved nonce-challenged emission after
  successful nonce issuance; failed challenge generation uses nonce-unavailable.
- Changed core: `packages/express-oidc-vault/src/diagnostics.ts` (new),
  `src/dpop-proof.ts`, `src/dpop-replay.ts`, `src/vault-route-proof.ts`,
  `src/access-token-middleware.ts`, `src/token-issuance.ts`, `src/types.ts`,
  and `src/index.ts` (all abbreviated paths in this bullet are core-relative).
- Changed tests, core-relative: `test/diagnostics.test.ts` (new),
  `test/dpop-api.test.ts`, `test/dpop-login-callback.test.ts`,
  `test/dpop-vault-session.test.ts`, `test/dpop-token-issuance.test.ts`,
  `test/ovh-05-token-response.test.ts`, `test/packed-consumer.test.ts`;
  `test-packed-consumer/consumer/consumer-types.ts`, `consumer-types.cts`,
  `optional-auth-runtime.mjs`, and `diagnostics-runtime.mjs` (new).
  The net core-suite increase is 64 cases over OVAPP-01, with additional outcome
  assertions throughout the existing issuer-output rollback matrix.
- Changed documentation: `packages/express-oidc-vault/README.md`,
  `website/docs/packages/express-oidc-vault.md`, and this task document. Shipped
  migration notes describe the required operation discriminator, safe telemetry,
  provenance, correlation, commit/cardinality and best-effort delivery contract.
- Actual environment: Linux x64, Node `v26.10.0`, pnpm `11.18.0`, npm `11.19.1`,
  TypeScript `6.0.3`, tsup `8.5.1`, Vitest `4.1.11`. In addition to the version
  command above, these commands ran from `<repo-root>`:

  ```sh
  node -p 'JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,extraConsumerRuntimeConfigured:!!process.env.DPOP_TEST_NODE})'
  pnpm exec tsc --version
  git rev-parse --short HEAD
  ```

  Additional consumer runtime configured: `false`. No fallback runtime was needed.

- V1 build and ignored temporary-directory verification, working directory
  `<repo-root>` (passed; V2 also rebuilt serially):

  ```sh
  ls -d . node_modules && mkdir -p "_tmp-ovapp02" && git check-ignore "_tmp-ovapp02" && TMPDIR='<repo-root>/_tmp-ovapp02' pnpm --filter '@web-ts-toolkit/express-oidc-vault...' build
  ```

- V1 initial focused run, working directory `packages/express-oidc-vault`:

  ```sh
  TMPDIR='<repo-root>/_tmp-ovapp02' pnpm exec vitest run --config ../../vitest.config.ts test/dpop-api.test.ts test/dpop-vault-session.test.ts test/ovh-05-token-response.test.ts test/dpop-token-issuance.test.ts test/optional-auth.test.ts test/dpop-proof.test.ts test/dpop-replay.test.ts test/dpop-failure-policy.test.ts
  ```

  Passed eight files / 1027 tests. Final expanded V1, same working directory:

  ```sh
  TMPDIR='<repo-root>/_tmp-ovapp02' pnpm exec vitest run --config ../../vitest.config.ts test/diagnostics.test.ts test/dpop-api.test.ts test/dpop-login-callback.test.ts test/dpop-vault-session.test.ts test/ovh-05-token-response.test.ts test/dpop-token-issuance.test.ts test/optional-auth.test.ts test/dpop-proof.test.ts test/dpop-replay.test.ts test/dpop-failure-policy.test.ts
  ```

  **Ten files / 1245 tests passed**, no skips. Includes alias/no-target logout,
  strict versus ignored association, redaction/field bounds, actual-check timing,
  signature-first malformed inputs, nonce challenge-generation failure,
  asynchronous observer saturation/recovery, reentrancy and existing auth evidence.

- Core V2 and installed V4, working directory `<repo-root>`:

  ```sh
  TMPDIR='<repo-root>/_tmp-ovapp02' pnpm --filter @web-ts-toolkit/express-oidc-vault test
  ```

  Three sequential runs: first 2122 passed / two new fixture failures described
  above; corrected run **38 files / 2129 tests passed**; final run after the
  nonce-provenance refinement **38 files / 2130 tests passed**, no skips or
  unhandled rejections. The existing release-manifest transformation, installed
  ESM/CJS HTTP runtimes in both transports, actual signed bound JWTs,
  operation/outcome/rollback/observer behavior, strict NodeNext ESM/CJS and Bundler
  declarations, installed README examples and byte-identical website telemetry
  example all passed. Existing browser/DOM-only declaration lanes also passed.
  Documentation dependency builds inside the packed harness remained serialized.

- V4 workspace package file check, working directory
  `packages/express-oidc-vault`:

  ```sh
  npm pack --dry-run --json
  ```

  Passed: ten intended files (README, manifest, eight JS/declaration outputs), no
  bundled dependencies. The release-transformed staged package's eleven-file
  check (including LICENSE) passed inside V2.

- Final targeted ESLint, working directory `<repo-root>` (passed; the initial
  six negative-fixture expression findings are resolved):

  ```sh
  pnpm exec eslint packages/express-oidc-vault/src/diagnostics.ts packages/express-oidc-vault/src/dpop-proof.ts packages/express-oidc-vault/src/dpop-replay.ts packages/express-oidc-vault/src/vault-route-proof.ts packages/express-oidc-vault/src/token-issuance.ts packages/express-oidc-vault/src/access-token-middleware.ts packages/express-oidc-vault/src/types.ts packages/express-oidc-vault/src/index.ts packages/express-oidc-vault/test/diagnostics.test.ts packages/express-oidc-vault/test/dpop-api.test.ts packages/express-oidc-vault/test/dpop-vault-session.test.ts packages/express-oidc-vault/test/dpop-login-callback.test.ts packages/express-oidc-vault/test/dpop-token-issuance.test.ts packages/express-oidc-vault/test/ovh-05-token-response.test.ts packages/express-oidc-vault/test/packed-consumer.test.ts packages/express-oidc-vault/test-packed-consumer/consumer/consumer-types.ts packages/express-oidc-vault/test-packed-consumer/consumer/consumer-types.cts packages/express-oidc-vault/test-packed-consumer/consumer/optional-auth-runtime.mjs packages/express-oidc-vault/test-packed-consumer/consumer/diagnostics-runtime.mjs
  ```

- Formatting/whitespace, working directory `<repo-root>`:

  ```sh
  pnpm exec prettier --check packages/express-oidc-vault/src/diagnostics.ts packages/express-oidc-vault/src/dpop-proof.ts packages/express-oidc-vault/src/dpop-replay.ts packages/express-oidc-vault/src/vault-route-proof.ts packages/express-oidc-vault/src/token-issuance.ts packages/express-oidc-vault/src/access-token-middleware.ts packages/express-oidc-vault/src/index.ts packages/express-oidc-vault/src/types.ts packages/express-oidc-vault/test/diagnostics.test.ts packages/express-oidc-vault/test/dpop-api.test.ts packages/express-oidc-vault/test/dpop-login-callback.test.ts packages/express-oidc-vault/test/dpop-vault-session.test.ts packages/express-oidc-vault/test/dpop-token-issuance.test.ts packages/express-oidc-vault/test/ovh-05-token-response.test.ts packages/express-oidc-vault/test/packed-consumer.test.ts packages/express-oidc-vault/test-packed-consumer/consumer/optional-auth-runtime.mjs packages/express-oidc-vault/test-packed-consumer/consumer/diagnostics-runtime.mjs docs/tasks/20261022-200950-express-oidc-vault-app-integration.md
  git diff --check
  ```

  Passed after applying formatter whitespace diffs with apply_patch (the first
  check flagged `src/index.ts` and `test/packed-consumer.test.ts`). Final source,
  bounded event payloads, documentation parity and existing task links reviewed.

- Temporary work: all consumers used `<repo-root>/_tmp-ovapp02`; the packed
  harness removed staged packages and installations. Inspection found only the
  Node compile cache afterward. From `<repo-root>`,
  `git check-ignore "_tmp-ovapp02" && rm -rf -- "_tmp-ovapp02"` removed the remaining
  ignored scratch directory. Other temporary work was preserved.
- Limits/follow-up: no unresolved OVAPP-02 required checks. New callbacks are
  intentionally best-effort, bounded delivery, not durable audit persistence.
  Runtime evidence is Node `v26.10.0` only. No live MongoDB/Redis, real browser,
  full-workspace or independent-review claim is made; those integration lanes
  remain OVAPP-08. The existing Vite future-native-loader advisory was non-failing.
  OVAPP-03 can now proceed through the documented sequential dependency.

### Task OVAPP-03: Add a local JWT access-token issuer helper

Status: completed

Kind: improvement

Priority: P2 - removes repeated signing and DPoP claim construction from applications.

Dependencies: OVAPP-02 (shared issuance/types sequencing and explicit operation context).

Primary ownership:

- A focused JWT issuer module under `packages/express-oidc-vault/src/`.
- Core types/exports, issuer regressions, packed consumers, and README examples.

Finding:

The package has a JWT validator helper but consumers write the symmetric signing
adapter. Core validates issuer output and handles rollback; those boundaries can
host a reusable issuer without taking over application-specific claims.

References:

- `packages/express-oidc-vault/src/token-validation.ts:266-312` (`createOidcVaultJwtAccessTokenValidator`).
- `packages/express-oidc-vault/src/token-issuance.ts:32-124` (`assertIssuedBoundJwt`, `withIssuedToken`).
- `packages/express-oidc-vault/src/types.ts:559-588` (`IssueTokenInput`, `OidcVaultTokenIssuer`).
- `packages/express-oidc-vault/README.md:231-315` (manual `SignJWT` quick start).

Requirements:

1. Export a typed helper returning `OidcVaultTokenIssuer`; document the chosen
   name and supported JOSE keys/signing algorithms, issuer, audience, lifetime,
   clock, and application claim/subject mapping. Preserve custom issuer support.
2. Own `iss`, `aud`, `iat`, `exp`, `sub`, and `cnf` authority. Custom claims must
   not override security-owned fields. Use verified input `deviceBinding`, not
   mutable session/profile binding; choose `DPoP` versus `Bearer` accordingly.
3. Validate key/algorithm compatibility and time arithmetic. Keep expiration and
   returned `expiresIn` coherent, including the existing zero-lifetime contract.
   Use no public fallback secret and snapshot configuration consistently with the
   validator. Keep key rotation/JWKS serving outside this helper's initial scope.
4. Default subject to session subject and document scope mapping. Keep application
   fields allowlisted by a callback. Do not automatically copy session metadata,
   upstream tokens, or vault handles into JWTs; in particular, no automatic vault
   `sid` claim in cookie mode.
5. Preserve existing output checks, original-lineage rollback, cookie clearing,
   and generic custom/opaque unbound-issuer behavior. Update the quick start to
   demonstrate a small application claim mapper using public imports.

Acceptance criteria:

- Helper-issued bound and unbound JWTs verify with the existing helper and pass
  the appropriate API middleware; bound tokens also satisfy browser parsing.
- Wrong key/issuer/audience, expired tokens, malformed time options, and attempted
  reserved-claim overrides have deterministic tested outcomes.
- Session/profile mutation cannot change authoritative binding. Mapper/signing
  failures retain exchange/refresh rollback; zero lifetime is coherent end to end.
- Cookie session handles and upstream credentials are absent from default tokens.
- Installed ESM/CJS and strict TypeScript consumers can configure custom claims
  without `any` or internal imports.

Verification: V1 issuer-to-validator/API and rollback regressions; core V2 and V4;
client V2 when shared fixtures or browser credential expectations change.

Execution notes (OVAPP-03 implementation):

- Sole assigned implementation owner, sequential execution; OVAPP-01/02 are
  completed and their worktree changes are preserved. No nested agents or commits.
  Builds/tests remain serialized. Reconfirmed Node `v26.10.0`, pnpm `11.18.0`,
  npm `11.19.1` with `node --version && pnpm --version && npm --version`.

Design selected before coding:

- Root-export `createOidcVaultJwtAccessTokenIssuer(options)` returning a frozen
  `OidcVaultTokenIssuer`, with `OidcVaultJwtAccessTokenIssuerOptions`,
  `OidcVaultJwtSigningAlgorithm`, and `OidcVaultJwtAccessTokenClaims` types.
  Required `key`, `algorithm`, `issuer`, and `audience`; optional
  `lifetimeSeconds` defaults to 300, `now` to Date.now (epoch milliseconds).
  Algorithms: HS256/384/512, RS256/384/512, PS256/384/512, ES256/384/512, EdDSA
  (Ed25519). Accept JOSE Uint8Array, secret/private KeyObject, signing CryptoKey,
  or secret/private JWK; validate algorithm/type/curve/hash/usage and minimum
  HMAC/RSA size at construction. No implicit key or algorithm.
- Snapshot configuration, audience arrays, secret bytes and JWK material at
  construction; retain immutable native keys and captured callback/clock
  references. Invalid configuration throws TypeError at construction. Sample the
  clock then and again immediately before signing, after asynchronous mapping;
  require safe nonnegative integer milliseconds, lifetime seconds/milliseconds,
  addition and JWT expiry milliseconds. JWT `iat = floor(now / 1000)`,
  `exp = iat + lifetimeSeconds`, response `expiresIn = lifetimeSeconds`.
  Subsecond rounding follows JWT seconds; zero produces an already-expired JWT
  while retaining the successful vault handle/cookie rotation contract.
- Optional async `mapSubject(input)` defaults to the captured session subject;
  optional async `mapClaims(input)` returns only application-allowlisted claims.
  Run subject mapping before claims mapping; both receive existing typed
  IssueTokenInput, including operation. Default scope is the captured session
  scope; mapper scope overrides it, and `scope: undefined` omits it. Default
  subject/scope and authoritative input binding are captured before callbacks.
- Reject any attempted `iss`, `aud`, `iat`, `exp`, `sub`, or `cnf` custom claim
  (including undefined). Also check the materialized JSON claims, so serializers
  cannot overwrite security authority. JSON-materialize application claims before
  constructing the security-owned payload. Only input.deviceBinding selects
  exact `cnf: { jkt }`/DPoP; absence selects no cnf/Bearer. Mutable session/profile,
  metadata and later mapper mutations cannot supply or replace that authority.
  No automatic sid, session/profile dumping, upstream credentials or JWT key
  rotation/JWKS API. Business lookup/roles/permissions remain in callbacks.
- Preserve custom issuers, opaque unbound output, existing output validation,
  original-lineage rollback/cookie clearing and OVAPP-02 outcome commit points.
  Mapper/serialization/clock/sign failures propagate into existing rollback and
  private onError; success observers stay outside signing. Verify real vault
  exchange/refresh plus validator/API/browser credential parsing, negative and
  mutation boundaries, installed release-transformed ESM/CJS/strict consumers,
  compiled README/website/quickstarts, core V2 and applicable client checks.

Completion evidence:

- Base revision `33e434d`; implementation worktree, no commits/pushes or root
  CHANGELOG edits. Prior OVAPP-01/02 work and both existing task documents are
  preserved. Only OVAPP-03 was advanced in this execution; later tasks remain
  pending.
- Delivered the selected root factory and three public types. The helper owns
  reserved security claims, snapshots binding before mappers, selects exact
  DPoP/Bearer output, validates signing configuration/time arithmetic, and keeps
  zero-lifetime JWT/response/browser deadlines coherent. Default tokens contain
  no vault sid/handle, profile/metadata dump or upstream credentials. Scope and
  optional application subject/claim mapping follow the design above.
- Changed core: `packages/express-oidc-vault/src/jwt-token-issuer.ts` (new),
  `src/types.ts`, and `src/index.ts` (abbreviated paths are core-relative).
  Existing custom issuer/output-check/lineage/cookie/outcome code is preserved.
- Changed tests, core-relative: `test/jwt-token-issuer.test.ts` (new, 79 cases),
  `test/ovh-05-token-response.test.ts` (24 added real-route failure cases),
  `test/packed-consumer.test.ts`, and `test-packed-consumer/consumer/consumer.mjs`,
  `consumer.cjs`, `consumer-types.ts`, `consumer-types.cts`,
  `jwt-issuer-runtime.mjs` (new). Net core-suite increase: 103 cases.
- Changed documentation: `packages/express-oidc-vault/README.md`,
  `website/docs/packages/express-oidc-vault.md`, and this task document. The
  complete DPoP quickstart and unbound example now use the helper with small
  application claim mappers. Matching issuer API/defaults/key restrictions,
  subject/scope/JSON/reserved-claim behavior and additive migration notes ship in
  both documentation surfaces.
- Actual environment: Linux x64, Node `v26.10.0`, pnpm `11.18.0`, npm `11.19.1`,
  TypeScript `6.0.3`, tsup `8.5.1`, Vitest `4.1.11`. In addition to the version
  command recorded above, these ran from `<repo-root>`:

  ```sh
  node -p 'JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,extraConsumerRuntimeConfigured:!!process.env.DPOP_TEST_NODE})'
  pnpm exec tsc --version
  git rev-parse --short HEAD
  ```

  Additional consumer runtime configured: `false`; no runtime fallback needed.

- Temporary-directory preparation, working directory `<repo-root>`:

  ```sh
  ls -d . node_modules && mkdir -p "_tmp-ovapp03" && git check-ignore "_tmp-ovapp03"
  ```

  All tests used absolute checkout expansion of the repo-local TMPDIR below.
  Builds, package tests and packed documentation-dependency builds ran serially.

- V1 dependency build, working directory `<repo-root>`:

  ```sh
  TMPDIR='<repo-root>/_tmp-ovapp03' pnpm --filter '@web-ts-toolkit/express-oidc-vault...' build
  ```

  Passed after correcting initial new-module declaration inference/assertion
  typing errors; also passed after final formatting. Core/client V2 rebuilt their
  dependencies serially too.

- Initial focused V1, working directory `packages/express-oidc-vault`:

  ```sh
  TMPDIR='<repo-root>/_tmp-ovapp03' pnpm exec vitest run --config ../../vitest.config.ts test/jwt-token-issuer.test.ts test/ovh-05-token-response.test.ts test/dpop-token-issuance.test.ts
  ```

  First run: 174 passed / six failed. Two cases exposed acceptance of array
  claims in the new helper (the existing generic isRecord accepts arrays); added
  explicit rejection before/after JSON materialization. Four new rollback cases
  exposed a matcher mistake and reuse of a fetch spy across loop iterations;
  corrected the matcher and split failures into independent named cases. The
  corrected run passed **three files / 200 tests**.

- Final expanded V1/V4 after formatting, same package working directory:

  ```sh
  TMPDIR='<repo-root>/_tmp-ovapp03' pnpm exec vitest run --config ../../vitest.config.ts test/jwt-token-issuer.test.ts test/ovh-05-token-response.test.ts test/dpop-token-issuance.test.ts test/dpop-jwt-confirmation.test.ts test/dpop-api.test.ts test/dpop-vault-session.test.ts test/packed-consumer.test.ts
  ```

  **Seven files / 868 tests passed**, no skips. Covers all 13 supported algorithms
  with applicable byte/native/CryptoKey/JWK representations, wrong key/issuer/
  audience/expiry, key/usage/curve/hash/size and time validation, reserved claims
  (including inherited/undefined/serializer-produced), config/input mutation,
  scope/subject mapping and signing-clock sampling. Real body/cookie exchange and
  rotated refresh feed helper JWTs through both validator methods, API proof
  enforcement and the existing browser credential parser, including zero lifetime.
  Mapper/serialization/clock/signing failures revoke the original lineage, clear
  configured cookies, retain original private diagnostics and emit no success.

- Core V2 and installed V4, working directory `<repo-root>`:

  ```sh
  TMPDIR='<repo-root>/_tmp-ovapp03' pnpm --filter @web-ts-toolkit/express-oidc-vault test
  ```

  **39 files / 2233 tests passed**, no skips. Installed V4 passed in this full run
  and again in the final focused run: real release-manifest transformation and
  installed ESM/CJS helper-issued JWT/HTTP fixtures in both transports, bound and
  unbound output, zero expiry, mutation and reserved-claim refresh rollback;
  exact root exports and strict NodeNext ESM/CJS/Bundler declarations. Installed
  README server/unbound/helper snippets compile; the website's DPoP server and
  helper examples are byte-identical to README snippets, and its standalone
  unbound example compiles too. Existing DOM-only browser/wire consumers remain
  free of backend ambient dependencies. No new artifact pipeline was introduced.

- Applicable client V2, working directory `<repo-root>`:

  ```sh
  TMPDIR='<repo-root>/_tmp-ovapp03' pnpm --filter @web-ts-toolkit/oidc-vault-dpop-client test
  ```

  **18 files / 701 tests passed**, no skips; source/test and strict NodeNext/
  Bundler consumer typechecks all passed. Client production code is unchanged;
  this lane verifies the strengthened cross-package JWT/credential expectations.

- V4 package file check, working directory `packages/express-oidc-vault`:

  ```sh
  npm pack --dry-run --json
  ```

  Passed twice after builds: ten intended workspace files (README, manifest,
  eight built JS/declaration entries), no bundled dependencies. The staged
  release-transformed eleven-file check including LICENSE passed inside V4.

- Targeted ESLint, working directory `<repo-root>` (both runs passed):

  ```sh
  pnpm exec eslint packages/express-oidc-vault/src/jwt-token-issuer.ts packages/express-oidc-vault/src/types.ts packages/express-oidc-vault/src/index.ts packages/express-oidc-vault/test/jwt-token-issuer.test.ts packages/express-oidc-vault/test/ovh-05-token-response.test.ts packages/express-oidc-vault/test/packed-consumer.test.ts packages/express-oidc-vault/test-packed-consumer/consumer/jwt-issuer-runtime.mjs packages/express-oidc-vault/test-packed-consumer/consumer/consumer-types.ts packages/express-oidc-vault/test-packed-consumer/consumer/consumer-types.cts packages/express-oidc-vault/test-packed-consumer/consumer/consumer.mjs packages/express-oidc-vault/test-packed-consumer/consumer/consumer.cjs
  ```

- Formatting/whitespace, working directory `<repo-root>`:

  ```sh
  pnpm exec prettier --check packages/express-oidc-vault/src/jwt-token-issuer.ts packages/express-oidc-vault/src/types.ts packages/express-oidc-vault/src/index.ts packages/express-oidc-vault/test/jwt-token-issuer.test.ts packages/express-oidc-vault/test/ovh-05-token-response.test.ts packages/express-oidc-vault/test/packed-consumer.test.ts packages/express-oidc-vault/test-packed-consumer/consumer/jwt-issuer-runtime.mjs docs/tasks/20261022-200950-express-oidc-vault-app-integration.md
  git diff --check
  ```

  Passed after applying formatter whitespace diffs with apply_patch. Initial
  formatting check of types/task flagged the new type union; resolved. Source,
  documentation parity, existing task links and scrubbed evidence reviewed.

- Cleanup: packed harness removed staged/installed consumers. Inspection found
  only Node's compile cache in `_tmp-ovapp03`; from `<repo-root>`,
  `git check-ignore "_tmp-ovapp03" && rm -rf -- "_tmp-ovapp03"` removed the remaining
  ignored scratch directory. Other temporary work is preserved.
- Limits/follow-up: no unresolved OVAPP-03 required checks. Runtime evidence is
  Node `v26.10.0` only. The existing Vite native-loader advisory was non-failing.
  Live MongoDB/Redis, real-browser, full-workspace and independent-review lanes
  remain final OVAPP-08; this task does not claim those results. Logout-ticket
  work remains subject to OVAPP-04/OVMONGO-02 and its existing dependencies.

### Task OVAPP-04: Define the logout-navigation ticket contract

Status: completed

Kind: investigation

Priority: P2 - resolves cross-package lifecycle decisions before persistence or public API changes.

Dependencies: none.

Primary ownership:

- The decision record in this task and the proposed core/store/browser contracts.
- Read-only analysis of current logout, provider metadata, cookies, and client lifecycle.

Finding:

The current POST logout can issue a 302 after proof-authenticated local revocation.
Fetch does not turn that response into top-level navigation, and manual browser
redirect responses cannot be relied on to expose `Location`. Returning the actual
provider URL in JSON would re-expose its stored `id_token_hint`.

References:

- `packages/express-oidc-vault/src/index.ts:1124-1250` (`createLogoutHandler`).
- `packages/express-oidc-vault/src/wire.ts:57-77` (`OidcVaultLogoutResult`).
- `packages/oidc-vault-dpop-client/src/auth-session.ts:808-825` (`logout`).
- `packages/express-oidc-vault/test/bov-10-route-prerequisites.test.ts` (local-first logout and provider fallback).
- OIDC-14 in [original core remediation](20260813-125834-express-oidc-vault-review-remediation.md).

Requirements:

1. Specify a proof-authorized POST initiation that commits local logout and may
   return an opaque backend navigation URL. Its GET continuation consumes one
   short-lived ticket and performs the existing provider redirect or a configured
   fallback. Preserve ordinary local logout and existing redirected POST behavior.
2. Resolve public endpoint/option/DTO names, same-backend URL validation, fallback
   destination rules, opt-in behavior, ticket entropy/hash storage, TTL bounds,
   namespace/provider isolation, cleanup/capacity, and browser association if any.
   The ticket authorizes only continuation of the already-authorized logout.
3. Specify the optional store capability: create and atomic consume-if-live,
   record ownership, collision handling, concurrency, and cross-instance behavior.
   Existing custom stores must work unchanged when the feature is disabled and
   fail construction clearly if it is enabled without required capabilities.
4. Decide how provider metadata/hint material survives local deletion, and define
   crash/failure ordering for revocation, ticket persistence, discovery, and HTTP
   response loss. An upstream/ticket failure must not restore a revoked session;
   an uncertain deletion must not be reported as a confirmed local logout.
5. Preserve proof/Origin checks, current live/alias provider authority, cookie
   name/path/clear behavior, and hook cardinality. Aliases currently permit only
   revocation, not access to ID tokens or provider redirects; explicitly retain
   that limitation. Define unknown/expired/consumed ticket and provider-outage
   behavior without accepting caller-supplied redirect URLs or API tokens in GET.
6. Record the browser flow for both transports, expired local access tokens,
   nonce retry, repeated clicks, concurrent refresh, and stale client operations.
   Reuse the client's existing request and lifecycle machinery.

Acceptance criteria:

- Append a concrete implement/defer/no-action recommendation, selected protocol,
  storage capability, failure-ordering table, and compatibility matrix.
- All public response/redirect fields and retained server-side data are accounted
  for; no browser-readable JSON contains an upstream token or token-bearing URL.
- Each unresolved question has an owner and blocks only its dependent work;
  revise OVAPP-05/06/07 requirements to the selected contract before they start.
- The recommendation includes tests for cross-instance single consumption,
  failure after revocation, alias-only logout, and actual top-level navigation.

Verification: V6 evidence/contract review. Runtime probes only if needed to settle
a specific question; record exact commands/results and never infer browser
redirect behavior solely from Node fetch.

Execution notes (OVAPP-04 contract investigation):

- Sole assigned contract-investigation owner, sequential execution; no nested
  agents. Preserve completed OVAPP-01/02/03 work and both existing task files.
  Scope is the decision record and dependent requirements; implementation belongs
  to OVAPP-05/06/07. No commits/pushes or root CHANGELOG edits.
- Read repository instructions, task conventions, the task-as-you-go workflow,
  prior completion evidence and the sibling MongoDB plan. OVMONGO-01/02 remain
  pending; OVMONGO-02 still gates OVAPP-05's MongoDB edits.
- Reviewing current core/provider/client source and regressions, plus browser
  redirect specifications, before selecting the complete protocol and failure
  contract. Runtime probes are reserved for material uncertainty.

#### OVAPP-04 decision: implement the following contract

This is the selected implementation specification for OVAPP-05/06/07, not a set
of alternatives awaiting approval. Scope remains logout continuation; tickets
cannot authenticate API requests, refresh credentials, create sessions, or grant
general navigation/download access. There are no unresolved design blockers.
OVMONGO-02 remains an execution prerequisite for OVAPP-05.

##### Decision matrix

| Boundary           | Adopted contract                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Opt-in             | `logoutNavigation` options plus configured DPoP and both optional ticket-store methods; validate at construction.                                |
| Protocol           | JSON POST and headerless ticket GET at `<basePath>/logout/navigation`; existing `/logout` local/302 behavior remains supported.                  |
| Wire               | `OidcVaultLogoutNavigationInput { sessionId? }`; `OidcVaultLogoutNavigationResult { loggedOut: true, navigationUrl }`.                           |
| Commit             | Authenticate original authority -> await lineage deletion -> clear cookie -> discovery/build -> ticket persistence -> live notification -> JSON. |
| Retained authority | Only a bounded final upstream URL in the server ticket record; aliases/absent targets yield no grant or hint.                                    |
| Fallback           | Required validated static `fallbackRedirectUri`; return the bare backend navigation path when no ticket can be issued.                           |
| Ticket             | 256-bit `lnt_` secret, SHA-256 hash lookup in a derived origin/mount/provider/return-policy namespace; atomic consume-if-live.                   |
| Bounds             | Default 60-second TTL, configurable 1..120 seconds; 16384-byte destination; default 10000 physical-store entries; bounded 64-entry cleanup.      |
| Browser            | `logoutAndNavigate(): Promise<void>` uses the existing adapter inside lifecycle authority; coalesced clicks, one fresh-proof nonce retry.        |
| Compatibility      | Optional base-store extension, no feature-disabled requirement; originally unbound sessions retain ordinary logout.                              |

##### Evidence and rationale

Current references below refer to base `33e434d` plus completed OVAPP-01/02/03
worktree changes. Historical reference line numbers above are retained.

| Evidence inspected                                                                                                                        | Consequence for this decision                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core `src/index.ts:1170-1317`, `createLogoutHandler`; `src/vault-session.ts:84-180,241-269`                                               | Snapshot original live session and credential-free lineage/provider/key authority; verify, recheck context, run live pre-hook, await lineage deletion, then clear the configured cookie. Aliases have no readable session or ID-token authority.                                                                                |
| Core `test/dpop-vault-session.test.ts:1752-2129`                                                                                          | Preserve live/alias original-key and exact known-provider checks, absent-target idempotency, hook mutation isolation/veto, reservation retention, context recheck and selected-cookie authority. An optional proof never enrolls an unbound session.                                                                            |
| Core `test/bov-10-route-prerequisites.test.ts:137-323`; `test/index.test.ts:398-429,1994-2043`; OIDC-14 and BOV-10 histories linked above | Local logout is independent of discovery. Provider failure after deletion cannot undo revocation or suppress the live notification. Upstream hint URLs belong in HTTP redirects, never JSON or new hook metadata.                                                                                                               |
| Core `src/vault-route-proof.ts:31-112`, `src/origins.ts:118-158`, `src/cookies.ts:202-243`                                                | Reuse pinned request-target capture, the vault-wide nonce/replay space and configured cookie parsing/clearing. The strict source parser already used for new browser POSTs can protect initiation in both transports.                                                                                                           |
| Core `src/provider-client.ts:41-44,604-691`; `src/config.ts:60-100`                                                                       | Reuse bounded discovery, exact issuer comparison, cache and deadline policy after deletion. Do not create another provider client or normalize issuer trailing-slash identity.                                                                                                                                                  |
| Core `src/types.ts:486-500`; memory `src/index.ts:448-470`; MongoDB `src/store.ts:406-411,618-657`; Redis `src/index.ts:418-420`          | Deletion resolution is the existing store-operation commit boundary. A rejection can follow partial committed deletion, including alias cleanup. Counts are not a global snapshot or proof against concurrent arrivals. Do not convert an uncertain rejection into local success or invent a cross-provider logout transaction. |
| Memory `src/dpop-replay.ts`; MongoDB `src/dpop-replay.ts`; Redis `src/scripts.ts:164-196`; core `test/store-provider-conformance.ts`      | Reuse established bounded expiry/capacity and provider-native atomicity patterns, with independent ticket records and capacity. Do not reuse exchange codes or replay reservations as navigation grants.                                                                                                                        |
| MongoDB `test/dpop.test.ts:53-125`; Redis `test/dpop-live.test.ts:18-54,125-155` and `test/redis-harness.ts`                              | Existing independent-client, transaction, live-Lua, capacity and disposable-provider fixtures can prove the new storage contract. Their prior results do not yet establish ticket behavior.                                                                                                                                     |
| Client `src/auth-session.ts:332-389,639-665,740-825`; `src/session-lifecycle.ts`; `test/auth-session.unit.test.ts:337-383,596-641`        | Reuse bounded JSON requests, original persistent key, fresh-proof nonce retry, FIFO and cookie lock/metadata. Logout needs no live access JWT or preliminary refresh.                                                                                                                                                           |
| Example `test/browser/lifecycle.browser.ts:28-125,227-301`, `test/browser/harness.ts`; `server/local-idp.ts:46-58`                        | Reuse real document-navigation assertions in Chromium/Firefox. The current local IdP has no end-session endpoint; OVAPP-07 must add that fixture behavior and registered return destinations. Existing login/local-logout tests do not prove upstream logout navigation.                                                        |

All abbreviated `src/` and `test/` paths in this table are relative to the named
package (`packages/express-oidc-vault`, its named store package, or
`packages/oidc-vault-dpop-client`); example paths are relative to
`apps/oidc-vault-dpop-example`.

Browser evidence reviewed on 2026-10-23:

- [Fetch: opaque-redirect filtered response](https://fetch.spec.whatwg.org/#concept-filtered-response-opaque-redirect)
  defines status `0`, empty headers and null body. Its
  [HTTP fetch redirect-mode algorithm](https://fetch.spec.whatwg.org/#http-fetch)
  gives a non-navigation `manual` request that filtered response; exposing a CORS
  `Location` header does not defeat this filtering.
- [MDN: Response.type](https://developer.mozilla.org/en-US/docs/Web/API/Response/type#opaqueredirect)
  documents the same browser-visible behavior. Following a fetch redirect fetches
  a resource; it does not change the top-level document. The client currently
  deliberately uses `redirect: 'error'`, not manual redirect inspection.
- Therefore choose a JSON POST followed by explicit top-level navigation to an
  opaque backend URL. This conclusion uses browser specifications/documentation
  and current callers, not an extrapolation from Node fetch. No runtime probe was
  needed to settle it; actual navigation evidence remains required in OVAPP-07.

##### Public protocol and configuration

1. Add `OidcVaultOptions.logoutNavigation?: OidcVaultLogoutNavigationOptions`:

   ```ts
   interface OidcVaultLogoutNavigationOptions {
     fallbackRedirectUri: string;
     ticketTtlMs?: number; // default 60000; integer 1000..120000 inclusive
     namespace?: string; // default 'default'; static ASCII label, 1..128 bytes
   }
   ```

   Absence disables the feature and registers neither new handler. A present
   value must be a plain options object; `null`/booleans are invalid. Require
   configured `deviceBinding` and its existing six store capabilities, plus both
   ticket methods below. Fail synchronously at middleware construction with a
   message naming `logoutNavigation` and the missing option/method. Snapshot and
   freeze the resolved plain options/destinations; caller mutation cannot change
   expiry, namespace, fallback or response authority. Preserve live service
   references and the existing per-check DPoP override policies/diagnostics.

2. Add `OIDC_VAULT_ROUTE_PATHS['logout-navigation'] = '/logout/navigation'`, used
   for **POST and GET** at `<basePath>/logout/navigation`. This additive path key
   does not require a new hook route or DPoP operation: the logical operation is
   still `logout`. Keep `OidcVaultRouteName` and existing route labels compatible.
   Do not overload the existing `/logout` request's `redirect` boolean.

3. POST is JSON-only. Export pure wire `OidcVaultLogoutNavigationInput` with
   `sessionId?: string`: body mode requires its nonempty handle; cookie mode
   selects only the configured cookie and ignores this body field. Accept an
   object with only that optional field; reject arrays/other body fields with
   `400 OIDC_VAULT_INVALID_REQUEST_BODY`, and unsupported media types with the
   existing `415 OIDC_VAULT_UNSUPPORTED_REQUEST_BODY_TYPE`. Query destinations
   are ignored. Neither `redirect`, `returnTo`, a provider URL nor an access
   token is a supported initiation input.

4. Apply the strict raw Origin/Referer source guard used by POST login/guarded
   exchange to this new POST **in both transports**, before store/proof work.
   Use `trustedOrigins` plus the pinned backend origin, reject absent/null,
   foreign or ambiguous sources, and retain Referer fallback only when Origin is
   absent. Existing `/logout` source rules remain its compatibility contract.
   For a live target/alias, require an original stored DPoP binding even when the
   surrounding policy is optional; unbound targets receive the existing
   `401 OIDC_VAULT_DEVICE_BINDING_REQUIRED` before reservation/hooks/deletion.
   This avoids treating an arbitrary presenter's new key as session authority.
   Optional-unbound applications can still use ordinary `/logout`.

5. Validate known provider fields exactly as today; omissions retain the existing
   legacy behavior and are not backfilled. Authenticate a live lineage with the
   original key, new route's POST target, freshness, nonce and shared replay
   policy; use no Authorization access token or `ath`. Recheck context before
   the live pre-hook/deletion. Missing live target stays idempotent: no proof
   reservation, deletion, hooks, discovery or ticket allocation, but cookie clear
   in cookie mode. An alias can authenticate **revocation only**: no successor
   credential read, ID-token reconstruction, provider discovery or ticket grant.

6. Successful POST always returns exactly this allowlisted `200` wire DTO:

   ```ts
   interface OidcVaultLogoutNavigationResult extends OidcVaultLogoutResult {
     navigationUrl: string;
   }
   ```

   With a successfully persisted upstream continuation it is the absolute pinned
   backend URL `<backendOrigin><basePath>/logout/navigation?ticket=<opaque>`.
   Otherwise it is the **same absolute backend path with no query**, which only
   navigates to the configured fallback. This includes aliases, absent targets,
   absent end-session support and post-revocation provider/ticket failures.
   The bare URL is not a grant and needs no stored fallback-only ticket. There
   is no upstream URL, ID/access/refresh token, handle, subject or provider data
   in this JSON. `loggedOut: true` reports the completed local operation, not
   successful IdP logout. Neither response form is emitted on uncertain deletion.

7. `fallbackRedirectUri` is required static application configuration, independent
   of optional provider-registered `postLogoutRedirectUri`. Normalize once with
   URL parsing: absolute HTTPS (HTTP only for loopback development), no userinfo,
   fragment, raw whitespace/backslash/control characters; maximum 2048 UTF-8
   bytes after serialization. Static query parameters are permitted, with no
   request substitution. Its origin must be the backend origin or, when set, the
   configured `frontendRedirectUri` origin. Reject the continuation path itself
   on the backend origin, irrespective of query, to prevent fallback loops.
   `trustedOrigins` does not grant redirect-destination authority. There is no
   implicit fallback to a login callback that might require an exchange code.
   When configured for the new flow, also validate/snapshot
   `postLogoutRedirectUri` with the same URL syntax/2048-byte rules (without the
   fallback-origin restriction); it remains an operator-selected provider return
   URI, never a request parameter. Legacy `/logout` validation is unchanged when
   the new feature is absent.

8. GET accepts no credential except one canonical `ticket` query value. A missing
   value, malformed/duplicate value, other query parameters, unknown/expired/
   consumed ticket or different effective namespace produces **302 to the fixed
   fallback**, with no session lookup, revocation or lifecycle hook. Malformed
   query inputs do not call the ticket store. Valid input is hashed and atomically
   consumed before any upstream Location is written; validate the returned
   record's identity/window/URL again. Consume errors or malformed returned
   records notify private `onError` and redirect only to fallback. Never restore
   a consumed ticket or retry an ambiguous consume. GET does no discovery: it
   uses the destination already resolved at POST. No API token, handle, DPoP
   header, session/transaction cookie or browser-binding cookie is needed by GET.
   Explicitly handle **HEAD before GET** with 405 (Allow: GET, POST); Express's
   automatic GET-to-HEAD handling must not spend a ticket. Other unsupported
   methods perform no ticket/session work; preserve caller-owned CORS OPTIONS.

9. All new success/error/redirect responses carry `Cache-Control: no-store` and
   feature-scoped `Referrer-Policy: no-referrer`. GET redirects use only Location
   and an empty body (avoid Express's reflected redirect-link body). Do not emit
   credentials in error JSON, new hook metadata or diagnostics. Existing trusted
   live-session hooks still receive their owned session snapshot; their Request
   is also private and must not be blindly logged. A ticket is a short-lived
   bearer continuation, deliberately not bound to a cleared cookie, IP, user
   agent or a new proof on headerless navigation. Possession can spend/burn only
   that continuation, not authenticate/revoke another session. URL/history/proxy
   logging and IdP-visible `id_token_hint` remain inherent navigation exposures;
   hashing the lookup key does not encrypt the retained server-side destination.

##### Ticket material, optional capability, and provider bounds

- Generate `lnt_` followed by **32 cryptographically random bytes**, unpadded
  canonical base64url (43 characters; 47 characters including prefix). Reject
  other shapes, including noncanonical final padding bits. The random secret is
  present only in the returned backend URL and the request to GET. No raw ticket
  is persisted, logged, placed in diagnostics/hooks, or reused by core.
- Define `H(x) = base64url(SHA-256(UTF8(x)))` and serialize scope components with
  `JSON.stringify`, not delimiter concatenation. Effective store `namespace` is
  computed as follows:

  ```ts
  const namespace =
    'logout-navigation:v1:' +
    H(
      JSON.stringify([
        'oidc-vault-logout-navigation',
        1,
        backendOrigin,
        normalizedBasePath,
        exactConfiguredIssuer,
        configuredClientId,
        namespaceLabel,
        normalizedFallbackUri,
        normalizedPostLogoutUriOrNull,
      ]),
    );
  ```

  `namespaceLabel` defaults to `default`, consists of ASCII bytes 0x21..0x7e,
  and is static deployment configuration, never request data or a credential.
  `ticketHash = H(theEntirePrefixedTicket)`. The storage identity is the pair
  `(namespace, ticketHash)`; all hashes are canonical 43-character SHA-256 values.
  The URL carries no namespace/identity fields; GET derives its own pinned scope.
  Instances sharing a mount need identical scope configuration and clocks.
  Different issuer/client, origin, mount, namespace or return policy cannot spend
  each other's grants. This isolates tickets, not legacy session namespaces.

- The only durable credential-bearing value surviving session deletion is the
  **already-built upstream end-session URL**, containing the captured original
  ID-token hint and optional configured post-logout URI. Build it with the
  existing metadata resolver/URL builder after deletion. Require nonempty
  original ID-token authority, HTTP(S), no userinfo/fragment or raw controls,
  whitespace/backslashes, and at most **16384 serialized UTF-8 bytes**. Preserve
  existing provider HTTP(S) support; do not impose a new origin match to issuer
  because discovered endpoints can use another host. Provider metadata is
  server-trusted, never a request-supplied destination. Missing ID token/endpoint
  selects bare fallback; invalid/oversized destination selects fallback plus
  `onError`. No refresh/access token, full session/profile/metadata, session ID,
  subject or separate ID token is copied into the ticket record. GET cannot
  reconstruct a session, and new login/backchannel/session deletion does not
  cascade-delete these already-authorized short-lived records.
- Public root store types selected for OVAPP-05:

  ```ts
  interface OidcVaultLogoutNavigationTicket {
    namespace: string;
    ticketHash: string;
    upstreamLogoutUrl: string;
    createdAt: number;
    expiresAt: number;
  }
  type CreateLogoutNavigationTicketInput = OidcVaultLogoutNavigationTicket;
  interface ConsumeLogoutNavigationTicketInput {
    namespace: string;
    ticketHash: string;
  }
  interface OidcVaultLogoutNavigationStoreProvider extends OidcVaultStoreProvider {
    createLogoutNavigationTicket(input: CreateLogoutNavigationTicketInput): Promise<void>;
    consumeLogoutNavigationTicket(
      input: ConsumeLogoutNavigationTicketInput,
    ): Promise<OidcVaultLogoutNavigationTicket | null>;
  }
  ```

  Declare both methods optional on base `OidcVaultStoreProvider`, required on the
  new capability and on built-in return types. Keep the base/custom-store
  contract usable without navigation. This capability does not replace the
  separate existing device-binding capability.

- Providers capture only the five allowlisted scalar fields before yielding and
  return detached plain records. Validate the effective namespace/hash formats,
  URL bound/syntax and safe Date-range integer epochs. Invalid/expired create
  input throws TypeError without allocation; require
  `1000 <= expiresAt - createdAt <= 120000`, `expiresAt > storeNow`, and remaining
  lifetime at most 120000 ms. Invalid consume input returns null without
  allocation. A stored malformed/expired selected record cannot produce a grant;
  atomically retire that record if encountered and return null. Provider/clock/
  accounting failures throw, never appear as successful consume. The existing
  Date-range clock policy applies; Redis server TIME owns expiry, not its injected
  application clock. Core/provider clocks must be synchronized; no new skew
  allowance or TTL extension is introduced.
- Creation is **create-only**, not exchange-code-style upsert. A live collision
  throws the existing `OidcVaultStoreConflictError` before capacity rejection and
  never overwrites/extends either payload or expiry. Core may generate at most
  **three** independent random tickets on these definite collisions. Do not retry
  provider/timeout/unknown errors, which can follow a committed create. Retired
  identities need no permanent tombstones; callers must never intentionally
  reuse ticket secrets/hashes. All collision attempts share the sampled
  createdAt/deadline; retries do not extend TTL. Consumption checks the exact pair,
  record validity and `expiresAt > now`, removes the grant and returns its owned
  snapshot once. No read-then-unconditional-delete or process-local lock fallback
  is permitted for shared stores.
- Add `logoutNavigationMaxEntries?: number` to each built-in store's options:
  positive safe integer, default **10000**, independent of DPoP capacity. It is
  shared across effective ticket namespaces in one physical memory-store object,
  MongoDB ticket/capacity collection pair, or Redis keyPrefix. This is not
  availability isolation between tenants; use separate physical namespaces for
  that. Never evict live grants. Exhaustion throws root-exported
  `OidcVaultLogoutNavigationCapacityError`; confirmed local logout still falls
  back as below. At most 64 unrelated expired entries are reclaimed per ticket
  create/consume, plus the directly selected expired record. Unreclaimed expiry
  accounting can conservatively consume capacity; successful consume frees its
  own capacity immediately. Ticket cleanup must not affect session/alias/replay
  records. Unknown GETs allocate no per-request state.

| Provider | Selected storage/cleanup boundary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Memory   | Dedicated ticket map plus indexed expiry heap, one node per retained record; no asynchronous gap during check/remove. Remove its heap node on consume (no tombstone growth). Bounded opportunistic cleanup, no new timers. Expired payloads can remain while idle until later ticket work/store disposal, but are unusable and count toward the fixed cap. Only the same memory-store object shares state; separate objects/processes are not distributed storage.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| MongoDB  | Add `logoutNavigationTicketsCollectionName` (default `oidc_vault_logout_navigation_tickets`) and `logoutNavigationCapacityCollectionName` (default `oidc_vault_logout_navigation_capacity`), distinct from each other and all existing collection roles. Payload `_id` is the composite namespace/hash, with Date expiry + TTL index. Reuse the established serialization-row/non-TTL expiry-ledger pattern: record only hashes/expiry in accounting, validate paired collection/maxEntries at ready, reject TTL on the ledger, and serialize create/consume/count changes in transactions. TTL removal cannot corrupt capacity accounting or authorize an expired consume. Both paths remove selected/at most 64 expired ledger/payload entries and update counts coherently. Apply OVMONGO-02's primary policy to collections, readiness reads and every transaction; retain current concerns/topology/client ownership. TTL is eventual reclamation, not the liveness check. |
| Redis    | Add payload keys `<keyPrefix>:logout-navigation-ticket:<namespace>:<ticketHash>` with PXAT, expiry/accounting ZSET `<keyPrefix>:logout-navigation-expiries`, and fixed configuration key `<keyPrefix>:logout-navigation-capacity`. Native Lua uses server TIME, checks key types/configuration before writes, performs bounded cleanup, checks duplicates before ZCARD capacity, and atomically writes/removes payload + index membership. Persist/validate the shared maxEntries on first create; mismatch throws on ticket operations without inventing readiness/client ownership. Unknown consumes do not create configuration. Expiry ZSET may expire at its latest retained deadline; payloads expire independently; configuration is constant-size. No credential-bearing URL is an index member. Preserve the existing standalone/Sentinel-adapter scope and script runner; no Redis Cluster support added.                                                             |

##### Deterministic ordering and failure matrix

For a live handle: strict source/body checks -> capture original session/context
and request authority -> identity/original-bound proof/nonce/replay -> latest
context comparison -> `onBeforeLogout` with owned original data -> **await
`deleteSessionsByLogicalSessionId`** -> configured cookie clear -> resolve/build
upstream URL -> generate/persist ticket -> live `onLogout` notification -> write
the allowlisted result. Sample ticket creation time **after discovery**, so the
configured lifetime is not spent waiting for discovery. Catch provider/ticket
work only after the deletion boundary; run the post-commit live notification
once even when cookie preparation/provider/ticket work fails. Discovery is never
performed on GET, for aliases, absent targets, or ordinary local-only logout.

`onBeforeLogout` and `onLogout` keep logical hook route `logout`; original
provider/key/lineage/ID-token/return authority cannot be replaced through hooks.
The post-hook follows best-effort continuation work, before response writing;
failures are reported through existing private `onError` without rollback.
Alias/no-target/GET paths run neither logout hook. Ticket/provider errors use
`onError` route `logout`, original diagnostic and no new credential metadata;
GET has no session context. Preserve existing proof diagnostics (operation
`logout`) on POST and emit none on GET. No new token-outcome event is needed.
Hooks are per admitted live request, not globally exactly-once: concurrent live
initiations can each notify/mint a distinct ticket, and a crash can lose hook
delivery. Client coalescing handles ordinary double-clicks; no lineage-level
idempotency database/outbox is introduced.

| Boundary / outcome                                                                           | Durable state and hooks                                                                                                                                                                                                                    | Response / retry / crash consequence                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Disabled feature                                                                             | No new handlers or ticket capability checks.                                                                                                                                                                                               | Normal router miss; existing POST `/logout` works as before.                                                                                                                                                                                           |
| Bad source/body/identity/unbound target/proof; nonce challenge or replay failure             | No deletion, cookie clear, ticket or provider work. Keep existing proof reservation policy; a challenge does not reserve. No logout hooks.                                                                                                 | Existing sanitized 400/401/403/415/503/challenge contract. One fresh-proof nonce retry is allowed, never reuse a reserved JTI. Per-check overrides retain their explicitly configured semantics.                                                       |
| No live target initially or at context recheck                                               | No deletion/hooks/reservation at the initial absent-target branch; a reservation already admitted before a later absence stays spent. Cookie clear is idempotent.                                                                          | `200 { loggedOut: true, navigationUrl: <bare-backend-path> }`; no grant/discovery. Does not claim to revoke unrelated or expired-alias-inaccessible sessions.                                                                                          |
| Live pre-hook veto                                                                           | Original session/cookie retained, proof reservation retained, no post-hook/ticket/discovery.                                                                                                                                               | Existing sanitized hook failure; explicit retry needs a new proof.                                                                                                                                                                                     |
| Deletion rejects, including after partial deletion or alias cleanup                          | State is uncertain; no ticket creation, provider work, cookie-clear success signal or `onLogout`. Never recreate or roll back the original session.                                                                                        | Existing sanitized error (normally 500), **no loggedOut DTO/navigation URL**. An explicit later POST uses fresh proof and resolves current authority; do not infer completion from partial effects or swallow the rejection.                           |
| Deletion resolves, including zero deletions after a legitimate race                          | Existing store operation has completed; clear cookie. This is its documented commit boundary, not a global snapshot against arbitrary concurrent arrivals. A captured live request still gets one post-hook; alias-only gets neither hook. | Continue only from original authenticated authority; stable core lineage/rotation conflict contracts still apply. No additional read can turn a thrown deletion into confirmed success.                                                                |
| Cookie/HTTP preparation fails after deletion                                                 | Revocation remains; run the live post-hook once. Do not proceed to ticket creation after failed cookie preparation or restore credentials.                                                                                                 | Report the private error and the existing sanitized error when a response can still be written; otherwise propagate the HTTP failure. No successful cookie delivery or navigation is promised.                                                         |
| Alias-only committed deletion                                                                | Revoke original lineage, clear cookie; no live credentials, hooks, provider calls or grant.                                                                                                                                                | Successful bare-backend URL, GET goes only to fallback. Never fetch the successor's ID token.                                                                                                                                                          |
| Missing original ID token or end-session endpoint                                            | Local revocation/cookie clear remain; live post-hook delivered. No ticket allocated.                                                                                                                                                       | Successful bare-backend URL; ordinary absence is not a provider error.                                                                                                                                                                                 |
| Discovery/build/URL-bound failure after revocation                                           | Revocation remains; report error privately when there is a failure; live post-hook delivered.                                                                                                                                              | Successful bare-backend URL. No provider URL/hint in JSON and no automatic discovery retry on GET.                                                                                                                                                     |
| Ticket RNG/clock/validation/capacity/storage failure, or three definite collisions exhausted | Revocation remains; live post-hook and private onError. An ambiguous create may already have persisted a grant.                                                                                                                            | Successful bare-backend URL. Discard the unacknowledged secret; no unknown-error retry, lookup/recovery endpoint or session restoration. Undelivered grant expires.                                                                                    |
| Ticket create acknowledged; post-hook/onError observer fails                                 | Grant and revocation remain; best-effort post-hook failure reporting as today.                                                                                                                                                             | Successful ticket-bearing backend URL; observers cannot replace the captured target/DTO.                                                                                                                                                               |
| Process dies after deletion but before ticket create/notification/result                     | Revocation may have committed; volatile original hint snapshot is lost.                                                                                                                                                                    | No success delivery promised; retry cannot reconstruct a ticket from an alias/absent session. Local retry may only navigate to fallback.                                                                                                               |
| Ticket create/POST response is lost, or client times out/cancels                             | Revocation and possibly ticket/cookie commit remain. Client cannot know which server steps completed.                                                                                                                                      | No automatic mutation retry. Client reports nonterminal transport uncertainty and does not navigate. A ticket never delivered becomes unusable at expiry; explicit retry cannot recover its URL.                                                       |
| GET unknown/expired/spent/foreign/malformed                                                  | No session mutation/hooks. Invalid input never consumes another namespace's record.                                                                                                                                                        | Empty-body 302 to fixed fallback; repeated navigation is fallback-idempotent. HEAD never consumes.                                                                                                                                                     |
| GET consume throws or returns invalid authority                                              | It may have consumed before error/response loss; report private onError, no grant retry/restore.                                                                                                                                           | Empty-body 302 to fixed fallback. No upstream redirect on uncertain consume.                                                                                                                                                                           |
| GET consume acknowledged                                                                     | Grant is removed before Location; no provider/session/hook work.                                                                                                                                                                           | Empty-body 302 to captured upstream URL. Simultaneous consumers: one upstream redirect, all others fallback. Crash/response loss after consume burns the continuation; retry falls back.                                                               |
| IdP unavailable after the upstream Location is sent, rejects the hint, or never returns      | Library-local revocation is already complete.                                                                                                                                                                                              | No guarantee of upstream termination/delivery or automatic recovery from a browser/IdP network error. The configured fallback covers missing/failed discovery and ticket continuation, not arbitrary failures of an external navigation after handoff. |

##### Browser API and lifecycle decision

- Add **`OidcVaultDpopSession.logoutAndNavigate(): Promise<void>`**. It invokes the
  existing synchronous `navigate(url)` adapter (default `location.assign`) only
  after confirmed local logout, state cleanup and URL validation. Extend that
  option's documentation to login **and** logout navigation. Keep `logout()` local
  and unchanged. No public return-URL/prepare method is added: this keeps the
  final navigation inside lifecycle authority rather than encouraging a caller
  to navigate a saved stale result later. Generic consumers can use the exported
  pure input/result DTOs and protocol; custom navigation uses the adapter.
- POST to the new route through `post`/`requestVaultJson` and the existing
  per-attempt byte/deadline/abort machinery. Body uses the current FIFO-published
  handle; cookie uses `credentials: 'include'` and its Web Lock. Body uses
  `credentials: 'omit'`. Reuse the original existing persistent key, never create
  a missing key or enroll a replacement. Send no fingerprint, Authorization or
  `ath`, and do not refresh/check the local access JWT's expiry first. An absent
  in-memory JWT after reload is supported by the existing handle/cookie metadata.
  For this new method, require an active matching cookie version under the lock
  as refresh does; known inactive metadata yields `LOGIN_REQUIRED` without POST.
- Reuse the **current** vault/key nonce cache, including any learned success
  nonce. A recognized 400/401 nonce challenge with a valid nonce gets one new
  proof/JTI; a repeated challenge is `DPOP_NONCE_RETRY_EXHAUSTED`. GET has no
  nonce/proof retry. Clear the cache only during committed local cleanup or the
  existing explicit invalidations, not before the initiation POST.
- Require `loggedOut === true` and validate `navigationUrl` against the exact
  configured backend origin and canonical `<basePath>/logout/navigation` path.
  Accept only the exact bare absolute URL or that URL followed by one literal
  `?ticket=` and canonical `lnt_` value. Reject credentials, fragments, extra or
  duplicate query keys, alternate paths/origins, relative/protocol-relative URLs,
  encoding/normalization tricks and raw unsafe characters. Do not trust a response
  URL merely because it parses as HTTP(S). Server emits canonical URLs; client
  validates that exact form before calling the adapter.
- A successful `loggedOut: true` clears token, handle, pending login, peer-token
  adoption and nonce state, then invalidates cookie metadata/notifies peers under
  the existing lock. If its URL is missing/invalid, finish this confirmed local
  cleanup but reject with fixed nonterminal
  `INVALID_LOGOUT_NAVIGATION_RESPONSE` and never navigate. If no true loggedOut
  result was received, including malformed/oversized JSON or transport failure,
  commit is unknown: retain the existing nonterminal-failure policy and do not
  navigate. Existing terminal key/session errors retain their cleanup policy.
  Cleanup failure or adapter throw rejects without navigation retry/credential
  restoration; memory clear occurs first as in current logout.
- Concurrent `logoutAndNavigate()` calls share one pending Promise per instance
  through FIFO/HTTP/nonce retry/cleanup/adapter invocation. At most one initiation
  batch and one adapter call are performed for a double-click. Clear that shared
  Promise on settlement; do not cache a completed URL. A later click after logout
  has no local handle/active cookie authority and yields `LOGIN_REQUIRED`, not
  another navigation. Another tab can independently initiate; shared consumption
  still guarantees single use per ticket, not one grant per lineage.
- Preserve FIFO refresh ordering: an earlier refresh publishes its rotation
  before logout reads the handle/cookie. A later refresh cannot resurrect revoked
  credentials; it runs after cleanup and requires login. Navigation start breaks
  refresh coalescing as ordinary logout does. A refresh does not split the
  pending navigation double-click batch.
- Capture entry-time lifecycle authority **and a navigation-intent generation**.
  A later login, exchange, explicit local logout, clear, resetKey or dispose
  immediately withdraws the old operation's permission to navigate and detaches
  its coalescing reference. Login intent must suppress old navigation even while
  that login is queued. Clear/resetKey/dispose keep their existing immediate
  invalidation/HTTP abort semantics. Check authority after every await and before
  state publication/adapter use; check navigation intent at dequeue and again at
  the final adapter step inside the FIFO/cookie lock. An already-started POST can
  still finish revocation and old-state cleanup before a queued login, but a
  withdrawn intent rejects with `DPOP_OPERATION_SUPERSEDED` and cannot navigate.
  Stale/disposed completions cannot clear a newer login or cookie generation.
  Already handed-off navigation/server commits cannot be undone by later local
  cancellation; cross-frontend-origin coordination remains outside the client.
- Bundle/re-export `OidcVaultLogoutNavigationInput` and
  `OidcVaultLogoutNavigationResult` through core root + `/wire`, and client
  `src/wire.ts` + root using the existing erased type/bundled declaration path.
  No server runtime imports, Express augmentation or Node ambient requirement
  enters browser declarations.

##### Compatibility and implementation handoff

| Existing consumer / case                                 | Selected compatibility behavior                                                                                                                                                                                                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Old custom store, feature absent                         | Both new base methods are optional; no new construction checks/calls. Existing unbound and configured-capability behavior stays supported.                                                                                                                          |
| Navigation enabled without DPoP or either ticket method  | Construction fails clearly before traffic. No silent memory store, bearer downgrade or missing-capability fallback.                                                                                                                                                 |
| Existing POST `/logout` local / `redirect: true`         | Same local JSON / best-effort provider 302, existing origin/binding/hook/alias behavior. No new ticket work or discovery on local-only logout.                                                                                                                      |
| Bound session with optional or required policy           | New flow works with the original persistent key. Existing configured check overrides remain explicit and diagnostic; no new hidden bypass policy.                                                                                                                   |
| Optional unbound live session/alias                      | Ordinary logout remains available; new proof-authorized flow rejects with DEVICE_BINDING_REQUIRED, without enrolling a key or revoking.                                                                                                                             |
| Live handle / unexpired alias / absent or expired target | Live can yield upstream ticket after revocation; alias revokes only and gets bare fallback URL; absent target is idempotent fallback with no authenticated grant.                                                                                                   |
| Legacy provider omissions / known mismatch               | Keep known-field exact matching/omission compatibility; ticket namespace always contains configured issuer/client. A known foreign identity cannot revoke or mint. Separate session namespaces are still needed for complete legacy isolation.                      |
| Cookie configuration and transport                       | Same configured name/path/domain/SameSite/Secure clear; body fields never replace selected cookie authority. GET needs no cookie and cannot clear a later session cookie.                                                                                           |
| Expired/missing local access JWT / expired vault lineage | Access JWT is irrelevant; existing stored handle/key or cookie metadata suffices. Expired lineage follows no-target behavior; no claim of stateless JWT revocation is added.                                                                                        |
| Existing login/refresh/backchannel/hooks/telemetry       | Preserve contracts. New GET has no logout hooks, proof diagnostics or token-outcome events. No global exactly-once hook promise.                                                                                                                                    |
| Multiple instances / policy changes                      | Shared providers atomically consume; memory shares only one object. Scope changes invalidate old tickets into fallback. Capacity is shared physically; expiry depends on synchronized clocks/provider time.                                                         |
| Browser deployment                                       | Same-origin and configured CORS body/cookie POSTs use the existing DPoP header/nonce exposure and cookie credentials policy; navigation does not need fetch redirect/CORS access to IdP. Existing secure-context/IndexedDB/Web Locks/browser support limits remain. |

OVAPP-05 owns capability types, bounded provider persistence and conformance;
OVAPP-06 owns option validation, shared revocation orchestration and server DTOs;
OVAPP-07 owns the client method, pure DTO re-exports, example and actual browser
navigation. The finalized requirements below are mandatory parts of this
decision. Test obligations include cross-client single consumption, collision/
capacity/cleanup races, thrown/ambiguous deletion and ticket persistence,
alias-only and no-target paths, stale-operation suppression, and real top-level
IdP/fallback navigation for both transports. No production implementation or
runtime ticket/browser verification is claimed by OVAPP-04.

Completion evidence (OVAPP-04 investigation, 2026-10-23):

- Recommendation: **implement** the selected contract. All investigation questions
  have concrete decisions, including exact public APIs, strict opt-in/original-key
  authority, fallback validation, retained URL material, hashed ticket identity,
  bounded TTL/capacity/cleanup, provider ownership/atomicity, deterministic commit
  and crash/response-loss outcomes, client adapter/intent/nonce/coalescing behavior,
  and compatibility. Decision, failure and compatibility matrices are above.
- Changed only these documentation paths in this execution:
  - `docs/tasks/20261022-200950-express-oidc-vault-app-integration.md`: decision,
    evidence, finalized OVAPP-05/06/07 requirements/acceptance, this completion.
  - `docs/tasks/20261022-200950-express-oidc-vault-mongodb-primary-read-policy.md`:
    OVMONGO-02's future-operation handoff names both ticket collections and the
    readiness/create/consume/accounting boundaries needing its read policy.
- Base revision `33e434d`; existing sequential implementation worktree preserved.
  `git status --short` was inspected before/after work; both task files were
  already untracked. No production edits, nested agents, commits/pushes or root
  CHANGELOG edits. OVAPP-01/02/03 completion records and all later task statuses
  are preserved; only OVAPP-04 advances to completed here.
- Environment checks, working directory `<repo-root>`:

  ```sh
  git rev-parse --short HEAD
  node --version && pnpm --version
  ```

  Results: `33e434d`, Node `v26.10.0`, pnpm `11.18.0`. No runtime probe or test
  was needed/run: inspected source/regressions and fetched normative browser
  redirect evidence resolved the material contract questions. Provider ticket
  races and real browser navigation remain implementation acceptance checks,
  rather than results inferred from prior core tests or Node fetch.

- V6 formatting/whitespace, working directory `<repo-root>`:

  ```sh
  pnpm exec prettier --check docs/tasks/20261022-200950-express-oidc-vault-app-integration.md docs/tasks/20261022-200950-express-oidc-vault-mongodb-primary-read-policy.md
  git diff --check
  git diff --no-index --check -- /dev/null docs/tasks/20261022-200950-express-oidc-vault-app-integration.md
  git diff --no-index --check -- /dev/null docs/tasks/20261022-200950-express-oidc-vault-mongodb-primary-read-policy.md
  ```

  Passed. Initial formatter checks found new table padding/list-spacing issues;
  formatter output was applied with apply_patch and both files passed afterward.
  The no-index checks explicitly include the preexisting untracked task files,
  which ordinary `git diff --check` does not cover.

- V6 reference/content review passed: inspected evidence paths/symbols and current
  tests match the selected preservation rules; local history/dependency files
  exist; new decision anchors and cross-document handoff links resolve; task
  dependencies remain acyclic and OVMONGO-02 still precedes OVAPP-05. Reviewed all
  public JSON/redirect/retained-data fields and each failure/compatibility row
  against the finalized dependent requirements. Task-scoped searches found no
  machine-local absolute paths or full AI session identifiers in either file.
- No unresolved OVAPP-04 decision or required check remains. OVMONGO-01/02 are
  still pending execution prerequisites for storage implementation; they do not
  block completion of this independent investigation. No live-provider/browser,
  full-workspace or independent-review result is claimed; those lanes stay with
  their assigned implementation/final-integration owners.

### Task OVAPP-05: Implement shared expiring logout-ticket storage

Status: completed

Kind: improvement

Priority: P2 - supplies the cross-instance single-use capability required by navigation logout.

Dependencies: OVAPP-03 (shared exports/types sequencing), OVAPP-04, and
[OVMONGO-02](20261022-200950-express-oidc-vault-mongodb-primary-read-policy.md#task-ovmongo-02-encapsulate-the-primary-read-policy)
(MongoDB shared-file sequencing).

Primary ownership:

- Core ticket capability/record types and `test/store-provider-conformance.ts`.
- Ticket persistence in the memory, MongoDB, and Redis store packages.
- Provider-specific live tests, collection/key documentation, and packed consumers.

Finding:

Existing provider contracts have authorization transactions, exchange codes,
sessions, revocation context, and replay admission, but no dedicated continuation
ticket lifecycle. Reusing exchange codes would mix credential and logout purposes.

References:

- `packages/express-oidc-vault/src/types.ts:385-510` (store capability interfaces).
- `packages/express-oidc-vault-mongodb-store/src/options.ts` (collections and readiness).
- `packages/express-oidc-vault-mongodb-store/src/store.ts` (atomic reads/consumes and transactions).
- `packages/express-oidc-vault-redis-store/test/redis-harness.ts` (real-provider harness).
- OVAPP-04's completed protocol and capability decision.

Requirements:

1. Implement the normative [OVAPP-04 decision](#ovapp-04-decision-implement-the-following-contract):
   root `OidcVaultLogoutNavigationTicket`, `CreateLogoutNavigationTicketInput`,
   `ConsumeLogoutNavigationTicketInput`, and
   `OidcVaultLogoutNavigationStoreProvider`; optional base
   `createLogoutNavigationTicket`/`consumeLogoutNavigationTicket`, required on the
   capability and built-in return types. Store only the five allowlisted scalar
   fields; no raw ticket, session/profile, or separate upstream tokens.
2. Implement create-only collision semantics and atomic exact-namespace/hash,
   valid-record, expiry-aware consumption. Capture inputs before yielding, return
   owned plain records, and preserve a live collision without changing expiry.
   Invalid create throws TypeError; invalid consume returns null; backend/clock/
   accounting failures throw. Selected malformed/expired stored data cannot
   authorize a redirect. No session-deletion cascade, code/replay reuse, generic
   grant abstraction, read/delete race or shared-store process-local lock.
3. Enforce the selected canonical namespace/hash formats, safe Date-range integer
   timestamps, 1000..120000-ms original lifetime, at most 120000-ms remaining
   lifetime, strict expiry boundary, and 16384-byte URL/syntax bound. Add
   `logoutNavigationMaxEntries` default 10000 and root
   `OidcVaultLogoutNavigationCapacityError`. Capacity is physical-store-wide and
   independent of replay; check live collision before capacity, never evict live
   tickets, free consumed capacity immediately and clean at most 64 unrelated
   expired records per operation. No unknown-consume allocation or credential logs.
4. Follow OVAPP-04's per-provider storage table: memory map/indexed heap; MongoDB
   payload TTL plus non-TTL serialization/expiry ledger in the two named, mutually
   distinct collections; Redis PXAT payloads plus the named bounded ZSET/config
   keys, existing script runner and server TIME. Account for background TTL and
   idle retention truthfully. Validate shared limits/pairing; corrupted accounting
   or mismatched configuration must not manufacture a successful consume.
5. Apply OVMONGO-02's primary policy to both new MongoDB collections, readiness
   reads, and create/consume/cleanup transactions, retaining current concerns and
   transaction-only topology. Keep caller-owned client shutdown, Redis topology
   support, and existing replay/session/alias ownership contracts.
6. Extend a dedicated optional-capability conformance suite and existing real
   independent-client fixtures (MongoDB replica set; both Redis harness images).
   Cover create/consume/capacity/cleanup races, mutation during async waits,
   logical expiry with physical TTL lag/removal, and failure atomicity. Base
   custom-store conformance must not start requiring the optional capability.
   Document new options/collections/keys and retention in shipped/website docs;
   installed consumers must see the stronger built-in return types. Core route
   opt-in/construction checks remain OVAPP-06 ownership.

Acceptance criteria:

- Independent instances sharing MongoDB/Redis have exactly one successful
  consumer for a live ticket; the memory equivalent shares one store object.
- Expired-at-boundary, unknown, consumed, malformed, and wrong-namespace tickets
  have the defined outcomes, without consuming an honest grant in another scope.
  No ticket ID reuse overwrites or extends a live grant; duplicate create wins
  over capacity rejection, and concurrent admissions cannot exceed the cap.
- Caller/returned-object mutation cannot alter stored authority. Backend failure
  does not manufacture a successful consume or silently select an in-memory path.
- Successful consume removes its own accounting exactly once. Expiry cleanup
  stays bounded with more than 64 expired records, remains usable with MongoDB
  TTL lag or early physical expiry, and cannot grow memory heap/index tombstones.
  Mismatched clients/collections/limits and Redis wrong-type data fail closed.
- Existing store conformance, readiness, rotation, alias, and replay cases pass;
  provider schemas/keys, options, and capability types are documented.

Verification: V1 conformance plus real MongoDB/Redis ticket races; core and all
three providers V2 and V4. Mock-only persistence tests do not satisfy this task.

Execution notes (OVAPP-05 implementation):

- Sole assigned implementation owner, sequential execution; OVAPP-03/04 and
  OVMONGO-02 are completed. Read the adopted contract and primary-policy handoff
  thoroughly; preserve all prior work and the unrelated skill-file deletion.
  No nested agents, commits/pushes or CHANGELOG edits. Builds/tests run serially.
- Reconfirmed Node `v26.10.0`, pnpm `11.18.0`, npm `11.19.1`; Docker client/server
  `29.9.2` are available. Use ignored `<repo-root>/_tmp-ovapp05` for test work.
- Implement the adopted dedicated five-field capability with separate physical
  capacity, create-only collisions, atomic retirement, indexed memory expiry,
  transactional MongoDB TTL/non-TTL accounting and server-time Redis Lua through
  the existing runner. Route/browser integration stays with OVAPP-06/07.
- Focused development results: memory 47 passed, then expanded shared URL checks;
  MongoDB initial 52 passed / six invalid test-database-name setup failures,
  corrected/expanded 61 passed on two real members; Redis initial 108 passed /
  four expiry-fixture/bounded-ledger failures, corrected 112 passed on both images.
  No live-service skips. Redis no longer resets a remaining overdue ZSET to a
  past deadline (which could synchronously delete more than 64 accounting rows);
  it retains that bounded ledger for later cleanup. Physical payload expiry can
  occur just after the exact boundary; logical consume always checks `> now`.
- First required integration batch: core 39 files / 2233 passed; memory four
  files / 179 passed. MongoDB eight files: 244 passed / two custom-name fixture
  failures because the prior seven-role assertion omitted the two new roles.
  Extend those caller-preservation cases to all nine custom names and actual
  ticket transactions, retaining the concern assertions, then rerun MongoDB.

Completion evidence (OVAPP-05, 2026-10-23):

- Delivered the adopted root record/input/capability types and
  `OidcVaultLogoutNavigationCapacityError`. Both methods remain optional on the
  base store; built-in inferred returns require both, independently of the six
  device-binding methods. Existing feature-disabled custom stores still compile
  and run. No server route/browser APIs are implemented by this task.
- All providers capture exactly the five scalar fields before yielding, enforce
  canonical scope/hash formats, Date-range integer epochs/clock, original
  1000..120000-ms and remaining >0/<=120000-ms windows, strict expiry and bounded
  absolute HTTP(S) URLs. They implement create-only duplicate-before-capacity,
  atomic exact-pair consume, detached return values, selected malformed/expired
  retirement, and separate physical-store capacity (default 10000). Invalid
  create throws TypeError; invalid/unknown/spent/unusable consume returns null;
  backend/clock/accounting failures throw. No live eviction, request-key allocation
  on unknown consumes, session-deletion cascade or shared-store process lock.
- Memory uses its own map/removable indexed heap, one node per retained record,
  including immediate arbitrary-node removal on consume. MongoDB uses payload TTL
  plus a non-TTL ledger/capacity row, bidirectional pairing configuration, and
  snapshot transactions with explicit primary on both new primary handles.
  Redis uses native server TIME, PXAT payloads and bounded ZSET/config state via
  the existing script runner, with touched-type/config validation before writes.
  Selected retirement plus at most 64 unrelated expiry removals is covered under
  independent-client cleanup contention as well as ordinary traffic.
- Grounded implementation details: MongoDB adds one fixed pairing row in the
  payload collection to reject reverse-pair mismatches, plus a serialized ledger
  count consistency check to reject positive-but-wrong counters (not only
  underflow). That count is proportional to the bounded retained ledger and is
  documented; replay accounting is unchanged. The Mongo provider interface
  explicitly strengthens its two inherited optional ticket methods: TypeScript
  rejects multiple-interface inheritance when optional/required members differ.
  Initial declaration builds exposed that mismatch; corrected builds pass.
  Redis retains an all-overdue ledger after consuming its last live member when
  expiring it immediately would exceed cleanup bounds. This does not extend any
  payload/window; idle retention and PERSIST ACL needs are documented.
- Changed core paths: `packages/express-oidc-vault/src/types.ts`,
  `test/store-provider-conformance.ts`, `test/packed-consumer.test.ts`, and
  `test-packed-consumer/consumer/{consumer-types.ts,consumer-types.cts,consumer.mjs,consumer.cjs,store-contract.mjs}`
  (the abbreviated paths in this bullet are core-relative).
- Changed memory paths, package-relative: `src/index.ts`,
  `src/logout-ticket-validation.ts` (new), `src/logout-tickets.ts` (new),
  `test/logout-tickets.test.ts` (new), `test/packed-consumer.test.ts`, and
  `test-packed-consumer/consumer/{consumer-types.ts,consumer.mjs,consumer.cjs}`.
- Changed MongoDB paths, package-relative: `src/index.ts`, `src/options.ts`,
  `src/store.ts`, `src/topology.ts`, `src/logout-ticket-validation.ts` (new),
  `src/logout-tickets.ts` (new), `test/logout-tickets.test.ts` (new),
  `test/read-preference.test.ts`, `test/packed-consumer.test.ts`, and
  `test-packed-consumer/consumer/read-policy.mjs`. Existing primary policy,
  concerns/client ownership, rotation, identity, alias and replay work is preserved.
- Changed Redis paths, package-relative: `src/index.ts`, `src/keys.ts`,
  `src/logout-ticket-validation.ts` (new), `src/logout-tickets.ts` (new),
  `test/logout-tickets.test.ts` (new), `test/packed-consumer.test.ts`, and
  `test-packed-consumer/consumer/{consumer-types.ts,consumer.mjs,consumer.cjs}`.
  The existing runner and standalone/Sentinel-adapter/Cluster boundary are retained.
- Changed documentation: all four affected package `README.md` files, their four
  matching `website/docs/packages/express-oidc-vault*.md` pages, and this task file.
  Installed checks assert byte-identical dedicated-storage sections. Public names,
  options, collection/key schemas, credential-bearing URL retention, default cap,
  cleanup/idle behavior, clock authority and additive migration are documented.
- Environment: base `33e434d`, sequential uncommitted worktree; Linux x64, Node
  `v26.10.0`, pnpm `11.18.0`, npm `11.19.1`, TypeScript `6.0.3`, tsup `8.5.1`,
  Vitest `4.1.11`. Actual Mongo driver `6.21.0`, memory-server `11.2.0`, server
  `8.2.6`, WiredTiger with a real PRIMARY and SECONDARY. Redis images
  `redis:6.2-alpine` / `redis:7.2-alpine` ran server `6.2.24` / `7.2.16`.
  Docker client/server `29.9.2` were available; no tooling installation/fallback
  was needed. Additional packed-consumer Node runtime configured: false.

Verification (all build/test/pack commands serialized; placeholders below must be
replaced with the checkout path):

- Preparation from `<repo-root>` confirmed ignored repository-local temporary
  work. All tests used that TMPDIR. Preparation and initial serialized dependency
  build, working directory repo root:

  ```sh
  mkdir -p "_tmp-ovapp05" && git check-ignore "_tmp-ovapp05"
  TMPDIR='<repo-root>/_tmp-ovapp05' pnpm --filter '@web-ts-toolkit/express-oidc-vault-mongodb-store...' --filter '@web-ts-toolkit/express-oidc-vault-memory-store...' --filter '@web-ts-toolkit/express-oidc-vault-redis-store...' --workspace-concurrency=1 build
  ```

  Passed after the declaration correction above. V2 rebuilt dependencies again
  after the behavioral/validation refinements.

- Final V1, each from its named provider package directory, executed separately:

  ```sh
  TMPDIR='<repo-root>/_tmp-ovapp05' pnpm exec vitest run --config ../../vitest.config.ts test/logout-tickets.test.ts
  TMPDIR='<repo-root>/_tmp-ovapp05' MONGOMS_DOWNLOAD_DIR='<repo-root>/_tmp-ovapp05/binaries' pnpm exec vitest run --config ../../vitest.config.ts test/logout-tickets.test.ts
  TMPDIR='<repo-root>/_tmp-ovapp05' pnpm exec vitest run --config ../../vitest.config.ts test/logout-tickets.test.ts
  ```

  Memory **50 passed**; MongoDB **61 passed**; Redis **120 passed** across both
  required images. **231 focused tests, no skips**. Includes shared-capability
  conformance, independent-client create/consume/capacity/cleanup races, invocation
  mutation/held waits, min/max/deadline and URL/hash boundaries, default capacity,
  heap tombstone bounds, TTL lag/early disappearance, corrupt accounting, wrong
  types, readiness pairing, primary routing, rollback and ambiguous Redis commit
  acknowledgement without transport retries. The optional suite does not require
  the separate replay capability; built-ins exercise the replay-independence case.

- V2 and installed V4, working directory `<repo-root>`, separate serial commands:

  ```sh
  TMPDIR='<repo-root>/_tmp-ovapp05' MONGOMS_DOWNLOAD_DIR='<repo-root>/_tmp-ovapp05/binaries' pnpm --filter @web-ts-toolkit/express-oidc-vault test
  TMPDIR='<repo-root>/_tmp-ovapp05' MONGOMS_DOWNLOAD_DIR='<repo-root>/_tmp-ovapp05/binaries' pnpm --filter @web-ts-toolkit/express-oidc-vault-memory-store test
  TMPDIR='<repo-root>/_tmp-ovapp05' MONGOMS_DOWNLOAD_DIR='<repo-root>/_tmp-ovapp05/binaries' pnpm --filter @web-ts-toolkit/express-oidc-vault-mongodb-store test
  TMPDIR='<repo-root>/_tmp-ovapp05' MONGOMS_DOWNLOAD_DIR='<repo-root>/_tmp-ovapp05/binaries' pnpm --filter @web-ts-toolkit/express-oidc-vault-redis-store test
  ```

  Final results: core **39 files / 2233 passed**, memory **four files / 179
  passed**, MongoDB **eight files / 246 passed**, Redis **12 files / 462 passed**;
  **63 files / 3120 tests, no skips**. The first MongoDB run's two custom-name
  fixture failures are described above; its corrected full rerun passed. These
  suites cover prior identity/alias/rotation/replay behavior. Extended MongoDB
  caller-preservation cases assert all nine custom names, BSON options, original
  concerns and secondary defaults; actual-primary outage also rejects ticket
  create/consume without routing authentication state to the surviving secondary.

- Installed V4 uses existing release-transformed tarballs, actual ESM/CJS runtime
  roots, both Redis images and independent Mongo clients on two members. New
  ticket consumers exercise capture, collision/capacity identity, exact namespace,
  one-winner consumption and capacity release. Strict NodeNext ESM/CJS and Bundler
  compile the stronger built-in returns, root record/input/error types, new
  options, optional legacy base stores and installed README examples. Mongo
  installed command monitoring proves primary routing for new operations;
  unrelated caller reads still select the secondary. Existing core DOM-only/wire
  declaration lanes passed. No new artifact pipeline/deep import is used.
- V4 workspace file checks: `npm pack --dry-run --json` ran separately from each
  affected package directory after builds. Core **10 intended files**; each
  provider **six intended files**, no bundled dependencies. Existing staged
  release checks (core eleven/providers seven, including LICENSE) passed in V2.
- Final targeted ESLint passed for all changed TypeScript/runtime-consumer paths.
  The standalone strict new-fixture check passed from `<repo-root>`:

  ```sh
  pnpm exec tsc --noEmit --strict --skipLibCheck --target es2022 --module esnext --moduleResolution bundler --types node --ignoreDeprecations 6.0 packages/express-oidc-vault-memory-store/test/logout-tickets.test.ts packages/express-oidc-vault-mongodb-store/test/logout-tickets.test.ts packages/express-oidc-vault-redis-store/test/logout-tickets.test.ts
  pnpm exec eslint packages/express-oidc-vault/src/types.ts packages/express-oidc-vault/test/store-provider-conformance.ts packages/express-oidc-vault/test/packed-consumer.test.ts packages/express-oidc-vault/test-packed-consumer/consumer/consumer-types.ts packages/express-oidc-vault/test-packed-consumer/consumer/consumer-types.cts packages/express-oidc-vault/test-packed-consumer/consumer/consumer.mjs packages/express-oidc-vault/test-packed-consumer/consumer/consumer.cjs packages/express-oidc-vault/test-packed-consumer/consumer/store-contract.mjs packages/express-oidc-vault-memory-store/src packages/express-oidc-vault-memory-store/test/logout-tickets.test.ts packages/express-oidc-vault-memory-store/test/packed-consumer.test.ts packages/express-oidc-vault-memory-store/test-packed-consumer/consumer packages/express-oidc-vault-mongodb-store/src packages/express-oidc-vault-mongodb-store/test/logout-tickets.test.ts packages/express-oidc-vault-mongodb-store/test/read-preference.test.ts packages/express-oidc-vault-mongodb-store/test/packed-consumer.test.ts packages/express-oidc-vault-mongodb-store/test-packed-consumer/consumer/read-policy.mjs packages/express-oidc-vault-redis-store/src packages/express-oidc-vault-redis-store/test/logout-tickets.test.ts packages/express-oidc-vault-redis-store/test/packed-consumer.test.ts packages/express-oidc-vault-redis-store/test-packed-consumer/consumer
  ```

  Initial fixture typing findings (dropDatabase's boolean return and optional
  collection readPreference) were corrected. Initial lint found three intentional
  raw-control regex checks; narrowly documented no-control-regex exceptions now
  pass. Product-module formatting was normalized with apply_patch. A wide optional
  code-format probe reported test/consumer formatting warnings, including existing
  earlier-task consumer sections; no all-source Prettier pass is claimed. V6 task
  formatting and whitespace/new-file checks are recorded below.

- Limits/follow-up: no unresolved required OVAPP-05 V1/V2/V4 check or service
  blocker. Runtime evidence is Node 26 only; no throughput, sharded certification,
  successful failover/durability or stronger concern claim. Real browser/client
  behavior, core opt-in/routes/DTOs and final workspace/independent review remain
  OVAPP-06/07/08. OVAPP-06 can proceed using the root capability and documented
  collision/error distinctions. Preserve the existing unrelated skill deletion.

- V6 content/privacy/whitespace review: adopted contract and earlier task statuses
  retained, changed-path ownership reviewed against initial/final status, no
  machine-local paths or private session identifiers added. Existing dependency
  links/headings are preserved. These checks passed from `<repo-root>`:

  ```sh
  pnpm exec prettier --check docs/tasks/20261022-200950-express-oidc-vault-app-integration.md
  git diff --check
  for file in packages/express-oidc-vault-memory-store/src/logout-ticket-validation.ts packages/express-oidc-vault-memory-store/src/logout-tickets.ts packages/express-oidc-vault-memory-store/test/logout-tickets.test.ts packages/express-oidc-vault-mongodb-store/src/logout-ticket-validation.ts packages/express-oidc-vault-mongodb-store/src/logout-tickets.ts packages/express-oidc-vault-mongodb-store/test/logout-tickets.test.ts packages/express-oidc-vault-redis-store/src/logout-ticket-validation.ts packages/express-oidc-vault-redis-store/src/logout-tickets.ts packages/express-oidc-vault-redis-store/test/logout-tickets.test.ts docs/tasks/20261022-200950-express-oidc-vault-app-integration.md; do git diff --no-index --check -- /dev/null "$file" || exit "$?"; done
  ```

  Initial task formatting found inline-code/list-spacing issues, corrected with
  apply_patch. No-index checks include all nine newly added source/test files and
  this preexisting untracked task document. Final task-only updates do not change
  the verified runtime artifacts.

- Cleanup: packed harnesses removed staged consumers; all fixture clients,
  sessions, replica sets and containers stopped in teardown, including failures.
  `pgrep -af '[_]tmp-ovapp05|[m]ongo_killer.js'` had no matches (exit 1), and
  `docker ps --filter ancestor=redis:6.2-alpine --filter ancestor=redis:7.2-alpine --format '{{.Image}} {{.Status}}'`
  returned no running test images. Inspection found only Node's compile cache in
  the ignored scratch directory. From `<repo-root>`:

  ```sh
  ls -d . "_tmp-ovapp05" && git check-ignore "_tmp-ovapp05" && rm -rf -- "_tmp-ovapp05"
  ```

  Removed the remaining scratch directory. Prior user work, the sibling MongoDB
  task and unrelated skill deletion are preserved. No nested agents,
  commits/pushes or CHANGELOG edits were made. Only OVAPP-05 advances status.

MongoDB implementation handoff (OVMONGO-02, 2026-10-23):

- The delivered [primary-read policy and completion evidence](20261022-200950-express-oidc-vault-mongodb-primary-read-policy.md#ovmongo-02-completion-and-ovapp-05-policy-handoff)
  establishes both required boundaries. Use internal `primaryCollection<T>(db, name)` from
  `packages/express-oidc-vault-mongodb-store/src/read-policy.ts` for ticket payload
  and capacity/expiry-ledger handles on the supplied Db. Keep the adopted option
  names/defaults `logoutNavigationTicketsCollectionName` /
  `oidc_vault_logout_navigation_tickets` and
  `logoutNavigationCapacityCollectionName` /
  `oidc_vault_logout_navigation_capacity`, isolated from all existing roles.
- Primary handles cover ticket/ledger lookups, readiness `listIndexes`, paired
  collection/maxEntries configuration validation and collision/liveness/expiry
  preflight. **Every create, consume and expiry-accounting/cleanup transaction
  must additionally pass `readPreference: 'primary'` explicitly**, even if its
  first operation writes the serialization row. Collection policy alone does not
  override client-inherited transaction preference. Preserve concerns, payload
  TTL/non-TTL accounting, bounded cleanup/count atomicity and caller lifecycle.
- Extend the real-secondary routing/preservation and installed ESM/CJS consumers
  for the new operations and rerun affected checks; current evidence covers only
  the existing seven roles/four transaction boundaries. This handoff implements
  no tickets and does not advance OVAPP-05 or any later task status.

### Task OVAPP-06: Integrate proof-authorized logout and navigation continuation

Status: completed

Kind: improvement

Priority: P2 - removes duplicated discovery, cookie, alias, and logout orchestration from consumers.

Dependencies: OVAPP-05.

Primary ownership:

- Core logout orchestration in `src/index.ts` or a focused internal logout module.
- Core options/wire types, cookie/provider integration, HTTP tests, and docs.

Finding:

The existing logout handler already implements provider/key authority, alias
revocation, local-first deletion, cookie clearing, and best-effort provider work.
The new browser transport should share that operation rather than fork a second
implementation of these responsibilities.

References:

- `packages/express-oidc-vault/src/index.ts:1124-1250` (`createLogoutHandler`).
- `packages/express-oidc-vault/src/cookies.ts` (configured session-cookie helpers).
- `packages/express-oidc-vault/src/provider-client.ts` (`resolveProviderMetadata`).
- `packages/express-oidc-vault/src/vault-route-proof.ts` (proof/challenge integration).
- OVAPP-04's decision and OVAPP-05's provider capability.

Requirements:

1. Implement the normative [OVAPP-04 decision](#ovapp-04-decision-implement-the-following-contract):
   `OidcVaultOptions.logoutNavigation`, root
   `OidcVaultLogoutNavigationOptions`, additive
   `OIDC_VAULT_ROUTE_PATHS['logout-navigation']`, JSON POST and ticket GET at
   `<basePath>/logout/navigation`. Pure wire/root
   `OidcVaultLogoutNavigationInput` and `OidcVaultLogoutNavigationResult` have
   exactly the selected fields. Successful initiation always returns a pinned
   ticket-bearing or bare fallback-navigation backend URL, never an upstream URL.
2. At construction validate/snapshot fallback/return URI rules, namespace label,
   bounded TTL and clock arithmetic, required deviceBinding and both ticket
   methods. Disabled old custom stores keep working; enabled missing capabilities
   fail synchronously with a feature/method-specific message. Apply the strict
   raw-source guard and JSON-only shape to the new POST in both transports;
   preserve ordinary `/logout` request/source behavior.
3. Extract/reuse one logout revocation operation with existing live/alias provider
   authority, original-bound proof/nonce/replay and context recheck, owned hooks,
   original lineage deletion and configured cookie clearing. New navigation
   initiation requires an originally bound live target/alias, even under optional
   policy; no-target remains idempotent. Need no API token/ath or live access JWT.
   Preserve configured per-check overrides and operation `logout` diagnostics.
4. Follow the precise ordering/failure matrix: await deletion before any usable
   ticket, clear cookie, resolve/build provider destination from the captured live
   hint, then sample lifetime/generate/persist ticket and notify once before
   result writing. Three definite-collision attempts maximum; no retry on unknown
   persistence failure. Never swallow an uncertain deletion into local success,
   resurrect credentials, or omit the committed live post-hook because provider/
   ticket work failed. Retain existing per-request/crash hook semantics.
5. Aliases/no-target/absent hint or endpoint yield only the bare backend URL with
   no ticket/provider work where forbidden by the matrix. Do not read successor
   credentials or widen revocation context. Reuse existing discovery/cache/
   deadlines; provider/build/storage errors after revocation yield confirmed
   local success plus bare fallback URL and private onError as specified.
6. GET atomically spends only the canonical hashed opaque ticket in the derived
   pinned namespace; validate returned authority/window/URL and redirect with
   empty-body 302. Missing/invalid/spent/foreign ticket or uncertain consume gets
   only fixed fallback. No session/cookie mutation, provider discovery, logout
   hooks or proof work on GET. Register explicit no-consume HEAD behavior before
   Express GET; unsupported methods and CORS preflights cannot spend tickets.
7. Apply new-route no-store/no-referrer headers on success/error/redirect. Keep
   final URLs only in server records/HTTP Location, absent from JSON, new hook
   metadata and diagnostics. Preserve normal POST local/302 logout, stateless JWT
   limits and signed backchannel logout. Ship matching README/website migration,
   bounds/retention/failure and custom-store opt-in documentation with installed
   root/wire/strict-consumer coverage; do not export private orchestration helpers.

Acceptance criteria:

- Body/cookie initiation revokes the intended lineage, clears configured cookies
  when applicable, and returns only the approved result/backend navigation URL.
- Wrong/missing/replayed proofs, foreign provider context, and invalid browser
  origins leave the live session/cookie unchanged; nonce challenges are retryable.
- Optional-unbound new initiation rejects without enrollment/revocation; optional
  unbound ordinary logout remains compatible. Construction snapshots and missing
  capability errors are tested, including a legacy feature-disabled custom store.
- Initiation and continuation on different instances succeed once. Unknown,
  expired, consumed, foreign-namespace, and tampered tickets cannot redirect to
  arbitrary destinations or perform additional session operations.
- Provider failure, ticket-store failure, response loss, alias-only logout, and
  concurrent rotation follow the decision table; hooks are not duplicated.
- Fault injection before deletion, after partial deletion/alias-cleanup failure,
  during discovery, after create persistence/before acknowledgement, and after GET
  consume proves the commit matrix. No grant is spendable while deletion is held;
  no loggedOut DTO/cookie-clear success is returned when deletion rejects. A live
  post-hook still runs once after provider/ticket failure; alias/no-target/GET run
  none. Crash windows/response loss are described without exactly-once claims.
- Missing/duplicate/extra query inputs, HEAD/unsupported methods, malformed custom
  consume results, malicious fallback/options, hint URL bounds and configured
  nondefault cookie name/path/domain clears have explicit HTTP coverage. Repeated
  GET falls back and cannot clear a newer login cookie.
- Existing POST local/redirected logout, signed backchannel logout, and disabled
  feature behavior pass unchanged; JSON contains no upstream credentials.

Verification: V1 HTTP lifecycle/failure/concurrency regressions; core V2/V4 and
affected provider V2 if this task changes provider behavior.

Execution notes (OVAPP-06 implementation):

- Sole assigned implementation owner, sequential execution; OVAPP-04/05 and
  OVMONGO-01/02 are completed. Read the full normative decision, storage evidence,
  repository instructions and task workflow. Preserve all prior work and the
  unrelated skill-file deletion; no nested agents, commits/pushes or CHANGELOG edits.
- Reconfirmed Node `v26.10.0`, pnpm `11.18.0`, npm `11.19.1`. Ignored repository-local
  `_tmp-ovapp06` is provisioned and verified with `git check-ignore`; all builds,
  tests and packing run serially with that TMPDIR.
- Selected API is exactly OVAPP-04's contract: root options and root/pure-wire
  input/result DTOs, additive `logout-navigation` path key without widening hook
  route/diagnostic operation unions, JSON POST and headerless GET. Internal
  configuration/ticket helpers stay private. Both POST handlers use one shared
  authenticated revocation operation, including context recheck, original-lineage
  deletion, configured cookie clear and live hook delivery. Navigation adds strict
  source/body checks and requires original binding even under optional policy.
- Resolve/freeze static return policy and exact derived scope at construction;
  persist only the bounded final provider URL after confirmed deletion and cookie
  preparation. GET spends before empty-body redirect, with fixed fallback and
  explicit no-consume HEAD. Preserve disabled custom stores and existing local,
  redirected and backchannel logout. Browser methods/re-exports remain OVAPP-07.

Completion evidence (OVAPP-06, 2026-10-23):

- Delivered the exact selected root `OidcVaultLogoutNavigationOptions` and
  `OidcVaultOptions.logoutNavigation`, root/pure-wire input/result, additive
  `OIDC_VAULT_ROUTE_PATHS['logout-navigation']`, JSON POST and headerless GET.
  Options default to 60000-ms TTL and `default` label. Construction checks both
  optional ticket methods and all six binding capabilities with feature-specific
  failures, snapshots/freezes return policy and exact JSON-array scope, and
  validates Date-range arithmetic. Disabled custom stores retain compatibility.
- Both POST routes now call one private `performLogout`: original provider/key/
  lineage authority, proof/nonce/shared replay, latest context comparison, owned
  live pre-hook, awaited deletion, selected-cookie clearing and live post-hook.
  Navigation requires original binding even under optional mode and strict raw
  source/JSON checks in both transports. No API JWT/ath or successor credentials.
  Aliases revoke only; absent targets allocate no reservation/grant. Existing
  ordinary local/302 and signed backchannel tests pass through unchanged APIs.
- Navigation uses existing provider discovery/cache/deadlines and URL builder
  after deletion, then samples time, generates 32 random bytes per `lnt_` secret,
  hashes the entire secret, and persists only the five-field final bounded URL
  record. At most three definite-conflict attempts share one deadline. Unknown
  create errors are not retried, even after commit. Provider/ticket failures keep
  confirmed local success plus the bare backend path and one live post-hook;
  deletion rejection never becomes a successful DTO/cookie clear/post-hook/grant.
  Cookie-preparation failure after deletion still delivers the live post-hook,
  errors and issues no ticket. No new public/deep orchestration exports.
- GET validates an exact raw canonical query, consumes before redirect, validates
  returned identity/window/URL, and emits empty-body 302. Fixed fallback covers
  malformed/unknown/expired/spent/foreign/uncertain consumption; malformed queries
  do not touch storage. GET has no session/provider/cookie/hook/proof work. HEAD
  is explicit 405 with `Allow: GET, POST` before GET/body parsing. Caller-owned
  OPTIONS remains supported. All new route responses have no-store/no-referrer.
- Grounded detail: fallback-loop rejection includes Express's default
  case-insensitive and trailing-slash aliases, not only text-identical paths.
  Valid JSON primitives get the selected shape error; malformed JSON retains the
  existing parser error DTO. Configuration and consumed-record diagnostics stay
  private; no upstream URL/token, handle, subject or provider enters JSON/new
  metadata/diagnostics.
- Changed production paths (core-relative): `src/logout-navigation.ts` (new),
  `src/index.ts`, `src/types.ts`, `src/wire.ts`, `src/constants.ts`,
  `src/device-binding-policy.ts`, `src/origins.ts`.
- Changed tests/consumers (core-relative): `test/logout-navigation.test.ts` (new,
  **199 cases**), `test/packed-consumer.test.ts`,
  `test-packed-consumer/consumer/logout-navigation-runtime.mjs` (new),
  `consumer-types.ts`, `consumer-types.cts`, `wire-types.ts`, `wire-root-types.ts`
  (last four files are in that same consumer directory).
- Changed docs: `packages/express-oidc-vault/README.md`, matching
  `website/docs/packages/express-oidc-vault.md`, and this task file. Installed
  checks enforce byte-identical navigation/storage sections and compile the new
  backend and pure-browser wire examples. Migration notes cover opt-in/custom
  stores, return validation, local-first failures, alias limits, response loss,
  retained URL exposure and stateless-JWT limits.
- Added test-only `@types/supertest` to core `package.json` and `pnpm-lock.yaml`
  so the new HTTP fixture can pass a genuine standalone strict typecheck rather
  than suppressing missing declarations. `pnpm view @types/supertest version`
  returned 7.2.1; `pnpm install --no-frozen-lockfile` installed it. The lock diff
  is exactly 31 additive lines for that dependency and its type dependencies;
  no production dependency or provider implementation changed.
- Development failures resolved: first V1 was 181 passed / 11 failed (refresh
  conflict fixture expected 409 instead of existing 401, cookie-failure injection
  patched unused Express `clearCookie` instead of the library's `append`, and
  class-store spreads lost prototype methods). Corrected fixtures passed. Initial
  strict checking exposed missing Supertest declarations, then one request-body
  narrowing and two contextual callback return annotations; all corrected. Six
  lint multiline-call findings and three product-format findings were resolved
  with apply_patch. No check failure was skipped to mark completion.

Verification (all build/test/packing commands serialized, working directory
`<repo-root>` unless stated; replace placeholders before execution):

- Environment: Linux x64, Node `v26.10.0`, pnpm `11.18.0`, npm `11.19.1`,
  TypeScript `6.0.3`, tsup `8.5.1`, Vitest `4.1.11`. Prior uncommitted worktree
  and unrelated skill deletion preserved. No nested agents, commits/pushes or
  CHANGELOG edits. Initial preparation/build passed:

  ```sh
  node --version && pnpm --version && npm --version
  ls -d . node_modules && mkdir -p "_tmp-ovapp06" && git check-ignore "_tmp-ovapp06"
  TMPDIR='<repo-root>/_tmp-ovapp06' pnpm --filter '@web-ts-toolkit/express-oidc-vault...' --workspace-concurrency=1 build
  ```

- Final V1, working directory `packages/express-oidc-vault`:

  ```sh
  TMPDIR='<repo-root>/_tmp-ovapp06' pnpm exec vitest run --config ../../vitest.config.ts test/logout-navigation.test.ts test/dpop-vault-session.test.ts test/bov-10-route-prerequisites.test.ts test/diagnostics.test.ts test/index.test.ts test/dpop-failure-policy.test.ts
  ```

  **Six files / 714 tests passed**, no skips. Earlier corrected focused run was
  four files / 626 passed. New cases cover both transports, actual duplicate raw
  sources, proof/provider/unbound/replay state invariance, nonce retry, alias-only
  authority, held/partial/uncertain deletion, post-discovery clock sampling,
  conflict/unknown persistence, cookie preparation and HTTP response loss,
  concurrent rotation/refresh, cross-instance single use, exact scope changes,
  malformed custom results, redirect injection and nondefault/Host cookie clears.

- Final core V2 / installed V4:

  ```sh
  TMPDIR='<repo-root>/_tmp-ovapp06' pnpm --filter @web-ts-toolkit/express-oidc-vault test
  ```

  **40 files / 2432 tests passed**, no skips (net +199 over OVAPP-05). The first
  coherent V2 run passed 2425 tests before seven final boundary cases. A later
  run exceeded the harness's 120-second command limit and was terminated, with
  no orphan processes found; rerunning with a 300-second limit passed in
  122.57 seconds. No runtime failure was hidden by the timeout rerun.

- Installed V4 applies the existing release manifest transformation and installs
  tarballs. Actual ESM/CJS navigation HTTP runtimes exercise both transports and
  independent middleware instances with shared memory storage, exact root path,
  original-key proofs, hash-only storage, HEAD and one-winner GET. Strict NodeNext
  ESM/CJS/Bundler, root/wire type identity, DOM-only wire/browser declarations and
  installed README/website examples pass. Browser declarations import no Express/
  Node ambient types. Runtime evidence is Node 26 only; no alternate runtime was
  configured. No new artifact pipeline or browser method was introduced.

- V4 package file check, working directory `packages/express-oidc-vault`:

  ```sh
  TMPDIR='<repo-root>/_tmp-ovapp06' npm pack --dry-run --json
  ```

  Passed: **10 intended workspace package files**, no bundled dependencies.
  Release-transformed staged eleven-file check including LICENSE passed in V2.

- Final strict fixture check and targeted ESLint passed:

  ```sh
  pnpm exec tsc --noEmit --strict --skipLibCheck --target es2022 --module esnext --moduleResolution bundler --types node --ignoreDeprecations 6.0 packages/express-oidc-vault/test/logout-navigation.test.ts
  pnpm exec eslint packages/express-oidc-vault/src/index.ts packages/express-oidc-vault/src/types.ts packages/express-oidc-vault/src/wire.ts packages/express-oidc-vault/src/constants.ts packages/express-oidc-vault/src/device-binding-policy.ts packages/express-oidc-vault/src/origins.ts packages/express-oidc-vault/src/logout-navigation.ts packages/express-oidc-vault/test/logout-navigation.test.ts packages/express-oidc-vault/test/packed-consumer.test.ts packages/express-oidc-vault/test-packed-consumer/consumer/consumer-types.ts packages/express-oidc-vault/test-packed-consumer/consumer/consumer-types.cts packages/express-oidc-vault/test-packed-consumer/consumer/wire-types.ts packages/express-oidc-vault/test-packed-consumer/consumer/wire-root-types.ts packages/express-oidc-vault/test-packed-consumer/consumer/logout-navigation-runtime.mjs
  ```

- Product/task formatting, whitespace, local links and privacy review passed;
  these checks include the new untracked files:

  ```sh
  pnpm exec prettier --check packages/express-oidc-vault/src/index.ts packages/express-oidc-vault/src/logout-navigation.ts packages/express-oidc-vault/src/constants.ts packages/express-oidc-vault/src/types.ts packages/express-oidc-vault/src/wire.ts packages/express-oidc-vault/src/origins.ts packages/express-oidc-vault/src/device-binding-policy.ts docs/tasks/20261022-200950-express-oidc-vault-app-integration.md
  git diff --check
  for file in packages/express-oidc-vault/src/logout-navigation.ts packages/express-oidc-vault/test/logout-navigation.test.ts packages/express-oidc-vault/test-packed-consumer/consumer/logout-navigation-runtime.mjs docs/tasks/20261022-200950-express-oidc-vault-app-integration.md; do git diff --no-index --check -- /dev/null "$file" || exit "$?"; done
  ```

- Cleanup: successful packed consumers removed their staged installations. The
  terminated run left only task-owned staged/installed fixtures and Node compile
  cache under the ignored `_tmp-ovapp06`; inspection confirmed their location.
  The process check returned no matches (exit 1); the following cleanup removed
  the directory from repo root, preserving all other temporary/user work:

  ```sh
  pgrep -af '[v]itest|[_]tmp-ovapp06|[t]sup'
  ls -d . "_tmp-ovapp06" && git check-ignore "_tmp-ovapp06" && rm -rf -- "_tmp-ovapp06"
  ```

- Limits/handoff: no unresolved OVAPP-06 required checks. No provider behavior
  changed, so provider V2 reruns are not required here; OVAPP-05's live persistence
  evidence is preserved. Full provider/browser/workspace and independent review
  remain OVAPP-08. The existing Vite native-loader advisory was non-failing.
  **OVAPP-07 may proceed** with `logoutAndNavigate()`, pure client DTO re-exports,
  lifecycle/nonce/coalescing/intent handling and actual Chromium/Firefox navigation
  in the reference example. Its full selected contract above remains normative.

### Task OVAPP-07: Add browser-client navigation logout and real-browser evidence

Status: completed

Kind: improvement

Priority: P2 - makes the new server capability consumable without custom proof/fetch/navigation code.

Dependencies: OVAPP-06.

Primary ownership:

- `packages/oidc-vault-dpop-client/src/auth-session.ts`, associated types, and existing lifecycle/HTTP helpers.
- Browser-client unit/packed/docs tests and `apps/oidc-vault-dpop-example` browser integration.

Finding:

The client's current `logout()` posts to the vault, expects `{ loggedOut: true }`,
clears local state, and coordinates cookie invalidation. Applications needing IdP
navigation currently build their own fetch/proof/retry or custom GET logic.

References:

- `packages/oidc-vault-dpop-client/src/auth-session.ts:808-825` (`logout`).
- `packages/oidc-vault-dpop-client/package.json` (typecheck, packed/unit, and browser scripts).
- `apps/oidc-vault-dpop-example/package.json` (server/browser integration harness).
- DPH-02/03 in [server/client health](20261012-163240-dpop-server-client-health.md).

Requirements:

1. Implement the normative [OVAPP-04 decision](#ovapp-04-decision-implement-the-following-contract):
   `logoutAndNavigate(): Promise<void>` invokes the existing synchronous `navigate`
   adapter after confirmed local cleanup and validation, returning no saved URL.
   Keep `logout()` local. Re-export the two selected pure navigation input/result
   DTOs through existing bundled browser declaration paths; no server runtime or
   ambient dependencies. No return-URL/prepare API or new navigation framework.
2. Reuse bounded `post`/`requestVaultJson`, existing-key proof creation, vault nonce
   cache, one fresh-proof challenge retry, per-instance FIFO and cookie Web Lock.
   Body/cookie credentials and authoritative handle selection follow the decision;
   active matching cookie metadata is required for this new method. Do not create
   a replacement key, send fingerprints/Authorization/ath, refresh first, or
   require a live in-memory access JWT.
3. Check the returned URL's exact pinned backend origin, canonical continuation
   path and permitted bare/single-canonical-ticket form before adapter use. Reject
   arbitrary destinations/extra queries/encoding tricks. On loggedOut true,
   clear old auth/pending login/nonces and invalidate cookie metadata/peers even
   when the URL is invalid, then report INVALID_LOGOUT_NAVIGATION_RESPONSE with
   no navigation. Unconfirmed/malformed/transport outcomes retain current
   nonterminal uncertainty handling, with no automatic mutation retry.
4. Coalesce concurrent new-method calls into the same pending Promise/one adapter
   call; never retain a completed ticket URL. Preserve earlier-refresh publication
   and later-refresh non-resurrection. Implement entry-time lifecycle plus
   navigation-intent generation so later login/exchange/local logout/clear/reset/
   disposal suppress old navigation, including queued login intent. Finish only
   still-current old-state cleanup under FIFO/lock; a stale completion cannot
   clear newer auth. Preserve existing immediate clear/reset/dispose aborts,
   same-origin cookie coordination and key retention.
5. Update the example with an explicit navigation-logout action and additive
   server opt-in. Extend its real local IdP with discovery end-session support,
   hint validation, registered post-logout return URI and a committed logout
   document/return action so tests prove top-level provider arrival, not just a
   request that an automatic redirect immediately hides. Add deterministic
   discovery-unavailable/missing-endpoint and ticket-consume fallback fixtures;
   document the limit on failures after the browser has been redirected to IdP.
6. Align shipped README/llms/website/examples, CORS requirements, migration and
   uncertainty/retention/lifecycle notes. Extend strict browser and installed
   ESM/CJS/README consumers, wire parity and existing DOM-only compile lanes.
   Tests must not substitute Node manual-fetch behavior for browser evidence.

Acceptance criteria:

- Chromium and Firefox complete a real top-level provider logout navigation via
  the backend ticket for body and cookie transports, with provider-unavailable
  discovery/missing-endpoint fallback and an expired local access token covered.
  Assert main-frame/document arrival, original hint only in the IdP-bound
  Location/request, fixed registered return, local handle/cookie revocation, and
  absence of upstream material/handle from initiation JSON/backend ticket URL.
- Nonce retry, double-click, refresh/logout overlap, response failure, clear/new
  login, and disposal cases have deterministic lifecycle outcomes without stale
  navigation or credential resurrection. Include held-response/IDB/lock barriers,
  inactive cookie metadata, reload with no memory JWT, queued newer login intent,
  malicious result with confirmed local cleanup, adapter failure, and no mutation
  retry after response loss. Two concurrent clicks share the same Promise and one
  POST batch (apart from the allowed fresh-proof nonce challenge retry).
- A second ticket navigation has the approved idempotent fallback; malicious
  response destinations are rejected before navigation.
- Strict browser consumers and packed README examples compile, and applications
  use the feature without custom proof creation or response interception.

Verification: client V1/V2/V4, example V3 including actual navigation assertions;
report browser/deployment coverage and any excluded environments explicitly.

Execution notes (OVAPP-07 implementation):

- Sole assigned implementation owner, sequential execution; OVAPP-06 and all
  prerequisites are completed. Read the adopted OVAPP-04 browser/intent contract,
  OVAPP-06 API/evidence, repository instructions and task workflow. Preserve prior
  changes and the unrelated skill-file deletion. No nested agents, commits/pushes,
  CHANGELOG edits or final independent review.
- Reconfirmed Node `v26.10.0`, pnpm `11.18.0`, npm `11.19.1`. Builds, tests and
  packing will run serially with ignored repository-local `_tmp-ovapp07` as TMPDIR.
- Implement the selected `logoutAndNavigate(): Promise<void>` using the existing
  HTTP/proof/nonce/FIFO/cookie-lock machinery, exact pinned URL validation,
  coalescing and separately withdrawable navigation intent. Extend pure browser
  DTO exports, installed consumers, reference IdP/example and both real browsers.

Implementation/verification progress:

- Client method and pure DTO re-exports are delivered. Navigation intent is
  separate from entry-time cleanup authority: queued login/exchange/local logout
  suppresses old navigation immediately while a committed old operation can finish
  cleanup under FIFO/lock. Exact bare/ticket text validation includes canonical
  final base64url bits and exact length; no parsing normalization grants authority.
- New-method unit coverage uses held HTTP/body/key/metadata/lock boundaries and
  checks both transports, no/expired memory JWT, existing-key-only behavior,
  learned nonce/fresh proof, click Promise identity, FIFO rotation, malformed/
  malicious results, uncertainty/deadlines, terminal errors and intent/disposal.
  Initial V1 was 385 passed / one fixture failure: ordinary cookie `logout()`
  intentionally remains idempotent after inactive metadata, unlike the new method.
  Corrected expectation passed 386 tests. A standalone typecheck then identified
  missing new methods on two typed mocks and one union-Promise inference; fixed.
- Reference server uses the public JWT issuer helper with a small scope mapper.
  Optional authenticator/telemetry composition remains OVAPP-08's integrated
  example work. Local IdP has bounded signed-hint validation, registered returns,
  a committed logout document and deterministic discovery modes. Example test
  scripts now explicitly serialize their dependency builds.
- First browser run exposed missing Firefox and fixture-only response-body/clock
  issues. Installed Firefox with the existing Playwright CLI; Linux used its
  Ubuntu 24.04 fallback binary and successfully launched. Chromium discards CDP
  response bodies at document teardown (and waits on unread fetch streams), so
  the existing held-native-response adapter now snapshots a Response clone in the
  browser before its barrier; there is no extra request/proof or redirect emulation.
  Explicitly captured core/store clocks isolate deterministic discovery-cache
  expiry from proof/nonce/session time. All initial failures were resolved.
- Client V2/V4 passed 18 files / 856 tests plus source/test/strict-consumer checks.
  Example unit lane passed four files / 51 tests. Focused browser lane passed
  two files / 56 tests; the full Chromium/Firefox V3 lane subsequently passed
  seven files / 128 tests, including all 54 new navigation cases and production
  SPA button/provider/registered-return behavior. Core installed docs/consumer
  lane passed one file / three tests. No required browser case is skipped.

Completion evidence (OVAPP-07, 2026-10-23):

- Delivered public `OidcVaultDpopSession.logoutAndNavigate(): Promise<void>` and
  root/bundled-wire `OidcVaultLogoutNavigationInput` /
  `OidcVaultLogoutNavigationResult`. No new runtime export or browser dependency.
  Original persistent-key/body-cookie transport, finite HTTP work, learned nonce
  cache and exactly one fresh-proof challenge retry are shared with existing
  lifecycle operations. Ordinary logout/refresh/key recovery behavior is retained.
- Confirmed local success clears old auth/pending login/nonces/peer adoption and
  invalidates cookie metadata under the lock before navigation. Invalid URLs still
  finish that cleanup and reject with fixed nonterminal
  `INVALID_LOGOUT_NAVIGATION_RESPONSE`; unconfirmed/transport outcomes keep their
  uncertainty policy without mutation retry. Separate navigation-intent authority
  suppresses stale/queued-login/disposed navigation without clearing newer auth.
  Clicks share one pending Promise through cleanup/adapter and never cache a URL.
- **31 scoped files changed**, including one new browser spec. Client-relative
  production/docs: `src/auth-session.ts`, `src/index.ts`, `src/wire.ts`, `README.md`,
  `llms.txt`. Client-relative tests: `test/auth-session.unit.test.ts`,
  `test/auth-fetch.unit.test.ts`, `test/auth-fetch-abort.unit.test.ts`,
  `test/auth-fetch-scope.unit.test.ts`, `test/wire-contract.test.ts`,
  `test/oidc-vault-dpop-client.browser-smoke.ts`,
  `test/oidc-vault-dpop-client.packed-consumer.test.ts`,
  `test/oidc-vault-dpop-client.docs.compile.test.ts`,
  `test/packed-consumer-harness.ts`,
  `test-decl-consumer/decl-consumer.strict.test.ts`.
- Example-relative paths: `src/main.ts`, `server/app.ts`, `server/local-idp.ts`,
  `server/index.ts`, `package.json`, `README.md`, `test/server.test.ts`,
  `test/docs-consumer.test.ts`, `test/browser/harness.ts`,
  `test/browser/page-bridge.ts`, `test/browser/built.browser.ts`,
  `test/browser/logout-navigation.browser.ts` (new). Other scoped paths:
  `packages/express-oidc-vault/README.md`,
  `website/docs/packages/express-oidc-vault.md`,
  `website/docs/packages/oidc-vault-dpop-client.md`, and this task file.
- Environment: base `33e434d`, Linux x64, Node `v26.10.0`, pnpm `11.18.0`,
  npm `11.19.1`, TypeScript `6.0.3`, tsup `8.5.1`, Vitest `4.1.11`,
  Vite `8.2.1`, Playwright `1.62.1`. Actual launched browsers: **Chromium
  `151.0.7922.34` and Firefox `153.0`**. No additional consumer runtime configured.
  `node --version && pnpm --version && npm --version`,
  `git rev-parse --short HEAD`, `pnpm exec playwright --version` and the
  Playwright engines' `browser.version()` probe established runtime values.
  Missing Firefox setup was resolved with
  `TMPDIR='<repo-root>/_tmp-ovapp07' pnpm exec playwright install firefox`
  from `apps/oidc-vault-dpop-example`; no system-dependency blocker remained.

Verification commands below ran separately, with repository-local TMPDIR.
Working directory is `<repo-root>` unless stated; substitute the checkout for
placeholders before execution. The final example scripts explicitly serialize
dependency builds; no competing build/test processes were run.

- Preparation / V1 dependency builds passed:

  ```sh
  ls -d . node_modules && mkdir -p "_tmp-ovapp07" && git check-ignore "_tmp-ovapp07"
  TMPDIR='<repo-root>/_tmp-ovapp07' pnpm --filter '@web-ts-toolkit/oidc-vault-dpop-client...' --workspace-concurrency=1 build
  TMPDIR='<repo-root>/_tmp-ovapp07' pnpm --filter 'oidc-vault-dpop-example...' --workspace-concurrency=1 build
  ```

- V1, working directory `packages/oidc-vault-dpop-client`:

  ```sh
  TMPDIR='<repo-root>/_tmp-ovapp07' pnpm exec vitest run --config ../../vitest.config.ts test/auth-session.unit.test.ts test/vault-http.unit.test.ts test/wire-contract.test.ts
  ```

  Corrected focused run: **three files / 386 tests passed**, no skips.
  Subsequent key-boundary cases and cleanup-Promise assertion are included in
  the final V2 result below.

- Final client V2 / installed V4:

  ```sh
  TMPDIR='<repo-root>/_tmp-ovapp07' pnpm --filter @web-ts-toolkit/oidc-vault-dpop-client test
  ```

  **18 files / 856 tests passed**, no skips; source, test, strict NodeNext and
  strict Bundler checks passed. Both coherent V2 runs passed, with the final run
  after formatting/cleanup-coalescing assertion. Raw and release-transformed
  tarballs install into isolated consumers; ESM/CJS invoke the new API and verify
  coalesced/disposed authority. Strict NodeNext ESM/CJS and Bundler compile the
  new method/DTOs, negative input/return-authority cases and ambient tripwires.
  `types: []`, `skipLibCheck: false` and file-list checks establish no Node/Express
  or backend dependency in browser declarations. Installed README, website and
  reference-app TypeScript examples compile, with byte-identical client navigation
  documentation. Release staging uses the existing publish manifest transformer;
  the release assembly/pipeline is unchanged.

- Final example unit/reference V3:

  ```sh
  TMPDIR='<repo-root>/_tmp-ovapp07' pnpm --filter oidc-vault-dpop-example test:unit
  ```

  **Four files / 51 tests passed**, no skips. Includes strict app/server/browser
  typechecks, production SPA/server builds, actual plain-Node built-server startup,
  registered/forged/oversized/duplicate hint fixture checks and compiled public
  client snippets in app/core/website docs. Final run uses serialized prebuilds.

- Focused real-browser V3, working directory `apps/oidc-vault-dpop-example`:

  ```sh
  TMPDIR='<repo-root>/_tmp-ovapp07' DPOP_TEST_BROWSERS=chromium,firefox pnpm exec vitest run --config vitest.browser.config.ts test/browser/logout-navigation.browser.ts test/browser/built.browser.ts
  ```

  **Two files / 56 tests passed**, no skips. Earlier partial/failing fixture runs
  are described above; none substitutes for this passing run. The final full lane
  below also includes the formatted spec and shared-fixture preservation checks.

- Final full real-browser V3:

  ```sh
  TMPDIR='<repo-root>/_tmp-ovapp07' pnpm --filter @web-ts-toolkit/oidc-vault-dpop-client test:browser
  ```

  **Seven files / 128 tests passed**, no skips, in actual Chromium and Firefox.
  All **54 new navigation cases** cover both transports, main-frame/document
  provider arrival, exact original hint and fixed registered return, local
  handle/cookie revocation, JSON/ticket URL secrecy, no Authorization/ath/fingerprint,
  no preliminary refresh, expired JWT and new-document/no-memory-JWT operation,
  fresh-JTI nonce retry, click identity/FIFO rotation, malicious results/response
  loss, held committed response/key/lock boundaries, queued login/clear/disposal,
  discovery-unavailable/missing endpoint/consume-error fallback and ticket replay.
  The production-bundle test also clicks the shipped navigation-logout button
  through provider and return documents in each browser. Existing tab/refresh/
  recognition/key-recovery/browser-only module-graph checks pass.

- Core installed-docs V4, working directory `packages/express-oidc-vault`:

  ```sh
  TMPDIR='<repo-root>/_tmp-ovapp07' pnpm exec vitest run --config ../../vitest.config.ts test/packed-consumer.test.ts
  ```

  **One file / three tests passed**, no skips. Existing release-transformed
  consumers compile the added core/website browser method example and enforce
  matching navigation sections. This is scoped documentation/public-consumer
  verification, not a new full core/provider run.

- V4 package dry-runs, each separately from its named package directory:

  ```sh
  TMPDIR='<repo-root>/_tmp-ovapp07' npm pack --dry-run --json
  ```

  `packages/oidc-vault-dpop-client`: **seven intended files**, no bundled deps.
  `packages/express-oidc-vault`: **ten intended files**, no bundled deps. Installed
  release-transformed file/export/type checks passed in the consumer lanes above.

- Final targeted ESLint passed for all **23 scoped TypeScript files**:

  ```sh
  pnpm exec eslint packages/oidc-vault-dpop-client/src/auth-session.ts packages/oidc-vault-dpop-client/src/index.ts packages/oidc-vault-dpop-client/src/wire.ts packages/oidc-vault-dpop-client/test/auth-session.unit.test.ts packages/oidc-vault-dpop-client/test/auth-fetch.unit.test.ts packages/oidc-vault-dpop-client/test/auth-fetch-abort.unit.test.ts packages/oidc-vault-dpop-client/test/auth-fetch-scope.unit.test.ts packages/oidc-vault-dpop-client/test/oidc-vault-dpop-client.browser-smoke.ts packages/oidc-vault-dpop-client/test/wire-contract.test.ts packages/oidc-vault-dpop-client/test/packed-consumer-harness.ts packages/oidc-vault-dpop-client/test/oidc-vault-dpop-client.packed-consumer.test.ts packages/oidc-vault-dpop-client/test/oidc-vault-dpop-client.docs.compile.test.ts packages/oidc-vault-dpop-client/test-decl-consumer/decl-consumer.strict.test.ts apps/oidc-vault-dpop-example/src/main.ts apps/oidc-vault-dpop-example/server/app.ts apps/oidc-vault-dpop-example/server/index.ts apps/oidc-vault-dpop-example/server/local-idp.ts apps/oidc-vault-dpop-example/test/server.test.ts apps/oidc-vault-dpop-example/test/docs-consumer.test.ts apps/oidc-vault-dpop-example/test/browser/harness.ts apps/oidc-vault-dpop-example/test/browser/page-bridge.ts apps/oidc-vault-dpop-example/test/browser/logout-navigation.browser.ts apps/oidc-vault-dpop-example/test/browser/built.browser.ts
  ```

- Formatting and whitespace passed after applying the five formatter-only diffs
  with apply_patch; the final task-only check also passes:

  ```sh
  pnpm exec prettier --check packages/oidc-vault-dpop-client/src/auth-session.ts packages/oidc-vault-dpop-client/src/index.ts packages/oidc-vault-dpop-client/src/wire.ts packages/oidc-vault-dpop-client/test/packed-consumer-harness.ts packages/oidc-vault-dpop-client/test/oidc-vault-dpop-client.packed-consumer.test.ts packages/oidc-vault-dpop-client/test/oidc-vault-dpop-client.docs.compile.test.ts apps/oidc-vault-dpop-example/src/main.ts apps/oidc-vault-dpop-example/server/app.ts apps/oidc-vault-dpop-example/server/index.ts apps/oidc-vault-dpop-example/server/local-idp.ts apps/oidc-vault-dpop-example/test/browser/logout-navigation.browser.ts apps/oidc-vault-dpop-example/package.json docs/tasks/20261022-200950-express-oidc-vault-app-integration.md
  git diff --check
  git diff --no-index --check -- /dev/null apps/oidc-vault-dpop-example/test/browser/logout-navigation.browser.ts
  git diff --no-index --check -- /dev/null docs/tasks/20261022-200950-express-oidc-vault-app-integration.md
  ```

- Cleanup: all successful installed-consumer fixtures clean themselves. Inspected
  `_tmp-ovapp07` contained only Node compile cache and residual browser profiles/
  artifacts. Process check returned no matching test/build/browser processes;
  removed only this ignored task-owned directory:

  ```sh
  pgrep -af '[v]itest|[t]sup|[c]hrome-headless-shell|[/]firefox/firefox|[_]tmp-ovapp07'
  ls -d . "_tmp-ovapp07" && git check-ignore "_tmp-ovapp07" && rm -rf -- "_tmp-ovapp07"
  ```

- Status/handoff: **OVAPP-07 completed; no unresolved required check or blocker**.
  Prior implementation work, unrelated skill deletion, other task statuses and
  root CHANGELOG are preserved; no commits/pushes or nested agents. Evidence is
  Node 26 only and cross-origin **same-site loopback HTTP** with the owned local
  IdP, not external production providers, Safari/WebKit or arbitrary cross-site
  third-party-cookie policy. The Vite future-native-loader advisory is non-failing.
  **OVAPP-08 remains pending for the independent owner**: demonstrate all features
  together (the example now uses the public issuer), run final workspace/provider
  integration and perform the independent review. This implementation does not
  claim that review or repeat unrelated provider suites.

### Task OVAPP-08: Verify integrated contracts and consumer simplification

Status: completed

Kind: improvement

Priority: P2 - establishes that the four features compose and are usable from published packages.

Dependencies: OVAPP-01 through OVAPP-07 and
[OVMONGO-02](20261022-200950-express-oidc-vault-mongodb-primary-read-policy.md#task-ovmongo-02-encapsulate-the-primary-read-policy).

Primary ownership:

- Integration/installed-consumer fixtures, README/website parity, and task completion evidence.
- Independent review of all changed core/provider/browser paths.

Finding:

Separate feature checks do not prove an application can combine optional auth,
strict route guards, a built-in issuer, telemetry, and navigation logout without
reintroducing protocol glue or weakening existing lifecycle contracts.

References:

- Completed OVAPP-01 through OVAPP-07 and OVMONGO-02 evidence.
- `packages/express-oidc-vault/test/packed-consumer.test.ts` (release-transformed consumers and docs).
- `packages/express-oidc-vault/test/store-provider-conformance.ts`.
- `apps/oidc-vault-dpop-example` and affected shipped/website docs.

Requirements:

1. Review each acceptance criterion against actual delivered code and checks.
   If delegated, use a reviewer independent of the main implementer; record
   task-local aliases only and do not claim independence without evidence.
2. Demonstrate a small upstream consumer with a claim mapper, application-user
   callback, optional public session route, strict guarded route, diagnostic
   observer, and navigation logout. It must use package-root APIs and eliminate
   response interception, repeated JWT signing boilerplate, proof decoding/error
   regexes, and private provider-discovery/cookie parsing.
3. Check request-evidence ownership, diagnostics provenance, reserved claims,
   live/alias logout, ticket expiry/single consumption, both transports, custom
   store opt-in compatibility, and MongoDB read-policy integration.
4. Align public source/declarations, backend/browser DTOs, READMEs, website pages,
   migration notes, and examples. Complete V2-V5 and reconcile all statuses with
   actual evidence. Add independent findings as new uniquely numbered tasks
   without hiding them in a completion note or creating dependency cycles.

Acceptance criteria:

- All four feature groups and the MongoDB improvement satisfy their documented
  criteria, with evidence for the integrated consumer and live-provider/browser
  paths; no required check is silently skipped.
- Existing default behavior and specified opt-in compatibility pass. Installed
  ESM/CJS and backend/browser TypeScript consumers use supported public APIs.
- Required package/browser/workspace checks pass; unresolved required checks keep
  this task blocked with the exact prerequisite or failure.
- Remaining deferrals, migration effects, and coverage limitations are explicit.

Verification: V2 for all five packages; full V3; affected-package V4; final V5;
V6 review of both task files and their evidence.

Execution notes (OVAPP-08 independent review):

- Fresh independent reviewer, assigned after all OVAPP-01..07 and OVMONGO-01..02
  dependencies reported completed; this reviewer did not implement those tasks.
  Read repository/task instructions, both full task records and the normative
  OVAPP-04 decision. Review delivered source and evidence independently before
  relying on reported passes. Sequential execution; no nested agents.
- Preserve the existing uncommitted implementation and unrelated skill-file
  deletion. Review attribution excludes that deletion. No commits/pushes or root
  CHANGELOG edits. Review scope permits integration/test/documentation corrections;
  substantive independent defects require a new task and fresh implementer.
- Final V2-V5 evidence is pending. Serialize builds/tests/packing, use ignored
  repository-local temporary fixtures, and keep this task blocked if required
  checks or a substantive defect remain unresolved.

#### OVAPP-08 independent acceptance reconciliation

Reviewed all changed core/provider/client production modules, root/wire exports,
fresh declarations, package manifests and their release-transformed consumer
harnesses against the acceptance criteria and OVAPP-04's normative matrices.
The following conclusions combine source inspection with the fresh checks below;
earlier implementation reports alone are not the acceptance evidence.

- **OVAPP-01 optional auth and guards:** `access-token-middleware.ts` retains
  module-private Request evidence with owner/Response identity, pending-operation
  invalidation and top-level context descriptors. Compatible guards do not
  revalidate/reserve/enrich; forged/copied/mutated/incompatible evidence and re-entry
  fail closed. Credential rejection is explicitly classified, including JWT
  mapper-failure exclusion; nonce challenges, replay outage/capacity, denial and
  unexpected hooks cannot become anonymous success. `optional-auth.test.ts`,
  existing strict API/hook cases and installed optional-auth consumers pass.
- **OVAPP-02 diagnostics and outcomes:** `diagnostics.ts`, proof/replay and route
  integration emit bounded frozen allowlists, actual-check clock/timing and
  per-check provenance. Candidate/verified-token correlation never becomes
  authenticated merely from a signature or ignored check. Outcomes follow
  validated output, committed store work and cookie/response preparation;
  observers cannot veto or recurse. Proof/route/rollback and installed diagnostic
  tests pass. The composed fixture additionally proves an app-owned request-ID/
  user join without proof decoding or telemetry-only session reads; opaque hashes
  alone are not application-user lookup.
- **OVAPP-03 issuer:** `jwt-token-issuer.ts` snapshots key/configuration and
  original binding before callbacks, protects reserved claims before/after JSON
  materialization, validates key/algorithm/time arithmetic, and preserves the
  zero-lifetime contract. Default tokens copy neither vault handles nor upstream/
  session objects. Bound/unbound interoperability, wrong authority/options,
  mapper/signing/mutation and exchange/refresh rollback matrices, plus installed
  issuer consumers, pass.
- **OVAPP-04 selected contract:** checked protocol, five-field retained record,
  derived namespace, exact ticket shape, fallback/return policy, alias limitations,
  provider bounds, commit/crash table and client navigation-intent rules against
  OVAPP-05/06/07. No unresolved contract decision or silently weakened requirement
  was found.
- **OVAPP-05 provider tickets:** reviewed memory map/removable heap, MongoDB
  payload TTL/non-TTL paired ledger and transaction accounting, and Redis server-
  TIME Lua/type preflight/script runner. Exact identity, logical expiry, duplicate-
  before-capacity, bounded cleanup, mutation ownership, cross-client single
  consumption, TTL lag/early disappearance, configuration corruption and native
  failure/ambiguous-ack cases pass on live providers. No session/replay record
  reuse or fallback was found.
- **OVAPP-06 server logout:** shared `performLogout` retains original live/alias
  provider/key/lineage authority and owned hook data. New POST has strict source/
  body checks in both transports; deletion must resolve before cookie clear/
  discovery/ticket work. Uncertain/partial deletion never yields a success DTO or
  ticket; committed continuation failures retain local success/live notification.
  GET validates/consumes before empty-body redirect, does no session/cookie/provider
  work, and HEAD cannot consume. All 199 navigation regressions, existing local/
  302/backchannel behavior and installed consumers pass.
- **OVAPP-07 browser:** reviewed exact pinned URL/canonical ticket validation,
  learned-nonce fresh-proof retry, original-key-only requests, same-Promise
  coalescing, FIFO/cookie-lock ordering, separate navigation intent and immediate
  clear/reset/dispose authority. Unit/installed lifecycle checks and actual
  Chromium/Firefox main-frame IdP/fallback/return navigation, including expired/
  no-memory JWTs, held response/key/lock boundaries, response loss and replay, pass.
- **OVMONGO-01/02:** all nine store-owned collection handles use the supplied Db
  through `primaryCollection`; all original and ticket transaction boundaries
  explicitly select primary. Actual-secondary command monitoring, caller/default/
  namespace/concern preservation, readiness, outage, rotation/revocation/replay/
  tickets and installed independent-client cases pass. The outage fixture setup-
  deadline correction below changes no production policy or outage assertion.
- **OVAPP-08 composition/public surface:** new
  `apps/oidc-vault-dpop-example/test/application-integration.test.ts` is a typed
  package-root consumer in both transports: helper subject/claim mapping,
  application-user approval, public optional session, three compatible strict
  guards, redacted telemetry and one-use navigation logout. It verifies one
  reservation/enrichment, explicit inactive-account denial, unauthenticated failure
  provenance and no raw credentials/handles in logs or initiation JSON. Existing
  reference SPA uses the public navigation client; installed ESM/CJS, strict
  backend/browser and README lanes cover the shipped surface.

Review corrections and attribution:

- Added the two composed application cases above, linked them from the example
  README and matching core README/website telemetry guidance. Application-owned
  generated request IDs and allowlisted user mapping solve the demonstrated join;
  early events remain unapproved identity observations. The fixture sink is
  test-only, not a durable/bounded production audit service.
- The first root test attempt passed core 2432 and memory 179, then MongoDB
  reported **245 passed / one failed**. The actual-primary-outage test failed in
  `Collection.createIndex` during readiness before the owned primary crash:
  `MongoOperationTimeoutError: Timed out during socket read (1981ms)`. Its
  client applied a 2000-ms CSOT budget to index creation as well as outage work.
  In `packages/express-oidc-vault-mongodb-store/test/read-preference.test.ts`, use
  the existing routing fixture's normal 10000-ms operation budget; retain
  `serverSelectionTimeoutMS: 1000`, the real primary crash and every outage/no-
  secondary-routing assertion. Both subsequent full MongoDB executions pass all
  246 tests. This is a test setup correction within OVAPP-08, not a product fix.
- A second root attempt passed every required affected package and both browser
  engines, then the tool's **1800000-ms command limit** terminated it while the
  unrelated `access-router` suite was still running. No test assertion failure or
  baseline defect is inferred from that interruption. A complete third root run
  with a **7200000-ms limit** exits successfully; its `access-router` suite alone
  passes 117 files / 2815 tests in 843.62 seconds. No unrelated package was edited.
- No substantive independent product defect was established in the inspected
  scope, so no OVAPP-09 follow-up is created. All prior work and statuses are
  preserved. Review-owned changes are this task record, the sibling MongoDB
  integration evidence, the new application fixture, the MongoDB test deadline,
  `apps/oidc-vault-dpop-example/README.md`,
  `packages/express-oidc-vault/README.md`, and
  `website/docs/packages/express-oidc-vault.md`. The unrelated skill deletion is
  excluded from attribution. No production implementation, generated declaration,
  CHANGELOG, commit or push was changed by this reviewer.

#### OVAPP-08 fresh verification evidence

Environment: base `33e434d`, sequential uncommitted worktree, Linux x64, Node
`v26.10.0`, pnpm `11.18.0`, npm `11.19.1`, TypeScript `6.0.3`, tsup `8.5.1`,
Vitest `4.1.11`. MongoDB application driver `6.21.0`, memory-server `11.2.0`,
server `8.2.6`, real two-member WiredTiger PRIMARY/SECONDARY fixtures plus existing
single-member/standalone cases; Docker `29.9.2` and live Redis 6.2/7.2 harness
images. A fresh Playwright launch confirms Chromium `151.0.7922.34` and Firefox
`153.0`. Runtime consumers exercise Node 26 only; no extra consumer Node is
configured. No required live-provider/browser case is skipped.

Commands below ran serially from `<repo-root>` unless stated. Replace the
placeholder with the checkout before execution. Test fixtures use the ignored
repository-local TMPDIR, confirmed with `git check-ignore`.

```sh
ls -d . node_modules .bin && mkdir -p _tmp-ovapp08 && git check-ignore _tmp-ovapp08
TMPDIR='<repo-root>/_tmp-ovapp08' pnpm --filter oidc-vault-dpop-example typecheck
TMPDIR='<repo-root>/_tmp-ovapp08' pnpm build
TMPDIR='<repo-root>/_tmp-ovapp08' pnpm lint
TMPDIR='<repo-root>/_tmp-ovapp08' DPOP_TEST_BROWSERS=chromium,firefox pnpm test
TMPDIR='<repo-root>/_tmp-ovapp08' pnpm --filter @web-ts-toolkit/oidc-vault-dpop-client test:browser-smoke
```

- Focused composition V1, working directory `apps/oidc-vault-dpop-example`:
  `TMPDIR='<repo-root>/_tmp-ovapp08' pnpm exec vitest run --config vitest.config.ts test/application-integration.test.ts`
  passed **one file / two tests**; example strict browser/server/test typechecks
  passed. The final root run includes both formatted cases again.
- V5 `pnpm build` passed the full configured workspace build. Root `pnpm lint`
  passed; final post-correction hygiene is recorded below. Root `pnpm test` ran
  three times for the explicit failure/timeout reasons above; its final complete
  run passed **34 Vitest lanes / 560 test-file executions / 14455 test executions**,
  with **one asset-inliner todo**, zero failures and no availability skips in the
  required scope. Counts are executions across lanes (including React 18/19), not
  a claim of unique test cases. All configured workspace test scripts exited
  successfully; the earlier interrupted runs are not counted as passing gates.
- V2 and V3 are subsumed by the final root serial script, which invokes the exact
  affected-package test scripts and the example's same unit/full-browser commands.
  Reviewed the root script, child scripts, selected browser environment and actual
  suite summaries; separate duplicate V2/V3 runs add no coverage. Fresh results:

  | Required suite                                          | Files passed | Tests passed |
  | ------------------------------------------------------- | -----------: | -----------: |
  | `@web-ts-toolkit/express-oidc-vault test`               |           40 |         2432 |
  | `@web-ts-toolkit/express-oidc-vault-memory-store test`  |            4 |          179 |
  | `@web-ts-toolkit/express-oidc-vault-mongodb-store test` |            8 |          246 |
  | `@web-ts-toolkit/express-oidc-vault-redis-store test`   |           12 |          462 |
  | `@web-ts-toolkit/oidc-vault-dpop-client test`           |           18 |          856 |
  | Five-package V2 total                                   |       **82** |     **4175** |
  | Example unit/reference lane                             |            5 |           53 |
  | Example full Chromium/Firefox lane                      |            7 |          128 |
  | Separate client built-bundle jsdom smoke                |            1 |            5 |

- Client V2 also passed source/test and strict NodeNext/Bundler typechecks. The
  example unit lane includes strict app/server/test compilation, production
  SPA/server builds, built plain-Node startup, README consumers and both new
  composition cases. The full browser lane includes all 54 navigation cases and
  actual shipped-button provider/registered-return documents in both engines;
  the separate smoke is browser-like bundling evidence, not another real engine.
- V4 installed lanes inside all five V2 suites pass actual release-transformed
  tarball installation, ESM/CJS root runtimes, exact exports, strict NodeNext ESM/
  CJS and Bundler declarations, README/website examples, backend/root-wire type
  parity and DOM-only browser consumers with ambient-dependency tripwires. Live
  installed MongoDB/Redis fixtures exercise independent clients, ticket storage
  and the primary boundary. Reviewed fresh core/provider/client declarations and
  unchanged runtime export maps; browser DTO bundling does not import Express,
  Node ambient types or a backend runtime. Existing manifest transformation is
  exercised rather than replaced with a new release pipeline.
- V4 `TMPDIR='<repo-root>/_tmp-ovapp08' npm pack --dry-run --json` ran separately
  after builds in `packages/express-oidc-vault`, each of the three provider
  package directories, and `packages/oidc-vault-dpop-client`: respectively
  **10 / 6 / 6 / 6 / 7 intended files**, no bundled dependencies or fixture files.
  Release-transformed staged file lists/installed compatibility are proved by
  the V2 harnesses, not by these workspace manifests' placeholder dry-runs.

Final V6/hygiene/cleanup (2026-10-23):

- Final post-correction `TMPDIR='<repo-root>/_tmp-ovapp08' pnpm lint` passed from
  repo root. Prettier passed for both task documents, the new application fixture
  and the corrected MongoDB fixture. Initial new-evidence table/inline-code
  formatting warnings were corrected with apply_patch; no runtime source changed
  after the final passing root run.
- The ignored temporary validator `node _tmp-ovapp08/check-review-docs.mjs`
  checked both complete task files for local links/anchors, balanced code fences,
  formatting and private machine/session metadata, plus all three new README/
  website prose blocks and exact telemetry-prose parity: **28 links passed**.
  It also checked **all 28 untracked files** with
  `git diff --no-index --check -- /dev/null <file>`, accepting status 1 only with
  empty diagnostic streams (ordinary no-index content differences). This includes
  earlier untracked implementation files; `git diff --check` separately passed for
  tracked changes. The validator was removed with the task-owned scratch tree.
- Final formatting/whitespace commands, working directory `<repo-root>`:

  ```sh
  pnpm exec prettier --check apps/oidc-vault-dpop-example/test/application-integration.test.ts packages/express-oidc-vault-mongodb-store/test/read-preference.test.ts docs/tasks/20261022-200950-express-oidc-vault-app-integration.md docs/tasks/20261022-200950-express-oidc-vault-mongodb-primary-read-policy.md
  git diff --check
  git diff --no-index --check -- /dev/null docs/tasks/20261022-200950-express-oidc-vault-app-integration.md
  git diff --no-index --check -- /dev/null docs/tasks/20261022-200950-express-oidc-vault-mongodb-primary-read-policy.md
  ```

- All fixture-owned clients, sessions, replica sets, browsers and Redis containers
  stopped; process checks for Vitest/tsup/test/browser/Mongo-killer/task-temporary
  processes had no matches, and Docker reported no running required Redis test
  images. Inspected the ignored scratch tree, including stopped data, interrupted
  installed-consumer fixtures, browser artifacts, validation script and compile
  caches; removed only that task-owned tree:

  ```sh
  ls -d . _tmp-ovapp08 && git check-ignore _tmp-ovapp08 && rm -rf -- _tmp-ovapp08
  ```

- Final independent conclusion: **OVAPP-08 completed**, with no substantive
  independent product finding or unresolved required gate. OVAPP-01..07 and
  OVMONGO-01/02 remain completed. Historical failed/interrupted attempts and the
  separate investigation/implementation/review activities are retained above;
  no unrelated baseline-green or baseline-failure claim is needed.
- Coverage limits and deferrals remain explicit: Node 26 only; owned local IdP,
  Chromium/Firefox and cross-origin same-site loopback HTTP, without external
  provider, arbitrary third-party-cookie, Safari/WebKit or multi-Node certification.
  No throughput, sharded-topology, failover-durability, linearizable/cross-call
  causal-read, durable observer-delivery or stateless-JWT-revocation guarantee is
  added. Application account linking, audit persistence/retention, IP treatment,
  permission policy and clock-difference deduplication remain callbacks/app-owned;
  document/media navigation grants and JWT key rotation/JWKS serving remain the
  documented non-goals. None is an unresolved prerequisite for this plan.

## Definition of done

All OVAPP tasks and cross-document prerequisites are completed with observable
acceptance evidence, public/runtime/documentation contracts agree, the integrated
consumer uses the new abstractions, and required verification passes. Feature
implementation, documentation-only task creation, and independent review are
recorded as separate activities. A saved plan is not implementation completion.
