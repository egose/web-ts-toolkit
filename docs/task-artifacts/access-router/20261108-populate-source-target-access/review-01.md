# REVIEW-01 — validity and implementation boundary

Date: 2026-11-09. Baseline revision: `647a217`.

Provenance: a separate read-only subagent reviewed the task, relevant source,
callers, existing tests and adjacent contracts. This is the coordinator's curated
summary of that review. The reviewer did not edit files or execute builds/tests.
The coordinator separately ran baseline `pnpm lint`, which passed.

## Conclusion

The correction is legitimate. Both populate planners use the target's resolved
access to admit the source relationship, even though the owning output planner
uses its own effective field access. A readable source with `list: false` remains
an ID when its requested target access is `list`. The demonstrated impact is
missing populated data, not an established authorization bypass.

Relevant symbols (paths relative to `packages/access-router/`):

- `src/services/service.ts`, `Service.genExecutionPopulate`: source
  `extractOutputFieldRules` incorrectly receives `targetAccess`.
- `src/core.ts`, `Core.genPopulate`: source `requestPopulateSelect` incorrectly
  receives descriptor-resolved target access.
- `src/acl/output-projection.ts`, `planAuthorizedModelProjection`: source output
  rules already use captured `access.outputAccess`.
- `src/acl/service-execution.ts`: writes use read field access, independently of
  create/update virtual and document-permission access.
- `src/services/public-service.ts`: read fallback can capture list output access
  while retaining a read operation.

## Accepted boundary

Canonical execution must classify source rules using captured output access,
while leaving all target decisions under the resolved target access. Preserve
deferred source document predicates and finalization; do not execute predicates
early or evaluate them against target facts.

For request-only `Core.genPopulate` and its service wrapper, keep signatures and
option shapes unchanged. Positional access governs source request-field access
and supplies the target default; descriptor access overrides only the target.
The helper remains request-only, with its existing empty document-fact behavior,
finite arity and rejection of legacy authority inputs. It does not acquire an
owning document stage or a complete nested source-output authorization plan.

Root embedded-reference paths share canonical execution. Dedicated child output
uses its existing scoped execution and owning-parent facts. Preserve dedicated
child routing semantics and legacy `getParentDoc` behavior. `SubPopulate` and
`genSubPopulate` remain path/select-only: this correction must not invent target
selectors for dedicated subdocument routes.

No changes are intended to private `dependsOnPopulate`, target-owned flags,
actual-model preflight, mandatory reference-ID constraints, reconstruction,
selection, target match/filter intersection or target-local output modes.

## Coverage and fixture cautions

Existing suites cover target access overrides, but typically give source
references unconditional permissions. New regressions must distinguish source
read/list rules and independently prove target policy remains effective.

- Existing suites now live under `test/contracts/`, `test/invariants/` and
  `test/internal/`, not directly under `test/`.
- In the query fixture, the scalar reference points to a tenant-a target but
  target list filtering permits tenant-b. A successful mixed-access reproduction
  must reference an authorized target; otherwise admitted population yields null.
- Write-input admission and output policy are separate. Changing source create
  permission can prevent storing the reference, obscuring the output regression.
- Deferred source denial may happen after target work. Do not require zero target
  queries for every document-dependent denial.

## Limitations

This review established a source-level defect, not a runtime baseline. IMPL-01
must record an observed failing regression before applying the fix. The broader
matrix and package checks remain PSA-02/03 acceptance work. This summary does not
claim a comprehensive review of unrelated authorization paths.
