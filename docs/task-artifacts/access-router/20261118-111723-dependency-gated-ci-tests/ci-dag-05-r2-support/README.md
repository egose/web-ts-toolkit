# CI-DAG-05 R2 support index

Created: **2026-11-19T07:17:07.703458+00:00**. Owner alias: **R2 attestation
investigation agent**. This is curated local investigation evidence, not
independent acceptance, a confirmed production fix, or hosted certification.

Related: [R2 investigation](../ci-dag-05-r2-investigation.md),
[bounded assignment](../ci-dag-05-r2-handoff.md),
[authoritative task](../../../../tasks/20261118-111723-dependency-gated-ci-tests.md#task-ci-dag-05-verify-rollout-measure-tradeoffs-and-update-testing-guidance),
[sealed finishing review](../ci-dag-05-finishing-review.md), and
[coordinator sequencing](../ci-dag-05-remediation-coordination.md).

## Read the verdict first

- Fixture-only diagnostics and maintained causal controls are delivered;
  production remains unchanged. Injected failures establish possible phenotypes,
  not the original unrecorded retry-preparation exception.
- The original intermittent Chromium recovery cause is **unresolved and awaiting
  explicit maintainer risk disposition**. A separate focused Node abort assertion
  failed without an established baseline defect or diagnostic regression.
- The sole complete affected-package invocation was **interrupted**: 867 tests
  passed in four completed lanes, but packed-consumer produced no counts/result.
  No complete-script pass or independent acceptance is claimed.
- Documentation/evidence closeout is delivered; this finalized bundle is R2's
  idle handoff for coordinator reconciliation, not a resolved-R2 verdict.
  Authorized checkout setup, fresh non-implementer corrective review and R3
  remain pending and were not performed by R2.

## Contents

The [manifest](manifest.json) records actual archived hashes/byte lengths,
original source hashes/selections, immutable staging hashes and transformations.
It also fingerprints this index and the investigation; its own hash is omitted
to avoid self-reference. The ten copied payloads total **99,546 bytes**.

| Payload                                                      | Purpose and limitation                                                                                                                                                                                    |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [commands.jsonl](commands.jsonl)                             | 17 completed recorder objects with exact argument arrays, timestamps, durations, exits and original log hashes; one separately attributed interrupted invocation.                                         |
| [verification.log](verification.log)                         | Selected check output, all failed test names/categories, observer controls and selection summaries. Headings are archive annotations; full logs and skipped-name lists are omitted.                       |
| [observations.jsonl](observations.jsonl)                     | Ten emitted causal observations: routed transport defect, healthy/hidden-marker controls, six correlated faults and corrected native transport. All failure events are retained.                          |
| [historical-failure.log](historical-failure.log)             | Sanitized contiguous original V5 failure/count excerpt, original lines 388–446; it contains no caught retry-preparation exception.                                                                        |
| [conditions.json](conditions.json)                           | Exact condition output. Recorder exit 0 does not hide the Redis image-inspection subcommand's exit 1.                                                                                                     |
| [resource-reconciliation.json](resource-reconciliation.json) | Exact already-sanitized read-only post-interruption snapshot and separately sourced harness interruption metadata; not historical-cleanup proof.                                                          |
| [formatting.json](formatting.json)                           | Six formatter command/before/formatted/patch fingerprints and saved assertion/scenario AST comparison; not proof of surrounding runtime equivalence.                                                      |
| [run-recorder.py](run-recorder.py)                           | Exact original completed-command recorder. Its subprocess call has no timeout; interruption prevented its final JSON record.                                                                              |
| [interrupted-package.log](interrupted-package.log)           | Entire saved incomplete package output, sanitized. Packed-consumer started but no test counts/completion were recorded.                                                                                   |
| [ownership.json](ownership.json)                             | Pre-archive comparison: R2 delivery fingerprints, coordinator drift, all 24 unchanged production files, inherited R1 inputs and protected historical comparisons. Full unchanged inventories are omitted. |

## Copy provenance and observation omissions

Original scratch inputs and staging remain unchanged. Staging was generated at
**2026-11-19T06:50:20.783018+00:00** under historical scratch
`_tmp-ci-dag-05-r2-J2LqEF/preservation-plan/`. Its `plan.json` SHA-256 is
`8f8af4d00389faf130108124fa36052fb34700b4d0e65bd9759169542f28890d`.
The plan's `archivedSha256`/`bytes` fields describe **staged** payloads, not the
two subsequently whitespace-normalized archive logs. Do not rewrite that plan.

Eight copied payloads match staging exactly. These are the only final
staging-to-archive differences:

| Payload                   | Archive-only change                                 | Staged bytes → archived bytes | Actual archived SHA-256                                            |
| ------------------------- | --------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------ |
| `historical-failure.log`  | One trailing ASCII space removed at staged line 51. | 4,472 → 4,471                 | `e5b405930f57145755f182e7335c5aaa0bff3d3e3ef24fd454d8b5668ab8fdfe` |
| `interrupted-package.log` | One trailing ASCII space removed at staged line 64. | 3,808 → 3,807                 | `b8348e70c5457b02c6e520675048f367cd44acb471c99f59996a9e7cfe654d62` |

Original-to-staging transformations are separately recorded in the manifest:
selection/reserialization, annotation headings, root/loopback-origin/warning-PID
scrubbing, structured aggregation and read-only ownership derivation. Copying
does not rerun, reclassify or recertify the saved checks.

Each archived causal observation omits ten native setup/static-entry
request/response events (**100 total**). `archivedNativeSetupEventsOmitted` counts
those omissions separately; original fixture/native `dropped` values remain
unchanged (zero in all ten observations). Every request-failed event is retained.
The early routed observation predates numeric request correlation; absent fields
were not invented. Later numeric IDs need not be consecutive after curation.

## Documentation-only validation

Scoped Prettier and evidence/content checks passed for this index, the report and
manifest. The [manifest](manifest.json) records actual commands/results and
verification limits, including unchanged baseline/protected inputs, payload/
staging/source seals, structured values, links/anchors, privacy-sensitive content
and whitespace/ignore checks. Formatting-plan, scoped manifest-format and
scratch-validator failures remain recorded separately; correcting the checker
changed no archived payload or product-test expectation. These are
documentation-only checks, not code-test reruns, complete-package verification,
coordinator reconciliation or independent acceptance. Closeout scratch
tools/logs remain omitted historical provenance.

## Dependencies, omitted material and reproducibility

The maintained tests/fixtures remain in
`packages/express-request-attestation/test/` and
`packages/express-request-attestation/test-packed-consumer/consumer/`; they use
the installed public signer export, native Chromium Fetch/import and the fixture
HTTP server. Their full execution still requires the checkout, package build,
installed dependencies, Playwright browser and applicable database resources.
Further execution requires authorization; this index does not request a rerun.

This is **not a self-contained reproduction bundle**. Omitted material includes
full protected snapshot inventories, complete original logs/skipped-name lists,
raw HTTP bodies/cookies/proofs/nonces/key material, scratch experiment and
verification drivers, formatter before/after files/patches, generated consumers,
tarballs/builds, dependency trees/caches, browser binaries/profiles and database
files. Original source paths/hashes are historical provenance, not archive-only
execution prerequisites. The retained recorder also depends on its original
scratch directory and external commands; historical invocations using omitted
drivers are not runnable from this archive alone.

The archive permits auditing the retained counts, safe phase/native observations,
source fingerprints, transformations and bounded conclusions. It cannot recover
the original swallowed exception, recalculate every protected-file comparison
without omitted snapshots, prove timing neutrality of the mapped load facade,
complete interrupted verification, or replace fresh independent review.
