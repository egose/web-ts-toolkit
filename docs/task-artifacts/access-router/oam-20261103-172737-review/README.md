# OAM-05 independent final review

## Decision and provenance

**REJECT — OAM-05 must remain incomplete.** Two independently reproduced runtime
findings require OAM-03 remediation: **F1/P1 inherited write-output provenance** and
**F2/P2 post-publication raw-reference retention**. In addition, V3 `pnpm test` is
blocked by an unavailable Docker daemon in the unrelated live Redis lane. V2, root
build and root lint passed; these do not override the findings or incomplete V3.

REVIEW-05 is the independent reviewer requested for
[OAM-05](../../../tasks/20261103-172737-access-router-output-authorization-modes.md),
not an OAM-01–04 implementer. Reviewed the entire task, root
[AGENTS.md](../../../../AGENTS.md), [artifact workflow](../../README.md), task
conventions, and all four linked handoffs. Prior reports are references, not this
review's verification. No subagents, product/docs fixes, task/status edits, commits,
release/publishing changes, or manual dependency changes were made. Normal packed
consumer tests perform their own isolated consumer installs.

Source revision: `c68451e40b99ca545dc52a46c287b32949980d26` plus the incoming
uncommitted OAM changes. No product source or maintained tests were edited by this
reviewer. Commands run from repository root unless explicitly stated otherwise.
Incoming state was **37 modified tracked files + 9 untracked OAM files**. All incoming
nonignored file bytes and HEAD remained unchanged through verification. The curated
[verification record](verification.json) identifies 55 relevant input files, their
hashes, exact command argv/workdirs, results, baseline inventories and omission evidence.
Its source-input aggregate is
`529b3aa7aa2006ed7b4d28c5d44d742d5bd55ad08b0aa47318d3e7e377e17107`.

Fresh ignored scratch is `_tmp-oam05-review-20261104-133234`; `git check-ignore`
confirmed it. Runtime commands use its absolute checkout path as `TMPDIR`.
Benchmark commands also use it as `WTT_BENCH_TMP`. Root ESLint explicitly ignores
root `_tmp*/**`; ignored Git status alone was not treated as tool exclusion.

## Acceptance reconciliation

Paths in this map are relative to `packages/access-router/` unless qualified.
These are inspected mechanisms and maintained assertions, not blanket certification.

- **OAM-01 design:** the [selection/ownership matrix](../oam-20261103-172737-design/README.md),
  `src/acl/service-authorization.ts` branch/access checks and `src/services/service.ts`
  canonical workers provide a concrete boundary with no unresolved ownership design decision.
- **OAM-02 values/defaults/API:** `src/interfaces/root.ts`, `src/acl/authorization-modes.ts`,
  `src/runtime.ts`, mode/options and default-model tests establish exactly four names,
  one optional literal union, independent isolated defaults and undefined restoration.
  No alias or fifth mode was added.
- **OAM-02 placement/atomicity/warnings/decorators:** shared public-admission lanes,
  runtime bulk publication and decorator preflight match mode/options/decorator tests.
  Presence-based controls, descriptors/proxies, dotted updates, operation-specific
  warnings, logger containment, runtime separation and inert business names passed.
- **OAM-02 capture/query independence:** `src/acl/model-output-planning.ts` captures four
  primitives before its own native/catalog work; dispatch owns source options/actor.
  Mode/options integration, READ retry/reentry and the independent cross-target
  native probe passed. The initial capture-order concern was disproved.
- **OAM-03 genuine phase:** dedicated write issuers/output derivation in
  `src/acl/service-execution.ts` / `src/acl/service-authorization.ts` and
  `test/write-output-authorization.unit.test.ts` pass normal receiver/branch/purpose/
  publication checks. **F1 prevents acceptance** of generic-origin authentication.
- **OAM-03 mandatory safe source:** `src/acl/document-stage.ts:prepareQueryOutputSource`
  reuses the bounded native materializer. Write authorization/modes tests passed
  both-mode detachment, controlled conversion failure without `_doc` borrowing,
  plain/fallback/exotic/native cases and depth/slot bounds.
- **OAM-03 input/persistence/lifecycle:** canonical `src/services/service.ts` workers retain
  the original input execution and unchanged
  `src/acl/model-input-admission.ts:resolveInputDocumentGrants`. Mutation, dependency
  and write-worker tests passed hydrated pre-update arguments, input row/field policy,
  independent pre/post facts, validation/prepare/transform/save/snapshots/changes and
  query/save counts. CREATE has no invented input document facts.
