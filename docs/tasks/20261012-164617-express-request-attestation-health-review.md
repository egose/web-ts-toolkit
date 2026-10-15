# Express Request Attestation — Runtime and Consumer Health Review

Created: `20261012-164617`.

Overall result: **completed — all 12 tasks have completion evidence and final
coordinator sign-off**. The final package gate passed **864 tests** (618 Node,
62 live Redis, 31 live MongoDB, 141 Chromium, 12 packed consumers), all five
typecheck configurations, root lint, and whitespace/protected-changelog checks.
Historical intermediate failures below are retained with their resolutions;
the current result is summarized in **Coordinator final review**.

## Objective and product requirements

Review and improve `packages/express-request-attestation` as an installable,
dual-entry request-signing and replay-detection library. Implement every task
below in a separate sub-agent session, **strictly sequentially**, then obtain an
independent integration review and coordinator sign-off.

Business workflows to preserve and make reliable:

- An Express application protects selected API operations by binding method,
  externally visible target, content type, and exact body bytes to a fresh proof.
- Concurrent browser requests share signer discovery/loading and recover from one
  pre-handler key-retirement challenge without duplicate business side effects.
- Callers can reuse finite `Request` inputs for their own authentication retries;
  returned HTTP errors remain readable for application error handling.
- Memory, Redis, and MongoDB provide bounded, atomic single-use nonce admission;
  clustered deployments coordinate keys, time policy, clocks, and replay storage.
- A fresh installed TypeScript consumer can wire the server and browser entries
  using shipped declarations and README examples, including real browser CORS.

Publicly delivered HMAC material provides request consistency and replay detection
while replay state survives. It is deliberately not user/device authentication,
session binding, bot prevention, or durable business-operation idempotency. Those
remain separate application/OIDC/DPoP responsibilities.

Scope: this package's implementation, tests/configuration, shipped README, and
this execution record. Preserve the v1 MAC tuple, deadline/replay semantics,
public named exports, browser-only dependency isolation, and caller-owned clients.
Do not edit root `CHANGELOG.md`, commit, publish, or alter unrelated packages.
The final-review follow-up RATT-12 is a narrowly recorded exception: five
syntax-preserving line joins in two unchanged-at-HEAD Access Router test files
are required to restore the pre-existing root lint baseline. No unrelated
runtime/configuration or concurrent edits belong to that exception.

## Analysis coverage, evidence, and triage

Inspected runtime source and runtime tests, both built declaration entries,
package metadata/build configuration, README, installed-consumer harness,
declaration fixtures, package test configurations, and repository CI commands.
The source review used a dedicated read-only exploration session; the coordinator
reviewed publication, business contracts, existing work, and test discovery.

Related completed objectives (historical findings remain intact):

- `docs/tasks/20261002-183522-express-request-attestation-package.md`: original
  protocol/product contract and package delivery.
- `docs/tasks/20261003-171116-express-request-attestation-mongodb-store.md`: Mongo
  adapter and claimed unit/live/consumer gates.
- `docs/tasks/20261005-131819-access-router-operation-access-variants.md`, F05:
  already-fixed isolated pnpm workspace discovery in packed-consumer tests.

This is a residual review phase, not a duplicate of those implementation plans.
Findings below cite inspected symbols; line numbers describe the review baseline
and may move. Defects inferred from code must be reproduced with focused checks
where feasible before correction. Do not turn an unconfirmed hypothesis into a
claimed vulnerability.

Baseline actually run from `<repo-root>`:

- `git status --short`: clean.
- `node --version`: `v26.10.0`; `pnpm --version`: `11.18.0`.
- `pnpm --filter @web-ts-toolkit/express-request-attestation test:node`:
  **15 files / 346 tests passed**. This consumes the existing build; a fresh build
  and other lanes were not run during analysis.
- Configuration inspection revealed that `test/mongo-store.test.ts` is excluded
  from every configured test lane despite the earlier task's unit-coverage claim.

Execution context update after RATT-04: unrelated concurrent work appeared under
`packages/access-router`, `packages/express-oidc-vault`,
`packages/oidc-vault-dpop-client`, `apps/oidc-vault-dpop-example`, and their task
documents. Those edits belong to other sessions. Review and evidence for this
objective use the attestation package and this file; repository-wide checks must
report any concurrent-work failures with their actual owning scope.

Limitations and consequential deferrals:

- Device enrollment, asymmetric/session-bound proofs, per-device revocation,
  streaming uploads, compression, and provisioning automation change the product
  contract and were explicitly excluded by the original objective. No new protocol
  is invented here; current public-material/authentication limitations remain.
- Heterogeneous freshness policies are already disallowed by the original
  protection-space contract. RATT-08 makes that invariant explicit in shipped
  documentation rather than changing replay retention or adding a policy registry.
- Redis Cluster adapter routing, persistence/failover guarantees, multi-node Mongo
  failover, non-Chromium browsers, production proxy behavior, and deployment load
  benchmarks need concrete deployment/topology requirements. Existing state-loss
  limits remain; standalone Redis and single-node replica-set tests are not
  represented as failover proof.
- A Mongo readiness/index-management API and global dependency-concurrency limits
  are optional operational features without an agreed ownership contract. Keep
  caller-owned index provisioning and driver deadlines clear; no constructor I/O
  or speculative admission-control API is introduced.
- No throughput improvement is claimed without measurement. The selected stream
  work addresses demonstrable unbounded bookkeeping/work and provides a concrete
  bounded-resource experiment instead.

## Execution rules and verification

Priority: **P1** = security/correctness, resource bounds, broken supported workflow,
or a missing meaningful gate; **P2** = consumer usability/readability improvement
with a concrete deliverable. No confirmed authentication/replay bypass warrants a
P0 claim in this review.

Run `RATT-01 -> RATT-02 -> ... -> RATT-10`. Each item gets a fresh isolated
sub-agent session; do not spawn nested agents or run two task agents concurrently.
Set `Status: in_progress` only after dependencies complete. Agents edit only their
owned scope and their task's evidence; the coordinator owns cross-task decisions.
Shared hotspots (`signer-client.ts`, `attested-fetch.ts`, declarations, README,
test configs, and `dist`) are therefore serialized.

Final-review expansion: RATT-10 found a concrete discovery-response ownership gap
and an existing root lint blocker. After the first RATT-10 review, execute the new
isolated tasks `RATT-11 -> RATT-12`, then resume the original independent RATT-10
reviewer. RATT-11 depends on completed implementation, not on the blocked review;
the updated graph has no dependency cycle.

Use `apply_patch` for edits. Preserve unrelated work. Never commit generated
`dist` or temporary experiments. Keep this file repo-scoped: repo-relative paths
and `<repo-root>` in command context, with no machine-specific absolute paths.
Record new necessary findings before expanding a task; independent findings need
a new, fully specified follow-up task and a separate agent.

Commands are run from `<repo-root>` unless stated otherwise:

```sh
# Build once before tests/consumers that read dist. Never overlap dist writers.
pnpm --filter @web-ts-toolkit/express-request-attestation... build
pnpm --filter @web-ts-toolkit/express-request-attestation typecheck
# Focused Node test invocation; substitute the task's real test paths.
pnpm --filter @web-ts-toolkit/express-request-attestation exec vitest run --config vitest.node.config.mts <test-paths>
pnpm --filter @web-ts-toolkit/express-request-attestation test:node
pnpm --filter @web-ts-toolkit/express-request-attestation test:browser
pnpm --filter @web-ts-toolkit/express-request-attestation test:redis
pnpm --filter @web-ts-toolkit/express-request-attestation test:mongo
pnpm --filter @web-ts-toolkit/express-request-attestation test:packed-consumer
pnpm exec eslint packages/express-request-attestation/
# Final complete package gate builds once and runs its lanes serially.
pnpm --filter @web-ts-toolkit/express-request-attestation test
pnpm lint
git diff --check
```

Each implementation task requires focused regression evidence, package build and
typecheck, and lint on touched code. Node/browser lanes run as specified below.
RATT-10 requires all package lanes plus root lint and whitespace checks. The
package's release-shaped consumer lane covers actual tarball installs, CJS/ESM,
strict declarations, README, and browser-only dependencies; it also runs source
and release inventory dry runs. Root-wide build/test are not required for this
phase unless shared wiring or another package's behavior changes. RATT-12's
whitespace-only test correction requires diff review and lint rather than
unrelated runtime tests. This avoids
claiming unrelated workspace coverage from package checks; if scope expands,
record and run the relevant additional gates before sign-off.

Prerequisites: installed workspace dependencies, Playwright Chromium (including
Node-lane browser checks), Docker for isolated Redis 6.2/7.2, the MongoDB replica-set
binary, and registry/cache access for fresh consumer installations. Use isolated
test services only. A missing prerequisite is a blocker, not a skipped success.

## Tasks

### Task RATT-01: Restore Mongo unit-test discovery in the standard gate

Status: completed

Kind: defect

Priority: P1 — database validation/error regressions currently escape every test script.

Suggested agent: test-infrastructure engineer.

Dependencies: none.

Primary ownership: package `vitest.node.config.mts`, `test/mongo-store.test.ts`,
and narrowly necessary test-discovery configuration.

Finding: the Node lane explicitly lists 15 files without `mongo-store.test.ts`;
the Mongo lane includes only `mongo-live.test.ts`. The earlier Mongo objective
claimed 49 unit tests, but the current package aggregate cannot execute them.

References: `vitest.node.config.mts:27-31`, `vitest.mongo.config.mts:19-24`,
`test/mongo-store.test.ts`, package `package.json:41-49`.

Requirements:

1. Include the existing Mongo unit suite in the normal Node gate. Keep live DB,
   browser, and packed consumers in their appropriate serial lanes.
2. Inspect any newly surfaced failure against the adapter contract; record true
   defects before narrowly fixing them. Do not weaken tests to obtain green.
3. Make test discovery understandable and prevent accidental duplicate execution.

Acceptance criteria:

- The standard Node command visibly executes the Mongo unit file and all previous
  Node suites; collection counts and any surfaced fixes are recorded.
- Existing live lane boundaries and aggregate serialization remain valid.

Verification: shared build/typecheck/lint; focused Mongo unit suite; `test:node`.

Completion evidence:

- Changed `packages/express-request-attestation/vitest.node.config.mts`: added
  `test/mongo-store.test.ts`, expanded the explicit include list for readability,
  and documented disjoint lane ownership. All 15 previous Node suites remain.
- Reviewed `packages/express-request-attestation/test/mongo-store.test.ts` against
  `packages/express-request-attestation/src/stores/mongodb.ts` and the original
  Mongo adapter contract. All 49 existing tests passed on first
  collection; no newly surfaced defect or assertion correction was necessary.
- From `<repo-root>`, `pnpm --filter @web-ts-toolkit/express-request-attestation... build`
  passed (CJS, ESM, and declarations); `pnpm --filter @web-ts-toolkit/express-request-attestation typecheck`
  passed both configured TypeScript checks.
- `pnpm --filter @web-ts-toolkit/express-request-attestation exec vitest run --config vitest.node.config.mts test/mongo-store.test.ts`:
  **1 file / 49 tests passed**, no failures or skips.
- `pnpm --filter @web-ts-toolkit/express-request-attestation test:node`:
  **16 files / 395 tests passed**, no failures or skips; exactly **+1 file / +49 tests**
  over the recorded 15-file / 346-test baseline.
- `pnpm --filter @web-ts-toolkit/express-request-attestation exec vitest list --config vitest.node.config.mts --filesOnly`:
  listed all **16 Node files**, including `test/mongo-store.test.ts` exactly once.
  Config inspection confirmed live Redis/Mongo, `*.browser.ts`, and packed-consumer
  suites stay in their dedicated lanes, with the serial `&&` chain in
  `packages/express-request-attestation/package.json`. Those dedicated lanes were
  not executed for this task.
- `pnpm exec eslint packages/express-request-attestation/vitest.node.config.mts`:
  passed, **0 errors / 0 warnings**. `git diff --check`: passed.
- Follow-ups/blockers: none for RATT-01.

### Task RATT-02: Validate bounded request proofs before provider work

Status: completed

Kind: defect

Priority: P1 — malformed traffic causes avoidable provider work and inconsistent failures.

Suggested agent: server/protocol boundary engineer.

Dependencies: RATT-01.

Primary ownership: package `src/{middleware,verify}.ts`,
`src/shared/{canonical,codec}.ts`, corresponding protocol/middleware/order tests.

Finding: middleware loads keys before the verifier checks missing, oversized,
comma-joined, or noncanonical envelopes. Provider-thrown `AttestationError`s pass
through, potentially creating a false stale-key retry signal. Raw duplicate
`Content-Type` fields are hidden by Node's normalized headers. UTF-8 BOM removal
allows a noncanonical envelope representation. Existing field-tamper parameter
cases mutate the same envelope character instead of distinct signed fields.

References: `src/middleware.ts:205-247,408-479`,
`src/verify.ts:184-205,262-285`, `src/shared/canonical.ts:20-38`,
`src/shared/codec.ts:426-428`, `test/middleware.test.ts:327-337,399-525,672-712`,
`test/protocol.test.ts:230-258`.

Requirements:

1. Introduce a small shared proof-header preflight at the earliest middleware
   boundary; avoid decoding twice or exposing a bypass through the pure verifier.
2. Missing/duplicate/comma-joined/oversized/noncanonical proofs must fail with the
   fixed missing/malformed result before provider, store, or handler work.
3. Reject identical and conflicting raw duplicate content-type fields without
   naïvely splitting valid single-field values on commas.
4. Reject BOM-wrapped canonical envelopes at the byte/codec boundary across both
   public entries. Preserve independent v1 fixtures and exact target spelling.
5. Normalize all provider read failures to `503 ATTESTATION_KEYS_UNAVAILABLE`,
   without a stale marker or diagnostic leakage; keep clock/body/store errors distinct.
6. Replace misleading field-tamper cases with actual method/target/query/content
   type/body mutations. Preserve verify-before-reserve and final time rechecks.

Acceptance criteria:

- Counting/hanging-provider tests show zero dependency calls for invalid preflight.
- Raw HTTP duplicates and BOM fixtures are rejected with no replay allocation.
- Typed provider stale/expired exceptions yield 503 without automatic-retry marker.
- Valid independent fixtures and genuinely distinct signed-field changes retain
  correct acceptance/rejection behavior in server and browser-compatible codec.

Verification: shared build/typecheck/lint; focused protocol/middleware/order tests;
`test:node` and `test:browser`. Contract notes are handed to RATT-08.

Pre-fix regression evidence (before runtime edits, from `<repo-root>`):

- Added focused regressions in `packages/express-request-attestation/test/protocol.test.ts`,
  `packages/express-request-attestation/test/middleware.test.ts`,
  `packages/express-request-attestation/test/verification-order.test.ts`, and
  `packages/express-request-attestation/test/signer.browser.ts`.
- `pnpm --filter @web-ts-toolkit/express-request-attestation exec vitest run --config vitest.node.config.mts test/protocol.test.ts test/middleware.test.ts test/verification-order.test.ts`:
  **3 files / 116 tests: 35 failed, 81 passed**. Protocol: **7/43 failed**;
  middleware: **11/46 failed**; order: **17/27 failed**.
  Missing/malformed requests called the counting provider once; all eight invalid
  cases with a hanging provider returned 503 after its timeout instead of 403.
  BOM proofs and identical/conflicting raw Content-Type fields returned 200.
  Typed stale/expired provider throws, rejections, and snapshot accessor faults
  returned 403; typed KEYS_UNAVAILABLE errors leaked a deliberately substituted
  diagnostic message. Both codec entries allocated UTF-8 bytes for oversized
  input; envelope parsing occurred after the provider call. All 13 corrected,
  genuinely distinct field-tamper cases and their valid-request controls passed.
- `pnpm --filter @web-ts-toolkit/express-request-attestation... build`: passed
  baseline CJS/ESM/declaration emission before the built-browser reproduction.
- `pnpm --filter @web-ts-toolkit/express-request-attestation exec vitest run --config vitest.browser.config.mts test/signer.browser.ts`:
  real Chromium, **1 file / 18 tests: 1 failed, 17 passed**. The built signer
  accepted a BOM-prefixed independent fixture; ordinary WebCrypto fixtures passed.

Completion evidence:

- Changed `packages/express-request-attestation/src/middleware.ts`,
  `packages/express-request-attestation/src/verify.ts`, and
  `packages/express-request-attestation/src/shared/codec.ts`, plus the four test
  files listed above. The middleware and public verifier share bounded raw-proof
  preflight; a private continuation retains the decoded envelope across provider
  work. The order regression observes **one envelope parse, before the provider**,
  and acceptance after the provider changes the original header. Direct public
  verifier regressions reject invalid raw input even with a supplied decoded
  envelope, before reading the snapshot. Emitted
  `packages/express-request-attestation/dist/index.d.ts` and
  `packages/express-request-attestation/dist/index.d.mts` retain the public
  verifier signature and expose neither internal continuation/helper.
- Identical/conflicting raw proof and Content-Type fields reject without provider,
  replay, or handler calls; a valid single Content-Type containing a quoted comma
  succeeds. BOM-prefixed envelopes reject in both entries and built Chromium.
  Oversized envelopes fail before UTF-8 allocation. Provider throws, rejections,
  timeouts, malformed snapshots, and throwing snapshot accessors use the fixed
  operational failure; the typed-error tests also verify sanitized response and
  diagnostic payloads, no stale marker, and no replay/handler work.
- All 13 named tamper cases now change the actual field. Active alternate-key-ID,
  fresh timestamp, and nonce mutations preserve the original MAC; namespace and
  origin cases sign the wrong protection space. Each rejection leaves the valid
  original request's nonce available. The order test now corrupts MAC bytes in a
  canonical envelope, reaching INVALID_SIGNATURE rather than malformed framing.
  Independent v1 fixtures, exact target spelling, clock/body/store error mapping,
  final time rechecks, concurrent single-winner admission, and retained reservations
  after handler failure/deadline crossing/uncertain timeout pass.
- After correction, from `<repo-root>`:
  - `pnpm --filter @web-ts-toolkit/express-request-attestation... build`: passed
    CJS, ESM, and declaration emission.
  - `pnpm --filter @web-ts-toolkit/express-request-attestation typecheck`: passed
    both configured TypeScript checks, including the browser-only dependency closure.
  - `pnpm --filter @web-ts-toolkit/express-request-attestation exec vitest run --config vitest.node.config.mts test/protocol.test.ts test/middleware.test.ts test/verification-order.test.ts`:
    **3 files / 116 tests passed** (protocol **43**, middleware **46**, order **27**).
  - `pnpm --filter @web-ts-toolkit/express-request-attestation test:node`:
    **16 files / 441 tests passed**, including the **49 Mongo unit tests**;
    **+46 tests** over the RATT-01 result.
  - `pnpm --filter @web-ts-toolkit/express-request-attestation test:browser`:
    real Chromium, **2 files / 24 tests passed**, including the built-entry BOM regression.
  - `pnpm exec eslint packages/express-request-attestation/src/middleware.ts packages/express-request-attestation/src/verify.ts packages/express-request-attestation/src/shared/codec.ts packages/express-request-attestation/test/protocol.test.ts packages/express-request-attestation/test/middleware.test.ts packages/express-request-attestation/test/verification-order.test.ts packages/express-request-attestation/test/signer.browser.ts`:
    **0 errors / 0 warnings** across all seven touched code/test files.
  - `git diff --check`: passed. `git diff --quiet -- CHANGELOG.md`: passed.
    All post-fix test runs had **0 failures / 0 skips**. Node emitted experimental
    localStorage notices; Vite emitted the same dynamic-import analysis warning seen
    in the pre-fix browser run. Neither prevented execution.
- Contract handoff to RATT-08:
  - Missing/empty proofs produce fixed **403 ATTESTATION_MISSING**; duplicate,
    comma-joined, oversized, or noncanonical proofs produce fixed
    **403 ATTESTATION_MALFORMED** before provider/replay/handler work, even during
    provider unavailability. The existing **1024-byte** limit now applies before
    scanning/UTF-8 allocation, including `extractSingleHeaderValue`.
  - Raw duplicate Content-Type fields are malformed even when identical. Commas
    inside a single field remain byte-preserved. Canonical envelopes cannot begin
    with a UTF-8 BOM; this tightening applies to both public codec entries.
  - Every provider read failure yields **503 ATTESTATION_KEYS_UNAVAILABLE** with
    message `Request signing keys are unavailable.`, no stale-key retry marker,
    and no provider diagnostics. A genuine proof/key eligibility rejection still
    owns the stale-key marker. Clock, body, and replay-store failures retain their
    distinct contracts.
  - The exact v1 MAC tuple, target spelling, public named exports/verifier input,
    final deadline checks, replay-key derivation, and reservation ownership remain
    compatible; no public prevalidated-proof bypass was added.
- Follow-ups/blockers: none for RATT-02. The compatibility/documentation notes
  above are for RATT-08; no independent implementation work was promoted.

### Task RATT-03: Make signer-load generations and lazy crypto recovery reliable

Status: completed

Coordinator follow-up after RATT-06: a built-ESM three-generation probe reproduced
another instance of this task's invalidation defect. Load K1, retire it and load
K2, retire K2 while K3's module remains pending, then deliver a late
`invalidate(K1)`. The current code starts a fourth load and rejects the original
K3 waiter as superseded. The expected result is three total loads and both
waiters receiving K3. Reopened this task in its original isolated agent session;
the historical completion evidence below describes the earlier verified scope.

