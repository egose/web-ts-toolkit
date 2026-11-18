# CWO-02: retain pre-write UPDATE view preparation

Owner: INPUT-02, a new sequential child session. Related task:
[CREATE/UPDATE input optimization](../../../../tasks/20261112-084753-access-router-create-update-input-optimization.md),
CWO-02 only. The coordinator owns task/status; this executor did not edit it.

**Decision: bounded no-change recommendation.** Do not unconditionally pass
`exposeSource: false` to `resolveDocumentStage` from `resolveInputDocumentGrants`.
No production candidate was created, retained, timed or withdrawn. No speedup,
CPU/allocation/heap benefit or reduced-copy claim is made.

Verification passed: filtered dependency build/source typecheck; focused V1
**999 tests / 25 files**, including **122 new cases**; scoped ESLint/Prettier and
the exact test-layer checker. Production remains at
`23848c60ab172e5d421ee651c26dce41fd9410b0`. CWO-01 artifacts, source, fixture,
tooling/tests and operational baseline seal bytes were preserved.

## Allowed scope and disposition

The authorized boundary was the private input-grant resolver/stage seam, affected
package invariants and characterization, plus this new evidence bundle. No agents,
commits, dependency/host/configuration changes, public API changes, root/grouped/
downstream tests or overlapping build/test/calibration commands were authorized or
performed. There was no optimization requirement merely to make input/output symmetric.

Retained additions only:

- [Dedicated-parent invariants](../../../../../packages/access-router/test/invariants/write-input-dedicated-observations.unit.test.ts):
  84 cases for direct/public single/bulk dedicated UPDATE.
- [Shared view/stage invariants](../../../../../packages/access-router/test/invariants/write-input-view-boundaries.unit.test.ts):
  38 cases for canonical UPDATE/UPSERT errors, primitive hydration overrides and
  input-owner ready/closed/draining boundaries.
- [Private observation fixture](../../../../../packages/access-router/test/support/private/write-input-view-test-fixture.ts):
  delegates real stage operations unchanged, labels synchronous native source/view
  work, captures admitted stages and closes test-retained owners during cleanup.
- This README, [verification.json](verification.json) and
  [observations.json](observations.json).

Withdrawn files/source changes: **none**. Existing production, public-contract tests,
baseline tests/benchmark tooling/fixture identities and historical seals were not edited.
New characterization stays in invariants/private support, not invented public promises.
Existing internal work/parser probes and public contracts were rerun unchanged.

## Source evidence and narrow-scope assessment

Paths in this section are relative to `packages/access-router/`.

1. `src/acl/model-input-admission.ts`, `resolveInputDocumentGrants` (363–401), resolves
   the captured UPDATE definition, constructs an isolated stage, and supplies a callback
   that ignores the staged view. The hook still receives the original hydrated
   `args.doc`, original request receiver/captured actor and a frozen diagnostic context.
   The stage is cleared in `finally`; fact commit and publication tracking are separate
   obligations, not part of the discarded-argument question.
2. `src/acl/document-stage.ts`, `resolveDocumentStage` (270–318), prepares that view
   **before** invoking the resolver, including when there is no UPDATE hook. Failures
   poison the publication before hook/fact/save work. `prepareQueryOutputSource`
   (543–615) admits the initial hydration result and captures publication-owned
   provenance. Its `PreparedSource` contains only `source` and `borrowed` (450–453),
   not a primitive-only/exposure-free graph certificate.
3. `src/acl/trusted-output-materialization.ts`, `materializeTrustedOutputValue`
   (689–817) and `copyTrustedBsonValue` (403–686), keep ordinary descriptor admission,
   structural/payload accounting and value-local native normalization. Inherited BSON
   data hooks survive normalization and can execute again on the next materialization.
   The scalar leaf fast path (702–714) is not proof that a containing source graph
   contains only scalars. Native normalization returns are not admission certificates.
4. `src/services/model-subdocument-service.ts`, `inputAdmission` (116–157), invokes
   the same resolver on the **owning hydrated parent** for UPDATE/bulk UPDATE, once
   before scoped request-field decisions. Single/bulk paths then patch selected children
   and save the parent (258–327). Dedicated CREATE still uses `EMPTY_DOCUMENT_GRANTS`
   (119–122), not invented existing-document input facts.
5. `src/acl/subdocument-authorization.ts`, `prepareSubdocumentCall`, and
   `src/acl/service-execution.ts`, `createServiceExecution`, retain the dedicated generic
   stage origin. Canonical write-output mode settings do not issue a dedicated
   write-output certificate. The UPDATE input context uses
   `docPermissionsAccess: 'update'` without rewriting the child execution's existing
   read diagnostic slot.