- **OAM-03 branches/bulk/entries:** `test/write-output-modes.unit.test.ts`,
  `test/virtuals-populate-dependencies.integration.test.ts` and
  `test/authorization-fast-path-options.integration.test.ts` exercise direct/public
  CREATE/UPDATE, both internal/public UPSERT branches, opposite captured modes,
  bulk same-ID facts and basic/advanced HTTP/root DTO/storage behavior. Initiating
  `upsert`, branch accesses and dependencies are retained.
- **OAM-03 embedded/related/private/getter ownership:** target derivation, cache/
  recipient code and shared finalizer/private-populate engine are exercised by
  `test/write-output-populate.unit.test.ts`, virtual-dependency, native and publication
  suites. Target-own READ/LIST, custom isolation, embedded inheritance, every parent/target combination,
  scalar/array/dotted refs, shared/equal-ID targets, independent attachments/native
  leaves, target-before-getter ordering and private argument four passed normally.
- **OAM-03 failure/cancellation/lifetime:** `src/acl/output-publication.ts`,
  `test/owned-authorization-stage.unit.test.ts`, write-worker, query-token and
  receiving-budget tests passed poison/stop/drain, late-resume tombstones, no partial
  bulk result and no rollback/extra save/refetch. **F2 prevents cleanup acceptance**:
  original/reference mappings survive closure through retained hook arguments.
- **OAM-03 excluded origins/independent calls:** issuer call sites are limited to
  canonical root writes. NEW/helpers/dedicated/count/delete/distinct and generic
  tuple negatives, plus independent nested READ/LIST, passed maintained tests.
  **F1 prevents unconditional acceptance** of ineligible generic-origin exclusion.
- **OAM-03 omitted work:** source/view identity and materializer spies in the write
  authorization/populate suites establish one mandatory source in both modes and
  trusted omission of only the extra hook view; detailed counts are retained below.
- **OAM-04 installed guidance:** fresh strict/packed/documentation consumers and
  independent emitted-surface inspection passed. Root/advanced types, exports/build
  entries, shipped README/MIGRATION/llms, decorator and website scope agree with the
  intended contract. No export/LSP issue found; runtime F1/F2 remain exceptions.
- **OAM-04 tooling/history:** shared core changes are labels/disclaimer, not new write
  workloads. Actual READ/LIST discovery/config/getter proofs and fail-closed module
  conditions passed. Historical files remained unchanged; no write timing is claimed.
- **OAM-05:** fresh serial V2/build/lint passed; independent probes reproduced F1/F2;
  root tests are externally blocked. **Reject/incomplete**, not acceptance of
  OAM-01–04 as a complete integrated delivery.

### Scoped adversarial review

- Ordinary post-write source admission occurs **after** persistence/lifecycle and
  before output document hooks. Successful conversion returning live storage still
  crosses the bounded native-aware materializer. Earlier dependency helpers are not
  treated as detachment certificates. No JSON clone or parallel evaluator was added.
- Input workers use original executions; output children retain capture, family,
  access and publication, not input document stages/facts. Prepared query tokens
  still require the exact original execution; identifier tokens remain family-bound.
- Related plans use captured actual model bindings and target policy/facts. Cache
  keys are plan plus exact private identity, never equal IDs or DTO authority.
  Recipients/array spines are registered before target callbacks; cache hits and each
  attachment debit receiving budgets and get independent copies. Mandatory source
  preparation is separately bounded, not a promise to avoid all native work before
  selected-output budget checks. The write-origin marker selects absorption of the
  otherwise redundant isolated-parent/trusted-target pre-copy; F1 explains why its
  authentication is not yet accepted.
- Shared finalization still creates separate getter/native views and return staging;
  private populated dependencies remain outside public source masks and are copied
  per getter. Captured actor, normalized policy and frozen Boolean facts remain owned.
  Diagnostics allowlist operation/access/scope/facts/query primitives, never live
  documents, source/stage/mode issuers or public capabilities.
- Output failure remains nontransactional. Stored writes can survive a rejected
  response. Arbitrary closures, explicit writes by callbacks, native method bodies
  and external caches are not sandboxed. No freshness/security-equivalence or
  unmeasured speedup claim is inferred from `trusted`.

## Findings requiring remediation

Finding priorities: P1 is an authorization/API boundary defect; P2 is a bounded
lifetime defect without a demonstrated grant bypass. Both block acceptance because
they violate explicit task requirements. Neither asserts an arbitrary remote
permission bypass or universal memory/performance regression.

