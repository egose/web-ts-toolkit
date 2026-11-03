> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# OAR-09E-H — existing-value helper consumer delivered

**H1–H3 are implemented and focused gates pass. Guard implementation, full integration/seal and performance acceptance remain pending OAR-09E-G/later measurement.**

Task: `docs/tasks/20261031-153020-access-router-owned-authorization-redesign.md`, **OAR-09E-H only**, following accepted `docs/task-artifacts/access-router/oar09e-design-kTiLZtLh/DESIGN.md` H1–H3. No delegation, task/status edit, commit/publish, dependency/lock change, guard/tool/docs implementation or timing campaign occurred. All commands were foreground, serial and awaited. New evidence/cache/config/originals are exclusively in ignored **`_tmp-oar09e-helper-zZn7qh3h/`**.

## Exact source/test delta

`DELTA.json`/`DELTA.diff` compare actual entry bytes, not a historical uncommitted reconstruction. Entry HEAD remains **`a1996e10f8339d89fc8a0aa2b10f7b531f5a07ca`**, with only the coordinator task modified. Seven private runtime files and one new test change:

- **New `packages/access-router/src/acl/output-selection.ts`**: canonical `OutputSelectionShape`/`selectCatalogOutputShape`, moved catalog universe, rule extraction/classifier, dynamic named/opaque candidates, descriptor admission, ancestors, recursive selection/order/exclusions and ID eligibility. `prepareExistingOutputShape` selects only safe present literal roots and attaches the exact authenticated owner. No database fetch/dependency/populate/always-select/join/related collection is constructed for this consumer.
- `src/acl/output-projection.ts`: query-only expansion consumes that same selected shape and retains persisted/private/public fetch selections, identities/joins, dependency provenance, populate dependencies, child structure masks, compaction and related plans. OAR-09D's ancestor-membership compaction remains intact.
- `src/acl/virtual-projection.ts`: query plan explicitly extends the shared private shape. Catalog-less existing planning and all public planning-helper purposes remain unchanged.
- `src/acl/service-authorization.ts`: private own `factOrigin` is captured from actual output-only applicability, inherited only through authenticated embedded derivation. Related/retry derivations cannot issue helper origin. No public option/selector/export was added; every independent helper still captures current catalog/config/actor/policy.
- `src/acl/document-stage.ts`: shared `commitDocumentStageFacts` uses the existing boolean normalizer for real hooks and fixed EMPTY. `resolveEmptyOutputHelperStage(stage,binding)` has no supplied map/callback, rejects extra arguments, normal/foreign/resolving/building/closed stages, and idempotently accepts only its ready built-in EMPTY. It creates no resolver Promise or disposable callback-source view. A later normal API read lazily creates one shared Promise of the same facts, without invoking a resolver. Only helper origin omits query-reference-origin capture. Source admission/materialization and normal genuine-Promise hook resolution stay in the same engine.
- `src/acl/output-field-filter.ts`: shared copy/grant/embedded functions accept the minimal shape. The existing-value walker prepares its copy/policy slices once per occurrence, stays synchronous until actual field/nested asynchronous work, then continues at the current index. It retains the existing evaluator/memo keys, safe definitions, refs-to-IDs, metadata DATA, native materializer, shared row budget, isolated source and publication close/drain. No preseed/restart of later callbacks or denied-value read was added.
- `src/acl/output-publication.ts`: bounded drain fix described below; already-admitted field work is retained through synchronous poison without admitting new callbacks/stages.
- **New `test/owned-authorization-consumers.unit.test.ts`: 27 cases.** No existing test/registration/assertion was edited, deleted or skipped. Both committed OAR-09C/D 16-case suites remain byte-identical and pass. No test-mechanism migration ledger is needed for unchanged existing suites; the new failure/fixture ledger is below.

Paths beginning `src/`/`test/` above are within `packages/access-router/`. Exact incoming bytes (including committed line wrapping) are under `originals/`; every archived original was rehashed. `tracked-entry.json` captures all 1,980 tracked incoming identities, and `dist-entry.json` captures the actual incoming core/deco build bytes.

