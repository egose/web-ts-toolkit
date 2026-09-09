# JSON Frame Boundary Health Follow-Up

Created: 2026-09-08 18:09:59 PDT

Package: `packages/json-frame`

## Objective And Scope

Close newly verified correctness and resource-safety gaps in parser options, transform composition, numeric packing, serialization, and diagnostics. Investigate shared-reference amplification and datetime interoperability before selecting their contracts. Measure exporter and wide-schema costs before optimizing them.

This is an executable plan for sub-agents, not authorization to implement changes during the review that created it. All implementation tasks start pending.

Related historical plans:

- `docs/tasks/20260814-170611-json-frame-package.md`
- `docs/tasks/20260823-152151-json-frame-health-review-remediation.md`

The preceding health plan marks JFH-01 through JFH-10 completed. This document has a separate follow-up lifecycle: it records new transform/validation edge cases and residual gaps after those fixes, without changing historical completion evidence or duplicating resolved ordering, primary-key uniqueness, packaging, fixture-provenance, and row-access work.

Non-goals: MultiIndex, duplicate/non-string columns, streaming/JSON Lines, file I/O, a query engine, deep immutability, general schema validation of pandas-authored metadata, new public entrypoints, or new runtime dependencies. Do not reopen documented JavaScript integer-key ordering limitations.

## Coverage And Baseline

Reviewed source entrypoints, public types, options/errors, JSON traversal, all orient parsers, stored columns, frame transforms, exporters, package/build metadata, README, relevant parser/frame/export/error tests, declaration-consumer and packed-consumer coverage, and the JFH-07 benchmark. Inspected the rebuilt ESM declaration export surface. Parser and frame/export analysis were delegated to separate read-only reviewers and deduplicated by the coordinator.

Checks actually run from the repository root on creation day:

- `pnpm --filter @web-ts-toolkit/json-frame test`: passed, 8 test files and 132 tests. Includes build, source/NodeNext/Bundler/browser-Bundler typechecks, packed-consumer tests, and the benchmark test file.
- `pnpm exec eslint "packages/json-frame/**/*.{ts,js}"`: passed.
- Bounded Node ESM runtime probes against the freshly rebuilt `packages/json-frame/dist/index.mjs`: confirmed the observations below. These were inline review probes, not committed regression tests.

Runtime evidence:

| Case                                                                                                                                 | Observed result                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Table with string primary key `pk`, integer column `value`; `rename({ value: 'pk' }).select('pk').toTable({ indexField: 'row_id' })` | Exported `row_id` has schema type `integer` but cell value `'r0'`.                                        |
| `fromOrient([[-0]], { orient: 'values', columns: ['n'], packThreshold })`                                                            | `Object.is(frame.row(0).n, -0)` is true at threshold 0 and false at threshold 1.                          |
| Explicit split with `index: 'row-id'`                                                                                                | Accepted; source index silently replaced by `[0]`.                                                        |
| Values input `[[42]]` with `columns: new Array(1)`                                                                                   | Accepted; undefined column label appears as `null` when the exported split is JSON-stringified.           |
| Explicit datetime cell `'0099-01-01'`                                                                                                | Rejected with `JsonFrameValidationError`.                                                                 |
| Malformed values row with a 1,000,000-character object key                                                                           | Diagnostic retains a 1,000,000-character key preview and reports `truncated: false`.                      |
| `[{ v: NaN }]` with explicit records orient                                                                                          | Structured error has path `$[0].v` but no orient.                                                         |
| Cycle introduced through `frame.row(0).v` after parsing                                                                              | `toJSONString()` throws native `TypeError` in all six orients.                                            |
| Nested array extended beyond the documented limit through a returned cell                                                            | `toJSONString('records')` succeeds beyond `JSON_FRAME_MAX_DEPTH`; limit is not enforced at serialization. |
| Cell graph with 13 distinct containers, each level referencing the same child twice                                                  | Parsed cell has 8,191 distinct containers; repeated aliases are independently expanded.                   |

Limitations:

- No full-repository build/test/lint run, fixture regeneration, or fresh pandas read-back experiment was performed for this planning review. Focused checks were sufficient to establish actionable findings; integration checks remain required below.
- No throughput or heap benchmark was run for the proposed exporter/schema optimizations. The existing benchmark ran as part of tests, but does not measure those paths.
- No exhaustive fuzzing, hostile Proxy/getter sandboxing, live documentation URL check, or every-version Node/browser compatibility experiment was performed.
- Shared-reference amplification requires programmatic objects; ordinary JSON text cannot encode aliases. Post-construction cycle/depth failures require mutation through the documented shallow cell boundary. These are not claims of remotely exploitable vulnerabilities in every deployment.
- Vite emits the existing warning about ESM syntax in the CommonJS-loaded root configuration; tests still pass.
- The worktree already contains unrelated changes. Do not revert or include them in this work.

