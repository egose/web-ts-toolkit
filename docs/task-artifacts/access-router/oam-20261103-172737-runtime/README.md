# OAM-03: authenticated post-write output runtime handoff

## Delivered status

**OAM-03 implementation and V1 verification passed.** IMPLEMENT-03, 2026-11-03,
on the existing `c68451e` worktree with coordinator-reconciled OAM-01/OAM-02 changes.
No unresolved OAM-03 implementation blocker was observed. This is not independent
acceptance of the whole feature: OAM-04 integration/guidance and OAM-05 review remain.

Read [AGENTS.md](../../../../AGENTS.md), the entire
[task](../../../tasks/20261103-172737-access-router-output-authorization-modes.md),
[accepted design](../oam-20261103-172737-design/README.md),
[configuration handoff](../oam-20261103-172737-config/README.md), and task/artifact
conventions. The coordinator-owned task/status, design/config artifacts and design
scratch were not edited. No subagents, commits, publication, dependency changes or
overlapping build/test/typecheck commands were used.

## Runtime changes

Paths below are relative to `packages/access-router/`:

- `src/acl/service-execution.ts`: dedicated root write-entry issuer and private
  execution origin; canonical workers derive an authenticated output child with
  the same capture, intent, family and publication, without another publication
  owner. Generic execution construction cannot issue that phase, even when given
  a genuine UPSERT parent. Query tokens remain bound to their exact input execution.
- `src/acl/service-authorization.ts`: private write-entry/output-branch records,
  captured CREATE/UPDATE selection, canonical UPSERT-create propagation, and target
  READ/LIST selection on authenticated output edges. Initiating operations and
  row/virtual/output/document-hook tuples are unchanged. No input facts are carried
  to the child. Embedded ownership and write-origin detachment provenance survive
  related derivation, including isolated custom-access target stages.
- `src/acl/document-stage.ts`: both write modes always use the existing bounded,
  native-aware materializer to acquire an ordinary detached source. Successful
  `toObject` is not an ownership certificate; conversion failure at this boundary
  poisons publication with a controlled error rather than lending `_doc`.
  Earlier helpers/lifecycle conversion retain their contracts. The same registry,
  source/original/reference maps, stage evaluator and finalizer remain in use.
- `src/services/service.ts`: real CREATE/UPDATE/UPSERT workers plan/populate using
  the output child, but continue input admission, hydrated pre-update hooks,
  validation, preparation, transform/save and lifecycle processing on the input
  execution. Output source admission remains after lifecycle processing. Only
  authenticated write-output targets absorb the isolated-parent/trusted-target
  redundant pre-copy; query-origin pre-copy is unchanged.
- `src/services/public-service.ts`: public UPSERT enters through the genuine write
  issuer. Both modes are captured before identifier/existence awaits; branch
  semantics, terminal denial and allowed ID-miss behavior are unchanged.

Exactly the existing four `*AuthorizationMode` settings remain. No alternate names,
public output capability, extra read/save, retry-write or rollback was added.
DELETE/COUNT/DISTINCT/NEW, raw helpers, dedicated subdocuments and unsupported root
origins gain no trusted write-output eligibility. Target READ/LIST mode selection
does not grant related operation/row/field authority.

## Regression and deterministic omitted-work evidence

New maintained files:

- `test/write-output-authorization.unit.test.ts`: **40 tests**, private origin,
  receiver/scope/branch/stage/publication authentication, exact query-token binding,
  source reuse, plain/hydrated candidates, live-storage conversion, legacy fallback
  candidates, native normalization/storage mutations, exotic/proxy/accessor/cycle/
  depth/slot rejection, exact scalar/array/dotted reference identity and excluded
  count attachments.
- `test/write-output-modes.unit.test.ts`: **47 tests**, real direct/public workers,
  both UPSERT branches with opposite captured modes, denial/ID-miss, pre/post-update
  facts/input invariance with all four settings trusted, bulk per-row facts and
  embedded inheritance, independent nested READ/LIST calls, await-time mode/hook/
  dependency changes, native/payload/prepared-input/snapshot isolation, full-source
  bounds, conversion failure and draining failed bulk publication after storage.
- `test/write-output-populate.unit.test.ts`: **49 tests**, mixed parent/target
  modes, READ/LIST/custom access, scalar/array/dotted paths, shared target hook-once
  caching, attachment/native independence, equal IDs with distinct policies/facts,
  target-before-parent getters, target denial and preregistered depleted recipients.
- `test/write-output-test-fixture.ts`: reuses the existing owned-stage fixture with
  deterministic document/save/persistence adapters; these are real service workers,
  not mocked finalizers or configured-mode-only assertions.

Extended existing suites:

- `test/authorization-fast-path-options.integration.test.ts`: preserves READ/LIST
  independence/input capture assertions, observes the new private entry issuer,
  and checks real response mutation versus stored values through basic/advanced
  CREATE/UPDATE HTTP and root entries.
