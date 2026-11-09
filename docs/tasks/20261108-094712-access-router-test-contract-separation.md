# Access-router: separate public contracts from internal tests

Created: 2026-11-08 09:47:12 PST (`20261108-094712`, generated with `date`).

Status: completed. All six tasks delivered and independently accepted on 2026-11-09.
ARTS06-F1 is closed; no production or consumer-contract change was introduced.

## Objective and authorization

Establish an independently runnable, implementation-independent public-contract
suite for `packages/access-router`. Future internal refactors should be able to
keep these tests unchanged while reorganizing implementation-specific tests.
Passing contracts is strong compatibility evidence, **not a proof that every
possible consumer behavior is unchanged**. All test layers remain required for
final acceptance.

The user requested another plan review and a task file first, then explicitly
authorized implementation by subagents. No subagent, build, runtime test, typecheck
or benchmark ran during the initial planning review. Execution results are recorded
separately below; production changes remain out of scope.

This is a new testing-architecture phase, not a reopening of the completed
[internal readability cleanup](20261107-202137-access-router-internal-readability-cleanup.md)
or [performance cleanup](20261105-084939-access-router-performance-cleanup.md).
Do not restore withdrawn optimizations or rewrite their historical evidence.

## Review findings and limits

Reviewed revision: `fe50475fd026d70aad52bc54b1c6d3d41dbc885b`; the working tree was
clean before this document. Read the package manifest/exports, Vitest and typecheck
configuration, representative contract/internal/invariant tests and fixtures,
maintained benchmark callers, grouped-test access overrides and prior acceptance.
Searched related task documents for an existing test-separation effort; none was
identified in that bounded search. A full assertion/dependency classification is
ARTS-01, not a claim made by this review.

Fresh read-only inventory: **211 runnable `*.test.ts` files and 37 other test/support
files**. A simple import scan found 131 test files with direct `/src/` imports,
119 with direct `/dist/` imports, and 12 of 17 contract-named files with direct
source imports. These sets overlap. Import counts are classification signals, not
proof that those assertions are private: `src/index` can expose supported behavior,
and a test importing `dist` can still patch private methods or use private fixtures.

