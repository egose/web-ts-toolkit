# Access-router populate: source and target authorization

Created: 2026-11-08 21:19:20 (local repository clock).

Overall status: pending — observed behavior and source references are recorded;
implementation and toolkit verification have not started.

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
application. The original findings, task IDs, and pending status are retained.

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

Status: pending

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

### Task PSA-02: Verify mixed-access behavior across affected paths

Status: pending

Kind: defect

Priority: P1 — checks that the correction preserves independent authorization.

Dependencies: PSA-01

Primary ownership: `packages/access-router/test/`, extending the fix's regressions
and applicable populate-policy integration suites.

Finding: the external reproduction does not establish alternate-path or negative
authorization coverage in the toolkit.

References: PSA-01 evidence and these candidate suites under
`packages/access-router/test/`: `populate-operation-policy.helper-isolation.test.ts`,
`populate-operation-policy.queries.test.ts`,
`subdocument-populate-authorization.integration.test.ts`, and
`write-output-populate.unit.test.ts`.

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

### Task PSA-03: Document and validate the correction

Status: pending

Kind: defect

Priority: P2 — aligns the public contract and consumer guidance with the fix.

Dependencies: PSA-01, PSA-02

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

Open implementation question: how should the request-only Core helper represent
source context independently of target defaults? Resolve this while tracing its
callers in PSA-01; obtain maintainer agreement if a public API change is needed.
The canonical reproduction and focused tests can proceed without that decision.

Done means the intended access separation is implemented, the reproduction and
authorization controls pass, package checks pass, and documentation is aligned.
Record actual results before marking tasks completed. Preserve useful handoff
evidence under `docs/task-artifacts/access-router/20261108-populate-source-target-access/`
according to the repository conventions.

Implementation evidence: pending. Only the task document has been created/reviewed;
toolkit runtime checks have not been run for this planning-only change.
