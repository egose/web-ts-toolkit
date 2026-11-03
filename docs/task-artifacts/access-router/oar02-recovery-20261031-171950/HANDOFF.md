> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# OAR-02 recovery handoff

**Disposition: OAR-02's bounded actor/configuration/boolean-fact/type foundation is
completed and verified. OAR-03 was not started.** This is not a release candidate,
a passing full-package suite, the new stage engine, or a performance success claim.
The coordinator owns task-document reconciliation; no `docs/tasks` file was edited.

Authority: `docs/tasks/20261031-153020-access-router-owned-authorization-redesign.md`
C1–C6 / Resolved OAR-01 / OAR-02, and OAR-01's `IMPLEMENTATION-HANDOFF.md` OAR-02
slice, `CONTRACT-AMENDMENTS.md` A2 and `ARCHITECTURE.md`. No delegation, commits,
publication, dependency installation/change, reset/revert, workspace-wide checks,
benchmark timing, old evidence/cache overwrite, or Mongo job was performed.

## Incoming work and recovery diagnosis

- HEAD still `58b22c0d6d3abd4ecce03533e3867d148ff21233`.
- Preserved the previous child's 19 modified source files, new fact normalizer and
  35-case regression file rather than reimplementing or reverting them.
- The delivered source was ahead of interruption logs: the unchanged pre-write
  fixture and source typecheck passed immediately. Its positive AND / negative
  predicate assertions were not weakened; the 35-case file only received formatting,
  with incoming SHA and semantic AST equivalence verified.
- Expanded cases found ten real failures across four missing boundaries: doc-hook
  contexts lacked empty facts, raw helpers still invoked document hooks, the unbound
  finalizer traversed attached function options, and virtual context isolation walked
  grant maps. Corrected within OAR-02, without switching engines or retiring handles.

## Delivered behavior and files

Combined foundation changes are in `packages/access-router` only:

- `src/acl/document-grants.ts`: single descriptor-only normalizer, proxy brand
  check before prototype/traps; one root + at most 19,999 own enumerable string
  literal-boolean slots; exact protected/configured metadata keys; null-prototype
  owned frozen record and singleton empty facts. No application-return freezing,
  getters, coercion, rich/native fallback, or repeated owned-map traversal.
  Sync results are boxed before gate assimilation; genuine Promises awaited;
  invalid fulfillment remains controlled 400 outside application catch; throws/
  rejections yield empty facts and fixed warning once, logger failures contained.
- `src/acl/document-authorization.ts`, `output-field-filter.ts`,
  `model-input-admission.ts`, `select-resolution.ts`, `src/core.ts`,
  `src/services/base.ts`, `src/services/service.ts`,
  `src/output/finalize-model-output.ts`: all actual output/pre-write/Core/Base/
  reachable unbound/supplied lanes normalize; owning embedded stages share facts;
  fields and virtual contexts reuse the same immutable identity. Utility controlled
  errors are not swallowed or followed by another hook. The raw helper branch now
  resolves only empty facts, not document hooks. Explicit old handle branch remains
  until OAR-03's atomic cutover. Decoration cannot replace facts with DTO metadata.
- `src/permission.ts`, `src/acl/service-authorization.ts`, `src/core.ts`,
  `src/core-data.ts`: actual JS-private immutable actor backing and frozen stable
  keys; one operation-entry actor capture; internal children share that view with
  exact request/runtime checks; no repeated map reconstruction for initialized reads.
- `src/acl/model-output-planning.ts`, `related-execution.ts`,
  `subdocument-authorization.ts`, captured input/populate lookups: callable leaves,
  own-data configuration slots, preserved exact/default/bare and dedicated guard
  fallback grammar, no live attached function options. Native policy captures remain
  private/detached and are copied at actual exposure; no frozen-Date ownership claim
  or schema-identity cross-call cache was added.
- `src/core-data.ts`, `src/core-shared.ts`, request selection/input helpers: data,
  create/raw input and standalone field invocation receive frozen empty facts;
  existing-document/root/dedicated-parent update retains independent **pre-write**
  boolean facts, including negative predicates. Hydrated/save/lifecycle behavior
  was not redesigned. Controlled dedicated post-save admission errors rethrow;
  ordinary visibility failures retain empty output, with no rollback/retry.
