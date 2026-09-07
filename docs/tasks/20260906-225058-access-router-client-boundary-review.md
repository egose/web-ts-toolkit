# Access Router Client Boundary Review

Created: 2026-09-06 22:50:58 local time

## Objective

Remediate newly identified persistence, cache, configuration, and public-type boundary gaps in `packages/access-router-client`. This is an executable sub-agent plan, not authorization to implement an unapproved public model redesign. Review deliverable only: no package source was changed while creating this file.

Non-goals: replacing Axios, redesigning the sibling protocol, adding automatic retries of mutations, broad service rewrites, or manually editing generated `dist/` files.

## Coverage And Baseline

- Inspected transport/cache, batching/lazy claims, model persistence, service defaults, model/subdocument operations, relevant unit/integration/type fixtures, package metadata, entrypoint/build configuration, README, and selected emitted declarations. Sibling contracts and Axios dispatch/settlement implementations were consulted for specific findings.
- Deduplicated against `20260806-144945-access-router-client-review-remediation.md`, `20260809-000824-access-router-client-post-review-remediation.md`, and `20260821-090419-access-router-client-health-follow-up.md` in this directory. These tasks track additional input classes and state transitions, not a repetition of their completed broad objectives. Historical completion evidence does not prove the new cases below.
- `git status --short`: clean before review.
- Executed from repository root: `pnpm --filter @web-ts-toolkit/access-router-client exec vitest run test/access-router-client.cache.unit.test.ts test/access-router-client.model-reconciliation.unit.test.ts test/access-router-client.arc22-adversarial.unit.test.ts`. Result: 3 files, 60 tests passed. Vite emitted a config-loader forward-compatibility warning; it did not fail the tests.
- New scenarios below were derived from source, not executed as new regressions. Agents must first reproduce confirmed defects in focused tests; downgrade or cancel a disproven finding with evidence.
- Full package tests, strict typechecks, real-browser/CORS checks, fresh builds, packed consumer checks, and full-repository gates were not run during this planning review. No exhaustive dependency/security audit or performance benchmark was performed. Existing generated declarations were inspected, not freshly built.

## Priorities And Coordination

- P0: demonstrated cross-identity exposure or comparable critical boundary failure. None established in this review.
- P1: silent persistence loss, incorrect response semantics, stranded requests, or credential-retention defects.
- P2: narrower configuration/type correctness or bounded architecture/performance work.
- P3: optional ergonomics/readability work without demonstrated behavioral harm.
- Every task begins `pending`; set `in_progress` only after dependencies finish. Record assigned agent, regression evidence, changed files, commands/results, and follow-ups. Use `blocked` with an exact prerequisite if required verification cannot run. Never mark implementation complete based only on a source edit.
- One cache owner executes BND-01 through BND-05 serially because they share `interceptors.ts` and cache tests. One model owner executes BND-06 through BND-08 serially. A batching owner can execute BND-09 independently. A service owner executes BND-10 then BND-11.
- BND-12 is a bounded investigation after model fixes. BND-13 is independent final review. Documentation/export-inventory changes belong to the integration owner after implementation decisions; coordinate them rather than racing on README or shared fixtures.
- Source work in independent ownership lanes may run concurrently, but ALL build/typecheck/test/pack commands must run serially: package scripts rebuild shared workspace outputs. Never revert another agent's changes.
- References below are repository-relative; line numbers are review-time anchors, so use the named behavior/symbol if they drift.

## Shared Verification

Prerequisites: repository-supported Node, pnpm, installed workspace dependencies (`pnpm install` if needed), and built transitive dependencies. Mongo integration tests may require a usable `mongodb-memory-server` binary/download. Record environmental blockers separately from assertion failures.

- V1, targeted: `pnpm --filter @web-ts-toolkit/access-router-client exec vitest run <test-files>` with the concrete files named by the task. Add exact-body, value/type, network-count, and settlement assertions where appropriate; do not rely only on `success`.
- V2, package: `pnpm --filter @web-ts-toolkit/access-router-client test`. Its script includes transitive builds, strict source/type/declaration checks, Node tests, and jsdom/Vite smoke tests. Run after each implementation lane and final integration.
- V3, published consumer: `npm pack --dry-run --json` from `packages/access-router-client`, plus V1 for `test/access-router-client.packed-consumer.test.ts`, `test/access-router-client.docs.compile.test.ts`, and `test/access-router-client.exports.unit.test.ts`. Check rebuilt CJS/ESM and strict NodeNext/Bundler consumers, not source-only imports.
- V4, final repository: run `pnpm build`, `pnpm test`, `pnpm lint`, and `git diff --check`, sequentially with adequate timeouts. Report failures and their ownership, never silently waive them.
- Public behavioral/type changes require README and high-value JSDoc updates, affected website/docs compile fixtures and snippet inventory updates, and release/migration notes according to repository practice. Generated declarations must agree. Preserve existing identity, failure-callback, request-claim, credential partition, and response-isolation guarantees.

## Tasks

### Task BND-01: Keep Recognized Credentials Out Of Cache Keys

Status: completed

Kind: defect

Priority: P1, secret retention at a security-sensitive boundary; external disclosure is not demonstrated.

Suggested agent: cache security specialist

Dependencies: none

Primary ownership: `packages/access-router-client/src/services/interceptors.ts`; `test/access-router-client.cache.unit.test.ts` within that package.

Finding and references: `interceptors.ts:11-26` recognizes `x-api-key`, `x-auth-token`, and `x-access-token` as authentication headers, but `serializeHeaders` at `:298-315` excludes a smaller set. With an explicit partition their values enter stored keys and the internal `onCacheKey` hook at `:498-499`. URI encoding is reversible. Existing tests at `cache.unit.test.ts:241-286` cover Authorization/Cookie, not the added token headers. This is a remaining credential-classification/redaction mismatch after ARC-H01.

Requirements:

1. Derive key redaction from the recognized credential set, plus other sensitive headers; avoid two drifting lists.
2. Preserve explicit non-secret partition requirements. Do not hash raw credentials as a partition substitute.

Acceptance criteria: parameterized plain-object/AxiosHeaders and mixed-case tests prove synthetic sentinel credentials appear in neither raw nor decoded observed keys. No-partition bypass and cross-partition isolation still pass.

Verification: V1 cache unit tests; V2 after cache lane.

Completion evidence:

- Changed files: `packages/access-router-client/src/services/interceptors.ts` (reordered `AUTHENTICATION_REQUEST_HEADERS` as source of truth; derived `SENSITIVE_CACHE_HEADERS` as `new Set([...AUTHENTICATION_REQUEST_HEADERS, 'set-cookie', 'www-authenticate'])` with drift-avoidance comment; `serializeHeaders` logic otherwise unchanged), `packages/access-router-client/test/access-router-client.cache.unit.test.ts` (added 6-case parameterized regression covering x-api-key/x-auth-token/x-access-token × plain-object/AxiosHeaders × lowercase/mixed-case).
- Regression evidence (before): new 6-case test run against unfixed source failed 6/6 with `expected 2 to be 1` (credentials leaked into keys causing distinct keys and 2 network invocations instead of 1 shared-partition hit). Regression evidence (after): same 6 cases pass; keys equal across credential rotation and neither raw nor `decodeURI` keys contain sentinels or token header names.
- Verified commands + results: `pnpm --filter @web-ts-toolkit/access-router-client exec vitest run test/access-router-client.cache.unit.test.ts` → 1 file, 42 tests passed (36 existing incl. no-partition bypass and cross-partition isolation + 6 new). No full `pnpm test/build/lint` run per lane instruction (reserved for BND-13).
- Follow-ups: none for BND-01; V2 package gate deferred to cache-lane/BND-13 integration.

### Task BND-02: Preserve Axios Response Semantics Across Cache Paths

Status: completed

Kind: defect

Priority: P1, cached/deduplicated responses can change value, type, or success policy.

Suggested agent: cache transport specialist

Dependencies: BND-01

Primary ownership: `packages/access-router-client/src/services/interceptors.ts`; cache unit tests and a focused HTTP fixture if needed.

Finding and references: snapshots contain already-transformed `response.data` at `interceptors.ts:631-638`, but hit/tail synthetic adapters return it at `:505-512,526-535`, after which Axios transforms it again. A network JSON body `"123"` yields a string for the source and a number for hits/tails. Eligibility/key construction at `:382-419` also ignores `validateStatus`, while synthetic adapters fulfill without the caller's adapter-level status settlement. A cached 200 can fulfill under `validateStatus: () => false`; divergent 404 policies make concurrent behavior source-order-dependent. Existing object-isolation/response-type cases at `cache.unit.test.ts:746-761,824-862` and permissive-status cases at `:502-537` do not cover these semantics; the fake adapter does not model Axios settlement.

Requirements:

1. Establish one response-transformation boundary. Do not reparse transformed snapshots; preserve defensive result isolation.
2. Respect per-caller status policy or conservatively bypass non-default policies. Do not merely add function serialization to a cache key.
3. Use a real HTTP fixture or a fake adapter with Axios-equivalent status settlement for status regressions.