## Priorities And Working Rules

Priorities for this follow-up: P1 is silent data/schema corruption or disproportionate resource consumption; P2 is bounded correctness/validation or documented-contract failure; P3 is optional measured performance or maintainability work. No emergency/P0 incident is asserted.

- Preserve six orients, named-only public root exports, Node >=22, isomorphic runtime, and zero runtime dependencies.
- Keep regression tests with each fix. Demonstrate failure on the old implementation before correction where feasible.
- Prefer the existing shared JSON boundary and stored-column accessors over parallel validators or broad class rewrites.
- Preserve shallow cell identity on reads/exports; do not silently deep-freeze cells or clone every read to solve serialization issues.
- Public behavior changes require source JSDoc, README, relevant website guidance, strict consumer tests where applicable, and a release-note entry or explicit release-note evidence in this file. Never manually edit generated `dist/` files.
- Mark a task `in_progress` only after dependencies complete; record its owner. Complete only with acceptance and verification evidence. Use `blocked` for unresolved prerequisites, and `deferred` with rationale and residual risk for intentionally postponed work.
- Keep every project path repository-relative in task updates. Temporary experiments may use `/tmp/opencode` or generic system temporary directories.

## Verification Commands

All commands below run from the repository root unless a different working directory is stated. Prerequisites: repository-supported Node/pnpm, installed workspace dependencies, and no conflicting build process. Use `pnpm install --frozen-lockfile` only if dependencies need provisioning.

- V1, focused runtime tests without a rebuild: `pnpm --filter @web-ts-toolkit/json-frame exec vitest run --config ../../vitest.config.ts <test-path>`. Replace `<test-path>` with task-owned paths relative to the package, such as `test/frame/DataFrame.test.ts`.
- V2, package acceptance: `pnpm --filter @web-ts-toolkit/json-frame test`. Rebuilds output and checks source and declaration consumers as well as runtime tests.
- V3, focused lint: `pnpm exec eslint "packages/json-frame/**/*.{ts,js}"`.
- V4, dedicated packed-consumer verification: `pnpm --filter @web-ts-toolkit/json-frame test:packed-consumer`. Preserve the release-manifest rewrite harness; workspace manifest placeholders are intentional, not a new metadata defect.
- V5, performance baseline: `pnpm --filter @web-ts-toolkit/json-frame bench:jfh-07`; extend that existing harness for the new measurements rather than inventing an unrecorded command.
- V6, final repository integration: `pnpm lint`, then `pnpm build`, then `pnpm test`, run serially.
- V7, pandas interoperability: use the pinned environment documented in `packages/json-frame/test/fixtures/README.md` and `packages/json-frame/test/fixtures/.tool-versions`. Run `python3 generate.py` from `packages/json-frame/test/fixtures` only when fixture changes are necessary. Record exact read-back experiment commands and results in task evidence; do not equate fixture regeneration with exporter read-back validation.

Build/test commands must be serialized. Package tests rebuild output consumed by declaration/packed tests; repository tests deliberately use `--workspace-concurrency=1` to prevent shared `dist/` races. Parallel code ownership does not authorize concurrent builds.

## Tasks

### Task JFB-01: Preserve Index Metadata Through Colliding Renames

Status: completed

Completion evidence:

- Changed: `packages/json-frame/src/frame/DataFrame.ts`, `packages/json-frame/src/export/payload.ts`, `packages/json-frame/test/frame/DataFrame.test.ts`, `packages/json-frame/test/export/export.test.ts`
- Verified: `pnpm --filter @web-ts-toolkit/json-frame exec vitest run --config ../../vitest.config.ts test/frame/DataFrame.test.ts test/export/export.test.ts` (2 files / 35 tests passed); `pnpm --filter @web-ts-toolkit/json-frame test` (8 files / 136 tests passed); `pnpm exec eslint "packages/json-frame/**/*.{ts,js}"` (passed)
- Result: role-aware schema partition preserves index vs data identity; baseline `rename({value:'pk'}).select('pk').toTable({indexField:'row_id'})` exports string `row_id='r0'` and integer `pk=42` with unique names and `primaryKey ['row_id']`; second rename/reset/filter/sort chains preserve or reject before corruption
- Follow-up: V7 pandas read-back deferred to JFB-09; internal duplicate names rely on canonical index-first invariant

Kind: defect

Priority: P1, supported transform composition silently emits a field type inconsistent with its values.

Suggested agent: frame/schema correctness specialist

Dependencies: none

