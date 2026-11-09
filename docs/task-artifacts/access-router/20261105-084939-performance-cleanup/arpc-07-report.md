# ARPC-07 — private policy and argument cleanup

Date: 2026-11-07. Related [task](../../../tasks/20261105-084939-access-router-performance-cleanup.md), ARPC-07.

## Outcome

**Focused cleanup delivered: 1,623 tests passed across 36 access-router files,
filtered build/typecheck and affected-file lint passed.** No performance claim is
made. The full package suite remains reserved for the independent ARPC-08 reviewer.
The coordinator-owned task file was not edited.

- Removed five unreachable private functions and one private interface:
  `prepareStaticOutputPaths`, `staticFieldPolicy`, `booleanRuleLookup`,
  `ordinaryContainer`, `canPrepareStaticOutputPolicy`, `StaticOutputPath`.
- Removed unused finalizer `snapshot`, `finalizeDirectOutput.sharedGate`, and
  `findPrepared` / `createPrepared` / `updateOnePrepared` `decorate` arguments,
  including private executor typings, registration and caller plumbing.
- Kept public decoration signatures and the unchanged centralized
  `prepared-query.ts` publication/decorating boundary. Kept active call-field
  preparation, stage/fact/budget handling, native copying, modes and write isolation.
- Corrected reader/native-copy ownership comments. Kept live
  `captureVirtualSnapshot`, `FinalizeSnapshot` and populate snapshot inspection;
  clarified that the populate snapshot is not finalizer authority.
- Six existing tracked test/fixture files received only mechanical removal of
  obsolete finalizer inputs/imports and captures used solely for those inputs.
  No assertions were removed or weakened; no new deletion-mirroring tests were added.

Eight production files changed, **17 lines added / 132 removed**; six test/fixture
files changed, **1 added / 11 removed**. No ARPC-02 preparation or ARPC-05 logging
candidate was revived. Their unaccepted speedups remain withdrawn/deferred.

## Evidence index and provenance

- [Keep/remove ledger and reachability method](arpc-07-keep-remove-ledger.md)
- [Exact verification arguments, per-file results, declaration and work hashes](arpc-07-verification.json)
- Prior context: [ARPC-02 withdrawal](arpc-02/withdrawal/report.md),
  [ARPC-05 withdrawal](arpc-05/withdrawal/report.md),
  [ARPC-04/06 runtime verification](arpc-046-verification.md).

HEAD stayed `6c3ceee4433daf203d4625d70b0ef5c4b7009529`. Before edits all **151**
production files matched HEAD byte-for-byte; the source manifest matched the
restored original baseline:

```text
original source: f2d472bbe1f390005f0ebe62f548608a1a155d7c9dc8bc1e85f2122559999480
cleanup source:  072039b46ed3603f995bd04a9b0e09817dce13cef58679774b45da5efa02caef
production diff: 573c36a5fe089da5eafb61bb0228d8f2290f01e76bfdde3c7b9c54b59328d9b2
package diff:    136d3f67bfc680dc842320bf0aa3795d7edb1819ccf50d60c04ef6c8d79b053b
```

Source manifest hashing uses the maintained CRUD driver's ordering: recurse
through `src`, sort each directory with `localeCompare(..., 'en')`, SHA-256 each
file, then SHA-256 `JSON.stringify([relativePath, fileHash][])`. Diff hashes use
`git diff HEAD -- packages/access-router/src` and the same command with
`packages/access-router/test` additionally selected. Node `v26.12.1`, pnpm
`11.18.0`, Vitest `4.1.11`; lockfile hash is in the verification data.

A pre-edit checkpoint covered **2,350** tracked/nonignored-untracked files.
All **2,336 files outside this task's 14 edited paths remained hash-identical**,
including the shared task, existing evidence, benchmark files and every previously
untracked test/fixture. Historical scratch trees/seals were not modified. No
commits, resets, delegation or background runtime jobs occurred.

## Contract checks

- **Public types:** all eight generated `.d.ts` / `.d.mts` files, including the
  shared declaration chunk, are byte-identical to the pre-edit distribution.
  Manifest/entrypoints are unchanged. Export, installed strict-type,
  packed-consumer and tree-shaking tests passed, including ESM/CJS, minimum/current
  peers and Bundler/NodeNext/Node16 consumers.
