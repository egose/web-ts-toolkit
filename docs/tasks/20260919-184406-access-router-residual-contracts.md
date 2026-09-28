# Access Router Residual Contracts

Created: 2026-09-26 18:44:06 local time (`date +%Y%m%d-%H%M%S`).

## Objective and scope

Continue the completed [business-boundary review](20260926-145743-access-router-business-boundary-review.md)
by closing four concrete residual server issues in three implementation tasks and an
independent integration task. The user requested continuation using the same isolated,
sequential sub-agent workflow. Preserve all existing uncommitted ABB work. Do not edit
root `CHANGELOG.md`, hand-edit generated files, or commit.

Product requirements: reusable ACL-aware CRUD services must distinguish explicit denial
from missing filters and genuine no-match results. Validation adapters must faithfully
preserve valid business data, including `false`. Relationship queries must match escaped
literal records without accidentally interpreting them as operators.

This objective covers service denial sentinels, AJV contracts and correlated literal
escaping. It does not add client version negotiation or general business features.
Compatibility notes belong in this file and shipped documentation.

## Coverage, existing tasks and baseline

- Read-only follow-up agent inspected current sources/tests and relevant ARH/ACI/ABB
  records. Coordinator inspected AJV adapter/types, correlated resolver and contradictory
  exists test. Existing code plus read-only probes corroborated all four findings.
- Probes used existing unrebuilt output: false internal filter overrides performed a
  collection lookup; tagged AJV async boolean `false` became validation failure; denied
  exists returned successful false with no default-adapter lookup. These are not fresh
  full-suite baseline claims. New before/after regression evidence is required.
- Exact prior findings: ARH-13 D1/D2/D3 in
  [health follow-up](20260905-105547-access-router-health-follow-up.md), and
  FU-ACI05-2 / FU-ACI06-2 (one escape issue) in
  [correlated includes](20260912-181841-access-router-correlated-includes.md).
  This file executes those residual findings; it does not reopen earlier completed fixes.
- Initial worktree contains the 33 intended ABB files, matching the prior coordinator
  audit. All are preserved. Prior ABB final verification passed; no new suite has yet
  run for this objective.
- Excluded: claimed correlated total-budget overshoot is contradicted by synchronous
  check/increment and exact-budget tests. Nested persistence concurrency is fixed by
  ABB-04. Direct/root envelope-depth normalization remains a separate contract question;
  populate expansion, client old-server negotiation and generic feature ideas stay in
  their original records.

## Execution and shared verification

Each task gets a fresh sub-agent, **sequentially**, including the final independent
reviewer. Set `in_progress` before edits; set `completed` only after required checks,
with **Completion evidence** listing exact changes, commands/results and acceptance
outcomes. Record necessary scope discoveries before implementing them. Do not silently
expand to unrelated packages or waive checks. Keep implementation regressions together.

Priorities: P1 = explicit service authorization denial lost; P2 = bounded adapter/query
correctness or result-contract alignment. Paths are relative to repo root. Dependencies,
Node >=22/pnpm and Mongo memory-server prerequisites already exist; record any blockers.

- **V1 per implementation**, repository root, serial:
  `pnpm --filter @web-ts-toolkit/access-router... build`, focused
  `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/<actual-file>.test.ts`,
  `pnpm --filter @web-ts-toolkit/access-router exec tsc --noEmit -p tsconfig.typecheck.json`.
  Use actual changed/relevant files, not literal placeholders. Include docs/export/type
  checks where public contracts/types change. Record feasible before-fix failures.
- **V2 final package:** `pnpm --filter @web-ts-toolkit/access-router typecheck`, then
  `pnpm --filter @web-ts-toolkit/access-router test`. Includes fresh packed/artifact,
  declaration, export and documentation checks established by ABB-07.
- **V3 final workspace:** `pnpm build`, `pnpm test`, `pnpm lint`, `git diff --check`,
  serially. No concurrent package builds/tests; root tests intentionally serialize them.

## Tasks

### Task ARC-01: Preserve service denial sentinels and distinguish denied existence

Status: completed

Kind: defect

Priority: P1 — explicit trusted service denial can become a read/mutation lookup.

Suggested agent: service authorization implementer

Dependencies: none

Primary ownership: `packages/access-router/src/services/service.ts`, focused internal/
exists/filter-denial tests, matching README/llms/JSDoc or affected website prose.

Finding / references:

- `service.ts` findOne/find/updateOne/upsert use `overrideFilter || generatedFilter`
  (lines 256,407,775,925); findById/updateById use the same pattern for idFilter
  (364,896). Public types permit false filters. Probe showed false overrides still
  trigger persistence; hook-based ARH-01 tests do not exercise this argument seam.
- `exists` (1020–1027) returns success after false resolution instead of Forbidden.
  Default `model.ts:123–125` fails closed with null, so this is not demonstrated data
  disclosure. `test/service-exists.integration.test.ts:134–148` explicitly locks in
  the successful-false denial contract. PublicService.\_upsert propagates exists errors.

Requirements:

1. Distinguish absent/nullish overrides from false at all six filter/id-filter sites.
   False must reach existing Forbidden handling without calling fallback filter/id
   generators or persistence. Preserve trusted object replacement semantics.
2. Return Forbidden from `Service.exists` before adapter dispatch for terminal false,
   both includeId modes. Allowed no-match remains successful false/null; allowed match
   remains boolean/id result. Inspect callers, especially \_read fallback and \_upsert.
3. Update contradictory tests and document the deliberate denied-exists contract change.
   A custom Express route owns its HTTP serialization; do not promise that res.json of
   an ErrorResult automatically changes its status. Generated paths should follow their
   existing error mapping.

Acceptance criteria:

- Internal regressions cover all six false override paths with zero adapter/create/save
  calls, no redundant identifier resolution, and omitted/nullish/object controls.
- Explicit/base/override exists denial works for both result modes with zero adapter
  calls; matches and misses remain correct in real-Mongo integration.
- Public read/fallback and upsert do not revive explicit denial; any changed status is
  documented and verified. Prior denial and ABB mutation/security regressions pass.

Verification: V1 internal, exists, denial and relevant routing tests plus documentation
checks; V2/V3 in ARC-04.

Execution discovery (ARC-01): `_read` AND `_readFilter` retry every non-BadRequest
error under `tryList`, including terminal Forbidden from a false read policy. The
necessary caller scope includes `src/services/public-service.ts` and public read
option JSDoc: stop Forbidden before fallback in both paths, retaining authorized
no-match fallback and its list operation guard. `_upsert` already propagates exists
errors; denial will change from Unauthorized to Forbidden without dispatching update
or create. ID-wrapper false must also stop before downstream filter generation.

Completion evidence (ARC-01, 2026-09-26; all commands from repository root, serial):

- Changed `packages/access-router/src/services/service.ts`: all six override choices
  use nullish fallback; false ID filters terminate before downstream generation;
  false find/findOne overrides skip persistence-bearing client subquery parsing;
  exists returns Forbidden before adapter dispatch. Trusted filter objects still
  replace generated filters; object ID filters still receive row policy.
- Changed `src/services/public-service.ts` (same package): both public read paths
  retain the existing ABB BadRequest stop and additionally stop Forbidden before
  tryList. `_upsert` already propagates exists errors; its implementation needed no
  dispatch change. Added public JSDoc in this file, `service.ts`, and
  `src/interfaces/service-{find,update,exists,read}.ts`.
- Added `test/service-denial-contract.test.ts` (43 tests); updated
  `test/service-exists.integration.test.ts` and
  `test/read-list-fallback-authorization.integration.test.ts`. Covers all six false
  overrides with zero adapter/create/save and fallback filter/ID generator calls;
  omitted/undefined/null and object controls; subquery suppression; single ID
  resolution; real resolver explicit/base/override exists denial in both modes;
  real Mongo allowed matches/misses/ACL misses and denial; direct/root-entry 403;
  no public upsert mutation; authorized-miss fallback still works.
- Before-fix fresh `pnpm --filter @web-ts-toolkit/access-router... build`: passed.
  Initial `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/service-denial-contract.test.ts test/service-exists.integration.test.ts`
  produced 30 failures/18 passes, including a test-fixture missing `genSelect` seam;
  corrected that fixture before establishing the meaningful baseline.
