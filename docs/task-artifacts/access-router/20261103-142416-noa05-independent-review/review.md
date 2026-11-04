# NOA-05 independent acceptance review

Contract: [nested operation access task](../../../tasks/20261103-082614-access-router-nested-operation-access.md).
Review started: 2026-11-03, fresh reviewer independent of NOA-01–NOA-04 implementation.

## Verdict

**REQUEST CHANGES — NOA-05 acceptance is blocked.** The independent review is
finished, but an admission-order regression (F1) and the required root-test failure
(F2) prevent completion. V1, package typecheck, the fresh unfiltered access-router
suite, root build and root lint pass. No failure is waived. No production source,
maintained tests, earlier artifacts or shared task statuses were edited by this
reviewer. No agents were spawned and no commits or pushes were made.

## Findings requiring coordinator-owned remediation

Both findings are **P2 correctness/integration defects** in this review's severity
scale, with no demonstrated authorization bypass. Both nevertheless block the
task's mandatory acceptance; severity is not permission to waive a required gate.

### F1 — Preserve safe admission before new operation-access inspection

Locations:

- `packages/access-router/src/routers/model-router.ts:93-110`, especially line 98.
- `packages/access-router/src/runtime.ts:1079-1082,1297-1303`.

The new checks precede existing safe validators at these three public entry points:

1. `ModelRouter.fromModel` calls `assertOperationAccessOptions` before
   `assertAuthorizationModeOptions`. The former uses `Object.getOwnPropertyNames`
   (`src/operation-access.ts:173-179`), so a rejected options Proxy runs its `ownKeys`
   trap before proxy-safe prototype admission can reject it.
2. `setModelOption` and `setDataOption` call `String(key)` before
   `assertAuthorizationModeKey` can reject non-string keys. A malformed key therefore
   executes application `Symbol.toPrimitive` code and can throw its own error.

The source diff shows these newly inserted calls before unchanged validators.
`src/acl/authorization-modes.ts:34-35,45-53,69-83` explicitly implements
non-coercing key rejection and proxy-safe options admission. The facade
`api.createRouter` (`src/index.ts:415`) and default-model setter
(`src/runtime.ts:842-844`) still order those checks safely.

Independent built-package observations, reproduced by the preserved
[observer](admission-order-probe.mjs), are:

| Public entry                            | Callback events | Error                        |
| --------------------------------------- | --------------- | ---------------------------- |
| `api.createRouter(Model, proxy)`        | none            | expected `TypeError`         |
| `ModelRouter.fromModel(Model, proxy)`   | `ownKeys`       | application sentinel `Error` |
| `setDefaultModelOption(non-string key)` | none            | expected `TypeError`         |
| `setModelOption(non-string key)`        | coercion        | application sentinel `Error` |
| `setDataOption(non-string key)`         | coercion        | application sentinel `Error` |

No model/options/data registry publication occurred in this probe. This finding
concerns premature user-code execution and inconsistent rejection, **not** a
demonstrated grant or partial publication. The probe exits 0 because it asserts the
observed bug; that exit is not an acceptance pass. The durable observer's result
was byte-identical to the earlier scratch CJS observer's result; see
[observations](admission-order-result.json).

Coverage gap: `test/owned-authorization-modes.unit.test.ts:156-177,263-277` covers
bulk/facade proxy rejection, while
`test/nested-operation-access-admission.contract.test.ts:66-115,176-199` covers
ordinary retired-key atomicity. Those passing tests do not exercise direct static
construction with a Proxy or these two setters with a coercing non-string key.

Recommended owner: **NOA-01 admission owner**, with **NOA-03 integration review**
because its prior safe-order correction did not cover these remaining sites.
Validate shape/key type before operation-access inspection/coercion, following the
existing default-model ordering. Add maintained regressions asserting zero
trap/coercion calls, controlled `TypeError`, unchanged policy and no publication;
retain all retired-key diagnostics/atomicity tests. The reviewer did not implement
this correction.

### F2 — Required root test fails on contradictory client engine expectations

Location:
`packages/access-router-client/test/access-router-client.packed-consumer.test.ts:81:37`.

Fresh `pnpm test` exits **1** with:

```text
AssertionError: expected { node: '>=24' } to deeply equal { node: '>=20' }
expect(rootPackageJson.engines).toEqual({ node: '>=20' });
```

