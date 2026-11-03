# Document-permission dependency evidence

Curated evidence for [the document-permission dependencies task, DEP-01–03](../../../tasks/20261103-003636-access-router-document-permission-dependencies.md).
The current contract removes `alwaysSelectFields` and attaches private persisted
inputs to the applicable document-permission calculation.

## Contents and provenance

- [IMPLEMENT-02.md](IMPLEMENT-02.md): IMPLEMENT-02's migration decisions, public
  type correction, package/decorator verification and remaining benchmark limits.
- [VERIFICATION.md](VERIFICATION.md): commands/protocol for that implementation
  run, including its initial failures and successful corrected reruns.
- [REVIEW-01.md](REVIEW-01.md): separate, subsequent independent review, acceptance
  assessment, regression corrections and final workspace verification.

Final review: one parent/write metadata-dependency finding was fixed with maintained
regressions. Required workspace build/test/lint and preservation checks passed;
the full root test run recorded 18,677 passing test executions and 1 todo (including
repeated peer/browser lanes). An initial overlong temporary Unix-socket path failure
was reproduced and resolved by using a shorter ignored repository-local `TMPDIR`,
not by skipping tests or changing unrelated package behavior. See the review for
exact commands, package totals and the acceptance conclusion.

IMPLEMENT-01 and IMPLEMENT-02 finished sequentially before REVIEW-01 began.
REVIEW-01 did not implement those phases, spawn agents, commit/push, or change task
statuses. The coordinator owns status reconciliation. Implementation-run results
remain attributed to their author; the review distinguishes its own executions.

## Historical versus current evidence

These documents describe this task's mutable working-tree delivery, not a sealed
release artifact or an unmeasured baseline. Earlier historical tasks and evidence
bundles were not rewritten or recertified. Benchmark fixture selection can configure
an explicitly selected historical artifact through its old declarations; that
benchmark-only setup is **not** compatibility support in the current package.

The earlier optional broader benchmark run had **51 passes / 2 failures** (missing
`WTT_BENCH_LEGACY_ROOT` artifact and a test referencing retired
`unsafe-snapshot-options.ts`). Current smoke success does not resolve or relabel
those failures, establish historical reproducibility, or prove performance.

## Preservation and reproduction limits

The maintained regression tests, shipped guides and benchmark drivers remain in
their normal repository locations. This bundle preserves concise findings and
verification evidence, not entire scratch trees. Raw logs, installed dependencies,
packed consumers/tarballs, Mongo data, caches and instrumented/generated builds are
omitted. Reproduction needs the repository, its dependencies and normal test
prerequisites; historical comparisons additionally need the omitted sealed legacy
artifact. This is not a standalone reproduction bundle.

Disposable `_tmp*` directories were repository-local and confirmed ignored, with
absolute `TMPDIR` supplied only at runtime. Durable paths use repository-relative
names or quoted `<repo-root>` placeholders; no credentials, private session IDs or
machine-specific absolute paths are preserved. The review records the final link,
privacy, ignore and whitespace checks rather than treating archival as a rerun.
