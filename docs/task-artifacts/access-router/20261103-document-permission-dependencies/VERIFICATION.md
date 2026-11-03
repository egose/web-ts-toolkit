# IMPLEMENT-02 verification commands

See [migration ledger and results](IMPLEMENT-02.md). All commands ran from the
repository root except where a package cwd is shown. Every tool using temporary
files received runtime `TMPDIR` pointing to fresh ignored repository-local scratch;
benchmark tools also received `WTT_BENCH_TMP` pointing there. Confirmed with
`git check-ignore`. Replace any quoted `<repo-root>` placeholder before running.
Scratch locations are disposable, not evidence dependencies. No builds overlapped.

## Required package checks

```sh
pnpm --filter @web-ts-toolkit/access-router test
pnpm --filter @web-ts-toolkit/access-router typecheck
pnpm --filter @web-ts-toolkit/access-router-deco test
```

Execution order: first package test (failed, 6,113 passed / 17 failed), targeted
corrections, typecheck (passed), focused checks below (passed), full package test
again (6,131 passed), decorator test (742 passed). The second package run includes
all actual packed consumers; no separate source-only substitute was used. Their
new declaration fixture runs in NodeNext/Node16 ESM/CJS and Bundler conditions.
The final package run took 1,121.47 seconds; decorator test took 47.30 seconds.

Focused checks, cwd `packages/access-router`:

```sh
pnpm exec vitest run --config vitest.config.ts test/documentation-examples.test.ts -t MIGRATION-block-1
pnpm exec vitest run --config vitest.config.ts test/finalizer-preparation.unit.test.ts test/service-authorization-final-review.integration.test.ts test/virtuals-hardening.boundary.test.ts test/export-contract.test.ts test/document-permissions-dependencies.unit.test.ts test/document-permissions-dependencies.integration.test.ts
npm pack --dry-run --json
```

Results: 1 selected migration-example compile passed (80 unselected); 169 focused
regressions passed; final pack dry run passed. Inspected its 19 entries for shipped
README/MIGRATION/llms and matching JS/declaration conditions, no src/test trees.
Inspected emitted root/advanced and shared declaration chunks in both conditions:
all three new names, useful property hovers and `NoInfer` remain, old option absent.
The maintained export tests independently assert those public-symbol contracts.

## Scoped lint and syntax

The final scoped command selected all changed/new relevant TS/MJS files (84),
including the inherited DEP-01 source/test changes, and checked each changed
benchmark script's syntax (6):

```sh
python3 - <<'PY'
import subprocess
files = subprocess.check_output(['git', 'diff', '--name-only', '--', '*.ts', '*.mjs'], text=True).splitlines()
files += subprocess.check_output([
    'git', 'ls-files', '--others', '--exclude-standard', '--',
    'packages/access-router/src/*.ts', 'packages/access-router/src/**/*.ts',
    'packages/access-router/test/*.ts', 'scripts/benchmarks/access-router*.mjs',
], text=True).splitlines()
files = sorted(set(files))
for file in files:
    if file.startswith('scripts/benchmarks/'):
        subprocess.run(['node', '--check', file], check=True)
subprocess.run(['pnpm', 'exec', 'eslint', *files], check=True)
PY
git diff --check
```

Both passed. File count will differ after additional coordinator/reviewer changes.
Historical evidence paths are not included in these code-lint selectors.

## Benchmark checks

Passed (10 tests):

```sh
node --test scripts/benchmarks/access-router-document-permissions.test.mjs scripts/benchmarks/access-router-owned-batch.test.mjs
```

Also executed the broader command below. It ran 53 tests, not an accepted reduced
campaign: 51 passed / 2 failed. Missing sealed legacy-root and retired source-file
requirements are described in the ledger; no baseline/performance claim is made.

```sh
node --test --test-name-pattern='^(?!public correctness and structural probes).*' scripts/benchmarks/access-router.test.mjs scripts/benchmarks/access-router-owned.test.mjs scripts/benchmarks/access-router-owned-batch.test.mjs
```

Current smoke protocol used the existing public drivers and their original
full-response, actual hook-count and structural assertions. Setup ran under
`node --input-type=module` with these public benchmark-module calls, using the
current `inspectBuild(process.cwd())` result and `profileTarget` for each of
`isolated` / `trusted`:

1. Set the explicit count contract to
   `{ revision: GUARD_COUNT_REVISION, artifactSha256: current.distSha256 }`.
2. Serialize the target to scratch, then execute separately for each mode:
   - `node scripts/benchmarks/access-router-owned-probes.mjs <target-json> <result-json>`
   - `node scripts/benchmarks/access-router-owned-structure.mjs <target-json> <scratch-instrumented-dir> <result-json>`
   - Require each child to exit zero and each result's `status` to equal `ok`.
3. Call `benchmarkOwned` with each original `workloads()` preset
   `native-adapter/direct-read/100` and `native-adapter/direct-list/100`, adding
   the target, `smoke: true`, `samples: 1`, `warmup: 0`, and the owned test database
   name `access_router_bench_0123456789ab_1`. Require `status: ok`.
   For each mode, READ observed 1 hook / 24 callbacks / 1 adapter read;
   LIST observed 100 hooks / 2,400 callbacks / 1 adapter read. Both had zero Mongo
   reads/getters. Full native output was checked by the worker, not a subset.
4. Start `MongoMemoryServer.create()` and serialize one main-worker job per mode:
   `scenario: 'document-rules'`, rows 10, fields 4, bytes 8, samples 1, warmup 0,
   concurrency 1, hookConcurrency 1, validationSeries `checked-each-response-v2`,
   database `access_router_bench_0123456789ab_2`, URI from that server and the
   selected target. Execute each as its own
   `node scripts/benchmarks/access-router-worker.mjs <job-json> <result-json>`
   child. Require zero exit / `status: ok`; stop Mongo in `finally`.

Both current modes passed every final smoke path. Expected negative-path probes
emit terminal-error diagnostics while asserting controlled 400/403 behavior;
their resulting status was still `ok`. Smoke is not a latency/CPU/retention result.
No sealed legacy build, raw logs, installed dependencies, generated consumers,
Mongo files, tarballs or instrumented bundles are included in this artifact.