- `test/document-permissions-dependencies.integration.test.ts`: both write modes
  preserve independently captured pre/post-update and CREATE output descriptors.
- `test/virtuals-populate-dependencies.integration.test.ts`: both modes cover direct/
  public CREATE/UPDATE and all UPSERT branches with selected virtuals, target trimming,
  private argument-four native mutation isolation and shared populated bulk targets.
- `test/owned-authorization-stage.unit.test.ts`: NEW and dedicated reads/writes retain
  their negative boundaries even with CREATE/UPDATE settings trusted.

Deterministic assertions, not a timing claim:

1. An ordinary write-stage source is distinct from the candidate in **both** modes.
   Isolated performs one source materialization plus one disposable hook-view
   materialization; trusted performs the same mandatory source materialization and
   **zero additional hook-view copies**. Trusted hook input equals the stage source;
   isolated hook input does not. Include preparation reuses that exact source.
2. Shared populated targets finalize once per plan, then receive independent copies
   per attachment. Whole target copy counts are one mandatory source in trusted,
   versus source plus disposable view in isolated, including an isolated parent /
   trusted target. Parent source/native values and live targets remain unchanged.
3. Database-backed private-dependency bulk CREATE retains separate row facts/views
   while the one shared public target resolves once. Private input mutation does not
   change a sibling getter's inputs or persisted target values.

No throughput/speedup or universal acceptance/cost equivalence is asserted. A write
without an exposed document hook may save no copy. Mandatory full write-source
admission can reject a hidden graph that a trusted query never visits. Native/
conversion method bodies and arbitrary callback closures are not sandboxed.

## Verification actually run

All commands ran serially from repository root. Node `v26.12.1`, pnpm `11.18.0`,
Vitest `4.1.11`; installed dependencies and MongoDB memory-server prerequisites
were available. No install was run.

Fresh scratch `_tmp-oam03-runtime-20261103-194746` was created with `mkdir` and
confirmed ignored using `git check-ignore`. Every build/type/test/lint/formatter
command used its absolute checkout path as `TMPDIR`. Lint used only the 13 explicit
files listed below; source typecheck includes only `src/**/*.ts`, and Vitest uses
explicit maintained `test/` files. Scratch was not included in those programs.

Replace the quoted `<repo-root>` placeholder before reproducing. The following
command bodies are the final executed build, source typecheck and V1 selection;
each used `TMPDIR='<repo-root>/_tmp-oam03-runtime-20261103-194746'`:

```sh
pnpm --workspace-concurrency=1 --filter @web-ts-toolkit/access-router... build
pnpm --filter @web-ts-toolkit/access-router exec tsc --noEmit -p tsconfig.typecheck.json
pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts \
  test/write-output-authorization.unit.test.ts \
  test/write-output-modes.unit.test.ts \
  test/write-output-populate.unit.test.ts \
  test/owned-authorization-modes.unit.test.ts \
  test/owned-authorization-modes.integration.test.ts \
  test/authorization-fast-path-options.unit.test.ts \
  test/authorization-fast-path-options.integration.test.ts \
  test/service-authorization-mutations.integration.test.ts \
  test/service-authorization-input.integration.test.ts \
  test/document-permissions-dependencies.integration.test.ts \
  test/virtuals-populate-dependencies.integration.test.ts \
  test/owned-authorization-stage.unit.test.ts \
  test/owned-authorization-publication.unit.test.ts \
  test/owned-authorization-runtime-profiles.unit.test.ts \
  test/authorization-fast-path-native.unit.test.ts \
  test/owned-authorization-boundaries.unit.test.ts \
  test/owned-authorization-facts.unit.test.ts \
  test/owned-authorization-records.unit.test.ts \
  test/owned-authorization-many-bounds.unit.test.ts \
  test/owned-authorization-helpers.unit.test.ts \
  test/owned-authorization-alternate.unit.test.ts \
  test/service-authorization-subdocuments.integration.test.ts \
  test/subdocument-populate-authorization.integration.test.ts \
  test/populate-operation-policy.queries.test.ts \
  test/populate-operation-policy.dependencies.test.ts \
  test/populate-operation-policy.nested-targets.test.ts \
  test/private-populate-read-policy.runtime.test.ts \
  test/virtuals-populate-dependencies.parity.test.ts \
  test/virtuals-populate-dependencies.traversal.test.ts \
  test/virtuals-populate-dependencies.fallback.test.ts \
  test/virtuals-direct-operations.integration.test.ts \
  test/virtuals-embedded-subdocuments.integration.test.ts \
  test/virtuals-populate-include.integration.test.ts \
  --reporter=default --reporter=json \
  --outputFile.json=../../_tmp-oam03-runtime-20261103-194746/v1-delivered.json
```

**Build and source typecheck passed. Core V1: 33 files / 2,166 tests passed,
zero failed or pending.** Fresh JSON assertion results were inspected, including
40 + 47 + 49 passes in the three new suites. Vitest's package working directory
is `packages/access-router`; the JSON path is relative to that directory.