Acceptance criteria: source/tail/completed-hit values AND types agree for JSON string bodies containing numeric, boolean, null, ordinary, and JSON-object-looking text, including strict JSON mode. Divergent 200/404 status policies preserve expected fulfillment/rejection in both source orders, with correct caller config ownership. Ordinary cache hits/dedup still save network requests.

Verification: V1 cache tests and added fixture; V2 after cache lane.

Completion evidence:

- Changed: `packages/access-router-client/src/services/interceptors.ts` (imported `AxiosError`; added `identityTransform`/`bypassResponseTransform` single-boundary helper, `settleSyntheticResponse` per-caller settlement mirroring `settle.js`, `isSettlementRejectionFor` to share settlement rejections with tails while keeping transform/transport failures rejecting; hit/tail adapters run under identity transform + per-caller `validateStatus` with caller-config-owned `AxiosError`; source wrapper + response error interceptor resolve slot with `error.response` only for settlement rejections so divergent 404 tails re-settle independently; cache key still ignores `validateStatus` by design, no function serialization), `packages/access-router-client/test/access-router-client.bnd02-boundary.unit.test.ts` (new 10-case V1: 5 raw JSON-string bodies × source/tail/hit value+type, strict-JSON hit, cached-200 under `()=>false`, divergent 404 both source orders with config ownership, ordinary dedup/hit network-count).
- Regression before/after: before fix new file failed 8/10 — tails reparsed `"123"`→`123`, `"true"`→`true`, `"null"`→`null`, object-text→object, strict-JSON hit threw `SyntaxError ... not valid JSON`, cached 200 fulfilled under `()=>false`, divergent 404 tails inherited source settlement order-dependently. After fix 10/10 pass; existing `test/access-router-client.cache.unit.test.ts` still 42/42 (incl. BND-01 redaction, no-partition bypass, cross-partition isolation).
- Verified commands/results: `pnpm --filter @web-ts-toolkit/access-router-client exec vitest run test/access-router-client.bnd02-boundary.unit.test.ts test/access-router-client.cache.unit.test.ts` → 2 files, 52 tests passed. No full `pnpm test/build/lint` per lane instruction (reserved for BND-13).
- Follow-ups: V2 package gate deferred to cache-lane/BND-13 integration; real-HTTP fixture not added — fake adapter models Axios-equivalent settlement (raw + per-source `validateStatus` reject with `AxiosError`, `dispatchRequest` transform) as permitted by Requirements §3.

### Task BND-03: Bypass Instance-Level Custom Transforms Safely

Status: completed

Kind: defect

Priority: P1, a transform exception can strand every tail and subsequent identical request.

Suggested agent: cache transport specialist

Dependencies: BND-02

Primary ownership: `packages/access-router-client/src/services/interceptors.ts`, adapter cache setup if required, and cache tests.

Finding and references: `interceptors.ts:367-397` compares transforms against mutable instance defaults, so a custom transform supplied to `createAdapter` is accepted as safe. A plain Error from `transformResponse` occurs after the wrapped adapter's catch at `:601-607`; response cleanup at `:648-653` requires `error.config`, leaving the registered slot unresolved. README `:106-108` promises custom transforms bypass caching. Tests at `cache.unit.test.ts:701-718,864-893` cover per-call transforms and adapter errors, not construction-time transform errors.

Requirements:

1. Enforce the documented bypass for construction-time and per-call custom transforms, without mistaking custom instance defaults for Axios built-ins.
2. Inspect installed Axios parsing hooks (including `parseReviver` if supported) for the same eligibility hole; document the supported boundary.
3. Ensure any registered slot is settled on supported transformation failure paths, rather than relying on errors always carrying config.

Acceptance criteria: non-idempotent instance transforms run once per actual response and bypass reuse. Throwing plain-error transforms settle all calls; a later retry dispatches rather than joining an abandoned slot. No unhandled rejection or timeout-based false pass.

Verification: V1 cache tests; V2 after cache lane.

Completion evidence:

- Changed files: `packages/access-router-client/src/services/interceptors.ts` (snapshotted pristine `axios.defaults.transformRequest/transformResponse` at module load into `PRISTINE_TRANSFORM_REQUEST/RESPONSE` with supported-boundary comment; `isCacheEligible` now compares request transforms against those built-ins instead of mutable `instance.defaults` and additionally bypasses when `config.parseReviver` or `config.formSerializer` is defined; fresh-miss source `transformRequest/transformResponse` lists are wrapped so any throw — sync or async-rejected — rejects the registered slot at the throw site before rethrowing, independent of whether the error carries `config`), `packages/access-router-client/test/access-router-client.bnd03-transforms.unit.test.ts` (new 5-case V1: construction-time non-idempotent transform per-response bypass, concurrent dedup bypass, throwing plain-error construction-time transform settling both calls + retry dispatch, per-call `parseReviver` bypass without cache poisoning + no-reuse on repeat, default-transform strict-parse failure settling source+tail with retry dispatch). BND-01/BND-02 changes left intact (verified via `git diff`: credential redaction, single-boundary identity transform, per-caller settlement all present).
- Regression evidence (before): new file run against unfixed source failed 4/4 — sequential construction-time custom transforms dispatched once (cached), concurrent calls deduped to 1 dispatch, throwing-transform concurrent calls hung the suite (vitest 5000ms timeout; abandoned slot, tail never settled), revived read served stale `{n:1}` from the plain entry. Regression evidence (after): 5/5 pass in ~300ms with positive settlement assertions (`allSettled` rejection pairs, per-call invocation counts, retry redispatch); timeout guards act only as failure detectors, never as pass criteria; no unhandled-rejection warnings emitted.
- Verified commands + results: `pnpm --filter @web-ts-toolkit/access-router-client exec vitest run test/access-router-client.bnd03-transforms.unit.test.ts` → 1 file, 5 tests passed; `pnpm --filter @web-ts-toolkit/access-router-client exec vitest run test/access-router-client.cache.unit.test.ts test/access-router-client.bnd02-boundary.unit.test.ts test/access-router-client.bnd03-transforms.unit.test.ts` → 3 files, 57 tests passed (42 existing incl. BND-01 redaction + 10 BND-02 + 5 new). No full `pnpm test/build/lint` run per lane instruction (reserved for BND-13).
- Follow-ups: V2 package gate (incl. strict type/declaration checks) deferred to cache-lane/BND-13 integration; `transitional` variations remain cache-keyed as independent entries and `env` documented as out of boundary (GET-ineligible bodies only) — no README change made, docs inventory left to the integration owner.

### Task BND-04: Dispose All Active Cache Generations

Status: completed

Kind: defect

Priority: P1, teardown can leave deduplicated requests indefinitely pending.

Suggested agent: cache lifecycle specialist

Dependencies: BND-03

Primary ownership: `packages/access-router-client/src/services/interceptors.ts`; cache lifecycle tests.

Finding and references: invalidation clears `inflight` at `interceptors.ts:477-483`, intentionally allowing old sources/tails to finish, but disposal visits only that map at `:659-668`. Start source+tail, clear (or successfully mutate), then dispose before source completion: the detached tail is missed. Existing tests at `cache.unit.test.ts:980-1054` test clear and dispose separately.

Requirements: retain lifecycle ownership of unsettled slots independently of eligibility for new joins. Preserve generation invalidation, idempotent disposal, and cleanup on both resolve/reject.

Acceptance criteria: clear-then-dispose and mutation-then-dispose reject old tails before an intentionally held source is released. Late completion cannot repopulate cache. Settled slots are released, and future noncached requests retain documented behavior.

Verification: V1 cache unit tests with deterministic deferred responses; V2 after cache lane.

Completion evidence:

- Changed: `packages/access-router-client/src/services/interceptors.ts` (added `activeSlots: Set<InflightSlot>` as lifecycle ownership independent of the `inflight` join map; slot registration adds to both, `finalizeInflight` removes from both on resolve/reject, `invalidate` clears only the join map so detached generations stay owned, `dispose` rejects `[...activeSlots]` then clears both; idempotent disposal, generation bump, and `!disposed && generation` no-repopulate guard preserved), `packages/access-router-client/test/access-router-client.bnd04-disposal.unit.test.ts` (new 3-case V1: clear-then-dispose rejects detached tail before held source released + late source completion does not repopulate + post-dispose read dispatches anew; mutation-then-dispose via `cloneConfigWithCacheBypass` POST with same ordering guarantees; settled-slot release with idempotent double-dispose and documented noncached post-dispose dispatch). BND-01..BND-03 changes left intact (verified via `git diff`: credential redaction, single-boundary identity transform/per-caller settlement, pristine-transform bypass all present).
- Regression before/after: new file against unfixed source failed 2/3 — both clear-then-dispose and mutation-then-dispose tails hung (vitest 5000ms timeout; `withTimeoutGuard` reported `slot abandoned`), 1 settled/idempotent case passed. After fix 3/3 pass in ~400ms with positive rejection assertions (`CACHE_DISPOSED_ERROR` message), ordered settle-before-release, `getInvocations` network-count checks proving no repopulation and independent post-dispose dispatch; timeout guards act only as failure detectors, never as pass criteria.
- Verified commands/results: `pnpm --filter @web-ts-toolkit/access-router-client exec vitest run test/access-router-client.bnd04-disposal.unit.test.ts` → 1 file, 3 tests passed; `pnpm --filter @web-ts-toolkit/access-router-client exec vitest run test/access-router-client.cache.unit.test.ts test/access-router-client.bnd02-boundary.unit.test.ts test/access-router-client.bnd03-transforms.unit.test.ts test/access-router-client.bnd04-disposal.unit.test.ts` → 4 files, 60 tests passed (42 existing incl. clear-detach and dispose tails + 10 BND-02 + 5 BND-03 + 3 new). No full `pnpm test/build/lint` run per lane instruction (reserved for BND-13).
- Follow-ups: V2 package gate deferred to cache-lane/BND-13 integration; no CHANGELOG/README change.

