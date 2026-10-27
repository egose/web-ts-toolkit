# Moo: persisted derived fields

Created: 2026-10-26 (`20261026-122137`, generated with `date +%Y%m%d-%H%M%S`).

Status: completed — DF-01 through DF-05 completed. The second completion audit's
pending-default persistence and managed-version-key findings are fixed and verified.

## Objective

Add opt-in Mongoose schema field metadata and a `derivedFieldsPlugin` to
`@web-ts-toolkit/moo`. Functions declared beside a persisted schema path compute
values that are saved in the same document and can be searched, filtered, sorted,
and indexed using ordinary MongoDB queries.

This is a separate use case from access-router's response-only virtuals. Moo owns
the document computation lifecycle and has no runtime dependency on access-router.

## Agreed dependency behavior

For an existing document and a descriptor with explicit dependencies, recomputation
is requested by a dependency modification, explicit target change, or an actual
pending default write to a dependency/target:

| Recompute requested? | All dependencies available? | Behavior                                                      |
| -------------------- | --------------------------- | ------------------------------------------------------------- |
| No                   | Either                      | Skip computation and preserve the persisted derived value.    |
| Yes                  | Yes                         | Recompute and save the result with the source changes.        |
| Yes                  | No                          | Reject before persistence; do not invoke the affected getter. |

- Available means selected by the query, or explicitly replaced on the hydrated
  document before saving. Query selection and Mongoose modification tracking must
  distinguish these cases; `value !== undefined` is not an availability check.
- A selected field that is genuinely absent is available with value `undefined`.
  A stored `null` is also a known value. The getter and ordinary schema validation
  decide whether those values are valid.
- Excluded fields remain unavailable even if defaults/getters could manufacture a
  value. A modification to one child must not prove a whole object/array available.
- New documents compute from their supplied/defaulted values, then validate.
- A target omitted from the projection does not itself request recomputation.
- An explicitly changed derived target is recomputed rather than accepted as an
  arbitrary override; the same missing-input rejection applies to that operation.
- A non-null default Mongoose queues for persistence counts as a write even when
  `isModified()` is false (including `''`, `0`, and `false`). Null/undefined defaults
  alone do not write. Pending target defaults request recomputation; mere absence
  without a write request still skips. Pending defaults never prove excluded input
  availability and can require rejection on an otherwise unrelated save.
- A rejected save leaves the database unchanged by that save. The in-memory
  document retains application assignments; no in-memory rollback is promised.

## Initial API and execution contract

Canonical field syntax:

```ts
fullName: {
  type: String,
  index: true,
  derived: {
    dependsOn: ['firstName', 'lastName'],
    get: (doc) => `${doc.firstName ?? ''} ${doc.lastName ?? ''}`.trim(),
  },
}
```

1. Export `derivedFieldsPlugin`, a typed descriptor/getter surface, and a
   structured missing-dependency error. Provide a typed authoring helper if
   necessary to preserve contextual input, dependency-name, and result checking
   without globally weakening Mongoose schema option types.
2. Support `derived: { dependsOn, get }` as the canonical form. Support a bare
   function as conservative recompute-every-save shorthand: because its inputs
   are undeclared, require every supported non-derived input path to be available.
   Spell out this projection behavior in shipped documentation.
3. Start with root scalar persisted target/dependency paths. Validate and reject
   unsupported nested/container/Mixed paths rather than silently accepting an
   incomplete implementation. Reject self/derived-to-derived dependencies,
   malformed options, unknown names, immutable targets, and duplicate plugin
   registration at schema registration time. Record exact supported scalar types
   and any justified refinement in DF-01 evidence.
4. Getters may return a value or promise, including `undefined` to clear a field.
   Give them an isolated read-only plain persisted view, without populated
   document substitutions or access-router/request context. Stage computation
   before applying results; implicit getter mutations must not change source
   fields or sibling getter inputs.
5. Compute before normal document validation so required/type/custom validators
   see the derived result. Getter failures reject the operation. Assign results
   through Mongoose's setters/casting. Document validation, `save()`, and
   `Model.create()` must agree. Account explicitly for validation-disabled saves,
   repeated validation/saves, and save middleware ordering.
6. No implicit database fetch for omitted dependencies. No persistence during
   reads, response finalization, or ordinary property access.
7. Initial write coverage is hydrated document `save()` and `Model.create()`.
   Query updates/replacements, `insertMany()`, `bulkWrite()`, raw-driver writes,
   and `validateSync()` do not gain document-middleware guarantees. Document this
   boundary precisely, including repair/backfill and concurrent-write concerns;
   do not claim automatic all-writer consistency.
8. Match existing root/grouped plugin exports and add the conventional direct
   `@web-ts-toolkit/moo/plugins/derived-fields` subpath, with matching bundled CJS,
   ESM, and declaration build entries. Preserve optional Keycloak peer isolation.

## Sequential tasks

No implementation subagents run concurrently. Each task consumes and verifies the
previous task's output before starting. Update this file with actual evidence,
decisions, and unresolved issues as work completes. Do not commit or publish.

### DF-01 — Typed definitions, schema discovery, and dependency planning

Status: completed.

- Add the public getter/descriptor/error/helper definitions and internal schema
  discovery/planning logic in `packages/moo/src/plugins/derived-fields*`.
- Validate/snapshot options at registration and define scalar path eligibility.
- Implement new/existing document eligibility, explicit replacement detection,
  selected-but-absent handling, target changes, shorthand semantics, and missing
  dependency preflight independently of persistence hooks.
- Add meaningful focused planner/configuration tests and run the applicable
  package build/type checks and focused tests. Tests may import internal source
  while the public runtime entry is assembled in DF-02/03.
- Record changed files, API decisions, and exact verification results below.

### DF-02 — Document lifecycle and persisted behavior

Status: completed. Consumed DF-01 and verified the document lifecycle against real MongoDB.

- Implement the public plugin with validation/save lifecycle integration and
  isolated, staged, asynchronous computation.
- Cover real MongoDB persistence/search, creation, dependency updates, partial
  projections, wholly omitted unchanged dependencies, explicitly supplied
  excluded values, selected absent/null values, hidden schema paths, and
  target projections/assignments.
