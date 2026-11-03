> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# Additional OAR-09 measurements (NOT run by OAR-01)

The unchanged worker currently times ONLY HTTP LIST via POST `/bench/__query`.
It supports old six snapshot/two copy/two fast controls, not new mode profiles,
READ or helper reuse. Its flags/getters/manifests are verified; mode labels do not
measure omitted work. Extend runner/profile detection in OAR-09, not old artifacts.
Inspect actual published declarations in a separate compiler process, then verify
both exact/bulk model getters on source AND target before candidate timing.

## Common protocol

Use sealed OAR-01 bytes and candidate built with same lock/dependency/tool identities.
All commands foreground serial; one owned Mongo/process workload, cleanup in finally.
Keep old workload parameters untouched, five warmups, two reversed paired rounds;
additional families below 100 samples at one client/hook concurrency 10. Preserve
every raw sample, failures, p95 and combined process CPU. Label DB server CPU and
allocation counters unavailable unless actually added. Security/count/work probes
run outside timing. PERFORMANCE-GATES.md fixes thresholds/repeats/disposition.

- Primary required comparison: isolated/current-default, trusted/current-active,
  same ordinary three LIST scenarios/100 rows/24 fields/32 bytes. Run interleaved
  current profiles again alongside candidates, don't rely on wall-time drift.
- Six guards at 10 and 100 rows, 50 samples/profile/job, two reversed rounds:
  plain-narrow, hydrated, global-rules, large-config, populate, virtuals. Current
  fixtures expect one DB read except populate two; getters 2/row for virtuals;
  document-rules primary hook once/row; all other standard scenario doc hooks zero.
- Full data response checks/fingerprints before, after AND on measured responses
  in new instrumentation if affordable consistently for BOTH builds; preserve
  original list timing series separately if measurement overhead changes. Never
  pretend OAR-01's worker deep-checks each measured response (only row count then).
- Boolean work probe separately: 6 rows, 24 all-function fields, 1 embedded child,
  facts `{grantMarker:true, owner:boolean}`; actual hooks 6, callbacks 144, adapter
  find calls 1 in either old profile. Compare new fact normalization count exactly
  once/root, no per-field full fact/config/source copies, no post-filter graph pass.
  Static boolean/string/mixed/async rule work is additional labeled coverage.

## READ (new harness, no LIST relabeling)

Use real generated routes from `model-router-document-routes.ts`:

1. POST `/bench/__query/<id>` body `{select, options:{includePermissions:false,
   includeFieldPermissions:false, tryList:false}}` -> PublicService._read.
2. POST `/bench/__query/__filter` body `{filter:{ordinal:...},select,options:...}`
   -> `_readFilter`. Add packed direct `router.getService(req).findById(id,...)/
   findOne(filter,...)` work checks separately (not mixed with HTTP latencies).

Persist 100 deterministic rows; cycle IDs during samples but return ONE row/request.
Keep wide/document-rules/embedded families and native-heavy separate. Configure
`hydration.publicRead:'lean'` for ordinary READ comparison, then labeled hydrated
guard; use read-specific doc hook/virtual access, same literal boolean facts. Exact
expectation: 1 findOne/read per success, 1 doc hook for document-rule case, 0 otherwise;
getter counts per selected applicable getter, no count query with metadata disabled.
Separate admitted READ-to-LIST retry probe: 2 findOne calls for first miss/second hit,
1 hook on successful stage, list effective field rules, initiating READ capture.
Terminal Forbidden/BadRequest causes no second query. Original/target mode matrix
instrumentation outside timing verifies trust cannot leak from parent or LIST flag.

## Named helper and migration workflows (actual APIs/counts)

Use checked `result.success` narrowing before result.data; don't suppress errors or
cast a missing candidate handle. Use only packed public imports and router.getService.
Each sample gets a fresh original request/Core binding for apples-to-apples capture.

