# ARPC-05 — guarded lazy-logging candidate

**Candidate/unverified, not performance-accepted.** See [report](report.md).
The coordinator owns the retain/withdraw decision and shared task status.

- [Preregistration](protocol.md), fixed before candidate measurement.
- [Final verification and development failures](verification.json),
  [final focused log](focused-final.log), [provenance](provenance.json).
- [Production patch](candidate.patch); guard tests are maintained in
  `packages/access-router/test/service-lazy-logging.{unit,integration}.test.ts`.
- [CRUD work counts](crud-work.json), [logger-posture work](logging-work.json),
  [baseline/count comparison](work-comparison.json).
- Bounded actual-service measurement: [protocol](timing-protocol.json),
  [raw paired workers](timing-raw.json), [noise](timing-noise.json),
  [comparison](timing-comparison.json), [diagnostic traces](timing-work.json).
- [One-off measurement script](bounded-measure.mjs) preserves how the historical
  diagnostic packet was produced; it is not an acceptance benchmark. The runtime
  factory, dependency tree and source seals are intentionally omitted. Reproduction
  requires this checkout's unchanged original/candidate seals or newly recreated
  equivalent seals, as described in the report. JSON recalculation needs only the
  archived raw observations and maintained `summarize` implementation.
- [Archive/hash inventory and audit](audit.json).

Only this subdirectory is newly owned evidence. Earlier task artifacts, untracked
tests/harnesses, shared task status and the existing benchmark README are untouched.