Kind: defect

Priority: P1 — concurrent stale responses can fail ordinary requests and obsolete loads can evict recovery.

Suggested agent: asynchronous client-lifecycle engineer.

Dependencies: RATT-02.

Primary ownership: package `src/{signer-client,request-signer}.ts`,
`test/{signer-client,signer}.test.ts`.

Finding: repeated invalidation while `active` is null increments generation and
drops a replacement load; obsolete rejection unconditionally clears the current
aborter, and obsolete timeout increments the global generation. Retirement
refetch checks key ID alone, rejecting a changed content-addressed module for the
same key. Lazy WebCrypto import failure throws the pending Promise instead of its
typed rejection, producing inconsistent error shapes for concurrent callers.

References: `src/signer-client.ts:582-589,641-655,677-714`,
`src/request-signer.ts:194-219`, `test/signer-client.test.ts:513-704`,
`test/signer.test.ts:366-438`.

Requirements:

1. Repeated stale challenges for the same retired key share one replacement
   generation; old-key challenges cannot evict a newer installed signer or its
   pending replacement, including challenges two or more rotations behind.
2. Cleanup, abort-controller ownership, and generation changes belong to the
   settling load only. Late obsolete results/failures/timeouts cannot mutate a
   replacement; disposal still cancels its metadata fetch.
3. Permit the single retirement refetch when validated module identity/URL changes
   with the same key; unchanged identity and repeated failure stop deterministically.
4. Concurrent WebCrypto import failure delivers the same typed error contract,
   clears the rejected import cache, and permits a later successful attempt.
5. Keep state bounded to current/relevant generation data; no historical key map,
   cross-tab claim, module-cache deletion claim, or retry after transport uncertainty.

Acceptance criteria:

- Deferred-load race tests cover repeated invalidations during replacement,
  obsolete rejection and timeout during a new load, disposal cancellation, and
  an older different key's invalidation during a third generation's pending load.
- One discovery/load serves concurrent replacement callers; fresh requests can
  recover after failed loads without stale installation or unhandled rejection.
- Changed-URL/same-key deployment recovery and identical-identity stop both pass.
- Concurrent rejected import tests receive `SignerClientError`, then recover.

Verification: shared build/typecheck/lint; focused signer/client tests; `test:node`.

Pre-fix regression evidence (before runtime edits, from `<repo-root>`):

- Added deferred-load, retirement-refetch, and concurrent WebCrypto regressions in
  `packages/express-request-attestation/test/signer-client.test.ts` and
  `packages/express-request-attestation/test/signer.test.ts`.
- `pnpm --filter @web-ts-toolkit/express-request-attestation... build`: passed
  baseline CJS, ESM, and declaration emission before tests that read `dist`.
- `pnpm --filter @web-ts-toolkit/express-request-attestation exec vitest run --config vitest.node.config.mts test/signer-client.test.ts test/signer.test.ts`:
  **2 files / 65 tests: 12 failed, 53 passed**. Client: **10/36 failed**;
  signer: **2/29 failed**; no skips or unhandled-rejection reports.
  Repeated stale challenges rejected **8 of 9** replacement callers in both
  metadata and module phases. The recovery load after a failed replacement was
  also superseded. Obsolete discovery rejection left the current metadata signal
  un-aborted on disposal; obsolete timeout superseded the replacement for both
  late native-loader resolve/reject cases. Same-key changed-URL refetches stopped
  at the first import/validation error, and an invalid refetched URL was never
  validated. Both rejected and synchronously throwing WebCrypto imports gave the
  first concurrent caller a **Promise** rejection reason instead of
  `SignerClientError`; the real-WebCrypto recovery controls already succeeded.

Completion evidence:

- Changed `packages/express-request-attestation/src/signer-client.ts`,
  `packages/express-request-attestation/src/request-signer.ts`,
  `packages/express-request-attestation/test/signer-client.test.ts`, and
  `packages/express-request-attestation/test/signer.test.ts`.
- Repeated invalidations retain one protocol-validated, currently invalidated key
  ID across replacement failures; successful installation/disposal releases it.
  The client retains one active signer and one current pending load, without a
  historical key map. Both gated metadata/module cases now serve **9 concurrent
  replacement callers with 1 replacement discovery / 1 replacement import**;
  including the initial signer, each case totals **2 discoveries / 2 imports**.
  Repeated challenges also share explicit recovery after a failed replacement,
  and late old-key challenges preserve the newer installed signer.
- Load cleanup releases only its own pending promise, abort controller, and timer.
  Timeout generation changes require ownership of the current pending generation.
  The obsolete-rejection regression verifies that disposal aborts the replacement
  metadata signal and prevents its import. Fake-time cases expire an obsolete
  module load at **50 ms**, while the replacement's deadline is **60 ms**; both
  late native-loader success and rejection leave the replacement shared and
  installable, with **0 remaining timers** and no extra discovery/import.
- Retirement identity is the key ID plus the resolved, validated absolute module
  URL. Both import and module-validation failures recover through the one refetch
  when the URL changes under the same key. Identical and relative/absolute-equivalent
  URLs stop at **2 discoveries / 1 import** and preserve the original error.
  A second import failure stops at **2 discoveries / 2 imports**, for either the
  same or a changed key; a later explicit call can recover. An invalid refetched
  origin returns `SIGNER_ORIGIN_MISMATCH` without a second import.
- Lazy WebCrypto import rejection now rethrows the typed error and clears only its
  own rejected cache. For both asynchronous rejection and synchronous throw,
  **3 concurrent callers receive the same `SignerClientError` instance**, code
  `SIGNER_PREPARATION_FAILED`, with the original cause and no signing calls.
  A subsequent group of **3 callers**, plus a cached call, matches the independent
  committed v1 proof using real WebCrypto: **2 import attempts total**, one failed
  and one successful. Updated signer lifecycle comments survive both emitted
  `packages/express-request-attestation/dist/signer.d.ts` and
  `packages/express-request-attestation/dist/signer.d.mts`; public signatures and
  named exports remain compatible.
- After correction, from `<repo-root>`:
  - `pnpm --filter @web-ts-toolkit/express-request-attestation... build`: passed
    CJS, ESM, and declaration emission.
  - `pnpm --filter @web-ts-toolkit/express-request-attestation typecheck`: passed
    both configured TypeScript checks, including the browser-only dependency closure.
  - `pnpm --filter @web-ts-toolkit/express-request-attestation exec vitest run --config vitest.node.config.mts test/signer-client.test.ts test/signer.test.ts`:
    **2 files / 65 tests passed** (client **36**, signer **29**).
  - `pnpm --filter @web-ts-toolkit/express-request-attestation test:node`:
    **16 files / 456 tests passed**, **+15 tests** over the RATT-02 result.
  - `pnpm exec eslint packages/express-request-attestation/src/signer-client.ts packages/express-request-attestation/src/request-signer.ts packages/express-request-attestation/test/signer-client.test.ts packages/express-request-attestation/test/signer.test.ts`:
    **0 errors / 0 warnings** across all four touched code/test files.
  - `git diff --check`: passed. `git diff --quiet -- CHANGELOG.md`: passed.
    All post-fix test runs had **0 failures / 0 skips / 0 unhandled-rejection reports**.
    Node emitted the existing experimental localStorage notices. The dedicated
    browser/live-store/packed-consumer lanes are not RATT-03 gates and were not run.
- Contract handoff to RATT-08:
  - Repeated stale challenges for the currently invalidated key share the pending
    replacement, including explicit recovery after a previous replacement failed.
    A different active key is preserved. Malformed observed key IDs are ignored
    using the protocol key-ID validator before retaining invalidation state.
  - The single retirement refetch compares validated `(keyId, absolute module URL)`
    identity. A same-key deployment with a changed module URL can recover; an
    equivalent URL is unchanged identity, and a second module failure terminates
    that load. This does not add retries of signed API requests or transport uncertainty.
  - `dispose()` remains terminal and signals cancellation to the current metadata
    fetch. Timeout/disposal cannot cancel native module execution or erase the
    browser module cache; late results cannot install a signer or alter a newer load.
  - Lazy import failures consistently reject with `SignerClientError`; concurrent
    signs share the failed attempt, and a later explicit sign may retry the import.
- Follow-ups/blockers: none for RATT-03. RATT-08 owns the documentation handoff
  above; RATT-04 retains the separately scheduled metadata/body-stream work.

Follow-up after RATT-06 — older-key invalidation during replacement:

- Root cause: `invalidatedKeyId === observedKeyId` recognizes only the most
  recently invalidated key. While K3 replaces K2, a late K1 challenge therefore
  advances the generation and drops K3's pending load. Invalidation coalescing
  needs to track the replacement phase until installation, rather than compare
  the challenge with one retired key ID; no historical key map is needed.
- Added four focused cases in
  `packages/express-request-attestation/test/signer-client.test.ts`: K1/K2/K3
  races during metadata loading, module loading, and explicit recovery after
  failed replacement discovery, plus an installed same-key re-invalidation
  control using the same signer object and module URL.
- Before this follow-up's runtime edit, from `<repo-root>`,
  `pnpm --filter @web-ts-toolkit/express-request-attestation exec vitest run --config vitest.node.config.mts test/signer-client.test.ts`:
  **1 file / 52 tests: 3 failed, 49 passed**, no skips or unhandled-rejection
  reports. All **48 prior client tests**, including intentional initial-load
  invalidation and the RATT-04 stream tests, plus the new same-key control passed.
  Both ordinary K3 races produced **4 discoveries / 4 imports** instead of 3/3;
  explicit recovery produced **5 discoveries / 4 imports** instead of 4/3. In all
  three cases the original K3 waiter rejected as superseded and its peer received
  a different pending promise, reproducing the coordinator's acceptance gap.

Follow-up completion evidence:

- Changed the invalidation lifecycle in
  `packages/express-request-attestation/src/signer-client.ts` and added the four
  cases above in `packages/express-request-attestation/test/signer-client.test.ts`.
  A single `awaitingReplacement` boolean replaces the retired-key marker. After
  an invalidation is handled, further challenges cannot supersede its replacement
  until a signer installs; failures retain this phase for explicit recovery.
  Successful installation/disposal resets the phase. No key history is retained.
- Both metadata/module K1/K2/K3 races now finish with **3 discoveries / 3 imports**;
  both waiters share the same pending promise and receive K3. The failed-discovery
  recovery case finishes with **4 discoveries / 3 imports**, including its one
  deliberate 503. The same-key control performs **3 discoveries / 3 imports** over
  two successive invalidations even when every import returns the same signer
  object and URL. Existing initial-load invalidation, obsolete settlement/timeout,
  disposal, one-refetch, lazy-crypto, and bounded-reader regressions pass.
- Required checks after correction, from `<repo-root>`:
  - `pnpm --filter @web-ts-toolkit/express-request-attestation... build`: passed
    CJS, ESM, and declaration emission. The built
    `packages/express-request-attestation/dist/signer.mjs` contains the phase guard;
    the multi-rotation lifecycle comment survives both signer declaration entries.
  - `pnpm --filter @web-ts-toolkit/express-request-attestation typecheck`: passed
    both TypeScript checks, including browser-only `types: []` closure.
  - `pnpm --filter @web-ts-toolkit/express-request-attestation exec vitest run --config vitest.node.config.mts test/signer-client.test.ts test/signer.test.ts`:
    **2 files / 81 tests passed** (client **52**, signer **29**); the client suite
    adds **4 follow-up tests** to the 48-test RATT-04 baseline.
  - `pnpm --filter @web-ts-toolkit/express-request-attestation test:node`:
    **17 files / 565 tests passed**, including the RATT-04/05/06 stream, ownership,
    and transport tests and the Node-lane native Chromium checks.
  - `pnpm exec eslint packages/express-request-attestation/src/signer-client.ts packages/express-request-attestation/test/signer-client.test.ts`:
    **0 errors / 0 warnings** across both touched code/test files.
  - `git diff --check`: passed. `git diff --quiet -- CHANGELOG.md`: passed.
    Post-fix test runs had **0 failures / 0 skips / 0 unhandled-rejection reports**;
    Node emitted the existing experimental localStorage notices.
- Corrected handoff to RATT-08: this follow-up supersedes the earlier one-key
  invalidation-state description. Pending replacements and their explicit recovery
  attempts coalesce challenges from any older issued key, including multiple
  rotations behind. Initial-load invalidation remains supported, and an installed
  signer remains invalidatable again even under the same key ID.
- Follow-ups/blockers: none. The coordinator-confirmed acceptance gap is closed;
  RATT-03 is completed with the expanded criteria verified.

### Task RATT-04: Enforce streaming byte, work, deadline, and cancellation bounds

Status: completed

Kind: defect

Priority: P1 — advertised metadata/body limits do not currently bound memory and work.

Suggested agent: browser stream/resource engineer.

Dependencies: RATT-03.

Primary ownership: package `src/{request-body,signer-client}.ts`, a small internal
browser-safe stream helper if justified, and focused client/failure-limit tests.

Finding: metadata is fully accumulated by `arrayBuffer()`/`text()` before the
4096-byte check. Body reading retains a copied object for each chunk, including
empty chunks; an immediately productive empty stream can starve the timeout.
Timeout/abort use `void reader.cancel()` with synchronous catch only, so rejected
cancellation can escape as an unhandled rejection.

References: `src/signer-client.ts:285-323`, `src/request-body.ts:234-346`,
`test/signer-client.test.ts:285-315`, `test/failure-limits.test.ts:508-535`.

Requirements:

1. Read native metadata bodies incrementally; reject and cancel at cap overflow
   without waiting for EOF or importing a module. Propagate cancellation.
2. Bound retained body bookkeeping by byte capacity through coalesced/geometric
   storage; ignore empty chunks without an unbounded object list. Ensure productive
   empty/tiny streams cannot starve deadlines or caller abort.
3. Own and release readers/listeners/timers; absorb cancellation rejection and do
   not await an indefinitely pending cancellation before reporting failure.
4. Centralize shared stream mechanics where it removes duplicate ownership logic,
   while preserving public error classes and exact byte/UTF-8/body serialization.
5. Preserve the existing body limits/timeouts and client load bound. If standalone
   metadata reading gains a deadline, state its precise scope/default and update
   public documentation; do not imply native module evaluation is cancelable.

Acceptance criteria:

- An oversized never-ending metadata stream rejects before EOF with no import.
- Empty-chunk flood, tiny chunks, stalled read, mid-read abort, rejecting cancel,
  and never-settling cancel terminate within the configured boundary without an
  unhandled rejection or unbounded retained chunk list.
- Exact finite bytes, multipart boundaries, cap equality, and UTF-8 handling pass.
- Record a reproducible bounded-resource experiment (input size/chunk pattern,
  consumed work/deadline outcome). Any speed claim includes measured evidence.

Verification: shared build/typecheck/lint; focused client/failure-limit tests;
`test:node` and `test:browser`.

Execution notes:

- RATT-03 is completed; its generation ownership, invalidation, retirement
  identity, and lazy-crypto recovery edits are intentional baseline work.
- The shared reader will own incremental byte accounting, geometric storage,
  cooperative deadline/abort checks, cancellation, and reader/timer/listener
  cleanup. Native metadata bodies use this reader; whole-value-only response
  substitutes cannot provide the advertised incremental cap and will reject.
- Standalone `fetchSignerBundle` will add a fixed **5000 ms response-body read
  deadline**, starting after the metadata response arrives. It does not bound
  waiting for response headers or module import/evaluation. `createSignerClient`
  retains its configurable **whole-load** deadline across discovery, body reading,
  import, and the one retirement refetch, without an extra 5000 ms per-body limit.
  Shipped README/JSDoc will state this distinction precisely.

Pre-fix regression evidence (before runtime edits, from `<repo-root>`):

- Added `packages/express-request-attestation/test/request-body.test.ts` to the
  explicit Node config and native-stream regressions to
  `packages/express-request-attestation/test/signer-client.test.ts`.
- `pnpm --filter @web-ts-toolkit/express-request-attestation... build`: passed
  baseline CJS, ESM, and declaration emission.
- `pnpm --filter @web-ts-toolkit/express-request-attestation exec vitest run --config vitest.node.config.mts test/signer-client.test.ts test/failure-limits.test.ts test/request-body.test.ts`:
  **3 files / 81 tests: 19 failed, 62 passed**, plus **3 unhandled cancellation
  rejections**. Client: **11/48 failed**; body: **8/16 failed**; existing failure
  limits: **17/17 passed**. All 36 pre-existing client tests passed.
  Discovery remained pending after 4097 bytes without EOF, did not react to
  mid-body abort, and had no standalone 5000 ms body-read deadline. Native
  whole-response readers stayed locked after finite consumption. ArrayBuffer/text-only
  substitutes still buffered/imported. Productive empty metadata exhausted its
  finite test fuse rather than the configured whole-load timeout.
- Body limit/invalid-chunk failures waited on never-settling cancellation until
  timeout. Timer-driven abort and elapsed-time checks lost to productive empty
  and one-byte streams. Rejecting/throwing cancellation on timeout and rejecting
  cancellation on abort escaped as the three unhandled rejections.
- Reproducible experiment in `packages/express-request-attestation/test/request-body.test.ts`
  (`-t 'bounded-resource experiment'` selects it): **32768 one-byte chunks +
  32768 empty chunks**, with two reused input views and no prefetch, caused
  **65537 typed-array allocations / 65536 allocated byte capacity** for 32768
  output bytes. The zero-byte flood with a **20 ms** deadline consumed its entire
  **100000-chunk fuse + EOF** and incorrectly fulfilled after **108.58 ms**, with
  **0 cancellations**. These are allocation/work observations, not throughput
  benchmarks; the finite fuses keep old-code reproduction bounded.

Completion evidence:

- Changed `packages/express-request-attestation/src/request-body.ts` and
  `packages/express-request-attestation/src/signer-client.ts` to share the new
  internal `packages/express-request-attestation/src/bounded-byte-stream.ts`.
  The helper owns one reader and one operation-wide stop race, checks overflow
  before copying/reading EOF, ignores empty chunks, and grows one byte buffer
  geometrically up to the cap (at most two capped buffers during growth/trim).
  It checks a supplied read deadline before/after each read and yields a task
  every **128 chunks**, including empty chunks. It initiates cancellation once
  on failure, observes rejection without awaiting cancellation, releases the
  reader lock/listener/deadline/yield timer, and discards late read work.
- Added `packages/express-request-attestation/test/request-body.test.ts` to
  `packages/express-request-attestation/vitest.node.config.mts`; expanded
  `packages/express-request-attestation/test/signer-client.test.ts`; added
  built-entry Chromium coverage in
  `packages/express-request-attestation/test/stream-limits.browser.ts`.
  Native metadata rejects at **4097 bytes / 2 pulls**, before EOF, with one
  cancellation and zero imports, including rejecting/never-settling cancellation.
  Body limit/invalid-chunk errors now report immediately despite pending cancel.
  Stalled reads, mid-read abort, productive empty/one-byte chunks, and throwing/
  rejecting/pending cancellation pass with released locks/listeners and zero
  remaining owned timers. Deterministic elapsed-clock tests stop at **20 reads /
  20 ms**. Exact cap equality, reused offset views, BOM/binary/UTF-8 bytes,
  split metadata UTF-8, malformed UTF-8, and native multipart boundaries pass.
- Preserved public error classes and configured body limits/deadlines, plus
  RATT-03 generation/invalidation/retirement and lazy-crypto ownership behavior.
  The focused lane includes all **36 pre-existing client tests / 29 signer
  tests**, plus finite-body/prepared-fetch compatibility tests. A configured
  **10000 ms** client load successfully reads metadata delivered at **6000 ms**;
  no additional standalone 5000 ms read limit is imposed on client loads.
- Updated `packages/express-request-attestation/README.md` and focused public
  JSDoc. Confirmed the read/deadline/cancellation contract survives both
  `packages/express-request-attestation/dist/signer.d.ts` and
  `packages/express-request-attestation/dist/signer.d.mts`. The helper stays
  internal; public named exports/signatures remain compatible.
- Final required checks from `<repo-root>` (build/typecheck/test lanes serialized):
  - `pnpm --filter @web-ts-toolkit/express-request-attestation... build`: passed
    CJS, ESM, and declaration emission.
  - `pnpm --filter @web-ts-toolkit/express-request-attestation typecheck`: passed
    both TypeScript checks, including browser-only `types: []` dependency closure.
  - `pnpm --filter @web-ts-toolkit/express-request-attestation exec vitest run --config vitest.node.config.mts test/signer-client.test.ts test/failure-limits.test.ts test/request-body.test.ts test/signer.test.ts test/fetch-client.test.ts`:
    **5 files / 134 tests passed** (client **48**, failure limits **17**, body
    **16**, signer **29**, fetch **24**).
  - `pnpm --filter @web-ts-toolkit/express-request-attestation test:node`:
    **17 files / 484 tests passed**, **+1 file / +28 tests** over RATT-03,
    including the 49 Mongo unit tests and Node-lane native Chromium checks.
  - `pnpm --filter @web-ts-toolkit/express-request-attestation test:browser`:
    real Chromium against built ESM, **3 files / 33 tests passed**, **+1 file /
    +9 tests** over the prior 24-test browser baseline.
  - `pnpm exec eslint packages/express-request-attestation/src/bounded-byte-stream.ts packages/express-request-attestation/src/request-body.ts packages/express-request-attestation/src/signer-client.ts packages/express-request-attestation/test/request-body.test.ts packages/express-request-attestation/test/signer-client.test.ts packages/express-request-attestation/test/stream-limits.browser.ts packages/express-request-attestation/vitest.node.config.mts`:
    passed, **0 errors / 0 warnings** across all seven touched code/test/config files.
  - `git diff --check`: passed. `git diff --quiet -- CHANGELOG.md`: passed.
    Required focused/Node/browser lanes had **0 failures / 0 skips / 0 unhandled
    rejection reports**. Existing Node localStorage notices and Vite's dynamic-import
    analysis warning did not prevent execution.