- Before-fix `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/service-denial-contract.test.ts test/service-exists.integration.test.ts test/read-list-fallback-authorization.integration.test.ts`:
  **23 failed / 35 passed**. All six false override paths called adapters, all six
  exists-denial cases dispatched to the adapter, public denied reads could return
  HTTP 200 via list fallback, and denied upsert returned HTTP 401 instead of 403.
- After-fix `pnpm --filter @web-ts-toolkit/access-router... build`: passed, including
  CJS/ESM and declarations. Read generated `dist/parsers-CVqoKJuL.d.ts`/`.d.mts`
  contract comments: exists, overrides, tryList and upsert JSDoc survived emission.
- `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/service-denial-contract.test.ts test/service.internal.test.ts test/service-exists.integration.test.ts test/filter-denial.integration.test.ts test/read-list-fallback-authorization.integration.test.ts test/model-router.routes.integration.test.ts test/root-router.integration.test.ts test/nested-update-integrity.integration.test.ts test/subdocument-mutation-visibility.integration.test.ts test/include-permission-metadata.integration.test.ts test/request-persistence-concurrency.test.ts`:
  **11 files / 270 tests passed**, including prior denial and ABB mutation/security
  regressions. Strengthened the exists base-denial Mongo spy from `Model.exists`
  to the adapter's actual `Model.findOne` seam, then reran
  `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/service-exists.integration.test.ts`:
  **1 file / 10 tests passed**.
- `pnpm --filter @web-ts-toolkit/access-router exec tsc --noEmit -p tsconfig.typecheck.json`:
  passed.
- `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/documentation-examples.test.ts test/export-contract.test.ts`:
  **2 files / 56 tests passed** (documentation consumer/declaration/export checks).
- Updated shipped `packages/access-router/README.md`, `llms.txt`, and affected
  `website/docs/packages/access-router/{services,hooks}.mdx` contract notes.
  `pnpm --dir website build`: passed, client/server compilation and static output.
- `pnpm exec eslint packages/access-router/src/services/service.ts packages/access-router/src/services/public-service.ts packages/access-router/src/interfaces/service-find.ts packages/access-router/src/interfaces/service-update.ts packages/access-router/src/interfaces/service-exists.ts packages/access-router/src/interfaces/service-read.ts packages/access-router/test/service-denial-contract.test.ts packages/access-router/test/service-exists.integration.test.ts packages/access-router/test/read-list-fallback-authorization.integration.test.ts`:
  passed. `git diff --check`: passed.
- Preserved existing uncommitted ABB implementation/evidence; no root CHANGELOG,
  manual dist edits, commits or subagents. Unrelated concurrent changes observed in
  `packages/json-frame` and the mongoose/RxDB follow-up task were not edited here.
  Follow-up: V2/V3 and packed final integration remain assigned to ARC-04;
  ARC-02/03 remain pending. No unresolved ARC-01 acceptance criterion.

### Task ARC-02: Preserve tagged asynchronous AJV data and make promise semantics explicit

Status: completed

Kind: defect

Priority: P2 — valid boolean business data is rejected by a documented adapter.

Suggested agent: validation adapter/type specialist

Dependencies: ARC-01

Primary ownership: `packages/access-router/src/validation/parsers.ts`, `types.ts`,
real-AJV regressions and adapter consumer/docs contracts.

Finding / references: fromAjv at `parsers.ts:303–315` interprets fulfilled false as
failure and true as a boolean verdict, despite its documented data-returning `$async`
contract (291–298). Installed real AJV `$async:true,type:boolean` returns false
successfully; adapter returns `{success:false,issues:[]}`. Types (140–144) also admit
untagged Promise validators whose mutable errors are read after suspension. Existing
`validation-arh06.test.ts:110–151` tests async objects, not boolean data.

Requirements:

1. For `$async: true`, every fulfillment is successful parsed data, including false,
   true, null and scalars. Normalize genuine rejection-carried validation diagnostics;
   operational exceptions preserve identity.
2. Make the supported AJV distinction explicit: synchronous boolean validators use
   immediately snapshotted mutable errors; async data-returning validators identify
   themselves with `$async: true`. Reject unsupported untagged thenables with a clear
   operational/configuration error rather than racing on shared diagnostics or guessing
   whether a boolean is data. Safely observe any produced promise to avoid an unhandled
   rejection. Inspect existing structural callers/tests and record compatibility impact.
3. Align public structural types/JSDoc and installed README/llms with this contract;
   avoid importing AJV as a mandatory runtime dependency. Standard real AJV validators
   remain accepted without casts. If precise types conflict with actual library types,
   document and test that compatibility rather than weakening validation semantics.

Acceptance criteria:

- Real tagged async AJV boolean false/true, null, scalar and object success preserve
  returned values; failures retain input-local rejection diagnostics under concurrency.
- Synchronous same-turn invalid/valid calls retain snapshot correctness; operational
  throws/rejections remain operational. Unsupported untagged promises fail predictably
  without unhandled rejections, including rejected promises.
- Public declaration/strict-consumer tests accept real supported validators and describe
  the structural migration; no new mandatory dependency or unrelated adapter rewrite.

Verification: V1 real AJV/validation diagnostics/error-boundary/data-router suites and
strict consumer/export/docs checks; V2/V3 in ARC-04.

Execution discovery (ARC-02): installed AJV 8.20 declares `AsyncValidateFunction<T>`
as an overload extending the synchronous type-guard `ValidateFunction<T>`, with
`$async: true` and a Promise<T> call signature. The structural contract will use
separate sync-boolean and tagged-async-data branches and verify actual compile,
compileAsync and explicitly typed validators in staged strict consumers. AJV's
real ValidationError carries `ajv: true`, `validation: true` and an errors array;
the current errors-property-only check also swallows operational errors with an
unrelated `errors` field. Tightening that discriminator is necessary for identity.
Existing ARH-06 real-AJV calls unnecessarily cast to never, and its untagged
rejecting test double encodes the superseded contract: migrate that double to a
tagged data validator, remove AJV casts, and add explicit unsupported-contract
tests. ARH-07 sync doubles and data-router sync callers remain supported. Necessary
verification scope includes staged strict-consumer and documentation harnesses
(AJV is test-only), plus README/llms/website validation prose. No runtime AJV import.

Strict-consumer discovery: AJV's root does not export AnyValidateFunction (use its
exported ValidateFunction/AsyncValidateFunction union or actual getSchema result).
Also `compile<boolean>({ $async: true, type: 'boolean' })` can select AJV's earlier
JSONSchemaType overload and appear synchronous in TS despite its real async runtime
tag. An `AsyncSchema`-typed schema selects the real async overload without casts.
Document and exercise both forms, plus compileAsync; retain runtime tag checks for
the erased form. Initial strict fixture failures exposed these upstream declaration
details, not an adapter runtime regression.
Further strict inference check: AJV's inherited type-guard overload causes promise-
signature inference to yield unknown even when AsyncSchema selected the correct
type. Added a type-guard-aware fromAjv overload intersected with the same strict
AjvValidatorLike contract, so genuine sync/async validators infer T without casts
while untagged promise functions remain rejected. Structural data-returning async
functions retain ordinary promise-output inference.

Completion evidence (ARC-02, 2026-09-26; commands from repository root, serial,
except the explicitly noted package-directory dry pack):

- Changed `packages/access-router/src/validation/parsers.ts` and `types.ts`:
  discriminate on `$async: true` before calling; all tagged fulfillments are data;
  normalize only branded AJV rejection diagnostics; preserve other exception
  identity. Sync failures normalize mutable errors immediately (including copied
  message/path). Untagged promises/object or callable thenables are safely observed
  and reject with a configuration TypeError without reading shared errors. Other
  sync non-boolean values reject with TypeError. No runtime AJV import/dependency.
- Public AjvValidatorLike is a sync-boolean/tagged-PromiseLike union. fromAjv's
  type-guard-aware overload preserves actual AJV sync/async output inference while
  the structural overload supports data-returning async adapters. Inspected real
  AJV 8.20 `dist/types/index.d.ts`, `core.d.ts`, root `ajv.d.ts`, and runtime
  `validation_error.js`; recorded overload/erasure caveats above rather than
  allowing untagged Promise signatures. Genuine supported validators need no casts.
