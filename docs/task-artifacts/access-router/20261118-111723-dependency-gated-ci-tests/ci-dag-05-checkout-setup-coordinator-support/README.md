# CI-DAG-05 setup coordinator reconciliation support

Preserved: **2026-11-19T14:36:13.970069+00:00**. Owner alias:
**CI-DAG-05 remediation coordinator**.

The setup implementer delivered stage 2 in the same session and is idle. These
separate read-only coordinator checks reconcile delivery scope and saved evidence;
they are **not independent corrective acceptance, a new test run, or rollout
certification**. The delivered setup report/support and historical seals remain
unchanged, including their earlier pending-coordinator language.

## Preserved checks

- [Byte/scope result](../ci-dag-05-checkout-setup-stage2-coordinator-reconciliation.json):
  checked at **2026-11-19T14:29:16.540Z**; **2,582 original files / 2,568 unchanged**,
  exactly **10 maintained changes + three new maintained files**, with four
  coordinator-document changes and one coordinator JSON addition separately
  accounted. It preserves original modes, historical seals, HEAD/refs, all 31 job
  IDs/order, independent raw job blocks, graph prefix and evaluator assertions.
- [Saved-evidence result](../ci-dag-05-checkout-setup-stage2-coordinator-evidence.json):
  checked at **2026-11-19T14:33:42.048567+00:00**; **169 setup files / 57 parsed JSON
  files / 162 archive entries / 156 original source files / 64 raw output files**
  reconciled. The original 26 observations include **11 nonzero results**; nine
  later delivery observations bring the inspected total to **35**, with all
  recorded execution intervals serial. Exact thirteen-path diffs, reversible
  archival R1 redaction, the sole approved R1-test line and the two result-test
  changes were recalculated without importing or executing project code.
- [Copy manifest](manifest.json): four byte-exact, already-sanitized copies of the
  two results and inspected historical drivers; original and archive paths,
  modes, sizes and SHA-256 hashes are explicit. It does not cover itself or later
  additions. Result hashes are respectively
  `30941803b7f15af7cc44be9f742be0c95a0a2148bf65675c8f5b562927101253`
  (**90,650 bytes**) and
  `6d624edf0f2f742724e3fa5b5702664fb58d6c8e81b50738fab11cd9b80a1349`
  (**98,132 bytes**).
- Historical driver copies: [byte/scope checker](drivers/reconcile-byte-scope.mjs)
  and [saved-evidence checker](drivers/reconcile-saved-evidence.py). **Do not execute
  these archival copies**: their original scratch input paths and idle-confirmation
  flags document the historical invocations, not an archive-only runnable workflow.

Final saved **611 CI checks / 18 group-validation checks**, focused lint/format/YAML
and pinned actionlint passes all match the thirteen actual maintained fingerprints
in [setup fingerprints](../ci-dag-05-checkout-setup-support/fingerprints.json).
These are the implementer's saved results, not repeated coordinator executions.
The earlier failed tests, optimistic failed labels, formatting failures and two
curation failures remain failures. Earlier input/runtime/raw-output omissions and
each delivery check's exact capture boundary are retained, not inferred away.

## Subsequent handoff records and limits

The first document-only readiness attempt failed at
**2026-11-19T14:47:17.964504+00:00** on a checker false positive: its unanchored
external-temp privacy pattern matched the `tmp/` segment of an already sanitized
repository-local socket path in `ci-dag-05-local-evidence.md:162`. The
[separate failure manifest](readiness-failure-manifest.json) preserves the
[failure JSON](failures/readiness-privacy-check.json) and
[exact pre-correction driver](drivers/freeze-inputs-before-privacy-fix.py). Only
absolute-path token matching is corrected; historical logs, implementation and
tests remain unchanged. A subsequent passing readiness observation does not erase
or relabel this failure. These three files are outside the earlier four-entry
manifest; the pre-correction archival driver must not be executed.

The second readiness attempt failed formatting at
**2026-11-19T14:50:42.446322+00:00**. Its
[separate formatting-failure manifest](readiness-formatting-failure-manifest.json)
preserves the failed observation, driver, new-metadata preimage and actual serial
read-only formatter previews. Both diffs changed only command-array whitespace
with equal parsed JSON values. The newly authored privacy-failure metadata receives
that whitespace correction; the sealed four-entry `manifest.json` remains exact.
Its formatting-only exception is **not a Prettier pass** and remains visible in the
readiness result. Current documents/new metadata still require a passing formatter
check; protected historical JSON still requires structured/privacy/hash checks.
No implementation, test, historical result or sealed manifest is rewritten.

The coordinator's subsequent document-only readiness result will be preserved as
`handoff-readiness.json` after checking the current coordinator documents. A new
`../ci-dag-05-corrective-review-inputs.json` will snapshot the reconciled bytes for
the fresh non-implementer reviewer. These later records are outside the four-entry
copy manifest and the historical setup observations; the launch prompt supplies
their actual fingerprints. Their creation does not recertify previous executions.

The complete original coordinator baseline, historical scratch source trees and
redundant command streams remain locally retained but are not copied here. The
setup archive retains the matching **2,582-file original table**, source snapshots,
diffs, sanitized logs and declared provenance. Dependencies, caches, tool binaries,
fixture Git objects and execution state are omitted. This is not a self-contained
execution reproduction bundle.

Full native short-root success, Node-20 execution and actual runner main/post
behavior remain unverified. R1 independent acceptance, original R2 causality,
abort/timing-neutrality/incomplete packed-consumer disposition and all R3 hosted/
required-check/measurement/maintainer rollout prerequisites remain outstanding.
No package/resource/helper suite, source probe, build, runtime installation,
hosted execution, commit, push, dispatch, publication or settings change occurred
in these coordinator checks. Further package execution requires renewed explicit
authorization.
