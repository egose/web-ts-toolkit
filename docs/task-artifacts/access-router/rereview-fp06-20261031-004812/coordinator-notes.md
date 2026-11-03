> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# FP-06 independent fixed-candidate re-review — acceptance remains blocked

## Disposition

- **R1 resolved.** The four-line parent request/runtime guard is in
  `deriveTrustedQueryAuthorization` itself, before issuance. Direct, resolver-wrapper
  and registered-receiver checks pass without restoring graph/copy work.
- **Original R2 reproductions resolved, but R2/FP-08 is not fully accepted.** A
  residual selected-native work-budget bypass is independently reproduced below,
  including through the newly packed public LIST/READ API.
- **Recommendation: keep final acceptance blocked** pending the targeted budget
  correction and its scoped revalidation. Do not mark FP-06 complete on the strength
  of the passing original fixtures or performance evidence alone.
- Review only: no product/task-document edits, delegation, installs, lock changes,
  commits, publishing or reverts. All commands were serial, foreground and awaited.
  No workspace-wide lint/build/tests were invoked. No owned jobs remain.

All new evidence is in `_tmp-rereview-fp06-20261031-004812/` (ignored). Earlier review
logs **and caches** were sealed and preserved, not reused as writable caches.

## P1 — FP06-R2-residual: denied native-container keys bypass remaining work budget

**Location:** `packages/access-router/src/acl/trusted-output-materialization.ts:482-491`
inside `copyTrustedBsonValue.prepareWire`; budget enforcement is at lines 66-70/305.

The plain-object loop enumerates every own key and invokes `policy.keep`, but a
false result at line 488 continues without charging a slot. Only accepted children
reach `prepareWire`/`visitTrustedOutput`. Consequently, selected Code scopes, DBRef
fields and supported `toBSON` plain-object expansions can drive an arbitrarily wide
library-owned filtering loop while consuming only their container/native slots.
The Map branch, by contrast, charges each encountered entry before exclusion.

### Independent evidence

`native-residual.test.ts`, final log `v2-residual-final.log`:

| Case | Actual fixed-candidate behavior |
| --- | --- |
| Code scope with 21,000 policy-denied data keys | 21,000 policy calls; no controlled failure |
| DBRef fields with the same shape | 21,000 policy calls; no controlled failure |
| ObjectId data-method wire expansion to that shape | 21,000 policy calls; no controlled failure |
| Code scope, 19,998 slots already used, 100 denied keys | All 100 policy calls succeed despite only two remaining slots |
| Genuine Service LIST and READ, selected ObjectId expanding to unknown child keys | Both return success with `token: {}`; one document hook and one wire hook per operation |
| Denied Map-entry bound; cycle through an outer ordinary ancestor | Both reject as expected (passing controls) |

Final fixture result: **6 failed / 2 passed**. These are regression assertions for
the retained budget, not product fixes. Earlier six-case and eight-case logs remain
as `v2-residual-native.log` and `v2-residual-service.log`.

`packed-residual.runtime.mjs` uses only Express, Mongoose and the public
`createAccessRuntime` import from the freshly extracted, production-transformed
tarball. It selects `token`, enables the actual LIST/READ prerequisites and options,
and uses a supported own data-method `toBSON` on that selected ObjectId. The returned
21,000-key expansion is **preallocated outside the hook**. Unknown children are denied
by the real captured field policy. `packed-residual-result.json` records:

```json
{
  "list": { "status": 200, "output": [{ "token": {} }] },
  "read": { "status": 200, "output": { "token": {} } },
  "documentHooks": 2,
  "wireHooks": 2,
  "expandedOwnKeys": 21000
}
```

Expected under the retained structural-work contract: controlled **400**, without
partial successful output. The driver intentionally exits **1** after recording
these results and stopping MongoDB; see `packed-residual.log`.

**Impact and scope:** this violates the retained bounded selected-library-work
promise, not the waived bounds on unvisited source/grants/context or arbitrary
application hook computation. It does **not** demonstrate denied-field disclosure,
cross-request authority, a default-mode regression or an externally supplied hook
injection. Reachability requires the explicit active opt-in and a selected native
contained/wire-expanded shape with many excluded keys. Increasing that width
increases library traversal independently of the shared remaining budget.