- Added `test/validation-arc02.test.ts` (30 tests): real tagged false/true/null/zero/
  empty string/object/array success and identity; real coerced false/true differing
  from input; structural fulfilled false/true/null/scalars; controlled out-of-order
  concurrent real-AJV rejection diagnostics and valid calls with a throwing shared
  errors getter (zero reads); real same-turn sync invalid/invalid/valid snapshots;
  reused error-object snapshots; operational throws/rejections (including unrelated
  errors fields and real async keyword errors); fulfilled AND rejected native
  promises/object/callable thenables with zero shared-error reads, observed thenable
  settlement, and zero unhandledRejection events after event-loop turns; non-boolean
  synchronous contract errors. Only intentionally unsupported JS/mistyped inputs
  use a cast in these tests.
- Deliberately migrated `test/validation-arh06.test.ts`'s operational-rejection
  double to literal `$async: true`; removed unnecessary AJV casts there and in
  `test/validation-arh07.test.ts`. Existing data-router sync structural calls remain
  accepted. Extended `test/strict-consumer-types.test.ts` with actual AJV compile,
  compileAsync, getSchema, explicit sync/async/union/erased types, output inference,
  and negative structural contracts across Bundler `.ts`, NodeNext `.mts` and `.cts`.
  Stages built declarations at the installed public package boundary. Added AJV
  test-dependency staging in this harness and `test/documentation-examples.test.ts`.
- Before-fix `pnpm --filter @web-ts-toolkit/access-router... build`: passed.
  `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/validation-arc02.test.ts`:
  **10 failed / 13 passed**, exposing real false rejection, true input substitution,
  swallowed operational errors, and unsupported thenable shared-error reads.
- Initial after-fix build, focused five-file suite (**62 passed**) and source
  typecheck passed. First strict/export/docs run: **3 failed / 59 passed**, due to
  fixture assumptions about AJV's root exports/inline overload. Corrected fixtures;
  isolated strict retry: **3 failed / 1 passed**, exposing genuine async output
  inference as unknown. A bounded `<repo-root>/_tmp/arc02-inference.ts` tsc probe
  confirmed inherited-overload inference; added the constrained type-guard overload.
  Final checks below supersede these intermediate failures.
- Final `pnpm --filter @web-ts-toolkit/access-router... build`: **passed**, fresh
  CJS/ESM and declarations. Inspected emitted `dist/parsers-CDnJOj6f.d.ts`/`.d.mts`:
  public union, both overloads and contract/migration JSDoc survive declaration emit.
- Final `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/validation-arc02.test.ts test/validation-arh06.test.ts test/validation-arh07.test.ts test/validation-error-boundary.test.ts test/data-router.test.ts`:
  **5 files / 69 tests passed**.
- Final `pnpm --filter @web-ts-toolkit/access-router exec tsc --noEmit -p tsconfig.typecheck.json`:
  **passed**.
- Final `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/strict-consumer-types.test.ts test/export-contract.test.ts test/documentation-examples.test.ts`:
  **3 files / 62 tests passed**, including three AJV strict-consumer module modes,
  fresh declaration/export checks and the README real-AJV executable workflow.
- Updated shipped `packages/access-router/README.md`, `llms.txt`, and affected
  `website/docs/packages/access-router/validation.mdx` with sync/async semantics,
  exception behavior, TypeError migration, actual AJV typing caveats and copyable
  public imports. `pnpm --dir website build`: **passed**, client/server/static output.
- `pnpm exec eslint packages/access-router/src/validation/parsers.ts packages/access-router/src/validation/types.ts packages/access-router/test/validation-arc02.test.ts packages/access-router/test/validation-arh06.test.ts packages/access-router/test/validation-arh07.test.ts packages/access-router/test/strict-consumer-types.test.ts packages/access-router/test/documentation-examples.test.ts`:
  **passed**. `git diff --check`: **passed**.
- From `packages/access-router`: `npm pack --dry-run --ignore-scripts --json`:
  **passed**, 17 publish files including README/llms, all three entrypoints and both
  declaration formats. This is publish-content verification, not ARC-04's actual
  packed-artifact integration run.
- All ARC-02 acceptance criteria verified. Preserved inherited ABB/ARC-01 changes
  and unrelated concurrent package/task work. No CHANGELOG, manual dist edits,
  commits or subagents. ARC-03 remains pending; full V2/V3 and final packed integration
  remain ARC-04 ownership. No unresolved ARC-02 follow-up or blocker.

### Task ARC-03: Match bare escaped parent markers as literal records

Status: completed

Kind: defect

Priority: P2 — accepted correlated include input can cause a Mongo operator error.

Suggested agent: correlated query implementer

Dependencies: ARC-02

Primary ownership: `packages/access-router/src/correlated-includes.ts`, resolver and
real-Mongo execution tests, shipped/website literal-escape documentation.

Finding / references: resolveValueNode (381–392) returns escaped `{ $parent: 'x' }`
directly even in bare field-value position; adjacent object-reference substitution
correctly wraps `$eq` (399–402). Validation accepts bare escape, and resolver test
(96–107) enshrines raw output. ACI-05 recorded real Mongo `unknown operator: $parent`
and HTTP 500; current README (251–253) advises an explicit-$eq workaround.

Requirements:

1. Bare escapes become literal equality, matching bare substituted object handling.
   Explicit `$eq`, array elements and operator operands remain literal values without
   double wrapping. Preserve single-pass handling and malformed escape rejection.
2. Preserve ACL, missing-reference behavior and expanded complexity budgets. No client
   protocol change; existing explicit-$eq spelling stays supported.
3. Replace workaround prose with the corrected contract in shipped/affected website
   docs. Link the old deferred issue to this implemented resolution without rewriting
   historical failures or claiming old servers gain the fix.

Acceptance criteria:

- Resolver tests cover bare/explicit equality, supported logical/array positions and
  malformed cases. Parent data never changes the escaped literal.
- Real-Mongo direct/root parent read/list routes exercise correlated read/list/count
  against Mixed records containing `{ $parent: 'x' }`: bare and explicit equality
  match identically, wrong literals do not match, and no operator-related 500 occurs.
- Existing authorization, budgets and legacy includes continue passing.

Verification: V1 resolver/validation/real-Mongo/cross-resource/docs checks; V2/V3 in ARC-04.

Execution discovery (ARC-03): the first fresh before-fix regression run reproduced
direct HTTP 500 for all three target operations and seven resolver failures. The
root fixture's explicit-equality payload first encounters the already-recorded
direct/root envelope-depth difference (HTTP 400). Give this matching fixture
explicit maxDepth headroom, while retaining expanded depth/node boundary tests and
the existing execution/complexity budget suites. No envelope-normalization change.

Completion evidence (ARC-03, 2026-09-26; commands from repository root, serial):

- Changed `packages/access-router/src/correlated-includes.ts`: the validated escape
  branch constructs a fresh literal and applies `$eq` only in bare field-value
  position, matching the adjacent substituted-object branch. Explicit `$eq`, other
  operator operands and array elements remain values; no second traversal or parent
  lookup. Updated the single-pass comment. Validation, ACL and budget enforcement
  paths are retained.
- Updated the previously raw-output expectation in
  `test/correlated-includes.resolver.test.ts` (same package), preserving ABB's model
  metadata fixture. Its 31 tests cover bare/explicit equality, `$ne`, literal arrays,
  `$in` elements, `$and`/`$or`/`$nor` field values and `$elemMatch` subtrees;
  missing/null/changed/marker-shaped parents and a throwing parent getter; no
  reference collection or template mutation; malformed/nested/extra-key escapes and
  forbidden whole-filter/clause/elemMatch positions; exact expanded node/depth
  boundaries for both spellings. Existing missing-reference and substituted-object
  single-pass tests remain green.
- Extended `test/correlated-includes.validation.test.ts` (17 tests) for direct/root
  agreement across supported escape positions and read/list/count target operations,
  plus malformed escapes and forbidden positions.