Primary ownership: `packages/json-frame/src/frame/DataFrame.ts`, schema-related helpers in `packages/json-frame/src/export/payload.ts`, `packages/json-frame/test/frame/DataFrame.test.ts`, `packages/json-frame/test/export/export.test.ts`.

Finding: `rename()` checks only data-column uniqueness. Renaming `value` to retained index-field name `pk` creates duplicate internal schema names. `#selectSchema()` then collapses them into a name-keyed map, replacing string index metadata with integer data metadata. An export `indexField` override does not repair this. Other composition paths can also lose the data field during `resetIndex()`.

References:

- `packages/json-frame/src/frame/DataFrame.ts:288-303`, `:423-489` (`#selectSchema`, `#renameSchema`, `#resetIndexSchema`).
- `packages/json-frame/src/export/payload.ts:317-346` (index/data templates).
- `packages/json-frame/test/frame/DataFrame.test.ts:304-358` covers ordinary schema transforms, not this collision chain.

Requirements:

1. Preserve separate index and data-field identities during transforms. Prefer an internal representation/lookup correction that retains valid data-column renames and the existing export-name override behavior.
2. Do not resolve ambiguity by guessing types from the wrong field or dropping extension metadata. If a public rename restriction is unavoidable, stop for a maintainer decision and record the breaking contract before implementation.
3. Keep source frames unchanged and preserve source index labels, arbitrary supported field metadata, and primary-key identity.

Acceptance criteria:

- Regression using the baseline chain exports string `row_id`, integer `pk`, and unchanged values `'r0'`/42.
- Colliding rename followed by `select`, a second rename, `resetIndex`, filter, and sort preserves the correct surviving metadata or produces a documented structured rejection before corrupting state.
- Empty frames, prototype-sensitive labels, and non-colliding controls remain valid; emitted schema names are unique and primary keys point to the intended field.

Verification: V1 frame/export tests, V2, V3, and V7 read-back of the corrected string-index/integer-data table.

### Task JFB-02: Reject Malformed Index And Column Containers

Status: completed

Completion evidence:

- Changed: `packages/json-frame/src/options.ts`, `packages/json-frame/src/parse/parse.ts`, `packages/json-frame/test/options-and-errors.test.ts`, `packages/json-frame/test/parse/parse.test.ts`
- Verified: focused `test/parse/parse.test.ts test/options-and-errors.test.ts` (2 files / 89 tests passed); `pnpm --filter @web-ts-toolkit/json-frame test` (8 files / 148 tests passed); `pnpm exec eslint "packages/json-frame/**/*.{ts,js}"` (passed)
- Result: present malformed split `index` rejected at `$.index`; sparse `options.columns` rejected as `JsonFrameOptionError`; explicit orient propagated to JSON compatibility errors; omitted index and valid controls preserved

Kind: defect

Priority: P2, malformed input/options currently create silent label replacement or invalid frame state.

Suggested agent: parser/runtime-options specialist

Dependencies: none

Primary ownership: `packages/json-frame/src/options.ts`, `packages/json-frame/src/parse/parse.ts`, `packages/json-frame/test/options-and-errors.test.ts`, `packages/json-frame/test/parse/parse.test.ts`.

Finding: `parseSplit()` treats any non-array `index` as absent, unlike auto-detection. Option column validation uses `map()`, skips sparse holes, then spreads them into undefined labels. The same parser boundary also omits an already-known explicit orient when calling the JSON validator, reducing error consistency.

References:

- `packages/json-frame/src/options.ts:78-90`, `:124`.
- `packages/json-frame/src/parse/parse.ts:191-197`, `:451-463`, `:499-501`, `:811-812`.
- `packages/json-frame/test/parse/parse.test.ts:788-821`, `:846-853`; `packages/json-frame/test/options-and-errors.test.ts:42-75`.

Requirements:

1. Distinguish an omitted split index from a present malformed one. Preserve omitted-index synthetic behavior; reject present non-arrays with `JsonFrameValidationError` at `$.index` for explicit split.
2. Validate every numeric position in `options.columns`, including holes, before payload traversal. Reject sparse columns as `JsonFrameOptionError` rather than installing undefined map keys; do not use sparse-skipping array callbacks as the validator.
3. Pass explicit resolved orientation into JSON compatibility errors. Keep unresolved auto context honest; do not invent a resolved orient before detection.
4. Document the tightened malformed-input contract and keep valid null-prototype/prototype-sensitive labels working.

Acceptance criteria:

- Raw and parsed split cases with string, number, null, boolean, or object index are rejected; omitted index and valid array controls pass. Auto mode must not silently accept the malformed shape, though its error category can differ.
- Single/multiple-hole option arrays fail for both empty and non-empty values payloads. Dense non-string and duplicate labels still fail; dense valid strings pass.
- Non-finite/cycle/depth errors with explicit records orient include that orient and a useful path; auto failures do not falsely claim it.

