# CI-DAG-05 checkout setup support

Curated on **2026-11-19** by the **CI-DAG-05 setup implementation session**.
Related: [local delivery](../ci-dag-05-checkout-setup.md),
[confirmed handoff](../ci-dag-05-checkout-setup-handoff.md), and
[sole-line approval](../ci-dag-05-checkout-setup-contract-amendment.json).

**Historical local implementation evidence only.** Work remains uncommitted;
coordinator delivery reconciliation and fresh non-implementer review are pending.
No hosted/runtime/cancellation or CI-DAG-05 acceptance is claimed.

## Index

- [Core payload manifest](manifest.json): source/archive paths, modes, byte counts,
  SHA-256 hashes, transformations, omissions and self-reference limit. It covers
  132 initial payload files, not itself or later authored/delivery records.
- [Actual maintained fingerprints](fingerprints.json): exact thirteen-path
  inherited-before/final-after records, including three absent preimages.
- [Source snapshot index](sources/manifest.json),
  [thirteen-path inherited-preflight diff](sources/maintained.diff), and
  [isolated exact R1-test line diff](sources/r1-one-line.diff). Before/after snapshots
  live under `sources/before/` and `sources/after/`; selected red/failure inputs are
  under `sources/intermediate/` and `sources/red-wiring.test-input.mjs`.
- [Observation index](observations.json): 26 chronological observations, all
  commands/counts/exits/intervals and available input/runtime/output provenance.
  Each entry points to preserved `result.json`, `stdout.log` and `stderr.log`.
  Eleven nonzero results remain failures despite any optimistic historical label.
- [Original stage-1 design](design/stage-1-proposal.md),
  [stage-1 preflight](design/preflight.json), and
  [stage-1 fingerprints](design/stage-1-fingerprints.json): exact historical copies,
  retaining candidate/unapproved language. Later confirmation is a separate record.
- [Stage-2 preflight](scope/stage2-preflight.json),
  [pre-archive scope check](scope/scope-before-archive.json), and
  [separately accounted coordinator deltas](scope/coordinator-deltas.json).
- [Failed curation-driver preimages](scope/curation-driver-preimages.json),
  [verified partial-copy continuation](scope/partial-archive-before-continuation.json),
  and [edit-tool note](scope/tooling-notes.json). Existing owned partial copies were
  verified without rewriting; no protected source or old evidence was overwritten.
- [Tool provenance](observations/tool-prerequisites-final-amBAtc/stdout.log): Node
  candidates, cached check-yaml source/runtime and actionlint archive/binary hashes.
- `drivers/`: observed recorder, final reconciliation, discovery and curation
  inputs, including failed preimages. These are evidence of historical execution,
  not relocated product/source probes. The bundle-specific delivery verifier is
  [validate-delivery.py](drivers/validate-delivery.py).
- [Later delivery observations](delivery/): curation completion,
  document/link/privacy/structured-data/ignore/whitespace/format and final scope
  checks, with separate `provenance-*.json` manifests. The
  [curation-completion record](delivery/provenance-curation-completion.json) is the
  first such addition; [delivery-foundation provenance](delivery/provenance-delivery-foundation.json)
  preserves the initial authored-document formatting, pre-final integrity check
  and tracked-diff whitespace check. Exact file coverage is recorded per observation.

## Integrity, transformations and omissions

Copies rather than moves preserve original scratch/historical seals. Original and
archived fingerprints are distinct wherever substitution occurred. Standard
redaction replaces absolute checkout/home paths and full private session IDs with
placeholders. Only the two archived R1-test snapshots also replace a known public
`example.org` synthetic-auth URL with
`https://example.org/<redacted-synthetic-auth>/`; the source username/password
sentinels are the literal fixture words `user` and `secret`. This transformation
is reversible for fingerprint/diff recalculation, not a production credential.
The exact actual R1 pre/post fingerprints and sole-line diff remain unchanged;
archival snapshots are not executed as tests.

Raw unsanitized logs are omitted; original output hashes are retained when
recorded, and later curation also fingerprints locally available raw logs. Early
red/selected-only records lack later recorder coverage: missing runtime/input/raw
provenance is not inferred from final runs. Not every intermediate source version
was retained; result fingerprints do not become final-source certification.

No fixture Git object trees/refs, dependency trees, caches, databases, browsers,
tool binaries/tarballs, generated consumers or build outputs are included. The
complete coordinator scratch baseline/driver is not duplicated; its verified
fingerprint and exact delta record are retained. Existing coordinator/R1/R2/
historical records remain outside this session's ownership and unchanged.

This is **not a self-contained execution reproduction bundle**. Historical argv
may require omitted tools/dependencies and original fixture state; scratch paths
are historical provenance only. Archived-input hashes, the reversible R1
transformation and exact diffs can be recalculated. With Python/Git and this
repository, `drivers/validate-delivery.py` verifies bundle integrity and local
references; `--verify-local-sources` additionally requires original local sources.
It writes only `validation.json` in the caller's fresh ignored checkout-local run
directory; runtime TMPDIR must be its real `tmp` child. Replace and quote
placeholders before any authorized future invocation.

Archiving does not rerun or recertify tests. Delivery observations hash the file
set visible at capture; later copies/provenance cannot hash themselves. Human
index/report and newer check inputs have separately recorded fingerprints.
Preserved source/log evidence is not reformatted to make earlier red results green.
