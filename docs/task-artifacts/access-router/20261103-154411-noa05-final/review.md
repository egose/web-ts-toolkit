# NOA-05 independent final acceptance — corrected source

Contract: [nested-operation-access task](../../../tasks/20261103-082614-access-router-nested-operation-access.md).
Same independent reviewer as the [initial request-changes review](../20261103-142416-noa05-independent-review/review.md).
Review resumed 2026-11-03; successful final gates ended 2026-11-04 00:47:40 UTC
(2026-11-03 local time). Historical findings/evidence were not rewritten.

## Verdict

**ACCEPT. F1 and F2 are resolved; all required corrected-source V1–V3 gates pass.**
No remaining authorization/API-contract finding or required-gate blocker was found.
The coordinator may accept NOA-05 based on this handoff; this reviewer did not edit
shared task status, production source or maintained tests, spawn agents, commit or
push. The initial execution-environment failure below is preserved and resolved by
experimental evidence and a complete successful rerun, not silently waived.

## Independent remediation verification

Read the current task and both owner handoffs:
[F1](../20261103-152713-noa01-f1/handoff.md) and
[F2](../20261103-153840-noa05-f2/handoff.md). Actual source, tests, validators and
package scripts were inspected, not accepted from counts alone.

Only **four of the original 1,744 watched source/config files** changed since the
prior review. Reversing precisely the described remediation **in memory** reproduces
each prior file's SHA-256; no checkout file was reverted. The other 1,740 files and
the source file set are unchanged. See [delta evidence](remediation-review.json).

### F1 — Resolved: safe admission precedes operation inspection

- `packages/access-router/src/routers/model-router.ts:98-99` now invokes existing
  proxy-safe `assertAuthorizationModeOptions` before `assertOperationAccessOptions`,
  still before model registration. No proxy trap is needed to reject a Proxy.
- `packages/access-router/src/runtime.ts:1080-1082,1302-1303` validates key type
  before operation inspection and passes the admitted string directly; no
  `String(key)` can execute `Symbol.toPrimitive`, `toString` or `valueOf` first.
- The existing validator (`src/acl/authorization-modes.ts:34-35,45-53,69-83`)
  remains unchanged. The facade/default setter are retained as already-safe controls.
  The analogous bulk/restore/private-publication call-site ordering remains intact;
  no resolver, route mapping, trust, field-policy or public type behavior changed.
- Five maintained cases at
  `test/nested-operation-access-admission.contract.test.ts:203-259` assert controlled
  errors, zero callbacks, unchanged complete snapshots/effective policy, and no
  candidate/unconfigured registry publication. The original 54 cases and assertions
  are byte-for-byte retained after accounting for the two necessary import changes.
- Independently inspected the owner's recorded pre-fix JSON: **56 pass / 3 fail**
  of 59, exactly static construction and model/data setters. This is inspected owner
  red evidence, **not a reviewer rerun of old production source**. Fresh reviewer
  matrices pass all **59** admission cases; the extra mode/atomicity subset passes
  **249** tests without exclusions.

A separate built-public-package observer independently confirms all five public
paths reject safely with **zero** trap/coercion events and unchanged snapshots.
Configured/unconfigured setters publish nothing on rejection. Valid static
construction and valid nested string setters still work; ordinary retired-key
updates retain actionable `read.basic` diagnostics and atomicity. See
[observations](admission-observations.json). This guards against a fix that simply
rejects all input.

The original historical observer was executed **unchanged**, exiting 1 at its
assertion expecting `['ownKeys']` but observing `[]`. That is the expected failure
of an **asserts-bug observer**, not a failed acceptance test. It was not rewritten,
promoted to a compliance test or used to exclude any maintained test.

### F2 — Resolved: root/packed Node expectations agree

`packages/access-router-client/test/access-router-client.packed-consumer.test.ts:81`
changes only expected root Node `>=20` to `>=24`. Packed/staged equality and the
existing packed Node `>=24` assertion remain, as do all metadata, consumer and
browser checks. Root/client engine metadata, production runtime and lockfile are
unchanged. The inverse one-line edit reproduces the prior test hash exactly.