- Test rejection before persistence, unchanged in-memory assignments after
  rejection, getter/casting/validation failures, clearing values, repeat saves,
  shorthand, and validation-disabled saves.
- Use existing Mongo test infrastructure. Verify supported operation boundaries
  with tests that demonstrate the documented contract rather than assuming hook
  coverage. Run focused behavior tests serially with any prerequisite build.
- Record evidence and any integration corrections needed below.

### DF-03 — Published exports, docs, and installed consumer gates

Status: completed. Consumed DF-01/DF-02; published entries, declarations, docs,
and installed Mongoose 8/9 consumer checks passed.

- Wire root/grouped/direct exports and `package.json` / `tsup.config.ts` together.
- Add JSDoc, a self-contained README example and behavior table, update `llms.txt`
  and website moo documentation consistently.
- Extend existing export/strict typed/packed-consumer gates to cover the new API,
  invalid dependency/result types, ESM/CJS import forms, and Mongoose 8/9.
- Build and inspect emitted declarations and package contents; run appropriate
  consumer checks. Keep all temporary fixtures within ignored repository-local
  directories and record repo-relative evidence only.

### DF-04 — Independent integration review and final verification

Status: completed. Independent sequential review, three fixes with regressions,
and all required final gates passed after DF-03 completion.

- A final sequential subagent reviews all changes against this contract, corrects
  discovered defects, and adds focused regressions only when warranted.
- Run `pnpm --filter @web-ts-toolkit/moo test`,
  `pnpm --filter @web-ts-toolkit/moo exec tsc --noEmit`, and `pnpm lint`.
- Keep workspace/package test builds serialized as required by `AGENTS.md`.
- Inspect final diff/status for unrelated changes, generated artifacts, and
  accidental fixtures. Record actual results and any remaining blockers.
- Mark the overall task complete only after required verification passes.

### DF-05 — Second completion audit: defaults and managed metadata

Status: completed. Reopened after the user's request for another completion review;
the default-write corrections, verified version-key restriction, and final gates passed.

- A second audit reproduced two missing cases against the built public entry:
  - An existing document hydrated without a source field receives its schema
    default. `isModified(source)` is false, yet Mongoose queues that default in
    `$set` when saving an unrelated field. The plugin currently skips the getter,
    allowing the source default and stale derived result to be persisted together.
  - An existing document missing a derived target can likewise persist the target's
    fallback default without running its derivation.
- Add real MongoDB regressions first, then account for actual pending default
  writes in scheduling/preflight. Preserve the agreed behavior for genuinely
  unchanged projected-out fields and for missing targets without pending writes.
  Projected-out manufactured defaults must never prove dependency availability.
  Include null/undefined defaults, repeats, and validation-disabled saves as needed
  to distinguish values Mongoose actually writes from inert default metadata.
- Inspect the similarly late-managed schema version key: if a root target or
  explicit dependency is accepted but Mongoose subsequently replaces/increments
  it, either handle it correctly or reject the unsupported metadata configuration
  explicitly. Verify behavior before claiming a finding.
- Use one sequential subagent for the focused correction/review, preserving the
  previous agents' work and concurrent access-router changes. Update public docs
  and types only as required by the verified behavior.
- Record failing-then-passing regression evidence, run the full moo package test,
  source typecheck, repository lint, and diff/cleanup checks after corrections.
  Mark the overall task complete again only after all requirements pass.

## Completion evidence

### Planning

- Inspected moo's public/plugin entrypoints, package/build metadata, existing
  MongoDB tests and typed/packed consumer infrastructure, repository task-file
  conventions, and access-router's relevant save/virtual descriptor behavior.
- Working tree was clean before this task file was created.
- At the planning handoff, implementation/build/runtime verification had not yet
  run for this feature.

### DF-01 — Definitions and dependency planner

- Changed files:
  - `packages/moo/src/plugins/derived-fields.ts`
  - `packages/moo/src/plugins/derived-fields/definitions.ts`
  - `packages/moo/src/plugins/derived-fields/registration.ts`
  - `packages/moo/src/plugins/derived-fields/planner.ts`
  - `packages/moo/test/derived-fields-schema.test.ts`
  - `packages/moo/test/derived-fields-planner.test.ts`
  - `packages/moo/test/derived-fields.types.ts`
  - This task file.
- Public source entry exposes `DerivedFieldInput<TModel>` (readonly partial raw
  model), `DerivedFieldGetter<TModel, TValue>` (`this: void`, sync/async value or
  `undefined`), `DerivedFieldDescriptor`, `DerivedFieldDefinition`,
  `DerivedFieldDependencyIssue`, `DerivedFieldsDependencyError`, and
  `defineDerivedField<TModel, TTargetKey>(definition)`. The helper checks dependency
  names, partial/readonly plain input, and the target property's result type
  without Mongoose augmentation. Error code is
  `MOO_DERIVED_FIELDS_MISSING_DEPENDENCIES`; frozen `issues` contain only
  `{ targetPath, missingPaths }`.
- Supported paths are root persisted **String, Number, Boolean, Date, ObjectId,
  Decimal128, and BigInt** schema-type instances. Binary/Buffer/UUID and BSON
  Double/Int32 representations are deliberately outside this initial plain-input
  contract, as are unknown custom kinds, Union, Mixed, nested paths,
  subdocuments, arrays, and maps. Unsupported ordinary fields can coexist but are
  not getter inputs. Immutable targets (including `_id` and conditional immutable
  functions), virtual targets/dependencies, self/other-derived dependencies,
  malformed/duplicate dependencies, and duplicate registrations are rejected.
  Empty `dependsOn: []` is valid for creation/explicit-target-change constants.
- `registerDerivedFields(schema)` validates/discovers once and freezes descriptor,
  getter-reference, and input-path snapshots. Nested/container metadata is found
  and rejected, including recursive schemas and Mongoose 9 Union members. A
  `Symbol.for` registration marker also rejects duplicates across bundled entries.
  Register after defining paths; later schema/option edits do not change snapshots.
