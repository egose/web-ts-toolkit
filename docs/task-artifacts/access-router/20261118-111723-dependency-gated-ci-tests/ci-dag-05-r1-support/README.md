# R1 supporting evidence

New, curated evidence for the [R1 remediation handoff](../ci-dag-05-r1-remediation.md)
and [CI-DAG-05 task](../../../../tasks/20261118-111723-dependency-gated-ci-tests.md).
The [sealed finishing review](../ci-dag-05-finishing-review.md) and all older bundle
documents remain unchanged. Local dates are 2026-11-18; saved command timestamps
are UTC on 2026-11-19. This is implementation evidence, not independent acceptance
or rollout authorization.

## Contents

- [Manifest](manifest.json): original/archived paths and SHA-256 values,
  transformations, scope fingerprints and final manual verification.
- [Command results](results.json): exact saved argv, timestamps, exits, wrapper
  durations and counts parsed from logs; empty original count arrays are retained.
- [Before fingerprints](before-fingerprints.json),
  [final protected-file check](protected-files.json), and
  [R1-only diff](implementation.diff): five changed existing files, 2,531 unchanged
  protected files, coordinator baseline and sealed original-log integrity.
- [Helper tests](helper-tests.log), [CI validator](ci-contracts.log) and
  [group validator](groups-contracts.log): 134/326/18 passing checks, respectively.
- [Expected pre-fix regression failure](baseline-regression.log): 50 passed and
  one missing expected exception; not a passing baseline.
- [Initial probe failure](probe-initial.log),
  [diagnostic probe failure](probe-diagnostic.log),
  [corrected probe observations](probe-corrected.log),
  [input hashes](probe-inputs.json), [diagnostic delta](probe-diagnostic.diff), and
  [teardown delta](probe-teardown.diff): two exit-101 invocations and the later
  exit-0 invocation remain distinguishable.
- [Initial formatting failure](formatting-failure.log),
  [reviewed formatter diff as JSON lines](formatting-review.json), and
  [preformat fingerprints](preformat-fingerprints.json): formatting provenance,
  separate from the final passing tests/checks.
- [Initial handoff-formatting failure](handoff-formatting-failure.log) and
  [reviewed table delta](handoff-formatting.diff): documentation-only correction,
  separate from the later passing handoff check.

## Provenance and limits

Selected material was copied from `_tmp-r1-mwGWUn/`; originals and other tasks'
scratch were not moved, rewritten or deleted. Machine-specific checkout prefixes
in log copies are replaced with `<repo-root>`. Socket byte counts were measured
before this transformation, not recomputed from redacted strings. The manifest
records both source and archived hashes. Unified diffs use zero context and
repo-relative labels; they are historical change records, not execution commands.
`formatting-review.json` preserves the scrubbed diff as lines that can be joined
with a newline.

Omitted: dependencies, browser/database state, compiled outputs, generated
consumers/archives, full upstream sources, disposable command/probe/curation
drivers, redundant preliminary passing logs and the coordinator's raw baseline
file. Original scratch paths in metadata are historical provenance, not durable
execution prerequisites. The before-fingerprint inventory and selected raw
observations are retained; a hash does not replace an omitted executable input.

The historical probe command is **not runnable from this archive alone**. Its
event-driven protocol, source-version assumptions and teardown change are recorded
in the handoff. Fresh verification should use the maintained helper regressions
from an installed checkout with pinned tools and new ignored checkout-local
scratch, then run the CI and group validators sequentially. No full-suite, RxDB
database-instance, hosted-checkout or independent-review certification is implied.
