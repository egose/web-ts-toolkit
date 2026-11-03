# DEP-02 migration ledger and verification handoff

Related task: [document-permission dependencies, DEP-02](../../../tasks/20261103-003636-access-router-document-permission-dependencies.md).
Provenance: IMPLEMENT-02, sequential after IMPLEMENT-01; no agents spawned, commits or pushes.
This is implementation evidence, not independent acceptance or a baseline claim.
The coordinator owns task statuses. Existing DEP-01 source and three focused test
files were inspected and preserved; historical tasks/artifacts were not rewritten.

## Migration decisions

- Normal read/list, related target, owning parent, pre-/post-write, utility and
  raw-helper fixtures now attach private inputs to their actual document hook.
  Existing callback, request binding, stage/count, security and non-leakage assertions
  remain. The focused DEP-01 tests also cover missing values, malformed definitions,
  explicit exclusions, both hydration/source modes and coherent capture mutation.
- `include-source-provenance.integration.test.ts`: dotted profile inputs become
  the whole persisted `profile` container. Its private/sibling denial assertions
  remain; selection/authorization still filter each output branch.
- `include-permission-metadata.integration.test.ts`: its hook actually interprets
  persisted metadata. Declare the top-level metadata container (including `auth`
  for a nested metadata path); do not fetch `secret` merely to preserve the former
  global option. The deferred selected secret remains governed by computed facts.
- `service-authorization-projection.unit.test.ts`: the mixed update/read plan
  fetches update's `status`, not read's `ownerId`, while retaining the selected
  update virtual's independent `internalNote` dependency. The compaction-only case
  uses planner `extraPersistedFields` instead of inventing permission hooks, and
  still strips virtual paths and checks parent/child Mongo projection collisions.
- `virtuals-projection-planner.unit.test.ts`: removed empty old-option defaults.
  A denied, unselected virtual now adds no `address` dependency; private planner
  inputs still cannot force a virtual/candidate. Existing selected-virtual cases
  and the new focused doc-dependency cases cover actual dependency expansion.
- `virtuals-baseline.contract.test.ts` and `virtuals-populate-include.integration.test.ts`:
  private `internalNote` now drives the real `hasNote` decision on target `name`.
  Both still check that note is fetched/usable but never emitted, with an unrelated
  denied secret control. The former also covers targets with no virtual definitions.
- `service-authorization-final-review.integration.test.ts`: a document hook consumes
  scalar Mixed `marker` to authorize selected `status`, and asserts the exact private
  value seen by that hook. A selected `markerKind` virtual consumes the array container
  in the array case. Both preserve a privately fetched ancestor behind a descendant-only
  grant. Virtual input may see an already-shaped public container; do not assert a raw
  scalar there. Scalar non-leakage, array positions, safe descendants, null handling
  and raw-helper controls remain. Invalid null/false
  document definitions are no longer a way to disable default: the existing row-hook
  null/false test uses a valid exact empty-fact callback for that separate purpose.
- `service-authorization-finalizer.unit.test.ts`: selected `notePresent` consumes
  the private note; this preserves the unrequested additive-grant/non-fabrication
  probe without falsely declaring a dependency on an unrelated owning hook.
- `authorization-fast-path-runtime.unit.test.ts`: the adapter intentionally
  over-returns an unselected huge/cyclic/proxy graph. No hook consumes it, so remove
  the forced fetch and retain the non-observation/native-copy assertions.
- `owned-authorization-consumers.unit.test.ts`: existing virtual dependencies
  already exercise no-query/no-getter raw helpers and query/shape parity. Remove
  unrelated forced fields, retaining every assertion and the actual virtual input.
- `retained-model-service-ownership.integration.test.ts`: the diagnostic hook reads
  `name`, not `secret`; declare `name`. The later field-helper denial no longer
  requires clearing an unrelated global fetch list. Original runtime/actor/connection
  ownership assertions remain.
- `request-hook-concurrency.test.ts`: hooks consume `key`, not the include FK
  `parent`; declare `key`. Include transport still manages its own association input,
  with original ordering, bounded work and hook-count assertions.
- `finalizer-preparation.unit.test.ts`: instrumentation follows the central
  hook/dependency resolver instead of the retired generic hook lookup. It still
  asserts one finalizer preparation per call and one hook invocation per row.
  Added an exact custom-access control; a dotted access string does not traverse
  function-attached properties and instead uses default. Accessor non-execution
  and denial assertions remain. Virtual-hardening's rejection regex follows the
  shared dependency validator's wording without changing its rejection oracle.
- Decorator integration retains `@DocPermissions` and explicit parameter/host
  injection. Before serving, wrap the registered callable with `{ dependsOn, get }`.
  README demonstrates that same public-runtime pattern; no new decorator API or
  descriptor-member edit support was invented.
- Maintained benchmark fixtures use descriptors on current artifacts. The shared
  **benchmark-only** `documentPermissionFixtureOptions` retains explicit historical
  setup for artifacts without the descriptor export, so sealed old comparisons are
  not silently changed. This is not a package runtime/type/setter alias. All existing
  full-response and actual-hook-count oracles remain. A focused script test covers
  both shapes and captured dependency-array ownership.