Scope decisions:

- **Omit every view, or only absent-hook views:** rejected because inherited native
  second observations/errors occur with absent/sync/async hooks.
- **Gate by schema, raw object/ID/function identity, freeze or caller flags:** rejected
  as proof. Hydration/normalization can return external/native data; none proves
  private primitive-only ownership or input trust.
- **Privately owned, wholly primitive ordinary graph before any exposure:** narrower
  in principle, **not proved/implemented here**. The current seam carries no such
  certificate. Detecting it after admission adds a graph/descriptor scan; integrating
  provenance into construction changes shared source-engine/bookkeeping work and
  needs its own budget/native/override/lifetime proof and measurement.

There is therefore no presently **proved and measured** retained scope. This is not a
claim that every possible future primitive-only design is impossible. It is a bounded
decision not to add scans, caches, new flags or a broad source-engine rewrite to rescue
an unmeasurable candidate. Initial source admission, native errors/observations,
hydrated arguments, receiver/facts/actor, captured definitions/dependencies, publication
tracking, budgets, closure/draining and supported hydration/service behavior remain
unchanged.

## Actual characterization

[observations.json](observations.json) losslessly factors the **122 final-V1 records**
into nine tables. This is asserted runtime characterization with a deterministic
persistence adapter, not timing/allocation data.

- **24 dedicated successes:** both output-mode settings, direct/public entries,
  single/bulk UPDATE, absent/sync/async UPDATE hooks. One initial source and one
  discarded pre-write view invoke inherited `Code.prototype.toBSON`; the second
  receiver is the privately admitted source's Code, not the original native. The
  UPDATE hook receives the hydrated parent, once, after both native observations.
- Scoped input rules run once per dedicated call with frozen literal, detached facts
  after the input stage is cleared. Parent/child identities and denied siblings stay
  intact. A separate fixed-lean visibility read resolves fresh READ facts after save.
  Dedicated input remains isolated/non-write-output in both settings; its generic
  output stage retains its existing behavior, not canonical trusted write borrowing.
- **24 dedicated plus 30 canonical view-only errors:** source admission succeeds,
  then only the view's native method throws. The result is controlled `bad_request`,
  without data, hook/rule/lifecycle/save/fallback. Canonical cases cover direct ID,
  filter, UPSERT-update, public UPDATE and public UPSERT-update in both settings and
  all three hook kinds. Dedicated cases stop before visibility re-fetch/persistence.
- **16 dedicated initial-source controls:** a first native error or oversized denied/
  unselected parent subtree fails before the view/hook/save. Initial admission was
  not conflated with disposable view work.
- **8 inherited-prototype controls:** the view's native method installs an inherited
  BSON wire-key accessor. Descriptor admission rejects it before invoking that
  getter/setter, UPDATE hook or save. Every installed descriptor is restored.
- **8 negative input-trust controls:** forged `_permissions`, trusted output settings
  and backend visibility output grants do not authorize denied child input. Stored
  business values/metadata/IDs remain protected.
- **4 in-flight dedicated controls:** capture survives a suspended parent fetch and
  runtime hook/rule/actor replacement. The current call uses its original definition,
  dependencies/rules/actor; the next call uses fresh facts and a distinct admitted
  source despite the same hydrated parent/ID. Dependencies use supported top-level
  `children`, expanded to stored descendants for fetch only.
- **6 primitive hydration controls:** even a frozen external scalar-only `toObject`
  result receives initial owned-source admission; absent/sync/async hooks preserve
  hydrated arguments and ready fact commit before stage clear. Provenance remains
  only until explicit publication close, then releases.
- **2 input-owner draining controls:** closing while an async hook is pending stops
  stage access before binding/native reads, drains the admitted hook, rejects late
  fact commit and releases source provenance. Closure cannot revive a stale stage.

The unchanged CWO-01 native test was also rerun: its **46 observations** deep-equal
the reconstructed archived records, including native conversion options/counts,
public-to-worker mutation rejection and mutable field-rule behavior. This is a fresh
focused replay, not recertification or modification of its full V2/P evidence.

## Commands, workdirs and verification

All commands ran from repository root, serializing build/typecheck/runtime checks.
Scratch was fresh, short `_tmpc02YQ3s`, created with
`mktemp -d "$PWD/_tmpc02XXXX"` and confirmed ignored by
`git check-ignore -v _tmpc02YQ3s`. Runtime `TMPDIR` was its absolute checkout-local
path. Shared commands below use `'<repo-root>'`; replace placeholders before replay
and choose fresh scratch rather than overwriting this run.

Exact expanded V1 selection/commands, runtime and identities are in
[verification.json](verification.json). Executed checks:

1. `TMPDIR='<repo-root>/_tmpc02YQ3s' pnpm --filter @web-ts-toolkit/access-router typecheck`
   passed. The script ran the filtered transitive build for utils, http-errors,
   express-response-handler, express-json-router and access-router, then source-only
   `tsc --noEmit -p tsconfig.typecheck.json`.
2. Initial two-new-file wiring run: **20 failed / 102 passed**. Only new fixture
   registration failed: dotted `dependsOn: ['children.hidden']` is unsupported.
   Changed only those new definitions to the supported top-level `children` name;
   no production/baseline/configuration contract was changed or waived.
3. Corrected two-file run: **122 tests / 2 files passed**. After patch-based formatting,
   final focused V1: **999 tests / 25 files passed**, 55.88 seconds, zero reported
   failed/skipped/pending cases. Includes the task's original seven files, new cases,
   existing native/stage/facts/lifetime/ownership/concurrency invariants, dedicated
   public/Mongo controls and unchanged private parser/work probes.
   The existing input-work tooling test created its own ignored smoke probe/seal,
   checked four diagnostic fingerprints and two profile-mode wiring operations without
   a CPU profiler. This was expected regression-test wiring, not a replacement P
   baseline, candidate comparison or calibration attempt; CWO-01 seals stayed intact.
4. `TMPDIR='<repo-root>/_tmpc02YQ3s' pnpm --filter @web-ts-toolkit/access-router test:layers:check`
   passed: 103 contract / 68 invariant / 53 internal files, exact default union;
   public graph unchanged at 137 files / 238 modules.
5. `pnpm exec prettier --check` and `pnpm exec eslint` over the three explicit new
   maintained files passed. The initial pre-format check warned on those new files
   only. Evidence formatting, JSON/link/privacy/ignore/whitespace and final scoped
   checks are recorded in `verification.json`.
6. Source/scope/identity review passed: 763 pre-existing protected files unchanged,
   including CWO-01 evidence and operational `b` seal; 153 production source files,
   11 sealed tool/test identities, 14 archived payloads and their recorded originals
   verified. All 15 rebuilt access-router dist files, including eight declaration
   files, byte-match CWO-01. The task document was not edited.

Actual runtime: Node **v26.12.1**, pnpm **11.18.0**, matching root
`packageManager: "pnpm@11.18.0"`. The distinct `.tool-versions` pnpm **11.24.0**
entry was inspected and left unchanged. The existing Vite native-config warning was
not suppressed and no test settings/timeouts were changed. No command remains active.

## Measurement blocker, omissions and CWO-03 handoff

CWO-01's [calibration summary](../cwo-01/data/calibration-summary.json) remains
**0/40 usable cells**. The fixed one attempt per cell, seven alternating pairs,
two repeats and 20% noise cap remain unchanged; no dropped cells, retries, replacement
baseline, post-hoc protocol or tolerance waiver was attempted. A differently named
protocol would require preregistration/coordinator approval **before candidate
inspection**. Counts/native traces are not CPU/allocation/heap/latency gains.

Unfiltered V2/installed/packed/documentation consumers were **not rerun here**: no
production candidate was retained and no change required their fresh validation.
CWO-07 owns final integrated unfiltered acceptance. CWO-01's prior full V2 pass is
historical evidence, not a CWO-02 full-suite pass. Root/grouped/downstream tests,
MongoDB/HTTP performance and heap/allocation measurements were not run.

Preserved JSON is lossless asserted observation data, with source/test/report hashes;
no dependency/build/tarball/consumer/database tree, raw terminal logs, scratch runner
or broad protected-file manifest is copied. The private work test's new ignored
probe/smoke seal is disposable too; it is not performance evidence. Original scratch
reports/logs are disposable provenance only, not continuation prerequisites. Reproduction requires
maintained tests/source and the normal dependency/Mongo test prerequisites, then a
fresh run; this bundle does not reproduce or recalculate timing. Earlier seals and
CWO-01 scratch originals remain untouched.

**Next CWO-03:** continue the authorized same-phase normalization/scrub investigation,
not view removal or raw-input admission caching. Preserve all supplied/discarded
subtree bounds, post-parser/validate/prepare re-admission, native return normalization,
Map/Mixed/BSON/class/sparse/cycle semantics, protected/virtual/ID and descendant-array
rules, plus canonical and dedicated parent behavior. CWO-01's Date-induced public
input mutation still defeats public-to-worker identity reuse. Read its
[handoff](../cwo-01/handoff.md) and this new dedicated characterization first. P
remains unavailable for retaining any performance candidate; an evidence-backed
bounded no-change decision remains valid. The coordinator should reconcile CWO-02
as a completed no-change investigation, not an accepted optimization or waived gate.