Fresh root test runs the complete client script: transitive build, all four
typechecks, **45 files / 954 Node tests** and **1 file / 10 jsdom tests** pass. It
then completes the broad decorator/runtime/React/app suites rather than stopping
at the client or access-router package pass.

## Required final gate outcomes

One serial runner per attempt; no other build/test/agent overlaps. Root `pnpm test`
retains `--workspace-concurrency=1`, with no added filter/exclusion or script change.
Every command receives an absolute repo-local TMPDIR and `NO_COLOR=1` at runtime.
All durations below are **command wall time**, except the explicitly nested package
Vitest duration. [Gate records](gate-results.json) preserve exact UTC timing/exits.

| Gate                                  | Final outcome         | Counts / duration                                                                             |
| ------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------- |
| V1 transitive package build           | PASS, exit 0          | CJS/ESM/declarations; 16.241 s                                                                |
| V1 complete operation/nested matrices | PASS, exit 0          | 10 files / **868** tests; 85.234 s                                                            |
| V1 affected target/capture            | PASS, exit 0          | 51 files / **2,589** tests; 226.017 s; former owned-types exclusion absent                    |
| V1 extra mode/admission/atomicity     | PASS, exit 0          | 4 files / **249** tests; 6.964 s                                                              |
| V2 package typecheck                  | PASS, exit 0          | Includes serialized transitive rebuild; 21.200 s                                              |
| V2 fresh unfiltered package suite     | PASS within root test | **196 files / 6,717** tests; Vitest 1261.07 s; same package script, not a separate invocation |
| V3 `pnpm build`                       | PASS, exit 0          | 89.723 s                                                                                      |
| V3 `pnpm test`                        | PASS, exit 0          | **2314.959 s**; all default workspace test scripts complete                                   |
| V3 `pnpm lint`                        | PASS, exit 0          | 17.298 s                                                                                      |
| Runner `git diff --check`             | PASS, exit 0          | 0.022 s; bundle checks follow separately                                                      |

All three focused invocations have **0 failures/skips/todos**. They total 3,706 test
invocations, not unique tests: extra atomicity and the full package repeat coverage.
The new five cases explain **868 versus 863** and **6,717 versus 6,712**, with the
same 10 focused / 196 package files. [Per-file counts](v1-summary.json) retain the
selection and the two formerly excluded owned-type cases.

Final root summaries reconcile **34 completed Vitest invocations** from **all 25
workspace packages declaring a default test script**: **651 passed files, 19,259
passed tests, 1 todo, 0 failed/skipped**. Repeated lanes are counted separately, not
as unique coverage. Selected downstream results:

| Package/lane                                               | Files / passed tests       |
| ---------------------------------------------------------- | -------------------------- |
| mongoose-rxdb, including the formerly failing SQLite paths | 45 / 632                   |
| express-runtime                                            | 11 / 341                   |
| access-router                                              | 196 / 6,717                |
| client Node; client jsdom                                  | 45 / 954; 1 / 10           |
| decorator, including package typecheck                     | 23 / 742                   |
| access-router-runtime                                      | 12 / 135                   |
| React 19; React 18; nonruntime/packed/docs                 | 20 / 268; 20 / 268; 3 / 18 |
| final react-vite app                                       | 4 / 43                     |

[Root summaries](root-test-summary.json) contain every invocation and the inventory
reconciliation; there are no queued-but-unverified default packages left.

## Initial failed execution and evidence-backed resolution

The first fresh ignored TMPDIR, `_tmp-noa05-final-2_3agshl`, was too long for some
Linux pathname Unix sockets created by `broadcast-channel@7.4.0` in mongoose-rxdb's
real SQLite tests. Required root `pnpm test` exited **1 after 247.282 s**:
**9 failed / 36 passed files, 21 failed / 611 passed tests, 323 reported unhandled
errors** in that package. It stopped before access-router/client/decorator. The
failed-run root aggregate was 177 passed / 9 failed files, 5,907 passed / 21 failed
tests, 1 todo, over 11 completed invocations. This failure is not omitted or called
a demonstrated clean-HEAD baseline.

Sanitized example:

```text
test/_sqlite-smoke.test.ts: writes SQLite files and reopens data in a second process
Error: listen EINVAL: invalid argument
<repo-root>/_tmp-noa05-final-2_3agshl/pubkey.bc/A411283b7ec433ec1c1d3/rdrs/plyzhwzxyjo.s
at broadcast-channel/dist/esnode/methods/node.js:333:20
```

