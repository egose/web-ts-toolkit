> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# OAR-09E H+G regression, mechanism and contract ledger

This is the bounded finalization record, not task-status or release acceptance.
Actual entry is user commit `a1996e10f8339d89fc8a0aa2b10f7b531f5a07ca`.
No product source/test/doc/benchmark-tool bytes changed during this finalization. All original and
failed evidence remains intact; finalization writes only this new ignored packet.

## Delta and original-byte accounting

`final-01/COMBINED-HG-DELTA.{json,diff}` contains **37 product/test/doc/tool paths**
against actual user HEAD, including four new files. `G-ENTRY-DELTA` contains **29**
paths against saved first-G incoming bytes; `RECOVERY-DELTA` contains **27** against
saved recovery entry; `FINALIZATION-DELTA` is empty. The coordinator's task note is
excluded only from these product deltas and is protected against this packet's
**new incoming hash**, not excused as a generic historical difference.

The three migrated guard files and original boundary/export/pack tests are saved
at `_tmp-oar09e-guard-DmgmtvWS/originals/packages/access-router/test/`. First-G entry
already includes H. Finalization's own `originals/` holds the delivered bytes and
all 67 incoming outputs. SHA256 values are in the delta/source manifests; earlier
originals are covered by the historical stat audit. No archived original is edited.

The user-committed wrapping in
`packages/access-router/test/service-authorization-subdocuments.integration.test.ts`
matches incoming and HEAD, not the older 09D source seal. It is deliberately retained.
Seven H runtime files are byte-identical to first-G originals, including the shared
selection kernel, synchronous EMPTY admission and selected-poison/drain correction.
Both unchanged 09C/D 16-case suites remain HEAD-identical and pass in the full gate.

## Existing-test mechanism migrations (all counts are final full-gate counts)

| Path under `packages/access-router/test/` | Old mechanism and retained security purpose | Delivered proof |
| --- | --- | --- |
| `guard.test.ts` — 12 | Spied on public `_read` quiet arguments; also ID resolution, global/fact grammar, fresh hook, error propagation and forged/inherited state rejection. | Only the `_read` mechanism assertion changes: override is **not** called; actual adapter filter, lean hydration and hook source/initiating access/empty diagnostic facts are asserted. One query/one hook and every other case remain. New consumer/real-Mongo cases cover defaults, quiet/no-metadata output, query/hook equality, retry and errors. |
| `owned-authorization-helpers.unit.test.ts` — 27 | Four metadata strip/expose/forged/removed presentation cases must not authorize false fresh facts. | Same true→false guard/401, reads/hooks and frozen diagnostics assertions. New explicit **zero guard decorations** plus a separate ordinary `_read` that still decorates. No forged DTO becomes authority. |
| `owned-authorization-stage.unit.test.ts` — 111 | Three strip/expose/ordinary cases preserve fresh-stage conditions and reject presentation-forged grants. | Same two guard decisions/401 and read counts, plus no guard decoration and a distinct normal DTO decoration control. Other ownership, row/target, lifecycle, pending and closure cases remain. |
| `service-authorization-boundary-admission.contract.test.ts` — 68 | Forged `Object.create(PublicService.prototype)` tested wrapper controls rejected before dispatch and fresh request-only policy forwarding. | A lexical `#readById` requires a genuine class receiver. Only the read fixture uses `ownedStageFixture` and instruments the immediately receiving persistence executor. Existing undefined/JS/control rejection and forwarded request-only policy assertions are unchanged. Other wrappers retain their old fixture. No cast or fake undefined declaration masks a public mismatch. |
| `export-contract.test.ts` — 47 | Exact published runtime/type surface, editor docs and no private authority exports. | Adds guard JSDoc phrases and private reader/purpose/shape/EMPTY symbol rejection; no removal. Fresh ESM/CJS root/advanced/processors export **sets**, not just counts, equal the old sets: 46/48/6. |
| `packed-consumer-compatibility.test.ts` — 13 | Installed guide extraction, actual peer/module workflows, tarball allowlist and errors. | Expected guide blocks **6→7** solely for the added partial guard/business-read recipe. All seven exact blocks compile; old expected-error samples still fail separately. Existing runtime example remains 20 executions/60 HTTP/80 reads and hooks. |

`final-01/TEST-REGISTRATION-AUDIT.json` reconciles **5,869→5,957** core cases:
27 new helper cases, **46** final guard unit cases, 14 actual-Mongo integration
cases, and one new auto-discovered guide-block compile. The incoming prose's 44
guard-unit count predates two added nested/presentation controls; the actual final
results contain 46. No prior registered purpose disappears. Two unchanged `it.each`
fixtures render a fresh Date/ObjectId into their titles; raw old/new names and exact
HEAD/09D source-equality proof are retained rather than pretending byte-identical names.

## New positive, negative and lifecycle proof

- Exact registered PublicService receiver, bounded detached condition arrays,
  foreign/spread/JSON/prototype/fake receivers, inherited setters and purpose/retry
  ownership; no public selector, stage, raw data or token escapes.