### F1 — P1: inherited marker authenticates a generic write-output origin

**Source:** [service-authorization.ts](../../../../packages/access-router/src/acl/service-authorization.ts),
`resolveServiceAuthorization` lines 708–725 creates an ordinary `CallRecord` without
an own `writeOutputBranch` slot. `isWriteOutputAuthorization` lines 764–766 and
`deriveQueryAuthorization` lines 613–635 then read that missing property through
`Object.prototype`. Thus the private WeakMap token authenticates the record, but
the decisive provenance value can come from outside the record.

**Reproduction:** use the maintained
[owned-stage fixture](../../../../packages/access-router/test/owned-stage-test-fixture.ts)
with a registered `ref` target whose READ mode is trusted. Construct a parent using
generic `createServiceExecution`, not `createWriteServiceExecution`, with
`{ operation: 'create', virtualAccess: 'create', outputAccess: 'read', docPermissionsAccess: 'create' }`
and applicability `create`, capturing that actual related descriptor. Its write
marker is initially false. Temporarily install and later restore:

```ts
Object.defineProperty(Object.prototype, 'writeOutputBranch', {
  value: 'create',
  configurable: true,
});
```

Derive the target through `createRelatedExecution` with the initiating `create`
operation and all target accesses `read`; admit a target source `{ value: 'original' }`
and resolve its document hook with `doc.value = 'hook-change'; return {};`.

| Observation                                 | Required   | Actual final independent probe |
| ------------------------------------------- | ---------- | ------------------------------ |
| Generic parent `isWriteOutputAuthorization` | false      | **true**                       |
| Related child write provenance              | false      | **true**                       |
| Related source mode                         | isolated   | **trusted**                    |
| Target stage source after hook mutation     | `original` | **`hook-change`**              |

This observes real borrowing, not only a configured label. It requires an inherited
process-prototype property; no request-only way to install it was demonstrated.
Mandatory detachment and row/field policy were not bypassed. Nevertheless it
violates the explicit genuine-origin/generic-negative contract and adds target
trust to an ineligible origin. The maintained generic negatives do not install an
inherited marker, so their fresh green results do not cover this case.

**Return to IMPLEMENT-03/OAM-03:** make absent provenance genuinely record-owned
on every construction/derivation, including optional origin slots, without consulting
inherited values/accessors. Retain normal write/target eligibility and add maintained
negative regressions for inherited marker values/getters and generic/dedicated origins.

### F2 — P2: private raw links outlive a closed write publication

**Source:** [document-stage.ts](../../../../packages/access-router/src/acl/document-stage.ts),
`sources` / `originals` / `referenceOriginals` at lines 454–465;
`captureReferenceOrigins` at line 496; registry setup/cleanup at lines 553–573.
Source cleanup is registered only when `publicationOutputLedger(publication)` is
present. Ordinary CREATE/UPDATE publications have no collection ledger. Moreover,
the cleanup deletes `referenceOriginals` for the root source, not the descendant
reference keys populated by `captureReferenceOrigins`.

**Two reproduced cases, with exact identity assertions:**

1. In the maintained
   [write-worker fixture](../../../../packages/access-router/test/write-output-test-fixture.ts),
   configure trusted CREATE with a document hook that retains its argument. Run a
   real `direct.create({ value: 'stored' }, { select: ['value'] }, quietOptions)` and
   retain the output call through a spy on `prepareQueryDocumentStage`. CREATE
   succeeds; `assertOutputPublication(outputPublicationFor(call))` already rejects.
   The hook argument is detached, but
   `getQueryOutputOriginal(heldArgument, call) === fixture.docs.at(-1)` is still
   **true**: the private value is the exact live saved Mongoose document, not the
   detached argument. The assertion that lookup no longer recovers the raw original
   fails after operation settlement.
2. Admit `{ ref: rawTarget }` under a genuine trusted CREATE output child with a
   captured reference path. The held source's `ref` is detached. After explicitly
   closing its publication, `getQueryReferenceOriginal(heldSource.ref) === rawTarget`
   is still **true**, where cleanup requires no surviving raw-reference entry.

A retained hook argument therefore remains a live WeakMap key whose private value
strongly retains the original write graph; retaining a referenced occurrence also
keeps the raw target. Weak keys do not release values while those keys are held.
This is deterministic linkage evidence, **not a measured retained-heap size**, and
not a public raw-document recovery capability or demonstrated mutation alias.

