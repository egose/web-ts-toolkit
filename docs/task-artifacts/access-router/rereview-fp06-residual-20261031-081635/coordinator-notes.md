> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# FP-06 fresh independent last-residual re-review — proceed to FP-05

## Disposition

- **No blocking finding in the final residual delta. R1 remains resolved; original
  R2 and its denied-key residual are independently confirmed resolved on the current
  `33662fae…` artifact.** This is a bounded review, not exhaustive security acceptance.
- **Proceed to reopened FP-05** for NEW final affected-package gates, artifact/peer
  workflows and proportionate timings, then independent evidence closure. Do not
  mark overall FP-06/the feature complete yet. Previous `a0fff877…` full gates and
  timings do not validate or measure these new bytes.
- Review-only: no product/task edits, delegation, build, install, dependency/lock
  changes, commits, publication, revert or old-evidence/cache modifications. All
  calls were serial, foreground and awaited. No owned jobs remain.

All new evidence is in this ignored directory. Coordinator retains ownership of
`docs/tasks/20261030-142406-access-router-unsafe-authorization-fast-path.md`.

## Exact code/delta review

`delta-corrected.log` independently hashes all 1,953 incoming product identities
against the implementer's saved incoming manifest. Exactly the six authorized
paths differ. Reconstructing their diff from saved incoming files produces the
**byte-identical** `followup-only.diff`; the independent copy is
`independent-delta.diff`. The first audit attempt used the wrong saved-copy prefix;
only this review's script was corrected, with the setup failure retained in
`delta.log`.

Reviewed current source and the actual incoming delta, not just handoff prose:

- `src/acl/trusted-output-materialization.ts:483-495,567-580`: every ordinary/BSON
  encountered key is admitted before protected-key exclusion, policy evaluation or
  descriptor/value access. Accepted child recursion uses a zero-slot root admission,
  retaining depth/poison checks without double-charging the prepaid key. Dense-array
  length/hole admission remains; Map entries were already charged before exclusion.
- Same file `:103-136`: protected named-Map fields and generated-alias shell slots
  now consume work before exclusion. No recursive source/grant eligibility pass.
- `src/services/service.ts:645-665` and `src/acl/output-field-filter.ts:595-608`:
  active metadata enumerates keys, charges, filters, then reads exposed values.
  Denied getters are not observed. New field-permission maps admit their path count
  before allocation. Small exposed metadata still works; helper authority/memo reuse
  does not rerun the document hook. The copied/nontrusted branch is unchanged.
- Inspected nearby selected-array/reference/finalizer/issued-member loops. Arrays
  retain bounded length admission; native DBRef ordered-copy work receives already
  admitted preparation; registry members charge before insertion/reunion. No further
  analogous blocker established in this bounded inspection.
- `src/acl/service-authorization.ts:539-543`: the receiving request/runtime check
  still precedes trusted issuance. This file and selection/admission/public entry
  files are unchanged by the last delta. The six/two/eight groups remain unchanged.

Paths above are under `packages/access-router/`. Permission evaluators, hooks,
actor/target admission and trusted root/call/stage ownership were not replaced by
the fix. Borrowed source/grants/context/configuration, stale decisions and issuance
membership rather than descendant reachability remain **accepted risks**, not
findings. No demand for waived snapshots, deep copies or graph verification.

## Independent runtime confirmation

**196 product cases / 3 files, plus 25 review cases / 3 files pass.**

| Fresh log | Actual result |
| --- | --- |
| `original-nine.log` | Original independent **9/9**: R1, original R2 and both work proofs |
| `residual-eight.log` | Prior residual **8/8**, formerly six failures and two controls |
| `product-focused.log` | Native **102**, owner **50**, runtime unit **44**: **196/196** |
| `adjacent-controls.log` | **8/8** new, narrowly targeted adjacent controls |

Residual native denial-policy calls stop at **19,998 Code / 19,997 DBRef / 19,998
wire**. With 19,998 slots pre-used, Code rejects **before the first policy call**.
Actual Service LIST/READ reject without partial data, with one document/wire hook
each. Product tests independently rerun denied-accessor/protected-key/named-Map/
metadata overflow, native three-slot exactness, depth-100 boundaries, aliases,
cycles, readonly values, single normalization and whole-result virtual poison.

The extra review controls cover ordinary accepted/denied scalar exact slots,
ordinary/native denied-key depth admission before policy, per-occurrence ordinary
aliases, generated-alias shell charging and small metadata exposure through real
LIST/READ plus issued helpers. Exposed getters run once, excluded getters zero
times; document hook/rule counts remain one.

Original work proofs retain **zero** active stage/grant/deep-context/source-copy/
transfer/identity/admission work, one resolution/configuration copy, six contexts/
hooks, **144 actual field callbacks** and one adapter read; embedded derivation one.
These are instrumented work controls, **not latency measurements**.

## Actual packed public/API proof

