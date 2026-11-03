> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# OAR-09D — actual preparation costs, narrow fixes and bounded diagnostics

**Not performance acceptance.** These observations locate/reduce work; they do not
resolve the nine failed remediated OAR-09B gates. No `--run`, gate change, sample
increase, workload rewrite, narrowed guard selection or old-authority restoration ran.

## Scope and discovered causes

Entry was the OAR-09C final-01 source/dist, ESM `1d3b509c…`, not HEAD's much older
engine. New exclusive evidence is `_tmp-oar09d-hVF7iALN/`. All OAR-09C improvements
remain. Full C1–C6, OAR-09D, the original gates/measurement plan and both recent
handoffs were read. Inspection covered helper admission, runtime option storage/
getters, configuration/catalog capture, actor capture, projection and field policy,
stage memo and guard execution. No blanket irreducibility claim follows.

1. **Catalog preparation was attached to the wrong private object.**
   `captureAuthorizationCatalog` created a second wrapper even when configuration
   already held the fresh branded primitive catalog. Field evaluation's wrapper was
   enrolled for indexing, but `planCatalogProjection` used configuration.catalog.
   Consequently the planner performed every full path eligibility walk. H3/100:
   11,819 calls to both eligibility entry and its full walker; H4: 72/72.
   In the 30-request before profile, H3/100 `catalogOutputPath` had 109,756 sampled
   inclusive microseconds, and `planCatalogProjection` 289,484. The full planner is
   also a shared H4/READ/guard path, not merely helper-specific code.
2. **Catalog indexing re-proved already-owned density and discarded initial work.**
   The generated catalog brand already proves fresh, own, frozen, dense primitive
   arrays. Lazy index admission still walked six arrays again after 32 lookups, and
   repeated enrollment reset the index. The regression observed 86 descriptor reads
   on these arrays after repeated enrollment. Application-supplied lookalikes do not
   have this proof and cannot use the shortcut.
