# OAM-04: installed guidance, consumers and benchmark integration

**Resolution update:** the historical-fixture prerequisite is now resolved and full
OAM-04 V2 passes; see the [appended resolution](#resolution-read-only-historical-fixture-and-complete-v2).
The initial blocker/failure observations below are preserved as history.

## Outcome and gate

**Integration delivered; full V2 acceptance has a historical-fixture prerequisite
blocker.** INTEGRATE-04, 2026-11-03, on the existing `c68451e` worktree with
coordinator-reconciled OAM-01–03 changes. Access-router typecheck and both unfiltered
package suites passed: **222 files / 7,704 tests**, including installed/packed consumers.
Current-artifact benchmark checks passed; three historical checks cannot complete
without the documented sealed old build. Do not call full V2 green.

Read the root instructions, whole [task](../../../tasks/20261103-172737-access-router-output-authorization-modes.md),
[preservation workflow](../../README.md), [task conventions](../../../tasks/README.md),
and prior [design](../oam-20261103-172737-design/README.md),
[configuration](../oam-20261103-172737-config/README.md) and
[runtime](../oam-20261103-172737-runtime/README.md) handoffs.
The coordinator owns task/status; this child did not edit it. No subagents, commits,
publication, dependency/metadata changes or overlapping build/test commands. Prior
source/tests, tasks, artifacts and other scratch were preserved.

## Exact changed files

Paths below are repository-relative; shared files retain prior owners' changes.

- `packages/access-router/README.md`
- `packages/access-router/MIGRATION.md`
- `packages/access-router/llms.txt`
- `packages/access-router/src/interfaces/root.ts` — JSDoc/examples only in this child.
- `packages/access-router/test/authorization-fast-path-consumer.types.fixture.ts`
- `packages/access-router/test/owned-authorization-migration.invalid.types.fixture.ts`
- `packages/access-router/test/documentation-examples.test.ts`
- `packages/access-router/test/packed-consumer-compatibility.test.ts`
- `packages/access-router-deco/README.md`
- `packages/access-router-deco/test/hydration-consumer.types.fixture.ts`
- `packages/access-router-deco/test/strict-consumer-types.test.ts`
- `packages/access-router-deco/test/packed-consumer-compatibility.test.ts`
- `packages/access-router-deco/test/owned-authorization-modes.test.ts`
- `packages/access-router-deco/test/owned-authorization.documentation.runtime.fixture.mjs`
- `website/docs/packages/access-router/configuration.mdx`
- `website/docs/packages/access-router-deco.md`
- `scripts/benchmarks/README.md`
- `scripts/benchmarks/access-router-core.mjs`
- `scripts/benchmarks/access-router-owned.test.mjs`
- This handoff README.

Guidance now names exactly four settings with isolated defaults/undefined inheritance,
captured UPSERT branch selection, mandatory full bounded write-source/native
detachment, trusted omission only of the subsequent document-hook view copy,
target-own READ/LIST modes under genuine write-origin populate, embedded inheritance
and independent calls. Query-origin hidden-graph claims explicitly exclude write
targets. Hydrated pre-write UPDATE hooks/input/lifecycle remain unchanged, not newly
detached or sandboxed. Output failure may follow commit; no implicit save/query/rollback.
No renamed-key workflow or alternate option spellings were introduced.

Positive/unsuppressed negative consumers cover four optional literal settings,
model/default/fluent configuration and rejected malformed/client/per-call/helper/
policy/populate/method-default placement. Existing negative boundaries were retained.
Decorator checks now cover both NodeNext declaration conditions, actual CREATE/UPDATE
hook mutation versus persisted values, hydrated pre-write UPDATE input, class-instance
binding/original-request injection, inheritance and rejected write selectors.

## Executed V2 commands and results

All commands ran **serially from repository root**, with installed dependencies and
MongoDB memory-server prerequisites available. Node `v26.12.1`, pnpm `11.18.0`,
Vitest `4.1.11`. No install was run by this child; packed-consumer suites performed
their normal isolated consumer installs.

Fresh scratch `_tmp-oam04-integration-20261103-204045` was created with `mkdir` and
confirmed ignored with `git check-ignore`. Every build/type/test/lint/formatter
command set `TMPDIR` to its absolute checkout path. Benchmark commands additionally
set `WTT_BENCH_TMP` to the same absolute path. Explicit source/test paths were used
for lint/format; source typecheck includes only `src/**/*.ts`. Scratch was not added
to these programs. The following are the executed command bodies; prefix them with
`TMPDIR='<repo-root>/_tmp-oam04-integration-20261103-204045'` to reproduce, replacing
the quoted placeholder first:

```sh
pnpm --filter @web-ts-toolkit/access-router typecheck
pnpm --filter @web-ts-toolkit/access-router test --reporter=default --reporter=json --outputFile.json=../../_tmp-oam04-integration-20261103-204045/access-router-v2.json
pnpm --filter @web-ts-toolkit/access-router-deco test --reporter=default --reporter=json --outputFile.json=../../_tmp-oam04-integration-20261103-204045/access-router-deco-v2-rerun.json
```

| Check                                                             | Actual result                                                                                                                      |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Access-router typecheck (script includes transitive build)        | Passed.                                                                                                                            |
| Unfiltered access-router test                                     | **199 files / 6,925 passed**, zero failed/pending.                                                                                 |
| Included strict installed consumers                               | **49 passed**; Bundler, Node16/NodeNext ESM/CJS, unsuppressed negative diagnostics.                                                |
| Included packed compatibility                                     | **13 passed**; real production-transformed packs/installs, both module systems, minimum/current peers and bounded artifact layout. |
| Included documentation examples                                   | **92 passed**; all four mode examples from every emitted root/advanced condition compiled.                                         |
| Unfiltered decorator test (transitive build + typecheck included) | **23 files / 779 passed**, zero failed/pending.                                                                                    |
| Included decorator strict / packed / documentation / mode suites  | **6 / 4 / 18 / 77 passed**, respectively.                                                                                          |

Fresh JSON assertion results and command logs were inspected, not just exit status.
The first unfiltered decorator invocation used the same command with report basename
`access-router-deco-v2.json`: **22 files / 702 tests passed; one suite failed to
transform**, with zero failing test assertions. New parameter-decorator syntax was
unsupported by that Vitest transform. Changed only the new fixture to the suite's
existing explicit decorator-registration idiom, preserving assertions and actual
decorator execution. The entire unfiltered script then passed as above. Installed
decorator-syntax consumers and README workflows still compile/run in both conditions.
The access-router Vite CommonJS-config/ESM warning remained non-fatal.

With both `TMPDIR` and `WTT_BENCH_TMP` prefixes described above:

```sh
node --test --test-concurrency=1 scripts/benchmarks/access-router-owned.test.mjs scripts/benchmarks/access-router-owned-batch.test.mjs
node --test --test-concurrency=1 scripts/benchmarks/access-router.test.mjs scripts/benchmarks/access-router.integration.test.mjs
```

- Owned + owned-batch final result: **29 tests, 28 passed, 1 failed, 0 skipped**.
  All **9** B1 tests passed. The one historical-family correctness/structural test
  fails immediately: `WTT_BENCH_LEGACY_ROOT must name the sealed old build for historical compatibility tests`.
- Additional shared-runner checks: **29 tests, 27 passed, 2 failed, 0 skipped**.
  The historical worker matrix requires the old six/two/fast declaration groups;
  current sources correctly expose none. The historical source-group assertion
  gets ENOENT for `packages/access-router/src/acl/unsafe-snapshot-options.ts` when
  its default root is this checkout. Both require the same documented old fixture.
- Neither historical environment variable was set. No sealed build was fabricated,
  old source restored, unrelated scratch searched, test skipped or expectation
  weakened. See [benchmark prerequisites](../../../../scripts/benchmarks/README.md).
  Coordinator must supply an intact historical root with original source, built
  declarations/runtime and resolvable historical dependencies, then rerun both
  commands with `WTT_BENCH_LEGACY_ROOT` set. These are prerequisite failures, not
  asserted baseline runtime defects.
- Initial owned/batch run: **26/28 passed**, missing `preparationFailures` in the
  new report fixture plus the historical prerequisite. Corrected that fixture;
  rerun **27/28 passed**, only the prerequisite. Added actual current adapter-worker
  coverage afterward; final **28/29** result above includes it. No failure was hidden.

New benchmark checks verify four-option declarations still discover **only genuine
READ/LIST** support under both conditions, missing/malformed query modes fail closed,
actual public runtime exact/bulk getters agree on both models, and report ratios
fail closed on mismatched proofs. Four actual owned worker correctness runs exercise
direct READ/LIST adapters in both modes and verify full responses/counts/getters;
they have **zero Mongo reads** and are not Mongo timing/performance acceptance.
The 45-case catalog/B1 meaning and numerical gates are unchanged. Candidate labels no
longer incorrectly say LIST is the only timed family in the separate fixed driver.
New report text explicitly excludes CREATE/UPDATE/UPSERT output timing; no new timing
or copy-saving claim, seal or historical-result relabeling was made.

## Declaration, pack and hygiene review

- A TypeScript-checker review of fresh `index.d.ts`, `index.d.mts`, `advanced.d.ts`
  and `advanced.d.mts` followed shared aliases/inheritance. **64** properties across
  Default/Model/ExtendedDefault/ExtendedModel options are optional exact
  `'isolated' | 'trusted' | undefined`; `AuthorizationMode` has the same two literals.
  All **16** mode examples survive emission; private write issuers/readers are absent.
- Package exports remain exactly root, `/advanced`, `/processors`; all matching
  CJS/ESM runtime/declaration targets resolve. Package metadata/build entries were
  not edited. Full packed suites checked actual installed types/workflows, not only
  source aliases. New private execution issuers are also checked absent at installed
  CJS/ESM runtime entrypoints.
- Changed-file ESLint (12 TypeScript/JavaScript files), Prettier (19 maintained
  files plus this handoff), maintained-content searches, **135 relative links / 119 anchors**,
  targeted privacy/credential-pattern review, ignore status and tracked/untracked
  whitespace checks passed. Initial formatter findings were fixed with patch.
  This is bounded hygiene, not a general secret/security certification.

Hygiene command bodies were `pnpm exec eslint` with the 12 `.ts`/`.mjs` paths in
the exact file list above, and `pnpm exec prettier --check` with all 20 listed paths
(explicit arguments, not directory scans), plus `git diff --check` and
`git diff --no-index --check -- /dev/null docs/task-artifacts/access-router/oam-20261103-172737-integration/README.md`.
The latter had no diagnostics; exit 1 denotes added untracked content. The disposable
`node _tmp-oam04-integration-20261103-204045/verify-integration.mjs` additionally
checked all authored-file whitespace/ignore status, relative links/anchors and
targeted privacy patterns. Its output is summarized above; the checker itself is
not a preserved continuation dependency.

## Remaining limits and OAM-05 handoff

Delivered integration is ready for independent review, **not unconditional OAM-04
completion**: resolve the sealed historical-root prerequisite and rerun the benchmark
gates before declaring V2 green. No real runtime defect outside OAM-04 was observed.
OAM-05 owns independent acceptance and full serial V2/V3 on final source; root
build/test/lint and release-artifact commands were not separately run here.

Only this curated handoff is preserved. Raw logs/JSON reports, formatter candidates,
generated declarations/tarballs/consumers/dependency caches/database files remain
disposable scratch or ignored build output; they are not continuation prerequisites.
This is not a self-contained environment/reproduction bundle. No historical task,
artifact, seal or timing data is used as evidence for the new write-output modes.

## Resolution: read-only historical fixture and complete V2

**All OAM-04 acceptance and V2 checks now pass; no remaining OAM-04 blocker.**
The coordinator identified the existing original
`_tmp-oar01-20261031-153820/baseline-artifact`, its `baseline-metadata.json` and
`seal-baseline.mjs`. Read the curated historical [BASELINE.md](../oar01-20261031-153820/BASELINE.md)
and [HANDOFF.md](../oar01-20261031-153820/HANDOFF.md). No baseline was fabricated,
rebuilt, installed, restored, resealed or modified; the original sealer was read,
**never executed/imported**. No product/test/tooling changes were needed in this
continuation; only this handoff was extended. Task status remains coordinator-owned;
OAM-05 was not started.

Fresh scratch `_tmp-oam04-baseline-gate-20261103-212611` was created and confirmed
ignored with `git check-ignore`. A new read-only verifier there reproduced the
original sealer's sorted file inventory/exclusion and dependency-resolution rules.
It compared **complete recorded inventories**, not merely entrypoint hashes:

- **552 artifact files**, including all **14** access-router build files and **8**
  declarations, match `allFilesSha256`/`distFilesSha256`; all **7** explicit original
  source entries match their copied historical source under the artifact, not current
  changed workspace source. The old `unsafe-snapshot-options.ts` is also hash-matched.
- **134 dependency packages / 3,510 files** match each complete file inventory,
  package-JSON hash, aggregate manifest and version. The dependency descriptor itself
  matches the hash sealed in the original baseline descriptor. All **214 installed
  dependency edges** resolve to recorded identities; **6** originally absent optional
  edges remain absent. Required Mongoose **9.11.4**, Express **5.2.1**, TypeScript
  **6.0.3** resolve without replacement/install.
- All **33** captured package dependency links resolve correctly; **39** observed
  artifact/package/dependency symlink identities were recorded. Root ESM/CJS hashes
  also match the curated historical baseline; all eight declaration entries, their
  aggregate hash and actual six/two/two legacy support match the original descriptor.
- The same verification passed **before use, after owned+batch, and after shared-runner
  use**. Artifact/dependency inventories, resolutions, symlinks, original descriptor/
  sealer/dependency-descriptor/performance-gate bytes, and current candidate/test inputs
  are identical across all three observations. Only new scratch reports were written.

Curated SHA-256 provenance (identical before/after; no machine-local paths/private fields):

| Input                                           | SHA-256                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------ |
| Original `baseline-metadata.json`               | `ebf499b00923e35e7fd5404a2d4aa42dec058e22b01f65ce6664f8900ca6dbd9` |
| Original `seal-baseline.mjs` (read only)        | `e6441fb2b4fb87ded9019c5548b0fe26adf6107de41ada9b8ce8f714f0e7ce49` |
| Original `dependency-identities.json`           | `7a1e7554223fc3ee68caede57ec338b3f1093e09e0d69d167cbdaa8999c9eb82` |
| Artifact inventory, original manifest algorithm | `7229a35eeb5a712707d32d47fb9bc4177b8d9e033f86d782cf0f0ef5c3f45f9a` |
| Original root ESM                               | `33662faede23acffc1a90973f51a7407df147afba76e4fbb23eeb99169df3822` |
| Original root CJS                               | `4ad8ab48b44d91d4051c56e056bf3c2302e0f75c9fbd96b509a15b36f1003bea` |
| Original eight-declaration aggregate            | `5d7ce47c3ea6117c01e5a375f8a58a7637dcb976eaac9b50ea92fa01a0173468` |
| Original `unsafe-snapshot-options.ts`           | `c3a2e9b2b1bf67dcd5d3a91c9298e50c867df8ed9523f8ddfae89f17b26bd331` |
| Current candidate root ESM                      | `ddfaa0189e88179fb1607d3ea766485befd03639e2273e0e05e3d9e34b812ef6` |

This verifies the supplied original source/build/dependency inventories and their
continued availability, not an authenticated signature or every historical claim.
Original root worker/core hashes and earlier 3,500-file FP evidence were not replayed;
current maintained runners are intentionally used. Sealer exclusions remain exclusions
(including node_modules/dependency-links traversal, Git and caches); symlink identity
and recorded dependency bytes were separately checked. No hermetic/vendored guarantee.

### Final executed commands and counts

All ran **serially from repository root**, Node `v26.12.1`, with no build/install or
other child active. Every command set absolute repository-local `TMPDIR` and
`WTT_BENCH_TMP` to the fresh directory above. The two test commands also set
`WTT_BENCH_LEGACY_ROOT` to the original baseline artifact and
`WTT_BENCH_CANDIDATE_ROOT` to the current checkout. Exact command bodies, in order
(log redirections omitted; the verifier/report files are disposable scratch):

```sh
node _tmp-oam04-baseline-gate-20261103-212611/verify-baseline-readonly.mjs before
node --test --test-concurrency=1 scripts/benchmarks/access-router-owned.test.mjs scripts/benchmarks/access-router-owned-batch.test.mjs
node _tmp-oam04-baseline-gate-20261103-212611/verify-baseline-readonly.mjs after-owned
node --test --test-concurrency=1 scripts/benchmarks/access-router.test.mjs scripts/benchmarks/access-router.integration.test.mjs
node _tmp-oam04-baseline-gate-20261103-212611/verify-baseline-readonly.mjs after-shared
```

To reproduce the maintained test commands in an environment retaining this fixture,
replace the quoted placeholders and prefix **each** `node --test` command with:

```sh
TMPDIR='<repo-root>/_tmp-oam04-baseline-gate-20261103-212611' WTT_BENCH_TMP='<repo-root>/_tmp-oam04-baseline-gate-20261103-212611' WTT_BENCH_LEGACY_ROOT='<repo-root>/_tmp-oar01-20261031-153820/baseline-artifact' WTT_BENCH_CANDIDATE_ROOT='<repo-root>'
```

- Owned + owned-batch: **29/29 passed**, zero failed/cancelled/skipped/todo. Includes
  all **9** B1 tests and all four old/current profiles' actual public correctness and
  structural probes. No test-name filters.
- Shared-runner + integration: **29/29 passed**, zero failed/cancelled/skipped/todo.
  Includes the historical source-group assertion and **16 actual workers** (eight
  legacy configurations on each unchanged embedded/document-hook fixture).
- Fresh full logs and all three read-only reports were inspected. The earlier
  **28/29** and **27/29** results remain genuine missing-environment observations;
  these are new successful runs, not rewritten old results. Package **6,925 + 779**
  passes and typecheck above remain valid: no package source/tests changed afterward.
- Handoff Prettier, relative links/anchors, targeted privacy/ignore and full authored
  whitespace checks were rerun after this extension and passed: **10 relative links /
  1 anchor**, with all **9** recorded provenance hashes checked against the actual
  read-only reports. The fresh `verify-handoff.mjs` also checked both full test-log
  totals and equality of all three inventory snapshots; no raw/private paths were
  promoted into this handoff.

The old artifact/dependency tree and raw caches/reports are **not copied into docs**.
Original scratch is a historical disposable, environment-dependent prerequisite, not
guaranteed in another checkout. This curated provenance/summary is not a self-contained
replay bundle; the current maintained tests/scripts and an intact matching fixture
are the reproduction route. No original timing study, old performance claim or seal
was rerun/relabelled as write-output evidence. These bounded correctness/structural
worker runs establish no new numerical performance claim. Independent OAM-05 review
and its V2/V3 remain the next owner's work.
