> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# FP-08 residual key-work budget follow-up — fixed; stop here

Implemented only the reopened FP06-R2 residual and analogous active selected-key
filtering loops. No task-document edits, delegation, commits, publishing, dependency/
lock/history changes, reverts or unrelated optimization. No workspace-wide build,
test or lint. All commands were serial, foreground and awaited. No owned jobs remain.

## Exact delta / accounting

`followup-only.diff` compares against the incoming post-FP-05/re-review state, not HEAD.
Paths below are under `packages/access-router/`:

| File | Added / removed lines |
| --- | ---: |
| `src/acl/trusted-output-materialization.ts` | 15 / 8 |
| `src/acl/output-field-filter.ts` | 14 / 7 |
| `src/services/service.ts` | 7 / 5 |
| `test/authorization-fast-path-native.unit.test.ts` | 217 / 2 |
| `test/authorization-fast-path-native.runtime.fixture.mjs` | 37 / 14 |
| `README.md` | 2 / 0 |

- Ordinary selected objects **and BSON preparation** charge each encountered key
  **before** protected-key exclusion, `policy.keep`, descriptor reads or value work.
  Accepted children use that **prepaid slot** (zero additional root slots), retaining
  the exact old small-value counts instead of double-charging every accepted field.
- Code + scope + scalar still costs **three slots**. A denied scope property also
  costs three total, but its value/descendants are never visited. Depth-100, depleted
  shared budget, alias/cycle, readonly input, one-hook/one-wire-copy and poisoned
  whole-result failure controls remain unchanged and passing.
- Dense arrays retain length/hole admission plus present-entry admission; only their
  one fixed `length` descriptor is skipped. Maps retain their existing conservative
  entry + accepted-value charging. Protected named-Map fields now charge before
  skipping, including repeated protected names. Shallow shells charge before the
  generated-alias exclusion as well. No extra source eligibility/graph preflight.
- Previously, **two active metadata loops** filtered uncharged denied entries after
  eager `Object.entries` value reads. Service publication and trusted retained-helper
  metadata now collect keys, admit each against the same remaining budget, filter,
  then read only exposed values. Tests combine 12k selected-array work with 10k
  excluded metadata keys, proving controlled failure and **zero denied getter reads**.
  This is an intentional correction to active metadata observations: excluded getters
  no longer execute. The nontrusted helper branch's existing behavior is unchanged.
- Newly built request-only field-permission maps admit their path count before the
  map allocation/loop. No grant/context deep copy, descendant identity verification,
  authorization re-resolution, extra BSON serialization or normalization hook exists.

### Adjacent-loop audit boundary

Reviewed the new selected materializer, named Maps/shallow shells, metadata publication
and helper retention, plus nearby output-array/reference/build/registry call sites.
Both generic Map loops already admitted entries before filtering. Array builders use
length/hole bounds; DBRef's ordered-field copy and the flat native-output-key check
consume already bounded preparation results. Issued-root registries already charge
entries. Planning/canonical-field loops operate on captured catalogs/selected plans;
no new walk of hidden source/grant descendants was added to bound this defect.
This is a focused work-budget audit, not an exhaustive security/native/global-state
audit. Waived borrowed-state/native side effects and unvisited-source bounds remain.

## Regression-first evidence

1. `review-residual-before`: original rereviewer fixture, new config/cache:
   **6 failed / 2 passed**. Code/DBRef/wire all perform **21,000** policy calls without
   failure. With 19,998 slots used, Code still performs **100** calls. Real Service
   LIST/READ incorrectly succeed with `{ token: {} }`, one document/wire hook each.
2. `promoted-before`: **20 failed / 2 passed / 80 original tests excluded** before
   any source change. Added ordinary/native/accessor/protected/named-Map/depleted/
   service/public/helper/metadata regressions, with passing Map/cycle and virtual
   poison controls. No fixture correction or weakened assertion was needed.
