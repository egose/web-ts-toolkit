> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# FP-02 sequential recovery evidence

Scope: FP-02 configuration/capture ONLY. Coordinator owns task documents; this
recovery session does not edit `docs/tasks`, spawn agents, commit, publish, install,
change dependencies/lockfiles, or implement FP-03 runtime omissions.

## Incoming work and preservation

- HEAD: `8fb1fe7f148d5115d7bc0caa3aa0cddc31ad30b3`.
- Inspected every incoming modified access-router source file and both new option
  test files before editing. `incoming/`, `incoming.diff`, and
  `incoming-manifest.json` preserve their exact starting contents/hashes, including
  coordinator-owned task document changes. No existing work was reset or discarded.
- Prior evidence remains untouched in `_tmp-fp02-20261030-145752/`. Its latest
  broad V2 run recorded 1 failure / 1596 passes (35 files): an accessor was invoked
  in `service-authorization-context.unit.test.ts`. The incoming source already has
  a later descriptor-based preflight fix. Reran that unchanged file:
  `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts --no-file-parallelism --maxWorkers=1 test/service-authorization-context.unit.test.ts`
  — **81 passed**, log `v2-incoming-context.log`.
- FP-01 matrix/baseline read in
  `docs/task-artifacts/access-router/authorization-fast-fp01-20261030-142730/{coordinator-notes,verification-summary}.md`.
  Its official-before, historical diagnostic, timings, and manifests are preserved.
- No pre-existing active build/test/Mongo processes were found on entry. All
  recovery builds/tests will be foreground, serial commands.

## Audit findings to finish

1. Raw/dotted `setDefaultModelOption` must preflight before OptionsManager cloning
   can erase non-enumerable unsafe controls or execute their accessors.
2. Defaults bucket traversal must use descriptors before hydration/default readers.
3. Effective fast-mode signatures must be captured after publication but before any
   logger callbacks; dormant warnings must name each missing literal prerequisite.
4. Warnings/JSDoc must disclose future borrowed source/grant/context, stale/native/
   descendant/shape-bound risks and retained rules/cheap root authority, while stating
   accurately that FP-02 adds no runtime omissions yet.
5. Extend focused tests for those gaps, all six same-receiver reentrant query entries,
   independently issued READ inside a write hook, and mode-reader authentication in
   off/dormant/active states. Keep existing assertions and original suites intact.

Final contracts, commands/counts, file/symbol list, emitted hashes/export inspection,
preservation checks, and blockers will be appended after final verification.

## Outcome / implementation boundary

**FP-02 delivered and verified; no remaining FP-02 blocker.** Coordinator must
reconcile/update the shared task status. This recovery session did not edit it.
Stop before FP-03: the new flags select/capture a future mode only. They add **no
source/grant/context copy, field-decision, source-normalization or output-graph
bypass**. `readAuthorizationFastPath` has no runtime consumer outside its own
definition; `final-verification.json` checks that source boundary. Original eight
flags can still omit their previously authorized work independently.

### Exact selected/captured contract

- New independent group: `unsafeUseListAuthorizationFastPath` /
  `unsafeUseReadAuthorizationFastPath`. Original six comparison, two initial-copy,
  and combined eight arrays remain unchanged. The new ten-name `unsafeServerOptions`
  list is only for server normalization and control admission.
- Both are optional booleans/default false; only literal true enables a request.
  Explicit model false overrides defaults; undefined restores inheritance. Setters
  never enable prerequisites. Truthy strings/numbers/boxed booleans/native objects
  normalize false, including matching prerequisites at model/default publication.
- Private frozen capture is `{ origin: 'list' | 'read', mode: 'off' | 'dormant' |
  'active', prerequisites: number }`. Bits 0/1/2/3 represent matching origin
  Document/Output/NestedDocument comparisons and InitialOutputSnapshotCopy skips.
  Requested false/omitted = off; requested true + mask 15 = active; any other mask
  = dormant. Literal decisions are read before native configuration cloning can
  promote an exotic value to true.
