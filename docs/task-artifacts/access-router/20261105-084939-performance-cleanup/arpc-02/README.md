# ARPC-02 candidate evidence

This bundle owns only ARPC-02's preparation-reuse candidate and its verification.
It does not alter ARPC-01's archived reports, frozen baseline or the shared task
file. **Final disposition: production candidate withdrawn.** Work counts alone do
not establish measured allocation savings or both-mode non-regression; calibration
has 0/16 usable cells. Retained-tree checks pass: 537 tests / 6 files, package
typecheck and scoped lint. Production source/bundle/dist match the original baseline.

- [Final withdrawal decision, retained tests, executed checks and handoff](withdrawal/report.md)
- [Retained baseline identities](withdrawal/retained-state.json),
  [withdrawal verification](withdrawal/verification.json), and
  [final withdrawal audit](withdrawal/audit.json)
- [Exact candidate safety-test patch](withdrawal/candidate-safety-tests.patch)

- [Design, observation proof and explicit no-change boundaries](design.md)
- [Implementation outcome, commands, measurements and blockers](report.md)
- [Candidate/baseline source provenance and patch identities](provenance.json)
- [Executed verification records](verification.json), [real-service work counts](work.json)
- [Sealed 432-cell output/state/mode/query/callback concordance](smoke-concordance.json)
- [Focused v2 calibration summary](noise-summary.json) and one raw packet in `noise/`
- [Original/archive copy hashes](archive-manifest.json)
- [Candidate-era source/declaration/work/reference/privacy audit](audit-final.json)

`audit.json` is the first candidate preservation audit; `audit-final.json` additionally
covers the final wording clarification that v1 smoke includes tiny wiring-only
timing samples at that point. The withdrawal supplement records the later source
restoration without rewriting these historical audits or the raw noise data/rules.

Generated bundles, full copied source/dependency trees, full test logs, MongoDB
data and raw diagnostic-smoke trees are omitted. Patches and source hashes preserve
the candidate sources; the original baseline inventory/dependency identities are
in [ARPC-01 provenance](../arpc-01-provenance.json). This is not a relocatable runtime
installation. Timing recalculation uses the archived raw packet and maintained v2
summarizer; service reruns require the installed toolchain/dependencies and fresh
seals. The report distinguishes intermediate candidates from the final candidate.