Root `package.json:27-29` declares Node `>=24`; the very next assertion at line 82
already expects the packed manifest's Node engine to be `>=24`. The client Node
invocation reports **44 files / 953 tests passed, 1 file / 1 test failed**. This is
a concrete assertion mismatch, not an unavailable prerequisite. See the sanitized
[failure excerpt](root-test-failure.txt) and [root results](root-test-summary.json).

`git diff --exit-code HEAD -- package.json
packages/access-router-client/test/access-router-client.packed-consumer.test.ts
packages/access-router-client/test/packed-consumer-harness.ts` passes. These files
match HEAD, but **no clean-HEAD command baseline was executed**. The required
current-source failure is not waived or characterized as a demonstrated baseline.

The client's browser phase was not reached. Later workspace suites did not
complete; a queued decorator test script is printed, but no decorator test results
appear. Earlier NOA-04 focused decorator/runtime results remain prior evidence,
not a fresh full-workspace pass.

Recommended owner: **coordinator/client-package test owner**. Reconcile the
root-engine assertion with the intended Node 24 metadata without weakening packed
manifest coverage or changing unrelated engine policy. Rerun the client package's
complete script, including browser checks, and the required serialized root gates.
Do not filter this test out to obtain acceptance.

## Reviewed source identity and execution

- HEAD: `c25b0e7a2341d17f764cf183160d61b8470fb9fb`, plus the shared uncommitted
  implementation. HEAD alone is **not** the reviewed source identity.
- Before/after source-manifest SHA-256:
  `f9d338fd5fbeca58651922972a88cf905df1ed8e37bbd87e190054ee7601e978`.
  The manifest covers 1,744 tracked and non-ignored untracked package, website and
  script files, plus root package/lock/workspace/lint configuration. The before/after
  manifests match exactly (`changed: []`); a post-run re-enumeration also found no
  added or changed watched files. Generated ignored dist/consumer output is not the
  source manifest. Selected file hashes and the digest method are preserved in
  [source identity](source-identity.json); the full raw manifest is omitted.
- Node `26.12.1`, pnpm `11.18.0`. Existing dependencies and MongoDB memory-server
  support were used; no dependency installation or lockfile edit was requested.
- A single runner executed every gate in order. Root `pnpm test` retained the
  repository's `--workspace-concurrency=1`. No package/root build or test overlaps
  another. Only read-only source/content review ran alongside the runner. The
  independent observer ran afterward.
- Scratch `_tmp-noa05-LOP2jJXY` was freshly created and confirmed ignored. Every
  gate received that directory's absolute path as `TMPDIR`.

## Required gate outcomes

| Gate                              | Outcome                       | Counts / scope                                                                                                               |
| --------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| V1 transitive access-router build | PASS, exit 0                  | CJS, ESM and declarations; 16.162 seconds                                                                                    |
| V1 full operation/access matrices | PASS, exit 0                  | 10 files / 863 tests; no failures, pending or todos                                                                          |
| V1 extra target/capture suites    | PASS, exit 0                  | 51 files / 2,589 tests; no failures, pending or todos; no exclusion                                                          |
| V2 package typecheck              | PASS, exit 0                  | Includes transitive rebuild; 21.997 seconds                                                                                  |
| V2 unfiltered package suite       | PASS within root test, exit 0 | Fresh 196 files / 6,712 tests; no failures/skips/todos; 1292.78 seconds; same package test script, not a separate invocation |
| V3 `pnpm build`                   | PASS, exit 0                  | Repository build; 92.492 seconds                                                                                             |
| V3 `pnpm test`                    | FAIL, exit 1                  | 2129.921 seconds; F2; later workspace coverage incomplete; no filter or exclusion                                            |
| V3 `pnpm lint`                    | PASS, exit 0                  | 17.869 seconds; no scratch/workspace failure waived                                                                          |
| Runner `git diff --check`         | PASS, exit 0                  | 0.020 seconds; final artifact validation is recorded separately below                                                        |

Exact UTC timestamps, commands, durations and exits are in
[gate-results.json](gate-results.json). Completed root Vitest invocations total
**567 passed files / 1 failed file; 17,769 passed tests / 1 failed / 1 todo /
0 skipped** across 27 invocations. These are partial-run totals, not a repository
pass or unique-test coverage claim. The asset-inliner suite reports the one todo;
the reviewer introduced no exclusion. The fresh 196-file access-router pass
includes its strict, migration, documentation, declaration and packed-consumer
suites, not only V1.