Observed failing socket addresses were **109–110 bytes**. A separate Node `net`
probe with the same checkout/runtime/socket suffix reproduced **EINVAL at 111
bytes** under the long prefix and successfully listened at **102 bytes** under a
fresh shorter ignored `_tmp-n5-2tqz63tz` prefix. No package source, engine/config,
test assertion or selection changed. All 2,208 watched files remained identical.

After confirming `git check-ignore` for the new directory, the reviewer reran
**every V1–V3 gate**, not only mongoose-rxdb, using the shorter absolute TMPDIR.
All passed, including all 632 mongoose-rxdb tests and every later default script.
This is a resolved execution prerequisite, **not a waiver of failing tests**.
[Socket-resolution evidence](socket-resolution.json) preserves both observations
and failed-case counts. Recommended operational owner: reviewer/coordinator for
short checkout-local TMPDIR selection; any future portability hardening belongs
with test infrastructure/mongoose-rxdb, not a hidden NOA production change. No
additional hardening task or source fix was created by this review.

## Refreshed acceptance matrix

Paths below are relative to `packages/access-router/` unless qualified. The original
review's detailed source/test reconciliation remains relevant: all non-remediation
source bytes match. **Every behavior row is refreshed by the corrected-source
focused/full package/root runs**, not accepted solely from old passing gates.

| Criterion                                                                                      | Result            | Corrected-source evidence                                                                                                                          |
| ---------------------------------------------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| NOA-01.A: nested public types/setters; old keys/types rejected                                 | PASS              | Unchanged interfaces/root/advanced declarations; fresh installed consumer modes and full strict/packed suite pass                                  |
| NOA-01.B: atomic retired-key rejection; unrelated spellings preserved                          | PASS, F1 resolved | 59-case admission suite, 249-case atomicity subset, independent public-entry controls; safe shape/key admission now precedes inspection            |
| NOA-01.C: one selected/evaluated guard; live/captured readers                                  | PASS              | Unchanged `src/operation-access.ts`; 180 resolution cases plus fresh runtime/entry/capture matrices                                                |
| NOA-01 F1 added criterion: controlled rejection with zero callbacks/no publication             | PASS              | Three ordered sites; five maintained cases plus independent configured/unconfigured, valid-input and retired-key controls                          |
| NOA-02.A: direct/root model/data/subdocument independence and mutations                        | PASS              | 100 entry cases, 269 boundary cases, 68 model and 75 data/subdocument response cases                                                               |
| NOA-02.B: scalar/default fallback and closed fields                                            | PASS              | Resolution/baseline/variant/entry matrices retain exact same-owner specificity, undefined terminal distinctions and closed-field denials           |
| NOA-02.C: denial shape, routes, HEAD/OpenAPI unchanged                                         | PASS              | Original generated-route matrices unchanged from prior review; all fresh responses/discovery/no-dispatch assertions pass                           |
| NOA-03.A: target context grants do not authorize base checks                                   | PASS              | Context-free captured adapter/callers unchanged; target, dependency and boundary tests pass in both grant directions                               |
| NOA-03.B: public/private/include/subquery/retry/visibility                                     | PASS              | Complete 51-file affected run, including lean/hydrated/Q-D/actual-model/private-mask/selection cases; prior retry/visibility assertions remain     |
| NOA-03.C: paused capture/default/actor and runtime isolation                                   | PASS              | Capture, owned authorization, model/service capture and private dependency cases; no live-read/trust seam changed                                  |
| NOA-03.D: reserved selectors preflight; list/read/custom behavior                              | PASS              | Shared selector boundary unchanged; fresh negative/forwarding/custom-target and no-target-I/O cases pass                                           |
| NOA-04.A: installed README/declarations/MIGRATION sufficient                                   | PASS              | Package docs/types unchanged; fresh documentation/strict/declaration/packed tests included in 196-file pass                                        |
| NOA-04.B: preserve former base/root behavior in migration                                      | PASS              | All ten original classified TS blocks unchanged, three compiled targets retained; fresh migration tests pass                                       |
| NOA-04.C: production-packed public ESM/CJS runtime/types/guide                                 | PASS              | Full unfiltered compatibility suite passes; release-transformed exports and shipped guide still tested                                             |
| NOA-05-F02: metadata-only correction; complete client Node/browser script                      | PASS              | Exact one-line expected-value change; four typechecks, 954 Node and 10 jsdom tests pass inside fresh root                                          |
| NOA-05.A: V1–V3 pass; types/runtime/root/docs agree                                            | PASS              | Final complete serial gates on stable corrected source; initial environment failure preserved and resolved by full rerun                           |
| NOA-05.B: no aliases, denied targets/closed fields remain denied; no new trust/wire capability | PASS              | All other 1,740 source/config files unchanged; fresh boundary tests and contextual 309-line/42-file spelling audit                                 |
| NOA-05.C: verified evidence; failures not silently waived                                      | PASS              | Both fixes reconciled, complete default root scripts reached, initial failure/observer distinction preserved; coordinator retains status ownership |