- Root service query capture is synchronous before parser/identifier/operation
  hooks or awaits. Canonical root READ/LIST admission, exact bindings and service
  applicability are required. READ with list visibility/retry remains READ-origin.
  Captured registered related/embedded edges and same-binding READ retries retain
  the exact origin capture, not target/live/opposite-operation flags. Parent or
  provenance alone is insufficient. Related identity additionally matches the
  captured actual model when supplied.
- Private `readAuthorizationFastPath(call, binding)` authenticates the issued call
  and exact request/runtime/model/model-name/scope on every read, including repeated
  off/dormant reads. It is not exported by any package entrypoint or a row-trust
  certificate. Issued document handles retain their call's future selection after
  rollback; current source/grant copies and graph checks still run.
- All six query entries reset the same-receiver option dispatch for independent
  hook calls: `find`, `findOne`, `findById`, `_list`, `_read`, `_readFilter`.
  Genuine private descendants/retries keep their execution. Independent READ from
  a write hook captures its own query settings; write-derived output does not.
  Fresh helpers, arbitrary parents, new/create/update/upsert/delete, count/distinct
  and dedicated subdocuments have no applicable capture.
- Effective warnings compare coherent published mode + prerequisite mask before
  any logger runs. Every changed dormant missing mask warns once, with each missing
  `flag=true` named explicitly. Active warning discloses future borrowed source/
  grants/context, stale decisions, descendant replacement, lost native observations,
  denial becoming allowance and lost full unvisited source shape/bounds; it retains
  actual rules/hooks/getters, request/work limits and cheap exact root authority.
  Both warning/JSDoc say configuration-only adds no omissions yet. Off does not
  warn; reads/calls do not repeat warnings. Failed validation publishes nothing;
  throwing/reentrant loggers do not undo publication or rewrite its signature.
- Presence-based admission rejects both names in public HTTP/root/service/default/
  policy/helper/include/populate/`$$sq` controls, including inherited,
  non-enumerable, undefined and getter slots without reading flag getters.
  Raw/dotted default setters preflight before cloning; defaults bucket accessors
  reject before readers. Assigned `service.defaults` bags are revalidated before
  calls, preserving the existing assignment contract. Business data/predicates/
  projection field names remain inert; actual stored same-name Boolean fields can
  be queried/projected. Only `$$sq` creates controls inside data. Existing backend
  per-call authorization remains admitted. Shared traversal is iterative/cycle-aware
  with depth/array/slot/prototype bounds; no new recursive unbounded walk.

### Files / internal seams

All ten source files below were already modified on entry; the recovery refined
`runtime.ts`, `validation/public-admission.ts`, `acl/service-authorization.ts`,
`interfaces/root.ts` and extended both incoming new tests. The other six partial
source files remain byte-identical to their incoming versions.

| File | Delivered seam |
| --- | --- |
| `packages/access-router/src/acl/unsafe-snapshot-options.ts` | independent groups; `AuthorizationFastPathCapture`, `captureAuthorizationFastPath`, prerequisite bits |
| `packages/access-router/src/interfaces/root.ts` | optional server flags/JSDoc; original-eight future-trusted-runtime caveats |
| `packages/access-router/src/runtime.ts` | normalization/default false; raw/dotted default preflight; coherent `deferSnapshotWarnings` / `authorizationFastPathModes` |
| `packages/access-router/src/acl/model-output-planning.ts` | captured configuration includes normalized flags |
| `packages/access-router/src/acl/model-service-owner.ts` | `queryEntries` reset for independent same-receiver calls |
| `packages/access-router/src/acl/service-authorization.ts` | private CallRecord capture, explicit edge selection, authenticated internal reader, raw-policy key preflight |
| `packages/access-router/src/validation/public-admission.ts` | shared descriptor/control/data/default/policy traversal, `assertNoServerModelControls`, public/default preflight |
| `packages/access-router/src/services/service.ts` | service controls use the shared preflight before defaults/intent capture |
| `packages/access-router/src/acl/document-authorization.ts` | output-helper option presence preflight only; copying/grants/graph logic unchanged |
| `packages/access-router/src/acl/field-helper-options.ts` | helper/request-scope option presence preflight |
| `packages/access-router/test/authorization-fast-path-options.unit.test.ts` | exhaustive configuration masks, edges/handles, normalization/defaults/warnings/control lanes, no-bypass evidence |
| `packages/access-router/test/authorization-fast-path-options.integration.test.ts` | actual direct/public/HTTP/root/target/embedded/retry/rollback/reentrant/helper/write paths |

