# REVIEW-01 independent acceptance review

Related task: [document-permission dependencies, DEP-03](../../../tasks/20261103-003636-access-router-document-permission-dependencies.md).
Provenance: a separate reviewer, neither IMPLEMENT-01 nor IMPLEMENT-02, after both
finished. Reviewed the actual tracked diff and every new source/test/fixture file,
not only the implementation handoffs. No agents spawned, commits/pushes or task
status edits. Scope: access-router, affected decorator consumers/guidance, shipped
and website documentation, maintained benchmark changes and this evidence bundle.

Review base: `c1154de7e922a8bd38a9fd7eee8473bef42d215a` plus the delivered working-tree
changes. Environment: Node `v26.12.1`, pnpm `11.18.0`, Linux. Root instructions,
task/artifact conventions and the AI-friendly TypeScript-package skill were read.

## Finding and correction

**F1 — declared persisted metadata inputs were lost in parent/write queries.**
`packages/access-router/src/services/model-subdocument-service.ts:parentSelection`
fetched input-admissible fields but
omitted schema-hidden permission metadata even when the active descriptor explicitly
needed it. Additionally, Mongoose's `+container` does not override a descendant's
`select: false`: whole-container dependencies under the metadata path therefore lost
hidden children in dedicated parent queries and top-level update stages.

Independent regressions reproduced both failures: subdocument output lost an
authorized `label`, and update output lost `name` because its owner fact was false.
The first focused reproduction failed 1 selected test; the container reproduction
failed 2 / passed 1 selected tests. These are observed delivery defects, not claims
about the untested baseline.

Correction:

- Dedicated parent queries now retain their captured active definition's inputs:
  `update` only for pre-write update/bulk-update, `read` only for read/visibility.
  Create/delete do not invent an extra document-hook stage.
- `packages/access-router/src/acl/model-input-admission.ts:inputFetchPaths` expands declared persisted dependencies
  to stored descendants for `+path` queries, including explicitly consumed metadata.
  `packages/access-router/src/services/service.ts:updateOnePrepared` supplies only its active hook inputs. This is private
  fetch authority, not an input/output grant or a union with unrelated read access.
- Added real-Mongo regressions for scalar/container metadata inputs, independent
  parent stages, non-leakage and top-level pre-/post-update input retention. Added
  a unit regression for frozen readonly arrays, capture ownership and whole-leaf
  replacement without inheriting old/default dependencies.

No other acceptance defect was found in the reviewed delivery.

Review-owned edits (other delivered changes remain attributed to IMPLEMENT-01/02):

- `packages/access-router/src/acl/model-input-admission.ts`
- `packages/access-router/src/services/model-subdocument-service.ts`
- `packages/access-router/src/services/service.ts`
- `packages/access-router/test/document-permissions-dependencies.integration.test.ts`
- `packages/access-router/test/document-permissions-dependencies.unit.test.ts`
- This report and this bundle's `README.md` index.

## Acceptance assessment

Paths below are relative to `packages/access-router/` unless stated otherwise.

