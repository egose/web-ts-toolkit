# Access-router populate: source and target authorization

Created: 2026-11-08 21:19:20 (local repository clock).

Overall status: completed — defect confirmed and corrected by subagents;
regressions, documentation and applicable checks pass. Independent final review
approved the integrated change with no blockers. Public API shapes are unchanged.

## Objective and scope

Address population failures when a source relationship is readable under its
parent's output policy but not under the access requested for the target.
Source visibility and target authorization should be evaluated independently.

Scope: access-router's service and Core populate planning, affected callers,
regression tests, and public documentation. This is a planning document; creating
or reviewing it does not authorize implementation or changes to consumer apps.

Non-goals: redesigning the public populate API, changing unrelated permissions,
or changing private `dependsOnPopulate` behavior.

Prepared using the task-as-you-go skill and [repository task conventions](README.md).
Examples use generic library fixtures and require no knowledge of a consuming
application. The original findings and task IDs are retained; execution updates
are recorded below.

## Issue

The current populate planners use the resolved target access to check both:

1. Whether the source relationship field can be populated.
2. Which target operations, rows, and fields are authorized.

For a parent read with `populate.access: 'list'`, the first check therefore uses
the source field's `list` rule rather than its effective parent output rule.
A field with `read` permission and `list: false` remains visible in the read
response, but its requested population is skipped and its references remain IDs.

### Generic reproduction fixture

Register two Mongoose models and their access-router configurations:

- `Source` has a scalar ObjectId field `related` with a static `ref: 'Target'`.
- `Target` has a string field `label`.
- The caller may read the Source fixture and list the referenced Target fixture.
  Their row filters include those fixture documents.
- Configure the following field permissions; no application-specific roles or
  document facts are needed for this minimal reproduction:

```ts
const permissionSchemas = {
  Source: {
    related: { list: false, read: true, create: false, update: false },
  },
  Target: {
    label: { list: true, read: false, create: false, update: false },
  },
};
```

Insert a Target document with `label: 'example'` and a Source document whose
`related` field contains that Target's ID. Request the Source through the public
advanced-read API:

```ts
readAdvanced(sourceId, {
  populate: [{ path: 'related', select: 'label', access: 'list' }],
});
```

Current planner behavior to reproduce: the read succeeds and includes `related`,
but it remains a target ID because the source's `list: false` rule prevents
population. The caller cannot obtain the requested `related.label` from the
response.

Expected: source `related` passes its parent's `read` policy and returns a
populated Target containing `label`, as permitted by the target's `list` policy.
The Target's `read: false` field rule does not replace its requested list policy.
Independent target operation or row denial must still restrict the result.

Changing target access to `read` is not equivalent: the target's read and list
policies may permit different rows and fields. Broadening source list visibility
also changes the application's intended permission policy.

## Evidence and limitations

The toolkit worktree was clean at HEAD `fbb0cc9` before this task was created.
Recheck its current state before implementation.

Inspected references, relative to `packages/access-router/`:

- `src/services/service.ts:879-974`, `Service.genExecutionPopulate`: passes
  `targetAccess` to the source `extractOutputFieldRules` check and uses it for
  target execution planning.
- `src/services/service.ts:1528-1559`: the populate planner receives a target
  access default that may differ from the owning source's effective output access.
- `src/core.ts:363-427`, `Core.genPopulate`: passes the descriptor's resolved
  target access to the source `requestPopulateSelect` check.
- `src/services/base.ts` and `src/services/model-subdocument-service.ts`:
  helper forwarding and embedded-scope call sites to examine during the fix.
- `src/interfaces/query-types.ts` (`Populate`), `src/interfaces/service.ts`
  (`PopulatePlanningOptions`), and README populate-selector guidance: public
  options and the documented source/target authorization boundaries.

External consumer integration tests reproduced the service behavior with
access-router 0.68.0. Restoring the affected source fields' list permissions
restored population in control tests. This is supporting evidence, not a runtime
verification of the generic fixture above; that fixture still needs a maintained
toolkit test. Core/helper behavior has been inspected in source, not separately
reproduced at runtime. No consumer schema, business rules, test files, or raw logs
are required or included in this repository.