- DF-02 integration: `planDerivedFields(registration, document,
{ knownReplacedPaths? })` returns frozen `{ fields, availablePaths,
replacedPaths }`. Registered fields contain `{ targetPath, mode:
'dependencies' | 'always', dependsOn, get }`; registration also contains
  `inputPaths`. Planning performs aggregate missing-input preflight before any
  getter, assignment, or I/O. Build each isolated plain getter view from
  `availablePaths` only (supported non-derived scalars), depopulate references,
  bypass getters/virtuals/transforms, and stage getter results before assignment.
  Retain `replacedPaths` per hydrated document across successful-save dirty-state
  resets; pass them back as `knownReplacedPaths` while those replacements remain
  in memory. Lifecycle hooks/computation remain DF-02.
- Installed Mongoose **9.9.2** was probed using ignored repo-local
  `_tmp-moo-derived-fields/` fixtures, then the probe files were removed. Findings
  are covered by hydrated-document regressions: selected absent/null values are
  available; `applyDefaults()` can manufacture excluded defaults without proving
  availability; explicit excluded `undefined` and same-default assignments are
  direct replacements; child modifications and excluded numeric `$inc()` are not
  replacements. Dotted/operator projections are conservative, and boolean `_id`
  exclusion is handled despite Mongoose's numeric-only selection special cases.
  The planner reads `$__.selected`/`$__.primitiveAtomics` rather than calling
  `getChanges()`, whose delta generation can change versioning state. Mongoose 8
  installed-consumer verification remains part of DF-03.
- Verification (all feature checks passed; no database needed):
  - `pnpm --filter @web-ts-toolkit/moo... build` — passed; utils then moo builds
    completed serially, including CJS/ESM/declarations for current build entries.
  - `pnpm --filter @web-ts-toolkit/moo exec vitest run --config ../../vitest.config.ts --maxWorkers=1 test/derived-fields-schema.test.ts test/derived-fields-planner.test.ts`
    — passed, **2 files / 97 tests**.
  - `pnpm --filter @web-ts-toolkit/moo exec tsc --noEmit --lib ES2022` — passed.
  - `pnpm --filter @web-ts-toolkit/moo exec tsc --ignoreConfig --noEmit --target ES2018 --lib ES2022 --module ESNext --moduleResolution Bundler --strict --skipLibCheck --esModuleInterop --types node test/derived-fields.types.ts test/derived-fields-schema.test.ts test/derived-fields-planner.test.ts`
    — passed, including all negative `@ts-expect-error` assertions.
  - `pnpm exec eslint packages/moo/src/plugins/derived-fields.ts packages/moo/src/plugins/derived-fields packages/moo/test/derived-fields-schema.test.ts packages/moo/test/derived-fields-planner.test.ts packages/moo/test/derived-fields.types.ts`
    — passed.
- Existing verification constraint for the later agents:
  `pnpm --filter @web-ts-toolkit/moo exec tsc --noEmit` fails with **TS2550** at
  `packages/utils/src/hasOwn.ts:10`: moo's ES2018 default library does not include
  the transitive source's `Object.hasOwn`. The explicit ES2022-library source and
  strict fixture checks above pass; no unrelated config/utilities were edited.
  No commit or publishing was performed. At the DF-01 handoff, DF-02/03/04 remained pending.

### DF-02 — Document lifecycle and persisted behavior

- Changed files for this step:
  - `packages/moo/src/plugins/derived-fields.ts` — adds the named plugin source export.
  - `packages/moo/src/plugins/derived-fields/lifecycle.ts` — public plugin, document
    middleware, staged async computation, same-save checkpoint, replacement state.
  - `packages/moo/src/plugins/derived-fields/snapshot.ts` — isolated scalar views.
  - `packages/moo/test/derived-fields-plugin.test.ts` — **49** real MongoDB behavior
    tests using `test/setup.ts` / `useMongoTestDatabase()`.
  - This task file. DF-01 definitions, registration, planner, and tests are preserved.
- Public source API is now `derivedFieldsPlugin<TRawDocType>(schema:
Schema<TRawDocType>): void`, alongside all DF-01 helper/type/error exports from
  `src/plugins/derived-fields.ts`. Use `schema.plugin(derivedFieldsPlugin)` before
  model compilation. Root/grouped/direct **published** entries, package metadata,
  build entries, README, website, and consumer gates remain DF-03.
- Integration consumes the frozen DF-01 registration/plans without changing their
  interfaces. Aggregate dependency preflight precedes every getter. Each getter
  gets a separately frozen plain object built only from available supported inputs;
  results are awaited/staged before any target assignment, then applied with
  `doc.set()`. `undefined` clears the target. Getter failures propagate unchanged;
  Mongoose's recorded target cast/setter errors are surfaced as its structured
  validation error even when save validation is disabled. Ordinary required/custom
  validation observes the computed/cast result.
- Snapshots read current raw scalar values with getters disabled and use
  `populated(path)` for persisted reference ids, including population-to-null and
  String/Number/ObjectId ids. No `toObject()`/`toJSON()`, virtuals, transforms,
  defaults application, or implicit fetch is used. Unavailable manufactured defaults
  are omitted. New-document defaults already applied by Mongoose remain usable.
  Dates, ObjectIds, and Decimal128 values (including their backing bytes) are cloned
  between the document, the baseline snapshot, and every getter. Returned mutable
  scalars are cloned as well so a retained getter view cannot mutate a saved target.
- A per-registration `WeakMap` retains full excluded-input replacement availability
  on the same hydrated document after successful saves clear dirty tracking.
  Application source/target assignments are retained on rejection; database state
  stays unchanged by the rejected save. No rollback of already applied computed
  targets after casting/custom-validation failure is promised.
- Same-save computation reuse is tied to Mongoose's actual `$__.saveOptions`
  object, watched dependency values, computed target values, and scheduled-field
  coverage. Thus ordinary save validation plus pre-save does not invoke getters
  twice when inputs/results are unchanged. Separate `validate()` calls and saves
  are separate operations; dirty explicit dependencies/targets recompute, unchanged
  explicit fields skip, and bare getters recompute every operation. A regression
  exposed that restoring an overridden target to its original persisted value can
  clear its dirty flag; the checkpoint now accepts already-computed fields dropping
  out of the plan, while newly scheduled fields invalidate reuse.

