# FINAL-04 independent acceptance review

Date: 2026-11-09. Task:
[populate source/target access](../../../tasks/20261108-211920-access-router-populate-source-target-access.md).
Reviewed the delivered worktree based on `647a217`; no commit/release is implied.
FINAL-04 did not implement the correction. This new report is its only file change.

## Outcome

**No blockers or actionable findings. Approve delivered PSA-01/02/03 and narrow
PSA-04 acceptance within the task's scope.** Documentation, public types and
reviewed runtime behavior agree. The coordinator owns status/index reconciliation.
This is a bounded implementation review, not comprehensive security certification.

## Independently reviewed boundaries

- **Canonical source versus target:** `packages/access-router/src/services/service.ts`
  (`genExecutionPopulate`) uses captured `access.outputAccess` for source rules,
  retaining source authority and owning-document facts. Target operation admission,
  rows, fields, virtuals and facts still use resolved `targetAccess`. Reviewed
  related execution, retained model binding, projection and finalization preserve
  independent target policy, selection, `match` and referenced-ID constraints.
  Source denial remains enforced at document-stage finalization; deferred denial
  can follow target queries/hooks, so this is not a no-target-work guarantee.
- **Request-only helpers:** `src/core.ts` (`genPopulate`) uses positional access
  for source admission and the target default; descriptors override the target
  only. `src/services/base.ts` forwards unchanged. Empty document facts, absence
  of document-hook invocation, finite arity and named `scopePath` validation remain.
  Existing parent-path request admission is not expanded into document-stage
  authority or a replacement for normal service output authorization.
- **Effective accesses and alternate paths:** inspected public read/fallback,
  write-output and subdocument callers. Fallback source fields use effective
  `list`, while create/update/upsert output fields use `read` without replacing
  their branch-specific virtual/fact accesses. Embedded and dedicated child output
  retain owning-parent facts; dedicated route gates remain distinct from parent
  container output visibility. `SubPopulate`/`genSubPopulate` remain path/select-only.
  Private `dependsOnPopulate` implementation is unchanged.
- **Tests:** inspected both delivered populate contract diffs and relevant existing
  controls, not just their counts. All five source-matrix rows have assertions.
  Coverage includes same-model/self and cross-model refs, opposite source/target
  facts, descriptor/options/default precedence, operation/row denials, source
  exclusion, target selection/`-_id`, misses/null/absent/empty refs, embedded/direct/root
  and dedicated child paths, fallback by ID/filter, and create/update output.
  New writes verify denied input cannot seed the populated reference and check
  persisted IDs. Relevant isolation/hydration, retained-authority and private-input
  controls are reused without weakening existing assertions.
- **Public guidance and shape:** README's mixed-access example, MIGRATION,
  website services guidance and public JSDoc correctly distinguish source output
  from target policy, specify precedence and explain helper compatibility. The
  example explicitly assumes source/target admission and permitted rows; it needs
  no source permission broadening. Denial versus admitted-miss cardinality agrees
  with tests/finalization. Signatures, exported options and selectors are unchanged;
  no `sourceAccess`, dedicated-child selector or new public entrypoint is added.
- **Narrow PSA-04:** the metadata diff changes 40 line coordinates only. Reviewed
  producer/read anchors and evidence preserve inventories, expressions, inspection
  roles, negative boundaries and fail-closed checker behavior. Baseline evidence
  establishes tracked-input drift using existing `dist`, not a pristine HEAD build.

Paths abbreviated as `src/...` above are under `packages/access-router/`.

## Executed evidence accepted, not rerun by FINAL-04

- [PSA-01](psa-01.md): six focused failures/three passes before the correction,
  then nine focused passes. [PSA-02 ledger](psa-02.md): 19 broader new cases;
  standard affected runs passed 480 contracts, 81 invariants and seven helper cases.
- [PSA-04](psa-04.md): baseline provenance, restored standard preflight and 76
  maintained checker regressions passed, with disclosed snapshot limitations.
- [Coordinator verification](verification.md): before documentation, the standard
  package suite passed **218 files / 7,762 tests**, including strict/packed consumers;
  source typecheck and repository lint passed.
- [PSA-03](psa-03.md): after documentation, **98** documentation/named-helper tests
  passed (93 documentation plus five installed compiler modes; 44 unrelated cases
  filtered), source typecheck, **24** guidance tests, standard decorator checks
  (**23 files / 779 tests**, including typecheck), and **one** fresh packed-publication
  integrity test passed (**12** unrelated packed cases filtered). Formatting, scoped
  lint and affected link checks also passed. This is not a post-doc rerun of every
  strict/packed consumer or the opt-in decorator compatibility matrix.

## Reviewer checks and limitations

- Read final implementation/test/metadata/documentation diffs and the linked
  evidence. Independent, non-emitting TypeScript AST comparisons passed for five
  changed source files against HEAD after applying only the two exact PSA-01
  substitutions as expected differences. Other source changes are comments only;
  the earlier full-runtime evidence is not invalidated by DOCS-03.
- Independent TypeScript-checker inspection passed **18 declaration-visible JSDoc
  surfaces** through root/advanced `.d.ts`/`.d.mts` aliases and inherited helpers.
  An initial probe incorrectly looked for `ModelRouter` on `/advanced`; following
  its actual `ModelRequest.macl` graph corrected the probe. No product fix was needed.
- Report/document link targets, privacy/path inspection, report formatting,
  nonignored destination and `git diff --check` passed. The GitHub README link was
  checked against its local target, not remote publication availability.
- FINAL-04 ran no builds, runtime tests or source typecheck. Static probes used
  read-only inline Node/TypeScript inspection; no scratch inputs were created.
  Full-workspace tests/builds and website production build were not run. Coverage
  is not a Cartesian authorization-mode/hydration matrix or an audit of all helpers,
  model configurations or website prose.
- This curated report and maintained tests preserve the conclusions, not raw logs,
  probe bodies, builds, tarballs, staged consumers or dependencies. Reproduction
  requires the repository, dependencies and normal test environment; this is not a
  standalone executable archive. No existing evidence/task/index was edited.