No runtime flat alias/translator, nested-policy widening, selector/capture leak,
selection/private publication change or documentation drift was found. The original
five matrix assertion-site ledgers remain valid because those files are unchanged
since review; static site counts are not expanded test counts or coverage metrics.
The refreshed [content audit](content-audit.json) confirms 309 spelling-matching
lines in 42 maintained files and 10 original / 13 current classified migration
blocks. Context remains historical/removal diagnostics, type negatives, unchanged
request schemas, business names or unrelated client APIs—not positive flat config.

## Commands and source identity

Run from repo root. Replace quoted `<repo-root>` placeholders before execution and
choose a fresh short ignored directory for a new run; the paths below identify the
actual historical final execution. Run commands separately and serially.

```sh
git check-ignore _tmp-n5-2tqz63tz
TMPDIR='<repo-root>/_tmp-n5-2tqz63tz' pnpm --filter @web-ts-toolkit/access-router... build
TMPDIR='<repo-root>/_tmp-n5-2tqz63tz' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/operation-access-baseline.contract.test.ts test/operation-access-variants.contract.test.ts test/operation-access-model-routes.integration.test.ts test/operation-access-data-subdocument-routes.integration.test.ts test/operation-access-boundaries.integration.test.ts test/nested-operation-access-resolution.contract.test.ts test/nested-operation-access-admission.contract.test.ts test/nested-operation-access-consumer-types.test.ts test/nested-operation-access-entries.integration.test.ts test/nested-operation-access-capture.contract.test.ts --reporter=default --reporter=json --outputFile.json='<repo-root>/_tmp-n5-2tqz63tz/v1-matrices.json'
TMPDIR='<repo-root>/_tmp-n5-2tqz63tz' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/populate-operation-policy test/private-populate-read-policy test/virtuals-populate-dependencies test/owned-authorization test/model-authorization-capture.unit.test.ts test/captured-catalog-preparation.unit.test.ts test/service-execution-capture.unit.test.ts test/related-execution.binding.unit.test.ts test/subdocument-populate-authorization.integration.test.ts test/service-authorization-related.integration.test.ts test/correlated-includes.execution.test.ts test/virtuals-populate-include.integration.test.ts --reporter=default --reporter=json --outputFile.json='<repo-root>/_tmp-n5-2tqz63tz/v1-target-capture.json'
TMPDIR='<repo-root>/_tmp-n5-2tqz63tz' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/owned-authorization-modes.unit.test.ts test/hydration-configuration.test.ts test/service-authorization-boundary-admission.contract.test.ts test/populate-operation-policy.target-options.test.ts --reporter=default --reporter=json --outputFile.json='<repo-root>/_tmp-n5-2tqz63tz/v1-extra-atomicity.json'
TMPDIR='<repo-root>/_tmp-n5-2tqz63tz' pnpm --filter @web-ts-toolkit/access-router typecheck
TMPDIR='<repo-root>/_tmp-n5-2tqz63tz' pnpm build
TMPDIR='<repo-root>/_tmp-n5-2tqz63tz' pnpm test
TMPDIR='<repo-root>/_tmp-n5-2tqz63tz' pnpm lint
git diff --check
```

The runner also sets `NO_COLOR=1` without suppressing warnings. Both attempts'
expanded arguments and the two non-gate observer commands are recorded in JSON.
Their scratch logs/reporter outputs are omitted, not required archive inputs.

