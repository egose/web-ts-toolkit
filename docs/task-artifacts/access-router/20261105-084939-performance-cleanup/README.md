# Access-router performance cleanup evidence

Related task: `docs/tasks/20261105-084939-access-router-performance-cleanup.md`.

ARPC-01 owns the new maintained CRUD fixture/driver and this baseline packet only;
it does not change production code or certify ARPC-02–08.

- [ARPC-01 coverage ledger and explicit claim gates](arpc-01-coverage.md)
- [Real-service work findings and prioritized ARPC-02–06 handoff](arpc-01-work-findings.md)
- [ARPC-01 report, results, commands and blockers](arpc-01-report.md)
- [Frozen source/build/dependency provenance](arpc-01-provenance.json)
- [Verification commands/results](arpc-01-verification.json)
- [Baseline noise summary](arpc-01-noise-summary.json) and [per-case report](arpc-01-noise-report.json)
- [Source-selection regression evidence](arpc-01-source-selection.json)
- [Archive copy/hash manifest](arpc-01-archive-manifest.json)
- Maintained [CRUD v1 protocol and commands](../../../../scripts/benchmarks/access-router-crud.md)

Package gates pass and the 432-case noise packet completed; most timing cells are
noise-blocked, so this is a **partial ARPC-01 delivery**, not full matrix acceptance.
Operational frozen sources/bundles remain
in an ignored repository-local `_tmp-arpc-01-*` directory for subsequent tasks.
Those generated bundles, dependency trees, MongoDB data/binaries, temporary
consumer fixtures and full raw test logs are not archival deliverables. Durable
provenance and useful observations, rather than the entire scratch tree, belong
here. A hash-only source/dependency record is not a self-contained installation or
portable runnable baseline; recreation requires the original source revision and
the documented installed toolchain/dependency bytes.