Toolkit mixed-access test coverage has not been fully reviewed. No toolkit build,
runtime test baseline, or implementation result is claimed by this document.
The demonstrated impact is missing populated data; no authorization bypass has
been demonstrated.

Related tasks cover adjacent contracts, not this specific correction:

- [Target-owned populate policy](20261027-120942-access-router-target-model-populate-policy.md).
- [Document-permission dependencies](20261103-003636-access-router-document-permission-dependencies.md).
- [Output authorization modes](20261103-172737-access-router-output-authorization-modes.md).

## Intended behavior

- **Source:** evaluate the relationship using its owning parent's effective
  output-field access, captured authority, selection, and document permissions.
  This is not necessarily the initiating operation name: read-to-list fallback
  and write responses can have a different effective output access.
- **Target:** use descriptor `access`, or the existing `populateAccess`/operation
  default, for target operation checks, row filters, field selection, virtuals,
  and document permissions. Preserve descriptor-over-default precedence.
- **Independence:** a permissive target cannot make a denied source visible;
  a readable source cannot grant target operations, rows, or fields.
- **Compatibility:** retain existing selection, `match`, referenced-ID constraints,
  actual-model binding, target-owned populate policy flags, and reference
  reconstruction. Denied source output is omitted; permitted references retain
  IDs when population is not admitted; admitted target misses retain the existing
  null/filtered-array behavior.

The implementation approach remains open. Prefer a correction at the shared
planning boundary and preserve source checks rather than removing them.

## Tasks

P1 denotes the correctness fix and its authorization regression coverage; P2
denotes documentation and delivery verification. Follow the dependency order
below because the tasks share source, tests, and generated build outputs.

### Task PSA-01: Correct populate source-access resolution

Status: completed

Assigned agent: IMPL-01 (implementation and focused reproductions).

Kind: defect

Priority: P1 — restores requested population for authorized source reads.

Dependencies: none

Primary ownership: `packages/access-router/src/services/service.ts`, `src/core.ts`,
necessary helper/execution plumbing, and focused reproducing tests.

Finding: source relationship admission currently uses the target's resolved access.

References: `Service.genExecutionPopulate` and `Core.genPopulate`, cited above.

Requirements:

1. Reproduce the mixed-access failure in toolkit tests before applying the fix.
2. Resolve source access from the effective owning output context while retaining
   the requested target access and its independent authorization.
3. Check helper and embedded-scope forwarding. Establish how `Core.genPopulate`
   receives source context; record any public-helper compatibility decision
   before changing its interface.
4. Preserve source selection and document-permission rules, including decisions
   deferred until the parent document stage, alongside existing target checks.

Acceptance criteria:

- The generic read-only-source/list-target reproduction returns `related.label`
  without making the source `related` field available in list responses.
- Focused tests fail before the correction and pass afterward.
- Source and target denial controls remain effective in the affected planners.

Verification: focused service/helper regressions using the package's Vitest
configuration and built dependencies; record the exact commands and results.

Completion evidence:

- IMPL-01 changed only source admission in `Service.genExecutionPopulate` and
  `Core.genPopulate`; target policy and public signatures are unchanged.
- Before correction: six focused failures and three passes. After rebuilding:
  nine focused passes, 105 passes across both affected contract suites, and 67
  passes across two internal helper-boundary suites.
- Standard contract scripts failed before Vitest on 94 consumer-inventory
  preflight errors; direct Vitest used rebuilt package entries for focused checks.
  This is not a full package acceptance pass. PSA-04 tracks the gate blocker.
- Commands, assertions and forwarding review:
  [PSA-01 handoff](../task-artifacts/access-router/20261108-populate-source-target-access/psa-01.md).

### Task PSA-02: Verify mixed-access behavior across affected paths

Status: completed

Assigned agent: TEST-02 (broader regression coverage).

Kind: defect

Priority: P1 — checks that the correction preserves independent authorization.

Dependencies: PSA-01

Primary ownership: `packages/access-router/test/`, extending the fix's regressions
and applicable populate-policy integration suites.

