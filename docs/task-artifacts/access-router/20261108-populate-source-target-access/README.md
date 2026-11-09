# Populate source/target access correction

Related task: [source and target authorization](../../../tasks/20261108-211920-access-router-populate-source-target-access.md).

This bundle records the 2026-11-09 review and implementation of the mixed-access
populate correction, starting from clean revision `647a217`. Status: implementation,
regressions, documentation and applicable checks completed; independent final review
approved with no blockers. This index does not certify unrun checks.

## Evidence

- [REVIEW-01: defect validation and helper contract](review-01.md).
- [PSA-01: implementation, observed red/green and forwarding review](psa-01.md).
- [PSA-02: broader regressions and requirement coverage ledger](psa-02.md).
- [PSA-03: public documentation/JSDoc and affected/downstream validation](psa-03.md).
- [PSA-04: independent baseline proof and metadata-only preflight repair](psa-04.md).
- [Coordinator: full package tests, typecheck and integration lint](verification.md).
- [FINAL-04: independent integrated acceptance and limitations](final-04.md).

The focused runtime passes in PSA-01 do not certify the standard scripted gates:
those commands stopped at a consumer-inventory preflight failure. PSA-04 records
independent baseline classification and its narrow repair; full package acceptance
subsequently passed as recorded in the coordinator verification. Post-documentation
checks also passed as recorded in PSA-03, and FINAL-04 approved scoped acceptance.

## Provenance and limits

REVIEW-01 was a separate read-only subagent session. Implementation, regression,
documentation and final-review assignments are tracked in the task using local
aliases, not private session identifiers. Later reports must distinguish actual
checks from planned checks.

Maintained regression tests belong in the package test tree. Disposable logs,
MongoDB files, dependencies, generated distributions and temporary consumers are
not preserved here. Commands in reports run from the repository root unless
otherwise specified; replace quoted `<repo-root>` placeholders before execution.
This is a curated report bundle, not a snapshot of executable artifacts.