Verification: V1 parser/options tests, V2, V3.

### Task JFB-03: Preserve Negative Zero Across Packing And Rebuilds

Status: completed

Completion evidence:

- Changed: `packages/json-frame/src/frame/column.ts`, `packages/json-frame/test/frame/column.test.ts`
- Verified: focused `test/frame/column.test.ts` (1 file / 21 tests passed); `pnpm --filter @web-ts-toolkit/json-frame test` (8 files / 154 tests passed); `pnpm exec eslint "packages/json-frame/**/*.{ts,js}"` (passed)
- Result: integer `packColumn` rejects `-0` via `Object.is`, preserving sign with unchanged metadata; Float64 path unaffected; packed/unpacked row/callback/exporter parity holds; `JSON.stringify(-0)` documented as `0` by spec

Kind: defect

Priority: P1, an internal optimization changes observable supported numeric cell values.

Suggested agent: numeric storage correctness specialist

Dependencies: none

Primary ownership: `packages/json-frame/src/frame/column.ts`, `packages/json-frame/test/frame/column.test.ts`; coordinate any public transform/export regression edits after JFB-01.

Finding: `packColumn()` admits `-0` into `Int32Array`, which stores positive zero. Threshold-dependent results violate the promise that packing is only an internal optimization. Filtering nulls can make an initially unpacked nullable column eligible for the same lossy packing.

References:

- `packages/json-frame/src/frame/column.ts:282-315` (`packColumn`).
- `packages/json-frame/test/frame/column.test.ts:142-181`; `packages/json-frame/test/export/export.test.ts:424-447` lack signed-zero parity assertions.
- `packages/json-frame/README.md:293-298`.

Requirements:

1. Choose the smallest storage eligibility change that preserves negative zero without changing logical integer metadata or coercing cells.
2. Apply it at the shared packing boundary so construction and every repacking transform agree.
3. Distinguish JavaScript payload semantics from the normal `JSON.stringify(-0)` result of `0`; do not claim text JSON preserves the sign.

Acceptance criteria:

- `Object.is` and reciprocal checks distinguish `-0`/`0` identically at thresholds 0, 1, and the default threshold boundary.
- Inferred and explicit integer/float columns preserve signed zero before/after filtering nulls and value-preserving transforms.
- Row/callback access and payload exporters agree between packed and unpacked frames; ordinary int32 boundary and overflow cases remain covered.

Verification: V1 column tests and coordinated frame/export regressions, V2, V3.

### Task JFB-04: Define A Bounded Shared-Reference Policy

Status: completed

Completion evidence:

- Method: read-only investigation via bounded `node --input-type=module` probes against existing `dist/index.mjs`; no source/test/CHANGELOG/task-file edits by investigator
- Result: current clone is O(2^k) detached expansion (13 distinct -> 8191 output, `left!==right`); cycles/depth paths correctly rejected; `JSON.stringify` always expands aliases (12-level DAG -> 53253 chars); naive memo would break alias identity and mishandle deep-second-path depth unless per-path revalidation added
- Recommendation: bounded expansion/work budget preserving detached semantics (Alt B) plus coordinated serialization budget in JFB-06; alias-preserving memo not recommended without breaking-change approval
- Follow-up: JFB-10 tracks implementation pending D1; investigation alone does not resolve resource risk

Kind: investigation

Priority: P1, a small programmatic DAG produces exponentially more containers during ingestion.

Suggested agent: iterative traversal/resource-safety specialist

Dependencies: none

Primary ownership: investigate `packages/json-frame/src/json.ts` and `packages/json-frame/test/parse/parse.test.ts`; record the decision and resulting follow-up scope here. Do not edit parser tests concurrently with JFB-02.

Finding: The clone uses an ancestor set for cycles but forgets completed containers. Repeated references to the same acyclic object are cloned independently on every path. A 13-container binary-sharing graph became 8,191 output containers in the bounded review probe, well below the depth ceiling. This is a residual breadth/work issue beyond completed JFH-03, not another recursive stack defect.

References:

- `packages/json-frame/src/json.ts:132-155`, `:159-202` (`createFrame`, `cloneJsonCompatible`).
- `packages/json-frame/test/parse/parse.test.ts:648-675`, `:788-821` test depth/cycles but not compact shared graphs.
- `packages/json-frame/README.md:247-263` makes post-ingestion alias identity observable through mutable cells.

Requirements:

1. Compare bounded alternatives: memoized clones preserving aliases, or a documented expansion/work budget that preserves detached occurrences within the budget. Record current alias behavior and the compatibility impact of either choice.
2. Do not implement naive identity memoization that bypasses cycle checks or accepts a shared subtree whose second, deeper path exceeds the depth limit. Analyze a subtree reached first shallowly and later near the maximum depth.
3. Include output serialization in the resource model: memoized ingestion can remain compact while `JSON.stringify()` expands every alias. Coordinate the chosen policy with JFB-06.
4. Use bounded sizes and deterministic visit/container counts, not an unbounded denial-of-service stress test. Do not introduce arbitrary row/column limits under this task.

Acceptance criteria:

- Evidence-backed recommendation states complexity, alias semantics, depth/cycle handling, and the interaction with serialization.
- Maintainer decision is recorded if alias identity or an input/work limit changes the public contract.
- If implementation is selected, append a uniquely numbered implementation task with ownership, dependencies, acceptance criteria, and verification before marking this investigation complete. The investigation alone does not resolve the resource risk.

Verification: bounded source/public-entry experiment with recorded counts and decision review; V1 parser tests if adding experiment coverage. No speculative fix is required to complete the investigation.

### Task JFB-05: Bound Diagnostic Key Preview Text

Status: completed

Completion evidence:

- Changed: `packages/json-frame/src/errors.ts`, `packages/json-frame/test/options-and-errors.test.ts`, `packages/json-frame/README.md`
- Verified: focused `test/options-and-errors.test.ts` (18/18 passed after rebuild); `pnpm --filter @web-ts-toolkit/json-frame test` (8 files / 159 tests passed); `pnpm exec eslint "packages/json-frame/**/*.{ts,js}"` (passed); `pnpm --filter @web-ts-toolkit/json-frame test:packed-consumer` (3/3 passed)
- Result: 5-key / 200-char preview budget with `truncated` marker; short-key content preserved; summaries frozen without `toJSON` invocation; scalar input-sized scope documented

Kind: defect

Priority: P2, the documented small-summary guarantee limits key count but not retained key text.

Suggested agent: diagnostic contract specialist

Dependencies: JFB-02, to serialize ownership of options/error tests

Primary ownership: `packages/json-frame/src/errors.ts`, `packages/json-frame/test/options-and-errors.test.ts`, diagnostic README/JSDoc.

Finding: `summarizeDiagnosticValue()` retains the first five object keys verbatim. One very long key creates a correspondingly large retained/serialized summary with `truncated: false`. The original object is no longer retained, so do not reopen the already-fixed container-retention defect.

References:

- `packages/json-frame/src/errors.ts:3`, `:35-51`.
- `packages/json-frame/test/options-and-errors.test.ts:86-112` uses short keys.
- `packages/json-frame/README.md:326-344` documents small frozen summaries.

Requirements:

1. Define a documented maximum key-preview text budget and indicate truncation when text, not only key count, is shortened. Preserve immutable summaries and useful counts.
2. Preserve the intentional scalar diagnostic-value policy. Explicitly distinguish bounds on container summaries from complete error size: scalar strings, paths, and column labels can still be input-sized unless separately changed.
3. Keep error construction free of user serialization-hook invocation. Note the cost of `Object.keys()` collecting all keys; do not claim construction is constant-space merely because retained previews are bounded.

Acceptance criteria:

- Long single-key and many-key cases have an asserted preview-size ceiling and correct truncation marker; short-key summaries preserve their current useful content.
- Array/object/cycle summaries remain frozen and do not retain caller containers or invoke their `toJSON` hooks.
- README and emitted diagnostic types accurately describe the resulting bounded scope.

Verification: V1 options/error tests, V2, V3, V4 for declaration/documentation changes.

### Task JFB-06: Enforce Serialization Validation After Cell Mutation

Status: completed

Completion evidence:

- Changed: `packages/json-frame/src/json.ts`, `packages/json-frame/src/frame/DataFrame.ts`, `packages/json-frame/src/types.ts`, `packages/json-frame/README.md`, `packages/json-frame/test/export/export.test.ts`
- Verified: focused `test/export/export.test.ts` (29/29 passed); `pnpm --filter @web-ts-toolkit/json-frame test` (8 files / 165 tests passed); `pnpm exec eslint "packages/json-frame/**/*.{ts,js}"` (passed); `pnpm --filter @web-ts-toolkit/json-frame test:packed-consumer` (3/3 passed)
- Result: `toJSONString()` validates exported payload with shared bounded traversal before native stringify; cycles/over-depth/sparse/non-JSON report structured errors with orient+path; valid nesting and cell identity preserved; hook limits documented
- Follow-up: breadth/work budget deferred to JFB-10; hook TOCTOU remains caller responsibility

Kind: defect

Priority: P2, `toJSONString()` violates its documented depth/structured-error contract through the supported shallow mutation boundary.

Suggested agent: serialization-boundary specialist

