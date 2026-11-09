# ARPC-01 v2 supplemental evidence

This supplement addresses v1's cold/short-cell noise, not production optimization.
V1 source, original `_tmp-arpc-01-4d6agBQe/baseline/` source/bundle seal and archived
evidence are unchanged. No full suite or baseline typecheck is repeated.

Maintained protocol and exact commands:
[`scripts/benchmarks/access-router-crud-v2.md`](../../../../../scripts/benchmarks/access-router-crud-v2.md).

V2 reuses the original sealed factory and production source
`f2d472bbe1f390005f0ebe62f548608a1a155d7c9dc8bc1e85f2122559999480`.
There is no candidate inspection or production edit. New worker panels and a
baseline-pilot fixed-operation plan replace v1's 432-fixture worker and tiny
3-warmup/9-sample windows. The 20% noise cap and decision rule are unchanged.

**Final outcome: bounded investigation finished, no performance claim.** Core v2
timed out at 1800.78s with 264/280 saved timing-worker results and no `report.json`.
Only two panels have all required pairs; all eight of their cells fail unchanged
noise/warmup gates. The other 32 cells lack the final pair in repeat two. **The
partial packet is not a usable calibration.** No timing retry was made.

- [Final report, exact future bounded commands and remaining task gates](report.md)
- [Coverage/quality summary and complete-panel descriptive statistics](quality-summary.json)
- [One compact partial raw packet](raw-partial.json), [fixed plan](plan.json),
  [separate diagnostics](work.json), [failure](failure.json),
  [command result](calibration-result.json), [scrubbed timeout excerpt](timeout-excerpt.log)
- [Preregistered protocol](protocol.json), [source/tool provenance](provenance.json),
  [focused verification](verification.json), [copy/hash manifest](archive-manifest.json)

Operational v2 scratch is `_tmp-arpc-01-v2-2rvJTj9O/`; original operational source/
bundles stay in the v1 scratch directory and must not be overwritten. This
supplement does not duplicate v1 raw reports, dependencies, generated bundles or
database/consumer scratch. Accepting the bounded baseline-investigation handoff
does not imply whole-matrix performance acceptance; statuses remain coordinator-owned.