Finding: the external reproduction does not establish alternate-path or negative
authorization coverage in the toolkit.

References: PSA-01 evidence and these candidate suites under
`packages/access-router/test/`:
`contracts/populate-operation-policy.helper-isolation.test.ts`,
`contracts/populate-operation-policy.queries.test.ts`,
`contracts/subdocument-populate-authorization.integration.test.ts`, and
`invariants/write-output-populate.unit.test.ts`.

Requirements:

- Cover the source/target combinations in the matrix below, including a source
  permission based on a generic document fact and both same-model and cross-model
  references. Define any test facts within the fixture rather than relying on
  application-specific permission names.
- Test descriptor `access` and query `populateAccess`, including default/override
  precedence and different selectors within one query.
- Check target operation denial, differing target row/field policies, `match`,
  source exclusions, `select`/`-_id`, and missing/null references.
- Exercise top-level references, references inside an embedded array such as
  `Source.items[].related`, and affected helper/subdocument, read-fallback, and
  write-response paths. Include relevant isolated/trusted and lean/hydrated
  controls where the changed planner is shared.
- Keep the basic reproducing tests with PSA-01; this task provides the broader
  integration checks, not a prerequisite to testing the fix itself.

| Parent output access | Source field rule               | Target access | Expected result                                  |
| -------------------- | ------------------------------- | ------------- | ------------------------------------------------ |
| read                 | read allowed, list false        | list          | Populate if target list policy permits           |
| read                 | read false, list allowed        | list          | Omit source output                               |
| list                 | list false, read allowed        | read          | Omit source output                               |
| list                 | list allowed, read false        | read          | Populate if target read policy permits           |
| read                 | read depends on a document fact | list          | Evaluate the fact for the source parent document |

Acceptance criteria:

- The matrix passes and target policy changes do not alter source visibility.
- Applicable existing suites pass without weakening authorization assertions or
  changing private populated-dependency behavior.

Verification: run the extended regressions, affected existing suites, and package
test/typecheck commands from the shared verification section.

Completion evidence:

- TEST-02 added 19 cases to the existing query contract suite without changing
  existing assertions or implementation. Coordinator reviewed the test diff.
- Standard scripts passed with dependency builds and exhaustive preflight:
  480 tests across five contract files; 81 tests across two invariant files;
  seven internal helper-boundary tests; final focused run of 19 new cases passed.
- The [coverage ledger](../task-artifacts/access-router/20261108-populate-source-target-access/psa-02.md)
  maps every matrix/path requirement to new or rerun existing controls, including
  dedicated path/select-only children and unchanged private dependencies.
- No additional product defect was found. New create-context assertion mistakes
  were corrected to the existing result contract, not treated as product failures.
- Coordinator ran standard full package checks serially from the repository root,
  with checkout-local `TMPDIR`: `pnpm --filter @web-ts-toolkit/access-router test`
  passed all 218 files / 7,762 tests, including strict/packed consumers, and
  `pnpm --filter @web-ts-toolkit/access-router typecheck` passed. Exhaustive layer
  preflight passed. Repository `pnpm lint` also passed after the code/test changes.

### Task PSA-03: Document and validate the correction

Status: completed

Assigned agent: DOCS-03 (public documentation/JSDoc and affected-doc checks).

Kind: defect

Priority: P2 — aligns the public contract and consumer guidance with the fix.

Dependencies: PSA-01, PSA-02, PSA-04

Primary ownership: access-router README/MIGRATION/JSDoc, affected website guidance,
and this task's verification record.

Finding: users need a clear distinction between parent source authorization and
the policy selected for populated targets, including the changed mixed-access behavior.

References: `packages/access-router/README.md`, public populate types cited above,
and PSA-01/02 results.

Requirements:

1. Document source and target access separately, with a mixed-access example and
   `access`/`populateAccess` precedence.
2. Record the externally visible correction in migration/release guidance and any
   helper-contract decision. Update types/JSDoc if their contract changes.
3. Review the delivered changes and run applicable package/consumer checks.
   Record failures and limitations separately from verified results.

