> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# FP-07 focused authority fix — complete; stop here

Only FP06-R1 / FP-07 was implemented. The coordinator owns `docs/tasks`; no
task-document edits, delegation, dependencies, lock changes, commits, publication,
history changes, reverts, materializer changes or new performance claims.
All commands were foreground, serial and awaited. No owned jobs remain.

## Product changes / retained contract

- `packages/access-router/src/acl/service-authorization.ts`,
  `deriveTrustedQueryAuthorization`: **exactly four added lines**, immediately
  after the authenticated-edge/active-mode check and before target view/call issuance.
  Compare the parent's captured `binding.request` and `binding.runtime` against the
  receiving binding; reject either difference with the copied resolver's existing
  `ServiceAuthorizationError` detail: `derived call request/runtime mismatch`.
- This enforcement is inside the derivation function itself, so both direct private
  callers and the early-returning `resolveServiceAuthorization` wrapper are covered.
  `createRelatedExecution` needs no additional call-site check or configuration pass.
- OFF/dormant derivation still returns `undefined`, never issuing shared authority;
  the normal resolver retains its existing owner rejection. No strict-path behavior
  or option/prerequisite/capture semantics were changed.
- Exact supplied parent binding, captured target model/name/path, root target scope,
  target-own policy/configuration/preparation owner, original permissions/provenance,
  READ/LIST capture, retry and embedded checks remain. No full copy/snapshot/graph
  pass was introduced. The accepted mutation/native/isolation omissions are unchanged.
- Added `packages/access-router/test/authorization-fast-path-owner.unit.test.ts`:
  **50 tests**, including both origins x OFF/dormant/active, direct issuer/wrapper,
  each foreign receiving request/runtime, supplied source-owner tuples/cloned handle,
  target model/name/scope/path negatives, and genuine registered service receivers.
  Runtime-only receiver tests share the exact request and model, while request-only
  receivers share runtime/model. Rejections precede dispatch. Genuine related calls
  after rollback/target reconfiguration and READ-to-LIST retry retain captured target
  policy/origin; active related issuance/read paths make **zero configuration copies**.

`fp07-only.diff` is the complete delta against incoming work (four source lines plus
the new focused test). All earlier source/test changes are retained.

## Regression-first evidence

1. `v2-regression-before`: initial new fixture run, **34 failed / 16 passed**. The
   fixture initially supplied only the presentation `PERMISSIONS` symbol, whereas a
   registered Core's service permissions read its configured `_permissions` field.
   Corrected only the new fixture to supply both. This setup failure is retained.
2. `v2-regression-before-fixture-corrected`: **12 failed / 38 passed**, before any
   product source edit. All twelve active wrong-owner cases failed because no error
   was thrown: eight direct/wrapper and four real registered-receiver cases. OFF,
   dormant, source-owner, target and legitimate controls passed. Source was still
   byte-identical to `incoming-service-authorization.ts` at this point.
3. Added the four-line guard, then `v2-regression-after`: **50/50 passed**.
4. Final focused V2 includes the formatted final test and its additional positive
   shared-policy identity assertion: **1,429 passed / 31 files**.

## Commands actually run (repo root; serial)

Every command has `<prefix>.command.json`, `.result.json` and `.log` here. V2 uses:

```sh
pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts --no-file-parallelism --maxWorkers=1 <files>
```

| Prefix | Command / result |
| --- | --- |
| `v2-regression-before`, `v2-regression-before-fixture-corrected`, `v2-regression-after` | V2 prefix + `test/authorization-fast-path-owner.unit.test.ts`; results above |
| `v1-build` | `pnpm --filter @web-ts-toolkit/access-router... --workspace-concurrency=1 build` — passed |
| `v2-focused` | V2 prefix + 31 files listed below — **1,429 passed** |
| `v2-review-owner-and-work` | `pnpm exec vitest run --config _tmp-review-fp06-20261030-200717/vitest.config.ts --no-file-parallelism --maxWorkers=1 --testNamePattern 'FP06 related derivation cheap owner boundary\|FP06 independent original-eight OFF/ON new-mode work comparison' --reporter=verbose` — **4 passed / 5 explicitly excluded** |
| `source-typecheck` | `pnpm --filter @web-ts-toolkit/access-router exec tsc --noEmit -p tsconfig.typecheck.json` — passed after V1 |
| `v5-eslint` | `pnpm exec eslint packages/access-router/src packages/access-router/test` — passed |
| `v5-prettier` | `pnpm exec prettier --check packages/access-router/src/acl/service-authorization.ts packages/access-router/test/authorization-fast-path-owner.unit.test.ts` — passed |
| `v5-diff-check` | `git diff --check` — passed |
| `v5-new-test-diff-check` | `git diff --no-index --check -- /dev/null packages/access-router/test/authorization-fast-path-owner.unit.test.ts` — empty whitespace diagnostics; exit 1 is the no-index new-file difference status |
| `v2-export-contract` | V2 prefix + `test/export-contract.test.ts` — **47 passed** |
| `current-artifact-audit` | `node _tmp-fp07-20261030-203224/audit-current-artifact.mjs` — passed |
| `final-preservation-audit-classified-cache` | `python3 _tmp-fp07-20261030-203224/audit-preservation.py` — passed with generated-cache caveat below |