| Contract / task criterion | Independent assessment and evidence |
| --- | --- |
| Public functions/descriptors, direct/access/default/custom configuration (DEP-01.1, DEP-02.2) | `ModelDocPermissionsDescriptor`, `Definition`, `AccessRecord`, root/advanced exports, fluent and dotted whole-definition setters agree. Readonly model-local keys retain `NoInfer<TModel>`; the declaration fixture checks typed invalid keys and untyped inference. Inspected metadata, bundled entrypoints and emitted declarations/JSDoc in both conditions. |
| Coherent safe capture/resolution (DEP-01.2) | `src/acl/document-permissions-definition.ts` uses own enumerable data properties, reserves `get`/`dependsOn`, rejects malformed/mixed/inherited/accessor/proxy definitions, validates every access leaf, and resolves exact → undefined/default as one hook/input pair. `src/acl/persisted-dependencies.ts` rejects unsafe/dotted/unknown/virtual names, sparse/exotic/accessor arrays; captures frozen owned arrays. Runtime publication validates atomically; operation capture revalidates against mutable schemas before awaits. |
| Active-access-only private projection (DEP-01.3) | Catalog and catalog-less planners add only `docPermissionsAccess` dependencies; output selection remains independent. Reviewed normal reads/lists, helper planning, populate target configuration/projection, include foreign-key lifetime, create/update output and dedicated owning parents. F1 fixes the remaining hidden-metadata parent/write gap. Whole persisted containers are intentional; no embedded hook family was added. |
| Invocation/timing/binding (DEP-01.4 and acceptance) | All three invocation boundaries resolve descriptor `get`: output stage, pre-write update and explicit hook-to-metadata utility. Existing boolean-map normalization, request `this`, arguments, hook gate, stage-once execution and independent pre-/post-write stages remain. Missing inputs do not skip hooks; virtual missing-input skipping remains separate. |
| Complete old-option removal (DEP-01.5, DEP-03.2) | No `alwaysSelectFields` or retired resolver reference remains under `src/`; no option/default/type/fluent/planner alias. Negative declaration tests/removal guidance are intentional. Benchmark-only historical setup is selected from the chosen artifact's declarations, not implemented by the current package. |
| Migration preserves purpose (DEP-02.1) | Reviewed every changed test diff, including private ancestors/Mixed arrays, metadata, include/populate, raw helpers, request concurrency and retained-runtime ownership. Security/non-leakage assertions remain. Obsolete forced fields with no consumer were removed; actual hook/selected-virtual inputs moved to that consumer. Compaction-only tests use internal planner inputs rather than fictitious hooks. Historical task/artifact evidence was not rewritten. |
| Alternate execution modes (DEP-02.3, DEP-03.1–2) | New and migrated tests cover lean/hydrated, isolated/trusted, direct/public helpers, custom/default accesses, owning-parent/subdocuments, include/populate and captured replacement across awaits. Raw output helpers retain empty facts and no hidden reads/computation; planners execute no hook/getter. |
| No unrelated virtual behavior change | Shared safe persisted-input validation changed diagnostic wording/admission, not getter resolution, local/shared dependencies, selected-candidate planning, virtual skipping, source modes or authority. Existing virtual configuration/planner/hardening tests passed in the focused rerun. |
| Installed consumers and guidance (DEP-02.4–5) | README/MIGRATION/JSDoc/llms and secondary website/decorator guidance describe the same current contract. Inspected actual packed-consumer wiring: the new fixture runs against installed tarball/artifact-tree root/advanced declarations in Bundler/NodeNext/Node16 ESM/CJS, not source aliases. The complete package suite passed, including those actual consumers and shipped examples. Final pack/declaration inspection also passed. Decorator wrappers retain registered host/parameter injection. |
| Final integration/evidence (DEP-03.3–4) | Final workspace checks and preservation results are recorded below. Coordinator retains status ownership. |

## Verification executed by REVIEW-01

Commands run at repository root, in sequence. Initial temp-using processes inherited
`TMPDIR='<repo-root>/_tmp-dep03-review-20261103'`; the full workspace-test retry uses
the shorter `TMPDIR='<repo-root>/_tmpd3'`. Placeholders were replaced by the runtime
checkout path; `git check-ignore` confirmed both scratch directories were ignored.
No builds or tests overlapped. The root test script is
`pnpm -r --if-present --workspace-concurrency=1 test`.