The V1 matrix contains **all** five new `nested-operation-access-*.test.ts` suites
(their two maintained type fixtures are compiled by the consumer suite): baseline
28, variants 68, model routes 68, data/subdocument routes 75, boundaries 269,
resolution 180, admission 54, nested consumer 3, entries 100, capture 18 = **863**.
The affected run deliberately includes `owned-authorization-types.test.ts`; it does
not repeat NOA-03's transitional exclusion. Its extra two tests explain 2,589 versus
the handoff's former 2,587. Repeated suites are gate invocations, not additional
unique package tests.

## Criterion-by-criterion reconciliation

All paths in this section start at `packages/access-router/`, unless stated
otherwise. PASS means source inspection reconciled with the fresh V1 behavior;
installed-package rows also reconcile the fresh unfiltered package pass within
root test. Acceptance remains conditional on fixing F1 and passing all V3 gates.

| Criterion                                                                                          | Assessment                                                                | Actual code and maintained evidence                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NOA-01.A: public nested options and setters compile; obsolete keys/types fail                      | PASS                                                                      | `src/interfaces/access.ts:10-32`, `src/interfaces/root.ts:79-102,251-301`, `src/index.ts:244-302`; nested consumer suite checks 36 real negative diagnostic sites in Bundler/NodeNext ESM/CJS, including structural old objects and removed root/advanced type imports                                                                                                                          |
| NOA-01.B: reject retired updates atomically, preserve unrelated spellings                          | Retired-key behavior PASS; safe-admission regression F1 blocks acceptance | `src/operation-access.ts:152-206`, runtime bulk/exact/restore boundaries and fluent argument-count setters; admission suite tests every retired key across model/default/data, whole/dotted/fluent/subdocument paths, undefined presence, construction/restore, permission strings, business fields and request schemas; independent observer exposes missing malformed-input ordering coverage |
| NOA-01.C: select/evaluate one guard from explicit live/captured readers                            | PASS                                                                      | `src/operation-access.ts:30-150`; resolution suite verifies original request/permission identity, one selected hook, async false, operational error identity and no context-member reads for base checks                                                                                                                                                                                        |
| NOA-02.A: root/direct independence for model/data/subdocument list/read and mutations              | PASS                                                                      | Generated collection/document/subdocument routes use explicit basic/advanced; `src/routers/root-router.ts:222-241` selects root and maps both subUpdate forms; 100-case entry suite observes dispatch/no dispatch for every mapping, and boundary suite verifies actual responses and persistence                                                                                               |
| NOA-02.B: scalar fallback and closed-field behavior                                                | PASS                                                                      | Shared selector plus baseline/variant/resolution/entry matrices; exact field/default-runtime specificity precedes field scalar, closed objects never use top-level/outer grants, absent fields do                                                                                                                                                                                               |
| NOA-02.C: denial statuses and route/OpenAPI registration unchanged                                 | PASS                                                                      | Model/data direct admission still throws Unauthorized; root processOp wraps per-entry Unauthorized; original generated-route matrices retain discovery, service/persistence-before-denial and HEAD assertions                                                                                                                                                                                   |
| NOA-03.A: target context grants cannot authorize base admission; base grants survive entry denials | PASS                                                                      | `src/core.ts:429-445`, `src/services/service.ts:919-933`, `src/acl/related-execution.ts:112-127` and `src/services/base.ts:820-842` use selected captured base guards; boundary and populate binding/dependency matrices check both directions and no denied-target I/O                                                                                                                         |
| NOA-03.B: public/private/include/subquery/retry/visibility, lean/hydrated where applicable         | PASS                                                                      | Boundary suite covers legacy/correlated includes, count, $$sq, ordinary/subdocument populate, both advanced read retries and post-write parent/child/list visibility; populate/private suites retain all Q/D flag pairs, actual-model binding, original IDs, private masks, row/field checks and lean/hydrated cases                                                                            |
| NOA-03.C: paused work keeps captured defaults/actor; fresh work updates; no runtime leak           | PASS                                                                      | `src/acl/model-output-planning.ts:51-60,119-126` copies same-owner defaults separately; capture suite, paused write tests, private guard/fallback/capture suites and model/service capture suites verify in-flight policy/permission ownership, fresh calls and same-name runtimes                                                                                                              |
| NOA-03.D: reserved target selectors reject before target work; list/read/custom semantics remain   | PASS                                                                      | `src/acl/populate-access.ts:18-27`, `src/operation-access.ts:18-23,87-94`; boundary preflights all top/sub default/basic/advanced/root members and retired selectors, transformed defaults/descriptors, legacy include/subquery forwarding; valid wire list/read and unrelated trusted custom accesses retain behavior                                                                          |
| NOA-04.A: installed README/declarations/MIGRATION are self-sufficient                              | PASS                                                                      | README imports/configuration/operation matrix and MIGRATION cover exported context/rule types, ownership, exact precedence and examples; `test/export-contract.test.ts:553-647` inspects emitted declarations/hover, and documentation/packed suites exercise installed consumers                                                                                                               |
| NOA-04.B: migration preserves former root/base behavior with nested default                        | PASS                                                                      | `MIGRATION.md:27-91,116-149,177-200` moves old base to operation.default, gives all seven pairs and subdocument/setter/type-import breaks, and distinguishes root target from outer scalar guard; all ten former classified TS blocks remain byte-for-byte unchanged, plus three compiled targets                                                                                               |
| NOA-04.C: packed/public consumers prove runtime/type rejection and shipped guide                   | PASS                                                                      | `package.json` exports all three ESM/CJS/type entrypoints and ships README/MIGRATION/llms/dist; `tsup.config.ts:13-22` builds all entries together and copies the guide; packed fixtures exercise production-flattened tarballs and build-artifact layout, root/direct rules and atomic old-key rejection using public imports                                                                  |
| NOA-05.A: V1–V3 pass; types/implementation/root/docs agree                                         | BLOCKED                                                                   | V3 root test fails (F2); independent malformed-input observer confirms F1 despite passing maintained package tests                                                                                                                                                                                                                                                                              |
| NOA-05.B: no runtime flat aliases, alternate target authority or service trust widening            | PASS in inspected nested paths                                            | Retired-name set is diagnostic-only; no old resolver map/translator or context inference remains; reserved relative member paths are denied and root wire operations are unchanged; context-free checks never choose transport members                                                                                                                                                          |
| NOA-05.C: verified task evidence; unmet required gates not waived                                  | Evidence reconciled; completion BLOCKED                                   | All four handoffs read and reconciled against actual code/tests; historical transitional failures remain historical; F1/F2 returned for owning-task remediation, neither waived; coordinator owns shared statuses                                                                                                                                                                               |

