# Access-router performance/cleanup: final retained outcome

Date: 2026-11-07. Related [task and execution record](../../../tasks/20261105-084939-access-router-performance-cleanup.md).

## Accepted changes

- Private cleanup: five unreachable functions and one interface removed, unused
  private finalizer/prepared-worker arguments removed, ownership comments corrected.
  Public declarations, authorization modes, callbacks, budgets and write detachment
  are unchanged. [Cleanup report](arpc-07-report.md), [keep/remove ledger](arpc-07-keep-remove-ledger.md).
- Maintained real-service CRUD fixtures/tooling and package regression tests,
  including all 16 mode tuples. [Baseline coverage and limits](arpc-01-coverage.md),
  [CRUD v1 guide](../../../../scripts/benchmarks/access-router-crud.md),
  [v2 panel/window guide](../../../../scripts/benchmarks/access-router-crud-v2.md).
- No-change investigations preserve observable sort preparation, empty-work
  scheduling and bulk-CREATE metadata processing. [Sort decision](arpc-03-report.md),
  [scheduling decision](arpc-04-report.md), [metadata decision](arpc-06-report.md),
  [actual characterization verification](arpc-046-verification.md).

## Not accepted as performance changes

Preparation reuse (ARPC-02) and lazy logging (ARPC-05) were implemented/probed, but
their required measured benefit/non-regression evidence was unavailable. Both
production candidates were withdrawn; **no runtime speedup is claimed**. Their
designs, exact patches and useful guards remain historical evidence, not applied
optimizations: [ARPC-02 withdrawal](arpc-02/withdrawal/report.md),
[ARPC-05 withdrawal](arpc-05/withdrawal/report.md).

The original full speedup objective is not complete. Future work needs useful,
stable measurements; allocation/heap, specialized workload timing and DB latency
are not supplied by passing correctness tests or work counters.

## Final independent package acceptance

[Independent review](arpc-08-review.md), [exact identities/commands/results](arpc-08-verification.json),
[concise verification log](arpc-08-verification.log):

- **7,558 tests / 210 files passed**, final package suite run once.
- Package typecheck and package/tooling-scoped lint passed.
- All eight generated public declarations remained byte-identical.
- No whole-repository, grouped-workspace or downstream test suite ran.

The reviewer was not an implementer. Only coordinator task/index documentation
changed after acceptance; reviewed production/test/tooling hashes remain current.

## Evidence provenance and reproduction limits

The original [baseline packet index](README.md) and task-specific reports preserve
their historical state. Read their later withdrawal and final-review supplements
before interpreting candidate-era pass results or pending-work notes. No old
observations, protocol caps, raw samples or seals were rewritten to imply success.

Curated protocols, numeric observations, candidate patches, reports and exact
verification identities are preserved. Generated source/bundle trees, dependencies,
temporary consumers, MongoDB files and redundant full logs are intentionally not.
Checkout-local scratch seals are operational conveniences, not continuation
prerequisites or portable installations. Reconstruction requires the recorded
baseline revision and retained diff, maintained fixtures/tooling, installed
lock/toolchain and package test prerequisites; fresh runs need new output directories
and calibration. Numeric raw packets support the recalculations identified in their
own manifests; hash-only verification summaries do not contain omitted raw test data.

The independent review documents one trailing space in a sealed historical timeout
excerpt. It was retained as evidence, not silently normalized. Shared documents
use repository-relative paths and contain no private session identifiers.