Dependencies: JFB-01, JFB-02, JFB-04; complete or explicitly account for any implementation task created by JFB-04 before sharing traversal policy

Primary ownership: `packages/json-frame/src/json.ts`, `packages/json-frame/src/frame/DataFrame.ts`, `packages/json-frame/test/export/export.test.ts`, serialization README/JSDoc.

Finding: Every branch of `toJSONString()` directly invokes native `JSON.stringify()` on an exported payload. Nested cells remain caller-mutable. Cycles introduced after ingestion leak native `TypeError` in all six orients, and over-depth cells can serialize despite the declaration's maximum-depth promise. Existing deep-export tests exercise schema metadata, not public cell mutation.

References:

- `packages/json-frame/src/frame/DataFrame.ts:138-151`.
- `packages/json-frame/src/export/payload.ts:351-358` shares nested cells.
- `packages/json-frame/src/types.ts:194-217`.
- `packages/json-frame/test/export/export.test.ts:378-421`.

Requirements:

1. Validate the complete selected output at the serialization boundary using shared bounded traversal logic before native serialization. Preserve shallow read/payload-export identity; do not impose deep immutability.
2. Define depth relative to the exported root, including orient-specific wrappers, and document that an input accepted at its own depth limit may require rejection in a deeper output layout.
3. Report cycles, over-depth containers, sparse arrays, and newly introduced non-JSON values as path-bearing package validation errors with the selected orient. Define caller-installed hook/accessor behavior without claiming to sandbox arbitrary JavaScript.
4. Incorporate JFB-04's resource decision. Avoid redundant full clones or an alias-preserving validator that still permits uncontrolled stringification expansion without documenting the remaining limit.

Acceptance criteria:

- Public mutation-based regressions cover all six orients for cycles and over-depth cells and get structured errors, not native stack/cycle errors.
- Exact depth boundary cases account for the final orient layout. Valid nested JSON still serializes without changing values or cell identity on subsequent reads.
- Invalid mutated bigint/undefined/non-finite/sparse values follow the documented policy; hook behavior is explicitly tested or scoped as caller responsibility.
- Existing table-metadata depth tests and shallow immutability controls remain green.

Verification: V1 export tests, V2, V3, V4. Record traversal/allocation evidence for any new full-output pass.

### Task JFB-07: Resolve Datetime Year-Range Semantics

Status: completed

Completion evidence:

- Method: read-only investigation; bounded package probes against `dist/index.mjs` plus pinned pandas 3.0.3 experiments (CPython 3.14.6); no source/test/CHANGELOG edits
- Result: `Date.UTC` maps years 0-99 to 1900-1999, falsely rejecting `0000/0001/0099` calendar-valid strings; pandas emits those years (us resolution) but `read_json(table)` read-back fails outside ns bounds; package currently neither calendar-complete nor pandas-verified
- Recommendation: calendar-only validation over `0000-01-01`–`9999-12-31` with documented ns read-back limitation (1972-leap-base `setUTCFullYear` or manual table; avoid naive base breaking Feb-29); D2 approval required before implementation
- Follow-up: implementation to be tracked separately after D2; investigation does not change runtime

Kind: investigation

Priority: P2, the validator rejects valid four-digit ISO years through an accidental JavaScript constructor rule, but the intended pandas-compatible range needs evidence.

Suggested agent: datetime/pandas interoperability specialist

Dependencies: JFB-03, to serialize column implementation/test ownership

Primary ownership: `packages/json-frame/src/frame/column.ts:152-177`, `packages/json-frame/test/frame/column.test.ts:86-95`, datetime contract documentation and bounded pandas read-back experiment.

Finding: `Date.UTC()` interprets years 0-99 as 1900-1999. Comparing the resulting year with the parsed four-digit value rejects `'0099-01-01'` while later years avoid this adjustment. README promises pandas-style naive ISO strings but states no explicit range; pandas output dtype/resolution may impose different limits than calendar syntax.

References:

- `packages/json-frame/src/frame/column.ts:152-177` (`isPandasNaiveIsoDatetime`).
- `packages/json-frame/README.md:284-291`.
- Historical JFH-08 completion evidence in `docs/tasks/20260823-152151-json-frame-health-review-remediation.md` only tests modern dates.

Requirements:

1. Separate calendar validity from pandas generated-table compatibility. Probe years 0000, 0001, 0099, 0100, modern leap/non-leap boundaries, and representative pandas lower/upper range cases in the pinned environment.
2. Recommend either an explicit supported range or calendar-only validation with a documented interoperability limitation. Do not silently broaden acceptance while continuing to imply every accepted string has been verified with pandas.
3. If a fix is approved, append an implementation task that avoids `Date.UTC`'s special year adjustment, covers invalid calendar dates, and updates runtime/docs/release evidence together.