The following additional serial V1 invocation then passed **3 files / 50 tests**
(6 advanced-body + 29 dedicated-route + 15 route-parity tests), again with the same
inline `TMPDIR` prefix and fresh JSON inspection. **Delivered focused V1 total:
36 distinct files / 2,216 tests; zero failures or pending tests.**

```sh
pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts \
  test/virtuals-route-parity.integration.test.ts \
  test/advanced-mutation-bodies.integration.test.ts \
  test/model-subdocument-routes.integration.test.ts \
  --reporter=default --reporter=json \
  --outputFile.json=../../_tmp-oam03-runtime-20261103-194746/v1-routes.json
```

Focused ESLint and Prettier passed on this exact path set (the actual invocations
expanded these paths directly; this array is an equivalent compact reproduction):

```sh
checked=(
  packages/access-router/src/acl/service-authorization.ts
  packages/access-router/src/acl/service-execution.ts
  packages/access-router/src/acl/document-stage.ts
  packages/access-router/src/services/service.ts
  packages/access-router/src/services/public-service.ts
  packages/access-router/test/write-output-authorization.unit.test.ts
  packages/access-router/test/write-output-test-fixture.ts
  packages/access-router/test/write-output-modes.unit.test.ts
  packages/access-router/test/write-output-populate.unit.test.ts
  packages/access-router/test/authorization-fast-path-options.integration.test.ts
  packages/access-router/test/document-permissions-dependencies.integration.test.ts
  packages/access-router/test/virtuals-populate-dependencies.integration.test.ts
  packages/access-router/test/owned-authorization-stage.unit.test.ts
)
pnpm exec eslint "${checked[@]}"
pnpm exec prettier --check "${checked[@]}"
```

The handoff README also passed `pnpm exec prettier --check`; final whitespace,
relative-link, ignore-status and targeted privacy/reference review passed.
Fresh root and `/advanced` ESM runtime exports were inspected: none exposes the
new write issuers/output-child derivation or private origin reader. This is not an
installed CJS/declaration consumer check.

### Intermediate failures and resolutions

No failed check was dropped to obtain the final selection:

- Initial stage probes: 7/39 failed on fixture assumptions (BSON wire Buffer becomes
  Binary, controlled errors have message `Bad Request` with detail in their result,
  and target registration requires an object permission schema). Corrected the
  mutation/error assertions and target fixture/cleanup; the same cases pass.
- Initial worker probes: literal `baseFilter.update: false` was not a denial hook.
  Used the established callback-returning-false contract; both terminal denial cases
  pass without changing runtime semantics.
- Initial populate matrix: bulk persistence calls the admitted adapter once per row,
  not once per array. Dotted LIST/custom paths also require the fixture's source
  ancestor permissions. Corrected those explicit fixture expectations/permissions;
  retained all target/private/ownership assertions.
- Initial new private-dependency cases omitted a virtual because its mutation used
  Buffer-only `fill` on BSON Binary. Adopted the existing Buffer-or-`.buffer` mutation
  idiom; both modes, all eight branches and shared-target bulk now pass.
- Formatting was applied with patch, not blanket file rewriting. A piped formatter
  candidate truncated a large file; it was never applied. Complete candidates were
  regenerated using Prettier's API with synchronous scratch writes and checked
  against the patched files. The non-fatal Vite CommonJS-config warning remained.
- After private execution-origin hardening and final denial/count regressions, the
  full same 33-file selection was rerun on delivered source. Earlier 2,159-test runs
  are superseded by the final 2,166-test result, not relabeled as later evidence.

Build/type/lint/format logs, verbose/JSON test reports and formatter candidates are
disposable historical scratch, not required continuation inputs. No raw dependency,
database, cache, generated `dist` or scratch trees are preserved here. This curated
summary plus maintained tests is not a self-contained environment/reproduction bundle.

## Remaining ownership and limitations

- **OAM-04:** broad shipped/website/docs/JSDoc, decorator/installed consumers,
  benchmark support discovery and full V2. In particular, reconcile
  `src/interfaces/root.ts` LIST JSDoc's blanket “READ/LIST settings never select
  write/new/dedicated stages”: READ/LIST do not select **root write** modes, but a
  target's captured READ/LIST mode now affects genuine write-origin populate.
  Qualify query-origin hidden-graph/copy claims: write-origin targets still require
  mandatory bounded full-source detachment regardless of their READ/LIST selector.
- **OAM-05:** independent acceptance reconciliation and final V2/V3. The coordinator
  owns task status; no claim of independent review or full-package/repository success
  is made here. No OAM-03 criterion is intentionally deferred to conceal a failed
  test; remaining broad integration checks are the tasks' explicit later gates.
- Full package suites, decorator checks, packed/installed consumers, benchmarks,
  repository-wide build/test/lint and performance timings were not run in this child.
  Unsupported adapters/native graphs fail closed; no general adapter compatibility,
  callback isolation, transaction/rollback or freshness guarantee was added.
