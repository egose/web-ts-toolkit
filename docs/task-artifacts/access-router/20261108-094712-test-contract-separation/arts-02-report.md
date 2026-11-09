# ARTS-02 mechanical migration

**Complete for ARTS-02's scope:** all **211 original runnable files** moved whole
to **97 contracts / 64 invariants / 50 internal**. All **37 support files** are
accounted for; 34 moved and three stable root-path exceptions stayed byte-identical.
No production, package/configuration, runner-script, downstream or benchmark-caller
change was necessary. The coordinator-owned [task](../../../tasks/20261108-094712-access-router-test-contract-separation.md)
and all 15 frozen ARTS-01 evidence files were left untouched.

## Executed map and preservation

- [Executed preservation ledger](arts-02-preservation.jsonl): all 248 original IDs,
  old/new paths, baseline/new byte and AST hashes, normalized-new AST hashes, and
  every exact before/after repair with UTF-16 spans and rationale. The original
  [planned ledger](migration-ledger.json) remains historical and unchanged.
- [Read-only verifier](arts-02-verify-preservation.mjs) reconstructs originals from
  `fe50475fd026d70aad52bc54b1c6d3d41dbc885b`, reverses **only 1,093 precisely logged
  repairs**, then checks complete byte equality and every original AST/token hash.
  It also checks all **2,615 groups / 2,246 static cases**, **11,254 assertion call
  sites**, **849 parameterizations**, **411 directive/diagnostic lines**, and
  **4,245 top-level statements** against the frozen preservation records. Full
  file/statement/body hashes cover tables, expected values, closures, generated
  strings and setup/cleanup, not just those counts. No blanket string exclusion.
- No split, retirement, matcher/value/table change, skip/todo/only, timeout change,
  diagnostic relaxation or new public companion. Raw negative-directive text and
  line numbers, group titles/locations and parameter expansion identities remain
  unchanged. [Focused expanded cases](arts-02-focused-cases.jsonl) reuse their
  original occurrence-qualified baseline IDs, including duplicate titles.
- All **186 protected non-test inputs**, including all 152 source files and the
  existing recursive Vitest/config/build inputs, match baseline bytes.

Allowed repairs were module/path relocation, two approved `src/index` → actual
`dist/index.mjs` switches, and 32 public-equivalent **type-only** import switches
(29 advanced, three root; no binding/type weakening). Contract-only control lists
now use the public migration helper's independent documented literals: all ten
retired keys followed by all four mode keys, in exactly the original order.
No private constructor adapter, authority fabrication, package mock or source alias
was introduced. Lower-layer source-versus-built module identities were preserved.

## Fixture/path audit

[Path/caller evidence](arts-02-path-audit.json) pairs all **1,881 original module
edges**, verifies active relative targets and records **16 explicit directory/URL
root derivations** resolving to the same package/workspace/doc targets, without
cwd assumptions. It maps all 37 support files and maintained/generated callers.

- `test/access-router-crud-fixture.ts`, `test/setup.ts`, and configured
  `test/global-setup.ts` retain exact paths **and bytes**. Benchmark seals and the
  two read-only `access-router-deco` setup callers therefore need no edits.
- Compiler/runtime fixture reads, dynamic input directories and import-replacement
  prefixes moved together. Generated consumer filenames, imported bindings,
  compiler options and unsuppressed negative-diagnostic obligations stayed intact.
  All **25 active installed-consumer source inputs** are byte-identical after the
  respective old/new package-name replacement. The three collection recipe imports
  still map to their exact extracted MIGRATION blocks.
- `service-authorization.types.fixture.ts` moved byte-identically to private
  support and remains **dormant**. Its stale successful legacy examples and old
  relative imports are deliberately not repaired, compiled, deleted or counted as
  passing evidence.

## Actually executed verification

Commands ran sequentially from repository root with absolute
`TMPDIR='<repo-root>/_tmp-arts-02-20261108-110811'` (replace `<repo-root>` before
execution); `git check-ignore` confirmed that fresh scratch directory is ignored.
The [verification manifest](arts-02-verification.json) preserves **exact argv**,
timestamps, exits, per-file counts/identities and declaration inventory.