- HEAD remains `c25b0e7a2341d17f764cf183160d61b8470fb9fb` **plus shared uncommitted
  implementation/remediation**; HEAD alone is not the reviewed identity.
- Full pre-existing tracked/non-ignored worktree: **2,208 files**, SHA-256
  `63fbe06ea616936353dcf88db73f43330902024e432d51a1d98fd665659c0630`, identical
  before/after both attempts, no added/changed/removed watched files during gates.
- Comparable original 1,744-file source scope now hashes to
  `03d82fde3cd57f5c4ff50577ab5b9eff8cde04a594d25d991a80d6d3881c4a1f`.
  Exactly the four documented files differ from the earlier failed review.
- Node `26.12.1`, pnpm `11.18.0`, Vitest `4.1.11`. Existing repository dependencies
  were used; normal test scripts create isolated consumers/React lane dependencies.
  No root lockfile or metadata change occurred.
- [Source identity](source-identity.json) records the hash method, selected bytes and
  all twelve historical bundle hashes. Old report/observer/provenance and both owner
  handoffs/task remain unchanged by the reviewer. New bundle files are distinct
  additions, outside the pre-existing snapshot.

## Warnings, todo and reproduction limits

- The one root todo is the asset-inliner suite's reported todo. There are **zero
  reported skips/failures** in the final root run and no reviewer-added exclusions.
  Passing default gates do not assert that an unrelated todo was implemented.
- Nonfatal output includes Vite native-config future-compatibility/import-analysis
  warnings, npm environment/peer/deprecation notices, localStorage experimental
  notices, PDF indexing warnings and Mongoose `validateSync` deprecation. None was
  suppressed or treated as a source baseline waiver.
- React 18 prints cycle/depth render-error diagnostics. Inspected
  `packages/access-router-react/test/dependency-policy.test.tsx:457-508,650-662`
  intentionally asserts those throws; both React lanes pass. They are not the
  structured unhandled-error failure seen in the first mongoose-rxdb attempt.
  Starter registry-unavailable text comes from its deliberate fake-pnpm fixtures.
- Client browser coverage is its existing **jsdom** lane, not a real-browser engine
  matrix. This is the declared default root suite on Node 26, not a Node 24 minimum
  runtime matrix or optional full decorator compatibility run. No coverage
  percentage or exhaustive adversarial-input proof is claimed.
- This is summary-only evidence: full raw logs/reporter JSON, complete source
  manifests/snapshot/diff, scratch scripts, dependency trees, generated consumers,
  tarballs/dist, browser assets, databases and caches are omitted. Reproduction
  needs a matching checkout and applicable MongoDB/registry/cache/browser support;
  Unix-socket pathname budgets also constrain the checkout plus TMPDIR length.
  Curated counts can be reconciled, but raw outcomes/full aggregate source identity
  cannot be reconstructed from this bundle alone. No clean-HEAD baseline was run.
  The earlier report and owner red results remain historical, not rewritten passes.

See [provenance](provenance.json) for curated versus original input hashes and
transformations. Any later source edit invalidates this acceptance's gate identity
and needs appropriate fresh verification. No remaining prerequisite is unavailable
for this completed run.

## Final bundle validation

- All **11 bundle files / 9 JSON files** pass structured-data, local-link,
  repo-relative/private-identifier, manual content/privacy, whitespace and
  non-ignored-destination checks. Curated JSON reconciles with the original local
  records, including all 22 serial command/observer records, 3,706 focused test
  invocations and 34 final root invocations. Default-script inventory matches all
  25 completed workspace packages.
- Original input checksums match. Curated archive-file checksums are recorded
  separately in provenance; its own file is excluded to avoid self-reference.
  The complete 2,208-file pre-existing snapshot and all twelve original review
  artifact files remain unchanged. The only new non-ignored files are this bundle.
- `pnpm exec prettier --check 'docs/task-artifacts/access-router/20261103-154411-noa05-final/**/*.{md,json}'`,
  root `pnpm lint` after preservation, and final `git diff --check` pass. These
  document checks do not recertify old raw results; the successful full final gate
  run above is the acceptance evidence for the corrected source.