- Added `test/correlated-includes.escape.integration.test.ts` (18 real-Mongo tests):
  direct/root parent list, filter-read and ID-read crossed with target read/list/count.
  Each request compares bare and explicit equality and both wrong-literal controls.
  Four parent documents have changed scalar, absent, null and marker-shaped `x`;
  Mixed target BSON includes `{ $parent: 'x' }`, a different literal, and accidental
  parent-substitution decoys. Each parent gets exactly the literal match (count 1),
  with misses `null`/`[]`/`0`; no operator-related 500. Root entries explicitly assert
  success/statusCode 200. The fixture sets maxDepth 16 for known envelope headroom,
  restores options, and does not change production defaults.
- Before-fix `pnpm --filter @web-ts-toolkit/access-router... build`: **passed**.
  `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/correlated-includes.resolver.test.ts test/correlated-includes.escape.integration.test.ts`:
  initial **25 failed / 24 passed**, including root HTTP 400 from fixture depth.
  After adding explicit depth headroom, the same command again yielded
  **25 failed / 24 passed**: seven resolver equality/budget failures and all 18
  real-Mongo cases HTTP 500. Direct response diagnostics explicitly reported
  `unknown operator: $parent`; root routes also reached HTTP 500.
- After-fix `pnpm --filter @web-ts-toolkit/access-router... build`: **passed**,
  fresh CJS/ESM and declaration output for the package and transitive dependencies.
- `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/correlated-includes.resolver.test.ts test/correlated-includes.validation.test.ts test/correlated-includes.execution.test.ts test/correlated-includes.escape.integration.test.ts test/cross-resource-authorization.integration.test.ts test/request-complexity.integration.test.ts test/request-persistence-concurrency.test.ts test/include-permission-metadata.integration.test.ts`:
  **8 files / 153 tests passed**. Includes prior authorization, legacy includes,
  missing-reference behavior, expanded limits, cumulative query/nesting budgets,
  persistence concurrency and ABB permission-metadata regressions.
- `pnpm --filter @web-ts-toolkit/access-router exec tsc --noEmit -p tsconfig.typecheck.json`:
  **passed** (source typecheck).
- `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/documentation-examples.test.ts test/export-contract.test.ts test/strict-consumer-types.test.ts`:
  **3 files / 62 tests passed**, including installed declaration/export and strict
  Bundler/NodeNext ESM/CJS consumers. No public type or wire-format change.
- Updated shipped `packages/access-router/README.md`, `llms.txt`, and affected
  `website/docs/packages/access-router/validation.mdx`: corrected bare equality,
  explicit/operator/array compatibility, parent independence, rejection/budgets and
  older-server qualification. Added resolution links beside both original
  FU-ACI05-2 / FU-ACI06-2 follow-ups without rewriting their historical evidence.
- `pnpm --dir website build`: **passed**, client/server compilation and static output.
- `pnpm exec eslint packages/access-router/src/correlated-includes.ts packages/access-router/test/correlated-includes.resolver.test.ts packages/access-router/test/correlated-includes.validation.test.ts packages/access-router/test/correlated-includes.escape.integration.test.ts`:
  **passed**. `git diff --check`: **passed**.
- All ARC-03 acceptance criteria verified. Preserved inherited uncommitted ABB,
  ARC-01/02 and unrelated concurrent work. No CHANGELOG, manual dist edits, commits,
  subagents or other task implementation. V2/V3 and final packed integration remain
  ARC-04 ownership. No unresolved ARC-03 blocker; the pre-existing envelope-depth
  question and release-version follow-up stay in their original ACI records.

### Task ARC-04: Independently integrate and audit all residual fixes

Status: completed

Kind: improvement

Priority: P1 — verify changed authorization and public adapter/result contracts together.

Suggested agent: independent reviewer, fresh session

Dependencies: ARC-01, ARC-02, ARC-03

Primary ownership: this document, final verification and explicitly recorded necessary
integration corrections.

Requirements:

1. Inspect each acceptance criterion against source, negative/positive regressions and
   public docs/types. Check false denial across read/update/upsert paths, real AJV async
   value/exception contracts, literal interpretation and direct/root parity.
2. Run V2/V3 serially against final source and verify fresh packed artifacts. Preserve
   ABB work, root CHANGELOG and existing test assertions. Record any actual blockers
   and necessary scope before changes; no speculative cross-package cleanup.
3. Confirm every accepted task has completed status and Completion evidence. Record
   explicit per-task verdicts, command results, compatibility notes and limitations.

Acceptance criteria:

- All preceding requirements and V2/V3 pass; otherwise remain blocked with exact cause.
- No undisclosed scope, stale artifact acceptance, unverified completion or root
  CHANGELOG edit. Coordinator audits this entire document after this agent finishes.

Verification: V2/V3, installed declaration/artifact and full task/diff review.

Execution start (ARC-04): fresh independent reviewer read the complete record,
repository AGENTS.md, the requested
`the task-as-you-go skill`, and the relevant
ai-friendly-ts-package skill. ARC-01/02/03 are completed with evidence. The shared
tree includes inherited ABB/ARC and concurrent unrelated package work; preserve it.
Review and verification begin with no integration correction identified. V2/V3
will run in the specified order, serially; final coordinator audit remains pending.

Verification discovery (ARC-04): first V2 typecheck passed. First V2 package test
finished **58 files passed / 1 failed; 810 tests passed / 2 failed**. Both failures
are packed-output checks: the freshness assertion saw only six JS files in live
access-router dist (declarations emitted before Vitest had disappeared), and the
current-peer tarball consumer reported TS7016 for missing express-response-handler
declarations. At 19:24, `ps -eo pid,ppid,lstart,args` identified a separate root
`pnpm build` (PID 1507380, started 19:19:46, parent OpenCode PID 10592) still running
with starter-app `build:deps` / access-router-runtime transitive rebuild children.
This review's commands were serial; external shared-output rebuilding overlapped
the 19:21:53–19:24:40 package suite. Existing ABB-07 freshness assertions correctly
failed rather than accepting incomplete artifacts. Necessary scope is execution
coordination and fresh V2/V3 rerun after conflicting builds finish, not weakening
tests or editing dependency packages. Coordinator notified to reserve the shared
build/artifact tree. No code correction is justified by these failures yet.

Second V2 attempt: typecheck passed again; package test **57 files passed / 2 failed;
803 tests passed / 9 failed**. All seven packed checks passed, but export and staged
strict-consumer checks observed missing access-router declarations mid-suite
(ENOENT / TS7016 and consequent unused negative-type directives). At 19:25 the
earlier build had finished; during the rerun new external root `pnpm test`
(PID 1541742, started 19:25:16) and `pnpm build` (PID 1545103, started 19:26:17)
appeared, confirmed by process inspection at 19:31. Pause further build/test
execution until those shared-tree writers finish. No assertion/type workaround,
test edit or waiver is appropriate for disappearing generated files.

Completion evidence (ARC-04 — **blocked, not completed**, 2026-09-26):

- **Blocker/owner:** coordinator must arrange exclusive use of this workspace's
  generated package/artifact outputs for final verification. After waiting for
  external PIDs 1541742 and 1545103 to exit, process inspection at 19:34 found yet
  another external root `pnpm test` (PID 1576376, started 19:31:54), running starter
  tests that rebuild the access-router dependency closure. An idle instant did not
  reserve the tree. Further blind retries would repeat the same invalid execution
  conditions. No process belonging to another session was stopped.
- **Reviewer scope:** edited only this task document (status, observed failures,
  diagnosis and audit evidence). No source/test correction was identified or made;
  inherited ABB/ARC and unrelated concurrent edits remain intact. Root CHANGELOG
  has no worktree change. No manual dist edits, commits, subagents, assertion
  reductions, skip additions or verification waivers.
- Read the entire ARC record, including all requirements, historical evidence and
  compatibility notes. Inspected ARC source diffs and surrounding callers, focused
  positive/negative regression files, emitted contracts, package metadata/tsup/all
  three entrypoints, shipped README/llms, affected website prose and ACI resolution
  links. Read ABB-07's fixture repairs/evidence before diagnosing current failures.

Independent per-task verdicts (final integration approval remains blocked):