### Reviewed contract details beyond the short acceptance bullets

| Contract detail                                                                            | Reconciliation                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nine model operations, five subdocument operations, broad existing data option assignments | Rule union remains on all declared entries; positive installed fixture assigns the same broad OperationAccess to data without narrowing unrelated options                                                                                           |
| Outer operationAccess.default remains Validation; members cannot recurse                   | Public negative fixtures reject recursive/default object guards and field-policy misuse; selected malformed values are terminal false in resolution tests                                                                                           |
| Boolean/string AND/string-array OR/async/request `this`/operational errors                 | Scalar evaluator is unchanged; resolution and built-core matrices verify semantics, replacement rather than guard conjunction and thrown/rejected identity                                                                                          |
| Exact runtime-context specificity before scalar/default                                    | `exact()` consults stored path then the same owner's exact default path; resolution and root/live-entry cases exercise runtime member over model scalar/default and model own member over runtime                                                   |
| No deep merge or hidden runtime operation.default inheritance                              | The selected operation node supplies only its own default; model `read: {}` does not acquire runtime read.default; actually inherited whole nodes can supply their default; resolution/capture/private matrices distinguish these cases             |
| Omission versus explicit whole-model undefined                                             | Omission inherits effective model defaults; explicit undefined retains exact-operation fallback but not bare/outer catch-alls; data supplies no model-default reader                                                                                |
| Closed/absent/scalar fields and legacy scalar subs                                         | Exact field contexts and operations precede field scalar; defined field object/default-only/empty operation remains closed; absent field delegates to top-level context; scalar subs does not become a wildcard                                     |
| Unpaired routes, custom segments and HEAD                                                  | new/delete/subdocument mutations explicitly choose basic; root chooses root; both direct subdocument update shapes map update.basic; original custom-segment/HEAD/discovery matrices remain, and entry suite covers root dispatch                   |
| Independent scalar root outer guard                                                        | `src/routers/root-router.ts:398-408` still evaluates its own scalar; target root grant cannot pass a denied outer guard; no root op names or endpoints added                                                                                        |
| Context-free secondary callers                                                             | Every located operation guard read/evaluation was inventoried: live model/data, captured Core/service populate, related/include/subquery, private dependencies, LIST retry, subdocument initial scoped gates and response visibility                |
| Captured actor/config/defaults across awaits                                               | Shared selection is synchronous over owned containers; captured seam consumes before hooks and cannot become ambient authority; secondary call sites pass captured permissions, not a post-await live read                                          |
| Target flags and actual model binding                                                      | Q/D remain independent actual-target flags; bypass skips only its existing operation gate, never source/target row/field/selection/model checks; nested and root grants do not widen related target authority                                       |
| Trusted service/upsert behavior                                                            | No blanket entry checks added to internal/public trusted calls; method does not select context; upsert uses its original branch hooks without requiring create/update entry grants                                                                  |
| Private values, selection and response publication                                         | Existing private-reference masks, output selection, hidden-successful-write response and no-context/query-output assertions remain in affected suites; no new DTO/private capability fields added                                                   |
| Direct consumers/decorator integration                                                     | Decorator RouteGuardOperationKey derives from its existing scalar hook allowlist, not nested configuration paths; typed nested model/default options remain supported; runtime/starter sources use delegated or scalar policies, not retired config |