**Suggested next correction, not implemented:** account for/bound the keys actually
enumerated and filtered from the remaining shared budget, including denied keys,
without reading their values or adding a full-source preflight. Preserve the small
ordinary native controls, denied-value non-observation, exact remaining-budget/depth
controls, one-hook behavior and poisoned whole-result failure. Promote these
regressions, then validate the changed artifact and relevant scoped gates.

### Reproduce against the preserved current evidence

From the repository root (no build/install needed for these preserved bytes):

```sh
pnpm exec vitest run --config _tmp-rereview-fp06-20261031-004812/vitest.adversarial.config.ts --no-file-parallelism --maxWorkers=1 --reporter=verbose
TMPDIR=<system-tmp-path> node _tmp-rereview-fp06-20261031-004812/run-packed-residual.mjs
```

Both commands intentionally fail their expected-rejection assertions on this
candidate. The second consumes `packed-current-consumers-result.json` and its fresh
extracted package; it does not load the workspace implementation as access-router.

## Resolved original findings and retained semantics

- All **nine original independent fixtures** pass using a new config/cache in this
  review directory. This includes original R1, original R2 and both work proofs.
- Current source is still exactly **four added guard lines** relative to FP-07's
  incoming `service-authorization.ts`; no other changes to that file. All **50**
  ownership tests pass, including direct derivation, the early-returning wrapper,
  valid scope/target controls and registered wrong-request/runtime receivers.
- All **80** native regressions/ordinary compatibility controls pass. Original
  overbound Code/DBRef LIST/READ return **400**; ordinary Code/DBRef return **200**
  through the new actual tarball, with six document hooks for six requests.
- The bounded fresh runtime/options/default/original-mode review remains green.
  No additional authority/field-disclosure finding was established in these sampled
  paths. This is not an exhaustive security assessment.
- The active embedded work proof still removes **36 stage / 384 grant / 24 context /
  24 source / 390 transfer** operations to zero; identity/admission work is also zero.
  Resolution/configuration copy is one; six contexts/hooks, 144 field callbacks,
  one adapter read and one embedded scope derivation remain. Timing workers still
  report omission counts **null**, not inferred proof of borrowing.
- Independent AST/text selection confirms **30** workload/scenario/model/check
  blocks unchanged from starting HEAD, including preflight/warmup/timing/postflight.
  The ordinary non-BSON materializer body is unchanged from FP-08 incoming source.
  This is a preservation check, not a claim that unchanged code is comprehensively
  free of defects.

No stricter source/grant/context isolation, native-observation equivalence, fresh
memo semantics or descendant-reachability guarantee was imposed. The accepted
weaker root/child-registry semantics and unsupported-native caveats remain in force.

## Artifact / installed-consumer identity and public surface

No V1 rebuild was necessary: all **14 live dist files** matched the newly measured
final fixed candidate before testing and still match at handoff.

| Identity | SHA-256 |
| --- | --- |
| Fixed root ESM | `a0fff8777b4185157578f8875ab043f7100537f0be035c616ad3facb5e2aef4f` |
| Fixed root CJS | `c069cae63c91810d8e65c473677c21377f596b0db2cf12de28320fd57f15fa56` |
| New actual tarball | `a94ea725cbe74b217d947d298374f677c495fc351092d58f52dc16e756728c67` |
| Unchanged lock | `ef86ef24726d09f81d1262656920d6215caeb0f26e345198db2d27b8ab7ab314` |

Tarball:
`packed-evidence/native-budget-CwoLAG/web-ts-toolkit-access-router-0.99.0-test.tgz`.

- Actual live and packed root/advanced/processors ESM and CJS **exact runtime name
  sets** are unchanged: **46 / 48 / 6**. Declaration sets for both conditions are
  **186 / 322 / 17**. No added private issuer/budget/marker export.
- All **eight declarations** are byte-identical to the original candidate; optional
  boolean options and their default-false/denial-risk documentation survive shipping.
  Packed metadata entry paths resolve. No scoped metadata/export/declaration
  regression was found.
- Fresh actual-packed **Bundler / Node16 / NodeNext** compiles pass with `strict`,
  unused checks and **`skipLibCheck:false`**, including the two type fixtures and
  exact shipped README example. Both Node16 and NodeNext ESM/CJS outputs plus a
  **fresh** bundle execute: five README runs, then the six-request native workflow.
  No dependency installation; existing dependencies provide peers/closure only.