The registry mechanism already exists at HEAD; do not attribute every related
query-path retention issue to this change. The newly lent write source exposes
these keys to callbacks, and the accepted OAM design explicitly requires new
output mappings to release their references at settlement. That requirement is
not satisfied by stage tombstones alone. Existing tests close stages but do not
check these mappings through retained trusted hook arguments.

**Return to IMPLEMENT-03/OAM-03:** arrange publication-owned release of root and
per-reference mappings for ordinary writes as well as collection owners, without
invalidating active sibling owners or shared-target identity during construction.
Add maintained success/failure/retained-argument cleanup regressions. No broad
global map clearing, new public capability or unchecked source fallback is indicated.

### Disproved concern: related-native capture order

The independent positive probe gave a target configuration Date a `getTime`
callback that changes the source CREATE mode from isolated to trusted during
related preparation. The current real CREATE **remained isolated** and a subsequent
real CREATE used trusted. The early dispatch-owned source options/actor in
[model-service-owner.ts](../../../../packages/access-router/src/acl/model-service-owner.ts)
(`modelServiceOptions`, lines 162–168; `modelServicePermissions`, lines 170–178)
explain the result. This concern is **not a finding**.

## Fresh verification

Node `v26.12.1`, pnpm `11.18.0`; installed dependencies and MongoDB test prerequisites
are used. Fresh V2 source typecheck passed. The unfiltered package scripts passed
**199 files / 6,925 access-router tests** and **23 files / 779 decorator tests**,
zero failed/pending. Fresh JSON assertion lists were inspected, including the
**40 + 47 + 49** new write tests, **49 + 6** strict consumers, **13 + 4** packed
consumers and **92 + 18** documentation cases. All incoming nonignored files and
HEAD were byte-identical after these gates; only this review README was added.

All required commands were actually executed, unfiltered, **serially** from repo
root. The following are exact command bodies; each used
`TMPDIR='<repo-root>/_tmp-oam05-review-20261104-133234'` (replace the quoted
placeholder before execution). Benchmark commands additionally used the environment
in the historical-prerequisite section. Log redirections are omitted; full argv,
workdirs and exit codes are preserved in [verification.json](verification.json).

```sh
pnpm --filter @web-ts-toolkit/access-router typecheck
pnpm --filter @web-ts-toolkit/access-router test --reporter=default --reporter=json --outputFile.json=../../_tmp-oam05-review-20261104-133234/access-router-v2.json
pnpm --filter @web-ts-toolkit/access-router-deco test --reporter=default --reporter=json --outputFile.json=../../_tmp-oam05-review-20261104-133234/access-router-deco-v2.json
node --test --test-concurrency=1 scripts/benchmarks/access-router-owned.test.mjs scripts/benchmarks/access-router-owned-batch.test.mjs
node --test --test-concurrency=1 scripts/benchmarks/access-router.test.mjs scripts/benchmarks/access-router.integration.test.mjs
pnpm build
pnpm test
pnpm lint
git diff --check
```

| Gate                                   | Fresh result                                                                                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| V2 typecheck and transitive build      | Pass.                                                                                                                                                        |
| V2 access-router                       | **199 files / 6,925 passed**, zero failed/pending.                                                                                                           |
| V2 decorator                           | **23 files / 779 passed**, zero failed/pending.                                                                                                              |
| V2 full owned + batch benchmarks       | **29/29 passed**, including all 9 B1 cases; no failed/cancelled/skipped/todo.                                                                                |
| V2 shared runner + integration         | **29/29 passed**, including historical compatibility workers; no failed/cancelled/skipped/todo.                                                              |
| V3 root build                          | Pass; **31 completed workspace build entries**.                                                                                                              |
| V3 root test                           | **Exit 1**, Docker prerequisite failure below; not a complete workspace pass.                                                                                |
| V3 root lint                           | Pass, `eslint .`; no scratch cleanup or exclusions were added.                                                                                               |
| Independent emitted-surface inspection | Pass; 64 optional exact-union properties across four option interfaces, root/advanced and both module conditions; corresponding output-scope JSDoc retained. |
| Independent adversarial probes         | Final **1 file / 4 tests: 3 failed, 1 passed, zero pending**; the three failures reproduce F1 and the two F2 cases.                                          |

The first scratch probe invocation had **zero executed assertions** because root
scratch could not resolve `mongoose`. Corrected only the scratch fixture to resolve
the existing package through `packages/access-router/package.json`, without install
or product edits. The rerun reproduced 3 failures / 1 pass; the final run strengthened
exact identity, closed-publication and actual target-mutation assertions and produced
the same result. No failing product assertion was removed or weakened.

