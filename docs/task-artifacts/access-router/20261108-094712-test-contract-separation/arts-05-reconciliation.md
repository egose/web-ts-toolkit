# ARTS-05 current implementation reconciliation

**Documentation/ledger reconciliation only; ARTS-06 acceptance is pending.**
The maintained contributor entrypoint is [test/README.md](../../../../packages/access-router/test/README.md).
This is a current implementation index, not a replacement for the **sealed historical
ARTS-01 [README](README.md) or [bundle manifest](bundle-manifest.json)**. No historical
report, ledger, hash or verifier is rewritten. An independent ARTS-06 reviewer can
publish a later `FINAL.md` without changing that baseline.

The [coordinator-owned task](../../../tasks/20261108-094712-access-router-test-contract-separation.md#task-arts-05-document-refactor-gates-and-reconcile-migration-evidence)
records status. ARTS-01–04 were accepted before this scope; ARTS-06 depends on
ARTS-04 **and ARTS-05** and must not start until this handoff is accepted. Nothing
here claims V3 completion, independent final review or 7,717 executed passes.

## Implementation and evidence index

| Stage | Authoritative records and how to read them now |
| --- | --- |
| ARTS-01 baseline | [Report](arts-01-report.md), [identities/environment](identities.json), [eight declarations](declarations.json), [public exports](public-surfaces.json), [classification](classification.md), [gap matrix](coverage-gaps.md). Plans/open gaps in these documents are historical, not the delivered status. |
| Original IDs/assertions/cases | [Planned file ledger](migration-ledger.json), [static preservation records](preservation-ledger.jsonl), [7,565 expanded runtime case IDs](runtime-cases.jsonl), [support/caller inventory](support-callers.json). |
| ARTS-02 executed migration | [Report](arts-02-report.md), [exact repairs/destinations](arts-02-preservation.jsonl), [path audit](arts-02-path-audit.json), [focused original case IDs](arts-02-focused-cases.jsonl), [verification](arts-02-verification.json), [supplement seal](arts-02-manifest.json). |
| ARTS-03 runner/guard | [Report](arts-03-report.md), [verification/discovery/59 guard case IDs](arts-03-verification.json), [tooling/evidence seal](arts-03-manifest.json), [read-only checkpoint](arts-03-verify-checkpoint.mjs), [maintained checker guide](../../../../packages/access-router/scripts/README.md). |
| ARTS-04 companions | [Report](arts-04-report.md), [coverage guide](arts-04-coverage.md), [34 gap/23 surface rows and 93 exact case IDs](arts-04-coverage.json), [focused verification](arts-04-verification.json), [historical supplement seal](arts-04-manifest.json). |
| ARTS-04 cleanup | [Cleanup report](arts-04-cleanup.md), [exact edits/body/case checks](arts-04-cleanup-verification.json), [current exporter seal](arts-04-cleanup-manifest.json). **Only** the installed-export test file's old ARTS-04 identity is superseded; its two cases are unchanged. |
| ARTS-05 documentation audit | [Report](arts-05-report.md), [minimal verification manifest](arts-05-verification.json). No copied source tree or duplicate giant inventory. |

## Every original file, case and assertion

Stable **F001–F248** IDs join the planned ledger to the executed ARTS-02 ledger:
**211 runnable files moved whole** to 97 contracts / 64 invariants / 50 internal;
**37 support files** have explicit destinations. There were **no splits,
retirements or replacements of originals**. Every original group/assertion/table/
fixture/setup/cleanup inherits its file's executed `to` path. New guard and public
companion cases are additive, not substitutes for those originals.

ARTS-05 freshly compared the delivered files to ARTS-02 hashes and used the frozen
verifier's exported `restoreOriginal`/`analyze` functions to reverse **only 1,093
exact, reasoned UTF-16-span repairs**. For **all 248 files**, the restored text is
byte-equal to its Git baseline; full AST/body/assertion/parameter/directive and
top-level-statement records match ARTS-01. Current group title expressions/lines
and negative directives also match originals. No blanket literal exclusion or
count-only normalization was used.

The records cover **2,615 groups / 2,246 static case declarations**, **11,254
assertion-looking call sites**, **849 parameterizations**, **411 directive/diagnostic
lines** and **4,245 top-level statements**. The proof is exact bytes and recorded
nodes/values, not these totals: full-file/statement hashes protect referenced
tables, dynamic case builders, expected values, generated source and cleanup.

All **7,565 original runtime case IDs** resolve to those unchanged files. Each
baseline ID is rechecked as SHA-256 of compact JSON
`[originalPath, fullTitle, line, column, titleOccurrence]`; all statuses were passed
in ARTS-01. There are **7,556 unique file/full-title pairs**, with nine excess
duplicate titles explicitly occurrence-qualified. All original title expressions
and parameter graphs remain unchanged by the byte/AST comparison. This preserves
the mapping; it does **not** rerun dynamic expansion or claim fresh original-runtime
results. The **1,145 ARTS-02 focused rows** exactly match their original baseline
IDs and full records.

The unchanged ARTS-03 checkpoint was actually executed read-only in ARTS-05. It
verifies the **248 ARTS-02 destinations**, **152 source files**, complete **eight-file
declaration inventory**, package metadata/dependencies/export maps and ESM/CJS name
sets (**46 root / 48 advanced / 6 processors**), plus all **10 ARTS-03 tooling
files** and its earlier evidence. The only original non-test exceptions remain
the exact reviewed `package.json` test scripts and `vitest.config.ts` shared-settings
import; 184 of 186 protected non-test inputs remain byte-identical to baseline.
No fresh build was performed: these are current built-output identity checks, not
ARTS-06's required freshly rebuilt declaration comparison.

All **34 historical bundle files** also match their before-ARTS-05 hashes and their
applicable manifest chain. Cleanup's exporter edits reverse exactly to its historical
ARTS-04 hash; the other nine ARTS-04 files match the original seal. The new maintained
test README is deliberately outside those historical checkpoints.

## Support callers and active generated inputs

The original [support inventory](support-callers.json) is reconciled through
[ARTS-02's executed path audit](arts-02-path-audit.json), not historical line-number
references treated as current paths. All 37 destination paths and listed maintained
caller paths exist. Exact original/destination identities preserve its **1,881 paired
module edges**, 16 root-derivation repairs and compiler/runtime source lists; the
16 repaired expressions are still present. The 25 active installed-consumer sources
also freshly match their recorded package-name-normalized hashes.

| Disposition | Current paths / callers and boundary |
| --- | --- |
| 25 active consumer inputs + four public helpers | `packages/access-router/test/support/public/`; current strict/packed/docs/compiler/runtime callers remain mapped. The [maintained finite consumer policy](../../../../packages/access-router/scripts/test-layer-consumers.mjs) contains exactly those 25 original filesystem-fed inputs. Ordinary imported helpers are traversed too. |
| F060 global setup | [test/global-setup.ts](../../../../packages/access-router/test/global-setup.ts), unchanged path/bytes. Registration now lives in [vitest.shared.ts](../../../../packages/access-router/vitest.shared.ts), imported by all four configs; the ARTS-02 record's old direct config ownership is historical. |
| F200 Mongo setup | [test/setup.ts](../../../../packages/access-router/test/setup.ts), unchanged path/bytes, including the two unchanged `access-router-deco` callers. No downstream test/build was required. |
| Four private helpers | `packages/access-router/test/support/private/`: reference copy builders, owned-stage and write-output fixtures. Their lower-layer callers stay intact; contracts cannot use them. |
| F002 private-stable CRUD fixture | [test/access-router-crud-fixture.ts](../../../../packages/access-router/test/access-router-crud-fixture.ts), unchanged path/bytes for [the benchmark caller](../../../../scripts/benchmarks/access-router-crud.mjs) and internal tooling. Not a public-support exception. |
| F190 private-dormant legacy types | [support/private/service-authorization.types.fixture.ts](../../../../packages/access-router/test/support/private/service-authorization.types.fixture.ts), byte-identical and uncompiled, with old relative imports intentionally preserved. Its stale header/removed successful examples are not active passing coverage. No activation, repair or deletion. |

The three collection recipe imports from F115 still resolve to **exact unique
MIGRATION partial bodies** (`rawBefore`, `presentationSubset`, `currentList`), not
unresolved-import exemptions. The four additive ARTS-04 support files remain sealed
public fixture/installed-probe inputs; cleanup owns only its allocated exporter root.
ARTS-05 also ran the maintained **static graph audit** directly: **137 physical
files / 237 parsed modules, zero errors**, including setup, generated inputs and
docs. No Vitest contexts/aliases were rediscovered here; their configurations and
previous actual discovery evidence remain sealed. This does not execute generators
or replace their positive/negative installed compiles.

## Required public matrix reconciled

[ARTS-04 coverage JSON](arts-04-coverage.json) joins **34 required gap rows** (16 MODE
tuples + 18 other groups) to **93 unique passed companion IDs**, each mapped once.
All row IDs, ceilings, current case locations, case hashes and retained public-file
IDs were checked. Its **23 distinct surface rows** reference valid retained public
contracts and known additive groups; none substitutes lower-layer/private evidence.
All **97 original public files** and their baseline counts/hashes remain mapped.
No required row is unresolved in this bounded reconciliation.

Case definition lines still resolve in the sealed current sources. Recorded Vitest
columns (notably `.each` source-map locations) remain reporter metadata in the exact
case IDs, not newly inferred TypeScript AST-start offsets or rerun locations.

- MODE's 16 cases execute **96 primary operations** (READ, LIST, CREATE, UPDATE,
  UPSERT-create, UPSERT-update). Together with TARGET 8, CAPTURE 7, FALLBACK 4 and
  DETACH 8, these are **43 mode-orthogonal cases**. The remaining named groups have
  **50 cases**. The 94-case ceiling is not a quota or full Cartesian requirement.
- Actual acquisition is public middleware/router/request service acquisition with
  real Mongo. Targets independently vary READ/LIST, write branches check stored
  effects/native detachment, and metadata/DTO/parser/processor/admission/helper
  companions avoid private constructors, package-method spies and injected budgets.
- [Grounded recipe clarifications](arts-04-coverage.md#bounded-recipe-details-and-retained-obligations)
  remain explicit: genuine cumulative overflow/draining with an admitted held
  callback; post-save selected-scope failure with the write committed; invalid
  **global placement** of populate flags, not an invented enum rejection.
- EXPORT's runtime-name checks do not prove blocked subpaths by themselves. Retained
  packed failure-only resolution cases and actual strict/packed positive/negative
  compiles remain linked evidence. Same-build/private-chunk byte checks are not a
  permanent private declaration-layout promise.
- The cleanup supplement controls the current installed-export file hash. Both
  exporter case IDs, titles and locations are identical and passed again after
  teardown; these are the same two cases, **not 95 additive cases**.

## Inventory, actual passes and pending gates

The current **static inventory** matches ARTS-04/cleanup's executed disjoint/exhaustive
Vitest discovery: **218 = 103 / 64 / 51 files**. ARTS-05 did not run new discovery or
any runtime suite. The following case totals are **EXPECTED, NOT EXECUTED FULL RUNS**:

| Layer | Current files | Original baseline cases mapped | Additive cases | Prospective cases |
| --- | ---: | ---: | ---: | ---: |
| contracts | 103 | 3,065 | 93 public companions | **3,158 expected** |
| invariants | 64 | 3,078 | 0 | **3,078 expected** |
| internal | 51 | 1,422 | 59 guard regressions | **1,481 expected** |
| **default union** | **218** | **7,565** | **152** | **7,717 expected** |

Actual earlier runtime evidence is only what the sealed reports say:

| Executed stage | Passed selection; not additive across repeated runs |
| --- | --- |
| ARTS-01 | Full pre-migration baseline: **7,565 / 211 files**. |
| ARTS-02 | Move-sensitive focused originals: **1,145 / 26 files**. |
| ARTS-03 | Final layer-command smoke selections: **105 / 4 files**, including **59 guard regressions**. |
| ARTS-04 | New public companions: **93 / 6 files**. |
| ARTS-04 cleanup | Repeated exporter selection on current identity: **2 / 1 file**. |
| ARTS-05 | Read-only identity/assertion/support/matrix and documentation checks; **no runtime tests**. |

ARTS-06 still owns **all complete standalone contracts/invariants/internal runs and
the exhaustive default run**, fresh package typecheck/build/declaration comparison,
scoped lint, guard/discovery review and independent actual-diff/fixture acceptance.
Use [V3's exact sequential commands](../../../tasks/20261108-094712-access-router-test-contract-separation.md#v3--final-commands-sequentially),
not a count formula or focused pass in their place. Prerequisites and serial-build/
repo-local `TMPDIR` rules are in the [maintained guide](../../../../packages/access-router/test/README.md#prerequisites-and-safe-execution).
No root/grouped/downstream suite, unrelated CLI build or performance campaign is needed.

The [ARTS-05 manifest](arts-05-verification.json) records only checks actually run,
including documentation links/anchors, structured data, privacy, ignore status,
whitespace and before/after identities. Raw reporter logs, dependency/build/consumer
trees, Mongo data and disposable audit scripts are omitted; the old ledgers and Git
objects retain the comparison inputs. This is not a hermetic reproduction bundle,
universal compatibility proof, speed claim or final full-pass table.
