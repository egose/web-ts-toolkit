> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# OAR-03 atomic stage-engine cutover handoff

**Outcome: the minimal OAR-03 atomic cutover is implemented and scoped gates pass.**
One private owned-stage engine is used by all live output lanes; the old handle/
graph/flag engine is removed, not retained as a fallback. This is not a release
candidate, a full V3/V4/V7 pass, an OAR-04 completion, or a performance success claim.
The coordinator alone reconciles `docs/tasks` and acceptance.

Authority: the shared owned-authorization task C1–C6, resolved OAR-01 and expanded
OAR-03; OAR-01 IMPLEMENTATION-HANDOFF/CONTRACT-AMENDMENTS A1–A5/ARCHITECTURE; OAR-02
recovery handoff/ledger. All incoming OAR-02 changes were investigated and retained
where still needed; no blind restoration to HEAD occurred.

## Concrete implementation ownership

- New private `src/acl/document-stage.ts`: created → resolving → ready → building →
  closed, one retained fact-resolution promise, one owned immutable boolean map,
  pending/fulfilled/rejected field memo, direct synchronous evaluations/hits where
  the evaluator is actually synchronous. Actual async resumes check open/generation
  and binding before commit. Wrong/forged/closed stages reject before source/memo work.
  Genuine embedded stages authenticate model/request/runtime/access/scope/provenance,
  share owning facts/preparation and retain distinct decisions. Source normalization
  provenance is not output authority. Sources/grants/call/binding/owning/memo/result
  resources clear after the operation's tracked drain.
- New `src/acl/output-publication.ts`: operation failure/publication groups close and
  poison first, stop admission, track admitted library work, drain before returning,
  then clear stage/build resources. Row maps use allSettled with a stop flag/error
  callback, not Promise.all fail-fast. Query/parser/populate and metadata sibling work
  is tracked. LIST buffers until every row and total count succeed; invalid counts
  also 400 with no decorators/partial data. Root entries have independent groups.
- Unified `src/acl/output-field-filter.ts`, `src/output/finalize-model-output.ts`,
  service/prepared-query/subdocument adapters: all direct/public/root read/list,
  create/update/upsert-derived output, new and dedicated child output use the same
  stage/evaluator/materializer. Positive AND and negative pre-write admission remain
  independent of post-write facts; hydrated pre-write document semantics and mutable
  validate/prepare/transform/save/change/delete contexts remain.
- Source isolation is the only engine mode branch. Isolated owns a bounded detached
  projection once and supplies a disposable bounded hook view; trusted may borrow
  admitted ordinary projected source/hook input. Hydrated/native shapes normalize
  before the hook, without rerunning it or using the old engine. Getter/stable/private
  views remain isolated in both modes. Actual isolated/trusted mutation differences
  are tested, not merely labels.
- Root-row selected/native budgets are created before related/include construction.
  Embedded scopes, attachment spines, metadata and related occurrences share remaining
  budget/depth. Batched populated targets register receiving occurrences before work;
  includes fork private row receivers and debit common owners. Completed target values
  are private construction handoffs, not result-keyed certificates. Transport-only FK
  cleanup precedes target hooks/getters. Children/includes finish before parent getters.
- Existing real native materializer remains, with sticky structural/native poison,
  closed-owner budget checks and before-serializer checks. Invalid selected getter
  returns poison 400; getter body errors still omit. Retained input/config snapshot
  normalizers were **not deleted**: unchecked Code.scope/DBRef.fields serialization
  now uses bounded native preparation with the same remaining boundary budget;
  protected native snapshot keys reject instead of silently dropping row constraints.
  Map/Set snapshot iteration is bounded and uses intrinsic iterators. Controlled poison
  error results cannot be rewritten into successful publication.