3. `packed-public-before`: freshly packed incoming `a0fff877…` implementation and
   extended permanent fixture: original ordinary/native controls get past their
   assertions, but public **LIST wire-denied-keys returns 200 instead of 400**.
   Child/Mongo cleanup completes despite failure. Old rereviewer HTTP logs remain
   untouched, including its READ reproduction.
4. Implemented the narrow source changes above; `native-after`: **102/102 passed**.
   Existing **80 cases/assertions remain**; 22 new cases were added. The only existing
   fixture changes add an optional schema override to test a genuine nonopaque
   ObjectId catalog field, not a simulated public `keep:false` policy.
5. Final focused build/tests/reviewer/packed/consumer/TypeScript/V5 checks below pass
   on the same final source/dist. No post-verification source edits.

## Bounded counts / behavior actually asserted

| 21,000 denied keys | Policy calls before controlled rejection |
| --- | ---: |
| Ordinary selected record | **19,999** |
| Code scope | **19,998** |
| DBRef fields | **19,997** |
| ObjectId wire expansion | **19,998** |
| Code, 19,998 slots pre-used | **0**, not even the first policy callback |

Denied accessor values have **zero reads** in all four record/native cases, including
protected keys. A denied child containing a huge/proxy graph remains unvisited.
Budget failure remains poisoned, including zero-slot subsequent checks. Helpers
reuse their issued authority without rerunning document hooks; no partial DTO is
returned after failure. Virtual budget failure still fails the whole result.

All original **nine** independent regressions/work proofs and all **eight** new
rereviewer regressions/controls pass using **new exclusive configs/caches** here.
The unchanged work proofs retain zero active stage/grant/deep-context/source/transfer/
identity/admission passes; one resolution/config copy, six contexts/hooks,
**144 field callbacks**, one adapter read and one embedded derivation remain.
These are instrumented work controls, **not timings of the new bytes**.

## Commands / counts (repo root; exact argv in `<prefix>.command.json`)

Package V2 uses the existing package configuration with only root/cache relocated:

```sh
pnpm --filter @web-ts-toolkit/access-router exec vitest run --config ../../_tmp-fp08-residual-20261031-011826/vitest.package.config.ts --no-file-parallelism --maxWorkers=1
```

| Prefix | Executed command / result |
| --- | --- |
| `v1-build` | `pnpm --filter @web-ts-toolkit/access-router... --workspace-concurrency=1 build` — passed, affected package + required transitive closure only |
| `v2-focused` | V2 + **48 explicit paths**, recorded in argv — **2,023 passed**, including native **102**, owner **50**, runtime/options/direct/public/helper/default/copy/native/strict-finalizer and four metadata integration suites |
| `v2-consumer` | V2 + `test/export-contract.test.ts test/strict-consumer-types.test.ts test/documentation-examples.test.ts` — **154 passed / 3 files** |
| `review-original-after` | `pnpm exec vitest run --config _tmp-fp08-residual-20261031-011826/vitest.original.config.ts --no-file-parallelism --maxWorkers=1 --reporter=verbose` — **9 passed** |
| `review-residual-after` | same command with `vitest.residual.config.ts` — **8 passed** |
| `packed-public-after` | V2 + `test/packed-consumer-compatibility.test.ts --testNamePattern FP-08`, approved scratch TMPDIR/new evidence directory — **1 passed / 11 explicitly excluded** |
| `packed-current-consumers` | `node _tmp-fp08-residual-20261031-011826/run-packed-consumers.mjs _tmp-fp08-residual-20261031-011826/packed-evidence/native-budget-CZz5Ea/web-ts-toolkit-access-router-0.99.0-test.tgz` — **3 strict compiles + 6 executions passed**, no install |
| `source-typecheck` | `pnpm --filter @web-ts-toolkit/access-router exec tsc --noEmit -p tsconfig.typecheck.json` — passed |
| `v5-eslint` | `pnpm exec eslint packages/access-router/src packages/access-router/test` — passed, scoped only |
| `v5-prettier` | `pnpm exec prettier --check` over the six changed files — passed |
| `v5-diff-check` | `git diff --check` — passed; preservation audit additionally checks all six files with no-index whitespace checks |
| `artifact-audit` | `node _tmp-fp08-residual-20261031-011826/audit-artifact.mjs` — passed |
| `preservation-audit` | `python3 _tmp-fp08-residual-20261031-011826/audit-preservation.py` — passed, no owned jobs |