#### Lifecycle/ordering decisions for DF-03 documentation

- Define all paths and register **source-mutating pre-validation and pre-save
  middleware before the plugin**, then compile the model. Standalone async
  validation computes in this plugin's pre-validation position, before ordinary
  validators. Source changes in earlier pre-validation hooks are included.
- When an earlier pre-save hook changes a source or target after save's initial
  validation, the plugin re-enters normal document validation and recomputes;
  required/custom/type validators see that new result. The save's explicit
  `validateModifiedOnly` setting is preserved. This can legitimately invoke a
  getter again when actual inputs/results changed.
- With schema-level or per-save `validateBeforeSave: false`, pre-save still
  preflights/computes/casts but deliberately skips required/custom validation.
  Getter, dependency, and target casting failures still reject before persistence.
- Getters and validators must avoid mutating the hydrated document via captured
  references, and dependency descriptors must declare their actual source inputs.
  Source/target mutations in later validation hooks/validators are not a standalone
  validation guarantee. Save attempts one revalidation when it observes changes;
  if they are still unstable afterward, it rejects with an ordering error before
  writing. Tests cover both later pre- and post-validation mutations.
- **Later pre-save hooks are outside the guarantee.** A deliberate regression test
  demonstrates that a source mutation registered after the plugin can persist with
  the earlier derived value. Do not claim arbitrary later-hook coverage or complete
  middleware-order independence. Register mutators before this plugin instead.
- Mongoose's earlier timestamp pre-save hook is covered: a dependency on `updatedAt`
  recomputes after the timestamp is assigned/updated. On a new document the first
  validation still sees pre-save-unset timestamps; a getter/validator requiring a
  nonempty result must accommodate that initial state or have its source assigned
  before validation. Ordinary Mongoose modification tracking still applies to
  application changes (for example, mark in-place Date mutations modified).
- Guaranteed writes remain hydrated `save()` / `Model.create()`, plus computation
  during ordinary async document validation. Query updates/replacements and raw
  writes do not compute. Installed Mongoose **9.9.2** happens to invoke async
  document validation for default `insertMany()` and `bulkWrite` insertOne, so those
  paths compute incidentally; `insertMany({ lean: true })`, bulk `skipValidation`,
  and bulk updates bypass it. `validateSync()` never invokes the getters. Tests
  demonstrate these actual differences; do not promise insertMany/bulkWrite-wide
  consistency. Middleware bypass and restricted `pathsToSave` are also outside the
  save contract. Concurrent writers and backfill/repair guidance remain DF-03 docs.

#### Verification and handoff

- Prerequisite `pnpm --filter @web-ts-toolkit/moo... build` — **passed**, utils then
  moo serially, before the focused tests. Current build entries intentionally do
  not include the new feature until DF-03; source type checks and source-import
  integration tests cover it here. No concurrent tsup builds were run.
- Final focused command:
  `pnpm --filter @web-ts-toolkit/moo exec vitest run --config ../../vitest.config.ts --maxWorkers=1 test/derived-fields-schema.test.ts test/derived-fields-planner.test.ts test/derived-fields-plugin.test.ts test/new-document-plugin.test.ts test/model-function-plugin.test.ts`
  — **passed, 5 files / 151 tests**: 97 unchanged DF-01 tests, 49 new lifecycle
  tests, and 5 existing neighboring plugin tests. The integration tests cover indexed
  search/sort, real persistence, create/save/validate repetition, partial/all-input
  projections, retained replacements including null/undefined, hidden/defaulted
  paths, target selection/overrides, aggregate preflight, isolated populated/BSON
  inputs, throwing getters, casting/required/custom failures, rejected-save state,
  clearing, shorthand, disabled validation, middleware ordering, timestamps,
  `validateModifiedOnly`, and operation boundaries.
- `pnpm --filter @web-ts-toolkit/moo exec tsc --noEmit --lib ES2022` — **passed**.
- `pnpm --filter @web-ts-toolkit/moo exec tsc --ignoreConfig --noEmit --target ES2018 --lib ES2022 --module ESNext --moduleResolution Bundler --strict --skipLibCheck --esModuleInterop --types node test/derived-fields.types.ts test/derived-fields-schema.test.ts test/derived-fields-planner.test.ts test/derived-fields-plugin.test.ts`
  — **passed**, including DF-01 negative authoring assertions and the integration tests.
- `pnpm exec eslint packages/moo/src/plugins/derived-fields.ts packages/moo/src/plugins/derived-fields packages/moo/test/derived-fields-schema.test.ts packages/moo/test/derived-fields-planner.test.ts packages/moo/test/derived-fields-plugin.test.ts packages/moo/test/derived-fields.types.ts`
  — **passed**.
- `git diff --check` — **passed**; final `git status --short` was reviewed with
  concurrent unrelated access-router work preserved.
- Development failures were corrected before completion: two initial Mongo tests
  encountered Mongoose 9.9.2's `applyDefaults()` exclusion-projection bug (`fields`
  is undefined while `exclude` is true). Manufactured-default coverage uses a real
  inclusive projection, while an independent ordinary hidden-path query still
  proves hidden dependency rejection. The expanded hook test found/fixed the
  checkpoint dirty-flag issue above. Test BigInt syntax and a validation overload
  call were adjusted to pass strict ES2018-target/ES2022-library checks.
- Vitest emits the existing Vite config-loader warning, and Mongoose 9 warns about
  the intentionally exercised `validateSync()` deprecation; all final checks pass.
  The DF-01 bare `tsc --noEmit` ES2018-lib/transitive `Object.hasOwn` constraint
  remains unchanged; explicit `--lib ES2022` was used. Mongoose 8/9 installed
  consumer verification, published entries, and full package/repo gates remain
  DF-03/04. No agents were spawned and no commit or publishing was performed.
- Concurrent access-router source/tests and `docs/tasks/*access-router*` work were
  not edited, reset, or staged. DF-02 is complete; the overall task is not complete.

### DF-03 — Published exports, documentation, and installed consumer gates