| Check | Result | Command elapsed |
| --- | --- | ---: |
| `pnpm --filter @web-ts-toolkit/access-router typecheck` | Pass, including existing filtered/transitive build | 34.093 s |
| `node …/verify-baseline.mjs --git-baseline --declarations` | Frozen baseline verified; complete eight declarations byte-identical after fresh build | 4.849 s |
| `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts` plus the 26 exact paths/reporting argv in `commands[label=focused]` | **1,145 tests / 26 files passed**, zero failures/skips/todos | 1,094.903 s |
| `pnpm --filter @web-ts-toolkit/access-router exec vitest list --config vitest.config.ts --filesOnly --json=…` | Exactly 211 approved destination paths under unchanged recursive include | 1.278 s |
| `pnpm exec eslint packages/access-router/test packages/access-router/vitest.config.ts` | Pass | 7.151 s |
| `node …/arts-02-verify-preservation.mjs` | All file/AST/assertion/directive/declaration/baseline seals passed | 9.547 s |

The focused run selected complete files, not individual cases:

| Layer | File (under `packages/access-router/test/<layer>/`) | Passed |
| --- | --- | ---: |
| contracts | `strict-consumer-types.test.ts` | 49 |
| contracts | `packed-consumer-compatibility.test.ts` | 13 |
| contracts | `nested-operation-access-consumer-types.test.ts` | 3 |
| contracts | `owned-authorization-types.test.ts` | 2 |
| contracts | `documentation-examples.test.ts` | 92 |
| contracts | `tree-shaking-smoke.test.ts` | 3 |
| contracts | `authorization-fast-path-runtime.integration.test.ts` | 16 |
| contracts | `owned-authorization-modes.integration.test.ts` | 29 |
| contracts | `query-snapshot-options.integration.test.ts` | 20 |
| contracts | `service-authorization-direct.integration.test.ts` | 15 |
| invariants | `service-authorization-boundary-admission.contract.test.ts` | 68 |
| invariants | `service-authorization-migration.contract.test.ts` | 52 |
| invariants | `service-authorization-context.unit.test.ts` | 64 |
| invariants | `write-output-modes.unit.test.ts` | 47 |
| invariants | `authorization-fast-path-runtime.unit.test.ts` | 42 |
| invariants | `service-authorization-mutations.integration.test.ts` | 8 |
| internal | `export-contract.test.ts` | 49 |
| internal | `strict-typecheck.test.ts` | 2 |
| internal | `documentation-authorization-guidance.test.ts` | 24 |
| internal | `output-publication-fusion-withdrawal.unit.test.ts` | 11 |
| internal | `access-router-crud-driver.unit.test.ts` | 3 |
| internal | `access-router-crud-harness.unit.test.ts` | 434 |
| internal | `access-router-crud-v2.unit.test.ts` | 68 |
| internal | `access-router-crud-work.unit.test.ts` | 2 |
| internal | `service-output-preparation.unit.test.ts` | 13 |
| internal | `owned-authorization-work.unit.test.ts` | 16 |

These include real Mongo/public fixture paths, strict Bundler/NodeNext/Node16
positive/negative compiles, actual packed/scoped-artifact consumers and shipped
docs, ESM/CJS imports, and existing bounded benchmark driver/harness/tooling tests.
The existing prebuilt CLI requirement was retained; no unrelated CLI was built.
Discovery emitted only the existing nonfatal future-native-config warning; it was
not suppressed. No runtime failure or environment/pre-existing-failure claim arose.

## Handoff and limits

No ARTS-02 blocker remains. This is **not** final suite/boundary acceptance:
ARTS-03 still owns maintained layer commands/checking; ARTS-04 owns additive public
companions; ARTS-05/06 own final reconciliation/review and exhaustive runs. The
baseline's **7,565** cases map to the new layers unchanged; only the **1,145** above
were rerun here. No full-package, root/grouped/downstream suite or new performance
campaign ran, and no speed/whole-consumer compatibility claim is made.

The supplement's [manifest](arts-02-manifest.json) seals only new ARTS-02 evidence;
it does not rewrite the shared baseline bundle index/manifest. JSON/JSONL parsing,
references, privacy, nonignored evidence destinations and whitespace were reviewed.
Raw logs/full reporter JSON, dependency trees, generated consumers/tarballs,
binaries and Mongo data remain disposable and are omitted. Baseline Git objects,
the recorded TypeScript version and delivered tree suffice for the read-only
preservation verifier; runtime reproduction additionally needs the recorded
dependencies, Mongo/installation access and existing prebuilt CLI prerequisite.
No further subagent was spawned; no commit, reset or unrelated deletion occurred.
No queued/background work remains.