- Reproducible bounded-resource experiment, with console capture disabled to show
  measurements from the final implementation:
  - `pnpm --filter @web-ts-toolkit/express-request-attestation exec vitest run --config vitest.node.config.mts test/request-body.test.ts -t 'bounded-resource experiment' --reporter=verbose --disableConsoleIntercept`:
    **2 selected tests passed**; the other **14 were deselected by `-t`** and
    passed in the required focused/Node runs above.
  - The same **32768 one-byte + 32768 empty chunks / 65536 data pulls** now use
    **6 typed-array allocations**, **64512 aggregate allocated byte capacity**,
    and **32768 bytes largest allocation**, with exact output bytes. Instrumentation
    counts constructor/slice allocations without retaining the observed arrays;
    it does not measure whole-process heap, producer queues, or throughput.
  - The **zero-byte flood, 1024-byte cap, 20 ms deadline** rejected after
    **1664 pulls / 19.95 ms measured elapsed**, with **1 cancellation** and an
    unlocked reader, instead of consuming the 100000-chunk fuse. Wall-time and
    pull counts are observations of this run, not throughput guarantees.
- Contract handoff to RATT-08:
  - Discovery requires a standard readable byte-stream response; whole-value-only
    `arrayBuffer()`/`text()` substitutes reject. Its **4096-byte** cap is enforced
    during reading, before EOF/import. Read/limit/abort failures retain
    `SignerClientError` / `SIGNER_LOAD_FAILED`.
  - Standalone `fetchSignerBundle` has a fixed **5000 ms** deadline starting when
    response-body reading begins after the accepted response arrives. It excludes
    waiting for response headers and module import/evaluation. `signal` propagates
    to native discovery fetch/read. The explicit scope test permits a **6000 ms
    header wait** and a separate **6000 ms module wait**.
  - `createSignerClient.loadTimeoutMs` remains the **whole-load** bound across
    headers/body/import/one refetch: default **5000 ms**, integer range **1–60000**,
    expiry `SIGNER_LOAD_TIMEOUT`. Timeout stops waiting; disposal prevents late
    installation. Neither can cancel native module evaluation or erase its cache.
  - Body cap remains **1 MiB default / 16 MiB hard cap**; read deadline remains
    **5000 ms default / 1–60000 ms** (`bodyReadTimeoutMs` on the wrapper, `timeoutMs`
    on materialization). Finite bytes and FormData serialization stay exact;
    body failures use `SIGNER_PREPARATION_FAILED`, caller abort its exact reason.
    Cancellation is a nonblocking signal with observed rejection, not a guarantee
    of producer cleanup completion. Storage bounds cover reader-owned buffers.
- Follow-ups/blockers: none for RATT-04. RATT-08 owns integration of these shipped
  contract notes with the other task handoffs; no independent implementation
  finding was promoted.

### Task RATT-05: Preserve caller requests and readable stale-response fallbacks

Status: completed

Kind: defect

Priority: P1 — authentication retry composition and HTTP error handling break on supported inputs.

Suggested agent: Fetch ownership/retry engineer.

Dependencies: RATT-04.

Primary ownership: package `src/attested-fetch.ts`, relevant request-body contract
comments, `test/fetch-client.test.ts`, focused browser Fetch tests.

Finding: `new Request(input, init)` followed by reading consumes inherited POST
bodies despite the reuse promise. The wrapper cancels the stale response before
reload, then returns that canceled response on reload failure. Awaiting response
cancellation can hang forever, including a tee whose other branch stays unread.

References: `src/attested-fetch.ts:488-532,554,586-605`,
`src/request-body.ts:164-168`, `test/fetch-client.test.ts:359-394,765-796`,
README request reuse/readable-response contract.

Requirements:

1. Clone caller-owned bodies when inherited, preserving original readability and
   supporting concurrent/repeated use of finite POST Requests. Retain correct
   used/locked rejection and explicit `init.body` override semantics.
2. Keep the first HTTP response untouched until a valid second request is prepared.
   If reload or defensive same-envelope handling falls back, return readable data.
3. Once retry is selected, dispose of the abandoned response safely without an
   unbounded wait. Track internal ownership and reject/abort paths explicitly.
4. Preserve one materialized body/serialization and at most one stale-only retry,
   fresh nonces, manual redirects, credentials, and no uncertain-request retries.
   Reuse the snapshot's body digest across attempts if removing repeated hashing;
   record digest-call/allocation evidence rather than an assumed speedup.

Acceptance criteria:

- Finite POST Request reuse and concurrent wrappers leave the original readable,
  send identical bytes, and mint distinct proofs; used/locked cases stay controlled.
- Reload failure and defensive same-envelope fallback return readable JSON/text.
- Never-settling or rejecting response cancellation cannot block retry/abort or
  create an unhandled rejection; at most two API attempts and one handler remain.

Verification: shared build/typecheck/lint; focused fetch/failure tests;
`test:node` and `test:browser`.

Execution notes:

- RATT-04 is completed. Its shared bounded reader, cancellation ownership, and
  intentional baseline of **17 Node files / 484 tests** and **3 Chromium files /
  33 tests** are the starting point for this task.
- Regressions will distinguish native inherited bodies (`init.body` absent,
  `undefined`, or `null`) from non-null overrides, including empty overrides.
  Request-clone branches and abandoned responses need explicit internal ownership;
  cancellation must be nonblocking and its rejection observed.
- The first stale response must remain readable throughout reload/signing/request
  construction. Record native ownership assumptions and any tightened abort/failure
  behavior here for RATT-08, together with measured digest calls if hashing changes.
- Necessary native-ownership finding: real Chromium's
  `new Request(callerRequest, { body: replacement })` disturbs the caller's body
  even for non-null/empty replacements; Node does not. Used/locked originals cannot
  simply be cloned for this path. Explicit overrides therefore need a bodyless
  copy of the supported native request settings, then native init application.
  Sample `init.body` once so ownership selection and construction use the same
  value, including dictionary getters/prototype properties.
- Abort during signer waiting/cancellation must abandon only this invocation's
  owned streams and reject with the caller's reason. The shared signer client
  remains caller-owned; late load/crypto settlement must not send a request.

Pre-fix regression evidence (before runtime edits, from `<repo-root>`):

- Added `packages/express-request-attestation/test/fetch-ownership.cases.ts`, run
  by `packages/express-request-attestation/test/fetch-client.test.ts` against source
  and `packages/express-request-attestation/test/fetch-end-to-end.browser.ts` against
  built ESM. Strengthened the existing reload-failure test to read its JSON body.
- `pnpm --filter @web-ts-toolkit/express-request-attestation... build`: passed
  baseline CJS, ESM, and declaration emission.
- `pnpm --filter @web-ts-toolkit/express-request-attestation exec vitest run --config vitest.node.config.mts test/fetch-client.test.ts test/failure-limits.test.ts`:
  **2 files / 71 tests: 25 failed, 46 passed** (fetch **25/54 failed**, failure
  limits **17/17 passed**). Inherited POST requests became used/locked, concurrent
  reuse failed, stale fallbacks were consumed, and retry construction leaked its
  header error. Pending cancellation/native response tees and initial signer-load
  abort exceeded the bounded **500 ms test fuse**. Cancellation occurred with only
  the first signed request constructed; cancellation-triggered abort still sent a
  retry with the injected transport. No unhandled-rejection reports or skips.
- `pnpm --filter @web-ts-toolkit/express-request-attestation exec vitest run --config vitest.browser.config.mts test/fetch-end-to-end.browser.ts`:
  real Chromium, **1 file / 36 tests: 26 failed, 10 passed**, no skips or unhandled
  rejections. Reproduced the same defects plus disturbance of unread/locked original
  bodies on explicit overrides. Native Request probes independently confirmed that
  `undefined`/`null` inherit, while `''`/replacement bodies override even used/locked
  inputs; Chromium additionally disturbs the original on those override paths.
- Both runtimes' `digest-call experiment` observed **2 API attempts / 2 SHA-256
  digest calls**, each on **32768 bytes**, and **64 aggregate digest-result bytes**
  (two native 32-byte result buffers). The one-attempt control already passed with
  **1 digest / 32 result bytes**. This measures calls/result buffers, not internal
  WebCrypto allocation, process heap, or throughput.
- Added three further cases for overridden settings/FormData serialization,
  accessor consistency, and explicit-stream ownership. Both commands below selected
  **3 tests: 2 failed, 1 passed**, with no unhandled rejections:
  - `pnpm --filter @web-ts-toolkit/express-request-attestation exec vitest run --config vitest.node.config.mts test/fetch-client.test.ts -t 'preserves inherited settings|samples init.body|owns an explicit stream'`
    (**54 other tests deselected**).
  - `pnpm --filter @web-ts-toolkit/express-request-attestation exec vitest run --config vitest.browser.config.mts test/fetch-end-to-end.browser.ts -t 'preserves inherited settings|samples init.body|owns an explicit stream'`
    (**36 other tests deselected**).
    `init.body` was read **4 times**, allowing ownership selection and construction
    to disagree; accepted explicit streams were not cancelled on pre-read rejection.
    The first selected Node run also had one incorrect referrer-policy expectation:
    native probes confirmed Fetch resets inherited referrer policy with a nonempty
    init dictionary. The regression now supplies an explicit policy; this native
    behavior was preserved rather than treated as an implementation defect.

Completion evidence:

- Changed `packages/express-request-attestation/src/attested-fetch.ts`, ownership
  JSDoc in `packages/express-request-attestation/src/request-body.ts`, and
  `packages/express-request-attestation/test/{fetch-client.test.ts,fetch-end-to-end.browser.ts,fetch-ownership.cases.ts}`.
  The shared test cases execute **33 native ownership regressions per runtime**,
  against source in Node and the built signer entry in Chromium. The existing
  reload-failure regression now actually reads JSON; the live rotation regression
  counts API attempts/reservations/effects and uses a caller-owned POST Request.
- Inherited bodies are cloned synchronously before the first asynchronous read.
  The preparation owner tracks the clone until native construction succeeds,
  then the base Request until transferring cancellation responsibility to the
  RATT-04 bounded reader. Constructor/origin/encoding/pre-abort failures release
  only the owned branch. Used/locked inherited bodies fail before cloning,
  signer work, or API transport. Explicit non-null overrides use a bodyless
  native-settings template, avoiding Chromium's input-body disturbance and any
  unnecessary tee; `init.body` is sampled **once**, including accessors and
  inherited/non-enumerable dictionary properties.
- Both runtimes pass two successive authentication-wrapper calls with identical
  original bytes and different proofs, and **6 simultaneous multipart calls +
  1 subsequent call** with **7 distinct proofs/nonces**, identical bytes and
  boundary, and an original Request still readable by its caller. Unread/used/
  locked originals accept independent empty-string, zero-byte, and replacement
  overrides. Explicit FormData is serialized **once** and parsed with its generated
  content type; credentials, Authorization, explicit/inherited signals, request
  settings, native init precedence, and manual redirects pass.
- The first stale response is read only through status/headers until a fresh
  second Request is constructed. Reload/signing/construction failures and a
  repeated envelope return that **same Response**, unlocked/unconsumed, with
  readable **JSON and text**. Gated replacement discovery/signing observes zero
  cancellation before preparation. Native-constructor instrumentation observes
  **2 signed Requests already constructed when disposal begins**, versus 1 before
  correction. Never-settling/rejecting/synchronously throwing cancellation and a
  native response tee with an unread, subsequently readable sibling cannot delay
  the retry or leak a rejection.
- Caller abort stops initial/replacement signer waiting without disposing the
  shared client. Late shared-load rejection is observed and sends no request.
  Abort triggered by response cancellation rejects with the exact caller reason,
  releases the already-built unsent retry body, and leaves **1 API attempt**.
  Retry transport uncertainty propagates after **2 attempts / 1 possible effect**,
  with no third attempt. Live Express rotation records **2 API attempts / 1 new
  reservation / 1 handler effect / 1 replacement discovery** after the warm-up
  (totals **3 attempts / 2 reservations / 2 effects / 2 discoveries**), identical
  captured JSON digests/content types, fresh nonces, and a readable original POST.
- Digest caching is local to the immutable byte snapshot, lazy after protection-
  space validation, and shared only between this invocation's attempts. The final
  instrumented focused run below measured the same **32768-byte** input:
  **1 API attempt / 1 digest / 32 result bytes** for the control and **2 API
  attempts / 1 digest / 32 result bytes** for a stale retry (previously **2 digests /
  64 result bytes**). Both proofs bind the fixed independent SHA-256 fixture value;
  caller byte/header mutation after the first send cannot change either attempt.
  Chromium executes the same count/byte assertions. These are digest-call/native
  result-buffer observations, not total allocation or throughput claims.
- Required checks from `<repo-root>` (build and test lanes serialized):
  - `pnpm --filter @web-ts-toolkit/express-request-attestation... build`: passed
    CJS, ESM, and declaration emission, including the final ownership-JSDoc build.
  - `pnpm --filter @web-ts-toolkit/express-request-attestation typecheck`: passed
    both configured checks, including browser-only `types: []` dependency closure.
  - `pnpm --filter @web-ts-toolkit/express-request-attestation exec vitest run --config vitest.node.config.mts test/fetch-client.test.ts test/failure-limits.test.ts --disableConsoleIntercept`:
    **2 files / 74 tests passed** (fetch **57**, failure limits **17**), with the
    digest observations above printed. This exposed an existing unawaited assertion
    in the touched Fetch suite; added its missing `await` before the final Node run.
  - `pnpm --filter @web-ts-toolkit/express-request-attestation test:node`:
    **17 files / 517 tests passed**, **+33 tests** over RATT-04's 484, including all
    49 Mongo unit tests and the Node-lane native Chromium checks.
  - `pnpm --filter @web-ts-toolkit/express-request-attestation test:browser --disableConsoleIntercept`:
    real Chromium against built ESM, **3 files / 66 tests passed**, **+33 tests**
    over RATT-04's 33 (Fetch **39**, signer **18**, stream limits **9**).
  - `pnpm exec eslint packages/express-request-attestation/src/attested-fetch.ts packages/express-request-attestation/src/request-body.ts packages/express-request-attestation/test/fetch-client.test.ts packages/express-request-attestation/test/fetch-end-to-end.browser.ts packages/express-request-attestation/test/fetch-ownership.cases.ts`:
    passed, **0 errors / 0 warnings** across all five touched code/test files.
  - `git diff --check`: passed. `git diff --quiet -- CHANGELOG.md`: passed.
    All required post-fix focused/Node/Chromium runs had **0 failures / 0 skips /
    0 unhandled-rejection reports**. Existing Node localStorage notices and Vite's
    dynamic-import analysis warning did not prevent execution. Final JSDoc inspection
    in `packages/express-request-attestation/dist/signer.d.ts` and
    `packages/express-request-attestation/dist/signer.d.mts` confirms the public
    ownership/fallback contract survives emit; the new helpers remain internal.
- Exact native ownership assumptions and contract handoff to RATT-08:
  - Evidence: `packages/express-request-attestation/src/attested-fetch.ts`
    (`prepareSnapshot`, `copyRequestWithoutBody`, `cancelOwnedBody`,
    `withPreparationAbort`, `send`) and
    `packages/express-request-attestation/test/fetch-ownership.cases.ts`.
    Supported inputs use the standard same-realm Fetch Request/byte-stream APIs.
    `Request.clone()` tees the body and can replace the Request's internal stream:
    reuse means the **original Request's current body remains readable**, not that
    a previously retained raw stream reference keeps its identity/lock state.
    Start inherited-body calls before the caller uses, locks, or cancels that body.
  - An omitted, `undefined`, or `null` `init.body` inherits the original body;
    null does **not** remove it. A non-null replacement, including `''` or zero
    bytes, overrides it. Independent replacement bodies leave the original alone
    even if it was used/locked. An explicitly supplied ReadableStream transfers
    reading/cancellation ownership only after native construction succeeds,
    **including an explicit alias of the original's body**; that consumptive
    stream path is not an original-Request reuse guarantee. Construction failure
    leaves an unaccepted explicit stream caller-owned.
  - The bodyless template copies URL/method/headers/credentials/signal/mode/cache/
    referrer/referrerPolicy/integrity/keepalive/redirect, then native Request applies
    init. Header replacement and inherited content type follow native Fetch rules;
    a nonempty init resets inherited referrer policy unless explicitly supplied.
    Signed attempts always use manual redirects. `init.body` getter evaluation is
    tightened to one sampled value, preventing ownership/construction disagreement.
  - Native tees may retain bytes for an unread caller branch and defer producer
    cancellation until all branches finish/cancel. Caps/deadlines still govern
    reader-owned work/storage, not native tee/producer queues. Cancellation signals
    abandonment and observes rejection; it never guarantees completed producer or
    connection cleanup. The RATT-04 reader owns cancellation after handoff;
    `materializeRequestBodyBytes` itself **consumes**, rather than clones, its input.
  - Retry-construction failure now joins reload/signing/same-envelope fallback and
    returns readable original HTTP data. Caller abort instead rejects with its
    exact reason and abandons only invocation-owned bodies. Preparation waiting
    is abortable; shared signer loads/native module or crypto execution are not
    cancelled/disposed by the wrapper. Native Fetch (or the injected transport)
    owns dispatched/locked request readers and must honor the forwarded signal;
    no new transport deadline or network-uncertainty retry is introduced.
- Follow-ups/blockers: none for RATT-05. RATT-08 owns reconciliation of these
  ownership, getter, fallback, and abort notes into shipped guidance. RATT-06
  remains pending; no independent implementation finding was promoted.

### Task RATT-06: Reject browser modes and headers that cannot carry a proof

Status: completed

Kind: defect

Priority: P1 — browser header guards can silently send an unsigned request.

Suggested agent: browser transport-boundary engineer.

Dependencies: RATT-05.

Primary ownership: package `src/attested-fetch.ts`, browser-specific validation
helper if needed, `test/fetch-end-to-end.browser.ts`, focused Node fetch tests.

Finding: the wrapper preserves `mode: 'no-cors'` and accepts token-valid browser
forbidden header names such as `sec-proof`. Native Request/Fetch guards can strip
the proof while the wrapper still invokes transport. A correctly mounted verifier
rejects this; it is a client contract defect, not a server authentication bypass.

References: `src/attested-fetch.ts:369-416`, shared `validateHeaderName`,
`test/fetch-end-to-end.browser.ts:85-189`.

Requirements:

1. Fail locally on incompatible Fetch mode and configured browser-forbidden proof
   fields before body preparation/signer/network work when statically knowable.
2. Verify the constructed signed request retains the expected proof header; avoid
   relying only on an unrestricted temporary `Headers` object.
3. Keep browser transport validation separate from general server HTTP token
   validation where appropriate. Preserve supported custom headers and modes.

Acceptance criteria:

- Real Chromium tests prove no-cors and forbidden-header configurations fail with
  a typed local error and zero API calls; positive custom-header Fetch still works.
- Server header validation, origin/credential protections, and retry bounds pass.

Verification: shared build/typecheck/lint; focused Node fetch tests; `test:browser`.
Provide precise tightened-contract notes to RATT-08.

Execution notes:

- RATT-05 is completed; its single-sample `init.body`, native Request/body
  ownership, immutable snapshot, readable retry fallback, and abort/cancellation
  contracts are the intentional baseline (**17 Node files / 517 tests**, **3
  Chromium files / 66 tests**).
- Reject statically incompatible modes and browser-forbidden proof fields before
  body preparation or signer/transport work. Native Request guards must also be
  checked after construction for the exact proof, including the retry path.
- Keep Fetch-specific restrictions local to the browser wrapper, preserve allowed
  custom fields and native init precedence/getter receivers, and record real
  Chromium regression results plus the tightened input contract for RATT-08.
- Necessary browser-compatibility finding within RATT-06: a native Chromium
  loopback probe retained `Sec-Proof`/`PrOxY-Proof` in temporary `Headers` but
  dropped them from both the constructed Request and received HTTP headers.
  `no-cors` dropped `x-custom-proof`; Chromium also rejected `Cookie2` and
  `User-Agent` at Request construction. A normal custom field and all three
  method-override field names retained ordinary proof-shaped values on the wire.
  Account for the Chromium-specific names locally, without broadening the shared
  server HTTP validator or rejecting conditionally allowed method-override names.

Pre-fix regression evidence (before runtime edits, from `<repo-root>`):

- Added `packages/express-request-attestation/test/fetch-transport.cases.ts`,
  consumed by `packages/express-request-attestation/test/fetch-client.test.ts`
  against source and `packages/express-request-attestation/test/fetch-end-to-end.browser.ts`
  against built ESM. The latter also exercises native Chromium's conditional
  method-override header guards; the Node suite adds live server acceptance for
  independently supplied `Sec-Proof`, `PrOxY-Proof`, and `User-Agent` proofs.