3. **Projection compaction did a quadratic all-pairs prefix scan.**
   `compactPersistedProjection` ran `unique.some` for every path, twice in ordinary
   planning (and on the guard's other normal preparation). H3/100 before profile:
   48,112 sampled inclusive microseconds in compaction. The direct 240-field work
   regression observed **57,600 startsWith calls**. Only actual dotted ancestors can
   cover a path, so testing unrelated siblings is unnecessary.
4. **Raw helpers re-copied privately immutable actor maps.**
   They freshly look up the actor, correctly, but then reconstructed its entire map
   even when the exact Permission instance owns actual private boolean storage and a
   frozen string key list. H3/10: 11 map reconstructions; H3/100: 101, including the
   initial query. This is data ownership, not permission-decision reuse.

## Retained changes and ownership proof

- `service-authorization.ts`: reuse only a constructor-branded fresh primitive
  catalog, sharing one catalog index across planning/evaluation. General captured
  catalogs still undergo existing descriptor/primitive validation. Configuration
  capture already charged the SAME whole graph's slots/depth through OAR-09C's
  existing brand; this change neither skips capture nor replenishes its budget.
- `field-catalog.ts`: idempotent preparation; generated primitive captures create
  one private path index immediately, without a second density walk. Unbranded
  captures retain the old lazy descriptor admission. The bounded result map caches
  structural path eligibility in this fresh catalog, NOT actor/fact/row/field decisions.
  Every original protected/ref/virtual/dynamic/opaque rule remains in the walker.
  Every independent call still captures schema/catalog/options anew.
- `output-projection.ts`: compaction retains Set insertion order and checks actual
  dotted ancestors through membership, not every unrelated candidate. Exclusions,
  duplicates, prefix boundaries and empty intermediate segments preserve old behavior.
  No planner field-state/callback/selection or first-key memo behavior changed.
- `permission.ts` plus private `acl/owned-permissions.ts`: an exact-constructor-only
  WeakSet records immutable DATA ownership after private boolean copying/freezing.
  Subclasses, proxies, frozen lookalikes and application implementations do not qualify.
  No backing map or brand is publicly exposed. `captureAuthorizationPermissions`
  permits this reuse ONLY for output-only helpers; ordinary operations keep their
  distinct once-captured actor view and existing internal-child sharing. Each helper
  still reads its current supplied actor before await; replacement is visible on the
  next independent call. There is no cross-call field/row/configuration cache.

All receiving request/runtime/model/scope/access checks, source isolation, EMPTY raw
facts, scoped outputFields validation, denied-value non-observation, selected/source/
fact budgets, native-before-wire admission, sticky failure, close/drain/generation
checks and write/pre-write/target/retry rules remain. Output-only raw helpers have
zero DB/doc-hook/virtual/row work. Normal refresh remains +1 read/hook or +1 batch.

## Before/after actual work (one counted operation after five warmups)

`final-01/audit-02/WORK-REDUCTION.json` reconciles fresh copies of exact unchanged
fixtures. CPU profiling is OFF for counts. All nine full fingerprints and read/hook/
getter/callback counts agree with independently reconstructed expected responses.

| Exact fixture             | Full catalog walks before → after | Eligibility entry calls (unchanged) |
| ------------------------- | --------------------------------: | ----------------------------------: |
| H3-global/10              |                       1,289 → 407 |                               1,289 |
| H3-global/100             |                    11,819 → 3,737 |                              11,819 |
| H4                        |                           72 → 37 |                                  72 |
| plain-narrow/10           |                           71 → 33 |                                  71 |
| global-rules/10           |                          111 → 33 |                                 111 |
| HTTP ID plain READ        |                          119 → 37 |                                 119 |
| HTTP filter plain READ    |                          119 → 37 |                                 119 |
| HTTP filter hydrated READ |                          119 → 37 |                                 119 |
| native direct READ        |                          122 → 37 |                                 122 |

H3 actor-map reconstructions: **11→1 / 101→1** at 10/100; H4 **1→1**. The remaining
copy belongs to the initial NORMAL query, not a helper. H3/100 still does **one full
query capture + 100 fresh output-only captures / 101 fresh catalogs**. Snapshot nodes
remain **5,351**, field memo calls **5,000**, receiving-binding assertions **56,550**.
H4 remains **one read / one hook / 24 callbacks**, 164 snapshot nodes and 51 memo calls.
No omitted callback, altered selection or fabricated work counter supplies the reduction.
The direct compaction regression drops **57,600→240** startsWith calls at 240 fields;
the separate owned-index regression drops **86→0** density descriptor observations.

Selected instrumentation counts are NOT total allocations. All admitted root stages
in these probes clear access/view as well as prior pointers. Separate final smoke
and `STAGE-PROJECTION-CLEAR-AUDIT.json` observe 12 closed/cleared root+embedded stages
per operation, both modes, 4/24/48 fields, 36 actual projection creations/clears per
mode. Six fact normalizations/identities and 144 callbacks at 24 fields remain.

## CPU profiles and limits

`profiles/before-cpu01` profiles the exact incoming OAR-09C sealed artifact;
`profiles/final-cpu02` profiles final tested OAR-09D bytes. Three cases, 30 requests,
five warmups; raw profiles retained. `final-cpu01`/`final-work01` are INTERMEDIATE
variants, not final evidence. Counts use `before-work-catalog`/`final-work02`; actor
branch observations use `before-work-actor02`/`final-work-actor02`.

H3/100 sampled planner inclusive work fell **289,484→173,427 µs**; catalog full-walker
inclusive **109,756→43,888 µs**; helper capture **112,822→95,866 µs**. These are sampled
profiles, not exact stopwatch contributions. Missing top-N frames are NOT zero cost.

Diagnostic medians/process CPU (before→after), **not interleaved acceptance pairs**:

| Case   |         Median ms |    CPU ms/request |
| ------ | ----------------: | ----------------: |
| H3/10  |   7.0342 → 6.7541 |  10.6158 → 9.9949 |
| H3/100 | 36.4480 → 35.5105 | 47.0964 → 48.4617 |
| H4     |   3.2016 → 3.2590 |   3.7664 → 3.9277 |

No end-to-end H4 improvement or stable H3 CPU improvement is established by this
diagnostic. Remaining real work includes current per-helper configuration/schema
capture, isolated source/output admission, planning, and every required field check;
the normal guard still performs a full authorized read. Old H3 handle reuse did not
perform these fresh captures, and old H4 performed zero output callbacks. This is
context, not proof that all residual costs are irreducible or permission to drop
them. No broader engine rewrite or further statistical fishing was attempted.
The next fixed V8 campaign alone can establish gate disposition; if it still fails,
retain failures and obtain an explicit decision, not a waiver inferred from smoke.

## Preserved failures and corrections

- `regression-before-01`: three intended work failures plus two fixture mistakes
  expecting successful raw-helper admission of an accessor. The getter was unread;
  isolated raw helpers correctly reject that structure. Initial new fixture bytes
  are retained. Corrected fixture separates the expected controlled rejection;
  `regression-before-02` leaves **three intended failures / eight passes**.
- `actor-regression-before`: additional actor-copy regression fails before its fix.
- `catalog-index-before`: additional 86-descriptor-work regression fails before fix.
- An initial broad exact-Permission reuse variant failed **two unchanged actor
  ownership tests** in `v2-final`. Reuse was narrowed to output-only helpers, NOT
  accepted by changing those assertions. Final V2 **244/8 files** and V3 pass.
- Initial placement of a brand reader in permission.ts was caught by declaration
  comparison before full gates (that module is re-exported). Its 14 intermediate
  dist files are retained in `intermediate-export-leak-dist/`. The reader moved to a
  private ACL module; final public ESM/CJS surfaces and all declarations are unchanged.
- First private actor counter searched the source class name rather than tsup's
  renamed `permission_default`; `raw-packed-work-audit-01` failed on the missing
  counter, never accepted zero. Added an exact one-match assertion and fresh
  before/after branch-only work copies. `audit-02` passes. No accepted tools, source,
  candidate, smoke or full gate was changed/rerun for this instrumentation correction.
