# NOA-01 nested operation rules: implementation handoff

Related task: [NOA-01 reviewed contract](../../../tasks/20261103-082614-access-router-nested-operation-access.md).

This is the NOA-01 implementer's summary-only evidence and continuation index, not
an independent review or full integration approval. The coordinator owns task
status. No commits, pushes, or further agents were used. The preimplementation task
and planned `packages/access-router/MIGRATION.md` changes were left untouched.

## Delivered files

All package paths below are relative to `packages/access-router/`.

- `src/interfaces/access.ts`: public `OperationAccessContext`,
  `OperationAccessVariants`, and `OperationAccessRule`; removed public
  `RouteVariantAccess` and removed its inclusion in `RouteGuardAccess`.
- `src/interfaces/root.ts`: operation rules, dynamic subdocument rules, typed
  whole/leaf setter paths, and `OperationAccessSetter`. Negative mapped constraints
  prohibit retired keys even in dynamic subdocument operation records and
  structurally assigned objects; these are diagnostics, not usable aliases.
  Field-permission and request-schema types stay separate.
- `src/index.ts`: new public type exports. The existing `src/advanced.ts` barrel
  re-exports the same types without changes.
- `src/operation-access.ts`: shared pure guard selection, explicit snapshot/read
  adapters, context-aware evaluation, removed-key diagnostics/admission. No flat
  resolver map or compatibility translation remains.
- `src/runtime.ts`: validate model/default/data whole and dotted updates before
  publication, including bootstrap restores.
- `src/routers/{model-router,data-router}.ts`: operation-access fluent setters use
  argument count, so a second argument of `undefined` is a dotted clear, not a
  whole permission-string assignment. Initial model-instance admission occurs
  before registration.
- `src/{core,core-data}.ts`: minimum caller adaptations for the new reader API on
  existing basic/advanced route checks only.
- `src/acl/populate-access.ts`: diagnostic helper rename; existing retired-selector
  rejection is retained, not expanded to NOA-03's nested boundary work.
- New maintained tests/fixtures:
  `test/nested-operation-access-resolution.contract.test.ts`,
  `test/nested-operation-access-admission.contract.test.ts`,
  `test/nested-operation-access-consumer-types.test.ts`,
  `test/nested-operation-access-consumer.types.fixture.ts`, and
  `test/nested-operation-access.invalid.types.fixture.ts`.

## Helper contract for NOA-02 / NOA-03

These helpers are internal imports from `src/operation-access.ts`, not new public
package entrypoints:

```ts
interface OperationAccessReaders {
  readOption(key: string): unknown;
  readDefaultOption?(key: string): unknown;
}

type Selection = OperationAccessReaders & {
  baseAccess: string;
  context?: OperationAccessContext;
  subdocuments?: boolean;
};
declare function createOperationAccessReaders(options: unknown, defaults?: unknown): OperationAccessReaders;
declare function selectOperationAccessGuard(options: Selection): Validation | undefined;
declare function resolveRouteOperationAccess(
  options: Selection & { canActivate(guard: Validation): Promise<boolean> },
): Promise<boolean>;
```

- Readers are **raw exact** own-data paths, including the `operationAccess.` prefix.
  Do not pass generic parent/default getters, or an exact getter that already
  incorporates runtime defaults, as `readOption`.
- Pass complete effective model options and the same owner's model defaults as
  separate frozen snapshots. Data has no default reader. The factory itself does
  not clone or establish ownership; captured callers must supply owned snapshots.
- Omit `context` for base/secondary checks. Only explicit `basic`, `advanced`, or
  `root` selects a transport member. Enable `subdocuments` for model field gates.
- Selection is synchronous, invokes no hooks, and returns one scalar guard,
  `false` for invalid selected values/reserved accesses, or `undefined` for no
  guard. Evaluation denies undefined and invokes `canActivate` once otherwise;
  the evaluator retains request binding and operational-error identity.
- Exact runtime context specificity precedes scalar/operation-default fallback.
  Selected operation objects use only their own default, never a deep merge.
  Explicit whole-model undefined permits exact-operation defaults but not a
  runtime bare/outer catch-all. Defined field objects remain closed; absent fields
  use the top-level operation/context. `subs` scalars are not new wildcards.