## Required bounded helper corrections and failing-before evidence

1. `regression-before.log`: the initial 11-case new suite records **7 failures/4 passes** before implementation. Two prove general query expansion and unnecessary async delay; five exercise the then-absent private EMPTY API (not claims of a pre-existing public exploit). The initial standalone probe also reproduces the design's actual work counts.
2. `regression-selected-before.log`: after the initial H implementation, the new depleted-row-budget checks demonstrate that a statically denied root and stripped protected metadata root could incorrectly return `{}` rather than charge their selected slot. The filter now charges present selected-but-ineligible literal roots without observing their values/creating dynamic paths. Raw metadata admission charges before strip/exposure; a retained top-level metadata value uses its prepaid root slot. Ordinary query metadata accounting is unchanged. The same run contains **one new fixture mistake**: a child virtual collided with the fixture's stored `children.label`. It was renamed `display`; the failing bytes are preserved in `regression-selected-before.test.ts`. No product validation was weakened.
3. `regression-drain-before.log`: caught selected-budget poison inside synchronous/async field predicates produces **two real unhandled rejections**, exit 1, despite 26 assertion cases passing. This is not recorded as a passing gate. `admitPublicationWork` now captures open admission before application evaluation, without a Promise for synchronous work; an actual returned Promise is tracked even if that already-admitted invocation poisoned the owner. New filter continuations check live exact stage/binding before allocation/admission and on resume. The strengthened regression holds async work with `setImmediate`, proves no early return, releases it, and verifies drain/no later callback/no publication. `regression-drain-after.log` passes with zero unhandled errors; all cases rerun in the final complete-files gate.
4. Probe setup failures are preserved (`probe-before*.log`): one syntax typo, one wrong emitted variable name in instrumentation, and one missing parent access rule in the new fixture. Corrected **`before-04`** is the accepted before observation. No timing was run/discarded. `source-types-01.log` used the wrong ES2018 build config rather than the repository's ES2022 typecheck config; its library errors are retained. The correct source typecheck passes (`source-types-02` and final); no product tsconfig was changed.

Sticky poison still uses the existing owner; facts/native/selected budgets, 20,000 inclusive slots, depth 100, separate source/fact budgets and zero partial publication are retained. The new selected-depletion assertions are additive hardening, not authority broadening. Existing exact native, callback, wire, reference, boundary and negative pre-write suites are unchanged.

## Actual untimed work and query equivalence

Accepted before: **`before-04/HELPER-WORK.json`** against ESM `7faeb957631bd5761e8b828835f4b600634db1afa740e229549bfc4ba6a74a4f`. Final: **`after-final/HELPER-WORK.json`**, reconciled in `WORK-REDUCTION.json`. Every instrumented seam must match exactly once; zero counts are actual non-invocations, not mode-label inference.

| 100 independent raw helpers, 24 fields each | Before | Final |
| --- | ---: | ---: |
| Fresh output-helper captures/catalogs | 100/100 | 100/100 |
| Root stages | 100 | 100 |
| Field evaluations / request memo calls | 2,400/2,400 | 2,400/2,400 |
| General projection calls | 100 | 0 |
| Projection compactions | 200 | 0 |
| `copyDocumentView` source/view calls | 200 | 100 |
| Query reference-origin captures | 100 | 0 |
| General resolver calls / resolver Promise constructions | 100/100 | 0/0 |
| Actual closed/cleared root stage records | 100 | 100 |

Ordered output/fields, detached identity and full output hash agree in 1/10/100-helper cases. Source and approved selected-value copies remain necessary: **100 copies is not zero copying**, and zero resolver promises is not a total-allocation/public-Promise-free claim. Public helpers still return Promises; async field/nested continuations and the lazy general resolver API still legitimately use Promises.