- Separately audited all four FP-05 saved workflows: minimum Express **5.0.0** /
  Mongoose **8.0.0** and current **5.2.1 / 9.8.0**, each from tarballs and artifact
  package trees. All saved hashes/configs/installed outputs/tarballs match; the native
  fixture is **unconditionally awaited before** evidence export in the executed
  runner. Full-package logs contain all four passing workflows and all **12** packed
  cases. Minimum peers intentionally use `skipLibCheck:true`; current peers do not.
  These four workflows were **audited, not reinstalled/replayed** here. Their native
  stdout JSON was not separately retained by that runner. The independently rerun
  public controls/residual use installed Mongoose **9.11.4**, not minimum-peer claims.

Old `c26c217…` and intermediate `55af08e…` outputs remain historical. The old candidate
is used only for unchanged public-surface/declaration and timing comparisons, never
relabeled as the fixed runtime.

## Independent final-fixed timing / evidence audit

`audit-fixed-evidence.py` reads the **new fixed** four timing batches. It does not
substitute old tables or rerun the primary measurement matrix.

- **124 jobs / 8,200 samples**: 30/3,000 primary, 48/2,400 guards, 36/1,800 strict,
  10/1,000 bounded strict-noise repeat. Recomputed latency summaries and reconstructed
  **18 expected output fingerprints** from workload definitions; summary/raw agreement
  passes. CPU checked as recorded statistics, **not reconstructed raw CPU counters**.
- Artifact/declaration hashes, actual model single/bag getter values, configured and
  effective modes, hydration, read/hook/getter counts and unchanged workload parameters
  agree. Checked **134 pinned dependencies / 3,500 files** and 106 actual historical
  source files against the cited Git source. Lock and live fixed bytes match.
- Recomputed fixed-OFF to fixed-ON median gains: **26.4–26.9% wide**, **29.3–31.3%
  document-rules**, **54.5–54.6% embedded**. All primary p95/recorded CPU comparisons
  also improve; all **24 active guard pairs** improve median/p95/recorded CPU.
- The ordinary primary native-fix correction cost versus old c26 is small in this
  fixture. This does **not** establish arbitrary BSON-heavy performance equivalence.
- Preserve strict/dormant adverse/noise caveats: the repeat does not rule out modest
  default overhead, order effects or tail noise. No randomized/significance claim.
  Old adverse results remain historical, not overwritten.
- Fixed active remains **2.34–2.98× slower** than the source-only v0.51/current-
  dependencies diagnostic. Not frozen historical parity. LIST is timed; READ is
  runtime-tested, **not latency-measured**. No real-application measurement.

Audited prior final full affected gates: access-router **6,427 / 180 files**, source
typecheck, deco **691 / 22 files**, all 12 packed cases and final rebuild identity.
No redundant full V3/V4 or workspace-wide gate was run during this re-review.

## Exact fresh checks / evidence

Commands below were executed from the repo root, serially, with output redirected
to the named new log. `PKG_V2` denotes:

```sh
pnpm --filter @web-ts-toolkit/access-router exec vitest run --config ../../_tmp-rereview-fp06-20261031-004812/vitest.package.config.ts --no-file-parallelism --maxWorkers=1 --reporter=verbose
```