- Changed paths for this step (all repo-relative):
  - `packages/moo/package.json`
  - `packages/moo/tsup.config.ts`
  - `packages/moo/tsconfig.json`
  - `packages/moo/src/plugins/index.ts`
  - `packages/moo/src/plugins/derived-fields/definitions.ts`
  - `packages/moo/src/plugins/derived-fields/lifecycle.ts`
  - `packages/moo/README.md`
  - `packages/moo/llms.txt`
  - `website/docs/packages/moo.md`
  - `packages/moo/test/derived-fields-plugin.test.ts`
  - `packages/moo/test/package-exports.test.ts`
  - `packages/moo/test/moo.packed-consumer.test.ts`
  - `packages/moo/test/moo.typed-consumer.test.ts`
  - `packages/moo/test/support/packed-consumer-harness.ts`
  - This task file.
- The existing root `export * from './plugins'` now exposes the plugin, helper,
  error, and all five authoring/issue types through the updated grouped barrel.
  Added `@web-ts-toolkit/moo/plugins/derived-fields` with matching bundled CJS,
  ESM, `.d.ts`, and `.d.mts` outputs. `bundle: true` is preserved. Keycloak stays
  direct-subpath-only with its existing optional-peer policy. The integration
  suite now imports the **built public root** (`dist/index.mjs`), while internal
  planner/configuration tests retain their source imports.
- Inspected `dist/index.d.ts`, `dist/plugins/index.d.ts`, and both direct-entry
  declaration formats. Root/grouped re-exports resolve to the shipped direct
  declarations with explicit `.js`/`.mjs` specifiers; helper generics, partial
  readonly input, sync/async target-specific results, stable error code, path-only
  issues, and API JSDoc all survive emission. The helper's second generic is named
  `TTargetKey` for editor clarity. No runtime feature correction was needed for
  installed Mongoose 8/9.
- README has a complete typed root-import example using
  `defineDerivedField<User, 'fullName'>` and `schema.plugin(derivedFieldsPlugin)`,
  MongoDB querying/indexing, direct/grouped import discovery, the agreed dependency
  table, actual absence versus unselected inputs, explicit replacements, shorthand,
  async isolated inputs, clearing/errors, supported scalar scope, registration
  restrictions, ordering, validation-disabled saves, and precise write exclusions.
  `llms.txt` and website docs agree, including earlier pre-save revalidation,
  later-hook limits, captured-input mutation restrictions, incidental bulk-insert
  validation, explicit backfill, and ordinary multi-writer concurrency with
  `optimisticConcurrency` guidance. No all-writer consistency is claimed.
- Adapted the existing packed harness rather than introducing another install
  framework. It now enumerates all **10 public entries** and creates pack stages
  under `_tmp-moo-packed-*` and installs under `_tmp-moo09-*-consumer-*`, all ignored
  and repo-local. Release-like manifests/tarballs use the existing publisher rewrite;
  tests verify the new JS/declaration files, README/llms, no package test fixtures,
  and no placeholder/workspace dependency values in the published manifest.
- Installed runtime tests exercise **root/grouped/direct ESM and CJS package-name
  imports** on Mongoose **8.24.7** (`^8.24.0`) and **9.11.4** (`^9.8.0`). They cover
  asynchronous required-validation results, plain inputs/property-getter bypass,
  unchanged omitted dependencies/targets, selected absence/null, excluded full
  replacements including undefined and retained availability, target overrides,
  hidden/manufactured defaults and same-default assignments, dotted/operator
  projections, boolean `_id` exclusion, relative `$inc()` rejection, undefined
  clearing, shorthand's hidden/`_id` requirements, and cross-entry duplicate
  registration. These installed metadata checks require no database; DF-02's real
  MongoDB integration suite was separately exercised against the built root here.
- Strict NodeNext installed `.mts` and `.cts` consumers compile with
  `skipLibCheck: false` for the core API on both Mongoose majors. Positive/negative
  authoring gates cover dependency/target names, sync/async/bare result types,
  partial/readonly/plain getter inputs, no document `this`, nullable inputs,
  undefined results, all public authoring types, and immutable error issues.
  Unsuppressed wrong-dependency/async-result fixtures fail as expected on both
  majors. Existing optional Keycloak full-declaration checks still use their
  documented upstream `skipLibCheck: true` exception; derived/core declarations
  are always checked separately with it **false**. Runtime/typed matrices pass
  without Keycloak and with current `^0.14.0` / floor `0.12.1` peers.

#### Verification and handoff

- `pnpm --filter @web-ts-toolkit/moo... build` — **passed**, utils then moo,
  including the new direct entry in CJS/ESM/declarations. No simultaneous tsup
  build commands were run.
- `pnpm --filter @web-ts-toolkit/moo exec tsc --noEmit` — **passed**. Added only
  moo's `compilerOptions.lib: ["ES2022"]` to resolve the previously recorded
  transitive `Object.hasOwn` default-library mismatch. ES2018 source target stays
  unchanged; the package runtime is Node >=22. No utils/root configuration edits.
- `pnpm --filter @web-ts-toolkit/moo exec vitest run --config ../../vitest.config.ts --maxWorkers=1 test/package-exports.test.ts test/moo.packed-consumer.test.ts test/moo.typed-consumer.test.ts test/derived-fields-schema.test.ts test/derived-fields-planner.test.ts test/derived-fields-plugin.test.ts test/new-document-plugin.test.ts test/model-function-plugin.test.ts`
  — first run: **7 files / 166 tests passed**, one new export test failed because
  Vite cannot resolve variable dynamic imports spanning nested path segments.
  Replaced that test's imports with explicit public-entry imports. The five
  planner/lifecycle/neighboring suites passed **151 tests** (49 real MongoDB
  derived-field tests); the strict installed compiler gate passed **4 tests**.
- Final export/packed command:
  `pnpm --filter @web-ts-toolkit/moo exec vitest run --config ../../vitest.config.ts --maxWorkers=1 test/package-exports.test.ts test/moo.packed-consumer.test.ts`
  — **passed, 2 files / 12 tests** (3 export tests, 9 packed gates). Thus all
  **8 selected files / 167 tests** passed across final applicable runs.