| Exact command | Result |
| --- | --- |
| `pnpm --filter @web-ts-toolkit/access-router typecheck` | Passed after final source corrections, including transitive build. |
| `pnpm --dir packages/access-router exec vitest run --config vitest.config.ts test/document-permissions-dependencies.unit.test.ts test/document-permissions-dependencies.integration.test.ts test/service-authorization-subdocuments.integration.test.ts test/virtuals-config.contract.test.ts test/virtuals-projection-planner.unit.test.ts test/virtuals-hardening.boundary.test.ts` | **6 files / 121 tests passed** after corrections. |
| `pnpm build` | Passed after final source corrections. |
| `pnpm test` | **Passed, exit 0**, full root script with `_tmpd3`, no skips added: 34 suite summaries, **645 file/lane executions, 18,677 passing test executions and 1 todo**. Totals include repeated peer/browser lanes, not unique files/tests. Access-router: **190 files / 6,135 passed**, including actual packed ESM/CJS consumers; decorator: **23 files / 742 passed**. Mongoose-rxdb: **45 files / 632 passed**. |
| `pnpm lint` | **Passed, exit 0** (`eslint .`), after the completed workspace test run. |
| `git diff --check` | Passed; bundle Markdown whitespace checked separately, including untracked files. |
| `npm pack --dry-run --json` (cwd `packages/access-router`) | Passed; **19 entries** inspected. All public import/require/type-condition files and shipped guides exist; no source/test/dependency tree. |
| `node --test scripts/benchmarks/access-router-document-permissions.test.mjs scripts/benchmarks/access-router-owned-batch.test.mjs` | **10 passed / 0 failed**, after the completed root checks; no performance claim. |

The initial `pnpm test` exited 1 at mongoose-rxdb: 21 failed / 611 passed and 323
reported errors, with failing socket opens showing `listen EINVAL`. This failure
was investigated rather than labeled pre-existing.
A direct `node:net` socket probe reproduced `EINVAL` with a 112-byte path beneath
the initial scratch directory; the same probe listened successfully with a 92-byte
path beneath `_tmpd3`. The completed shell notification and process inspection
confirmed no surviving build/test process before retry. A single kernel process-exit
wait then awaited the existing retry (no repeated polling or duplicate writers);
its completion notification and terminal result confirmed success before lint.
No tests were skipped,
dependency behavior changed or unrelated package code patched to bypass the failure.

Final emitted root/advanced declarations in both `.d.ts`/`.d.mts` conditions retain
all three exported names, readonly model-aware `NoInfer` dependencies and useful
`get`/`dependsOn` JSDoc; the removed option is absent. No source changes followed
the final typecheck/focused/build checks, so their evidence remains applicable.

## Limits and preservation

- The IMPLEMENT-02 optional broader benchmark result remains **51 passes / 2 failures**:
  omitted `WTT_BENCH_LEGACY_ROOT` artifact and a test opening retired
  `unsafe-snapshot-options.ts`. Not a proven baseline, not a required workspace-test
  substitute and not silently waived as passing. Its successful current smoke run
  is implementation evidence; no historical or performance campaign is recertified.
- Raw logs, generated consumers/tarballs/builds, dependencies and Mongo temp data are
  disposable scratch, not archived. The maintained regressions and exact commands
  above preserve useful evidence; this is a summary, not a standalone reproduction
  bundle. See [the bundle index](README.md) and [earlier protocol](VERIFICATION.md).
- Reviewed both scratch runs' useful diagnostics/results and retained the necessary
  finding/reproduction summary here; generated consumers, dependencies, caches,
  database files and redundant raw logs remain omitted.
- Manually reviewed all **4 bundle Markdown files** and scanned for machine-local
  paths/private session IDs; no credentials or identifying URLs were preserved.
  All **10 local Markdown links** resolve; all bundle destinations are **not ignored**.
  Both scratch directories are ignored. Bundle whitespace/newline checks and
  `git diff --check` passed. Historical evidence and the task's statuses are unchanged.

## Acceptance conclusion

**DEP-03 meets its full completion criteria.** F1 is corrected and regression-tested;
the required workspace build/test/lint and final preservation checks passed. No
unresolved acceptance finding or required-check blocker remains. The optional
historical-benchmark limitation above is retained, not converted into a passing
performance claim. The coordinator still owns task-status reconciliation.