| Log / command | Result |
| --- | --- |
| `v2-original-nine.log`: `pnpm exec vitest run --config _tmp-rereview-fp06-20261031-004812/vitest.original-review.config.ts --no-file-parallelism --maxWorkers=1 --reporter=verbose` | **9 passed**, new cache |
| `v2-focused-fixed.log`: PKG_V2 + the 12 paths listed below | **1,004 passed / 12 files** |
| `v2-consumer-fixed.log`: PKG_V2 + `test/export-contract.test.ts test/strict-consumer-types.test.ts test/documentation-examples.test.ts` | **154 passed / 3 files** |
| `v2-packed-fixed.log`: `TMPDIR=<system-tmp-path> WTT_ACCESS_ROUTER_CONSUMER_EVIDENCE_DIR=_tmp-rereview-fp06-20261031-004812/packed-evidence` + PKG_V2 + `test/packed-consumer-compatibility.test.ts --testNamePattern 'FP-08\|manifest transformation\|packs the current\|FP-04 packs'` | **4 passed / 8 explicitly skipped**; fresh actual tarball |
| `v2-residual-final.log`: adversarial command above | **6 failed / 2 passed**, confirmed residual |
| `packed-current-consumers.log`: `TMPDIR=<system-tmp-path> node _tmp-rereview-fp06-20261031-004812/packed-current-consumers.mjs` | 3 strict compiles, 5 README executions, native public controls pass |
| `packed-residual.log`: public residual command above | Intentional exit **1**, LIST/READ incorrectly 200 |
| `source-typecheck.log`: `pnpm --filter @web-ts-toolkit/access-router exec tsc --noEmit -p tsconfig.typecheck.json` | Passed; no rebuild |
| `v5-eslint.log`: `pnpm exec eslint packages/access-router/src packages/access-router/test scripts/benchmarks` | Passed, scoped only |
| `v5-prettier.log`: `pnpm exec prettier --check` + exact 45 affected package/benchmark/package-doc paths in `v5-prettier.command.json` | Passed; no writes |
| `v5-diff-check.log`: `git diff --check` | Passed |
| `v6-runner.log`: `TMPDIR=<system-tmp-path> WTT_BENCH_TMP=<machine-local-path> node --test --test-concurrency=1 scripts/benchmarks/access-router.test.mjs scripts/benchmarks/access-router.integration.test.mjs` | **29 passed**, real workers/modes; no build |
| `fixed-evidence-audit-final.log`: `python3 _tmp-rereview-fp06-20261031-004812/audit-fixed-evidence.py` | Passed, new-fixed raw evidence |
| `independent-public-surface-corrected.log`: `node _tmp-rereview-fp06-20261031-004812/audit-public-surface.mjs` | Passed, live + packed exact sets |
| `independent-workload-proof.log`: `node _tmp-rereview-fp06-20261031-004812/audit-workloads.mjs` | Passed, 30 unchanged blocks + ordinary non-BSON body |
| `prior-packed-workflow-audit-final.log`: `python3 _tmp-rereview-fp06-20261031-004812/audit-packed-prior.py` | Passed, four prior actual peer workflows audited |
| `preservation-process-audit-final.log`: `python3 _tmp-rereview-fp06-20261031-004812/finish-review.py` | Passed, preservation and no owned processes |

The 12 focused paths were:

```text
test/authorization-fast-path-owner.unit.test.ts
test/authorization-fast-path-native.unit.test.ts
test/authorization-fast-path-runtime.unit.test.ts
test/authorization-fast-path-runtime.integration.test.ts
test/authorization-fast-path-options.unit.test.ts
test/authorization-fast-path-options.integration.test.ts
test/output-publication-fusion-withdrawal.unit.test.ts
test/query-snapshot-work.unit.test.ts
test/default-model-options.unit.test.ts
test/initial-output-snapshot-copy.unit.test.ts
test/field-helper-request-boundaries.integration.test.ts
test/service-authorization-boundary-admission.contract.test.ts
```

Review-script setup failures are preserved rather than concealed: the first surface
audit selected metadata without an `exports` manifest; the prior-packed audit first
over-assumed unused-check flags, then a flat installed layout for artifact trees.
Only the new audit scripts were corrected. Their final checks pass. Vitest emitted
the same advisory CJS-config/native-loader warning; no test failure resulted.

## Preservation / limits

`handoff-state.json` verifies **356 incoming product/task identities**, **1,749 earlier
evidence/cache identities and their file sets**, original Git HEAD/status/diff,
all 14 fixed dist outputs and lock unchanged. The only new files are ignored review
fixtures/configs/caches/extractions/logs/audits/these notes. No owned runtime,
Vitest, benchmark worker, esbuild or MongoDB process remains.

This is bounded independent review of the agreed contract, not workspace-wide
verification, a complete security/native-subclass audit or a historical-parity
claim. Existing full affected-package/deco gates were audited rather than repeated;
minimum-peer full declaration internals remain intentionally excluded in their
saved workflows. The confirmed residual is sufficient to block acceptance; no
implementation or task-status decision has been made on the coordinator's behalf.