- `src/interfaces/access.ts`, `base.ts`, `root.ts`, `router-hooks.ts`, `src/index.ts`:
  exported `DocumentGrants = Readonly<Record<string, boolean>>`, exactly two-argument
  request-`this` `FieldPermissionHook`, separate `FieldValidation`; one-argument
  `GuardHook`/`Validation` and decoupled operation/field types; doc hook/generator
  returns and diagnostic fact property use boolean facts. Root + advanced declarations
  agree. No new runtime entrypoint or public rich escape hatch.
- New permanent files: `test/owned-authorization-boundaries.unit.test.ts` (63 cases),
  `owned-authorization-types.test.ts` (2 installed ESM/CJS cases), valid and separate
  invalid `owned-authorization-hooks*.types.fixture.ts`. Existing incoming
  `owned-authorization-facts.unit.test.ts` has 35 unchanged-semantic cases.
  One old native-grant test in `document-authorization-validation.unit.test.ts` was
  migrated explicitly; a boolean binding control was added. See the ledger.

Recovery-specific deltas versus delivered partial source: 14 source files, one
focused old test, formatting-only incoming fact fixture, four new test/fixture files.
Exact lists/hashes are in `final-identities.json`, `final-source-identities.json`,
`final-test-identities.json`; other incoming product files remain unchanged.
No `access-router-deco` source/test changes were necessary; its scoped build passes.

## Actual passing checks

All commands ran serially in the foreground from repo root. `run.py` saves exclusive
new logs and sets a unique recovery-local TMPDIR for every command. V2 configs use
the package's standard include/setup/concurrency settings with a fresh cache directory.

1. **V1** `pnpm --filter @web-ts-toolkit/access-router... --workspace-concurrency=1 build`
   — passes, five packages only (access-router and necessary transitive dependencies).
   Final log: `build-final-01.log`; JS and all eight declarations succeed.
2. **V2** `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config ../../_tmp-oar02-recovery-20261031-171950/vitest-final-02.mjs --no-file-parallelism --maxWorkers=1`
   with these actual package-relative files:
   - `test/owned-authorization-facts.unit.test.ts`
   - `test/owned-authorization-boundaries.unit.test.ts`
   - `test/owned-authorization-types.test.ts`
   - `test/permission.test.ts`
   - `test/model-authorization-capture.unit.test.ts`
   - `test/document-authorization-validation.unit.test.ts`
   - `test/authorization-fast-path-owner.unit.test.ts`
   — **188 passed / seven files** (`regression-final-02.log`). 100 foundation cases
   include 98 runtime cases + two installed type cases; remaining 88 are existing
   permission/config/receiving-owner/snapshot controls (one deliberate migration).
   Only later formatting shortened one old test assertion; no source changed after
   this run. The successful source/build identities below remain current.
3. Source TypeScript: `pnpm --filter @web-ts-toolkit/access-router exec tsc --noEmit -p tsconfig.typecheck.json`
   — passes (`source-typecheck-final.log`).
4. Necessary downstream compilation: `pnpm --filter @web-ts-toolkit/access-router-deco build`
   — ESM/CJS/DTS pass (`deco-build.log`), no deco source edits or broad V4 claimed.
5. **V5 changed files only**: exact expanded argv in `lint-changed-final.log` and
   `prettier-final-02.log` — 29 access-router source/test/fixture files; ESLint
   `--no-cache` and Prettier pass. `git diff --check` passes (`diff-check.log`).

Installed type fixtures stage only public package metadata/README/dist and existing
dependencies into unique new directories, use public root/advanced imports, and
compile NodeNext `.mts`/`.cts` with `strict: true`, `skipLibCheck: false`. Positive
examples have no casts or suppressed errors. Negative fixtures separately reject
rich/nonboolean/undefined facts, rich doc-hook returns, field mutation, and a
required second argument in operation guards. Actual current Mongoose is **9.11.4**.
Full Bundler/Node16/min-peer/packed-guide/V3/V4/V7 gates remain later tasks.