## Original regression coverage and contextual spelling audit

Independent static AST comparison against HEAD found (preserved
[regression ledger](regression-ledger.json)):

| Matrix                  | Static test declarations before / now | Expectation call sites before / now |
| ----------------------- | ------------------------------------- | ----------------------------------- |
| baseline                | 13 / 13                               | 34 / 34                             |
| variants                | 17 / 17                               | 56 / 56                             |
| model routes            | 16 / 16                               | 72 / 72                             |
| data/subdocument routes | 34 / 34                               | 85 / 85                             |
| boundaries              | 31 / 32                               | 158 / 165                           |

These are **static sites, not expanded Vitest counts or coverage percentages**.
The changed descriptions/assertions were inspected: flat-map compatibility tests
become diagnostic/removal tests; root former-base tests now assert explicit root
independence while retaining row/field/no-dispatch checks; configuration changes
retain former base guards under default. No skip/todo/only/expected-failure
declarations were found in these matrices. The original baseline is unchanged.
The five former retry/visibility failures remain asserted and pass in fresh V1.

A source/content inventory over maintained package/website/app files found **309
matching lines in 42 files** for exact retired spellings/type/map names. Matches
were reviewed contextually, not mechanically renamed:

- Production source matches are requestSchemas names, intentionally unchanged.
- Guide/llms matches describe historical migration or removal; no positive example
  advertises flat operation configuration.
- Test matches are removal/invalid-selector/type negatives, schema APIs, explicit
  business fields/permission strings, harmless result/attachment names or
  wrong-policy hook traps outside operationAccess.
- Client methods and starter request schemas are unrelated to server option keys.
- Historical task/artifact documents were excluded from the live-config audit and
  left untouched. Diagnostic computed retired-name/type constraints were inspected
  separately; they do not resolve, translate or grant old operation names.

The [migration preservation summary](migration-preservation.json) records all ten
original classified blocks preserved verbatim plus three targets. The full
spelling-hit text inventory and AST tooling are omitted; the contextual conclusions
above are review observations, not a claim that an archived tool can recalculate
the entire source audit. No other confirmed nested-policy widening, runtime flat
alias, selector, capture, trust, selection or documentation defect was found in the
inspected paths.

## Commands

All commands run separately, serially, from the repository root. Replace the
quoted `<repo-root>` placeholder with the checkout path. Logs/JSON destinations
shown are disposable historical outputs, not required archive inputs.