| Finding                                                       | Inspected evidence                                                                                                                                                          | Planning decision                                                                                                                |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Current runner mixes every test kind                          | `packages/access-router/vitest.config.ts:3–10`, `package.json:58–62`                                                                                                        | Keep the default all-tests command; add explicit, disjoint layer commands. Preserve serial files and shared setup.               |
| Contract labels do not ensure black-box tests                 | `test/export-contract.test.ts:48–86` mixes built exports and response-pipeline internals; `test/service-logging-contract.unit.test.ts:4–7` imports private helpers/fixtures | Classify assertion groups and fixture dependencies, not filenames or unit/integration suffixes.                                  |
| Public behavior is exercised through private scaffolding      | `test/access-router-crud-fixture.ts:4–11`; `test/owned-stage-test-fixture.ts:4–17,108–125` directly construct services/stages                                               | Preserve these tests below the public layer; obtain services through supported runtime/router/request APIs in contract fixtures. |
| Safety and efficiency checks are not all public promises      | `test/owned-authorization-work.unit.test.ts:26–108`; `test/no-work-output-scheduling.unit.test.ts:32–100`; `test/access-router-crud-work.unit.test.ts:19–54`                | Keep internal invariants distinct; do not freeze helper names, exact work counts or incidental microtask turns as public API.    |
| Moving files can break more than imports                      | `test/strict-consumer-types.test.ts:12–13,119,170`; `test/packed-consumer-compatibility.test.ts:100–101,479–500`; `scripts/benchmarks/access-router-crud.mjs:13`            | Audit package-root calculations, loaded/generated fixtures, documentation extraction and benchmark consumers before moves.       |
| Package source typecheck is not consumer-fixture verification | `tsconfig.typecheck.json:9`; strict/packed consumer suites invoke separate compilers                                                                                        | Keep positive and negative installed-consumer compiles in contracts; a source-only typecheck cannot replace them.                |
| There is already a comprehensive historical pass              | [ARRC-06 review](../task-artifacts/access-router/20261107-202137-readability-cleanup/arrc-06-review.md#fresh-final-verification)                                            | Its 7,565 tests / 211 files are historical, not a newly executed baseline for this migration.                                    |

All `test/` references in this table are under `packages/access-router/`.
These are maintainability improvements/investigations, not confirmed production bugs.

## Reviewed design

```text
packages/access-router/
  test/
    contracts/        # Stable supported consumer behavior
    invariants/       # Internal safety, ownership, bounds and work safeguards
    internal/         # Helper/method/representation-specific checks; tooling tests
    support/public/   # Public-API-only fixtures, consumer source and setup
    support/private/  # Private fixtures; usable by invariants and internal tests
    README.md         # Classification and refactor rules
```

- Every runnable test file has exactly one layer. Unit versus integration is an
  orthogonal distinction; retain useful existing suffixes and test titles.
- **Contracts:** published `.`, `./advanced` and `./processors` exports; supported
  runtime/router/request-acquired services; options/defaults; responses and errors;
  supported hooks/receivers; documented ownership, denial and resource-limit behavior;
  installed ESM/CJS imports and consumer TypeScript usage. A helper can implement a
  public contract without being part of that contract.
- **Invariants:** internal authority isolation, stage/publication lifetime, resource
  accounting, failure draining, concurrency and work safeguards. Private imports
  are permitted. Where a safety rule also has a public effect, cover that effect in
  contracts too. Exact counters/internal layouts remain implementation-sensitive.
- **Internal:** algorithms, private methods, cache/preparation/representation shape,
  implementation-specific scheduling and test/benchmark tooling. Private imports
  are permitted. Important safety assertions must not be demoted solely to make a
  refactor's compatibility check pass.
- Mixed tests are split only when responsibility/setup genuinely separates. It is
  also valid to retain the complete original test below contracts and add a focused
  public companion. Neither option permits losing or weakening assertions. Record
  the decision; do not duplicate the entire suite or cosmetically relabel it.
- Contract tests and their transitive test fixtures must use only supported package
  entrypoints. Actual built root/subpath entry files are acceptable for in-repo
  execution; installed-consumer cases must also verify real package-name resolution.
  No source alias, private deep import, declaration-chunk import, fabricated private
  authority, private-method patch or mocked implementation of the package under test.
  Stop dependency traversal at approved package entrypoints: their legitimate
  implementation imports are not test-boundary violations.
- Public fixtures can use Express, Mongoose, Supertest, supported application hooks
  and spies on consumer-owned boundaries. Preserve meaningful real-Mongo coverage;
  do not replace real integration with a mocked public-service return value.
- Export/encapsulation contracts may inspect manifests/declarations or assert a
  prohibited import fails. Narrow, reviewed negative-import exceptions must not
  allow successful use of private code. Generated consumer snippets/fixtures need
  boundary review too; a clean top-level import alone is insufficient.
- Do not promote all observable query traces, allocations, private declaration names
  or promise turns into permanent public promises. Document why hook multiplicity,
  query-side effects or scheduling is contractually significant where asserted.
  Public type tests check supported usage and negative diagnostics, not a permanent
  byte snapshot of generated private layout or hashed declaration chunk names.
- Existing root-level non-test fixtures may stay at stable paths when benchmark or
  consumer-fixture callers rely on them. Classify and list these exceptions; private
  legacy fixtures are never importable by public support/contracts.

## Scope and compatibility rules

1. Change tests, test-only fixtures/configuration/scripts and contributor testing
   guidance only. **No `src/` changes, public API additions, dependency changes,
   authorization changes or consumer code/configuration migration.** Package script
   additions are development tooling, not supported runtime API changes.
2. Preserve every original test/fixture's behavioral assertions, negative checks,
   parameter rows, expected values and relevant setup/cleanup. Permit mechanical
   path changes, public-equivalent setup and documented test splits; no deleted cases,
   weaker matchers, new skips/todos/only, relaxed types, swallowed failures or larger
   timeouts merely to mask a regression. Counts alone do not demonstrate preservation.
3. Map assertions to old/new locations in a migration ledger, including parameterized
   identities and splits/companions. Keep unsupported internal assertions below the
   public boundary rather than changing their meaning. Do not retire tests in this phase.
4. Keep default `pnpm --filter @web-ts-toolkit/access-router test` exhaustive, in a
   single Vitest execution after the existing filtered/transitive build. Add
   standalone layer commands, not a replacement contract-only default. Missing or
   empty suites must fail; layers must not overlap or omit future tests.
5. Preserve Node environment, global runtime cleanup, `fileParallelism: false`,
   existing timeout behavior and safe shared-`dist` access. Do not run builds/test
   commands concurrently in this checkout. No parallel Vitest-project redesign is
   needed for this separation.
6. Test only `access-router`. Necessary transitive builds and existing scoped
   publication/consumer fixtures are allowed; no root/grouped/downstream test suite,
   broad release build, new benchmark campaign or runtime-speed claim. Preserve the
   existing prebuilt CLI fixture requirement rather than building unrelated CLIs.
7. This migration changes no production code, so rebuild and compare the complete
   declaration inventory against this phase's fresh baseline. Keep this one-off
   migration check separate from the reusable semantic public-type contract gate.
8. Use fresh ignored repository-local `_tmp*` work directories, confirm with
   `git check-ignore`, and set absolute `TMPDIR` at runtime. Shared records use
   repo-relative paths or quoted `<repo-root>` placeholders, replaced before execution.
   Preserve curated evidence under
   `docs/task-artifacts/access-router/20261108-094712-test-contract-separation/`
   according to [artifact conventions](../task-artifacts/README.md). No raw scratch
   trees, dependencies, private session identifiers or machine-local paths.

## Tasks and order

Priorities: P1 = compatibility/coverage gates; P2 = maintainability/workflow.
Execute sequentially after separate implementation authorization: fixtures, runner
configuration, scripts and the shared migration ledger overlap. If later delegated,
the coordinator owns this task/status file; use bounded handoffs and a final reviewer
who did not implement the migration. This is a proposed allocation, not a claim of
delegation already performed.

### Task ARTS-01: Freeze baseline and classify assertions against supported usage

Status: completed
Kind: investigation
Priority: P1 — an incorrect boundary can give false compatibility confidence.
Dependencies: none

Primary ownership: read-only `packages/access-router/test/`, manifest/exports,
README/MIGRATION, Vitest configuration and maintained fixture callers; new durable
classification/migration ledger and compatibility matrix.

Finding/references: the review table identifies mixed contract-named files, private
fixtures and path-sensitive consumers; classification remains unproven at assertion level.

Requirements:

1. Capture starting revision/diff, source/test/config identities, all declarations
   after a fresh build, and one fresh full package baseline with machine-readable
   per-file/case results. Record failures honestly; a historical pass is not a fresh run.
2. Classify every runnable file and relevant assertion group. For mixed files name
   public obligations, private dependencies and the approved split/retain-plus-companion
   decision. Identify all support/generated-fixture callers and path-sensitive reads.
3. Build a public-surface/behavior matrix from supported exports, README/MIGRATION
   and real callers: methods reachable via runtime/router/request services count even
   without a directly exported constructor. Include supported override seams, not
   every private member that happens to appear in a declaration.
4. Map all 16 READ/LIST/CREATE/UPDATE mode tuples, default/in-flight capture, related
   target READ/LIST independence, READ fallback, both UPSERT branches and both write
   modes' detachment. Mark private-only coverage as a public coverage gap, not a pass.
5. Bound and prioritize missing public scenarios for ARTS-04; do not demand a full
   Cartesian product of every API/option. Record ambiguity about a claimed public
   contract with evidence and a specific decision needed before migrating that case.

Acceptance criteria: every original test/support file is accounted for; the ledger
names destinations and preservation checks; the matrix distinguishes existing public
evidence, required companions and implementation-only guarantees. Baseline is verified
or task remains blocked on an explicitly identified prerequisite/failure.

Verification: V0/V1 below plus ledger/matrix review. No test moves in this task.

### Task ARTS-02: Mechanically separate tests and repair fixture paths

Status: completed
Kind: improvement
Priority: P1 — moving tests must not silently drop coverage or change test behavior.
Dependencies: ARTS-01

Primary ownership: `packages/access-router/test/` moves/imports/root calculations,
existing `vitest.config.ts` setup path if needed, and the migration ledger.

Finding/references: `strict-consumer-types.test.ts`, `packed-consumer-compatibility.test.ts`
and `export-contract.test.ts` derive roots from their current directory; benchmark
tooling also references `test/access-router-crud-fixture.ts` by a stable string.

Requirements:

1. Move public-eligible tests to contracts; keep mixed/private-coupled tests in their
   approved lower layer until companions/splits are ready. Do not put private fixtures
   into public support just to retain an existing contract filename.
2. Reorganize support only where useful. Preserve benchmark-consumed fixture paths
   where possible; any necessary maintained caller update is path-only and ledgered.
   Leave completed task/artifact documents unchanged as historical references.
3. Repair imports, package/workspace-root resolution, compiler fixture file lists,
   generated consumer sources, docs extraction and setup/cleanup registration. Do
   not make working-directory assumptions or alter installed negative diagnostics.
4. Keep the current recursive all-tests include exhaustive. Compare assertion/test
   AST or an equivalently reviewable preservation ledger, accounting explicitly for
   necessary path/setup edits and parameter expansion; totals alone are insufficient.

Acceptance criteria: all baseline test cases/assertions have retained destinations;
no runnable file is left unclassified; benchmark/consumer fixture references resolve;
focused move-sensitive integration, strict/packed types and tooling tests pass.

Verification: V2 focused checks using the unchanged default config; V4 preservation
review. New layer commands are delivered by ARTS-03, not assumed here.

### Task ARTS-03: Add fail-closed layer commands and dependency enforcement

Status: completed
Kind: improvement
Priority: P1 — independently runnable suites need enforceable, exhaustive boundaries.
Dependencies: ARTS-02

Primary ownership: `packages/access-router/package.json` scripts, package-local
`vitest*.ts` configuration, `scripts/check-test-layers.mjs` and tooling regression
tests under `test/internal/` (new paths are package-relative).

Finding/references: current `vitest.config.ts` has one include and shared setup;
`scripts/test-groups.mjs:25–35,73–85` records test-only compiled accesses and assumes
normal package tests rebuild their dependency closure.

Requirements:

1. Add proposed `test:contracts`, `test:invariants`, `test:internal` and
   `test:layers:check` scripts. Layer runs retain the filtered build prerequisite;
   default `test` still builds once and runs every layer once. Share settings and
   use explicit disjoint includes, not filename keywords or substring filters.
2. Check that all runnable files belong to exactly one nonempty layer, none live
   under support, and default/layer discovery sets have exactly the same union.
   Run this check in default/layer test entrypoints so existing CI cannot bypass it.
3. Parse dependency edges, including type imports, re-exports, literal require/import,
   configured setup files and transitive local support. Reject contracts reaching private source, private
   test fixtures, internal tests or unapproved built/declaration chunks. Diagnose
   computed/unresolved local imports; do not silently treat them as safe. Keep
   negative-encapsulation exceptions narrow, documented and regression-tested.
4. Include generated-consumer inputs and common mocks/private patch escape hatches
   in the audit; document static-analysis limits and retain manual review for dynamic
   source/filesystem behavior. Do not claim the checker proves semantic independence.
5. Add guard tests for valid public graphs, indirect/type/re-export leakage, orphaned
   or multiply selected tests, empty layers and exception misuse. Review grouped-run
   read/write assumptions statically; preserve scheduling and existing access scope.

Acceptance criteria: all four commands are usable; bad fixtures fail with actionable
diagnostics; no broad allowlist or `passWithNoTests`; default remains compatible with
existing CI and the original serial/shared-output safety model.

Verification: V2 guard tests, actual discovery comparisons and smoke runs through
each new layer command; final complete runs are required in V3.

### Task ARTS-04: Close public-coverage gaps without private scaffolding

Status: completed
Kind: improvement
Priority: P1 — merely moving tests cannot establish consumer-facing compatibility.
Dependencies: ARTS-03

Primary ownership: `test/contracts/`, `test/support/public/`, approved mixed-test
splits and the public behavior/migration matrix under `packages/access-router/`.

Finding/references: `access-router-crud-harness.unit.test.ts:34–70` checks real modes
using private stage spies; `model-output-metadata.unit.test.ts` directly tests its
new helper; `export-contract.test.ts` also tests response-pipeline internals. None
alone establishes independence from those implementations.

Requirements:

1. Use supported exported runtimes/routers and request-acquired services to cover
   ARTS-01's missing public scenarios. Do not export private code or reconstruct
   internal service ownership/capabilities to make fixtures convenient.
2. Preserve semantic import/type coverage for all three entrypoints, real ESM/CJS
   and existing strict Bundler/NodeNext/Node16 positive/negative consumer cases.
   Preserve packed-publication and documentation-example contracts.
3. Complete the bounded mode/entrypoint matrix from ARTS-01. Check actual behavior,
   not labels alone: include mode-distinguishing hook mutations, persistence and
   mutation-detachment effects where meaningful. Keep internal stage-mode assertions
   below contracts; do not substitute a private spy into the public matrix.
4. Cover consumer-visible authorization denial/no-leak/no-unauthorized-write behavior,
   field/permission metadata and aliases, related/populated/embedded results, fallback
   and upsert branches, errors, ownership and supported callback arguments/receivers/
   ordering. Retain root/model/data/subdocument and validation/OpenAPI/processor
   coverage mapped in ARTS-01; add only demonstrated missing boundary cases.
5. For mixed tests, retain all original assertions below contracts or map each split
   assertion to its new location. Public companion expected values must be grounded
   in existing behavior, not recomputed using the same private helper under test.

Acceptance criteria: every required public matrix row has executable contract evidence;
contract runs pass without importing/patching private internals, including through
fixtures; original assertions and lower-layer safety coverage remain intact.

Verification: V2 targeted public families/consumer compiles, dependency guard and V4
ledger review; complete standalone public-contract run is part of V3.

### Task ARTS-05: Document refactor gates and reconcile migration evidence

Status: completed
Kind: improvement
Priority: P2 — prevent the separation from decaying or being mistaken for a guarantee.
Dependencies: ARTS-04

Primary ownership: `packages/access-router/test/README.md`, maintained testing
guidance references and the new task-artifact bundle/index/ledgers.

Finding/references: the current all-tests command and historical contract suffixes
do not express which tests should remain stable during a private refactor.

Requirements:

1. Document classification examples, allowed fixture imports, commands/prerequisites
   and the distinction between contract layers and unit/integration test styles.
2. State the future workflow: unchanged public tests are an early compatibility gate;
   inspect invariant failures and adapt implementation-specific tests with rationale;
   run all layers for final acceptance. No automatic permission to change security
   expectations, delete failing tests or freeze every internal counter as public API.
3. Intentional supported-contract changes require explicit approval and synchronized
   tests/docs/release communication, not a convenience contract-test rewrite during
   an internal refactor. State coverage and static-checker limitations.
4. Reconcile every original file/case/assertion and support consumer against the final
   ledger; record added companions, splits, retained fixture-path exceptions and any
   unresolved coverage row. Preserve concise commands, identities and evidence links;
   do not copy all logs or claim a faster test suite without measurement.

Acceptance criteria: another maintainer can choose the right layer, run it from a
fresh checkout and review an internal refactor's test changes; no missing original
assertion or unresolved required coverage row remains hidden by aggregate counts.

Verification: V4 documentation/ledger/link/privacy review and ARTS-03/04's actual
V2 script/fixture evidence. ARTS-05 documents the remaining final gates accurately;
ARTS-06 owns executing/reporting V3, so its results are not a prerequisite here.

### Task ARTS-06: Independently accept the separation and full compatibility gate

Status: completed
Kind: investigation
Priority: P1 — independently check that reorganized tests still protect real usage.
Dependencies: ARTS-03, ARTS-04, ARTS-05

Primary ownership: independent actual-diff/config/fixture/ledger review and final
acceptance report/verification manifest; no planned production or test rewrites.

Finding/references: matching case totals cannot prove assertion preservation, and
private fixtures can conceal coupling even in a green, contract-labelled suite.

Requirements:

1. Use a reviewer other than the primary implementer if delegated. Inspect actual
   tests, public acquisition paths, fixture/import closure and installed compilation,
   rather than accepting prior reports as evidence of independence.
2. Verify every acceptance criterion, original assertion mapping, bounded all-mode/
   entrypoint matrix, no unauthorized policy changes, and no new skip/only/typecheck
   weakening. Source, runtime exports/options and built declarations stay unchanged.
3. Execute V3 sequentially on the delivered tree; verify discovery union/disjointness
   and guard negative cases. Diagnose failures without weakening expectations or
   calling them pre-existing without baseline evidence.
4. Publish a concise accepted/blocked report with actual command/results, tested
   identities, counts by layer, matrix/ledger references and remaining limits. Make
   no claim of universal compatibility proof or independent review if unavailable.

Acceptance criteria: actual standalone layer runs and exhaustive default run pass;
all original assertions remain covered; no hidden private coupling in contracts;
fresh typecheck/scoped lint/declaration comparisons and evidence checks pass. Any
unmet required criterion keeps final acceptance blocked.

Verification: V3/V4 and independent report review.

## Shared verification and evidence

All commands below run from repository root with an ignored repo-local absolute
`TMPDIR`. Do not run separate commands concurrently; required builds replace shared
`dist/`. New script names are **proposed deliverables of ARTS-03**, not current
commands or checks already executed. No root/grouped/downstream test command is required.

### V0 — baseline identity and discovery

- Record revision/working diff, source/public/config/test identities and full generated
  declaration inventory. Capture original test/assertion and support/caller mapping.
- Inspect installed Vitest's discovery/JSON support and record exact usable argv;
  do not invent flags. Track parameterized cases using paths, full titles and a
  collision-safe case identity, not just aggregate file/test counts.

### V1 — one fresh pre-migration package baseline

```sh
pnpm --filter @web-ts-toolkit/access-router typecheck
pnpm --filter @web-ts-toolkit/access-router test
```

Capture machine-readable results without replacing normal failure propagation.
The prior 7,565-test pass is historical context only. If prerequisites such as
MongoDB binaries, consumer-install access or the existing prebuilt CLI fixture are
unavailable, record the exact blocker; do not skip those tests or expand build scope.

### V2 — focused implementation verification

- Use `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config
vitest.config.ts <exact-test-paths>` after the required filtered build, or the
  delivered layer command. Record actual argv and selected cases.
- Exercise relocated root/path-sensitive consumer tests, affected fixtures and guard
  regression cases. Repeat affected checks if later edits invalidate their identity.
- Do not rerun the complete suite after every mechanical move. Preserve global setup,
  generated negative fixtures and benchmark identity/protocol tests; no timing campaign.

### V3 — final commands, sequentially

```sh
pnpm --filter @web-ts-toolkit/access-router test:layers:check
pnpm --filter @web-ts-toolkit/access-router typecheck
pnpm --filter @web-ts-toolkit/access-router test:contracts
pnpm --filter @web-ts-toolkit/access-router test:invariants
pnpm --filter @web-ts-toolkit/access-router test:internal
pnpm --filter @web-ts-toolkit/access-router test
pnpm exec eslint packages/access-router/src packages/access-router/test packages/access-router/scripts packages/access-router/vitest*.ts
```

The three standalone runs demonstrate independence; one final default run proves
the existing CI entrypoint still executes all layers. Do not substitute one for the
other or claim runtime savings. Record runtime/toolchain/prerequisites, test files
and case counts per command, failures/skips, discovery comparisons and tested file
identities. Final total can increase due to guard/companion tests or splits; explain
the delta using the original-assertion ledger. Rebuild and compare all declarations
and protected source/public files against V0; scripts/config additions are ledgered.

### V4 — preservation, documentation and safety audit

- Audit original assertions/expected values/parameter rows and necessary setup, not
  counts alone. Record justified splits/public-equivalent setup with old/new locations.
- Check contract dependency closure, generated consumer inputs, negative-import
  exceptions, no source aliases/private mocks and no broad classification exemptions.
- Confirm maintained fixture/benchmark caller references and generated compiler
  inputs resolve. Statically review unchanged CI/grouped shared-build/read assumptions;
  do not run grouped or downstream suites for this task.
- Validate evidence JSON, Markdown links, privacy, ignored scratch/nonignored durable
  destinations and `git diff --check`. Preserve useful evidence, not scratch trees;
  state omitted raw inputs and reproduction limits.

## Definition of done and next action

- Public contracts are runnable independently and depend only on supported usage;
  invariants/internal tests remain separately selectable and part of default tests.
- Every original case/assertion and required public scenario is accounted for, with
  enforced layer boundaries, no coverage loss and no production/consumer changes.
- Baseline/final verification and independent review have actual evidence; all six
  task statuses are completed or an explicit blocker prevents acceptance.

## Execution record

- Starting revision: `fe50475fd026d70aad52bc54b1c6d3d41dbc885b`. The only
  uncommitted file at authorization was this task document.
- User authorized delegated implementation. The coordinator owns this shared task
  file; task sessions run sequentially and the final reviewer will be a fresh
  non-implementer. No concurrent builds/tests in the shared checkout.
- ARTS-01 baseline/classification session started. No production change is authorized;
  tests remain access-router only, with necessary transitive builds/scoped fixtures.

### ARTS-01 accepted baseline and classification

- Fresh sequential package typecheck/build and one full baseline passed:
  **7,565 cases / 211 files**, zero failures/skips/todos. Machine-readable runtime
  case identities, static preservation hashes and all eight declarations are frozen.
- Approved planned destinations: **97 contracts / 64 invariants / 50 internal**,
  with all 37 support files and their maintained/generated callers mapped. Every
  mixed original stays whole below contracts; bounded public companions are additive.
  No assertion/case retirement or split is needed for this chosen migration.
- Preserve root paths for the benchmark CRUD fixture and shared Mongo/global setup;
  downstream consumers remain untouched. Preserve the dormant legacy compiler
  fixture as private-dormant, not current passing public coverage.
- The coordinator reviewed the actual classification, coverage recipes and handoff,
  then reran the read-only baseline verifier successfully: 434 protected inputs,
  248 test/support files, 11,254 assertion-looking call sites, 849 parameterizations,
  411 directive/diagnostic lines and eight declarations matched. These static counts
  supplement node/body/value hashes; they are not substitutes for preservation proof.
- Bounded public gaps include the genuine 16-mode source panel, independently varied
  target READ/LIST modes and named ownership/admission/consumer companions. Public
  overflow/drain evidence must use genuine public inputs, not private budget injection.
- Evidence and exact commands:
  `docs/task-artifacts/access-router/20261108-094712-test-contract-separation/arts-01-report.md`.
  Baseline records are historical and must not be rewritten by later tasks.
- ARTS-02 begins using the approved exact move/import/fixture map. No runtime jobs remain.

### ARTS-02 whole-file migration delivered

- The initial delegated handoff hit a usage limit after saving moves/operational
  scratch. On user-requested continuation, the coordinator inspected actual files
  and confirmed no active test/build jobs before resuming the same task session.
  The completed handoff is supported by saved evidence, not the interrupted call.
- All **211 original runnable files** moved whole to the approved **97/64/50**
  layer destinations. All 37 support files remain accounted for, including three
  byte-identical stable root exceptions and the preserved dormant private fixture.
- **1,145 tests / 26 files** passed, zero failures/skips/todos, including strict and
  packed consumers, docs, public fixtures, migration, metadata/write controls and
  benchmark driver/harness tooling. Fresh typecheck/build, scoped lint and exact
  211-file discovery passed; all eight declarations remain byte-identical.
- The coordinator reran the read-only preservation verifier: reversing only 1,093
  precisely logged import/path/public-equivalent repairs recovered all **248 original
  files byte-for-byte**, with their complete AST/body/table/directive/setup records.
  All 186 protected non-test inputs and 15 baseline artifacts remained unchanged.
  No assertions, cases, expected values or cleanup were retired or split.
- Evidence and exact commands:
  `docs/task-artifacts/access-router/20261108-094712-test-contract-separation/arts-02-report.md`.
- ARTS-03 begins. Existing tests remain unchanged from this verified migration;
  new tooling tests/configuration/scripts will be separately ledgered. No queued jobs.

### ARTS-03 commands and boundary guard delivered

- Added standalone `test:contracts`, `test:invariants`, `test:internal` and
  `test:layers:check`. Default/layer test scripts retain one filtered build and one
  Vitest execution, with the boundary check before tests; default remains exhaustive.
- Shared Node/setup/serial-file/timeout settings are unchanged. Actual Vitest
  discovery is disjoint and exhaustive: **212 files = 97/64/51**; the extra internal
  file contains **59 new boundary regressions**.
- Guard checks direct/transitive/type/re-export/setup imports, finite filesystem-fed
  and generated consumers, private chunks, unresolved edges and common implementation
  mock/patch escapes. Negative encapsulation sites have narrow failure-only rules.
  Reflection/arbitrary dataflow still require documented manual review; this is not
  a sandbox or proof of semantic independence.
- Actual layer-command smoke selections passed **105 cases / 4 files**, including
  all 59 final guard regressions. Fresh typecheck/build, scoped lint, discovery and
  checkpoint passed. No full layer/default run is claimed at this stage.
- Coordinator reviewed the delivered configs/scripts and reran the checkpoint:
  all **248 migrated originals**, **152 sources**, **eight declarations**, ESM/CJS
  export-name sets and 22 earlier evidence files are unchanged. The two exact old
  non-test exceptions are package test scripts and the shared-config import; no
  runtime metadata/dependencies/exports changed.
- Evidence, actual development failures/resolutions and exact commands:
  `docs/task-artifacts/access-router/20261108-094712-test-contract-separation/arts-03-report.md`.
- ARTS-04 begins additive public-only companions against the accepted bounded gap
  matrix. Existing migrated files/expectations and historical evidence stay frozen.

### ARTS-04 bounded public companions delivered

- Added **93 passing cases / six contract files** and four public-support files,
  within the bounded 94-case ceiling. The executable supplement maps all **34 gap
  rows** and 23 public-surface groups; all 97 original public files remain preserved.
- The 16 source-mode cases execute **96 real primary operations**. Additional
  target/capture/fallback/write/native/metadata/admission/data/callback/parser/
  processor/DTO/installed-entry cases use genuine supported acquisition paths.
  No private constructor, stage, budget injection, source alias or package-method
  spy/mock was introduced; the existing boundary policy/tooling did not need changes.
- Real collection overflow waits for admitted held callbacks before rejecting, and
  real post-save selected-scope overflow leaves the submitted write committed.
  Invalid populate admission is tested through documented forbidden global placement,
  not an invented enum rejection. The coordinator accepted this grounded recipe
  clarification without changing the historical gap matrix or production policy.
- Fresh typecheck/build, focused public tests, layer guard, scoped lint and checkpoint
  passed. Discovery is **218 = 103/64/51**; no complete layer/default run is claimed
  yet. All 248 originals, 152 sources, eight declarations and ARTS-03 tooling match.
- Coordinator review found the new installed-export fixture lacked its own teardown.
  The same implementation session added guarded cleanup of only its allocated root;
  **two exporter cases** and scoped lint/checkpoint passed again. Titles/assertions/
  case locations are unchanged. A separate cleanup supplement records the one new
  file identity; earlier sealed evidence remains historical and untouched.
- Evidence:
  `docs/task-artifacts/access-router/20261108-094712-test-contract-separation/arts-04-report.md`,
  `arts-04-coverage.md` and `arts-04-cleanup.md` in that same bundle.
- ARTS-05 starts contributor guidance and final ledger reconciliation. ARTS-06 still
  owns independent actual-source review and all complete V3 runs; no runtime jobs remain.

### ARTS-05 contributor guide and reconciliation delivered

- The interrupted initial handoff had not created the guide or durable ARTS-05
  evidence. On user-requested continuation the coordinator checked actual files and
  no active test/build jobs, then resumed the same bounded documentation session.
- Added `packages/access-router/test/README.md` with actual commands/prerequisites,
  classification examples, public fixture/acquisition boundaries, guarded negative
  imports and the future refactor workflow. Public compatibility tests stay unchanged
  during internal refactors; lower-layer safety obligations cannot be dropped merely
  because public tests pass. All layers remain final gates, not universal proof.
- Reconciled all **248 original files**, exact repair reversals/AST records and
  **7,565 original runtime IDs**, all 37 support/caller maps, 25 normalized consumer
  inputs, 34 gap rows/23 surfaces and 93 unique companion IDs. Exporter cleanup
  supersedes one file hash only; its repeated two-case pass is not extra coverage.
- Read-only checkpoint and static graph audit passed; all 34 historical artifacts
  and 476 preexisting captured inputs stayed unchanged. Documentation checks passed
  for 139 local links/10 anchors, 22 structured files, privacy/whitespace and ignore
  status. No build/typecheck/lint/runtime suite was needed or run for this doc scope.
- Evidence:
  `docs/task-artifacts/access-router/20261108-094712-test-contract-separation/arts-05-report.md`
  and `arts-05-reconciliation.md`. The baseline README/index/seals remain untouched;
  the final reviewer will publish a separate final index rather than rewrite history.
- **7,717 = 3,158 contracts + 3,078 invariants + 1,481 internal remains an expected
  total, not an executed full result.** ARTS-06 now begins in a fresh independent
  reviewer session to inspect actual delivery and execute every V3 gate sequentially.

### ARTS-06 first independent review: full runs passed; guard finding blocks acceptance

- Fresh sequential complete runs passed: **3,158 contracts / 103 files**,
  **3,078 invariants / 64 files**, **1,481 internal / 51 files**, and one exhaustive
  default **7,717 / 218**. Layer check, fresh typecheck/build and scoped lint passed.
  All original assertions/cases, 152 sources and eight declarations were preserved.
- Actual review found **ARTS06-F1**: the guard accepts an exact public package name
  before checking effective TypeScript aliases. A fresh finite probe resolved that
  name to private source while the guard returned no errors. This is a reusable
  test-guard defect, not a demonstrated production bug or source leak in the delivered
  public fixtures. Green runtime gates alone do not satisfy final acceptance.
- ARTS-03 is reopened for a bounded fix plus exact root/subpath/inherited-settings
  regressions. Legitimate staged installed/generated consumers must retain their own
  compiler context; do not blindly apply repository aliases to them. Original tests,
  production code and historical seals remain frozen. The ARTS-06 dependency now
  explicitly includes the reopened ARTS-03 gate; its fix owner is the tooling session.
- The reviewer also recorded two pre-existing Date/ObjectId-generated test titles
  that vary between executions. Exact original constructor/parameter mappings and
  all raw observations are preserved; no blanket title normalization or test edit.
- Evidence of the actual passed runs and blocked review:
  `docs/task-artifacts/access-router/20261108-094712-test-contract-separation/arts-06-review.md`,
  `arts-06-verification.json` and historical `FINAL.md` in that bundle. A subsequent
  repair/review must append new identities/results, not overwrite these records.
- No build/test job remains active. Final acceptance stays blocked pending the
  repair and independent re-review/reverification of its delivered identity.

### ARTS-03 reopened finding repair delivered; independent reacceptance starts

- The tooling session repaired exact public-name resolution before the boundary
  return and added explicit repository versus finite installed-consumer compiler
  contexts. Ordinary imports/setup/re-exports retain repository aliases; staged
  consumers retain their own context. Context-qualified traversal prevents a
  previously visited installed fixture from masking an ordinary repo import.
- The original independent reproducer failed the old guard expectation before the
  fix. Final focused results: **76 guard cases passed = 59 unchanged + 17 appended**;
  all old guard bytes/assertions/locations remain an exact prefix. Effective exact,
  subpath, wildcard/inherited/baseUrl aliases and valid staged/repository distinctions
  have executable regressions. No broad public-support/generated-source exemption.
- Filtered build/typecheck, changed-file lint, layer discovery/preflight and a new
  append-only checkpoint passed. The coordinator reran that checkpoint successfully:
  only three maintained tooling files changed; all 248 originals, 93 companions,
  152 sources, eight declarations and 41 prior evidence files are preserved.
- New evidence:
  `docs/task-artifacts/access-router/20261108-094712-test-contract-separation/arts-03-f1-report.md`
  and its new manifest/verification/patch/checkpoint. Old ARTS-03 and first ARTS-06
  records, including the blocked historical `FINAL.md`, are not rewritten.
- ARTS-03 implementation is complete again. ARTS-06 resumes in the same independent
  reviewer session for actual repair re-review and all complete V3 gates on the new
  identity. **7,734 = 7,717 + 17 is prospective**, not a post-repair full pass yet.

### ARTS-06 post-repair independent acceptance (2026-11-09)

- **Accepted; ARTS06-F1 closed.** The same independent non-implementer reviewer
  inspected the actual repair/compiler contexts and passed 20 independent positive/
  negative probes. No unresolved implementation, classification or coverage blocker
  remains. Static checks are still not a sandbox or universal compatibility proof.
- The post-repair handoff was interrupted after three complete standalone runs.
  Their actual saved exits/reporters and unchanged tested identities were verified
  before continuation; those successful runs were not repeated. At the user's
  request the remaining review ran in the background, while all build/test commands
  remained serial and awaited. The completion notification was reconciled against
  the delivered review and verification manifest before updating these statuses.
- All complete post-repair gates passed with zero failures/skips/todos:

  | Selection          | Passed cases |   Files |
  | ------------------ | -----------: | ------: |
  | Public contracts   |        3,158 |     103 |
  | Invariants         |        3,078 |      64 |
  | Internal           |        1,498 |      51 |
  | Exhaustive default |    **7,734** | **218** |

- Layer check/discovery, fresh filtered build/typecheck, scoped lint and the new F1
  checkpoint passed. Exactly one reviewer default run occurred on each identity:
  historical pre-repair 7,717 and final post-repair 7,734. All required commands and
  actual timestamps/identity/case evidence are preserved; no root/grouped/downstream
  suite, unrelated CLI build or new benchmark campaign ran.
- All **248 original test/support files** and their complete assertions/setup/tables/
  directives remain preserved by exact reverse-repair and AST/byte checks. All 7,565
  original cases, 93 public companions, 59 old guards and 17 appended guards passed.
  All **152 production sources**, **eight rebuilt declaration files**, supported
  exports, runtime metadata and dependencies remain unchanged. No consumer migration.
- Actual discovered file union is disjoint/exhaustive. All 34 bounded gap rows and
  23 surfaces reconcile, including 16 source tuples / 96 primary operations and
  independent related targets, captured modes, fallback, write detachment and drain.
- Two pre-existing Date/ObjectId constructor-derived titles still vary by execution.
  Only their exact constructor/parameter/location mappings are used; all raw titles
  are retained. Do not claim literal equality of all raw case-title sets. Manual
  reflection/dataflow/generator-review and normal runtime prerequisite limits remain.
- All 46 earlier artifacts and the tested delivery stayed unchanged during review;
  older blocked/planning reports remain historical. The separate current index is
  `docs/task-artifacts/access-router/20261108-094712-test-contract-separation/ACCEPTANCE.md`,
  with final independent assessment in `arts-06-f1-review.md` and exact machine-readable
  commands/results in `arts-06-f1-verification.json` in the same bundle.
- Only coordinator task-status/completion documentation changed after acceptance.
  All six statuses are completed. No active job remains; no commit or push was
  performed by this phase's coordinator. Future refactors can use the maintained
  `packages/access-router/test/README.md` and independent layer commands.