Acceptance criteria:

- Recorded package and pandas results distinguish syntax/calendar errors from dtype/range failures.
- An explicit recommendation and any maintainer decision resolve the range question; selected implementation is separately tracked with concrete boundary tests.
- No investigation completion is presented as an implemented date fix.

Verification: V7 bounded read-back experiments and evidence review; V1 column tests if adding regression characterization.

### Task JFB-08: Measure And Reduce Export And Wide-Schema Overhead

Status: completed

Completion evidence:

- Changed: `packages/json-frame/src/export/payload.ts`, `packages/json-frame/src/frame/column.ts`, `packages/json-frame/src/frame/DataFrame.ts`, `packages/json-frame/test/benchmark/jfh-07.benchmark.test.ts`, `packages/json-frame/test/export/export.test.ts`
- Verified: V5 `bench:jfh-07` (passed with JFH-07 + JFB-08 lines); V1 column/DataFrame/export/benchmark (4 files / 67 tests passed); V2 `pnpm --filter @web-ts-toolkit/json-frame test` (8 files / 169 tests passed); V3 eslint (passed)
- Result: exporters build directly from stored accessors with preflight before copies; rejected exports use zero materialization/reads; wide schema lookups use per-operation Set (linear rename timings); JFB-06 validation preserved; no time-threshold assertions

Kind: improvement

Priority: P3, avoidable allocations and quadratic lookup patterns are visible, but their user impact and improvement have not been measured.

Suggested agent: performance/maintainability specialist

Dependencies: JFB-01, JFB-03, JFB-06, JFB-07 and any selected column/serialization implementation follow-ups

Primary ownership: `packages/json-frame/src/frame/column.ts`, `packages/json-frame/src/frame/DataFrame.ts`, `packages/json-frame/src/export/payload.ts`, `packages/json-frame/test/benchmark/jfh-07.benchmark.test.ts`, focused operation-counter tests.

Finding: All six public payload exporters first materialize full columns, then allocate final output containers. Typed columns undergo `Array.from()` plus a second array copy in `freezeArray()`. Predictable option/index errors are checked after this materialization. Table schema lookup also uses `columns.includes()` per field, yielding quadratic membership work for wide frames. The existing transform benchmark uses values-origin frames, an all-retained filter, and already sorted sort input, so it does not characterize these costs.

References:

- `packages/json-frame/src/frame/DataFrame.ts:114-135`, `:456-457`.
- `packages/json-frame/src/frame/column.ts:359-362`, `:379-388`.
- `packages/json-frame/src/export/payload.ts:306-315` (late preflight).
- `packages/json-frame/test/benchmark/jfh-07.benchmark.test.ts:12-45`.

Requirements:

1. Record before/after time and allocation-relevant counters for packed/unpacked tall exports, wide short table ingestion/rename, and rejected exports. Keep all-retained/already-sorted cases as controls; add partial/empty filters and reverse/tie-heavy sorting.
2. If measurements justify it, build final payloads directly from stored-column accessors and move predictable preflight validation ahead of full cell copies. Keep validation required by JFB-06 intact.
3. Replace repeated schema membership scans with a single per-operation membership set if evidence supports the change. Preserve JFB-01's index/data identity separation.
4. Keep pure output builders and one clear storage boundary; remove a superseded materialization parameter/helper only if it has no remaining use. Do not add caching, lazy storage, public instrumentation, or new dependencies.

Acceptance criteria:

- Reproducible measurements identify which changes help; retain no claimed optimization based solely on intuition.
- Deterministic counters show rejected exports avoid full-column materialization and successful exporters avoid unnecessary intermediate cell copies if those changes are selected.
- Wide-table lookup scales with field/column counts rather than their product after any membership optimization.
- Values, row/column order, key collisions, schema metadata, shallow identity, and fresh structural output containers remain unchanged. No brittle elapsed-time thresholds enter correctness tests.

Verification: V5 recorded baseline/after evidence, V1 affected tests, V2, V3. A measured no-change/defer conclusion is acceptable if rationale and residual costs are recorded.

### Task JFB-09: Perform Independent Integration And Contract Review

Status: blocked

Completion evidence:

