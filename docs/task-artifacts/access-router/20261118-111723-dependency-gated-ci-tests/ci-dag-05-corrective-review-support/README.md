# CI-DAG-05 corrective-review support

Purpose: minimal sanitized evidence for the
[new independent report](../ci-dag-05-corrective-review.md), not implementation,
historical report replacement, complete runtime reproduction or rollout approval.
Related [task](../../../../tasks/20261118-111723-dependency-gated-ci-tests.md),
[launch assignment](../ci-dag-05-corrective-review-assignment.json) and
[immutable input snapshot](../ci-dag-05-corrective-review-inputs.json).

## Contents

- [Inputs](inputs.json): exact reviewed maintained/control/document hashes, immutable
  inventory identity and initial matching boundary.
- [Checks](checks.json): six one-shot fresh static/validation/quality commands,
  exact argv, counts, selections, timestamps, original-record/stream hashes and
  selected output. Before/after inventory and all maintained inputs matched.
- [Evidence reconciliation](evidence-reconciliation.json): both independent
  read-only audit attempts, all seven first-attempt discrepancies and their
  disposition, corrected delivery accounting, static preservation and limitations.
- [Maintained Prettier stdout](maintained-prettier.stdout.log) and
  [stderr](maintained-prettier.stderr.log): the fresh failure retained without a
  maintained edit or check retry. Stderr is byte-exact; stdout's sole CRLF is
  normalized to LF, with original and archived hashes recorded in `checks.json`.
- [Closing integrity](closing-integrity.json): final protected-input inventory,
  permitted addition scope, HEAD/refs and scratch checks. The 52 inventory checks
  before report creation were passes, not 52 tests or runtime probes; later closure
  checks are separate.
- [Delivery check](delivery-check.json): deliverable-only formatting, links,
  structured validity, privacy, preservation provenance and final scope evidence.
  Its capture excludes its own post-capture digest. Formatting selects seven new
  Markdown/JSON files; content checks also include the two complete failure streams.

## Provenance and omissions

Reviewer alias: **CI-DAG-05 fresh corrective-review session**. Original reviewer
records remain unchanged in ignored `_tmp-c5cr-5m91q69w/`; evidence is copied or
curated, never moved or resealed. JSON summaries deliberately omit repeated full
2,771-file tables, full assertion-node maps and verbose successful TAP output.
Their original paths, bytes and SHA-256 hashes are recorded; excerpts are labeled.
The two Prettier streams preserve the complete failure text; only stdout's sole
CRLF is normalized. The closing inventory and final delivery check state their own
capture boundary.

The six recorder streams were UTF-8 decoded and scrubbed for checkout/home paths
and private session identifiers before retention. For these six invocations the
raw and scratch-retained byte counts/hashes are equal. The new durable stdout
copy's sole CRLF-to-LF normalization is a separate documented transformation.
No raw proof/cookie/key material or private session mapping is included.
Historical R2's curated log changes remain separate: exactly one trailing ASCII
space removed from each of two archive lines, not new reviewer transformations or
runtime reruns.

Existing R1/R2/setup and coordinator support retain their original evidence and
failure history; this directory does not duplicate those bundles. Full raw private
diagnostics, intermediate inventory JSON, executable scratch drivers, actionlint
binary/archive, runtimes/dependencies/caches, browser/database state, generated
builds/consumers and historical source trees are omitted. Scratch command/path
records are historical, **not runnable from this support directory alone**.

These summaries support audit of the report's selected claims. They do not allow
independent recreation of unrecorded R2 causality, original environment equality,
native full-root/Node-20/runner behavior, or hosted scheduling/artifact/required-check
acceptance. Archiving did not execute historical helpers, repeat tests or recertify
old results. Replace quoted `'<repo-root>'` placeholders before any separately
authorized command; none is an instruction to execute additional work now.

Only this new support and the new report are reviewer-owned durable writes.
Coordinator documents, implementation and all old evidence remain protected.