- New `src/acl/authorization-modes.ts`: only readAuthorizationMode/listAuthorizationMode,
  literal isolated/trusted, default isolated, undefined restoration. Actor/policy/facts
  are owned in both modes. Mode is captured before native configuration callbacks;
  related targets choose their own captured model mode, embedded inherits, READ retry
  retains READ mode with new stage/facts, writes/new/dedicated stay isolated. All ten
  retired names exist only in presence migration rejection, including false/undefined/
  inherited/non-enumerable controls. Minimal bulk/default/global/data/root/bootstrap/
  router placement and atomic validation/warning behavior is live; no no-op aliases.
- New exact `ModelOutputContext` and `ModelOutputHook`/`ModelOutputListHook` on root and
  advanced. Frozen modelName/initiating operation/receivingModelName/definition scopePath/
  three accesses/facts and optional canonical select/populate/sort strings/skip/limit.
  No model, full snapshots, lifecycle, filter, input or private bookkeeping aliases.
  Doc hooks (including pre-write) and decorateAll start with empty facts; row diagnostics
  retain normalized facts. Stages close before actual app decorators/tasks, without an
  automatic second authorization pass. Deco decoration aliases use the new output types.
- `src/acl/document-guard.ts` + middleware: private fresh normal read-stage condition
  consumption before close, never returned metadata/handles and no second query.
  Strip/exposure/forged presentation cannot change the decision; malformed facts are
  400 and ordinary missing/denied remains Unauthorized.
- Raw output helpers are fresh globals + empty facts + explicit outputFields policy,
  same grammar, zero document hooks/DB/virtual/row work. getDocPermissions remains DATA.
  Explicit fact/metadata generators and hydrated/raw parent business APIs remain.

## Removed/public surface

Deleted `src/acl/document-authorization.ts` and `src/acl/unsafe-snapshot-options.ts`.
Removed DocumentAuthorization/export/helper option/context member/child lookup,
known-DTO authority, result WeakMap certificates, issued membership, graph transfer,
snapshot equality/identity helpers, unused copied/trusted source fallback adapter,
resolveFinalizerDocPermissions/getSubParentGrants/finalizeSubRowsWithVirtuals/
finalizeSingleSubRowWithVirtuals supplied/unbound chain. No exported expiring replacement.

All eight access-router declarations build; the final surface audit finds no private
DocumentStage declaration, old capability type/member, or retired option declaration.
Root/advanced/processors export conditions remain unchanged. Full packed/peer/minimum/
Bundler/Node16/NodeNext/migration-guide matrices remain OAR-07–09; the focused installed
ESM/CJS NodeNext positive and separate negative consumers pass strict/skipLibCheck:false.

## Actual verification (all serial foreground, repo root)

1. V1 `pnpm --filter @web-ts-toolkit/access-router... --workspace-concurrency=1 build`
   — passes, five packages only; final `build-final-01.log`.
2. V2 `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config ../../_tmp-oar03-20261031-181311/vitest-final-02.mjs --no-file-parallelism --maxWorkers=1`
   — **214 passed / five files** (`focused-final-02.log`):
   - test/owned-authorization-facts.unit.test.ts — 35 retained
   - test/owned-authorization-boundaries.unit.test.ts — 63 retained
   - test/owned-authorization-stage.unit.test.ts — 111 new meaningful cases
   - test/owned-authorization-types.test.ts — 2 installed conditions
   - test/permission.test.ts — 3 unchanged
3. Source TypeScript `pnpm --filter @web-ts-toolkit/access-router exec tsc --noEmit -p tsconfig.typecheck.json`
   — passes; `source-typecheck-final-01.log`.
4. `pnpm --filter @web-ts-toolkit/access-router-deco build` — ESM/CJS/DTS pass;
   `deco-build-final-01.log`, one minimal deco type-alias source change.
5. Changed-file ESLint --no-cache and Prettier check — pass; expanded exact file lists
   in changed-final-lint.json/changed-final-format.json and corresponding logs.
   `git diff --check` — passes (`diff-check-final-01.log`).
