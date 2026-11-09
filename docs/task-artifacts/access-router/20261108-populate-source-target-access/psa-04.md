# PSA-04 consumer-inventory preflight handoff

GATE-04, 2026-11-09. Related task:
[PSA-04](../../../tasks/20261108-211920-access-router-populate-source-target-access.md#task-psa-04-restore-consumer-review-inventory-preflight).

## Outcome and scope

Restored static preflight by changing **40 line coordinates only** in
`packages/access-router/scripts/test-layer-consumers.mjs`: 12 installed-producer
anchors and 28 coordinates across 19 source/read/resolve reviews. No expressions,
targets, reasons, input inventories, compiler settings, negative exceptions, or
checker logic changed. No implementation, consumer tests, populate tests, task
record, or other agent's artifacts were edited.

- Standard `test:layers:check`: passed, with contracts=103, invariants=64,
  internal=51; exact default union; public graph 137 files / 237 modules.
- Standalone maintained checker regressions: **76 passed**; no package setup,
  runtime suites, builds, or shared-output writes.
- Full package/consumer acceptance remains the coordinator's responsibility.

## Independently established baseline provenance

Starting/current HEAD was `647a217d8db8da92c4590b984603d7430acce99f`. Before this
repair, an independent probe performed actual installed-Vitest discovery and
`auditContractGraph` in the current checkout. Layer selection passed, but graph
audit returned the same **94 diagnostics** described in the
[PSA-01 handoff](psa-01.md).

The probe then used `git ls-tree -r --name-only <revision> --
packages/access-router website/docs/packages/access-router tsconfig.base.json`
and `git show <revision>:<file>` to materialize an isolated HEAD snapshot inside
the ignored task scratch area. It did not restore, check out, or replace any
working-tree file. Existing package `dist` files were copied read-only from the
checkout into that snapshot, solely for public-entry existence and declaration
JSDoc inputs. Calling the HEAD snapshot's own `checkTestLayers(snapshotRoot)`
returned a failure message **exactly equal** to the current graph's 94-diagnostic
message, including order and dependency chains.

Additionally, byte comparisons against `git show` proved 47 prerequisites equal
to HEAD before editing: checker, policy, both affected consumer suites, package
manifest, package/root compiler configs, five Vitest configuration files, all 28
finite consumer inputs, and all seven document inputs. Of the 137 visited graph
files, only the two already-modified populate contract suites differed from HEAD;
the full HEAD snapshot omitted those modifications yet produced identical errors.

Selected SHA-256 values for those equal HEAD/current inputs, all relative to
`packages/access-router/`:

```text
scripts/check-test-layers.mjs
  0cc36200e1e443f31660dcc270736921c17ad1b8e0230a4eaa2b3d52feec69da
scripts/test-layer-consumers.mjs (before repair)
  1cf87d0d32147969acd3656d138e32d80d071b083a83a133f441c4ab59521334
test/contracts/packed-consumer-compatibility.test.ts
  c903757d0f356b8fb55690883b5bb068ae8c6b06b040de2a5002099819e1581e
test/contracts/strict-consumer-types.test.ts
  5f6e20b79ed508858bdce282199657bdabe2ee87a02c6475f76db002a7f1e853
```

The 94 errors comprised eight unreviewed source producers, 19 unreviewed reads,
one computed resolve, 35 apparent private dependencies, 19 stale review records,
and 12 stale installed-producer records. The apparent private dependencies came
from exact public package imports in generated installed-consumer modules: stale
producer coordinates prevented installed-context classification, so the checker
correctly applied repository aliases and rejected their source targets. Inspecting
the actual producers and their isolated compiler/runtime inputs found no new
private dependency; restoring only their coordinates resolved these diagnostics.

**Limit:** this proves the stale tracked-input failure exists at original HEAD,
independently of the populate edits. The snapshot reused existing built outputs;
it is not a pristine HEAD build, original-HEAD runtime test, or full historical
package-acceptance claim. No build was run by GATE-04.

## Exact reviewed drift

Below, `packed` and `strict` mean the unchanged
`test/contracts/packed-consumer-compatibility.test.ts` and
`test/contracts/strict-consumer-types.test.ts`. Coordinates are old review anchor
to actual AST location, not new source edits. Installed-producer anchors refer
to the `writeFileSync` call; source reviews refer to its unwrapped data expression.

Packed installed targets remain exactly `path.resolve(consumerDir, '<filename>')`:

```text
633 -> 639    private-exports.cjs
682 -> 688    esm.mjs
712 -> 718    cjs.cjs
744 -> 750    operation-access-smoke.cjs
854 -> 860    operation-access.esm.mjs
861 -> 867    operation-access.cjs.cjs
874 -> 880    consumer.nodenext.mts
936 -> 942    consumer.nodenext.cts
994 -> 1000   consumer.bundler.ts
```

Strict installed targets:

```text
528 -> 543    path.resolve(consumerDir, sourceFile)
952 -> 967    sourceFile
990 -> 1005   path.resolve(consumerDir, sourceFile)
```

Source reviews, with exact unchanged expressions:

```text
packed 570 -> 576    source
packed 574 -> 580    fastPathExample
packed 578 -> 584    privatePopulateExample
packed 587 -> 593    extension === 'cts' ? collection.replaceAll('-recipe.mjs', '-recipe.cjs') : collection
packed 589 -> 595    authorizationExample
strict 180 -> 183    snippet
strict 275 -> 281    block.source
strict 306 -> 312    block.source
```

Packed read/resolve reviews, with exact unchanged expressions:

```text
read     1241 -> 1247                  path.resolve(consumerDir, file)
read     1389 -> 1395                  destination
read     1395,1542,1594 -> 1401,1553,1605   tarball
read     1402 -> 1408                  consumerRequire.resolve(`${name}/package.json`)
resolve  1402 -> 1408                  `${name}/package.json`
read     1448,1589,1778,1805 -> 1454,1600,1789,1816   path.resolve(packedRoot, file)
read     1449,1590 -> 1455,1601         path.resolve(packageRoot, 'dist', file)
read     1544,1596 -> 1555,1607         path.resolve(packedRoot, 'index.mjs')
read     1777,1833 -> 1788,1844         path.resolve(distRoot, file)
read     1782 -> 1793                  path.resolve(packedRoot, file)
read     1832 -> 1843                  path.resolve(artifactRoot, 'dist', file)
read     1837 -> 1848                  path.resolve(artifactRoot, file)
```

An independent AST probe required exactly one matching expression or installed
producer call at every repaired location. Deep comparison of evaluated HEAD and
repaired policies, omitting only `line`/`lines`, passed. Thus no policy data beyond
coordinates changed: 28 inputs, seven documents, 13 installed producers, two
inventories, three generated mappings, 28 reviews, one negative type site, and
two negative-resolve sites remain identical.

### Reviewed inputs and preserved boundaries

- Packed source bindings still select the marked installed README hydration,
  authorization and private-populate examples, and marked MIGRATION blocks. The
  `source` negative table still contains the MIGRATION expected-error block plus
  the two public migration/collection invalid fixtures. Collection CJS conversion
  still replaces only the three audited `-recipe.mjs` suffixes.
- Strict `snippet` still selects the installed MIGRATION
  `runOwnedAuthorizationExample` block. Its `block.source` sinks still emit the
  positive guide blocks and separately compiled invalid blocks. Literal AJV,
  strict-consumer, and nested-operation modules still compile only inside their
  staged consumer tree. Packed NodeNext/Node16/Bundler and authorization compiler
  file lists and runtime entry lists were inspected and left unchanged.
- All repaired reads remain inspection-only: negative diagnostic attribution,
  publication hashes/byte integrity, declaration text, and document integrity.
  No inspection review became an executable-source review.
- The package-manifest resolve still maps exactly `express`, `mongoose`,
  `typescript`, `@types/node`, and `@types/express` to their `/package.json` files.
- The unchanged documentation compiler expression remains
  `entries.map((entry) => path.resolve(packageRoot, 'dist', entry))`, backed by
  exactly `index.d.ts`, `index.d.mts`, `advanced.d.ts`, and `advanced.d.mts`.
  Document inventories and three unique collection-recipe mappings are unchanged.
- The unused `PrivateDeepImport` type alias at its exact directive/site remains
  failure-only. Both emitted `private-exports.cjs` negative resolves retain their
  original virtual lines 37/41, exact ten/two subpath tables, and
  `assert.throws(() => require.resolve(...), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' })`
  shape. No negative rule, public entry, allowed edge, or exception was added.

## Commands and verification

All commands ran from repository root, in the foreground. Scratch ignore was
confirmed with `git check-ignore
_tmp-populate-source-target-20261109-DCsFHQ/GATE-04`. Every Node/pnpm invocation
used absolute checkout-local `TMPDIR` as shown below; replace the quoted
`<repo-root>` placeholder before reuse.

Historical scratch probes (not maintained or required by this summary):

```sh
TMPDIR='<repo-root>/_tmp-populate-source-target-20261109-DCsFHQ/GATE-04' node _tmp-populate-source-target-20261109-DCsFHQ/GATE-04/baseline-provenance.mjs
TMPDIR='<repo-root>/_tmp-populate-source-target-20261109-DCsFHQ/GATE-04' node _tmp-populate-source-target-20261109-DCsFHQ/GATE-04/verify-metadata.mjs
```

Results: baseline equality/94-diagnostic comparison passed; metadata-only and
unique-AST-match assertions passed. Their methods and observations are recorded
above rather than depending on ignored logs or snapshots.

```sh
TMPDIR='<repo-root>/_tmp-populate-source-target-20261109-DCsFHQ/GATE-04' pnpm --filter @web-ts-toolkit/access-router test:layers:check
TMPDIR='<repo-root>/_tmp-populate-source-target-20261109-DCsFHQ/GATE-04' pnpm exec vitest run --config _tmp-populate-source-target-20261109-DCsFHQ/GATE-04/vitest.checker.config.mjs
```

Both passed. Discovery emitted existing Vite configuration-native-loader warnings;
no warning suppression or configuration changes were made.

The standalone run used byte-identical copies of the maintained
`test/internal/test-layer-boundaries.unit.test.ts`, checker, and repaired policy
under `GATE-04/standalone-checker/packages/access-router/`. Its configuration set
that package as `root`, used only that checker test as `include`, and set
`environment: 'node'`, `setupFiles: []`, `globalSetup: []`,
`fileParallelism: false`, and `testTimeout: 30_000`; its Vite cache was also inside
GATE-04 scratch. This avoided `test/global-setup.ts` importing the shared package
build and kept the maintained tests' own Git-confirmed ignored fixture roots
inside this task area. All 76 cases passed, including private/compiler/mock edges,
finite generated modules, inspection/source separation, negative encapsulation,
installed/repository context separation, and exhaustive layer-set checks. No
checker regression is left unverified; no maintained checker test needed editing.

Additional checks passed:

```sh
TMPDIR='<repo-root>/_tmp-populate-source-target-20261109-DCsFHQ/GATE-04' pnpm exec eslint packages/access-router/scripts/test-layer-consumers.mjs
TMPDIR='<repo-root>/_tmp-populate-source-target-20261109-DCsFHQ/GATE-04' pnpm exec prettier --check docs/task-artifacts/access-router/20261108-populate-source-target-access/psa-04.md
git diff --check
```

The evidence destination is not ignored (`git check-ignore` returned 1). Local
links, preserved path references, scratch contents, and privacy-sensitive content
were reviewed; useful observations are curated here, not left solely in scratch.

## Limits and preservation

No package test script, package build, runtime Vitest suite, installed positive or
negative consumer compile, source typecheck, or full package acceptance was run by
GATE-04. TEST-02 retained sole shared-build/runtime ownership. Standard package
scripts must still be run serially for coordinated acceptance.

This is curated evidence, not a self-contained executable archive. Disposable
probes, snapshots, raw diagnostic logs, built files, caches, and installed
dependencies are omitted; reproducing checks requires the repository and its
dependencies. Historical scratch commands alone are not runnable from this
artifact. No private session identifiers or machine-local paths are preserved.
The coordinator owns the task record and bundle index; neither was overwritten.
GATE-04 has no running jobs.