| Task   | Verdict and inspected evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ARC-01 | **Source/runtime acceptance PASS.** All six override choices use nullish fallback; false ID filters stop before downstream generation; false find/findOne overrides skip subquery parsing. Exists returns Forbidden before adapter dispatch in either mode. `_read`/`_readFilter` stop Forbidden/BadRequest; `_upsert` propagates the existence error before mutation. Inspected the 43 denial tests, 10 real-Mongo exists tests and direct/root fallback tests: no adapter/create/save/fallback-ID calls for denial; omitted/undefined/null/object controls; allowed matches/misses; no revival through list or upsert. These suites passed in both reviewer package runs, as did prior denial and ABB mutation/security suites.                                                                                                                                                                                                                               |
| ARC-02 | **Source/runtime acceptance PASS; final declaration verification blocked by disappearing files.** Tagged fulfillments are data; only branded AJV validation rejections normalize, while operational identity survives. Sync diagnostics normalize before suspension. Untagged object/callable/native thenables are observed and rejected with TypeError without shared-error reads. Inspected all 30 real/structural AJV tests, including false/true/null/coercion, out-of-order rejection diagnostics, same-turn snapshots, operational errors and zero unhandledRejection events after event-loop turns. Runtime tests passed twice. The staged strict positive/negative AJV matrix passed in the first run; its second-run TS7016 failures were missing declarations, not a contract mismatch. Real compile/compileAsync/getSchema and inference/erased-tag cases are present across Bundler and NodeNext ESM/CJS. AJV remains dev-only in package metadata. |
| ARC-03 | **Source/runtime acceptance PASS.** `resolveValueNode` wraps only bare escapes in `$eq`; operator/array operands remain literal and escape return is single-pass. Inspected 31 resolver, 17 validation and 18 real-Mongo escape tests: malformed positions, parent independence/getter non-access, exact expanded nodes/depth, direct/root parent list/filter-read/ID-read crossed with target read/list/count, matching and wrong-literal controls. These and existing execution/ACL/budget/legacy suites passed twice. Traced all read/list/count expanded checks before dispatch, synchronous query-budget check/increment and request/runtime-owned scheduler state. Known root-envelope depth headroom in the matching fixture is explicit, with separate boundary tests retained.                                                                                                                                                                         |
| ARC-04 | **BLOCKED.** Two full V2 package invocations failed required installed-output checks during externally overlapping rebuilds. A clean V2 and the complete ordered V3 remain required; no completed status or final all-green verdict is claimed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

Commands/results, repository root, serial within this reviewer session:

1. `pnpm --filter @web-ts-toolkit/access-router typecheck` — **2 invocations,
   both passed** (fresh five-package build plus source tsc).
2. `pnpm --filter @web-ts-toolkit/access-router test` — **2 invocations, both
   failed**: first 58/59 files and 810/812 tests passed (166.73s Vitest); second
   57/59 files and 803/812 tests passed (210.00s). Exact failure classes and external
   process evidence are recorded above. Commands used a 1,200,000ms tool timeout;
   neither was a tool timeout. Each freshly rebuilt its dependency closure.
3. `pnpm build`; `pnpm test`; `pnpm lint`; `git diff --check` — **0 invocations
   each by this reviewer so far**. V3 was not started because clean V2 and exclusive
   shared-output execution are blocked. External commands are not counted as this
   review's evidence. Resume with exact V2 then V3 in the specified serial order.

Installed artifact/declaration/docs evidence and limitations:

- Both package runs invoked the actual publisher-transform/pack/install and fresh
  release-artifact harness. All **7 packed/artifact checks passed in the second
  run**, including byte equality for 14 current JS/declaration files and README/
  llms, ESM/CJS runtime and strict NodeNext/Bundler current-peer consumers; first
  run passed 5/7. This does not waive the other required failed declaration checks.
- Inspected emitted `index.d.mts` root re-exports and both
  `parsers-CDnJOj6f.d.ts`/`.d.mts`: the strict AJV union, both overloads, async migration
  JSDoc, false override/exists/tryList/upsert contracts survive emission. Metadata
  and bundled root/advanced/processors entries align; no new entrypoint/dependency.
- Documentation tests passed in both runs. Shipped and website compatibility prose
  agrees: denied exists is an error, generated direct/root-entry status is 403 but
  custom serialization owns HTTP status; untagged async wrappers need migration;
  bare equality requires an updated server and explicit equality remains supported.
- Prior before-fix results remain implementation-agent evidence; this reviewer did
  not revert the shared tree to replay them. Existing envelope-depth/release-version
  questions stay in their original records. Review is bounded to ARC acceptance,
  not an exhaustive dependency/version/performance audit. Coordinator must audit
  the whole task record and resolve verification scheduling before completion.

Coordinator unblock decision: external sessions continue to build/test and edit
unrelated packages in this shared workspace (confirmed by process/status inspection).
Do not stop their processes or claim an exclusive reservation. Resume ARC-04 using
an isolated full-worktree verification snapshot under `<repo-root>/_tmp`, including
current tracked/untracked source and local workspace dependencies with no symlink
back to live workspace package outputs. Use repository commands unchanged in that
snapshot, recording its path and content identity. Capture current source before
verification and compare ARC/ABB owned source/test/docs against the live tree before
final acceptance; if owned files change, reconcile/revalidate rather than certify
stale code. Snapshot verification covers the captured full-workspace state, not
future edits from unrelated sessions. Record this explicit verification-location
change and any true failures; all V2/V3 checks remain required. Generated snapshots
are temporary verification artifacts, not manual edits to published output.

Resume (ARC-04): implementing the coordinator-approved isolated snapshot decision.
Historical shared-tree failures above remain evidence; new V2/V3 invocations will
run only in the captured workspace, with independent dependencies/output and a
final owned-source correspondence check against the live tree.

