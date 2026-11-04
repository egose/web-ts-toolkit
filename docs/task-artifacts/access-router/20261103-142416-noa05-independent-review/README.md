# NOA-05 independent final review evidence

Related task: [nested operation access / NOA-05](../../../tasks/20261103-082614-access-router-nested-operation-access.md).

This is a fresh review of the shared worktree, independent of NOA-01–NOA-04's
implementers. Earlier handoffs and artifacts remain unchanged. The coordinator owns
shared task statuses. No agents, commits, pushes, production edits or test edits
are authorized or performed by this review.

**Final verdict: REQUEST CHANGES; NOA-05 acceptance is blocked.** The independent
review is finished, not accepted. The [report](review.md) contains the criterion
matrix, two confirmed findings and recommended sequential remediation ownership:

- **F1 (P2):** direct static construction inspects a Proxy before safe admission;
  model/data exact setters coerce malformed keys before type rejection.
- **F2 (P2, mandatory V3 failure):** client packed test expects root Node `>=20`,
  but root metadata is `>=24`; root `pnpm test` exits 1. No baseline waiver.

V1 passed **863 + 2,589 tests**; the fresh unfiltered access-router suite passed
**196 files / 6,712 tests** inside root test. Package typecheck, root build and root
lint passed. Client browser and later workspace coverage remain incomplete.

## Execution and preservation

- Scratch: `_tmp-noa05-LOP2jJXY`, created fresh with `mktemp` and confirmed ignored
  using `git check-ignore`. All verification commands receive its absolute path as
  `TMPDIR` at runtime.
- A single runner executed, in order: transitive access-router build; all ten V1
  operation/nested suites; affected target/capture suites without the former
  consumer exclusion; V2 package typecheck; V3 root build; root test; root lint;
  whitespace check. No second build/test or other task agent runs concurrently.
- Root `package.json` retains `--workspace-concurrency=1` for `pnpm test`.
- Before/after hashes of 1,744 watched source/config files match; post-run
  re-enumeration also finds no added/changed watched files. Selected hashes, digest
  method and source scope are preserved. HEAD alone does not identify the extensive
  shared uncommitted implementation reviewed here.
- Original NOA-04 full-package evidence is an accepted prerequisite. NOA-05 also
  freshly reproduced its 196-file / 6,712-test pass inside the unfiltered root run;
  no separate package-test invocation is claimed.
- The built-package F1 observer ran only after all gates finished. Its exit 0
  asserts the bug's presence, not compliance; its result matches the scratch CJS
  observation exactly. Maintained regression tests remain the fix owner's work.

## Read-only review completed

- Entire task and reviewed target contract; root `AGENTS.md`; task and preservation
  conventions; task-as-you-go and ai-friendly-ts-package skills; all four handoffs.
- Public rule/context/setter types, shared resolver/admission, live model/data cores,
  generated direct routes, root dispatch and separate outer scalar guard.
- Captured base selection, populate/include/private target call sites, LIST retry,
  subdocument mutation/response gates, actor ownership and same-runtime defaults.
- Nested/admission/capture/entry tests and changed original matrices; public consumer
  fixtures, packed ESM/CJS behavior and migration block classification.
- Contextual spelling searches: source hits are unchanged request-schema APIs;
  guide hits are historical mappings/removal diagnostics; client README hits are
  business variable names. No old runtime resolver map or translation was located.

## Bundle inventory and provenance

| File                                                       | Purpose                                                                                           |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [review.md](review.md)                                     | Final findings, criterion matrix, gate outcomes, commands, limitations and coordinator handoff    |
| [gate-results.json](gate-results.json)                     | All eight serialized gate commands, UTC timestamps, durations and exits                           |
| [v1-summary.json](v1-summary.json)                         | Curated per-file counts for both passing focused runs                                             |
| [root-test-summary.json](root-test-summary.json)           | The 27 completed Vitest invocation summaries; partial aggregate, not repository acceptance        |
| [root-test-failure.txt](root-test-failure.txt)             | Sanitized F2 assertion and incomplete-coverage excerpt                                            |
| [admission-order-probe.mjs](admission-order-probe.mjs)     | Minimal historical public-entry bug observer; not an acceptance test                              |
| [admission-order-result.json](admission-order-result.json) | Five observations and no registry publication; reproduced by the durable observer                 |
| [regression-ledger.json](regression-ledger.json)           | Static original-matrix declaration/assertion-site reconciliation against HEAD                     |
| [migration-preservation.json](migration-preservation.json) | Original migration classifications/source preservation and three additions                        |
| [source-identity.json](source-identity.json)               | Reviewed HEAD, tools, aggregate identity, unchanged-source observation and selected source hashes |
| [provenance.json](provenance.json)                         | Original input hashes, curated archive checksums, transformations and omitted-data limits         |

All results describe the reviewed shared worktree, not a clean-HEAD baseline.
Copying/curation does not rerun or recertify the gates. Scratch originals were left
unchanged. The original logs and full reporter JSON, complete source manifest,
scratch tooling, installed consumers, dependency trees, generated builds/tarballs,
databases, caches and browser assets are omitted. This is **not** a self-contained
reproduction archive. Historical scratch paths in commands/provenance are not
required archive inputs; use a fresh ignored checkout-local TMPDIR for new runs.

The reviewed checkout and its build/dependencies are needed to rerun the minimal
observer; it intentionally fails once F1 is fixed. Full tests additionally need
MongoDB memory-server and applicable registry/cache/browser support. Counts in the
curated summaries can be reconciled, but full raw test outcomes/source identity
cannot be independently recalculated from the bundle alone. See the report for
required reruns after remediation. No coordinator-owned shared task status changed.

Final validation parsed eight JSON files and checked all twelve bundle files for
links, privacy-sensitive paths/identifiers, whitespace and non-ignored destinations.
Curated results reconcile with the raw local observations; source hashes remain
unchanged. The formatted observer rerun, final root lint, bundle Prettier check and
`git diff --check` passed. These checks do not waive F1 or the failed root test.