Acceptance criteria:

- Public documentation, types, and tested runtime behavior agree.
- PSA-01/02 criteria have verification evidence, and any remaining blocker is recorded.
- No consumer permission broadening is required for the demonstrated reproduction.

Verification: review the diff against the intended behavior, run package tests
and typecheck, and check changed documentation formatting/links. Verify decorator
or client contracts if their shared interfaces or helper behavior are affected.

Completion evidence:

- DOCS-03 aligned README, MIGRATION, website services guidance and public JSDoc,
  including a compiled typed mixed-access example. Signatures/options and runtime
  behavior did not change beyond PSA-01; source AST comparisons confirmed this.
- Post-documentation checks passed: 98 documentation/named-helper consumer tests;
  source typecheck; 24 authorization-guidance tests; standard decorator suite
  (23 files / 779 tests, including its typecheck); one fresh packed-publication
  integrity test; emitted JSDoc, formatting, scoped lint and local link checks.
- Name-filtered strict/packed selections are distinguished from full-matrix
  coverage. The earlier full 218-file runtime suite is not repeated for comments
  and documentation only; affected checks were rerun after those changes.
- [PSA-03 handoff](../task-artifacts/access-router/20261108-populate-source-target-access/psa-03.md)
  records exact commands, corrected formatter/probe-authoring failures and limits.
- FINAL-04 independently reviewed code/tests/metadata, then final documentation,
  public types and declaration-visible JSDoc. No blockers or actionable findings;
  integrated scoped acceptance approved. See the
  [final review](../task-artifacts/access-router/20261108-populate-source-target-access/final-04.md)
  for independently inspected boundaries and verification limits.

### Task PSA-04: Restore consumer-review inventory preflight

Status: completed

Kind: defect

Priority: P2 — required to run the standard test gates; discovered during PSA-01.

Assigned agent: GATE-04 (independent, narrow verification prerequisite).

Dependencies: none

Primary ownership: `packages/access-router/scripts/test-layer-consumers.mjs` and
focused checker tests only if necessary. Do not modify populate implementation or
consumer tests merely to avoid an inventory error.

Finding: both pre-fix and post-fix standard contract commands stopped before
Vitest with 94 stale/unmatched consumer inventory and graph errors in untouched
packed/strict-consumer suites. Whether the errors also occur on the original HEAD
must be independently established before calling them baseline failures.

Requirements:

1. Establish baseline provenance without reverting or replacing current work.
2. Inspect actual producer/read/compiler expressions; repair only stale review
   anchors/inventories if their public-input boundary is unchanged.
3. Preserve fail-closed graph checks, input sets, negative cases and assertions.
   Stop and report any real new private dependency or larger required redesign.

Acceptance criteria:

- The baseline classification is backed by evidence.
- Standard test-layer preflight passes without exemptions or weakened checks.
- Checker regression tests pass, and any correction is limited to reviewed drift.

Verification: `pnpm --filter @web-ts-toolkit/access-router test:layers:check`, plus
the repository's checker tests; run no shared-output builds concurrently with
TEST-02. Record exact commands and limitations in the evidence bundle.

Completion evidence:

- GATE-04 reproduced the identical 94 errors in an isolated HEAD tracked-input
  snapshot, without replacing current files. Existing `dist` reuse and limits are
  documented; this establishes metadata baseline drift, not a pristine HEAD build.
- Updated 40 line coordinates only in `scripts/test-layer-consumers.mjs`.
  Coordinator independently compared evaluated old/new policy excluding line
  coordinates: expressions, input sets and negative boundaries are identical.
- Standard layer preflight passed; 76 maintained checker tests passed in a
  standalone scratch copy with no shared build/runtime setup. Scoped ESLint,
  report formatting and diff checks passed.
- [PSA-04 handoff](../task-artifacts/access-router/20261108-populate-source-target-access/psa-04.md)
  records baseline provenance, exact anchors, commands and reproducibility limits.

## Shared verification and completion

Run commands from the repository root after installing workspace dependencies.
Start with focused regressions; use the full package checks below before delivery.
Build/test scripts rebuild shared dependencies, so run them serially.