The final probe command was:

```sh
pnpm exec vitest run --config _tmp-oam05-review-20261104-133234/vitest.config.mts --reporter=verbose --reporter=json --outputFile.json=_tmp-oam05-review-20261104-133234/review-probes-final.json
```

This is an executed scratch command, **not runnable from this curated archive**;
its temporary implementation is omitted. The reproduction steps, maintained fixture
paths, exact observations and source references above are retained for the owner to
turn into maintained regressions. No maintained failing test was added by this reviewer.

### V3 blocker B1 — Docker unavailable, not a historical-benchmark failure

Root `pnpm test` retained `--workspace-concurrency=1`. Before failure it completed:

- `asset-inliner`: 38 files / 772 passed, **1 existing declared todo observed**.
- `create-access-router-mongo-starter`: 18 files / 339 passed.
- `express-oidc-vault`: 41 files / 2,449 passed.
- `express-request-attestation` Node lane: 18 files / 618 passed.

Then [redis-live.test.ts](../../../../packages/express-request-attestation/test/redis-live.test.ts)
failed both `beforeAll` suites starting `redis:6.2-alpine` and `redis:7.2-alpine`:
**1 failed file, 2 setup failures, 62 automatically skipped test bodies**. The
[Redis harness](../../../../packages/express-request-attestation/test/redis-harness.ts)
requires real Docker; its `docker run --rm --detach --publish 127.0.0.1::6379 ...`
could not connect to the configured Docker Desktop named-pipe daemon. Read-only
diagnostics confirmed a Docker Desktop CLI/context selection. No host/context
settings were changed, no replacement service supplied, and no tests skipped by us.

The recursive command stopped on first failure; remaining workspace/later
attestation lanes have no completed V3 result. This includes no second V3 package
pass claim for access-router/decorator; their standalone V2 results remain valid on
the unchanged source. Attestation has no diff against HEAD, but **a clean-baseline
root test was not run**: this is an observed current prerequisite failure, not a
claimed historical failure or proven OAM regression. The original historical
benchmark prerequisite passed independently and must not be conflated with Docker.

**Coordinator/environment owner:** supply a usable Docker daemon for both required
Redis images, then rerun the complete root `pnpm test` without weakening its lanes.

### Installed surface, docs and deterministic omitted work

Fresh package suites included actual production-transformed packs/consumer installs
in CJS/ESM and the existing minimum/current peer matrix, plus strict Bundler and
Node16/NodeNext condition consumers with unsuppressed negative diagnostics. Positive
four-option/fluent/default cases and malformed/request-level negatives all passed.
The independent checker followed declaration aliases/inheritance, not text matches.
Exports remain root, `/advanced`, `/processors`, with runtime counts **46/48/6** and
type counts **200/336/17** under both conditions. New private write issuers/readers
and origin types are absent from those exports. Installed MIGRATION bytes match
the maintained source; package metadata/build entries were not changed.

Maintained source/docs searches found no supported output-prefixed spellings, stale
blanket-isolated write statements or obsolete mode-section anchors outside historical
evidence. Shipped README/MIGRATION/JSDoc, decorator examples and website scope agree
with the intended four-option contract; runtime F1/F2 still need remediation.

Retained fresh deterministic assertions (not timings):

| Ordinary write stage | Mandatory source materializations | Additional disposable hook-view copies | Hook argument equals stage source |
| -------------------- | --------------------------------- | -------------------------------------- | --------------------------------- |
| isolated             | 1                                 | 1                                      | false                             |
| trusted              | 1                                 | 0                                      | true                              |

The new write authorization tests pass for CREATE and UPDATE; source/native/payload/
snapshot mutations remain detached. The write-populate matrix also observes one
target-stage root materialization in trusted versus two in isolated, one logical
target hook per plan and independent attachment copies, including an isolated parent
with a trusted target. Those target-stage counts **exclude** owning-parent admission,
per-attachment copies, conversion/normalization and other selected construction.
Without an exposed hook there may be no copy saving. No allocation/retained-heap
measurement, new throughput number, timing acceptance or universal speedup is claimed.

## Historical fixture prerequisite