`packed-audit.mjs` freshly extracts the CURRENT supplied tarball into
`packed-independent-2xaBFN/`, links only existing peers/dependencies and copies the
CURRENT permanent native runtime fixture. No old extraction, installed access-router
substitute, cached bundle, new pack or dependency install is used.

`packed-audit.json` / `packed-public-surface.log` independently confirm:

| Actual public value | LIST | Filter READ |
| --- | ---: | ---: |
| Ordinary Code with nested DBRef | **200**, shape checked | **200**, shape checked |
| Oversized Code scope | **400**, no partial data | **400**, no partial data |
| Oversized DBRef fields | **400**, no partial data | **400**, no partial data |
| 21,000 denied-key ObjectId wire expansion | **400**, no partial data | **400**, no partial data |

Exactly **8 document hooks / 2 wire hooks**. Actual peer Mongoose **9.11.4**.
Fixture source SHA-256 `c3e14be4efd8508db34fdf8121f16f59e2832ce4073c16b5ebdf70857debf30e`.
Server, Mongoose and MongoMemoryServer shutdown are awaited.

- All **14 live dist files** equal both the preserved last-fix artifact and the
  actual extracted package. Changed source/docs/tests also match saved final hashes.
- All **8 declarations** are byte-identical to the incoming candidate; no private
  budget/materializer/member-builder/derivation names leak into them. Actual
  exported type-name sets for BOTH conditions remain **186 / 322 / 17**.
- Exact live and public-packed ESM/CJS runtime export-name sets remain **46 / 48 /
  6** for root/advanced/processors. Default and named `acl` binding identity is
  preserved in both formats. Public package entry paths resolve.
- Declaration checking here extracts actual compiler export symbols; it is **not**
  a new strict consumer compile or minimum-peer replay. Those final workflows
  remain FP-05 work.

| Current identity | SHA-256 |
| --- | --- |
| Root ESM | `33662faede23acffc1a90973f51a7407df147afba76e4fbb23eeb99169df3822` |
| Root CJS | `4ad8ab48b44d91d4051c56e056bf3c2302e0f75c9fbd96b509a15b36f1003bea` |
| Actual tarball | `7e768d4fd3462ca0abc24bd140cd44e7c5a7c92c278e8694d8ab8b286ad49fa4` |
| Unchanged lock | `ef86ef24726d09f81d1262656920d6215caeb0f26e345198db2d27b8ab7ab314` |

Tarball path:
`_tmp-fp08-residual-20261031-011826/packed-evidence/native-budget-CZz5Ea/web-ts-toolkit-access-router-0.99.0-test.tgz`.

## Actual commands / remaining gates

Commands ran from the repository root. Exact argv, result and duration are retained
under each log prefix's `.command.json` / `.result.json`. The recorder wrapper was
`python3 _tmp-rereview-fp06-residual-20261031-081635/run.py <prefix> <command...>`.

```sh
pnpm exec vitest run --config _tmp-rereview-fp06-residual-20261031-081635/vitest.original.config.ts --no-file-parallelism --maxWorkers=1 --reporter=verbose
pnpm exec vitest run --config _tmp-rereview-fp06-residual-20261031-081635/vitest.residual.config.ts --no-file-parallelism --maxWorkers=1 --reporter=verbose
pnpm --filter @web-ts-toolkit/access-router exec vitest run --config ../../_tmp-rereview-fp06-residual-20261031-081635/vitest.package.config.ts --no-file-parallelism --maxWorkers=1 --reporter=verbose test/authorization-fast-path-native.unit.test.ts test/authorization-fast-path-owner.unit.test.ts test/authorization-fast-path-runtime.unit.test.ts
pnpm exec vitest run --config _tmp-rereview-fp06-residual-20261031-081635/vitest.adjacent.config.ts --no-file-parallelism --maxWorkers=1 --reporter=verbose
TMPDIR=<system-tmp-path> node _tmp-rereview-fp06-residual-20261031-081635/packed-audit.mjs
```

V5 passes: scoped ESLint over the five changed code/test files; Prettier check over
all six changed files; `git diff --check`. Exact paths are in `v5-*.command.json`.
Every Vitest configuration/cache/log is unique to this review; older caches remain
unchanged. Vitest's advisory future native-config-loader warning is non-failing.

`preservation.json` verifies **1,953 product/task identities, all 14 dist files and
704 earlier evidence/cache identities**, HEAD, Git status and binary diff unchanged.
The only new files are ignored review evidence/fixtures/configs/extraction. No owned
process remains; all commands completed without background jobs.

No full V3/V4, benchmark runner/timing rerun, source rebuild/typecheck, strict packed
consumer compilation or minimum-peer replay was performed here. No workspace-wide
lint/build/test command ran. Prior review decisions and timings were read only for
context, not relabeled as current verification. New affected-package final gates,
NEW artifact timings and later independent evidence closure are still required.
No READ latency, real-application, historical-performance/security equivalence or
exhaustive native/global-mutation claim is made.
