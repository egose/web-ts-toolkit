# Access-router historical task evidence

This is a curated archive of documents and structured summaries previously kept
only in ignored repository-local scratch directories. It covers query-pipeline
work, the withdrawn publication-fusion prototype, the earlier authorization fast
path, and the owned-authorization redesign.

## Start here

- [Original ownership architecture](oar01-20261031-153820/ARCHITECTURE.md)
- [Contract resolutions](oar01-20261031-153820/CONTRACT-AMENDMENTS.md)
- [Precommitted performance gates](oar01-20261031-153820/PERFORMANCE-GATES.md)
- [Measurement plan](oar01-20261031-153820/MEASUREMENT-PLAN.md)
- [Helper/guard design](oar09e-design-kTiLZtLh/DESIGN.md)
- [Historical collection-helper proposal](oar09f-proposal-jjv0s8q7/PROPOSAL.md)
- [OAR-07A test migration ledger](oar07a-20261031-Sn6zV3/LEGACY-TEST-MIGRATION-LEDGER.md)
- [OAR-07B test migration ledger](oar07b-recovery-20261101-drdazhbz/LEGACY-TEST-MIGRATION-LEDGER.md)
- [Final integration gate ledger](oar09f-final-hh7rwm51/GATES.md)
- [Final measurement report](oar09g-measure-x_sev0qz/REPORT.md)
- [All 90 numerical gates](oar09g-measure-x_sev0qz/ALL-GATES.md)
- [Report-only batch comparison](oar09g-measure-x_sev0qz/B1-DESCRIPTIVE-TABLES.md)
- [Original independent review](oar10-final-x4mMa3Th/REVIEW.md)
- [Final independent re-review](oar10-rereview-TqXpu08b/REREVIEW.md)
- [Publication-fusion withdrawal rationale](publication-fusion-fuse05-integration-20261030-112318-e5b7/coordinator-notes.md)
- [Earlier fast-path final measurements](fp05-final-20261031-152953/measurements.md)
- [Earlier fast-path final review](fp06-final-20261031-143300/coordinator-notes.md)
- [Query-pipeline findings](query-pipeline/remaining-summary.md)

The [manifest](manifest.json) enumerates all 162 preserved files in 51 packets,
their original repo-relative locations, and source/archive SHA-256 hashes. Other
handoffs, intermediate reports, test catalogs and selected JSON audit summaries
retain the chronology behind these entry points.

## Historical status, not new acceptance

Documents retain their original findings, failures, approvals still pending at
that time, and coverage limitations. Later decisions are recorded in:

- [Owned-authorization task](../../tasks/20261031-153020-access-router-owned-authorization-redesign.md)
- [Publication-fusion task](../../tasks/20261030-082847-access-router-unsafe-output-publication-fusion.md)
- [Earlier fast-path task](../../tasks/20261030-142406-access-router-unsafe-authorization-fast-path.md)
- [Query-pipeline task](../../tasks/20261029-211734-access-router-query-pipeline-overhead.md)

In particular, the final original campaign passed **70/90 numerical gates**;
the twenty misses were subsequently accepted explicitly by the user, not changed
into numerical passes. B1 has **zero acceptance gates**. The final re-review
resolved the earlier documentation findings. The collection proposal's original
budget recommendations are historical; use the later task decisions and shipped
documentation for the implemented contract. The publication-fusion prototype was
withdrawn, not shipped.

## Scope and reproducibility limitations

- Only files enumerated in the manifest are archived. Raw per-request benchmark
  results, original test/source snapshots, executable artifacts, dependency trees,
  tarballs, process inventories, caches and most command logs/seals are **not**
  included. Selected JSON audits are recorded summaries, not replacements for raw
  observations or independent recalculation.
- References to omitted files, including bare sibling filenames, remain historical
  references to the original ignored packets. A protocol's "adjacent artifact" or
  a handoff's "all logs preserved" statement describes that original packet, not
  this curated directory. Do not assume those files exist in another checkout.
  Quoted README paragraphs in `README-REFERENCE-CONTEXTS.md` retain their original
  package-relative `MIGRATION.md` links; they are source excerpts, not archive links.
- Historical runbooks and protocol JSON are **not self-contained runnable inputs**.
  Do not run their old commands against the archive or interpret old source pins
  as verification of the current checkout. No historical tests or measurements
  were rerun during preservation.
- Markdown gained an archive notice; paths to selected documents were updated and
  machine-local paths/session identifiers were scrubbed. Structured documents were
  treated similarly. Historical hashes inside these documents still describe
  original evidence, not transformed archive bytes. The new manifest distinguishes
  the two; it does not recertify old seals.
- Ignored originals were deliberately left unchanged because existing integrity
  checks depend on their original paths and bytes. No raw evidence was deleted or
  silently moved out from under those checks.

For future work, follow the [preservation workflow](../README.md): use ignored
`_tmp*` directories for scratch work, then promote worthwhile referenced contents
to `docs/task-artifacts/<package-name>/<task-or-run-id>/` before final handoff.
Keep maintained regression tests and benchmark scripts in their normal locations.