- `pnpm --filter @web-ts-toolkit/express-request-attestation... build`: passed
  baseline CJS, ESM, and declaration emission.
- `pnpm --filter @web-ts-toolkit/express-request-attestation exec vitest run --config vitest.node.config.mts test/fetch-client.test.ts`:
  **1 file / 101 tests: 40 failed, 61 passed**, no skips/unhandled rejections.
  Every failure belongs to the new transport-boundary cases; all 57 prior Fetch
  tests and the new live general-HTTP validation control passed.
- `pnpm --filter @web-ts-toolkit/express-request-attestation exec vitest run --config vitest.browser.config.mts test/fetch-end-to-end.browser.ts`:
  real Chromium, **1 file / 86 tests: 43 failed, 43 passed**, no skips/unhandled
  rejections. Each of the **22 forbidden-name cases** read `init.body` once,
  constructed two Requests, and invoked API transport once with a **missing proof**.
  The same cases in Node retained the proof, demonstrating why Node Headers alone
  cannot establish the browser contract. Explicit/inherited `no-cors` reached
  transport; mode getters changed by body getters sent both attempts as `no-cors`.
  Native conditional method-override guards also dropped `TRACE` returned by a
  deliberately faulty signer while the old wrapper still invoked transport.
- Constructed-request missing/replaced/appended proof cases sent the invalid
  initial/retry request; native whitespace normalization also changed the proof
  silently. Positive default/`cors`/`same-origin` controls already preserved nine
  allowed field names, including all three conditional method-override names.
- Exploratory expectation correction: the initial matrix assumed
  `Access-Control-Request-Private-Network` remained Chromium-forbidden. Native
  Request **and loopback HTTP** probes retained it in this Chromium version; it
  now belongs to the positive controls, not the rejection list. The initial
  browser run was **44 failed / 43 passed (87)**, including this incorrect
  rejection case and its native-guard assertion. The corrected counts are above.
- One initial Node run (**41 failed / 61 passed (102)**, before the matrix
  correction) also failed the existing post-completion signal-reason assertion in
  `packages/express-request-attestation/test/fetch-ownership.cases.ts` for omitted
  init. With runtime unchanged, `pnpm --filter @web-ts-toolkit/express-request-attestation exec vitest run --config vitest.node.config.mts test/fetch-client.test.ts -t 'supports an authentication retry'`
  passed **4 selected tests / 98 deselected**, and the corrected full pre-fix run
  passed all 57 prior cases. This is an unreproduced baseline observation, not a
  claimed RATT-06 defect or an ownership-code change.

Completion evidence:

- Changed `packages/express-request-attestation/src/attested-fetch.ts`,
  `packages/express-request-attestation/test/fetch-client.test.ts`, and
  `packages/express-request-attestation/test/fetch-end-to-end.browser.ts`; added
  `packages/express-request-attestation/test/fetch-transport.cases.ts`.
  The **43 shared transport regressions** execute against source in Node and
  built ESM in Chromium; the browser file adds **4 native-guard tests** and the
  Node file adds **1 live server-validation test**.
- The wrapper's private Fetch-specific name check runs after shared HTTP option
  validation and before any Request/body preparation. The **22 valid-HTTP but
  browser-forbidden field cases**, including case-insensitive `sec-`/`proxy-`
  prefixes and Chromium's `Cookie2`/`User-Agent`, now report
  `SignerClientError` / `SIGNER_PREPARATION_FAILED` with **0 body getter reads / 0
  Request constructions / 0 signer loads / 0 sign calls / 0 clock calls / 0 API
  calls**. The shared validator remains appropriate for server HTTP inputs:
  real Express accepts all **3 independently signed requests** using `Sec-Proof`,
  `PrOxY-Proof`, and `User-Agent`, with **3 handler calls**.
- Explicit/inherited `no-cors` fails before cloning or reading `init.body`.
  Static failures leave caller Request stream identity/readability intact and
  leave explicit streams unpulled, unlocked, and uncancelled. A mode resolved by
  native dictionary coercion is checked before acquiring a body reader; the
  already-owned internal branch is cancelled without consuming the caller's body.
  Both paths have **0 signer/API calls**.
- `init.mode` is sampled **once, before `init.body`**, and both sampled values
  are reused by native construction. Non-enumerable/inherited getters retain
  their original receiver. Explicit `cors` and `same-origin` override inherited
  `no-cors`, even when a body getter subsequently changes the init mode; stale
  retries keep **2 attempts / 2 distinct proofs / identical replacement bytes**
  and leave the original readable. The three supported/default mode controls
  each pass **9 allowed proof fields**, with exact proof replacement, caller
  headers preserved, credentials/Authorization retained, and manual redirects.
- Each final constructed Request must contain exactly the signer's proof.
  Chromium's native value-dependent guards reject a faulty signer's `TRACE`
  under each of the **3 method-override fields** with **0 API calls**; those same
  field names accept real envelopes. Native whitespace normalization and all
  **6 missing/replaced/appended final-Request cases** also stop the affected
  attempt. Initial failures yield a typed preparation error and **0 API calls**;
  retry failures leave **1 API call**, cancel only the unsent request body once,
  and return the same unlocked/unconsumed stale Response with readable JSON.
  RATT-05's 33 shared ownership cases, origin/credential protections, stale-only
  retry bounds, live rotation, and protocol/server boundary cases pass.
- Required checks from `<repo-root>`:
  - `pnpm --filter @web-ts-toolkit/express-request-attestation... build`: passed
    CJS, ESM, and declaration emission, including the final JSDoc clarification.
  - `pnpm --filter @web-ts-toolkit/express-request-attestation typecheck`: passed
    both configured TypeScript checks, including browser-only `types: []` closure.
  - `pnpm --filter @web-ts-toolkit/express-request-attestation exec vitest run --config vitest.node.config.mts test/fetch-client.test.ts test/failure-limits.test.ts test/boundary.test.ts test/protocol.test.ts`:
    **4 files / 177 tests passed** (Fetch **101**, failure limits **17**, boundary
    **16**, protocol **43**). The Fetch file adds **44 tests** over RATT-05.
  - `pnpm --filter @web-ts-toolkit/express-request-attestation test:browser`:
    real Chromium against built ESM, **3 files / 113 tests passed** (Fetch **86**,
    signer **18**, stream limits **9**), **+47 tests** over RATT-05's 66.
  - `pnpm exec eslint packages/express-request-attestation/src/attested-fetch.ts packages/express-request-attestation/test/fetch-client.test.ts packages/express-request-attestation/test/fetch-end-to-end.browser.ts packages/express-request-attestation/test/fetch-transport.cases.ts`:
    passed, **0 errors / 0 warnings** across all four touched code/test files.
  - `git diff --check`: passed. `git diff --quiet -- CHANGELOG.md`: passed.
    Required post-fix Node/Chromium lanes had **0 failures / 0 skips / 0 unhandled
    rejection reports**. Vite's existing dynamic-import analysis warning did not
    prevent Chromium execution. The final JSDoc-only clarification was followed by
    another successful build/typecheck/lint; runtime and tests were unchanged.
- The header/mode/error and exact-proof contracts survive both
  `packages/express-request-attestation/dist/signer.d.ts` and
  `packages/express-request-attestation/dist/signer.d.mts`. The new validation
  helpers remain internal; public named exports and signatures are compatible.
- Tightened input-contract handoff to RATT-08:
  - `fetchWithAttestation` enforces the same portable browser constraints even
    with an injected Fetch implementation or under Node. Effective `no-cors`
    is unsupported; omission/undefined inherits a Request's mode or the native
    default, while explicit `cors`/`same-origin` may override it. Mode sampling
    now precedes body sampling and occurs once; other dictionary getters retain
    native forwarding and their original receiver.
  - In addition to the existing shared token/length/reserved-name rules, reject
    case-insensitive `sec-*`/`proxy-*`, `Accept-Charset`, `Accept-Encoding`,
    `Access-Control-Request-Headers`, `Access-Control-Request-Method`,
    `Connection`, `Cookie2`, `Date`, `DNT`, `Expect`, `Keep-Alive`, `Referer`,
    `TE`, `Trailer`, `Upgrade`, `Via`, and `User-Agent`. These newly forbidden
    fields and `no-cors` use `SIGNER_PREPARATION_FAILED`; names already rejected
    by shared validation continue to use `AttestationProtocolError`.
  - An initially missing/changed constructed proof is a typed local preparation
    failure before API transport. A retry proof-retention failure follows
    RATT-05's readable first-response fallback. Static failure accepts no body
    ownership; a post-construction failure releases only invocation-owned bodies.
  - Shared `validateHeaderName` and server middleware do not inherit browser-only
    restrictions. Ordinary custom fields and the three method-override names
    remain supported with real envelopes. Current Chromium also retains
    `Access-Control-Request-Private-Network`; it was not added to the blacklist.
- Follow-ups/blockers: no confirmed independent defect or RATT-06 blocker.
  The one unreproduced pre-fix ownership signal assertion is recorded above for
  coordinator visibility; it also passed in the required post-fix focused run.

### Task RATT-07: Publish currently active signer assets at correct root URLs

Status: completed

Kind: defect

Priority: P1 — key-provider latency and valid root mounts can yield unusable discovery.

Suggested agent: signer-distribution engineer.

Dependencies: RATT-06.

Primary ownership: package `src/signer-bundle.ts`, `test/signer-bundle.test.ts`.

Finding: discovery samples its clock before awaiting the provider and reuses it,
so a retired current key may be published after the await. `basePath: '/'` is
accepted but concatenation publishes a double slash and breaks relative runtime
lookup under the supported root mount.

References: `src/signer-bundle.ts:106-128,290-324,350`,
`test/signer-bundle.test.ts:320-344` and existing custom-base tests.

Requirements:

1. Recheck a valid clock and current-key eligibility after asynchronous provider
   work before publishing metadata; preserve fixed operational failure behavior.
2. Join root base paths and optional stripped prefixes correctly for signer URLs
   and relative runtime imports. Do not normalize arbitrary signed request paths.
3. Preserve content hashes, immutable cache headers, controlled missing/retired
   responses, relative application mounting, and trusted-origin configuration.

Acceptance criteria:

- A gated provider crossing activation/retirement boundaries cannot publish an
  inactive key; invalid post-await clock fails in the documented way.
- Root/custom mounts with and without stripped prefix return discovery whose
  signer and relative runtime URLs resolve successfully to correct immutable bytes.

Verification: shared build/typecheck/lint; focused signer-bundle tests; `test:node`.

Execution notes:

- RATT-01–06 and the RATT-03 coordinator follow-up are completed. The starting
  baseline is **17 Node files / 565 tests**; the latest dedicated Chromium lane
  is **3 files / 113 tests**. Existing attestation and unrelated concurrent edits
  are intentional baseline work.
- Reproduce post-provider activation/retirement and invalid-clock behavior with
  deferred HTTP discovery, then verify root/custom mounts with and without an
  upstream stripped prefix through their published signer and relative runtime
  URLs. Keep implementation and regression changes in
  `packages/express-request-attestation/src/signer-bundle.ts` and
  `packages/express-request-attestation/test/signer-bundle.test.ts`.

Pre-fix regression evidence (before runtime edits, from `<repo-root>`):

- Added deferred-provider clock/eligibility cases, a four-case root/custom HTTP
  mount matrix, and operational-error/bounded-provider controls in
  `packages/express-request-attestation/test/signer-bundle.test.ts`.
- `pnpm --filter @web-ts-toolkit/express-request-attestation... build`: passed
  baseline CJS, ESM, and declaration emission before tests reading the runtime asset.
- `pnpm --filter @web-ts-toolkit/express-request-attestation exec vitest run --config vitest.node.config.mts test/signer-bundle.test.ts`:
  **1 file / 31 tests: 13 failed, 18 passed**, no skips or unhandled-rejection
  reports. Both root mounts published `//signer.<hash>.mjs` (after `/prefix` when
  configured); fetching the published paths returned **404**. Both custom mounts
  already served the exact signer/runtime bytes through the relative import.
- A provider held across activation returned **503 instead of 200** at
  `acceptFrom`; waits crossing exact/after retirement and a backward clock
  crossing activation returned **200 instead of 503**. All **7** post-provider
  clock faults (NaN, infinity, negative/fractional/unsafe time, ordinary throw,
  typed stale-key throw) incorrectly returned **200 instead of 500**.
- Initial invalid-clock rejection, typed provider throws/rejections, throwing
  snapshot accessors, rejection of **17-key** snapshots before entry reads, **20 ms**
  provider timeouts with late resolve/reject and subsequent recovery, existing
  immutable/retirement coverage, and native Chromium import/signing all passed.

Completion evidence:

- Changed `packages/express-request-attestation/src/signer-bundle.ts` and
  `packages/express-request-attestation/test/signer-bundle.test.ts`. Discovery
  validates the initial clock before dependency work, then samples and validates
  it again after the provider wait and bounded snapshot copy. Current-key
  eligibility uses that fresh value with **`acceptFrom <= nowMs < acceptUntil`**.
  The six gated boundary cases pass, including activation equality, retirement
  equality, and a backward crossing of activation; an eligible alternate retained
  key never substitutes for an inactive current key.
- All seven post-provider clock failures return fixed **500
  ATTESTATION_INTERNAL_ERROR**, including a clock throwing a typed stale-key error.
  The initial-invalid-clock control makes **0 provider calls**. Provider throws,
  rejections, snapshot accessor failures, and over-limit snapshots return fixed
  **503 ATTESTATION_KEYS_UNAVAILABLE** on discovery and key-asset routes, with
  `no-store`, no stale marker, no redirect, and no diagnostic leakage. The
  **17-key** snapshot control observes **0 entry reads**. Both **20 ms** timeout
  cases return before provider settlement; late resolve/reject performs **0 late
  snapshot reads / 0 additional clock reads**, and a subsequent discovery succeeds.
- The asset URL join treats only `basePath: '/'` as an empty mount component.
  The four HTTP mount cases publish paths under `/`, `/prefix/`, `/custom/`, and
  `/prefix/custom/`. An outer Express application models upstream prefix stripping;
  the inner application mounts the relative router at its configured base path.
  Each published signer URL returns **200**; the relative `./runtime.<hash>.mjs`
  import parsed from the served module resolves to another **200**. Both bodies
  equal their expected immutable bytes, and independent SHA-256 calculations
  match the filenames. Metadata remains bounded to **4096 bytes** with `no-store`;
  both assets have exact `public, max-age=31536000, immutable`, JavaScript MIME,
  and `nosniff` headers. Spoofed Host/Forwarded/X-Forwarded-\* headers do not change
  the configured origin or path, and the router grants no CORS access itself.
- Existing current/old-module overlap, controlled malformed/retired **404/410**,
  complete-byte hashes, and real Chromium module import/signing/replay checks
  pass. The full Node lane also passes exact signed-target spelling (duplicate
  slashes, percent-escape case, query order), bounded snapshot validation, and all
  RATT-01–06 plus the RATT-03 multi-generation follow-up regressions.
- Required checks after correction, from `<repo-root>`:
  - `pnpm --filter @web-ts-toolkit/express-request-attestation... build`: passed
    CJS, ESM, and declaration emission.
  - `pnpm --filter @web-ts-toolkit/express-request-attestation typecheck`: passed
    both configured TypeScript checks, including browser-only `types: []` closure.
  - `pnpm --filter @web-ts-toolkit/express-request-attestation exec vitest run --config vitest.node.config.mts test/signer-bundle.test.ts`:
    **1 file / 31 tests passed**, versus **13 failed / 18 passed** before the fix.
  - `pnpm --filter @web-ts-toolkit/express-request-attestation test:node`:
    **17 files / 588 tests passed**, **+23 tests** over the supplied 565-test
    baseline (signer-bundle **8 -> 31**), including native Playwright Chromium.
  - `pnpm exec eslint packages/express-request-attestation/src/signer-bundle.ts packages/express-request-attestation/test/signer-bundle.test.ts`:
    passed, **0 errors / 0 warnings** across both touched code/test files.
  - `git diff --check`: passed. `git diff --quiet -- CHANGELOG.md`: passed.
    Post-fix focused/Node runs had **0 failures / 0 skips / 0 unhandled-rejection
    reports**. The Node lane emitted the existing experimental localStorage notices.
- Updated factory JSDoc survives both
  `packages/express-request-attestation/dist/index.d.ts` and
  `packages/express-request-attestation/dist/index.d.mts`, describing the root
  join, relative runtime import, fresh clock check, and fixed error distinction.
  The public factory signature and named exports remain compatible.
- Contract handoff to RATT-08:
  - Mount `createSignerBundleRouter({ basePath: '/', ... })` with
    `app.use('/', router)`. With no stripped prefix, discovery/signers/runtime
    live at `/signer-meta`, `/signer.<hash>.mjs`, and `/runtime.<hash>.mjs`.
    With `publicPathPrefix: '/prefix'`, those external paths start with
    `/prefix/`, while the application still mounts at `/`. Custom base paths
    are appended once after the prefix. The caller owns actual mounting and
    upstream prefix stripping; trusted configuration owns the published URL.
  - `now` is sampled before provider work and again after the returned snapshot
    is validated/copied. It must return nonnegative safe-integer epoch
    milliseconds on each call. Discovery can succeed when a pending key becomes
    active during the wait; it rejects a current key that retires or becomes
    not-yet-active at the post-read clock. Inactive/missing current keys and
    provider/snapshot/timeouts use **503** / `Request signing keys are unavailable.`;
    invalid/throwing clocks use **500** / `Request signature verification failed.`
    Both use the fixed code/message JSON and `no-store`, with no stale marker.
  - The root join is asset-distribution behavior, not signed-path normalization.
    Exact request-target spelling, retained immutable modules, content hashes,
    relative imports, application-configured CORS/CSP, **1–16 retained keys**, and
    the provider wait bound (`operationTimeoutMs`, default **5000 ms**, range
    **1–60000**) keep their existing contracts. Late provider settlement cannot
    resume a timed-out discovery or add a published response.
- Follow-ups/blockers: none for RATT-07; no confirmed independent finding was
  promoted. The coordinator can hand the contract notes above to RATT-08.

### Task RATT-08: Make shipped types and operational examples self-sufficient

Status: completed

Kind: improvement

Priority: P2 — remove unsafe-looking integration casts and repository-only guidance.

Suggested agent: installed TypeScript consumer/documentation engineer.

Dependencies: RATT-07.

Primary ownership: package `README.md`, high-value public source JSDoc,
`test-decl-consumer/**`, `test-packed-consumer/consumer/**`, package check scripts,
and focused packed-consumer assertions.

Finding: README's Express quickstarts use `as never`; strict fixtures only check
`typeof guard` instead of assigning/wiring Express handlers. The existing
declaration fixture configs are not run by `typecheck`. Emitted declarations carry
task/scaffold references and inconsistent `retainUntil` shorthand instead of a
clear consumer-facing `retainUntilMs` contract. Cluster policy/index and auth
composition guidance can better reflect actual business deployment needs.

References: README `:115-118,298-300,230-253,388-407,450-465`,
`test-decl-consumer/backend-strict.mts:29-47`,
`test-decl-consumer/backend-bundler.ts:26-32`, package `package.json:43`,
public declarations emitted from `src/server-types.ts`, stores and client factories.

Requirements:

1. Demonstrate real Express parser/error-handler/guard wiring without `as never`
   or blanket type assertions in shipped quickstarts and strict installed fixtures.
   Make only necessary type changes; preserve runtime validation and public exports.
   State the backend TypeScript declaration prerequisites (`@types/express` and
   Node types) alongside runtime installation; browser-only consumers remain separate.
2. Wire all existing declaration consumer configs into a documented package check
   and verify both NodeNext forms, Bundler, and browser `types: []` closure against
   built declarations. Keep packed consumers using public package imports.
3. Improve high-value factory/option JSDoc so editor hover explains actual defaults,
   ownership, lifecycle and error behavior without requiring old task files.
   Use canonical `retainUntilMs` in consumer examples; keep existing compatible APIs.
4. Add concrete caller-owned Mongo non-TTL index setup to the standalone wiring
   example, identical policy/key deadlines across a protection space, safe policy
   migration, and application auth/idempotency/dependency-deadline responsibilities.
5. Reconcile RATT-02 through RATT-07 contracts in README and declarations, including
   local browser failures, readable fallbacks, stream limits, root mounting, and
   concurrent reloads. Include concise compatibility notes for tightened inputs.
   Root `CHANGELOG.md` is explicitly prohibited.

Acceptance criteria:

- Installed README examples and actual handler assignments compile strictly with
  no suppressing casts; all three local declaration configs visibly run.
- Both public entries/conditional declarations remain valid; browser-only installs
  require no Express/Redis/MongoDB/Node types and key docs survive declaration emit.
- Published guidance accurately distinguishes replay admission from auth and
  durable business idempotency; no unmeasured performance/failover guarantees.

Verification: shared build/typecheck/lint, new/existing declaration check scripts,
`test:packed-consumer` (including compiled installed README).

Execution notes:

- RATT-01–07 are completed, including RATT-03's reopened three-generation fix.
  All prior completion handoffs were read. The supplied runtime baseline is
  **17 Node files / 588 tests** and **3 Chromium files / 113 tests**.
- Scope is shipped README/public JSDoc, strictly compiled public consumer wiring,
  declaration check scripts, and focused installed-consumer assertions. Existing
  attestation changes and unrelated concurrent work are intentional baseline work.
- Verify real Express parser/guard/error-handler assignments against built public
  declarations before deciding whether any public type change is necessary. Run
  all three existing declaration configs and the packed installed-README lane.
