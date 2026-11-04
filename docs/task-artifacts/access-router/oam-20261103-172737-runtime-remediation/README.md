# OAM-03: F1/F2 runtime remediation handoff

## Disposition

**F1/P1 and F2/P2 are resolved in the delivered source; focused remediation
verification passed.** IMPLEMENT-03, 2026-11-04, on `c68451e` plus the incoming
uncommitted OAM work. This is not independent acceptance or a fresh V2/V3 pass.
The coordinator-owned [task/status](../../../tasks/20261103-172737-access-router-output-authorization-modes.md)
was not edited. Original INTEGRATE-04 revalidation and independent REVIEW-05 rerun
remain necessary.

Read the latest task and complete [independent rejection](../oam-20261103-172737-review/README.md)
and its `verification.json`. The three incoming production files changed here
matched the review's recorded input hashes. Existing OAM-01–04 work, the
[original runtime handoff](../oam-20261103-172737-runtime/README.md), review and other
historical artifacts/input hashes remain unchanged. No subagents, commits,
publication, dependency changes, task/status edits, Docker/system changes or Redis
harness/test changes were made. Builds, tests and typechecks never overlapped.

## Exact remediation files and review pointers

Only these five code/test files were changed by this remediation:

- [`packages/access-router/src/acl/service-authorization.ts`](../../../../packages/access-router/src/acl/service-authorization.ts):
  `storeCallRecord` (line 187) and all four constructor/derivation stores.
- [`packages/access-router/src/acl/document-stage.ts`](../../../../packages/access-router/src/acl/document-stage.ts):
  `SourceCapture`, `ReferenceOrigins`, both original getters, retain/release helpers,
  `captureReferenceOrigins` and `prepareQueryOutputSource` (lines 450–615).
- [`packages/access-router/src/services/service.ts`](../../../../packages/access-router/src/services/service.ts):
  `populateTargetIdentity`, target cache/finalization, recipient registration and
  populate traversal (lines 999–1216); pass the actual publication to reference lookup.
- [`packages/access-router/test/write-output-origin-ownership.unit.test.ts`](../../../../packages/access-router/test/write-output-origin-ownership.unit.test.ts):
  **14 tests**, inherited values/accessors before/after construction, generic/custom/
  dedicated origins, real captured target-hook mutation, and optional-slot ownership
  across query/read-retry/write/UPSERT/embedded/related constructors.
- [`packages/access-router/test/write-output-source-lifetime.unit.test.ts`](../../../../packages/access-router/test/write-output-source-lifetime.unit.test.ts):
  **25 tests**, retained real CREATE/UPDATE hook arguments, scalar/array/dotted refs,
  ordinary/collection success/failure cleanup, draining callbacks, shared normalized
  keys, either close order, repeated/conflicting associations, partial-capture failure
  and independent source reuse without foreign provenance or hidden-graph traversal.

The only new evidence files are this README and [verification.json](verification.json).
Production changes are incremental to the reviewed uncommitted source, not the
entire existing diff against HEAD. No other maintained tests were changed.

### F1 — record-owned absence

Every `CallRecord` store now goes through one small constructor. It creates a
null-prototype record with own data slots for `queryOrigin`, `writeOrigin`,
`writeOutputBranch`, `fieldPolicyOwner` and lazy `view`, defaulting to `undefined`
before applying the constructor's own fields. Derivations preserve explicit
provenance without consulting inherited values/getters. The lazy view stays writable.
No scattered eligibility checks or new public mode selector were added.

The generic/custom/dedicated negative matrix observes actual captured READ-hook
mutation of the target stage and its Date, not just the mode string. Prototype
descriptors are restored in `finally`, including on assertion/runtime failure.
Positive query, read-to-list retry, real write, both UPSERT branches, related and
embedded derivations remain eligible exactly as before.

F1 requires trusted process-prototype contamination. This remediation does not
claim a demonstrated request-only grant bypass or a bypass of mandatory detachment.

### F2 — operation-owned links, not source-global originals

- Root originals are stored per **source + call** alongside private preparation.
  They are not properties added to the returned preparation/source. Two hydrated
  documents whose `toObject` returns the same ordinary object retain their own
  originals. Closing one call cannot overwrite/delete another's root association.
- Each descendant association is counted by exact normalized key, publication and
  raw identity. The outer index and publication-owner index are WeakMaps; there is
  no global strong source/publication cache. Raw-identity counts exist only under
  that weak normalized key and are removed when their owning associations settle.
- Every preparation registers cleanup **regardless of collection ledger**, before
  reference capture starts. Cleanup deletes its root entry and releases all its
  descendant claims, including duplicate claims and a prefix captured before an
  error. It neither clears another publication nor assumes a root-key deletion
  removes descendant keys.
- Existing publication stop/drain/clear ordering is unchanged. Links remain while
  already-admitted callback work drains; they disappear at settlement, on success
  or failure. Retained trusted hook objects then recover neither live root nor raw
  reference through these private registries.