- Installed-version evidence:
  `pnpm --filter @web-ts-toolkit/moo exec vitest run --config ../../vitest.config.ts --maxWorkers=1 --reporter=verbose test/moo.packed-consumer.test.ts --testNamePattern="core-only package-name imports|runs every subpath on Mongoose 8"`
  — **passed, 2 tests** (7 unselected), reporting Mongoose **9.11.4** without
  Keycloak and **8.24.7** with Keycloak **0.12.1**. This narrow replay captured
  resolved versions that the default reporter had hidden.
- `pnpm --filter @web-ts-toolkit/moo exec tsc --ignoreConfig --noEmit --target ES2018 --lib ES2022 --module ESNext --moduleResolution Bundler --strict --skipLibCheck --esModuleInterop --types node test/derived-fields.types.ts test/derived-fields-schema.test.ts test/derived-fields-planner.test.ts test/derived-fields-plugin.test.ts test/package-exports.test.ts test/moo.packed-consumer.test.ts test/moo.typed-consumer.test.ts`
  — **passed**, including source authoring negatives and changed test code.
- `pnpm exec eslint packages/moo/src/plugins/index.ts packages/moo/src/plugins/derived-fields.ts packages/moo/src/plugins/derived-fields packages/moo/tsup.config.ts packages/moo/test/package-exports.test.ts packages/moo/test/derived-fields-plugin.test.ts packages/moo/test/moo.packed-consumer.test.ts packages/moo/test/moo.typed-consumer.test.ts packages/moo/test/support/packed-consumer-harness.ts`
  — **passed** after final test corrections. `git diff --check` — **passed**.
- Harness `afterAll` cleanup removed all DF-03 pack stages, tarballs, and isolated
  installs. Directory inspection confirmed none of its temporary prefixes remain;
  the earlier `_tmp-moo-derived-fields/` directory is empty. Ignored build outputs
  remain available for DF-04. Existing Vite config-loader and intentionally tested
  Mongoose `validateSync()` deprecation warnings are unchanged.
- No agents were spawned and nothing was staged, committed, or published.
  Concurrent access-router code, tests, and task documents were preserved.
  No remaining DF-03 blocker was found. **DF-03 is complete; DF-04's independent
  review/full moo test/repo lint gates and overall completion remain pending.**

### DF-04 — Independent integration review and final verification

- Read `AGENTS.md` and this full task before marking DF-04 in progress. Reviewed
  all five internal feature modules, the public source/barrels, every feature
  schema/planner/Mongo/authoring regression, package/build metadata, emitted
  root/grouped/direct declarations, installed-consumer harness/tests, README,
  `llms.txt`, and website documentation against the agreed contract. Existing
  access-router changes/task files were identified as concurrent unrelated work.
- Found and fixed three concrete gaps without changing the public API:
  1. **Excluded assignments after a prior successful save:** Mongoose's saved-state
     equality check can erase dirtiness for an explicit excluded `undefined` or
     same-default assignment. Inputs then incorrectly failed dependency preflight;
     an excluded `undefined` target assignment could silently skip recomputation
     and its required preflight. Lifecycle now observes full scalar assignments
     with schema setters and restores their write intent before planning, excluding
     defaults/population, query scopes, failed casts, relative `$inc()`, and the
     plugin's own result assignments. Real MongoDB regressions verify source
     clearing is actually persisted, both validation modes work, same-default
     replacement remains distinct from applying a default, availability survives
     another save, and excluded target overrides require every input.
  2. **New documents with constructor projection metadata:** absent/defaulted inputs
     used successfully during insertion could become unavailable on the next save
     after dirty flags reset. Lifecycle now retains the complete new-document
     input availability. Two MongoDB regressions cover known absence and a default,
     followed by a changed-source save. Shipped docs/JSDoc describe that retention.
  3. **Foreign BSON ObjectId aliasing:** Mongoose accepts ObjectIds from BSON's ESM
     constructor without recasting them to its CJS constructor. `instanceof`-only
     snapshot copying leaked mutable source/sibling/result storage. Scalar cloning
     now recognizes supported BSON brands and copies their bytes into owned
     ObjectId/Decimal128 instances. The installed public root/grouped/direct ESM/CJS
     runtime matrix now tests genuinely distinct BSON constructors, hostile getter
     mutation, sibling isolation, and mutation of a retained returned ObjectId.
     Assertions inspect bytes and assign the ObjectId's `id` property, so BSON
     versions with copying `id` getters cannot accidentally hide the defect.
- Regression evidence before fixes:
  - `pnpm --filter @web-ts-toolkit/moo exec vitest run --config ../../vitest.config.ts --maxWorkers=1 test/derived-fields-plugin.test.ts test/moo.packed-consumer.test.ts --testNamePattern='earlier save|earlier unrelated save|new-document input availability|core-only package-name imports'`
    — **6 new MongoDB regressions failed** as expected (missing-input errors or a
    silently accepted target assignment); 2 selected tests passed, 56 skipped.
  - After strengthening the BSON mutation probe,
    `pnpm --filter @web-ts-toolkit/moo exec vitest run --config ../../vitest.config.ts --maxWorkers=1 test/moo.packed-consumer.test.ts --testNamePattern='core-only package-name imports'`
    — **failed as expected**, with zeroed document-source ObjectId bytes on installed
    Mongoose 9.11.4. Harness cleanup also ran on this failing test.
- Affected gates after fixes:
  - `pnpm --filter @web-ts-toolkit/moo... build && pnpm --filter @web-ts-toolkit/moo exec vitest run --config ../../vitest.config.ts --maxWorkers=1 test/derived-fields-plugin.test.ts test/derived-fields-planner.test.ts test/derived-fields-schema.test.ts test/moo.packed-consumer.test.ts`
    — **passed, 4 files / 161 tests**, including **55** real MongoDB lifecycle tests,
    **97** schema/planner tests, and **9** installed package/runtime/declaration gates.
    Utils/moo builds ran serially; installed Mongoose 8/9 and optional-peer matrices
    passed with the fixes. Only documentation/JSDoc was clarified afterward.