- Necessary verification finding within RATT-08: the existing local and packed
  NodeNext TypeScript fixtures import only the root entry. Browser Bundler checks
  reach the signer import declarations, but the signer's conditional CommonJS
  declarations lack a real consumer compile. Extend both NodeNext forms with
  public `/signer` client/fetch usage to satisfy the two-entry acceptance criterion;
  no public type or runtime change is needed.

Completion evidence:

- Changed `packages/express-request-attestation/README.md`: both Express examples
  now assign the guard/parser to `express.RequestHandler` and the capture error
  handler to `express.ErrorRequestHandler`, passing `capture.verify` directly to
  the real parser. No suppressing casts remain. Installation names backend
  `@types/express` v5 and `@types/node` prerequisites separately from browser-only
  consumption. The Mongo example awaits caller-owned non-TTL
  `{ kind: 1, retainUntilMs: 1 }` index creation before store wiring.
- The README reconciles all RATT-02–07 handoffs, including the superseding RATT-03
  three-generation fix: bounded canonical preflight/provider errors; standalone
  5000 ms metadata-body versus configurable whole-load deadline; Request
  inheritance/override/getter/abort/tee ownership and readable retry fallbacks;
  no-cors/forbidden-field/final-proof checks; older-key replacement sharing and
  same-key changed-URL recovery; and root/custom/prefixed asset URLs with the
  post-provider current-key check. It documents native Content-Type inheritance,
  application CORS/CSP, same-protection-space time-policy/key-window invariants,
  a fresh-namespace policy migration retaining the old ledger, driver deadline
  ownership, auth-before-guard allocation tradeoffs, and durable business
  idempotency. A shipped Compatibility notes section records tightened inputs.
- Public-source changes are JSDoc/comments only; no public type/signature or
  runtime changes were needed. Changed exact paths:
  - `packages/express-request-attestation/src/attested-fetch.ts`
  - `packages/express-request-attestation/src/body-capture.ts`
  - `packages/express-request-attestation/src/client-errors.ts`
  - `packages/express-request-attestation/src/index.ts`
  - `packages/express-request-attestation/src/keys.ts`
  - `packages/express-request-attestation/src/middleware.ts`
  - `packages/express-request-attestation/src/request-body.ts`
  - `packages/express-request-attestation/src/request-signer.ts`
  - `packages/express-request-attestation/src/server-types.ts`
  - `packages/express-request-attestation/src/shared/codec.ts`
  - `packages/express-request-attestation/src/shared/time-policy.ts`
  - `packages/express-request-attestation/src/shared/types.ts`
  - `packages/express-request-attestation/src/signer-bundle.ts`
  - `packages/express-request-attestation/src/signer-client.ts`
  - `packages/express-request-attestation/src/signer.ts`
  - `packages/express-request-attestation/src/stores/memory.ts`
  - `packages/express-request-attestation/src/stores/mongodb.ts`
  - `packages/express-request-attestation/src/stores/redis.ts`
  - `packages/express-request-attestation/src/verify.ts`
    Editor-facing factories/options now explain defaults, ownership, errors,
    lifecycle, and the canonical `retainUntilMs` contract without task/scaffold
    references. Both emitted public declaration forms retain these docs.
- Changed `packages/express-request-attestation/package.json`: `typecheck` now
  invokes the documented `typecheck:declarations` script, which explicitly runs
  all three existing configs against built package declarations. It does not
  rebuild or substitute source paths; the README states the build prerequisite.
- Added real Express parser/guard/error-handler/router assignments and mounting in
  all six backend TypeScript fixtures:
  - `packages/express-request-attestation/test-decl-consumer/backend-strict.mts`
  - `packages/express-request-attestation/test-decl-consumer/backend-strict.cts`
  - `packages/express-request-attestation/test-decl-consumer/backend-bundler.ts`
  - `packages/express-request-attestation/test-packed-consumer/consumer/consumer-types.mts`
  - `packages/express-request-attestation/test-packed-consumer/consumer/consumer-types.cts`
  - `packages/express-request-attestation/test-packed-consumer/consumer/consumer-bundler.ts`
    Both NodeNext forms also use public `/signer` client/fetch imports, closing the
    newly recorded CommonJS declaration-coverage gap. The first direct
    `pnpm --filter @web-ts-toolkit/express-request-attestation typecheck:declarations`
    run already passed real handler assignments against the preceding build,
    establishing that integration casts were unnecessary.
- Changed `packages/express-request-attestation/test/packed-consumer.test.ts`:
  TypeScript syntax inspection rejects suppressing assertions/directives in
  installed fixtures/README examples; README entry detection uses actual imports.
  Browser README examples also compile in the isolated browser-only installation.
  All **6 emitted declaration files**, including both shared declaration chunks,
  are checked for task/scaffold references, obsolete deadline shorthand, and
  invalid relative imports. **7 high-value factories in each public declaration
  form (14 hover checks)** must retain their operational docs. The existing
  installed-browser asset import/signing smoke remains the browser portion of
  this lane; RATT-09's full browser HTTP workflow remains pending.
- Final required checks, from `<repo-root>` (build, typecheck, and packed lane
  serialized; packed temporary projects used the pre-approved external scratch
  directory via `TMPDIR`):
  - `pnpm --filter @web-ts-toolkit/express-request-attestation... build`: passed
    both entries' CJS/ESM output and all **6 declaration files**.
  - `pnpm --filter @web-ts-toolkit/express-request-attestation typecheck`: passed
    **5 TypeScript configurations**: source, browser-only source, then
    `packages/express-request-attestation/test-decl-consumer/tsconfig-nodenext.json`
    (both `.mts`/`.cts`, both public entries),
    `packages/express-request-attestation/test-decl-consumer/tsconfig-bundler.json`,
    and `packages/express-request-attestation/test-decl-consumer/tsconfig-browser.json`.
    All three declaration commands were visible in script output; they use
    `strict: true`, `skipLibCheck: false`, with browser `types: []`.
  - `pnpm --filter @web-ts-toolkit/express-request-attestation test:packed-consumer --disableConsoleIntercept`:
    **1 file / 5 tests passed**, **0 failures / 0 skips / 0 unhandled-rejection
    reports**. The lane ran CJS/ESM runtime consumers, **8 installed TypeScript
    compiler invocations**, both source/release inventory dry runs, and native
    Chromium asset import/signing. Output confirmed **6 backend / 2 browser
    installed README examples**, plus those **2 browser examples** in the
    separate install without Express, Redis, MongoDB, `@types/express`, or
    `@types/node`. The initial packed run also passed 1/5; this final run followed
    the last ownership/deadline wording clarification and rebuild.
  - `pnpm exec eslint packages/express-request-attestation/`: passed the package,
    including all **26 touched code/fixture files**, **0 errors / 0 warnings**.
  - `git diff --check`: passed. `git diff --quiet -- CHANGELOG.md`: passed.
- Supplied full runtime baselines remain **17 Node files / 588 tests** and
  **3 Chromium files / 113 tests**; those dedicated lanes and live stores were
  not rerun for this documentation/declaration task. Existing attestation and
  unrelated concurrent edits were preserved. No generated output was committed.
- Required finding resolved: the signer's previously uncompiled CommonJS
  conditional declarations now have real local and installed NodeNext consumers.
  Follow-ups/blockers: none for RATT-08.

### Task RATT-09: Verify installed browser-to-Express signing and rotation end to end

Status: completed

Coordinator final-audit follow-up: the native Fetch receiver correction currently
binds only the default transport. Both resolvers return an explicitly provided
`fetch: globalThis.fetch` unchanged, then call it as a property of internal config;
the `fetchFn` alias shares that path. This is the same receiver boundary uncovered
by this task's original native-browser integration. Reopened RATT-09 in its own
agent session to reproduce and cover explicit native injection before sign-off.
Prior completion evidence remains historical evidence for the default transport.

Kind: improvement

Priority: P1 — mocked transports and proof generation do not prove the deployed workflow.

Suggested agent: real-browser installed-integration engineer.

Dependencies: RATT-08.

Primary ownership: package `test/packed-consumer.test.ts` and dedicated installed
consumer/server fixtures or harness extraction as needed.

Finding: browser wrapper tests inject transport; the installed tarball browser
check imports a module and returns a proof without submitting it to the mounted
API. Actual browser CORS/preflight/cookies/body capture and stale-marker exposure
therefore lack one integrated installed-product check.

References: `test/packed-consumer.test.ts:319-428,614-617`,
`test/fetch-end-to-end.browser.ts`, README CORS and prepared-fetch quickstart.

Requirements:

1. Extend the release-shaped installed-tarball harness to execute native browser
   discovery, dynamic module import, prepared signed POST, and Express body capture
   and verification over real HTTP. Do not substitute an injected fake transport.
2. Cover ordinary same-origin success plus an explicitly configured cross-origin
   cookie/auth workflow with real preflight and exposed stale-key marker.
3. Force one pre-handler rotation challenge, verify one reload/re-sign with exact
   body bytes preserved, and count API attempts, reservations, and handler effects.
4. Verify readable error/failure behavior and native request/response constraints
   as appropriate; test one concrete misconfigured marker exposure case so hidden
   CORS headers cannot be counted as successful retry evidence.
5. Keep service/browser/temp-file lifecycle bounded and isolated, including setup
   failure cleanup. Prefer named fixture files over expanding embedded source strings.
6. Verify explicit native `fetch` injection for standalone discovery, signer-client
   discovery, and both `fetch`/`fetchFn` prepared-request options in real Chromium.
   Call injected transports without an internal configuration-object receiver;
   preserve bound application functions and ordinary function/closure injection.
7. Necessary runtime expansion, recorded after installed-browser reproduction:
   preserve native global Fetch's receiver when selecting the default discovery
   and API transports in `packages/express-request-attestation/src/signer-client.ts`
   and `packages/express-request-attestation/src/attested-fetch.ts`. Keep explicit
   injected transports and all request options/error/retry contracts compatible.
   Keep the default-transport browser cases free of transport/loader overrides;
   the added explicit-injection cases use the actual native Fetch function.

Acceptance criteria:

- A real Chromium consumer of the installed package reaches the authenticated
  Express handler with the intended parsed/body content and credentials.
- Rotation produces exactly two API attempts, fresh envelopes, one successful
  reservation and one business-handler call; missing exposed marker does not retry.
- No deep source imports, skipped browser runs, or mocked network count as evidence;
  flattened CJS/ESM, browser-only, and strict README checks still pass.
- Explicit native Fetch injection performs actual discovery/API requests just as
  the default transport does, for both public aliases and both discovery APIs;
  injected functions retain their caller-defined binding rather than internal state.

Verification: shared build/typecheck/lint; `test:packed-consumer` with real Chromium.
For the necessary native-Fetch correction, also run focused
`test/signer-client.test.ts` / `test/fetch-client.test.ts` and `test:browser`.

Execution notes:

- RATT-01–08 are completed. Read the shared execution rules, RATT-08's completion
  evidence and current consumer/check-script changes, and repository `AGENTS.md`.
  The supplied packed lane has **1 file / 5 tests**; `typecheck` runs **5 configs**.
- Replace the import/sign-only browser helper with named installed-consumer
  fixtures using native Chromium discovery/import/Fetch and real Express HTTP.
  Verify same-origin success, credentialed cross-origin rotation/preflight, and
  readable stale failure without exposed marker, with server-observed counters.
- Preserve the existing release-flat CJS/ESM, strict declaration/README, and
  browser-only gates and all prior/concurrent edits. Evidence is limited to
  Chromium and isolated loopback CORS, with no deployment/failover claim.
- The first extended packed run passed the **4 existing compatibility tests**;
  all **4 new browser cases** failed before discovery/API work because Vitest
  rewrote an import inside `page.evaluate` to its Node-only SSR helper. Move
  entry loading into the served module fixture and use a small page bridge.
  This is a harness correction, not a reproduced package-runtime defect.
- The next focused browser run exposed a fixture-only **404** for the resolved
  public entry: Express `sendFile` defaults hide pnpm's `.pnpm` path. Browser
  diagnostics reproduced the failed URL; explicitly permit the one resolved
  export file. Failed runs closed the child servers and removed tracked consumer
  projects; no attestation runtime edit is required for either harness issue.

Necessary runtime finding (before runtime edits):

- With both harness issues corrected, the actual installed public `/signer`
  entry loads in Chromium, but **all 4 browser scenarios** fail at discovery with
  `SignerClientError` / `SIGNER_LOAD_FAILED` / `Signer metadata fetch failed.`
  Reproduction from `<repo-root>`:
  `pnpm --filter @web-ts-toolkit/express-request-attestation test:packed-consumer -t 'installed Chromium' --disableConsoleIntercept`.
  The **4 compatibility tests were deselected**, not treated as browser evidence.
- `resolveFetch` in `packages/express-request-attestation/src/signer-client.ts`
  retains the unbound `globalThis.fetch`; `fetchMetadataDocument` calls it as
  `config.fetchImpl(...)`. An independent native Chromium **151.0.7922.34** control
  confirms that `const config = { fetchImpl: globalThis.fetch }; config.fetchImpl(url)`
  throws **TypeError: Failed to execute 'fetch' on 'Window': Illegal invocation**
  before HTTP dispatch. Plain-function and `globalThis`-bound native controls
  each return **200**, with **0 property-call requests / 2 control requests**.
- `resolveFetchImpl` / `send` in
  `packages/express-request-attestation/src/attested-fetch.ts` use the same
  receiver-losing pattern for API transport. Correct discovery first and rerun
  the installed cases to isolate that API boundary before correcting it. This
  expansion is necessary for the required default native browser workflow;
  binding a fake/injected transport in the fixture would hide the defect.
- After binding **only discovery's default** to `globalThis`, a fresh package
  build and the same focused installed command still fail **4/4 selected cases**,
  now with **TypeError: Failed to execute 'fetch' on 'Window': Illegal invocation**
  directly in `fetchWithAttestation`'s `send`. Each case has progressed through
  native discovery/import/signing to the first API dispatch. This reproduces
  the second boundary independently before its default receiver is corrected.

Completion evidence:

- Changed exact repo-relative paths:
  - `packages/express-request-attestation/test/packed-consumer.test.ts`
  - `packages/express-request-attestation/test/installed-browser-harness.ts` (new)
  - `packages/express-request-attestation/test-packed-consumer/consumer/installed-browser.html` (new)
  - `packages/express-request-attestation/test-packed-consumer/consumer/installed-browser.mjs` (new)
  - `packages/express-request-attestation/test-packed-consumer/consumer/installed-browser-server.mjs` (new)
  - `packages/express-request-attestation/src/signer-client.ts`
  - `packages/express-request-attestation/src/attested-fetch.ts`
  - `docs/tasks/20261012-164617-express-request-attestation-health-review.md` (RATT-09 record only).
- Replaced the embedded import/sign-only smoke with **4 named real-browser
  scenarios**, increasing the packed lane from **5 to 8 tests**. The server runs
  inside the isolated installed consumer and imports the public root entry.
  `import.meta.resolve` resolves the installed public `/signer` export; the
  browser fixture imports that public name through an import map serving the
  exact resolved release-flat bytes. Native Chromium performs discovery, dynamic
  key/runtime imports, Request preparation, WebCrypto signing, OPTIONS, and POST.
  No transport/loader overrides, request interception, or source/deep imports
  substitute for this workflow.
- The recorded runtime expansion changes only the two **default** Fetch selections:
  both bind the selected global Fetch to `globalThis`, avoiding Chromium's invalid
  config-object receiver. Explicitly supplied transports retain their existing
  path. Public exports/signatures, declaration docs, request options, ownership,
  and retry bounds remain compatible. The installed regressions first failed at
  discovery, then independently at API dispatch, and pass after both corrections.
- Final observed scenario counters, Chromium **151.0.7922.34**:

  | Scenario                                                | API statuses / attempts | OPTIONS | Discovery / key modules / runtime modules | Reserve calls / successful reserves | Business effects |
  | ------------------------------------------------------- | ----------------------- | ------- | ----------------------------------------- | ----------------------------------- | ---------------- |
  | Same-origin, default credentials                        | `200` / **1**           | **0**   | **1 / 1 / 1**                             | **1 / 1**                           | **1**            |
  | Cross-origin, explicit cookies, exposed stale marker    | `403, 200` / **2**      | **2**   | **2 / 2 / 1**                             | **1 / 1**                           | **1**            |
  | Cross-origin, explicit cookies, missing marker exposure | `403` / **1**           | **1**   | **1 / 1 / 1**                             | **0 / 0**                           | **0**            |
  | Cross-origin, default credentials                       | `401` / **1**           | **1**   | **1 / 1 / 1**                             | **0 / 0**                           | **0**            |

- Every dispatched POST preserves the exact **74 UTF-8 body bytes**, including
  whitespace/non-ASCII text, the final JSON Content-Type, and the percent-escaped,
  ordered/repeated query fields. Independent Node SHA-256/byte-length expectations
  match the real Express parser's public capture record and downstream parsed
  body. The caller's original finite Request stays readable. Each API request has
  exactly one proof field replacing the caller's placeholder.
- Rotation drops `installed-k1` after the first POST is captured/authenticated and
  before the real guard reads its key snapshot. That guard's genuine stale response
  has **0 reserve calls / 0 business effects**. Reload installs `installed-k2` from
  a different content-addressed module; the second envelope, nonce, and MAC differ,
  timestamps are fresh, and the submitted body bytes are identical. The counting
  store delegates to the real bounded memory store, recording exactly one
  successful reservation and one authenticated handler effect.
- Session setup uses a real HTTP `Set-Cookie` response, verified in Chromium's
  cookie jar as **HttpOnly / SameSite=Lax**. Both successful workflows reach the
  handler as `installed-browser-user`. Cross-origin requests carry the cookie
  only with explicit `credentials: 'include'`; the default-credentials negative
  retains the cookie in the jar but sends none, returns readable **401**, and
  performs **0 guard calls / 0 reservations / 0 effects**. Discovery omits cookies
  even on the same origin.
- Cross-origin OPTIONS requests contain the real requested POST method and
  `content-type, x-client-transaction-id` header list, no cookie or proof, and
  receive **204** with the explicit origin, credential/header/method permissions,
  and `Access-Control-Max-Age: 0`. Preflight stays ahead of auth/guard work. The
  positive stale response exposes `x-attestation-error`; the otherwise identical
  missing-exposure case has `stale-key` on the wire but **null in page JavaScript**.
  Its returned CORS Response is **403**, unlocked/unconsumed before reading, with
  `no-store` and the complete fixed stale-error JSON; **no reload or retry occurs**.
- Lifecycle is owned before asynchronous setup: registered server sockets close
  on setup errors, SIGTERM, or parent disconnect; the fixture has a **60-second**
  lifetime and **64-request** observation budget. Readiness/Chromium launch and
  page operations are bounded; the signed operation owns a cleared **10-second**
  abort timer. Nested cleanup closes browser contexts/pages, then awaits server
  exit with bounded kill fallback. Install/pack/compiler subprocesses now have a
  **120-second** limit; temporary roots are tracked before setup and removed by
  the lane's cleanup. Observed failed fixture setup and final successful runs left
  **0 installed-browser-server processes / 0 tracked attestation temporary roots**.
  The supplementary native Fetch probe was removed.
- Required final checks from `<repo-root>` (build before consumers; test lanes
  serialized; packed temporary projects used the pre-approved scratch location
  via `TMPDIR`):
  - `pnpm --filter @web-ts-toolkit/express-request-attestation... build`: passed
    both CJS/ESM entries and **6 declaration files**, with both runtime corrections.
  - `pnpm --filter @web-ts-toolkit/express-request-attestation typecheck`: passed
    all **5 configurations**, including all three RATT-08 built-declaration configs.
  - `pnpm exec eslint packages/express-request-attestation/`: passed the package
    and all touched code/fixtures, **0 errors / 0 warnings**.
  - `pnpm --filter @web-ts-toolkit/express-request-attestation exec vitest run --config vitest.node.config.mts test/signer-client.test.ts test/fetch-client.test.ts`:
    **2 files / 153 tests passed**.
  - `pnpm --filter @web-ts-toolkit/express-request-attestation test:browser`:
    real Chromium against built ESM, **3 files / 113 tests passed**.
  - `pnpm --filter @web-ts-toolkit/express-request-attestation test:packed-consumer --disableConsoleIntercept`:
    **1 file / 8 tests passed**, including all four installed Chromium scenarios.
    Release-flat CJS/ESM, both source/release inventory dry runs, all **8 installed
    compiler invocations**, declaration/hover checks, and **6 backend / 2 browser
    README examples** pass. The separate browser-only install again compiles the
    **2 browser README examples** without Express/Redis/MongoDB or Node/Express types.
  - `git diff --check`: passed. `git diff --quiet -- CHANGELOG.md`: passed.
    Final required lanes have **0 failures / 0 skips / 0 unhandled-rejection reports**.
    The Node localStorage notice and Vite dynamic-import analysis warning are the
    existing nonblocking notices; the installed browser assets are served natively.
- Limits: evidence covers this Chromium version, loopback HTTP secure contexts,
  same-site/different-port CORS, and a process-local memory replay store. It does
  not establish third-party cookie behavior, other browser engines, production
  proxy/CSP deployment behavior, persistent replay, or failover guarantees.
  Follow-ups/blockers: none for RATT-09; the reproduced necessary native-Fetch
  defect is resolved. Existing attestation and unrelated concurrent edits were
  preserved; no dependencies, commits, or root changelog edits were introduced.