- **60 complete characterized query plans match byte-for-byte** in `before-04/QUERY-PLANS.json` and `after-final/QUERY-PLANS.json`, including deterministic order, child plans, fetch/private/public masks, dependencies, always-select/join/custom identity, exclusion, explicit whole/descendant grants, named Map/opaque paths, refs, active/inactive virtuals, related plans and custom scopes. Active malformed descriptor error name/message observations match as well. This bounded matrix is not a universal equivalence proof. The complete planner/catalog/projection/private-populate/explicit-selection suites additionally pass.
- Final helper probe covers **12 combinations** of configured mode, sync/async fields and width with actual root/embedded stage records. Each clears source/grants/access/view/call/binding/publication/owning/result and memo; no unused callback views or resolver promises return in nested helpers.
- `STAGE-CLEAR.json` is a separate **ordinary real query control**, copied from unchanged benchmark structure tooling with only import relocation and added access/view-clear assertions. Both modes at 4/24/48 fields retain six raw fact normalizations/identities, **24/144/288 callbacks**, one fake adapter read/zero Mongo reads and **all 12 root+embedded stages closed/cleared per operation**. It does not run a guard, a timing campaign or a new benchmark workload.

## Verification actually run (repository root, foreground/serial)

Every exact argv/environment/exit is preserved in the corresponding named log; private configs change cache placement only, not test discovery/assertions.

| Gate | Actual command/result |
| --- | --- |
| Scoped V1 | `pnpm --filter @web-ts-toolkit/access-router... --workspace-concurrency=1 build` — **five necessary packages pass**, final runtime source in `v1-02.log`. |
| Source types | `pnpm --filter @web-ts-toolkit/access-router exec tsc --noEmit -p tsconfig.typecheck.json` — pass (`source-types-final.log`). |
| Deco source types | `pnpm --filter @web-ts-toolkit/access-router-deco exec tsc --noEmit -p tsconfig.typecheck.json` — pass; no deco source/declaration changes (`deco-types-final.log`). |
| Complete focused files | `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config ../../_tmp-oar09e-helper-zZn7qh3h/vitest-core.mjs --reporter=verbose --reporter=json --outputFile.json=../../_tmp-oar09e-helper-zZn7qh3h/focused-final-results.json --no-file-parallelism --maxWorkers=1 <31 explicit files>` — **1,062 passing, zero failures/pending/skips/unhandled errors**. Exact file argv in `focused-final.log`, all file paths/counts in `FOCUSED-FILES.json`; no name filters. Includes the 27 new cases, both retained 16-case work suites, 102 native, 111 stage, 50 publication, planner/catalog/memo/facts/helpers/runtime profiles/boundaries/records/types, explicit-selection/private-populate/related/subdocument/public boundaries and unchanged guard controls. |
| Changed lint/format | `pnpm exec eslint --no-cache <eight changed source/test paths>`; `pnpm exec prettier --check <same paths>` — pass (`lint-final.log`, `format-check-final.log`). This is not a full V5 claim. |
| Diff | `git diff --check` — pass (`diff-final.log`). |
| Work/equivalence | `node _tmp-oar09e-helper-zZn7qh3h/probe.mjs before before-04`; `... after after-final`; `node _tmp-oar09e-helper-zZn7qh3h/structure.mjs`; `node _tmp-oar09e-helper-zZn7qh3h/surface.mjs` — pass, untimed instrumented copies only. |
| Preservation | `python3 _tmp-oar09e-helper-zZn7qh3h/audit.py` — pass (`preservation-final.log`). |

Earlier focused runs are retained but not added to the final case count. The unchanged installed ESM/CJS owned-hook/type fixture runs in the focused gate; retired helper controls/removals are checked, not accommodated. Full minimum/current packed consumer/doc matrices were **not rerun** here.

## Public surface, preservation and closure