Use a fresh ignored repository-local scratch directory and replace `<repo-root>`
with the actual checkout path before executing these proposed commands:

```sh
mkdir -p _tmp-populate-source-target-access
git check-ignore _tmp-populate-source-target-access

TMPDIR='<repo-root>/_tmp-populate-source-target-access' pnpm --filter @web-ts-toolkit/access-router test
TMPDIR='<repo-root>/_tmp-populate-source-target-access' pnpm --filter @web-ts-toolkit/access-router typecheck

# When decorator integration is affected:
TMPDIR='<repo-root>/_tmp-populate-source-target-access' pnpm --filter @web-ts-toolkit/access-router-deco test
```

Helper compatibility decision (2026-11-09): preserve all public signatures and
options. For request-only `Core.genPopulate`/`Service.genPopulate`, positional
`access` authorizes the source request field and supplies the target default;
descriptor `access` overrides the target only. This intentionally corrects mixed
access behavior without adding an API shape or claiming document-stage authority
for the request-only helper. Canonical service population instead uses captured
`outputAccess` for source rules. Dedicated `SubPopulate` remains path/select-only;
no new target-selector support is introduced for subdocument routes.

Done means the intended access separation is implemented, the reproduction and
authorization controls pass, package checks pass, and documentation is aligned.
Record actual results before marking tasks completed. Preserve useful handoff
evidence under `docs/task-artifacts/access-router/20261108-populate-source-target-access/`
according to the repository conventions.

## Execution record

- 2026-11-09: User authorized review and, if legitimate, implementation by
  subagents. Baseline worktree was clean at `647a217`.
- REVIEW-01 completed: confirmed `Service.genExecutionPopulate` passes resolved
  target access to source `extractOutputFieldRules`, while owning output uses
  captured `access.outputAccess`. Confirmed the same coupling in `Core.genPopulate`
  via `requestPopulateSelect`. Impact is under-population, not a demonstrated
  authorization bypass. No runtime checks were run by the reviewer.
  See the [curated review](../task-artifacts/access-router/20261108-populate-source-target-access/review-01.md)
  for fixture cautions, forwarding constraints and review limitations.
- Execution: IMPL-01 delivered PSA-01. TEST-02 and GATE-04 then worked in parallel
  on disjoint test/metadata ownership, with TEST-02 the sole shared-build/runtime
  owner. After full package acceptance, DOCS-03 delivered documentation and affected
  checks. Independent FINAL-04 first approved code/tests/metadata, then approved the
  integrated documentation/type/runtime agreement after DOCS-03. All agent jobs
  ended with no remaining blockers. No commit or release was created.
- Coordinator owns this task record and final verification scheduling. Agents
  must not run overlapping build/test commands that write shared outputs.
- Fresh disposable scratch directory:
  `_tmp-populate-source-target-20261109-DCsFHQ` (confirmed ignored). Runtime
  `TMPDIR` must be the absolute path to this checkout-local directory; no durable
  evidence may depend on its contents alone.
- Environment: Node `v26.12.1`, pnpm `11.18.0`; workspace dependencies are present.
- Baseline verification (repo root): `pnpm lint` passed before implementation;
  the task document also passed `pnpm exec prettier --check`.
- Toolkit runtime checks: focused PSA-01 checks passed as recorded above;
  preflight repaired and verified by PSA-04. Standard PSA-02 focused scripts passed.
  Coordinator full-package check passed 218 files / 7,762 tests and source
  typecheck passed; current code/tests passed repository lint. Documentation-phase
  affected checks and standard decorator checks subsequently passed. Website
  production build and full-workspace tests/builds were not run (outside scope).
- [Coordinator gate record](../task-artifacts/access-router/20261108-populate-source-target-access/verification.md)
  preserves exact shared-check commands, scope and omitted-artifact limitations.
- Final coordinator repository lint passed after documentation edits. Useful
  scratch results are curated in maintained tests and the evidence bundle;
  disposable logs, caches, snapshots and consumers were not copied or deleted.
