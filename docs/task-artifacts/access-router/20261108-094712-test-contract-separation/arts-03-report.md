# ARTS-03 layer commands and dependency guard

**Complete for ARTS-03 only.** Default tests remain exhaustive; three independent
layer commands and a fail-closed discovery/dependency preflight are delivered.
No original migrated test/support file changed. The coordinator-owned
[task](../../../tasks/20261108-094712-access-router-test-contract-separation.md),
all 22 earlier bundle files, production sources, exports and dependencies were
left untouched. This is not ARTS-06/full-suite acceptance.

## Delivered commands and runner behavior

Under `packages/access-router/`:

- `test:contracts`, `test:invariants`, `test:internal`: the existing filtered
  transitive build, then the boundary checker, then one `vitest run` using the
  corresponding package-local layer config.
- Default `test`: the same build **once**, checker, and **one exhaustive**
  `vitest run --config vitest.config.ts`; it does not run the three layers as
  separate test executions. File arguments filter only the requested runtime run.
- `test:layers:check`: checker only; run after the filtered build when used alone,
  because actual entry/declaration examples are built inputs. Test entrypoints put
  the checker after their build so normal fresh-checkout tests remain usable.

`vitest.shared.ts` shares Node, `test/global-setup.ts`, `fileParallelism:false`
and `testTimeout:30000`. Includes are explicit and disjoint in each config;
there is no merge-array concatenation, parallel-project redesign, suppression
flag or `passWithNoTests`.

Installed **Vitest 4.1.11** discovery uses `createVitest` /
`globTestSpecifications`, sequentially closing all four contexts without executing
test/setup modules. Actual default discovery, the package's `*.test.ts` inventory,
and layer union match exactly: **212 files = 97 contracts + 64 invariants +
51 internal**, with no overlap, omission, orphan, support runnable or empty layer.
The additional internal file contains **59 new guard cases**. The unchanged
7,565-case original baseline plus these cases implies an expected final total of
7,624, **not an executed full-run result**.

## Guard and reviewed boundaries

Maintained code: `scripts/check-test-layers.mjs`, readable finite input/review data
in `scripts/test-layer-consumers.mjs`, and
`test/internal/test-layer-boundaries.unit.test.ts`. Detailed behavior and limits
are in [the maintained checker guide](../../../../packages/access-router/scripts/README.md).

The current public closure passes: **127 physical test/support/setup files /
227 parsed modules**, including generated consumers and documentation examples.
TypeScript parses type/runtime imports, re-exports, import types, literal
require/dynamic import, common loader aliases, configured setup and transitive
public support. Traversal stops at actual root/advanced/processors entries.
Source aliases, private fixtures/tests/chunks/deep imports and unresolved/computed
local edges fail with locations and dependency chains. Vite/TS aliases are checked.

Filesystem consumer inputs, emitted module strings/joined arrays, compiler file
lists and actual document/JSDoc module contexts are audited, rather than treating
all expected-message/prose strings as imports. The three collection recipe imports
resolve only to their exact, uniquely extracted MIGRATION partial bodies.
Complex existing generators and inspection reads have entry-scoped locations,
exact expressions, reasons and finite source inventories, not contract-file hashes
or blanket file exemptions. Document-generator input tables are reconciled too.

Negative exceptions are deliberately narrow:

1. The single unused `PrivateDeepImport` type alias at public service consumer
   fixture line 524, paired with its exact diagnostic directive. Runtime imports,
   import bindings, local uses, and consuming/re-exporting that negative alias from
   another module are rejected. Existing installed compiles still prove failure.
2. Two locations inside emitted `private-exports.cjs`: exact finite subpath tables,
   immediate `assert.throws(() => require.resolve(...),
   { code:'ERR_PACKAGE_PATH_NOT_EXPORTED' })` shape, never successful imports or
   private exports use. Changing the table/loader/assertion fails regression tests.

Only stable `test/setup.ts` and `test/global-setup.ts` are public root support.
The root CRUD benchmark fixture and dormant legacy compiler fixture remain private
and cannot enter this graph. Consumer Mongoose/model/native spies and application
hooks remain allowed; common package mocks, prototype/acquired-service method
patches and known implementation-method spies are rejected. Supported raw method
calls/default setters are not incorrectly equated with spying on their dispatch.

**Limits:** no sandbox or semantic-independence proof is claimed. Novel loader,
filesystem, compiler/process APIs, reflection/destructured mock aliases, arbitrary
object/closure dataflow and transformations inside reviewed document pipelines
still require manual review of producers and compiler/runtime file lists. Static
checks cannot replace positive/negative installed compiles or full runtime layers.

## Actually executed verification