Final-audit follow-up execution notes — explicit native Fetch injection:

- Resumed only RATT-09 with the coordinator's `in_progress` status and expanded
  criteria already recorded. Read current shared rules, this complete task and
  history, RATT-11/12 evidence and the affected current code, and `AGENTS.md`.
  Supplied independently passing baselines are **18 Node files / 606 tests**,
  **3 browser files / 129 tests**, and **1 packed file / 8 tests**.
- Add installed Chromium reproductions for explicit native Fetch in
  `fetchSignerBundle`, `createSignerClient`, and both `fetch` / `fetchFn` prepared
  options, including actual HTTP/rotation counters. Add strict installed consumer
  usage and shared ordinary/bound/closure callback controls. Record failures
  before changing the two invocation sites; preserve the existing default binding
  and RATT-11 cancellation branch and tests.
- This follow-up supersedes the earlier default-only receiver scope; the original
  completion evidence remains historical. Required checks are build, all five
  typecheck configs, focused client/Fetch tests plus the existing native discovery
  close regressions, browser, packed consumer, touched/package lint, and whitespace.

Follow-up pre-fix evidence (before changing runtime invocation):

- Added four real installed-browser cases using explicit **unbound native**
  `globalThis.fetch` in the served public-entry consumer. The existing four
  default-transport browser cases remain. The harness now captures server-side
  HTTP counters on failure before cleanup, as well as on success.
- From `<repo-root>`,
  `pnpm --filter @web-ts-toolkit/express-request-attestation... build` passed both
  entries and all six declarations, including RATT-11's cancellation changes.
  `pnpm --filter @web-ts-toolkit/express-request-attestation test:packed-consumer -t 'explicit native' --disableConsoleIntercept`
  then failed **all 4 selected tests**; the **8 prior tests were deselected**.
- `fetchSignerBundle({ fetch: globalThis.fetch, ... })` and
  `createSignerClient({ fetch: globalThis.fetch, ... }).getSigner()` each reject
  with the existing `SignerClientError` / metadata-fetch failure and server counts
  **0 discovery / 0 key modules / 0 runtime modules / 0 API attempts**.
- Prepared requests with either `{ fetch: globalThis.fetch }` or
  `{ fetchFn: globalThis.fetch }` each complete **1 default discovery / 1 key
  module / 1 runtime module**, then throw native **TypeError: Failed to execute
  'fetch' on 'Window': Illegal invocation** at `send`. Each has **0 OPTIONS /
  0 POST / 0 capture / 0 auth / 0 guard / 0 reserve / 0 business calls**.
  This isolates both API aliases from the discovery failure. No transport or
  module-loader substitute is used in these reproductions.
- Added `packages/express-request-attestation/test/fetch-receiver.cases.ts`,
  registered by the client/Fetch Node suites and built-browser Fetch suite.
  `pnpm --filter @web-ts-toolkit/express-request-attestation exec vitest run --config vitest.node.config.mts test/signer-client.test.ts test/fetch-client.test.ts -t 'injected Fetch receiver'`:
  **12 selected cases: 4 failed / 8 passed**, with **169 prior cases deselected**.
  All four ordinary-function variants receive the internal config as `this`
  instead of `undefined`, across two discoveries or two stale-key attempts.
  All eight caller-bound/closure controls already pass. These are callback
  contract controls, separate from the installed native HTTP evidence above.

Follow-up Completion evidence — explicit native Fetch injection:

- **RATT-09 is completed again.** This evidence supersedes the original
  default-only receiver scope/conclusion, while retaining its verified default
  workflows and historical reproduction. The explicit native injection acceptance
  gap is now reproduced and resolved for both discovery APIs and both API aliases.
- Exact repo-relative paths changed by this follow-up:
  - `packages/express-request-attestation/src/signer-client.ts`
  - `packages/express-request-attestation/src/attested-fetch.ts`
  - `packages/express-request-attestation/test/fetch-receiver.cases.ts` (new)
  - `packages/express-request-attestation/test/signer-client.test.ts`
  - `packages/express-request-attestation/test/fetch-client.test.ts`
  - `packages/express-request-attestation/test/fetch-end-to-end.browser.ts`
  - `packages/express-request-attestation/test/packed-consumer.test.ts`
  - `packages/express-request-attestation/test/installed-browser-harness.ts`
  - `packages/express-request-attestation/test-packed-consumer/consumer/installed-browser.mjs`
  - `packages/express-request-attestation/test-packed-consumer/consumer/signer-browser-only.ts`
  - `packages/express-request-attestation/test-packed-consumer/consumer/consumer-types.mts`
  - `packages/express-request-attestation/test-packed-consumer/consumer/consumer-types.cts`
  - `docs/tasks/20261012-164617-express-request-attestation-health-review.md` (RATT-09 only).
- Runtime change is limited to the two Fetch invocation sites: copy `config.fetchImpl`
  to a local variable and call it as a function. No internal config becomes `this`;
  no global/caller receiver is forcibly assigned to injected functions. Both
  existing **default** `globalThis` bindings remain. RATT-11's non-OK cancellation,
  generation ownership, original request/response ownership and error/retry paths
  are preserved; public options, aliases, signatures and exports are unchanged.
- The **12 shared callback cases pass in each runtime**: all four public paths
  with ordinary strict functions, bound functions, and closures. Ordinary callbacks
  now observe `undefined`, while the eight bound/closure controls retain the same
  application-selected receiver. Assertions cover two standalone discoveries,
  client sharing/cache/invalidation/reload, or both stale-key API attempts with
  fresh nonces, identical body text, readable caller Requests and manual redirects.
- The installed public `/signer` fixture now supplies the literal, unbound native
  `globalThis.fetch` at one selected public boundary per case. Native module
  loading and the other transports stay on their defaults. Chromium
  **151.0.7922.34** produced these post-fix server-observed counts:

  | Explicit native injection                | Discovery / key modules / runtime modules | API statuses / POSTs | OPTIONS | Successful reserves / business effects |
  | ---------------------------------------- | ----------------------------------------- | -------------------- | ------- | -------------------------------------- |
  | `fetchSignerBundle({ fetch })`           | **2 / 1 / 1**                             | `200` / **1**        | **1**   | **1 / 1**                              |
  | `createSignerClient({ fetch })`          | **2 / 2 / 1**                             | `403, 200` / **2**   | **2**   | **1 / 1**                              |
  | `fetchWithAttestation(..., { fetch })`   | **2 / 2 / 1**                             | `403, 200` / **2**   | **2**   | **1 / 1**                              |
  | `fetchWithAttestation(..., { fetchFn })` | **2 / 2 / 1**                             | `403, 200` / **2**   | **2**   | **1 / 1**                              |

  The standalone case makes **one explicit standalone discovery**, then a separate
  default client's discovery before POST; both share the browser's native module
  cache. The explicit-client case proves two concurrent callers and a cached call
  share the initial signer before the rotation reload. Every rotation still has
  fresh K1/K2 envelopes/nonces/MACs, identical **74 UTF-8 bytes**, real credentialed
  CORS/preflight and exactly one reservation/effect. Failure counters were captured
  before cleanup in the pre-fix runs, rather than inferred from thrown errors.

- All **8 prior packed tests** also pass, including the original four default
  browser workflows, readable hidden-marker/auth failures, CJS/ESM release-flat
  consumers, inventories and strict README/declaration/browser-only gates.
  Both installed NodeNext conditional forms and the browser-only `types: []`
  fixture now compile actual native Fetch injection through all four public paths
  without suppressing casts. The packed lane still runs **8 compiler invocations**,
  **6 backend / 2 browser README examples**, plus the two browser examples in the
  separate install without server packages or Node/Express types.
- Final required checks from `<repo-root>` (fresh build first, test lanes serial;
  packed scratch projects selected through `TMPDIR` in the approved location):
  - `pnpm --filter @web-ts-toolkit/express-request-attestation... build`: **passed**
    both CJS/ESM entries and **6 declaration outputs**.
  - `pnpm --filter @web-ts-toolkit/express-request-attestation typecheck`: **passed
    all 5 configurations**.
  - `pnpm exec eslint packages/express-request-attestation/`: **passed, 0 errors /
    0 warnings**, including every touched code/fixture file.
  - `pnpm --filter @web-ts-toolkit/express-request-attestation exec vitest run --config vitest.node.config.mts test/signer-client.test.ts test/fetch-client.test.ts test/signer-discovery-http.test.ts --disableConsoleIntercept`:
    **3 files / 183 tests passed**: client **74**, Fetch **107**, native HTTP **2**.
  - `pnpm --filter @web-ts-toolkit/express-request-attestation test:browser`:
    **3 files / 141 tests passed**, **+12** over the supplied 129-test baseline.
  - `pnpm --filter @web-ts-toolkit/express-request-attestation test:packed-consumer --disableConsoleIntercept`:
    **1 file / 12 tests passed**, **+4** over the supplied 8-test baseline.
  - `git diff --check` and `git diff --quiet HEAD -- CHANGELOG.md`: **passed**.
    All final test runs reported **0 failures / 0 skips / 0 unhandled-rejection
    reports**. Existing Node localStorage and Vite dynamic-import notices remained
    nonblocking. The full Node aggregate was not rerun; the independent reviewer
    owns the combined aggregate gate.
- RATT-11's unchanged native Node/Chromium regressions each still observe **4/4
  failed responses closed before EOF** across deadline/disposal, then **5/5**
  after the retirement-refetch failure, with **0 left open** and recovery to
  **9 discoveries = 5 failed + 4 successful**. The shared caller-signal control
  remains open until its own explicit cancellation. No RATT-11/12 runtime or
  formatting correction was overwritten.
- Fixture cleanup completed on pre-fix failures and final success; no installed
  browser-server processes or tracked packed-consumer scratch roots remained.
  Evidence remains Chromium/loopback same-site CORS and process-local memory,
  with no third-party-cookie, other-engine, production proxy/CSP or failover claim.
  **Blockers/follow-ups: none for RATT-09.** RATT-10's coordinator-owned blocked
  record is preserved for the independent follow-up review. No dependencies,
  commits, root changelog edits or new agents were introduced.

### Task RATT-11: Release unsuccessful discovery responses before rejecting

Status: completed

Kind: defect

Priority: P1 — repeated dependency failures retain abandoned native HTTP responses.

Suggested agent: response/resource ownership engineer in a new isolated session.

Dependencies: RATT-09.

Primary ownership: `packages/express-request-attestation/src/signer-client.ts`,
focused client/stream tests and native HTTP/Chromium regression fixtures, README
or JSDoc only where failure ownership needs clarification.

Finding: independent RATT-10-F01 reproduced four still-open native HTTP responses
after one standalone and three client discovery failures, beyond the deadline and
client disposal. `fetchMetadataDocument` throws on `response.ok !== true` without
cancelling its body. Client failure cleanup subsequently drops its aborter.
Callers receive only an error and cannot release the package-owned Response.

References: `packages/express-request-attestation/src/signer-client.ts:490-515`
(`fetchMetadataDocument`), `:691-724` (load cleanup), and RATT-10-F01's native Node
and Chromium probe evidence below. Existing non-OK fixtures are finite and only
assert errors; successful-status stream tests do not cover this ownership path.

Requirements:

1. Discard each owned non-2xx discovery body at the shared discovery boundary
   before reporting the fixed typed failure. Do not consume arbitrary error
   payloads, wait for EOF/cancellation, import a module, or dispose caller signals.
2. Cover standalone discovery, first client discovery, and the one retirement
   refetch. Synchronous, rejecting, and pending cancellation must not replace or
   delay rejection or create an unhandled rejection. Attempt cancellation once.
3. Preserve single-flight recovery, obsolete-generation ownership, one-refetch
   limits, native Fetch receiver binding, and caller-owned lifecycle.
4. Add focused controls and real native Node/Chromium HTTP evidence that the
   server observes the abandoned response close before EOF, including repeated
   explicit calls and recovery after the service becomes available.

Acceptance criteria:

- Error discovery fails immediately with the existing error code and leaves no
  package-owned native response open in the reproduced four-failure scenario.
- All three discovery paths attempt nonblocking cleanup exactly once; rejecting
  or never-settling cancellation does not hang/retry/import or leak rejection.
- Native HTTP resource counters and later recovery pass in Node and Chromium;
  prior generation/stream/installed browser contracts continue to pass.

Verification: shared build/typecheck/touched lint; focused client/native HTTP
tests; Node and Chromium lanes; packed-consumer lane if its fixtures change.
RATT-10 will re-run the combined final gates after this behavioral correction.

Pre-fix regression evidence (before runtime edits, from `<repo-root>`):

- Added shared Node/built-Chromium cancellation controls in
  `packages/express-request-attestation/test/discovery-response.cases.ts` and
  native HTTP regressions in
  `packages/express-request-attestation/test/signer-discovery-http.test.ts`.
  Reused the installed-browser harness's native built-ESM/page-bridge and owned
  server/browser cleanup patterns without changing publication fixtures.
- `pnpm --filter @web-ts-toolkit/express-request-attestation... build`: passed
  CJS/ESM and all six declaration outputs before built-entry reproduction.
- After correcting the new assertions to include the existing error-message
  prefix, `pnpm --filter @web-ts-toolkit/express-request-attestation exec vitest run --config vitest.node.config.mts test/signer-client.test.ts test/signer-discovery-http.test.ts --disableConsoleIntercept`:
  **2 files / 70 tests: 15 failed, 55 passed**. All **52 prior client tests** and
  three new bodyless-response controls passed. The twelve path/cancellation cases
  and obsolete-cancellation case observed **0 cancellation attempts**; both native
  HTTP tests failed their response-close counters.
- Native Node **v26.10.0** and Chromium **151.0.7922.34** each observed **4 opened /
  0 closed / 0 EOF** after one standalone failure and three explicit client
  failures, a **500 ms** wait beyond the **250 ms** client deadline, then disposal
  and another **50 ms** wait. The held ordinary Fetch sharing the standalone
  caller signal remained open until explicit cancellation, then showed **1 close
  before EOF**. A subsequent retirement refetch added a fifth abandoned response:
  **5 opened / 0 closed / 0 EOF**, including after successful service recovery.
  No module work occurred during the original four failures. Chromium used native
  Fetch/import defaults; Node used native Fetch with only a module-loader seam
  because stock Node does not import HTTP module URLs. All counter snapshots
  preceded test cleanup; servers/connections/browsers closed in `finally`.
- `pnpm --filter @web-ts-toolkit/express-request-attestation exec vitest run --config vitest.browser.config.mts test/stream-limits.browser.ts`:
  real Chromium, **1 file / 25 tests: 13 failed, 12 passed**. The same thirteen
  cancellation regressions failed; all nine prior stream tests and three new
  bodyless controls passed. Neither corrected pre-fix run reported unhandled
  rejections.

Completion evidence:

- Changed `packages/express-request-attestation/src/signer-client.ts`: the shared
  `fetchMetadataDocument` non-OK branch attempts `body.cancel()` once, observes
  rejection, catches synchronous cancellation faults, and immediately reports the
  existing `SignerClientError`, code **SIGNER_LOAD_FAILED**, message
  **`[express-request-attestation] Signer metadata fetch failed.`** No reader,
  error-payload accumulation, retry, additional timer, or caller-signal abort is
  introduced. Standalone, initial-client, and retirement-refetch discovery all
  use this boundary. Public JSDoc clarifies discarded-response ownership; it
  survives both `packages/express-request-attestation/dist/signer.d.ts` and
  `packages/express-request-attestation/dist/signer.d.mts`. Both emitted runtime
  forms contain the cancellation branch.
- Added `packages/express-request-attestation/test/discovery-response.cases.ts`,
  registered by `packages/express-request-attestation/test/signer-client.test.ts`
  and `packages/express-request-attestation/test/stream-limits.browser.ts`.
  Its **16 cases per runtime** cover all three paths with settling, synchronous-
  throwing, rejecting, and pending cancellation; three bodyless non-OK controls;
  and late obsolete cancellation rejection during a current load. Failures settle
  at **0 advanced ms**, initiate **1 cancellation**, acquire/read **0 readers /
  chunks / whole-value payloads** for discarded bodies, and leave **0 owned timers**. Advancing beyond
  the load deadline does not recancel or retry. Each path then recovers, including
  while cancellation remains pending; client peers share one recovery promise and
  one discovery/import. Successful bodies are consumed without cancellation.
  The obsolete-rejection case preserves the current promise, timer and signal
  until caller disposal cancels that current body once. Caller abort reason and
  ownership remain intact.
- Added `packages/express-request-attestation/test/signer-discovery-http.test.ts`
  to `packages/express-request-attestation/vitest.node.config.mts`. Native Node
  and Chromium run the same loopback sequence against built ESM. In **each**:
  - The original four failures now show **4 opened / 4 closed before EOF / 0
    finished / 0 left open**, both after the **500 ms** deadline wait and after
    disposal plus **50 ms**. Discovery count stays **4**, with **0 module work**.
  - The separate ordinary Fetch sharing the standalone caller signal stays open
    and unread throughout package failure/disposal, then explicit cancellation
    produces **1 close before EOF**. The caller signal is still un-aborted.
  - Restoring service succeeds for standalone discovery and three single-flight
    client callers, plus a cached call: **2 additional discoveries**. A real
    Chromium module-retirement failure then triggers the one refetch; its 503
    body closes, producing **5 opened / 5 closed before EOF / 0 finished / 0 left
    open**. Restoring service again lets three callers on that same client share
    recovery and a cached signer. Final totals: **9 discoveries = 5 failed + 4
    successful**, **1 explicitly cancelled control**. Chromium requests the ready
    module **once** (native cache) and retired module **once**, with **0 page
    errors**; Node's HTTP-import seam runs only the **4 expected module attempts**.
    Counter snapshots precede fixture cleanup. Native Fetch is unmodified in both
    environments; Chromium also uses the default native module loader and receiver.
- Required post-fix checks from `<repo-root>`:
  - `pnpm --filter @web-ts-toolkit/express-request-attestation... build`: passed
    both CJS/ESM entries and **6 declaration outputs**.
  - `pnpm --filter @web-ts-toolkit/express-request-attestation typecheck`: passed
    all **5 configurations**. Its first run caught the new HTTP test's use of
    `import.meta` under the package's CommonJS test classification; the fixture
    now uses the existing `__dirname`/`node:path` pattern and the full rerun passes.
  - `pnpm --filter @web-ts-toolkit/express-request-attestation exec vitest run --config vitest.node.config.mts test/signer-client.test.ts test/signer-discovery-http.test.ts --disableConsoleIntercept`:
    **2 files / 70 tests passed** (client **68**, native HTTP **2**), with the
    Node/Chromium server counters above printed by the native suite.
  - `pnpm --filter @web-ts-toolkit/express-request-attestation test:node`:
    **18 files / 606 tests passed**, **+1 file / +18 tests** over the RATT-10
    baseline. This includes all prior generation, stream, Fetch ownership and
    receiver/HTTP contracts, plus all **49 Mongo unit tests**.
  - `pnpm --filter @web-ts-toolkit/express-request-attestation test:browser`:
    real Chromium against built ESM, **3 files / 129 tests passed**, **+16 tests**
    over the RATT-10 baseline, including all **25 stream/discovery cases**.
  - `pnpm exec eslint packages/express-request-attestation/`: passed,
    **0 errors / 0 warnings**, covering all six touched code/test/config files.
  - `git diff --check` and `git diff --exit-code -- CHANGELOG.md`: passed.
    All final required test lanes have **0 failures / 0 skips / 0 unhandled-rejection
    reports**. Existing Node localStorage and Vite dynamic-import notices remain
    nonblocking. Test lanes ran serially after the build.
- This execution record is
  `docs/tasks/20261012-164617-express-request-attestation-health-review.md`.
  Packed-consumer fixtures were not changed, so their conditional RATT-11 lane
  was not rerun; RATT-10 owns the subsequent combined artifact/live-store gate.
  **No RATT-11 blocker remains.** RATT-12 owns the recorded root lint correction,
  after which the independent RATT-10 review can resume. Existing concurrent work
  was preserved; this task introduced no dependency or root changelog changes.

### Task RATT-12: Restore the pre-existing root lint baseline with five line joins

Status: completed

Kind: defect

Priority: P2 — a confirmed syntax-formatting issue blocks the mandatory root lint gate.

Suggested agent: narrow verification-maintenance engineer in a new isolated session.

Dependencies: RATT-11.

Primary ownership (only the five reported expressions):

- `packages/access-router/test/operation-access-boundaries.integration.test.ts:1123-1124,1532-1533`
- `packages/access-router/test/service-authorization-public-boundaries.integration.test.ts:302-303,426-427,946-947`

Finding: root lint reports five `no-unexpected-multiline` errors for a newline
between `request(f.app)` and `[method](...)`. The coordinator verified
`git diff --exit-code --` for both paths is clean and reproduced their five errors
with targeted ESLint. Thus these exact lines already exist at HEAD; this finding
does not attribute them to the unrelated concurrent Access Router work.

References: RATT-10-F02's reproduced root-lint report and the two inspected test
paths above (`request(f.app)` followed by computed method access).

Requirements:

1. Join each reported computed member access onto its preceding call line. Make
   no semantic change, assertion change, suppressing comment, or broad formatting.
2. Inspect worktree state before editing; if these exact lines have concurrent
   changes, preserve them and report any collision to the coordinator.