```sh
TMPDIR='<repo-root>/_tmp-noa05-LOP2jJXY' pnpm --filter @web-ts-toolkit/access-router... build
TMPDIR='<repo-root>/_tmp-noa05-LOP2jJXY' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/operation-access-baseline.contract.test.ts test/operation-access-variants.contract.test.ts test/operation-access-model-routes.integration.test.ts test/operation-access-data-subdocument-routes.integration.test.ts test/operation-access-boundaries.integration.test.ts test/nested-operation-access-resolution.contract.test.ts test/nested-operation-access-admission.contract.test.ts test/nested-operation-access-consumer-types.test.ts test/nested-operation-access-entries.integration.test.ts test/nested-operation-access-capture.contract.test.ts --reporter=default --reporter=json --outputFile.json='<repo-root>/_tmp-noa05-LOP2jJXY/v1-matrices.json'
TMPDIR='<repo-root>/_tmp-noa05-LOP2jJXY' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/populate-operation-policy test/private-populate-read-policy test/virtuals-populate-dependencies test/owned-authorization test/model-authorization-capture.unit.test.ts test/captured-catalog-preparation.unit.test.ts test/service-execution-capture.unit.test.ts test/related-execution.binding.unit.test.ts test/subdocument-populate-authorization.integration.test.ts test/service-authorization-related.integration.test.ts test/correlated-includes.execution.test.ts test/virtuals-populate-include.integration.test.ts --reporter=default --reporter=json --outputFile.json='<repo-root>/_tmp-noa05-LOP2jJXY/v1-target-capture.json'
TMPDIR='<repo-root>/_tmp-noa05-LOP2jJXY' pnpm --filter @web-ts-toolkit/access-router typecheck
TMPDIR='<repo-root>/_tmp-noa05-LOP2jJXY' pnpm build
TMPDIR='<repo-root>/_tmp-noa05-LOP2jJXY' pnpm test
TMPDIR='<repo-root>/_tmp-noa05-LOP2jJXY' pnpm lint
git diff --check
```

The runner also sets `NO_COLOR=1` for log readability. Vitest's config-loader
future-compatibility warning is nonfatal; it is not a failed gate or an exclusion.

After the runner, the preserved observer was executed separately against the built
public CJS entrypoint, without database access:

```sh
TMPDIR='<repo-root>/_tmp-noa05-LOP2jJXY' node docs/task-artifacts/access-router/20261103-142416-noa05-independent-review/admission-order-probe.mjs packages/access-router/package.json
```

This is a historical **bug observer**, not the maintained regression test the owner
must add. It intentionally asserts F1's current bad behavior and should fail after
the correction. A later rerun is not a substitute for the full acceptance gates.

## Preservation and limitations

This is a summary-only evidence bundle, **not a self-contained reproduction
archive**. [The index](README.md) identifies curated JSON observations and
[provenance](provenance.json). Scratch originals remain unchanged. Raw logs, full
reporter JSON, the complete source manifest, tooling, dependency trees, generated
consumers/tarballs/dist, databases, browser assets and caches are omitted. Archived
counts can be reconciled from their curated records, but raw test results and the
complete source digest cannot be independently reconstructed from this bundle.

No prior source revision was built/tested as a baseline. The source manifest omits
`apps/` and `docs/` (including task artifacts); root integration still exercised workspace
apps up to the failure. Source hashes are identity observations, not coverage or
attestations of immutable history. Installed consumers require the checkout's
dependencies, build outputs, MongoDB memory-server support and registry/cache access
where tests require it; the minimal F1 observer requires only the built package and
mongoose. After any source fix, refresh affected checks and all mandatory final
gates against the corrected source rather than reusing these passes.

## Final bundle validation

- Reconciled all eight gate records, both focused summaries against the full
  reporter JSON, all 27 completed root invocations, observer results, original
  migration blocks and selected source hashes. The focused summaries reconcile to
  61 files / 3,452 test invocations; they are not additional unique package tests.
- Parsed all eight JSON files. All twelve bundle files passed local Markdown-link,
  repo-relative-path/private-identifier scan, manual content/privacy review,
  whitespace and non-ignored-destination checks. Original scratch input hashes match;
  [provenance](provenance.json) distinguishes them from curated archive checksums.
- The formatted durable observer reran successfully and reproduced the same five
  observations; exit 0 still means the bug was observed, not acceptance.
- Root `pnpm lint` passed again after adding/formatting the observer and bundle.
  The source manifest still matches; no production or maintained-test edits
  invalidate the historical gate identity.
- Final `pnpm exec prettier --check 'docs/task-artifacts/access-router/20261103-142416-noa05-independent-review/**/*.{md,json,mjs}'`
  and `git diff --check` passed. These artifact checks do not repair or supersede
  the required failing root test.

## Coordinator handoff

1. Keep NOA-05 blocked; reopen/assign F1 to the admission owner, sequentially with
   NOA-03 integration review. Preserve the unrelated implementation and evidence.
2. Assign F2 to the client-package/coordinator owner; retain packed manifest
   assertions and the complete browser phase.
3. Reconcile both corrections and maintained regressions, then rerun V1, V2 and
   root build/test/lint serially after the last source edit. Only a passing fresh
   review may close NOA-05. The reviewer leaves shared statuses unchanged.