- **Real CRUD output and callbacks:** the maintained 434-case harness passed on
  cleanup, covering all 16 READ/LIST/CREATE/UPDATE tuples and direct/public real
  CRUD branches, output expectations, actual resolved stage modes, stable writes
  and repeated-call traces. Independent before/after work probes produced **96
  CRUD records and 32 preparation records with byte-identical JSON**: work/query/
  callback counts and ordered traces did not change. These probes include both
  modes, direct/public entry, LIST/bulk CREATE and READ/UPDATE controls, one/16 rows,
  bare/hooks/metadata shapes (the preparation subset uses hooks).
- **Decoration:** service LIST preparation checks retain exact field/getter →
  row decoration → public `decorateAll` order; write/metadata, request-hook,
  stage-closure, prepared-query and packed checks pass. Public decorate APIs and
  `prepared-query.ts` itself were not changed.
- **Related/writes:** focused mode/write, real MongoDB metadata callback traces,
  subdocument output and populate/private-dependency checks passed, including
  post-write detachment, both UPSERT branches, failure draining and concurrency.

These are correctness and maintainability observations, not measured CPU,
allocation, bundle-size, latency or non-regression results. No timings/calibration
were added; test-command durations below are diagnostics only.

## Verification actually executed

Working directory: repository root. Fresh scratch
`_tmp-arpc-07-cleanup-20261107` was created by patching in task-local audit tooling;
`git check-ignore -v _tmp-arpc-07-cleanup-20261107` passed (`_tmp*` rule).
Every runtime command ran **foreground and sequentially**, with
`TMPDIR='<repo-root>/_tmp-arpc-07-cleanup-20261107'` supplied as an absolute runtime
path. Replace `<repo-root>` before using examples; use a new ignored directory for
a new run. A scratch Python runner only supplied environment, captured logs,
elapsed time and exit status; the effective package commands are below and in JSON.

| Gate, in execution order | Result |
| --- | --- |
| Before-edit CRUD/preparation work probes | 15 tests / 2 files passed, 4.86s |
| `pnpm --filter @web-ts-toolkit/access-router typecheck` | Passed, 26.98s; builds access-router and its four required transitive packages, including declarations |
| Focused preparation/field/mode/write/decorator contracts | 1,253 tests / 23 files passed, 20.80s |
| Related/subdocument/metadata/callback contracts | 256 tests / 9 files passed, 36.83s |
| Export/packed/strict-consumer/tree-shaking checks | 114 tests / 4 files passed, 549.68s |
| Affected-file ESLint | Passed, no diagnostics, 2.87s |
| Declaration, work-record and protected-file comparison | All match as described above |
| Post-edit package/script/dist symbol search and `git diff --check` | Passed |

No runtime check failed, skipped or remained pending. Vite's existing
CommonJS/ESM native-config-loader warning was informational. The `rg` executable
was unavailable (two read-only attempts exited 127); dedicated content search and
a Python whole-checkout scanner supplied the reachability evidence instead.
The last production edit after the build/first focused run was only the private
populate ownership comment; no executable/type change invalidated those gates.

### Effective commands

All commands inherited the TMPDIR above. Before-edit work command additionally set
`ARPC_CRUD_WORK_REPORT='<repo-root>/_tmp-arpc-07-cleanup-20261107/baseline-crud-work.json'`
and `ARPC_OUTPUT_PREPARATION_REPORT='<repo-root>/_tmp-arpc-07-cleanup-20261107/baseline-preparation-work.json'`:

```sh
pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts \
  test/access-router-crud-work.unit.test.ts test/service-output-preparation.unit.test.ts

pnpm --filter @web-ts-toolkit/access-router typecheck
```

The next command set the same report variables with `cleanup-` instead of
`baseline-` filenames:

```sh
pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts \
  test/finalizer-preparation.unit.test.ts test/service-output-preparation.unit.test.ts \
  test/service-list-preparation.unit.test.ts test/output-field-policy-cache.unit.test.ts \
  test/owned-authorization-work.unit.test.ts test/owned-authorization-projection-work.unit.test.ts \
  test/service-authorization-reads.unit.test.ts test/service-authorization-finalizer.unit.test.ts \
  test/owned-authorization-stage.unit.test.ts test/owned-authorization-boundaries.unit.test.ts \
  test/service-authorization-prepared-query.unit.test.ts test/response-pipeline.internal.test.ts \
  test/write-output-modes.unit.test.ts test/write-output-authorization.unit.test.ts \
  test/write-output-origin-ownership.unit.test.ts test/write-output-source-lifetime.unit.test.ts \
  test/write-output-populate.unit.test.ts test/owned-authorization-modes.unit.test.ts \
  test/access-router-crud-harness.unit.test.ts test/access-router-crud-work.unit.test.ts \
  test/no-work-output-scheduling.unit.test.ts test/service.internal.test.ts \
  test/service-denial-contract.test.ts --reporter=default --reporter=json \
  --outputFile='<repo-root>/_tmp-arpc-07-cleanup-20261107/focused.json'

pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts \
  test/virtuals-populate-dependencies.traversal.test.ts \
  test/virtuals-populate-dependencies.integration.test.ts \
  test/service-authorization-subdocuments.integration.test.ts \
  test/service-authorization-related.integration.test.ts \
  test/service-authorization-mutations.integration.test.ts \
  test/owned-authorization-modes.integration.test.ts test/request-hook-concurrency.test.ts \
  test/bulk-create-metadata-filter-trace.integration.test.ts \
  test/populate-operation-policy.config.test.ts --reporter=default --reporter=json \
  --outputFile='<repo-root>/_tmp-arpc-07-cleanup-20261107/related.json'

pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts \
  test/export-contract.test.ts test/packed-consumer-compatibility.test.ts \
  test/strict-consumer-types.test.ts test/tree-shaking-smoke.test.ts \
  --reporter=default --reporter=json \
  --outputFile='<repo-root>/_tmp-arpc-07-cleanup-20261107/exports.json'

pnpm exec eslint \
  packages/access-router/src/acl/authorization-snapshot.ts \
  packages/access-router/src/acl/output-field-policy.ts \
  packages/access-router/src/acl/populate-target.ts \
  packages/access-router/src/acl/service-authorization.ts \
  packages/access-router/src/acl/service-execution.ts \
  packages/access-router/src/acl/subdocument-output.ts \
  packages/access-router/src/output/finalize-model-output.ts \
  packages/access-router/src/services/service.ts \
  packages/access-router/test/owned-stage-test-fixture.ts \
  packages/access-router/test/service-authorization-finalizer.unit.test.ts \
  packages/access-router/test/owned-authorization-boundaries.unit.test.ts \
  packages/access-router/test/owned-authorization-stage.unit.test.ts \
  packages/access-router/test/virtuals-populate-dependencies.traversal.test.ts \
  packages/access-router/test/virtuals-populate-dependencies.integration.test.ts
```

## Handoff, blockers and archive limits

No ARPC-07 implementation or focused-verification blocker remains. Recommend the
coordinator accept this as maintainability cleanup, not an optimization. ARPC-08
still owns independent review and the **single final full access-router suite**;
that suite was not run here. No root/grouped/downstream suite or root release
artifact command was run. Packed checks use the package's existing bounded
release staging fixtures and prebuilt CLI fixture; no downstream tests/builds ran.

The new report/ledger/verification file form a curated evidence packet. Full raw
test logs/JSON assertion arrays, complete work-record bodies, checkpoint inventory,
hidden historical search hits, generated consumers/tarballs, dependency trees,
MongoDB files and scratch audit/runner tooling are intentionally omitted. Original
log/work hashes and comparison results are retained, not a claim that omitted raw
data can be recalculated from this packet alone. Reproduction uses the maintained
tests/fixture, source revision plus retained diff, lockfile, installed toolchain,
MongoDB prerequisites and package tests' consumer-install prerequisites.
Nothing depends on retaining this run's scratch directory. Durable links, JSON,
hashes, ignore status, whitespace and privacy-sensitive content were checked.