- All production reference lookups use publication context. A scoped lookup never
  adopts another publication's original. Multiple distinct identities in one scope,
  or an ambiguous unscoped lookup, return `undefined` rather than guessing. Repeated
  associations to the same exact raw object remain unambiguous and counted.
- Same-call source reuse stays constant-work. An independent call receiving an
  already-normalized borrowed source does not adopt another call's provenance or
  scan previously unvisited trusted graphs. Existing copy/path-traversal semantics,
  selected receiving budgets and exact-identity target caching are preserved.

This resolves deterministic private raw-link lifetime defects. It is not a public
raw-document recovery capability, mutation-alias finding or retained-heap measurement.
The four approved public names, output-only scope and input/persistence behavior are
unchanged. Both write modes still detach; trusted omits only the extra hook-view copy.

## Failing-before evidence and passing-after regressions

The maintained suites were added and executed **before any production fix**, against
the reviewed source: **2 files / 30 failed, zero passed/pending**, exit 1. These were
product assertion failures, not fixture/setup failures. The initial suite contained
14 F1 cases and 16 F2 cases. Representative observations:

| Probe                                                                 | Reviewed source                                                           | Remediated source                                      |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------ |
| Generic/custom/dedicated parent and target write marker               | Both `true` under inherited marker                                        | Both `false`                                           |
| Ineligible target hook                                                | Trusted; stage value `hook-change`, Date time `9`                         | Isolated; stage value `original`, Date time `1`        |
| Held real CREATE/UPDATE hook root after publication rejects admission | Original link survives instead of returning held view                     | Lookup returns held view itself                        |
| Held populated descendant after settlement                            | Raw target still returned                                                 | `undefined`                                            |
| Overlapping normalized root                                           | Other call overwrites original; closing one invalidates remaining mapping | Exact active call original survives either close order |

The first fixed-source run passed the same **30/30** cases. The suites were then
strengthened with own data-slot/null-prototype checks and nine additional cases:
populated UPDATE success/failure, overlapping-owner failures, foreign-source reuse,
same-publication identity conflict and partial-capture cleanup. The expanded **39/39**
passed, then passed again in final V1. The extra cases are not relabeled as part of
the initial failing-before run. No failed assertion was dropped or weakened.

## Verification actually run

All commands ran from repository root, with Node `v26.12.1`, pnpm `11.18.0`, Vitest
`4.1.11`, installed dependencies and MongoDB memory-server prerequisites. No install
was run. Fresh `_tmp-oam03-remediation-20261104-062659` was created with `mkdir` and
confirmed ignored using `git check-ignore`.

Every build/type/test/lint/formatter/runtime-surface command used the absolute
checkout scratch path as `TMPDIR`. ESLint explicitly ignores root `_tmp*/**` and was
limited to the five named code/test files. Source typecheck includes only `src/**/*.ts`;
Vitest used explicit maintained `test/` files with package config (`fileParallelism:
false`); build uses configured package entries. Prettier used explicit paths. Git
ignore was not treated as proof of tool exclusion. Formatting was applied with patch.

Below are the executed command bodies; replace the quoted `<repo-root>` placeholder
before reproduction and create a fresh ignored scratch directory. Each command used
`TMPDIR='<repo-root>/_tmp-oam03-remediation-20261104-062659'` at runtime. Vitest's effective
working directory is `packages/access-router`, so JSON paths are relative to it.

Initial reviewed-source build passed. The initial failing-before invocation was:

```sh
pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts \
  test/write-output-origin-ownership.unit.test.ts \
  test/write-output-source-lifetime.unit.test.ts \
  --reporter=default --reporter=json \
  --outputFile.json=../../_tmp-oam03-remediation-20261104-062659/before-initial.json
```

This historical command does not reproduce failures on the fixed source; the
reviewed source hashes and initial suite size identify its inputs. Fresh final
build, source typecheck and V1 were separate serial commands:

```sh
pnpm --workspace-concurrency=1 --filter @web-ts-toolkit/access-router... build
pnpm --filter @web-ts-toolkit/access-router exec tsc --noEmit -p tsconfig.typecheck.json
pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts \
  test/write-output-origin-ownership.unit.test.ts \
  test/write-output-source-lifetime.unit.test.ts \
  test/write-output-authorization.unit.test.ts \
  test/write-output-modes.unit.test.ts \
  test/write-output-populate.unit.test.ts \
  test/owned-authorization-modes.unit.test.ts \
  test/owned-authorization-modes.integration.test.ts \
  test/authorization-fast-path-options.unit.test.ts \
  test/authorization-fast-path-options.integration.test.ts \
  test/service-authorization-mutations.integration.test.ts \
  test/service-authorization-input.integration.test.ts \
  test/document-permissions-dependencies.integration.test.ts \
  test/virtuals-populate-dependencies.integration.test.ts \
  test/owned-authorization-stage.unit.test.ts \
  test/owned-authorization-publication.unit.test.ts \
  test/owned-authorization-runtime-profiles.unit.test.ts \
  test/authorization-fast-path-native.unit.test.ts \
  test/owned-authorization-boundaries.unit.test.ts \
  test/owned-authorization-facts.unit.test.ts \
  test/owned-authorization-records.unit.test.ts \
  test/owned-authorization-many-bounds.unit.test.ts \
  test/owned-authorization-helpers.unit.test.ts \
  test/owned-authorization-alternate.unit.test.ts \
  test/service-authorization-subdocuments.integration.test.ts \
  test/subdocument-populate-authorization.integration.test.ts \
  test/populate-operation-policy.queries.test.ts \
  test/populate-operation-policy.dependencies.test.ts \
  test/populate-operation-policy.nested-targets.test.ts \
  test/private-populate-read-policy.runtime.test.ts \
  test/virtuals-populate-dependencies.parity.test.ts \
  test/virtuals-populate-dependencies.traversal.test.ts \
  test/virtuals-populate-dependencies.fallback.test.ts \
  test/virtuals-direct-operations.integration.test.ts \
  test/virtuals-embedded-subdocuments.integration.test.ts \
  test/virtuals-populate-include.integration.test.ts \
  test/virtuals-route-parity.integration.test.ts \
  test/advanced-mutation-bodies.integration.test.ts \
  test/model-subdocument-routes.integration.test.ts \
  test/owned-authorization-many.unit.test.ts \
  test/retained-model-service-ownership.integration.test.ts \
  test/request-hook-ownership.test.ts \
  test/options-ownership.test.ts \
  test/data-value-ownership.test.ts \
  test/output-field-policy-cache.unit.test.ts \
  test/virtuals-original-refs.characterization.test.ts \
  test/related-execution.binding.unit.test.ts \
  test/service-execution-capture.unit.test.ts \
  --reporter=default --reporter=json \
  --outputFile.json=../../_tmp-oam03-remediation-20261104-062659/v1-remediated.json
```

**Build and source typecheck passed. Final V1: 47 files / 2,521 tests passed; zero
failed/pending.** Fresh JSON assertion lists were inspected. This includes every
previous V1 file (**36 files / 2,216 tests**), both new suites (**39 tests**) and nine
additional many-helper/ownership/cache/execution suites (**266 tests**). Existing
write suites still pass **40 + 47 + 49** cases, including deterministic mandatory
source detachment/trusted hook-view omission, mixed target modes, shared hook-once
cache, independent attachments and preregistered receiving-budget failures.

Scoped ESLint and Prettier passed on this exact code/test set:

```sh
checked=(
  packages/access-router/src/acl/service-authorization.ts
  packages/access-router/src/acl/document-stage.ts
  packages/access-router/src/services/service.ts
  packages/access-router/test/write-output-origin-ownership.unit.test.ts
  packages/access-router/test/write-output-source-lifetime.unit.test.ts
)
pnpm exec eslint "${checked[@]}"
pnpm exec prettier --check "${checked[@]}"
```

Both new evidence files also pass Prettier. Fresh direct CJS/ESM inspection of built
root, `/advanced` and `/processors` runtime entries found **46/48/6 exports** in both
conditions, with none of the eight tested private original/source/write issuers or
readers exposed. This is not a new packed/installed/declaration-consumer check.
The non-fatal Vite CommonJS-config warning remains; no test was skipped for it.

## Preservation, limitations and next owners

- All **48 protected files** from the 51-file incoming snapshot remain byte-identical;
  only the three allowed production files differ. Existing task, historical handoffs,
  independent review/verification and prior input hashes were checked unchanged.
  Delivered code/test hashes and curated fresh results are in `verification.json`.
- Reviewed scratch inventory before handoff. Only this curated report/verification
  merits preservation; raw logs/JSON assertions, formatter candidates, reviewed-source
  copies and compile cache remain disposable scratch. No dependency/database/generated
  build/scratch tree is archived. This is not a self-contained before-fix replay or
  environment bundle; source hashes identify inputs, not a vendored copy of them.
- Relative links, referenced source/test paths, JSON validity, ignore status, targeted
  privacy/path/credential review and `git diff --check` passed. Durable files are not
  ignored. No machine-local paths or private session identifiers are retained here.
- **Original INTEGRATE-04 next:** rerun affected full V2 package/type/packed/decorator/
  tooling gates on this remediated source. Preserve existing guidance and approved
  names; no additional public API/docs scope change is requested by these fixes.
- **Independent REVIEW-05 next:** rerun adversarial F1/F2 and acceptance reconciliation
  after OAM-04 revalidation. Prior V1/V2 greens certify historical inputs only.
- Full V2, root build/test/lint, decorator/packed consumers and benchmarks were **not
  run** in this remediation. Root tests remain blocked by the separately recorded
  unavailable Docker Desktop/Redis prerequisite; the environment owner must supply
  it before required V3 can pass. No replacement service, test bypass or host change
  was attempted. Coordinator owns downstream status changes.
- No numerical performance/heap claim, universal callback isolation, transaction,
  rollback, freshness guarantee or request-only exploit claim is made. Existing
  native/callback closure and unsupported-adapter limitations remain.
