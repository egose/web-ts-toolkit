> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# OAR-09C mechanisms and bounded diagnostic evidence

This is **not** performance acceptance, a gate waiver or a new OAR-09B campaign.
All original failed campaign evidence remains unchanged. The final accepted-for-gates
product is `final-01/candidate-artifact/`; intermediate `after01` profiles preceded
the retained lookup-route correction and are not final evidence.

## Actual source-level causes and fixes

1. `document-stage.ts` constructed a Promise plus rejection handler for every
   synchronous field memo, and every access read rebuilt access/fact objects and
   repeated an already-performed binding assertion. It now retains immutable private
   access/fact projections within the stage and lazily allocates a promise only for
   async work/reentry. Every receiving read still checks open/publication/owning stage
   and exact binding; async commits still check generation and publication. Both new
   private projections clear with the other stage pointers after drain.
2. `output-field-filter.ts` created both aggregate `output:path` and request-key
   records for static boolean/global rules. Only the redundant static aggregate
   record is removed. Exact request-key first-decision behavior across dotted/nested
   routes, ordered ancestors, seeded settled decisions, dynamic aggregate promise
   identity and per-stage document callback memo remain. The first full gate caught
   an overaggressive variant; existing tests were NOT weakened or edited to accept it.
3. `model-output-planning.ts` made every raw helper capture unrelated query filters,
   defaults, document hooks and private-populate policy through a full options fetch.
   New output-only preparation uses current exact getters and fresh schema catalog,
   captures all relevant output rules/virtual registry/metadata before await, and
   still detaches open/native configuration. No configuration or actor decisions
   are cached across helper calls. Filtering plans only safe literal root fields
   actually present on the detached input, not absent child/query subtrees. It still
   runs every needed field check, uses ISOLATED source and EMPTY facts, and has no
   row/hook/virtual/DB authority. Explicit scoped output policy is unchanged.
4. Freshly generated `field-catalog.ts` catalogs already owned frozen arrays of
   primitive strings, but `authorization-snapshot.ts` traversed/copied them again.
   A private fresh-object ownership ledger now permits reuse within preparation,
   with the **exact original slot/depth debit in the same configuration budget**.
   Arbitrary frozen lookalikes still detach. No schema-identity cache, native leaf
   certificate, DTO association or public capability is introduced.
5. `trusted-output-materialization.ts` allocated a graph closure/WeakSet for every
   primitive selected value. Actual primitive dispatch now retains identical
   receiving-budget/depth/prepaid/poison checks without a graph allocation. Object,
   native, proxy, function and symbol handling are unchanged.
6. `finalize-model-output.ts` copied the full projected source into an unused working
   shell when there were no getters. That shell is now populated only when needed.
   Two virtuals previously needed a stable base plus two more views. Earlier views
   detach from the still-private base; the final possible consumer may take that
   base directly. Siblings/native leaves remain independent, with no future consumer
   of the same view. Also omit a doc-hook diagnostic shell when no hook can receive it.

## Observed work per real fixture operation

`final-01/audit-02/WORK-REDUCTION.json` preserves eight cases; the additional
`final-01/VIRTUAL10-DIAGNOSTIC.json` preserves the ninth. `profiles/before-work01`
and `profiles/final-work01` execute one counted operation each after five warmups,
using private copies of the unchanged workers/fixtures, with CPU profiling disabled.
Counters are actual function/node/constructor observations, not mode-label inference.
Specific WeakSet constructor counts are NOT a complete JavaScript allocation counter.

| Case | Work | Failed candidate -> final candidate |
| --- | --- | --- |
| Plain-wide / 100 | field memo entries; WeakSet constructions; binding assertions | 5,000 -> 2,500; 2,509 -> 9; 42,853 -> 27,553 |
| Hydrated / 100 | field memo entries; WeakSet constructions | 5,000 -> 2,500; 2,509 -> 9 |
| Populate / 100 | field memo entries; WeakSet constructions | 5,216 -> 2,608; 2,623 -> 115 |
| Virtuals / 10 | detached views; field memo entries | 30 -> 20; 540 -> 270 |
| Virtuals / 100 | detached views; BSON copy entries; field memo entries | 300 -> 200; 300 -> 200; 5,400 -> 2,700 |
| H3-global / 10 | full query-config captures; snapshot node visits; WeakSet constructions | 11 -> 1 (+10 fresh output captures); 2,208 -> 671; 571 -> 71 |
| H3-global / 100 | full query-config captures; snapshot node visits; WeakSet constructions | 101 -> 1 (+100 fresh output captures); 19,848 -> 5,351; 5,611 -> 611 |
| H2-global | full query-config captures; snapshot node visits | 2 -> 1 (+1 fresh output capture); 451 -> 210 |
| H4 guard | snapshot node visits; WeakSet constructions; binding assertions | 261 -> 164; 39 -> 13; 582 -> 468 |

All nine before/after full fingerprints match. Plain/hydrated/virtual/H3-global
still do one read, populate two; raw helpers add zero reads/hooks. Virtual getters
remain exactly two per row. **H4 remains one read/one hook/24 field callbacks**.
Six-row structural probes retain six raw fact normalizations, six fact identities,
144 callbacks at 24 fields and 12 closed/cleared root/embedded stages in both modes.
New private cached `access`/`view` pointers are additionally checked clear by the work
instrumentation, beyond the unchanged benchmark tool's older clear-field allowlist.

## CPU profiling, not another acceptance run

`profiles/before03` contains 16 original old-active/failed-candidate CPU profiles for
plain, hydrated, populate, virtuals, H3-global 10/100, H2-global and H4. `profiles/final01`
contains eight final candidate profiles. Each uses 30 requests, five warmups, the
unchanged normalized fixture data and full response checks. Inspector starts after
warmup/decl inspection. `final-01/audit-02/CPU-PROFILE-SUMMARY.json` retains all actual
process CPU totals and sampled self/inclusive frames; raw `.cpuprofile` files remain.
The separate `before-virtual10` / `final-virtual10` directories add old-active,
failed-candidate and final-candidate virtuals/10 profiles, without resampling the
100-row case. Separate `before-work-virtual10` / `final-work-virtual10` directories
count one operation with CPU profiling disabled. This completes nine-root coverage.

The failed candidate's actual hotspots include `memoizeStageFieldDecision`, repeated
stage/access reads, `copy` inside full helper capture, and materialization/BSON work
under `copyDocumentView`. In H3-global/100, captureModelAuthorizationConfiguration
accounts for 290,168 sampled inclusive microseconds in that diagnostic, plus helper
planning/filtering; virtual copyDocumentView accounts for 98,524. These observations
located the source boundaries above; labels alone were not treated as a cause.

Do NOT compare these runs as interleaved acceptance pairs or claim stable signs.
For example, H4 diagnostic median is **3.0730 -> 3.2681 ms**, while process CPU is
4.1369 -> 3.9525 ms/request. H3-global/100 diagnostic candidate median is
47.3826 -> 36.9376 ms, but old-active's separate diagnostic was 29.1103 ms.
The remaining 100 fresh per-row output-policy/catalog captures are required by the
new helper contract; identity/old handles cannot legitimately skip them. H4's old
guard had zero output field callbacks versus the required new 24. These residual
model costs are disclosed, not waived, and no guard projection was narrowed.

The fresh owner must run the fixed full campaign and all bounded repeats. The seven
original sign instabilities are NOT resolved by any diagnostic here. If material
adverse gates persist, OAR-09 remains open for a further user-authorized decision,
not silent acceptance or additional sample fishing. Mongo CPU and total allocation
counts remain unavailable; no universal speedup/security equivalence is claimed.
