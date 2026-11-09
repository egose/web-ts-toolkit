# ARPC-01 real-service diagnostic findings

The maintained probe is `packages/access-router/test/access-router-crud-work.unit.test.ts`.
It invokes real direct/public workers. Spies/counters are for **work only**, never
the timing loop. These are candidates for subsequent measurement, not speedups or
proof that application-observable work may be removed.

## Prioritized handoff

1. **ARPC-02 — row and selected-value preparation.** For both isolated/trusted
   direct LIST and bulk CREATE with 16 rows/16 selected scalar fields plus value,
   the observed finalizer configuration preparation count is 16 and selected-copy
   call count is 272. Singleton 4-field controls have 1 and 5 respectively.
   READ/UPDATE remain one finalizer preparation and 17 selected-copy calls at the
   wider width. This is actual service-row wiring, not `finalizeModelOutputs`
   helper-only behavior. The wrapper is small captured configuration, not a claimed
   deep copy of the full model configuration. Selected-copy calls do not by
   themselves count allocations or prove every policy read is redundant.
2. **ARPC-04 — no-work scheduling.** The same 16-row plain LIST and bulk CREATE
   each invoke the empty concurrency mapper 16 times, in hook-present and bare
   controls. READ/UPDATE invoke it once. Total mapper counts differ because CREATE
   also validates/prepares/persists its inputs. Absent-hook promise cost is not
   separately attributed here; microtask ordering remains an equivalence question.
3. **ARPC-05 — disabled debug summaries.** READ/LIST/UPDATE each call
   `summarizeFilter` twice even though `isLevelEnabled` returns false and no debug
   handler runs. CREATE records zero such summaries on this path; do not invent
   CREATE logging work. The timing catalog's large-filter shape currently stresses
   LIST only; enabled logging and mid-call level changes remain follow-up controls.
4. **ARPC-06 — metadata query intents.** At 16 rows, LIST performs two visibility
   adapter reads total. Bulk CREATE performs 32 (two per output row), plus 16
   adapter CREATE submissions from the real request persistence scheduler.
   READ/UPDATE controls perform two visibility reads each. Disabled/stripped
   controls perform none. These are deterministic adapter query intents, **not**
   measured DB round-trip latency. Base-filter callback counts are not 16× either:
   this concurrent bulk fixture observes two read-filter and two update-filter
   callbacks, versus one each for LIST, because of the existing request-owned
   filter behavior. Coalescing cannot assume pure callbacks or infer equivalence
   from equal output. The later task still needs incoming ID filters, dynamic
   callbacks, failure and real-database evidence.
5. **ARPC-03 — sort capture.** General READ/LIST plumbing is exercised, but there
   is no explicit nested/virtual/denied-sort workload or wide unused-policy timing
   fixture in this packet. The work probe observes capture through the actual
   already-bound service receiver (spying on the prototype after construction
   misses the registered method). Do not treat a zero from that earlier diagnostic
   spy placement as proof that capture is absent. The corrected probe records one
   capture for READ and LIST, zero for CREATE and UPDATE, in both modes. Add targeted sort shapes before
   a sort-path performance conclusion.

All cases and both entries/modes are preserved in the [curated work observations](arpc-01-work-observations.json)
referenced by the [ARPC-01 report](arpc-01-report.md). Per-case wall/CPU baseline observations and
noise calibration are separate. Work counts are not a CPU cost partition, and no
allocation, retained-heap or universal latency conclusion is supported.