| Family / recipe | Current before behavior measured | New behavior measured; exact expected extra reads |
| --- | --- | --- |
| H0 presentation subset | `svc.findById(id,{select},quiet)` then plain own-property subset of returned data (NOT authorization). | Same; initial query 1, subset +0 reads, +0 doc hooks. No need to add DB I/O for a presentation subset. |
| H1 fresh raw global-only helper | `svc.pickAllowedFields(raw,'read',{})`, `trimOutputFields`, `genAllowedFields(raw,'read',{purpose:'output'})`; no doc hook configured. Explicit grant case `authorization:{outputFields:{mode:'grant',paths:['field0']}}` separately. | Same API names, captured global permissions + frozen EMPTY facts; 0 reads, 0 doc hooks, no virtuals. Raw helper on a DTO must not recover facts from metadata. Include functions checking empty grants, denied key getter not observed, hydrated input not mutated. |
| H2 current document authority after initial query | `first=await svc.findById(id,{select},quiet)` then `svc.pickAllowedFields(first.data,'read',{documentAuthorization:first.context.documentAuthorization})`; no extra DB read, same old decisions. | Initial query 1/hook1; do NOT replace handle with unrestricted policy or global-only raw helper. A fresh `svc.findById(id,{select},quiet)` returns new authorized data: +1 query/+1 doc hook. Simple subset of second.data adds +0. Total 2 reads/2 hooks. Denied row means error, not raw fallback. |
| H3 batched current authority | `first=await svc.find(filter,{select,limit:rows},quiet)` + old per-row handle picks. | Fresh `svc.find(filter,{select,limit:rows},quiet)` followed only by presentation subsets; +1 batched read, +rows hooks, NOT rows findById queries. Report 10/100 rows. No query cache or ID equality used as stage authority. |
| H4 explicit document guard | Existing `guard({modelName,id,condition})` normal read path (metadata-derived today). | One private normal read-stage condition evaluation; 1 query successful/no retry, one doc hook. Strip/expose/decorate flags cannot change its captured fact decision; no hidden second query. |

For H2/H3 keep two costs separate: (a) old reuse versus new zero-read raw helper on
GLOBAL-only rules, (b) end-to-end current-document migration with an additional normal
read. Measure a matching fresh normal query alone as comparator for the fixed extra-read
allowance. Sum component medians/CPU only as an explicit cost allowance, not a latency
distribution or a synthetic p95. Also show directly observed workflow median/p95/CPU.
Outside timings flip source ownership/global actor between first and second normal
operation and verify actual grants/denials differ, original output remains filtered,
helper metadata/replay cannot update authority. Actual mongoose debug read counts and
hook spies, not a mode name, establish cost. No extra helper doc invocation.

## Native-heavy and expensive/unused facts (separate labeled families)

- Native selected values: bounded supported Date/Buffer/ObjectId/Code.scope/DBRef.fields,
  nested Map/array/native and wire replacement cases from the packed native fixture.
  Use real packed LIST and READ service APIs with an explicit adapter fixture (0 DB
  reads, labeled as such), and real Mongoose persistence versions where supported
  (1 DB query/operation). Do not call an adapter spy count a measured Mongo read.
  Selected/denied/protected keys, controlled 400/no partial output, unchanged supported
  values, exact/depleted/depth/cycle behavior and native hook counts are correctness
  probes FIRST. Only then time ordinary supported bounded data; never benchmark an
  overflowing traversal or silently omit failed fields to get a faster response.
- Fact cost: existing ordinary document-rules workload remains unchanged. Add a
  separate boolean fixture whose hook computes a used owner fact and a deliberately
  unused fact with a fixed deterministic 10,000-iteration checksum (verify non-elided
  checksum outside timing). Compare with identical fixture omitting that computation;
  100 rows/24 fields. Both old profiles and new modes get same boolean hook workload.
  Expected exactly 100 expensive computations and 100 hooks/request, independent of
  24 selected fields. Record wall/CPU delta and any application-specific external
  freshness caveat; do not subtract this cost from ordinary primary measurements.
- Allocation/retention: separate Node `--expose-gc` packed driver, same process setup/
  fixed row count/warmup, collect heap before+after forced GC with held versus released
  results across repeated operations. Instrument actual source/fact/memo counts,
  object lifetimes after close and no per-field retained graph copies. Heap deltas
  are retained bytes, NOT allocation counts. If true allocation profiling not run,
  mark unavailable. Do not run compiler inspection in this measured heap.

OAR-09 must preserve rebuild/export/dependency manifests after gates and seal exact
measured bytes. OAR-01 has NOT performed these new measurements or claimed new gains.