- Both source modes; lean/hydrated public defaults and query/hook-input equality;
  one visible-row read/hook, zero output callbacks/decorations. A normal DTO on the
  same configuration still runs all 24 callbacks and presentation.
- True/false/missing conditions, global-only visible-row requirement, exact grammar,
  false ID/base/override filters, malformed sort and terminal 400/403, one bounded
  LIST retry under captured admission and initiating READ mode. A visible false
  condition is terminal, not a missing-row sentinel.
- Real Mongo root and target queries compare exact arguments with normal reads.
  Required ordinary/private populate fetch/masks keep target-local mode, operation
  and row admission; omitted target DTO work grants no target authority. No queried
  denied target row is recovered as root facts.
- Close/caught poison while the real hook is pending drains admitted work before
  returning controlled 400. Fresh smoke instruments actual closed/cleared stage
  records, including access/view/memo/source/facts. Empty `{}` observations from the
  uninstrumented preflight are **not** used as a stage-clear proof.
- H retains 100 fresh captures/catalogs/stages and 2,400 evaluations at 100 helpers,
  while query expansions/compactions/reference provenance/resolver promises are zero
  and source/view copies are 100, not 200. Shared native/selected budgets, denied-key
  charging, source isolation and async drain remain. Sixty characterized query plans
  are unchanged in the accepted H packet; no cross-call cache or DTO authority.

## Explicit breaking contract and installed-doc inventory

This is accepted DESIGN G1–G5, **not full-output behavior equivalence**. A guard
publishes no DTO, so field/virtual/embedded/target DTO processing, output-only include
attachment, decoration/tasks and `_read` overrides no longer run or veto it. Source,
fulfilled-fact, query and required dependency errors remain controlled failures.
Trusted callbacks/native code are not sandboxed and external freshness is not promised.

- `packages/access-router/MIGRATION.md` M2/M3/M5: removed effects/errors/override,
  includes/preflight, explicit business boundary, checked normal-read replacement,
  row/operation distinction, retry/modes and read counts; five typed partial blocks,
  one runnable block and one separate expected-error block.
- `packages/access-router/README.md`, `llms.txt`, shipped `guard` JSDoc in
  `src/middleware.ts`: discoverable installed contract and separate normal DTO read.
- `packages/access-router-deco/README.md`,
  `website/docs/packages/access-router/hooks.mdx`, `CHANGELOG.md`: matching breaking
  semantics without new deco/runtime hook types or an invented compatibility API.
- `scripts/benchmarks/README.md`: candidate-only hash-bound count proof revision,
  not a public feature switch or performance waiver.

An ordinary successful no-dependency guard normally costs **one root read/one root
hook/zero field callbacks**. An admitted miss may add one LIST retry; dependency
preparation can add target reads. A separate normal DTO/business read is explicitly
additional work, not a hidden refresh. Raw helpers add **zero** reads/hooks and retain
EMPTY facts; they do not check current document authority. Direct request-only `_read`
and a model condition do **not** imply the generated HTTP READ operation gate; compose
the appropriate existing guard when both checks are required. HTTP routes and retry
LIST admission retain their own checks.

## Failure retention and corrections

- First G: `regression-before.log`, `regression-after-01.log`, type diagnostics and
  `focused-02.log` (216 passes/five new-fixture failures) remain untouched.
- Recovery: initial invalid-include expectations and three first-full failures remain
  in original logs. The include fixture now uses a genuine preflight violation that
  ordinary DTO reads also reject; incomplete legacy descriptors remain ignored. The
  packed guide assertion recognizes the new block. The forged wrapper fixture became
  a real receiver without dropping admission assertions. Final 5,957/742 gates pass.
- Failed source-type/probe/offline attempts, initial formatting and `snapshot-final.log`
  are retained in recovery. No old `seal.py` or `run.py` is executed again.
- Finalization: `declaration-audit.log` and `failed-declarations-01.cjs` preserve an
  audit bug: a bare TS scanner misreads template-type backticks. The passing audit
  uses parser-driven tokens, not relaxed public-type equality. `DECLARATIONS-RAW.diff`
  keeps all old/new declaration differences; only JSDoc/trivia, hashed import names,
  exact private brand markers and the constructor equal to the inherited signature
  are intentional. All other public tokens must match.
- `packed-independent-audit.log`/`failed-packed-audit-01.py` preserve a newline-only
  extraction-auditor mistake; the corrected extractor includes the actual final
  newline exactly as the shipped fixture does. `delta-audit.log` and
  `failed-registration-audit-01.py` preserve the overly literal title comparison;
  only the two proven unchanged dynamic Date/ObjectId cases receive explicit mapping.
- `historical-campaign-audit.log` and `failed-campaign-audit-01.py` preserve a
  manifest-base assumption: earlier campaign manifests are packet-relative, while
  the third is batch-relative. The corrected audit resolves that explicit schema
  difference and verifies every retained stream without editing any old manifest.

No product fix or test weakening was required for finalization. Full gates are reused
only after exact source/tool/doc hashes, chronology and actual result/log success are
audited; the fresh six-package rebuild reproduces all 67 tested outputs. All changes
remain uncommitted. Performance and independent OAR-10 acceptance remain separate.