#### Final gates and completion

- DF-04 changed paths:
  - `packages/moo/src/plugins/derived-fields/lifecycle.ts`
  - `packages/moo/src/plugins/derived-fields/planner.ts`
  - `packages/moo/src/plugins/derived-fields/snapshot.ts`
  - `packages/moo/test/derived-fields-plugin.test.ts`
  - `packages/moo/test/moo.packed-consumer.test.ts`
  - `packages/moo/README.md`, `packages/moo/llms.txt`, and
    `website/docs/packages/moo.md`
  - This task file.
- Final verification, run serially after the implementation/docs corrections:
  - `pnpm --filter @web-ts-toolkit/moo exec tsc --ignoreConfig --noEmit --target ES2018 --lib ES2022 --module ESNext --moduleResolution Bundler --strict --skipLibCheck --esModuleInterop --types node test/derived-fields.types.ts test/derived-fields-schema.test.ts test/derived-fields-planner.test.ts test/derived-fields-plugin.test.ts test/package-exports.test.ts test/moo.packed-consumer.test.ts test/moo.typed-consumer.test.ts`
    — **passed**, explicitly compiling the non-runtime authoring fixture and all
    its positive/negative assertions, plus changed test code.
  - `pnpm --filter @web-ts-toolkit/moo test` — **passed, 18 files / 308 tests**.
    The command rebuilt utils then moo serially, including all public CJS/ESM and
    declaration entries. This full-package run includes **55** real MongoDB
    derived-field lifecycle tests, **97** schema/planner tests, **9** packed
    consumer gates, **4** strict installed-authoring gates, and the existing
    neighboring package suites. Installed Mongoose 8/9 ESM/CJS/runtime/NodeNext
    matrices and optional Keycloak isolation passed. The completed full-package
    run and explicit authoring compile were retained across the session
    interruption; neither was redundantly rerun.
  - `pnpm --filter @web-ts-toolkit/moo exec tsc --noEmit` — **passed**, no diagnostics.
  - `pnpm lint` — **passed**, repository-wide ESLint with no diagnostics, including
    the concurrent access-router work present at verification time.
  - `git diff --check` — **passed**. Reviewed targeted feature diffs/status and
    directly read the untracked feature files (which `git diff --stat` omits).
    Rechecked the emitted direct `.d.mts` contract/JSDoc after the final build.
- Harness cleanup removed every DF-04 `_tmp-moo-packed-*` stage/tarball and
  `_tmp-moo09-*-consumer-*` install, including those from deliberate failing probes.
  Final root-directory inspection found none remaining; the pre-existing
  `_tmp-moo-derived-fields/` directory is empty. No accidental fixture, lockfile,
  workspace manifest, or tracked build-output changes leaked. Ignored build outputs
  remain available. `git diff --cached --stat` is empty.
- All edits were confined to the feature paths listed above. Concurrent unrelated
  access-router source/tests/docs/task files were preserved. No subagents were
  spawned; nothing was staged, committed, published, or pushed.
- No remaining blocker was found. The documented initial scalar scope, required
  middleware ordering, query/bulk/validateSync/pathsToSave exclusions, validation-
  disabled required/custom-validator bypass, explicit backfill, and normal
  multi-writer concurrency boundaries remain accurate. Existing Vite config-loader
  and intentionally exercised Mongoose validateSync deprecation warnings are
  informational only. **DF-04 and the overall derived-fields task are complete.**

### DF-05 — Pending defaults and managed version keys

- Read `AGENTS.md` and this entire task before changes. Inspected definitions,
  registration, planner, lifecycle, and scalar snapshot modules, existing public-root
  MongoDB tests, shipped docs/declarations, and the packed-consumer infrastructure.
  DF-01 through DF-04 evidence above is retained as historical verification; this
  section supersedes the previous overall-completion claim.
- Confirmed two default-write defects against **real MongoDB** using the built
  public root before editing implementation:
  - `packages/moo/test/derived-fields-plugin.test.ts:393-426`: selected source
    defaults persisted with the old result despite `isModified(source) === false`.
    This includes `''`, `0`, and `false`, not just truthy string defaults.
  - `packages/moo/test/derived-fields-plugin.test.ts:428-504`: target fallback
    defaults were persisted without derivation; applying defaults to excluded
    sources on unrelated saves overwrote stored inputs with manufactured values
    while preserving stale results. Target default writes also bypassed missing-input
    preflight. Assertions inspect the raw collection after each attempted save.
- Inspected installed Mongoose **9.9.2** dirty/delta generation and probed actual
  changes. Its default-write rules exclude `_id`, `null`, and `undefined`; falsy
  non-null defaults write. Explicit numeric-0 projection exclusions suppress default
  deltas, while defaults manufactured for omitted inclusive-projection paths can
  write. `applyDefaults()` still has the previously recorded exclusion-projection
  bug; regressions use supported real inclusive queries. Production never calls
  `getChanges()`, `$getChanges()`, or private delta generation.
- Fixed scheduling at
  `packages/moo/src/plugins/derived-fields/lifecycle.ts:121-136` and
  `packages/moo/src/plugins/derived-fields/planner.ts:32-36,74-85`: lifecycle derives
  actual pending default writes from public `$isDefault()`, getter-disabled raw
  scalar reads, and the existing isolated projection metadata. The planner consumes
  internal optional `pendingWritePaths` solely for scheduling, separately from full
  replacements/availability. Every scheduled target is preflighted before any
  getter. Defaults remain supported; selected defaults compute normally, excluded
  manufactured defaults require explicit replacement/selection, and inert nullish
  defaults preserve existing results/missing targets. Same-save caching and repeated
  successful saves stop recomputing once the pending writes are cleared.
- Independently demonstrated the version-key defect with
  `node _tmp-moo-derived-fields/df05-version-probe.mjs` against real MongoDB before
  the registration correction (temporary probe removed afterward). For both `__v`
  and custom `revision`, a validated derived target of **14** was overwritten with
  **0** on insertion. An explicit version dependency persisted `derived:undefined`
  with version **0**, then an optimistic-concurrency save recomputed `derived:0`
  while the same write persisted version **1**. This is Mongoose's post-pre-save
  management, not ordinary source-mutating middleware ordering.