- Reviewed: all JFB-01..08 verdicts pass via public-root reproduction; source types, both declaration formats, CJS/ESM, README agree; encapsulation preserved; no new runtime deps/files; CHANGELOG.md untouched
- Verified: V2 `pnpm --filter @web-ts-toolkit/json-frame test` PASS (8 files / 169 tests); V3 eslint PASS; V4 `test:packed-consumer` PASS (3/3); V7 pinned pandas 3.0.3 read-back PASS for JFB-01 table plus JFB-07 emission/read-back asymmetry recorded; V6a `pnpm lint` PASS; V6b `pnpm build` PASS; V6c `pnpm test` FAIL unrelated pre-existing `@web-ts-toolkit/express-runtime test/watch-supervisor.test.ts` ERT-B07 timeout (package worktree clean, flaky subprocess, not caused by this work); json-frame suite re-passed after full build
- Deferrals: D1 shared-reference budget (proposed JFB-10 not yet created, residual P1); D2 datetime range (residual P2); website `website/docs/packages/json-frame.md` stale on new validation/diagnostic guidance; release-note disposition open
- Blocker: strict V6 green requires unrelated `packages/express-runtime` ERT-B07 pass outside this scope; no action taken on unrelated worktree

Kind: improvement

Priority: P2, focused fixes must compose correctly across storage, metadata, serialization, and the installed public surface.

Suggested agent: independent reviewer who did not implement JFB-01/JFB-03/JFB-06

Dependencies: JFB-01 through JFB-08 and every implementation follow-up selected by the investigations

Primary ownership: acceptance evidence in this file; review `packages/json-frame`, relevant website/release documentation, and packed artifacts. Do not perform a broad implementation rewrite.

Finding: Current tests passed despite the reproduced boundary defects. Integration must test combined behavior rather than infer correctness from individual unit suites.

References: `packages/json-frame/package.json:32-41`, `packages/json-frame/test/packed-consumer.test.ts`, `packages/json-frame/test-decl-consumer`, `AGENTS.md`, all task evidence above.

Requirements:

1. Independently reproduce each corrected defect through the public package root and audit task acceptance evidence. Review raw/programmatic inputs, all six orients, packed/unpacked storage, transform composition, and mutable nested cells.
2. Verify source public types, both declaration formats, CJS/ESM runtime, README, website guidance, and release notes agree. Preserve constructor/state encapsulation and reject unintended deep-import/public-instrumentation additions.
3. Run package and packed checks, relevant pinned pandas experiments, then repository checks serially. Record unrelated pre-existing failures without changing unrelated work to force green results.
4. Review any new investigation-generated tasks. Explicitly record accepted deferrals and resource/interoperability risks; unresolved required verification stays blocked.

Acceptance criteria:

- All required task outcomes have changed-file and verification evidence; no confirmed defect is described as fixed merely because an investigation or document completed.
- Regression coverage detects the original schema, label-validation, signed-zero, diagnostic, and serialization failures.
- Published package entrypoints and strict installed-consumer workflows remain valid; no new runtime dependencies or unintended files are shipped.
- V2, V3, V4, applicable V7, and V6 pass, or the task remains blocked with exact prerequisites and unverified criteria.

Verification: V2-V4, applicable V7, then V6; independent evidence review.

## Agent Sequencing

- Initial parallel ownership: JFB-01 frame/export schema, JFB-02 parser/options, and JFB-03 column storage. JFB-03 must wait to edit shared frame/export test files until JFB-01 releases them.
- JFB-04 can investigate read-only alongside those tasks; queue parser regression edits behind JFB-02. Its decision precedes serialization design.
- JFB-05 follows JFB-02. JFB-07 follows JFB-03. JFB-06 follows schema/parser work and the shared-reference decision.
- JFB-08 follows correctness and selected investigation implementations; JFB-09 is last and independently owned.
- README, public types, website documentation, this task file, and generated outputs are shared hotspots. The coordinator serializes updates; agents can supply requested prose/type changes to that owner rather than editing concurrently.
- Only one agent runs build/test commands at a time, including when code ownership is disjoint.

## Decisions And Deferrals

- D1, JFB-04: alias-preserving cloning versus bounded expansion, with serialization implications. Blocks final shared-traversal implementation, not unrelated correctness tasks.
- D2, JFB-07: calendar-valid versus pandas-range datetime contract. Blocks the chosen datetime implementation until evidence and any required maintainer approval are recorded.
- JFB-01 should preserve existing valid rename/export behavior. A new rename restriction requires a separate maintainer decision if the internal correction proves impractical.
- Optional literal-aware `select()` typing was already mentioned in JFH-05 and is not duplicated here. Dynamic `select`/`rename` currently return conservative row types; that is a discoverability tradeoff, not a newly confirmed runtime defect.
- Streaming, row/column quotas, deep freezing, and full Table Schema semantic enforcement remain out of scope. Applications still need their own input-size and trust boundaries; depth safety alone is not a universal memory budget.

## Definition Of Done

Every selected implementation task has a regression or justified alternative, acceptance evidence, required documentation, and passing verification. Investigations have an evidence-backed decision and explicitly tracked implementation or deferral. The independent integration task confirms runtime/type/documentation agreement and records all residual risks. Saving this plan completes the requested review deliverable, not the remediation work.