All commands were foreground/awaited and sequential, from repository root, using
fresh Git-confirmed ignored `TMPDIR='<repo-root>/_tmp-arts-03-20261108224050'`.
Replace `<repo-root>` before reproduction. Node was **v26.12.1** and TypeScript
**6.0.3**. [Verification JSON](arts-03-verification.json) records exact argv,
exits, elapsed times, selected files/case identities, actual discovery sets/digests
and checkpoint results; raw logs/full reporter JSON are omitted.

| Executed command (reporting argv in verification JSON) | Result |
| --- | --- |
| `pnpm --filter @web-ts-toolkit/access-router typecheck` | Pass, including normal five-package filtered build |
| `pnpm --filter @web-ts-toolkit/access-router test:contracts test/contracts/processors-path-hardening.test.ts` | **35 cases / 1 file passed** |
| `pnpm --filter @web-ts-toolkit/access-router test:invariants test/invariants/owned-authorization-records.unit.test.ts` | **9 cases / 1 file passed** |
| `pnpm --filter @web-ts-toolkit/access-router test:internal test/internal/test-layer-boundaries.unit.test.ts test/internal/strict-typecheck.test.ts` (sealed run) | **61 cases / 2 files passed**: 59 new guards + both existing compiler-tooling tests |
| `pnpm --filter @web-ts-toolkit/access-router test:layers:check` | Pass; actual 212-file union and complete public graph; repeated through every layer entrypoint |
| `pnpm exec eslint packages/access-router/src packages/access-router/test packages/access-router/scripts` plus all five explicit `vitest*.ts` paths | Pass; final scoped lint rerun after guard hardening |
| `node …/arts-03-verify-checkpoint.mjs` | All original bytes, protected inputs, declarations and runtime exports preserved |

The retained final smoke selections total **105 cases / four files**, zero
failures/skips/todos. Earlier development runs are recorded separately, not added
to that total: the first recorded internal smoke failed in preflight before
build/tests because an overbroad in-development heuristic confused public raw
calls/returned data with method patching. The heuristic was corrected without
editing originals, and the next run passed 55 cases; subsequent additive guard
cases reached the final 61. Exploratory checker runs also exposed a syntax typo
and missing finite inventories, fixed before acceptance. None is labelled a
pre-existing package failure. Existing nonfatal Vite future-native-config warnings
remain visible; no warning suppression was added.

No full package/layer, root/grouped/downstream test or new benchmark campaign ran.
The unchanged strict/packed fixture compiles were not rerun wholesale in ARTS-03:
their inputs remain exact ARTS-02 bytes, while the new guard and existing source
compiler-boundary tests were exercised. Final full runs remain ARTS-06's gate.

## Preservation and grouped-run safety

[Read-only checkpoint verifier](arts-03-verify-checkpoint.mjs) checks all **248
original migrated files** against ARTS-02's exact destination hashes. Consequently
their sealed full bytes/AST, assertions, expected values, parameter tables,
directives and setup/cleanup remain identical; this is not an aggregate recount.

All **152 source files**, complete **eight-file declaration inventory**, manifest
runtime export maps and all non-script package metadata/dependencies remain
unchanged. Actual ESM **and CJS** runtime export-name sets still match baseline:
**46 root / 48 advanced / 6 processors**.

Of ARTS-01's 186 protected non-test inputs, **184 are byte-identical**. The two
intentional exceptions are exactly `package.json`'s reviewed test scripts and
`vitest.config.ts`'s shared-settings import; manifest metadata otherwise compares
equal to Git baseline. The existing config and eight new maintained tooling files
are sealed separately, not hidden by editing the historical ARTS-02 verifier.
All 22 prior evidence files are independently rehashed unchanged in the new
[supplement manifest](arts-03-manifest.json).

Static review of `scripts/test-groups.mjs:25–35,73–88` confirms no new compiled-read
target or build closure. The default still rebuilds only its dependency closure;
packed consumers retain the same three prebuilt CLI candidates. Checker discovery
and dependency inspection are read-only. Serial files and shared-dist scheduling
stay unchanged. No root/CI override edit or grouped runtime test was necessary.

JSON, references, scratch/durable ignore status, privacy and whitespace were
reviewed. Dependencies/build outputs, temporary fixture graphs, Mongo data, raw
logs and disposable generators are not archived. Git baseline, frozen earlier
ledgers, the delivered tree and recorded tools reproduce the checkpoint; this is
not a hermetic runtime bundle or independent final review.

**Handoff:** no ARTS-03 blocker remains. Coordinator may review/accept this scope;
ARTS-04 companions, ARTS-05 guide/index reconciliation and ARTS-06 full acceptance
remain separate. No shared-task edit, commit, reset, original assertion change,
further subagent or queued/background work occurred.