Existing tracked tests were not edited, removed, weakened or regenerated.

## Executed verification (repo root, SERIAL)

All log paths in this section are under this recovery directory. Vite emits the
existing future-native-config-loader advisory; no gate failures remain.

1. Regression-first run, **before recovery fixes**:
   `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts --no-file-parallelism --maxWorkers=1 test/authorization-fast-path-options.unit.test.ts`
   — **9 failed / 290 passed (299)**, `v2-recovery-regressions-before.log`.
   These intentional new assertions reproduce raw/dotted default-clone erasure,
   defaults-bucket getter execution, incomplete risk/missing-prerequisite wording
   and logger-reentry signature loss. Not claimed as failures at starting HEAD.
2. After fixes, same V2 prefix with
   `test/authorization-fast-path-options.unit.test.ts test/service-authorization-context.unit.test.ts test/default-model-options.unit.test.ts`
   — **425 passed / 3 files**, `v2-recovery-regressions-after.log`.
3. Expanded new focused files, same V2 prefix with
   `test/authorization-fast-path-options.unit.test.ts test/authorization-fast-path-options.integration.test.ts`
   — **315 passed / 2 files**, `v2-new-options-expanded.log`.
   The 256 original-eight masks each cover 4 new request pairs × 2 origins =
   **2048 root configurations**, plus opposite targets/embedded/READ retry checks.
   All 16 × 16 missing-mask transitions for both origins = **512 transitions**,
   truthy prerequisites/defaults, atomic failures/throwing loggers, retained handle
   graph rejection, real awaited rollback and all six same-receiver reentries pass.
4. Final **V1**:
   `pnpm --filter @web-ts-toolkit/access-router... --workspace-concurrency=1 build > _tmp-fp02-recovery-20261030-153025/v1-build-final.log 2>&1`
   — **passed**, five transitive workspace packages serially. Access-router emits
   all **14 dist files / 8 declaration files** with the existing bundled Node22 target.
5. Final **V2**: exact complete command and all **41** package-relative file arguments
   are saved in `v2-all-focused-final.command.txt` (with its actual log redirection).
   Result **1846 passed / 41 files**, **155.95s**, `v2-all-focused-final.log`.
   Covers both new files; original-six/eight/snapshot/copy/work suites; call/document/
   execution/configuration captures and finalizers; direct/related/includes; owner/
   actor/runtime-permission/hook ownership/concurrency; default/public/root/control/
   helper contracts; write/subdocument visibility; hydration and operation-admission
   boundaries; virtual-populate capture and fusion-absence. Source unchanged afterward.
6. Extra source typecheck:
   `pnpm --filter @web-ts-toolkit/access-router exec tsc --noEmit -p tsconfig.typecheck.json > _tmp-fp02-recovery-20261030-153025/source-typecheck-final.log 2>&1`
   — **passed**; this is source typecheck, not a claim that the full V3 suite ran.
7. Final **V5** ESLint:
   `pnpm exec eslint packages/access-router/src packages/access-router/test scripts/benchmarks > _tmp-fp02-recovery-20261030-153025/v5-eslint-final.log 2>&1`
   — **passed**.