6. `audit-final.py 02` — preservation/dependency/public declaration/job checks pass;
   `identities-final-02.log`, `final-summary-02.json` and related manifests.

No workspace-wide build/lint/tests, full V3/V4, benchmark worker/candidate timing,
Mongo process, delegation, commit/publish/dependency/lock change, reset or task edit.
Failures and corrections are retained in LEGACY-TEST-MIGRATION-LEDGER.md; no full-suite
claim comes from the focused include list. OAR-02's 18 intentional failures remain old
evidence, not reclassified passes.

## Current identities and preservation

- HEAD remains `58b22c0d6d3abd4ecce03533e3867d148ff21233`; incoming user-authorized work
  remains uncommitted. OAR-03 exact per-file delta versus incoming content is
  `oar03-product-delta-02.json`; final source/test/dist manifests and diff/status exist.
- Root ESM SHA256 `3c2e3232bc0be83613e80c5dd59fb520aaf0b98b71f6820692fd4398b4cdcc41`.
- Root CJS SHA256 `e3e158677a04a255b01f2d7ca1092715fad94c1fa31aa21d32fe22f1a2f46c8a`.
- Source manifest (155 access-router + deco TS files) SHA256
  `1fc59cd3cfa90e885abb584f8f070f362c5669f5c6e7f11eec92ae0af9bf30e1`.
- Combined live dist manifest SHA256
  `b57d4c9abb3235d785faf43e397f6eaac20d9dce13d770e515a5458a3bf95c9f`.
- Lock unchanged SHA256 `ef86ef24726d09f81d1262656920d6215caeb0f26e345198db2d27b8ab7ab314`.
- **3,466** captured incoming evidence/task/lock paths checked, zero changed. The
  authoritative OAR-01 sealed baseline/external dependency closure additionally
  reverified **134 packages / 3,510 files**, zero changed. Baseline root ESM remains
  `33662faede23acffc1a90973f51a7407df147afba76e4fbb23eeb99169df3822` in its old artifact.
  Live scoped dist was rebuilt legitimately, never used to overwrite baseline bytes.
- `jobs-final-02.json`: no matching checkout build/test/compiler/Mongo/worker jobs,
  zero background or Mongo jobs started; every owned command finished.

## Remaining later-owned hardening / explicit limits

- OAR-04: full native exact/depleted/depth/denied/private-populate/hydrated matrix and
  packed native READ/LIST probe; remove extra legitimate source/view/per-parent completed
  child/attachment copies. Minimal owner edges are live, but no optimized construction
  cost/shape ledger is claimed. Ultimately unattached null/missing join rows are charged
  conservatively to existing parent row budgets (never a fresh child allowance); precise
  discard/multi-recipient accounting and copy removal belong to its ledger deepening.
- OAR-05: broad helper/control forgery, utility/metadata/non-authority escape audit and
  remaining old test migration. No old runtime capability machinery remains to delete
  as an adapter. New raw-helper/current-authority read costs still need measurement.
- OAR-06: exhaustive setter/default/rollback/in-flight/deco/bootstrap/wire/include/
  populate/subquery/business-field matrices and warning behavior. Basic plumbing and
  real mode effects are delivered; no complete placement matrix is claimed.
- OAR-07: complete write/upsert/dedicated/data/deco/public surface test integration and
  migration of old source-deep-import suites; preserve their security assertions.
- OAR-08: installed MIGRATION/README/llms/website/release guidance and executable
  examples. Existing installed old guidance/tests are not silently treated as current.
- OAR-09/10: full scoped integration/peer/export/pack/type gates, runner profile update,
  fixed performance/retention protocol and independent review. No timing or universal
  security/performance equivalence, closure sandbox, transaction or rollback promise.

OAR-04 was not started. Coordinator should inspect the actual diff and this evidence
before reconciling OAR-03; later stages must not reintroduce flags, tokens or the old engine.