Read the original `_tmp-oar01-20261031-153820/seal-baseline.mjs` without executing or
importing it, the original descriptor, curated
[BASELINE](../oar01-20261031-153820/BASELINE.md) and
[HANDOFF](../oar01-20261031-153820/HANDOFF.md), and the integration read-only verifier
as a reference. A newly assembled verifier in this review's own scratch reproduced
the original sorted inventory/exclusion and dependency-resolution algorithm and
compared the complete recorded artifact and dependency inventories before use and
after both benchmark runs and V3. Both snapshots passed and are identical:

- **552 artifact files**, all **14** access-router build files / **8** declarations,
  all **7** explicitly recorded historical source entries and the old unsafe-source
  fixture match their original descriptor.
- **134 dependency packages / 3,510 files**, their package metadata and complete
  manifests match; **214 installed dependency edges / 6 originally absent optional
  edges**, **33 package links / 39 observed symlink identities** match.
- Original descriptor SHA-256:
  `ebf499b00923e35e7fd5404a2d4aa42dec058e22b01f65ce6664f8900ca6dbd9`.
  Artifact-inventory SHA-256:
  `7229a35eeb5a712707d32d47fb9bc4177b8d9e033f86d782cf0f0ef5c3f45f9a`.
  Remaining descriptor/declaration/dependency/resolution/symlink hashes and required
  Mongoose/Express/TypeScript **9.11.4 / 5.2.1 / 6.0.3** identities are retained in
  [verification.json](verification.json).

No rebuilding, installing, resealing, deleting, or writing into original artifact,
dependency or historical evidence trees was performed. The original sealer was
never executed/imported. This verifies compared inventories/availability, **not an
authenticated signature or every original historical claim**. Original manifest
exclusions remain exclusions; recorded dependency bytes/edges and observed symlinks
were checked separately. Old worker/core timing protocols were not replayed.

Both benchmark invocations actually used the following environment (replace all
quoted placeholders before execution):

```sh
TMPDIR='<repo-root>/_tmp-oam05-review-20261104-133234' WTT_BENCH_TMP='<repo-root>/_tmp-oam05-review-20261104-133234' WTT_BENCH_LEGACY_ROOT='<repo-root>/_tmp-oar01-20261031-153820/baseline-artifact' WTT_BENCH_CANDIDATE_ROOT='<repo-root>'
```

The original artifact/dependencies remain environment-dependent; this is a historical
correctness prerequisite, not write-feature timing acceptance or a vendored replay.

## Preservation and limits

Only this curated review and `verification.json` are preserved here. Raw logs/JSON assertions,
scratch probes, generated consumers/builds/tarballs, dependency trees, caches and
database files are disposable and not an archived reproduction bundle. Historical
artifact/dependency inputs are not vendored. Fresh gates do not recertify old timings.

Final hygiene checks are recorded below. Coordinator task/status remains unchanged.

### Final hygiene

- Both curated files pass Prettier; JSON structure and its equality to the curated
  scratch observations, all 55 input hashes/aggregate, final candidate runtime hash,
  complete original before/after snapshots and fresh assertion counts were checked.
- Report links and referenced source paths resolve; maintained guidance links/anchors
  were also checked, including Docusaurus extensionless `.md`/`.mdx` resolution.
  The initial simple link checker did not resolve those website extensions; correcting
  that checker yielded no unresolved links, without editing guidance to hide failures.
- Targeted machine-local path, private-identifier and credential-pattern scans plus
  manual content review passed. No general secret/security certification is implied.
- Scratch is ignored; both durable files are not. Tracked `git diff --check`, complete
  untracked-file whitespace checks and final incoming-source identity checks passed.
  Only this review bundle is new nonignored work; no coordinator task, product source,
  maintained test, package/lock/release metadata, old evidence or other scratch was changed.
- Reviewed this run's scratch inventory before handoff. Only the curated report/JSON
  merit promotion; raw generated inputs, probe code, caches and logs remain disposable.

## Handoff disposition

1. **Do not mark OAM-05 accepted/completed.** The coordinator should reconcile/reopen
   OAM-03 for F1/F2; this reviewer did not edit the coordinator-owned task/status.
2. Return both runtime findings to the prior owning implementer. Preserve the input,
   native, target/cache/budget and publication guarantees while adding maintained
   regressions. No runtime/docs fix is included in this independent review.
3. Resolve B1's real Docker prerequisite without replacing or skipping its Redis lane.
4. After remediation, rerun fresh serial V2/V3 and independent acceptance on the new
   source. This report's green checks certify only their exact recorded inputs;
   they cannot be carried forward across a runtime fix without reconciliation.