### Task BND-05: Normalize Cache Headers And Keep Control Metadata Off The Wire

Status: completed

Kind: defect

Priority: P2, caller bypass can be overridden and cache-disabled transport leaks an internal header.

Suggested agent: cache/header boundary specialist

Dependencies: BND-04

Primary ownership: `packages/access-router-client/src/services/interceptors.ts`, `services/service.ts`, `services/wrap.ts`, adapter setup only if necessary; cache/config-immutability tests.

Finding and references: `interceptors.ts:488` uses case-sensitive indexing for bypass. `service.ts:240-244,262-274` recognizes plain-object overrides only by the lowercase key, unlike AxiosHeaders. A caller's `X-Axios-Cache: false` can therefore be ignored or overwritten. Separately, wrappers always add an internal mutation header (`interceptors.ts:101-105`, `wrap.ts:31-58`), but consumption at `interceptors.ts:325-339,485-488` exists only when caching is enabled (`adapter.ts:280-288`). With default TTL zero the internal header reaches dispatch; explicit CORS allowed-header lists may reject it. No real-browser CORS failure was reproduced. Current bypass tests use lowercase, and wrapper immutability tests do not assert internal-header removal.

Requirements:

1. Use one case-insensitive, nonmutating header access/precedence rule at service and interceptor boundaries.
2. Carry invalidation intent as non-wire metadata, or consume it independently of cache enablement. Preserve direct/grouped successful-mutation invalidation rules.

Acceptance criteria: lowercase/uppercase/mixed-case plain and AxiosHeaders inputs honor explicit overrides without changing caller input; bypass performs a separate dispatch against both completed and active entries. Mutation dispatch headers exclude internal invalidation signals with TTL zero and positive TTL, across wrappers and services. Unrelated cache entries survive bypassed reads.

Verification: V1 cache and config-immutability tests plus `test/access-router-client.arc22-parity.integration.test.ts`; V2.

Completion evidence:

- Changed: `packages/access-router-client/src/services/interceptors.ts` (added one shared case-insensitive nonmutating rule: `findHeaderKey` + exported `getCacheControlValue`/`hasCacheControlHeader`; AxiosHeaders accessors already case-insensitive, plain objects scan for the first case-variant. `cloneConfigWithCacheBypass` normalizes the bypass marker to a single lowercase key and carries invalidation intent only as non-wire config metadata — the `x-axios-cache-invalidate-on-success` wire header is no longer emitted, so nothing internal reaches dispatch with TTL zero (no interceptor installed) or positive TTL. `consumeCacheInvalidationSignal`/`removeCacheInvalidationSignal` kept for legacy manual headers, now case-insensitive; `serializeHeaders` additionally excludes the legacy signal from cache keys; request-interceptor bypass check uses `getCacheControlValue(config.headers) === 'false'`, covering plain-object and AxiosHeaders in any letter case), `packages/access-router-client/src/services/service.ts` (`updateHeaders` plain-object branch uses shared `hasCacheControlHeader`, so an explicit caller override in any case wins over `ignoreCache`; AxiosHeaders branch unchanged, already case-insensitive; no caller input mutated). No `wrap.ts`/`adapter.ts` change needed: `prepareConfig` uses case-insensitive `AxiosHeaders.set` + `mergeConfig` (request wins), and with no header emitted the TTL-zero path needs no strip interceptor, preserving the documented "cacheTTL: 0 installs no interceptors" boundary. BND-01..BND-04 changes left intact (credential redaction, single-boundary identity transform/per-caller settlement, pristine-transform bypass, activeSlots lifecycle all present; `cache.unit.test.ts` BND-01 additions untouched).
- Regression before/after: new `packages/access-router-client/test/access-router-client.bnd05-headers.unit.test.ts` (25 cases) run against unfixed source failed 12/25 — uppercase/mixed plain and AxiosHeaders bypass ignored (served stale hit, 1 dispatch instead of 3), uppercase/mixed plain `updateHeaders` overrides overwritten, internal signal present on TTL-zero direct and wrapper mutation dispatches, `cloneConfigWithCacheBypass` duplicated mixed-case bypass keys. After fix 25/25 pass: 6-style bypass matrix dispatches separately with caller input byte-identical, bypass dispatches separately against completed and active (source/tail) entries with unrelated entries surviving, `updateHeaders` 12-case precedence matrix honored without mutation, mutation dispatches exclude the signal with TTL zero and positive TTL across direct/wrapper paths while direct and grouped successful-mutation invalidation still fires (read→mutate→read, legacy mixed-case manual header consumed+stripped).
- Verified commands/results: `pnpm --filter @web-ts-toolkit/access-router-client exec vitest run test/access-router-client.cache.unit.test.ts test/access-router-client.bnd02-boundary.unit.test.ts test/access-router-client.bnd03-transforms.unit.test.ts test/access-router-client.bnd04-disposal.unit.test.ts test/access-router-client.bnd05-headers.unit.test.ts test/access-router-client.config-immutability.unit.test.ts test/access-router-client.arc22-adversarial.unit.test.ts` → 7 files, 120 tests passed; `test/access-router-client.arc22-parity.integration.test.ts` → 12 passed; `test/access-router-client.exports.unit.test.ts` → 17 passed (no public-surface leak). `git diff --check` clean. No full `pnpm test/build/lint` per lane instruction (reserved for BND-13).
- Follow-ups: V2 package gate deferred to cache-lane/BND-13 integration; no CHANGELOG/README change.

### Task BND-06: Preserve Persistence Intent Through Save Reconciliation

Status: completed

Kind: defect

Priority: P1, three state transitions can silently discard required writes.

Suggested agent: model persistence specialist

Dependencies: none

Primary ownership: `packages/access-router-client/src/model.ts`; model reconciliation and model integration tests.

Finding and references:

- `model.ts:212-249,276-292,481-488`: baseline A, submit B, revert to A during save. Revert clears dirty against the old snapshot; reconciliation preserves A but does not restore its dirty flag and records A as clean although B was persisted. Existing concurrent-edit tests (`model-reconciliation.unit.test.ts:63-150`) use newer values distinct from both original and submitted values.
- `model.ts:296-304,83-91`: `save().data` is a fresh existing wrapper built from current local data, losing the original wrapper's pending dirty paths and persisted baseline. Adopting the returned wrapper can lose a subsequent write. Existing concurrency tests continue saving the original wrapper.
- `model.ts:170,199-202,370-373,399-414`: draft reset/revert clears initial dirty flags although no data has been persisted; create uses the dirty-only payload and can POST `{}` or omit initial values. Untouched-draft tests do not cover reset/revert before create.

Requirements:

1. Reconcile pending edits against the post-save persisted baseline, including a concurrent revert/reset to the previous baseline and omitted response fields.
2. Preserve independent dirty state and reset baseline in the returned model, not just displayed values and identity.
3. Separate full draft create data from partial existing-model update data. Preserve failure dirty state, projected identity, serialized overlapping saves, and independent wrapper data.
4. Keep the smallest coherent state transition in `Model`; replace obsolete long comments with concise invariants where the implementation changes, rather than adding another parallel reconciliation mechanism.

Acceptance criteria: deferred-response regressions for A-to-B-to-save-to-A through assignment/assign/reset; echoed and omitted submitted fields; queued saves; adopting `result.data` after submitted and unsubmitted concurrent edits; and draft reset/revert exact POST bodies. Next save persists pending values, reset returns persisted values, returned/original wrappers are independent, and unchanged existing fields remain omitted from PATCH.

Verification: V1 `test/access-router-client.model-reconciliation.unit.test.ts`, `test/access-router-client.model.integration.test.ts`, and `test/access-router-client.arc21-projection-identity.integration.test.ts`; V2 after model lane.

Completion evidence:

- Changed: `packages/access-router-client/src/model.ts` only — `saveNow` resolves identity first, snapshots submitted paths/values before dispatch, `prepareData(isCreate)` sends full draft (minus `_id`) on create and dirty-only on update; reconciliation judges concurrency from pre-merge local-vs-submitted (plus pre-merge dirty for unsubmitted paths) so a revert/reset to the pre-save baseline during save re-adds the submitted dirty flag while a genuine server update still cleans; snapshot falls back to submitted values for omitted fields; returned `result.data` copies post-save snapshot + dirty set as independent clones; `reset()` re-marks initial dirty for unsaved drafts and `reconcilePath` never cleans an unsaved draft. Long ARC-21/reconciliation comments replaced with concise invariants; no parallel mechanism added.
- Added: `packages/access-router-client/test/access-router-client.bnd06-reconciliation.unit.test.ts` (6 cases: set/assign/reset A->B->save->A echoed+omitted with persisted-baseline reset and next-save PATCH; queued-save serialization; `result.data` dirty+baseline independence; PATCH omission; draft reset/revert full POST bodies).
- Regression before/after: new file against unfixed `model.ts` failed 5/6 (revert-during-save recorded A clean with B persisted; reset/assign variants lost dirty; returned wrapper lost pending dirty; draft reset cleared dirty and POSTed `{}`); after fix 6/6 pass. Existing suites unbroken.
- Verified commands/results: `pnpm --filter @web-ts-toolkit/access-router-client exec vitest run test/access-router-client.model-reconciliation.unit.test.ts test/access-router-client.model.integration.test.ts test/access-router-client.arc21-projection-identity.integration.test.ts test/access-router-client.bnd06-reconciliation.unit.test.ts` → 4 files, 33 tests passed. No full `pnpm test/build/lint` per lane instruction (reserved for BND-13).
- Follow-ups: V2 package gate deferred to model-lane/BND-13 integration; no CHANGELOG/README change.

### Task BND-07: Decide Safe Assignment For Absent Model Fields

Status: completed

Kind: investigation

Priority: P1, confirmed silent shadow-write behavior requires a public-contract decision before redesign.

Suggested agent: model API architect

Dependencies: BND-06

Primary ownership: absent-field characterization tests and this decision record; `packages/access-router-client/src/model.ts` only after approval.

Finding and references: forwarders at `model.ts:447-459` exist only for present `_data` keys. Assigning an absent optional/projected field creates a normal wrapper property, absent from dirty tracking/serialization. Later `set()` at `:337-346` cannot repair the forwarder because `key in this` now succeeds. `ModelData` still permits ordinary nonreserved fields. This differs from intentional untracked nested mutations and ARC-H09's resolved reserved-member collision policy.

Requirements:

1. Characterize absent optional and projection-omitted fields through assignment, save, reset, and later `set()`; establish direct/helper divergence.
2. Present the maintainer with support for consistent assignment versus an explicit helper-only absent-field contract with controlled rejection. Assess type/docs implications and preserve reserved-name behavior.
3. Do not implement a proxy or method-namespace redesign without approval. Record the decision, migration impact, and a fully specified implementation follow-up if needed; maintain the residual risk visibly if deferred.

Acceptance criteria: deterministic evidence and an explicit recommendation to implement/defer/take no action, with the maintainer decision recorded or identified as blocking the implementation follow-up. Proposed runtime/types/docs contract cannot silently advertise an unsavable direct write.

Verification: V1 focused characterization tests; evidence review against ARC-H09 and README. This investigation can complete without a code fix, but the remaining runtime risk must not be marked resolved.

Completion evidence:

- No code fix. `packages/access-router-client/src/model.ts` was NOT changed (per Requirements §3, no proxy or method-namespace redesign without approval). Only addition: `packages/access-router-client/test/access-router-client.bnd07-absent-fields.unit.test.ts` (7 characterization cases, all passing; documents current behavior, asserts nothing about a fixed contract).
- Findings (deterministic, all reproduced in the new test file):
  - Mechanism confirmed as reported: `definePublicDataProps` (`model.ts:458-472`) installs getter/setter forwarders only for keys present in `_data`, and skips any key where `key in this` already succeeds (`:464`). Direct assignment to an absent optional or projection-omitted field therefore creates a plain own data property on the wrapper: `Object.hasOwn(model, key)` is true, but `toObject()` omits it, `isDirty(key)` is false, `get(key)` is `undefined`, and save PATCH bodies exclude it. `reset()` restores the `_data` baseline while the stale shadow own-property persists on the wrapper.
  - Repair failure confirmed: after a shadow exists, `set(key, v)` writes `v` into `_data` (dirty flag set, `get(key)` returns `v`) but `definePublicDataProps` skips forwarder installation because `key in this` succeeds — the own-property descriptor has no getter, direct reads keep returning the stale shadow value while `get()` returns the `_data` value (direct/helper read divergence on the same wrapper).
  - Direct/helper divergence established: `set()`/`assign()` on an absent field with NO pre-existing shadow correctly tracks dirty, appears in `toObject()`, and persists via save (PATCH contains the field); direct assignment never does. Projection-omitted fields behave identically to absent optionals (verified with a captured-identity `{ name }`-only projection).
  - Reserved-name behavior preserved and unaffected: `save`/`reset`/etc. still resolve to the wrapper API on direct access; `get()`/`set()`/`assign()` remain the only path for collided data fields (characterization test asserts `typeof model.save === 'function'` with `get('save') === undefined`, consistent with `test-typecheck/model-reserved-fields.ts` and ARC-H09's resolved reserved-member collision policy — this investigation proposes no change to that policy).
  - Type/docs implications: the public types silently advertise the unsavable write. `Model.create` returns `Model<T, TData> & ModelData<T, TData>` (`model.ts:100`) with `ModelData = Omit<TData, keyof Model>` (`model.ts:512`), so every non-reserved optional field — present or absent at runtime — is directly writable in the type system, with the only carve-out being reserved method names. README `:155-168` documents untracked nested mutation and the reserved-name contract but says nothing about absent-field shadowing; the ARC-21 test comment (`arc21-projection-identity.integration.test.ts:49-53`) quietly steers projection users to `set()`, confirming the gap is known but undisclosed in the public contract. Any proposed contract must therefore change runtime AND types AND README together — a types-only or docs-only change leaves a silent runtime loss, and a runtime-only change leaves the advertised surface unchanged.
  - Options assessed: (A) Consistent assignment — make direct writes to absent fields track/persist like `set()` (aligns runtime with the already-advertised types and README `user.role = 'owner'` ergonomics; requires wrapper-level write interception such as a Proxy or equivalent, which is exactly the approval-gated redesign). (B) Explicit helper-only contract with controlled rejection — make absent-field direct writes fail loudly (throw/freeze) and narrow the direct-write type surface to present keys (breaking ergonomics change; hard to type over `Partial<TData>` where absent optionals are statically present; runtime rejection without interception machinery is equally invasive as (A)).
- Recommendation: DEFER runtime fix (explicitly not no-action). Target contract is (A) consistent assignment, because the types already promise it and helper-only would regress documented ergonomics while costing comparable machinery. Implementation requires maintainer approval per Requirements §3 and must preserve ARC-H09 reserved-name behavior and the BND-06 reconciliation invariants.
- Maintainer decision: NOT yet recorded — this is the blocking item. Follow-up `BND-07-FOLLOWUP` (owner: model API architect; dependency: maintainer approval of contract (A) vs (B)): fully specify the interception mechanism, the `ModelData` type narrowing (if (B)) or runtime forwarding (if (A)), README/JSDoc updates, migration notes, and regression tests proving direct-write save/reset/`set()`-after-direct-write behavior; then implement under BND-13 integration review.
- Residual risk (NOT resolved, kept visible): until the follow-up lands, direct assignment to any absent optional or projection-omitted field is a SILENT persistence loss — value looks set on the wrapper, never reaches dirty tracking, serialization, save, or reset, and a later `set()` leaves direct reads stale. Severity P1 persists as a runtime hazard; only the decision record (not a fix) is complete.
- Verified commands + results: `pnpm --filter @web-ts-toolkit/access-router-client exec vitest run test/access-router-client.bnd07-absent-fields.unit.test.ts test/access-router-client.bnd06-reconciliation.unit.test.ts test/access-router-client.model-reconciliation.unit.test.ts test/access-router-client.model.integration.test.ts test/access-router-client.arc21-projection-identity.integration.test.ts` → 5 files, 40 tests passed (7 new characterization + 6 BND-06 + 27 existing incl. ARC-21 projection-identity; BND-06 behavior preserved, no regressions). No `model.ts` change (`git diff` on `src/model.ts` shows only BND-06 lines). No full `pnpm test/build/lint` run per lane instruction (reserved for BND-13).

### Task BND-08: Align Model Path Mutation And Dirty Normalization

Status: completed

Kind: defect

Priority: P2, bracket-path writes change data without persisting it.

Suggested agent: model path specialist

Dependencies: BND-07

Primary ownership: `packages/access-router-client/src/model.ts` and model path tests; avoid changing workspace utils semantics without a demonstrated need.

Finding and references: `model.ts:337-346,467-488` calls the shared path setter but derives the dirty root by splitting only on dots. `packages/utils/src/_internal.ts:29-46,98-121` parses brackets. `set('items[0].label', ...)` changes the array but compares the nonexistent literal top-level `items[0]` keys, leaving the edit clean. Existing tests (`model.integration.test.ts:311-333`) cover dot-index syntax only.

Requirements: use consistent path parsing or reject unsupported syntax before any mutation; align `set`, `markModified`, and `isDirty`. Do not partially mutate then fail.

Acceptance criteria: dot/bracket index and quoted-key cases yield the same dirty root and persisted payload when supported. Unsupported syntax has controlled no-mutation behavior. Nested direct mutation still requires explicit tracking as documented.

Verification: V1 model unit/integration tests; V2 after model lane.

Completion evidence:

- Changed: `packages/access-router-client/src/model.ts` only (no utils change) — added local `toModelPathParts`/`modelPathRoot`/`assertSupportedModelPath` helpers mirroring `_internal.toPath` (same bracket/quoted pattern + numeric normalization + `__proto__`/`constructor`/`prototype` guard); `normalizePath` now returns the first parsed segment so `set`/`markModified`/`isDirty`/`reconcilePath` agree across dot, bracket, and quoted-key forms; `set` and `markModified` validate via `assertSupportedModelPath` BEFORE any mutation (empty or reserved-segment paths throw with no data/dirty change); `isDirty` stays total via non-throwing `normalizePath`. BND-06 reconciliation invariants and BND-07 no-redesign constraint preserved (no proxy/method-namespace change).
- Added: `packages/access-router-client/test/access-router-client.bnd08-paths.unit.test.ts` (6 cases: bracket repro, dot/bracket same root + full-array PATCH payload, quoted-key same root, markModified/isDirty cross-form alignment, bracket revert cleans, empty/unsafe `set`+`markModified` throw with byte-identical `toObject()` and clean dirty state).
- Regression before/after: new file against unfixed `model.ts` failed 6/6 (bracket writes stored literal `items[0]` root, `isDirty('items')` false, revert-clean broken, unsafe paths silently accepted). After fix 6/6 pass.
- Verified commands/results: `pnpm --filter @web-ts-toolkit/access-router-client exec vitest run test/access-router-client.bnd08-paths.unit.test.ts` → 1 file, 6 tests passed; `pnpm --filter @web-ts-toolkit/access-router-client exec vitest run test/access-router-client.model-reconciliation.unit.test.ts test/access-router-client.model.integration.test.ts test/access-router-client.arc21-projection-identity.integration.test.ts test/access-router-client.bnd06-reconciliation.unit.test.ts test/access-router-client.bnd07-absent-fields.unit.test.ts test/access-router-client.bnd08-paths.unit.test.ts` → 6 files, 46 tests passed. `git diff --check` clean. No full `pnpm test/build/lint` run per lane instruction (reserved for BND-13).
- Follow-ups: V2 package gate deferred to model-lane/BND-13 integration; no CHANGELOG/README change.

### Task BND-09: Make Group Config Validation Lossless And Bounded

Status: completed

Kind: defect

Priority: P2, unequal configs can silently share one transport and malformed inputs avoid controlled validation.

Suggested agent: batching boundary specialist

Dependencies: none

Primary ownership: `packages/access-router-client/src/services/cache-utils.ts`; grouped-config adversarial tests; `adapter.ts` only if necessary.

Finding and references: `cache-utils.ts:72-93` collapses distinct URLSearchParams or Date values to empty records; `adapter.ts:390-395,426-427` then selects the first original config. Different queries can therefore compare equal but dispatch using only the first query. Arrays recurse before cycle detection (`cache-utils.ts:68-79`), so a self-array overflows rather than giving `UnsupportedGroupedRequestConfigError`. The option denylist applies recursively at `:84-88`, rejecting ordinary query data such as `params.adapter = 'mobile'`. Existing `arc22-adversarial.unit.test.ts:403-443` covers functions/plain-object cycles, not these additional ARC-H04 cases.

Requirements:

1. Define a supported value grammar; preserve meaningful Date/URLSearchParams serialization or reject non-plain values explicitly, never silently collapse them.
2. Detect array/object cycles before recursion and restrict Axios-option validation to the actual option level, not arbitrary nested query names.
3. Keep all validation before claims/dispatch and preserve directly executable requests on rejection.

Acceptance criteria: equal/distinct URLSearchParams and nested dates are handled according to the documented grammar; unsupported instances reject predictably. Self-array and mixed array/object cycles give controlled errors with zero dispatch. Nested `params.adapter`/`params.signal` scalar data is accepted. Existing function/cancellation rejection and request-claim rollback tests pass.

Verification: V1 adversarial, adapter integration, and ARC-22 parity tests; V2.

Completion evidence:

- Changed: `packages/access-router-client/src/services/cache-utils.ts` only (no `adapter.ts` change needed — lossless keys make first-config sharing correct; validation already runs in `defs.map` before the claim loop, so rejections leave zero dispatch and requests directly executable). Added supported-grammar JSDoc + `isPlainObjectRecord` helper; `normalizeGroupedRequestConfig` now serializes valid `Date` → `{ __type: 'Date', iso }` (invalid Dates reject), `URLSearchParams` → `{ __type: 'URLSearchParams', entries }` sorted by key/value (order-insensitive equality, distinct sets distinct, no collision with plain strings/objects), `AxiosHeaders` via `toJSON` as before; explicitly rejects functions/symbols/bigints/non-finite numbers/non-plain instances (`Map`, `AbortSignal`, …) with `UnsupportedGroupedRequestConfigError`; cycle detection (`seen` add/check) moved before array recursion with `try/finally` release (DAG reuse still allowed); option denylist gated on `path === 'config'` so nested `params.adapter`/`params.signal` scalars are accepted while top-level `adapter`/`signal`/`validateStatus` still reject.
- Added: `packages/access-router-client/test/access-router-client.bnd09-grouped-config.unit.test.ts` (9 cases: equal-USP single dispatch, distinct-USP reject + zero dispatch + direct execution, equal/distinct nested dates, Date-vs-string distinctness, 5 unsupported-instance rejections zero dispatch, self-array + mixed array/object cycle controlled errors zero dispatch + clean retry, nested scalar accept, top-level/function rejection, claim-rollback).
- Regression before/after: reproduction via `tsx` confirmed unfixed collapse (`USP collapse: true {"params":{}}`, `Date collapse: true`), nested `params.adapter` rejected, self-array `RangeError: Maximum call stack size exceeded`. After fix: USP/Date equal distinct per grammar, nested scalars accepted, self-array/mixed cycles `UnsupportedGroupedRequestConfigError`, bigint/NaN/Map/AbortSignal/invalid-Date rejected, DAG reuse allowed.
- Verified commands/results: `pnpm --filter @web-ts-toolkit/access-router-client exec vitest run test/access-router-client.bnd09-grouped-config.unit.test.ts` → 1 file, 9 passed; targeted `... arc22-adversarial.unit.test.ts arc22-parity.integration.test.ts adapter.integration.test.ts bnd09-grouped-config.unit.test.ts` → 4 files, 73 passed (existing function/circular rejection, claim rollback, group parity unbroken). No full build/test/lint per lane instruction (reserved for BND-13).
- Follow-ups: V2 package gate deferred to BND-13 integration; no CHANGELOG/README change.

### Task BND-10: Preserve Default Value Semantics And Subquery Precedence

Status: completed

Kind: defect

Priority: P2, accepted service defaults can produce different or missing wire values.

Suggested agent: service configuration specialist

Dependencies: none

Primary ownership: `packages/access-router-client/src/services/shared.ts`, `services/model-service.ts`; config-immutability and subquery integration tests.

Finding and references: `shared.ts:243-253,272-282` clones every object through enumerable properties, turning valid nested Date defaults (for example populate match/task input) into `{}`. Plain-object/array immutability tests at `config-immutability.unit.test.ts:280-335` miss this input class after ARC-H07. Separately, accepted `sq` defaults (`interface.ts:15-22,106-113`) have no fallback at `model-service.ts:127-134,210-218,729-734,794-801,871-878`; existing subquery coverage at `model-service.integration.test.ts:244-260` supplies `sq` per call.

Requirements:

1. Define/preserve the serializable default value domain, with detached values or controlled rejection rather than object corruption. Freezing Date alone does not prevent Date mutators. Cover cycles explicitly.
2. Apply adapter/service/per-call `sq` precedence consistently, or remove it from defaults types with an explicit documented contract change if defaults are intentionally unsupported.

Acceptance criteria: exact serialized bodies for supported Date defaults equal per-call values and remain stable after caller mutation, through direct constructors and adapter factories. Unsupported/cyclic values have controlled behavior. Default-only nested subqueries extract the intended path, per-call overrides win, and direct/grouped outer requests agree.

Verification: V1 config-immutability, model-service integration, and relevant parity tests; V2 after service lane.

Completion evidence:

- Changed: `packages/access-router-client/src/services/shared.ts` only for defaults domain — added `UnsupportedServiceDefaultValueError` + `isPlainDefaultObject`; rewrote `cloneDefaultValue` to support null/undefined/string/boolean/finite-number/valid-Date (detached `new Date(time)`)/plain-object/array and reject functions/symbols/bigints/non-finite/invalid-Date/non-plain instances/cycles with path-tagged errors (never `{}` corruption); added exported `cloneServiceDefaultValue` for per-request detachment (`__query` is readable via `prom.__query`, and `Date` mutators ignore `Object.freeze`); made `deepFreeze` cycle-safe. `packages/access-router-client/src/services/model-service.ts` — kept `normalizeServiceDefaults` (now Date-preserving/cycle-rejecting, still merges adapter+service via `mergeServiceDefaults`) and applied adapter/service/per-call `sq` precedence (`options?.sq ?? clone(defaults.sq)`) in `list`, `listAdvanced`, `read`, `readAdvanced`, `readAdvancedFilter`; object-valued args (`populate`/`include`/`sort`/`tasks`/`select`) now resolve per-call as-is else detached clone so wire bodies and `__query.args` never alias frozen stored defaults.
- Added: `packages/access-router-client/test/access-router-client.bnd10-defaults.integration.test.ts` (5 cases: direct-constructor Date body equals per-call + stable after `setTime`/defaults mutation; adapter-factory Date with adapter/service/per-call precedence; 6 unsupported/cyclic constructor rejections + zero dispatch + clone-cycle rejection; sq precedence/detachment across all 5 methods + adapter/service/per-call; default-only nested `readAdvancedFilter` subquery extracts `orgs` → blue/red, per-call override wins, direct/grouped agree).
- Regression before/after: new file against unfixed source failed 5/5 — Date bodies `{}` vs ISO, constructor accepted functions/invalid-Date/Map/NaN/cycles, `__query.sqOptions` undefined for defaults-only. After fix 5/5 pass.
- Verified commands/results: `vitest run test/access-router-client.bnd10-defaults.integration.test.ts` → 5 passed; `... bnd10 + config-immutability + model-service.integration + arc22-parity.integration` → 4 files, 40 passed; `... exports + protocol-parity.integration + adapter.integration` → 3 files, 138 passed (no public-surface leak). `git diff --check` clean. No full build/test/lint per lane instruction (reserved for BND-13).
- Follow-ups: V2 package gate deferred to service-lane/BND-13 integration; no CHANGELOG/README change; `sq` kept in defaults types with documented precedence (not removed).

### Task BND-11: Make Distinct Result Types Truthful

Status: completed

Kind: defect

Priority: P2, emitted declarations promise string methods for numeric/boolean server values.

Suggested agent: public TypeScript API specialist

Dependencies: BND-10

Primary ownership: `packages/access-router-client/src/services/model-service.ts`, strict type/declaration consumers, distinct protocol tests, related docs.

Finding and references: `model-service.ts:600-643` and inspected `dist/index.d.ts:292-293` declare `Response<string[]>`; sibling `packages/access-router/src/services/service.ts:959-984` returns unknown distinct values without string conversion. Calling string methods on a numeric or boolean distinct result compiles but can fail. Existing protocol cases exercise strings.

Requirements: use a truthful unknown-element result at minimum; add field inference only if accurate for array-element and dynamic-field cases. Do not stringify server values to satisfy the old declaration. Document the source-compatibility impact and narrowing/migration approach.

Acceptance criteria: direct/grouped numeric and boolean distinct results retain runtime values; strict consumers cannot assume strings without narrowing. Both distinct variants and dynamic field names are covered in rebuilt declarations and consumer fixtures.

Verification: V1 relevant protocol and type fixtures through V2; V3 after docs integration.

Completion evidence:

- Changed: `packages/access-router-client/src/services/model-service.ts` only — `distinct` and `distinctAdvanced` now return `ModelRequest<Response<unknown[]>>` (all `Response<string[]>`/`handleSuccess`/`handleError`/`_handleCallbacks` generics switched; no runtime conversion added, so server numeric/boolean values flow through untouched). Minimal BND-11 JSDoc on both methods documents the source-compat break (callers assuming `string[]` must narrow, e.g. `typeof v === 'string'` or a type guard, before string methods) and states no stringification is applied. No field-inference generic added: inferring from `T[K]` would be inaccurate for array-element flattening and dynamic/dotted field names, so the truthful `unknown[]` minimum was kept. BND-10 changes left intact (adapter/service/per-call `sq` precedence and `cloneServiceDefaultValue` detachment still present in `git diff`).
- Added: `packages/access-router-client/test/access-router-client.bnd11-distinct.unit.test.ts` (5 cases with a fake transport: direct numeric `distinct('age')` → `[1,3,5]`, direct boolean `distinct('public')` → `[true,false]`, `distinctAdvanced` value preservation + `{ filter: conditions }` body with `{ public: false }` → `[]`, grouped `distinct`/`distinct`/`distinctAdvanced` numeric+boolean preservation, string-field parity for both variants + grouped; dynamic field names via computed `string` variables in every case; `not.toStrictEqual(['1',...])` guards prove no stringification).
- Consumer fixtures: `packages/access-router-client/test-decl-consumer/decl-consumer.strict.test.ts` gained a BND-11 case asserting both variants resolve to `unknown[]` with a dynamic `string` field, `@ts-expect-error` on both `string[]` assignments (strict consumers cannot assume strings), and a `typeof v === 'string'` narrowing/migration example. Rebuilt declarations verified: `dist/index.d.ts:300,306` emit `LazyRequest<Response<unknown[]>>` for both methods with the BND-11 JSDoc.
- Regression evidence (before): source declared `Response<string[]>` while the sibling (`packages/access-router/src/services/service.ts:959-984`, bare-array wire via `unwrapServiceData`) returns unconverted unknown values — string methods compiled on numeric/boolean results. After fix the new `@ts-expect-error string[]` assertions pass under `tsc` (assignment now rejected) and the 5 runtime cases prove values retain types.
- Verified commands + results: `pnpm --filter @web-ts-toolkit/access-router-client build` → success (CJS/ESM/DTS); `vitest run test/access-router-client.bnd11-distinct.unit.test.ts` → 5 passed; `tsc --noEmit -p test-decl-consumer/tsconfig-nodenext.json` + `tsconfig-bundler.json` → clean; `tsc --noEmit -p tsconfig.typecheck.json` + `tsconfig.test-typecheck.json` → clean; `vitest run bnd11 + bnd10-defaults.integration + exports.unit` → 3 files, 27 passed (BND-10 sq/Date + no public-surface leak preserved); `git diff --check` clean. No full V2/V3 run per lane instruction (reserved for BND-13); no CHANGELOG/README change — JSDoc kept minimal and the integration owner may reconcile docs in BND-13.
- Follow-ups: V2 package gate and V3 packed-consumer/docs-compile checks deferred to BND-13 integration; README/`llms.txt`/website snippet inventory untouched.

### Task BND-12: Measure Model Copy Cost And Bound Persistence Coupling

Status: completed

Kind: investigation

Priority: P3, evidence-led performance/testability improvement, not an assumed slowdown.

Suggested agent: model performance/testability reviewer

Dependencies: BND-06, BND-08

Primary ownership: focused characterization/benchmark evidence and this task record; model implementation only if a justified follow-up is approved.

Finding and references: `model.ts:163-170,274-304` clones submitted values, snapshot state, and a returned wrapper. The wrapper depends on concrete `ModelService` (`model.ts:68,83,199-202`), while the unit harness at `model-reconciliation.unit.test.ts:13-24` uses unchecked fake-service casts. These are measurable copy/coupling sites, not proof that a broad refactor is warranted.

Requirements:

1. Measure model construction/save reconciliation on representative small and large documents, with sparse and dense edits and multiple returned wrappers. Record environment, sizes, elapsed/allocation evidence where available, and benchmark procedure; exclude network latency from reconciliation cost.
2. Evaluate whether a narrow create/update persistence interface removes the test harness casts without weakening production typing or adding a public generic framework.
3. Recommend implement/defer/no action with evidence. Preserve BND-06 isolation and dirty-state guarantees; do not remove defensive copies solely to reduce line count.

Acceptance criteria: reproducible measurements and a bounded interface feasibility assessment identify a concrete beneficial follow-up, or explain why current simplicity is preferable. Any new task has ownership, acceptance criteria, and dependencies. No unmeasured speedup claims.

Verification: documented benchmark invocation/results and compile evidence for any interface experiment; V2 only if production code changes are separately approved.

Completion evidence:

- No production change. `packages/access-router-client/src/model.ts` was NOT modified (defensive copies kept; BND-06/BND-08 behavior preserved). Only addition: `packages/access-router-client/test/access-router-client.bnd12-benchmark.unit.test.ts` (2 cases: copy-cost benchmark + narrow-interface feasibility; both passing).
- Benchmark procedure (network excluded): fakes resolve via immediate `async` microtasks with no axios/timers/I/O, so elapsed save time measures clone/reconciliation/wrapper work only. Small doc = 3 keys (49B JSON); large doc = 2003 top-level keys + 500-item `items` array (53464B JSON). Construction loops build fresh wrappers per iteration; save loops build the wrapper once outside the timed loop (except where noted) so per-iteration cost is edit + `save()` reconciliation. Warmup iterations excluded; heap deltas are `process.memoryUsage().heapUsed` before/after (GC noise not controlled, no `global.gc`). Each timed row also asserts functional guarantees (dirty cleared, exact PATCH bodies, wrapper independence), so rows are correctness-checked, not timing-threshold-flaky.
- Invocation: `pnpm --filter @web-ts-toolkit/access-router-client exec vitest run test/access-router-client.bnd12-benchmark.unit.test.ts --reporter=verbose` → 2 passed. Environment from run output: `node=v26.7.0 platform=linux-x64`.
- Results (from run stdout, `[bnd12-benchmark]` rows): `construct/small` 500 iters, mean 58.1µs/op; `construct/large` 20 iters, mean 3.56ms/op; `save/sparse-small` (per-iter set(1)+save) 50 iters, mean 173.2µs/op; `save/sparse-large` (per-iter set(1)+save on 2003-key doc, empty echo) 10 iters, mean 9.38ms/op; `save/dense-large` (per-iter assign(2000)+save) 5 iters, mean 18.50ms/op; `save/returned-wrappers` (10 sequential saves adopting `result.data`) mean 65.8µs/wrapper with independence verified (mutating one wrapper leaves origin and siblings unchanged, origin clean).
- Copy-cost finding: per-save reconciliation is O(document size) even for sparse edits — `saveNow` rebuilds `nextSnapshot` over every key with `cloneDeep` plus clones the returned wrapper's data/snapshot/dirty set. That is the measured 173µs → 9.38ms sparse-save scaling. These clones are exactly what BND-06 isolation/dirty guarantees depend on (returned/original independence asserted in the same run).
- Interface experiment: the test file defines `Bnd12Persistence<T, TData>` covering exactly what `Model.saveNow` uses — `create(data, options?: CreateOptions, reqConfig?)` and `update(id, data, options?: UpdateOptions, reqConfig?)`, both returning `Promise<ModelResponse<T, TData>>` with the production option/response types (no weakening, no public generic framework). The fake is declared directly as `Bnd12Persistence<BenchDoc, BenchData>` with ZERO casts; a conditional-type assertion `ModelService<BenchDoc> extends Bnd12Persistence<BenchDoc, BenchData> ? true : false` assigned to `true` proves production `ModelService` still satisfies the narrow interface; a single contained `toModelService` adapter holds the one boundary cast instead of per-harness casts, and a save through it preserves BND-06 guarantees (exact update body, clean dirty, independent returned wrapper).
- Compile evidence: `pnpm --filter @web-ts-toolkit/access-router-client exec tsc --noEmit --strict --skipLibCheck --ignoreConfig --target ES2022 --lib ES2022,DOM --module ESNext --moduleResolution Bundler --types node test/access-router-client.bnd12-benchmark.unit.test.ts` → clean, zero errors (a failing assignability assertion would error on the `ServiceSatisfiesNarrow = true` line). No V2 run: no production code changed, per Verification.
- Regression check: `vitest run` over `model-reconciliation.unit`, `model.integration`, `arc21-projection-identity.integration`, `bnd06-reconciliation`, `bnd07-absent-fields`, `bnd08-paths`, `bnd12-benchmark` → 7 files, 48 tests passed. `git diff --check` clean.
- Recommendations: (1) Copy cost — DEFER runtime optimization (explicitly not a fix here): typical small-document cost is sub-millisecond and no production workload demonstrates harm; the O(doc-size) sparse-save cost is the price of the BND-06 isolation guarantees, and removing defensive copies to reduce lines/copies would break them. Simplicity is preferable until a concrete workload (e.g. >100KB docs or a >10ms save budget) requires it. (2) Narrow persistence interface — RECOMMEND bounded IMPLEMENT as follow-up: feasibility is proven with no typing weakening; it removes every test-harness `as unknown as ModelService` cast behind one boundary adapter.
- Follow-ups (owned, residual — NOT runtime fixes): `BND-12-FOLLOWUP-A` (owner: model performance reviewer; dependency: a concrete oversized-document workload with a stated save-budget; acceptance: benchmark shows the workload exceeding budget before, incremental-snapshot optimization touching only submitted/server keys after, with all BND-06/BND-08 reconciliation suites green and no defensive-copy removal beyond the proven-incremental path). `BND-12-FOLLOWUP-B` (owner: model API reviewer; dependencies: maintainer approval + BND-07 contract decision since both touch `Model` construction typing; acceptance: `Model` constructor/`create` accept the narrow create/update interface, production `ModelService` passes unchanged, all harness casts removed, `tsc` strict + decl-consumer checks + V2/V3 green, no public generic framework added). Until then the O(doc-size) save cost and harness casts remain visible residuals, not defects.

### Task BND-13: Independently Verify Integrated Contracts

Status: completed

Kind: improvement

Priority: P1, cross-path regressions and installed-consumer drift can survive isolated fixes.

Suggested agent: independent reviewer, not the primary cache/model implementer

Dependencies: BND-01, BND-02, BND-03, BND-04, BND-05, BND-06, BND-07, BND-08, BND-09, BND-10, BND-11, BND-12

Primary ownership: integration evidence, coordinated README/JSDoc/release notes and affected docs fixtures, this task file; corrections assigned back to original owners.

Finding and references: source, emitted types, docs, and fake-adapter tests cover different boundaries, as evidenced by BND-02/BND-03/BND-11. `packages/access-router-client/tsup.config.ts:13-15` also retains an inaccurate browser syntax-verification description and stale smoke filename despite the narrowed README claim from ARC-H08.

Requirements:

1. Independently verify every implemented acceptance criterion, regression-before-fix evidence, negative cases, direct/grouped parity, and no unintended credential/internal-header exposure.
2. Reconcile runtime, public types, source JSDoc, installed README, affected website/docs fixtures, and release notes. Correct the stale build comment/test path without claiming jsdom validates real browser-engine floors.
3. Execute V2, V3, and V4 serially. Check packed exports and declarations after a fresh build. Document exact environment blockers rather than inheriting historical green results.
4. Record decisions/deferrals from BND-07/BND-12 and ensure unresolved correctness risk has an owned follow-up. Do not describe an investigation completion as a runtime fix.

Acceptance criteria: all required implemented outcomes have independent evidence; package/artifact/repository checks pass, or this task stays blocked with exact prerequisites. No uncontrolled shared-file edits, stale acceptance claims, or undocumented breaking contract changes remain.

Verification: V2, V3, V4 and evidence review of all tasks.

Completion evidence:

- Independent acceptance review (all BND-01..12 lane claims re-checked against source + tests; no green inherited):
  - BND-01: `AUTHENTICATION_REQUEST_HEADERS` is the single source of truth with `SENSITIVE_CACHE_HEADERS` derived (`interceptors.ts:11-27`); parameterized sentinel tests (6 cases, plain/AxiosHeaders × case variants) assert keys equal across credential rotation and contain neither raw nor `decodeURI` sentinels; network-count `toBe(1)` proves shared-partition hit. No-partition bypass and cross-partition isolation suites still pass inside `cache.unit.test.ts` (42 tests).
  - BND-02: 10-case boundary file asserts source/tail/hit value AND type agreement for 5 raw JSON-string bodies + strict-JSON hit, cached-200 fulfillment under `()=>false`, divergent 200/404 settlement in both source orders with caller-config-owned `AxiosError`, and ordinary dedup network counts. Spot-checked assertions are positive (value+type pairs, `allSettled` rejection pairs), not `success`-only.
  - BND-03: pristine-built-in snapshot (`PRISTINE_TRANSFORM_*`) + `parseReviver`/`formSerializer` bypass + throw-site slot rejection verified in 5-case file; timeout guards act only as failure detectors.
  - BND-04: `activeSlots` lifecycle independent of the join map; 3-case file asserts clear-then-dispose and mutation-then-dispose reject detached tails before held-source release with `CACHE_DISPOSED_ERROR`, no repopulation, idempotent double-dispose.
  - BND-05: case-insensitive nonmutating header rule (`findHeaderKey`/`getCacheControlValue`); 25-case file asserts bypass dispatch counts, caller-input byte-identity, and `INVALIDATE_HEADER` absence on TTL-zero and positive-TTL mutation dispatches (spot-checked `toBeUndefined` assertions at `bnd05-headers.unit.test.ts:222-293`). Internal signal is no longer emitted on the wire at all.
  - BND-06: `model.ts`-only reconciliation (pre-merge local-vs-submitted concurrency judgment, omitted-field snapshot fallback, independent returned-wrapper clones, full-draft create vs dirty-only update); 6-case file covers A→B→save→A via set/assign/reset, echoed+omitted fields, queued saves, `result.data` independence, exact POST/PATCH bodies.
  - BND-07 (investigation, NO runtime fix): 7 characterization cases document silent shadow-write + `set()`-after-shadow read divergence + reserved-name preservation; `src/model.ts` unchanged by BND-07. Decision recorded below; residual P1 risk kept visible, not marked resolved.
  - BND-08: `model.ts`-only `toModelPathParts`/`modelPathRoot`/`assertSupportedModelPath` (validate before mutate); 6-case file proves dot/bracket/quoted-key root agreement, cross-form `markModified`/`isDirty` alignment, and no-mutation throw behavior with byte-identical `toObject()`.
  - BND-09: `cache-utils.ts`-only supported grammar (Date→tagged ISO, URLSearchParams→sorted entries, explicit rejections, pre-recursion cycle detection, `path === 'config'`-gated denylist); 9-case file proves equal/distinct USP+dates, controlled cycle/unsupported errors with zero dispatch and direct executability, nested-scalar acceptance, claim rollback.
  - BND-10: `cloneDefaultValue` domain (detached Dates, path-tagged `UnsupportedServiceDefaultValueError`, cycle-safe `deepFreeze`) + adapter/service/per-call `sq` precedence on all 5 read/list methods; 5-case integration file asserts exact serialized Date bodies, post-mutation stability, 6 rejection classes with zero dispatch, and direct/grouped `sq` agreement.
  - BND-11: runtime returns `Response<unknown[]>` with no stringification (5-case file with `not.toStrictEqual(['1',…])` guards + dynamic field names + grouped parity); decl-consumer fixture asserts `unknown[]` assignability with `@ts-expect-error` on both `string[]` assignments under NodeNext+Bundler strict. Rebuilt `dist/index.d.ts:293-306` emits `LazyRequest<Response<unknown[]>>` with the BND-11 JSDoc on both variants — matches runtime.
  - BND-12 (investigation, NO production change): benchmark methodology excludes network (immediate-microtask fakes); reported rows (node v26.7.0 linux-x64) show O(doc-size) sparse-save cost (173µs small → 9.38ms 2003-key doc) as the price of BND-06 isolation; narrow-interface feasibility proven via conditional-type assertion + zero-cast fake. No unmeasured speedup claims. Decisions recorded below.
  - Direct/grouped parity: `arc22-parity.integration.test.ts` (12), `protocol-parity` + `adapter.integration` suites green inside V2/V4.
  - No exposure: BND-01 sentinel-absence + BND-05 wire-header-absence assertions green; `exports.unit.test.ts` (17) confirms no public-surface leak of internals (`useCacheInterceptors`, `cloneConfigWithCacheBypass`, `CACHE_HEADER`, etc. unexported).
- Reconciliation (runtime ↔ types ↔ JSDoc ↔ installed README ↔ website/docs fixtures ↔ release notes):
  - BND-13-owned doc edits (prose/table only; no new compilable code blocks, so the docs-block-map inventory is untouched): `tsup.config.ts` comment (correct smoke filename `browser-smoke.ts`, replaced "incompatible syntax" overclaim with Node-built-in-leak/basic-bundling scope + explicit not-a-real-browser-gate disclaimer); `vitest.browser.config.ts:12` comment (same stale filename, one-word fix); installed `README.md` sensitive-header list extended with `x-api-key`/`x-auth-token`/`x-access-token` (was stale post-BND-01) + 2 migration-table rows (service-defaults/`sq` precedence; `distinct` `unknown[]` breaking change with narrowing migration); `website/.../adapter.mdx` same header-list fix (its browser-smoke paragraph already carried the not-a-gate disclaimer); `website/.../services.mdx` prose notes (`distinct` `unknown[]` + defaults `sq` precedence); `website/.../model.mdx` prose note (dot/bracket/quoted-key shared root); `llms.txt` 2 prose bullets (distinct contract, defaults domain + `sq` precedence). No `CHANGELOG.md` edit per coordinator instruction; migration notes live in the README table instead.
  - JSDoc: BND-09 grammar, BND-10 `UnsupportedServiceDefaultValueError` domain, BND-11 source-compat notes verified present in source; rebuilt declarations carry the BND-11 JSDoc.
  - Packed README/llms verified as the edited files: `npm pack --dry-run --json` lists exactly 7 entries (`README.md`, `llms.txt`, `package.json`, `dist/index.js`, `dist/index.mjs`, `dist/index.d.ts`, `dist/index.d.mts`); V3 docs-compile test (which extracts+compiles installed README/llms/website snippets against the packed tarball) passes, proving no stale-codeblock drift.
- V2 package gate (serial, fresh): `pnpm --filter @web-ts-toolkit/access-router-client test` → transitive builds + 4 strict typechecks (`typecheck:source/test/nodenext-strict/bundler-strict`) clean; Node suite 30 files / 425 tests passed; jsdom smoke 1 file / 10 tests passed. Only warnings: Vite `configLoader: 'native'` forward-compat notice (no failure).
- V3 published consumer (serial, after fresh V2 build): CJS and ESM `Object.keys` both equal the 11 documented runtime exports; `dist/index.d.ts` + `dist/index.d.mts` present (52.06 KB each); `vitest run packed-consumer + docs.compile + exports` → 3 files / 24 tests passed (real release-transform staging, CJS require + ESM import + strict NodeNext/Bundler consumer typechecks with `skipLibCheck: false`).
- V4 repository gates (serial): `pnpm build` → exit 0; `pnpm test` → exit 0 (all workspace suites green, incl. 30-file/425-test client Node suite and 10-test smoke); `pnpm lint` → exit 0 after one minimal correction (see below), 0 errors with 3 pre-existing warnings; `git diff --check` → clean.
- Minimal correction (assigned back to BND-02 owner, applied under BND-13 minimal-correction allowance): removed unused `AxiosInstance` import in `bnd02-boundary.unit.test.ts:2`, which failed repo `pnpm lint` (`no-unused-vars`). Re-verified: full `pnpm lint` exit 0; targeted `bnd02-boundary` re-run 10/10 passed. Left untouched and reported (not silently waived): 3 `no-console` unused-disable warnings in `bnd12-benchmark.unit.test.ts:96-101` (BND-12 owner; warning-only, no gate impact).
- Decisions/deferrals with owned follow-ups (investigations described as records, not runtime fixes):
  - BND-07: maintainer decision NOT yet recorded (blocking). Recommendation DEFER runtime fix; target contract (A) consistent assignment (proxy/equivalent interception) preserving ARC-H09 reserved-name behavior + BND-06 invariants. Follow-up `BND-07-FOLLOWUP` (owner: model API architect; dependency: maintainer approval of (A) vs (B); acceptance: runtime+types+README+migration specified and implemented with direct-write save/reset/`set()`-after-write regressions). Residual P1 silent-loss risk remains visible.
  - BND-12: (1) copy-cost optimization DEFERRED — sub-ms typical cost, no workload demonstrates harm; follow-up `BND-12-FOLLOWUP-A` (owner: model performance reviewer; dependency: concrete oversized-document workload + save budget). (2) narrow persistence interface RECOMMENDED as bounded implement; follow-up `BND-12-FOLLOWUP-B` (owner: model API reviewer; dependencies: maintainer approval + BND-07 contract decision; acceptance: constructor/`create` accept narrow create/update interface, harness casts removed, strict + decl-consumer + V2/V3 green, no public generic framework).
- Environment blockers: none. All gates executed in this session against current sources; no historical green inherited (mongo-backed suites passed; no external services required).
- Follow-ups: BND-07-FOLLOWUP (blocked on maintainer contract decision), BND-12-FOLLOWUP-A/B as above; BND-12 lint warnings to BND-12 owner (non-blocking).

Kind: improvement

Priority: P1, cross-path regressions and installed-consumer drift can survive isolated fixes.

Suggested agent: independent reviewer, not the primary cache/model implementer

Dependencies: BND-01, BND-02, BND-03, BND-04, BND-05, BND-06, BND-07, BND-08, BND-09, BND-10, BND-11, BND-12

Primary ownership: integration evidence, coordinated README/JSDoc/release notes and affected docs fixtures, this task file; corrections assigned back to original owners.

Finding and references: source, emitted types, docs, and fake-adapter tests cover different boundaries, as evidenced by BND-02/BND-03/BND-11. `packages/access-router-client/tsup.config.ts:13-15` also retains an inaccurate browser syntax-verification description and stale smoke filename despite the narrowed README claim from ARC-H08.

Requirements:

1. Independently verify every implemented acceptance criterion, regression-before-fix evidence, negative cases, direct/grouped parity, and no unintended credential/internal-header exposure.
2. Reconcile runtime, public types, source JSDoc, installed README, affected website/docs fixtures, and release notes. Correct the stale build comment/test path without claiming jsdom validates real browser-engine floors.
3. Execute V2, V3, and V4 serially. Check packed exports and declarations after a fresh build. Document exact environment blockers rather than inheriting historical green results.
4. Record decisions/deferrals from BND-07/BND-12 and ensure unresolved correctness risk has an owned follow-up. Do not describe an investigation completion as a runtime fix.

Acceptance criteria: all required implemented outcomes have independent evidence; package/artifact/repository checks pass, or this task stays blocked with exact prerequisites. No uncontrolled shared-file edits, stale acceptance claims, or undocumented breaking contract changes remain.

Verification: V2, V3, V4 and evidence review of all tasks.

## Deferrals And Definition Of Done

- No confirmed new package export-path failure was found in the inspected root metadata/build shape. Preserve the existing packed/declaration gates instead of adding speculative entrypoints or another export API.
- Unbounded distinct in-flight misses, global invalidation granularity, timer-based expiry, and real-browser engine coverage are existing historical residuals, not newly duplicated tasks here. Revisit only with a concrete workload or support requirement.
- Optional retries, cache tagging, extra collection helpers, and broad direct/grouped finalization refactors are not justified as missing required features by this review. Mutation retries in particular require an idempotency contract.
- Completion requires task-specific observable evidence, passing required checks, updated public contracts, and independent BND-13 review. Investigation tasks may conclude without implementation, but unresolved risks must remain explicit and owned. This file being saved completes only the review/planning deliverable.