- Current helper-packet root ESM: **`c668ed6c179af90750691a8803b55d1ae4a72bd9db0d1280458a930a057c17e5`**; root CJS: **`50d63b426a15c9098e43ba7dd496add4ae296f1e864e71115e865acc8310f789`**. `OUTPUTS.json` records all **14 core runtime/declaration outputs**; only root JS/MJS differ from incoming. This is **not a sealed full-gate candidate**, and no new V8 protocol/artifact was issued.
- All **eight core declarations are byte-identical** to actual entry and the 09D seal. No private shape/fact-origin/EMPTY issuer/admission helper leaks into declarations or public exports. Exact ESM/CJS root/advanced/processors export sets remain **46/48/6**, not merely equal counts (`PUBLIC-SURFACE.json`). Installed guide/README/public APIs/docs are untouched.
- `PRESERVATION.json`: **1,421,442 historical paths** retain size/mtime/ctime/mode/link identities; all **622 old candidate records** and the baseline artifact payload remain hash-identical. Actual external **134 packages/3,510 files** and **293 tool packages/10,545 files** were rehashed successfully. All **13 benchmark tool files** and lock bytes remain unchanged. No giant dependency/cache clone was made.
- `test/service-authorization-subdocuments.integration.test.ts` retains the user's committed line wrapping, matching entry and HEAD, rather than being reverted to the older 09D source seal. It was run unchanged and its original actual bytes are archived.
- No task edit, old evidence/cache write, dependency install/change, commit/publish/revert, delegation, workspace-wide verification, V8 or OAR-10 occurred. The final process check in `processes-closed.json`/`CLOSURE.json` verifies **no owned build/test/Mongo/server/worker jobs remain**. The prior interruption did not leave a job running or require any verification rerun.

## Precise next owner work — OAR-09E-G only

1. Guard remains the **old full-DTO ALS path**, untouched in this packet: `acl/document-guard.ts`, `PublicService._read`, execution binding and finalizer's late `consumeReadGuardStage` still exist. Implement accepted DESIGN G1–G5: exact-receiver private reader, fresh-call wrapper, execution purpose, shared by-ID defaults/retry and shared query/fetch/hook-input prefix, private primitive condition consumer, removal of the old ALS seam. Do not use `resolveEmptyOutputHelperStage` for guards: ordinary/target/retry origins explicitly reject it. Continue using real `prepareOutputDocumentStage`/normal resolution/boolean fact normalization and the existing owner close/drain.
2. Preserve the shared helper selection kernel, `expandCatalogProjection`'s full query work, OAR-09C/D index/compaction/memo improvements, current H source/selected isolation and the admission-before-callback drain fix. `authorizeEmbeddedOutputPlan`/copy/grant helpers now accept the minimal shape generically but still return the full query-plan subtype for query callers. No legacy engine/adapters or public fact-origin/purpose selector.
3. Add/migrate guard tests with saved originals/purpose mappings and actual query/hook-input equivalence; ship accepted effects/error/override/default-include changes in installed docs/JSDoc/website and executable consumers. Existing guard controls passed here under the **current 24-callback/full-DTO semantics**; this packet does not claim zero guard callbacks.
4. Version and hash-bind the **new candidate-only guard count proof**: same H4 workload/one read/one hook, 0 field callbacks only after no DTO exists; normal DTO controls still 24. Keep old 24-callback tools/seals/campaigns truthful. Helper fingerprints/callback counts/capture freshness do not change. Deep diagnostic work scripts that looked for the old raw-helper `planAuthorizedModelProjection(...present)` expression or async `filterExistingOutput` must follow the new actual seams rather than report missing work as zero; this packet's probe shows exact-match instrumentation.
5. Run full scoped **V1–V7 on both packets**, real minimum/current installed/packed/module/guide/deco matrices, full V5/V6, full correctness smoke and necessary deterministic **67-output** rebuild/new seal/protocol. Prior 5,869/742/44/180-job results apply only to old 09D bytes and are invalidated as current full evidence by these product changes. No full V3/V4/V6/V7/67-output determinism or performance pass is claimed here.
6. Coordinator reconciliation then a **separate fresh measurement owner** runs the unchanged fixed V8 campaign. Preserve all three failed campaigns, original baseline, gates/pairs/repeat rules and unresolved signs. Work-count reductions are not latency/CPU/sign-stability acceptance; OAR-09/OAR-10 remain open.