- NOA-03 can reuse `isOperationAccessMemberPath(access)` and
  `isRemovedOperationAccess(access)` (both boolean diagnostics). The latter checks
  exact retired names; shared selection also checks the subdocument operation slot.
- Existing captured configuration currently retains operation defaults only for
  whole-model undefined. NOA-03 must inventory/capture the needed exact defaults
  before awaits, including closed-field runtime specificity, without live rereads.

## Verification

Working directory: repository root. Commands below use quoted placeholders;
replace `<repo-root>` with the checkout path. `_tmp-noa01-NLWGbLyJ` was freshly
created and confirmed ignored with `git check-ignore`. All checks ran serially
with that absolute TMPDIR. These are historical output locations, not required
continuation inputs.

```sh
TMPDIR='<repo-root>/_tmp-noa01-NLWGbLyJ' pnpm --filter @web-ts-toolkit/access-router... build
TMPDIR='<repo-root>/_tmp-noa01-NLWGbLyJ' pnpm --filter @web-ts-toolkit/access-router exec tsc --noEmit -p tsconfig.typecheck.json
TMPDIR='<repo-root>/_tmp-noa01-NLWGbLyJ' pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/nested-operation-access-resolution.contract.test.ts test/nested-operation-access-admission.contract.test.ts test/nested-operation-access-consumer-types.test.ts --reporter=default --reporter=json --outputFile.json='<repo-root>/_tmp-noa01-NLWGbLyJ/focused-results.json'
```

- Fresh transitive build: passed (CJS, ESM, declarations).
- Direct source typecheck: passed.
- Targeted Vitest: **3 files, 237 passed, 0 failed**: resolution **180**,
  admission **54**, installed-declaration consumers **3**.
- Consumer checks copy built declarations/package metadata without source aliases;
  Bundler/ESNext, NodeNext ESM, and NodeNext CJS each compile the positive fixture
  and verify all **36** negative diagnostic sites. Both root and `./advanced`
  imports are covered. These are declaration consumers, not tarball/runtime gates.
- Prettier and ESLint passed on the ten changed source files listed above and the
  `test/nested-operation-access*` glob. `git diff --check` passed. Emitted exports
  were inspected for the new types and the removed public type was absent.
- Earlier failures were resolved, not waived: the first build needed a broader
  dynamic-field index union; two resolver cases exposed the missing scalar-field
  fallback after an empty runtime operation default; direct tsc caught an overly
  broad diagnostic type predicate that incorrectly narrowed a string to never.
- Vitest printed its config-loader future-compatibility warning; tests still pass.
- After resuming the interrupted handoff, the current files and saved JSON results
  were reconciled without further source edits. The five new test/fixture files
  and this artifact are not ignored; artifact links resolve, its local-path/private
  identifier scan is clean, and `git diff --check` passes.

## Transitional state / remaining gates

NOA-01's focused checks pass; no remaining NOA-01 blocker was identified. Full
integration is deliberately incomplete:

- NOA-02 still owns base-core migration, root context dispatch, unpaired direct
  contexts and generated-route integration matrices. Current route-core adapters
  still accept the existing basic/advanced `RouteVariant` parameter.
- NOA-03 still owns captured secondary gates, LIST retry/post-write visibility,
  related/private targets, and nested populate selector rejection. Do not interpret
  the new selector diagnostics as completion of those boundaries.
- NOA-04 still owns README/MIGRATION/website and remaining old JSDoc, strict,
  packed and migration fixtures. Existing old suites import removed symbols and/or
  configure rejected keys; they were not run or claimed passing.
- Full V1, package V2, repository V3, MongoDB-backed integration, tarball/runtime
  ESM/CJS consumers, and independent acceptance review remain unrun gates.
- Trusted string escape hatches remain intentionally permissive at compile time;
  runtime rejects retired keys by presence, including undefined. Diagnostic
  denylisting is restricted to operation positions, not business-field names,
  permission strings, or `requestSchemas.advancedRead`.

## Evidence preservation limits

Reviewed scratch contents: build/type/lint/format logs, focused test JSON/logs, a
formatting patch and disposable Node compile cache. This curated handoff preserves
the useful results and API continuation guidance. Raw logs contain local paths and
were not copied. Generated consumers were cleaned by their tests; no dependencies,
build output, cache, or raw scratch tree is preserved here. The maintained tests and
fixtures, not this summary alone, are the reproducible evidence.