Snapshot preparation (ARC-04): captured **1,347 tracked/untracked source files**
using `git ls-files --cached --others --exclude-standard`, preserving current bytes,
modes and source links, plus independent copied Git metadata, at
`<repo-root>/_tmp/arc04-20260926-193734/workspace`. No ignored live build outputs or
live node_modules were copied. Base HEAD is
`b3abb26b4bd2556e16c8fd763e4af16b3728c8ea`; full source SHA-256 manifest identity is
`a8bfa804da8db59f83dbe768003d86995709f5725d83e08f00fbf2a5bd06d6aa`
(manifest and capture metadata in the snapshot's parent directory).
`pnpm install --offline --frozen-lockfile` could not find sqlite3's tarball in the
store; `pnpm install --frozen-lockfile` then passed with six downloads and no lockfile
change. This is dependency setup, not a test waiver. Dependencies use a local
virtual store populated from pnpm's content-addressed store, with local generated
bin shims; 5,164 symlinks checked, **zero outside-snapshot links and zero live-path
bin shims**. Initial correspondence: no captured source changed, all **179 owned
package/website/ABB-fixture files** match live bytes. Owned manifest identity:
`01990c32970d1c59fe3e80532c408900b1fafe0c77a2880762f5ac8189748583`.
Node v26.7.0, pnpm 11.18.0 (packageManager-pinned), Linux; existing Mongo/browser
caches remain available. Missing CLI-bin install notices reflect intentionally
unbuilt local outputs; repository builds will generate them. Unrelated mongoose-rxdb
edits already differ after capture and are outside the captured-state verdict.

Snapshot verification discovery: V2 typecheck passed. First isolated V2 package
test: **58 files passed / 1 failed; 811 tests passed / 1 failed**, 506.31s Vitest.
All seven fresh packed/artifact tests, exports, strict AJV consumers and ARC/ABB
regressions passed. The sole failure is unchanged
`test/sort-field-authorization.integration.test.ts:170` (permitted model/data
multi-field ordering), exceeding the existing 30s test allowance at 31,046ms;
no value/assertion mismatch reported. Inspected the four sequential HTTP checks
and seed/setup, and `vitest.config.ts` (four workers, 30s default). Host `uptime`
at 19:55 reported load averages 55.47/59.44/49.75. Necessary next scope is an
unchanged diagnostic test and clean exact V2 rerun, not a timeout/assertion edit.
No live builds or external process interruption are used.

Snapshot diagnostic update: unchanged focused sort suite passed twice (3/3 each;
57.13s and 57.44s total). Exact V2 retry still failed the same test at 34,297ms,
with **811 passed / 1 failed**, 431.63s total. A temporary external preload probe
(`arc04-timing.cjs`, outside both source trees) timed the permitted case without
changing assertions/timeouts: all four HTTP calls took 46–161ms, Mongo reads 15–31ms
and seed create 331ms, while the test took 26,762ms. Thus observed delay is fixture/
construction time, not failed ordering or slow persistence calls; no production
regression in ARC is demonstrated. Two instrumented focused runs passed (1/1 each,
two nonselected tests each); one initial probe invocation had a syntax error before
Vitest, corrected only in the external probe. No instrumentation enters V2/V3.
The repeated pre-existing sort-fixture deadline remains a real acceptance blocker;
do not silently raise it or waive it. Continue unchanged V3 serially to provide the
coordinator complete captured-workspace evidence and any independent blockers.

Snapshot V3 setup discovery: `pnpm build` passed (full log
`<tool-output>/tool_0e0df7c43001RlmvWSz3Gt2aln`).
First root `pnpm test` stopped in asset-inliner: **31 files passed / 1 failed;
565 passed / 1 failed / 1 existing TODO**. Its unchanged legacy fixture assertion
requires the source fixture path not contain `os.tmpdir()`. Since this explicitly
authorized snapshot is under `<system-tmp>`, default `os.tmpdir() === '<system-tmp>'` violates that
location precondition before behavior is tested. Necessary setup correction: give
snapshot subprocesses a dedicated sibling TMPDIR outside the snapshot source root
(`<repo-root>/_tmp/arc04-20260926-193734/tmp`). This retains the assertion and separates
source fixtures from all temporary writes, with no package/test changes. Rerun
the unchanged repository command with this recorded environment setting.

Completion evidence (ARC-04 resumed snapshot review — **blocked, not completed**):

- **Isolation succeeded.** All snapshot commands ran from
  `<repo-root>/_tmp/arc04-20260926-193734/workspace`, serially, with repository scripts
  unchanged. Source capture completed at `2026-09-26T19:37:41.126781-07:00`.
  The final audit reports **zero changes to all 1,347 captured source files**, and
  **zero differences for all 179 owned files against the live tree**. This includes
  the whole access-router package (source/tests/README/llms/config), its website
  directory and ABB-07's five cross-package fixture repairs. Manifest identities
  remain those recorded above. Final 5,704 symlinks stay inside the snapshot;
  no generated bin shim points back to the live workspace.
- **Snapshot V2 command counts:** `pnpm --filter @web-ts-toolkit/access-router typecheck`
  **1 invocation / PASS**; `pnpm --filter @web-ts-toolkit/access-router test`
  **2 invocations / FAIL**, each **58 files passed / 1 failed; 811 passed / 1 failed**.
  Both failures are the unchanged sort fixture's 30s deadline, at 31,046ms then
  34,297ms. All ARC/ABB runtime, 7 packed/artifact, 39 export, 4 strict-consumer
  and 19 documentation tests passed in both. No disappearing-file failure remains.
- **Snapshot V3 command counts:**
  - `pnpm build` — **1 invocation / PASS**, complete workspace packages/apps;
    1,800,000ms tool timeout, completed normally.
  - `pnpm test` — **2 invocations / FAIL**, 3,600,000ms tool timeouts, neither
    exhausted. First stopped at the `<system-tmp>` source-location precondition in
    asset-inliner (565 passed / 1 failed / 1 existing TODO). Second used only
    `TMPDIR=<repo-root>/_tmp/arc04-20260926-193734/tmp` as environment setup; asset-inliner
    passed **32 files / 566 tests / 1 existing TODO**, starter passed **18 / 335**,
    OIDC-vault passed **19 / 260**, then Express-runtime failed **10 files passed /
    1 failed; 340 tests passed / 1 failed**. Total completed Vitest lanes in this
    invocation: **79 files passed / 1 failed; 1,501 tests passed / 1 failed /
    1 existing TODO**. Later workspace lanes did not complete and are not certified.
  - `pnpm lint` — **1 invocation / PASS**.
  - `git diff --check` — **1 snapshot invocation / PASS**, plus **1 final
    original-tree invocation / PASS** after the resumed evidence update.
    No V3 command/script was modified.
- **New independent root blocker:**
  `packages/express-runtime/test/public-api-surface.test.ts:151`,
  `keeps the root package type exports exact`, timed out at **5,547ms / 5,000ms**.
  Inspected `getModuleExportNames`: synchronous TypeScript program/type-checker
  construction and exact export-array comparison. There was no export mismatch,
  missing declaration or subprocess error. This file is outside ARC ownership and
  was not edited. Its separate owner/coordinator must resolve the verification
  deadline/load issue; no arbitrary cross-package timeout increase is included.
- **Additional diagnostics:** two unchanged focused sort-file commands passed
  **3 tests each**; two temporary-preload focused commands passed **1 test each**
  (two other tests intentionally nonselected for diagnosis); one initial preload
  command failed parsing the external probe before Vitest. The probe was corrected
  only under `<repo-root>/_tmp`. These results diagnose the deadline but do not replace
  the failing full checks. No production/test-source correction was made.
- **Fresh artifacts/declarations/docs:** both snapshot package runs rebuilt and
  exercised all seven actual publisher-transform/pack/install/artifact checks.
  ESM/CJS and strict NodeNext/Bundler installed consumers pass. After V3 build,
  an independent byte comparison still matched all **14 emitted JS/declaration
  files and README/llms** to the generated release artifact. Inspected both shared
  declaration formats for the strict AJV union/overloads, tagged-data/migration
  JSDoc, false override/exists and Forbidden/BadRequest fallback contracts. The
  original source/runtime audit and documented compatibility decisions remain valid.

Resumed per-task verdicts:

| Task   | Independent verdict                                                                                                                                                                                                                                                                 |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ARC-01 | **Acceptance PASS in captured/current owned source:** six false override paths, exists modes, no fallback generators/persistence, direct/root `_read`/`_readFilter`/`_upsert` denial, positive controls and ABB regressions pass. Final integration still requires all-green V2/V3. |
| ARC-02 | **Acceptance PASS in captured/current owned source:** real AJV data/diagnostics, operational identity, untagged rejection/no-unhandled behavior and all three strict-consumer modes pass; declaration blocker from shared-output races is resolved by isolation.                    |
| ARC-03 | **Acceptance PASS in captured/current owned source:** safe bare equality, literal position/malformed/parent independence, real-Mongo direct/root matching, ACL and request-budget regressions pass.                                                                                 |
| ARC-04 | **BLOCKED:** isolated verification is reproducible and corresponds to owned live source, but package sort-fixture and unrelated root export-test deadlines still fail required checks. Coordinator action is needed; completion is not claimed.                                     |

Scope and handoff: only this live task document was edited. Snapshot scripts,
manifests, probes and reports are under `<repo-root>/_tmp`; no source changes, tests
weakened, root CHANGELOG edit, manual dist edit, commits or subagents. The final
`correspondence.json` lists concurrent newer unrelated message-service, mongoose-rxdb,
PDF-reader, example and documentation changes; they are not covered by captured
build/lint/partial-test results. There is **no full-workspace PASS claim**, even for
the snapshot. Coordinator should resolve the two remaining verification blockers,
resume exact serial V2/V3 in this isolated tree (refresh owned source only if needed),
repeat correspondence/original diff checks, and audit the entire final task record.

Coordinator integration scope decision: the isolated diagnostics above establish
two fixture-level time budgets that are too small under observed host contention,
not ordering/export assertion failures. ARC-04 may correct these narrowly in the
live tree and mirror the exact edits into the snapshot: split the combined model/
data ordering test into independently meaningful cases to avoid charging both
fixture constructions to one deadline, or give that test a bounded 60s allowance;
give the synchronous TypeScript export-inspection case a bounded 30s allowance.
Preserve every ordering, authorization, export and negative assertion; do not
increase global timeouts or relax any operation-performance assertion. The second
file (`packages/express-runtime/test/public-api-surface.test.ts`) is explicitly
added to ARC-04 integration ownership for this observed fixture-only blocker.
Rerun exact serial V2/V3 in the isolated snapshot, refresh ownership manifests for
the narrow test edits, and record outcomes. These corrections are authorized by
the measured fixture construction times and passing focused behavior, not by a
blanket policy of making failing tests pass with larger deadlines.

Resume with authorized fixture corrections: live diff inspection confirms neither
target test has concurrent edits. Use 60s only on the combined permitted-sort case:
the measured construction portion alone approaches 27s, so splitting assertions
would leave insufficient 30s headroom for that fixture under measured contention.
Use 30s only on Express-runtime's cold synchronous root export inspection. Preserve
all assertions and global/operation budgets. Mirror exact patches into the existing
snapshot and refresh its manifest; add the export test to owned correspondence.
Production/config/declarations are unchanged, so retain the passing typecheck/build
evidence and rerun full package tests, root tests, lint and both diff checks serially
with the recorded sibling TMPDIR and no preload.

Post-correction snapshot identity: full manifest
`f3f0a82825dc92124c4406107a38bc38482c33f7ef9e2cd487e864a0dae67baa`,
owned manifest (180 files)
`c942d698733ba15a1bdce8eebedad7c4233cad956a5eff3227f1dd9bd87b75ba`.
First corrected package invocation passed the sort case and all executed tests,
but MongoMemoryServer failed startup for `model-subdocument-routes.integration`
with `Port "38786" already in use`: **783 passed / 29 skipped**, 58 files passed /
1 failed suite. `ss -ltnp 'sport = :38786'` found no remaining listener. This is
the same automatic-ephemeral-port startup race documented in ABB-07, not a skipped
acceptance test. Retry the exact full package command unchanged; no setup edit.

Corrected V2 rerun: **59 files / 812 tests PASS**, 254.38s. Third isolated root
test reached mongoose-rxdb after passing the corrected Express-runtime 341 tests,
then failed two regex subprocess fixture deadlines (**367 passed / 2 failed**).
Necessary integration discovery: the live test already has RMRX-06's documented
repair, implemented after this snapshot. Read its task evidence: measured public
root import 1,075.64ms exceeded the first child's 1,000ms allowance; four imports
exceeded the second test's 5s wrapper. Existing live repair retains exact
QueryFilterError/exit/timeout and 100,000-character hostile evaluation guards,
uses finite 10s child/15s wrapper bounds, and loads once for all four variants.
Adopt only `packages/mongoose-rxdb/test/sanitize-filter-security.test.ts` into this
snapshot, byte-for-byte with the already repaired original; add it to correspondence.
No original edit or newer mongoose-rxdb runtime/source refresh is needed. This is
an explicitly recorded inherited fixture fix, not a new regex policy or waiver.

Fourth isolated root invocation passed mongoose-rxdb **37 files / 369 tests**
and PDF-reader Node **4 / 193**, then the first browser run failed to dynamically
import its test module while Vite logged initial dependency scanning (zero tests
collected). Read unchanged browser config/imports; immediate unchanged diagnostic
`pnpm --filter @web-ts-toolkit/pdf-reader exec vitest run --config vitest.browser.config.mts`
with sibling TMPDIR passed **1 file / 26 real Chromium tests**. This supports a
first-optimizer-load transient, not a source or fixture assertion failure. No
browser config/assertion edits; rerun required full root command, preserving the
failure and diagnostic evidence rather than treating the focused pass as V3.

Completion evidence (ARC-04 final, 2026-09-26):

- **Final verdict: PASS for ARC-01/02/03 and ARC-04.** All required V2/V3 checks
  have passing results for the coordinator-authorized isolated captured workspace,
  with final owned-source correspondence. Historical blocked/failed runs above
  remain intact; the successful full run supersedes their verification blockers.
  Coordinator's whole-record audit remains the final handoff.
- **Exact live reviewer edits:** this document;
  `packages/access-router/test/sort-field-authorization.integration.test.ts`
  (only the combined permitted-ordering case's bounded 60s fixture allowance and
  explanatory comment); `packages/express-runtime/test/public-api-surface.test.ts`
  (only root type-export inspection's bounded 30s allowance/comment). All existing
  assertions remain. No runtime/public API change was needed in this review.
  The already-delivered RMRX-06 regex fixture repair was adopted only into the
  snapshot and verified equal to live, as explicitly recorded above.
- **Final snapshot:** `<repo-root>/_tmp/arc04-20260926-193734/workspace`, initial
  capture 19:37:41 -07:00, base HEAD `b3abb26b4bd2556e16c8fd763e4af16b3728c8ea`.
  Final refreshed full-source manifest SHA-256:
  `0856451d0a3a4149ef88dc7a90ccb973e7645e0eed2d1a02505fda21f8fd8dfa`.
  Final **181-file** owned manifest SHA-256:
  `5b0c57a59ce8a7a4f36df7039a34d268e50e626345bd0c2f0c284f49299b3d28`.
  `source-manifest.json`, immutable prior manifests, `refresh-history.jsonl`,
  `capture.json` and `correspondence.json` reside in the snapshot parent directory.
  Final comparison: zero unrecorded changes to all 1,347 captured source files,
  zero differences between all 181 owned files and live. This covers the entire
  access-router package/website, all five ABB-07 external fixture repairs, the new
  Express-runtime export fixture and adopted mongoose-rxdb regex fixture.
- **Environment/isolation:** Linux, Node v26.7.0, pinned pnpm 11.18.0; independent
  workspace dependency links, bin shims and generated outputs. Final audit checked
  5,704 symlinks: zero outside-snapshot targets and zero live-path bin shims.
  Final tests/lint used `TMPDIR=<repo-root>/_tmp/arc04-20260926-193734/tmp`, a sibling
  of source, as documented. No external preload, global timeout override, live
  build/test command or interference with other sessions in the resumed work.

Final required command results and cumulative counts (direct reviewer invocations,
not nested builds/package scripts executed by these commands):

| Command                                                 | Isolated snapshot invocations/results                                                                                                                                                                                                                                                                                                                             | Earlier live invocations                              |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `pnpm --filter @web-ts-toolkit/access-router typecheck` | **1 PASS**, fresh dependency build + tsc. Retained after test-only corrections: production/config/declaration inputs are unchanged.                                                                                                                                                                                                                               | 2 PASS                                                |
| `pnpm --filter @web-ts-toolkit/access-router test`      | **4 total:** two sort fixture deadlines; one Mongo startup port collision (783 passed/29 not run); final **59 files / 812 tests PASS**, 254.38s.                                                                                                                                                                                                                  | 2 failed during external shared-output rebuilds       |
| `pnpm build`                                            | **1 PASS**, full workspace. Retained after test-only corrections under the explicit resume instruction; required package pre-builds also ran freshly on each test invocation.                                                                                                                                                                                     | 0                                                     |
| `pnpm test`                                             | **5 total:** asset-inliner TMPDIR precondition; Express-runtime cold TS deadline; already-repaired mongoose-rxdb fixture deadlines; initial browser dynamic import; final **full PASS: 374 file executions / 5,925 tests / 1 existing TODO across 26 Vitest lanes**. Access-router again **59 / 812**; all seven packed/artifact checks regenerated successfully. | 0                                                     |
| `pnpm lint`                                             | **2 PASS**, including after all fixture corrections.                                                                                                                                                                                                                                                                                                              | 0                                                     |
| `git diff --check`                                      | **2 PASS**, including final corrected snapshot.                                                                                                                                                                                                                                                                                                                   | Final original-tree checks recorded separately below. |

- Final full-test log:
  `<tool-output>/tool_0e11cf180001oCYMQ3BeQ6AdyF`.
  Its 26 lane summaries were independently counted; browser and React 18/19 lanes
  are execution totals, not unique tests. No failed/skipped test remains in that
  final run; asset-inliner's pre-existing TODO is unchanged. Long root calls had
  3,600,000ms tool allowances and completed normally.
- The earlier standalone source/typecheck and root-build passes remain applicable
  because only the three documented fixture files changed after them. No
  production/config/declaration correspondence changed. Final order after fixes
  was package test, full root test, lint, snapshot diff, correspondence/artifacts,
  then original diff. The full root command itself preserves package serialization.
- Diagnostics beyond required commands: five earlier sort probe invocations
  (two 3-test passes, two 1-test passes with other cases nonselected, one external
  preload syntax failure before tests), and one unchanged browser diagnostic
  **1 file / 26 Chromium tests PASS**. All are described above, not substituted
  for the successful full suites. Setup used one failed offline install followed
  by one successful frozen-lockfile install; lockfile/source identity was preserved.

Independent final per-task acceptance:

| Task   | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ARC-01 | **PASS.** Source/caller inspection and final regressions cover all six false override paths, zero fallback filter/ID generation and persistence, nullish/object controls, explicit/base/override exists denial in both modes, real allowed matches/misses, no read/list or upsert revival and generated direct/root-entry 403. Shipped docs distinguish custom serialization and denied-exists compatibility.                                                       |
| ARC-02 | **PASS.** Real tagged AJV false/true/null/scalars/objects and coercion preserve fulfillment data; rejection diagnostics stay input-local, sync errors snapshot immediately, operational identity survives. Native/object/callable untagged promises reject with TypeError and zero unhandled events. Strict real-AJV consumers pass across Bundler/NodeNext ESM/CJS, including inferred/erased tags and negative structural contracts. No mandatory AJV dependency. |
| ARC-03 | **PASS.** Bare escapes safely become literal equality, explicit/operator/array positions avoid double wrapping, malformed input rejects and parents cannot alter literals. All 18 direct/root real-Mongo escape cases and prior resolver/ACL/legacy/expanded and request-budget tests pass. Old-server explicit-equality qualification and original deferred envelope/release questions remain documented.                                                          |
| ARC-04 | **PASS.** Independently inspected all criteria/evidence/compatibility, required V2/V3 now pass in the approved isolated snapshot, fresh installed output agrees, exact owned live bytes correspond, all scope corrections are disclosed and no accepted requirement is waived.                                                                                                                                                                                      |

Final installed-output audit: all **7 packed/artifact tests**, **39 export tests**,
**4 strict-consumer tests**, and **19 documentation tests** pass in final package
and root runs. The final post-suite byte audit independently matches all **14
emitted JS/declaration files plus README/llms** to the fresh release-artifact tree;
both declaration formats retain the AJV and denial contract JSDoc. Minimum/current
peer runtime lanes pass; current-peer installed checks retain full declaration
checking, with the pre-existing minimum-peer declaration-internal limitation
unchanged. No stale generated output was accepted or hand-edited.

Limitations/scope: workspace PASS applies to the captured state plus the three
documented fixture refreshes, not concurrent newer unrelated edits. Final
correspondence explicitly lists newer OIDC-vault, json-frame, message-service,
mongoose-rxdb, PDF-reader, example and task/docs changes; none were overwritten or
certified as current by this review. Owned ARC/ABB source/tests/docs still match
exactly. No root CHANGELOG change, commit, subagent or unresolved ARC blocker.
Final original-worktree `git diff --check`: **PASS** after final completion evidence
was written (two original-tree invocations total in ARC-04, both passing).

## Compatibility notes

Delivered contracts are recorded below and in shipped documentation. Root CHANGELOG
is excluded. Prior ABB and ARH/ACI histories remain intact; this document records
current resolutions, with links back to their original findings.

- **ARC-01 delivered:** trusted service false filter/idFilter overrides no longer
  invoke fallback generators or persistence. Nullish means normal generation;
  ordinary object filter replacement and ID-filter row-policy application remain.
  This resolves the ARH-13 service override/existence residuals referenced above.
- **Denied exists is now an error:** explicit/base/override false returns
  `{ success: false, kind: 'error', code: 'forbidden', query: { filter: false } }`
  without `data`, in either includeId mode. Previously it succeeded with false/null.
  Allowed matches/misses remain true/false or `{ _id }`/null. Consumers must branch
  on `success`, not treat policy denial as absence.
- **Public caller compatibility:** `_read` and `_readFilter` no longer use tryList
  after Forbidden (including terminal read-policy denial), preserving the ABB
  BadRequest stop. Authorized misses still use guarded list fallback. `_upsert`
  with `_id` propagates denied exists as Forbidden instead of Unauthorized; allowed
  misses remain Unauthorized, and neither case dispatches update/create.
  Generated direct routes map this denial to HTTP 403; root entries use 403 inside
  HTTP 200. Custom routes own HTTP serialization: returning ErrorResult or using
  `res.json(result)` does not automatically change the HTTP status (the custom
  exists integration route intentionally remains HTTP 200 with an error body).

- **ARC-02 delivered:** `$async: true` means data, including fulfilled false/true/null;
  sync booleans remain verdicts returning input/issues with same-turn diagnostics.
  Async failures use rejection-carried AJV ValidationError markers (`ajv: true`,
  `validation: true`, errors array). An errors property alone is operational, with
  exception identity preserved. Async paths never read mutable shared errors.
- **Structural adapter migration:** untagged promises/thenables now reject with
  TypeError and are safely observed rather than interpreted as boolean verdicts or
  racing on shared errors. Sync non-booleans also reject with TypeError. Return a
  custom RequestSchemaValidator result, or retain a literal `$async: true` with
  data/rejection semantics; simply tagging an async boolean-verdict wrapper makes
  both true and false successful data. Real compiled AJV validators are accepted
  without casts; AJV stays an optional application-installed library.
- **AJV declaration compatibility:** actual sync/async output inference is preserved
  through the AJV type-guard overload; structural async output uses its promise,
  and plain structural sync predicates can specify fromAjv<T>. AJV's async type
  extends its sync interface; inline async schemas may select its earlier sync
  compile overload, and references may erase the tag. An AsyncSchema-typed schema
  selects the async compile/compileAsync overload without casts. Runtime always
  uses the actual tag; widened boolean tags/untagged promise functions no longer
  satisfy the structural async contract. Verified in Bundler and NodeNext ESM/CJS.

- **ARC-03 delivered:** bare `{ note: { $escape: { $parent: 'x' } } }` now resolves
  to `{ note: { $eq: { $parent: 'x' } } }`, consistent with bare substituted
  objects. Previously the accepted bare form reached Mongo as an operator and could
  return HTTP 500. Explicit `$eq` is still equivalent; operator operands and array
  elements are unwrapped literal values without extra equality. Escapes are
  single-pass and parent-independent, including missing/null parent fields.
- **Escape compatibility:** wire types and client protocol are unchanged. Malformed
  escapes still reject; expanded literal output counts toward the same node/depth
  and other budgets. The bare output now includes its equality node, as the explicit
  spelling already did. This resolves FU-ACI05-2 / FU-ACI06-2 on updated servers;
  older servers still need explicit `$eq`. No minimum release version is invented.

## Definition of done

All four tasks completed with evidence, no unresolved accepted requirement, supported
consumer docs/types/runtime agree, final package/workspace checks pass, and coordinator
records a final audit. Review remains bounded to these residual contracts, not an
exhaustive dependency audit, production performance study or optional-feature backlog.

## Coordinator final audit

- Read the entire final task record, including requirements, acceptance mappings,
  implementation evidence, historical blocked attempts, snapshot isolation, fixture
  scope decisions, final results and compatibility notes. Confirmed **four tasks,
  all four Status fields completed**, with final Completion evidence for each.
  Earlier blocked ARC-04 evidence is retained as history and explicitly superseded
  by its final successful review.
- Confirmed separate sequential implementation sessions for ARC-01/02/03 and one
  independent ARC-04 reviewer session resumed to resolve verification blockers.
  Inspected final denial/read-fallback, AJV runtime/type and escape diffs, plus both
  narrowly authorized fixture-deadline changes. All behavior assertions remain.
- Read the final snapshot correspondence report: **181 owned files, zero live
  differences, zero unrecorded snapshot-source changes, 5,704 internal symlinks,
  zero outside-snapshot links/live-workspace bin shims**. The report explicitly
  lists unrelated newer live changes; the workspace PASS does not certify those.
- Accepted final recorded verification: access-router **59 files / 812 tests**,
  captured workspace **374 file executions / 5,925 tests** and one existing TODO;
  typecheck, build, lint, fresh packed/declaration/docs and diff checks passed.
  No already-passing suite was repeated for this documentation-only audit update.
- `git diff -- CHANGELOG.md` is empty. No user work was reverted, no commit was made,
  and no generated package output was manually edited. Final outcome: **complete**;
  no accepted ARC requirement or verification blocker remains.