- Registration now rejects the configured managed version key as a target or
  explicit dependency and excludes it from all input views/shorthand requirements
  (`packages/moo/src/plugins/derived-fields/registration.ts:128-130,171-173,190-193`).
  Default, explicitly configured `__v`, and custom version-key registration are
  covered. `versionKey: false` retains ordinary scalar target/dependency support;
  real create/update saves and projected shorthand saves cover both names at
  `packages/moo/test/derived-fields-plugin.test.ts:1025-1072`.
- Added **28 real MongoDB tests** (24 defaults, 4 version boundaries), **7 schema
  tests**, and **1 planner test**; original 55 MongoDB/97 schema-planner regressions
  all remain passing. Defaults cover selected/excluded source/target values, raw
  getter bypass, actual writes versus null/undefined metadata, normal and
  `validateBeforeSave: false` saves, repeat saves/validation, preflight rejection,
  and explicit same-default replacement recovery. Existing packed runtime checks
  were extended in place for root/grouped/direct ESM/CJS imports on installed
  Mongoose 8/9; their existing strict NodeNext declaration gates also pass. No
  additional install harness was introduced.

#### Regression and final-gate evidence

- Before implementation fixes:
  - `pnpm --filter @web-ts-toolkit/moo exec vitest run --config ../../vitest.config.ts --maxWorkers=1 test/derived-fields-plugin.test.ts --testNamePattern='pending default writes'`
    — **16 failed, 8 passed, 55 skipped**, as expected. Raw collection failures
    prove stale source/results, direct fallback writes, and excluded-source overwrite.
  - `pnpm --filter @web-ts-toolkit/moo exec vitest run --config ../../vitest.config.ts --maxWorkers=1 test/derived-fields-plugin.test.ts test/derived-fields-schema.test.ts --testNamePattern='version key|version-like'`
    — **8 failed, 3 passed, 140 skipped**, as expected (missing registration rejection
    and managed-version input exposure); disabled-versioning controls passed.
- After corrections:
  - `pnpm --filter @web-ts-toolkit/moo... build && pnpm --filter @web-ts-toolkit/moo exec vitest run --config ../../vitest.config.ts --maxWorkers=1 test/derived-fields-plugin.test.ts test/derived-fields-planner.test.ts test/derived-fields-schema.test.ts test/moo.packed-consumer.test.ts`
    — **passed, 4 files / 197 tests**: 83 MongoDB tests, 105 schema/planner tests,
    and 9 packed consumer gates. Utils/moo builds were serialized.
  - `pnpm --filter @web-ts-toolkit/moo exec tsc --ignoreConfig --noEmit --target ES2018 --lib ES2022 --module ESNext --moduleResolution Bundler --strict --skipLibCheck --esModuleInterop --types node test/derived-fields.types.ts test/derived-fields-schema.test.ts test/derived-fields-planner.test.ts test/derived-fields-plugin.test.ts test/package-exports.test.ts test/moo.packed-consumer.test.ts test/moo.typed-consumer.test.ts`
    — **passed**, including positive/negative authoring assertions. The first run
    identified widened `_id: unknown` from computed-key test schema inference;
    explicit raw-model test generics corrected it without casts or API changes.
  - `pnpm --filter @web-ts-toolkit/moo test` — **passed, 18 files / 344 tests**
    (previously 308). Includes all 83 real MongoDB feature tests, 105 schema/planner
    tests, 9 packed runtime/NodeNext gates, 4 strict installed authoring gates, and
    neighboring suites. Installed Mongoose 8 (`^8.24.0`) / 9 (`^9.8.0`) and optional
    Keycloak matrices passed. The final test command rebuilt all public CJS/ESM/
    declaration entries with utils then moo serially.
  - `pnpm --filter @web-ts-toolkit/moo exec tsc --noEmit` — **passed**.
  - `pnpm lint` — **passed**, repository-wide with no diagnostics.
  - `git diff --check` — **passed**. Reviewed changed source/tests/docs and emitted
    `packages/moo/dist/plugins/derived-fields.d.mts`; readonly plain-input and
    lifecycle JSDoc preserve the default-write/version-key contract after build.

#### Changed paths, API boundaries, and cleanup

- DF-05 changed only:
  - `packages/moo/src/plugins/derived-fields/definitions.ts`
  - `packages/moo/src/plugins/derived-fields/registration.ts`
  - `packages/moo/src/plugins/derived-fields/planner.ts`
  - `packages/moo/src/plugins/derived-fields/lifecycle.ts`
  - `packages/moo/test/derived-fields-plugin.test.ts`
  - `packages/moo/test/derived-fields-schema.test.ts`
  - `packages/moo/test/derived-fields-planner.test.ts`
  - `packages/moo/test/moo.packed-consumer.test.ts`
  - `packages/moo/README.md`, `packages/moo/llms.txt`, `website/docs/packages/moo.md`
  - This task file.
- Public exports, helper/error/type signatures, snapshot staging, casting, and
  getter isolation remain intact. The verified runtime scope refinement is the
  managed-version-key restriction; defaults are supported ordinary schema behavior.
  README/website behavior tables and llms/JSDoc now distinguish pending writes from
  genuinely unchanged fields. Scalar scope, no implicit fetch, middleware ordering,
  document-write guarantees, unsupported write paths, explicit backfill, and normal
  multi-writer concurrency remain the intentional boundaries.
- The ignored `_tmp-moo-derived-fields/` probe directory is empty. Harness cleanup
  removed all `_tmp-moo-packed-*` stages/tarballs and `_tmp-moo09-*-consumer-*`
  installs, including failed-run fixtures. Root/status inspection found no DF-05
  fixture, manifest/lockfile, or tracked generated artifact leakage; unrelated
  concurrent access-router work and its task documents were preserved.
  `git diff --cached --stat` is empty. No agents were spawned; nothing was staged,
  committed, published, or pushed. Required checks were not redundantly repeated
  after passing. Existing Vite loader/intentional validateSync warnings remain
  informational. **DF-05 and the overall derived-fields task are complete.**