## Public package contract

- README/MIGRATION/llms and website configuration/hooks/services explain direct,
  function, access/default/custom shapes, `get` spelling, top-level persisted keys,
  whole nested containers, missing-input invocation, exact-active-access-only
  resolution, no output permission, whole-definition setters and stage boundaries.
- The descriptor type adds property-level JSDoc for installed `get`/`dependsOn`
  hovers. Decorator `DocPermissions` JSDoc explains the wrapper pattern and correct
  default fallback.
- **Targeted type correction beyond DEP-01:** descriptor dependency keys use
  `AccessRouterFieldKey<NoInfer<TModel>>`. The first full run demonstrated that
  untyped `api.setModelOptions('Employee', ...)` inferred a model containing only
  `ownerId` from dependencies, rejecting the unrelated valid salary/bonus/allowance
  permission fields (TS2353). Dependency names must validate a known model, not
  infer the entire shape. The public declaration fixture now pins the untyped call
  and still rejects unknown/dotted dependencies on explicitly typed models.
  This changes type inference only; no runtime behavior was changed by IMPLEMENT-02.
- The focused declaration fixture is included in strict staged and actual packed
  consumers for Bundler/NodeNext/Node16 ESM/CJS conditions, root and advanced exports.
  It covers contextual hook arguments/this, function/direct/map/default/custom and
  fluent/dotted definitions, rejects unknown/dotted keys and `getter`, and rejects
  removed option/default/fluent/dotted/bulk API use with `@ts-expect-error`.
- Export tests inspect both emitted declaration conditions, named type exports,
  property hovers, exact descriptor members and absent old property/fluent setter.

## Verification record

Commands use repository-root working directory unless specified. Runtime `TMPDIR`
and `WTT_BENCH_TMP` pointed at a fresh ignored repository-local `_tmp*` directory;
`git check-ignore` confirmed it. Builds/package tests are serialized.

Final results (exact commands/protocol in [VERIFICATION.md](VERIFICATION.md)):

| Check | Result |
| --- | --- |
| `pnpm --filter @web-ts-toolkit/access-router test` | 190 files / **6,131 tests passed**, including actual packed tarball/artifact-tree ESM/CJS consumers, all 13 packed tests and 49 strict-consumer tests |
| `pnpm --filter @web-ts-toolkit/access-router typecheck` | passed, including serialized transitive build |
| `pnpm --filter @web-ts-toolkit/access-router-deco test` | 23 files / **742 tests passed**, including exact README workflow compile/runtime |
| Focused final regression command | 6 files / 169 tests passed |
| Installed MIGRATION first-example compile | 1 passed / 80 unselected |
| Final `npm pack --dry-run --json` (package cwd) | passed; 19 entries inspected, shipped guides + matching ESM/CJS declarations, no src/test tree |
| Emitted declarations | all three new names at root/advanced, `get`/`dependsOn` JSDoc + `NoInfer` retained in both conditions; no old-option declaration text |
| Scoped ESLint | 84 changed/new TS/MJS files passed (includes DEP-01 files) |
| Changed benchmark syntax | all 6 scripts passed `node --check` |
| Dedicated dependency-fixture + batch benchmark tests | 10 passed |
| Current benchmark smoke | isolated/trusted public correctness + structural probes, four native READ/LIST jobs and two real-Mongo main-worker document-rule jobs passed |
| `git diff --check` | passed |

The first package run had 6,113 passes / 17 failures. Ten traced to the type-inference
defect above; the rest were resolver instrumentation/access-fallback expectations,
the shared virtual-validator diagnostic text, and the new scalar virtual assertion.
They were corrected and the full command rerun successfully. No baseline was claimed.

## Reviewer limits and remaining work

- DEP-03 owns independent review and final workspace build/test/lint; not duplicated here.
  The coordinator still owns task status reconciliation. No required DEP-02 check is
  left failing or unverified.
- A broader benchmark-unit command produced **51 passes / 2 failures**: the sealed
  historical build was not supplied via `WTT_BENCH_LEGACY_ROOT`, and another test opens
  the retired `src/acl/unsafe-snapshot-options.ts` file. Those tests were not rewritten
  or labeled baseline. Current drivers were independently smoke-tested as above;
  historical artifact execution and timing/performance acceptance were not verified.
- An initial ad hoc main-worker smoke reused the same process across two jobs and
  hit Mongoose `OverwriteModelError` on the second job. Reran with the driver's actual
  separate-child-per-job protocol: both modes passed. No library fix was appropriate.
- Remaining old-option mentions outside historical evidence are deliberate removal/
  negative assertions, plus the explicitly historical **benchmark-only** fixture path.
  `packages/access-router/src/` has no old-option reference or fallback.
- Scratch consumers, dependencies, Mongo files, generated tarballs/instrumented builds
  and uncurated logs were reviewed and are disposable, not archived. This is a curated
  summary/protocol, not a standalone reproduction bundle; maintained tests/scripts
  and repository dependencies are required. No credentials, session IDs or local
  absolute paths are preserved. Historical tasks/artifacts were left unchanged.