3. Review the diff to confirm only five whitespace joins in these two tests, then
   run their lint and the mandatory root `pnpm lint`.

Acceptance criteria:

- All five existing errors are removed with the same tokens and runtime behavior.
- Both targeted ESLint and root `pnpm lint` pass; no concurrent edits or other
  package files are changed by this task. Root `CHANGELOG.md` remains unchanged.

Verification: targeted `pnpm exec eslint` on the two exact paths, root `pnpm lint`,
`git diff --check`, and independent diff inspection. No new tests or unrelated
runtime test/build are warranted for these syntax-preserving whitespace joins.

Completion evidence:

- Confirmed RATT-11 was completed, read the shared scope/execution rules and
  applicable `AGENTS.md`, and marked RATT-12 `in_progress` before implementation.
  Initial `git status --short` showed existing concurrent work;
  `git diff HEAD -- packages/access-router/test/operation-access-boundaries.integration.test.ts packages/access-router/test/service-authorization-public-boundaries.integration.test.ts`
  returned no diff. Both owned test files still matched HEAD, with all five
  reported line breaks present and no edit collision.
- Applied exactly five whitespace joins with `apply_patch`:
  - `packages/access-router/test/operation-access-boundaries.integration.test.ts`:
    joined `request(f.app)` to `[method](...)` at old lines **1123-1124** (now
    **1123**), and to `[op === 'create' ? 'post' : 'patch'](` at old lines
    **1532-1533** (now **1531**).
  - `packages/access-router/test/service-authorization-public-boundaries.integration.test.ts`:
    joined `request(f.app)` to `[method](url)` at old lines **302-303**, **426-427**,
    and **946-947** (now **302**, **425**, and **944**, respectively).
- Inspected `git diff --stat --numstat --patch HEAD -- packages/access-router/test/operation-access-boundaries.integration.test.ts packages/access-router/test/service-authorization-public-boundaries.integration.test.ts`:
  exactly **5 hunks / 5 insertions / 10 deletions**, comprising **2 joins** in the
  first file (**+2/-4**) and **3 joins** in the second (**+3/-6**). Each hunk only
  removes the newline and indentation before the computed member access; tokens,
  assertions, remaining formatting, and runtime behavior are preserved.
- Required checks from `<repo-root>`:
  - `pnpm exec eslint packages/access-router/test/operation-access-boundaries.integration.test.ts packages/access-router/test/service-authorization-public-boundaries.integration.test.ts`:
    **passed, 0 errors / 0 warnings**.
  - `pnpm lint`: **passed, 0 errors / 0 warnings** for the root `eslint .` gate.
  - `git diff --check`: **passed**.
  - `git diff --exit-code HEAD -- CHANGELOG.md`: **passed**, no changelog diff.
- Task edits are confined to the two test files and this RATT-12 record. Existing
  concurrent work was preserved. No tests, build/runtime suites, suppressions,
  configuration changes, or commits were introduced or run for this formatting
  correction. **No RATT-12 blocker remains; independent RATT-10 review can resume.**

### Task RATT-10: Independently reconcile every outcome and run final package gates

Status: completed

Coordinator final-audit update: reopened pending the RATT-09 explicit native Fetch
injection follow-up. Earlier combined-gate and F01/F02 resolution evidence remains
valid for that reviewed revision; the final reviewer must verify the added
receiver case and the combined result after RATT-09 completes again.

Resolution: the explicit native Fetch follow-up is independently accepted in the
**newest Completion evidence** at the end of this RATT-10 section. The reopening
is closed; earlier gate counts remain historical.

Kind: improvement

Priority: P1 — completed labels need independent runtime and installed-contract evidence.

Suggested agent: independent reviewer in a fresh session, not an implementation owner.

Dependencies: RATT-01 through RATT-09, RATT-11, RATT-12.

Primary ownership: review of all package changes and this task's final evidence;
substantial code corrections return to the coordinator as explicit follow-up tasks.

Finding: fixes cross proof validation, native browser ownership, async generations,
resource lifecycles, distribution, declarations, and deployment docs. Per-file
success alone cannot demonstrate their combined contracts.

References: every task above; package README/exports and test scripts; root AGENTS.md.

Requirements:

1. Review the complete diff and reconcile each acceptance criterion with actual
   tests/behavior and completion evidence. Check alternate entry paths, bounded
   resources, error sanitization, reservation ownership, and public types/docs.
2. Run the shared final complete package `test`, `typecheck` (including RATT-08's
   consumer gate), root `pnpm lint`, and `git diff --check` serially. Record per-lane
   file/test counts and actual prerequisites. Do not replace live/artifact checks
   with mocks or automatically rerun passed gates without a concrete reason.
3. Verify source/release package inventories, named exports, browser-only closure,
   native browser workflow, and unchanged root `CHANGELOG.md`.
4. Report new findings to the coordinator before adding scope. Keep this task
   blocked/in progress until mandatory acceptance and any necessary follow-ups pass.
5. Produce a concise acceptance reconciliation and explicit scope limitations,
   after which the coordinator performs the final whole-file/code review.

Acceptance criteria:

- RATT-01 through RATT-09 plus RATT-11/RATT-12 are completed with verified evidence, and final required
  checks pass on the combined work; every required task is completed.
- No unresolved acceptance gap is hidden as an optional deferral; external
  deployment limitations remain factual and documented.
- This file has final independent review evidence ready for coordinator sign-off;
  root `CHANGELOG.md` remains byte-for-byte unchanged.

Verification: shared final gates and evidence review above.

Independent review evidence (first pass, fresh reviewer session, 2026-10-12; historical):

> Superseded by the final **Completion evidence** below. The blocked verdict,
> failed root lint result, and then-open F01/F02 statements in this first-pass
> record describe the pre-follow-up state. RATT-11 and RATT-12 resolve both
> findings; the resumed independent review and combined final gates pass.

- Marked RATT-10 `in_progress` before reviewing the implementation. Read this
  complete document, including historical/superseding findings and handoffs,
  applicable `AGENTS.md`, the complete scoped tracked diff, and all nine new
  package files. Reviewed runtime boundaries, regression assertions, native HTTP
  fixtures, metadata/build configuration, emitted declarations, and shipped README.
- **Verdict: blocked.** The required package lanes and declaration checks pass,
  but RATT-10-F01 below is a reproduced metadata-response ownership gap in the
  RATT-04 acceptance boundary. Root lint also fails outside this package
  (RATT-10-F02). These findings need coordinator-owned follow-up before independent
  acceptance can be completed. This evidence is not coordinator sign-off.
- Reviewer edits are confined to this RATT-10 record. Runtime probes used inline
  commands against the freshly built ESM; they introduced no package files.
  `git diff --numstat -- packages/express-request-attestation` and
  `git ls-files --others --exclude-standard -- packages/express-request-attestation`
  confirmed **38 tracked modified files / 9 new files**, matching the reviewed
  inventory. The new files are:
  - `packages/express-request-attestation/src/bounded-byte-stream.ts`
  - `packages/express-request-attestation/test/request-body.test.ts`
  - `packages/express-request-attestation/test/stream-limits.browser.ts`
  - `packages/express-request-attestation/test/fetch-ownership.cases.ts`
  - `packages/express-request-attestation/test/fetch-transport.cases.ts`
  - `packages/express-request-attestation/test/installed-browser-harness.ts`
  - `packages/express-request-attestation/test-packed-consumer/consumer/installed-browser-server.mjs`
  - `packages/express-request-attestation/test-packed-consumer/consumer/installed-browser.mjs`
  - `packages/express-request-attestation/test-packed-consumer/consumer/installed-browser.html`

Required commands, run from `<repo-root>` in the required serial order:

1. `pnpm --filter @web-ts-toolkit/express-request-attestation test`: **passed**.
   `TMPDIR` selected the harness-approved external scratch directory. One package
   build emitted both CJS/ESM entries and six declaration files, followed by:

   | Lane             | Files / tests passed | Actual prerequisite and evidence boundary                                                                                                                                        |
   | ---------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | Node             | **17 / 588**         | Installed dependencies and native Playwright Chromium; includes all 49 Mongo unit tests.                                                                                         |
   | Redis            | **1 / 62**           | Disposable Docker `redis:6.2-alpine` and `redis:7.2-alpine`, **31 tests per image**, real independent clients, Lua admission and HTTP replay checks.                             |
   | MongoDB          | **1 / 31**           | Available MongoDB binary; real `MongoMemoryReplSet` with one member, two driver clients and transactional/HTTP replay assertions.                                                |
   | Chromium         | **3 / 113**          | Real Chromium against the built signer ESM, including native Request guards and stream behavior.                                                                                 |
   | Packed consumers | **1 / 8**            | Fresh isolated release-flat tarball installations using registry/cache access; CJS/ESM, eight installed compiler invocations, inventories, and four real browser HTTP scenarios. |

   All lanes reported **0 failures / 0 skips**, with no unhandled-rejection
   reports. The database lanes include local validation and injected-failure
   controls; those controls are not presented as live server-failure evidence.
   Actual live success is established by their real service/client/ledger and HTTP
   checks, not the Node lane's stubs. Node was **v26.10.0**, pnpm **11.18.0**,
   Docker server **29.7.2**, tsup **8.5.1**, Vitest **4.1.11**; the supplementary
   native browser probe confirmed Chromium **151.0.7922.34**. Existing Node
   localStorage and Vite dynamic-import notices were nonblocking.

2. `pnpm --filter @web-ts-toolkit/express-request-attestation typecheck`:
   **passed all five configurations**, visibly including the three built-
   declaration consumer commands. Both NodeNext forms, Bundler, real Express
   handler assignments, and browser `types: []` closure compile.
3. `pnpm lint`: **failed, exit 1**, with **5 errors / 0 warnings**, all in the
   Access Router files listed under RATT-10-F02. No attestation error was reported.
4. `git diff --check`: **passed**.

Additional inventory/artifact review:

- `git diff --exit-code -- CHANGELOG.md`: **passed**, no root changelog diff.
  Source/release pack dry runs already executed in the passing packed lane;
  inspected their assertions and manifest transformation without rerunning packs.
  Source packaging includes README and `dist`; release packaging flattens the ten
  emitted files beside README, LICENSE and rewritten package metadata. Both
  conditional declaration forms and shared declaration chunks are included.
- Inspected emitted public declarations and their matching source. Internal
  preflight/stream helpers are absent from the public declarations; named exports
  and conditional paths remain compatible. The packed lane checks all six
  declaration files and **14 factory-hover contracts**, compiles **6 backend / 2
  browser README examples**, and separately compiles the two browser examples
  without Express/Redis/MongoDB or Node/Express types.
- Confirmed actual default transport binding in
  `packages/express-request-attestation/src/signer-client.ts:164-179` and
  `packages/express-request-attestation/src/attested-fetch.ts:177-197`, followed
  through to the `config.fetchImpl` calls. Fresh
  `packages/express-request-attestation/dist/signer.mjs:935,1649` and its CJS
  counterpart both bind the global Fetch receiver. The passing installed-browser
  fixture supplies neither Fetch nor module-loader overrides.
- Post-gate checks found no running installed-browser-server/Mongo harness process,
  no containers from either tested Redis image, and no tracked packed-consumer
  temporary roots. Evidence covers this package plus repository lint/whitespace;
  it does not constitute full runtime testing of other repository packages.

Per-task acceptance reconciliation:

| Task    | Independent reconciliation against current source/tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RATT-01 | `packages/express-request-attestation/vitest.node.config.mts` retains all prior Node suites and includes `packages/express-request-attestation/test/mongo-store.test.ts` once. Its 49 tests remain intact; Node now has 17 files including the later body suite. Database/browser/packed includes remain disjoint and the aggregate command runs lanes serially.                                                                                                                                                                                                                                                                                                |
| RATT-02 | Middleware preflight captures one canonical envelope before provider work; the pure verifier cannot accept caller-supplied decoded framing as a bypass. Protocol/middleware/order tests assert zero provider/reserve/handler calls for invalid headers, real identical/conflicting raw duplicates, BOM rejection in both entries, quoted-comma Content-Type acceptance, and fixed provider failures without stale markers/diagnostics. Thirteen actual field mutations preserve the original valid control. Timing checks precede reservation and follow async waits; tests and source retain reservations after handler failure/deadline crossing/uncertainty. |
| RATT-03 | `awaitingReplacement` coalesces any older-key challenge until installation, including failed-load recovery. The 52 client tests cover K1/K2/K3 metadata/module races (3 discoveries/imports), failed-discovery recovery (4 discoveries/3 imports), installed same-key re-invalidation, obsolete rejection/timeout ownership and disposal. Same-key changed-URL recovery and unchanged-identity stop are asserted. The 29 signer tests include concurrent typed import failure followed by real-WebCrypto recovery.                                                                                                                                              |
| RATT-04 | The shared reader uses geometric bounded storage, one stop race, per-read deadline checks and a task yield every 128 chunks. The 16 body tests, metadata regressions and 9 built-browser stream tests cover overflow before EOF, cap equality, exact UTF-8/multipart bytes, empty/tiny floods, abort, stalled reads and throwing/rejecting/pending cancellation. The 32768 one-byte + 32768 empty-chunk experiment and elapsed-clock checks execute in the Node gate. **Residual gap: non-2xx discovery responses bypass reader cleanup entirely (F01); this acceptance boundary is not fully satisfied.**                                                      |
| RATT-05 | Thirty-three shared native ownership cases run in Node and Chromium: inherited POST reuse/concurrency, used/locked rejection, independent non-null overrides, one-sample getters, native settings/signals and single FormData serialization. Reload/signing/construction/same-envelope fallback reads the same first JSON/text Response. Cancellation occurs after constructing the retry, never waits for a tee/producer, and abort releases only invocation-owned bodies. Digest assertions prove one hash across two attempts; live rotation counts one additional reservation/effect.                                                                       |
| RATT-06 | Twenty-two forbidden-name cases and effective no-cors fail before body/signer/API work; shared tests check exact proof retention on both constructed attempts. Chromium exercises actual header guards, including conditional method-override values; allowed custom fields/modes and independent server HTTP field acceptance remain covered. Retry construction failures preserve the readable first response.                                                                                                                                                                                                                                                |
| RATT-07 | The 31 bundle tests include gated activation/retirement/backward-clock boundaries, invalid post-provider clocks, fixed operational errors and bounded waits. All four root/custom/prefixed mounts fetch the published signer and its actual relative runtime import, checking immutable bytes, independent hashes and cache headers. Source rechecks current-key eligibility after snapshot copying and special-cases only the root asset join.                                                                                                                                                                                                                 |
| RATT-08 | Real handler/parser/error-handler/router assignments and public imports compile without suppressing casts. Five local configs and eight installed compiler invocations cover both entries/conditional forms and browser isolation. README and emitted docs explain policy/key-window uniformity, namespace migration, caller-owned non-TTL Mongo indexing/dependency deadlines, Request ownership, native transport and authentication/idempotency separation. **The broad failure-cleanup guarantee remains subject to F01.**                                                                                                                                  |
| RATT-09 | The installed public export reaches real Express through native Chromium discovery/import/Fetch. Same-origin: 1 API attempt/1 reservation/1 effect. Credentialed cross-origin rotation: 403 then 200, 2 attempts/2 preflights/2 discoveries, fresh proofs and identical 74-byte bodies, 1 reservation/1 effect. Missing marker exposure: readable 403, 1 attempt, 0 reservations/effects. Missing explicit cross-origin credentials: readable 401, 1 attempt, 0 guard/reservation/effect calls. Native global Fetch binding is present at both final call sites and exercised by the artifact lane.                                                             |
| RATT-10 | Independent review and mandatory commands executed; completion is blocked on the reproduced package gap F01 and required root lint failure F02. Coordinator final review remains pending.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

Necessary findings for coordinator assignment:

**RATT-10-F01 — P1: Cancel rejected discovery responses before dropping ownership.**

Resolution: **closed by RATT-11**, independently verified in the final Completion
evidence below. The following diagnosis and reproduction are historical.

- Scope/owner: signer-client lifecycle follow-up, primarily
  `packages/express-request-attestation/src/signer-client.ts` and focused
  `packages/express-request-attestation/test/signer-client.test.ts` /
  built-browser stream or native HTTP regressions.
- Evidence: `fetchMetadataDocument` at
  `packages/express-request-attestation/src/signer-client.ts:512-515` throws for
  `response.ok !== true` without reading or cancelling its body. Client failure
  cleanup at `:691-701,714-724` clears the timer/current aborter, so subsequent
  `dispose()` cannot reclaim that response. The package exposes only an error to
  its caller; the caller has no Response handle to clean up.
- Exact reproduced scenario: an isolated loopback server returns **503**, writes
  `temporarily unavailable`, and leaves the body open. Run one standalone
  `fetchSignerBundle` followed by three sequential `client.getSigner()` calls,
  wait beyond `loadTimeoutMs`, then dispose the client. Both a native Node probe
  (`node --input-type=module -e`, importing
  `packages/express-request-attestation/dist/signer.mjs`) and real Chromium probe
  (`pnpm --filter @web-ts-toolkit/express-request-attestation exec node --input-type=module -e`,
  serving that same built entry) produced **4 SIGNER_LOAD_FAILED rejections / 4
  still-open HTTP responses**. Node used **50 ms** load timeout and waited **150
  ms + 50 ms** around disposal; Chromium used **100 ms** and waited **200 ms**
  before disposal. A fifth ordinary native Fetch response, explicitly cancelled,
  closed at the server while the four package responses remained open. Probes
  closed their browsers/sockets/servers in `finally`; no mock transport or loader
  was used. This demonstrates abandoned live network work after terminal failure,
  not an authentication/replay bypass or a measured throughput claim.
- Existing coverage misses this: non-OK fixtures have finite in-memory bodies and
  assert the error/recovery result; incremental cancellation tests use successful
  HTTP status. They do not assert ownership of the non-2xx response path.
- Required focused acceptance for the follow-up:
  1. Discard every owned non-2xx discovery body without consuming it, waiting for
     EOF, importing, or awaiting producer cancellation; retain the fixed typed
     failure. Cover standalone discovery, first client discovery and the one
     retirement refetch. No caller-owned signal/client is disposed by cleanup.
  2. Native streams with synchronous-throwing, rejecting and never-settling cancel
     must preserve immediate failure, one cancellation attempt, no unhandled
     rejection and no additional load/retry. Repeated explicit recovery and
     obsolete-generation cleanup must retain their existing guarantees.
  3. A native HTTP/browser regression must observe server-side response closure
     before EOF after the rejected discovery and permit subsequent recovery.
     Rebuild and rerun affected Node/Chromium tests, then the mandatory combined
     package/declaration/lint/whitespace gate before completing RATT-10. Fix the
     behavior rather than weakening the cancellation contract.

**RATT-10-F02 — P1 gate blocker: Root lint has five Access Router errors.**

Resolution: **closed by RATT-12**, with the five whitespace-only changes reviewed
and root lint independently passed in the final Completion evidence below.

- `pnpm lint` reports `no-unexpected-multiline` at:
  - `packages/access-router/test/operation-access-boundaries.integration.test.ts:1124:11,1533:19`
  - `packages/access-router/test/service-authorization-public-boundaries.integration.test.ts:303:15,427:13,947:9`
- These are outside attestation scope. The Access Router owner/coordinator must
  resolve them and obtain a passing root `pnpm lint`; this review does not
  attribute their cause to attestation changes. A green package lint subset would
  not substitute for this mandatory root check.

Coordinator assignment after the first independent review: F01 is RATT-11.
F02 is RATT-12, after verifying both affected test files match HEAD and the five
errors reproduce independently. This is an explicit five-line formatting scope
exception; no unrelated runtime work is authorized. RATT-10 resumes only after
both tasks complete and records superseding verification without erasing the
initial failed-gate evidence above.

Deployment limitations remain the documented ones: Chromium on loopback HTTP
secure contexts; same-site/different-port CORS, not third-party-cookie coverage;
standalone Redis 6.2/7.2 and a single-member Mongo replica set, not cluster routing,
multi-node failover, persistence/restore guarantees or production proxy/CSP/load
proof. Native tee/producer queues and native module execution/cache are outside
the reader-owned buffer/cancellation guarantees. Public HMAC provides neither
user/session authentication nor durable business idempotency. At the first review,
F01 was an unresolved acceptance gap, not a deployment limitation or optional
deferral; its resolution is independently accepted below.

Completion evidence:

> Historical accepted checkpoint after RATT-11/12: Node 606, Chromium 129,
> packed consumers 8. The newer explicit-native-Fetch review and gate below
> supersede this checkpoint's counts and default-only transport coverage.

- **Final independent verdict: accepted. RATT-10 is completed.** This resumed
  review supersedes the historical blocked verdict and all then-open F01/F02
  statements above. **F01 and F02 are resolved; no outstanding acceptance gaps,
  necessary follow-ups, or gate blockers were found.** The coordinator's final
  whole-file/sign-off audit remains a separate pending step.
- Confirmed completed dependencies RATT-01–09, RATT-11 and RATT-12, read the
  current scope exception/new tasks/evidence, and set RATT-10 `in_progress` before
  the resumed review. Independently inspected the full follow-up source/tests and
  the two authorized Access Router diffs against the first-pass findings and prior
  acceptance. The reviewer changed only this RATT-10 record.