## Instrumented work, not timing

Permanent tests prove both old active=false/true:

- 48 raw fact descriptor reads exactly once for a 48-fact map; after 24 field
  callbacks, still 48 reads, **zero descriptor traversals of owned facts**, one
  identical immutable fact identity for every callback/read.
- Actor capture performs two original actor `has` reads for its two keys; 24
  private reads and a derived child do not recapture it. Shared actor identity and
  original request binding are asserted; replacing the request symbol cannot elevate
  the captured actor; request/runtime mismatch rejects.
- Two virtuals share the stage facts while **zero deep-isolation calls contain
  the fact map**. Decoration retains that identity despite conflicting DTO metadata.
- Embedded shares owning facts; related target resolves independent false facts;
  pre/post-write stages are distinct. Root/dedicated input string AND and negative
  function rules remain fail-closed. Native Date/Buffer policy exposure mutation
  cannot mutate private policy, and exposed Date is not frozen as fake ownership.

These are source-spy structural observations, not allocations/CPU/latency measurements
or credit for old-active savings. No candidate profile/timing was added or run.

## Exact identities / preservation / jobs

- Source: 140 `.ts` files; source manifest SHA256
  `3b9b34860469305b1324c9f7667c302b10d6f6d549829334fab7f340cda947d4`.
- Current root ESM SHA256
  `51d126af84d64188a175b1db8a58f737fd9deec8b6c64964ed96510dac549005`.
- Current root CJS SHA256
  `3b8b018e124c6a6960371b7d5975fd2291b9768b4b6ed010ebe01a3225d08b77`.
- Current 14-output manifest SHA256
  `5844e112156c98a462965958e82ff4ee1074f676868f5d474d11d5d58934e5c4`.
  Full output/declaration byte identities: `final-dist-identities.json`.
- Test manifest SHA256
  `0e2a42fcc427665b5cf32bc18401d1e5e0acd3760c4388cd2c843a234e850061`.
- Lock remains SHA256
  `ef86ef24726d09f81d1262656920d6215caeb0f26e345198db2d27b8ab7ab314`.
- `preservation-final.json`: **37,611 incoming preserved identities checked, zero
  changed; previous child's 37,506 identities checked, zero changed**. Includes
  both coordinator task documents and old evidence/caches/artifacts. The predecessor
  evidence directory was read-only and still has no handoff created by this recovery.
- Original OAR-01 closure: **134 packages / 3,510 files**, read-only reverified,
  zero changed (`final-identities.log`). Original source copies, external dependency
  bytes, and sealed baseline outputs remain intact. All **14 baseline outputs**
  still match, baseline root ESM remains
  `33662faede23acffc1a90973f51a7407df147afba76e4fbb23eeb99169df3822`
  at `_tmp-oar01-20261031-153820/baseline-artifact/packages/access-router/dist/`.
  Live scoped dist was legitimately rebuilt, not used to overwrite the baseline.
- `jobs-final.json`: **no checkout build/test/Mongo jobs**, zero background or Mongo
  jobs started. All child compiler/build/test commands settled in foreground. No
  outstanding owned work remains.

## Remaining later-owned gates (not OAR-02 blockers)

`BROKEN-BEHAVIOR-LEDGER.md` records **18 intentional failures / 71 passes** from two
unchanged old rich/mutation/copy/helper suites, plus all recovery fixture/audit/
formatting failures and their resolutions. Do not claim those suites or full V3/V4
pass. Do not bulk drop them: migrate their positive security/work assertions to
booleans/new engine semantics, keeping explicit invalid-rich rejection regressions.

OAR-03 must perform the authorized **atomic** stage-engine/consumer/capability/mode/
diagnostic cutover. The old source/output snapshot machinery, flags, handles and
graph association code intentionally still exist; no new stage alias/profile was
introduced. OAR-04–07 deepen publication/native/helper/configuration/alternate-write/
deco integration; OAR-08 supplies installed migration/docs; OAR-09 owns full scoped
integration, peer/packed surfaces and fixed performance gates. No final-review,
universal speedup, lifecycle transaction/rollback, JavaScript sandbox, or security
equivalence claim is made here.