8. Final **V5** Prettier: `pnpm exec prettier --check` with precisely the **12**
   source/test paths in the file table above — **passed**, `v5-prettier-final.log`.
   The exact full command/redirection is in `v5-prettier-final.command.txt`.
   Initial check found formatting in the expanded unit file only; applied the
   formatter-equivalent patch, not unrelated formatting. No task/CHANGELOG formatting.
9. Final **V5** diff:
   `git diff --check > _tmp-fp02-recovery-20261030-153025/v5-diff-check-final.log 2>&1`
   — **passed**.
10. Emitted CJS/ESM/types/preservation check:
    `node _tmp-fp02-recovery-20261030-153025/inspect-emitted.mjs > _tmp-fp02-recovery-20261030-153025/emitted-inspection.log 2>&1`
    — **passed**. Compiler verifies **16** root/advanced import/require inherited
    property surfaces as **optional boolean | undefined**, complete surviving JSDoc
    and all four prerequisites. Actual CJS/ESM runtime setter/default/undefined/
    truthy-value checks pass. Public runtime export **exact name sets**, not only
    counts, remain **root 46 / advanced 48 / processors 6** in BOTH formats.
    Declared export exact name sets remain **186 / 322 / 17** in BOTH formats.
    No new package public exports/issuers. Full data in `emitted-inspection.json`.

## Final identities and preservation

- HEAD unchanged: `8fb1fe7f148d5115d7bc0caa3aa0cddc31ad30b3`; no commits.
- Owned source/test file hashes and source-only diff: `final-verification.json`,
  `final-source.diff`. Twelve-file hash-map SHA-256:
  `53991b3656f8bf5e65ac846bc5057fc210c90c45802a72a5920735b7ab53375d`.
- Current verified root ESM SHA-256:
  `b2b2e1f83a1146464f257f13671f0d3f20577b69f4d812bcdf0f631f8aed5582`.
- Current verified root CJS SHA-256:
  `d434faf260f48f779337851b157d196b9b377241e54cc78fc0a8235dcc6e121d`.
- All-14-dist manifest SHA-256:
  `fec5e3818314d63cc9146f3654898730c71eee99b7367d3c90dc40e5e8612ac4`.
- All-8-declaration manifest SHA-256:
  `ad1f0a5dd12cee34bec1f3c2fa1e9adb7ad88f7e0c64f6ee537be21658d10035`.
- Lock unchanged:
  `ef86ef24726d09f81d1262656920d6215caeb0f26e345198db2d27b8ab7ab314`.
- All **14** verified emission bytes copied to `verified-fp02-dist/`; final rehash
  confirms those bytes still match mutable current dist and emitted inspection.
- Byte preservation verified: both coordinator-owned task documents unchanged from
  entry; package.json, root/advanced/processors source entrypoints, benchmark worker/
  core and lock unchanged; **192 existing tracked test files** byte-identical to HEAD;
  **6** earlier partial source files byte-identical to entry. No unrelated dirty files.
- FP-01 official-before **542 files**, all **134** pinned dependency identities /
  **3500 files** rehashed unchanged. Before/historical diagnostic/timing evidence and
  interrupted FP-02 logs were not overwritten. No historical source/dependency edits.
- Final process check: **no active build/test/Mongo processes**, no background jobs
  started. All owned commands finished in the foreground. Scratch directory is ignored.

## Handoff / remaining verification boundaries

No FP-02 blocker remains. Do not describe FP-02 as performance delivery or an actual
trusted row implementation. FP-03 must consume the authenticated captured mode,
create distinct borrowed/copied record states, retain cheap authority/rules and
implement only FP-01's authorized omissions/budgets. When it actually implements
that runtime, update the explicit **configuration-only/future** JSDoc and warning
sentences to describe real behavior; never select from live options/target flags.

Full V3 package/packed/consumer tests, V4 downstream, V6 benchmark tests, V7 timing,
FP-03 mutation/native-risk counterexamples and independent final review remain for
their owning tasks. They were not required/run in this configuration-only recovery.
No speedup/security-equivalence/historical-parity or full-workspace claim is made.