- Follow-up inventory: RATT-11 adds
  `packages/express-request-attestation/test/discovery-response.cases.ts` and
  `packages/express-request-attestation/test/signer-discovery-http.test.ts`, updates
  the shared discovery branch/JSDoc in
  `packages/express-request-attestation/src/signer-client.ts`, and registers the
  regressions in `packages/express-request-attestation/test/signer-client.test.ts`,
  `packages/express-request-attestation/test/stream-limits.browser.ts` and
  `packages/express-request-attestation/vitest.node.config.mts`. Post-gate scoped
  inventory is **38 tracked modified / 11 new package files**, plus exactly the
  **2 RATT-12 exception files**. The latter remain **5 hunks / +5/-10** in total:
  **+2/-4** in
  `packages/access-router/test/operation-access-boundaries.integration.test.ts`
  and **+3/-6** in
  `packages/access-router/test/service-authorization-public-boundaries.integration.test.ts`.
  Every exception hunk only joins `request(f.app)` to its computed member access;
  the tokens and assertions are identical. No additional runtime gate is required
  for those syntax-preserving joins.

Final combined commands, executed from `<repo-root>` **serially after RATT-11/12**:

1. `pnpm --filter @web-ts-toolkit/express-request-attestation test`: **passed**.
   `TMPDIR` selected the harness-approved external scratch directory. The command
   built once (both CJS/ESM entries and all six declarations), then ran every lane:

   | Lane             | Files / tests passed | Actual prerequisite / coverage                                                                                                                                                                                  |
   | ---------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | Node             | **18 / 606**         | Installed dependencies and native Chromium; all **49 Mongo unit tests**, **68 client tests** and **2 native Node/Chromium discovery HTTP tests** included.                                                      |
   | Redis            | **1 / 62**           | Disposable Docker Redis **6.2 / 7.2**, **31 tests per image**, real independent clients, atomic ledger and HTTP replay checks.                                                                                  |
   | MongoDB          | **1 / 31**           | Available MongoDB replica-set binary, real single-member `MongoMemoryReplSet`, independent clients, transactions and HTTP replay.                                                                               |
   | Chromium         | **3 / 129**          | Built signer ESM in real Chromium: Fetch **86**, signer **18**, stream/discovery **25**.                                                                                                                        |
   | Packed consumers | **1 / 8**            | Fresh isolated release-shaped tarball installs with registry/cache access; CJS/ESM, strict declarations/README, browser-only closure, source/release inventories and all four installed browser HTTP scenarios. |

   Every lane had **0 failures / 0 skips / 0 unhandled-rejection reports**. Local
   validation, injected cancellation/failure controls and Node's HTTP module-loader
   seam are not counted as live backend/native browser-module proof. The dedicated
   service checks use actual Redis/MongoDB, and Chromium's HTTP tests use native
   Fetch and native imports. Node **v26.10.0**, pnpm **11.18.0**, Docker server
   **29.7.2**, tsup **8.5.1**, Vitest **4.1.11** and installed Chromium
   **151.0.7922.34** were confirmed. Existing Node localStorage and Vite
   dynamic-import notices were nonblocking.

2. `pnpm --filter @web-ts-toolkit/express-request-attestation typecheck`:
   **passed all 5 configurations** (source, browser-only source, NodeNext
   declaration consumers for both `.mts`/`.cts`, Bundler, and browser declarations
   with `types: []`). All three declaration commands ran visibly.
3. `pnpm lint`: **passed, 0 errors / 0 warnings**. This closes the mandatory root
   gate failure, rather than substituting a package-only lint result.
4. `git diff --check`: **passed**.
5. `git diff --exit-code -- CHANGELOG.md` and
   `git diff --exit-code HEAD -- CHANGELOG.md`: **passed**; root changelog content
   remains identical to HEAD, including the index/worktree check.

F01/F02 resolution and artifact reconciliation:

- **F01:** `packages/express-request-attestation/src/signer-client.ts:512-521`
  now attempts body cancellation once at the common non-OK discovery boundary,
  observes promise rejection, catches synchronous faults and immediately throws
  the existing fixed `SIGNER_LOAD_FAILED`. It does not acquire a reader, consume
  arbitrary error payloads, await cancellation, or abort the caller's signal.
  All three paths (standalone, initial client and retirement refetch) share it.
  The **16 shared cases per runtime** verify immediate rejection at zero advanced
  time, cancellation variants/bodyless responses, zero reads, no extra retry,
  successful single-flight recovery and obsolete-cancellation ownership.
- The native HTTP regressions reproduce the original scenario with assertions
  taken **before fixture cleanup**: in Node and Chromium, **4/4 failed responses
  close before EOF**, **0 finish naturally**, and **0 remain open** across the
  deadline/disposal wait. The ordinary Fetch sharing the standalone caller signal
  stays open/unread until its own explicit cancellation. The failed retirement
  refetch then yields **5/5 closed before EOF**, followed by successful recovery
  on that same client. Final totals are **9 discoveries = 5 failed + 4 successful**;
  Chromium loads the ready module once and retired module once. The real browser
  path has no transport/loader override; the documented Node-only HTTP-import
  seam does not replace discovery transport.
- **F02:** independently inspected all five authorized line joins, with no token,
  assertion or suppression changes. The passing root `pnpm lint` confirms the five
  previously reported errors are gone. The exception is limited to those two
  files/expressions and does not attribute other Access Router work to this task.
- Fresh `packages/express-request-attestation/dist/signer.mjs:1240` and its CJS
  counterpart contain the non-OK cancellation branch. Both signer declaration
  forms retain the new non-OK ownership JSDoc. The default Fetch bindings remain
  present at `packages/express-request-attestation/dist/signer.mjs:935,1653` and
  the final discovery/API call sites use them. Public exports and browser isolation
  remain valid. The passing packed lane checks all **6 declaration files**, **14
  factory-hover contracts**, **8 installed compiler invocations**, **6 backend / 2
  browser README examples** and the separate browser-only README compile.
  Its source/release inventory dry runs cover the ten emitted files and release
  flattening; no redundant pack or already-passed runtime lane was rerun.

Final acceptance reconciliation for all twelve tasks:

| Task    | Independent final outcome                                                                                                                                                                                                                                                                                                                                                                                              |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RATT-01 | Accepted: Mongo's 49 unit tests execute once alongside every prior Node suite; the additional native HTTP file brings the lane to 18 files. Dedicated database/browser/packed boundaries and aggregate serialization remain valid.                                                                                                                                                                                     |
| RATT-02 | Accepted: shared bounded canonical preflight precedes providers; raw proof/Content-Type duplicates, BOM and invalid envelopes fail without replay allocation. Counting/hanging-provider, independent fixture and distinct field-tamper controls pass. Typed provider failures are sanitized 503s without stale markers; valid proof/time checks precede reservation and uncertainty never releases it.                 |
| RATT-03 | Accepted: all 52 prior client tests remain in the 68-test suite, including K1 late challenges while K3 replaces K2, failed replacement recovery, obsolete settlement/timeout and current disposal ownership. Same-key changed-URL recovery, unchanged-identity stop and typed concurrent lazy-crypto failure/recovery still pass.                                                                                      |
| RATT-04 | Accepted with RATT-11: incremental byte caps, geometric storage, cooperative work/deadlines, abort and nonblocking cancellation retain their Node/Chromium regressions and bounded-resource experiment. F01 closes the remaining non-OK metadata response ownership path; neither successful nor rejected discovery requires unbounded accumulation.                                                                   |
| RATT-05 | Accepted: native Request inheritance/overrides, concurrent/repeated finite reuse, exact multipart bytes, one sampled body/mode, readable stale fallbacks, safe abandoned-response disposal, exact abort reasons, one snapshot digest and at-most-one stale-only retry all pass.                                                                                                                                        |
| RATT-06 | Accepted: no-cors and forbidden proof fields fail locally before knowable body/signer/API work; final constructed proof retention is checked on both attempts. Real Chromium guard behavior, supported custom fields/modes and separate server HTTP validation pass.                                                                                                                                                   |
| RATT-07 | Accepted: post-provider current-key eligibility and invalid-clock/error boundaries pass; root/custom mounts with/without stripped prefixes resolve the actual signer/runtime imports to correct immutable bytes and hashes. Exact signed-target spelling remains covered.                                                                                                                                              |
| RATT-08 | Accepted: actual Express assignments and installed README examples compile without suppressing casts; both conditional entries, all declaration checks and browser-only types pass. Operational docs match ownership/deadlines, uniform time policy/key windows, Mongo non-TTL index provisioning and independent auth/idempotency responsibilities. F01's former documentation caveat is resolved.                    |
| RATT-09 | Accepted: default native discovery/import/API Fetch works from the installed tarball. Same-origin success, credentialed cross-origin rotation (2 attempts, 1 reservation/effect), hidden stale marker (1 attempt, 0 reservations/effects) and missing credentials (readable 401) all pass with exact 74-byte bodies, real cookies/preflight and caller Request reuse. Both native Fetch receiver fixes remain shipped. |
| RATT-11 | Accepted: all three non-OK discovery paths attempt nonblocking cleanup exactly once with fixed errors, safe cancellation failure handling and recovery. Native Node/Chromium close counters prove F01 resolved before cleanup, while the shared caller-signal control remains owned by its caller.                                                                                                                     |
| RATT-12 | Accepted: exactly five whitespace-only joins in the two authorized test files; identical tokens and runtime expressions, no suppression or assertion change, and independently passing root lint. F02 is resolved.                                                                                                                                                                                                     |
| RATT-10 | Completed: prior acceptance and both follow-ups independently reconciled; combined package/live/browser/installed/declaration/root lint/whitespace/protected-file checks all pass. This evidence is ready for the coordinator's separate final audit.                                                                                                                                                                  |

Scope and deployment limits: runtime coverage is the attestation package, plus
the explicitly reviewed RATT-12 formatting exception and repository lint/whitespace
checks. Other repository packages are not claimed fully runtime-tested. Browser
evidence is Chromium in loopback secure contexts and same-site cross-origin CORS;
it does not establish other engines, third-party cookies or production proxy/CSP
behavior. Standalone Redis and the single-member Mongo replica set do not prove
cluster routing, failover, persistence/restore or production load guarantees.
Reader-owned byte/work bounds do not bound native tee/producer queues, and
nonblocking cancellation does not promise completed producer cleanup. Native
module evaluation/cache remains outside cancellation ownership. Public HMAC is
not user/session authentication or durable business idempotency. These documented
deployment limitations contain no deferred RATT acceptance gap.

Completion evidence:

- **Newest independent verdict: accepted. RATT-10 is completed after the expanded
  RATT-09 native Fetch follow-up.** This is the authoritative current result,
  superseding the earlier blocked review, the **606 / 129 / 8** accepted checkpoint
  and the subsequent coordinator-audit reopening. Historical evidence is retained.
  **F01/F02 remain resolved, explicit native injection is accepted, and no
  outstanding acceptance gaps, actionable findings or gate blockers remain.**
- Checked all eleven dependencies were completed, read the expanded RATT-09
  requirements/pre-fix/superseding evidence and the RATT-10 reopening, then marked
  RATT-10 `in_progress`. Reviewed the added follow-up paths against the already
  reviewed baseline: both invocation sites, the new
  `packages/express-request-attestation/test/fetch-receiver.cases.ts`, three suite
  registrations, installed browser fixture/harness/assertions, and all three
  strict installed consumer changes. Reviewer edits remain in this RATT-10 record.

Current-revision combined gate, run from `<repo-root>` **serially**:

1. `pnpm --filter @web-ts-toolkit/express-request-attestation test`: **passed**,
   with `TMPDIR` selecting the harness-approved scratch directory. One build
   emitted both CJS/ESM entries and six declarations before the serial lanes:

   | Lane             | Files / tests passed | Actual prerequisite / coverage                                                                                                                                                  |
   | ---------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | Node             | **18 / 618**         | Includes Mongo unit **49**, client **74**, Fetch **107**, and native discovery HTTP **2**; installed dependencies and Playwright Chromium available.                            |
   | Redis            | **1 / 62**           | Real disposable Docker Redis **6.2 / 7.2**, **31 tests per image**, independent clients, ledger and HTTP replay assertions.                                                     |
   | MongoDB          | **1 / 31**           | Real single-member Mongo replica set and driver clients; required binary available, transaction and HTTP checks executed.                                                       |
   | Chromium         | **3 / 141**          | Built ESM: Fetch **98**, signer **18**, stream/discovery **25**. Includes all twelve new receiver controls.                                                                     |
   | Packed consumers | **1 / 12**           | Registry/cache-backed isolated tarball installs; four compatibility tests plus **eight real installed browser HTTP cases**, including all four explicit-native injection paths. |

   All lanes reported **0 failures / 0 skips / 0 unhandled-rejection reports**.
   Mock callback/cancellation controls remain distinct from the real service and
   installed-browser HTTP evidence. Node's documented HTTP-import seam does not
   substitute for Chromium's native imports. Existing Node localStorage and Vite
   dynamic-import notices were nonblocking.

2. `pnpm --filter @web-ts-toolkit/express-request-attestation typecheck`:
   **passed all 5 configurations**, visibly including all three built-declaration
   consumer commands; both NodeNext forms and browser `types: []` remain valid.
3. `pnpm lint`: **passed, 0 errors / 0 warnings** at repository scope.
4. `git diff --check`: **passed**.
5. `git diff --exit-code -- CHANGELOG.md` and
   `git diff --exit-code HEAD -- CHANGELOG.md`: **passed**, including protection
   against staged as well as worktree changes.

Expanded transport acceptance and shipped-artifact evidence:

- `packages/express-request-attestation/src/signer-client.ts:495-503` and
  `packages/express-request-attestation/src/attested-fetch.ts:729-740` copy
  `config.fetchImpl` to a local variable and invoke that function. Ordinary strict
  callbacks receive `undefined`, caller-bound functions retain their chosen
  receiver, and closures retain their behavior. Both default native bindings
  remain in the resolvers. There is no internal-config receiver, forced rebinding
  of injected functions, or change to request options/error/retry ownership.
- The **12 shared receiver cases per runtime** exercise both discovery APIs and
  both prepared-request aliases with ordinary/bound/closure functions across
  repeated discovery, shared client loading/cache/invalidation and both stale-key
  attempts. They preserve fresh nonces, identical bytes, readable caller Requests
  and manual redirects. No prior assertion was relaxed to obtain these results.
- Installed Chromium receives literal, unbound `globalThis.fetch` at each selected
  boundary. Independent server/browser assertions establish:

  | Explicit native boundary                  | Discoveries / key modules / runtime modules | POST statuses / count | OPTIONS | Successful reservations / effects |
  | ----------------------------------------- | ------------------------------------------- | --------------------- | ------- | --------------------------------- |
  | Standalone `fetchSignerBundle({ fetch })` | **2 / 1 / 1**                               | `200` / **1**         | **1**   | **1 / 1**                         |
  | `createSignerClient({ fetch })`           | **2 / 2 / 1**                               | `403, 200` / **2**    | **2**   | **1 / 1**                         |
  | Prepared `{ fetch }`                      | **2 / 2 / 1**                               | `403, 200` / **2**    | **2**   | **1 / 1**                         |
  | Prepared `{ fetchFn }`                    | **2 / 2 / 1**                               | `403, 200` / **2**    | **2**   | **1 / 1**                         |

  The standalone case includes its explicit discovery followed by a separate
  default client's discovery; native module caching accounts for one key-module
  request. The explicit-client case also verifies concurrent/cached signer reuse.
  Each rotation preserves all **74 UTF-8 body bytes**, real cookie/preflight
  behavior and fresh K1/K2 proofs, with no reservation/effect on the stale attempt.
  The four prior default-transport success/rotation/hidden-marker/missing-credentials
  cases remain in the passing lane.

- Fresh `packages/express-request-attestation/dist/signer.mjs:1222-1223,2056-2057`
  and the CJS counterpart contain the local-variable/bare calls; default bindings
  remain at `:935,1654`. Both emitted declaration forms preserve `fetch`/`fetchFn`
  signatures and RATT-11 cleanup documentation. Strict installed `.mts`, `.cts`
  and browser-only fixtures compile all four explicit native paths without casts.
  The packed lane still runs **8 compiler invocations**, **14 hover checks**, all
  **6 declaration-file checks**, **6 backend / 2 browser README examples** plus the
  separate browser-only README compile, and both source/release inventory dry runs.
  Release-flat paths, named exports and browser dependency isolation pass. No
  redundant pack or separately repeated passing test lane was needed.

Reconciliation with prior scope and findings:

- **RATT-01–08:** prior independent acceptance stands on the new combined gate.
  This follow-up changes only how selected Fetch functions are invoked; canonical
  preflight/BOM/raw Content-Type validation, sanitized provider failures,
  verify-before-reserve/final timing, retained uncertain reservations, bounded
  stream work, Request ownership/readable fallbacks, browser header/mode guards,
  post-provider key eligibility/root mounts, and shipped declarations/docs retain
  their reviewed behavior and passing regressions. Multi-generation K1/K2/K3 and
  obsolete-load/disposal ownership tests remain intact.
- **RATT-09:** expanded acceptance is satisfied for defaults, literal native
  injection, both API aliases, and caller-bound/closure transports. The earlier
  default-only conclusion is superseded by this complete receiver reconciliation.
- **RATT-11 / F01:** the same native Node/Chromium HTTP tests still assert **4/4**
  early failed responses closed before EOF and **5/5** after the failed retirement
  refetch, with zero naturally finished/left-open responses and later recovery.
  The caller-signal control stays open until explicit cancellation. Shared non-OK
  cancellation controls and the common cleanup branch remain valid with bare calls.
- **RATT-12 / F02:** the two authorized Access Router files still contain exactly
  five whitespace joins (**+2/-4**, **+3/-6**), with identical tokens/assertions;
  root lint passes. The exception authorizes no other Access Router work.
- **RATT-10:** completed on the current code with all dependencies, findings and
  required gates reconciled. Scoped inventory is **39 tracked modified / 12 new
  attestation package files**, plus the two established RATT-12 exception files.
  The coordinator's final review section is reserved for its separate sign-off.

Deployment limits are unchanged: Chromium/loopback secure contexts and same-site
cross-origin cookies, standalone Redis and a single-member Mongo replica set.
Other engines, third-party cookies, production proxy/CSP/load behavior, cluster
routing and persistent/failover replay guarantees are not established by these
checks. Reader-owned bounds exclude native tee/producer queues; cancellation is
nonblocking and cannot erase native module execution/cache. Public HMAC is not
authentication or durable business idempotency. Unrelated repository packages are
not claimed fully runtime-tested; no RATT acceptance gap is deferred as a limit.

## Definition of done

- Every promoted task is delivered by its own sequential sub-agent session and
  has `Status: completed` plus `Completion evidence` (paths, commands, results).
- Invalid request preflight is cheap; native stream/resource and reload ownership
  is bounded; supported retries preserve exact bytes and readable fallbacks.
- Public declarations and shipped examples describe the implemented product, and
  an installed real-browser/Express workflow proves the core business use case.
- Live stores, browser and packed-consumer lanes, typechecks, lint, and independent
  review pass. No root changelog edits or unrelated source changes are included.

## Coordinator final review

**Accepted and complete.** This sign-off follows completion of every sub-agent
task and the newest independent RATT-10 review.

- Audited the entire execution record: exactly twelve unique tasks, RATT-01
  through RATT-12, all with `Status: completed`, ownership, factual findings,
  requirements, acceptance criteria, verification, and `Completion evidence`.
  Dependencies are satisfied and acyclic; RATT-10's final review follows RATT-11
  and RATT-12. There is no pending, blocked, or unverified task status.
- Each task ran in its own isolated sub-agent session, sequentially. Rework of
  RATT-03, RATT-09, and RATT-10 resumed its original owner rather than mixing task
  contexts or running simultaneous agents/builds in this workstream.
- Reconciled the current implementation and evidence with the business workflows
  and newest independent per-task acceptance. The coordinator's three-generation
  invalidation and explicit-native-Fetch findings are covered and fixed; the
  independent review's F01 response-ownership and F02 lint findings are closed.
  Historical failures and smaller test counts are explicitly superseded, not
  outstanding work. No required acceptance gap remains.
- Inspected final discovery/API transport calls, non-OK response cleanup,
  bounded-reader ownership, server preflight/publication changes, public check
  scripts and documentation, and the exact RATT-12 diff. Default and injected
  transports use the correct receiver behavior; supported request reuse and
  readable fallbacks retain their regression evidence. The shipped examples and
  declaration gates cover the actual public entries without suppressing casts.
- Accepted the latest serial combined gate: **24 file runs / 864 tests passed**,
  comprising Node **618**, Redis **62**, MongoDB **31**, Chromium **141**, and
  release-shaped packed consumers **12**, with no failures or skips. All **five
  TypeScript configurations** and root `pnpm lint` passed. Required live and
  native-browser prerequisites were actually used; mocks do not stand in for
  deployment evidence.
- Coordinator checks from `<repo-root>`: `git diff --check` and
  `git diff --exit-code HEAD -- CHANGELOG.md` passed. The latest runtime checks
  cover the final code; this sign-off changes only the execution record.
- Reviewed scope is the attestation package, this record, and the explicitly
  authorized **five whitespace joins in two Access Router tests**. Their tokens
  and assertions are identical. Other concurrent workspace changes are outside
  this objective. Root `CHANGELOG.md` is identical to HEAD.
- Product/deployment limitations remain those recorded in the analysis and
  shipped README. They are not deferred task acceptance criteria. Full runtime
  testing of unrelated workspace packages is not claimed.
