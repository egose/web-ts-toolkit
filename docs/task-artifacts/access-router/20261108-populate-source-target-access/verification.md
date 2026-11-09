# Coordinator shared-gate verification

Date: 2026-11-09. Related task:
[populate source/target access](../../../tasks/20261108-211920-access-router-populate-source-target-access.md).

## Verified state

Starting revision was `647a217`. The runtime correction, 28 new regression cases
from PSA-01/02, and PSA-04's consumer-review coordinate repair were present. These
checks preceded DOCS-03's documentation/JSDoc edits; its handoff records affected
checks after those changes. No commit or release was created.

Commands ran serially from the repository root with installed workspace
dependencies, Node `v26.12.1` and pnpm `11.18.0`. Scratch was checkout-local and
confirmed ignored. Replace the quoted `<repo-root>` placeholder before reuse.

```sh
TMPDIR='<repo-root>/_tmp-populate-source-target-20261109-DCsFHQ' pnpm --filter @web-ts-toolkit/access-router test
TMPDIR='<repo-root>/_tmp-populate-source-target-20261109-DCsFHQ' pnpm --filter @web-ts-toolkit/access-router typecheck
pnpm lint
```

## Results

- Standard package test: **218 files passed; 7,762 tests passed**. Strict and
  packed-consumer suites were included, not skipped or replaced by direct Vitest.
- Dependency builds passed, followed by exhaustive layer preflight: contracts
  103, invariants 64, internal 51; exact default union; public graph 137 files /
  237 modules.
- Standard source typecheck: passed, including its dependency rebuild.
- Repository lint: passed after the runtime/test changes. Baseline lint also
  passed before implementation.
- Task/evidence document formatting, local Markdown link targets, privacy-pattern
  checks and `git diff --check` passed at this stage. Final affected files must be
  checked again after documentation/review changes.

Vite emitted configuration-native-loader warnings; no suppression or unrelated
configuration change was made. The full test run took 2,034.50 seconds in this
environment. This records execution duration, not a performance claim.

## Provenance and limits

The coordinator executed these checks independently of the implementation and
regression agents. The standalone PSA-04 checker run and earlier red/green
observations are separately recorded in their handoffs; these full-package results
do not rewrite those earlier failures.

Full-workspace `pnpm test`/`pnpm build` were not run: acceptance is scoped to the
affected package and relevant downstream/documentation checks. Decorator and
post-documentation checks are assigned to DOCS-03. Independent FINAL-04 review is
separate from executing this suite.

Raw logs, MongoDB files, caches, generated distributions, tarballs and temporary
installed consumers are omitted. Maintained tests and repository dependencies are
the reproduction inputs; this curated summary is not an executable snapshot or
raw-log archive. No credentials, private session identifiers or machine-local
paths are preserved.

## Post-documentation continuation

DOCS-03 subsequently delivered only public guidance and JSDoc changes, verified
their source AST shape, and reran affected documentation, installed-helper,
publication-integrity, source-type and downstream decorator checks. Its
[handoff](psa-03.md) records actual commands, selected/skipped cases and limitations.
These checks supplement, rather than relabel or repeat, the full-runtime results
above. Independent FINAL-04 integration review is pending.

## Final coordinator static/preservation checks

- Repository `pnpm lint` passed again after all DOCS-03 edits.
- Reviewed task scratch entries, shared-check logs and GATE-04 summary data.
  Remaining content consists of disposable logs, formatting copies, caches,
  generated consumers, HEAD snapshots and verification probes. Their useful
  decisions/results are preserved in maintained tests and this report bundle;
  no unique design or handoff is left only in scratch.
- No scratch cleanup, unrelated deletion, commit or release was performed.

## Final acceptance

[FINAL-04](final-04.md) subsequently completed the independent integrated review:
no blockers or actionable findings, and scoped PSA-01/02/03/04 acceptance approved.
Its source AST and declaration-visible JSDoc checks supplement the runtime evidence;
it did not rerun the runtime suites. The coordinator reconciled all task statuses
to completed. Full-workspace/website-build limitations above remain unchanged.

After status reconciliation, coordinator checks passed: task/evidence formatting,
35 local file/heading link targets, privacy patterns across nine task/evidence
documents, nonignored artifact destinations, all four task statuses completed,
and `git diff --check`.