**Final product V2: 2,178 tests / 52 files**, plus **17** independent review fixtures.
This is not full V3/V4/V6, a minimum-peer install or final performance acceptance.

## Newly packed public proof (not an old tarball/extraction)

The permanent fixture reuses the existing real production manifest transformer,
packer, Mongo runner and HTTP workflow. Added one real persisted ObjectId field/row;
the document hook installs a supported data-method `toBSON` returning **21,000
preallocated unknown child keys**. Genuine captured field policy excludes those
children. The expansion is allocated outside the hook, not during measured traversal.

`packed-evidence/native-budget-CZz5Ea/result.json` proves:

| Value / operation pair | Public LIST | Public filter READ |
| --- | ---: | ---: |
| Ordinary Code + nested DBRef | **200**, native JSON shape checked | **200**, shape checked |
| Oversized Code scope | **400**, controlled/no partial data | **400**, controlled/no partial data |
| Oversized DBRef fields | **400**, controlled/no partial data | **400**, controlled/no partial data |
| Residual unknown-key wire expansion | **400**, controlled/no partial data | **400**, controlled/no partial data |

**Eight document hooks / two wire hooks**, exactly once per applicable row/request.
The fixture is awaited by the existing full packed/artifact consumer workflows too;
FP-05 must rerun those full gates later. No test infrastructure was duplicated in
product code. The extra ignored consumer driver creates a fresh script, extraction
and bundle rather than writing into any earlier evidence directory.

`packed-current-consumers-result.json`: all **14 packed outputs equal current live
dist**, strict Bundler/Node16/NodeNext with `skipLibCheck:false`, actual newly emitted
Node16 ESM/CJS + NodeNext ESM/CJS + fresh packed README bundle + the extended native
HTTP fixture execute. Existing peer links only; no old implementation/tarball/bundle
is substituted for access-router.

## Final identities / preservation / remaining owner

- Root ESM: **`33662faede23acffc1a90973f51a7407df147afba76e4fbb23eeb99169df3822`**.
- Root CJS: `4ad8ab48b44d91d4051c56e056bf3c2302e0f75c9fbd96b509a15b36f1003bea`.
- Actual tarball: **`7e768d4fd3462ca0abc24bd140cd44e7c5a7c92c278e8694d8ab8b286ad49fa4`**.
- Lock unchanged: `ef86ef24726d09f81d1262656920d6215caeb0f26e345198db2d27b8ab7ab314`.
- `current-artifact.json` hashes current source/docs/tests/dist; `current-dist/`
  preserves all 14 outputs. All **eight declarations byte-identical**. Exact current
  CJS/ESM public runtime name sets remain **46 / 48 / 6**. No public budget/issuer/
  marker, dependency, entrypoint or package metadata change.
- `preservation-and-jobs.json`: **1,953 incoming product identities** checked; only
  the six authorized files differ. **567 earlier evidence/cache identities** remain
  byte-identical (prior review, re-review, FP-07 and original FP-08 evidence outside
  dependency trees). Shared task documents, FP-07 auth source, all other original
  tests/source, benchmark scripts, HEAD and Git status are unchanged. No jobs remain.

Incoming **`a0fff877…`** was the previously measured candidate and reproduced the
residual; its `incoming-dist/` and all prior artifacts/logs remain preserved. Its
timings — like older `c26c217…` timings — are **not** measurements of `33662fae…`.

Stop this FP-08 follow-up. Coordinator owns status reconciliation; reopened FP-05
owns full **affected-package** V3/V4/V6, peer/artifact gates and new-artifact timing
revalidation, followed by independent FP-06 recheck. No workspace-wide checks are
authorized later either. No new latency/READ latency, historical/security equivalence,
real-application or exhaustive native/global-mutation claim. Existing unsupported
native caveats and intentionally borrowed source/grant/context risks are unchanged.