Final product V2 total: **1,476 tests / 32 files**. Additional original reviewer
fixtures: **4 passing** (two owner regressions plus two work proofs). The five native
regressions are explicitly excluded, **not claimed fixed or passing**; FP-08 owns them.

Exact `v2-focused` file list (package-relative):

```text
test/authorization-fast-path-owner.unit.test.ts
test/authorization-fast-path-options.unit.test.ts
test/authorization-fast-path-options.integration.test.ts
test/authorization-fast-path-runtime.unit.test.ts
test/authorization-fast-path-runtime.integration.test.ts
test/related-execution.binding.unit.test.ts
test/service-authorization-related.integration.test.ts
test/read-list-fallback-authorization.integration.test.ts
test/service-authorization-public-boundaries.integration.test.ts
test/service-authorization-boundary-admission.contract.test.ts
test/model-authorization-capture.unit.test.ts
test/service-execution-capture.unit.test.ts
test/captured-catalog-preparation.unit.test.ts
test/retained-model-service-ownership.integration.test.ts
test/field-helper-request-boundaries.integration.test.ts
test/populate-operation-policy.helper-isolation.test.ts
test/request-hook-ownership.test.ts
test/request-hook-concurrency.test.ts
test/authorization-snapshot.unit.test.ts
test/snapshot-review-regressions.unit.test.ts
test/service-snapshot-builder.unit.test.ts
test/service-authorization-reads.unit.test.ts
test/query-snapshot-options.unit.test.ts
test/initial-output-snapshot-copy.unit.test.ts
test/list-snapshot-checks.unit.test.ts
test/read-snapshot-checks.unit.test.ts
test/read-snapshot-checks.integration.test.ts
test/list-snapshot-checks.integration.test.ts
test/output-publication-fusion-withdrawal.unit.test.ts
test/query-snapshot-work.unit.test.ts
test/default-model-options.unit.test.ts
```

## Unchanged work reductions (instrumented proof, not timings)

The unmodified reviewer fixtures still pass their exact assertions. Active six-row
plain/embedded runs: zero stage/grant/deep-context/whole-source/graph-transfer/identity/
admission work; one full resolution, one configuration copy, six output contexts,
six hooks, 144 field callbacks and one adapter read. Embedded scope derivation is one.
Embedded OFF still performs stage/grant/deep-context/source/transfer work
**36 / 384 / 24 / 24 / 390**, seven full resolutions and 77 configuration copies.
Raw counts are in `v2-review-owner-and-work.log`. No measurement workload/counter was
changed, no V7 timing was run, and no latency claim applies to the fixed bytes yet.

## Current artifact / public surface

- New live root ESM SHA-256:
  `55af08e37a072258fa20f9233b2aad6888b942231cf793bdf01112079584c3e3`.
- New live root CJS SHA-256:
  `b1d10e62c760e0f0a81350d07b3c98195bba66371dd1bd6cf2addcd3dc6330fa`.
- All **14 current dist files** are separately preserved in `fp07-current-dist/`
  and hashed in `current-artifact.json`. **Eight declarations remain byte-identical**
  to incoming. Exact public runtime name sets remain root **46**, advanced **48**,
  processors **6** in both CJS/ESM, compared against FP-05's preserved manifest.
  Export-contract's 47 tests also pass, including private issuer absence/JSDoc checks.
- Old measured candidate ESM remains
  `c26c217b9228be53cac54ed2a1bbde2920d04c61676569b7df32e3283e5dc401`.
  Its **14 sealed dist files are unchanged**. Do not relabel earlier measurements
  as acceptance of the new fixed artifact. No packing/publishing was performed here.
- Lock remains
  `ef86ef24726d09f81d1262656920d6215caeb0f26e345198db2d27b8ab7ab314`.

## Preservation / generated-cache caveat / process state

`incoming-identities.json` and `preservation-and-jobs.json` establish that **1,949
incoming product files** are byte-preserved. The only changed existing product file
is the exact four-line auth-source addition; the only new product file is the focused
test. All task documents, earlier tests/source, metadata, lock and HEAD are unchanged.

All **74 stable reviewer evidence/fixture files**, including the original seven-failure
defect logs and reproductions, are byte-preserved. One **generated Vitest results cache**
was automatically updated when rerunning the original review config, which explicitly
sets its cache directory under the prior review folder. The initial preservation audit
caught this (`final-preservation-audit.log`); the subsequent audit classifies only that
cache exception and checks every stable file. Both before/after cache hashes and its
exact path are recorded in `preservation-and-jobs.json`. No old failure log was replaced
and no attempt was made to guess/reconstruct its former transient cache contents.

All processes were foreground and awaited; final process scan found **no surviving
Vitest/tsup/TypeScript/Mongo/benchmark jobs**. No agent was spawned.

## Next / limits

Stop FP-07. FP-08 remains next for selected BSON/wire-expanded materialization budget
and public packed regressions. Reopened FP-05 owns full V3/V4/invalidated gates,
final fixed-artifact timing/revalidation after FP-08; FP-06 then independently rechecks.
No full V3/V4, V6, V7/performance, new packed consumer, READ latency, whole-workspace or
HTTP-exploit claim is made here. R1 was a private issuance seam defect; the new actual
receiving-service coverage does not turn it into a demonstrated HTTP exploit.
